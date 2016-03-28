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
    var async = require("async");

    function OpcUaBrowserEndpointNode(n) {

        RED.nodes.createNode(this, n);

        this.endpoint = n.endpoint;
        this.login = n.login;
        this.credentials = n.credentials;

        if (this.credentials) {
            this.user = this.credentials.user;
            this.password = this.credentials.password;
        }
    }

    RED.nodes.registerType("OpcUaBrowserEndpoint", OpcUaBrowserEndpointNode, {

        credentials: {
            user: {type: "text"},
            password: {type: "password"}
        }
    });

    function OpcUaBrowserNode(n) {

        RED.nodes.createNode(this, n);

        this.item = n.item;         // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = n.datatype; // String;
        this.topic = n.topic;       // ns=3;s=MyVariable from input
        this.items = n.items;

        var node = this;

        var browseTopic = "ns=0;i=85";

        node.items = [];

        var opcuaEndpoint = RED.nodes.getNode(n.endpoint);

        node.status({fill: "gray", shape: "dot", text: "no Items"});

        function setupClient(url, callback) {

            // new OPC UA Client and browse from Objects ns=0;s=Objects
            var browseClient = new opcua.OPCUAClient();
            var browseSession;

            async.series([
                // First connect to server´s endpoint
                function (callback) {
                    browseClient.connect(url, callback);
                    node.log("start browse client on " + opcuaEndpoint.endpoint);
                },
                function (callback) {
                    browseClient.createSession(function (err, session) {
                        if (!err) {
                            browseSession = session;
                            node.log("start browse session on " + opcuaEndpoint.endpoint);
                            callback();
                        }
                        else {
                            callback(err);
                        }
                    });
                },
                // step 3 : browse
                function (callback) {

                    browseSession.browse(browseTopic, function (err, browse_result) {
                        if (!err) {
                            browse_result.forEach(function (result) {
                                result.references.forEach(function (reference) {
                                    node.items.add(reference.nodeId.toString());
                                    node.send({
                                        "payload": {
                                            "browseName": reference.browseName.toString(),
                                            "nodeId": reference.nodeId.toString()
                                        }
                                    });
                                });
                            });
                        }

                        node.status({fill: "green", shape: "dot", text: "Items: " + node.items.length});

                        callback(err);
                    });
                },
                // close session
                function (callback) {
                    browseSession.close(function (err) {
                        if (err) {
                            node.error("session closed failed on browse");
                        }
                        callback(err);
                    });
                }
            ], function (err) {
                if (err) {
                    browseSession = null;
                    browseClient = null;
                    callback(err);
                }
            });
        }

        setupClient(opcuaEndpoint.endpoint, function (err) {
            if (err) {
                node.error(err);
                node.status({fill: "red", shape: "dot", text: "Error Items: " + node.items.length});
            }

            node.log("Browse loading Items done ...");
        });

        node.on("input", function (msg) {

            node.items = []; // clear items - TODO: may it becomes usable in Edit window of the node

            if (!node.topic && msg.topic) {
                if (!msg.topic) {
                    browseTopic = "ns=0;i=85";
                } else {
                    browseTopic = msg.topic;
                }
            }
            else {
                browseTopic = node.topic;
            }

            setupClient(opcuaEndpoint.endpoint, function (err) {
                if (err) {
                    node.error(err);
                    node.status({fill: "red", shape: "dot", text: "Error Items: " + node.items.length});
                }
                node.log("Browse loading Items done ...");
            });

            msg.endpoint = opcuaEndpoint.endpoint;
            msg.payload = node.items;
            n.items = node.items;

            node.send(msg);
        });
    }

    RED.nodes.registerType("OpcUaBrowser", OpcUaBrowserNode);
};