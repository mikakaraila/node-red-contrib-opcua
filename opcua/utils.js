
const opcua = require("node-opcua");
const path = require("path");
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;


let _g_CertificateManager = null;

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
    return createCertificateManager();
}


let _g_userCertificateManager = null;
function createUserCertificateManager() {
    if (_g_userCertificateManager) return _g_userCertificateManager;

    _g_userCertificateManager = new opcua.OPCUACertificateManager({
        name: "UserPKI",
        rootFolder: path.join(folder, "UserPKI"),
        automaticallyAcceptUnknownCertificate: true
    });
    return _g_userCertificateManager;
}


exports.createClientCertificateManager = createClientCertificateManager;
exports.createServerCertificateManager = createServerCertificateManager;
exports.createUserCertificateManager = createUserCertificateManager;
