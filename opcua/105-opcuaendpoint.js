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

        this.endpoint = n.endpoint;
        this.securityPolicy = opcua.SecurityPolicy[n.secpolicy] || opcua.SecurityPolicy.None;
        this.securityMode = opcua.MessageSecurityMode[n.secmode] || opcua.MessageSecurityMode.NONE;
        this.login = n.login;

        if (this.credentials) {
            this.user = this.credentials.user;
            this.password = this.credentials.password;
        }
    }

    RED.nodes.registerType("OpcUa-Endpoint", OpcUaEndpointNode, {

        credentials: {
            user: {type: "text"},
            password: {type: "password"}
        }
    });

};
