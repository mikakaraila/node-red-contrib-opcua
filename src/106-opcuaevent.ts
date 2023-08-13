/**

 Copyright 2016 Valmet Automation Inc.

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

 import {
    NodeInitializer
} from "node-red";

import {
    UaEventNode,
    UaEventDef
} from "./106-opcuaeventdef";

/* eslint-disable-next-line */
const UaEvent: NodeInitializer = (RED): void => {
    function UaEventNodeConstructor(
        this: UaEventNode,
        n: UaEventDef
    ): void {
        RED.nodes.createNode(this, n);

        this.root = n.root; // OPC UA item nodeID subscription source
        this.customeventtype = n.customeventtype;
        this.eventtype = n.eventtype; // eventType
        this.name = n.name; // Node name
        this.activatecustomevent = n.activatecustomevent;

        /* eslint-disable-next-line */
        const node: UaEventNode = this;
        /* eslint-disable-next-line */
        node.on("input", function (msg: any) {
            msg.topic = node.root; // example: ns=0;i=85;
            if (node.activatecustomevent)
            {
                msg.eventTypeIds = node.customeventtype; // example: ns=2;i=1234
            } else {
                msg.eventTypeIds = node.eventtype; // example: ns=0;i=10751;
            }
            node.send(msg);
        });
    }

    RED.nodes.registerType("OpcUa-Event", UaEventNodeConstructor);
};
export = UaEvent;