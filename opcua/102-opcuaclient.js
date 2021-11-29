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

const { promoteToMultiStateValueDiscrete } = require("node-opcua");

module.exports = function (RED) {
  "use strict";
  var chalk = require("chalk");
  var opcua = require('node-opcua');
  var opcuaBasics = require('./opcua-basics');
  var nodeId = require("node-opcua-nodeid");
  var crypto_utils = opcua.crypto_utils;
  var UAProxyManager = require("node-opcua-client-proxy").UAProxyManager;
  var coerceNodeId = require("node-opcua-nodeid").coerceNodeId;
  var async = require("async");
  var treeify = require('treeify');
  var Map = require('es6-map');
  var path = require("path");
  var fs = require("fs");
  var os = require("os");
  var DataType = opcua.DataType;
  var AttributeIds = opcua.AttributeIds;
  var read_service = require("node-opcua-service-read");
  var TimestampsToReturn = read_service.TimestampsToReturn;
  var subscription_service = require("node-opcua-service-subscription");

  const { createCertificateManager } = require("./utils");
  const { dumpCertificates } = require("./dump_certificates");

  const {parse, stringify} = require('flatted');

  function OpcUaClientNode(n) {
    RED.nodes.createNode(this, n);
    this.name = n.name;
    this.action = n.action;
    this.time = n.time;
    this.timeUnit = n.timeUnit;
    this.deadbandtype = n.deadbandtype;
    this.deadbandvalue = n.deadbandvalue;
    this.certificate = n.certificate; // n == NONE, l == Local file, e == Endpoint, u == Upload
    this.localfile = n.localfile; // Local certificate file
    this.localkeyfile = n.localkeyfile; // Local private key file
    // this.upload = n.upload; // Upload
    // this.certificate_filename = n.certificate_filename;
    // this.certificate_data = n.certificate_data;
    var node = this;
    var opcuaEndpoint = RED.nodes.getNode(n.endpoint);
    var userIdentity = {};
    var connectionOption = {};
    var cmdQueue = []; // queue msgs which can currently not be handled because session is not established, yet and currentStatus is 'connecting'
    var currentStatus = ''; // the status value set set by node.status(). Didn't find a way to read it back.
    var multipleItems = []; // Store & read multiple nodeIds
    var writeMultipleItems = []; // Store & write multiple nodeIds & values

    connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint.securityPolicy] || opcua.SecurityPolicy.None;
    connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint.securityMode] || opcua.MessageSecurityMode.None;


    connectionOption.clientCertificateManager = createCertificateManager(true); // AutoAccept certificates, TODO add to client node as parameter if really needed


    if (node.certificate === "l" && node.localfile) {
      verbose_log("Using 'own' local certificate file " + node.localfile);
      // User must define absolute path
      var certfile = node.localfile;
      var keyfile = node.localkeyfile;
      connectionOption.certificateFile = certfile;
      connectionOption.privateKeyFile =  keyfile;

      if (!fs.existsSync(certfile)) {
        node_error("Local certificate file not found:" + certfile)
      }
      if (!fs.existsSync(keyfile)) {
        node_error("Local private key file not found:" + keyfile)
      }
    }
    if (node.certificate === "n") {
      node.log("\tLocal 'own' certificate is NOT used.");
    }

    // Moved needed options to client create
    connectionOption.requestedSessionTimeout = opcuaBasics.calc_milliseconds_by_time_and_unit(300, "s");
    // DO NOT USE must be NodeOPCUA-Client !! connectionOption.applicationName = node.name; // Application name
    connectionOption.clientName = node.name; // This is used for the session names
    connectionOption.endpointMustExist = false;
    connectionOption.defaultSecureTokenLifetime = 40000 * 5;
    connectionOption.connectionStrategy = {
      maxRetry: 10512000, // Limited to max 10 ~5min // 10512000, // 10 years should be enough. No infinite parameter for backoff.
      initialDelay: 5000, // 5s
      maxDelay: 30 * 1000 // 30s
    };
    connectionOption.keepSessionAlive = true;
    verbose_log("Connection options:" + stringify(connectionOption));
    verbose_log("EndPoint: " + stringify(opcuaEndpoint));

    if (opcuaEndpoint.login === true) {
      userIdentity.userName = opcuaEndpoint.credentials.user;
      userIdentity.password = opcuaEndpoint.credentials.password;
      userIdentity.type = opcua.UserTokenType.UserName; // New TypeScript API parameter
    }
    else {
      userIdentity.type = opcua.UserTokenType.Anonymous;
    }
    verbose_log("UserIdentity: " + stringify(userIdentity));
    var items = [];
    var subscription; // only one subscription needed to hold multiple monitored Items

    var monitoredItems = new Map();


    function node_error(err) {
      console.error(chalk.red("Client node error on: " + node.name + " error: " + stringify(err)));
      node.error("Client node error on: " + node.name + " error: " + stringify(err));
    }

    function verbose_warn(logMessage) {
      if (RED.settings.verbose) {
        console.warn(chalk.yellow((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage));
        node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage);
      }
    }

    function verbose_log(logMessage) {
      if (RED.settings.verbose) {
        console.log(chalk.cyan(logMessage));
        node.log(logMessage);
      }
    }


   async function getBrowseName(_session, nodeId, callback) {
    const dataValue = await _session.read({
      attributeId: AttributeIds.BrowseName,
      nodeId
    });
      if (dataValue.statusCode === opcua.StatusCodes.Good) {
        const browseName = dataValue.value.value;
        return callback(null, browseName);
      } else {
        return "???";
      }
    }
    // Fields selected alarm fields
    // EventFields same order returned from server array of variants (filled or empty)
    function __dumpEvent(node, session, fields, eventFields, _callback) {
      var cnt = eventFields.length;
      var msg = {};
      msg.payload = {};

      verbose_log("EventFields=" + eventFields);
      
      async.forEachOf(eventFields, function (variant, index, callback) {
        console.log("EVENT Field: " + fields[index] + stringify(variant));
        
        if (variant.dataType === DataType.Null) {
          if (--cnt === 0) node.send(msg);
          callback("Variants dataType is Null");
        } else if (variant.dataType === DataType.NodeId) {
          getBrowseName(session, variant.value, function (err, name) {
            if (!err) {
              opcuaBasics.collectAlarmFields(fields[index], variant.dataType.toString(), variant.value, msg.payload, node);
              set_node_status_to("active event");
            }
            if (--cnt === 0) node.send(msg);
            callback(err);
          });
        } else {
          setImmediate(function () {
            opcuaBasics.collectAlarmFields(fields[index], variant.dataType.toString(), variant.value, msg.payload, node);
            set_node_status_to("active event");
            if (--cnt === 0) node.send(msg);
            callback();
          })
        }
      }, _callback);
      node.send(msg);
    }

    var eventQueue = new async.queue(function (task, callback) {
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
      verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! Node: " + node.name);
      set_node_status2_to("reconnect", "re-establised");
    };
    const backoff = function (attempt, delay) {
      verbose_warn("backoff  attempt #" + attempt + " retrying in " + delay / 1000.0 + " seconds. Node:  " + node.name + " " + opcuaEndpoint.endpoint);
      set_node_status2_to("reconnect", "attempt #" + attempt + " retry in " + delay / 1000.0 + " sec");
    };
    const reconnection = function () {
      verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting Reconnection !!!!!!!!!!!!!!!!!!! Node: " + node.name);
      set_node_status2_to("reconnect", "starting...");
    };

    function create_opcua_client(callback) {
      node.client = null;
      verbose_warn("Create Client: " + stringify(connectionOption));
      try {
        // Use empty 0.0.0.0 address as "no client" initial value
        if (opcuaEndpoint.endpoint.indexOf("opc.tcp://0.0.0.0") == 0) {
          items = [];
          node.items = items;
          set_node_status_to("no client");
          if (callback) {
            callback();
          }
          return;
        }
        // Normal client
        node.client = opcua.OPCUAClient.create(connectionOption);
        node.client.on("connection_reestablished", reestablish);
        node.client.on("backoff", backoff);
        node.client.on("start_reconnection", reconnection);
      }
      catch(err) {
        node_error("Cannot create client, check connection options: " + stringify(connectionOption));
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
      if (node.client) {
        try {
          node.client.disconnect(function () {
            node.client = null;
            verbose_log("Client disconnected!");
            if (error === 0) {
              set_node_status_to("closed");
            }
            else {
              set_node_errorstatus_to(message, error)
              node.error("Client disconnected & closed: " + message + " error: " + error.toString());
            }
          });
        }
        catch (err) {
          node_error("Error on disconnect: " + stringify(err));
        }
      }
    }

    function set_node_status_to(statusValue) {
      verbose_log("Client status: " + statusValue);
      var statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status
      });
    }

    function set_node_status2_to(statusValue, message) {
      verbose_log("Client status: " + statusValue);
      var statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status + " " + message
      });
    }

    function set_node_errorstatus_to(statusValue, error) {
      verbose_log("Client status: " + statusValue);
      var statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: statusParameter.status + " " + error.toString()
      });
    }

    async function connect_opcua_client() {
      // Refactored from old async Javascript to new Typescript with await
      var session;
      // STEP 1
      // First connect to server´s endpoint
      if (opcuaEndpoint && opcuaEndpoint.endpoint) {
        verbose_log("Connecting to " + opcuaEndpoint.endpoint);
      }
      else {
        node_error("No client endpoint listed! Waiting...");
        return;
      }
      try {
        if (opcuaEndpoint.endpoint.indexOf("opc.tcp://0.0.0.0") === 0) {
          set_node_status_to("no client")
        }
        else {
          set_node_status_to("connecting");
        }
        if (!node.client) {
          verbose_log("No client to connect...");
          return;
        }
        verbose_log("Exact endpointUrl: " + opcuaEndpoint.endpoint + " hostname: " + os.hostname());

        await node.client.clientCertificateManager.initialize();
        await node.client.connect(opcuaEndpoint.endpoint);
      } catch (err) {

        // console.log(err);
        verbose_warn("Case A: Endpoint does not contain, 1==None 2==Sign 3==Sign&Encrypt securityMode:" + stringify(connectionOption.securityMode) + " securityPolicy:" + stringify(connectionOption.securityPolicy));
        verbose_warn("Case B: UserName & password does not match to server (needed by Sign): " + userIdentity.userName + " " + userIdentity.password);
        set_node_errorstatus_to("invalid endpoint", err);
        return;
      }
      verbose_log("Connected to " + opcuaEndpoint.endpoint);
      // STEP 2
      // This will succeed first time only if security policy and mode are None
      // Later user can use path and local file to access server certificate file

        if (!node.client) {
          node_error("Client not yet created & connected, cannot getEndpoints!");
          return;
        }

      // dumpCertificates(node.client); // TODO Wrong folder or something to solve

      // STEP 3
      verbose_log("Create session ...");
      try {
        verbose_log("Create session with userIdentity: " + stringify(userIdentity));
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
          close_opcua_client("connection error: no session", 0);
          return;
        }
        node.session = session;

        verbose_log("session active");
        set_node_status_to("session active");
        for (var i in cmdQueue) {
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
      var newSubscription = null;

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

    if (!node.client) {
      create_opcua_client(connect_opcua_client);
    }

    function processInputMsg(msg) {
      if (msg.action == "reconnect") {
        cmdQueue = [];
        // msg.endpoint can be used to change endpoint
        reconnect(msg);
        return;
      }
      if (msg.action) {
        verbose_log("Override node action by msg.action:" + msg.action);
        node.action = msg.action;
      }
      // With new node-red easier to set action into payload
      if (msg.payload && msg.payload.action) {
        verbose_log("Override node action by msg.payload.action:" + msg.payload.action);
        node.action = msg.payload.action;
      }

      if (!node.action) {
        verbose_warn("can't work without action (read, write, browse ...)");
        //node.send(msg); // do not send in case of error
        return;
      }

      if (!node.client || !node.session) {
        verbose_log("Not connected, current status:" + currentStatus);
        // Added statuses when msg must be put to queue
         // Added statuses when msg must be put to queue
        const statuses = ['', 'create client', 'connecting', 'reconnect'];
        if (statuses.includes(currentStatus)) {
          cmdQueue.push(msg);
        } else {
          verbose_warn("can't work without OPC UA Session");
          reset_opcua_client(connect_opcua_client);
        }
        //node.send(msg); // do not send in case of error
        return;
      }

      // node.warn("secureChannelId:" + node.session.secureChannelId);
      if (!node.session.sessionId == "terminated") {
        verbose_warn("terminated OPC UA Session");
        reset_opcua_client(connect_opcua_client);
        //node.send(msg); // do not send in case of error
        return;
      }

      if (!msg || !msg.topic) {
        verbose_warn("can't work without OPC UA NodeId - msg.topic empty");
        //node.send(msg); // do not send in case of error
        return;
      }

      verbose_log("Action on input:" + node.action +
        " Item from Topic: " + msg.topic + " session Id: " + node.session.sessionId);

      switch (node.action) {
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
        default:
          verbose_warn("Unknown action: " + node.action + " with msg " + stringify(msg));
          break;
      }
      //node.send(msg); // msg.payload is here actual inject caused wrong values
    }
    node.on("input", processInputMsg);

    async function acknowledge_input(msg) {
      // msg.topic is nodeId of the alarm object like Prosys ns=6;s=MyLevel.Alarm
      // msg.conditionId is actual conditionObejct that contains ns=6;s=MyLevel.Alarm/0:EventId current/latest eventId will be read
      // msg.comment will be used as comment in the acknowledge
      const dataValue = await node.session.read({ nodeId: msg.conditionId, attributeId: AttributeIds.Value });
      const eventId = dataValue.value.value;
      verbose_log("Acknowledge (alarm object == topic): " + msg.topic + " conditionObject (nodeId of eventId): " + msg.conditionId + " value of eventId: 0x" + eventId.toString("hex") + " comment: " + msg.comment);
      if (eventId) {
        const status = await node.session.acknowledgeCondition(msg.topic, eventId, msg.comment);
        if (status !== opcua.StatusCodes.Good) {
          node_error(node.name + " error at acknowledge, status: " + status.toString());
          set_node_errorstatus_to("error", status.toString());  
        }
      }
      else {
        node_error(node.name + " error at acknowledge, no eventId, possible wrong msg.conditionId " + msg.conditionId);
      }
    }

    async function register_action_input(msg) {
      verbose_log("register nodes : " + stringify(msg.payload));
      // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
      // msg.topic not used, but cannot be empty
      // msg.paylod == array of nodeIds to register
      const registeredNodes = await node.session.registerNodes(msg.payload);
      verbose_log("RegisteredNodes: " + stringify(registeredNodes));
    }

    async function unregister_action_input(msg) {
      verbose_log("unregister nodes : " + stringify(msg.payload));
      // First test, let´s see if this needs some refactoring. Same way perhaps as with readMultiple
      // msg.topic not used, but cannot be empty
      // msg.paylod == array of nodeIds to register
      const unregisteredNodes = await node.session.registerNodes(msg.payload);
      verbose_log("UnregisteredNodes: " + stringify(unregisteredNodes));
    }

    function read_action_input(msg) {

      verbose_log("reading");
      var item = "";
      var range = null;
      if (msg.topic) {
        var n = msg.topic.indexOf("datatype=");
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

      // Added support for indexRange, payload can be just one number as string "5"  or "2:5"
      if (msg.payload && msg.payload.range) {
        range = new opcua.NumericRange(msg.payload.range);
        // console.log("Range:" + stringify(range));
      }
      if (node.session) {
        // With Single Read using now read to get sourceTimeStamp and serverTimeStamp
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
              set_node_errorstatus_to("error", err);
              // No actual error session created, this case cause connections to server
              // reset_opcua_client(connect_opcua_client);
            } else {
              set_node_status_to("active reading");
              verbose_log("\tNode : " + msg.topic);
              verbose_log(dataValue.toString());
              if (dataValue) {
                try {
                  verbose_log("\tValue : " + dataValue.value.value);
                  verbose_log("\tDataType: " + dataValue.value.dataType + " (" + DataType[dataValue.value.dataType] + ")");
                  verbose_log("\tMessage: " + msg.topic + " (" + msg.datatype + ")");
                  /*
                  if (msg.datatype != null &&  msg.datatype.localeCompare(DataType[dataValue.value.dataType]) != 0) {
                    node_error("\tMessage types are not matching: " + msg.topic + " types: " + msg.datatype + " <> " + DataType[dataValue.value.dataType]);
                  }
                  if (msg.datatype == null) {
                    node.warn("msg.datatype == null, if you use inject check topic is format 'ns=2;s=MyLevel;datatype=Double'");
                  }
                  */
                  if (dataValue.value.dataType === opcua.DataType.UInt16) {
                    verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + opcuaBasics.toInt32(dataValue.value.value));
                  }

                  msg.payload = dataValue.value.value;
                  msg.statusCode = dataValue.statusCode;
                  msg.serverTimestamp = dataValue.serverTimestamp;
                  msg.sourceTimestamp = dataValue.sourceTimestamp;

                  if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
                    verbose_log("Status-Code:" + (dataValue.statusCode.toString(16)));
                  } else {
                    verbose_warn("Status-Code:" + dataValue.statusCode.toString(16));
                  }

                  node.send(msg);
                } catch (e) {
                  if (dataValue) {
                    node_error("\tBad read: " + (dataValue.statusCode.toString(16)));
                    node_error("\tMessage:" + msg.topic + " dataType:" + msg.datatype);
                    node_error("\tData:" + stringify(dataValue));
                  } else {
                    node_error(e.message);
                  }
                }

              }
            }
          });
      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    async function readhistory_action_input(msg) {
      verbose_log("Read historical values from msg.topic = nodeId: " + msg.topic + " msg.aggregate (raw|min|ave|max|interpolative), aggregate: " + msg.aggregate);
      var start;
      var end = Date.now();
      if (msg.end) {
        verbose_log("msg.end  : " + msg.end.toString());
        end = msg.end;
      }
      if (!msg.start) {
        start = end -  (1 * 60 * 60 * 1000); // read last 1 hour of history
      }
      else {
        start = msg.start;
        verbose_log("msg.start: " + msg.start.toString());
      }
      verbose_log("Start time, msg.start or default start 1h ago, start: " + new Date(start));
      verbose_log("End time,   msg.end or default to now,           end: " + new Date(end));
      // For aggregates
      var processingInterval = end - start; // Whole range 10 * 1000; // 10s interval
      if (node.session) {
        if (msg.aggregate && msg.aggregate === "raw") {
          var numValues = 1000;
          if (msg.numValuesPerNode) {
            numValues = parseInt(msg.numValuesPerNode);
          }
          var returnBounds = false;
          if (msg.returnBounds) {
            returnBounds = msg.returnBounds;
          }
          // Old one: ReadRawModifiedDetails
          // No constructor: ExtraReadHistoryValueParameters
            var historyReadDetails = new Object({
            isReadModified: false, // Fixed, any need to modify?
            numValuesPerNode: numValues,
            returnBounds: returnBounds,
            timestampsToReturn: opcua.TimestampsToReturn.Both // Fixed, return always both
          });
          verbose_log("NodeId: " + msg.topic + " from: " + new Date(start) + " to: " + new Date(end) + " options: " + JSON.stringify(historyReadDetails));
          var historicalReadResult = await node.session.readHistoryValue({nodeId: msg.topic}, new Date(start), new Date(end), historyReadDetails);
          msg.payload = historicalReadResult;
          node.send(msg);
        }
        if (msg.aggregate && msg.aggregate==="max") {
          var resultMax = await node.session.readAggregateValue(
            {nodeId: msg.topic},
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Maximum,
            processingInterval);
            msg.payload = resultMax;
            node.send(msg);
        }
        if (msg.aggregate && msg.aggregate==="min") {
          var resultMin = await node.session.readAggregateValue(
            {nodeId: msg.topic},
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Minimum,
            processingInterval);
            msg.payload = resultMin;
            node.send(msg);
        }
        if (msg.aggregate && msg.aggregate==="ave") {
          var resultAve = await node.session.readAggregateValue(
            {nodeId: msg.topic},
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Average,
            processingInterval);
            msg.payload = resultAve;
            node.send(msg);
        }
        if (msg.aggregate && msg.aggregate==="interpolative") {
          var resultInter = await node.session.readAggregateValue(
            {nodeId: msg.topic},
            new Date(start),
            new Date(end),
            opcua.AggregateFunction.Interpolative,
            processingInterval);
            msg.payload = resultInter;
            node.send(msg);
        }
      }
    }

    function readmultiple_action_input(msg) {

      verbose_log("read multiple...");
      var item = "";
      //
      if (msg.topic) {
        var n = msg.topic.indexOf("datatype=");
        if (n > 0) {
          msg.datatype = msg.topic.substring(n + 9);
          item = msg.topic.substring(0, n - 1);
          msg.topic = item;
          verbose_log(stringify(msg));
        }
      }

      // Store nodeId to read multipleItems array
      if (msg.topic !== "readmultiple" && msg.topic !== "clearitems") {
        if (item.length > 0) {
          multipleItems.push({ nodeId: item, attributeId: AttributeIds.Value, TimestampsToReturn: opcua.TimestampsToReturn.Both });
        } else {
          // msg.topic
          multipleItems.push({ nodeId: msg.topic, attributeId: AttributeIds.Value, TimestampsToReturn: opcua.TimestampsToReturn.Both }); // support for multiple item reading
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

      if (node.session && msg.topic === "readmultiple") {
        //  node.session.read({timestampsToReturn: TimestampsToReturn.Both, nodesToRead: multipleItems}, function (err, dataValues, diagnostics) {
        verbose_log("Reading items: " + stringify(multipleItems));
        if (multipleItems.length === 0) {
          node_error(node.name + " no items to read");
          return;
        }
        node.session.read(multipleItems, function (err, dataValues, diagnostics) {
          if (err) {
            if (diagnostics) {
              verbose_log('diagnostics:' + diagnostics);
            }
            node_error(node.name + " error at active reading: " + err.message);
            set_node_errorstatus_to("error", err);
            // No actual error session existing, this case cause connections to server
            // reset_opcua_client(connect_opcua_client);
          }
          else {
            set_node_status_to("active multiple reading");
            
            if (msg.payload === "ALL") {
              node.send({"topic": "ALL", "payload": dataValues, "items": multipleItems});
              return;
            }
            for (var i = 0; i < dataValues.length; i++) {
              var dataValue = dataValues[i];
              verbose_log("\tNode : " + msg.topic);
              verbose_log(dataValue.toString());
              if (dataValue) {
                try {
                  verbose_log("\tValue : " + dataValue.value.value);
                  verbose_log("\tDataType: " + dataValue.value.dataType + " (" + DataType[dataValue.value.dataType] + ")");
                  // verbose_log("\tMessage: " + msg.topic + " (" + msg.datatype + ")");
                  /*
                  if (msg.datatype != null && msg.datatype.localeCompare(DataType[dataValue.value.dataType] != 0) {
                    node_error("\tMessage types are not matching: " + msg.topic + " types: " + msg.datatype + " <> " + DataType[dataValue.value.dataType];
                  }
                  if (msg.datatype == null) {
                    node.warn("msg.datatype == null, if you use inject check topic is format 'ns=2;s=MyLevel;datatype=Double'");
                  }
                  */
                  if (dataValue.value.dataType === opcua.DataType.UInt16) {
                    verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + opcuaBasics.toInt32(dataValue.value.value));
                  }

                  if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
                    verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)));
                  } else {
                    verbose_warn("\tStatus-Code:" + dataValue.statusCode.toString(16));
                  }

                  var serverTs = dataValue.serverTimestamp;
                  var sourceTs = dataValue.sourceTimestamp;
                  if (serverTs === null) {
                    serverTs = new Date();
                  }
                  if (sourceTs === null) {
                    sourceTs = new Date();
                  }
                  // Use nodeId in topic, arrays are same length
                  node.send({
                    topic: multipleItems[i],
                    payload: dataValue.value.value,
                    serverTimestamp: serverTs,
                    sourceTimestamp: sourceTs
                  });
                } catch (e) {
                  if (dataValue) {
                    node_error("\tBad read: " + (dataValue.statusCode.toString(16)));
                    // node_error("\tMessage:" + msg.topic + " dataType:" + msg.datatype);
                    node_error("\tData:" + stringify(dataValue));
                  } else {
                    node_error(e.message);
                  }
                }
              }
            }
          }
        });
      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    function info_action_input(msg) {
      verbose_log("meta-data reading");
      var item = "";
      if (msg.topic) {
        var n = msg.topic.indexOf("datatype=");

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
        node.session.readAllAttributes(coerceNodeId(items[0]), function(err, result) {
          if (!err) {
              // console.log("INFO: " + JSON.stringify(result));
              var newMsg = Object.assign(msg, result);
              node.send(newMsg);
          }
          else {
            set_node_status_to("error");
            node_error("Cannot read attributes from nodeId: " + items[0])    
          }
        });
      
      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    async function build_extension_object_action_input(msg) {
      verbose_log("Construct ExtensionObject from " + JSON.stringify(msg));
      var item = "";
      if (msg.topic) {
        var n = msg.topic.indexOf("datatype=");

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
          const ExtensionNodeId = coerceNodeId(items[0]);
          verbose_log("ExtensionNodeId: " + ExtensionNodeId);
          const ExtensionTypeDefinition = await node.session.read({ nodeId: ExtensionNodeId, attributeId: opcua.AttributeIds.DataTypeDefinition});
          verbose_log("ExtensionType: " + JSON.stringify(ExtensionTypeDefinition));
          var newmsg = {};
          const ExtensionData = await node.session.constructExtensionObject(ExtensionNodeId, {});
          if (ExtensionData) {
            verbose_log("ExtensionData: " + ExtensionData.toString());
          }
          // Simplified
          newmsg.topic = msg.topic;
          newmsg.payload = ExtensionData; //  JSON.stringify(ExtensionData); // New value with default values
          verbose_log("Extension Object msg: " + stringify(newmsg))
          node.send(newmsg);
        }
        catch(err) {
          if (err) {
            node_error("Failed to build ExtensionObject, error: " + err);
          }
        }
      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    async function write_action_input(msg) {
      // verbose_log("writing:" + stringify(msg));
      if (msg && msg.topic && msg.topic.indexOf("ns=") != 0) {
        return; // NOT an item
      }
      // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
      
      var dIndex = msg.topic.indexOf("datatype=");
      var ns = msg.topic.substring(3, dIndex-1); // Parse namespace, ns=2 or ns=10 TODO TEST 2 digits namespace
      var s = "";
      var range = null;
      var extensionobject = null;

      if (msg.datatype == null && dIndex > 0) {
        msg.datatype = msg.topic.substring(dIndex + 9);
        s = msg.topic.substring(7, dIndex - 1);
      } else {
        s = msg.topic.substring(7); // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT
      }

      var nodeid = {}; // new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);
      // console.log("Topic: " + msg.topic + " ns=" + ns + " s=" + s);
      verbose_log(opcua.makeBrowsePath(msg.topic, "."));
      // TODO ns=10 TEST 2 digits namespace
      if (dIndex> 0) {
        nodeid = opcua.coerceNodeId(msg.topic.substring(0, dIndex-1));
      }
      else {
        nodeid = opcua.coerceNodeId(msg.topic);
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
      var opcuaDataValue = opcuaBasics.build_new_dataValue(msg.datatype, msg.payload);
      
      if (msg.datatype && msg.datatype.indexOf("ExtensionObject") >= 0 && node.session) {
        if (msg.topic.indexOf("typeId=")) {
          var typeId = msg.topic.substring(msg.topic.indexOf("typeId=")+7);
          console.log("ExtensionObject TypeId= " + typeId);
          extensionobject = await node.session.constructExtensionObject(coerceNodeId(typeId), {}); // Create first with default values
          verbose_log("ExtensionObject=" + stringify(extensionobject));
          Object.assign(extensionobject, msg.payload); // MERGE payload over default values
          opcuaDataValue = {
            dataType: opcua.DataType.ExtensionObject,
            value: extensionobject
          };
        }
      }
      
      // TODO Fix object array according range
      // Added support for indexRange, payload can be just one number as string "5"  or "2:5"

      // Helper for node-red server write
      function reIndexArray(obj, newKeys) {
        const keyValues = Object.keys(obj).map(key => {
          const newKey = newKeys[key] || key;
          return { [newKey]: obj[key] };
        });
        return Object.assign({}, ...keyValues);
      }

      if (msg.range) {
        verbose_log(chalk.red("Range: " + msg.range));
        range = new opcua.NumericRange(msg.range);
        verbose_log(chalk.red("Range: " + stringify(range) + " values: " + stringify(opcuaDataValue)));
        // TODO write to node-red server still work to do
        // var newIndex = { "0": "2", "1": "3", "2":"4"}; // HARD CODED TEST
        // const newValues = reIndexArray(opcuaDataValue, newIndex);
        // verbose_log(chalk.yellow("NEW VALUES: " + stringify(newValues)));
      }

      let nodeToWrite;
      if (node.session) {

        nodeToWrite = {
          nodeId: nodeid.toString(),
          attributeId: opcua.AttributeIds.Value,
          indexRange: range,
          value: new opcua.DataValue({value: new opcua.Variant(opcuaDataValue)})
        };
        verbose_log("VALUE TO WRITE: " + stringify(nodeToWrite.value.value));
        if (msg.timestamp) {
          nodeToWrite.value.sourceTimestamp = new Date(msg.timestamp).getTime();
        }

        set_node_status_to("writing");
        node.session.write(nodeToWrite, function (err, statusCode) {
          if (err) {
            set_node_errorstatus_to("error", err);
            node_error(node.name + " Cannot write value (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
            // No actual error session existing, this case cause connections to server
            // reset_opcua_client(connect_opcua_client);
            msg.payload = err;
            node.send(msg);
          } else {
            set_node_status_to("value written");
            verbose_log("Value written! Result:" + statusCode);
            msg.payload = statusCode;
            node.send(msg);
          }
        });
      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    function writemultiple_action_input(msg) {
      verbose_log("writing multiple");
      // Store as with readmultiple item
      if (msg.topic && msg.topic!=="writemultiple" && !Array.isArray(msg.payload)) {
        // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
        var ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
        var dIndex = msg.topic.indexOf("datatype=");
        var s = "";

        if (msg.datatype == null && dIndex > 0) {
          msg.datatype = msg.topic.substring(dIndex + 9);
          s = msg.topic.substring(7, dIndex - 1);
        } else {
          s = msg.topic.substring(7); // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT
        }
/*
        var nodeid = {}; // new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);
        // verbose_log(opcua.makeBrowsePath(msg.topic, ".")); // msg.topic is not always nodeId
        if (msg.topic.substring(5, 6) == 's') {
          nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, parseInt(ns));
        }
        if (msg.topic.substring(5, 6) == 'i') {
          nodeid = new nodeId.NodeId(nodeId.NodeIdType.NUMERIC, parseInt(s), parseInt(ns));
        }
*/
        // Store nodeId to read multipleItems array
        if (msg.topic !== "writemultiple" && msg.topic !== "clearitems") {
          var opcuaDataValue = opcuaBasics.build_new_dataValue(msg.datatype, msg.payload);
          var item = { 
            nodeId: msg.topic,
            datatype: msg.datatype,
            attributeId: opcua.AttributeIds.Value,
            indexRange: null,
            value: new opcua.DataValue({ value: opcuaDataValue })
          };
          item.value.sourceTimestamp = new Date(msg.timestamp).getTime();
          console.log("ITEM: " + stringify(item));
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
      if (node.session && msg.topic === "writemultiple") {
        //  node.session.read({timestampsToReturn: TimestampsToReturn.Both, nodesToRead: multipleItems}, function (err, dataValues, diagnostics) {
        verbose_log("Writing items: " + stringify(writeMultipleItems));
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
          } else {
            set_node_status_to("active writing");
            verbose_log("Values written!");
            node.send({ payload: statusCode });
          }
        });
      }
    
/*
      verbose_log("msg=" + stringify(msg));
      verbose_log("namespace=" + ns);
      verbose_log("string=" + s);
      if (msg.datatype) {
        verbose_log("type=" + msg.datatype);
      }
      verbose_log("payload value=" + stringify(msg.payload));
*/
      // OLD original way to use payload
      if (node.session) {
        if (Array.isArray(msg.payload)) {
          const nodesToWrite = msg.payload.map(function (msgToWrite) {
            var opcuaDataValue = opcuaBasics.build_new_dataValue(msgToWrite.datatype || msg.datatype, msgToWrite.value);
            const nodeToWrite = {
              nodeId: msgToWrite.nodeId || (nodeid && nodeid.toString()),
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
        
          node.session.write(nodesToWrite, function (err, statusCode) {
            if (err) {
              set_node_errorstatus_to("error", err);
              node_error(node.name + " Cannot write values (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
              // No actual error session created, this case cause connections to server
              // reset_opcua_client(connect_opcua_client);
              node.send({ payload: err });
            } else {
              set_node_status_to("active writing");
              verbose_log("Values written!");
              node.send({ payload: statusCode });
            }
          });
        }

      } else {
        set_node_status_to("Session invalid");
        node_error("Session is not active!")
      }
    }

    function subscribe_action_input(msg) {
      verbose_log("subscribing");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        subscription = make_subscription(subscribe_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
        var message = { "topic": "subscriptionId", "payload": subscription.subscriptionId };
        node.send(message); // Make it possible to store
      } else {
        // otherwise check if its terminated start to renew the subscription
        if (subscription.subscriptionId != "terminated") {
          set_node_status_to("active subscribing");
          subscribe_monitoredItem(subscription, msg);
        } else {
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
      verbose_log("monitoring");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        subscription = make_subscription(monitor_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
      } else {
        // otherwise check if its terminated start to renew the subscription
        if (subscription.subscriptionId != "terminated") {
          set_node_status_to("active monitoring");
          monitor_monitoredItem(subscription, msg);
        } else {
          subscription = null;
          // monitoredItems = new Map();
          monitoredItems.clear();
          set_node_status_to("terminated");
          // No actual error session created, this case cause connections to server
          // reset_opcua_client(connect_opcua_client);
        }
      }
    }

    function unsubscribe_action_input(msg) {
      verbose_log("unsubscribing");
      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        // var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        // subscription = make_subscription(subscribe_monitoredItem, msg, opcuaBasics.getSubscriptionParameters(timeMilliseconds));
        verbose_warn("Cannot unscubscribe, no subscription");
      } else {
        // otherwise check if its terminated start to renew the subscription
        if (subscription.subscriptionId != "terminated") {
          set_node_status_to("unsubscribing");
          unsubscribe_monitoredItem(subscription, msg); // Call to terminate monitoredItem
        } else {
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
      var n = Number(interval);
      if (isNaN(n)) {
        n = 100;
      }
      return n;
    }

    function subscribe_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);
      var nodeStr = msg.topic;
      var dTypeIndex = nodeStr.indexOf(";datatype=");
      if (dTypeIndex > 0) {
        nodeStr = nodeStr.substring(0, dTypeIndex);
      }

      var monitoredItem = monitoredItems.get(msg.topic);

      if (!monitoredItem) {
        verbose_log("Msg " + stringify(msg));
        // var interval = 100; // Set as default if no payload
        var queueSize = 10;
        var interval = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit); // Use value given at client node
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
        verbose_warn("Monitoring value: " + msg.topic + ' by interval of ' + interval.toString() + " ms");

        // Validate nodeId
        try {
          var nodeId = coerceNodeId(nodeStr);
          if (nodeId && nodeId.isEmpty()) {
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
          verbose_log(msg.topic + " value has changed to " + dataValue.value.value);
          verbose_log(dataValue.toString());
          if (dataValue.statusCode === opcua.StatusCodes.Good) {
            verbose_log("Status-Code:" + dataValue.statusCode.toString(16));
          } else {
            node__warn("Status-Code:" + dataValue.statusCode.toString(16));
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
    }

    function monitor_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);
      var nodeStr = msg.topic;
      var dTypeIndex = nodeStr.indexOf(";datatype=");
      if (dTypeIndex > 0) {
        nodeStr = nodeStr.substring(0, dTypeIndex);
      }
      var monitoredItem = monitoredItems.get(msg.topic);
      if (!monitoredItem) {
        verbose_log("Msg " + stringify(msg));
        var interval = 100; // Set as default if no payload
        var queueSize = 10;
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
          var nodeId = coerceNodeId(nodeStr);
          if (nodeId && nodeId.isEmpty()) {
            node_error(" Invalid empty node in getObject");
          }
          //makeNodeId(nodeStr); // above is enough
        } catch (err) {
          node_error(err);
          return;
        }
        var deadbandtype = subscription_service.DeadbandType.Absolute;
        // NOTE differs from standard subscription monitor
        if (node.deadbandType == "a") {
          deadbandType = subscription_service.DeadbandType.Absolute;
        }
        if (node.deadbandType == "p") {
          deadbandType = subscription_service.DeadbandType.Percent;
        }
        // Check if msg contains deadbandtype, use it instead of value given in client node
        if (msg.deadbandType && msg.deadbandType == "a") {
          deadbandtype = subscription_service.DeadbandType.Absolute;
        }
        if (msg.deadbandType && msg.deadbandType == "p") {
          deadbandtype = subscription_service.DeadbandType.Percent;
        }
        var deadbandvalue = node.deadbandvalue;
        // Check if msg contains deadbandValue, use it instead of value given in client node
        if (msg.deadbandValue) {
          deadbandvalue = msg.deadbandValue;
        }
        verbose_log("Deadband type (a==absolute, p==percent) " + deadbandtype + " deadband value " + deadbandvalue);
        var dataChangeFilter = new subscription_service.DataChangeFilter({
          trigger: subscription_service.DataChangeTrigger.StatusValue,
          deadbandType: deadbandtype,
          deadbandValue: deadbandvalue
        });
        /*
        var  monitoredItemCreateRequest1 = new subscription_service.MonitoredItemCreateRequest({
          itemToMonitor: {
          nodeId: nodeStr,
          attributeId: opcua.AttributeIds.Value
          },
          monitoringMode: subscription_service.MonitoringMode.Reporting,
          requestedParameters: {
            queueSize: 10,
            samplingInterval: 100,
            filter: new subscription_service.DataChangeFilter({
              trigger: subscription_service.DataChangeTrigger.Status,
              deadbandType: deadbandType,
              deadbandValue: node.deadbandValue // from UI n.deadbandvalue
           })
          }
        });
        verbose_log("Monitoring parameters: " + monitoredItemCreateRequest1);
        monitoredItem = subscription.createMonitoredItem(addressSpace, TimestampsToReturn.Both, monitoredItemCreateRequest1);
        */

        try {
          monitoredItem = opcua.ClientMonitoredItem.create(subscription, {
            nodeId: nodeStr,
            attributeId: opcua.AttributeIds.Value
          }, {
            samplingInterval: interval,
            queueSize: queueSize,
            discardOldest: true,
            filter: dataChangeFilter
          },
            TimestampsToReturn.Both, // Other valid values: Source | Server | Neither | Both
          );
          verbose_log("Storing monitoredItem: " + nodeStr + " ItemId: " + monitoredItem.toString());
          monitoredItems.set(nodeStr, monitoredItem);
        } catch (err) {
          node_error("Check topic format for nodeId:" + msg.topic)
          node_error('subscription.monitorItem:' + err);
          // reset_opcua_client(connect_opcua_client); // not actually needed
        }

        monitoredItem.on("initialized", function () {
          verbose_log("initialized monitoredItem on " + nodeStr);
        });

        monitoredItem.on("changed", function (dataValue) {
          let msgToSend = JSON.parse(JSON.stringify(msg)); // clone original msg if it contains other needed properties {};
          set_node_status_to("active monitoring");
          verbose_log(msg.topic + " value has changed to " + dataValue.value.value);
          verbose_log(dataValue.toString());
          if (dataValue.statusCode === opcua.StatusCodes.Good) {
            verbose_log("Status-Code:" + dataValue.statusCode.toString(16));
          } else {
            verbose_warn("Status-Code:" + dataValue.statusCode.toString(16));
          }

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
    }
    function get_monitored_items(subscription, msg) {
      node.session.getMonitoredItems(subscription.subscriptionId, function (err, monitoredItems) {
        verbose_log("Node has subscribed items: " + stringify(monitoredItems));
        return monitoredItems;
      });
    }

    function unsubscribe_monitoredItem(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);
      var nodeStr = msg.topic; // nodeId needed as topic
      var dTypeIndex = nodeStr.indexOf(";datatype=");
      if (dTypeIndex > 0) {
        nodeStr = nodeStr.substring(0, dTypeIndex);
      }
      var items = get_monitored_items(subscription, msg); // TEST
      var monitoredItem = monitoredItems.get(msg.topic);
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
    }

    function delete_subscription_action_input(msg) {
      verbose_log("delete subscription msg= " + stringify(msg));
      if (!subscription) {
        verbose_warn("Cannot delete, no subscription existing!");
      } else {
        // otherwise check if its terminated start to renew the subscription
        if (subscription.isActive) {
          node.session.deleteSubscriptions({
            subscriptionIds: [subscription.subscriptionId]
        }, function(err, response) {
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
    }

    async function browse_action_input(msg) {
      verbose_log("browsing");
      var allInOne = []; // if msg.collect and msg.collect === true then collect all items to one msg
      var NodeCrawler = opcua.NodeCrawler;

      if (node.session) {
        const crawler = new NodeCrawler(node.session);
        set_node_status_to("active browsing");

        crawler.on("browsed", function(element) {
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
        });

        // Browse from given topic
        const nodeId = msg.topic; // "ObjectsFolder";
        crawler.read(nodeId, function(err, obj) {
            if (!err) {
              // Crawling done
              if (msg.collect && msg.collect === true) {
                verbose_log("Send all in one, items: " + allInOne.length);
                var all = {};
                all.topic = "AllInOne";
                all.payload = allInOne;
                set_node_status_to("browse done");
                node.send(all);
                return;
              }
              /*
              let newMessage = opcuaBasics.buildBrowseMessage("");
              let browseName = "";
              // This is visual, but takes too long time
              treeify.asLines(obj, true, true, function(line) {
                if (line.indexOf("nodeId") > 0) {
                  count2++;
                  var nodeId = line.substring(line.indexOf("nodeId") + 8);
                  // Use nodeId as topic
                  newMessage = opcuaBasics.buildBrowseMessage(nodeId.toString());
                  newMessage.nodeId = nodeId;
                  newMessage.browseName = browseName;
                }
                if (line.indexOf("browseName:") > 0) {
                  browseName = line.substring(line.indexOf("browseName:") + 12);
                }
                if (line.indexOf("dataType") > 0) {
                  newMessage.dataType = line.substring(line.indexOf("dataType") + 10);
                }
                // Last item on treeify object structure is typeDefinition
                if (line.indexOf("typeDefinition") > 0) {
                  newMessage.typeDefinition = line.substring(line.indexOf("typeDefinition") + 16);
                  var msg2 = newMessage;
                  const nodesToRead = [{ nodeId: newMessage.nodeId, attributeId: opcua.AttributeIds.Description }];
                  node.session.read(nodesToRead, function(err, dataValues) {
                    if (!err && dataValues.length === 1) {
                      // Should return only one, localeText
                      if (dataValues[0] && dataValues[0].value && dataValues[0].value.value && dataValues[0].value.value.text) {
                        // console.log("NODEID: " + newMessage.nodeId + " DESCRIPTION: " + dataValues[0].value.value.text);
                        msg2.description = dataValues[0].value.value.text.toString();
                      }
                    }
                    msg2.payload = Date.now(); // TODO check if real DataValue could be used
                
                    }
                    else {
                      node.send(msg2);
                    }
                  });
                }
                // console.log(line); // No console output
              });
              */
              set_node_status_to("browse done");
            }
            crawler.dispose();
        });

      } else {
        node_error("Session is not active!");
        set_node_status_to("Session invalid");
        reset_opcua_client(connect_opcua_client);
      }
    }

    function subscribe_monitoredEvent(subscription, msg) {
      verbose_log("Session subscriptionId: " + subscription.subscriptionId);

      var monitoredItem = monitoredItems.get(msg.topic);
      if (monitoredItem === undefined) {
        verbose_log("Msg " + stringify(msg));
        var interval = convertAndCheckInterval(msg.payload);
        verbose_log(msg.topic + " samplingInterval " + interval);
        verbose_warn("Monitoring Event: " + msg.topic + ' by interval of ' + interval + " ms");
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
        monitoredItem.on("initialized", function () {
          verbose_log("monitored Event initialized");
          set_node_status_to("initialized");
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

    function subscribe_events_input(msg) {

      verbose_log("subscribing events");

      if (!subscription) {
        // first build and start subscription and subscribe on its started event by callback
        var timeMilliseconds = opcuaBasics.calc_milliseconds_by_time_and_unit(node.time, node.timeUnit);
        subscription = make_subscription(subscribe_monitoredEvent, msg, opcuaBasics.getEventSubscriptionParameters(timeMilliseconds));
      } else {
        // otherwise check if its terminated start to renew the subscription
        if (subscription.subscriptionId != "terminated") {
          set_node_status_to("active subscribing");
          subscribe_monitoredEvent(subscription, msg);
        } else {
          subscription = null;
          // monitoredItems = new Map();
          monitoredItems.clear();
          set_node_status_to("terminated");
          // No actual error session created, this case cause connections to server
          // reset_opcua_client(connect_opcua_client);
        }
      }
    }

    function reconnect(msg) {
      if (msg && msg.OpcUaEndpoint) {
        // Remove listeners if existing
        if (node.client) {
          verbose_warn("Cleanup old listener events... before connecting to new client");
          verbose_warn("All event names:" + node.client.eventNames());
          verbose_warn("Connection_reestablished event count:" + node.client.listenerCount("connection_reestablished"));
          node.client.removeListener("connection_reestablished", reestablish);
          verbose_warn("Backoff event count:" + node.client.listenerCount("backoff"));
          node.client.removeListener("backoff", backoff);
          verbose_warn("Start reconnection event count:" + node.client.listenerCount("start_reconnection"));
          node.client.removeListener("start_reconnection", reconnection);
        }
        opcuaEndpoint = msg.OpcUaEndpoint; // Check all parameters!
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
      // monitoredItems = new Map();
      monitoredItems.clear();
      if (node.session) {
        node.session.close(function(err) {
          if (err) {
            node_error("Session close error: " + err);
          }
          else {
            verbose_warn("Session closed!");
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

          node.session = null;
          close_opcua_client("closed", 0);
        });
      } else {
        node.session = null;
        close_opcua_client("closed", 0);
      }
    });

    node.on("error", function () {
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
          node.session = null;
          close_opcua_client("node error", err);
        });

      } else {
        node.session = null;
        close_opcua_client("node error", 0);
      }
    });
  }

  RED.nodes.registerType("OpcUa-Client", OpcUaClientNode);
};
