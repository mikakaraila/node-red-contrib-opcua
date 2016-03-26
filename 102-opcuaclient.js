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
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var browse_service = require("node-opcua/lib/services/browse_service");
    var BrowseDirection = browse_service.BrowseDirection;
    var async = require("async");
    var treeify = require('treeify');

    function dumpItemResult(item, node) {
        var msg = {topic: "", payload: ""};
        msg.topic = item.nodeId.toString();
        node.send(msg);
    }

    function OpcUaClientNode(n) {

        RED.nodes.createNode(this, n);

        this.endpoint = n.endpoint;
        this.name = n.name;
        this.action = n.action;
        this.time = n.time;

        var node = this;

        var items = [];
        var subscriptions = [];

        if (node.client == null) {

            node.client = new opcua.OPCUAClient();
            node.items = items;
            node.subscriptions = subscriptions;
        }

        node.status({fill: "red", shape: "ring", text: "disconnected"});

        async.series([
            // First connect to server´s endpoint
            function (callback) {
                console.log(node.name + " connecting to", node.endpoint);
                node.client.connect(node.endpoint, callback);
            },
            function (callback) {
                node.client.createSession(function (err, session) {
                    if (!err) {
                        node.session = session;
                        node.status({fill: "green", shape: "dot", text: "session active"});
                        console.log(node.name + "session active");
                        callback();
                    }
                    else {
                        callback(err);
                    }
                });

            },
            // Empty subscription in session to keep session alive
            function (callback) {
                if (node.session) {
                    if (RED.settings.verbose) {
                        console.log(node.name + " session keepalive...");
                    }
                    var keepalive = new opcua.ClientSubscription(node.session, {
                        requestedPublishingInterval: 500,
                        //  requestedLifetimeCount: 100,
                        //  requestedMaxKeepAliveCount: 200,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10
                    });
                    node.subscriptions.push(keepalive);
                    callback();
                }
                else {
                    console.log("Session not existing!");
                }
            }
        ], function (err) {
            if (err) {
                node.error(err.stack, err);
                node.status({fill: "red", shape: "ring", text: "Error"});
                node.session = null;
                node.client = null;
            }
        });

        function ToInt32(x) {
            var uint16 = x;

            if (uint16 >= Math.pow(2, 15)) {
                return uint16 - Math.pow(2, 16);
            }
            else {
                return uint16;
            }
        }

        node.on("input", function (msg) {

            if (node.session !== null) {

                if (node.action && node.action == "write") {

                    if (RED.settings.verbose) {
                        console.log("NODE:" + node.name + " writing");
                    }

                    // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
                    var ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
                    var s = msg.topic.substring(7);    // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT

                    var nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);

                    if (RED.settings.verbose) {
                        node.log("namespace=" + ns);
                        node.log("string=" + s);
                        node.log("value=" + msg.payload);
                        node.log(nodeid.toString());
                    }

                    var nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: 0.0});

                    // TODO implement basic types that can be written to server
                    if (msg.datatype == "Float") {
                        if (RED.settings.verbose) {
                            node.log("Float");
                        }
                        nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: parseFloat(msg.payload)})
                    }
                    if (msg.datatype == "Double") {
                        if (RED.settings.verbose) {
                            node.log("Double");
                        }
                        nValue = new opcua.Variant({dataType: opcua.DataType.Double, value: parseFloat(msg.payload)})
                    }
                    if (msg.datatype == "UInt16") {
                        if (RED.settings.verbose) {
                            node.log("UInt16");
                        }
                        nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: ToInt32(msg.payload)})
                    }
                    if (msg.datatype == "Integer") {
                        if (RED.settings.verbose) {
                            node.log("Integer");
                        }
                        nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: parseInt(msg.payload)})
                    }
                    if (msg.datatype == "Boolean") {
                        if (RED.settings.verbose) {
                            node.log("Boolean");
                        }
                        if (msg.payload == 0) msg.payload = false;
                        if (msg.payload == 1) msg.payload = true;
                        nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: msg.payload})
                    }
                    if (msg.datatype == "String") {
                        if (RED.settings.verbose) {
                            node.log("String");
                        }

                        nValue = new opcua.Variant({dataType: opcua.DataType.String, value: msg.payload})
                    }

                    node.session.writeSingleNode(nodeid, nValue, function (err) {
                        if (err) {
                            node.error(node.name + " Cannot write value (" + msg.payload + ") to item:" + msg.topic + " error:" + err);
                        }
                        else {
                            if (RED.settings.verbose) {
                                node.log("Value written!");
                            }
                        }
                    });
                }

                if (node.action && node.action == "read") {

                    if (RED.settings.verbose) {
                        console.log("TODO support for multiple item reading of this:" + msg.topic);
                    }

                    items[0] = msg.topic; // TODO support for multiple item reading

                    node.session.readVariableValue(items, function (err, dataValues, diagnostics) {
                        if (err) {
                            node.log(err);
                        } else {
                            for (var i = 0; i < dataValues.length; i++) {
                                var dataValue = dataValues[i];
                                if (RED.settings.verbose) {
                                    console.log("           Node : ", (items[i]).cyan.bold);
                                }
                                if (dataValue) {
                                    try {
                                        if (RED.settings.verbose) {
                                            console.log("          value : ", dataValue.value.value);
                                        }
                                        msg.payload = dataValue.value.value; //.toString();
                                        node.send(msg);
                                    }
                                    catch (e) {
                                        node.error("Bad read: " + dataValue.statusCode, msg);
                                    }
                                }
                                if (RED.settings.verbose) {
                                    console.log("      statusCode: ", dataValue.statusCode.toString(16));
                                }
                            }
                        }
                    });
                }
                if (node.action && node.action == "subscribe") {
                    var the_subscription = new opcua.ClientSubscription(node.session, {
                        requestedPublishingInterval: node.time,
                        //  requestedLifetimeCount: 100,
                        //  requestedMaxKeepAliveCount: 200,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10
                    });
                    node.subscriptions.push(the_subscription);
                    the_subscription.on("started", function () {
                        console.log("subscribed");
                        if (RED.settings.verbose) {
                            console.log(the_subscription);
                        }
                    }).on("keepalive", function () {
                        if (RED.settings.verbose) {
                            console.log("keepalive");
                        }
                    }).on("terminated", function () {
                        console.log("terminated");
                        node.subscriptions.pop();
                    });
                    var monitoredItem = the_subscription.monitor(
                        {nodeId: msg.topic, attributeId: 13},  // 13 == attribute value
                        {
                            // clientHandle: 13,
                            samplingInterval: 500,
                            queueSize: 1,
                            discardOldest: true
                        }
                    );
                    monitoredItem.on("initialized", function () {
                        console.log("initialized", msg.topic);
                    });
                    monitoredItem.on("changed", function (dataValue) {
                        console.log(msg.topic, " value has changed to " + dataValue.value.value);
                        msg.payload = dataValue.value.value;
                        node.send(msg);
                    });

                    /*
                     setTimeout(function() {
                     the_subscription.terminate();
                     node.session.close(function(err) {
                     console.log(" Subscription and session closed");
                     node.status({fill:"red",shape:"ring",text:"disconnected"});
                     node.session=null;
                     });
                     }, node.time); // Default 10000 msecs to parameter in node dialog
                     */
                }
                if (node.action && node.action == "browse") {
                    node.log("Browsing address space, root given in msg.topic:" + msg.topic);
                    var NodeCrawler = opcua.NodeCrawler;
                    var crawler = new NodeCrawler(node.session);
                    //crawler.on("browsed", function (element) {
                    //  console.log("->",element.browseName.name,element.nodeId.toString());
                    //});

                    crawler.read(msg.topic, function (err, obj) {
                        var msg = {topic: "", browseName: "", payload: ""};
                        if (!err) {
                            treeify.asLines(obj, true, true, function (line) {
                                if (RED.settings.verbose) {
                                    console.log(line);
                                }
                                if (line.indexOf("browseName") > 0) {
                                    msg.browseName = line.substring(line.indexOf("browseName"));
                                }
                                if (line.indexOf("nodeId") > 0) {
                                    msg.topic = line.substring(line.indexOf("nodeId") + 8);
                                    // &#x2F;
                                    msg.topic = msg.topic.replace("&#x2F;", "\/");
                                }
                                if (msg.topic.length > 0 && msg.browseName.length > 0) {
                                    node.send(msg);
                                    msg.topic = "";
                                    msg.browseName = "";
                                }
                            });
                        }
                    });

                    /*
                     node.session.browse( {nodeId: msg.topic,
                     browseDirection: BrowseDirection.Both,
                     includeSubType: true,
                     nodeClassMask: browse_service.makeNodeClassMask("Object") // Variable
                     },function (err, itemResults,diagnostics) { //v0.7 OK
                     if (err) {
                     node.log(err);
                     node.log(itemResults);
                     node.log(diagnostics);
                     } else {
                     for (var i = 0; i < itemResults.length; i++) {
                     // node.log(" StatusCode =", itemResults[i].statusCode.toString(16));
                     for (var j=0; j<itemResults[i].references.length; j++) {
                     dumpItemResult(itemResults[i].references[j], node);
                     }
                     }
                     }
                     });
                     */
                }
            }
        });

        node.on("close", function () {
            console.log(node.name + " closing session (close)");
            if (node.session) {
                var subs;
                while (node.subscriptions.length > 0) {
                    subs = node.subscriptions.pop();
                    subs.terminate();
                }
                node.session.close(function (err) {
                    console.log(" Session closed");
                    node.status({fill: "red", shape: "ring", text: "disconnected"});
                    node.session = null;
                    if (node.client) {
                        node.client.disconnect(function () {
                            node.client = null;
                            console.log("  Client disconnected!");
                        });
                    }
                });
            }
        });

        node.on("error", function () {
            console.log(node.name + " closing session (error)");
            if (node.session) {
                node.session.close(function (err) {
                    console.log(" Session closed");
                    node.status({fill: "red", shape: "ring", text: "disconnected"});
                    node.session = null;
                    if (node.client) {
                        node.client.disconnect(function () {
                            node.client = null;
                            console.log("  Client disconnected!");
                        });
                    }
                });
            }
        });
    }

    RED.nodes.registerType("OpcUaClient", OpcUaClientNode);
};
