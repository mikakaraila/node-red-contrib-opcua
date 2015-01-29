/**
 * Copyright 2014 Metso Automation Inc.
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

 @author <a href="mailto:mika.karaila@metso.com">Mika Karaila</a> (Process Automation Systems, Metso)
**/

module.exports = function(RED) {
    //"use strict";
    var RED = require(process.env.NODE_RED_HOME+"/red/red");
    var opcua = require('node-opcua');
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var async = require("async");

    function OpcUaClientNode(n) {
        RED.nodes.createNode(this,n);
        this.endpoint = n.endpoint;
        this.name = n.name;
        this.action = n.action;
        this.time = n.time;
        var node = this;
        var msg = {};
        var items=[];
        var subscriptions=[];
        
        if (node.client==null) {
            node.client = new opcua.OPCUAClient();
            node.items=items;
            node.subscriptions=subscriptions;
        }
        node.status({fill:"red",shape:"ring",text:"disconnected"});
        async.series([
            // First connect to server´s endpoint
            function(callback) {
                console.log(node.name+" connecting to", node.endpoint);
                node.client.connect(node.endpoint,callback);
            },
            // Create session
            function(callback) {
                node.client.createSession(function (err,session){
                    if (!err) {
                        node.session = session;
                        node.status({fill:"green",shape:"dot",text:"session active"});
                        console.log(node.name+" session active");
                    }
                });
            }
        ],function(err){
            if (err) {
                node.log(node.name+" client : process terminated with an error");
                node.log(" error : " , err) ;
                node.log(err.stack);
                node.status({fill:"red",shape:"ring",text:"Error:"+err.stack});
                node.session=null;
                node.client=null;
            }
        });   
        
        node.on("input", function(msg) {
            console.log("Action:"+node.action);
            if (node.session!==null)
            {
                if (node.action && node.action=="write")
                {
                    var nodeid = new nodeId.NodeId(nodeId.NodeIdType.NUMERIC, 1001,1);
                    node.log(nodeid.toString());
                    var nValue = new opcua.Variant({dataType: opcua.DataType.Double, value: parseFloat(msg.payload) })
                    // node.session.writeSingleNode(nodeid, {dataType: opcua.DataType.Double, value: parseFloat(msg.payload)}, function(err) {
                    node.session.writeSingleNode(nodeid, nValue, function(err) {
                        if (err) {
                            node.error("Cannot write value to item:" + msg.topic);
                        }
                    });
                }
                if (node.action && node.action=="read")
                {
                    items[0]=msg.topic; // TODO support for multiple item reading
                    node.session.readVariableValue(items, function (err, dataValues, diagnostics) {
                        console.log("DIAG:"+diagnostics);
                        if (err) {
                            node.log(err);
                        } else {
                            for (var i = 0; i < dataValues.length; i++) {
                                var dataValue = dataValues[i];
                                console.log("           Node : ", (items[i]).cyan.bold);
                                if (dataValue.value) {
                                    console.log("           type : ", dataValue.value.dataType.key);
                                    console.log("           value: ", dataValue.value.value);
                                    msg.payload=dataValue.value.value;
                                    node.send(msg);
                                }
                                console.log("      statusCode: ", dataValue.statusCode.toString(16));
                                // console.log(" sourceTimestamp: ", dataValue.sourceTimestamp, dataValue.sourcePicoseconds);
                            }
                        }
                    });
                }
                if (node.action && node.action=="subscribe")
                {
                    var the_subscription = new opcua.ClientSubscription(node.session, {
                        requestedPublishingInterval: 100,
                        requestedLifetimeCount: 100,
                        requestedMaxKeepAliveCount: 200,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10
                    });
                    the_subscription.on("started", function () {
                        console.log("started", the_subscription);
                    }).on("keepalive", function () {
                        console.log("keepalive");
                    }).on("terminated", function () {
                        console.log("terminated");
                    });
                    var monitoredItem = the_subscription.monitor(
                        {   nodeId: msg.topic, attributeId: 13    },
                        {
                            clientHandle: 13,
                            samplingInterval: 500,
                            //xx filter:  { parameterTypeId: 'ns=0;i=0',  encodingMask: 0 },
                            queueSize: 1,
                            discardOldest: true
                        }
                    );
                    monitoredItem.on("initialized", function () {
                        console.log("monitoredItem initialized");
                    });
                    monitoredItem.on("changed", function (dataValue) {
                        console.log(msg.topic, " value has changed to " + dataValue.value.value);
                        msg.payload=dataValue.value.value;
                        node.send(msg);
                    });
                    setTimeout(function () {
                        the_subscription.terminate();
                    }, node.time); // Default 10000 msecs to parameter in node dialog
                }
                if (node.action && node.action=="browse")
                {
                    console.log("Browsing address space:");
                    //node.session.browse(["RootFolder", "ObjectsFolder"],function (err, itemResults,diagnostics) {
                    node.session.browse( {nodeId: msg.topic},function (err, itemResults,diagnostics) { //v0.7 OK
                        if (err) {
                            console.log(err);
                            console.log(itemResults);
                            console.log(diagnostics);
                        } else {
                            function dumpItemResult(item) {
                                str = "ITEM:"+item.browseName.name + (item.isForward ? "->" : "<-") + item.nodeId.displayText();
                                //console.log(str);
                                msg.topic=item.nodeId.toString();
                                msg.browseName=item.browseName.name;
                                msg.payload=item.browseName.name;
                                node.send(msg);
                            }

                            for (var i = 0; i < itemResults.length; i++) {
                                // console.log("Item: ", items[i]);
                                // console.log(" StatusCode =", itemResults[i].statusCode.toString(16));
                                itemResults[i].references.forEach(dumpItemResult);
                            }
                        }
                    });
                }
            }
        });
        
        node.on("close", function() {
            console.log(node.name+" closing session (close)");
            if (node.session) {
                node.session.close(function(err){
                    console.log(" Session closed");
                    node.status({fill:"red",shape:"ring",text:"disconnected"});
                    node.session=null;
                    if (node.client) {  
                        node.client.disconnect(function(){
                            node.client=null;
                            console.log("  Client disconnected!");
                        });
                    }
                });
            }
        });
        
        node.on("error", function() {
            console.log(node.name+" closing session (error)");
            if (node.session) {
                node.session.close(function(err){
                    console.log(" Session closed");
                    node.status({fill:"red",shape:"ring",text:"disconnected"});
                    node.session=null;
                    if (node.client) {  
                        node.client.disconnect(function(){
                            node.client=null;
                            console.log("  Client disconnected!");
                        });
                    }
                });
            }
        });
    }
    RED.nodes.registerType("OpcUaClient",OpcUaClientNode);
}