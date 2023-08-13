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
'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const chalk_1 = __importDefault(require("chalk"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const node_opcua_1 = require("node-opcua");
/**
 * OPC UA Discovery server uses default port 4840 for the discovery
 *
 * @param RED
 */
/* eslint-disable-next-line */
const UaDiscovery = (RED) => {
    function UaDiscoveryNodeConstructor(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        /* eslint-disable-next-line */
        const node = this;
        const xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml')]; // Standard & basic types
        const certificateManager = new node_opcua_1.OPCUACertificateManager({
            rootFolder: path.join(path.dirname(__dirname), "./Discovery"),
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
                maxSessions: 20
            },
            serverInfo: {
                applicationUri: (0, node_opcua_1.makeApplicationUrn)(os.hostname(), "Node-Red-OPCUA-Discovery"),
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
            buildNumber: "0.2.310",
            buildDate: "2023-03-13T16:30:00"
        };
        const server = new node_opcua_1.OPCUADiscoveryServer(server_options);
        const hostname = os.hostname();
        node.debug("  server host         :" + chalk_1.default.cyan(hostname));
        node.debug("  server PID          :" + chalk_1.default.cyan(process.pid));
        (() => __awaiter(this, void 0, void 0, function* () {
            try {
                yield certificateManager.initialize();
                /* eslint-disable-next-line */
                yield server.start(function (err) {
                    if (err) {
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: "Not running, error: " + err
                        });
                        node.error("Server failed to start... error: ", err.message);
                        node.error("In Windows you can check port status with command: netstat -ano | findstr :4840");
                        node.error("UaExpert can be running and listening port");
                        // process.exit(-3);
                        return;
                    }
                    node.debug("  server on port      :" + chalk_1.default.cyan(server.endpoints[0].port.toString()));
                    node.debug("  serverInfo          :");
                    node.debug(chalk_1.default.cyan(JSON.stringify(server.serverInfo)));
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
                            " status: " + response.responseHeader.serviceResult.toString());
                    });
                    server.on("request", 
                    /* eslint-disable-next-line */
                    (request, channel) => {
                        node.debug(
                        // "Time: ", request.requestHeader.timestamp,
                        // " handle: ", request.requestHeader.requestHandle,
                        " request: " + request.schema.name);
                    });
                });
            }
            /* eslint-disable-next-line */
            catch (err) {
                node.error("Cannot start server, error: ", err.message);
                return;
            }
        }))();
        // List servers registered to discovery
        node.on("input", function (msg) {
            const discovery_server_endpointUrl = "opc.tcp://localhost:4840";
            const allservers = [];
            node.debug("Interrogating " + discovery_server_endpointUrl);
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { servers, endpoints } = yield (0, node_opcua_1.findServers)(discovery_server_endpointUrl);
                    // Servers on network
                    node.debug("--------------------------------------------------------------");
                    for (const server of servers) {
                        node.debug("     applicationUri:" + chalk_1.default.cyan.bold(server.applicationUri));
                        node.debug("         productUri:" + chalk_1.default.cyan.bold(server.productUri));
                        node.debug("    applicationName:" + chalk_1.default.cyan.bold(server.applicationName.text));
                        // node.debug("               type:", chalk.cyan.bold(ApplicationType[server.applicationType]));
                        node.debug("   gatewayServerUri:" + server.gatewayServerUri ? chalk_1.default.cyan.bold(server.gatewayServerUri) : "");
                        node.debug("discoveryProfileUri:" + server.discoveryProfileUri ? chalk_1.default.cyan.bold(server.discoveryProfileUri) : "");
                        node.debug("      discoveryUrls:");
                        if (server && server.discoveryUrls) {
                            for (const discoveryUrl of server.discoveryUrls) {
                                node.debug("                    " + chalk_1.default.cyan.bold(discoveryUrl));
                                if (discoveryUrl) {
                                    allservers.push(discoveryUrl);
                                }
                            }
                        }
                        node.debug("--------------------------------------------------------------");
                    }
                    // Registered server endpoints
                    for (const endpoint of endpoints) {
                        if (endpoint && endpoint.endpointUrl) {
                            node.debug(endpoint.endpointUrl.toString() + ": " + endpoint.securityLevel + " " + endpoint.securityPolicyUri + " " + endpoint.securityMode);
                        }
                        // allservers.push(endpoint);
                    }
                    // node.debug("Registered servers: " + JSON.stringify(allservers));
                    msg.payload = allservers;
                    node.send(msg);
                }
                /* eslint-disable-next-line */
                catch (err) {
                    node.debug("error: " + err.message);
                    // process.exit(-2);
                    return;
                }
            }))();
        });
        node.on("close", function () {
            server.shutdown(() => {
                node.debug(" shutting down completed ");
            });
        });
    }
    RED.nodes.registerType("OpcUa-Discovery", UaDiscoveryNodeConstructor);
};
module.exports = UaDiscovery;
//# sourceMappingURL=109-opcuadiscovery.js.map