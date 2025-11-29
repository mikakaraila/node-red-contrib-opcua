/**

 Copyright 2018 Valmet Automation Inc.

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

require("node-opcua");
require("util");

module.exports = function (RED) {
  "use strict";
  let chalk = require("chalk");
  let opcua = require('node-opcua');
  const { NodeCrawler } = require("node-opcua-client-crawler"); // Legacy support
  let opcuaBasics = require('./opcua-basics');
  let crypto_utils = require("node-opcua-crypto"); // opcua.crypto_utils;
  let fileTransfer = require("node-opcua-file-transfer");
  let async = require("async");
  let fs = require("fs");
  let os = require("os");
  let cloneDeep = require('lodash.clonedeep');
  let DataType = opcua.DataType;
  let AttributeIds = opcua.AttributeIds;
  let TimestampsToReturn = opcua.TimestampsToReturn;

  const { createClientCertificateManager } = require("./utils");

  const { stringify } = require('flatted');

  function OpcUaClientNode(n) {
    RED.nodes.createNode(this, n);
    this.name = n.name;
    this.action = n.action;
    let originalAction = n.action;
    this.time = n.time;
    this.timeUnit = n.timeUnit;
    this.deadbandtype = n.deadbandtype;
    this.deadbandvalue = n.deadbandvalue;
    this.certificate = n.certificate; // n == NONE, l == Local file, e == Endpoint, u == Upload
    this.localfile = n.localfile; // Local certificate file
    this.localkeyfile = n.localkeyfile; // Local private key file
    this.useTransport = n.useTransport;
    this.maxChunkCount = n.maxChunkCount;
    this.maxMessageSize = n.maxMessageSize;
    this.receiveBufferSize = n.receiveBufferSize;
    this.sendBufferSize = n.sendBufferSize;
    this.setstatusandtime = n.setstatusandtime;
    this.keepsessionalive = n.keepsessionalive;
    this.applicationName = n.applicationName;
    this.applicationUri = n.applicationUri;
    let node = this;
    let opcuaEndpoint = RED.nodes.getNode(n.endpoint); // Use as global for the node
    let userIdentity = { type: opcua.UserTokenType.Anonymous }; // Initialize with Anonymous
    let connectionOption = {};
    let cmdQueue = []; // queue msgs which can currently not be handled because session is not established, yet and currentStatus is 'connecting'
    let currentStatus = ''; // the status value set set by node.status(). Didn't find a way to read it back.
    let multipleItems = []; // Store & read multiple nodeIds
    let writeMultipleItems = []; // Store & write multiple nodeIds & values
    let options;
    connectionOption.securityPolicy = opcuaEndpoint.securityPolicy
    connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint.securityMode] || opcua.MessageSecurityMode.None;
    let userCertificate = opcuaEndpoint.userCertificate;
    let userPrivatekey = opcuaEndpoint.userPrivatekey;
    
    connectionOption.clientCertificateManager = createClientCertificateManager();

    if (node.certificate === "l" && node.localfile) {
      verbose_log("Using 'own' local certificate file " + node.localfile);
      // User must define absolute path
      let certfile = node.localfile;
      let keyfile = node.localkeyfile;
      connectionOption.certificateFile = certfile;
      connectionOption.privateKeyFile = keyfile;

      if (!fs.existsSync(certfile)) {
        node_error("Local certificate file not found: " + certfile)
      }
      if (!fs.existsSync(keyfile)) {
        node_error("Local private key file not found: " + keyfile)
      }
    }
    if (node.applicationName) connectionOption.applicationName = node.applicationName;
    if (node.applicationUri) connectionOption.applicationUri = node.applicationUri;
    // Moved needed options to client create
    connectionOption.requestedSessionTimeout = opcuaBasics.calc_milliseconds_by_time_and_unit(300, "s");
    // DO NOT USE must be NodeOPCUA-Client !! connectionOption.applicationName = node.name; // Application name
    connectionOption.clientName = node.name; // This is used for the session names
    connectionOption.endpointMustExist = false;
    connectionOption.defaultSecureTokenLifetime = 40000 * 5;
    // From the node UI, keep min values!
    // Needed or not?
    if (!node.maxChunkCount || parseInt(node.maxChunkCount) < 1) node.maxChunkCount = 1;
    if (!node.maxMessageSize || parseInt(node.maxMessageSize) < 8192) node.maxMessageSize = 8192;
    if (!node.receiveBufferSize || parseInt(node.receiveBufferSize) < 8 * 1024) node.receiveBufferSize = 8 * 1024;
    if (!node.sendBufferSize || parseInt(node.sendBufferSize) < 8 * 1024) node.sendBufferSize = 8 * 1024;

    let transportSettings = {
      maxChunkCount: parseInt(node.maxChunkCount),         // Default 1
      maxMessageSize: parseInt(node.maxMessageSize),       // should be at least 8192
      receiveBufferSize: parseInt(node.receiveBufferSize), // 8 * 1024,
      sendBufferSize: parseInt(node.sendBufferSize)        // 8 * 1024
    };

    if (node.useTransport === true) {
      connectionOption["transportSettings"] = { ...transportSettings };
      verbose_log(chalk.red("Using, transport settings: ") + chalk.cyan(JSON.stringify(connectionOption["transportSettings"])));
    }

    connectionOption.connectionStrategy = {
      maxRetry: 10512000, // Limited to max 10 ~5min // 10512000, // 10 years should be enough. No infinite parameter for backoff.
      initialDelay: 5000, // 5s
      maxDelay: 30 * 1000 // 30s
    };

    // Ensure Anonymous login
    if (connectionOption.securityMode === opcua.MessageSecurityMode.None || opcuaEndpoint.none === true) {
      userIdentity = { type: opcua.UserTokenType.Anonymous };
    }
    if (opcuaEndpoint.login === true && opcuaEndpoint.usercert === true) {
      userIdentity = { type: opcua.UserTokenType.Anonymous };
    }
    if (opcuaEndpoint.login === true && opcuaEndpoint.usercert === true) {
      node.error("Cannot use username & password & user certificate at the same time!");
    }
    // Username & password with securityMode None is allowed
    if (opcuaEndpoint.login === true) { // } && connectionOption.securityMode != opcua.MessageSecurityMode.None) {
      userIdentity = {
        type: opcua.UserTokenType.UserName,
        userName: opcuaEndpoint.credentials.user.toString(),
        password: opcuaEndpoint.credentials.password ? opcuaEndpoint.credentials.password.toString() : ""
      };
      verbose_log(chalk.green("Using UserName & password: ") + chalk.cyan(JSON.stringify(userIdentity)));
    }
    else if (opcuaEndpoint.usercert === true) {
      if (!fs.existsSync(userCertificate)) {
        node.error("User certificate file not found: " + userCertificate);
      }
      const certificateData = crypto_utils.readCertificate(userCertificate);

      if (!fs.existsSync(userPrivatekey)) {
        node.error("User private key file not found: " + userPrivatekey);
      }
      const privateKey = crypto_utils.readPrivateKeyPEM(userPrivatekey);
      userIdentity = {
        certificateData,
        privateKey,
        type: opcua.UserTokenType.Certificate // User certificate
      };
    }
    else {
      userIdentity = { type: opcua.UserTokenType.Anonymous };
    }

    verbose_log(chalk.green("UserIdentity: ") + chalk.cyan(JSON.stringify(userIdentity)));
    let items = [];
    let subscription; // only one subscription needed to hold multiple monitored Items

    let monitoredItems = new Map();


    function node_error(err) {
      node.error(chalk.red("Client node error on: " + node.name + " error: " + stringify(err)));
    }

    function verbose_warn(logMessage) {
      if (opcuaEndpoint?.name && node.name) { // Optional name
        console.warn(chalk.cyan(`${opcuaEndpoint?.name}`) + chalk.yellow(":") + chalk.cyan(node.name) ? chalk.cyan(node.name) + chalk.yellow(': ') + chalk.cyan(logMessage) : chalk.yellow('OpcUaClientNode: ') + chalk.cyan(logMessage));
      }
      node.warn(logMessage);
    }

    function verbose_log(logMessage) {
      if (RED.settings.verbose) {
        node.debug(chalk.yellow(logMessage));
      }
    }

    async function getBrowseName(_session, nodeId) {
      const dataValue = await _session.read({
        attributeId: AttributeIds.BrowseName,
        nodeId
      });
      if (dataValue.statusCode.isGood()) {
        const browseName = dataValue.value.value.name;
        return browseName;
      } else {
        return "???";
      }
    }
    // Fields selected alarm fields
    // EventFields same order returned from server array of variants (filled or empty)
    async function __dumpEvent(node, session, fields, eventFields, _callback) {
      let msg = {};
      msg.payload = {};
      verbose_log(chalk.yellow("Event Fields: ") + chalk.cyan(JSON.stringify(eventFields)));
      set_node_status_to("active event");

      for (let i = 0; i < eventFields.length; i++) {
        let variant = eventFields[i];
        let fieldName = fields[i];
        verbose_log(chalk.yellow("Event Field: ") + chalk.cyan(fieldName) + " " + chalk.cyan(stringify(variant)));
        // Check if variant is NodeId and then get qualified name (browseName)
        if (variant?.dataType && variant.dataType === DataType.NodeId) {
          fieldName = await getBrowseName(session, variant.value);
        }
        if (!variant || variant.dataType === DataType.Null || !variant.value) {
          verbose_log(chalk.red("No variant or variant dataType is Null or no variant value! Variant: ") + chalk.cyan(JSON.stringify(variant)));
        } else {
          if (fieldName === "EventId" && variant?.dataType) {
            msg.payload[fieldName] = "0x" + variant.value.toString("hex"); // As in UaExpert
            msg.payload["_" + fieldName] = variant; // Keep as ByteString
          } else {
            // Added handling for LocalizedText to use OS locale / node-red __language__
            if (fieldName === "Message") {
              const locale = Intl.DateTimeFormat().resolvedOptions().locale;
              if (variant.value.length > 1) {
                let i = 0;
                while (i < variant.value.length) {
                  let localText = variant.value[i];
                  // Change according locale
                  if (localText.locale === locale) {
                    variant.value = localText;
                    break;
                  }
                  i++;
                }
              }
            }
            msg.payload[fieldName] = opcuaBasics.clone_object(variant.value);
          }
          // if available, needed for Acknowledge function in client
          if (fieldName === "ConditionId" && variant?.dataType) {
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
      else if (msg.payload.EventType) {
        msg.topic = msg.payload.EventType.toString();
      }

      verbose_log(chalk.yellow("Event message topic: ") + chalk.cyan(msg.topic));
      node.send([msg, null, null]);

      _callback();
    }

    let eventQueue = new async.queue(function (task, callback) {
      __dumpEvent(task.node, task.session, task.fields, task.eventFields, callback);
    });

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
      set_node_status2_to("connected", "re-established");
    };
    const backoff = function (attempt, delay) {
      let msg = {};
      msg.error = {};
      msg.error.message = "reconnect";
      msg.error.source = this;
      // node.error("reconnect", msg);
      verbose_log(chalk.red("reconnect")) //  + chalk.cyan(stringify(msg))); // msg is TOO big to show
      set_node_status2_to("reconnect", "attempt #" + attempt + " retry in " + delay / 1000.0 + " sec");
    };
    const reconnection = function () {
      set_node_status2_to("reconnect", "starting...");
    };

    function create_opcua_client(callback) {
      node.client = null;
      options = {
          securityMode: connectionOption.securityMode,
          securityPolicy: connectionOption.securityPolicy,
          defaultSecureTokenLifetime: connectionOption.defaultSecureTokenLifetime,
          endpointMustExist: connectionOption.endpointMustExist,
          connectionStrategy: connectionOption.connectionStrategy,
          clientCertificateManager: connectionOption.clientCertificateManager,
          clientName: node.name, // Fix for #664 sessionName
          keepSessionAlive: node.keepsessionalive,
          requestedSessionTimeout: 60000 * 5, // 5min, default 1min
          automaticallyAcceptUnknownCertificate: true,
          // transportSettings: transportSettings // Some 
          applicationName: connectionOption.applicationName,
          applicationUri: connectionOption.applicationUri
      };
      try {
        // Use empty 0.0.0.0 address as "no client" initial value
        if (opcuaEndpoint?.endpoint?.indexOf("opc.tcp://0.0.0.0") == 0) {
          verbose_warn(`close opcua client ${node.client} userIdentity ${userIdentity.type}`);
          if (node.client) {
            close_opcua_client("connection error: no session", 0);
          }
          items = [];
          node.items = items;
          set_node_status_to("no client");
          if (callback) {
            callback();
          }
          return;
        }
        // Normal client
        if (!node.keepsessionalive) {
          node.keepsessionalive = false;
        }
        verbose_log(chalk.yellow("Keep session alive: ") + chalk.cyan(node.keepsessionalive));
        if (node.useTransport === true) {
          options["transportSettings"] = JSON.parse(JSON.stringify(connectionOption.transportSettings));
          verbose_log(chalk.red("NOTE: Using transport settings: " + chalk.cyan(stringify(options))));
        }
        verbose_log(chalk.green("1) CREATE CLIENT: ") + chalk.cyan(stringify(options)));
        node.client = opcua.OPCUAClient.create(options);
        node.client.on("connection_reestablished", reestablish);
        node.client.on("backoff", backoff);
        node.client.on("start_reconnection", reconnection);
        node.client.clientCertificateManager = connectionOption.clientCertificateManager; // FIX connection issue
      }
      catch (err) {
        node_error("Cannot create client, check connection options: " + stringify(options)); // connectionOption
        set_node_status_to("Cannot create client");
      }
      items = [];
      node.items = items;
      set_node_status_to("create client");
      if (callback) {
        callback();
      }
    }

    function reset_opcua_client(callback) {
      if (node.client) {
        node.client.disconnect(function () {
          verbose_log("Client disconnected!");
          create_opcua_client(callback);
        });
      }
    }

    function close_opcua_client(message, error) {
      // verbose_warn(`closing opcua client ${opcua.client == null} userIdentity ${JSON.stringify(userIdentity)}`)
      if (node.client) {
        node.client.removeListener("connection_reestablished", reestablish);
        node.client.removeListener("backoff", backoff);
        node.client.removeListener("start_reconnection", reconnection);
        try {
          if (!node.client.isReconnecting) {
            node.client.disconnect(function () {
              node.client = null;
              verbose_log("Client disconnected!");
              if (error === 0) {
                set_node_status_to("closed");
              }
              else {
                set_node_error_status_to(message, error)
                node.error("Client disconnected & closed: " + message + " error: " + error.toString());
              }
            });
          }
          else {
            node.client = null;
            set_node_status_to("closed");
          }
        }
        catch (err) {
          node_error("Error on disconnect: " + stringify(err));
        }
      }
    }

    function set_node_status_to(statusValue) {
      verbose_log(chalk.yellow("Client status: ") + chalk.cyan(statusValue));
      let statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      let endpoint = "";
      if (opcuaEndpoint && opcuaEndpoint.endpoint) {
        endpoint = opcuaEndpoint.endpoint
      }
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status,
        endpoint: `${endpoint}`
      });
      node.send([null, { error: null, endpoint: `${endpoint}`, status: currentStatus }, null])

    }

    function set_node_status2_to(statusValue, message) {
      verbose_log(chalk.yellow("Client status: ") + chalk.cyan(statusValue));
      let statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      let endpoint = "";
      if (opcuaEndpoint?.endpoint) {
        endpoint = opcuaEndpoint.endpoint
      }
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status + " " + message,
        endpoint: `${endpoint}`
      });
      node.send([null, { error: null, endpoint: `${endpoint}`, status: currentStatus }, null]);
    }

    function set_node_error_status_to(statusValue, error) {
      verbose_log(chalk.yellow("Client status: ") + chalk.cyan(statusValue));
      let statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      let endpoint = "";
      if (opcuaEndpoint?.endpoint) {
        endpoint = opcuaEndpoint.endpoint
      }
      if (!error) {
        error = "";
      }
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status + " " + error,
        endpoint: `${endpoint}`
      });
      node.send([null, { error: error, endpoint: `${endpoint}`, status: currentStatus }, null]);
    }

    async function connect_opcua_client() {
      if (opcuaEndpoint?.login === true) {
        verbose_log(chalk.green("Using UserName & password: ") + chalk.cyan(JSON.stringify(userIdentity)));
        if (opcuaEndpoint.credentials && opcuaEndpoint['user'] && opcuaEndpoint['password']) {
          userIdentity = {
            type: opcua.UserTokenType.UserName,
            userName: opcuaEndpoint?.credentials?.user?.toString(),
            password: opcuaEndpoint?.credentials?.password?.toString()
          };
        }
        else if (opcuaEndpoint['user'] && opcuaEndpoint['password']) {
          userIdentity = {
            type: opcua.UserTokenType.UserName,
            userName: opcuaEndpoint?.user?.toString(),
            password: opcuaEndpoint?.password?.toString()
          };
        } else {
          node_error("Please enter user or password in credentials or same level as login")
        }
      }
      else if (opcuaEndpoint?.usercert === true) {
        if (!fs.existsSync(userCertificate)) {
          node.error("User certificate file not found: " + userCertificate);
        }
        const certificateData = crypto_utils.readCertificate(userCertificate);
        if (!fs.existsSync(userPrivatekey)) {
          node.error("User private key file not found: " + userPrivatekey);
        }
        const privateKey = crypto_utils.readPrivateKeyPEM(userPrivatekey);
        userIdentity = {
          certificateData,
          privateKey,
          type: opcua.UserTokenType.Certificate // User certificate
        };
      }
      else {
        verbose_warn(chalk.red("userIdentity is ANONYMOUS "));
        userIdentity = { type: opcua.UserTokenType.Anonymous };
      }

      // Refactored from old async Javascript to new Typescript with await
      let session;
      // STEP 1
      // First connect to server´s endpoint
      if (opcuaEndpoint?.endpoint) {
        verbose_log(chalk.yellow("Connecting to endpoint: ") + chalk.cyan(opcuaEndpoint?.endpoint));
      }
      else {
        node_error("No client endpoint listed! Waiting...");
        return;
      }

      if (opcuaEndpoint?.endpoint?.indexOf("opc.tcp://0.0.0.0") === 0) {
        set_node_status_to("no client")
      }
      /*
      else {
        set_node_status_to("connecting");
      }
      if (!node.client) {
        verbose_log("No client to connect...");
        return;
      }
      */
      verbose_log(chalk.yellow("Exact endpointUrl: ") + chalk.cyan(opcuaEndpoint?.endpoint) + chalk.yellow(" hostname: ") + chalk.cyan(os.hostname()));
      try {
          node.client = opcua.OPCUAClient.create(options);
          node.client.clientCertificateManager = connectionOption.clientCertificateManager;
          await node.client.clientCertificateManager.initialize();
      }
      catch (error1) {
        set_node_status_to("invalid certificate");
        let msg = {};
        msg.error = {};
        msg.error.message = "Certificate error: " + error1.message;
        msg.error.source = this;
        node.error("Certificate error", msg);
      }
      node.debug(chalk.yellow("Trusted folder:      ") + chalk.cyan(node.client?.clientCertificateManager?.trustedFolder));
      node.debug(chalk.yellow("Rejected folder:     ") + chalk.cyan(node.client?.clientCertificateManager?.rejectedFolder));
      node.debug(chalk.yellow("Crl folder:          ") + chalk.cyan(node.client?.clientCertificateManager?.crlFolder));
      node.debug(chalk.yellow("Issuers Cert folder: ") + chalk.cyan(node.client?.clientCertificateManager?.issuersCertFolder));
      node.debug(chalk.yellow("Issuers Crl folder:  ") + chalk.cyan(node.client?.clientCertificateManager?.issuersCrlFolder));

      try {
        verbose_log(chalk.green("2) Connecting using endpoint: ") + chalk.cyan(opcuaEndpoint?.endpoint) +
          chalk.green(" securityMode: ") + chalk.cyan(connectionOption.securityMode) +
          chalk.green(" securityPolicy: ") + chalk.cyan(connectionOption.securityPolicy));
        await node.client.connect(opcuaEndpoint?.endpoint);
      } catch (err) {
          verbose_warn("Case A: Endpoint does not contain, 1==None 2==Sign 3==Sign&Encrypt, using securityMode: " + stringify(connectionOption.securityMode));
          verbose_warn("        using securityPolicy: " + stringify(connectionOption.securityPolicy));
          verbose_warn("Case B: UserName & password does not match to server (needed by Sign or SignAndEncrypt), check username: " + userIdentity.userName + " and password: " + userIdentity.password);
          verbose_warn("Case C: With Sign you cannot use SecurityPolicy None!!");
          verbose_warn("Case D: Certificate chain not valid, check server certificate chain against:");
          verbose_warn("        CRL folder: " + node.client?.clientCertificateManager?.crlFolder);
          verbose_warn("        Issuer folder: " + node.client?.clientCertificateManager?.issuersCertFolder);
          verbose_warn("        Issuer CRL folder: " + node.client?.clientCertificateManager?.issuersCrlFolder);
          // verbose_error("Invalid endpoint parameters: ", err);
          node_error("Wrong endpoint parameters: " + JSON.stringify(opcuaEndpoint) + ", error: " + JSON.stringify(err));
          set_node_status_to("invalid endpoint");
          let msg = {};
          msg.error = {};
          msg.error.message = "Invalid endpoint: " + err;
          msg.error.source = this;
          node.error("Invalid endpoint", msg);
          return;
      }
      verbose_log(chalk.green("Connected to endpoint: ") + chalk.cyan(opcuaEndpoint?.endpoint));

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
        // verbose_warn(`Create session with userIdentity node.client ${node.client == null} userIdentity ${JSON.stringify(userIdentity)}`)
        verbose_log(chalk.green("3) Create session with userIdentity at: ") + chalk.cyan(JSON.stringify(userIdentity)));
        //  {"clientName": "Node-red OPC UA Client node " + node.name},
        // sessionName = "Node-red OPC UA Client node " + node.name;
        if (!node.client) {
          node_error("Client not yet created, cannot create session");
          close_opcua_client("connection error: no client", 0);
          return;
        }
        session = await node.client.createSession(userIdentity);
        if (!session) {
          node_error("Create session failed!");
          verbose_warn(`Create session failed!`)

          close_opcua_client("connection error: no session", 0);
          return;
        }
        node.session = session;
        set_node_status_to("session active");
        for (let i in cmdQueue) {
          processInputMsg(cmdQueue[i]);
        }
        cmdQueue = [];
      } catch (err) {
        node_error(node.name + " OPC UA connection error: " + err.message);
        verbose_log(err);
        node.session = null;
        close_opcua_client("connection error", err);
      }
    }

    function make_subscription(callback, msg, parameters) {
      let newSubscription = null;

      if (!node.session) {
        verbose_log("Subscription without session");
        return newSubscription;
      }

      if (!parameters) {
        verbose_log("Subscription without parameters");
        return newSubscription;
      }
      verbose_log("Publishing interval " + stringify(parameters));
      newSubscription = opcua.ClientSubscription.create(node.session, parameters);
      verbose_log("Subscription " + newSubscription.toString());
      newSubscription.on("initialized", function () {
        verbose_log("Subscription initialized");
        set_node_status_to("initialized");
      });

      newSubscription.on("started", function () {
        verbose_log("Subscription subscribed ID: " + newSubscription.subscriptionId);
        set_node_status_to("subscribed");
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
        monitoredItems.clear();
      });

      newSubscription.on("error", function (err) {
        verbose_log("Subscription error on ID: " + newSubscription.subscriptionId + ". " + err);
        set_node_error_status_to("subscription error")
        subscription = null;
        monitoredItems.clear();
      })

      return newSubscription;
    }

    if (!node.client) {
      create_opcua_client(connect_opcua_client);
    }

    function processInputMsg(msg) {
      if (msg.action === "reconnect") {
        cmdQueue = [];
        // msg.endpoint can be used to change endpoint
        msg.action = "";
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
        node.action = msg.action;
      }
      else {
        verbose_log(chalk.green("Using node action: ") + chalk.cyan(originalAction));
        node.action = originalAction; // Use original action from the node
      }
      // With new node-red easier to set action into payload
      if (msg.payload?.action && msg.payload.action.length > 0) {
        verbose_log("Override node action by msg.payload.action:" + msg.payload.action);
        node.action = msg.payload.action;
      }

      if (!node.action) {
        verbose_warn("Can't work without action (read, write, browse ...)");
        //node.send(msg); // do not send in case of error
        node.send([null, { error: "Can't work without action (read, write, browse ...)", endpoint: `${opcuaEndpoint.endpoint}`, status: currentStatus }, null]);

        return;
      }

      if (!node.client || !node.session) {
        verbose_log("Not connected, current status: " + currentStatus);
        // Added statuses when msg must be put to queue
        // Added statuses when msg must be put to queue
        const statuses = ['', 'create client', 'connecting', 'reconnect'];
        if (statuses.includes(currentStatus)) {
          cmdQueue.push(msg);
        } else {
          verbose_warn(`can't work without OPC UA client ${node.client} client ${node.session}`);
          reset_opcua_client(connect_opcua_client);
        }
        node.send([null, { error: "can't work without OPC UA client", endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
        return;
      }

      if (!node.session.sessionId == "terminated") {
        verbose_warn("terminated OPC UA Session");
        reset_opcua_client(connect_opcua_client);

        node.send([null, { error: "terminated OPC UA Session", endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);

        return;
      }

      if (msg.action && (msg.action === "connect" || msg.action === "disconnect")) {
        // OK
        msg.action = "";
      } else if (!msg.topic) {
        verbose_warn("can't work without OPC UA NodeId - msg.topic empty");
        node.send([null, { error: "can't work without OPC UA NodeId", endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
        return;
      }

      verbose_log(chalk.yellow("Action on input: ") + chalk.cyan(node.action) +
        chalk.yellow(" Item from Topic: ") + chalk.cyan(msg.topic) +
        chalk.yellow(" session Id: ") + chalk.cyan(node.session.sessionId));

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
          writemultiple_action_input(msg)
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
          verbose_warn("Unknown action: " + node.action + " with msg " + stringify(msg));
          break;
      }
    }
    node.on("input", processInputMsg);

    async function acknowledge_input(msg) {
      // msg.topic is nodeId of the alarm object like Prosys ns=6;s=MyLevel.Alarm
      // msg.conditionId is actual conditionObject that contains ns=6;s=MyLevel.Alarm/0:EventId current/latest eventId will be read
      // msg.comment will be used as comment in the acknowledge
      let eventId;
      if (msg.conditionId) {
        const dataValue = await node.session.read({ nodeId: msg.conditionId, attributeId: AttributeIds.Value });

        eventId = dataValue.value.value;
        verbose_log(chalk.yellow("Acknowledge (alarm object == topic): ") + chalk.cyan(msg.topic) +
          chalk.yellow(" conditionObject (nodeId of eventId): ") + chalk.cyan(msg.conditionId) +
          chalk.yellow(" value of eventId: 0x") + chalk.cyan(eventId.toString("hex")) +
          chalk.yellow(" comment: ") + chalk.cyan(msg.comment));
      }
      // If actual eventId provided use it
      if (msg.eventId) {
        eventId = msg.eventId;
      }
      if (eventId) {
        try {
          const ackedState = await node.session.read({ nodeId: msg.topic + "/0:AckedState/0:Id", attributeId: AttributeIds.Value });
          node.debug(chalk.yellow("EVENT ACKED STATE: ") + chalk.cyan(ackedState));
          if (ackedState && ackedState.statusCode === opcua.StatusCodes.Good && ackedState.value.value === true) {
            node.status({
              fill: "yellow",
              shape: "dot",
              text: "Event: " + msg.topic + " already acknowledged"
            });
          }
          else {
            const status = await node.session.acknowledgeCondition(msg.topic, eventId, msg.comment);
            if (status !== opcua.StatusCodes.Good) {
              node_error(node.name + "Error at acknowledge, status: " + status.toString());
              set_node_error_status_to("error", status.toString());
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
          set_node_error_status_to("error", err);
        }
      }
      else {
        node_error(node.name + " error at acknowledge, no eventId, possible wrong msg.conditionId " + msg.conditionId);
      }
    }

    async function read_file(msg) {
      verbose_log("Read file, nodeId: " + msg.topic.toString());
      let file_node = opcua.coerceNodeId(msg.topic);
      if (node.session) {
        try {
          const clientFile = new fileTransfer.ClientFile(node.session, file_node);
          fileTransfer.ClientFile.useGlobalMethod = true;
          // Given that the file is opened in ReadMode Only
          await clientFile.open(fileTransfer.OpenFileMode.Read);

          // Read file size
          try {
            const size = await clientFile.size(); // This should read size from the file itself
            let buf = await clientFile.read(size);
            // node-opcua-file-transfer takes care of the whole file reading from v2.94.0
            await clientFile.close();
            msg.payload = buf;
            // Debug purpose, show content
            verbose_log("File content: " + buf.toString());
          }
          catch (err) {
            msg.payload = "";
            node_error(node.name + " failed to read file, nodeId: " + msg.topic + " error: " + err);
            set_node_error_status_to("error", "Cannot read file!");
            node.send([null, { error: node.name + " failed to read file, nodeId: " + msg.topic + " error: " + err, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }]);

          }

          node.send([msg, null]);

        }
        catch (err) {
          node_error(node.name + " failed to read fileTransfer, nodeId: " + msg.topic + " error: " + err);
          set_node_error_status_to("error", err.toString());
          node.send([null, { error: node.name + " failed to read fileTransfer, nodeId: " + msg.topic + " error: " + err, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);

        }
      }
      else {
        verbose_warn("No open session to read file!");
      }
    }

    async function write_file(msg) {
      verbose_log("Write file, nodeId: " + msg.topic.toString());
      let file_node = opcua.coerceNodeId(msg.topic);
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
          const clientFile = new fileTransfer.ClientFile(node.session, file_node);
          clientFile.useGlobalMethod = true;
          // Given that the file is opened in WriteMode
          await clientFile.open(fileTransfer.OpenFileMode.Write);
          verbose_log("Local file content: " + buf.toString());
          verbose_log("Writing file to server...");
          await clientFile.write(buf);
          await clientFile.close();
          verbose_log("Write done!");
        }
        catch (err) {
          node.error(chalk.red("Cannot write file, error: " + err.message));
        }
      }
      else {
        verbose_warn("No open session to write file!");
      }
    }

    async function method_action_input(msg) {
      verbose_log("Calling method: " + JSON.stringify(msg));
      if (node.session) {
        try {
          let status = await callMethod(msg);
          if (status === opcua.StatusCodes.Good) {
            node.status({
              fill: "green",
              shape: "dot",
              text: "Method executed"
            });
          }
          else {
            node.error("Failed, method result: ", status.description);
          }
        }
        catch (err) {
          node.error(chalk.red("Cannot call method, error: " + err.message));
        }
      }
      else {
        verbose_warn("No open session to call method!");
      }
    }

    async function callMethod(msg) {
      if (msg.methodId && msg.inputArguments) {
        verbose_log("Calling method: " + JSON.stringify(msg.methodId));
        verbose_log("InputArguments: " + JSON.stringify(msg.inputArguments));
        if (msg.outputArguments) {
          verbose_log("OutputArguments: " + JSON.stringify(msg.outputArguments));
        }
        let args=[];
        let i = 0;
        let tmp;
        set_node_status_to("building method arguments");
        try {
          while (i < msg.inputArguments.length) {
            tmp = msg.inputArguments[i];
            if (tmp.dataType === "NodeId") {
              tmp.value = opcua.coerceNodeId(tmp.value);
            }
            if (tmp.dataType === "ExtensionObject") {
              let extensionobject = null;
              // tmp = {dataType: "ExtensionObject", typeid: tmp.typeid, value: tmp.value};
              if (tmp.typeid) {
                extensionobject = await node.session.constructExtensionObject(opcua.coerceNodeId(tmp.typeid), tmp.value); // TODO make while loop to enable await
                tmp.value = extensionobject;
              }
              // verbose_log("ExtensionObject: " + extensionobject);
              // Object.assign(extensionobject, tmp.value);
              /*
              verbose_log(chalk.green("ExtensionObject value: ") + JSON.stringify(tmp.value));
              tmp.value = new opcua.Variant({
                dataType: opcua.DataType.ExtensionObject,
                value: tmp.value // JSON.stringify(tmp.value) // extensionobject
              });
              */
              verbose_log(chalk.green("ExtensionObject: ") + JSON.stringify(tmp));
            }
            else {
              if (tmp.valueRank && tmp.valueRank >= 1) {
                tmp = {dataType: tmp.dataType, valueRank: tmp.valueRank, arrayDimensions: 1, value: tmp.value};
              }
              else {
                tmp = {dataType: tmp.dataType, value: tmp.value};
              }
              verbose_log("Basic type: " + JSON.stringify(tmp));
            }
            args.push(tmp);
            i++;
          }
        } catch (err) {
          console.log(chalk.red("Error: "), err);
          let msg = {};
          msg.error = {};
          msg.error.message = "Invalid NodeId: " + err;
          msg.error.source = this;
          node.error("Invalid argument: ", tmp);
          return opcua.StatusCodes.BadNodeIdUnknown;
        }
        // verbose_log("Updated InputArguments: " + stringify(msg.inputArguments));
        verbose_log("Updated InputArguments: " + JSON.stringify(args));
        let callMethodRequest;
        let diagInfo;
        try {
          callMethodRequest = new opcua.CallMethodRequest({
            objectId: opcua.coerceNodeId(msg.objectId),
            methodId: opcua.coerceNodeId(msg.methodId),
            inputArgumentDiagnosticInfos: diagInfo,
            inputArguments: args,
            // inputArguments: msg.inputArguments,
            outputArguments: msg.outputArguments
          });
        } catch (err) {
          set_node_status_to("call method error");
          node.error("Build method request failed, error: " + err.message);
        }
        verbose_log("Call request: " + callMethodRequest.toString());
        verbose_log("Calling: " + callMethodRequest);
        try {
          set_node_status_to("call method");
          const result = await node.session.call(callMethodRequest);
          if (diagInfo) {
            verbose_log("Diagn. info: " + stringify(diagInfo));
          }
          if (msg.outputArguments) {
            verbose_log("Output args: " + stringify(msg.outputArguments));
          }
          verbose_log("Results:     " + stringify(result));
          msg.result = result;
          if (result && result.statusCode === opcua.StatusCodes.Good) {
            let i = 0;
            msg.output = result.outputArguments; // Original outputArguments
            msg.payload = []; // Store values back to array
            if (result.outputArguments.length == 1) {
              verbose_log("Value: " + result.outputArguments[i].value);
              msg.payload = result.outputArguments[0].value; // Return only if one output argument
            } else {
              while (result.outputArguments.length > i) {
                verbose_log("Value[" + i + "]:" + result.outputArguments[i].toString());
                msg.payload.push(result.outputArguments[i].value); // Just copy result value to payload[] array, actual value needed mostly
                i++;
              }
            }
          } else {
            set_node_status_to("execute method error");
            node.error("Execute method result, error:" + result.statusCode.description);
            node.send([null, { error: "Execute method result, error:" + result.statusCode.description, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }]);

            return result.statusCode;
          }
          node.send([msg, null]);

          return opcua.StatusCodes.Good;
        } catch (err) {
          set_node_status_to("execute method error");
          node.error("Method execution error: " + err.message);
          node.send([null, { error: "Method execution error: " + err.message, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);

          return opcua.StatusCodes.BadMethodInvalid;
        }
      }
    }

    async function connect_action_input(msg) {
      console.log("#1 ACTION Connect!");
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
        opcuaEndpoint = {}; // Clear
        opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
        connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint?.securityPolicy]; // || opcua.SecurityPolicy.None;
        connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint?.securityMode]; // || opcua.MessageSecurityMode.None;
        verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
        if (opcuaEndpoint.login === true) {
          userIdentity = {
            userName: opcuaEndpoint?.user,
            password: opcuaEndpoint?.password,
            type: opcua.UserTokenType.UserName
          };
          verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
        }
        verbose_log("Using new endpoint:" + stringify(opcuaEndpoint));
      } else {
        verbose_log("Using endpoint:" + stringify(opcuaEndpoint));
      }
      console.log("#2 Create client");
      if (!node.client) {
        create_opcua_client(connect_opcua_client);
      }
    }

    function disconnect_action_input(msg) {
      verbose_log("Closing session...");
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

      opcuaEndpoint = {}; // Clear
      opcuaEndpoint = msg.OpcUaEndpoint;
      // Now reconnect and use msg parameters
      subscription = null;
      monitoredItems.clear();
      verbose_log("Disconnecting...");
      if (node.client) {
        node.client.removeListener("connection_reestablished", reestablish);
        verbose_log("Backoff event count:" + node.client.listenerCount("backoff"));
        node.client.removeListener("backoff", backoff);
        verbose_log("Start reconnection event count:" + node.client.listenerCount("start_reconnection"));
        node.client.removeListener("start_reconnection", reconnection);
        node.client.disconnect(function () {
          verbose_log("Client disconnected!");
          set_node_status_to("disconnected");
        });
        node.client = null;
      }
    }

    async function register_action_input(msg) {
      verbose_log("register nodes : " + msg.payload.toString());
      // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
      // msg.topic not used, but cannot be empty
      // msg.payload == array of nodeIds to register
      if (msg.payload.length > 0) {
        const registeredNodes = await node.session.registerNodes(msg.payload);
        verbose_log("RegisteredNodes: " + registeredNodes.toString());
      }
      else {
        verbose_warn("No items to register in the payload! Check node:" + node.name);
      }
    }

    async function unregister_action_input(msg) {
      verbose_log("unregister nodes : " + msg.payload.toString());
      // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
      // msg.topic not used, but cannot be empty
      // msg.payload == array of nodeIds to register
      if (msg.payload.length > 0) {
        const unregisteredNodes = await node.session.registerNodes(msg.payload);
        verbose_log("UnregisteredNodes: " + unregisteredNodes.toString());
      }
      else {
        verbose_warn("No items to unregister in the payload! Check node:" + node.name);
      }
    }

    async function read_action_input(msg) {

      verbose_log("reading");
      let item = "";
      let range = null;
      if (msg.topic) {
        let n = msg.topic.indexOf("datatype=");
        if (n > 0) {
          msg.datatype = msg.topic.substring(n + 9);
          item = msg.topic.substring(0, n - 1);
          msg.topic = item;
          verbose_log(stringify(msg));
        }
      }
      let br = "";
      // browsePath enhancement, item starts with br=/Objects/3:Simulation/3:Counter
      // console.log("ITEM: " + item + " topic: " + msg.topic);
      if (item.length > 0 && item.indexOf("br=") === 0) {
        verbose_log("Finding nodeId by browsePath: " + item.substring(3));
        br = item.substring(3);
      }
      if (msg.topic.length > 0 && msg.topic.startsWith("br=")) {
        verbose_log("Finding nodeId by browsePath: " + msg.topic.substring(3));
        br = msg.topic.substring(3);
      }
      if (br.length > 0) {
        const translate = [opcua.makeBrowsePath("RootFolder", br)];
        const results = await node.session.translateBrowsePath(translate);
        if (results && results[0].statusCode === opcua.StatusCodes.Good &&
          results[0].targets[0]?.targetId) {
          msg.topic = results[0].targets[0].targetId; // replace msg.topic with the nodeId that is get by using browsePath
          verbose_log("Found browsePath => nodeId: " + msg.topic);
        }
        else {
          node_error("Cannot translate browsePathToNodeId: " + br + "/" + translate + " error: " + results);
        }
      }

      if (item.length > 0) {
        items[0] = item;
      } else {
        items[0] = msg.topic;
      }

      // Added support for indexRange, payload can be just one number as string "5"  or "2:5"
      if (msg.payload?.range) {
        range = new opcua.NumericRange(msg.payload.range);
      }
      if (node.session) {
        // With Single Read using now read to get sourceTimeStamp and serverTimeStamp
        verbose_log("Reading value by nodeId: " + items[0]);
        try {
          node.session.read({
            nodeId: items[0],
            attributeId: 13,
            indexRange: range,
            timestampsToReturn: opcua.TimestampsToReturn.Both
          },
            function (err, dataValue, diagnostics) {
              if (err) {
                if (diagnostics) {
                  verbose_log('diagnostics:' + diagnostics);
                }
                node_error(node.name + " error at active reading: " + err.message);
                set_node_error_status_to("error", err);
                // No actual error session created, this case cause connections to server
                // reset_opcua_client(connect_opcua_client);
              } else {
                set_node_status_to("active reading");
                verbose_log("Node : " + msg.topic);
                verbose_log(dataValue.toString());
                if (dataValue) {
                  try {
                    verbose_log("Value : " + dataValue.value.value);
                    verbose_log("DataType: " + dataValue.value.dataType + " (" + DataType[dataValue.value.dataType] + ")");
                    verbose_log("Message: " + msg.topic + " (" + msg.datatype + ")");
                    if (dataValue.value.dataType === opcua.DataType.UInt16) {
                      verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + opcuaBasics.toInt32(dataValue.value.value));
                    }

                    // clone payload via JSON stringify/parse only if datavalue is an ExtensionObject or an array of ExtensionObjects
                    msg.payload = dataValue.value.dataType === opcua.DataType.ExtensionObject
                      ? JSON.parse(JSON.stringify((dataValue.value.value)))
                      : dataValue.value.value;

                    msg.statusCode = dataValue.statusCode;
                    msg.serverTimestamp = dataValue.serverTimestamp;
                    msg.sourceTimestamp = dataValue.sourceTimestamp;

                    if (dataValue.statusCode && dataValue.statusCode.isGoodish() === false) {
                      verbose_warn("StatusCode: " + dataValue.statusCode.toString(16) + " " + dataValue.statusCode.description);
                    }
                    node.send([msg, null]);

                  } catch (e) {
                    if (dataValue != null) {
                      node_error("Bad read: " + (dataValue.statusCode.toString(16)));
                      node_error("Message:" + msg.topic + " dataType:" + msg.datatype);
                      node_error("Data:" + stringify(dataValue));
                      node.send([null, { error: "Bad read: " + (dataValue.statusCode.toString(16)), endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
                    } else {
                      node_error(e.message);
                      node.send([null, { error: e.message, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
                    }
                  }

                }
              }
            });
        }
        catch (error) {
          node_error("Cannot read: " + error);
        }
      } else {
        set_node_status_to("invalid session");
        node_error("Session is not active!")
      }
    }

    async function readhistory_action_input(msg) {
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
      let processingInterval = end - start; // Whole range 10 * 1000; // 10s interval
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
          let historyReadDetails = new Object({
            isReadModified: false, // Fixed, any need to modify?
            numValuesPerNode: numValues,
            returnBounds: returnBounds,
            timestampsToReturn: opcua.TimestampsToReturn.Both // Fixed, return always both
          });
          verbose_log("NodeId: " + msg.topic + " from: " + new Date(start) + " to: " + new Date(end) + " options: " + JSON.stringify(historyReadDetails));
          let historicalReadResult = await node.session.readHistoryValue({ nodeId: msg.topic }, new Date(start), new Date(end), historyReadDetails);
          msg.payload = historicalReadResult;
          node.send([msg, null]);

        }
        if (msg.aggregate && msg.aggregate === "max") {
          let resultMax = await node.session.readAggregateValue(
            { nodeId: msg.topic },
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Maximum,
            processingInterval);
          msg.payload = resultMax;
          node.send([msg, null, null]);

          if (resultMax.statusCode === opcua.StatusCodes.Good) {
            verbose_log(chalk.green("History max: ") + chalk.cyan(resultMax.historyData.dataValues[0].value.value));
          }
        }
        if (msg.aggregate && msg.aggregate === "min") {
          let resultMin = await node.session.readAggregateValue(
            { nodeId: msg.topic },
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Minimum,
            processingInterval);
          msg.payload = resultMin;
          node.send([msg, null, null]);

          if (resultMin.statusCode === opcua.StatusCodes.Good) {
            verbose_log(chalk.green("History min: ") + chalk.cyan(resultMin.historyData.dataValues[0].value.value));
          }
        }
        if (msg.aggregate && msg.aggregate === "ave") {
          let resultAve = await node.session.readAggregateValue(
            { nodeId: msg.topic },
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Average,
            processingInterval);
          msg.payload = resultAve;
          node.send([msg, null, null]);

          if (resultAve.statusCode === opcua.StatusCodes.Good) {
            verbose_log(chalk.green("History ave: ") + chalk.cyan(resultAve.historyData.dataValues[0].value.value));
          }
        }
        if (msg.aggregate && msg.aggregate === "interpolative") {
          let resultInter = await node.session.readAggregateValue(
            { nodeId: msg.topic },
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Interpolative,
            processingInterval);
          msg.payload = resultInter;
          node.send([msg, null, null]);

          if (resultInter.statusCode === opcua.StatusCodes.Good) {
            verbose_log(chalk.green("History interpolative: ") + chalk.cyan(resultInter.historyData.dataValues[0].value.value));
          }

        }
      }
    }

    function readmultiple_action_input(msg) {

      verbose_log("read multiple...");
      let item = "";
      //
      if (msg.topic) {
        let n = msg.topic.indexOf("datatype=");
        if (n > 0) {
          msg.datatype = msg.topic.substring(n + 9);
          item = msg.topic.substring(0, n - 1);
          msg.topic = item;
          verbose_log(stringify(msg));
        }
      }

      // Store nodeId and browseName to read multipleItems array
      if (msg.topic !== "readmultiple" && msg.topic !== "clearitems") {
        if (item.length > 0) {
          multipleItems.push({ nodeId: item, browseName: msg.browseName, attributeId: AttributeIds.Value, TimestampsToReturn: opcua.TimestampsToReturn.Both });
        } else {
          // msg.topic
          multipleItems.push({ nodeId: msg.topic, browseName: msg.browseName, attributeId: AttributeIds.Value, TimestampsToReturn: opcua.TimestampsToReturn.Both }); // support for multiple item reading
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
          multipleItems.push({ nodeId: msg.payload[i], attributeId: AttributeIds.Value, TimestampsToReturn: opcua.TimestampsToReturn.Both });
          i = i + 1;
        }
      }

      if (node.session && msg.topic === "readmultiple") {
        //  node.session.read({timestampsToReturn: TimestampsToReturn.Both, nodesToRead: multipleItems}, function (err, dataValues, diagnostics) {
        verbose_log("Reading items: " + stringify(multipleItems));
        if (multipleItems.length === 0) {
          node_error(node.name + " no items to read");
          set_node_status_to("no items to read");
          return;
        }
        node.session.read(multipleItems,
          function (err, dataValues, diagnostics) {
            if (err) {
              if (diagnostics) {
                verbose_log('diagnostics:' + diagnostics);
              }
              node_error(node.name + " error at active reading: " + err.message);
              set_node_error_status_to("error", err);
              // No actual error session existing, this case cause connections to server
              // reset_opcua_client(connect_opcua_client);
            }
            else {
              set_node_status_to("active multiple reading");

              if (msg.payload === "ALL") {
                node.send([{ "topic": "ALL", "payload": dataValues, "items": multipleItems }, null, null]);
                return;
              }

              for (let i = 0; i < dataValues.length; i++) {
                let dataValue = dataValues[i];
                verbose_log("Node : " + msg.topic);
                verbose_log(dataValue.toString());
                if (dataValue) {
                  try {
                    verbose_log("Value : " + dataValue.value.value);
                    verbose_log("DataType: " + dataValue.value.dataType + " (" + DataType[dataValue.value.dataType] + ")");
                    if (dataValue.value.dataType === opcua.DataType.UInt16) {
                      verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + opcuaBasics.toInt32(dataValue.value.value));
                    }
                    if (dataValue.statusCode && dataValue.statusCode.isGoodish() === false) {
                      verbose_warn("StatusCode: " + dataValue.statusCode.toString(16) + " " + dataValue.statusCode.description);
                    }
                    let serverTs = dataValue.serverTimestamp;
                    let sourceTs = dataValue.sourceTimestamp;
                    if (serverTs === null) {
                      serverTs = new Date();
                    }
                    if (sourceTs === null) {
                      sourceTs = new Date();
                    }

                    let value = dataValue.value.dataType === opcua.DataType.ExtensionObject
                      ? JSON.parse(JSON.stringify(dataValue.value.value))
                      : dataValue.value.value;

                    // Use nodeId in topic, arrays are same length
                    // Output pin 1 for each value by value
                    // verbose_log("Output pin1, topic: " + JSON.stringify(multipleItems[i]) + " payload: " + value);
                    node.send([{
                      topic: multipleItems[i],
                      payload: value,
                      statusCode: dataValue.statusCode,
                      serverTimestamp: serverTs,
                      sourceTimestamp: sourceTs
                    }, null, null]);
                  } catch (e) {
                    if (dataValue != null) {
                      node_error("Bad read, statusCode: " + (dataValue.statusCode.toString(16)));
                      node_error("Data:" + stringify(dataValue));
                    } else {
                      node_error(e.message);
                      // Output pin 2 for errors
                      // verbose_log("Output pin2, error: " + e.message);
                      node.send([null, { error: e.message, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
                      return;
                    }
                  }
                }
              }
              // Send all values in one msg to output 3
              // verbose_log("Output pin3, topic: " + multipleItems + " payload: " + dataValues);
              node.send([null, null, 
                {
                  topic: multipleItems,
                  payload: dataValues
                }]); 
            }
          });
      } else {
        set_node_status_to("invalid session");
        node_error("Session is not active!")
      }
    }

    function info_action_input(msg) {
      verbose_log("meta-data reading");
      let item = "";
      if (msg.topic) {
        let n = msg.topic.indexOf("datatype=");

        if (n > 0) {
          msg.datatype = msg.topic.substring(n + 9);
          item = msg.topic.substring(0, n - 1);
          msg.topic = item;
          verbose_log(stringify(msg));
        }
      }

      if (item.length > 0) {
        items[0] = item;
      } else {
        items[0] = msg.topic;
      }

      if (node.session) {
        // TODO this could loop through all items
        node.session.readAllAttributes(opcua.coerceNodeId(items[0]), function (err, result) {
          if (!err) {
            let newMsg = Object.assign(msg, result);
            node.send([newMsg, null, null]);
          }
          else {
            set_node_status_to("error");
            node_error("Cannot read attributes from nodeId: " + items[0])
          }
        });
      } else {
        set_node_status_to("invalid session");
        node_error("Session is not active!")
      }
    }

    async function build_extension_object_action_input(msg) {
      verbose_log("Construct ExtensionObject from " + JSON.stringify(msg));
      let item = "";
      if (msg.topic) {
        let n = msg.topic.indexOf("datatype=");

        if (n > 0) {
          msg.datatype = msg.topic.substring(n + 9);
          item = msg.topic.substring(0, n - 1);
          msg.topic = item;
          verbose_log(stringify(msg));
        }
      }

      if (item.length > 0) {
        items[0] = item;
      } else {
        items[0] = msg.topic;
      }

      if (node.session) {
        try {
          const ExtensionNodeId = opcua.coerceNodeId(items[0]);
          verbose_log("ExtensionNodeId: " + ExtensionNodeId);
          const ExtensionTypeDefinition = await node.session.read({ nodeId: ExtensionNodeId, attributeId: opcua.AttributeIds.DataTypeDefinition });
          if (ExtensionTypeDefinition.statusCode != opcua.StatusCodes.Good) {
            node_error("Failed to find extension type for nodeId: " + ExtensionNodeId + " error: " + ExtensionTypeDefinition.statusCode.description);
            return;
          }
          else {
            verbose_log("ExtensionType: " + JSON.stringify(ExtensionTypeDefinition));
          }
          let newmsg = {};
          const ExtensionData = await node.session.constructExtensionObject(ExtensionNodeId, {});
          if (ExtensionData) {
            verbose_log("ExtensionData: " + ExtensionData.toString());
          }
          // Simplified
          newmsg.topic = msg.topic;
          newmsg.payload = JSON.parse(JSON.stringify(ExtensionData)); //  JSON.stringify(ExtensionData); // New value with default values
          verbose_log("Extension Object msg: " + stringify(newmsg))
          node.send([newmsg, null, null]);
        }
        catch (err) {
          if (err) {
            node_error("Failed to build ExtensionObject, error: " + err);
            set_node_status_to("extensionObject error");
          }
        }
      } else {
        set_node_status_to("invalid session");
        node_error("Session is not active!")

        node.send([null, { error: "Session is not active!", endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);

      }
    }

    async function write_action_input(msg) {
      if (msg?.topic && msg.topic.indexOf("ns=") != 0) return; // NOT an item

      // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
      let dIndex = msg.topic.indexOf("datatype=");
      let range = null;

      if (msg.datatype == null && dIndex > 0) {
        msg.datatype = msg.topic.substring(dIndex + 9);
      }

      let nodeid;
      verbose_log(opcua.makeBrowsePath(msg.topic, "."));
      // TODO ns=10 TEST 2 digits namespace
      if (dIndex > 0) {
        nodeid = opcua.coerceNodeId(msg.topic.substring(0, dIndex - 1));
      }
      else {
        nodeid = opcua.coerceNodeId(msg.topic);
      }

      // Less output
      // verbose_log("namespace=" + ns);
      // verbose_log("string=" + s);
      // verbose_log("NodeId= " + nodeid.toString + " type=" + msg.datatype);

      let opcuaDataValue = msg.datatype && msg.datatype.indexOf("ExtensionObject") >= 0 && node.session
        ? await build_new_extensionObject_dataValue(msg.datatype, msg.topic, msg.payload, node.session)
        : opcuaBasics.build_new_dataValue(msg.datatype, msg.payload);

      async function build_new_extensionObject_dataValue(datatype, topic, payload, session) {
        let defaultExtensionObject = null;

        if (topic.indexOf("typeId=") > 0) {
          let typeId = topic.substring(topic.indexOf("typeId=") + 7);
          verbose_log("ExtensionObject TypeId= " + typeId);
          defaultExtensionObject = await session.constructExtensionObject(opcua.coerceNodeId(typeId), {}); // Create first with default values
          verbose_log("ExtensionObject=" + stringify(defaultExtensionObject));
        }

        let nValue = null;

        if (datatype.indexOf("Array") > 0) {
          // datatype is array of extension object
          payload.value.forEach(function (extensionObject, index) {
            // deep clone default extension object
            let duplicatedDefaultExtensionObject = cloneDeep(defaultExtensionObject);
            payload.value[index] = Object.assign(duplicatedDefaultExtensionObject, extensionObject);
          });

          nValue = {
            dataType: opcua.DataType.ExtensionObject,
            value: payload.value,
            arrayType: opcua.VariantArrayType.Array
          };
        } else {
          // datatype is extension object
          verbose_log("payload: " + stringify(payload));
          let extensionObject;
          if (!defaultExtensionObject) {
            extensionObject = payload; // use payload directly, payload must be ExtensionObject ready/like not a JSON object
          }
          else {
            extensionObject = Object.assign(defaultExtensionObject, payload); // MERGE payload over default values
          }
          /* TEST
          nValue = {
            dataType: opcua.DataType.ExtensionObject,
            value: extensionObject,
            arrayType: opcua.VariantArrayType.Array // Quick FIX
          };
          console.log("New nValue: " + JSON.stringify(nValue));
          */
          if (extensionObject && extensionObject.length !== undefined) {
            nValue = {
              dataType: opcua.DataType.ExtensionObject,
              value: extensionObject,
              arrayType: opcua.VariantArrayType.Array // Quick FIX
            };
            // console.log("New nValue: " + JSON.stringify(nValue));
          }
          else {
            nValue = {
              dataType: opcua.DataType.ExtensionObject,
              value: extensionObject
            };
          }
        }

        return nValue
      }

      // TODO Fix object array according range
      // Added support for indexRange, payload can be just one number as string "5"  or "2:5"

      // Helper for node-red server write
      if (msg.range) {
        verbose_log(chalk.red("Range: " + msg.range));
        range = new opcua.NumericRange(msg.range);
        verbose_log(chalk.red("Range: " + JSON.stringify(range) + " values: " + JSON.stringify(opcuaDataValue)));
        // TODO write to node-red server still work to do
      }

      let nodeToWrite;
      if (node.session && !node.session.isReconnecting && node.session.isChannelValid()) {
        if (range) {
          nodeToWrite = {
            nodeId: nodeid.toString(),
            attributeId: opcua.AttributeIds.Value,
            indexRange: range,
            value: new opcua.DataValue({ value: new opcua.Variant(opcuaDataValue) })
          };
        }
        else {
          // console.log("Writing datatype: " + opcuaDataValue.dataType + " value: " + opcuaDataValue.value);
          // Added overflow/underflow check Int32, Int16, UInt64, UInt32, UInt16, Byte, SByte
          if (opcuaDataValue.dataType === opcua.DataType.Int32) {
            if (opcuaDataValue.value > 2147483647) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max Int32");
              opcuaDataValue.value = 2147483647;
            }
            if (opcuaDataValue.value < -2147483648) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min Int32");
              opcuaDataValue.value = -2147483648;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.Int16) {
            if (opcuaDataValue.value > 32767) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max Int16");
              opcuaDataValue.value = 32767;
            }
            if (opcuaDataValue.value < -32768) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min Int16");
              opcuaDataValue.value = -32768;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.UInt64) {
            if (Array.isArray(opcuaDataValue.value)){ //64 bit ints are sometimes passed as arrays of 32 bit ints
              if(!isNaN(opcuaDataValue.value[0]) && !isNaN(opcuaDataValue.value[1])){
                opcuaDataValue.value = opcuaDataValue.value[0] * (2**32) + opcuaDataValue.value[1];
              } else if(!isNaN(opcuaDataValue.value[0])){
                opcuaDataValue.value = opcuaDataValue.value[0];
              } else if(!isNaN(opcuaDataValue.value[1])){
                opcuaDataValue.value = opcuaDataValue.value[1];
              } else {
                node.warn("Input to UInt64 write is array of null values")
              }
            }
            if (opcuaDataValue.value > 2**64 - 1) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max Int32");
              opcuaDataValue.value = 2**64 - 1;
            }
            if (opcuaDataValue.value < 0) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min Int32");
              opcuaDataValue.value = 0;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.UInt32) {
            if (opcuaDataValue.value > 4294967295) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max UInt32");
              opcuaDataValue.value = 4294967295;
            }
            if (opcuaDataValue.value < 0) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min UInt32");
              opcuaDataValue.value = 0;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.UInt16) {
            if (opcuaDataValue.value > 65535) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max UInt16");
              opcuaDataValue.value = 65535;
            }
            if (opcuaDataValue.value < 0) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min UInt16");
              opcuaDataValue.value = 0;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.Byte) {
            if (opcuaDataValue.value > 255) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max Byte");
              opcuaDataValue.value = 255;
            }
            if (opcuaDataValue.value < 0) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min Byte");
              opcuaDataValue.value = 0;
            }
          }
          if (opcuaDataValue.dataType === opcua.DataType.SByte) {
            if (opcuaDataValue.value > 127) {
              // See note below, some servers will NOT accept statusCode write
              set_node_error_status_to("error", "overflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: overflow Writing max SByte");
              opcuaDataValue.value = 127;
            }
            if (opcuaDataValue.value < -128) {
              set_node_error_status_to("error", "underflow");
              node_error(node.name + " Cannot write value " + opcuaDataValue.value + ") to nodeId:" + nodeid.toString() + " error: underflow Writing min SByte");
              opcuaDataValue.value = -128;
            }
          }

          nodeToWrite = {
            nodeId: nodeid.toString(),
            attributeId: opcua.AttributeIds.Value,
            value: new opcua.DataValue({
              value: new opcua.Variant(opcuaDataValue),
              // sourceTimestamp: new Date(),            // NOTE: Some servers do NOT accept time writing
              // statusCode: opcua.StatusCodes.Good      // NOTE: Same with status writing, NOT accepted always
            })
          };
        }
        if (node.setstatusandtime && msg.timestamp) {
          verbose_log("NEW sourceTimestamp: " + new Date(msg.timestamp).toISOString());
          nodeToWrite.value.sourceTimestamp = new Date(msg.timestamp).getTime();
        }
        if (node.setstatusandtime && msg.sourceTimestamp) {
          verbose_log("NEW sourceTimestamp: " + new Date(msg.sourceTimestamp).toISOString());
          nodeToWrite.value.sourceTimestamp = new Date(msg.sourceTimestamp).getTime();
        }
        if (node.setstatusandtime && msg.statusCode) {
          verbose_log("NEW statusCode: " + opcua.StatusCode.makeStatusCode(msg.statusCode));
          nodeToWrite.value.statusCode = msg.statusCode;
        }
        verbose_log("VALUE TO WRITE: " + JSON.stringify(nodeToWrite));
        set_node_status_to("writing");
        try {
          node.session.write(nodeToWrite, function (err, statusCode) {
            if (err) {
              set_node_error_status_to("error", err);
              node_error(node.name + " Cannot write value (" + stringify(msg.payload) + ") to msg.topic:" + msg.topic + " error:" + err);
              // No actual error session existing, this case cause connections to server
              // reset_opcua_client(connect_opcua_client);
              msg.payload = err;
              node.send([msg, null]);
            } else {
              set_node_status_to("value written");
              verbose_log("Value written! Result:" + statusCode + " " + statusCode.description);
              if (statusCode.isGoodish() === false) {
                verbose_warn("StatusCode: " + statusCode.toString(16) + " " + statusCode.description);
                set_node_error_status_to("error", statusCode.description);
              }
              msg.payload = statusCode;
              node.send([msg, null, null]);
            }
          });
        }
        catch(error) {
          set_node_status_to("error");
          node_error("Write failed, error: " + error);
        }
      } else {
        set_node_status_to("invalid session");
        node_error("Session is not active!")
      }
    }

    async function writemultiple_action_input(msg) {
      verbose_log("writing multiple");
      // Store as with readmultiple item
      if (msg.topic && msg.topic !== "writemultiple" && !Array.isArray(msg.payload)) {
        // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
        let dIndex = msg.topic.indexOf("datatype=");

        if (msg.datatype == null && dIndex > 0) {
          msg.datatype = msg.topic.substring(dIndex + 9);
        }

        // Store nodeId to read multipleItems array
        if (msg.topic !== "writemultiple" && msg.topic !== "clearitems") {
          let opcuaDataValue = opcuaBasics.build_new_dataValue(msg.datatype, msg.payload);
          let item = {
            nodeId: msg.topic,
            datatype: msg.datatype,
            attributeId: opcua.AttributeIds.Value,
            indexRange: null,
            value: new opcua.DataValue({ value: opcuaDataValue })
          };
          item.value.sourceTimestamp = new Date(msg.timestamp).getTime();
          verbose_log("ITEM: " + stringify(item));
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
      if (node.session && !node.session.isReconnecting && node.session.isChannelValid()  && msg.topic === "writemultiple") {
        if (Array.isArray(msg.payload)) {
          writeMultipleItems = msg.payload; // expecting payload format is correct
        }
        verbose_log("Writing items: " + stringify(writeMultipleItems));
        if (writeMultipleItems.length === 0) {
          node_error(node.name + " no items to write");
          set_node_status_to("no items to write");
          return;
        }
        await node.session.write(writeMultipleItems, function (err, statusCode) {
          if (err) {
            set_node_error_status_to("error", err);
            node_error(node.name + " Cannot write values (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
            node.send([{ payload: err }, { error: `${err}`, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);

          } else {
            set_node_status_to("active writing");
            verbose_log("Values written!");
            node.send([{ payload: statusCode }, null, null]);
            set_node_status_to("values written");
            return; // Do not try to run old way
          }
        });
        return;
      }
      else {
        if (!node.session || node.session.isReconnecting || !node.session.isChannelValid()) {
          set_node_status_to("invalid session");
          node_error("Write multiple items session is not active!")
        }
      }

      // OLD original way to use payload
      let nodesToWrite; // Define here so it can write array of values
      if (node.session && !node.session.isReconnecting && node.session.isChannelValid()) {
        if (Array.isArray(msg.payload)) {
          nodesToWrite = msg.payload.map(function (msgToWrite) {
            let opcuaDataValue = opcuaBasics.build_new_dataValue(msgToWrite.datatype || msg.datatype, msgToWrite.value);
            const nodeToWrite = {
              nodeId: msgToWrite.nodeId || (node && node.toString()),
              attributeId: opcua.AttributeIds.Value,
              indexRange: null,
              value: new opcua.DataValue({ value: opcuaDataValue })
            };
            if (msgToWrite.timestamp || msg.timestamp) {
              nodeToWrite.value.sourceTimestamp = new Date(msgToWrite.timestamp || msg.timestamp).getTime();
            }
            return nodeToWrite;
          });
          verbose_log("Writing nodes with values:" + stringify(nodesToWrite));

          await node.session.write(nodesToWrite, function (err, statusCode) {
            if (err) {
              set_node_error_status_to("error", err);
              node_error(node.name + " Cannot write values (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
              node.send([{ payload: err }, { error: `${err}`, endpoint: `${opcuaEndpoint?.endpoint}`, status: currentStatus }, null]);
            } else {
              set_node_status_to("active writing");
              verbose_log("Values written!");
              node.send([{ payload: statusCode }, null, null]);
              set_node_status_to("values written");
            }
          });
        }
      } else {
        set_node_status_to("invalid session");
        node_error("Write multiple as array session is not active!")
      }
    }

    function subscribe_action_input(msg) {
      verbose_log("subscribing");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        let timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        if (msg?.interval) {
          timeMilliseconds = parseInt(msg.interval); // Use this instead of node.time and node.timeUnit
        }
        verbose_log("Using subscription with publish interval: " + timeMilliseconds);
        subscription = make_subscription(subscribe_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
        let message = { "topic": "subscriptionId", "payload": subscription.subscriptionId };
        // node.send(message); // Make it possible to store
        node.send([message, null, null]);
      } else if (subscription.subscriptionId != "terminated") {
        // otherwise check if its terminated start to renew the subscription
        set_node_status_to("active subscribing");
        subscribe_monitoredItem(subscription, msg);
      } else {
        monitoredItems.clear();
        set_node_status_to("terminated");
        // No actual error session existing, this case cause connections to server
      }
    }

    async function monitor_action_input(msg) {
      verbose_log("monitoring");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        let timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        subscription = make_subscription(monitor_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
      } else if (subscription.subscriptionId != "terminated") {
        // otherwise check if its terminated start to renew the subscription
        set_node_status_to("active monitoring");
        await monitor_monitoredItem(subscription, msg);
      } else {
        subscription = null;
        monitoredItems.clear();
        set_node_status_to("terminated");
        // No actual error session created, this case cause connections to server
      }
    }

    function unsubscribe_action_input(msg) {
      verbose_log("unsubscribing");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        verbose_warn("Cannot unscubscribe, no subscription");
      } else if (subscription.subscriptionId != "terminated") {
        // otherwise check if its terminated start to renew the subscription
        set_node_status_to("unsubscribing");
        unsubscribe_monitoredItem(subscription, msg); // Call to terminate monitoredItem
      } else {
        subscription = null;
        monitoredItems.clear();
        set_node_status_to("terminated");
        // No actual error session exists, this case cause connections to server
      }
    }

    function convertAndCheckInterval(interval) {
      let n = Number(interval);
      if (isNaN(n)) {
        n = 100;
      }
      return n;
    }

    async function subscribe_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);

      // Simplified 
      if (msg.topic === "multiple") {
        verbose_log("Create monitored itemGroup for " + JSON.stringify(msg.payload));
        let interval = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        if (msg?.interval) {
          interval = parseInt(msg.interval);
        }
        const monitorItems = [];
        for (const element of msg.payload) {
          monitorItems.push({ attributeId: AttributeIds.Value, nodeId: element.nodeId });
        }
        verbose_log("Using samplingInterval:" + interval);
        const monitoringParameters = {
          // clientHandle?: UInt32;
          samplingInterval: interval, // read from msg.interval
          // filter?: (ExtensionObject | null);
          queueSize: 1,
          discardOldest: true
        };
        verbose_log("MONITOR ITEMS: " + JSON.stringify(monitorItems));
        const group = await subscription.monitorItems(monitorItems, monitoringParameters, TimestampsToReturn.Both);
        group.on("initialized", async () => {
          verbose_log(chalk.green("Initialized monitoredItemsGroup !"));
        });
        group.on("changed", (_monitoredItem, dataValue, index) => {
          verbose_log("Group change on item, index: " + index + " item: " + monitorItems[index].nodeId + " value: " + dataValue.value.value);

          const nodeId = monitorItems[index].nodeId.toString();

          let value = dataValue.value.dataType === opcua.DataType.ExtensionObject
            ? JSON.parse(JSON.stringify(dataValue))
            : dataValue;

          if (nodeId) {
            let msg = {};
            msg.topic = nodeId;
            msg.payload = value; // if users want to get dataValue.value.value example contains function node
            node.send([msg, null, null]);

          }
        });
        return;
      }

      let nodeStr = msg.topic;
      if (msg?.topic) {
        if (nodeStr && nodeStr.length > 1) {
          let dTypeIndex = nodeStr.indexOf(";datatype=");
          if (dTypeIndex > 0) {
            nodeStr = nodeStr.substring(0, dTypeIndex);
          }
        }
      }
      let monitoredItem = monitoredItems.get(msg.topic);

      if (!monitoredItem) {
        verbose_log("Msg " + stringify(msg));
        // Set as default if no payload
        let queueSize = 10;
        let interval = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit); // Use value given at client node
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
          let nodeId = opcua.coerceNodeId(nodeStr);
          if (nodeId?.isEmpty()) {
            node_error(" Invalid empty node in getObject");
          }
          //makeNodeId(nodeStr); // above is enough
        } catch (err) {
          node_error(err);
          return;
        }

        try {
          monitoredItem = opcua.ClientMonitoredItem.create(subscription, {
            nodeId: nodeStr,
            attributeId: opcua.AttributeIds.Value
          }, {
            samplingInterval: interval,
            queueSize: queueSize,
            discardOldest: true
          },
            TimestampsToReturn.Both, // Other valid values: Source | Server | Neither | Both
          );
          verbose_log("Storing monitoredItem: " + nodeStr + " ItemId: " + monitoredItem.toString());
          monitoredItems.set(nodeStr, monitoredItem);
        } catch (err) {
          node_error("Check topic format for nodeId:" + msg.topic)
          node_error('subscription.monitorItem:' + err);
        }

        monitoredItem.on("initialized", function () {
          verbose_log("initialized monitoredItem on " + nodeStr);
        });

        monitoredItem.on("changed", function (dataValue) {
          let msgToSend = JSON.parse(JSON.stringify(msg)); // clone original msg if it contains other needed properties {};

          set_node_status_to("active subscribed");
          // if (dataValue.statusCode != opcua.StatusCodes.Good) {
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
          } else {
            msgToSend.serverTimestamp = new Date().getTime();;
            msgToSend.serverPicoseconds = 0;
          }

          if (dataValue.sourceTimestamp != null) {
            msgToSend.sourceTimestamp = dataValue.sourceTimestamp;
            msgToSend.sourcePicoseconds = dataValue.sourcePicoseconds;
          } else {
            msgToSend.sourceTimestamp = new Date().getTime();;
            msgToSend.sourcePicoseconds = 0;
          }

          msgToSend.payload = dataValue.value.value;
          node.send([msgToSend, null, null]);

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
    }

    async function monitor_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);
      let nodeStr = msg.topic;
      if (msg?.topic) {
        let dTypeIndex = nodeStr.indexOf(";datatype=");
        if (dTypeIndex > 0) {
          nodeStr = nodeStr.substring(0, dTypeIndex);
        }
      }
      let monitoredItem = monitoredItems.get(msg.topic);
      if (!monitoredItem) {
        verbose_log("Msg " + stringify(msg));
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
          let nodeId = opcua.coerceNodeId(nodeStr);
          if (nodeId?.isEmpty()) {
            node_error(" Invalid empty node in getObject");
          }
          //makeNodeId(nodeStr); // above is enough
        } catch (err) {
          node_error(err);
          return;
        }
        let deadbandtype = opcua.DeadbandType.Absolute;
        // NOTE differs from standard subscription monitor
        if (node.deadbandType == "a") {
          deadbandtype = opcua.DeadbandType.Absolute;
        }
        if (node.deadbandType == "p") {
          deadbandtype = opcua.DeadbandType.Percent;
        }
        // Check if msg contains deadbandtype, use it instead of value given in client node
        if (msg.deadbandType && msg.deadbandType == "a") {
          deadbandtype = opcua.DeadbandType.Absolute;
        }
        if (msg.deadbandType && msg.deadbandType == "p") {
          deadbandtype = opcua.DeadbandType.Percent;
        }
        let deadbandvalue = node.deadbandvalue;
        // Check if msg contains deadbandValue, use it instead of value given in client node
        if (msg.deadbandValue) {
          deadbandvalue = msg.deadbandValue;
        }
        verbose_log("Deadband type (a==absolute, p==percent) " + deadbandtype + " deadband value " + deadbandvalue);
        let dataChangeFilter = new opcua.DataChangeFilter({
          trigger: opcua.DataChangeTrigger.StatusValue,
          deadbandType: deadbandtype,
          deadbandValue: deadbandvalue
        });
        const group = await subscription.monitorItems(
          [{
            nodeId: nodeStr,
            attributeId: opcua.AttributeIds.Value
          }],
          {
            samplingInterval: interval,
            queueSize: queueSize,
            discardOldest: true,
            filter: dataChangeFilter
          },
          TimestampsToReturn.Both, // Other valid values: Source | Server | Neither | Both
        );
        monitoredItems.set(nodeStr, monitoredItem);

        group.on("err", () => {
          node.error("Monitored items error!");
        });

        group.on("changed", (monitoredItem, dataValue, index) => {
          verbose_log(chalk.green("Received changes: " + monitoredItem + " value: " + dataValue + " index: " + index));
          set_node_status_to("active monitoring");
          verbose_log(dataValue.toString());

          if (dataValue.statusCode.isGoodish() === false) {
            verbose_warn("StatusCode: " + dataValue.statusCode.toString(16) + " " + dataValue.statusCode.description);
          }
          let msgToSend = {};
          msgToSend.statusCode = dataValue.statusCode;
          msgToSend.topic = msg.topic;

          // Check if timestamps exists otherwise simulate them
          if (dataValue.serverTimestamp != null) {
            msgToSend.serverTimestamp = dataValue.serverTimestamp;
            msgToSend.serverPicoseconds = dataValue.serverPicoseconds;
          } else {
            msgToSend.serverTimestamp = new Date().getTime();
            msgToSend.serverPicoseconds = 0;
          }
          if (dataValue.sourceTimestamp != null) {
            msgToSend.sourceTimestamp = dataValue.sourceTimestamp;
            msgToSend.sourcePicoseconds = dataValue.sourcePicoseconds;
          } else {
            msgToSend.sourceTimestamp = new Date().getTime();
            msgToSend.sourcePicoseconds = 0;
          }
          msgToSend.payload = dataValue.value.value;
          node.send([msgToSend, null, null]);
        });
      }
    }


    function unsubscribe_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);
      let nodeStr = msg.topic; // nodeId needed as topic
      if (msg?.topic) {
        let dTypeIndex = nodeStr.indexOf(";datatype=");
        if (dTypeIndex > 0) {
          nodeStr = nodeStr.substring(0, dTypeIndex);
        }
      }
      let monitoredItem = monitoredItems.get(msg.topic);
      if (monitoredItem) {
        verbose_log("Got ITEM: " + monitoredItem);
        verbose_log("Unsubscribing monitored item: " + msg.topic + " item:" + monitoredItem.toString());
        monitoredItem.terminate();
        monitoredItems.delete(msg.topic);
      }
      else {
        node_error("NodeId " + nodeStr + " is not subscribed!");
      }
    }

    function delete_subscription_action_input(msg) {
      verbose_log("delete subscription msg= " + stringify(msg));
      if (!subscription) {
        verbose_warn("Cannot delete, no subscription existing!");
      } else if (subscription.isActive) {
        // otherwise check if its terminated start to renew the subscription

        node.session.deleteSubscriptions({
          subscriptionIds: [subscription.subscriptionId]
        }, function (err, response) {
          if (err) {
            node_error("Delete subscription error " + err);
          }
          else {
            verbose_log("Subscription deleted, response:" + stringify(response));
            subscription.terminate(); // Added to allow new subscription
          }
        });
      }
    }

    // OLD
    async function browse_action_input(msg) {
      verbose_log("browsing");
      let allInOne = [];

      if (node.session) {
        const crawler = new NodeCrawler(node.session);
        set_node_status_to("active browsing");
        crawler.on("browsed", function (element) {
          if (msg.collect === undefined || (msg.collect && msg.collect === false)) {
            let item = {};
            item.payload = { ...element }; // Clone element
            let dataType = "";
            item.topic = element.nodeId.toString();
            if (element?.dataType) {
              dataType = opcuaBasics.convertToString(element.dataType.toString());
            }
            if (dataType && dataType.length > 0) {
              item.datatype = dataType;
            }
            node.send([item, null, null]);
          }
          else {
            let item = { ...element }; // Clone element
            allInOne.push(item);
          }
        });
        // Browse from given topic
        const nodeId = msg.topic;
        crawler.read(nodeId, function (err, obj) {
          if (!err) {
            // Crawling done
            if (msg.collect && msg.collect === true) {
              verbose_log("Send all in one, items: " + allInOne.length);
              let all = {};
              all.topic = "AllInOne";
              all.payload = allInOne;
              all.objects = JSON.stringify(obj); // Added extra result
              set_node_status_to("browse done");
              node.send([all, null, null]);
              return;
            }

            set_node_status_to("browse done");
          }
          crawler.dispose();
        });
      } else {
        node_error("Session is not active!");
        set_node_status_to("invalid session");
        reset_opcua_client(connect_opcua_client);
      }
    }

    function subscribe_monitoredEvent(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);

      let monitoredItem = monitoredItems.get(msg.topic);
      if (monitoredItem === undefined) {
        verbose_log("Msg " + stringify(msg));
        let interval = convertAndCheckInterval(msg.payload);
        verbose_log(msg.topic + " samplingInterval " + interval);
        verbose_log("Monitoring Event: " + msg.topic + ' by interval of ' + interval + " ms");
        // TODO read nodeId to validate it before subscription
        try {
          monitoredItem = opcua.ClientMonitoredItem.create(subscription,
            {
              nodeId: msg.topic, // serverObjectId
              attributeId: AttributeIds.EventNotifier
            }, {
            samplingInterval: interval,
            queueSize: 100000,
            filter: msg.eventFilter,
            discardOldest: true
          },
            TimestampsToReturn.Neither
          );
        } catch (err) {
          node_error('subscription.monitorEvent:' + err);
          // No actual error session exists, this case cause connections to server
          // reset_opcua_client(connect_opcua_client);
        }
        monitoredItems.set(msg.topic, monitoredItem.monitoredItemId);
        monitoredItem.on("initialized", async function () {
          if (node.session && subscription) {
            await opcua.callConditionRefresh(node.session, subscription.subscriptionId); // FIXED
            verbose_log("monitored Event initialized");
            set_node_status_to("initialized");
          }
          else {
            set_node_status_to("invalid session");
          }
        });

        monitoredItem.on("changed", function (eventFields) {
          dumpEvent(node, node.session, msg.eventFields, eventFields, function () { });
          set_node_status_to("changed");
        });

        monitoredItem.on("error", function (err_message) {
          verbose_log("error monitored Event on " + msg.topic);
          if (monitoredItems.has(msg.topic)) {
            monitoredItems.delete(msg.topic);
          }

          node_error("monitored Event " + msg.eventTypeId + " ERROR" + err_message);
          set_node_error_status_to("error", err_message);
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

    async function subscribe_events_async(msg) {
      verbose_log("subscribing events for " + msg.eventTypeIds);
      let eventTypeId = opcua.resolveNodeId(msg.eventTypeIds);
      let fields = await opcua.extractConditionFields(node.session, eventTypeId); // works with all eventTypes

      // FIX for issue #623
      if (msg.hasOwnProperty("customEventFields")) {
        if (Array.isArray(msg.customEventFields)) {
          verbose_log("customEventFields: " + msg.customEventFields);
          fields = fields.concat(msg.customEventFields);
        } else {
          verbose_log("customEventFields is NOT Array!"); // Good to show
        }
      }
      else {
        verbose_log("msg object does not have customEventFields!");
      }

      msg.eventFilter = opcua.constructEventFilter(fields, opcua.ofType(eventTypeId));
      msg.eventFields = fields;
      verbose_log("EventFields: " + msg.eventFields);

      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        let timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        subscription = make_subscription(subscribe_monitoredEvent, msg, opcuaBasics.getEventSubscriptionParameters(timeMilliseconds));
      } else if (subscription.subscriptionId != "terminated") {
        // otherwise check if its terminated start to renew the subscription
        set_node_status_to("active subscribing");
        subscribe_monitoredEvent(subscription, msg);
      } else {
        subscription = null;
        monitoredItems.clear();
        set_node_status_to("terminated");
      }
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
        opcuaEndpoint = msg.OpcUaEndpoint; // Use global variable! Check all parameters!
        connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint?.securityPolicy]; // || opcua.SecurityPolicy.None;
        connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint?.securityMode]; // || opcua.MessageSecurityMode.None;
        verbose_log("NEW connectionOption security parameters, policy: " + connectionOption.securityPolicy + " mode: " + connectionOption.securityMode);
        if (opcuaEndpoint.login === true) {
          let userIdentity = {
            userName: opcuaEndpoint?.user,
            password: opcuaEndpoint?.password,
            type: opcua.UserTokenType.UserName
          };
          verbose_log("NEW UserIdentity: " + JSON.stringify(userIdentity));
        }
        verbose_log("Using new endpoint:" + stringify(opcuaEndpoint));
      } else {
        verbose_log("Using endpoint:" + stringify(opcuaEndpoint));
      }
      // First close subscriptions etc.
      if (subscription && subscription.isActive) {
        subscription.terminate();
      }
      // Now reconnect and use msg parameters
      subscription = null;
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
      set_node_status_to("reconnect");
      create_opcua_client(connect_opcua_client);
    }

    node.on("close", async (done) => {
      if (subscription?.isActive) {
        subscription.terminate();
        // subscription becomes null by its terminated event
      }

      if (node.session) {
        try {
          await node.session.close();
          verbose_log("Session closed");
          set_node_status_to("session closed");
        } catch (err) {
          node_error(node.name + " " + err);
        }
      }

      node.session = null;
      close_opcua_client("closed", 0);
      done();
    });

    node.on("error", function () {
      if (subscription?.isActive) {
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
          node.session = null;
          close_opcua_client("node error", err);
        });

      } else {
        node.session = null;
        close_opcua_client("node error", 0);
      }


      verbose_log("Disconnecting...");

      verbose_warn(`node.client == null ?  ${node.client == null}`)
      if (node.client) {
        verbose_warn("Node CLient Error")
        node.client.removeListener("connection_reestablished", reestablish);
        verbose_log("Backoff event count:" + node.client.listenerCount("backoff"));
        node.client.removeListener("backoff", backoff);
        verbose_log("Start reconnection event count:" + node.client.listenerCount("start_reconnection"));
        node.client.removeListener("start_reconnection", reconnection);
        node.client.disconnect(function () {
          verbose_log("Client disconnected!");
          set_node_status_to("disconnected");
        });
        close_opcua_client("node error", 0);
        node.client = null;
      }
    });
  }

  RED.nodes.registerType("OpcUa-Client", OpcUaClientNode);

}