
const opcua = require("node-opcua");
const path = require("path");
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;


let _g_clientCertificateManager = null;

function createClientCertificateManager(autoAccept, folderName) {
    return createCertificateManager(false, autoAccept, folderName);
}

function createServerCertificateManager(autoAccept, folderName) {
    return createCertificateManager(true, autoAccept, folderName);
}

function createCertificateManager(isServer, autoAccept, folderName) {
    if (folderName && folderName.length > 0) {
        if (path.isAbsolute(folderName)) {
            folder = folderName;
        }
        else {
            folder = config.replace("Config", folderName);
        }
        return new opcua.OPCUACertificateManager({
            name: "PKI",
            rootFolder: path.join(folder, "PKI"),
            automaticallyAcceptUnknownCertificate: autoAccept
        });
    }
    else {
        folder = config;
        if (isServer) {
            return new opcua.OPCUACertificateManager({
                name: "PKI",
                rootFolder: path.join(folder, "PKI"),
                automaticallyAcceptUnknownCertificate: autoAccept
            });
        } else if (_g_clientCertificateManager){
            return _g_clientCertificateManager;
        } else {
            return _g_clientCertificateManager = new opcua.OPCUACertificateManager({
                name: "PKI",
                rootFolder: path.join(folder, "PKI"),
                automaticallyAcceptUnknownCertificate: autoAccept
            });
        }
    }
}

let _g_userCertificateManager = null;
function createUserCertificateManager(autoAccept, folderName) {
     if (folderName && folderName.length > 0) {
        if (path.isAbsolute(folderName)) {
            folder = folderName;
        }
        else {
            folder = config.replace("Config", folderName);
        }
        return new opcua.OPCUACertificateManager({
            name: "PKI",
            rootFolder: path.join(folder, "PKI"),
            automaticallyAcceptUnknownCertificate: autoAccept
        });
    }
    else {
        folder = config;
        if (_g_userCertificateManager)
         return _g_userCertificateManager;
    }
    return _g_userCertificateManager = new opcua.OPCUACertificateManager({
        name: "UserPKI",
        rootFolder: path.join(config, "UserPKI"),
        automaticallyAcceptUnknownCertificate: autoAccept
    });
}

exports.createClientCertificateManager = createClientCertificateManager;
exports.createServerCertificateManager = createServerCertificateManager;
exports.createUserCertificateManager = createUserCertificateManager;
