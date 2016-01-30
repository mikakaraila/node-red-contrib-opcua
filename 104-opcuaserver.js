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
    // var os = require('os-utils');
	var w = require('walker');

    function OpcUaServerNode(n) {
        RED.nodes.createNode(this, n);
		
        this.name = n.name;
        this.port = n.port;
        var node = this;
		node.status({fill: "red", shape: "ring", text: "Not running"});
		
		var xmlFiles = ["node-red-contrib-opcua/public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml",
                        "node-red-contrib-opcua/public/vendor/opc-foundation/xml/Opc.ISA95.NodeSet2.xml"];
		node.warn("node set:" + xmlFiles.toString());
		
		var server = new opcua.OPCUAServer({port: node.port, nodeset_filename: xmlFiles});
		server.buildInfo.productName = "IBM Bluemix OPC UA server";
		server.buildInfo.buildNumber = "1";
		server.buildInfo.buildDate = new Date(2016, 1, 27);
		node.warn("init next...");
		
		server.initialize(function () {
			node.warn("initialized");
			/*
			server.engine.addFolder("RootFolder", {browseName: "Edison"});
			server.nodeVariable3 = server.engine.addVariable("Edison", {
				nodeId: "ns=4;s=memuse", // some opaque NodeId in namespace 4
				browseName: "Percentage Memory Used",
				dataType: "Double",
				value: {
					get: function () {
						var percentageMemUsed = 1.0 - (os.freemem() / os.totalmem());
						var value = percentageMemUsed * 100;
						return new opcua.Variant({dataType: opcua.DataType.Double, value: value});
					}
				}
			});
			*/
			node.warn("Next server start...");
		
			server.start(function () {
				node.warn("Server is now listening ... ( press CTRL+C to stop)");
				server.endpoints[0].endpointDescriptions().forEach(function (endpoint) {
					node.warn("Server:" + endpoint.endpointUrl + endpoint.securityMode.toString() + endpoint.securityPolicyUri.toString());
				});
			});
			node.status({fill: "green", shape: "dot", text: "running"});
		});
		
        node.on("input", function (msg) {
            node.warn("Add variable:" + msg.payload);
			node.warn("Listing current directory .");
			// Resolve runtime directory
			w('.')
				.filterDir(function(dir, stat) {
					if (dir === '/etc/pam.d') {
						node.warn('Skipping /etc/pam.d and children')
						return false
					}
					return true
				})
				.on('entry', function(entry, stat) {
					// node.warn('Got entry: ' + entry)
				})
				.on('dir', function(dir, stat) {
					//node.warn('Got directory: ' + dir)
				})
				.on('file', function(file, stat) {
					node.warn('Got file: ' + file)
				})
				.on('symlink', function(symlink, stat) {
					node.log('Got symlink: ' + symlink)
				})
				.on('blockDevice', function(blockDevice, stat) {
					node.log('Got blockDevice: ' + blockDevice)
				})
				.on('fifo', function(fifo, stat) {
					node.log('Got fifo: ' + fifo)
				})
				.on('socket', function(socket, stat) {
					node.log('Got socket: ' + socket)
				})
				.on('characterDevice', function(characterDevice, stat) {
					node.log('Got characterDevice: ' + characterDevice)
				})
				.on('error', function(er, entry, stat) {
					node.error('Got error ' + er + ' on entry ' + entry)
				})
				.on('end', function() {
					node.warn('All files traversed.')
				})
			node.send(msg);
		});
        node.on("close", function () {
			node.log("closing...");
			//server.stop();
        });
		
    }
    RED.nodes.registerType("OpcUaServer", OpcUaServerNode);
};
