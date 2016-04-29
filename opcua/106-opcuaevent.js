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

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');

    function OpcUaEventNode(n) {
        RED.nodes.createNode(this, n);
        this.root = n.root;         	// OPC UA item nodeID
        this.eventtype = n.eventtype; 	// eventType
        this.name = n.name;			    // Node name
		
        var node = this;
		
        node.on("input", function (msg) {
			//	var baseEventTypeId = "i=2041"; // BaseEventType;
			//	var serverObjectId = "i=2253";  // Server object id
			
			// All event field, perhaps selectable in UI
			var fields = [
				"EventId",
				"EventType",
				"SourceNode",
				"SourceName",
				"Time",
				"ReceiveTime",
				"Message",
				"Severity",

				// ConditionType
				"ConditionClassId",
				"ConditionClassName",
				"ConditionName",
				"BranchId",
				"Retain",
				"EnabledState",
				"Quality",
				"LastSeverity",
				"Comment",
				"ClientUserId",

				// AcknowledgeConditionType
				"AckedState",
				"ConfirmedState",

				// AlarmConditionType
				"ActiveState",
				"InputNode",
				"SuppressedState",

				"HighLimit",
				"LowLimit",
				"HighHighLimit",
				"LowLowLimit",

				"Value",
			];
			
			var eventFilter = opcua.constructEventFilter(fields);
			
			msg.topic=node.root; // "ns=0;i=85";
			msg.eventFilter = eventFilter;
			msg.eventFields = fields; // All fields
			msg.eventTypeIds = node.eventtype; // "ns=0;i=10751";
			
            node.send(msg);
        });
    }
    RED.nodes.registerType("OpcUa-Event", OpcUaEventNode);
};