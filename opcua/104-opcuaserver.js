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

// const { coerceSByte } = require('node-opcua');

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var fileTransfer = require("node-opcua-file-transfer");
    var path = require('path');
    var os = require("os");
    var fs = require("fs");
    var chalk = require("chalk");
    var opcuaBasics = require('./opcua-basics');
    const {parse, stringify} = require('flatted');
    const { createCertificateManager, createUserCertificateManager } = require("./utils");
    const { ExtensionObject } = require("node-opcua-extension-object");
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
        var node = this;
        var variables = { Counter: 0 };
        var equipmentCounter = 0;
        var physicalAssetCounter = 0;
        var equipment;
        var physicalAssets;
        var vendorName;
        var equipmentNotFound = true;
        var initialized = false;
        var folder = null;
        let userManager; // users with username, password and role
        let users = [{ username: "", password: "", role: "" }]; // Empty as default

        if (node.users && node.users.length > 0) {
            verbose_log("Trying to load default users from file: " + node.users + " (current folder: " + __dirname + ")");
            if (fs.existsSync(node.users)) {
                users = JSON.parse(fs.readFileSync(node.users));
                verbose_log("Loaded users: " + JSON.stringify(users));
                setUsers(users);
            }
            else {
                verbose_log(chalk.red("File: " + node.users + " not found! You can inject users to server or add file to current folder: " + __dirname));
                node.error("File: " + node.users + " not found! You can inject users to server or add file to current folder: " + __dirname);
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
                        return false;
                    }
                    if (users[uIndex].password !== password) {
                        return false;
                    }
                    return true;
                },
                getUserRole: username => {
                    if (username === "Anonymous" || username === "anonymous") {
                        return WellKnownRoles.Anonymous;
                    }
                    const uIndex = users.findIndex(function(x) { return x.username === username; });
                    if (uIndex < 0) {  
                        return WellKnownRoles.Guest; // by default were guest! ( i.e anonymous), read-only access 
                    }
                    const userRole = users[uIndex].role;

                    // Default available roles, note each variable / methods should have permissions for real use case
                    if (userRole === "Anonymous") return WellKnownRoles.Anonymous;
                    if (userRole === "Guest") return WellKnownRoles.AuthenticatedUser;
                    if (userRole === "Engineer") return WellKnownRoles.Engineer;
                    if (userRole === "Observer") return WellKnownRoles.Observer;
                    if (userRole === "Operator") return WellKnownRoles.Operator;
                    if (userRole === "ConfigureAdmin") return WellKnownRoles.ConfigureAdmin;
                    if (userRole === "SecurityAdmin") return WellKnownRoles.SecurityAdmin;

                    // Return configurated role
                    return userRole;
                }
            };
        }
          
        function node_error(err) {
            console.error(chalk.red("[Error] Server node error on: " + node.name + " error: " + JSON.stringify(err)));
            node.error("Server node error on: " + node.name + " error: " + JSON.stringify(err));
        }

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                console.warn(chalk.yellow("[Warning] "+ (node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage));
                node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                console.log(chalk.cyan(logMessage));
                node.log(logMessage);
            }
        }

        node.status({
            fill: "red",
            shape: "ring",
            text: "Not running"
        });

        var xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml'),     // Standard & basic types
                        path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.AutoID.NodeSet2.xml'), // Support for RFID Readers
                        path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.ISA95.NodeSet2.xml')   // ISA95
        ];
        
        // Add custom nodesets (xml-files) for server
        if (node.nodesetDir && fs.existsSync(node.nodesetDir)) {
            fs.readdirSync(node.nodesetDir).forEach(fileName => {
                if (path.extname(fileName).toLowerCase() === '.xml') {
                    xmlFiles.push(path.join(node.nodesetDir, fileName));
                };
            });
        }
        verbose_warn("node set:" + xmlFiles.toString());
        
        async function initNewServer() {
            initialized = false;
            verbose_warn("create Server from XML ...");
            // DO NOT USE "%FQDN%" anymore, hostname is OK
            const applicationUri =  opcua.makeApplicationUrn(os.hostname(), "node-red-contrib-opcua-server");
            const serverCertificateManager = createCertificateManager(node.autoAcceptUnknownCertificate);
            const userCertificateManager = createUserCertificateManager(node.autoAcceptUnknownCertificate);


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
                port: parseInt(n.port),
                resourcePath: "/" + node.endpoint, // Option was missing / can be 
                maxAllowedSessionNumber: 1000,
                maxConnectionsPerEndpoint: 20,
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
                buildNumber: "0.2.253",
                buildDate: "2021-12-18T13:20:00"
            };
            
            var hostname = os.hostname();
            var discovery_server_endpointUrl = "opc.tcp://" + hostname + ":4840/UADiscovery";
            if (node.registerToDiscovery === true) {
                verbose_log("Registering server to :" + discovery_server_endpointUrl);
            }
        }

        function construct_my_address_space(addressSpace) {
            verbose_warn("Server add VendorName ...");
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

            verbose_warn('Server add MyVariable2 ...');

            var variable2 = 10.0;

            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=MyVariable2",
                browseName: "MyVariable2",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: "Double",
                            value: variable2
                        });
                    },
                    set: function (variant) {
                        variable2 = parseFloat(variant.value);
                        return opcua.StatusCodes.Good;
                    }
                }
            });

            verbose_warn('Server add FreeMemory ...');
            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=FreeMemory",
                browseName: "FreeMemory",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: opcua.DataType.Double,
                            value: available_memory()
                        });
                    }
                }
            });

            verbose_warn('Server add Counter ...');
            node.vendorName = addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=Counter",
                browseName: "Variables Counter",
                displayName: "Variables Counter",
                dataType: "UInt16",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: opcua.DataType.UInt16,
                            value: Object.keys(variables).length // Counter will show amount of created variables
                        });
                    }
                }
            });

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

                verbose_log("Using server certificate    " + node.server.certificateFile);
                verbose_log("Using PKI folder            " + node.server.serverCertificateManager.rootDir);
                verbose_log("Using UserPKI folder        " + node.server.userCertificateManager.rootDir);
                verbose_log("Trusted certificate folder  " + node.server.serverCertificateManager.trustedFolder);
                verbose_log("Rejected certificate folder " + node.server.serverCertificateManager.rejectedFolder);

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
                    console.log("Reason: " + reason);
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
                console.log("Error: " + err);
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

            if (contains_messageType(payload)) {
                read_message(payload);
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
                        verbose_warn("Equipment Reference found in VendorName");
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

        function contains_messageType(payload) {
            return payload.hasOwnProperty('messageType');
        }

        function read_message(payload) {
            switch (payload.messageType) {
                case 'Variable':
                    var ns = payload.namespace.toString();
                    variables[ns + ":" + payload.variableName] = payload.variableValue;
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
                    verbose_warn("adding Node".concat(payload.nodeName));
                    equipmentCounter++;
                    name = payload.nodeName.concat(equipmentCounter);

                    addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(equipment.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "addPhysicalAsset":
                    verbose_warn("adding Node".concat(payload.nodeName));
                    physicalAssetCounter++;
                    name = payload.nodeName.concat(physicalAssetCounter);

                    addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(physicalAssets.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "setFolder":
                    verbose_warn("set Folder ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    folder = addressSpace.findNode(msg.topic);
                    break;

                case "addFolder":
                    verbose_warn("adding Folder ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    var parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                    if (folder) {
                        parentFolder = folder; // Use previously created folder as parentFolder or setFolder() can be used to set parentFolder
                    }
                    // Own namespace
                    if (msg.topic.indexOf("ns=1;") >= 0) {
                        folder = addressSpace.getOwnNamespace().addObject({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: msg.topic,
                            browseName: msg.topic.substring(7)
                        });
                    }
                    else {
                        verbose_log("Topic: " + msg.topic + " index: " + msg.topic.substring(3));
                        const index = parseInt(msg.topic.substring(3));
                        verbose_log("ns index: " + index);
                        const uri = addressSpace.getNamespaceUri(index);
                        verbose_log("ns uri: " + uri);
                        const ns = addressSpace.getNamespace(uri); // Or index
                        folder = ns.addObject({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: msg.topic,
                            browseName: msg.topic.substring(7)
                        })
                    }
                    break;

                case "addVariable":
                    verbose_warn("adding Node ".concat(msg.topic)); // Example topic format ns=4;s=VariableName;datatype=Double
                    var datatype = "";
                    var opcuaDataType = null;
                    var e = msg.topic.indexOf("datatype=");
                    if (e<0) {
                        node_error("no datatype=Float or other type in addVariable ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    }
                    var parentFolder = node.server.engine.addressSpace.rootFolder.objects;
                    if (folder != null) {
                        parentFolder = folder; // Use previous folder as parent or setFolder() can be use to set parent
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
                            console.log("INDEXES[" + indexes.length + "] = " + JSON.stringify(indexes) + " from " + indexStr);
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
                        var browseName = name.substring(7);
                        variables[ns + ":" + browseName] = 0;
                        if (valueRank == 1) {
                            arrayType = opcua.VariantArrayType.Array;
                            dimensions = [dim1];
                            variables[ns + ":" + browseName] = new Float32Array(dim1); // [];
                            for (var i=0; i<dim1; i++) {
                                variables[ns + ":" + browseName][i] = 0;
                            }
                        }
                        if (valueRank == 2) {
                            arrayType = opcua.VariantArrayType.Matrix;
                            dimensions = [dim1, dim2];
                            variables[ns + ":" + browseName] = new Float32Array(dim1*dim2); // [];
                            for (var i=0; i<dim1*dim2; i++) {
                                variables[ns + ":" + browseName][i] = 0;
                            }
                        }
                        if (valueRank == 3) {
                            arrayType = opcua.VariantArrayType.Matrix; // Actually no Cube => Matrix with 3 dims
                            dimensions = [dim1, dim2, dim3];
                            variables[ns + ":" + browseName] = new Float32Array(dim1*dim2*dim3); // [];
                            for (var i=0; i<dim1*dim2*dim3; i++) {
                                variables[ns + ":" + browseName][i] = 0;
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
                            variables[ns + ":" + browseName] = new Date();
                        }
                        if (datatype == "ExtensionObject") {
                            opcuaDataType = opcua.DataType.ExtensionObject;
                            variables[ns + ":" + browseName] = {};
                        }
                        if (datatype == "ByteString") {
                            opcuaDataType = opcua.DataType.ByteString;
                            variables[ns + ":" + browseName] = Buffer.from("");
                        }
                        if (datatype == "String") {
                            opcuaDataType = opcua.DataType.String;
                            variables[ns + ":" + browseName] = "";
                        }
                        if (datatype == "Boolean") {
                            opcuaDataType = opcua.DataType.Boolean;
                            variables[ns + ":" + browseName] = true;
                        }
                        verbose_log("Datatype: " + datatype);
                        verbose_log("OPC UA type id: "+ opcuaDataType.toString() + " dims[" + dim1 + "," + dim2 +"," + dim3 +"] == " + dimensions);
                        // Initial value for server variable
                        var init = msg.topic.indexOf("value=");
                        if (init > 0) {
                            var initialValue = msg.topic.substring(init+6);
                            verbose_log("BrowseName: " + ns + ":" + browseName + " initial value: " + initialValue);
                            variables[ns + ":" + browseName] = opcuaBasics.build_new_value_by_datatype(datatype, initialValue);
                        }

                        
                        if (datatype === "ExtensionObject") {
                            var typeId = msg.topic.substring(msg.topic.indexOf("typeId=") + 7);
                            verbose_log("ExtensionObject typeId: " + typeId);
                            var extVar = addressSpace.constructExtensionObject(opcua.coerceNodeId(typeId), {}); // build default value for extension object
                            verbose_log("Server returned: " + JSON.stringify(extVar));
                            var extNode = namespace.addVariable({
                                organizedBy: addressSpace.findNode(parentFolder.nodeId),
                                nodeId: name,
                                browseName: browseName,
                                dataType: opcua.coerceNodeId(typeId), // "ExtensionObject", // "StructureDefinition", // typeId,
                                valueRank,
                                value: { dataType: opcua.DataType.ExtensionObject, value: extVar },
                                // value: { dataType: DataType.StructureDefinition, value: extVar },
                            });
                            var newext = { "payload" : { "messageType" : "Variable", "variableName": browseName, "nodeId": extNode.nodeId.toString() }};
                            node.send(newext);
                            // TODO get/set functions and other tricks as with normal scalar
                            return opcua.StatusCodes.Good;
                        }

                        var newVAR = namespace.addVariable({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: name,
                            browseName: browseName, // or displayName
                            dataType: datatype, // opcuaDataType,
                            valueRank,
                            arrayDimensions: dimensions,
                            value: {
                                get: function () {
                                    if (valueRank>=2) {
                                        return new opcua.Variant({
                                            arrayType,
                                            dimensions,
                                            dataType: opcuaDataType,
                                            value: variables[ns + ":" + browseName]
                                        });
                                    }
                                    else {
                                        return new opcua.Variant({
                                            arrayType,
                                            dataType: opcuaDataType,
                                            value: variables[ns + ":" + browseName]
                                        });
                                    } 
                                },
                                set: function (variant) {
                                    verbose_log("Server set new variable value : " + variables[ns + ":" + browseName] + " browseName: " + ns + ":" + browseName + " new:" + stringify(variant));
                                    /*
                                    // TODO Array partial write need some more studies
                                    if (msg.payload.range) {
                                        verbose_log(chalk.red("SERVER WRITE RANGE: " + range));
                                        var startIndex = 2; // parseInt(range);
                                        var endIndex = 4; // parseInt(range.substring(1))
                                        var newIndex = 0;
                                        var oldValues = variables[browseName].split(",");
                                        for (var i=startIndex; i<endIndex; i++) {
                                            oldValues[i] = variant.value[newIndex.toString()];
                                            newIndex++;
                                        }
                                        verbose_log(chalk.red("NEW ARRAY with range values: " + oldValues));
                                    }
                                    else {
                                        */
                                        variables[ns + ":" + browseName] = opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value);
                                    // }
                                    // variables[browseName] = Object.assign(variables[browseName], opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value));
                                    verbose_log("Server variable: " + variables[ns + ":" + browseName] + " browseName: " + ns + ":" + browseName);
                                    var SetMsg = { "payload" : { "messageType" : "Variable", "variableName": ns + ":" + browseName, "variableValue": variables[ns + ":" + browseName] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
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
                        verbose_warn("install historian for Node ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
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

                case "deleteNode":
                    if (addressSpace === undefined) {
                        node_error("addressSpace undefined");
                        return false;
                    }

                    var searchedNode = addressSpace.findNode(payload.nodeId);
                    if (searchedNode === undefined) {
                        verbose_warn("Cannot find Node: " + payload.nodeId + " from addressSpace")
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
                    verbose_warn("install discrete alarm for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                    var alarmText = msg.alarmText;
                    var priority = msg.priority;
                    var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                    var nodeId = addressSpace.findNode(nodeStr);
                    var boolVar = false;
                    if (nodeId) {
                        var namespace = addressSpace.getOwnNamespace(); // Default
                        var alarmState = namespace.addVariable({
                            nodeId: nodeStr + "-" + "AlarmState",
                            browseName: nodeStr.substring(7) + "-" + "AlarmState",
                            displayName: nodeStr.substring(7) + "-" + "AlarmState",
                            propertyOf: nodeId,
                            dataType: "Boolean",
                            eventSourceOf: "i=2253", // Use server as default event source
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
                        });
                        var discreteAlarm = addressSpace.findEventType("DiscreteAlarmType");
                        var alarm = namespace.instantiateDiscreteAlarm(discreteAlarm,
                            {
                                nodeId: nodeStr + "-" + "DiscreteAlarm",
                                browseName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                displayName: nodeStr.substring(7) + "-" + "DiscreteAlarm",
                                organizedBy: nodeId,
                                conditionSource: alarmState,
                                browseName: "DiscreteAlarmInstance",
                                inputNode: alarmState,   // the variable that will be monitored for change, generate below
                                optionals: [ "Acknowledge", "ConfirmedState", "Confirm" ], // confirm state and confirm Method
                            }
                        );
                        alarm.setEnabledState(true);
                       
                        try {
                            alarmState.on("value_changed", function (newDataValue) {
                                if (newDataValue.value.value === true) {
                                    if (alarm && alarm.getEnabledState()) {
                                        alarm.activeState.setValue(true);
                                        alarm.ackedState.setValue(false);
                                        
                                        alarm.raiseNewCondition(new opcua.ConditionInfo({
                                          severity: priority,
                                          message: alarmText,
                                          retain: true,
                                          quality: newDataValue.statusCode
                                        }));
                                        
                                      }
                                  
                                    // alarm.raiseNewCondition(); // {severity: priority, message: alarmText});
                                }
                                if (newDataValue.value.value === false) {
                                    alarm.deactivateAlarm();
                                }
                            });
                        }
                        catch(error) {
                            console.error("Error: " + error.toString());
                        }
                        
                    }
                    else {
                        node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
                    }
                    break;    

                case "installLimitAlarm":
                        verbose_warn("install limit alarm for node: ".concat(msg.topic)); // Example topic format ns=1;s=VariableName;datatype=Double
                        var highhighLimit = msg.hh;
                        var highLimit = msg.h;
                        var lowLimit = msg.l;
                        var lowlowLimit = msg.ll;
                        var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        var nodeId = addressSpace.findNode(nodeStr);
                        var levelVar = 0.0;
                        if (nodeId) {
                            var namespace = addressSpace.getOwnNamespace(); // Default
                            
                            var alarmState = namespace.addVariable({
                                nodeId: nodeStr + "-" + "LimitState",
                                browseName: nodeStr.substring(7) + "-" + "LimitState",
                                displayName: nodeStr.substring(7) + "-" + "LimitState",
                                propertyOf: nodeId,
                                dataType: "Float",
                                eventSourceOf: "i=2253", // nodeId, // Use server!
                                value: {
                                    get: function () {
                                        return new opcua.Variant({
                                            dataType: "Float",
                                            value: levelVar
                                        });
                                    },
                                    set: function (variant) {
                                        levelVar = variant.value;
                                        return opcua.StatusCodes.Good;
                                    }
                                }
                            });
                            
                            var alarm = namespace.instantiateNonExclusiveLimitAlarm("NonExclusiveLimitAlarmType",
                                {
                                    nodeId: nodeStr + "-" + "LimitAlarm",
                                    browseName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    displayName: nodeStr.substring(7) + "-" + "LimitAlarm",
                                    organizedBy: nodeId,
                                    conditionSource: alarmState,
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
                            //alarm.setEnabledState(true);
                            
                            /*
                            try {
                                alarmState.on("value_changed", function (newDataValue) {
                                    if (newDataValue.value.value === true) {
                                        if (alarm && alarm.getEnabledState()) {
                                            alarm.activeState.setValue(true);
                                            alarm.ackedState.setValue(false);
                                            
                                            alarm.raiseNewCondition(new opcua.ConditionInfo({
                                              severity: priority,
                                              message: alarmText,
                                              retain: true,
                                              quality: newDataValue.statusCode
                                            }));
                                            
                                          }
                                      
                                        // alarm.raiseNewCondition(); // {severity: priority, message: alarmText});
                                    }
                                    if (newDataValue.value.value === false) {
                                        alarm.deactivateAlarm();
                                    }
                                });
                            }
                            catch(error) {
                                console.error("Error: " + error.toString());
                            }
                            */
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
                            verbose_warn("Check msg object, it must contain msg.payload.fileName!");
                        }
                        break;
                
                default:
                    node_error("unknown OPC UA Command");
            }


            return returnValue;
        }

        async function restart_server() {
            verbose_warn("Restart OPC UA Server");
            if (node.server) {
                node.server.engine.setShutdownReason("Shutdown command received");
                // Wait 10s before shutdown
                await node.server.shutdown(10000).then(() => {
                    verbose_warn("Server has shutdown");
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
                    console.log("Reason: " + reason);
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
                verbose_warn("Restart OPC UA Server done");
            } else {
                node_error("Cannot restart OPC UA Server");
            }
        }

        node.on("close", function () {
            verbose_warn("closing...");
            close_server();
        });

        function close_server() {
            if (node.server) {
                node.server.shutdown(0, function () {
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
