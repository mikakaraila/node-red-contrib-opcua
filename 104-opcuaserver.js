/**
 * Copyright 2015 Valmet Automation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

/**
 NodeRed node with support for OPC UA items read,write & browse invocation based on node-opcua

 @author <a href="mailto:mika.karaila@valmet.com">Mika Karaila</a> (Valmet Automation Inc.)
 @author <a href="mailto:klaus.landsdorf@bianco-royal.eu">Klaus Landsdorf</a> (Bianco Royal)
 **/

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var path = require('path');
    var os = require("os");

    function OpcUaServerNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.port = n.port;
        var node = this;

        var equipmentCounter = 0;
        var counterValue = 0;
        var equipment;
        var physicalAssets;
        var vendorName;
        var equipmentNotFound = true;
        var initialized = false;

        node.status({fill: "red", shape: "ring", text: "Not running"});

        var xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml'),
            path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.ISA95.NodeSet2.xml')];
        node.warn("node set:" + xmlFiles.toString());

        function initNewServer() {

            initialized = false;

            var opcuaServer = new opcua.OPCUAServer({port: node.port, nodeset_filename: xmlFiles});
            opcuaServer.buildInfo.productName = node.name.concat("OPC UA server");
            opcuaServer.buildInfo.buildNumber = "112";
            opcuaServer.buildInfo.buildDate = new Date(2016, 3, 24);
            node.warn("init next...");

            return opcuaServer;
        }

        var server = initNewServer();


        function construct_my_address_space(addressSpace) {

            node.warn('Server add VendorName ...');

            vendorName = addressSpace.addObject({
                organizedBy: addressSpace.rootFolder.objects,
                nodeId: "ns=4;s=VendorName",
                browseName: "VendorName"
            });

            equipment = addressSpace.addObject({
                organizedBy: vendorName,
                nodeId: "ns=4;s=Equipment",
                browseName: "Equipment"
            });

            physicalAssets = addressSpace.addObject({
                organizedBy: vendorName,
                nodeId: "ns=4;s=PhysicalAssets",
                browseName: "Physical Assets"
            });

            node.warn('Server add MyVariable2 ...');

            var variable2 = 10.0;

            addressSpace.addVariable({
                componentOf: vendorName,
                nodeId: "ns=4;s=MyVariable2",
                browseName: "MyVariable2",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({dataType: opcua.DataType.Double, value: variable2});
                    },
                    set: function (variant) {
                        variable2 = parseFloat(variant.value);
                        return opcua.StatusCodes.Good;
                    }
                }
            });

            node.warn('Server add FreeMemory ...');

            addressSpace.addVariable({
                componentOf: vendorName,
                nodeId: "ns=4;s=FreeMemory",
                browseName: "FreeMemory",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({dataType: opcua.DataType.Double, value: available_memory()});
                    }
                }
            });

            node.warn('Server add Counter ...');

            addressSpace.addVariable({
                componentOf: vendorName,
                nodeId: "ns=4;s=Counter",
                browseName: "Counter",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({dataType: opcua.DataType.Double, value: counterValue});
                    }
                }
            });

            var method = addressSpace.addMethod(
                vendorName, {
                    browseName: "Bark",

                    inputArguments: [
                        {
                            name: "nbBarks",
                            description: {text: "specifies the number of time I should bark"},
                            dataType: opcua.DataType.UInt32
                        }, {
                            name: "volume",
                            description: {text: "specifies the sound volume [0 = quiet ,100 = loud]"},
                            dataType: opcua.DataType.UInt32
                        }
                    ],

                    outputArguments: [{
                        name: "Barks",
                        description: {text: "the generated barks"},
                        dataType: opcua.DataType.String,
                        valueRank: 1
                    }]
                });

            method.bindMethod(function (inputArguments, context, callback) {

                var nbBarks = inputArguments[0].value;
                var volume = inputArguments[1].value;

                console.log("Hello World ! I will bark ", nbBarks, " times");
                console.log("the requested volume is ", volume, "");
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

        function post_initialize() {
            node.warn("initialized");

            var addressSpace = server.engine.addressSpace;
            construct_my_address_space(addressSpace);

            node.warn("Next server start...");

            server.start(function () {
                node.warn("Server is now listening ... ( press CTRL+C to stop)");
                server.endpoints[0].endpointDescriptions().forEach(function (endpoint) {
                    var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
                    console.log(" the primary server endpoint url is ", endpointUrl);
                });
            });
            node.status({fill: "green", shape: "dot", text: "running"});

            initialized = true;
        }

        server.initialize(post_initialize);

        function available_memory() {
            return os.freemem() / os.totalmem() * 100.0;
        }

        //######################################################################################
        node.on("input", function (msg) {

            var msgObject = msg.payload;

            if (server == undefined || !initialized)
                return false;

            if (equipmentNotFound) {

                var addressSpace = server.engine.addressSpace;

                if (addressSpace === undefined) {
                    node.error("addressSpace undefinded");
                    return false;
                }

                var rootFolder = addressSpace.findNode("ns=4;s=VendorName");
                var references = rootFolder.findReferences("Organizes", true);

                if (findReference(references, equipment.nodeId)) {
                    node.warn("Equipment Reference found in VendorName");
                    equipmentNotFound = false;
                }
                else {
                    node.warn("Equipment Reference not found in VendorName");
                }

            }

            if (contains_messageType(msgObject)) {
                read_message(msgObject);
                node.send(msg);
                return true;
            }

            if (contains_opcua_command()) {
                execute_opcua_command();
                node.send(msg);
                return true;
            }

            node.send(msg);
        });

        function findReference(references, nodeId) {
            return references.filter(function (r) {
                return r.nodeId.toString() === nodeId.toString();
            });
        }

        function contains_messageType(msgObject) {
            return msgObject.hasOwnProperty('messageType');
        }

        function read_message(msgObject) {

            switch (msgObject.messageType) {

                case 'Variable':
                    if (msgObject.variableName == "Counter") {
                        // Code for the Node-RED function to send the data by an inject
                        // msg = { payload : { "messageType" : "Variable", "variableName": "Counter", "variableValue": msg.payload }};
                        // return msg;
                        counterValue = msgObject.variableValue[0];
                    }
                    break;
                default:
                    break;
            }
        }

        function contains_opcua_command(msgObject) {
            return msgObject.hasOwnProperty('opcuaCommand');
        }

        function execute_opcua_command(msgObject) {

            var addressSpace = server.engine.addressSpace;

            switch (msgObject.opcuaCommand) {

                case "restartOPCUAServer":
                    restart_server();
                    break;

                case "addEquipment":

                    equipmentCounter++;
                    var name = "Equipment".concat(equipmentCounter);

                    addressSpace.addObject({
                        organizedBy: addressSpace.findNode(equipment.nodeId),
                        nodeId: "n=4;s=".concat(name),
                        browseName: "Equipment".concat(equipmentCounter)
                    });
                    break;

                case "deleteNode":
                    addressSpace.deleteNode(msgObject.nodeId);
                    break;

                default:
                    node.error("unknown OPC UA Command");
            }

        }

        function restart_server() {
            node.warn("Restart OPC UA Server");
            close_server();
            server = initNewServer();
            server.initialize(post_initialize);
            node.warn("Restart OPC UA Server done");
        }

        node.on("close", function () {
            node.warn("closing...");
            close_server();
        });

        function close_server() {
            if (server) {
                server.shutdown(function () {
                    server = null;
                    vendorName = null;
                });

            } else {
                server = null;
                vendorName = null;
            }
        }
    }

    RED.nodes.registerType("OpcUaServer", OpcUaServerNode);
};
