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
  var opcua = require('node-opcua');
  var uaclient = require('node-opcua-client');
 
  function OPCUAMethodNode(n) {
    RED.nodes.createNode(this, n)
    this.objectId = n.objectId;
    this.methodId = n.methodId;
    this.name = n.name;
    this.inputArguments = n.inputArguments;
    
    var node = this;
    var opcuaEndpoint = RED.nodes.getNode(n.endpoint);

    if (n.arg0type === undefined || n.arg0type === "") {
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
    } else if (n.arg0type === "String") {
      node.inputArguments.push({dataType: n.arg0type, value: n.arg0value});
    } else if (n.arg0type === "Double" || n.arg0type === "Float" ) {
      node.inputArguments.push({dataType: n.arg0type, value: parseFloat(n.arg0value)});
    } else {
      node.inputArguments.push({dataType: n.arg0type, value: parseInt(n.arg0value)});
    }

    if (n.arg1type === undefined || n.arg1ype === "") {
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
    } else if (n.arg1type === "String") {
      node.inputArguments.push({dataType: n.arg1type, value: n.arg1value});
    } else if (n.arg1type === "Double" || n.arg1type === "Float" ) {
      node.inputArguments.push({dataType: n.arg1type, value: parseFloat(n.arg1value)});
    } else {
      node.inputArguments.push({dataType: n.arg1type, value: parseInt(n.arg1value)});
    }

    if (n.arg2type === undefined || n.arg2type === "") {
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
    } else if (n.arg2type === "String") {
      node.inputArguments.push({dataType: n.arg2type, value: n.arg2value});
    } else if (n.arg2type === "Double" || n.arg2type === "Float" ) {
      node.inputArguments.push({dataType: n.arg2type, value: parseFloat(n.arg2value)});
    } else {
      node.inputArguments.push({dataType: n.arg2type, value: parseInt(n.arg2value)});
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

    if (opcuaEndpoint.login) {
      userIdentity.userName = opcuaEndpoint.credentials.user;
      userIdentity.password = opcuaEndpoint.credentials.password;
      userIdentity.type = uaclient.UserTokenType.UserName; // New TypeScript API parameter
    }
    
    async function setupClient(url, callback) {

      const client = opcua.OPCUAClient.create(connectionOption);
      try {
        // step 1 : connect to
        await client.connect(url);
        node.log("start method client on " + opcuaEndpoint.endpoint);

        // step 2 : createSession
        const session = await client.createSession(userIdentity);
        node.log("start session on " + opcuaEndpoint.endpoint);
        node.session = session;
      } catch (err) {
        node.error("Cannot connect to " + JSON.stringify(opcuaEndpoint));
        callback(err);
      }
    }

    function verbose_warn(logMessage) {
      if (RED.settings.verbose) {
        node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaMethodNode: ' + logMessage);
      }
    }

    function verbose_log(logMessage) {
      if (RED.settings.verbose) {
        node.log(logMessage);
      }
    }

    setupClient(opcuaEndpoint.endpoint, function (err) {
      if (err) {
          node_error(err);
          node.status({
              fill: "red",
              shape: "dot",
              text: "Error Items: " + node.items.length
          });
      }
      node.log("Waiting method calls...");
    });


    node.on("input", function (msg) {
      var message = {}

      message.objectId = msg.objectId || node.objectId;
      message.methodId = msg.methodId || node.methodId;
      message.methodType = msg.methodType || node.methodType;
      message.inputArguments = msg.inputArguments || node.inputArguments;
      // message.inputArguments.push({ dataType: "String", value: "sin" });
      // message.inputArguments.push({ dataType: "Double", value: 3.3 });

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
      if (node.session) {
        message.outputArguments = null;
        verbose_log("Call method: " + JSON.stringify(message));
        node.callMethod(message)
      }
    })

    node.callMethod = async function (msg) {
      if (msg.methodId && msg.inputArguments) {
        verbose_log("Calling method: " + JSON.stringify(msg.methodId));
        verbose_log("InputArguments: " + JSON.stringify(msg.inputArguments));
        const callMethodRequest = new opcua.CallMethodRequest({
          objectId: opcua.coerceNodeId(msg.objectId),
          methodId: opcua.coerceNodeId(msg.methodId),
          inputArguments: msg.inputArguments,
          outputArguments: msg.outputArguments
        });

        verbose_log("Call request: " + callMethodRequest.toString());
        verbose_log("Calling: " + callMethodRequest);
        try {
          const result = await node.session.call(callMethodRequest);
          verbose_log("Results: " + result);
          msg.result = result;
          
          // TODO make this better, not generic solution, but result contains everything
          if (result && result.statusCode === opcua.StatusCodes.Good && result.outputArguments[0].value) {
            msg.payload = result.outputArguments[0].value; // Works only if one output argument
          }
          else {
            msg.payload = null;
          }
          node.send(msg);
        } catch (err) {
          node.error("Method execution error:" + err);
        }
      }
    }

    node.on("close", function (done) {
      if (node.session) {
        node.session.close();
        node.session = null
        done();
      } else {
        node.session = null
        done();
      }
    });

  }

  RED.nodes.registerType("OpcUa-Method", OPCUAMethodNode);
}