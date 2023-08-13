// UaServerDef.ts
import { Node, NodeDef } from "node-red";
import { OPCUAServerOptions, OPCUAServer } from "node-opcua";

// export type UaServerNode = Node;
export interface UaServerNode
    extends Node {
      name: string;
      port: string;
      endpoint: string;
      users: string;
      nodesetDir: string;
      folderName4PKI: string;
      autoAcceptUnknownCertificate: boolean;
      allowAnonymous: boolean;
      endpointNone: boolean;
      endpointSign: boolean;
      endpointSignEncrypt: boolean;
      endpointBasic128Rsa15: boolean;
      endpointBasic256: boolean;
      endpointBasic256Sha256: boolean;
      // Operating limits:
      maxNodesPerBrowse: number;
      maxNodesPerHistoryReadData: number;
      maxNodesPerHistoryReadEvents: number;
      maxNodesPerHistoryUpdateData: number;
      maxNodesPerRead: number;
      maxNodesPerWrite: number;
      maxNodesPerMethodCall: number;
      maxNodesPerRegisterNodes: number;
      maxNodesPerNodeManagement: number;
      maxMonitoredItemsPerCall: number;
      maxNodesPerHistoryUpdateEvents: number;
      maxNodesPerTranslateBrowsePathsToNodeIds: number;
      maxConnectionsPerEndpoint: number;
      maxMessageSize: number;
      maxBufferSize: number;
      registerToDiscovery: boolean;
      constructDefaultAddressSpace: boolean;
      server_options: OPCUAServerOptions;
      server: OPCUAServer;
}

export interface UaServerDef
    extends NodeDef {
      name: string;
      port: string;
      endpoint: string;
      users: string;
      nodesetDir: string;
      folderName4PKI: string;
      autoAcceptUnknownCertificate: boolean;
      allowAnonymous: boolean;
      endpointNone: boolean;
      endpointSign: boolean;
      endpointSignEncrypt: boolean;
      endpointBasic128Rsa15: boolean;
      endpointBasic256: boolean;
      endpointBasic256Sha256: boolean;
      // Operating limits:
      maxNodesPerBrowse: number;
      maxNodesPerHistoryReadData: number;
      maxNodesPerHistoryReadEvents: number;
      maxNodesPerHistoryUpdateData: number;
      maxNodesPerRead: number;
      maxNodesPerWrite: number;
      maxNodesPerMethodCall: number;
      maxNodesPerRegisterNodes: number;
      maxNodesPerNodeManagement: number;
      maxMonitoredItemsPerCall: number;
      maxNodesPerHistoryUpdateEvents: number;
      maxNodesPerTranslateBrowsePathsToNodeIds: number;
      maxConnectionsPerEndpoint: number;
      maxMessageSize: number;
      maxBufferSize: number;
      registerToDiscovery: boolean;
      constructDefaultAddressSpace: boolean;
}
