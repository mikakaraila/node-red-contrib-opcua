/*
 Copyright 2016 Klaus Landsdorf

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

"use strict";

module.exports.get_timeUnit_name = function (unit) {

    var unitAbbreviation = '';

    switch (unit) {
        case "ms":
            unitAbbreviation = 'msec.';
            break;
        case "s":
            unitAbbreviation = 'sec.';
            break;
        case "m":
            unitAbbreviation = 'min.';
            break;
        case "h":
            unitAbbreviation = 'h.';
            break;
        default:
            break;
    }

    return unitAbbreviation;
};

module.exports.calc_milliseconds_by_time_and_unit = function (time, unit) {

    switch (unit) {
        case "ms":
            break;
        case "s":
            time = time * 1000; // seconds
            break;
        case "m":
            time = time * 60000; // minutes
            break;
        case "h":
            time = time * 3600000; // hours
            break;
        default:
            time = 10000; // 10 sec.
            break;
    }

    return time;
};

module.exports.collectAlarmFields = function (field, key, value, msg) {

    switch (field) {
        // Common fields
        case "EventId":
            msg.EventId = value;
            break;
        case "EventType":
            msg.EventType = value;
            break;
        case "SourceNode":
            msg.SourceNode = value;
            break;
        case "SourceName":
            msg.SourceName = value;
            break;
        case "Time":
            msg.Time = value;
            break;
        case "ReceiveTime":
            msg.ReceiveTime = value;
            break;
        case "Message":
            msg.Message = value.text;
            break;
        case "Severity":
            msg.Severity = value;
            break;

        // ConditionType
        case "ConditionClassId":
            msg.ConditionClassId = value;
            break;
        case "ConditionClassName":
            msg.ConditionClassNameName = value;
            break;
        case "ConditionName":
            msg.ConditionName = value;
            break;
        case "BranchId":
            msg.BranchId = value;
            break;
        case "Retain":
            msg.Retain = value;
            break;
        case "EnabledState":
            msg.EnabledState = value.text;
            break;
        case "Quality":
            msg.Quality = value;
            break;
        case "LastSeverity":
            msg.LastSeverity = value;
            break;
        case "Comment":
            msg.Comment = value.text;
            break;
        case "ClientUserId":
            msg.ClientUserId = value;
            break;

        // AcknowledgeConditionType
        case "AckedState":
            msg.AckedState = value.text;
            break;
        case "ConfirmedState":
            msg.ConfirmedState = value.text;
            break;

        // AlarmConditionType
        case "ActiveState":
            msg.ActiveState = value.text;
            break;
        case "InputNode":
            msg.InputNode = value;
            break;
        case "SupressedState":
            msg.SupressedState = value.text;
            break;

        // Limits
        case "HighHighLimit":
            msg.HighHighLimit = value;
            break;
        case "HighLimit":
            msg.HighLimit = value;
            break;
        case "LowLimit":
            msg.LowLimit = value;
            break;
        case "LowLowLimit":
            msg.LowLowLimit = value;
            break;
        case "Value":
            msg.Value = value;
            break;
        default:
            msg.error = "unknown collected Alarm field " + field;
            break;
    }

    return msg;
};


module.exports.getBasicEventFields = function () {

    return [
        // Common fields
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

        "Value"
    ];
};

/*
 Options defaults node-opcua

 options.requestedPublishingInterval = options.requestedPublishingInterval || 100;
 options.requestedLifetimeCount      = options.requestedLifetimeCount || 60;
 options.requestedMaxKeepAliveCount  = options.requestedMaxKeepAliveCount || 2;
 options.maxNotificationsPerPublish  = options.maxNotificationsPerPublish || 2;
 options.publishingEnabled           = options.publishingEnabled ? true : false;
 options.priority                    = options.priority || 1;
 */

module.exports.getEventSubscribtionParameters = function (timeMilliseconds) {
    return {
        requestedPublishingInterval: timeMilliseconds || 100,
        requestedLifetimeCount: 120,
        requestedMaxKeepAliveCount: 3,
        maxNotificationsPerPublish: 4,
        publishingEnabled: true,
        priority: 1
    };
};

module.exports.getSubscriptionParameters = function (timeMilliseconds) {
    return {
        requestedPublishingInterval: timeMilliseconds || 100,
        requestedLifetimeCount: 30,
        requestedMaxKeepAliveCount: 3,
        maxNotificationsPerPublish: 10,
        publishingEnabled: true,
        priority: 10
    }
};

