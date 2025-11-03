
const opcua = require("node-opcua");
const path = require("path");
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;


let _g_CertificateManager = null; // For all clients

function createCertificateManager() {
    if (_g_CertificateManager) return _g_CertificateManager;
    let folder = config;
    _g_CertificateManager = new opcua.OPCUACertificateManager({
        name: "PKI",
        rootFolder: path.join(folder, "PKI"),
        automaticallyAcceptUnknownCertificate: true
    });
    return _g_CertificateManager;
}

function createClientCertificateManager() {
    return createCertificateManager();
}

function createServerCertificateManager() {
    return createServerCertificateManager();
}


let _g_userCertificateManager = null;
function createUserCertificateManager() {
    if (_g_userCertificateManager) return _g_userCertificateManager;
    let folder = config;
    _g_userCertificateManager = new opcua.OPCUACertificateManager({
        name: "UserPKI",
        rootFolder: path.join(folder, "UserPKI"),
        automaticallyAcceptUnknownCertificate: true
    });
    return _g_userCertificateManager;
}

let _g_ServerCertificateManager = null; // For all servers
function createServerCertificateManager(autoAcceptUnknownCertificate = true) {
    if (_g_ServerCertificateManager) return _g_ServerCertificateManager;
    let folder = config;
    _g_ServerCertificateManager = new opcua.OPCUACertificateManager({
        name: "ServerPKI",
        rootFolder: path.join(folder, "ServerPKI"),
        automaticallyAcceptUnknownCertificate: autoAcceptUnknownCertificate
    });
    return _g_ServerCertificateManager;
}
exports.createClientCertificateManager = createClientCertificateManager;
exports.createServerCertificateManager = createServerCertificateManager;
exports.createUserCertificateManager = createUserCertificateManager;
