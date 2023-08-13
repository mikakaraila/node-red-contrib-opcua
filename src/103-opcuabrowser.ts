/**

 Copyright 2021 Valmet Automation Inc.

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

import {
    NodeInitializer
} from "node-red";

import {
    AttributeIds,
    OPCUAClient,
    SecurityPolicy,
    MessageSecurityMode,
    UserTokenType,
    DataType,
    UserIdentityInfo,
    OPCUAClientOptions
} from "node-opcua";

import {
    UaBrowserDef, UaBrowserNode
} from "./103-opcuabrowserdef";

// NEW: Start from https://github.com/alexk111/node-red-node-typescript-starter
// TESTS: https://github.com/node-red/node-red-node-test-helper

/* eslint-disable-next-line */
const UaBrowserNode: NodeInitializer = (RED): void => {
    function UaBrowserNodeConstructor(
        this: UaBrowserNode,
        config: UaBrowserDef
    ): void {
        RED.nodes.createNode(this, config);
 
        /* eslint-disable-next-line */
        this.item = config.item; // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = config.datatype; // String;
        this.topic = config.topic; // ns=3;s=MyVariable from input
        this.items = config.items;
        this.name = config.name;
        /* eslint-disable-next-line */
        const node = this;
        // node.name = "OPC UA Browser";
        let browseTopic = "ns=0;i=85"; // Default root, server Objects
        /* eslint-disable-next-line */
        let opcuaEndpoint:any = RED.nodes.getNode(config.endpoint);
        let connectionOption: OPCUAClientOptions = {};
        let userIdentity: UserIdentityInfo = {
            type: UserTokenType.Anonymous
        };
        
        if (opcuaEndpoint.securityPolicy) {
            connectionOption.securityPolicy = SecurityPolicy[opcuaEndpoint.securityPolicy];
        }
        else {
            connectionOption.securityPolicy = SecurityPolicy.None;
        }
        if (opcuaEndpoint.securityMode) {
            connectionOption.securityMode = MessageSecurityMode[opcuaEndpoint.securityMode];
        }
         else {
            connectionOption.securityMode = MessageSecurityMode.None;
        }
        connectionOption["endpointMustExist"] = false;
     
        if (opcuaEndpoint.login && userIdentity) {
          userIdentity = {
            password: opcuaEndpoint.credentials.user,
            userName: opcuaEndpoint.credentials.password,
            type: UserTokenType.UserName
          };
          // userIdentity.userName = opcuaEndpoint.credentials.user;
          // userIdentity.password = opcuaEndpoint.credentials.password;
          // userIdentity.type = UserTokenType.UserName; // New TypeScript API parameter
        }
     
        node.status({
            fill: "grey",
            shape: "dot",
            text: "no Items",
            // source: { id: node.id, type: node.type, name: "OPC UA Browser"}
        });
        /* eslint-disable-next-line */
        node.add_item = function (item) {
            if (item) {
                if (!node.items) {
                    node.items = []; // new Array();
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
            const client = OPCUAClient.create(connectionOption);
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
                if (browseResult.references) {
                    for(const reference of browseResult.references)
                    {
                        const ref_obj = Object.assign({}, reference);
                        const dataValue = await session.read({nodeId: ref_obj.nodeId, attributeId: AttributeIds.Value});
                        ref_obj["value"] = dataValue.value.value;
                        ref_obj["dataType"] = DataType[dataValue.value.dataType];
                        node.add_item(ref_obj);
                    }
                }
                node.status({
                            fill: "green",
                            shape: "dot",
                            text: "Items: " + node.items.length,
                            // source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                        });
                        
                //step 5 close session
                node.debug("sending items " + node.items.length);
                /* eslint-disable-next-line */
                const msg:any = {
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
                    // source: { id: node.id, type: node.type, name: "OPC UA Browser"}
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
                    // source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                });
            }
            else {
                node.debug("Browse loading Items done...");
            }
        });
        /* eslint-disable-next-line */
        node.on("input", function (msg: any) {
            browseTopic = "";
            node.debug("input browser");
            /* eslint-disable-next-line */
            if (msg.payload.hasOwnProperty('actiontype')) {
                switch (msg.payload.actiontype) {
                    case 'browse':
                        /* eslint-disable-next-line */
                        if (msg.payload.hasOwnProperty('root')) {
                            /* eslint-disable-next-line */
                            if (msg.payload.root && msg.payload.root.hasOwnProperty('item')) {
                                /* eslint-disable-next-line */
                                if (msg.payload.root.item.hasOwnProperty('nodeId')) {
                                    browseTopic = browse_by_item(msg.payload.root.item.nodeId);
                                }
                            }
                        }
                        break;
                    case 'endpointBrowse':
                        node.warn("endpointBrowse");
                        /* eslint-disable-next-line */
                        if (msg.hasOwnProperty('OpcUaEndpoint')) {
                            [opcuaEndpoint,connectionOption,userIdentity]=setEndpoint(msg,opcuaEndpoint,connectionOption,userIdentity);
                            browseTopic = msg.topic;
                        }
                        break;
                    default:
                        break;
                }
            } else {
                if (!node.topic && msg.topic) {
                    if (msg.topic) {
                        browseTopic = msg.topic;
                    }
                } else {
                    browseTopic = node.topic;
                }
            }

            node.items = []; // clear items

            if (!browseTopic) {
                browseTopic = browse_to_root();
            }

            setupClient(opcuaEndpoint.endpoint, function (err) {
                if (err) {
                    node_error(err);
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error Items: " + node.items.length,
                        // source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                    });
                }
                else {
                    node.debug("Browse loading Items done ...");
                }
            });
            msg["endpoint"] = opcuaEndpoint.endpoint;
            msg.payload = node.items;
            node.send(msg);
        });

        function browse_by_item(nodeId) {
            node.debug("Browse to root " + nodeId);
            return nodeId;
        }

        function browse_to_root() {
            node.warn("Browse to root Objects");
            return "ns=0;i=85"; // OPC UA Root Folder Objects
        }

        function setEndpoint(msg,opcuaEndpoint,connectionOption,userIdentity) {//Used for "endpointBrowse"
            if (msg && msg.OpcUaEndpoint) {
              opcuaEndpoint = {}; // Clear old endpoint
              opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
              connectionOption.securityPolicy = SecurityPolicy[opcuaEndpoint.securityPolicy]; // || opcua.SecurityPolicy.None;
              connectionOption.securityMode = MessageSecurityMode[opcuaEndpoint.securityMode]; // || opcua.MessageSecurityMode.None;
              //verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
              if (opcuaEndpoint.login === true) {
                userIdentity.userName = opcuaEndpoint.user;
                userIdentity.password = opcuaEndpoint.password;
                userIdentity.type = UserTokenType.UserName;
                //verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
              }
            }
            node.warn("setEndpoint:" + JSON.stringify(opcuaEndpoint));
            return [opcuaEndpoint,connectionOption,userIdentity];
          }
    }

    RED.nodes.registerType("OpcUa-Browser", UaBrowserNodeConstructor);
};

export = UaBrowserNode;