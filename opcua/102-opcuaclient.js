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
    var opcuaBasics = require('./opcua-basics');
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var browse_service = require("node-opcua/lib/services/browse_service");
    var async = require("async");
    var treeify = require('treeify');
    var Set = require("collections/set");
    var DataType = opcua.DataType;
    var AttributeIds = opcua.AttributeIds;

    function OpcUaClientNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.action = n.action;
        this.time = n.time;
        this.timeUnit = n.timeUnit;

        var node = this;

        var opcuaEndpoint = RED.nodes.getNode(n.endpoint);
        var userIdentity = {};
        if (opcuaEndpoint.login) {
            userIdentity.userName = opcuaEndpoint.credentials.user,
            userIdentity.password = opcuaEndpoint.credentials.password
        };
        var items = [];
        var subscription; // only one subscription needed to hold multiple monitored Items

        var monitoredItems = new Set(null, function (a, b) {
            return a.topicName === b.topicName;
        }, function (object) {
            return object.topicName;
        }); // multiple monitored Items should be registered only once

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

        function getBrowseName(session, nodeId, callback) {
            session.read([{nodeId: nodeId, attributeId: AttributeIds.BrowseName}], function (err, org, readValue) {
                if (!err) {
                    if (readValue[0].statusCode === opcua.StatusCodes.Good) {
                        var browseName = readValue[0].value.value.name;
                        return callback(null, browseName);
                    }
                }
                callback(err, "<??>");
            })
        }

        // Fields selected alarm fields
        // EventFields same order returned from server array of variants (filled or empty)
        function __dumpEvent(node, session, fields, eventFields, _callback) {

            var msg = {};
            msg.payload = [];

            verbose_log("EventFields=" + eventFields);

            async.forEachOf(eventFields, function (variant, index, callback) {

                if (variant.dataType === DataType.Null) {
                    return callback("variants dataType is Null");
                }

                if (variant.dataType === DataType.NodeId) {
                    getBrowseName(session, variant.value, function (err, name) {
                        if (!err) {
                            opcuaBasics.collectAlarmFields(fields[index], variant.dataType.key.toString(), variant.value, msg);
                            set_node_status_to("active event");
                            node.send(msg);
                        }
                        callback(err);
                    });
                } else {
                    setImmediate(function () {
                        opcuaBasics.collectAlarmFields(fields[index], variant.dataType.key.toString(), variant.value, msg);
                        set_node_status_to("active event");
                        callback();
                    })
                }
            }, _callback);
        }

        var eventQueue = new async.queue(function (task, callback) {
            __dumpEvent(task.node, task.session, task.fields, task.eventFields, callback);
        });

        function dumpEvent(node, session, fields, eventFields, _callback) {
            eventQueue.push({
                node: node, session: session, fields: fields, eventFields: eventFields, _callback: _callback
            });
        }

        function create_opcua_client(callback) {

            node.client = null;
            verbose_warn("create Client ...");
            node.client = new opcua.OPCUAClient();
            items = [];
            node.items = items;
            set_node_status_to("create client");
            if (callback) {
                callback();
            }
        }

        function reset_opcua_client(callback) {

            if (node.client) {
                node.client.disconnect(function () {
                    verbose_log("Client disconnected!");
                    create_opcua_client(callback);
                });
            }
        }

        function close_opcua_client(callback) {
            if (node.client) {
                node.client.disconnect(function () {
                    node.client = null;
                    verbose_log("Client disconnected!");
                    if (callback) {
                        callback();
                    }
                });
            }
        }

        function set_node_status_to(statusValue) {
            verbose_log("Client status: " + statusValue);
            var statusParameter = opcuaBasics.get_node_status(statusValue);
            node.status({fill: statusParameter.fill, shape: statusParameter.shape, text: statusParameter.status});
        }

        function connect_opcua_client() {

            node.session = null;

            async.series([
                // First connect to server´s endpoint
                function (callback) {
                    verbose_log("async series - connecting ", opcuaEndpoint.endpoint);
                    try {
                        set_node_status_to("connecting");
                        node.client.connect(opcuaEndpoint.endpoint, callback);
                    } catch (err) {
                        callback(err);
                    }
                },
                function (callback) {
                    verbose_log("async series - create session ...");
                    try {
                        node.client.createSession(userIdentity, function (err, session) {
                            if (!err) {
                                node.session = session;
                                node.session.timeout = opcuaBasics.calc_milliseconds_by_time_and_unit(10, "s");
								node.session.startKeepAliveManager(); // General for read/write/subscriptions/events
                                verbose_log("session active");
                                set_node_status_to("session active");
                                callback();
                            }
                            else {
                                set_node_status_to("session error");
                                callback(err);
                            }
                        });
                    } catch (err) {
                        callback(err);
                    }
                }
            ], function (err) {
                if (err) {
                    node.error(node.name + " OPC UA connection error: " + err.message);
                    verbose_log(err);
                    node.session = null;
                    close_opcua_client(set_node_status_to("connection error"));
                }
            });
        }

        function make_subscription(callback, msg, parameters) {

            var newSubscription = null;

            if (!node.session) {
                verbose_log("Subscription without session");
                return newSubscription;
            }

            if (!parameters) {
                verbose_log("Subscription without parameters");
                return newSubscription;
            }

            newSubscription = new opcua.ClientSubscription(node.session, parameters);

            newSubscription.on("initialized", function () {
                verbose_log("Subscription initialized");
                set_node_status_to("initialized");
            });

            newSubscription.on("started", function () {
                verbose_log("Subscription subscribed ID: " + newSubscription.subscriptionId);
                set_node_status_to("subscribed");
                monitoredItems.clear();
                callback(newSubscription, msg);
            });

            newSubscription.on("keepalive", function () {
                verbose_log("Subscription keepalive ID: " + newSubscription.subscriptionId);
                set_node_status_to("keepalive");
            });

            newSubscription.on("terminated", function () {
                verbose_log("Subscription terminated ID: " + newSubscription.subscriptionId);
                set_node_status_to("terminated");
                subscription = null;
                monitoredItems.clear();
            });

            return newSubscription;
        }

        create_opcua_client(connect_opcua_client);

        node.on("input", function (msg) {

            if (!node.action) {
                verbose_warn("can't work without action (read, write, browse ...)");
                //node.send(msg); // do not send in case of error
                return;
            }

            if (!node.client || !node.session) {
                verbose_warn("can't work without OPC UA Session");
                reset_opcua_client(connect_opcua_client);
                //node.send(msg); // do not send in case of error
                return;
            }

            // node.warn("secureChannelId:" + node.session.secureChannelId);

            if (!node.session.sessionId == "terminated") {
                verbose_warn("terminated OPC UA Session");
                reset_opcua_client(connect_opcua_client);
                //node.send(msg); // do not send in case of error
                return;
            }

            if (!msg || !msg.topic) {
                verbose_warn("can't work without OPC UA NodeId - msg.topic");
                //node.send(msg); // do not send in case of error
                return;
            }

            verbose_log("Action on input:" + node.action
                + " Item from Topic: " + msg.topic + " session Id: " + node.session.sessionId);

            switch (node.action) {
                case "read":
                    read_action_input(msg);
                    break;
                case "write":
                    write_action_input(msg);
                    break;
                case "subscribe":
                    subscribe_action_input(msg);
                    break;
                case "browse":
                    browse_action_input(msg);
                    break;
                case "events":
                    subscribe_events_input(msg);
                    break;
                default:
                    break;
            }

            //node.send(msg); // msg.payload is here actual inject caused wrong values
        });

        function read_action_input(msg) {

            verbose_log("reading");
			var item="";
			if (msg.topic) {
				var n = msg.topic.indexOf("datatype=");
				if (n>0) {
					msg.datatype=msg.topic.substring(n+9);
					item=msg.topic.substring(0,n-1);
					msg.topic=item;
					verbose_log(JSON.stringify(msg));
				}
				
			}
			if (item.length>0)
				items[0]=item;
			else
				items[0] = msg.topic; // TODO support for multiple item reading
			
			if (node.session) {
				node.session.readVariableValue(items, function (err, dataValues, diagnostics) {
					if (err) {
						verbose_log('diagnostics:' + diagnostics);
						node.error(err);
						set_node_status_to("error");
						reset_opcua_client(connect_opcua_client);
					} else {

						set_node_status_to("active reading");

						for (var i = 0; i < dataValues.length; i++) {

							var dataValue = dataValues[i];

							verbose_log("\tNode : " + (msg.topic).cyan.bold);

							if (dataValue) {
								try {
									verbose_log("\tValue : " + dataValue.value.value);
									verbose_log("\tDataType: " + dataValue.value.dataType + " ("+dataValue.value.dataType.toString()+")");
									verbose_log("\tMessage: " + msg.topic + " ("+msg.datatype+")");
									if (msg.datatype.localeCompare(dataValue.value.dataType.toString())!=0) {
										node.error("\tMessage types are not matching: " + msg.topic + " types: " + msg.datatype + " <> " + dataValue.value.dataType.toString());
									}
									if (dataValue.value.dataType === opcua.DataType.UInt16) {
										verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + opcuaBasics.toInt32(dataValue.value.value));
									}

									msg.payload = dataValue.value.value;

									if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
										verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
									}
									else {
										verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16).red.bold);
									}

									node.send(msg);
								}
								catch (e) {

									if (dataValue) {
										node.error("\tBad read: " + (dataValue.statusCode.toString(16)).red.bold);
										node.error("\tMessage:" + msg.topic + " dataType:" + msg.datatype);
										node.error("\tData:" + JSON.stringify(dataValue));
									}
									else {
										node.error(e.message);
									}
								}
							}
						}
					}
				});
			}
			else {
				set_node_status_to("Session invalid");
				node.error("Session is not active!")
			}
        }

        function write_action_input(msg) {

            verbose_log("writing");

            // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
            var ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
            var s = msg.topic.substring(7);    // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT

            var nodeid = {}; // new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);
            verbose_log(opcua.browse_service.makeBrowsePath(msg.topic, "."));
	    if (msg.topic.substring(5,6)=='s')
                nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, parseInt(ns));
            else
                nodeid = new nodeId.NodeId(nodeId.NodeIdType.NUMERIC, parseInt(s), parseInt(ns));

            verbose_log("msg=" + JSON.stringify(msg));
            verbose_log("namespace=" + ns);
            verbose_log("string=" + s);
            verbose_log("value=" + msg.payload);
            verbose_log(nodeid.toString());

            var opcuaVariant = opcuaBasics.build_new_variant(opcua, msg.datatype, msg.payload);
			if (node.session) {
				node.session.writeSingleNode(nodeid, opcuaVariant, function (err) {
					if (err) {
						set_node_status_to("error");
						node.error(node.name + " Cannot write value (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
						reset_opcua_client(connect_opcua_client);
					}
					else {
						set_node_status_to("active writing");
						verbose_log("Value written!");
					}
				});
			}
			else {
				set_node_status_to("Session invalid");
				node.error("Session is not active!")
			}
        }

        function subscribe_action_input(msg) {

            verbose_log("subscribing");

            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
                subscription = make_subscription(subscribe_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
            }
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    set_node_status_to("active subscribing");
                    subscribe_monitoredItem(subscription, msg);
                }
                else {
                    subscription = null;
                    monitoredItems.clear();
                    set_node_status_to("terminated");
                    reset_opcua_client(connect_opcua_client);
                }
            }
        }

        function subscribe_monitoredItem(subscription, msg) {

            verbose_log("Session subscriptionId: " + subscription.subscriptionId);

            var monitoredItem = monitoredItems.get({"topicName": msg.topic});

            if (!monitoredItem) {

                var interval = 100;

                if (typeof msg.payload === 'number') {
                    interval = Number(msg.payload);
                }

                verbose_log(msg.topic + " samplingInterval " + interval);
                verbose_warn("Monitoring Event: " + msg.topic + ' by interval of ' + interval + " ms");

                monitoredItem = subscription.monitor(
                    {
                        nodeId: msg.topic,
                        attributeId: opcua.AttributeIds.Value
                    },
                    {
                        samplingInterval: interval,
                        queueSize: 10,
                        discardOldest: true
                    },
                    3,
                    function (err) {
                        if (err) {
                            node.error('subscription.monitorItem:' + err);
                            reset_opcua_client(connect_opcua_client);
                        }
                    }
                );

                monitoredItems.add({"topicName": msg.topic, mItem: monitoredItem});

                monitoredItem.on("initialized", function () {
                    verbose_log("initialized monitoredItem on " + msg.topic);
                });

                monitoredItem.on("changed", function (dataValue) {

                    set_node_status_to("active subscribed");

                    verbose_log(msg.topic + " value has changed to " + dataValue.value.value);

                    if (dataValue.statusCode === opcua.StatusCodes.Good) {
                        verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
                    }
                    else {
                        verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16));
                    }

                    msg.payload = dataValue.value.value;
                    node.send(msg);
                });

                monitoredItem.on("keepalive", function () {
                    verbose_log("keepalive monitoredItem on " + msg.topic);
                });

                monitoredItem.on("terminated", function () {
                    verbose_log("terminated monitoredItem on " + msg.topic);
                    if (monitoredItems.get({"topicName": msg.topic})) {
                        monitoredItems.delete({"topicName": msg.topic});
                    }
                });
            }

            return monitoredItem;
        }

        function browse_action_input(msg) {

            verbose_log("browsing");

            var NodeCrawler = opcua.NodeCrawler;
            var crawler = new NodeCrawler(node.session);

            crawler.read(msg.topic, function (err, obj) {

                var newMessage = opcuaBasics.buildBrowseMessage(msg.topic);

                if (!err) {

                    set_node_status_to("active browsing");

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
                            newMessage.nodeClassType = line.substring(line.indexOf("nodeClass") + 11);
                        }
                        if (line.indexOf("typeDefinition") > 0) {
                            newMessage.typeDefinition = line.substring(line.indexOf("typeDefinition") + 16);
                            newMessage.payload = Date.now();
                            node.send(newMessage);
                        }

                        set_node_status_to("browse done");

                    });
                }
                else {
                    node.error(err.message);
                    set_node_status_to("error browsing");
                    reset_opcua_client(connect_opcua_client);
                }

            });

        }

        function subscribe_monitoredEvent(subscription, msg) {

            verbose_log("Session subscriptionId: " + subscription.subscriptionId);

            var monitoredItem = monitoredItems.get({"topicName": msg.topic});

            if (!monitoredItem) {

                var interval = 100;

                if (typeof msg.payload === 'number') {
                    interval = Number(msg.payload);
                }

                verbose_log(msg.topic + " samplingInterval " + interval);
                verbose_warn("Monitoring Event: " + msg.topic + ' by interval of ' + interval + " ms");

                monitoredItem = subscription.monitor(
                    {
                        nodeId: msg.topic, // serverObjectId
                        attributeId: AttributeIds.EventNotifier
                    },
                    {
                        samplingInterval: interval,
                        queueSize: 100000,
                        filter: msg.eventFilter,
                        discardOldest: true
                    },
                    3,
                    function (err) {
                        if (err) {
                            node.error('subscription.monitorEvent:' + err);
                            reset_opcua_client(connect_opcua_client);
                        }
                    }
                );

                monitoredItems.add({"topicName": msg.topic, mItem: monitoredItem});


                monitoredItem.on("initialized", function () {
                    verbose_log("monitored Event initialized");
                    set_node_status_to("initialized");
                });

                monitoredItem.on("changed", function (eventFields) {
                    dumpEvent(node, node.session, msg.eventFields, eventFields, function () {
                    });
                    set_node_status_to("changed");
                });

                monitoredItem.on("error", function (err_message) {
                    verbose_log("error monitored Event on " + msg.topic);
                    if (monitoredItems.get({"topicName": msg.topic})) {
                        monitoredItems.delete({"topicName": msg.topic});
                    }
                    node.err("monitored Event ", msg.eventTypeId, " ERROR".red, err_message);
                    set_node_status_to("error");
                });

                monitoredItem.on("keepalive", function () {
                    verbose_log("keepalive monitored Event on " + msg.topic);
                });

                monitoredItem.on("terminated", function () {
                    verbose_log("terminated monitored Event on " + msg.topic);
                    if (monitoredItems.get({"topicName": msg.topic})) {
                        monitoredItems.delete({"topicName": msg.topic});
                    }
                });
            }

            return monitoredItem;
        }

        function subscribe_events_input(msg) {

            verbose_log("subscribing events");

            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
                subscription = make_subscription(subscribe_monitoredEvent, msg, opcuaBasics.getEventSubscribtionParameters(timeMilliseconds));
            }
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    set_node_status_to("active subscribing");
                    subscribe_monitoredEvent(subscription, msg);
                }
                else {
                    subscription = null;
                    monitoredItems.clear();
                    set_node_status_to("terminated");
                    reset_opcua_client(connect_opcua_client);
                }
            }
        }

        node.on("close", function () {

            if (subscription && subscription.isActive()) {
                subscription.terminate();
                // subscription becomes null by its terminated event
            }

            if (node.session) {
                node.session.close(function (err) {

                    verbose_log("Session closed");
                    set_node_status_to("session closed");
                    if (err) {
                        node.error(node.name + " " + err);
                    }

                    node.session = null;
                    close_opcua_client(set_node_status_to("closed"));
                });
            } else {
                node.session = null;
                close_opcua_client(set_node_status_to("closed"));
            }
        });

        node.on("error", function () {

            if (subscription && subscription.isActive()) {
                subscription.terminate();
                // subscription becomes null by its terminated event
            }

            if (node.session) {

                node.session.close(function (err) {

                    verbose_log("Session closed on error emit");
                    if (err) {
                        node.error(node.name + " " + err);
                    }

                    set_node_status_to("session closed");
                    node.session = null;
                    close_opcua_client(set_node_status_to("node error"));

                });

            } else {
                node.session = null;
                close_opcua_client(set_node_status_to("node error"));
            }
        });
    }

    RED.nodes.registerType("OpcUa-Client", OpcUaClientNode);
};
