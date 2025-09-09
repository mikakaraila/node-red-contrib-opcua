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

    function OpcUaBrowserNode(config) {

        RED.nodes.createNode(this, config);

        this.item = config.item; // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = config.datatype; // String;
        this.topic = config.topic;
        this.items = config.items;
        this.name = config.name;

        const objectsFolderNodeId = "ns=0;i=85"; // Default root, server Objects

        var node = this;
        // node.name = "OPC UA Browser";

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
     
        connectionOption.clientCertificateManager = createClientCertificateManager();

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

        async function setupClient(url, nodeIdToBrowse, callback) {

            if(!nodeIdToBrowse) return;

            // new OPC UA Client and browse from Objects ns=0;s=Objects
            const client = opcua.OPCUAClient.create(connectionOption);
            try
            {
                // step 0 : init clientCertificateManager
                try {
                    await client.clientCertificateManager.initialize();
                }
                catch (error1) {
                    set_node_status_to("invalid certificate");
                    let msg = {};
                    msg.error = {};
                    msg.error.message = "Certificate error: " + error1.message;
                    msg.error.source = this;
                    node.error("Certificate error", msg);
                }
                node.debug(chalk.yellow("Trusted folder:      ") + chalk.cyan(client?.clientCertificateManager?.trustedFolder));
                node.debug(chalk.yellow("Rejected folder:     ") + chalk.cyan(client?.clientCertificateManager?.rejectedFolder));
                node.debug(chalk.yellow("Crl folder:          ") + chalk.cyan(client?.clientCertificateManager?.crlFolder));
                node.debug(chalk.yellow("Issuers Cert folder: ") + chalk.cyan(client?.clientCertificateManager?.issuersCertFolder));
                node.debug(chalk.yellow("Issuers Crl folder:  ") + chalk.cyan(client?.clientCertificateManager?.issuersCrlFolder));

                // step 1 : connect to
                await client.connect(url);
                node.debug("start browse client on " + opcuaEndpoint.endpoint);
                
                // step 2 : createSession
                const session = await client.createSession(userIdentity);
                node.debug("start browse session on " + opcuaEndpoint.endpoint);
                
                // step 3 : browse
                node.debug("nodeIdBrowse:" + nodeIdToBrowse);
                const browseResult = await session.browse(nodeIdToBrowse);
        
                
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
                node.debug("close browse session");
                await session.close();

                // Set status notification browse done
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Done",
                    source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                });

                return node.items;
            }
            catch(err)
            {
                callback(err);
            }
            if (client) {
                client.disconnect();
            }
        }

        setupClient(opcuaEndpoint.endpoint, null, function (err) {
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
            node.debug("input browser");

            node.items = [];
         
            let nodeToBrowse = msg.topic ? msg.topic : node.topic;
            if(!nodeToBrowse) nodeToBrowse = objectsFolderNodeId;
            
            var validNodeId = opcua.isValidNodeId(opcua.resolveNodeId(nodeToBrowse));
            if(!validNodeId) return;

            setupClient(opcuaEndpoint.endpoint, nodeToBrowse, function (err) {
                if (err) {
                    node_error(err);
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error Items: " + (node.items?.length || 0),
                        source: { id: node.id, type: node.type, name: "OPC UA Browser"}
                    });
                }
                else {
                    node.debug("Browse loading Items done ...");
                }
            }).then((items) =>{
                node.items = items;
                msg.endpoint = opcuaEndpoint.endpoint;
                msg.payload = items;
                node.send(msg);
            });
        });
    }

    RED.nodes.registerType("OpcUa-Browser", OpcUaBrowserNode);
};
