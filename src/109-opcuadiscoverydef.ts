// UaMethodDef.ts
import { Node, NodeDef } from "node-red";

// export type UaDiscoveryNode = Node;
export interface UaDiscoveryNode
  extends Node {
    name: string;
  }
export interface UaDiscoveryDef
    extends NodeDef {
      objectId: string;
      methodId: string;
      datatype: string;
      arg0type: string;
      arg0value: string;
      arg0typeid: string;
      arg1type: string;
      arg1value: string;
      arg1typeid: string;
      arg2type: string;
      arg2value: string;
      arg2typeid: string;
      out0type: string;
      out0value: string;
      out0typeid: string;
      inputArguments:[];
      outputArguments:[];
      endpoint: string;
}