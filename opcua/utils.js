"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserCertificateManager = exports.createCertificateManager = void 0;
const node_opcua_1 = require("node-opcua");
const path = __importStar(require("path"));
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;
let _g_certificateManager;
function createCertificateManager(autoAccept, folder) {
    if (_g_certificateManager) {
        return _g_certificateManager;
    }
    if (folder && folder.length > 0) {
        return _g_certificateManager = new node_opcua_1.OPCUACertificateManager({ rootFolder: path.join(folder, "PKI"), automaticallyAcceptUnknownCertificate: autoAccept });
    }
    else {
        return _g_certificateManager = new node_opcua_1.OPCUACertificateManager({ rootFolder: path.join(config, "PKI"), automaticallyAcceptUnknownCertificate: autoAccept });
    }
}
exports.createCertificateManager = createCertificateManager;
let _g_userCertificateManager;
function createUserCertificateManager(autoAccept, folder) {
    if (_g_userCertificateManager)
        return _g_userCertificateManager;
    if (folder && folder.length > 0) {
        return _g_userCertificateManager = new node_opcua_1.OPCUACertificateManager({
            "rootFolder": path.join(folder, "UserPKI"),
            "automaticallyAcceptUnknownCertificate": autoAccept
        });
    }
    else {
        return _g_userCertificateManager = new node_opcua_1.OPCUACertificateManager({
            "rootFolder": path.join(config, "UserPKI"),
            "automaticallyAcceptUnknownCertificate": autoAccept
        });
    }
}
exports.createUserCertificateManager = createUserCertificateManager;
//# sourceMappingURL=utils.js.map