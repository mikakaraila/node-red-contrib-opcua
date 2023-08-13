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
  UaMethodNode,
  UaMethodDef
} from "./107-opcuamethoddef";

import { get_node_status } from "./opcua-basics";
import { coerceNodeId, 
  SecurityPolicy, 
  MessageSecurityMode, 
  UserTokenType, 
  OPCUAClient,
  OPCUAClientOptions,
  StatusCodes, 
  Variant, 
  DataType,
  CallMethodRequest,
  UserIdentityInfo
 } from "node-opcua";

// ScanData, AutoId
import { DataTypeFactory } from "node-opcua-factory";
import { getOrCreateConstructor } from "node-opcua-schemas";
const dataTypeFactory = new DataTypeFactory([]);
const ScanData = getOrCreateConstructor("ScanData", dataTypeFactory);
import { stringify } from "flatted";
import * as chalk from "chalk";
import { UaEndpointNode } from "./105-opcuaendpointdef";

/* eslint-disable-next-line */
const UaMethod: NodeInitializer = (RED): void => {
  function UaMethodNodeConstructor(
    this: UaMethodNode,
    n: UaMethodDef
  ): void {
    RED.nodes.createNode(this, n);
  
    this.objectId = n.objectId;
    this.methodId = n.methodId;
    this.name = n.name;
    this.inputArguments = n.inputArguments;
    this.outputArguments = n.outputArguments;

    /* eslint-disable-next-line */
    const node:any = this; // TODO UaMethodNode

    const opcuaEndpoint: UaEndpointNode = RED.nodes.getNode(n.endpoint) as UaEndpointNode;
    /* eslint-disable-next-line */
    const cmdQueue:any = []; // queue msgs which can currently not be handled because session is not established, yet and currentStatus is 'connecting'
    let currentStatus = ''; // the status value set set by node.status(). Didn't find a way to read it back.
    node.outputArguments = [];

    function set_node_status_to(statusValue, message = "") {
      verbose_log("Client status: " + statusValue);
      const statusParameter = get_node_status(statusValue);
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
      node.inputArguments.push({dataType: n.arg0type, value: coerceNodeId(n.arg0value)});
    } else if (n.arg0type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg0type, typeid: n.arg0typeid, value: JSON.parse(n.arg0value)});
    } else if (n.arg0type === "String") {
      node.inputArguments.push({dataType: n.arg0type, value: n.arg0value});
    } else if (n.arg0type === "ScanData") {
      node.inputArguments.push({dataType: n.arg0type, value: new ScanData(n.arg0value)});
    }
    else if (n.arg0type === "Double" || n.arg0type === "Float" ) {
      node.inputArguments.push({dataType: n.arg0type, value: parseFloat(n.arg0value)});
    } else {
      node.inputArguments.push({dataType: n.arg0type, value: parseInt(n.arg0value)});
    }

    if (n.arg1type === undefined || n.arg1type === "" || n.arg1value === "") {
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
      node.inputArguments.push({dataType: n.arg1type, value: coerceNodeId(n.arg1value)});
    } else if (n.arg1type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg1type, typeid: n.arg1typeid, value: JSON.parse(n.arg1value)});
    } else if (n.arg1type === "String") {
      node.inputArguments.push({dataType: n.arg1type, value: n.arg1value});
    } else if (n.arg1type === "Double" || n.arg1type === "Float" ) {
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
      node.inputArguments.push({dataType: n.arg2type, value: coerceNodeId(n.arg2value)});
    } else if (n.arg2type === "ExtensionObject") {
      node.inputArguments.push({dataType: n.arg2type, typeid: n.arg0typeid, value: JSON.parse(n.arg2value)});
    } else if (n.arg2type === "String") {
      node.inputArguments.push({dataType: n.arg2type, value: n.arg2value});
    } else if (n.arg2type === "Double" || n.arg2type === "Float" ) {
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
      node.outputArguments.push({dataType: n.out0type, value: coerceNodeId(n.out0value)});
    } else if (n.out0type === "ExtensionObject") {
      node.outputArguments.push({dataType: n.out0type, typeid: n.out0typeid, value: JSON.parse(n.out0value)});
    } else if (n.out0type === "String") {
      node.outputArguments.push({dataType: n.out0type, value: n.out0value});
    } else if (n.out0type === "ScanData") {
      node.outputArguments.push({dataType: n.out0type, value: new ScanData(n.out0value)});
    }
    else if (n.out0type === "Double" || n.out0type === "Float" ) {
      node.outputArguments.push({dataType: n.out0type, value: parseFloat(n.out0value)});
    } else {
      node.outputArguments.push({dataType: n.out0type, value: parseInt(n.out0value)});
    }

    const connectionOption: OPCUAClientOptions = {};
    let userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous};

    if (opcuaEndpoint.securityPolicy) {
      connectionOption.securityPolicy = SecurityPolicy[opcuaEndpoint.securityPolicy];
    } else {
      connectionOption.securityPolicy = SecurityPolicy.None;
    }
    if (opcuaEndpoint.securityMode) {
      connectionOption.securityMode = MessageSecurityMode[opcuaEndpoint.securityMode];
    } else {
      connectionOption.securityMode = MessageSecurityMode.None;
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
      userIdentity = { userName: opcuaEndpoint.credentials.user,
                       password: opcuaEndpoint.credentials.password,
                       type: UserTokenType.UserName
      };
    }
    node.debug("Input arguments:" + JSON.stringify(node.inputArguments));
    
    const backoff = function (attempt, delay) {
      /* eslint-disable-next-line */
      const msg:any = {};
      msg.error = {};
      msg.error.message = "reconnect";
      msg.error.source = n.name; //  this;
      node.error("reconnect", msg);
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
        node.client = OPCUAClient.create(connectionOption);
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
    /* eslint-disable-next-line */
    async function methodNodeProcess(url, message:any, callback) {
      try {
        const statuses = ['initialized', 'method executed'];
        verbose_log("Queued Message: " + JSON.stringify(message));
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
          verbose_log("start session on " + opcuaEndpoint.endpoint);
          set_node_status_to("session active");

          // step 3: call method
          for (const cmd of cmdQueue) {
            verbose_log("Call method: " + JSON.stringify(cmd));
            const status = await callMethod(cmd);  
            if (status !== StatusCodes.Good) {
              node.error("Could not run method: ", cmd);
            }
          }

          cmdQueue.length = 0;
          set_node_status_to("method executed");

          // step 4: close session & disconnect client
          if (node.session) {
            await node.session.close();
            verbose_log("Session closed");
            node.session = null;
            await node.client.disconnect();
          }
        }
      } catch (err) {
        /* eslint-disable-next-line */
        const msg:any = {};
        msg.error = {};
        msg.error.message = "Cannot connect to " + JSON.stringify(opcuaEndpoint);
        msg.error.source = n.name; // this;
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
              // node.client = null;
              verbose_log("Client disconnected!");
              if (error === 0) {
                set_node_status_to("closed");
              }
              else {
                set_node_status_to(message, error);
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
          node_error("Error on disconnect: " + stringify(err));
        }
      }
    }

    function node_error(err) {
      // console.error(chalk.red("Client node error on node: " + node.name + "; error: " + stringify(err)));
      /* eslint-disable-next-line */
      const msg:any  = {};
      msg.error = {};
      msg.error.message = "Client node error: " + stringify(err);
      msg.error.source = n.name; //  this;
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
        verbose_log("Calling method: " + JSON.stringify(msg.methodId));
        verbose_log("InputArguments: " + JSON.stringify(msg.inputArguments));
        verbose_log("OutputArguments: " + JSON.stringify(msg.outputArguments));

        try {
          let i = 0;
          let arg;
          while (i < msg.inputArguments.length) {
            arg = msg.inputArguments[i];
            if (arg.dataType === "NodeId") {
              arg.value = coerceNodeId(arg.value);
            }
            if (arg.dataType === "ExtensionObject") {
              let extensionobject;
              if (arg.typeid) {
                extensionobject = await node.session.constructExtensionObject(coerceNodeId(arg.typeid), {}); // TODO make while loop to enable await
              }
              verbose_log("ExtensionObject=" + stringify(extensionobject));
              Object.assign(extensionobject, arg.value);
              arg.value = new Variant({
                dataType: DataType.ExtensionObject,
                value: extensionobject
              });
            }
            i++;
          }
        } catch (err) {
          /* eslint-disable-next-line */
          const msg:any = {};
          msg.error = {};
          msg.error.message = "Invalid NodeId: " + err;
          msg.error.source = n.name; //  this;
          node.error("Invalid NodeId: ", msg);
          return StatusCodes.BadNodeIdUnknown;
        }
        verbose_log("Updated InputArguments: " + JSON.stringify(msg.inputArguments));
        let callMethodRequest;
        let diagInfo;
        try {
          callMethodRequest = new CallMethodRequest({
            objectId: coerceNodeId(msg.objectId),
            methodId: coerceNodeId(msg.methodId),
            // inputArgumentDiagnosticInfos: diagInfo,
            inputArguments: msg.inputArguments,
            // outputArguments: msg.outputArguments
          });
        } catch (err) {
          set_node_status_to("error: " + err);
          /* eslint-disable-next-line */
          const msg:any = {};
          msg.error = {};
          msg.error.message = "Build method request failed, error: " + err;
          msg.error.source = n.name; // this;
          node.error("Build method request failed, error: ", msg);
        }

        verbose_log("Call request: " + callMethodRequest.toString());
        verbose_log("Calling: " + callMethodRequest);
        try {
          const result = await node.session.call(callMethodRequest);
          if (diagInfo) {
            verbose_log("Diagn. info: " + JSON.stringify(diagInfo));
          }
          verbose_log("Output args: " + JSON.stringify(msg.outputArguments));
          verbose_log("Results:     " + JSON.stringify(result));
          msg.result = result;
          if (result && result.statusCode === StatusCodes.Good) {
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
            set_node_status_to("error: " + result.statusCode.description)
            node.error("Execute method result, error:" + result.statusCode.description);
            return result.statusCode;
          }
          node.send(msg);
          return StatusCodes.Good;
        } catch (err) {
          set_node_status_to("Method execution error: " + err);
          /* eslint-disable-next-line */
          const msg:any = {};
          msg.error = {};
          msg.error.message = "Method execution error: " + err;
          msg.error.source = n.name; // this;
          node.error("Method execution error: ", msg);
          return StatusCodes.BadMethodInvalid;
        }
      }
    }

    node.on("input", function (msg) {
      /* eslint-disable-next-line */
      const message:any = {};
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
        verbose_warn("No Input Arguments for Method");
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

  RED.nodes.registerType("OpcUa-Method", UaMethodNodeConstructor);
}

export = UaMethod;