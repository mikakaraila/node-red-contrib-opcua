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

 module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    const ObjectIds = require("node-opcua-constants");
    var fileTransfer = require("node-opcua-file-transfer");
    const { NodeCrawler  } = require("node-opcua-client-crawler");
    var path = require('path');
    var os = require("os");
    var fs = require("fs");
    var chalk = require("chalk");
    var opcuaBasics = require('./opcua-basics');
    const {parse, stringify} = require('flatted');
    const { createServerCertificateManager, createUserCertificateManager } = require("./utils");
   
    function OpcUaServerNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.port = n.port;
        this.endpoint = n.endpoint;
        this.users = n.users;
        this.nodesetDir = n.nodesetDir;
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
                       
        this.maxSessions =  Math.max(10,n.maxSessions); // Always have minimum of 10 sessions.
        


        var maxConnectionsPerEndpoint = 20;
        if (n.maxConnectionsPerEndpoint > 20) {
            maxConnectionsPerEndpoint = n.maxConnectionsPerEndpoint;
        }
        var maxMessageSize = 4096;
        if (n.maxMessageSize > 0) {
            maxMessageSize = n.maxMessageSize;
        }
        var maxBufferSize = 4096;
        if (n.maxBufferSize > 0) {
            maxBufferSize = n.maxBufferSize;
        }
        var node = this;
        var variables = { Counter: 0 };
        var variablesTs = { Counter: 0 };
        var variablesStatus = { Counter: 0 };
        var equipmentCounter = 0;
        var physicalAssetCounter = 0;
        var equipment;
        var physicalAssets;
        var vendorName;
        var myVar2 = new opcua.Variant({dataType: opcua.DataType.Double, value: 0.0});
        var freeMem = new opcua.Variant({dataType: opcua.DataType.Double, value: 0.0});
        var equipmentNotFound = true;
        var initialized = false;
        var folder = null;
        let userManager; // users with username, password and role
        let users = [{ username: "", password: "", roles: "" }]; // Empty as default
        let savedAddressSpace = "";

        if (node.users && node.users.length > 0) {
            verbose_log(chalk.yellow("Trying to load default users from file: ") + chalk.cyan(node.users) + chalk.yellow(" folder: ") + chalk.cyan(__dirname));
            if (fs.existsSync(node.users)) {
                users = JSON.parse(fs.readFileSync(node.users));
                verbose_log(chalk.green("Loaded users: ") + chalk.cyan(JSON.stringify(users)));
                setUsers(users);
            }
            else {
                // Current working directory
                let fileName = path.join(process.cwd(), node.users);
                verbose_log(chalk.yellow("Trying to load default users from file: ") + chalk.cyan(node.users) + chalk.yellow(" folder: ") + chalk.cyan(fileName));
                if (fs.existsSync(fileName)) {
                    users = JSON.parse(fs.readFileSync(fileName));
                    verbose_log(chalk.green("Loaded users: ") + chalk.cyan(JSON.stringify(users)));
                    setUsers(users);
                }
                else {
                    let fileName = path.join(process.cwd(), ".node-red", node.users);
                    verbose_log(chalk.yellow("Trying to load default users from file: ") + chalk.cyan(node.users) + chalk.yellow(" folder: ") + chalk.cyan(fileName));
                    if (fs.existsSync(fileName)) {
                        users = JSON.parse(fs.readFileSync(fileName));
                        verbose_log(chalk.green("Loaded users: ") + chalk.cyan(JSON.stringify(users)));
                        setUsers(users);
                    }
                    else {
                        verbose_log(chalk.red("File: " + node.users + " not found! You can inject users to server or add file to folder: " + fileName));
                        node.error("File: " + node.users + " not found! You can inject users to server or add file to folder: " + fileName);
                    }
                }
            }
        }

        // Server endpoints active configuration
        var policies = [];
        var modes = [];
        
        // Security modes None | Sign | SignAndEncrypt
        if (this.endpointNone === true) {
            policies.push(opcua.SecurityPolicy.None);
            modes.push(opcua.MessageSecurityMode.None);
        }
        if (this.endpointSign === true) {
            modes.push(opcua.MessageSecurityMode.Sign);
        }
        if (this.endpointSignEncrypt === true) {
            modes.push(opcua.MessageSecurityMode.SignAndEncrypt);
        }
        // Security policies
        if (this.endpointBasic128Rsa15 === true) {
            policies.push(opcua.SecurityPolicy.Basic128Rsa15);
        }
        if (this.endpointBasic256 === true) {
            policies.push(opcua.SecurityPolicy.Basic256);
        }
        if (this.endpointBasic256Sha256 === true) {
            policies.push(opcua.SecurityPolicy.Basic256Sha256);
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
                        return opcua.makeRoles(opcua.WellKnownRoles.Anonymous);
                    }
                    const uIndex = users.findIndex(function(x) { return x.username === username; });
                    if (uIndex < 0) {  
                        // Check this TODO
                        return opcua.makeRoles("AuthenticatedUser"); // opcua.WellKnownRoles.Anonymous; // by default were guest! ( i.e anonymous), read-only access 
                    }
                    let userRoles;
                    if (users[uIndex].hasOwnProperty("roles")) {
                        userRoles = users[uIndex].roles; // user can have multiple roles Observer;Engineer
                    }
                    else {
                        console.error("Your users.json is missing roles field for user role! Using Anonymous as default role.");
                        return opcua.makeRoles(opcua.WellKnownRoles.Anonymous); // By default use Anonymous
                    }
                    return opcua.makeRoles(userRoles);
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
                return opcua.DataType.String;
            }
            if (methodArgType === "Byte") {
                return opcua.DataType.Byte;
            }
            if (methodArgType === "SByte") {
                return opcua.DataType.SByte;
            }
            if (methodArgType === "UInt16") {
                return opcua.DataType.UInt32;
            }
            if (methodArgType === "UInt32") {
                return opcua.DataType.UInt32;
            }
            if (methodArgType === "UInt64") {
                return opcua.DataType.UInt64;
            }
            if (methodArgType === "Int16") {
                return opcua.DataType.Int32;
            }
            if (methodArgType === "Int32") {
                return opcua.DataType.Int32;
            }
            if (methodArgType === "Double") {
                return opcua.DataType.Double;
            }
            if (methodArgType === "Float") {
                return opcua.DataType.Float;
            }
            node.error("Cannot convert given argument: " + methodArgType + " to OPC UA DataType!");
        }

        node.status({
            fill: "red",
            shape: "ring",
            text: "Not running"
        });

        var xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml'),     // Standard & basic types
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
                };
            });
        }
        verbose_log(chalk.yellow("NodeSet: ") + chalk.cyan(xmlFiles.toString()));
        let serverPort = parseInt(n.port);
        if (process.env.SERVER_PORT) {
            serverPort = parseInt(process.env.SERVER_PORT);
        }
        async function initNewServer() {
            initialized = false;
            verbose_log(chalk.yellow("Create Server from XML..."));
            // DO NOT USE "%FQDN%" anymore, hostname is OK
            const applicationUri =  opcua.makeApplicationUrn(os.hostname(), "node-red-contrib-opcua-server");
            verbose_log(chalk.yellow("ApplicationUrn: ") + chalk.cyan(applicationUri));
            verbose_log(chalk.yellow("Server certificate manager"));
            const serverCertificateManager = createServerCertificateManager();
            verbose_log(chalk.yellow("User Certificate manager"));
            const userCertificateManager = createUserCertificateManager();
            verbose_log(chalk.yellow("Initializing certificate managers"));
            await serverCertificateManager.initialize();
            await userCertificateManager.initialize();
            verbose_log(chalk.green("Certificate managers initialized"));
            var registerMethod = null;
            if (node.registerToDiscovery === true) {
                registerMethod = opcua.RegisterServerMethod.LDS;
            }
            node.server_options = {
                serverCertificateManager,
                userCertificateManager,
                securityPolicies: policies,
                securityModes: modes,
                allowAnonymous: n.allowAnonymous,
                port: serverPort,
                resourcePath: "/" + node.endpoint, // Option was missing / can be 
                // maxAllowedSessionNumber: 1000,
                maxConnectionsPerEndpoint: maxConnectionsPerEndpoint,
                maxMessageSize: maxMessageSize,
                maxBufferSize: maxBufferSize,
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
                    buildDate: ""
                },
                serverCapabilities: {
                  maxBrowseContinuationPoints: 10,
                  maxHistoryContinuationPoints: 10,
                  maxSessions: node.maxSessions,
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
            
            node.server_options.buildInfo = {
                buildNumber: "0.2.343",
                buildDate: "2025-10-31T11:22:00"
            };
            
            var hostname = os.hostname();
            var discovery_server_endpointUrl = "opc.tcp://" + hostname + ":4840"; // /UADiscovery"; // Do not use resource path
            if (node.registerToDiscovery === true) {
                verbose_log("Registering server to :" + discovery_server_endpointUrl);
            }
        }

        function construct_my_address_space(addressSpace) {
            verbose_log(chalk.yellow("Server: add VendorName ..."));
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

            verbose_log(chalk.yellow('Server: add MyVariable2 ...'));
            var variable2 = 10.0;
            try {
                myVar2 = new opcua.Variant({dataType: opcua.DataType.Double, value: variable2});
                addressSpace.getOwnNamespace().addVariable({
                    componentOf: vendorName,
                    nodeId: "ns=1;s=MyVariable2",
                    browseName: "MyVariable2",
                    dataType: "Double",
                    minimumSamplingInterval: 500,
                    value: new opcua.Variant({ dataType: opcua.DataType.Double, value: variable2 })
                    /*
                    {
                        get: () => {
                            // return myVar2;
                            return new opcua.Variant({ dataType: opcua.DataType.Double, value: variable2 });
                        },
                        set: function (variant) {
                            myVar2.value = parseFloat(variant.value);
                            return opcua.StatusCodes.Good;
                        }
                    }
                    */
                });
            }
            catch(error) {
                node_error("Cannot add variable; MyVariable2, error: " + error);
            }
            verbose_log(chalk.yellow('Server: add FreeMemory ...'));
            try {
                freeMem = new opcua.Variant({
                    dataType: opcua.DataType.Double,
                    value: available_memory()
                });
                node.freeMem = addressSpace.getOwnNamespace().addVariable({
                    componentOf: vendorName,
                    nodeId: "ns=1;s=FreeMemory",
                    browseName: "FreeMemory",
                    dataType: "Double",
                    minimumSamplingInterval: 500,
                    value: new opcua.Variant({
                                dataType: opcua.DataType.Double,
                                value: available_memory()
                    })
                    /*
                    {
                        get: function () {
                            freeMem.value = available_memory();
                            // return freeMem;
                            return new opcua.Variant({
                                dataType: opcua.DataType.Double,
                                value: available_memory()
                            });
                        }
                    }
                    */
                });
            }
            catch (error) {
                node_error("Cannot add variable; freeMem, error: " + error)
            }
            verbose_log(chalk.yellow('Server: add Counter ...'));
            try {
                node.vendorName = addressSpace.getOwnNamespace().addVariable({
                    componentOf: vendorName,
                    nodeId: "ns=1;s=Counter",
                    browseName: "Variables Counter",
                    displayName: "Variables Counter",
                    dataType: "UInt16",
                    minimumSamplingInterval: 500,
                    value:  new opcua.Variant({
                                dataType: opcua.DataType.UInt16,
                                value: Object.keys(variables).length // Counter will show amount of created variables
                    })
                    /*
                    {
                        get: function () {
                            return new opcua.Variant({
                                dataType: opcua.DataType.UInt16,
                                value: Object.keys(variables).length // Counter will show amount of created variables
                            });
                        }
                    }
                    */
                });
            }
            catch (error) {
                node_error("Cannot add variable; Counter, error: " + error);
            }
             
            var method = addressSpace.getOwnNamespace().addMethod(
                vendorName, {
                    browseName: "Bark",

                    inputArguments: [{
                        name: "nbBarks",
                        description: {
                            text: "specifies the number of time I should bark"
                        },
                        dataType: opcua.DataType.UInt32
                    }, {
                        name: "volume",
                        description: {
                            text: "specifies the sound volume [0 = quiet ,100 = loud]"
                        },
                        dataType: opcua.DataType.UInt32
                    }],

                    outputArguments: [{
                        name: "Barks",
                        description: {
                            text: "the generated barks"
                        },
                        dataType: opcua.DataType.String,
                        valueRank: 1
                    }]
                });

            method.bindMethod(function (inputArguments, context, callback) {

                var nbBarks = inputArguments[0].value;
                var volume = inputArguments[1].value;

                verbose_log("Hello World ! I will bark ", nbBarks, " times");
                verbose_log("the requested volume is ", volume, "");
                var sound_volume = new Array(volume).join("!");

                var barks = [];
                for (var i = 0; i < nbBarks; i++) {
                    barks.push("Whaff" + sound_volume);
                }

                var callMethodResult = {
                    statusCode: opcua.StatusCodes.Good,
                    outputArguments: [{
                        dataType: opcua.DataType.String,
                        arrayType: opcua.VariantArrayType.Array,
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
                node.server = new opcua.OPCUAServer(node.server_options);

                await node.server.initialize();
                if (node.constructDefaultAddressSpace === true) {
                    construct_my_address_space(node.server.engine.addressSpace);
                }
                await node.server.start();

                verbose_log(chalk.yellow("Using server certificate    ") + chalk.cyan(node.server.certificateFile));
                verbose_log(chalk.yellow("Using PKI folder            ") + chalk.cyan(node.server.serverCertificateManager.rootDir));
                verbose_log(chalk.yellow("Using UserPKI folder        ") + chalk.cyan(node.server.userCertificateManager.rootDir));
                verbose_log(chalk.yellow("Trusted certificate folder  ") + chalk.cyan(node.server.serverCertificateManager.trustedFolder));
                verbose_log(chalk.yellow("Rejected certificate folder ") + chalk.cyan(node.server.serverCertificateManager.rejectedFolder));

                // Needed for Alarms and Conditions
                node.server.engine.addressSpace.installAlarmsAndConditionsService();
                opcua.addAggregateSupport(node.server.engine.addressSpace);
                // Client connects with userName
                node.server.on("session_activated", (session) => {
                   if (session.userIdentityToken && session.userIdentityToken.userName) {
                       var msg = {};
                       msg.topic="Username";
                       msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                       node.send(msg);
                   }
                });
                // Client connected
                node.server.on("create_session", function(session) {
                   var msg = {};
                   msg.topic="Client-connected";
                   msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                   node.send(msg);
                });
                // Client disconnected
                node.server.on("session_closed", function(session, reason) {
                    node.debug(chalk.yellow("Reason: ") + chalk.cyan(reason));
                    var msg = {};
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
                var msg = {};
                msg.error = {};
                msg.error.message = "Disconnect error: " + err;
                msg.error.source = this;
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
            var payload = msg.payload;
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
                var addressSpace = node.server.engine.addressSpace; // node.addressSpace;
                if (addressSpace === undefined || addressSpace === null) {
                    node_error("addressSpace undefined");
                    return false;
                }

                if (node.constructDefaultAddressSpace === true) {
                    var rootFolder = addressSpace.findNode("ns=1;s=VendorName");
                    if (!rootFolder) {
                        node_error("VerdorName not found!");
                        return false;
                    }
                    var references = rootFolder.findReferences("Organizes", true);

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
            return payload.hasOwnProperty('messageType');
        }
        function contains_namespace(payload) {
            if (!payload.hasOwnProperty('namespace'))
                node.warn("Mandatory parameter 'namespace' is missing")
            return payload.hasOwnProperty('namespace');
        }
         
        function contains_variableName(payload) {
            if (!payload.hasOwnProperty('variableName'))
                node.warn("Mandatory parameter 'variableName' missing");
            return payload.hasOwnProperty('variableName');
        }
         
        function contains_variableValue(payload) {
            if (!payload.hasOwnProperty('variableValue'))
                node.warn("Optional parameter 'variableValue' missing")
            return payload.hasOwnProperty('variableValue'); 
        }

        function contains_necessaryProperties(msg) {
            if (contains_messageType(msg.payload)) {
                return(contains_namespace(msg.payload) && 
                       contains_variableName(msg.payload) && 
                       contains_variableValue(msg.payload));
            }
            else {
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
                    var ns = payload.namespace.toString();
                    const variableId = `${ns}:${payload.variableName}`

                    verbose_log("BEFORE: " + ns + ":" + payload.variableName + " value: " + JSON.stringify(variables[variableId]));
                    var value = payload.variableValue;
                    if (payload.variableValue === "true" || payload.variableValue === true || payload.variableValue === 1) {
                        value = true;
                    }
                    if (payload.variableValue === "false" || payload.variableValue === false || payload.variableValue === 0) {
                        value = false;
                    }
                    variables[variableId] = value;
                    // update server variable value if needed now variables[variableId]=value used
                    
                    var addressSpace = node.server.engine.addressSpace;
                    // var vnode = addressSpace.findNode("ns="+ns+";s="+ payload.variableName);
                    if(typeof(payload.variableName) === 'number') {
                        verbose_log("findNode(ns="+ns+";i="+payload.variableName);
                        var vnode = addressSpace.findNode("ns="+ns+";i="+payload.variableName);
                        if(vnode === null) {
                            verbose_warn("vnode is null, findNode did not succeeded");
                        }
                    } 
                    else { 
                        // if( typeof(payload.variableName)==='string')
                        // this must be string - a plain variable name
                        // TODO opaque
                        verbose_log("findNode ns="+ns+";s="+payload.variableName);
                        var vnode = addressSpace.findNode("ns="+ns+";s="+payload.variableName);
                    }
                    if (vnode) {
                        verbose_log("Found variable, nodeId: " + vnode.nodeId);

                        variables[variableId] = opcuaBasics.build_new_value_by_datatype(payload.datatype, payload.variableValue);
                        // var newValue = opcuaBasics.build_new_variant(payload.datatype, payload.variableValue);
                        var newValue = opcuaBasics.build_new_dataValue(payload.datatype, payload.variableValue);
                        vnode.setValueFromSource(newValue); // This fixes if variable if not bound eq. bindVariables is not called
                        if (payload.quality && payload.sourceTimestamp) {
                            // var statusCode = opcua.StatusCodes.BadDeviceFailure;
                            // var statusCode = opcua.StatusCodes.BadDataLost;
                            // Bad 0x80000000
                            if(typeof(payload.quality)==='string') { 
                                // a name of Quality was given -> convert it to number
                                verbose_log("Getting numeric status code of quality: " + payload.quality);
                                payload.quality = opcua.StatusCodes[payload.quality].value;
                                
                            }
                            // else // typeof(payload.quality)==='number', e.g. 2161770496
                            var statusCode = opcua.StatusCode.makeStatusCode(payload.quality);
                            verbose_log("StatusCode from value: " + payload.quality + " (0x" + payload.quality.toString(16) + ") description: " + statusCode.description);
                            var ts = new Date(payload.sourceTimestamp);
                            verbose_log("Timestamp: " + ts.toISOString());
                            verbose_log("Set variable, newValue:" + JSON.stringify(newValue) + " statusCode: " + statusCode.description + " sourceTimestamp: " + ts);
                            vnode.setValueFromSource(newValue, statusCode, ts);
                            // Dummy & quick fix for statusCode & timeStamp, look timestamped_get
                            variablesStatus[variableId] = statusCode;
                            variablesTs[variableId] = ts;
                            // console.log("Statuscode & sourceTimestamp, vnode: " + JSON.stringify(vnode));
                            var session = new opcua.PseudoSession(addressSpace);
                            const nodesToWrite = [
                                {
                                    nodeId: vnode.nodeId,
                                    attributeId: opcua.AttributeIds.Value,
                                    value: new opcua.DataValue(
                                    {
                                        value: newValue,
                                        statusCode: statusCode,
                                        sourceTimestamp: ts
                                    })
                                }
                            ];
                            // verbose_log("Write: " + JSON.stringify(nodesToWrite));
                            session.write(nodesToWrite, function (err, statusCodes) {
                                if (err) {
                                    node.error("Write error: " + err);
                                }
                                else {
                                    // verbose_log("Write succeeded, statusCode: " + JSON.stringify(statusCodes));
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
            return payload.hasOwnProperty('opcuaCommand');
        }

        function execute_opcua_command(msg) {
            var payload = msg.payload;
            var addressSpace = node.server.engine.addressSpace;
            var name;
            var returnValue = "";

            switch (payload.opcuaCommand) {

                case "restartOPCUAServer":
                    restart_server();
                    break;

                case "addEquipment":
                    verbose_log(chalk.cyan("Adding node: ".concat(payload.nodeName)));
                    equipmentCounter++;
                    name = payload.nodeName.concat(equipmentCounter);

                    addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(equipment.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "addPhysicalAsset":
                    verbose_log(chalk.cyan("Adding node: ".concat(payload.nodeName)));
                    physicalAssetCounter++;
                    name = payload.nodeName.concat(physicalAssetCounter);

                    addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(physicalAssets.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "setFolder":
                    verbose_log(chalk.cyan("Set Folder: ".concat(msg.topic))); // Example topic format ns=4;s=FolderName
                    folder = addressSpace.findNode(msg.topic);
                    if (folder) {
                        verbose_log(chalk.yellow("Found folder: ") + chalk.cyan(folder));
                    }
                    else {
                        verbose_warn(chalk.red("Folder not found for topic: ") + chalk.cyan(msg.topic));
                    }
                    break;

                case "addFolder":
                    var nodeId = msg.topic;
                    var description = "";
                    var d = msg.topic.indexOf("description=");
                    if (d > 0) {
                        nodeId = nodeId.substring(0, d - 1); // format is msg.topic="ns=1;s=TEST;description=MyTestFolder"
                        description = msg.topic.substring(d + 12);
                        if (description.indexOf(";") >= 0) {
                            description = description.substring(0, description.indexOf(";"));
                        }
                    }
                    var browseName = "";
                    var d = msg.topic.indexOf("browseName=");
                    if (d > 0) {
                        nodeId = msg.topic.substring(0, d - 1); 
                        // format is msg.topic="ns=1;s=Main.Test;browseName=Test"
                        browseName = msg.topic.substring(d + 11);
                        if (browseName.indexOf(";") >= 0) {
                            browseName = browseName.substring(0, browseName.indexOf(";"));
                            verbose_log("Folder browseName: " + browseName);
                        }
                    }                    
                    verbose_log("Adding Folder: ".concat(nodeId)); // Example topic format ns=4;s=FolderName
                    var parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                    if (folder) {
                        parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                    }
                    // Check & add from msg accessLevel userAccessLevel, role & permissions
                    var accessLevel = opcua.makeAccessLevelFlag("CurrentRead|CurrentWrite"); // Use as default
                    var userAccessLevel = opcua.makeAccessLevelFlag("CurrentRead|CurrentWrite"); // Use as default
                    if (msg.accessLevel) {
                        accessLevel = msg.accessLevel;
                    }
                    if (msg.userAccessLevel) {
                        userAccessLevel = msg.userAccessLevel;
                    }
                    // permissions collected from multiple opcua-rights
                    let permissions = [
                        { roleId: opcua.WellKnownRoles.Anonymous, permissions: opcua.allPermissions },
                        { roleId: opcua.WellKnownRoles.AuthenticatedUser, permissions: opcua.allPermissions },
                        ];
                    if (msg.permissions) {
                        permissions = msg.permissions;
                    }
                    
                    // Own namespace
                    if (nodeId.indexOf("ns=1;") >= 0) {
                        parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                        if (folder) {
                            parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                        }
                        if (browseName.length === 0) {
                            browseName = nodeId.substring(7);
                        }
                        console.log("### nodeId: " + nodeId + " parent: " + parentFolder.nodeId + " description: '" + description + "' browseName: '" + browseName + "'");
                        folder = addressSpace.getOwnNamespace().addObject({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: nodeId, // msg.topic,
                            description: description || "",
                            accessLevel: accessLevel, // TEST more
                            userAccessLevel: userAccessLevel, // TEST more
                            rolePermissions: [].concat(permissions),
                            accessRestrictions: opcua.AccessRestrictionsFlag.None, // TODO from msg
                            browseName: browseName // || nodeId.substring(7) // browseName cannot be empty
                        });
                    }
                    else {
                        verbose_log("Topic: " + nodeId + " index: " + nodeId.substring(3));
                        const index = parseInt(nodeId.substring(3));
                        verbose_log("ns index: " + index);
                        const uri = addressSpace.getNamespaceUri(index);
                        verbose_log("ns uri: " + uri);
                        const ns = addressSpace.getNamespace(uri); // Or index
                        var name = nodeId; // msg.topic;
                        var browseName = name; // Use full name by default
                        // NodeId can be string or integer or Guid or Opaque: ns=10;i=1000 or ns=5;g=
                        var bIndex = name.indexOf(";s="); // String
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
                        folder = ns.addObject({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: nodeId, // msg.topic,
                            description: description,
                            accessLevel: accessLevel, // TEST more
                            userAccessLevel: userAccessLevel, // TEST more
                            rolePermissions: [].concat(permissions),
                            accessRestrictions: opcua.AccessRestrictionsFlag.None, // TODO from msg
                            browseName: browseName // msg.topic.substring(msg.topic.indexOf(";s=")+3)
                        })
                    }
                    break;

                case "addVariable":
                    verbose_log("Adding node: ".concat(msg.topic)); // Example topic format ns=4;s=VariableName;datatype=Double
                    var datatype = "";
                    var description = "";
                    var displayName = "";
                    var browseNameTopic = "";
                    var opcuaDataType = null;
                    var e = msg.topic.indexOf("datatype=");
                    if (e<0) {
                        node_error("no datatype=Float or other type in addVariable ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    }
                    var parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                    if (folder != null) {
                        parentFolder = folder; // Use previous folder as parent or setFolder() can be use to set parent
                    }
                    var d = msg.topic.indexOf("description=");
                    if (d > 0) {
                        description = msg.topic.substring(d + 12);
                        if (description.indexOf(";") >= 0) {
                            description = description.substring(0, description.indexOf(";"));
                        }
                    }
                    var d = msg.topic.indexOf("browseName=");
                    if (d > 0) {
                        browseNameTopic = msg.topic.substring(d + 11);
                        if (browseNameTopic.indexOf(";") >= 0) {
                            browseNameTopic = browseNameTopic.substring(0, browseNameTopic.indexOf(";"));
                        }
                    }
                    const dn = msg.topic.indexOf("displayName=");
                    if (dn > 0) {
                      displayName = msg.topic.substring(dn + 12);
                      // console.log(displayName);
                      if (displayName.indexOf(";") >= 0) {
                        displayName = displayName.substring(0, displayName.indexOf(";"));
                      }
                    }
                    if (e > 0) {
                        name = msg.topic.substring(0, e - 1);
                        datatype = msg.topic.substring(e + 9);
                        // ExtentionObject contains extra info like typeId
                        if (datatype.indexOf(";") >= 0) {
                            datatype = datatype.substring(0, datatype.indexOf(";"));
                        }
                        var arrayType = opcua.VariantArrayType.Scalar;
                        var arr = datatype.indexOf("Array");
                        var dim1 = 0;        // Fix for the scalars
                        var dim2 = 0;        // Matrix
                        var dim3 = 0;        // Cube
                        var indexStr = "";
                        var valueRank = -1;     // Fix for the scalars
                        if (arr > 0) {
                            arrayType = opcua.VariantArrayType.Array;
                            dim1 = datatype.substring(arr+6);
                            indexStr = dim1.substring(0, dim1.length-1);
                            dim1 = parseInt(dim1.substring(0, dim1.length-1));
                            valueRank = 1; // 1-dim Array
                            datatype = datatype.substring(0, arr);
                            // valueRank = 2; // 2-dim Matrix FloatArray[5,5]
                            // valueRank = 3; // 3-dim Matrix FloatArray[5,5,5]
                            var indexes = indexStr.split(",");
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
                        
                        var namespace = addressSpace.getOwnNamespace(); // Default
                        var nsindex=1;
                        if (msg.topic.indexOf("ns=1;") !== 0) {
                            var allNamespaces = addressSpace.getNamespaceArray();
                            // console.log("ALL ns: " + stringify(allNamespaces));
                            // Select namespace by index
                            nsindex = parseInt(msg.topic.substring(3));
                            namespace = allNamespaces[nsindex];
                        }

                        var ns = nsindex.toString();
                        var dimensions = valueRank <= 0 ? null : [dim1]; // Fix for conformance check TODO dim2, dim3
                        var browseName = name; // Use full name by default

                        // NodeId can be string or integer or Guid or Opaque: ns=10;i=1000 or ns=5;g=
                        var bIndex = name.indexOf(";s="); // String
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

                        const variableId = `${ns}:${browseName}`;

                        verbose_log(chalk.cyan(`addVariable: variableId: ${variableId}`));

                        variables[variableId] = 0;
                        if (valueRank == 1) {
                            arrayType = opcua.VariantArrayType.Array;
                            dimensions = [dim1];
                            variables[variableId] = new Float32Array(dim1); 
                            for (var i=0; i<dim1; i++) {
                                variables[variableId][i] = 0;
                            }
                        }
                        if (valueRank == 2) {
                            arrayType = opcua.VariantArrayType.Matrix;
                            dimensions = [dim1, dim2];
                            variables[variableId] = new Float32Array(dim1*dim2); 
                            for (var i=0; i<dim1*dim2; i++) {
                                variables[variableId][i] = 0;
                            }
                        }
                        if (valueRank == 3) {
                            arrayType = opcua.VariantArrayType.Matrix; // Actually no Cube => Matrix with 3 dims
                            dimensions = [dim1, dim2, dim3];
                            variables[variableId] = new Float32Array(dim1*dim2*dim3); 
                            for (var i=0; i<dim1*dim2*dim3; i++) {
                                variables[variableId][i] = 0;
                            }
                        }

                        if (datatype == "Int32") {
                            opcuaDataType = opcua.DataType.Int32;
                        }
                        if (datatype == "Int16") {
                            opcuaDataType = opcua.DataType.Int16;
                        }
                        if (datatype == "UInt32") {
                            opcuaDataType = opcua.DataType.UInt32;
                        }
                        if (datatype == "UInt64") {
                            opcuaDataType = opcua.DataType.UInt64;
                        }
                        if (datatype == "UInt16") {
                            opcuaDataType = opcua.DataType.UInt16;
                        }
                        if (datatype == "Double") {
                            opcuaDataType = opcua.DataType.Double;
                        }
                        if (datatype == "Float") {
                            opcuaDataType = opcua.DataType.Float;
                        }
                        if (datatype == "Byte") {
                            opcuaDataType = opcua.DataType.Byte;
                        }
                        if (datatype == "SByte") {
                            opcuaDataType = opcua.DataType.SByte;
                        }
                        if (datatype == "DateTime") {
                            opcuaDataType = opcua.DataType.DateTime;
                            variables[variableId] = new Date(); 
                        }
                        if (datatype == "ExtensionObject") {
                            opcuaDataType = opcua.DataType.ExtensionObject;
                            variables[variableId] = {}; 
                        }
                        if (datatype == "ByteString") {
                            opcuaDataType = opcua.DataType.ByteString;
                            variables[variableId] = Buffer.from(""); 
                        }
                        if (datatype == "String") {
                            opcuaDataType = opcua.DataType.String;
                            variables[variableId] = ""; 
                        }
                        if (datatype == "Boolean") {
                            opcuaDataType = opcua.DataType.Boolean;
                            variables[variableId] = false; 
                        }
                        if (opcuaDataType === null) {
                            verbose_warn(chalk.red("Cannot addVariable, datatype: ") + chalk.cyan(datatype) + chalk.red(" is not valid OPC UA datatype!"));
                            break;
                        }
                        verbose_log("Datatype: " + datatype);
                        verbose_log("OPC UA type id: "+ opcuaDataType.toString() + " dims[" + dim1 + "," + dim2 +"," + dim3 +"] == " + dimensions);
                        // Initial value for server variable
                        var init = msg.topic.indexOf("value=");
                        if (init > 0) {
                            var initialValue = msg.topic.substring(init+6);
                            verbose_log("BrowseName: " + ns + ":" + browseName + " initial value: " + initialValue);
                            variables[variableId] = opcuaBasics.build_new_value_by_datatype(datatype, initialValue);
                        }

                        
                        if (datatype === "ExtensionObject") {
                            var typeId = msg.topic.substring(msg.topic.indexOf("typeId=") + 7);
                            verbose_log("ExtensionObject typeId: " + typeId);
                            var DataTypeNode = addressSpace.findDataType(opcua.coerceNodeId(typeId));
                            var extVar = addressSpace.constructExtensionObject(DataTypeNode, {}); // build default value for extension object
                            verbose_log("Server returned: " + JSON.stringify(extVar));
                            var extNode = namespace.addVariable({
                                organizedBy: addressSpace.findNode(parentFolder.nodeId),
                                nodeId: name,
                                browseName: browseNameTopic || browseName,
                                description: description,
                                displayName: displayName || browseNameTopic || browseName,
                                dataType: opcua.coerceNodeId(typeId), // "ExtensionObject", // "StructureDefinition", // typeId,
                                minimumSamplingInterval: 500,
                                valueRank,
                                value: { dataType: opcua.DataType.ExtensionObject, value: extVar },
                                // value: { dataType: DataType.StructureDefinition, value: extVar },
                            });
                            var newext = { "payload" : { "messageType" : "Variable", "variableName": browseName, "nodeId": extNode.nodeId.toString() }};
                            node.send(newext);
                            // TODO get/set functions and other tricks as with normal scalar
                            return opcua.StatusCodes.Good;
                        }
                        // Check & add from msg accessLevel userAccessLevel, role & permissions
                        var accessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite"); // Use as default
                        var userAccessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite"); // Use as default
                        if (msg.accessLevel) {
                            accessLevel = msg.accessLevel;
                        }
                        if (msg.userAccessLevel) {
                            userAccessLevel = msg.userAccessLevel;
                        }    
                        // permissions collected from multiple opcua-rights
                        let permissions = [
                            { roleId: opcua.WellKnownRoles.Anonymous, permissions: opcua.allPermissions },
                            { roleId: opcua.WellKnownRoles.AuthenticatedUser, permissions: opcua.allPermissions },
                            ];
                        if (msg.permissions) {
                            permissions = msg.permissions;
                        }
                        verbose_log(chalk.yellow("Using access level: ") + chalk.cyan(accessLevel) + chalk.yellow(" user access level: ") + chalk.cyan(userAccessLevel) + chalk.yellow(" permissions: ") + chalk.cyan(JSON.stringify(permissions)));
                        var newVAR = namespace.addVariable({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: name,
                            accessLevel: accessLevel,
                            userAccessLevel: userAccessLevel,
                            rolePermissions: [].concat(permissions),
                            accessRestrictions: opcua.AccessRestrictionsFlag.None, // TODO from msg
                            browseName: browseNameTopic || browseName, // or displayName
                            description: description,
                            displayName: displayName || browseNameTopic || browseName,
                            dataType: datatype, // opcuaDataType,
                            minimumSamplingInterval: 500,
                            valueRank,
                            arrayDimensions: dimensions,
                            value: {
                                timestamped_get: function() {
                                    var ts = new Date();
                                    if (variablesTs[variableId]) {
                                        ts = variablesTs[variableId];
                                    }
                                    var st = opcua.StatusCodes.Good;
                                    if (variablesStatus[variableId]) {
                                        st = variablesStatus[variableId];
                                    }
                                    let value;
                                    if (valueRank>=2) {
                                        value = new opcua.Variant({
                                            arrayType,
                                            dimensions,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    }
                                    else {
                                        value = new opcua.Variant({
                                            arrayType,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    } 

                                    const myDataValue = new opcua.DataValue({
                                            serverPicoseconds: 0,
                                            serverTimestamp: new Date(),
                                            sourcePicoseconds: 0,
                                            sourceTimestamp: ts,
                                            statusCode: st,
                                            value: value // new opcua.Variant({arrayType, dataType: opcuaDataType, value: variables[variableId]})
                                    });
                                    return myDataValue;
                                },
                                /*
                                get: function () {
                                    if (valueRank>=2) {
                                        return new opcua.Variant({
                                            arrayType,
                                            dimensions,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    }
                                    else {
                                        return new opcua.Variant({
                                            arrayType,
                                            dataType: opcuaDataType,
                                            value: variables[variableId]
                                        });
                                    } 
                                },
                                */
                                set: function (variant) {
                                    verbose_log(chalk.yellow("Server set new variable value : ") + chalk.cyan(variables[variableId]) + chalk.yellow(" browseName: ") + chalk.cyan(ns) + ":" + chalk.cyan(browseName) + chalk.yellow(" new: ") + chalk.cyan(stringify(variant)));
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
                                        variables[variableId] = opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value);
                                    // }
                                    // variables[variableId] = Object.assign(variables[variableId], opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value));
                                    verbose_log(chalk.yellow("Server variable: ") + chalk.cyan(variables[variableId]) + chalk.yellow(" browseName: ") + chalk.cyan(ns) + ":" + chalk.cyan(browseName));
                                    var SetMsg = { "payload" : { "messageType" : "Variable", "variableName": ns + ":" + browseName, "variableValue": variables[variableId] }};
                                    verbose_log(chalk.yellow("msg Payload: ") + chalk.cyan(JSON.stringify(SetMsg)));
                                    node.send(SetMsg);
                                    return opcua.StatusCodes.Good;
                                }
                            }
                        });
                  
                        var newvar = { "payload" : { "messageType" : "Variable", "variableName": ns + ":" + browseName, "nodeId": newVAR.nodeId.toString() }};
                        node.send(newvar);

                    }
                    break;

                case "installHistorian":
                        verbose_log("Install historian for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                        var datatype = "";
                        var opcuaDataType = null;
                        var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        var e = msg.topic.indexOf("datatype=");
                        if (e<0) {
                            node_error("no datatype=Float or other type in install historian ".concat(msg.topic)); // Example topic format ns=1;s=variable
                        }
                        var nodeId = addressSpace.findNode(nodeStr);
                        if (nodeId) {
                          addressSpace.installHistoricalDataNode(nodeId); // no options, use memory as storage
                        }
                        else {
                            node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
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
                        parentNode, {
                            // nodeId: "ns=1;s=" + msg.browseName, // Issue #654
                            nodeId: msg.topic.substring(0, msg.topic.indexOf(";s=")) + ";s=" + msg.browseName,
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
                        const status = opcua.StatusCodes.BadNotImplemented; // Current implementation does not support as setServerConfiguration is void and no return array
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

                    var searchedNode = addressSpace.findNode(payload.nodeId);
                    if (searchedNode === undefined) {
                        verbose_warn("Cannot find node: " + payload.nodeId + " from addressSpace")
                    } else {
                        addressSpace.deleteNode(searchedNode);
                    }
                    break;

                case "registerNamespace":
                    var ns = addressSpace.registerNamespace(msg.topic);
                    // verbose_log("namespace: " + stringify(ns));
                    var index = addressSpace.getNamespaceIndex(msg.topic);
                    returnValue = "ns=" + index.toString();
                    break;
                
                case "getNamespaceIndex":
                    returnValue = "ns=" + addressSpace.getNamespaceIndex(msg.topic);
                    break;

                case "getNamespaces":
                    returnValue = addressSpace.getNamespaceArray().reduce((dict, namespace, index) => (dict[namespace.namespaceUri] = index, dict), {});
                    break;

                case "setUsers":
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
                    var alarmText = msg.alarmText;
                    var priority = msg.priority;
                    var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                    var nodeId = addressSpace.findNode(nodeStr);
                    // var boolVar = false;
                    if (nodeId) {
                        var namespace = addressSpace.getOwnNamespace(); // Default
                        var alarmState = namespace.addVariable({
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
                                    return new opcua.Variant({
                                        dataType: "Boolean",
                                        value: boolVar
                                    });
                                },
                                set: function (variant) {
                                    boolVar = variant.value;
                                    return opcua.StatusCodes.Good;
                                }
                            }
                            */
                        });
                        alarmState.setValueFromSource({dataType: "Boolean", value: false});
                        var discreteAlarm = addressSpace.findEventType("DiscreteAlarmType");
                        var alarm = namespace.instantiateDiscreteAlarm(discreteAlarm,
                            {
                                nodeId: nodeStr + "-" + "DiscreteAlarm",
                                browseName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                displayName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                organizedBy: nodeId,
                                conditionSource: alarmState,
                                severity: priority,
                                conditionName: "Node-Red OPC UA Event",
                                browseName: "DiscreteAlarmInstance",
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
                        catch(error) {
                            node.error("Error: " + error.toString());
                        }
                    }
                    else {
                        node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
                    }
                    break;    

                case "installLimitAlarm":
                        verbose_log("install limit alarm for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                        var highhighLimit = msg.hh;
                        var highLimit = msg.h;
                        var lowLimit = msg.l;
                        var lowlowLimit = msg.ll;
                        var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        var nodeId = addressSpace.findNode(nodeStr);
                        var levelVar = 5.0;
                        if (nodeId) {
                            var namespace = addressSpace.getOwnNamespace(); // Default
                            
                            var alarmState = namespace.addVariable({
                                nodeId: nodeStr + "-" + "LimitState",
                                browseName: nodeStr.substring(7) + "-" + "LimitState",
                                displayName: nodeStr.substring(7) + "-" + "LimitState",
                                propertyOf: nodeId,
                                dataType: "Double",
                                minimumSamplingInterval: 500,
                                eventSourceOf: "i=2253", // nodeId, // Use server!
                                inputNode: msg.topic,
                                value: {
                                    get: function () {
                                        return new opcua.Variant({
                                            dataType: "Double",
                                            value: levelVar
                                        });
                                    },
                                    set: function (variant) {
                                        levelVar = variant.value;
                                        return opcua.StatusCodes.Good;
                                    }
                                }
                            });
                            alarmState.setValueFromSource({datatype: "Double", value: 5.0});
                            var alarm = namespace.instantiateNonExclusiveLimitAlarm("NonExclusiveLimitAlarmType",
                                {
                                    nodeId: nodeStr + "-" + "LimitAlarm",
                                    browseName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    displayName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    organizedBy: nodeId,
                                    conditionSource: alarmState,
                                    conditionName: "Node-Red OPC UA Event",
                                    eventSourceOf: "i=2253", // nodeId, // Use server!
                                    minimumSamplingInterval: 500,
                                    browseName: "LimitAlarmInstance",
                                    inputNode: alarmState,   // the variable that will be monitored for change, generate below
                                    highHighLimit: highhighLimit,
                                    highLimit: highLimit,
                                    lowLimit: lowLimit,
                                    lowLowLimit: lowlowLimit,
                                    severity: priority,
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
                                    // console.log("NEW ALARM LIMIT VALUE: " + newDataValue.value.value + " message: " + msg.alarmText);
                                    // This is not working anymore for some reason???
                                    alarm.activeState.setValue(true);
                                    alarm.ackedState.setValue(false);
                                    alarm.raiseNewCondition({severity: priority, 
                                                             message: msg.alarmText + " " + newDataValue.value.value,
                                                             retain: true});
                                });
                            }
                            catch(error) {
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
                        if (msg.topic && msg.payload && msg.payload.fileName) {
                            var file_node;
                            file_node = opcua.coerceNodeId(msg.topic);
                            var fileName = msg.payload.fileName;
                            verbose_log("New file nodeId:" + file_node + " fileName: " + fileName);
                            const fileType = addressSpace.findObjectType("FileType");
                            if (folder) {
                                parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                            }
                            var parentId = addressSpace.findNode(parentFolder.nodeId)
                            if (!parentId) {
                                parentId = addressSpace.rootFolder.objects; // Use this as exists always
                            }
                            var index = fileName.lastIndexOf("/");
                            var fname = fileName;
                            // Hide path from the filename
                            if (index > 0) {
                                fname = fileName.substring(index+1); // Skip / charater to get just filename
                            }
                            const newFile = fileType.instantiate({
                                nodeId: file_node,
                                browseName: fname,
                                displayName: fname,
                                organizedBy: parentId
                            });
                            fileTransfer.installFileType(newFile, { filename: fileName });
                            // Make file writable, can be one extra parameter later inside msg object
                            const Wnode = addressSpace.findNode(file_node.toString() + "-Writable");
                            Wnode.setValueFromSource({ dataType: "Boolean", value: true});
                            const userWnode = addressSpace.findNode(file_node.toString() + "-UserWritable");
                            userWnode.setValueFromSource({ dataType: "Boolean", value: true});
                        }
                        else {
                            verbose_warn("Check msg object, it must contain msg.payload.filename!");
                        }
                        break;
                    case "saveAddressSpace":
                        if (msg.payload && msg.filename) {
                            // Save current server namespace objects to file
                            var namespace = addressSpace.getOwnNamespace(); 
                            // Use msg.topic to select namespace
                            if (msg.topic) {
                                verbose_log("Saving namespace index: " + msg.topic);
                                namespace = addressSpace.getNamespace(parseInt(msg.topic));
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
                        if (msg.payload && msg.filename && fs.existsSync(msg.filename)) {
                            savedAddressSpace = msg.filename;
                            node.server_options.nodeset_filename.push(msg.filename);
                            restart_server();
                        }
                        else {
                            verbose_warn("Check msg object, it must contain msg.filename for the address space in XML format!");
                        }
                        break;
                    case "bindVariables":
                        // browse address space and bind method for each variable node setter
                        // report all existing Variables
                        var session = new opcua.PseudoSession(addressSpace);
                        const objectsFolder = addressSpace.findNode("ObjectsFolder");
                        var results=[];
                        const crawler = new NodeCrawler(session); // Legacy support
                        crawler.on("browsed", (element) => {
                            // Limit to variables and skip ns=0
                            if (element.nodeId.toString().indexOf("ns=0;") < 0 && element.nodeClass == opcua.NodeClass.Variable) {
                                // console.log("Element: " + element);
                                var item = Object.assign({}, element); // Clone element
                                results.push(item);
                            }
                        });
                        crawler.read(objectsFolder.nodeId, function (err, obj) {
                            if (!err) {
                                // console.log("Obj: " + obj);
                                // Nothing to do here
                            }
                            else {
                                verbose_warn("Crawling variables failed: " + err);
                            }
                            crawler.dispose();
                        });
                        
                        results.forEach(function(item) {
                            var variableNode = addressSpace.findNode(id);
                            node.debug("NodeId:" + variableNode.nodeId + " NodeClass: " + variableNode.nodeClass);
                            if (variableNode.nodeClass == opcua.NodeClass.Variable) {
                                var newext = {"payload": {"messageType":"Variable", "variableName":browseName.toString(), "nodeId":id.toString()}};
                                node.send(newext);
                                bindCallbacks(variableNode, browseName.toString());
                            }
                        });

                        function bindCallbacks(variable, browseName) {
                            const variableId = `${variable.namespaceIndex}:${browseName}`;

                            var options = {
                                get: function() {
                                    return new opcua.Variant({ dataType: opcuaBasics.convertToString(variable.dataType.toString()), value: variables[variableId]});
                                },
                                timestamped_get: function() {
                                    var ts = new Date();
                                    if (variablesTs[variableId]) {
                                        ts = variablesTs[variableId];
                                    }
                                    var st = opcua.StatusCodes.Good;
                                    if (variablesStatus[variableId]) {
                                        st = variablesStatus[variableId];
                                    }
                                    const myDataValue = new opcua.DataValue({
                                        serverPicoseconds: 0,
                                        serverTimestamp: new Date(),
                                        sourcePicoseconds: 0,
                                        sourceTimestamp: ts,
                                        statusCode: st,
                                        value: opcua.Variant({dataType: opcuaBasics.convertToString(variable.dataType.toString()), 
                                                              value: variables[variableId]})
                                        //value: new opcua.Variant({
                                        //    arrayType,
                                        //    dataType: opcuaDataType,
                                        //    value: variables[variableId]})
                                    });
                                    return myDataValue;
                                    /*
                                    return new opcua.DataValue({ value: opcua.Variant({dataType: opcuaBasics.convertToString(variable.dataType.toString()), value: variables[variableId]}),
                                                                statusCode: opcua.StatusCodes.Good,
                                                                serverTimestamp: new Date(),
                                                                sourceTimestamp: new Date()
                                    });
                                    */
                                },
                                set: (variant) => {
                                    // Store value
                                    variables[variableId] = variant.value;
                                    variable.value = new opcua.DataValue(new opcua.Variant({ dataType: variable.DataType, value: variant.value}),
                                                                        opcua.StatusCodes.Good);
                                    // Report new value to server node output
                                    var SetMsg = { "payload" : { "messageType" : "Variable", "variableName": browseName, "variableValue": variables[variableId] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
                                    node.send(SetMsg);
                                    return opcua.StatusCodes.Good;
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
                                return { statusCode: opcua.StatusCodes.Good };
                            };
                            */  
                            const methodId = msg.topic;
                            const methodFunc = msg.code;
                            const method = addressSpace.findNode(opcua.coerceNodeId(msg.topic));
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
                    node.server = null;
                    vendorName = null;
                    folder = null;
                });
                // Start server again
                await initNewServer();
                node.server = new opcua.OPCUAServer(node.server_options);
                node.server.on("post_initialize", () => {
                    if (node.constructDefaultAddressSpace === true) {
                        construct_my_address_space(node.server.engine.addressSpace);
                    }
                });                                   
                await node.server.start();
                // Client connects with userName
                node.server.on("session_activated", (session) => {
                    if (session.userIdentityToken && session.userIdentityToken.userName) {
                        var msg = {};
                        msg.topic="Username";
                        msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                        node.send(msg);
                    }
                });
                // Client connected
                node.server.on("create_session", function(session) {
                    var msg = {};
                    msg.topic="Client-connected";
                    msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                    node.send(msg);
                });
                // Client disconnected
                node.server.on("session_closed", function(session, reason) {
                    node.debug("Reason: " + reason);
                    var msg = {};
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
                    node.server = null;
                    vendorName = null;
                });

            } else {
                node.server = null;
                vendorName = null;
            }

        }
    }

    RED.nodes.registerType("OpcUa-Server", OpcUaServerNode);
};
