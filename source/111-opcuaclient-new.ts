import { NodeAPI, Node, NodeDef } from "node-red";
import { AttributeIds } from "node-opcua-client";
import { get_opcua_endpoint } from "./tools/connection_tools";
import { OpcuaEndpointNode } from "node-red-contrib-opcua/source/tools/IEndpoint";

interface IOpcUaClientNode extends Node {

}
interface OpcUaClientNodeConfig extends NodeDef {
  action: string;
  endpointId: string;
}

export default function (RED: NodeAPI) {

  RED.nodes.registerType("OpcUa-Client2", function (this: IOpcUaClientNode, config: OpcUaClientNodeConfig) {
    console.log("Constructing new node => " + JSON.stringify(config));
    RED.nodes.createNode(this, config);



    async function performInput(node: IOpcUaClientNode, msg: any, send: (msg: any) => void) {

      const opcuaEndpoint = RED.nodes.getNode(config.endpointId) as OpcuaEndpointNode;
      
      node.warn(" => " + "<<=" + config.endpointId + " = " + JSON.stringify(opcuaEndpoint));

      const connection = await get_opcua_endpoint(opcuaEndpoint);
      if (!connection) {
        return;
      }
      const session = connection.session;

      const dataValue = await session.read({
        nodeId: msg.payload,
        attributeId: AttributeIds.Value
      });
      send({ payload: dataValue.toString() });
      // const session = opcuaEndpoint.acquireSession();

      node.warn("TOTO" + JSON.stringify(msg) + JSON.stringify(node));

      node.warn("TOTO" + JSON.stringify(opcuaEndpoint));

      // sen>d({ payload: "TOTO" });
      //    switch (this.action) {
      //       case "read":
      //         break;
      //       default: // All other actions
      //         this.verbose_warn("Unknown action: " + node.action + " with msg " + stringify(msg));
      //         break;
      //     }
    }

    this.on("input", (msg, send, done) => {
      performInput(this, msg, send).then(() => {
        done();
      }).catch((err) => {
        this.error("Error: " + err.message);
      });

    });
    this.on("close", () => {
    });

  });

};
