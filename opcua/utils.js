const opcua = require("node-opcua");
const crypto_utils = require("node-opcua-crypto");
const path = require("path");
const envPaths = require("env-paths");
const config = envPaths("node-red-opcua").config;

const { split_der } = crypto_utils;
const StatusCodes = opcua.StatusCodes;

// Verification outcomes that must not block a connection to a PLC / edge
// device. These are exactly the situations where node-opcua would otherwise
// demand operator intervention (install an issuer CA, install a CRL, or
// click "Trust") before the connection can be established.
const AUTO_ACCEPTABLE_STATUSES = new Set([
    "BadCertificateUntrusted",
    "BadCertificateChainIncomplete",
    "BadCertificateRevocationUnknown",
    "BadCertificateIssuerRevocationUnknown"
]);

/**
 * Permissive OPC UA certificate manager used on the client side.
 *
 * node-opcua's OPCUACertificateManager only auto-accepts a certificate that
 * comes back as `BadCertificateUntrusted`. Two other verification outcomes
 * are still fatal even with `automaticallyAcceptUnknownCertificate: true`:
 *
 *   - `BadCertificateChainIncomplete`:
 *     the issuer CA is not present in the PKI store (the operator would have
 *     to install the issuer CA).
 *   - `BadCertificateRevocationUnknown` / `BadCertificateIssuerRevocationUnknown`:
 *     no CRL is available to prove the certificate has not been revoked (the
 *     operator would have to install a signed CRL).
 *
 * PLCs and edge devices very often ship with exactly such certificates, and
 * their operators have no way (or no desire) to manage a PKI. To make those
 * connections work out of the box - no certificate import, no CRL handling,
 * no "Trust" click, no Node-RED restart - this manager extends the automatic
 * acceptance to the statuses above and tells the underlying verifier to
 * ignore a missing revocation list.
 *
 * A certificate that is genuinely *revoked* (`BadCertificateRevoked`) is
 * still rejected: ignoring a missing CRL is not the same as ignoring a
 * positive revocation.
 */
class PermissiveOPCUACertificateManager extends opcua.OPCUACertificateManager {
    checkCertificate(certificateChain, callback) {
        if (typeof callback === "function") {
            return this.#checkCertificate(certificateChain)
                .then((statusCode) => callback(null, statusCode))
                .catch((err) => callback(err));
        }
        return this.#checkCertificate(certificateChain);
    }

    async #checkCertificate(certificateChain) {
        // ignoreMissingRevocationList: a missing CRL must not be fatal; a
        // published CRL still reports a positive revocation.
        const status = await this.verifyCertificate(certificateChain, {
            ignoreMissingRevocationList: true
        });
        const statusCode = StatusCodes[status];
        if (AUTO_ACCEPTABLE_STATUSES.has(status) && this.automaticallyAcceptUnknownCertificate) {
            const certificates = split_der(certificateChain);
            const topCertificateInChain = certificates[0];
            await this.trustCertificate(topCertificateInChain);
            return StatusCodes.Good;
        }
        return statusCode;
    }
}

let _g_CertificateManager = null; // For all clients

function createCertificateManager() {
    if (_g_CertificateManager) return _g_CertificateManager;
    let folder = config;
    _g_CertificateManager = new PermissiveOPCUACertificateManager({
        name: "PKI",
        rootFolder: path.join(folder, "PKI"),
        automaticallyAcceptUnknownCertificate: true
    });
    return _g_CertificateManager;
}

function createClientCertificateManager() {
    return createCertificateManager();
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
exports.PermissiveOPCUACertificateManager = PermissiveOPCUACertificateManager;
