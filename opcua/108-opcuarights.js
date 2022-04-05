/**

 Copyright 2022 Valmet Automation Inc.

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

// const { WellKnownRoles } = require("node-opcua");

/**
 * OPC UA rights node representation for Node-RED to add msg object OPC UA access rights, role and permissions
 *
 * @param RED
 */
module.exports = function (RED) {
  var opcua = require('node-opcua');
  
  function OPCUARightsNode(n) {
    RED.nodes.createNode(this, n)
    this.name = n.name;
    this.accessLevelCurrentRead = n.accessLevelCurrentRead;
    this.accessLevelCurrentWrite = n.accessLevelCurrentWrite;
    this.accessLevelStatusWrite = n.accessLevelStatusWrite;
    this.accessLevelHistoryRead = n.accessLevelHistoryRead;
    this.accessLevelHistoryWrite = n.accessLevelHistoryWrite;
    this.accessLevelSemanticChange = n.accessLevelSemanticChange;
    this.role = n.role;
    // TODO Permissions
    this.permissionBrowse = n.permissionBrowse;
    this.permissionRead = n.permissionRead;
    this.permissionWrite = n.permissionWrite;
    this.permissionWriteAttribute = n.permissionWriteAttribute;
    this.permissionReadRole = n.permissionReadRole;
    this.permissionWriteRole = n.permissionWriteRole;
    this.permissionReadHistory = n.permissionReadHistory;
    this.permissionWriteHistory = n.permissionWriteHistory;
    this.permissionInsertHistory = n.permissionInsertHistory;
    this.permissionModifyHistory = n.permissionModifyHistory;
    this.permissionDeleteHistory = n.permissionDeleteHistory;
    this.permissionReceiveEvents = n.permissionReceiveEvents;
    this.permissionCall = n.permissionCall;
    this.permissionAddReference = n.permissionAddReference;
    this.permissionRemoveReference = n.permissionRemoveReference;
    this.permissionDeleteNode = n.permissionDeleteNode;
    this.permissionAddNode = n.permissionAddNode;
    var node = this;
    
    node.debug("Node parameters: " + JSON.stringify(node));
    
    node.on("input", function (msg) {
      // This node will extend new field to msg so addVariable can set needed access level and permissions
      // From the selected values
      // TODO
      var levelString = "";
      if (node.accessLevelCurrentRead === true) levelString += "CurrentRead |";
      if (node.accessLevelCurrentWrite === true) levelString += " CurrentWrite |";
      if (node.accessLevelStatusWrite === true) levelString += " StatusWrite |";
      if (node.accessLevelHistoryRead === true) levelString += " HistoryRead |";
      if (node.accessLevelHistoryWrite === true) levelString += " HistoryWrite |";
      if (node.accessLevelSemanticChange === true) levelString += " SemanticChange";
      console.log("Access level string: " + levelString);
      var accessLevel = opcua.makeAccessLevelFlag(levelString);
      var userAccessLevel = opcua.makeAccessLevelFlag(levelString);
      // var accessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite | StatusWrite | HistoryRead | HistoryWrite | SemanticChange");
      // var userAccessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite | StatusWrite | HistoryRead | HistoryWrite | SemanticChange");
      msg.accessLevel = accessLevel;
      msg.userAccessLevel = userAccessLevel; // Uses same, TODO add option to select which one to use
      msg.accessRestrictions = opcua.AccessRestrictionsFlag.None; // TODO extend when needed
      console.log("Access level: " + msg.accessLevel + " user access level: " + msg.userAccessLevel + " restrictions: " + msg.accessRestrictions);

      // TODO node.role == "a" Anonymous etc.
      let role;
      if (node.role === "a") {
        role = opcua.WellKnownRoles.Anonymous;
      }
      if (node.role === "u") {
        role = opcua.WellKnownRoles.AuthenticatedUser;
      }
      if (node.role === "e") {
        role = opcua.WellKnownRoles.Engineer;
      }
      if (node.role === "b") {
        role = opcua.WellKnownRoles.Observer;
      }
      if (node.role === "o") {
        role = opcua.WellKnownRoles.Operator;
      }
      if (node.role === "c") {
        role = opcua.WellKnownRoles.ConfigureAdmin;
      }
      if (node.role === "s") {
        role = opcua.WellKnownRoles.SecurityAdmin;
      }
      if (node.role === "v") {
        role = opcua.WellKnownRoles.Supervisor;
      }
      console.log("Role: " + role + " selection was " + node.role);

      // Collect multiple role permissions together
      let permissionString = "";
      if (node.permissionBrowse === true) permissionString += "Browse |";
      if (node.permissionRead === true) permissionString += " Read |";
      if (node.permissionWrite === true) permissionString += " Write |";
      if (node.permissionWriteAttribute === true) permissionString += " WriteAttribute |";
      if (node.permissionReadRole === true) permissionString += " ReadRolePermissions |";
      if (node.permissionWriteRole === true) permissionString += " WriteRolePermissions |";
      if (node.permissionReadHistory === true) permissionString += " ReadHistory |";
      if (node.permissionWriteHistory === true) permissionString += " WriteHistorizing |";
      if (node.permissionInsertHistory === true) permissionString += " InsertHistory |";
      if (node.permissionModifyHistory === true) permissionString += " ModifyHistory |";
      if (node.permissionDeleteHistory === true) permissionString += " DeleteHistory |";
      if (node.permissionReceiveEvents === true) permissionString += " ReceiveEvents |";
      if (node.permissionCall === true) permissionString += " Call |";
      if (node.permissionAddReference === true) permissionString += " AddReference |";
      if (node.permissionRemoveReference === true) permissionString += " RemoveReference |";
      if (node.permissionDeleteNode === true) permissionString += " DeleteNode |";
      if (node.permissionAddNode === true) permissionString += " AddNode";
      console.log("Permission string: " + permissionString);
      const permissionFlag = opcua. makePermissionFlag(permissionString);
      console.log("Permission flag: " + permissionFlag);
      if (msg.permissions && Array.isArray(msg.permissions)) {
        var merged = msg.permissions.concat([{ roleId: role, permissions: permissionFlag }]);
        console.log("Concatenated permissions: " + JSON.stringify(merged));
        msg.permissions = merged;
        // msg.permissions.concat([{ roleId: opcua.WellKnownRoles.Anonymous, permissions: opcua.allPermissions }]);
      }
      else {
        // Current node 
        msg.permissions = [{ roleId: role, permissions: permissionFlag }];
      }
      console.log("Permissions: " + JSON.stringify(msg.permissions));
      
      node.send(msg);
    });

    node.on("close", function () {
      console.log("Closed");
    });

  }

  RED.nodes.registerType("OpcUa-Rights", OPCUARightsNode);
}