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

import {
  NodeInitializer
} from "node-red";

import {
  UaRightsNode,
  UaRightsDef
} from "./108-opcuarightsdef";

import { makePermissionFlag, makeAccessLevelFlag, AccessRestrictionsFlag, WellKnownRoles } from "node-opcua";

/**
 * OPC UA rights node representation for Node-RED to add msg object OPC UA access rights, role and permissions
 *
 * @param RED
 */

/* eslint-disable-next-line */
const UaRights: NodeInitializer = (RED): void => {
  function UaRIghtsNodeConstructor(
    this: UaRightsNode,
    n: UaRightsDef
  ): void {
    RED.nodes.createNode(this, n);
    this.name = n.name;
    this.accessLevelCurrentRead = n.accessLevelCurrentRead;
    this.accessLevelCurrentWrite = n.accessLevelCurrentWrite;
    this.accessLevelStatusWrite = n.accessLevelStatusWrite;
    this.accessLevelHistoryRead = n.accessLevelHistoryRead;
    this.accessLevelHistoryWrite = n.accessLevelHistoryWrite;
    this.accessLevelSemanticChange = n.accessLevelSemanticChange;
    this.role = n.role;
    // Permissions
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
    
    /* eslint-disable-next-line */
    const node:any = this;
    
    node.debug("Node parameters: " + JSON.stringify(node));
    
    node.on("input", function (msg) {
      // This node will extend new field to msg so addVariable can set needed access level and permissions
      // From the selected values
      let levelString = "";
      if (n.accessLevelCurrentRead === true) levelString += "CurrentRead |";
      if (n.accessLevelCurrentWrite === true) levelString += " CurrentWrite |";
      if (n.accessLevelStatusWrite === true) levelString += " StatusWrite |";
      if (n.accessLevelHistoryRead === true) levelString += " HistoryRead |";
      if (n.accessLevelHistoryWrite === true) levelString += " HistoryWrite |";
      if (n.accessLevelSemanticChange === true) levelString += " SemanticChange";
      console.log("Access level string: " + levelString);
      const accessLevel = makeAccessLevelFlag(levelString);
      const userAccessLevel = makeAccessLevelFlag(levelString);
      // var accessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite | StatusWrite | HistoryRead | HistoryWrite | SemanticChange");
      // var userAccessLevel = opcua.makeAccessLevelFlag("CurrentRead | CurrentWrite | StatusWrite | HistoryRead | HistoryWrite | SemanticChange");
      msg["accessLevel"] = accessLevel;
      msg["userAccessLevel"] = userAccessLevel; // Uses same, TODO add option to select which one to use
      msg["accessRestrictions"] = AccessRestrictionsFlag.None; // TODO extend when needed
      console.log("Access level: " + msg["accessLevel"] + " user access level: " + msg["userAccessLevel"] + " restrictions: " + msg["accessRestrictions"]);

      // TODO node.role == "a" Anonymous etc.
      let role;
      if (node["role"] === "a") {
        role = WellKnownRoles.Anonymous;
      }
      if (node["role"] === "u") {
        role = WellKnownRoles.AuthenticatedUser;
      }
      if (node["role"] === "e") {
        role = WellKnownRoles.Engineer;
      }
      if (node["role"] === "b") {
        role = WellKnownRoles.Observer;
      }
      if (node["role"] === "o") {
        role = WellKnownRoles.Operator;
      }
      if (node["role"] === "c") {
        role = WellKnownRoles.ConfigureAdmin;
      }
      if (node["role"] === "s") {
        role = WellKnownRoles.SecurityAdmin;
      }
      if (node["role"] === "v") {
        role = WellKnownRoles.Supervisor;
      }
      console.log("Role: " + role + " selection was " + node["role"]);

      // Collect multiple role permissions together
      let permissionString = "";
      if (n.permissionBrowse === true) permissionString += "Browse |";
      if (n.permissionRead === true) permissionString += " Read |";
      if (n.permissionWrite === true) permissionString += " Write |";
      if (n.permissionWriteAttribute === true) permissionString += " WriteAttribute |";
      if (n.permissionReadRole === true) permissionString += " ReadRolePermissions |";
      if (n.permissionWriteRole === true) permissionString += " WriteRolePermissions |";
      if (n.permissionReadHistory === true) permissionString += " ReadHistory |";
      if (n.permissionWriteHistory === true) permissionString += " WriteHistorizing |";
      if (n.permissionInsertHistory === true) permissionString += " InsertHistory |";
      if (n.permissionModifyHistory === true) permissionString += " ModifyHistory |";
      if (n.permissionDeleteHistory === true) permissionString += " DeleteHistory |";
      if (n.permissionReceiveEvents === true) permissionString += " ReceiveEvents |";
      if (n.permissionCall === true) permissionString += " Call |";
      if (n.permissionAddReference === true) permissionString += " AddReference |";
      if (n.permissionRemoveReference === true) permissionString += " RemoveReference |";
      if (n.permissionDeleteNode === true) permissionString += " DeleteNode |";
      if (n.permissionAddNode === true) permissionString += " AddNode";
      console.log("Permission string: " + permissionString);
      const permissionFlag = makePermissionFlag(permissionString);
      console.log("Permission flag: " + permissionFlag);
      if (msg["permissions"] && Array.isArray(msg["permissions"])) {
        const merged = msg["permissions"].concat([{ roleId: role, permissions: permissionFlag }]);
        console.log("Concatenated permissions: " + JSON.stringify(merged));
        msg["permissions"] = merged;
        // msg.permissions.concat([{ roleId: opcua.WellKnownRoles.Anonymous, permissions: opcua.allPermissions }]);
      }
      else {
        // Current node 
        msg["permissions"] = [{ roleId: role, permissions: permissionFlag }];
      }
      console.log("Permissions: " + JSON.stringify(msg["permissions"]));
      
      node.send(msg);
    });

    node.on("close", function () {
      console.log("Closed");
    });

  }

  RED.nodes.registerType("OpcUa-Rights", UaRIghtsNodeConstructor);
}
export = UaRights;