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

const { coerceSByte } = require('node-opcua');

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var path = require('path');
    var os = require("os");
    var chalk = require("chalk");
    var opcuaBasics = require('./opcua-basics');
    var envPaths = require("env-paths");
    var config = envPaths("node-red-opcua").config;
    const {parse, stringify} = require('flatted');

    function createCertificateManager() {
        return new opcua.OPCUACertificateManager({
            name: "PKI",
            rootFolder: path.join(config, "PKI"),
            automaticallyAcceptUnknownCertificate: true
        });
    }
    function createUserCertificateManager() {
        return new opcua.OPCUACertificateManager({
            name: "UserPKI",
            rootFolder: path.join(config, "UserPKI"),
            automaticallyAcceptUnknownCertificate: true
        });
    }
    function OpcUaServerNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.port = n.port;
        this.endpoint = n.endpoint;
        this.autoAcceptUnknownCertificate = n.autoAcceptUnknownCertificate;
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

        function createCertificateManager() {
            return new opcua.OPCUACertificateManager({
                name: "PKI",
                rootFolder: path.join(config, "PKI"),
                automaticallyAcceptUnknownCertificate: true
            });
        }

        function createUserCertificateManager() {
            return new opcua.OPCUACertificateManager({
                name: "UserPKI",
                rootFolder: path.join(config, "UserPKI"),
                automaticallyAcceptUnknownCertificate: true
            });
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
        verbose_warn("node set:" + xmlFiles.toString());

        async function initNewServer() {
            initialized = false;
            verbose_warn("create Server from XML ...");
            // DO NOT USE "%FQDN%" anymore, hostname is OK
            const applicationUri =  opcua.makeApplicationUrn(os.hostname(), "node-red-contrib-opcua-server");
            const serverCertificateManager = createCertificateManager();
            const userCertificateManager = createUserCertificateManager();


            var registerMethod = null;
            if (node.registerToDiscovery === true) {
                registerMethod = opcua.RegisterServerMethod.LDS;
            }
            node.server_options = {
                serverCertificateManager,
                userCertificateManager,
 
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
                isAuditing: false,
                registerServerMethod: registerMethod
            };
            node.server_options.serverInfo = {
                applicationName: { text: "Node-RED OPCUA" }
            };
            
            node.server_options.buildInfo = {
                buildNumber: "0.2.109",
                buildDate: "2021-02-28T09:00:00"
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

                verbose_log("Using server certificate  " + node.server.certificateFile);
                verbose_log("Using PKI  folder         " + node.server.serverCertificateManager.rootDir);
                verbose_log("Using UserPKI  folder     " + node.server.userCertificateManager.rootDir);


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
                execute_opcua_command(msg);
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
                    variables[payload.variableName] = payload.variableValue;
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
                    folder = addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(parentFolder.nodeId),
                        nodeId: msg.topic,
                        browseName: msg.topic.substring(7)
                    });
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
                        var arrayType = opcua.VariantArrayType.Scalar;
                        var arr = datatype.indexOf("Array");
                        var dim1 = 0;           // Fix for the scalars
                        var valueRank = null;   // Fix for the scalars
                        if (arr > 0) {
                            arrayType = opcua.VariantArrayType.Array;
                            dim1 = datatype.substring(arr+6);
                            dim1 = parseInt(dim1.substring(0, dim1.length-1));
                            valueRank = 1; // 1-dim Array
                            datatype = datatype.substring(0, arr);
                        }
                        var browseName = name.substring(7);
                        variables[browseName] = 0;

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
                        if (datatype == "ByteString") {
                            opcuaDataType = opcua.DataType.ByteString;
                            variables[browseName] = Buffer.from("");
                        }
                        if (datatype == "String") {
                            opcuaDataType = opcua.DataType.String;
                            variables[browseName] = "";
                        }
                        if (datatype == "Boolean") {
                            opcuaDataType = opcua.DataType.Boolean;
                            variables[browseName] = true;
                        }
                        verbose_log("Datatype: " + datatype);
                        verbose_log("OPC UA type id: "+ opcuaDataType.toString());
                        
                        var newVAR = addressSpace.getOwnNamespace().addVariable({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: name,
                            browseName: browseName, // or displayName
                            dataType: datatype, // opcuaDataType,
                            valueRank,
                            arrayDimensions: [dim1],
                            value: {
                                get: function () {
                                    return new opcua.Variant({
                                        arrayType,
                                        dataType: opcuaDataType,
                                        value: variables[browseName]
                                    })
                                },
                                set: function (variant) {
                                    verbose_log("Server set new variable value : " + variables[browseName] + " browseName: " + browseName + " new:" + stringify(variant));
                                    /*
                                    // TODO Array partial write need some more studies
                                    if (msg.range) {
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
                                        variables[browseName] = opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value);
                                    // }
                                    // variables[browseName] = Object.assign(variables[browseName], opcuaBasics.build_new_value_by_datatype(variant.dataType.toString(), variant.value));
                                    verbose_log("Server variable: " + variables[browseName] + " browseName: " + browseName);
                                    var SetMsg = { "payload" : { "messageType" : "Variable", "variableName": browseName, "variableValue": variables[browseName] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
                                    node.send(SetMsg);
                                    return opcua.StatusCodes.Good;
                                }
                            }
                        });
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

                default:
                    node_error("unknown OPC UA Command");
            }

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
