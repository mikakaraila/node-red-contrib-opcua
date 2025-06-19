/**

 Copyright 2020 Valmet Automation Inc.

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
 * OPC UA node representation for Node-RED OPC UA method call.
 *
 * @param RED
 */
module.exports = function (RED) {
  var chalk = require("chalk");
  var opcua = require('node-opcua');
  var uaclient = require('node-opcua-client');
  const {stringify} = require('flatted');
  // const dataTypeFactory = require("node-opcua-factory");
  // const ScanData = getOrCreateConstructor("ScanData", dataTypeFactory);
  var opcuaBasics = require('./opcua-basics');

  function OPCUAMethodNode(n) {
    RED.nodes.createNode(this, n)
    this.objectId = n.objectId;
    this.methodId = n.methodId;
    this.name = n.name;
    this.inputArguments = n.inputArguments;
    this.outputArguments = n.outputArguments;

    var node = this;
    var opcuaEndpoint = RED.nodes.getNode(n.endpoint);
    const cmdQueue = []; // queue msgs which can currently not be handled because session is not established, yet and currentStatus is 'connecting'
    var currentStatus = ''; // the status value set set by node.status(). Didn't find a way to read it back.
    node.outputArguments = [];

    function set_node_status_to(statusValue, message = "") {
      verbose_log(chalk.yellow("Client status: ") + chalk.cyan(statusValue));
      var statusParameter = opcuaBasics.get_node_status(statusValue);
      currentStatus = statusValue;
      node.status({
        fill: statusParameter.fill,
        shape: statusParameter.shape,
        text: (statusParameter.status + " " + message).trim()
      });
    }

    if (n.arg0type === undefined || n.arg0type === "" || n.arg0value === "") {
      // Do nothing
    } else if (n.arg0type === "Boolean") {
      if (n.arg0value === "True") {
        node.inputArguments.push({dataType: n.arg0type, value: true});
      }
      else {
        node.inputArguments.push({dataType: n.arg0type, value: false});
      }
    } else if (n.arg0type === "DateTime") {
      node.inputArguments.push({dataType: n.arg0type, value: new Date(n.arg0value)});
    } else if (n.arg0type === "NodeId") {
      node.inputArguments.push({dataType: n.arg0type, value: opcua.coerceNodeId(n.arg0value)});
    } else if (n.arg0type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg0type, typeid: n.arg0typeid, value: JSON.parse(n.arg0value)});
    } else if (n.arg0type === "String") {
      node.inputArguments.push({dataType: n.arg0type, value: n.arg0value});
    } else if (n.out0type === "LocalizedText") {
      // ValueRank="1" ArrayDimensions="1"
      node.inputArguments.push({dataType: n.arg0type, valueRank: 1, arrayDimensions: 1, value: [n.arg0value]});
    } else if (n.arg0type === "ScanData") {
      node.inputArguments.push({dataType: n.arg0type, value: new ScanData(n.arg0value)});
    }
    else if (n.arg0type === "Double" || n.arg0type === "Float" ) {
      node.inputArguments.push({dataType: n.arg0type, value: parseFloat(n.arg0value)});
    } else {
      node.inputArguments.push({dataType: n.arg0type, value: parseInt(n.arg0value)});
    }

    if (n.arg1type === undefined || n.arg1ype === "" || n.arg1value === "") {
      // Do nothing
    } else if (n.arg1type === "Boolean") {
      if (n.arg1value === "True") {
        node.inputArguments.push({dataType: n.arg1type, value: true});
      }
      else {
        node.inputArguments.push({dataType: n.arg1type, value: false});
      }
    } else if (n.arg1type === "DateTime") {
      node.inputArguments.push({dataType: n.arg1type, value: new Date(n.arg1value)});
    } else if (n.arg1type === "NodeId") {
      node.inputArguments.push({dataType: n.arg1type, value: opcua.coerceNodeId(n.arg1value)});
    } else if (n.arg1type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg1type, typeid: n.arg1typeid, value: JSON.parse(n.arg1value)});
    } else if (n.arg1type === "String") {
      node.inputArguments.push({dataType: n.arg1type, value: n.arg1value});
    } else if (n.arg1type === "LocalizedText") {
      node.inputArguments.push({dataType: n.arg1type, valueRank: 1, arrayDimensions: 1, value: [n.arg1value]});
    }else if (n.arg1type === "Double" || n.arg1type === "Float" ) {
      node.inputArguments.push({dataType: n.arg1type, value: parseFloat(n.arg1value)});
    } else {
      node.inputArguments.push({dataType: n.arg1type, value: parseInt(n.arg1value)});
    }

    if (n.arg2type === undefined || n.arg2type === "" || n.arg2value === "") {
      // Do nothing
    } else if (n.arg2type === "Boolean") {
      if (n.arg2value === "True") {
        node.inputArguments.push({dataType: n.arg2type, value: true});
      }
      else {
        node.inputArguments.push({dataType: n.arg2type, value: false});
      }
    } else if (n.arg2type === "DateTime") {
      node.inputArguments.push({dataType: n.arg2type, value: new Date(n.arg2value)});
    } else if (n.arg2type === "NodeId") {
      node.inputArguments.push({dataType: n.arg2type, value: opcua.coerceNodeId(n.arg2value)});
    } else if (n.arg2type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg2type, typeid: n.arg0typeid, value: JSON.parse(n.arg2value)});
    } else if (n.arg2type === "String") {
      node.inputArguments.push({dataType: n.arg2type, value: n.arg2value});
    } else if (n.arg2type === "LocalizedText") {
      node.inputArguments.push({dataType: n.arg2type, valueRank: 1, arrayDimensions: 1, value: [n.arg2value]});
    }else if (n.arg2type === "Double" || n.arg2type === "Float" ) {
      node.inputArguments.push({dataType: n.arg2type, value: parseFloat(n.arg2value)});
    } else {
      node.inputArguments.push({dataType: n.arg2type, value: parseInt(n.arg2value)});
    }

    if (n.out0type === undefined || n.out0type === "") {
      // Do nothing
    } else if (n.out0type === "Boolean") {
      if (n.out0value === "True") {
        node.outputArguments.push({dataType: n.out0type, value: true});
      }
      else {
        node.outputArguments.push({dataType: n.out0type, value: false});
      }
    } else if (n.out0type === "DateTime") {
      node.outputArguments.push({dataType: n.out0type, value: new Date(n.out0value)});
    } else if (n.out0type === "NodeId") {
      node.outputArguments.push({dataType: n.out0type, value: opcua.coerceNodeId(n.out0value)});
    } else if (n.out0type === "ExtensionObject") {
      node.outputArguments.push({dataType: n.out0type, typeid: n.out0typeid, value: JSON.parse(n.out0value)});
    } else if (n.out0type === "String") {
      node.outputArguments.push({dataType: n.out0type, value: n.out0value});
    } else if (n.out0type === "LocalizedText") {
      node.outputArguments.push({dataType: n.out0type, value: n.out0value});
    }
    else if (n.out0type === "ScanData") {
      node.outputArguments.push({dataType: n.out0type, value: new ScanData(n.out0value)});
    }
    else if (n.out0type === "Double" || n.out0type === "Float" ) {
      node.outputArguments.push({dataType: n.out0type, value: parseFloat(n.out0value)});
    } else {
      node.outputArguments.push({dataType: n.out0type, value: parseInt(n.out0value)});
    }

    var connectionOption = {};
    var userIdentity = {};

    if (opcuaEndpoint.securityPolicy) {
      connectionOption.securityPolicy = opcua.SecurityPolicy[opcuaEndpoint.securityPolicy];
    } else {
      connectionOption.securityPolicy = opcua.SecurityPolicy.None;
    }
    if (opcuaEndpoint.securityMode) {
      connectionOption.securityMode = opcua.MessageSecurityMode[opcuaEndpoint.securityMode];
    } else {
      connectionOption.securityPolicy = opcua.MessageSecurityMode.None;
    }
    connectionOption.endpointMustExist = false;
    connectionOption.defaultSecureTokenLifetime = 40000 * 5;
    connectionOption.connectionStrategy = {
      maxRetry: 10512000, // Limited to max 10 ~5min // 10512000, // 10 years should be enough. No infinite parameter for backoff.
      initialDelay: 5000, // 5s
      maxDelay: 30 * 1000 // 30s
    };
    connectionOption.keepSessionAlive = false; // true;

    if (opcuaEndpoint.login) {
      userIdentity.userName = opcuaEndpoint.credentials.user;
      userIdentity.password = opcuaEndpoint.credentials.password;
      userIdentity.type = uaclient.UserTokenType.UserName; // New TypeScript API parameter
    }
    node.debug(chalk.yellow("Input arguments: ") + chalk.cyan(JSON.stringify(node.inputArguments)));
    
    const backoff = function (attempt, delay) {
      var msg = {};
      msg.error = {};
      msg.error.message = "reconnect";
      msg.error.source = this;
      // node.error("reconnect", msg);
      verbose_log(chalk.red("reconnect") + chalk.cyan(msg));
      set_node_status_to("reconnect", "attempt #" + attempt + " retry in " + delay / 1000.0 + " sec");
    };

    const reconnection = function () {
      set_node_status_to("reconnect", "starting...");
    };
    
    const reestablish = function () {
      set_node_status_to("connected", "re-established");
    };

    function create_opcua_client() {
      if (node.client) {
        node.client = null;
      }
      try {
        if (opcuaEndpoint.endpoint.indexOf("opc.tcp://0.0.0.0") == 0) {
          node_error("No client");
          set_node_status_to("no client");
          return;
        }
        // Normal client
        verbose_log(chalk.green("1) CREATE CLIENT: ") + chalk.cyan(JSON.stringify(connectionOption).substring(0,75) + "..."));
        node.client = opcua.OPCUAClient.create(connectionOption);
        node.client.on("connection_reestablished", reestablish);
        node.client.on("backoff", backoff);
        node.client.on("start_reconnection", reconnection);
        set_node_status_to("create client");
      }
      catch(err) {
        node_error("Cannot create client, check connection options: " + stringify(connectionOption));
        set_node_status_to("error", "Cannot create client, check connection options: " + stringify(connectionOption));
      }
    }

    create_opcua_client();

    set_node_status_to("initialized");

    async function methodNodeProcess(url, message, callback) {
      try {

        const statuses = ['initialized', 'method executed'];

        verbose_log(chalk.yellow("Queued Message: ") + chalk.cyan(JSON.stringify(message)));
        cmdQueue.push(message);

        if (statuses.includes(currentStatus)) {
          set_node_status_to("executing method")
          // if Node Re-connecting or busy, methods should only be queued
          // If it's ready:

          // step 1 : connect client
          await connect_opcua_client(url);
          node.log("start method client on " + opcuaEndpoint.endpoint);

          // step 2 : createSession
          node.session = await node.client.createSession(userIdentity);
          verbose_log(chalk.yellow("start session on ") + chalk.cyan(opcuaEndpoint.endpoint));
          set_node_status_to("session active");

          // step 3: call method
          for (const cmd of cmdQueue) {
            verbose_log(chalk.yellow("Call method: ") + chalk.cyan(JSON.stringify(cmd)));
            var result = await callMethod(cmd);  
            if (result.statusCode !== opcua.StatusCodes.Good) {
              verbose_warn(chalk.red("Could not run method: ") + chalk.cyan(result));
            }
          }

          cmdQueue.length = 0;
          set_node_status_to("method executed");

          // step 4: close session & disconnect client
          if (node.session) {
            await node.session.close();
            verbose_log(chalk.yellow("Session closed"));
            node.session = null;
            await node.client.disconnect();
          }
        }
      } catch (err) {
        var msg = {};
        msg.error = {};
        msg.error.message = "Cannot connect to " + JSON.stringify(opcuaEndpoint);
        msg.error.source = this;
        node.error("Cannot connect to ", msg);
        callback(err);
      }
    }

    async function connect_opcua_client(url) {
        set_node_status_to("connecting")
        await node.client.connect(url);
    }

    function close_opcua_client(message, error) {
      if (node.client) {
        node.client.removeListener("connection_reestablished", reestablish);
        node.client.removeListener("backoff", backoff);
        node.client.removeListener("start_reconnection", reconnection);
        try {
          if(!node.client.isReconnecting){
            node.client.disconnect(function () {
              node.client = null;
              verbose_log(chalk.yellow("Client disconnected!"));
              if (error === 0) {
                set_node_status_to("closed");
              }
              else {
                set_node_errorstatus_to(message, error)
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

    function node_error(err) {
      // console.error(chalk.red("Client node error on node: " + node.name + "; error: " + stringify(err)));
      var msg = {};
      msg.error = {};
      msg.error.message = "Client node error: " + stringify(err);
      msg.error.source = this;
      node.error("Method node error on node: ", msg);
    }

    function verbose_warn(logMessage) {
      //if (RED.settings.verbose) {
        node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaMethodNode: ' + logMessage);
      //}
    }

    function verbose_log(logMessage) {
      //if (RED.settings.verbose) {
        // node.log(logMessage);
        node.debug(logMessage);
      //}
    }

    async function callMethod(msg) {
      if (msg.methodId && msg.inputArguments) {
        verbose_log(chalk.yellow("Calling method: ") + chalk.cyan(JSON.stringify(msg.methodId)));
        verbose_log(chalk.yellow("InputArguments: ") + chalk.cyan(JSON.stringify(msg.inputArguments)));
        verbose_log(chalk.yellow("OutputArguments: ") + chalk.cyan(JSON.stringify(msg.outputArguments)));

        try {
          var i = 0;
          var arg;
          while (i < msg.inputArguments.length) {
            arg = msg.inputArguments[i];
            if (arg.dataType === "NodeId") {
              arg.value = opcua.coerceNodeId(arg.value);
            }
            if (arg.dataType === "ExtensionObject") {
              var extensionobject = null;
              if (arg.typeid) {
                extensionobject = await node.session.constructExtensionObject(opcua.coerceNodeId(arg.typeid), arg.value); // TODO make while loop to enable await
              }
              verbose_log(chalk.yellow("ExtensionObject=") + chalk.cyan(stringify(extensionobject)));
              arg.value = extensionobject;
            }
            i++;
          }
        } catch (err) {
          var msg = {};
          msg.error = {};
          msg.error.message = "Invalid NodeId: " + err;
          msg.error.source = this;
          node.error("Invalid NodeId: ", msg);
          return opcua.StatusCodes.BadNodeIdUnknown;
        }
        verbose_log(chalk.yellow("Updated InputArguments: ") + chalk.cyan(JSON.stringify(msg.inputArguments)));
        var callMethodRequest;
        var diagInfo;
        try {
          set_node_status_to("call method");
          callMethodRequest = new opcua.CallMethodRequest({
            objectId: opcua.coerceNodeId(msg.objectId),
            methodId: opcua.coerceNodeId(msg.methodId),
            inputArgumentDiagnosticInfos: diagInfo,
            inputArguments: msg.inputArguments,
            outputArguments: msg.outputArguments
          });
        } catch (err) {
          set_node_status_to("error: " + err);
          var msg = {};
          msg.error = {};
          msg.error.message = "Build method request failed, error: " + err;
          msg.error.source = this;
          node.error("Build method request failed, error: ", msg);
        }

        verbose_log(chalk.yellow("Call request: ") + chalk.cyan(callMethodRequest.toString()));
        verbose_log(chalk.yellow("Calling: ") + chalk.cyan(callMethodRequest));
        try {
          let result = await node.session.call(callMethodRequest);
          if (diagInfo) {
            verbose_log(chalk.red("Diagn. info: ") + chalk.cyan(JSON.stringify(diagInfo)));
          }
          verbose_log(chalk.yellow("Output args: ") + JSON.stringify(msg.outputArguments));
          verbose_log(chalk.yellow("Results:     ") + JSON.stringify(result));
          msg.result = result;
          if (result && result.statusCode === opcua.StatusCodes.Good) {
            var i = 0;
            msg.output = result.outputArguments; // Original outputArguments
            msg.payload = []; // Store values back to array
            if (result.outputArguments.length == 1) {
              verbose_log(chalk.yellow("Value: ") + chalk.cyan(result.outputArguments[i].value));
              msg.payload = result.outputArguments[0].value; // Return only if one output argument
            } else {
              while (result.outputArguments.length > i) {
                verbose_log(chalk.yellow("Value[") + chalk.cyan(i) + chalk.yellow("]: ") + chalk.cyan(result.outputArguments[i].toString()));
                msg.payload.push(result.outputArguments[i].value); // Just copy result value to payload[] array, actual value needed mostly
                i++;
              }
            }
          } else {
            set_node_status_to("error: " + result.statusCode.description)
            node.error("Execute method result, error:" + result.statusCode.description);
            return result;
          }
          set_node_status_to("method executed");
          node.send(msg);
          return result; // opcua.StatusCodes.Good;
        } catch (err) {
          set_node_status_to("Method execution error: " + err);
          var msg = {};
          msg.error = {};
          msg.error.message = "Method execution error: " + err;
          msg.error.source = this;
          node.error("Method execution error: ", msg);
          return opcua.StatusCodes.BadMethodInvalid;
        }
      }
    }

    node.on("input", function (msg) {
      var message = {}
      
      message.objectId = msg.objectId || node.objectId;
      message.methodId = msg.methodId || node.methodId;
      message.methodType = msg.methodType || node.methodType;
      message.inputArguments = msg.inputArguments || node.inputArguments;
      message.outputArguments = msg.outputArguments || node.outputArguments;
    
      if (!message.objectId) {
        verbose_warn("No objectId for Method");
        return;
      }
      if (!message.methodId) {
        verbose_warn("No method for Method");
        return;
      }
      if (!message.inputArguments) {
        verbose_warn(chalk.yellow("No Input Arguments for Method"));
        return
      }

      methodNodeProcess(opcuaEndpoint.endpoint, message, function (err) {
        if (err) {
          node_error(err);
          node.status({
            fill: "red",
            shape: "dot",
            text: "Error: " + err.toString()
          });
        }
      });
    });

    node.on("close", async function (done) {
      if (node.session) {
        await node.session.close();
        node.session = null;
        close_opcua_client("closed", 0);
        done();
      } else {
        node.session = null
        close_opcua_client("closed", 0);
        done();
      }
    });

  }

  RED.nodes.registerType("OpcUa-Method", OPCUAMethodNode);
}
