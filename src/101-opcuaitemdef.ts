// UaClientDef.ts
import { Node, NodeDef } from "node-red";

// export type UaItemNode = Node;
export interface UaItemNode 
    extends Node {
      item: string;
      datatype: string;
      value: string;
}

export interface UaItemDef
    extends NodeDef {
      item: string;
      datatype: string;
      value: string;
      name: string;
}
