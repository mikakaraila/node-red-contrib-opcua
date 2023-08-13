// UaClientDef.ts
import { Node, NodeDef } from "node-red";

// export type UaEventNode = Node;
export interface UaEventNode
  extends Node {
    root: string;
    customeventtype: string;
    eventtype: string;
    name: string;
    activatecustomevent: string;
  }
export interface UaEventDef
    extends NodeDef {
      root: string;
      customeventtype: string;
      eventtype: string;
      name: string;
      activatecustomevent: string;
}
