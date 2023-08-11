import { Node,NodeDef,  NodeAPI} from "node-red";
import { OpcUaEndpointNodeConfig, OpcuaEndpointNode } from "./tools/IEndpoint";
import { close_connection } from "./tools/connection_tools";


const security_mode_map_compat = {
    "NONE": "None",
    "None": "None",
    "SIGN": "Sign",
    "Sign": "Sign",
    "SIGNANDENCRYPT": "SignAndEncrypt",
    "SignAndEncrypt": "SignAndEncrypt"
};


export default function(RED: NodeAPI) {
    
    RED.nodes.registerType("OpcUa-Endpoint-2", function (this: OpcuaEndpointNode, config: OpcUaEndpointNodeConfig) {
        RED.nodes.createNode(this, config);
        this.endpoint = config.endpoint;
        this.securityPolicy = config.securityPolicy;
        this.securityMode = config.securityMode;
        this.login = config.login;
        this.none = config.none;
        this.usercert = config.usercert;
        this.userCertificate = config.userCertificate;
        this.userPrivatekey = config.userPrivatekey;

        this.on("close", () => {
            close_connection(this).then(() => {
            })
        });
    });
};

