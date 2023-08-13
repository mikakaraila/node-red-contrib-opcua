// UaMethodDef.ts
import { Node, NodeDef } from "node-red";

// export type UaRightsNode = Node;
export interface UaRightsNode
  extends Node {
    accessLevelCurrentRead: boolean;
    accessLevelCurrentWrite: boolean;
    accessLevelStatusWrite: boolean;
    accessLevelHistoryRead: boolean;
    accessLevelHistoryWrite: boolean;
    accessLevelSemanticChange: boolean;
    role: string;
    // Permissions
    permissionBrowse: boolean;
    permissionRead: boolean;
    permissionWrite: boolean;
    permissionWriteAttribute: boolean;
    permissionReadRole: boolean;
    permissionWriteRole: boolean;
    permissionReadHistory: boolean;
    permissionWriteHistory: boolean;
    permissionInsertHistory: boolean;
    permissionModifyHistory: boolean;
    permissionDeleteHistory: boolean;
    permissionReceiveEvents: boolean;
    permissionCall: boolean;
    permissionAddReference: boolean;
    permissionRemoveReference: boolean;
    permissionDeleteNode: boolean;
    permissionAddNode: boolean;
  }

export interface UaRightsDef
    extends NodeDef {
      accessLevelCurrentRead: boolean;
      accessLevelCurrentWrite: boolean;
      accessLevelStatusWrite: boolean;
      accessLevelHistoryRead: boolean;
      accessLevelHistoryWrite: boolean;
      accessLevelSemanticChange: boolean;
      role: string;
      // TODO Permissions
      permissionBrowse: boolean;
      permissionRead: boolean;
      permissionWrite: boolean;
      permissionWriteAttribute: boolean;
      permissionReadRole: boolean;
      permissionWriteRole: boolean;
      permissionReadHistory: boolean;
      permissionWriteHistory: boolean;
      permissionInsertHistory: boolean;
      permissionModifyHistory: boolean;
      permissionDeleteHistory: boolean;
      permissionReceiveEvents: boolean;
      permissionCall: boolean;
      permissionAddReference: boolean;
      permissionRemoveReference: boolean;
      permissionDeleteNode: boolean;
      permissionAddNode: boolean;
}