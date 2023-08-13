
import { OPCUACertificateManager } from "node-opcua";
import * as path from "path";
import envPaths = require("env-paths");

const config = envPaths("node-red-opcua").config;

let _g_certificateManager: OPCUACertificateManager;

export function createCertificateManager(autoAccept: boolean, folder: string) {
    if (_g_certificateManager) {
        return _g_certificateManager;
    }
    if (folder && folder.length > 0) {
        return _g_certificateManager = new OPCUACertificateManager({rootFolder: path.join(folder, "PKI"), automaticallyAcceptUnknownCertificate: autoAccept});
    }
    else {
        return _g_certificateManager = new OPCUACertificateManager({rootFolder: path.join(config, "PKI"), automaticallyAcceptUnknownCertificate: autoAccept});
    }
}

let _g_userCertificateManager: OPCUACertificateManager;
export function createUserCertificateManager(autoAccept: boolean, folder: string) {
    if (_g_userCertificateManager) 
     return _g_userCertificateManager;

    if (folder && folder.length > 0) {
        return _g_userCertificateManager = new OPCUACertificateManager({
            "rootFolder": path.join(folder, "UserPKI"),
            "automaticallyAcceptUnknownCertificate": autoAccept
        });
    }
    else {
        return _g_userCertificateManager = new OPCUACertificateManager({
            "rootFolder": path.join(config, "UserPKI"),
            "automaticallyAcceptUnknownCertificate": autoAccept
        });
    }
}
