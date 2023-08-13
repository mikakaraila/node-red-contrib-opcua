// OpcuaBrowserDef.ts
import { Node, NodeDef } from "node-red";

// export type UaBrowserNode = Node;
export interface UaBrowserNode 
    extends Node {
      topic: string;
      item: string;
      datatype: string;
      /* eslint-disable-next-line */
      items: any[];
      endpoint: string;
      /* eslint-disable-next-line */
      add_item(item: any): void;
}

export interface UaBrowserDef
    extends NodeDef {
      topic: string;
      item: string;
      datatype: string;
      /* eslint-disable-next-line */
      items:any[];
      endpoint: string;
}