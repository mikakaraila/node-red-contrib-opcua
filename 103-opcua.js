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

module.exports = function(RED) {
    "use strict";
    var RED = require(process.env.NODE_RED_HOME+"/red/red");
    var opcua = require('node-opcua');
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var async = require("async");

    function OPCUANode(n) {
        RED.nodes.createNode(this,n);
        this.endpoint = n.endpoint;
        this.port = n.port;
        this.clientid = n.clientid;
        if (this.credentials) {
            this.username = this.credentials.user;
            this.password = this.credentials.password;
        }
    }
    RED.nodes.registerType("OPCUA",OPCUANode,{
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });

    function OpcUaBrowseNode(n) {
        RED.nodes.createNode(this,n);
        this.item = n.item;         // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = n.datatype; // opcua.DataType.String;
        this.value = n.value;       // 66.6
        var node = this;
        var msg = {};
        
        node.on("input", function(msg) {
            msg.topic = node.item;
            msg.datatype = node.datatype;
            msg.payload = node.value;
            node.status({fill:"green",shape:"dot",text:msg.datatype});
            node.send(msg);
        });
    }
    RED.nodes.registerType("OpcUaBrowse",OpcUaBrowseNode);
}