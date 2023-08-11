
import { ClientSession, IBasicSession, OPCUAClient } from "node-opcua-client";
import chalk from "chalk";
import { OpcuaEndpointNode } from "./IEndpoint";

interface INodeRedOPUCAEndpoint {
    endpoint: string;
    connectionOption: any;
    useTransport: boolean;
    transportSettings?: any;
}

interface Connection {
    client: OPCUAClient;
    session: ClientSession;
}
const connections: Map<string, Connection> = new Map();
export  async function get_opcua_endpoint(endpoint: OpcuaEndpointNode): Promise<Connection| null> {

    console.log("QQQ=",endpoint);
    if (!endpoint) return null;
    
    let connection = connections.get(endpoint.id);
    if(connection) {
      return connection;
    }
    // 
    const client=  OPCUAClient.create({
        endpointMustExist: false,
    });
    client.on("backoff", (attempt, delay) => {
    });
    client.on("connection_reestablished", () => {
    });
    client.on("start_reconnection", () => {
    });
    client.on("close", () => {
    });
    try {
    await client.connect(endpoint.endpoint);
    const session = await client.createSession();

    connection = {
        client,
        session
    };
    connections.set(endpoint.id, connection);
    return connection;
    }
    catch(err) {
        console.log(err);
        throw err;
        return null;
    }
}
export  async function close_connection(node: OpcuaEndpointNode) {
    let connection = connections.get(node.id);
    if(connection) {
      await connection.session.close();
      await connection.client.disconnect();
      connections.delete(node.id);
    }
}


// export function create_opcua_client(
    
//     {node, opcuaEndpoint, set_node_status_to
// }: ICreateOPCUAClientOption, callback:()=>void) {

//     const { connectionOption, useTransport, verbose_log, node_error} = opcuaEndpoint.connectionOption;
//     node.client = null;
//     // verbose_log("Create Client: " + stringify(connectionOption).substring(0,75) + "...");
//     try {
//         // Use empty 0.0.0.0 address as "no client" initial value
//         if (opcuaEndpoint.endpoint.indexOf("opc.tcp://0.0.0.0") == 0) {
//             node.items = [];
//             set_node_status_to("no client");
//             if (callback) {
//                 callback();
//             }
//             return;
//         }
//         // Normal client
//         // verbose_log(chalk.green("1) CREATE CLIENT: ") + chalk.cyan(stringify(connectionOption))); // .substring(0,75) + "..."));
//         let options = {
//             securityMode: connectionOption.securityMode,
//             securityPolicy: connectionOption.securityPolicy,
//             defaultSecureTokenLifetime: connectionOption.defaultSecureTokenLifetime,
//             endpointMustExist: connectionOption.endpointMustExist,
//             connectionStrategy: connectionOption.connectionStrategy,
//             keepSessionAlive: true, // TODO later make it possible to disable
//             requestedSessionTimeout: 60000 * 5, // 5min, default 1min
//             transportSettings: useTransport ? connectionOption.transportSettings : undefined,
//         };
//         verbose_log(chalk.green("1) CREATE CLIENT: ") + chalk.cyan(stringify(options)));
//         // node.client = opcua.OPCUAClient.create(connectionOption); // Something extra?
//         node.client = OPCUAClient.create(options);
//         node.client.on("connection_reestablished", reestablish);
//         node.client.on("backoff", backoff);
//         node.client.on("start_reconnection", reconnection);
//     }
//     catch (err) {
//         node_error("Cannot create client, check connection options: " + stringify(options)); // connectionOption
//     }
//     items = [];
//     node.items = items;
//     set_node_status_to("create client");
//     if (callback) {
//         callback();
//     }
// }

// export function reset_opcua_client(callback: ()=>void) {
//     if (node.client) {
//         node.client.disconnect(function() {
//             verbose_log("Client disconnected!");
//             create_opcua_client(callback);
//         });
//     }
// }

// /*    // Listener functions that can be removed on reconnect
//     const reestablish = function () {
//       // verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! Node: " + node.name);
//       set_node_status2_to("connected", "re-established");
//     };
//     const backoff = function (attempt, delay) {
//       // verbose_warn("backoff  attempt #" + attempt + " retrying in " + delay / 1000.0 + " seconds. Node:  " + node.name + " " + opcuaEndpoint.endpoint);
//       var msg = {};
//       msg.error = {};
//       msg.error.message = "reconnect";
//       msg.error.source = this;
//       node.error("reconnect", msg);
//       set_node_status2_to("reconnect", "attempt #" + attempt + " retry in " + delay / 1000.0 + " sec");
//     };
//     const reconnection = function () {
//       // verbose_warn(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting Reconnection !!!!!!!!!!!!!!!!!!! Node: " + node.name);
//       set_node_status2_to("reconnect", "starting...");
//     };
// */

// export function close_opcua_client(node: any, message: string, error: Error) {
//     if (node.client) {
//         node.client.removeListener("connection_reestablished", reestablish);
//         node.client.removeListener("backoff", backoff);
//         node.client.removeListener("start_reconnection", reconnection);
//         try {
//             if (!node.client.isReconnecting) {
//                 node.client.disconnect(function() {
//                     node.client = null;
//                     verbose_log("Client disconnected!");
//                     if (error === 0) {
//                         set_node_status_to("closed");
//                     }
//                     else {
//                         set_node_errorstatus_to(message, error)
//                         node.error("Client disconnected & closed: " + message + " error: " + error.toString());
//                     }
//                 });
//             }
//             else {
//                 node.client = null;
//                 set_node_status_to("closed");
//             }
//         }
//         catch (err) {
//             node_error("Error on disconnect: " + stringify(err));
//         }
//     }
// }