module.exports.buildBrowseMessage = function (topic) {
    return {
        "topic": topic,
        "nodeId": "",
        "browseName": "",
        "nodeClassType": "",
        "typeDefinition": "",
        "payload": ""
    };
};

module.exports.toInt32 = function (x) {
    var uint16 = x;

    if (uint16 >= Math.pow(2, 15)) {
        uint16 = x - Math.pow(2, 16);
        return uint16;
    }
    else {
        return uint16;
    }
};

module.exports.get_node_status = function (statusValue) {

    var fillValue = "red";
    var shapeValue = "dot";

    switch (statusValue) {

        case "create client":
        case "connecting":
        case "connected":
        case "initialized":
        case "keepalive":
            fillValue = "green";
            shapeValue = "ring";
            break;

        case "active":
        case "active reading":
        case "active writing":
        case "active subscribing":
        case "active subscribed":
        case "active browsing":
        case "active alarm":
        case "active event":
        case "session active":
        case "subscribed":
        case "browse done":
        case "changed":
            fillValue = "green";
            shapeValue = "dot";
            break;

        case "disconnected":
        case "terminated":
            fillValue = "red";
            shapeValue = "ring";
            break;

        default:
            if (!statusValue) {
                fillValue = "blue";
                statusValue = "waiting ...";
            }
            break;
    }

    return { fill: fillValue, shape: shapeValue, status: statusValue };
};


module.exports.build_new_variant = function (opcua, datatype, value) {

    var nValue = new opcua.Variant({ dataType: opcua.DataType.Float, value: 0.0 });

    switch (datatype) {
        case "Float":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Float, value: parseFloat(value) });
            break;
        case "Double":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Double, value: parseFloat(value) });
            break;
        case "Int32":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Int32, value: parseInt(value) });
            break;
        case "Int16":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Int16, value: parseInt(value) });
            break;
        case "Int8":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Int8, value: parseInt(value) });
            break;
        case "UInt32":
            nValue = new opcua.Variant({ dataType: opcua.DataType.UInt32, value: parseInt(value) });
            break;
        case "UInt16":
            nValue = new opcua.Variant({ dataType: opcua.DataType.UInt16, value: parseInt(value) });
            break;
        case "UInt8":
            nValue = new opcua.Variant({ dataType: opcua.DataType.UInt8, value: parseInt(value) });
            break;
        case "Boolean":
            if (value && value !== "false") {
                nValue = new opcua.Variant({ dataType: opcua.DataType.Boolean, value: true });
            }
            else {
                nValue = new opcua.Variant({ dataType: opcua.DataType.Boolean, value: false });
            }
            break;
        case "String":
            nValue = new opcua.Variant({ dataType: opcua.DataType.String, value: value });
            break;
        case "Byte":
            nValue = new opcua.Variant({ dataType: opcua.DataType.Byte, value: value });
            break;
        default:
            nValue = new opcua.Variant({ dataType: opcua.DataType.BaseDataType, value: value });
            break;
    }

    return nValue;
};


module.exports.build_new_value_by_datatype = function (datatype, value) {

    var nValue = 0;

    switch (datatype) {
        case "Float":
            nValue = parseFloat(value);
            break;
        case "Double":
            nValue = parseFloat(value); // (Double) or Float64 ?
            break;
        case "Int8":
            var int8 = new Int8Array([value]);
            nValue = int8[0];
            break;
        case "Int16":
            var int16 = new Int16Array([value]);
            nValue = int16[0];
            break;
        case "Int32":
            var int32 = new Int32Array([value]);
            nValue = int32[0];
            break;
        case "UInt8":
            var uint8 = new Uint8Array([value]);
            nValue = uint8[0];
            break;
        case "UInt16":
            var uint16 = new Uint16Array([value]);
            nValue = uint16[0];
            break;
        case "UInt32":
            var uint32 = new Uint32Array([value]);
            nValue = uint32[0];
            break;
        case "Boolean":
            if (value && value !== "false") {
                nValue = true;
            }
            else {
                nValue = false;
            }
            break;
        case "String":
            nValue = value.toString();
            break;
        default:
            nValue = value;
            break;
    }

    return nValue;
};