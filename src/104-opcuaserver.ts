/* eslint-disable no-case-declarations */
/**

 Copyright 2015 Valmet Automation Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

import {
    NodeInitializer
} from "node-red";

import {
    UaServerNode,
    UaServerDef
} from "./104-opcuaserverdef";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import { stringify } from "flatted";
import { createCertificateManager, createUserCertificateManager } from "./utils";
import { installFileType } from "node-opcua-file-transfer";
import { NodeCrawler } from "node-opcua-client-crawler";
import { build_new_value_by_datatype, build_new_dataValue, convertToString } from "./opcua-basics";
import { SecurityPolicy, 
    MessageSecurityMode, 
    WellKnownRoles,
    makeRoles,
    StatusCodes,
    StatusCode,
    DataValue,
    makeAccessLevelFlag,
    PseudoSession,
    AttributeIds,
    allPermissions,
    AccessRestrictionsFlag,
    coerceNodeId,
    OPCUAServer,
    makeApplicationUrn,
    addAggregateSupport,
    RegisterServerMethod,
    DataType,
    VariantArrayType,
    Variant, 
    AccessLevelFlag,
    UAObject,
    UAObjectsFolder,
    UAEventType,
    UAVariable,
    Namespace,
    NodeClass,
    UAFile,
    UAMethod} from "node-opcua";

/* eslint-disable-next-line */
const UaServer: NodeInitializer = (RED): void => {
    function UaServerNodeConstructor(
        this: UaServerNode,
        n: UaServerDef
    ): void {
        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.port = n.port;
        this.endpoint = n.endpoint;
        this.users = n.users;
        this.nodesetDir = n.nodesetDir;
        this.folderName4PKI = n.folderName4PKI; // Storage folder for PKI and certificates
        this.autoAcceptUnknownCertificate = n.autoAcceptUnknownCertificate;
        this.allowAnonymous = n.allowAnonymous;
        this.endpointNone = n.endpointNone;
        this.endpointSign = n.endpointSign;
        this.endpointSignEncrypt = n.endpointSignEncrypt;
        this.endpointBasic128Rsa15 = n.endpointBasic128Rsa15;
        this.endpointBasic256 = n.endpointBasic256;
        this.endpointBasic256Sha256 = n.endpointBasic256Sha256;
        // Operating limits:
        this.maxNodesPerBrowse = n.maxNodesPerBrowse;
        this.maxNodesPerHistoryReadData = n.maxNodesPerHistoryReadData;
        this.maxNodesPerHistoryReadEvents = n.maxNodesPerHistoryReadEvents;
        this.maxNodesPerHistoryUpdateData = n.maxNodesPerHistoryUpdateData;
        this.maxNodesPerRead = n.maxNodesPerRead;
        this.maxNodesPerWrite = n.maxNodesPerWrite;
        this.maxNodesPerMethodCall = n.maxNodesPerMethodCall;
        this.maxNodesPerRegisterNodes = n.maxNodesPerRegisterNodes;
        this.maxNodesPerNodeManagement = n.maxNodesPerNodeManagement;
        this.maxMonitoredItemsPerCall = n.maxMonitoredItemsPerCall;
        this.maxNodesPerHistoryUpdateEvents = n.maxNodesPerHistoryUpdateEvents;
        this.maxNodesPerTranslateBrowsePathsToNodeIds = n.maxNodesPerTranslateBrowsePathsToNodeIds;
        this.registerToDiscovery = n.registerToDiscovery;
        this.constructDefaultAddressSpace = n.constructDefaultAddressSpace;
        let maxConnectionsPerEndpoint = 20;
        if (n.maxConnectionsPerEndpoint > 20) {
            maxConnectionsPerEndpoint = n.maxConnectionsPerEndpoint;
        }
        let maxMessageSize = 4096;
        if (n.maxMessageSize > 0) {
            maxMessageSize = n.maxMessageSize;
            verbose_log("Set but not activated MaxMessageSize: " + maxMessageSize);
        }
        let maxBufferSize = 4096;
        if (n.maxBufferSize > 0) {
            maxBufferSize = n.maxBufferSize;
            verbose_log("Set but not activated MaxBufferSize: " + maxBufferSize);
        }
        /* eslint-disable-next-line */
        const node = this;
        const variables = { Counter: 0 };
        const variablesTs = { Counter: 0 };
        const variablesStatus = { Counter: 0 };
        let equipmentCounter = 0;
        let physicalAssetCounter = 0;
        let equipment;
        let physicalAssets;
        let vendorName;
        let equipmentNotFound = true;
        let initialized = false;
        let folder:UAObjectsFolder;
        let userManager; // users with username, password and role
        let users = [{ username: "", password: "", roles: "" }]; // Empty as default
        let savedAddressSpace = "";

        if (node.users && node.users.length > 0) {
            verbose_log("Trying to load default users from file: " + node.users + " (current folder: " + __dirname + ")");
            if (fs.existsSync(node.users)) {
                users = JSON.parse(fs.readFileSync(node.users).toString());
                verbose_log("Loaded users: " + JSON.stringify(users));
                setUsers(); // setUsers(users);
            }
            else {
                verbose_log(chalk.red("File: " + node.users + " not found! You can inject users to server or add file to current folder: " + __dirname));
                node.error("File: " + node.users + " not found! You can inject users to server or add file to current folder: " + __dirname);
            }
        }

        // Server endpoints active configuration
        /* eslint-disable-next-line */
        const policies: any = [];
        /* eslint-disable-next-line */
        const modes: any = [];
        
        // Security modes None | Sign | SignAndEncrypt
        if (this.endpointNone === true) {
            policies.push(SecurityPolicy.None);
            modes.push(MessageSecurityMode.None);
        }
        if (this.endpointSign === true) {
            modes.push(MessageSecurityMode.Sign);
        }
        if (this.endpointSignEncrypt === true) {
            modes.push(MessageSecurityMode.SignAndEncrypt);
        }
        // Security policies
        if (this.endpointBasic128Rsa15 === true) {
            policies.push(SecurityPolicy.Basic128Rsa15);
        }
        if (this.endpointBasic256 === true) {
            policies.push(SecurityPolicy.Basic256);
        }
        if (this.endpointBasic256Sha256 === true) {
            policies.push(SecurityPolicy.Basic256Sha256);
        }

        // This should be possible to inject for server
        function setUsers() {   
            // User manager
            userManager = {
                isValidUser: (username, password) => {
                    const uIndex = users.findIndex(function(u) { return u.username === username; });
                    if (uIndex < 0) {
                        // console.log(chalk.red("No such user:" + username));
                        return false;
                    }
                    if (users[uIndex].password !== password) {
                        // console.log(chalk.red("Wrong password for username: " + username + " tried with wrong password:" + password));
                        return false;
                    }
                    // console.log(chalk.green("Login successful for username: " + username));
                    return true;
                },
                getUserRoles: (username) =>  {
                    if (username === "Anonymous" || username === "anonymous") {
                        return makeRoles(WellKnownRoles.Anonymous);
                    }
                    const uIndex = users.findIndex(function(x) { return x.username === username; });
                    if (uIndex < 0) {  
                        // Check this TODO
                        return makeRoles("AuthenticatedUser"); // WellKnownRoles.Anonymous; // by default were guest! ( i.e anonymous), read-only access 
                    }
                    let userRoles;
                    /* eslint-disable-next-line */
                    if (users[uIndex].hasOwnProperty("roles")) {
                        userRoles = users[uIndex].roles; // user can have multiple roles Observer;Engineer
                    }
                    else {
                        console.error("Your users.json is missing roles field for user role! Using Anonymous as default role.");
                        return makeRoles(WellKnownRoles.Anonymous); // By default use Anonymous
                    }
                    return makeRoles(userRoles);
                }
            };
        }
          
        function node_error(err) {
            // console.error(chalk.red("[Error] Server node error on: " + node.name + " error: " + JSON.stringify(err)));
            node.error("Server node error on: " + node.name + " error: " + JSON.stringify(err));
        }

        function verbose_warn(logMessage) {
            //if (RED.settings.verbose) {
                // console.warn(chalk.yellow("[Warning] "+ (node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage));
                node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage);
            //}
        }

        function verbose_log(logMessage) {
            //if (RED.settings.verbose) {
                // console.log(chalk.cyan(logMessage));
                node.debug(logMessage);
            //}
        }

        // Method input / output argument types from string to opcua DataType
        function getUaDatatype(methodArgType) {
            if (methodArgType === "String") {
                return DataType.String;
            }
            if (methodArgType === "Byte") {
                return DataType.Byte;
            }
            if (methodArgType === "SByte") {
                return DataType.SByte;
            }
            if (methodArgType === "UInt16") {
                return DataType.UInt32;
            }
            if (methodArgType === "UInt32") {
                return DataType.UInt32;
            }
            if (methodArgType === "Int16") {
                return DataType.Int32;
            }
            if (methodArgType === "Int32") {
                return DataType.Int32;
            }
            if (methodArgType === "Double") {
                return DataType.Double;
            }
            if (methodArgType === "Float") {
                return DataType.Float;
            }
            node.error("Cannot convert given argument: " + methodArgType + " to OPC UA DataType!");
        }

        node.status({
            fill: "red",
            shape: "ring",
            text: "Not running"
        });

        const xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml'),     // Standard & basic types
                        path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.Di.NodeSet2.xml'), // Support for DI Device Information model
                        path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.AutoID.NodeSet2.xml'), // Support for RFID Readers
                        path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.ISA95.NodeSet2.xml')   // ISA95
        ];
        if (savedAddressSpace && savedAddressSpace.length>0) {
            xmlFiles.push(savedAddressSpace);
        }
        // Add custom nodesets (xml-files) for server
        if (node.nodesetDir && fs.existsSync(node.nodesetDir)) {
            fs.readdirSync(node.nodesetDir).forEach(fileName => {
                if (path.extname(fileName).toLowerCase() === '.xml') {
                    xmlFiles.push(path.join(node.nodesetDir, fileName));
                }
            });
        }
        verbose_log("NodeSet:" + xmlFiles.toString());
        
        async function initNewServer() {
            initialized = false;
            verbose_log("Create Server from XML ...");
            // DO NOT USE "%FQDN%" anymore, hostname is OK
            const applicationUri =  makeApplicationUrn(os.hostname(), "node-red-contrib-opcua-server");
            const serverCertificateManager = createCertificateManager(node.autoAcceptUnknownCertificate, node.folderName4PKI);
            const userCertificateManager = createUserCertificateManager(node.autoAcceptUnknownCertificate, node.folderName4PKI);
            let registerMethod;
            if (node.registerToDiscovery === true) {
                registerMethod = RegisterServerMethod.LDS;
            }
            node.server_options = {
                serverCertificateManager,
                userCertificateManager,
                securityPolicies: policies,
                securityModes: modes,
                allowAnonymous: n.allowAnonymous,
                port: parseInt(n.port),
                resourcePath: "/" + node.endpoint, // Option was missing / can be 
                // maxAllowedSessionNumber: 1000,
                maxConnectionsPerEndpoint: maxConnectionsPerEndpoint,
                // maxMessageSize: maxMessageSize,
                // maxBufferSize: maxBufferSize,
                nodeset_filename: xmlFiles,
                serverInfo: {
                  applicationUri,
                  productUri: "Node-RED NodeOPCUA-Server",
                  // applicationName: { text: "Mini NodeOPCUA Server", locale: "en" }, // Set later
                  gatewayServerUri: null,
                  discoveryProfileUri: null,
                  discoveryUrls: []
                },
                buildInfo: {
                    buildNumber: "",
                    buildDate: new Date()
                },
                serverCapabilities: {
                  maxBrowseContinuationPoints: 10,
                  maxHistoryContinuationPoints: 10,
                  maxSessions: 20,
                  // maxInactiveLockTime,
                  // Get these from the node parameters
                  operationLimits: {
                    maxNodesPerBrowse: node.maxNodesPerBrowse,
                    maxNodesPerHistoryReadData: node.maxNodesPerHistoryReadData,
                    maxNodesPerHistoryReadEvents: node.maxNodesPerHistoryReadEvents,
                    maxNodesPerHistoryUpdateData: node.maxNodesPerHistoryUpdateData,
                    maxNodesPerRead: node.maxNodesPerRead,
                    maxNodesPerWrite: node.maxNodesPerWrite,
                    maxNodesPerMethodCall: node.maxNodesPerMethodCall,
                    maxNodesPerRegisterNodes: node.maxNodesPerRegisterNodes,
                    maxNodesPerNodeManagement: node.maxNodesPerNodeManagement,
                    maxMonitoredItemsPerCall: node.maxMonitoredItemsPerCall,
                    maxNodesPerHistoryUpdateEvents: node.maxNodesPerHistoryUpdateEvents,
                    maxNodesPerTranslateBrowsePathsToNodeIds: node.maxNodesPerTranslateBrowsePathsToNodeIds
                  }
                },
                userManager, // users with username, password & role, see file users.json
                isAuditing: false,
                registerServerMethod: registerMethod
            };
            node.server_options.serverInfo = {
                applicationName: { text: "Node-RED OPCUA" }
            };
            // This code is branch from 0.3.310 => should this be 1.0.0 ?
            node.server_options.buildInfo = {
                buildNumber: "0.2.310",
                buildDate: new Date("2023-08-01T15:06:00")
            };
            const hostname = os.hostname();
            const discovery_server_endpointUrl = "opc.tcp://" + hostname + ":4840"; // /UADiscovery"; // Do not use resource path
            if (node.registerToDiscovery === true) {
                verbose_log("Registering server to :" + discovery_server_endpointUrl);
            }
        }

        function construct_my_address_space(addressSpace) {
            verbose_log("Server: add VendorName ...");
            vendorName = addressSpace.getOwnNamespace().addObject({
                organizedBy: addressSpace.rootFolder.objects,
                nodeId: "ns=1;s=VendorName",
                browseName: "VendorName"
            });
            equipment = addressSpace.getOwnNamespace().addObject({
                organizedBy: vendorName,
                nodeId: "ns=1;s=Equipment",
                browseName: "Equipment"
            });

            physicalAssets = addressSpace.getOwnNamespace().addObject({
                organizedBy: vendorName,
                nodeId: "ns=1;s=PhysicalAssets",
                browseName: "Physical Assets"
            });

            verbose_log('Server: add MyVariable2 ...');
            let variable2 = 10.0;
            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=MyVariable2",
                browseName: "MyVariable2",
                dataType: "Double",
                minimumSamplingInterval: 500,
                value: {
                    get: function () {
                        return new Variant({
                            dataType: "Double",
                            value: variable2
                        });
                    },
                    set: function (variant) {
                        variable2 = parseFloat(variant.value);
                        return StatusCodes.Good;
                    }
                }
            });

            verbose_log('Server: add FreeMemory ...');
            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=FreeMemory",
                browseName: "FreeMemory",
                dataType: "Double",
                minimumSamplingInterval: 500,
                value: {
                    get: function () {
                        return new Variant({
                            dataType: DataType.Double,
                            value: available_memory()
                        });
                    }
                }
            });

            verbose_log('Server: add Counter ...');
            node["vendorName"] = addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=Counter",
                browseName: "Variables Counter",
                displayName: "Variables Counter",
                dataType: "UInt16",
                minimumSamplingInterval: 500,
                value: {
                    get: function () {
                        return new Variant({
                            dataType: DataType.UInt16,
                            value: Object.keys(variables).length // Counter will show amount of created variables
                        });
                    }
                }
            });

            const method = addressSpace.getOwnNamespace().addMethod(
                vendorName, {
                    browseName: "Bark",

                    inputArguments: [{
                        name: "nbBarks",
                        description: {
                            text: "specifies the number of time I should bark"
                        },
                        dataType: DataType.UInt32
                    }, {
                        name: "volume",
                        description: {
                            text: "specifies the sound volume [0 = quiet ,100 = loud]"
                        },
                        dataType: DataType.UInt32
                    }],

                    outputArguments: [{
                        name: "Barks",
                        description: {
                            text: "the generated barks"
                        },
                        dataType: DataType.String,
                        valueRank: 1
                    }]
                });

            method.bindMethod(function (inputArguments, context, callback) {

                const nbBarks = inputArguments[0].value;
                const volume = inputArguments[1].value;

                verbose_log("Hello World ! I will bark " + nbBarks + " times");
                verbose_log("the requested volume is " + volume + "");
                const sound_volume = new Array(volume).join("!");
                /* eslint-disable-next-line */
                const barks:any = [];
                for (let i = 0; i < nbBarks; i++) {
                    barks.push("Whaff" + sound_volume);
                }

                const callMethodResult = {
                    statusCode: StatusCodes.Good,
                    outputArguments: [{
                        dataType: DataType.String,
                        arrayType: VariantArrayType.Array,
                        value: barks
                    }]
                };
                callback(null, callMethodResult);
            });
        }

        function available_memory() {
            return os.freemem() / os.totalmem() * 100.0;
        }

        (async () => {
            try {
                await initNewServer(); // Read & set parameters
                node.server = new OPCUAServer(node.server_options);

                await node.server.initialize();
                if (node.constructDefaultAddressSpace === true) {
                    construct_my_address_space(node.server.engine.addressSpace);
                }
                await node.server.start();

                verbose_log("Using server certificate    " + node.server.certificateFile);
                verbose_log("Using PKI folder            " + node.server.serverCertificateManager.rootDir);
                verbose_log("Using UserPKI folder        " + node.server.userCertificateManager.rootDir);
                verbose_log("Trusted certificate folder  " + node.server.serverCertificateManager.trustedFolder);
                verbose_log("Rejected certificate folder " + node.server.serverCertificateManager.rejectedFolder);

                // Needed for Alarms and Conditions
                if (node.server && node.server.engine && node.server.engine.addressSpace) {
                    node.server.engine.addressSpace.installAlarmsAndConditionsService();
                    addAggregateSupport(node.server.engine.addressSpace);
                }
                // Client connects with userName
                node.server.on("session_activated", (session) => {
                   if (session.userIdentityToken) { // } && session.userIdentityToken.userName) {
                      /* eslint-disable-next-line */
                      const msg:any = {};
                      msg.topic="Username";
                      msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                      node.send(msg);
                   }
                });
                // Client connected
                node.server.on("create_session", function(session) {
                  /* eslint-disable-next-line */
                  const msg: any = {};
                  msg.topic="Client-connected";
                  msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                  node.send(msg);
                });
                // Client disconnected
                node.server.on("session_closed", function(session, reason) {
                    node.debug("Reason: " + reason);
                    /* eslint-disable-next-line */
                    const msg: any = {};
                    msg.topic="Client-disconnected";
                    msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString() + " " + session.sessionName ? session.sessionName.toString() : "<null>";
                    node.send(msg);
                 });
                 node.status({
                    fill: "green",
                    shape: "dot",
                    text: "running"
                });
                initialized = true;
               }
            catch (err) {
                /* eslint-disable-next-line */
                const msg: any = {};
                msg.error = {};
                msg.error.message = "Disconnect error: " + err;
                msg.error.source = n.name; // this;
                node.error("Disconnect error: ", msg);
            }
        })();

        //######################################################################################
        node.on("input", function (msg) {
            verbose_log(JSON.stringify(msg));
            if (!node.server || !initialized) {
                node_error("Server is not running");
                return false;
            }
            const payload = msg.payload;
            // modify 5/03/2022
            if (contains_necessaryProperties(msg)) {
                read_message(payload);
            }else {
                node.warn('warning: properties like messageType, namespace, variableName or VariableValue is missing.');
            }

            if (contains_opcua_command(payload)) {
                msg.payload = execute_opcua_command(msg);
            }

            if (equipmentNotFound) {
                const addressSpace = node.server.engine.addressSpace;
                if (addressSpace === undefined || addressSpace === null) {
                    node_error("addressSpace undefined");
                    return false;
                }

                if (node.constructDefaultAddressSpace === true) {
                    const rootFolder = addressSpace.findNode("ns=1;s=VendorName");
                    if (!rootFolder) {
                        node_error("VerdorName not found!");
                        return false;
                    }
                    const references = rootFolder.findReferences("Organizes", true);

                    if (findReference(references, equipment.nodeId)) {
                        verbose_log("Equipment Reference found in VendorName");
                        equipmentNotFound = false;
                    } else {
                        verbose_warn("Equipment Reference not found in VendorName");
                    }
                }
            }

            node.send(msg);
        });

        function findReference(references, nodeId) {
            return references.filter(function (r) {
                return r.nodeId.toString() === nodeId.toString();
            });
        }
        // check json object - modify 5/03/2022
        function contains_messageType(payload) {
            /* eslint-disable-next-line */
            return payload.hasOwnProperty('messageType');
        }
        function contains_namespace(payload) {
            /* eslint-disable-next-line */
            if (!payload.hasOwnProperty('namespace'))
                node.warn("Mandatory parameter 'namespace' is missing");
            /* eslint-disable-next-line */
            return payload.hasOwnProperty('namespace');
        }
         
        function contains_variableName(payload) {
            /* eslint-disable-next-line */
            if (!payload.hasOwnProperty('variableName'))
                node.warn("Mandatory parameter 'variableName' missing");
            /* eslint-disable-next-line */
            return payload.hasOwnProperty('variableName');
        }
         
        function contains_variableValue(payload) {
            /* eslint-disable-next-line */
            if (!payload.hasOwnProperty('variableValue'))
                node.warn("Optional parameter 'variableValue' missing");
            /* eslint-disable-next-line */
            return payload.hasOwnProperty('variableValue'); 
        }

        function contains_necessaryProperties(msg) {
            if (contains_messageType(msg.payload)) {
                return(contains_namespace(msg.payload) && 
                       contains_variableName(msg.payload) && 
                       contains_variableValue(msg.payload));
            }
            else {
                /* eslint-disable-next-line */
                if (msg.payload.hasOwnProperty('opcuaCommand') && msg.payload.opcuaCommand === "addVariable") {
                    // msg.topic with nodeId and datatype
                    if (msg.topic.indexOf("ns=")>=0 && msg.topic.indexOf("datatype=")>0) {
                        return true;
                    }
                    else {
                        node.warn("msg.topic must contain nodeId and datatype!");
                    }
                }
                else {
                    return contains_opcua_command(msg.payload);
                }
            }
        }

        function read_message(payload) {
            switch (payload.messageType) {
                case 'Variable':
                    const ns = payload.namespace.toString();
                    const variableId = `${ns}:${payload.variableName}`

                    verbose_log("BEFORE: " + ns + ":" + payload.variableName + " value: " + JSON.stringify(variables[variableId]));
                    let value = payload.variableValue;
                    if (payload.variableValue === "true" || payload.variableValue === true || payload.variableValue === 1) {
                        value = true;
                    }
                    if (payload.variableValue === "false" || payload.variableValue === false || payload.variableValue === 0) {
                        value = false;
                    }
                    variables[variableId] = value;
                    // update server variable value if needed now variables[variableId]=value used
                    
                    const addressSpace = node.server.engine.addressSpace;
                    if (!addressSpace) return;
                    // var vnode = addressSpace.findNode("ns="+ns+";s="+ payload.variableName);
                    let vnode;
                    if(typeof(payload.variableName) === 'number' && addressSpace) {
                        verbose_log("findNode(ns="+ns+";i="+payload.variableName);
                        const vnode = addressSpace.findNode("ns="+ns+";i="+payload.variableName);
                        if(vnode === null) {
                            verbose_warn("vnode is null, findNode did not succeeded");
                        }
                    } 
                    else { 
                        // if( typeof(payload.variableName)==='string')
                        // this must be string - a plain variable name
                        // TODO opaque
                        verbose_log("findNode(ns="+ns+";s="+payload.variableName);
                        if (addressSpace) {
                            vnode = addressSpace.findNode("ns=" + ns + ";s=" + payload.variableName);
                        }
                    }
                    if (vnode) {
                        verbose_log("Found variable, nodeId: " + vnode.nodeId);

                        variables[variableId] = build_new_value_by_datatype(payload.datatype, payload.variableValue);
                        // var newValue = opcuaBasics.build_new_variant(payload.datatype, payload.variableValue);
                        const newValue = build_new_dataValue(payload.datatype, payload.variableValue);
                        vnode.setValueFromSource(newValue); // This fixes if variable if not bound eq. bindVariables is not called
                        if (payload.quality && payload.sourceTimestamp) {
                            // var statusCode = StatusCodes.BadDeviceFailure;
                            // var statusCode = StatusCodes.BadDataLost;
                            // Bad 0x80000000
                            if(typeof(payload.quality)==='string') { 
                                // a name of Quality was given -> convert it to number
                                verbose_log("Getting numeric status code of quality: " + payload.quality);
                                payload.quality = StatusCodes[payload.quality].value;
                                
                            }
                            // else // typeof(payload.quality)==='number', e.g. 2161770496
                            const statusCode = StatusCode.makeStatusCode(payload.quality, "");
                            verbose_log("StatusCode from value: " + payload.quality + " (0x" + payload.quality.toString(16) + ") description: " + statusCode.description);
                            const ts = new Date(payload.sourceTimestamp);
                            verbose_log("Timestamp: " + ts.toISOString());
                            verbose_log("Set variable, newValue:" + JSON.stringify(newValue) + " statusCode: " + statusCode.description + " sourceTimestamp: " + ts);
                            vnode.setValueFromSource(newValue, statusCode, ts);
                            // Dummy & quick fix for statusCode & timeStamp, look timestamped_get
                            variablesStatus[variableId] = statusCode;
                            variablesTs[variableId] = ts;
                            console.log("Statuscode & sourceTimestamp, vnode: " + JSON.stringify(vnode));
                            const session = new PseudoSession(addressSpace);
                            const nodesToWrite = [
                                {
                                    nodeId: vnode.nodeId,
                                    attributeId: AttributeIds.Value,
                                    value: /*new DataValue(*/
                                    {
                                        value: newValue,
                                        statusCode,
                                        ts
                                    }
                                }
                            ];
                            verbose_log("Write: " + JSON.stringify(nodesToWrite));
                            session.write(nodesToWrite, function (err, statusCodes) {
                                if (err) {
                                    node.error("Write error: " + err);
                                }
                                else {
                                    verbose_log("Write succeeded, statusCode: " + JSON.stringify(statusCodes));
                                }
                            });
                            
                            /*
                            // NOT WORKING SOLUTION EVEN IT WAS CLEAN
                            else {
                                verbose_log("Set variable, newValue:" + JSON.stringify(newValue) + " statusCode: " + statusCode.description);
                                vnode.setValueFromSource(newValue, statusCode);
                                console.log("Statuscode, vnode: " + JSON.stringify(vnode));
                                vnode.setValueFromSource(newValue, statusCode);
                            }
                            */
                        }
                    }
                    else {
                        node.error("Variable not found from server address space: " + payload.namespace + ":" + payload.variableName);
                    }
                    verbose_log("AFTER : " + ns + ":" + payload.variableName + " value: " + JSON.stringify(variables[variableId]));
                    break;
                default:
                    break;
            }
        }

        function contains_opcua_command(payload) {
            /* eslint-disable-next-line */
            return payload.hasOwnProperty('opcuaCommand');
        }

        function execute_opcua_command(msg) {
            const payload = msg.payload;
            const addressSpace = node.server.engine.addressSpace;
            if (!addressSpace) {
                return;
            }
            // let name2 = "";
            let returnValue = "";

            switch (payload.opcuaCommand) {

                case "restartOPCUAServer":
                    restart_server();
                    break;

                case "addEquipment":
                    verbose_log("Adding node: ".concat(payload.nodeName));
                    equipmentCounter++;
                    const ename = payload.nodeName.concat(equipmentCounter);
                    if (addressSpace) {
                        addressSpace.getOwnNamespace().addObject({
                            organizedBy: equipment.nodeId, // addressSpace.findNode(equipment.nodeId),
                            nodeId: "ns=1;s=".concat(ename),
                            browseName: ename
                        });
                    }
                    break;

                case "addPhysicalAsset":
                    verbose_log("Adding node: ".concat(payload.nodeName));
                    physicalAssetCounter++;
                    const pname = payload.nodeName.concat(physicalAssetCounter);
                    if (addressSpace) {
                        addressSpace.getOwnNamespace().addObject({
                            organizedBy: physicalAssets.nodeId, // addressSpace.findNode(physicalAssets.nodeId),
                            nodeId: "ns=1;s=".concat(pname),
                            browseName: pname
                        });
                    }
                    break;

                case "setFolder":
                    verbose_log("Set Folder: ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    if (addressSpace) {
                        folder = addressSpace.findNode(msg.topic) as UAObjectsFolder;
                    }
                    if (folder) {
                        verbose_log("Found folder: " + folder);
                    }
                    else {
                        verbose_warn("Folder not found for topic: " + msg.topic);
                    }
                    break;

                case "addFolder":
                    let nodeId2 = msg.topic;
                    let description = "";
                    const d = msg.topic.indexOf("description=");
                    if (d > 0) {
                        nodeId2 = nodeId2.substring(0, d - 1); // format is msg.topic="ns=1;s=TEST;description=MyTestFolder"
                        description = msg.topic.substring(d + 12);
                        if (description.indexOf(";") >= 0) {
                            description = description.substring(0, description.indexOf(";"));
                        }
                    }
                    verbose_log("Adding Folder: ".concat(nodeId2)); // Example topic format ns=4;s=FolderName
                    let parentFolder;
                    if (node.server && node.server.engine && node.server.engine.addressSpace &&
                        node.server.engine.addressSpace.rootFolder && node.server.engine.addressSpace.rootFolder.objects) {
                        parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                    }
                    if (folder) {
                        parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                    }
                    // Check & add from msg accessLevel userAccessLevel, role & permissions
                    let accessLevel: AccessLevelFlag = makeAccessLevelFlag("CurrentRead|CurrentWrite"); // Use as default
                    let userAccessLevel = makeAccessLevelFlag("CurrentRead|CurrentWrite"); // Use as default
                    if (msg.accessLevel) {
                        accessLevel = msg.accessLevel;
                    }
                    if (msg.userAccessLevel) {
                        userAccessLevel = msg.userAccessLevel;
                    }
                    // permissions collected from multiple opcua-rights
                    let permissions = [
                        { roleId: WellKnownRoles.Anonymous, permissions: allPermissions },
                        { roleId: WellKnownRoles.AuthenticatedUser, permissions: allPermissions },
                        ];
                    if (msg.permissions) {
                        permissions = msg.permissions;
                    }
                    
                    // Own namespace
                    if (nodeId2.indexOf("ns=1;") >= 0 && addressSpace) {
                        folder = addressSpace.getOwnNamespace().addFolder(parentFolder.nodeId, {
                            // organizedBy: parentFolder.nodeId, // addressSpace.findNode(parentFolder.nodeId),
                            nodeId: coerceNodeId(nodeId2), // msg.topic,
                            description: description,
                            accessLevel: accessLevel, // TODO / FIX 
                            userAccessLevel: userAccessLevel, // TODO / FIX
                            rolePermissions: permissions, // [].concat(permissions),
                            accessRestrictions: AccessRestrictionsFlag.None, // TODO from msg
                            browseName: nodeId2.substring(7)
                        }) as UAObjectsFolder;
                        // folder.setAccessLevel(makeAccessLevelFlag(accessLevel));
                    }
                    else {
                        verbose_log("Topic: " + nodeId2 + " index: " + nodeId2.substring(3));
                        const index = parseInt(nodeId2.substring(3));
                        verbose_log("ns index: " + index);
                        const uri = addressSpace.getNamespaceUri(index);
                        verbose_log("ns uri: " + uri);
                        const ns = addressSpace.getNamespace(uri); // Or index
                        const name = nodeId2; // msg.topic;
                        let browseName = name; // Use full name by default
                        // NodeId can be string or integer or Guid or Opaque: ns=10;i=1000 or ns=5;g=
                        let bIndex = name.indexOf(";s="); // String
                        if (bIndex>0) {
                            browseName = name.substring(bIndex+3);
                        }
                        bIndex = name.indexOf(";i="); // Integer
                        if (bIndex>0) {
                            browseName = name.substring(bIndex+3);
                        }
                        bIndex = name.indexOf(";g="); // Guid
                        if (bIndex>0) {
                            browseName = name.substring(bIndex+3);
                        }
                        bIndex = name.indexOf(";b="); // Opaque base64
                        if (bIndex>0) {
                            browseName = name.substring(bIndex+3);
                        }
                        folder = ns.addFolder(parentFolder.nodeId, {nodeId: nodeId2, // msg.topic,
                            description: description,
                            accessLevel: accessLevel,
                            userAccessLevel: userAccessLevel,
                            rolePermissions: permissions, // [].concat(permissions),
                            accessRestrictions: AccessRestrictionsFlag.None, // TODO from msg
                            browseName: browseName // msg.topic.substring(msg.topic.indexOf(";s=")+3)});
                        }) as UAObjectsFolder;
                    }
                    break;

                case "addVariable":
                    verbose_log("Adding node: ".concat(msg.topic)); // Example topic format ns=4;s=VariableName;datatype=Double
                    let datatype2 = "";
                    let name2;
                    // var description = "";
                    let opcuaDataType2;
                    const dt = msg.topic.indexOf("datatype=");
                    if (dt<0) {
                        node_error("no datatype=Float or other type in addVariable ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    }
                    // let parentFolder = addressSpace.rootFolder.objects;
                    if (folder) {
                        parentFolder = folder; // Use previous folder as parent or setFolder() can be use to set parent
                    }
                    const d2 = msg.topic.indexOf("description=");
                    if (d2 > 0) {
                        description = msg.topic.substring(d2 + 12);
                        if (description.indexOf(";") >= 0) {
                            description = description.substring(0, description.indexOf(";"));
                        }
                    }
                    if (dt > 0) {
                        name2 = msg.topic.substring(0, dt - 1);
                        datatype2 = msg.topic.substring(dt + 9);
                        // ExtentionObject contains extra info like typeId
                        if (datatype2.indexOf(";") >= 0) {
                            datatype2 = datatype2.substring(0, datatype2.indexOf(";"));
                        }
                        let arrayType = VariantArrayType.Scalar;
                        const arr = datatype2.indexOf("Array");
                        let dim1;        // Fix for the scalars
                        let dim2;        // Matrix
                        let dim3;        // Cube
                        let indexStr = "";
                        let valueRank = -1;     // Fix for the scalars
                        if (arr > 0) {
                            arrayType = VariantArrayType.Array;
                            dim1 = datatype2.substring(arr+6);
                            indexStr = dim1.substring(0, dim1.length-1);
                            dim1 = parseInt(dim1.substring(0, dim1.length-1));
                            valueRank = 1; // 1-dim Array
                            datatype2 = datatype2.substring(0, arr);
                            // valueRank = 2; // 2-dim Matrix FloatArray[5,5]
                            // valueRank = 3; // 3-dim Matrix FloatArray[5,5,5]
                            const indexes = indexStr.split(",");
                            node.debug("INDEXES[" + indexes.length + "] = " + JSON.stringify(indexes) + " from " + indexStr);
                            if (indexes.length === 1) {
                                dim1 = parseInt(indexes[0]);
                                valueRank = 1;
                            }
                            if (indexes.length === 2) {
                                dim1 = parseInt(indexes[0]);
                                dim2 = parseInt(indexes[1]);
                                valueRank = 2;
                            }
                            if (indexes.length === 3) {
                                dim1 = parseInt(indexes[0]);
                                dim2 = parseInt(indexes[1]);
                                dim3 = parseInt(indexes[2]);
                                valueRank = 3;
                            }
                        }
                        
                        let namespace;
                        if (addressSpace) {
                            namespace = addressSpace.getOwnNamespace(); // Default
                        }
                        let nsindex=1;
                        if (msg.topic.indexOf("ns=1;") !== 0 && addressSpace) {
                            const allNamespaces = addressSpace.getNamespaceArray();
                            // console.log("ALL ns: " + stringify(allNamespaces));
                            // Select namespace by index
                            nsindex = parseInt(msg.topic.substring(3));
                            namespace = allNamespaces[nsindex];
                        }

                        const ns = nsindex.toString();
                        let dimensions = valueRank <= 0 ? null : [dim1]; // Fix for conformance check TODO dim2, dim3
                        let browseName = name2; // Use full name by default

                        // NodeId can be string or integer or Guid or Opaque: ns=10;i=1000 or ns=5;g=
                        let bIndex = name2.indexOf(";s="); // String
                        if (bIndex>0) {
                            browseName = name2.substring(bIndex+3);
                        }
                        bIndex = name2.indexOf(";i="); // Integer
                        if (bIndex>0) {
                            browseName = name2.substring(bIndex+3);
                        }
                        bIndex = name2.indexOf(";g="); // Guid
                        if (bIndex>0) {
                            browseName = name2.substring(bIndex+3);
                        }
                        bIndex = name2.indexOf(";b="); // Opaque base64
                        if (bIndex>0) {
                            browseName = name2.substring(bIndex+3);
                        }

                        const variableId = `${ns}:${browseName}`;

                        verbose_log(`addVariable: variableId: ${variableId}`);

                        variables[variableId] = 0;
                        if (valueRank == 1) {
                            arrayType = VariantArrayType.Array;
                            dimensions = [dim1];
                            variables[variableId] = new Float32Array(dim1); 
                            for (let i=0; i<dim1; i++) {
                                variables[variableId][i] = 0;
                            }
                        }
                        if (valueRank == 2) {
                            arrayType = VariantArrayType.Matrix;
                            dimensions = [dim1, dim2];
                            variables[variableId] = new Float32Array(dim1*dim2); 
                            for (let i=0; i<dim1*dim2; i++) {
                                variables[variableId][i] = 0;
                            }
                        }
                        if (valueRank == 3) {
                            arrayType = VariantArrayType.Matrix; // Actually no Cube => Matrix with 3 dims
                            dimensions = [dim1, dim2, dim3];
                            variables[variableId] = new Float32Array(dim1*dim2*dim3); 
                            for (let i=0; i<dim1*dim2*dim3; i++) {
                                variables[variableId][i] = 0;
                            }
                        }

                        if (datatype2 == "Int32") {
                            opcuaDataType2 = DataType.Int32;
                        }
                        if (datatype2 == "Int16") {
                            opcuaDataType2 = DataType.Int16;
                        }
                        if (datatype2 == "UInt32") {
                            opcuaDataType2 = DataType.UInt32;
                        }
                        if (datatype2 == "UInt16") {
                            opcuaDataType2 = DataType.UInt16;
                        }
                        if (datatype2 == "Double") {
                            opcuaDataType2 = DataType.Double;
                        }
                        if (datatype2 == "Float") {
                            opcuaDataType2 = DataType.Float;
                        }
                        if (datatype2 == "Byte") {
                            opcuaDataType2 = DataType.Byte;
                        }
                        if (datatype2 == "SByte") {
                            opcuaDataType2 = DataType.SByte;
                        }
                        if (datatype2 == "DateTime") {
                            opcuaDataType2 = DataType.DateTime;
                            variables[variableId] = new Date(); 
                        }
                        if (datatype2 == "ExtensionObject") {
                            opcuaDataType2 = DataType.ExtensionObject;
                            variables[variableId] = {}; 
                        }
                        if (datatype2 == "ByteString") {
                            opcuaDataType2 = DataType.ByteString;
                            variables[variableId] = Buffer.from(""); 
                        }
                        if (datatype2 == "String") {
                            opcuaDataType2 = DataType.String;
                            variables[variableId] = ""; 
                        }
                        if (datatype2 == "Boolean") {
                            opcuaDataType2 = DataType.Boolean;
                            variables[variableId] = true; 
                        }
                        if (opcuaDataType2 === null) {
                            verbose_warn("Cannot addVariable, datatype: " + datatype2 + " is not valid OPC UA datatype!");
                            break;
                        }
                        verbose_log("Datatype: " + datatype2);
                        verbose_log("OPC UA type id: "+ opcuaDataType2.toString() + " dims[" + dim1 + "," + dim2 +"," + dim3 +"] == " + dimensions);
                        // Initial value for server variable
                        const init = msg.topic.indexOf("value=");
                        if (init > 0) {
                            const initialValue = msg.topic.substring(init+6);
                            verbose_log("BrowseName: " + ns + ":" + browseName + " initial value: " + initialValue);
                            variables[variableId] = build_new_value_by_datatype(datatype2, initialValue);
                        }

                        
                        if (datatype2 === "ExtensionObject") {
                            if (!addressSpace) return;
                            const typeId = msg.topic.substring(msg.topic.indexOf("typeId=") + 7);
                            verbose_log("ExtensionObject typeId: " + typeId);
                            const DataTypeNode = addressSpace.findDataType(coerceNodeId(typeId));
                            let extVar;
                            if (DataTypeNode) {
                                extVar = addressSpace.constructExtensionObject(DataTypeNode, {}); // build default value for extension object
                            }
                            verbose_log("Server returned: " + JSON.stringify(extVar));
                            const extNode = namespace.addVariable({
                                organizedBy: parentFolder.nodeId, // addressSpace.findNode(parentFolder.nodeId),
                                nodeId: name,
                                browseName: browseName,
                                description: msg.description,
                                dataType: coerceNodeId(typeId), // "ExtensionObject", // "StructureDefinition", // typeId,
                                minimumSamplingInterval: 500,
                                valueRank,
                                value: { dataType: DataType.ExtensionObject, value: extVar },
                                // value: { dataType: DataType.StructureDefinition, value: extVar },
                            });
                            const newext = { "payload" : { "messageType" : "Variable", "variableName": browseName, "nodeId": extNode.nodeId.toString() }};
                            node.send(newext);
                            // TODO get/set functions and other tricks as with normal scalar
                            return StatusCodes.Good;
                        }
                        // Check & add from msg accessLevel userAccessLevel, role & permissions
                        let accessLevel = makeAccessLevelFlag("CurrentRead | CurrentWrite"); // Use as default
                        let userAccessLevel = makeAccessLevelFlag("CurrentRead | CurrentWrite"); // Use as default
                        if (msg.accessLevel) {
                            accessLevel = msg.accessLevel;
                        }
                        if (msg.userAccessLevel) {
                            userAccessLevel = msg.userAccessLevel;
                        }    
                        // permissions collected from multiple opcua-rights
                        let permissions = [
                            { roleId: WellKnownRoles.Anonymous, permissions: allPermissions },
                            { roleId: WellKnownRoles.AuthenticatedUser, permissions: allPermissions },
                            ];
                        if (msg.permissions) {
                            permissions = msg.permissions;
                        }
                        verbose_log("Using access level:" + accessLevel + " user access level: " + userAccessLevel + " permissions:" + JSON.stringify(permissions));
                        const newVAR = namespace.addVariable({
                            organizedBy: parentFolder.nodeId, // addressSpace.findNode(parentFolder.nodeId),
                            nodeId: name,
                            accessLevel: accessLevel,
                            userAccessLevel: userAccessLevel,
                            rolePermissions: permissions, // [].concat(permissions),
                            accessRestrictions: AccessRestrictionsFlag.None, // TODO from msg
                            browseName: browseName, // or displayName
                            description: msg.description,
                            dataType: datatype2, // opcuaDataType,
                            minimumSamplingInterval: 500,
                            valueRank,
                            arrayDimensions: dimensions,
                            value: {
                                timestamped_get: function() {
                                    let ts = new Date();
                                    if (variablesTs[variableId]) {
                                        ts = variablesTs[variableId];
                                    }
                                    let st = StatusCodes.Good;
                                    if (variablesStatus[variableId]) {
                                        st = variablesStatus[variableId];
                                    }
                                    let value;
                                    if (valueRank>=2) {
                                        value = new Variant({
                                            arrayType,
                                            dimensions,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    }
                                    else {
                                        value = new Variant({
                                            arrayType,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    } 

                                    const myDataValue = new DataValue({
                                            serverPicoseconds: 0,
                                            serverTimestamp: new Date(),
                                            sourcePicoseconds: 0,
                                            sourceTimestamp: ts,
                                            statusCode: st,
                                            value: value // new Variant({arrayType, dataType: opcuaDataType, value: variables[variableId]})
                                    });
                                    return myDataValue;
                                },
                                /*
                                get: function () {
                                    if (valueRank>=2) {
                                        return new Variant({
                                            arrayType,
                                            dimensions,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    }
                                    else {
                                        return new Variant({
                                            arrayType,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    } 
                                },
                                */
                                set: function (variant) {
                                    verbose_log("Server set new variable value : " + variables[variableId] + " browseName: " + ns + ":" + browseName + " new:" + stringify(variant));
                                    /*
                                    // TODO Array partial write need some more studies
                                    if (msg.payload.range) {
                                        verbose_log(chalk.red("SERVER WRITE RANGE: " + range));
                                        var startIndex = 2; // parseInt(range);
                                        var endIndex = 4; // parseInt(range.substring(1))
                                        var newIndex = 0;
                                        var oldValues = variables[variableId].split(",");
                                        for (var i=startIndex; i<endIndex; i++) {
                                            oldValues[i] = variant.value[newIndex.toString()];
                                            newIndex++;
                                        }
                                        verbose_log(chalk.red("NEW ARRAY with range values: " + oldValues));
                                    }
                                    else {
                                        */
                                        variables[variableId] = build_new_value_by_datatype(variant.dataType.toString(), variant.value);
                                    // }
                                    // variables[variableId] = Object.assign(variables[variableId], opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value));
                                    verbose_log("Server variable: " + variables[variableId] + " browseName: " + ns + ":" + browseName);
                                    const SetMsg = { "payload" : { "messageType" : "Variable", "variableName": ns + ":" + browseName, "variableValue": variables[variableId] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
                                    node.send(SetMsg);
                                    return StatusCodes.Good;
                                }
                            }
                        });
                  
                        const newvar = { "payload" : { "messageType" : "Variable", "variableName": ns + ":" + browseName, "nodeId": newVAR.nodeId.toString() }};
                        node.send(newvar);

                    }
                    break;

                case "installHistorian":
                        verbose_log("Install historian for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                        // let datatype = "";
                        const opcuaDataType = DataType.Null;
                        const nodeStr2 = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        const e = msg.topic.indexOf("datatype=");
                        if (e<0) {
                            node_error("no datatype=Float or other type in install historian ".concat(msg.topic)); // Example topic format ns=1;s=variable
                        }
                        let haNodeId;
                        if (addressSpace) {
                            haNodeId = addressSpace.findNode(nodeStr2);
                        }
                        if (haNodeId && addressSpace) {
                          addressSpace.installHistoricalDataNode(haNodeId); // no options, use memory as storage
                        }
                        else {
                            node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr2);
                        }
                    break;
                
                case "addMethod":
                    verbose_log("Add method for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                    verbose_log("Parameters: " + JSON.stringify(msg));
                    const parentNode = addressSpace.getOwnNamespace().findNode(msg.topic);
                    if (!parentNode) {
                        node.error("Method needs parent node, wrong nodeId in the msg.topic: ", msg);
                    }
                    const newMethod = addressSpace.getOwnNamespace().addMethod(
                        parentNode as UAObject, {
                            nodeId: "ns=1;s=" + msg.browseName,
                            browseName: msg.browseName,
                            inputArguments: [{
                                name: msg.inputArguments[0].name,
                                description: {
                                    text: msg.inputArguments[0].text
                                },
                                dataType: getUaDatatype(msg.inputArguments[0].type)
                            }],
                            outputArguments: [{
                                name: msg.outputArguments[0].name,
                                description: {
                                    text: msg.outputArguments[0].text,
                                },
                                dataType: getUaDatatype(msg.outputArguments[0].type),
                                valueRank: 1 // TODO Array, Matrix later
                            }]
                        });
                    newMethod.bindMethod(async function (inputArguments, context, callback) {
                        const status = StatusCodes.BadNotImplemented; // Current implementation does not support as setServerConfiguration is void and no return array
                        const response = "";
                        const callMethodResult = {
                        statusCode: status,
                        // TODO check if any outputArguments
                        outputArguments: [ {
                            dataType: getUaDatatype(msg.outputArguments[0].type),
                            // arrayType: VariantArrayType.Array,
                            value: response
                            }]
                        };
                        callback(null, callMethodResult);
                    });
                    break;
                case "deleteNode":
                    if (addressSpace === undefined) {
                        node_error("addressSpace undefined");
                        return false;
                    }

                    const searchedNode = addressSpace.findNode(payload.nodeId);
                    if (!searchedNode) {
                        verbose_warn("Cannot find node: " + payload.nodeId + " from addressSpace")
                    } else {
                        addressSpace.deleteNode(searchedNode);
                    }
                    break;

                case "registerNamespace":
                    const ns = addressSpace.registerNamespace(msg.topic);
                    verbose_log("namespace: " + stringify(ns));
                    const index = addressSpace.getNamespaceIndex(msg.topic);
                    returnValue = "ns=" + index.toString();
                    break;
                
                case "getNamespaceIndex":
                    returnValue = "ns=" + addressSpace.getNamespaceIndex(msg.topic);
                    break;

                case "getNamespaces":
                    // returnValue = addressSpace.getNamespaceArray().reduce((dict, namespace, index) => (dict[namespace.namespaceUri] = index, dict), {});
                    returnValue = addressSpace.getNamespaceArray().toString();
                    break;

                case "setUsers":
                    /* eslint-disable-next-line */
                    if (msg.payload.hasOwnProperty("users")) {
                        users = msg.payload.users;
                        verbose_log("NEW USERS: " + JSON.stringify(users));
                        setUsers();
                    }
                    else {
                        verbose_warn("No users defined in the input msg)");
                    }
                    break;

                case "installDiscreteAlarm":
                    verbose_log("Install discrete alarm for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                    const alarmText = msg.alarmText;
                    const priority = msg.priority;
                    let nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                    let nodeId = addressSpace.findNode(nodeStr);
                    // var boolVar = false;
                    if (nodeId && addressSpace) {
                        const namespace = addressSpace.getOwnNamespace(); // Default
                        const alarmState = namespace.addVariable({
                            nodeId: nodeStr + "-" + "AlarmState",
                            browseName: nodeStr.substring(7) + "-" + "AlarmState",
                            displayName: nodeStr.substring(7) + "-" + "AlarmState",
                            propertyOf: nodeId,
                            dataType: "Boolean",
                            minimumSamplingInterval: 500, // NOTE alarm is event based DO NOT USE THIS! ???
                            eventSourceOf: "i=2253", // Use server as default event source
                            /* Use default
                            value: {
                                get: function () {
                                    return new Variant({
                                        dataType: "Boolean",
                                        value: boolVar
                                    });
                                },
                                set: function (variant) {
                                    boolVar = variant.value;
                                    return StatusCodes.Good;
                                }
                            }
                            */
                        });
                        alarmState.setValueFromSource({dataType: "Boolean", value: false});
                        const discreteAlarm = addressSpace.findEventType("DiscreteAlarmType") as UAEventType;
                        const alarm = namespace.instantiateDiscreteAlarm(discreteAlarm,
                            {
                                nodeId: nodeStr + "-" + "DiscreteAlarm",
                                browseName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                displayName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                organizedBy: nodeId,
                                conditionSource: alarmState,
                                // severity: priority,
                                conditionName: "Node-Red OPC UA Event",
                                // browseName: "DiscreteAlarmInstance",
                                inputNode: alarmState,   // the variable that will be monitored for change, generate below
                                optionals: [ "Acknowledge", "ConfirmedState", "Confirm" ], // confirm state and confirm Method
                            }
                        );
                        alarm.setEnabledState(true);
                        // alarm.setSeverity(priority);
                        // Do not use default
                        try {
                            alarmState.on("value_changed", function (newDataValue) {
                                // console.log("DISCRETE value: " + newDataValue.value.value);
                                // This works OK
                                if (newDataValue.value.value === true) {
                                    alarm.activeState.setValue(true);
                                    alarm.ackedState.setValue(false);
                                    alarm.raiseNewCondition({
                                        severity: priority,
                                        message: alarmText,
                                        retain: true
                                    });
                                }
                                if (newDataValue.value.value === false) {
                                    alarm.deactivateAlarm();
                                }
                            });
                        }
                        /* eslint-disable-next-line */
                        catch(error:any) {
                            node.error("Error: " + error.message);
                        }
                    }
                    else {
                        node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
                    }
                    break;    

                case "installLimitAlarm":
                        verbose_log("install limit alarm for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                        const highhighLimit = msg.hh;
                        const highLimit = msg.h;
                        const lowLimit = msg.l;
                        const lowlowLimit = msg.ll;
                        nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        nodeId = addressSpace.findNode(nodeStr);
                        let levelVar = 5.0;
                        if (nodeId) {
                            const namespace = addressSpace.getOwnNamespace(); // Default
                            
                            const alarmState = namespace.addVariable({
                                nodeId: nodeStr + "-" + "LimitState",
                                browseName: nodeStr.substring(7) + "-" + "LimitState",
                                displayName: nodeStr.substring(7) + "-" + "LimitState",
                                propertyOf: nodeId,
                                dataType: "Double",
                                minimumSamplingInterval: 500,
                                eventSourceOf: "i=2253", // nodeId, // Use server!
                                // inputNode: msg.topic,
                                value: {
                                    get: function () {
                                        return new Variant({
                                            dataType: "Double",
                                            value: levelVar
                                        });
                                    },
                                    set: function (variant) {
                                        levelVar = variant.value;
                                        return StatusCodes.Good;
                                    }
                                }
                            });
                            alarmState.setValueFromSource({dataType: "Double", value: 5.0});
                            const alarm = namespace.instantiateNonExclusiveLimitAlarm("NonExclusiveLimitAlarmType",
                                {
                                    nodeId: nodeStr + "-" + "LimitAlarm",
                                    browseName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    displayName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    organizedBy: nodeId,
                                    conditionSource: alarmState,
                                    conditionName: "Node-Red OPC UA Event",
                                    eventSourceOf: "i=2253", // nodeId, // Use server!
                                    // minimumSamplingInterval: 500,
                                    // browseName: "LimitAlarmInstance",
                                    inputNode: alarmState,   // the variable that will be monitored for change, generate below
                                    highHighLimit: highhighLimit,
                                    highLimit: highLimit,
                                    lowLimit: lowLimit,
                                    lowLowLimit: lowlowLimit,
                                    // severity: priority,
                                    optionals: [ "Acknowledge", "ConfirmedState", "Confirm" ], // confirm state and confirm Method
                                }
                            );
                            alarm.setEnabledState(true);
                            /*
                            alarm._onInputDataValueChange = function (dataValue) {
                                // Overwrite node-opcua default alarm event
                                console.log("LIMIT ALARM NEW VALUE: " + dataValue.value.value + " message: " + msg.alarmText);
                                    // This is not working anymore for some reason???
                                    alarm.activeState.setValue(true);
                                    alarm.ackedState.setValue(false);
                                    alarm.raiseNewCondition({severity: priority, 
                                                             message: msg.alarmText + " " + dataValue.value.value,
                                                             retain: true});  
                            }; // Do not generate events by default node-opcua, use code below
                            */
                            // alarm.setSeverity(priority);
                            // Do not use default change event messages
                            try {
                                alarmState.on("value_changed", function (newDataValue) {
                                    console.log("NEW ALARM LIMIT VALUE: " + newDataValue.value.value + " message: " + msg.alarmText);
                                    // This is not working anymore for some reason???
                                    alarm.activeState.setValue(true);
                                    alarm.ackedState.setValue(false);
                                    alarm.raiseNewCondition({severity: priority, 
                                                             message: msg.alarmText + " " + newDataValue.value.value,
                                                             retain: true});
                                });
                            }
                            /* eslint-disable-next-line */
                            catch(error: any) {
                                console.error("Error: " + error.message);
                            }
                        }
                        else {
                            node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
                        }
                        break;    
                    case "addFile":
                        // msg.topic   == nodeId for the file object
                        // msg.payload == fileName
                        if (msg.topic && msg.payload && msg.payload.fileName && addressSpace) {
                            const file_node = coerceNodeId(msg.topic);
                            const fileName = msg.payload.fileName;
                            verbose_log("New file nodeId:" + file_node + " fileName: " + fileName);
                            const fileType = addressSpace.findObjectType("FileType");
                            if (folder) {
                                parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                            }
                            let parentId = addressSpace.findNode(parentFolder.nodeId)
                            if (!parentId) {
                                parentId = addressSpace.rootFolder.objects; // Use this as exists always
                            }
                            const index = fileName.lastIndexOf("/");
                            let fname = fileName;
                            // Hide path from the filename
                            if (index > 0) {
                                fname = fileName.substring(index+1); // Skip / charater to get just filename
                            }
                            if (fileType) {
                                const newFile = fileType.instantiate({
                                    nodeId: file_node,
                                    browseName: fname,
                                    displayName: fname,
                                    organizedBy: parentId
                                }) as UAFile;
                                installFileType(newFile, { filename: fileName });
                                // Make file writable, can be one extra parameter later inside msg object
                                const Wnode = addressSpace.findNode(file_node.toString() + "-Writable") as UAVariable;
                                Wnode.setValueFromSource({ dataType: "Boolean", value: true});
                                const userWnode = addressSpace.findNode(file_node.toString() + "-UserWritable") as UAVariable;
                                userWnode.setValueFromSource({ dataType: "Boolean", value: true});
                            }
                        }
                        else {
                            verbose_warn("Check msg object, it must contain msg.payload.filename!");
                        }
                        break;
                    case "saveAddressSpace":
                        if (msg.payload && msg.filename) {
                            // Save current server namespace objects to file
                            let namespace = addressSpace.getOwnNamespace(); 
                            // Use msg.topic to select namespace
                            if (msg.topic) {
                                verbose_log("Saving namespace index: " + msg.topic);
                                namespace = addressSpace.getNamespace(parseInt(msg.topic)) as Namespace;
                            }
                            if (namespace) {
                                const xmlstr = namespace.toNodeset2XML();
                                fs.writeFileSync(msg.filename, xmlstr.toString(), {encoding: "utf8"});
                            }
                            else {
                                verbose_warn("No namespace to save to XML file, check namespace index: " + msg.topic);
                            }
                        }
                        else {
                            verbose_warn("Check msg object, it must contain msg.filename for the address space in XML format!");
                        }
                        break;
                    case "loadAddressSpace":
                        verbose_log("Loading nodeset from file: " + msg.filename);
                        if (msg.payload && msg.filename && fs.existsSync(msg.filename) && node.server_options.nodeset_filename) {
                            savedAddressSpace = msg.filename;
                            node.server_options.nodeset_filename.concat(msg.filename);
                            restart_server();
                        }
                        else {
                            verbose_warn("Check msg object, it must contain msg.filename for the address space in XML format!");
                        }
                        break;
                    case "bindVariables":
                        // browse address space and bind method for each variable node setter
                        // report all existing Variables
                        const session = new PseudoSession(addressSpace);
                        const objectsFolder = addressSpace.findNode("ObjectsFolder");
                        if (!objectsFolder) return;
                        /* eslint-disable-next-line */
                        const results: any = [];
                        const crawler = new NodeCrawler(session); // Legacy support
                        crawler.on("browsed", (element) => {
                            // Limit to variables and skip ns=0
                            if (element.nodeId.toString().indexOf("ns=0;") < 0 && element.nodeClass == NodeClass.Variable) {
                                // console.log("Element: " + element);
                                const item = Object.assign({}, element); // Clone element
                                results.push(item);
                            }
                        });
                        crawler.read(objectsFolder.nodeId, function (err, obj) {
                            if (!err) {
                                console.log("Obj: " + obj);
                                // Nothing to do here
                            }
                            else {
                                verbose_warn("Crawling variables failed: " + err);
                            }
                            crawler.dispose();
                        });
                        
                        results.forEach(function(item) {
                            const variableNode = addressSpace.findNode(item.nodeId);
                            if (variableNode) {
                                node.debug("NodeId:" + variableNode.nodeId + " NodeClass: " + variableNode.nodeClass);
                                if (variableNode.nodeClass == NodeClass.Variable) {
                                    const browseName = variableNode.browseName;
                                    const newext = {"payload": {"messageType":"Variable", "variableName": browseName.toString(), "nodeId": item.id.toString()}};
                                    node.send(newext);
                                    bindCallbacks(variableNode, browseName.toString());
                                }
                            }
                        });
                        /* eslint-disable-next-line */
                        function bindCallbacks(variable, browseName) {
                            const variableId = `${variable.namespaceIndex}:${browseName}`;

                            const options = {
                                get: function() {
                                    return new Variant({ dataType: convertToString(variable.dataType.toString()), value: variables[variableId]});
                                },
                                timestamped_get: function() {
                                    let ts = new Date();
                                    if (variablesTs[variableId]) {
                                        ts = variablesTs[variableId];
                                    }
                                    let st = StatusCodes.Good;
                                    if (variablesStatus[variableId]) {
                                        st = variablesStatus[variableId];
                                    }
                                    const myDataValue = new DataValue({
                                        serverPicoseconds: 0,
                                        serverTimestamp: new Date(),
                                        sourcePicoseconds: 0,
                                        sourceTimestamp: ts,
                                        statusCode: st,
                                        value: new Variant({dataType: convertToString(variable.dataType.toString()), 
                                                              value: variables[variableId]})
                                        //value: new Variant({
                                        //    arrayType,
                                        //    dataType: opcuaDataType,
                                        //    value: variables[variableId]})
                                    });
                                    return myDataValue;
                                    /*
                                    return new DataValue({ value: Variant({dataType: opcuaBasics.convertToString(variable.dataType.toString()), value: variables[variableId]}),
                                                                statusCode: StatusCodes.Good,
                                                                serverTimestamp: new Date(),
                                                                sourceTimestamp: new Date()
                                    });
                                    */
                                },
                                set: (variant) => {
                                    // Store value
                                    variables[variableId] = variant.value;
                                    variable.value = new DataValue({statusCode: StatusCodes.Good, 
                                                                    value: new Variant({ dataType: variable.DataType, value: variant.value})
                                                                    });
                                    // Report new value to server node output
                                    const SetMsg = { "payload" : { "messageType" : "Variable", "variableName": browseName, "variableValue": variables[variableId] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
                                    node.send(SetMsg);
                                    return StatusCodes.Good;
                                }
                            };
                            if (variable.nodeClass.toString() === "2") {
                                variable.bindVariable(options, true); // overwrite
                            }
                        }
                        break;
                        case "bindMethod":
                            // Find MethodId and bindMethod with the give function into it
                            // Skeleton for methodFunc
                            /*
                            async function methodFunc(inputArguments, context) {
                                console.log("Method Input arguments: " + JSON.stringify(inputArguments));
                                return { statusCode: StatusCodes.Good };
                            };
                            */  
                            // const methodId = msg.topic;
                            const methodFunc = msg.code;
                            const method = addressSpace.findNode(coerceNodeId(msg.topic)) as UAMethod;
                            if (method) {
                                method.bindMethod(methodFunc);
                            }
                            else {
                                verbose_warn("Method not found!");
                            }
                        break;
                default:
                    node_error("Unknown OPC UA Command");
            }
            return returnValue;
        }

        async function restart_server() {
            verbose_log("Restarting OPC UA Server");
            if (node.server) {
                node.server.engine.setShutdownReason("Shutdown command received");
                // Wait 10s before shutdown
                await node.server.shutdown(10000).then(() => {
                    verbose_log("Server has shutdown");
                    node.server.dispose();
                    // node.server = null;
                    vendorName = null;
                    // folder = null;
                });
                // Start server again
                await initNewServer();
                node.server = new OPCUAServer(node.server_options);
                node.server.on("post_initialize", () => {
                    if (node.constructDefaultAddressSpace === true) {
                        construct_my_address_space(node.server.engine.addressSpace);
                    }
                });                                   
                await node.server.start();
                // Client connects with userName
                node.server.on("session_activated", (session) => {
                    if (session.userIdentityToken) {
                      /* eslint-disable-next-line */
                        const msg:any = {};
                        msg.topic="Username";
                        msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                        node.send(msg);
                    }
                });
                // Client connected
                node.server.on("create_session", function(session) {
                  /* eslint-disable-next-line */
                    const msg:any = {};
                    msg.topic="Client-connected";
                    msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                    node.send(msg);
                });
                // Client disconnected
                node.server.on("session_closed", function(session, reason) {
                    node.debug("Reason: " + reason);
                    /* eslint-disable-next-line */
                    const msg:any = {};
                    msg.topic="Client-disconnected";
                    msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString() + " " + session.sessionName ? session.sessionName.toString() : "<null>";
                    node.send(msg);
                });
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "running"
                });
                initialized = true;
            } 

            if (node.server) {
                verbose_log("Restart OPC UA Server done");
            } else {
                node_error("Cannot restart OPC UA Server");
            }
        }

        node.on("close", function () {
            verbose_log("Closing...");
            close_server();
        });

        async function close_server() {
            if (node.server) {
                await node.server.shutdown(0, function () {
                    // node.server = null;
                    vendorName = null;
                });

            } else {
                // node.server = null;
                vendorName = null;
            }

        }
    }

    RED.nodes.registerType("OpcUa-Server", UaServerNodeConstructor);
};

export = UaServer;