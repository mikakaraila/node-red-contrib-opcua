
const opcua = require("node-opcua");
const path = require("path");
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;


let _g_certificateManager = null;
function createCertificateManager(autoAccept) {
    if (_g_certificateManager) {
        return _g_certificateManager;
    }
    return _g_certificateManager = new opcua.OPCUACertificateManager({
        name: "PKI",
        rootFolder: path.join(config, "PKI"),
        automaticallyAcceptUnknownCertificate: autoAccept
    });
}
let _g_userCertificateManager = null;
function createUserCertificateManager(autoAccept) {
    if (_g_userCertificateManager) 
     return _g_userCertificateManager;

    return _g_userCertificateManager = new opcua.OPCUACertificateManager({
        name: "UserPKI",
        rootFolder: path.join(config, "UserPKI"),
        automaticallyAcceptUnknownCertificate: autoAccept
    });
}

exports.createCertificateManager = createCertificateManager;
exports.createUserCertificateManager = createUserCertificateManager;
