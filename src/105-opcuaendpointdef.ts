// UaEndpointDef.ts
import { Node, NodeDef } from "node-red";

// export type UaEndpointNode = Node;
export interface UaEndpointNode 
    extends Node {
      endpoint: string;
      securityPolicy: string;
      securityMode: string;
      login: boolean;
      none: boolean;
      usercert: boolean;
      usercertificate: string;
      userprivatekey: string;
      credentials: { user: string; password: string };
      user: string;
      password: string;
}

export interface UaEndpointDef
    extends NodeDef {
      endpoint: string;
      securityPolicy: string;
      securityMode: string;
      login: boolean;
      none: boolean;
      usercert: boolean;
      userCertificate: string;
      userPrivatekey: string;
      credentials: { user: string; password: string };
      user: string;
      password: string;
}