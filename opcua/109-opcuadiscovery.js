/**

 Copyright 2023 Valmet Automation Inc.

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

'use strict'


/**
 * OPC UA Discovery server uses default port 4840 for the discovery
 *
 * @param RED
 */
module.exports = function (RED) {
  const opcua = require('node-opcua');
  const utils = require("./utils");
  const path = require('path');
  const os = require('os');
  const chalk = require("chalk");

  function OPCUADiscoveryNode(n) {
    RED.nodes.createNode(this, n)
    this.name = n.name;
    var node = this;
    var xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml')]; // Standard & basic types

    const certificateManager = new opcua.OPCUACertificateManager({
      rootFolder: path.join(path.dirname(__dirname), "./Discovery"), // Own PKI storage for discovery LDS certificates
      automaticallyAcceptUnknownCertificate: true // TODO implement configuration / argument option to turn this on/off
    });

    const server_options = {
      port: 4840,
      // resourcePath: "UADiscovery", // Do not use this, most of servers / client expect discovery is on port 4840 directly
      nodeset_filename: xmlFiles,
      buildInfo: {
        buildNumber: "",
        buildDate: ""
      },
      serverCapabilities: {
        maxBrowseContinuationPoints: 10,
        maxHistoryContinuationPoints: 10,
        maxSession: 20
      },
      serverInfo: {
        applicationUri: opcua.makeApplicationUrn(os.hostname(), "Node-Red-OPCUA-Discovery"),
        productUri: "Node-Red-OPCUA-Discovery",
        applicationName: {
          text: "Node-Red-OPCUA-Discovery",
          locale: "en"
        },
        gatewayServerUri: null,
        discoveryProfileUri: null,
        discoveryUrls: []
      }
    };

    server_options.buildInfo = {
      buildNumber: "0.2.297",
      buildDate: "2023-02-12T13:17:00"
    };
    const server = new opcua.OPCUADiscoveryServer(server_options);
    const hostname = os.hostname();
    node.debug("  server host         :" + chalk.cyan(hostname));
    node.debug("  server PID          :" + chalk.cyan(process.pid));
    (async () => {
      try {
        await certificateManager.initialize();
        await server.start(function (err) {
          if (err) {
            node.status({
              fill: "red",
              shape: "ring",
              text: "Not running, error: " + err
          });
            node.error("Server failed to start... error: ", err);
            node.error("In Windows you can check port status with command: netstat -ano | findstr :4840");
            node.error("UaExpert can be running and listening port");
            // process.exit(-3);
            return;
          }
          node.debug("  server on port      :" + chalk.cyan(server.endpoints[0].port.toString()));
          node.debug("  serverInfo          :");
          node.debug(chalk.cyan(JSON.stringify(server.serverInfo)));
          node.debug("Discovery server now waiting for server register calls. CTRL+C to stop");
          node.status({
            fill: "green",
            shape: "dot",
            text: "Discovery on port: " + server.endpoints[0].port.toString()
          });

          server.on("response", (response) => {
            node.debug(
              // "Time: ", response.responseHeader.timestamp, " handle: ", response.responseHeader.requestHandle,
              // Show messages
              " request: " + response.schema.name +
              " status: " + response.responseHeader.serviceResult.toString()
            );
          });

          server.on(
            "request",
            (request, channel) => {
              node.debug(
                // "Time: ", request.requestHeader.timestamp,
                // " handle: ", request.requestHeader.requestHandle,
                " request: " + request.schema.name,
                // " channel ID: ", channel.channelId.toString()
              );
            }
          );
        });
      } catch (err) {
        node.error("Cannot start server, error: ", err);
        return;
      }
    })();

    // List servers registered to discovery
    node.on("input", function (msg) {
      const discovery_server_endpointUrl = "opc.tcp://localhost:4840";
      const allservers = [];
      node.debug("Interrogating ", discovery_server_endpointUrl);
      (async () => {
        try {
          const { servers, endpoints } = await opcua.findServers(discovery_server_endpointUrl);
          // Servers on network
          node.debug("--------------------------------------------------------------");
          for (const server of servers) {
            node.debug("     applicationUri:", chalk.cyan.bold(server.applicationUri));
            node.debug("         productUri:", chalk.cyan.bold(server.productUri));
            node.debug("    applicationName:", chalk.cyan.bold(server.applicationName.text));
            // node.debug("               type:", chalk.cyan.bold(ApplicationType[server.applicationType]));
            node.debug("   gatewayServerUri:", server.gatewayServerUri ? chalk.cyan.bold(server.gatewayServerUri) : "");
            node.debug("discoveryProfileUri:", server.discoveryProfileUri ? chalk.cyan.bold(server.discoveryProfileUri) : "");
            node.debug("      discoveryUrls:");
            for (const discoveryUrl of server.discoveryUrls) {
              node.debug("                    " + chalk.cyan.bold(discoveryUrl));
              allservers.push(discoveryUrl);
            }
            node.debug("--------------------------------------------------------------");
          }
          // Registered server endpoints
          for (const endpoint of endpoints) {
            node.debug(endpoint.endpointUrl.toString(), endpoint.securityLevel, endpoint.securityPolicyUri, endpoint.securityMode);
            // allservers.push(endpoint);
          }
          // node.debug("Registered servers: " + JSON.stringify(allservers));
          msg.payload = allservers;
          node.send(msg);
        } catch (err) {
          node.debug("err ", err.message);
          // process.exit(-2);
          return;
        }
      })();
    });

    node.on("close", function () {
      server.shutdown(() => {
        node.debug(" shutting down completed ");
      });
    });
  }

  RED.nodes.registerType("OpcUa-Discovery", OPCUADiscoveryNode);
}