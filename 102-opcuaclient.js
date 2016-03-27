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
 **/

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var browse_service = require("node-opcua/lib/services/browse_service");
    var async = require("async");
    var treeify = require('treeify');

    function OpcUaClientNode(n) {

        RED.nodes.createNode(this, n);

        this.endpoint = n.endpoint;
        this.name = n.name;
        this.action = n.action;
        this.time = n.time;

        var node = this;

        var items = [];
        var subscriptions = [];
        var monitoredItems = [];

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                node.log(logMessage);
            }
        }

        if (node.client == null) {

            verbose_warn("create Client ...");
            node.client = new opcua.OPCUAClient();
            node.items = items;
            node.subscriptions = subscriptions;
        }

        node.status({fill: "red", shape: "ring", text: "disconnected"});

        async.series([
            // First connect to server´s endpoint
            function (callback) {
                verbose_log("async series - connecting ", node.endpoint);
                node.client.connect(node.endpoint, callback);
            },
            function (callback) {
                verbose_log("async series - create session ...");

                node.client.createSession(function (err, session) {
                    if (!err) {
                        node.session = session;
                        node.session.timeout = 10000;
                        node.status({fill: "green", shape: "dot", text: "session active"});
                        verbose_log("session active");
                        callback();
                    }
                    else {
                        callback(err);
                    }
                });
            },
            // Empty subscription in session to keep session alive
            function (callback) {
                if (node.session && node.action == "subscribe") {
                    verbose_log("async series - create ClientSubscription ...");

                    var keepaliveSubscription = new opcua.ClientSubscription(node.session, {
                        requestedPublishingInterval: node.time,
                        requestedLifetimeCount: 10,
                        requestedMaxKeepAliveCount: 2,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10
                    });

                    node.subscriptions.push(keepaliveSubscription);

                    keepaliveSubscription.on("started", function () {
                        verbose_log("subscribed");
                        verbose_log(keepaliveSubscription);
                    }).on("keepalive", function () {
                        verbose_log("keepalive");
                    }).on("terminated", function () {
                        verbose_log("terminated");
                        if (node.subscriptions.length > 0) {
                            node.subscriptions.pop();
                        }
                        node.emit("close");
                    });

                    callback();
                }
                else {
                    verbose_log("async series - session ClientSubscription not active");
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

        function build_new_variant(msg) {

            var nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: 0.0});

            switch (msg.datatype) {
                case"Float":
                    nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: parseFloat(msg.payload)});
                    break;
                case"Double":
                    nValue = new opcua.Variant({
                        dataType: opcua.DataType.Double,
                        value: parseFloat(msg.payload)
                    });
                    break;
                case"UInt16":
                    var uint16 = new Uint16Array([msg.payload]);
                    nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: uint16[0]});
                    break;
                case"Integer":
                    nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: parseInt(msg.payload)});
                    break;
                case"Boolean":
                    if (msg.payload) {
                        nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: true})
                    }
                    else {
                        nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: false})
                    }
                    break;
                case"String":
                    nValue = new opcua.Variant({dataType: opcua.DataType.String, value: msg.payload});
                    break;
                default:
                    break;
            }

            return nValue;
        }

        node.on("input", function (msg) {

            if (!node.session || !node.action) {
                node.send(msg);
                return;
            }

            if (node.action == "write") {

                verbose_log("writing");

                // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
                var ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
                var s = msg.topic.substring(7);    // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT

                var nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);

                verbose_log("namespace=" + ns);
                verbose_log("string=" + s);
                verbose_log("value=" + msg.payload);
                verbose_log(nodeid.toString());

                var opcuaVariant = build_new_variant(msg);

                node.session.writeSingleNode(nodeid, opcuaVariant, function (err) {
                    if (err) {
                        node.error(node.name + " Cannot write value (" + msg.payload + ") to item:" + msg.topic + " error:" + err);
                    }
                    else {
                        verbose_log("Value written!");
                    }
                });
            }

            if (node.action == "read") {

                if (!msg.topic) {
                    verbose_warn("can't read with empty Topic");
                    node.send(msg);
                    return;
                }

                verbose_log("read with Topic " + msg.topic);

                items[0] = msg.topic; // TODO support for multiple item reading

                node.session.readVariableValue(items, function (err, dataValues, diagnostics) {
                    if (err) {
                        verbose_log(diagnostics);
                        node.log(err);
                    } else {
                        for (var i = 0; i < dataValues.length; i++) {
                            var dataValue = dataValues[i];
                            verbose_log("\tNode : " + (items[i]).cyan.bold);
                            if (dataValue) {
                                try {
                                    verbose_log("\tValue : " + dataValue.value.value);
                                    verbose_log("\tDataType: " + dataValue.value.dataType);

                                    if (dataValue.value.dataType === opcua.DataType.UInt16) {
                                        verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + ToInt32(dataValue.value.value));
                                    }

                                    msg.payload = dataValue.value.value;

                                    node.send(msg);
                                }
                                catch (e) {
                                    node.error("\tBad read: " + dataValue.statusCode, msg);
                                }
                            }

                            if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
                                verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
                            }
                            else {
                                verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16));
                            }
                        }
                    }
                });
            }

            if (node.action == "subscribe") {

                if (!node.session || node.subscriptions.length > 8) {
                    node.emit("close");
                    return;
                }

                verbose_log("Session Status: " + node.session.status);
                verbose_log("subscribed to session: " + node.subscriptions.length + " localVar:" + subscriptions.length);

                var the_subscription;

                if (node.subscriptions.length < 1) {
                    the_subscription = new opcua.ClientSubscription(node.session, {
                        requestedPublishingInterval: node.time,
                        requestedLifetimeCount: 10,
                        requestedMaxKeepAliveCount: 2,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10
                    });

                    node.subscriptions.push(the_subscription);

                    the_subscription.on("started", function () {
                        verbose_log("subscribed");
                        verbose_log(the_subscription);
                    }).on("keepalive", function () {
                        verbose_log("keepalive");
                    }).on("terminated", function () {
                        verbose_log("terminated");
                        if (node.subscriptions.length > 0) {
                            node.subscriptions.pop();
                        }
                        node.emit("close");
                    });
                }
                else {
                    the_subscription = node.subscriptions.pop();

                    if (typeof the_subscription.subscriptionId !== "string") // TODO: find out when it's not usable anymore
                        node.subscriptions.push(the_subscription); // reuse the subscription
                }

                if (!the_subscription) {
                    verbose_warn("can't get any subscription");
                    node.emit("close");
                    return;
                }

                verbose_log("Session subscriptionId: " + the_subscription.subscriptionId);

                if (monitoredItems.length < 1) {
                    var monitoredItem = the_subscription.monitor(
                        {nodeId: msg.topic, attributeId: opcua.AttributeIds.Value},
                        {
                            samplingInterval: 100,
                            queueSize: 10,
                            discardOldest: true
                        }
                    );

                    monitoredItems.push(monitoredItem);

                    monitoredItem.on("initialized", function () {
                        verbose_log("initialized monitored Item on " + msg.topic);
                    });

                    monitoredItem.on("changed", function (dataValue) {
                        verbose_log(msg.topic + " value has changed to " + dataValue.value.value);

                        if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
                            verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
                        }
                        else {
                            verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16));
                        }

                        msg.payload = dataValue.value.value;
                        node.send(msg);
                    });

                    monitoredItem.on("keepalive", function () {
                        verbose_log("keepalive monitored Item on " + msg.topic);
                    });

                    monitoredItem.on("terminated", function () {
                        verbose_log("terminated monitored Item on " + msg.topic);
                        the_subscription.terminate();
                    });
                }
            }

            if (node.action == "browse") {

                verbose_log("Browsing address space, root given in msg.topic:" + msg.topic);

                var NodeCrawler = opcua.NodeCrawler;
                var crawler = new NodeCrawler(node.session);

                crawler.read(msg.topic, function (err, obj) {

                    var newMessage = {
                        topic: msg.topic,
                        nodeId: "",
                        browseName: "",
                        nodeClass: "",
                        typeDefinition: "",
                        payload: ""
                    };

                    if (!err) {

                        treeify.asLines(obj, true, true, function (line) {

                            verbose_log(line);

                            if (line.indexOf("browseName") > 0) {
                                newMessage.browseName = line.substring(line.indexOf("browseName") + 12);
                            }
                            if (line.indexOf("nodeId") > 0) {
                                newMessage.nodeId = line.substring(line.indexOf("nodeId") + 8);
                                newMessage.nodeId = newMessage.nodeId.replace("&#x2F;", "\/");
                            }
                            if (line.indexOf("nodeClass") > 0) {
                                newMessage.nodeClass = line.substring(line.indexOf("nodeClass") + 11);
                            }
                            if (line.indexOf("typeDefinition") > 0) {
                                newMessage.typeDefinition = line.substring(line.indexOf("typeDefinition") + 16);
                                newMessage.payload = Date.now();
                                node.send(newMessage);
                            }

                        });

                    }

                });
            }
        });

        node.on("close", function () {

            verbose_log("closing session (close)");
            verbose_warn("closing Client ...");
            if (node.session) {
                var subs;
                while (node.subscriptions.length > 0) {
                    subs = node.subscriptions.pop();
                    subs.terminate();
                }
                node.session.close(function (err) {
                    verbose_log(" Session closed " + err);
                    node.status({fill: "red", shape: "ring", text: "disconnected"});
                    node.session = null;
                    if (node.client) {
                        node.client.disconnect(function () {
                            node.client = null;
                            verbose_log("Client disconnected!");
                        });
                    }
                });
            }
        });

        node.on("error", function () {

            verbose_log("closing session (error)");
            verbose_warn("closing Client on error ...");

            if (node.session) {
                node.session.close(function (err) {
                    verbose_log("Session closed " + err);
                    node.status({fill: "red", shape: "ring", text: "disconnected"});
                    node.session = null;
                    if (node.client) {
                        node.client.disconnect(function () {
                            node.client = null;
                            verbose_log("Client disconnected!");
                        });
                    }
                });
            }
        });
    }

    RED.nodes.registerType("OpcUaClient", OpcUaClientNode);
};
