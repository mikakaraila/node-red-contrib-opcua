import { Node,NodeDef,  NodeAPI} from "node-red";

export interface OpcUaEndpointNode  {
 endpoint: string;
 securityPolicy: string;
 securityMode: string; // 
 login: string;
 none: string;
 usercert: Boolean;
 userCertificate: string;
 userPrivatekey: string;
}
export interface OpcUaEndpointNodeConfig extends OpcUaEndpointNode, NodeDef  {
}

export interface OpcuaEndpointNode extends Node,  OpcUaEndpointNode {
}
