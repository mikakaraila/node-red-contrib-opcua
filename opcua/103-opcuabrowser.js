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
    var uaclient = require('node-opcua-client');
    var path = require("path");

    const defaultBrowseTopic = "ns=0;i=85"; // Default root, server Objects

    function OpcUaBrowserNode(config) {

        RED.nodes.createNode(this, config);

        this.item = config.item; // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = config.datatype; // String;
        this.topic = config.topic; // ns=3;s=MyVariable from input
        this.items = config.items;
        this.name = config.name;
        var node = this;
        var browseTopic = defaultBrowseTopic;
        
        var opcuaEndpoint = RED.nodes.getNode(config.endpoint);

        var connectionOption = {};
        var userIdentity = {};
     
        if (opcuaEndpoint.securityPolicy) {
            connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint.securityPolicy];
        }
        else {
            connectionOption.securityPolicy = opcua.SecurityPolicy.None;
        }
        if (opcuaEndpoint.securityMode) {
            connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint.securityMode];
        }
         else {
            connectionOption.securityPolicy = opcua.MessageSecurityMode.None;
        }
        connectionOption.endpointMustExist = false;
     
        if (opcuaEndpoint.login) {
          userIdentity.userName = opcuaEndpoint.credentials.user;
          userIdentity.password = opcuaEndpoint.credentials.password;
          userIdentity.type = uaclient.UserTokenType.UserName; // New TypeScript API parameter
        }
     
        node.status({
            fill: "gray",
            shape: "dot",
            text: "no Items",
            source: { id: node.id, type: node.type, name: "OPC UA Browser"}
        });

        node.add_item = function (item) {
            if (item) {
                if (!node.items) {
                    node.items = new Array();
                }
                node.items.push({
                    'item': item
                });
            }
        };

        function node_error(err) {
            node.error("Browse node error!", err);
        }

        async function setupClient(url, callback) {
            // new OPC UA Client and browse from Objects ns=0;s=Objects
            const client = opcua.OPCUAClient.create(connectionOption);
            try 
            {
                // step 1 : connect to
                await client.connect(url);
                node.debug("start browse client on " + opcuaEndpoint.endpoint);
                
                // step 2 : createSession
                const session = await client.createSession(userIdentity);
                node.debug("start browse session on " + opcuaEndpoint.endpoint);
                
                // step 3 : browse
                node.debug("browseTopic:" + browseTopic);
                const browseResult = await session.browse(browseTopic);
        
                // step 4 : Read Value and Datatypes
                for(const reference of browseResult.references)
                {
                    var ref_obj = Object.assign({}, reference);
                    const dataValue = await session.read({nodeId: ref_obj.nodeId, attributeId: opcua.AttributeIds.Value});
                    ref_obj["value"] = dataValue.value.value;
                    ref_obj["dataType"] = opcua.DataType[dataValue.value.dataType];
                    node.add_item(ref_obj);
                }
                node.status({
                            fill: "green",
                            shape: "dot",
                            text: "Items: " + node.items.length,
                            source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                        });
                        
                //step 5 close session
                node.debug("sending items " + node.items.length);
                var msg = {
                        payload: node.items,
                        endpoint: opcuaEndpoint.endpoint
                    };
                node.send(msg);
                node.debug("close browse session");
                await session.close();
                // Set status notification browse done
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Done",
                    source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                });
            }
            catch(err)
            {
                callback(err);
            }
            if (client) {
                client.disconnect();
            }
        }

        setupClient(opcuaEndpoint.endpoint, function (err) {
            if (err) {
                node_error(err);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Error Items: " + node.items.length,
                    source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                });
            }
            else {
                node.debug("Browse loading Items done...");
            }
        });

        node.on("input", function (msg) {
            browseTopic = null;
            node.debug("input browser");
            
            if(msg.topic){
                browseTopic = msg.topic;
            } else if(node.topic){
                browseTopic = node.topic;
            } else {
                browseTopic = defaultBrowseTopic;
            }

            node.items = []; // clear items

            setupClient(opcuaEndpoint.endpoint, function (err) {
                if (err) {
                    node_error(err);
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error Items: " + node.items.length,
                        source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                    });
                }
                else {
                    node.debug("Browse loading Items done ...");
                }
            });
            msg.endpoint = opcuaEndpoint.endpoint;
            msg.payload = node.items;
            node.send(msg);
        });

        function setEndpoint(msg,opcuaEndpoint,connectionOption,userIdentity) {//Used for "endpointBrowse"
            if (msg && msg.OpcUaEndpoint) {
              opcuaEndpoint = {}; // Clear old endpoint
              opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
              connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint.securityPolicy]; // || opcua.SecurityPolicy.None;
              connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint.securityMode]; // || opcua.MessageSecurityMode.None;
              //verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
              if (opcuaEndpoint.login === true) {
                userIdentity.userName = opcuaEndpoint.user;
                userIdentity.password = opcuaEndpoint.password;
                userIdentity.type = opcua.UserTokenType.UserName;
                //verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
              }
            }
            node.warn("setEndpoint:" + JSON.stringify(opcuaEndpoint));
            return [opcuaEndpoint,connectionOption,userIdentity];
          }
    }

    RED.nodes.registerType("OpcUa-Browser", OpcUaBrowserNode);
};
