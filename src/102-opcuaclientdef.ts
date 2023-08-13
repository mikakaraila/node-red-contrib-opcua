// UaClientDef.ts
import { Node, NodeDef } from "node-red";
import { OPCUAClient, ClientSession } from "node-opcua-client";

// export type UaClientNode = Node;
export interface UaClientNode 
    extends Node {
      client: OPCUAClient;
      session: ClientSession;
      action: string;
      time: number;
      timeUnit: string;
      securityPolicy: string;
      securityMode: string;
      deadbandType: string;
      deadbandValue: number;
}

export interface UaClientDef
    extends NodeDef {
      topic: string;
      action: string;
      time: number;
      timeUnit: string;
      deadbandtype: string;
      deadbandvalue: number;
      certificate: string;
      localfile: string;
      localkeyfile: string;
      endpoint: string;
      connectionOptioconfig: string;
      folderName4PKI: string;
      useTransport: boolean;
      maxChunkCount: number;
      maxMessageSize: number;
      receiveBufferSize: number;
      sendBufferSize: number;
}