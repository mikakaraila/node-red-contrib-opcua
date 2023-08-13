"use strict";
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
const node_opcua_1 = require("node-opcua");
const node_opcua_client_crawler_1 = require("node-opcua-client-crawler");
const chalk_1 = __importDefault(require("chalk"));
const opcua_basics_1 = require("./opcua-basics"); // collectAlarmFields
const node_opcua_file_transfer_1 = require("node-opcua-file-transfer");
const async = __importStar(require("async"));
// import * as treeify from "treeify";
// import * as Map from "es6-map";
// import * as path from "path";
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const lodash_clonedeep_1 = require("lodash.clonedeep");
// import * as subscription_service from "node-opcua-service-subscription";
const utils_1 = require("./utils");
const node_opcua_crypto_1 = require("node-opcua-crypto");
const flatted_1 = require("flatted");
/*
// Check node crawler TypeScript client implementation
import { CacheNode, CacheNodeVariable, CacheNodeVariableType } from "./cache_node";
import { TaskReconstruction, EmptyCallback, removeCycle } from "./private";
type Queue = async.QueueObject<TaskReconstruction>;
*/
/* eslint-disable-next-line */
const UaClient = (RED) => {
    function UaClientNodeConstructor(n) {
        RED.nodes.createNode(this, n);
        /* eslint-disable-next-line */
        // const node: any = this;
        this.name = n.name;
        this["action"] = n.action;
        const originalAction = n.action;
        this["time"] = n.time;
        this["timeUnit"] = n.timeUnit;
        this["deadbandtype"] = n.deadbandtype;
        this["deadbandvalue"] = n.deadbandvalue;
        this["certificate"] = n.certificate; // n == NONE, l == Local file, e == Endpoint, u == Upload
        this["localfile"] = n.localfile; // Local certificate file
        this["localkeyfile"] = n.localkeyfile; // Local private key file
        this["folderName4PKI"] = n.folderName4PKI; // Storage folder for PKI and certificates
        this["useTransport"] = n.useTransport;
        this["maxChunkCount"] = n.maxChunkCount;
        this["maxMessageSize"] = n.maxMessageSize;
        this["receiveBufferSize"] = n.receiveBufferSize;
        this["sendBufferSize"] = n.sendBufferSize;
        // this.upload = n.upload; // Upload
        // this.certificate_filename = n.certificate_filename;
        // this.certificate_data = n.certificate_data;
        /* eslint-disable-next-line */
        const node = this;
        let opcuaEndpoint = RED.nodes.getNode(n.endpoint);
        let userIdentity;
        const connectionOption = {};
        /* eslint-disable-next-line */
        let cmdQueue = []; // queue msgs which can currently not be handled because session is not established, yet and currentStatus is 'connecting'
        let currentStatus = ''; // the status value set set by node.status(). Didn't find a way to read it back.
        /* eslint-disable-next-line */
        let multipleItems = []; // Store & read multiple nodeIds
        /* eslint-disable-next-line */
        let writeMultipleItems = []; // Store & write multiple nodeIds & values
        connectionOption.securityPolicy = node_opcua_1.SecurityPolicy[opcuaEndpoint.securityPolicy] || node_opcua_1.SecurityPolicy.None;
        connectionOption.securityMode = node_opcua_1.MessageSecurityMode[opcuaEndpoint.securityMode] || node_opcua_1.MessageSecurityMode.None;
        const userCertificate = opcuaEndpoint.usercertificate;
        const userPrivatekey = opcuaEndpoint.userprivatekey;
        if (node["folderName4PKI"] && node["folderName4PKI"].length > 0) {
            verbose_log("Node: " + node.name + " using own PKI folder:" + node["folderName4PKI"]);
        }
        connectionOption.clientCertificateManager = (0, utils_1.createCertificateManager)(true, node["folderName4PKI"]); // AutoAccept certificates, TODO add to client node as parameter if really needed
        if (node["certificate"] === "l" && node["localfile"]) {
            verbose_log("Using 'own' local certificate file " + node["localfile"]);
            // User must define absolute path
            const certfile = node["localfile"];
            const keyfile = node["localkeyfile"];
            connectionOption.certificateFile = certfile;
            connectionOption.privateKeyFile = keyfile;
            if (!fs.existsSync(certfile)) {
                node_error("Local certificate file not found: " + certfile);
            }
            if (!fs.existsSync(keyfile)) {
                node_error("Local private key file not found: " + keyfile);
            }
        }
        // Moved needed options to client create
        connectionOption.requestedSessionTimeout = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(300, "s");
        // DO NOT USE must be NodeOPCUA-Client !! connectionOption.applicationName = node.name; // Application name
        connectionOption.clientName = node.name; // This is used for the session names
        connectionOption.endpointMustExist = false;
        connectionOption.defaultSecureTokenLifetime = 40000 * 5;
        // From the node UI, keep min values!
        /*
        // Needed or not?
        if (node.maxChunkCount < 1) node.maxChunkCount = 1;
        if (node.maxMessageSize < 8192) node.maxMessageSize = 8192;
        if (node.receiveBufferSize < 8 * 1024) node.receiveBufferSize = 8 * 1024;
        if (node.sendBufferSize < 8 * 1024) node.sendBufferSize = 8 * 1024;
        */
        const transportSettings = {
            maxChunkCount: node["maxChunkCount"],
            maxMessageSize: node["maxMessageSize"],
            receiveBufferSize: node["receiveBufferSize"],
            sendBufferSize: node["sendBufferSize"] // 8 * 1024
        };
        if (node["useTransport"]) {
            verbose_log(chalk_1.default.yellow("Using, transport settings: ") + chalk_1.default.cyan(JSON.stringify(transportSettings)));
            connectionOption.transportSettings = transportSettings;
        }
        // connectionOption.transportSettings.maxChunkCount = transportSettings.maxChunkCount;
        // connectionOption.transportSettings.maxMessageSize = transportSettings.maxMessageSize;
        // connectionOption.transportSettings.receiveBufferSize = transportSettings.receiveBufferSize;
        // connectionOption.transportSettings.sendBufferSize = transportSettings.sendBufferSize;
        connectionOption.connectionStrategy = {
            maxRetry: 10512000,
            initialDelay: 5000,
            maxDelay: 30 * 1000 // 30s
        };
        // connectionOption["keepSessionAlive"] = true; // DO NOT USE can cause unstable reconnection
        // verbose_log("Connection options:" + JSON.stringify(connectionOption));
        // verbose_log("EndPoint: " + JSON.stringify(opcuaEndpoint));
        // Ensure Anonymous login
        if (connectionOption.securityMode === node_opcua_1.SecurityPolicy.None || opcuaEndpoint["none"] === true) {
            userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        }
        if (opcuaEndpoint["login"] === true && opcuaEndpoint["usercert"] === true) {
            userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        }
        if (opcuaEndpoint["login"] === true && opcuaEndpoint["usercert"] === true) {
            node.error("Cannot use username & password & user certificate at the same time!");
        }
        if (opcuaEndpoint["login"] === true && connectionOption.securityMode != node_opcua_1.SecurityPolicy.None) {
            userIdentity = { "type": node_opcua_1.UserTokenType.UserName,
                "userName": opcuaEndpoint.credentials["user"].toString(),
                "password": opcuaEndpoint.credentials["password"].toString()
            };
            verbose_log(chalk_1.default.green("Using UserName & password: ") + chalk_1.default.cyan((0, flatted_1.stringify)(userIdentity)));
            // verbose_log(chalk.green("Connection options: ") + chalk.cyan(JSON.stringify(connectionOption))); // .substring(0,75) + "...");
        }
        else if (opcuaEndpoint["usercert"] === true) {
            if (!fs.existsSync(userCertificate)) {
                node.error("User certificate file not found: " + userCertificate);
            }
            const certificateData = (0, node_opcua_crypto_1.readCertificate)(userCertificate);
            if (!fs.existsSync(userPrivatekey)) {
                node.error("User private key file not found: " + userPrivatekey);
            }
            const privateKey = (0, node_opcua_crypto_1.readPrivateKeyPEM)(userPrivatekey);
            userIdentity = {
                certificateData,
                privateKey,
                type: node_opcua_1.UserTokenType.Certificate // User certificate
            };
            // console.log("CASE User certificate UserIdentity: " + JSON.stringify(userIdentity));
            // connectionOption = {};
            // connectionOption.endpointMustExist = false;
        }
        else {
            userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
            // console.log("CASE Anonymous UserIdentity: " + JSON.stringify(userIdentity));
            // console.log("         connection options: " + JSON.stringify(connectionOption).substring(0,75) + "...");
        }
        verbose_log(chalk_1.default.green("UserIdentity: ") + chalk_1.default.cyan(JSON.stringify(userIdentity)));
        /* eslint-disable-next-line */
        let items = [];
        let subscription; // only one subscription needed to hold multiple monitored Items
        const monitoredItems = new Map();
        function node_error(err) {
            //console.error(chalk.red("Client node error on: " + node.name + " error: " + stringify(err)));
            node.error(chalk_1.default.red("Client node error on: " + node.name + " error: " + (0, flatted_1.stringify)(err)));
        }
        function verbose_warn(logMessage) {
            //if (RED.settings.verbose) {
            // console.warn(chalk.yellow((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage));
            node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage);
            //}
        }
        function verbose_log(logMessage) {
            //if (RED.settings.verbose) {
            // console.log(chalk.cyan(logMessage));
            // node.log(logMessage); // settings.js log level info
            node.debug(logMessage);
            //}
        }
        function getBrowseName(_session, nodeId) {
            return __awaiter(this, void 0, void 0, function* () {
                const dataValue = yield _session.read({
                    attributeId: node_opcua_1.AttributeIds.BrowseName,
                    nodeId
                });
                if (dataValue.statusCode.isGood()) {
                    const browseName = dataValue.value.value.name;
                    return browseName;
                }
                else {
                    return "???";
                }
            });
        }
        // Fields selected alarm fields
        // EventFields same order returned from server array of variants (filled or empty)
        function __dumpEvent(node, session, fields, eventFields, _callback) {
            return __awaiter(this, void 0, void 0, function* () {
                /* eslint-disable-next-line */
                const msg = {};
                msg.payload = {};
                msg.topic = "";
                verbose_log(chalk_1.default.yellow("Event Fields: ") + chalk_1.default.cyan(JSON.stringify(eventFields)));
                set_node_status_to("active event");
                for (let i = 0; i < eventFields.length; i++) {
                    const variant = eventFields[i];
                    let fieldName = fields[i];
                    verbose_log(chalk_1.default.yellow("Event Field: ") + chalk_1.default.cyan(fieldName) + " " + chalk_1.default.cyan((0, flatted_1.stringify)(variant)));
                    // Check if variant is NodeId and then get qualified name (browseName)
                    if (variant && variant.dataType && variant.dataType === node_opcua_1.DataType.NodeId) {
                        fieldName = yield getBrowseName(session, variant.value);
                    }
                    if (!variant || variant.dataType === node_opcua_1.DataType.Null || !variant.value) {
                        verbose_log(chalk_1.default.red("No variant or variant dataType is Null or no variant value! Variant: ") + chalk_1.default.cyan(JSON.stringify(variant)));
                    }
                    else {
                        if (fieldName === "EventId" && variant && variant.value) {
                            msg.payload[fieldName] = "0x" + variant.value.toString("hex"); // As in UaExpert
                            msg.payload["_" + fieldName] = variant; // Keep as ByteString
                        }
                        else {
                            msg.payload[fieldName] = (0, opcua_basics_1.cloneObject)(variant.value);
                        }
                        // if available, needed for Acknowledge function in client
                        if (fieldName === "ConditionId" && variant && variant.value) {
                            msg.topic = variant.value.toString();
                        }
                    }
                }
                // Set message topic
                if (eventFields.length === 0) {
                    msg.topic = "No EventFields";
                }
                // if available, needed for Acknowledge function in client
                else if (msg.payload.ConditionId) {
                    msg.topic = msg.payload.ConditionId.toString();
                }
                else if (msg.payload.EventId) {
                    msg.topic = msg.payload.EventId.toString(); // Set then this can be used to Acknowledge event
                }
                else {
                    if (msg.payload.EventType) {
                        msg.topic = msg.payload.EventType.toString();
                    }
                }
                verbose_log(chalk_1.default.yellow("Event message topic: ") + chalk_1.default.cyan(msg.topic));
                node.send(msg);
                _callback();
            });
        }
        /* eslint-disable-next-line */
        const eventQueue = async.queue(function (task, callback) {
            __dumpEvent(task.node, task.session, task.fields, task.eventFields, callback);
        });
        /*
        let eventQueue = new async.queue(function (task, callback) {
          __dumpEvent(task.node, task.session, task.fields, task.eventFields, callback);
        });
        */
        function dumpEvent(node, session, fields, eventFields, _callback) {
            eventQueue.push({
                node: node,
                session: session,
                fields: fields,
                eventFields: eventFields,
                _callback: _callback
            });
        }
        // Listener functions that can be removed on reconnect
        const reestablish = function () {
            // verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! Node: " + node.name);
            set_node_status2_to("connected", "re-established");
        };
        const backoff = function (attempt, delay) {
            // verbose_warn("backoff  attempt #" + attempt + " retrying in " + delay / 1000.0 + " seconds. Node:  " + node.name + " " + opcuaEndpoint.endpoint);
            /* eslint-disable-next-line */
            const msg = {};
            msg.error = {};
            msg.error.message = "reconnect";
            msg.error.source = node.name; // this;
            node.error("reconnect", msg);
            set_node_status2_to("reconnect", "attempt #" + attempt + " retry in " + delay / 1000.0 + " sec");
        };
        const reconnection = function () {
            // verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting Reconnection !!!!!!!!!!!!!!!!!!! Node: " + node.name);
            set_node_status2_to("reconnect", "starting...");
        };
        function create_opcua_client(callback) {
            // node["client"] = null;
            // verbose_log("Create Client: " + stringify(connectionOption).substring(0,75) + "...");
            try {
                // Use empty 0.0.0.0 address as "no client" initial value
                if (opcuaEndpoint["endpoint"].indexOf("opc.tcp://0.0.0.0") == 0) {
                    items = [];
                    node["items"] = items;
                    set_node_status_to("no client");
                    if (callback) {
                        callback();
                    }
                    return;
                }
                // Normal client
                // verbose_log(chalk.green("1) CREATE CLIENT: ") + chalk.cyan(stringify(connectionOption))); // .substring(0,75) + "..."));
                const options = {
                    securityMode: connectionOption.securityMode,
                    securityPolicy: connectionOption.securityPolicy,
                    defaultSecureTokenLifetime: connectionOption.defaultSecureTokenLifetime,
                    endpointMustExist: connectionOption.endpointMustExist,
                    connectionStrategy: connectionOption.connectionStrategy,
                    keepSessionAlive: true,
                    requestedSessionTimeout: 60000 * 5, // 5min, default 1min
                    // transportSettings: transportSettings // Some 
                };
                if (node["useTransport"] === true) {
                    options["transportSettings"] = transportSettings;
                }
                verbose_log(chalk_1.default.green("1) CREATE CLIENT: ") + chalk_1.default.cyan((0, flatted_1.stringify)(options)));
                // node.client = OPCUAClient.create(connectionOption); // Something extra?
                node["client"] = node_opcua_1.OPCUAClient.create(options);
                node["client"].on("connection_reestablished", reestablish);
                node["client"].on("backoff", backoff);
                node["client"].on("start_reconnection", reconnection);
            }
            /* eslint-disable-next-line */
            catch (err) {
                node_error("Cannot create client, check connection options, error: " + err.message); // stringify(options)); // connectionOption
            }
            items = [];
            node["items"] = items;
            set_node_status_to("create client");
            if (callback) {
                callback();
            }
        }
        function reset_opcua_client(callback) {
            if (node["client"]) {
                node["client"].disconnect(function () {
                    verbose_log("Client disconnected!");
                    create_opcua_client(callback);
                });
            }
        }
        function close_opcua_client(message, error) {
            if (node["client"]) {
                node.client.removeListener("connection_reestablished", reestablish);
                node.client.removeListener("backoff", backoff);
                node.client.removeListener("start_reconnection", reconnection);
                try {
                    if (!node.client.isReconnecting) {
                        node.client.disconnect(function () {
                            // node.client = null;
                            verbose_log("Client disconnected!");
                            if (error === 0) {
                                set_node_status_to("closed");
                            }
                            else {
                                set_node_errorstatus_to(message, error);
                                node.error("Client disconnected & closed: " + message + " error: " + error.toString());
                            }
                        });
                    }
                    else {
                        // node.client = null;
                        set_node_status_to("closed");
                    }
                }
                catch (err) {
                    node_error("Error on disconnect: " + (0, flatted_1.stringify)(err));
                }
            }
        }
        function set_node_status_to(statusValue) {
            verbose_log(chalk_1.default.yellow("Client status: ") + chalk_1.default.cyan(statusValue));
            const statusParameter = (0, opcua_basics_1.get_node_status)(statusValue);
            currentStatus = statusValue;
            node.status({
                fill: statusParameter.fill,
                shape: statusParameter.shape,
                text: statusParameter.status
            });
        }
        function set_node_status2_to(statusValue, message) {
            verbose_log(chalk_1.default.yellow("Client status: ") + chalk_1.default.cyan(statusValue));
            const statusParameter = (0, opcua_basics_1.get_node_status)(statusValue);
            currentStatus = statusValue;
            node.status({
                fill: statusParameter.fill,
                shape: statusParameter.shape,
                text: statusParameter.status + " " + message
            });
        }
        function set_node_errorstatus_to(statusValue, error) {
            verbose_log("Client status: " + statusValue);
            const statusParameter = (0, opcua_basics_1.get_node_status)(statusValue);
            currentStatus = statusValue;
            if (!error) {
                error = "";
            }
            node.status({
                fill: statusParameter.fill,
                shape: statusParameter.shape,
                text: statusParameter.status + " " + error
            });
        }
        function connect_opcua_client() {
            return __awaiter(this, void 0, void 0, function* () {
                // Refactored from old async Javascript to new Typescript with await
                let session;
                // STEP 1
                // First connect to server´s endpoint
                if (opcuaEndpoint && opcuaEndpoint["endpoint"]) {
                    verbose_log(chalk_1.default.yellow("Connecting to endpoint: ") + chalk_1.default.cyan(opcuaEndpoint["endpoint"]));
                }
                else {
                    node_error("No client endpoint listed! Waiting...");
                    return;
                }
                if (opcuaEndpoint["endpoint"].indexOf("opc.tcp://0.0.0.0") === 0) {
                    set_node_status_to("no client");
                }
                else {
                    set_node_status_to("connecting");
                }
                if (!node.client) {
                    verbose_log("No client to connect...");
                    return;
                }
                verbose_log(chalk_1.default.yellow("Exact endpointUrl: ") + chalk_1.default.cyan(opcuaEndpoint["endpoint"]) + chalk_1.default.yellow(" hostname: ") + chalk_1.default.cyan(os.hostname()));
                try {
                    yield node.client.clientCertificateManager.initialize();
                }
                /* eslint-disable-next-line */
                catch (error1) {
                    console.log(chalk_1.default.red("Certificate manager error: ") + chalk_1.default.cyan(error1.message));
                    set_node_status_to("invalid certificate");
                    /* eslint-disable-next-line */
                    const msg = {};
                    msg.error = {};
                    msg.error.message = "Certificate error: " + error1.message;
                    msg.error.source = node.name; // this;
                    node.error("Certificate error", msg);
                }
                try {
                    // verbose_log(chalk.green("Client node parameters: ") + chalk.cyan(JSON.stringify(opcuaEndpoint)));
                    verbose_log(chalk_1.default.green("2) Connecting using endpoint: ") + chalk_1.default.cyan(opcuaEndpoint["endpoint"]) +
                        chalk_1.default.green(" securityMode: ") + chalk_1.default.cyan(connectionOption.securityMode) +
                        chalk_1.default.green(" securityPolicy: ") + chalk_1.default.cyan(connectionOption.securityPolicy));
                    yield node.client.connect(opcuaEndpoint["endpoint"]);
                }
                /* eslint-disable-next-line */
                catch (err) {
                    console.log(chalk_1.default.red("Client connect error: ") + chalk_1.default.cyan(err.message));
                    verbose_warn("Case A: Endpoint does not contain, 1==None 2==Sign 3==Sign&Encrypt, using securityMode: " + (0, flatted_1.stringify)(connectionOption.securityMode));
                    verbose_warn("        using securityPolicy: " + (0, flatted_1.stringify)(connectionOption.securityPolicy));
                    verbose_warn("Case B: UserName & password does not match to server (needed by Sign or SignAndEncrypt), check username: " + userIdentity["userName"] + " and password: " + userIdentity["password"]);
                    verbose_warn("Case C: With Sign you cannot use SecurityPolicy None!!");
                    verbose_warn("Invalid endpoint parameters: " + err.message);
                    node_error("Wrong endpoint parameters: " + JSON.stringify(opcuaEndpoint));
                    set_node_status_to("Invalid endpoint, check that server has security policy: " + (0, flatted_1.stringify)(connectionOption.securityPolicy));
                    /* eslint-disable-next-line */
                    const msg = {};
                    msg.error = {};
                    msg.error.message = "Invalid endpoint: " + err;
                    msg.error.source = node.name; // this;
                    node.error("Invalid endpoint", msg);
                    return;
                }
                verbose_log(chalk_1.default.green("Connected to endpoint: ") + chalk_1.default.cyan(opcuaEndpoint["endpoint"]));
                // verbose_log("Endpoint parameters: " + JSON.stringify(opcuaEndpoint)); 
                // verbose_log("Connection options: " + stringify(connectionOption));
                // STEP 2
                // This will succeed first time only if security policy and mode are None
                // Later user can use path and local file to access server certificate file
                if (!node.client) {
                    node_error("Client not yet created & connected, cannot getEndpoints!");
                    return;
                }
                // dumpCertificates(node.client); // TODO Wrong folder or something to solve
                // STEP 3
                // verbose_log("Create session...");
                try {
                    verbose_log(chalk_1.default.green("3) Create session with userIdentity: ") + chalk_1.default.cyan(JSON.stringify(userIdentity)));
                    //  {"clientName": "Node-red OPC UA Client node " + node.name},
                    // sessionName = "Node-red OPC UA Client node " + node.name;
                    if (!node.client) {
                        node_error("Client not yet created, cannot create session");
                        close_opcua_client("connection error: no client", 0);
                        return;
                    }
                    session = yield node.client.createSession(userIdentity);
                    if (!session) {
                        node_error("Create session failed!");
                        close_opcua_client("connection error: no session", 0);
                        return;
                    }
                    node.session = session;
                    // verbose_log("session active");
                    set_node_status_to("session active");
                    for (const i in cmdQueue) {
                        processInputMsg(cmdQueue[i]);
                    }
                    cmdQueue = [];
                }
                /* eslint-disable-next-line */
                catch (err) {
                    node_error(node.name + " OPC UA connection error: " + err.message);
                    verbose_log(err);
                    // node.session = null;
                    close_opcua_client("connection error", err);
                }
            });
        }
        function make_subscription(callback, msg, parameters) {
            if (!node.session) {
                verbose_log("Subscription without session");
                return; // newSubscription;
            }
            if (!parameters) {
                verbose_log("Subscription without parameters");
                return; // newSubscription;
            }
            verbose_log("Publishing interval " + (0, flatted_1.stringify)(parameters));
            const newSubscription = node_opcua_1.ClientSubscription.create(node.session, parameters);
            verbose_log("Subscription " + newSubscription.toString());
            newSubscription.on("initialized", function () {
                verbose_log("Subscription initialized");
                set_node_status_to("initialized");
            });
            newSubscription.on("started", function () {
                verbose_log("Subscription subscribed ID: " + newSubscription.subscriptionId);
                set_node_status_to("subscribed");
                // monitoredItems = new Map();
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
                // monitoredItems = new Map();
                monitoredItems.clear();
            });
            return newSubscription;
        }
        if (!node["client"]) {
            create_opcua_client(connect_opcua_client);
        }
        /* eslint-disable-next-line */
        function processInputMsg(msg) {
            if (msg.action === "reconnect") {
                cmdQueue = [];
                // msg.endpoint can be used to change endpoint
                msg.action = "";
                // const msg: any = {};
                msg.error = {};
                msg.error.message = "reconnect";
                msg.error.source = node.name; // this;
                node.error("reconnect", msg);
                reconnect(msg);
                return;
            }
            if (msg.action === "connect") {
                cmdQueue = [];
                // msg.endpoint can be used to change endpoint
                msg.action = "";
                connect_action_input(msg);
                return;
            }
            if (msg.action && msg.action.length > 0) {
                verbose_log("Override node action by msg.action: " + msg.action);
                node["action"] = msg.action;
            }
            else {
                verbose_log(chalk_1.default.green("Using node action: ") + chalk_1.default.cyan(originalAction));
                node["action"] = originalAction; // Use original action from the node
            }
            // With new node-red easier to set action into payload
            if (msg.payload && msg.payload.action && msg.payload.action.length > 0) {
                verbose_log("Override node action by msg.payload.action:" + msg.payload.action);
                node["action"] = msg.payload.action;
            }
            if (!node["action"]) {
                verbose_warn("Can't work without action (read, write, browse ...)");
                //node.send(msg); // do not send in case of error
                return;
            }
            if (!node.client || !node.session) {
                verbose_log("Not connected, current status: " + currentStatus);
                // Added statuses when msg must be put to queue
                // Added statuses when msg must be put to queue
                const statuses = ['', 'create client', 'connecting', 'reconnect'];
                if (statuses.includes(currentStatus)) {
                    cmdQueue.push(msg);
                }
                else {
                    verbose_warn("can't work without OPC UA Session");
                    reset_opcua_client(connect_opcua_client);
                }
                //node.send(msg); // do not send in case of error
                return;
            }
            // node.warn("secureChannelId:" + node.session.secureChannelId);
            node.session.on("terminated", () => {
                verbose_warn("terminated OPC UA Session");
                reset_opcua_client(connect_opcua_client);
                // node.send(msg); // do not send in case of error
                return;
            });
            /*
            if (!node.session.sessionId == "terminated") {
              verbose_warn("terminated OPC UA Session");
              reset_opcua_client(connect_opcua_client);
              // node.send(msg); // do not send in case of error
              return;
            }
            */
            if (msg.action && (msg.action === "connect" || msg.action === "disconnect")) {
                // OK
                msg.action = "";
            }
            else {
                if (!msg.topic) {
                    verbose_warn("can't work without OPC UA NodeId - msg.topic empty");
                    // node.send(msg); // do not send in case of error
                    return;
                }
            }
            verbose_log(chalk_1.default.yellow("Action on input: ") + chalk_1.default.cyan(node.action) +
                chalk_1.default.yellow(" Item from Topic: ") + chalk_1.default.cyan(msg.topic) +
                chalk_1.default.yellow(" session Id: ") + chalk_1.default.cyan(node.session.sessionId));
            switch (node.action) {
                case "connect":
                    connect_action_input(msg);
                    break;
                case "disconnect":
                    disconnect_action_input(msg);
                    break;
                case "reconnect":
                    reconnect(msg);
                    break;
                case "register":
                    register_action_input(msg);
                    break;
                case "unregister":
                    unregister_action_input(msg);
                    break;
                case "read":
                    read_action_input(msg);
                    break;
                case "history":
                    readhistory_action_input(msg);
                    break;
                case "info":
                    info_action_input(msg);
                    break;
                case "build":
                    build_extension_object_action_input(msg);
                    break;
                case "write":
                    write_action_input(msg);
                    break;
                case "subscribe":
                    subscribe_action_input(msg);
                    break;
                case "monitor":
                    monitor_action_input(msg);
                    break;
                case "unsubscribe":
                    unsubscribe_action_input(msg);
                    break;
                case "deletesubscribtion": // miss-spelled, this allows old flows to work
                case "deletesubscription":
                    delete_subscription_action_input(msg);
                    break;
                case "browse":
                    browse_action_input(msg);
                    break;
                case "events":
                    subscribe_events_input(msg);
                    break;
                case "readmultiple":
                    readmultiple_action_input(msg);
                    break;
                case "writemultiple":
                    writemultiple_action_input(msg);
                    break;
                case "acknowledge":
                    acknowledge_input(msg);
                    break;
                case "readfile":
                    read_file(msg);
                    break;
                case "writefile":
                    write_file(msg);
                    break;
                case "method":
                    method_action_input(msg);
                    break;
                default:
                    verbose_warn("Unknown action: " + node.action + " with msg " + (0, flatted_1.stringify)(msg));
                    break;
            }
            //node.send(msg); // msg.payload is here actual inject caused wrong values
        }
        node.on("input", processInputMsg);
        function acknowledge_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                // msg.topic is nodeId of the alarm object like Prosys ns=6;s=MyLevel.Alarm
                // msg.conditionId is actual conditionObejct that contains ns=6;s=MyLevel.Alarm/0:EventId current/latest eventId will be read
                // msg.comment will be used as comment in the acknowledge
                let eventId;
                if (msg.conditionId) {
                    const dataValue = yield node.session.read({ nodeId: msg.conditionId, attributeId: node_opcua_1.AttributeIds.Value });
                    eventId = dataValue.value.value;
                    verbose_log(chalk_1.default.yellow("Acknowledge (alarm object == topic): ") + chalk_1.default.cyan(msg.topic) +
                        chalk_1.default.yellow(" conditionObject (nodeId of eventId): ") + chalk_1.default.cyan(msg.conditionId) +
                        chalk_1.default.yellow(" value of eventId: 0x") + chalk_1.default.cyan(eventId.toString("hex")) +
                        chalk_1.default.yellow(" comment: ") + chalk_1.default.cyan(msg.comment));
                }
                // If actual eventId provided use it
                if (msg.eventId) {
                    eventId = msg.eventId;
                }
                if (eventId) {
                    try {
                        const ackedState = yield node.session.read({ nodeId: msg.topic + "/0:AckedState/0:Id", attributeId: node_opcua_1.AttributeIds.Value });
                        node.debug(chalk_1.default.yellow("EVENT ACKED STATE: ") + chalk_1.default.cyan(ackedState));
                        if (ackedState && ackedState.statusCode === node_opcua_1.StatusCodes.Good && ackedState.value.value === true) {
                            node.status({
                                fill: "yellow",
                                shape: "dot",
                                text: "Event: " + msg.topic + " already acknowledged"
                            });
                        }
                        else {
                            const status = yield node.session.acknowledgeCondition(msg.topic, eventId, msg.comment);
                            if (status !== node_opcua_1.StatusCodes.Good) {
                                node_error(node.name + "Error at acknowledge, status: " + status.toString());
                                set_node_errorstatus_to("error", status.toString());
                            }
                            else {
                                node.status({
                                    fill: "green",
                                    shape: "dot",
                                    text: "Event: " + msg.topic + " acknowledged"
                                });
                            }
                        }
                    }
                    catch (err) {
                        node_error(node.name + "Error at acknowledge: " + msg.topic + " eventId: " + eventId + " error: " + err);
                        set_node_errorstatus_to("error", err);
                    }
                }
                else {
                    node_error(node.name + " error at acknowledge, no eventId, possible wrong msg.conditionId " + msg.conditionId);
                }
            });
        }
        function read_file(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Read file, nodeId: " + msg.topic.toString());
                const file_node = (0, node_opcua_1.coerceNodeId)(msg.topic);
                if (node.session) {
                    try {
                        const clientFile = new node_opcua_file_transfer_1.ClientFile(node.session, file_node);
                        node_opcua_file_transfer_1.ClientFile.useGlobalMethod = true;
                        // Given that the file is opened in ReadMode Only
                        yield clientFile.open(node_opcua_file_transfer_1.OpenFileMode.Read);
                        // Read file size
                        // const dataValue = await node.session.read({nodeId: file_node.toString() + "-Size"}); // node-opcua specific way to name nodeId
                        /*
                        let dataValue;
                        const browsePath = makeBrowsePath(file_node, ".Size");
                        const results = await node.session.translateBrowsePath(browsePath);
                        if (results && results.statusCode === StatusCodes.Good &&
                            results.targets && results.targets[0].targetId) {
                            var sizeNodeId = results.targets[0].targetId;
                            dataValue = await node.session.read({nodeId: sizeNodeId});
                        }
                        else {
                          verbose_warn("Cannot translate browse path for file node: size");
                        }
                        if (dataValue && dataValue.statusCode === StatusCodes.Good) {
                          // Size is UInt64
                          // const size = dataValue.value.value[1] + dataValue.value.value[0] * 0x100000000;
                          */
                        try {
                            const size = yield clientFile.size(); // This should read size from the file itself
                            const buf = yield clientFile.read(size);
                            // node-opcua-file-transfer takes care of the whole file reading from v2.94.0
                            yield clientFile.close();
                            msg.payload = buf;
                            // Debug purpose, show content
                            verbose_log("File content: " + buf.toString());
                        }
                        catch (err) {
                            msg.payload = "";
                            node_error(node.name + " failed to read file, nodeId: " + msg.topic + " error: " + err);
                            set_node_errorstatus_to("error", "Cannot read file!");
                        }
                        /*
                        }
                        else {
                          // File size not available
                          msg.payload = "";
                          node_error(node.name + " failed get file size, nodeId: " + msg.topic + " error: " + err);
                          set_node_errorstatus_to("error", "Cannot read file size");
                        }
                        */
                        node.send(msg);
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        node_error(node.name + " failed to read fileTransfer, nodeId: " + msg.topic + " error: " + err);
                        set_node_errorstatus_to("error", err.toString());
                    }
                }
                else {
                    verbose_warn("No open session to read file!");
                }
            });
        }
        function write_file(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Write file, nodeId: " + msg.topic.toString());
                const file_node = (0, node_opcua_1.coerceNodeId)(msg.topic);
                if (node.session) {
                    try {
                        let buf;
                        if (msg.payload && msg.payload.length > 0) {
                            buf = msg.payload;
                        }
                        if (msg.fileName) {
                            verbose_log("Uploading file: " + msg.fileName);
                            buf = fs.readFileSync(msg.fileName);
                        }
                        const clientFile = new node_opcua_file_transfer_1.ClientFile(node["session"], file_node);
                        node_opcua_file_transfer_1.ClientFile.useGlobalMethod = true;
                        // Given that the file is opened in WriteMode
                        yield clientFile.open(node_opcua_file_transfer_1.OpenFileMode.Write);
                        verbose_log("Local file content: " + buf.toString());
                        verbose_log("Writing file to server...");
                        yield clientFile.write(buf);
                        yield clientFile.close();
                        verbose_log("Write done!");
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        node.error(chalk_1.default.red("Cannot write file, error: " + err.message));
                    }
                }
                else {
                    verbose_warn("No open session to write file!");
                }
            });
        }
        function method_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Calling method: " + JSON.stringify(msg));
                if (node.session) {
                    try {
                        const status = yield callMethod(msg);
                        if (status === node_opcua_1.StatusCodes.Good) {
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "Method executed"
                            });
                        }
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        node.error(chalk_1.default.red("Cannot call method, error: " + err.message));
                    }
                }
                else {
                    verbose_warn("No open session to call method!");
                }
            });
        }
        function callMethod(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                if (msg.methodId && msg.inputArguments) {
                    verbose_log("Calling method: " + JSON.stringify(msg.methodId));
                    verbose_log("InputArguments: " + JSON.stringify(msg.inputArguments));
                    verbose_log("OutputArguments: " + JSON.stringify(msg.outputArguments));
                    try {
                        let i = 0;
                        let arg;
                        while (i < msg.inputArguments.length) {
                            arg = msg.inputArguments[i];
                            if (arg.dataType === "NodeId") {
                                arg.value = (0, node_opcua_1.coerceNodeId)(arg.value);
                            }
                            if (arg.dataType === "ExtensionObject") {
                                let extensionobject;
                                if (arg.typeid) {
                                    extensionobject = yield node.session.constructExtensionObject((0, node_opcua_1.coerceNodeId)(arg.typeid), {}); // TODO make while loop to enable await
                                }
                                verbose_log("ExtensionObject=" + (0, flatted_1.stringify)(extensionobject));
                                Object.assign(extensionobject, arg.value);
                                arg.value = new node_opcua_1.Variant({
                                    dataType: node_opcua_1.DataType.ExtensionObject,
                                    value: extensionobject
                                });
                            }
                            i++;
                        }
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        /* eslint-disable-next-line */
                        const msg = {};
                        msg.error = {};
                        msg.error.message = "Invalid NodeId: " + err;
                        msg.error.source = node.name; // this;
                        node.error("Invalid NodeId: ", msg);
                        return node_opcua_1.StatusCodes.BadNodeIdUnknown;
                    }
                    verbose_log("Updated InputArguments: " + JSON.stringify(msg.inputArguments));
                    let callMethodRequest;
                    let diagInfo;
                    try {
                        callMethodRequest = new node_opcua_1.CallMethodRequest({
                            objectId: (0, node_opcua_1.coerceNodeId)(msg.objectId),
                            methodId: (0, node_opcua_1.coerceNodeId)(msg.methodId),
                            // inputArgumentDiagnosticInfos: diagInfo,
                            inputArguments: msg.inputArguments,
                            // outputArguments: msg.outputArguments
                        });
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        set_node_status_to("error: " + err.message);
                        node.error("Build method request failed, error: " + err.message);
                    }
                    verbose_log("Call request: " + callMethodRequest.toString());
                    verbose_log("Calling: " + callMethodRequest);
                    try {
                        const result = yield node.session.call(callMethodRequest);
                        if (diagInfo) {
                            verbose_log("Diagn. info: " + JSON.stringify(diagInfo));
                        }
                        verbose_log("Output args: " + JSON.stringify(msg.outputArguments));
                        verbose_log("Results:     " + JSON.stringify(result));
                        msg.result = result;
                        if (result && result.statusCode === node_opcua_1.StatusCodes.Good) {
                            let i = 0;
                            msg.output = result.outputArguments; // Original outputArguments
                            msg.payload = []; // Store values back to array
                            if (result && result.outputArguments && result.outputArguments.length == 1) {
                                verbose_log("Value: " + result.outputArguments[i].value);
                                msg.payload = result.outputArguments[0].value; // Return only if one output argument
                            }
                            else {
                                while (result && result.outputArguments && result.outputArguments.length > i) {
                                    verbose_log("Value[" + i + "]:" + result.outputArguments[i].toString());
                                    msg.payload.push(result.outputArguments[i].value); // Just copy result value to payload[] array, actual value needed mostly
                                    i++;
                                }
                            }
                        }
                        else {
                            set_node_status_to("error: " + result.statusCode.description);
                            node.error("Execute method result, error:" + result.statusCode.description);
                            return result.statusCode;
                        }
                        node.send(msg);
                        return node_opcua_1.StatusCodes.Good;
                    }
                    /* eslint-disable-next-line */
                    catch (err) {
                        set_node_status_to("Method execution error: " + err.message);
                        node.error("Method execution error: " + err.message);
                        return node_opcua_1.StatusCodes.BadMethodInvalid;
                    }
                }
            });
        }
        function connect_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Connecting...");
                if (msg && msg.OpcUaEndpoint) {
                    // Remove listeners if existing
                    if (node.client) {
                        verbose_log("Cleanup old listener events... before connecting to new client");
                        verbose_log("All event names:" + node.client.eventNames());
                        verbose_log("Connection_reestablished event count:" + node.client.listenerCount("connection_reestablished"));
                        node.client.removeListener("connection_reestablished", reestablish);
                        verbose_log("Backoff event count:" + node.client.listenerCount("backoff"));
                        node.client.removeListener("backoff", backoff);
                        verbose_log("Start reconnection event count:" + node.client.listenerCount("start_reconnection"));
                        node.client.removeListener("start_reconnection", reconnection);
                    }
                    // opcuaEndpoint = {}; // Clear
                    opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
                    connectionOption.securityPolicy = node_opcua_1.SecurityPolicy[opcuaEndpoint.securityPolicy]; // || SecurityPolicy.None;
                    connectionOption.securityMode = node_opcua_1.MessageSecurityMode[opcuaEndpoint.securityMode]; // || MessageSecurityMode.None;
                    verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
                    if (opcuaEndpoint.login === true) {
                        userIdentity = { userName: opcuaEndpoint.user,
                            password: opcuaEndpoint.password,
                            type: node_opcua_1.UserTokenType.UserName };
                        verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
                    }
                    verbose_log("Using new endpoint:" + (0, flatted_1.stringify)(opcuaEndpoint));
                }
                else {
                    verbose_log("Using endpoint:" + (0, flatted_1.stringify)(opcuaEndpoint));
                }
                if (!node.client) {
                    create_opcua_client(connect_opcua_client);
                }
            });
        }
        function disconnect_action_input(msg) {
            verbose_log("Closing session... msg: " + msg.topic);
            if (node.session) {
                node.session.close(function (err) {
                    if (err) {
                        node_error("Session close error: " + err);
                    }
                    else {
                        verbose_log("Session closed!");
                    }
                });
            }
            else {
                verbose_warn("No session to close!");
            }
            verbose_log("Disconnecting...");
            if (node.client) {
                node.client.disconnect(function () {
                    verbose_log("Client disconnected!");
                    set_node_status_to("disconnected");
                });
                // node.client = null;
            }
        }
        function register_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("register nodes : " + msg.payload.toString());
                // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
                // msg.topic not used, but cannot be empty
                // msg.paylod == array of nodeIds to register
                if (msg.payload.length > 0) {
                    const registeredNodes = yield node.session.registerNodes(msg.payload);
                    verbose_log("RegisteredNodes: " + registeredNodes.toString());
                }
                else {
                    verbose_warn("No items to register in the payload! Check node:" + node.name);
                }
            });
        }
        function unregister_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("unregister nodes : " + msg.payload.toString());
                // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
                // msg.topic not used, but cannot be empty
                // msg.paylod == array of nodeIds to register
                if (msg.payload.length > 0) {
                    const unregisteredNodes = yield node.session.registerNodes(msg.payload);
                    verbose_log("UnregisteredNodes: " + unregisteredNodes.toString());
                }
                else {
                    verbose_warn("No items to unregister in the payload! Check node:" + node.name);
                }
            });
        }
        function read_action_input(msg) {
            verbose_log("reading");
            let item = "";
            let range;
            if (msg.topic) {
                const n = msg.topic.indexOf("datatype=");
                if (n > 0) {
                    msg.datatype = msg.topic.substring(n + 9);
                    item = msg.topic.substring(0, n - 1);
                    msg.topic = item;
                    verbose_log((0, flatted_1.stringify)(msg));
                }
            }
            if (item.length > 0) {
                items[0] = item;
            }
            else {
                items[0] = msg.topic;
            }
            // Added support for indexRange, payload can be just one number as string "5"  or "2:5"
            if (msg.payload && msg.payload.range) {
                range = new node_opcua_1.NumericRange(msg.payload.range);
                // console.log("Range:" + stringify(range));
            }
            if (node.session) {
                // With Single Read using now read to get sourceTimeStamp and serverTimeStamp
                const item = {
                    nodeId: (0, node_opcua_1.coerceNodeId)(items[0]),
                    attributeId: node_opcua_1.AttributeIds.Value,
                    indexRange: range,
                    // timeStampsToReturn: TimestampsToReturn.Both
                };
                node.session.read(item, function (err, dataValue) {
                    if (err) {
                        // if (diagnostics) {
                        //  verbose_log('diagnostics:' + diagnostics);
                        // }
                        node_error(node.name + " error at active reading: " + err.message);
                        set_node_errorstatus_to("error", err);
                        // No actual error session created, this case cause connections to server
                        // reset_opcua_client(connect_opcua_client);
                    }
                    else {
                        set_node_status_to("active reading");
                        verbose_log("Node : " + msg.topic);
                        // verbose_log(dataValue.toString());
                        if (dataValue) {
                            try {
                                verbose_log("Value : " + dataValue.value.value);
                                verbose_log("DataType: " + dataValue.value.dataType + " (" + node_opcua_1.DataType[dataValue.value.dataType] + ")");
                                verbose_log("Message: " + msg.topic + " (" + msg.datatype + ")");
                                if (dataValue.value.dataType === node_opcua_1.DataType.UInt16) {
                                    verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + (0, opcua_basics_1.toInt32)(dataValue.value.value));
                                }
                                // clone payload via JSON stringify/parse only if datavalue is an ExtensionObject or an array of ExtensionObjects
                                msg.payload = dataValue.value.dataType === node_opcua_1.DataType.ExtensionObject
                                    ? JSON.parse(JSON.stringify((dataValue.value.value)))
                                    : dataValue.value.value;
                                msg.statusCode = dataValue.statusCode;
                                msg.serverTimestamp = dataValue.serverTimestamp;
                                msg.sourceTimestamp = dataValue.sourceTimestamp;
                                // if (dataValue.statusCode && dataValue.statusCode != StatusCodes.Good) {
                                //   verbose_warn("StatusCode: " + dataValue.statusCode.toString(16));
                                // }
                                if (dataValue.statusCode && dataValue.statusCode.isGoodish() === false) {
                                    verbose_warn("StatusCode: " + dataValue.statusCode.toString() + " " + dataValue.statusCode.description); // hex toString(16)
                                }
                                node.send(msg);
                            }
                            /* eslint-disable-next-line */
                            catch (e) {
                                if (dataValue) {
                                    node_error("Bad read: " + (dataValue.statusCode.toString())); // hex toString(16)
                                    node_error("Message:" + msg.topic + " dataType:" + msg.datatype);
                                    node_error("Data:" + (0, flatted_1.stringify)(dataValue));
                                }
                                else {
                                    node_error(e.message);
                                }
                            }
                        }
                    }
                });
            }
            else {
                set_node_status_to("Session invalid");
                node_error("Session is not active!");
            }
        }
        function readhistory_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Read historical values from msg.topic = nodeId: " + msg.topic + " msg.aggregate (raw|min|ave|max|interpolative), aggregate: " + msg.aggregate);
                let start;
                let end = Date.now();
                if (msg.end) {
                    verbose_log("msg.end  : " + msg.end.toString());
                    end = msg.end;
                }
                if (!msg.start) {
                    start = end - (1 * 60 * 60 * 1000); // read last 1 hour of history
                }
                else {
                    start = msg.start;
                    verbose_log("msg.start: " + msg.start.toString());
                }
                verbose_log("Start time, msg.start or default start 1h ago, start: " + new Date(start));
                verbose_log("End time,   msg.end or default to now,           end: " + new Date(end));
                // For aggregates
                const processingInterval = end - start; // Whole range 10 * 1000; // 10s interval
                if (node.session) {
                    if (msg.aggregate && msg.aggregate === "raw") {
                        let numValues = 1000;
                        if (msg.numValuesPerNode) {
                            numValues = parseInt(msg.numValuesPerNode);
                        }
                        let returnBounds = false;
                        if (msg.returnBounds) {
                            returnBounds = msg.returnBounds;
                        }
                        // Old one: ReadRawModifiedDetails
                        // No constructor: ExtraReadHistoryValueParameters
                        const historyReadDetails = new Object({
                            isReadModified: false,
                            numValuesPerNode: numValues,
                            returnBounds: returnBounds,
                            timestampsToReturn: node_opcua_1.TimestampsToReturn.Both // Fixed, return always both
                        });
                        verbose_log("NodeId: " + msg.topic + " from: " + new Date(start) + " to: " + new Date(end) + " options: " + JSON.stringify(historyReadDetails));
                        const historicalReadResult = yield node.session.readHistoryValue({ nodeId: msg.topic }, new Date(start), new Date(end), historyReadDetails);
                        msg.payload = historicalReadResult;
                        node.send(msg);
                    }
                    if (msg.aggregate && msg.aggregate === "max") {
                        const resultMax = yield node.session.readAggregateValue({ nodeId: msg.topic }, new Date(start), new Date(end), node_opcua_1.AggregateFunction.Maximum, processingInterval);
                        msg.payload = resultMax;
                        node.send(msg);
                        if (resultMax.statusCode === node_opcua_1.StatusCodes.Good && resultMax.historyData) {
                            verbose_log(chalk_1.default.green("History max: ") + chalk_1.default.cyan(resultMax.historyData[0].value.value));
                        }
                    }
                    if (msg.aggregate && msg.aggregate === "min") {
                        const resultMin = yield node.session.readAggregateValue({ nodeId: msg.topic }, new Date(start), new Date(end), node_opcua_1.AggregateFunction.Minimum, processingInterval);
                        msg.payload = resultMin;
                        node.send(msg);
                        if (resultMin.statusCode === node_opcua_1.StatusCodes.Good && resultMin.historyData) {
                            verbose_log(chalk_1.default.green("History min: ") + chalk_1.default.cyan(resultMin.historyData[0].value.value));
                        }
                    }
                    if (msg.aggregate && msg.aggregate === "ave") {
                        const resultAve = yield node.session.readAggregateValue({ nodeId: msg.topic }, new Date(start), new Date(end), node_opcua_1.AggregateFunction.Average, processingInterval);
                        msg.payload = resultAve;
                        node.send(msg);
                        if (resultAve.statusCode === node_opcua_1.StatusCodes.Good && resultAve.historyData) {
                            verbose_log(chalk_1.default.green("History ave: ") + chalk_1.default.cyan(resultAve.historyData[0].value.value));
                        }
                    }
                    if (msg.aggregate && msg.aggregate === "interpolative") {
                        const resultInter = yield node.session.readAggregateValue({ nodeId: msg.topic }, new Date(start), new Date(end), node_opcua_1.AggregateFunction.Interpolative, processingInterval);
                        msg.payload = resultInter;
                        node.send(msg);
                        if (resultInter.statusCode === node_opcua_1.StatusCodes.Good && resultInter.historyData) {
                            verbose_log(chalk_1.default.green("History interpolative: ") + chalk_1.default.cyan(resultInter.historyData[0].value.value));
                        }
                    }
                }
            });
        }
        function readmultiple_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("read multiple...");
                let item = "";
                //
                if (msg.topic) {
                    const n = msg.topic.indexOf("datatype=");
                    if (n > 0) {
                        msg.datatype = msg.topic.substring(n + 9);
                        item = msg.topic.substring(0, n - 1);
                        msg.topic = item;
                        verbose_log((0, flatted_1.stringify)(msg));
                    }
                }
                // Store nodeId to read multipleItems array
                if (msg.topic !== "readmultiple" && msg.topic !== "clearitems") {
                    if (item.length > 0) {
                        multipleItems.push({ nodeId: item, attributeId: node_opcua_1.AttributeIds.Value, TimestampsToReturn: node_opcua_1.TimestampsToReturn.Both });
                    }
                    else {
                        // msg.topic
                        multipleItems.push({ nodeId: msg.topic, attributeId: node_opcua_1.AttributeIds.Value, TimestampsToReturn: node_opcua_1.TimestampsToReturn.Both }); // support for multiple item reading
                    }
                }
                if (msg.topic === "clearitems") {
                    verbose_log("clear items...");
                    multipleItems = [];
                    set_node_status_to("clear items");
                    return;
                }
                if (msg.topic !== "readmultiple") {
                    set_node_status_to("nodeId stored");
                    return;
                }
                // Read multiple, payload contains all nodeIds that will be read
                if (node.session && msg.topic === "readmultiple" && Array.isArray(msg.payload)) {
                    multipleItems = []; // Clear as payload contains always nodeIds that we want to read
                    let i = 0;
                    while (i < msg.payload.length) {
                        multipleItems.push({ nodeId: msg.payload[i], attributeId: node_opcua_1.AttributeIds.Value, TimestampsToReturn: node_opcua_1.TimestampsToReturn.Both });
                        i = i + 1;
                    }
                }
                if (node.session && msg.topic === "readmultiple") {
                    //  node.session.read({timestampsToReturn: TimestampsToReturn.Both, nodesToRead: multipleItems}, function (err, dataValues, diagnostics) {
                    verbose_log("Reading items: " + (0, flatted_1.stringify)(multipleItems));
                    if (multipleItems.length === 0) {
                        node_error(node.name + " no items to read");
                        return;
                    }
                    node.session.read(multipleItems, function (err, dataValues) {
                        if (err) {
                            /*
                            if (diagnostics) {
                              verbose_log('diagnostics:' + diagnostics);
                            }
                            */
                            node_error(node.name + " error at active reading: " + err.message);
                            set_node_errorstatus_to("error", err);
                            // No actual error session existing, this case cause connections to server
                            // reset_opcua_client(connect_opcua_client);
                        }
                        else {
                            set_node_status_to("active multiple reading");
                            if (msg.payload === "ALL") {
                                /* eslint-disable-next-line */
                                node.send({ "topic": "ALL", "payload": dataValues, "items": multipleItems });
                                return;
                            }
                            for (let i = 0; dataValues && i < dataValues.length; i++) {
                                const dataValue = dataValues[i];
                                verbose_log("Node : " + msg.topic);
                                verbose_log(dataValue.toString());
                                if (dataValue) {
                                    try {
                                        verbose_log("Value : " + dataValue.value.value);
                                        verbose_log("DataType: " + dataValue.value.dataType + " (" + node_opcua_1.DataType[dataValue.value.dataType] + ")");
                                        if (dataValue.value.dataType === node_opcua_1.DataType.UInt16) {
                                            verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + (0, opcua_basics_1.toInt32)(dataValue.value.value));
                                        }
                                        // if (dataValue.statusCode && dataValue.statusCode != StatusCodes.Good) {
                                        //   verbose_warn("StatusCode: " + dataValue.statusCode.toString(16));
                                        // }
                                        if (dataValue.statusCode && dataValue.statusCode.isGoodish() === false) {
                                            verbose_warn("StatusCode: " + dataValue.statusCode.toString() + " " + dataValue.statusCode.description); // was toString(16) as hex
                                        }
                                        let serverTs = dataValue.serverTimestamp;
                                        let sourceTs = dataValue.sourceTimestamp;
                                        if (serverTs === null) {
                                            serverTs = new Date();
                                        }
                                        if (sourceTs === null) {
                                            sourceTs = new Date();
                                        }
                                        const value = dataValue.value.dataType === node_opcua_1.DataType.ExtensionObject
                                            ? JSON.parse(JSON.stringify(dataValue.value.value))
                                            : dataValue.value.value;
                                        // Use nodeId in topic, arrays are same length
                                        node.send({
                                            topic: multipleItems[i],
                                            payload: value,
                                            statusCode: dataValue.statusCode,
                                            serverTimestamp: serverTs,
                                            sourceTimestamp: sourceTs
                                            /* eslint-disable-next-line */
                                        });
                                    }
                                    /* eslint-disable-next-line */
                                    catch (e) {
                                        if (dataValue) {
                                            node_error("Bad read, statusCode: " + (dataValue.statusCode.toString())); // as hex toString(16)
                                            node_error("Data:" + (0, flatted_1.stringify)(dataValue));
                                        }
                                        else {
                                            node_error(e.message);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                else {
                    set_node_status_to("Session invalid");
                    node_error("Session is not active!");
                }
            });
        }
        function info_action_input(msg) {
            verbose_log("meta-data reading");
            let item = "";
            if (msg.topic) {
                const n = msg.topic.indexOf("datatype=");
                if (n > 0) {
                    msg.datatype = msg.topic.substring(n + 9);
                    item = msg.topic.substring(0, n - 1);
                    msg.topic = item;
                    verbose_log((0, flatted_1.stringify)(msg));
                }
            }
            if (item.length > 0) {
                items[0] = item;
            }
            else {
                items[0] = msg.topic;
            }
            if (node.session) {
                // TODO this could loop through all items
                /* TypeScript FIX ME
                node.session.readAllAttributes(coerceNodeId(items[0]), function(err, result) {
                  if (!err) {
                      // console.log("INFO: " + JSON.stringify(result));
                      const newMsg = Object.assign(msg, result);
                      node.send(newMsg);
                  }
                  else {
                    set_node_status_to("error");
                    node_error("Cannot read attributes from nodeId: " + items[0])
                  }
                });
                */
            }
            else {
                set_node_status_to("Session invalid");
                node_error("Session is not active!");
            }
        }
        function build_extension_object_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Construct ExtensionObject from " + JSON.stringify(msg));
                let item = "";
                if (msg.topic) {
                    const n = msg.topic.indexOf("datatype=");
                    if (n > 0) {
                        msg.datatype = msg.topic.substring(n + 9);
                        item = msg.topic.substring(0, n - 1);
                        msg.topic = item;
                        verbose_log((0, flatted_1.stringify)(msg));
                    }
                }
                if (item.length > 0) {
                    items[0] = item;
                }
                else {
                    items[0] = msg.topic;
                }
                if (node.session) {
                    try {
                        const ExtensionNodeId = (0, node_opcua_1.coerceNodeId)(items[0]);
                        verbose_log("ExtensionNodeId: " + ExtensionNodeId);
                        const ExtensionTypeDefinition = yield node.session.read({ nodeId: ExtensionNodeId, attributeId: node_opcua_1.AttributeIds.DataTypeDefinition });
                        if (ExtensionTypeDefinition.statusCode != node_opcua_1.StatusCodes.Good) {
                            node_error("Failed to find extension type for nodeId: " + ExtensionNodeId + " error: " + ExtensionTypeDefinition.statusCode.description);
                            return;
                        }
                        else {
                            verbose_log("ExtensionType: " + JSON.stringify(ExtensionTypeDefinition));
                        }
                        /* eslint-disable-next-line */
                        const newmsg = {};
                        const ExtensionData = yield node.session.constructExtensionObject(ExtensionNodeId, {});
                        if (ExtensionData) {
                            verbose_log("ExtensionData: " + ExtensionData.toString());
                        }
                        // Simplified
                        newmsg.topic = msg.topic;
                        newmsg.payload = JSON.parse(JSON.stringify(ExtensionData)); //  JSON.stringify(ExtensionData); // New value with default values
                        verbose_log("Extension Object msg: " + (0, flatted_1.stringify)(newmsg));
                        node.send(newmsg);
                    }
                    catch (err) {
                        if (err) {
                            node_error("Failed to build ExtensionObject, error: " + err);
                        }
                    }
                }
                else {
                    set_node_status_to("Session invalid");
                    node_error("Session is not active!");
                }
            });
        }
        function write_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                // verbose_log("writing:" + stringify(msg));
                if (msg && msg.topic && msg.topic.indexOf("ns=") != 0) {
                    return; // NOT an item
                }
                // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
                const dIndex = msg.topic.indexOf("datatype=");
                // const ns = msg.topic.substring(3, dIndex-1); // Parse namespace, ns=2 or ns=10 TODO TEST 2 digits namespace
                let s = "";
                let range;
                if (msg.datatype == null && dIndex > 0) {
                    msg.datatype = msg.topic.substring(dIndex + 9);
                    s = msg.topic.substring(7, dIndex - 1);
                }
                else {
                    s = msg.topic.substring(7); // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT
                    verbose_log("NodeId string starts from index: " + s); // Not used
                }
                let nodeid; // nodeId.NodeId(NodeId.NodeIdType.STRING, s, ns);
                // console.log("Topic: " + msg.topic + " ns=" + ns + " s=" + s);
                verbose_log((0, node_opcua_1.makeBrowsePath)(msg.topic, "."));
                // TODO ns=10 TEST 2 digits namespace
                if (dIndex > 0) {
                    nodeid = (0, node_opcua_1.coerceNodeId)(msg.topic.substring(0, dIndex - 1));
                }
                else {
                    nodeid = (0, node_opcua_1.coerceNodeId)(msg.topic);
                }
                /*
                if (msg.topic.substring(5, 6) == 's') {
                  nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, parseInt(ns));
                } else {
                  nodeid = new nodeId.NodeId(nodeId.NodeIdType.NUMERIC, parseInt(s), parseInt(ns));
                }
                */
                // Less output
                // verbose_log("namespace=" + ns);
                // verbose_log("string=" + s);
                verbose_log("NodeId= " + nodeid.toString() + " type=" + msg.datatype);
                const opcuaDataValue = msg.datatype && msg.datatype.indexOf("ExtensionObject") >= 0 && node.session
                    ? yield build_new_extensionObject_dataValue(msg.datatype, msg.topic, msg.payload, node.session)
                    : (0, opcua_basics_1.build_new_dataValue)(msg.datatype, msg.payload);
                function build_new_extensionObject_dataValue(datatype, topic, payload, session) {
                    return __awaiter(this, void 0, void 0, function* () {
                        let defaultExtensionObject;
                        if (topic.indexOf("typeId=") > 0) {
                            const typeId = topic.substring(topic.indexOf("typeId=") + 7);
                            verbose_log("ExtensionObject TypeId= " + typeId);
                            defaultExtensionObject = yield session.constructExtensionObject((0, node_opcua_1.coerceNodeId)(typeId), {}); // Create first with default values
                            verbose_log("ExtensionObject=" + (0, flatted_1.stringify)(defaultExtensionObject));
                        }
                        let nValue;
                        if (datatype.indexOf("Array") > 0) {
                            // datatype is array of extension object
                            payload.value.forEach(function (extensionObject, index) {
                                // deep clone default extension object
                                const duplicatedDefaultExtensionObject = (0, lodash_clonedeep_1.cloneDeep)(defaultExtensionObject);
                                payload.value[index] = Object.assign(duplicatedDefaultExtensionObject, extensionObject);
                            });
                            nValue = {
                                dataType: node_opcua_1.DataType.ExtensionObject,
                                value: payload.value,
                                arrayType: node_opcua_1.VariantArrayType.Array
                            };
                        }
                        else {
                            // datatype is extension object
                            const extensionObject = Object.assign(defaultExtensionObject, payload); // MERGE payload over default values
                            nValue = {
                                dataType: node_opcua_1.DataType.ExtensionObject,
                                value: extensionObject
                            };
                        }
                        return nValue;
                    });
                }
                // TODO Fix object array according range
                // Added support for indexRange, payload can be just one number as string "5"  or "2:5"
                // Helper for node-red server write
                /*
                function reIndexArray(obj, newKeys) {
                  const keyValues = Object.keys(obj).map(key => {
                    const newKey = newKeys[key] || key;
                    return { [newKey]: obj[key] };
                  });
                  return Object.assign({}, ...keyValues);
                }
                */
                if (msg.range) {
                    verbose_log(chalk_1.default.red("Range: " + msg.range));
                    range = new node_opcua_1.NumericRange(msg.range);
                    verbose_log(chalk_1.default.red("Range: " + JSON.stringify(range) + " values: " + JSON.stringify(opcuaDataValue)));
                    // TODO write to node-red server still work to do
                    // var newIndex = { "0": "2", "1": "3", "2":"4"}; // HARD CODED TEST
                    // const newValues = reIndexArray(opcuaDataValue, newIndex);
                    // verbose_log(chalk.yellow("NEW VALUES: " + stringify(newValues)));
                }
                let nodeToWrite;
                if (node.session && !node.session.isReconnecting) { // } && node.session.isChannelValid()) {
                    if (range) {
                        nodeToWrite = {
                            nodeId: nodeid.toString(),
                            attributeId: node_opcua_1.AttributeIds.Value,
                            indexRange: range,
                            value: new node_opcua_1.DataValue({ value: new node_opcua_1.Variant(opcuaDataValue) })
                        };
                    }
                    else {
                        nodeToWrite = {
                            nodeId: nodeid.toString(),
                            attributeId: node_opcua_1.AttributeIds.Value,
                            value: new node_opcua_1.DataValue({
                                value: new node_opcua_1.Variant(opcuaDataValue),
                                // sourceTimestamp: new Date(),            // NOTE: Some servers do NOT accept time writing
                                // statusCode: StatusCodes.Good      // NOTE: Same with status writing, NOT accepted always
                            })
                        };
                    }
                    if (msg.timestamp) {
                        nodeToWrite.value.sourceTimestamp = new Date(msg.timestamp).getTime();
                    }
                    verbose_log("VALUE TO WRITE: " + JSON.stringify(nodeToWrite));
                    set_node_status_to("writing");
                    node.session.write(nodeToWrite, function (err, statusCode) {
                        if (err) {
                            set_node_errorstatus_to("error", err);
                            node_error(node.name + " Cannot write value (" + (0, flatted_1.stringify)(msg.payload) + ") to msg.topic:" + msg.topic + " error:" + err);
                            // No actual error session existing, this case cause connections to server
                            // reset_opcua_client(connect_opcua_client);
                            msg.payload = err;
                            node.send(msg);
                        }
                        else {
                            set_node_status_to("value written");
                            verbose_log("Value written! Result:" + statusCode); // + " " + statusCode.description);
                            // if (statusCode != StatusCodes.Good) {
                            //   set_node_errorstatus_to("error", statusCode.description);
                            // }
                            if (statusCode && statusCode.isGoodish() === false) {
                                verbose_warn("StatusCode: " + statusCode.toString() + " " + statusCode.description); // as hex toString(16)
                                set_node_errorstatus_to("error", statusCode.description);
                            }
                            msg.payload = statusCode;
                            node.send(msg);
                        }
                    });
                }
                else {
                    set_node_status_to("Session invalid");
                    node_error("Session is not active!");
                }
            });
        }
        function writemultiple_action_input(msg) {
            verbose_log("writing multiple");
            // Store as with readmultiple item
            if (msg.topic && msg.topic !== "writemultiple" && !Array.isArray(msg.payload)) {
                // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
                // const ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
                const dIndex = msg.topic.indexOf("datatype=");
                let s = "";
                if (msg.datatype == null && dIndex > 0) {
                    msg.datatype = msg.topic.substring(dIndex + 9);
                    s = msg.topic.substring(7, dIndex - 1);
                }
                else {
                    s = msg.topic.substring(7); // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT
                    verbose_log("NodeId string index: " + s); // NOT Used??
                }
                /*
                        var nodeid = {}; // new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);
                        // verbose_log(makeBrowsePath(msg.topic, ".")); // msg.topic is not always nodeId
                        if (msg.topic.substring(5, 6) == 's') {
                          nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, parseInt(ns));
                        }
                        if (msg.topic.substring(5, 6) == 'i') {
                          nodeid = new nodeId.NodeId(nodeId.NodeIdType.NUMERIC, parseInt(s), parseInt(ns));
                        }
                */
                // Store nodeId to read multipleItems array
                if (msg.topic !== "writemultiple" && msg.topic !== "clearitems") {
                    const opcuaDataValue = (0, opcua_basics_1.build_new_dataValue)(msg.datatype, msg.payload);
                    const item = {
                        nodeId: msg.topic,
                        datatype: msg.datatype,
                        attributeId: node_opcua_1.AttributeIds.Value,
                        indexRange: null,
                        value: new node_opcua_1.DataValue({ value: opcuaDataValue })
                    };
                    item.value.sourceTimestamp = new Date(msg.timestamp);
                    verbose_log("ITEM: " + (0, flatted_1.stringify)(item));
                    writeMultipleItems.push(item);
                }
                if (msg.topic === "clearitems") {
                    verbose_log("clear items...");
                    writeMultipleItems = [];
                    set_node_status_to("clear items");
                    return;
                }
                if (msg.topic !== "writemultiple") {
                    set_node_status_to("nodeId stored");
                    return;
                }
            }
            // node.session &&
            if (!node.session.isReconnecting && msg.topic === "writemultiple") { // && node.session.isChannelValid()
                verbose_log("Writing items: " + (0, flatted_1.stringify)(writeMultipleItems));
                if (writeMultipleItems.length === 0) {
                    node_error(node.name + " no items to write");
                    return;
                }
                node.session.write(writeMultipleItems, function (err, statusCode) {
                    if (err) {
                        set_node_errorstatus_to("error", err);
                        node_error(node.name + " Cannot write values (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
                        // No actual error session created, this case cause connections to server
                        // reset_opcua_client(connect_opcua_client);
                        node.send({ payload: err });
                    }
                    else {
                        set_node_status_to("active writing");
                        verbose_log("Values written!");
                        node.send({ payload: statusCode });
                        return;
                    }
                });
            }
            else {
                if (Array.isArray(msg.payload)) {
                    // Skip, special case
                }
                else {
                    set_node_status_to("Write multiple items session invalid");
                    node_error("Write multiple items session is not active!");
                }
            }
            // OLD original way to use payload
            if (node.session && !node.session.isReconnecting) { // } && node.session.isChannelValid()) {
                if (Array.isArray(msg.payload)) {
                    const nodesToWrite = msg.payload.map(function (msgToWrite) {
                        const opcuaDataValue = (0, opcua_basics_1.build_new_dataValue)(msgToWrite.datatype || msg.datatype, msgToWrite.value);
                        const nodeToWrite = {
                            nodeId: msgToWrite.nodeId,
                            attributeId: node_opcua_1.AttributeIds.Value,
                            indexRange: null,
                            value: new node_opcua_1.DataValue({ value: opcuaDataValue })
                        };
                        if (msgToWrite.timestamp || msg.timestamp) {
                            nodeToWrite.value.sourceTimestamp = new Date(msgToWrite.timestamp || msg.timestamp);
                        }
                        return nodeToWrite;
                    });
                    verbose_log("Writing nodes with values:" + (0, flatted_1.stringify)(nodesToWrite));
                    node.session.write(nodesToWrite, function (err, statusCode) {
                        if (err) {
                            set_node_errorstatus_to("error", err);
                            node_error(node.name + " Cannot write values (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
                            // No actual error session created, this case cause connections to server
                            // reset_opcua_client(connect_opcua_client);
                            node.send({ payload: err });
                        }
                        else {
                            set_node_status_to("active writing");
                            verbose_log("Values written!");
                            node.send({ payload: statusCode });
                        }
                    });
                }
            }
            else {
                set_node_status_to("Write multiple as array session is invalid");
                node_error("Write multiple as array session is not active!");
            }
        }
        function subscribe_action_input(msg) {
            verbose_log("subscribing");
            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                let timeMilliseconds = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(node.time, node.timeUnit);
                if (msg && msg.interval) {
                    timeMilliseconds = parseInt(msg.interval); // Use this instead of node.time and node.timeUnit
                }
                verbose_log("Using subscription with publish interval: " + timeMilliseconds);
                subscription = make_subscription(subscribe_monitoredItem, msg, (0, opcua_basics_1.getSubscriptionParameters)(timeMilliseconds));
                const message = { "topic": "subscriptionId", "payload": subscription.subscriptionId };
                node.send(message); // Make it possible to store
            }
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    set_node_status_to("active subscribing");
                    subscribe_monitoredItem(subscription, msg);
                }
                else {
                    subscription = null;
                    // monitoredItems = new Map();
                    monitoredItems.clear();
                    set_node_status_to("terminated");
                    // No actual error session existing, this case cause connections to server
                    // reset_opcua_client(connect_opcua_client);
                }
            }
        }
        function monitor_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("monitoring");
                if (!subscription) {
                    // first build and start subscription and subscribe on its started event by callback
                    const timeMilliseconds = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(node.time, node.timeUnit);
                    subscription = make_subscription(monitor_monitoredItem, msg, (0, opcua_basics_1.getSubscriptionParameters)(timeMilliseconds));
                }
                else {
                    // otherwise check if its terminated start to renew the subscription
                    if (subscription.subscriptionId != "terminated") {
                        set_node_status_to("active monitoring");
                        yield monitor_monitoredItem(subscription, msg);
                    }
                    else {
                        subscription = null;
                        // monitoredItems = new Map();
                        monitoredItems.clear();
                        set_node_status_to("terminated");
                        // No actual error session created, this case cause connections to server
                        // reset_opcua_client(connect_opcua_client);
                    }
                }
            });
        }
        function unsubscribe_action_input(msg) {
            verbose_log("unsubscribing");
            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                // var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
                // subscription = make_subscription(subscribe_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
                verbose_warn("Cannot unscubscribe, no subscription");
            }
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    set_node_status_to("unsubscribing");
                    unsubscribe_monitoredItem(subscription, msg); // Call to terminate monitoredItem
                }
                else {
                    subscription = null;
                    // monitoredItems = new Map();
                    monitoredItems.clear();
                    set_node_status_to("terminated");
                    // No actual error session exists, this case cause connections to server
                    // reset_opcua_client(connect_opcua_client);
                }
            }
        }
        function convertAndCheckInterval(interval) {
            let n = Number(interval);
            if (isNaN(n)) {
                n = 100;
            }
            return n;
        }
        function subscribe_monitoredItem(subscription, msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Session subscriptionId: " + subscription.subscriptionId);
                // Simplified 
                if (msg.topic === "multiple") {
                    verbose_log("Create monitored itemGroup for " + JSON.stringify(msg.payload));
                    // let interval = 1000; // Default interval 
                    let interval = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(node.time, node.timeUnit);
                    if (msg && msg.interval) {
                        interval = parseInt(msg.interval);
                    }
                    const monitorItems = [];
                    for (let i = 0; i < msg.payload.length; i++) {
                        monitorItems.push({ attributeId: node_opcua_1.AttributeIds.Value, nodeId: msg.payload[i].nodeId });
                    }
                    verbose_log("Using samplingInterval:" + interval);
                    const monitoringParameters = {
                        // clientHandle?: UInt32;
                        samplingInterval: interval,
                        // filter?: (ExtensionObject | null);
                        queueSize: 1,
                        discardOldest: true
                    };
                    verbose_log("MONITOR ITEMS: " + JSON.stringify(monitorItems));
                    const group = yield subscription.monitorItems(monitorItems, monitoringParameters, node_opcua_1.TimestampsToReturn.Both);
                    group.on("initialized", () => __awaiter(this, void 0, void 0, function* () {
                        verbose_log(chalk_1.default.green("Initialized monitoredItemsGroup !"));
                    }));
                    group.on("changed", (monitoredItem, dataValue, index) => {
                        verbose_log("Group change on item, index: " + index + " item: " + monitorItems[index].nodeId + " value: " + dataValue.value.value);
                        // verbose_log("Change detected: " + monitoredItem.toString() + " " + dataValue.toString() + " " + index);
                        const nodeId = monitoredItem.nodeId.toString(); //  monitorItems[index].nodeId.toString();
                        const value = dataValue.value.dataType === node_opcua_1.DataType.ExtensionObject
                            ? JSON.parse(JSON.stringify(dataValue))
                            : dataValue;
                        if (nodeId) {
                            /* eslint-disable-next-line */
                            const msg = {};
                            msg.topic = nodeId;
                            msg.payload = value; // if users want to get dataValue.value.value example contains function node
                            node.send(msg);
                        }
                    });
                    return;
                }
                let nodeStr = msg.topic;
                if (msg && msg.topic) {
                    if (nodeStr && nodeStr.length > 1) {
                        const dTypeIndex = nodeStr.indexOf(";datatype=");
                        if (dTypeIndex > 0) {
                            nodeStr = nodeStr.substring(0, dTypeIndex);
                        }
                    }
                }
                let monitoredItem = monitoredItems.get(msg.topic);
                if (!monitoredItem) {
                    verbose_log("Msg " + (0, flatted_1.stringify)(msg));
                    // var interval = 100; // Set as default if no payload
                    let queueSize = 10;
                    let interval = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(node.time, node.timeUnit); // Use value given at client node
                    // Interval from the payload (old existing feature still supported), but do not accept timestamp, it is too big
                    if (msg.payload && parseInt(msg.payload) > 100 && parseInt(msg.payload) < 1608935031227) {
                        interval = convertAndCheckInterval(msg.payload);
                    }
                    if (msg.interval && parseInt(msg.interval) > 100) {
                        interval = convertAndCheckInterval(msg.interval);
                    }
                    if (msg.queueSize && parseInt(msg.queueSize) > 0) {
                        queueSize = msg.queueSize;
                    }
                    verbose_log(msg.topic + " samplingInterval " + interval + " queueSize " + queueSize);
                    verbose_log("Monitoring value: " + msg.topic + ' by interval of ' + interval.toString() + " ms");
                    // Validate nodeId
                    try {
                        const nodeId = (0, node_opcua_1.coerceNodeId)(nodeStr);
                        if (nodeId && nodeId.isEmpty()) {
                            node_error(" Invalid empty node in getObject");
                        }
                        //makeNodeId(nodeStr); // above is enough
                    }
                    catch (err) {
                        node_error(err);
                        return;
                    }
                    try {
                        monitoredItem = node_opcua_1.ClientMonitoredItem.create(subscription, {
                            nodeId: nodeStr,
                            attributeId: node_opcua_1.AttributeIds.Value
                        }, {
                            samplingInterval: interval,
                            queueSize: queueSize,
                            discardOldest: true
                        }, node_opcua_1.TimestampsToReturn.Both);
                        verbose_log("Storing monitoredItem: " + nodeStr + " ItemId: " + monitoredItem.toString());
                        monitoredItems.set(nodeStr, monitoredItem);
                    }
                    catch (err) {
                        node_error("Check topic format for nodeId:" + msg.topic);
                        node_error('subscription.monitorItem:' + err);
                    }
                    monitoredItem.on("initialized", function () {
                        verbose_log("initialized monitoredItem on " + nodeStr);
                    });
                    monitoredItem.on("changed", function (dataValue) {
                        const msgToSend = JSON.parse(JSON.stringify(msg)); // clone original msg if it contains other needed properties {};
                        set_node_status_to("active subscribed");
                        // if (dataValue.statusCode != StatusCodes.Good) {
                        // Skip Overflow and limitLow, limitHigh and constant bits
                        if (dataValue.statusCode.isGoodish() === false) {
                            verbose_warn("StatusCode: " + dataValue.statusCode.toString(16) + " " + dataValue.statusCode.description);
                        }
                        msgToSend.statusCode = dataValue.statusCode;
                        msgToSend.topic = msg.topic;
                        // Check if timestamps exists otherwise simulate them
                        if (dataValue.serverTimestamp != null) {
                            msgToSend.serverTimestamp = dataValue.serverTimestamp;
                            msgToSend.serverPicoseconds = dataValue.serverPicoseconds;
                        }
                        else {
                            msgToSend.serverTimestamp = new Date().getTime();
                            msgToSend.serverPicoseconds = 0;
                        }
                        if (dataValue.sourceTimestamp != null) {
                            msgToSend.sourceTimestamp = dataValue.sourceTimestamp;
                            msgToSend.sourcePicoseconds = dataValue.sourcePicoseconds;
                        }
                        else {
                            msgToSend.sourceTimestamp = new Date().getTime();
                            msgToSend.sourcePicoseconds = 0;
                        }
                        msgToSend.payload = dataValue.value.value;
                        node.send(msgToSend);
                    });
                    monitoredItem.on("keepalive", function () {
                        verbose_log("keepalive monitoredItem on " + nodeStr);
                    });
                    monitoredItem.on("terminated", function () {
                        verbose_log("terminated monitoredItem on " + nodeStr);
                        if (monitoredItems.has(nodeStr)) {
                            monitoredItems.delete(nodeStr);
                        }
                    });
                }
                return monitoredItem;
            });
        }
        function monitor_monitoredItem(subscription, msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Session subscriptionId: " + subscription.subscriptionId);
                let nodeStr = msg.topic;
                if (msg && msg.topic) {
                    const dTypeIndex = nodeStr.indexOf(";datatype=");
                    if (dTypeIndex > 0) {
                        nodeStr = nodeStr.substring(0, dTypeIndex);
                    }
                }
                const monitoredItem = monitoredItems.get(msg.topic);
                if (!monitoredItem) {
                    verbose_log("Msg " + (0, flatted_1.stringify)(msg));
                    let interval = 100; // Set as default if no payload
                    let queueSize = 10;
                    // Interval from the payload (old existing feature still supported)
                    if (msg.payload && parseInt(msg.payload) > 100) {
                        interval = convertAndCheckInterval(msg.payload);
                    }
                    if (msg.interval && parseInt(msg.interval) > 100) {
                        interval = convertAndCheckInterval(msg.interval);
                    }
                    if (msg.queueSize && parseInt(msg.queueSize) > 0) {
                        queueSize = msg.queueSize;
                    }
                    verbose_log("Monitoring " + msg.topic + " samplingInterval " + interval + "ms, queueSize " + queueSize);
                    // Validate nodeId
                    try {
                        const nodeId = (0, node_opcua_1.coerceNodeId)(nodeStr);
                        if (nodeId && nodeId.isEmpty()) {
                            node_error(" Invalid empty node in getObject");
                        }
                        //makeNodeId(nodeStr); // above is enough
                    }
                    catch (err) {
                        node_error(err);
                        return;
                    }
                    let deadbandtype = node_opcua_1.DeadbandType.Absolute;
                    // NOTE differs from standard subscription monitor
                    if (node.deadbandType == "a") {
                        deadbandtype = node_opcua_1.DeadbandType.Absolute;
                    }
                    if (node.deadbandType == "p") {
                        deadbandtype = node_opcua_1.DeadbandType.Percent;
                    }
                    // Check if msg contains deadbandtype, use it instead of value given in client node
                    if (msg.deadbandType && msg.deadbandType == "a") {
                        deadbandtype = node_opcua_1.DeadbandType.Absolute;
                    }
                    if (msg.deadbandType && msg.deadbandType == "p") {
                        deadbandtype = node_opcua_1.DeadbandType.Percent;
                    }
                    let deadbandvalue = node.deadbandValue;
                    // Check if msg contains deadbandValue, use it instead of value given in client node
                    if (msg.deadbandValue) {
                        deadbandvalue = msg.deadbandValue;
                    }
                    verbose_log("Deadband type (a==absolute, p==percent) " + deadbandtype + " deadband value " + deadbandvalue);
                    const dataChangeFilter = new node_opcua_1.DataChangeFilter({
                        trigger: node_opcua_1.DataChangeTrigger.StatusValue,
                        deadbandType: deadbandtype,
                        deadbandValue: deadbandvalue
                    });
                    const group = yield subscription.monitorItems([{
                            nodeId: nodeStr,
                            attributeId: node_opcua_1.AttributeIds.Value
                        }], {
                        samplingInterval: interval,
                        queueSize: queueSize,
                        discardOldest: true,
                        filter: dataChangeFilter
                    }, node_opcua_1.TimestampsToReturn.Both);
                    monitoredItems.set(nodeStr, monitoredItem);
                    group.on("err", () => {
                        node.error("Monitored items error!");
                    });
                    group.on("changed", (monitoredItem, dataValue, index) => {
                        verbose_log(chalk_1.default.green("Received changes: " + monitoredItem + " value: " + dataValue + " index: " + index));
                        set_node_status_to("active monitoring");
                        verbose_log(dataValue.toString());
                        // if (dataValue.statusCode != StatusCodes.Good) {
                        //   verbose_warn("StatusCode: " + dataValue.statusCode.toString(16));
                        // }
                        if (dataValue.statusCode.isGoodish() === false) {
                            verbose_warn("StatusCode: " + dataValue.statusCode.toString(16) + " " + dataValue.statusCode.description);
                        }
                        /* eslint-disable-next-line */
                        const msgToSend = {};
                        msgToSend.statusCode = dataValue.statusCode;
                        msgToSend.topic = msg.topic;
                        // Check if timestamps exists otherwise simulate them
                        if (dataValue.serverTimestamp != null) {
                            msgToSend.serverTimestamp = dataValue.serverTimestamp;
                            msgToSend.serverPicoseconds = dataValue.serverPicoseconds;
                        }
                        else {
                            msgToSend.serverTimestamp = new Date().getTime();
                            msgToSend.serverPicoseconds = 0;
                        }
                        if (dataValue.sourceTimestamp != null) {
                            msgToSend.sourceTimestamp = dataValue.sourceTimestamp;
                            msgToSend.sourcePicoseconds = dataValue.sourcePicoseconds;
                        }
                        else {
                            msgToSend.sourceTimestamp = new Date().getTime();
                            msgToSend.sourcePicoseconds = 0;
                        }
                        msgToSend.payload = dataValue.value.value;
                        node.send(msgToSend);
                    });
                }
            });
        }
        /*
            async function get_monitored_items(subscription, msg) {
              return subscription.getMonitoredItems();
              //
              //node.session.getMonitoredItems(subscription.subscriptionId, function (err, monitoredItems) {
              //  verbose_log("Node has subscribed items: " + stringify(monitoredItems));
              //  return monitoredItems;
              //});
            }
        */
        function unsubscribe_monitoredItem(subscription, msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("Session subscriptionId: " + subscription.subscriptionId);
                let nodeStr = msg.topic; // nodeId needed as topic
                if (msg && msg.topic) {
                    const dTypeIndex = nodeStr.indexOf(";datatype=");
                    if (dTypeIndex > 0) {
                        nodeStr = nodeStr.substring(0, dTypeIndex);
                    }
                }
                // const items = await get_monitored_items(subscription, msg); // TEST
                const monitoredItem = monitoredItems.get(msg.topic);
                if (monitoredItem) {
                    verbose_log("Got ITEM: " + monitoredItem);
                    verbose_log("Unsubscribing monitored item: " + msg.topic + " item:" + monitoredItem.toString());
                    monitoredItem.terminate();
                    monitoredItems.delete(msg.topic);
                }
                else {
                    node_error("NodeId " + nodeStr + " is not subscribed!");
                }
                return;
            });
        }
        function delete_subscription_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("delete subscription msg= " + (0, flatted_1.stringify)(msg));
                if (!subscription) {
                    verbose_warn("Cannot delete, no subscription existing!");
                }
                else {
                    // otherwise check if its terminated start to renew the subscription
                    if (subscription.isActive) {
                        /* TypeScript FIX ME
                        // await node.session.deleteSubscriptions({subscriptionIds: [subscription.subscriptionId]});
                        /*
                        node.session.deleteSubscriptions({ subscriptionIds: [subscription.subscriptionId] }, function(err, response) {
                          if (err) {
                            node_error("Delete subscription error " + err);
                          }
                          else {
                            verbose_log("Subscription deleted, response:" + stringify(response));
                            subscription.terminate(); // Added to allow new subscription
                          }
                        });
                        */
                    }
                }
            });
        }
        /*
        // NEW
        async function browse_action_input(msg) {
          verbose_log("browsing");
          var allInOne = []; // if msg.collect and msg.collect === true then collect all items to one msg
        
          if (node.session) {
            const crawler = new NodeCrawler(node.session);
            set_node_status_to("active browsing");
            
            crawler.on("browsed", function(element) {
              try {
                if (msg.collect===undefined || (msg.collect && msg.collect === false)) {
                  var item = {};
                  item.payload = Object.assign({}, element); // Clone element
                  var dataType = "";
                  item.topic = element.nodeId.toString();
                  if (element && element.dataType) {
                    dataType = opcuaBasics.convertToString(element.dataType.toString());
                  }
                  if (dataType && dataType.length > 0) {
                    item.datatype = dataType;
                  }
                  node.send(item); // Send immediately as browsed
                }
                else {
                  var item = Object.assign({}, element); // Clone element
                  allInOne.push(item);
                }
              }
              catch(err1) {
                console.log("Browsed error: ", err1);
              }
            });
    
            // Browse from given topic
            const root = msg.topic; // example topic=ns=0;i=85 "ObjectsFolder";
            const rootObjects = await crawler.read(coerceNodeId(root));
            
            if (msg.collect && msg.collect === true) {
              verbose_log("Send all in one, items: " + allInOne.length);
              var all = {};
              all.topic = "AllInOne";
              // all.payload = allInOne;
              // node.send(all);
              // TODO collect rootObjects into the allInOne array
              all.payload = JSON.stringify(rootObjects); // Send back only objects crawled from the given nodeId
              node.send(all);
            }
            else {
              // "browsed" will send all objects
              // TODO Send only collected rootObjects one by one
            }
            crawler.dispose();
            set_node_status_to("browse done");
          } else {
            node_error("Session is not active!");
            set_node_status_to("Session invalid");
            reset_opcua_client(connect_opcua_client);
          }
        }
        */
        // OLD
        function browse_action_input(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("browsing");
                /* eslint-disable-next-line */
                const allInOne = []; // if msg.collect and msg.collect === true then collect all items to one msg
                // var NodeCrawler = NodeCrawler;
                if (node.session) {
                    const crawler = new node_opcua_client_crawler_1.NodeCrawler(node.session);
                    set_node_status_to("active browsing");
                    crawler.on("browsed", function (element) {
                        if (msg.collect === undefined || (msg.collect && msg.collect === false)) {
                            /* eslint-disable-next-line */
                            const item = {};
                            item.payload = Object.assign({}, element); // Clone element
                            let dataType = "";
                            item.topic = element.nodeId.toString();
                            if (element && element.dataType) {
                                dataType = (0, opcua_basics_1.convertToString)(element.dataType.toString());
                            }
                            if (dataType && dataType.length > 0) {
                                item.datatype = dataType;
                            }
                            node.send(item); // Send immediately as browsed
                        }
                        else {
                            const item = Object.assign({}, element); // Clone element
                            allInOne.push(item);
                        }
                    });
                    // Browse from given topic
                    const nodeId = msg.topic; // "ObjectsFolder";
                    crawler.read(nodeId, function (err, obj) {
                        if (!err) {
                            // Crawling done
                            if (msg.collect && msg.collect === true) {
                                verbose_log("Send all in one, items: " + allInOne.length);
                                /* eslint-disable-next-line */
                                const all = {};
                                all.topic = "AllInOne";
                                all.payload = allInOne;
                                all.objects = JSON.stringify(obj); // Added extra result
                                set_node_status_to("browse done");
                                node.send(all);
                                return;
                            }
                            set_node_status_to("browse done");
                        }
                        crawler.dispose();
                    });
                }
                else {
                    node_error("Session is not active!");
                    set_node_status_to("Session invalid");
                    reset_opcua_client(connect_opcua_client);
                }
            });
        }
        function subscribe_monitoredEvent(subscription, msg) {
            verbose_log("Session subscriptionId: " + subscription.subscriptionId);
            let monitoredItem = monitoredItems.get(msg.topic);
            if (monitoredItem === undefined) {
                verbose_log("Msg " + (0, flatted_1.stringify)(msg));
                const interval = convertAndCheckInterval(msg.payload);
                verbose_log(msg.topic + " samplingInterval " + interval);
                verbose_log("Monitoring Event: " + msg.topic + ' by interval of ' + interval + " ms");
                // TODO read nodeId to validate it before subscription
                try {
                    monitoredItem = node_opcua_1.ClientMonitoredItem.create(subscription, {
                        nodeId: msg.topic,
                        attributeId: node_opcua_1.AttributeIds.EventNotifier
                    }, {
                        samplingInterval: interval,
                        queueSize: 100000,
                        filter: msg.eventFilter,
                        discardOldest: true
                    }, node_opcua_1.TimestampsToReturn.Neither);
                }
                catch (err) {
                    node_error('subscription.monitorEvent:' + err);
                    // No actual error session exists, this case cause connections to server
                    // reset_opcua_client(connect_opcua_client);
                }
                monitoredItems.set(msg.topic, monitoredItem.monitoredItemId);
                monitoredItem.on("initialized", function () {
                    (0, node_opcua_1.callConditionRefresh)(subscription);
                    verbose_log("monitored Event initialized");
                    set_node_status_to("initialized");
                });
                monitoredItem.on("changed", function (eventFields) {
                    dumpEvent(node, node.session, msg.eventFields, eventFields, function () { console.log("Event!"); });
                    set_node_status_to("changed");
                });
                monitoredItem.on("error", function (err_message) {
                    verbose_log("error monitored Event on " + msg.topic);
                    if (monitoredItems.has(msg.topic)) {
                        monitoredItems.delete(msg.topic);
                    }
                    node_error("monitored Event " + msg.eventTypeId + " ERROR" + err_message);
                    set_node_errorstatus_to("error", err_message);
                });
                monitoredItem.on("keepalive", function () {
                    verbose_log("keepalive monitored Event on " + msg.topic);
                });
                monitoredItem.on("terminated", function () {
                    verbose_log("terminated monitored Event on " + msg.topic);
                    if (monitoredItems.has(msg.topic)) {
                        monitoredItems.delete(msg.topic);
                    }
                });
            }
            return monitoredItem;
        }
        function subscribe_events_async(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                verbose_log("subscribing events for " + msg.eventTypeIds);
                const eventTypeId = (0, node_opcua_1.resolveNodeId)(msg.eventTypeIds);
                const fields = yield (0, node_opcua_1.extractConditionFields)(node.session, eventTypeId); // works with all eventTypes
                // If field "ConditionClassId" is part of the list, it is or inherits from ConditionType
                if (!fields.includes("ConditionClassId")) {
                    //        fields.splice(fields.indexOf("ConditionId"), 1); // remove field ConditionId ??? Needed for Acknowledge
                }
                msg.eventFilter = (0, node_opcua_1.constructEventFilter)(fields, (0, node_opcua_1.ofType)(eventTypeId));
                msg.eventFields = fields;
                verbose_log("EventFields: " + msg.eventFields);
                if (!subscription) {
                    // first build and start subscription and subscribe on its started event by callback
                    const timeMilliseconds = (0, opcua_basics_1.calc_milliseconds_by_time_and_unit)(node.time, node.timeUnit);
                    subscription = make_subscription(subscribe_monitoredEvent, msg, (0, opcua_basics_1.getEventSubscriptionParameters)(timeMilliseconds));
                }
                else {
                    // otherwise check if its terminated start to renew the subscription
                    if (subscription.subscriptionId != "terminated") {
                        set_node_status_to("active subscribing");
                        subscribe_monitoredEvent(subscription, msg);
                    }
                    else {
                        subscription = null;
                        // monitoredItems = new Map();
                        monitoredItems.clear();
                        set_node_status_to("terminated");
                        // No actual error session created, this case cause connections to server
                        // reset_opcua_client(connect_opcua_client);
                    }
                }
            });
        }
        function subscribe_events_input(msg) {
            subscribe_events_async(msg);
        }
        function reconnect(msg) {
            if (msg && msg.OpcUaEndpoint) {
                // Remove listeners if existing
                if (node.client) {
                    verbose_log("Cleanup old listener events... before connecting to new client");
                    verbose_log("All event names:" + node.client.eventNames());
                    verbose_log("Connection_reestablished event count:" + node.client.listenerCount("connection_reestablished"));
                    node.client.removeListener("connection_reestablished", reestablish);
                    verbose_log("Backoff event count:" + node.client.listenerCount("backoff"));
                    node.client.removeListener("backoff", backoff);
                    verbose_log("Start reconnection event count:" + node.client.listenerCount("start_reconnection"));
                    node.client.removeListener("start_reconnection", reconnection);
                }
                // opcuaEndpoint = {}; // Clear
                opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
                connectionOption.securityPolicy = node_opcua_1.SecurityPolicy[opcuaEndpoint.securityPolicy]; // || SecurityPolicy.None;
                connectionOption.securityMode = node_opcua_1.MessageSecurityMode[opcuaEndpoint.securityMode]; // || MessageSecurityMode.None;
                verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
                if (opcuaEndpoint.login === true) {
                    userIdentity = { userName: opcuaEndpoint.user,
                        password: opcuaEndpoint.password,
                        type: node_opcua_1.UserTokenType.UserName
                    };
                    verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
                }
                verbose_log("Using new endpoint:" + (0, flatted_1.stringify)(opcuaEndpoint));
            }
            else {
                verbose_log("Using endpoint:" + (0, flatted_1.stringify)(opcuaEndpoint));
            }
            // First close subscriptions etc.
            if (subscription && subscription.isActive) {
                subscription.terminate();
            }
            // Now reconnect and use msg parameters
            subscription = null;
            // monitoredItems = new Map();
            monitoredItems.clear();
            if (node.session) {
                node.session.close(function (err) {
                    if (err) {
                        node_error("Session close error: " + err);
                    }
                    else {
                        verbose_log("Session closed!");
                    }
                });
            }
            else {
                verbose_warn("No session to close!");
            }
            //reset_opcua_client(connect_opcua_client);
            set_node_status_to("reconnect");
            create_opcua_client(connect_opcua_client);
        }
        node.on("close", function () {
            if (subscription && subscription.isActive) {
                subscription.terminate();
                // subscription becomes null by its terminated event
            }
            if (node.session) {
                node.session.close(function (err) {
                    verbose_log("Session closed");
                    set_node_status_to("session closed");
                    if (err) {
                        node_error(node.name + " " + err);
                    }
                    // node.session = null;
                    close_opcua_client("closed", 0);
                });
            }
            else {
                // node.session = null;
                close_opcua_client("closed", 0);
            }
        });
        // was "error"
        node.on("close", function () {
            if (subscription && subscription.isActive) {
                subscription.terminate();
                // subscription becomes null by its terminated event
            }
            if (node.session) {
                node.session.close(function (err) {
                    verbose_log("Session closed on error emit");
                    if (err) {
                        node_error(node.name + " " + err);
                    }
                    set_node_status_to("session closed");
                    // node.session = null;
                    close_opcua_client("node error", err);
                });
            }
            else {
                // node.session = null;
                close_opcua_client("node error", 0);
            }
        });
    }
    RED.nodes.registerType("OpcUa-Client", UaClientNodeConstructor);
};
module.exports = UaClient;
//# sourceMappingURL=102-opcuaclient.js.map