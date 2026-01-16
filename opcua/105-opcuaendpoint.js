/**

 Copyright 2015 Valmet Automation Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

module.exports = function (RED) {
    "use strict";

    function OpcUaEndpointNode(n) {

        RED.nodes.createNode(this, n);

		// Used to translate node-opcua old (v0.x.x) secmode strings to new (v2.x.x) secmode strings
		const security_mode_map_compat = {
			"NONE": "None",
			"None": "None",
			"SIGN": "Sign",
			"Sign": "Sign",
			"SIGNANDENCRYPT": "SignAndEncrypt",
			"SignAndEncrypt": "SignAndEncrypt"
		};		
        this.name = n.name; // Added, issue #842
        this.endpoint = n.endpoint;
        this.securityPolicy = n.secpol;
        this.securityMode = security_mode_map_compat[n.secmode];
        this.login = n.login;
        this.none = n.none;
        this.usercert = n.usercert;
        this.userCertificate = n.usercertificate;
        this.userPrivatekey = n.userprivatekey;
        
        if (this.credentials) {
			// from node-opcua version 2.0.0 and onwards empty strings are not allowed anymore, so use null instead
            this.user = this.credentials.user && this.credentials.user.length > 0 ? this.credentials.user : null;
            this.password = this.credentials.password && this.credentials.password.length > 0 ? this.credentials.password : null;
        }
    }

    RED.nodes.registerType("OpcUa-Endpoint", OpcUaEndpointNode, {

        credentials: {
            user: {
                type: "text"
            },
            password: {
                type: "password"
            }
        }
    });

};
