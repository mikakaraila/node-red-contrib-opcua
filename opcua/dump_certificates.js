const path = require("path");
const fs = require("fs");
const { crypto_utils } = require("node-opcua");

exports.dumpCertificates = async function dumpCertificates(client) {


    try {

    const endpoints = await client.getEndpoints();
    var i = 0;
    endpoints.forEach(function (endpoint, i) {
        /*
        verbose_log("endpoint " + endpoint.endpointUrl + "");
        verbose_log("Application URI " + endpoint.server.applicationUri);
        verbose_log("Product URI " + endpoint.server.productUri);
        verbose_log("Application Name " + endpoint.server.applicationName.text);
        */
        var applicationName = endpoint.server.applicationName.text;
        if (!applicationName) {
            applicationName = "OPCUA_Server";
        }
        /*
        verbose_log("Security Mode " + endpoint.securityMode.toString());
        verbose_log("securityPolicyUri " + endpoint.securityPolicyUri);
        verbose_log("Type " + endpoint.server.applicationType);
        */
        // verbose_log("certificate " + "..." + " endpoint.serverCertificate");
        endpoint.server.discoveryUrls = endpoint.server.discoveryUrls || [];
        // verbose_log("discoveryUrls " + endpoint.server.discoveryUrls.join(" - "));
        serverCertificate = endpoint.serverCertificate;
        // Use applicationName instead of fixed server_certificate
        var certificate_filename = path.join(__dirname, "../../PKI/" + applicationName + i + ".pem");
        if (serverCertificate) {
            fs.writeFileSync(certificate_filename, crypto_utils.toPem(serverCertificate, "CERTIFICATE"));
        }
    });

    endpoints.forEach(function (endpoint) {
        // verbose_log("Identify Token for : Security Mode= " + endpoint.securityMode.toString(), " Policy=", endpoint.securityPolicyUri);
        endpoint.userIdentityTokens.forEach(function (token) {
            /*
            verbose_log("policyId " + token.policyId);
            verbose_log("tokenType " + token.tokenType.toString());
            verbose_log("issuedTokenType " + token.issuedTokenType);
            verbose_log("issuerEndpointUrl " + token.issuerEndpointUrl);
            verbose_log("securityPolicyUri " + token.securityPolicyUri);
            */
        });
    });
} catch(err) {
    console.log(err);
}
 
}
