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
const { stringify } = require('flatted');
var opcua = require('node-opcua');

const typedArrays = {
    SByte: Int8Array,
    Byte: Uint8Array,
    Int8: Int8Array,
    UInt8: Uint8Array,
    Int16: Int16Array,
    Int32: Int32Array,
    UInt16: Uint16Array,
    UInt32: Uint32Array,
    Float: Float32Array,
    Double: Float64Array
};

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

module.exports.getEventSubscriptionParameters = function (timeMilliseconds) {
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
    } else {
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
        case "nodeId stored":
        case "clear items":
            fillValue = "green";
            shapeValue = "ring";
            break;

        case "active":
        case "active reading":
        case "value written":
        case "active multiple reading":
        case "active writing":
        case "writing":
        case "active subscribing":
        case "active subscribed":
        case "active browsing":
        case "active monitoring":
        case "active alarm":
        case "active event":
        case "session active":
        case "subscribed":
        case "browse done":
        case "changed":
            fillValue = "green";
            shapeValue = "dot";
            break;
        case "error":
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

    return {
        fill: fillValue,
        shape: shapeValue,
        status: statusValue
    };
};


module.exports.build_new_variant = function (opcua, datatype, value) {

    var nValue = new opcua.Variant({
        dataType: opcua.DataType.Float,
        value: 0.0
    });

    switch (datatype) {
        case "Float":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Float,
                value: parseFloat(value)
            });
            break;
        case "Double":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Double,
                value: parseFloat(value)
            });
            break;
        case "Int32":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Int32,
                value: parseInt(value)
            });
            break;
        case "Int16":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Int16,
                value: parseInt(value)
            });
            break;
        case "Int8":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.SByte,
                value: parseInt(value)
            });
            break;
        case "UInt32":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.UInt32,
                value: parseInt(value)
            });
            break;
        case "UInt16":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.UInt16,
                value: parseInt(value)
            });
            break;
        case "UInt8":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Byte,
                value: parseInt(value)
            });
            break;
        case "Boolean":
            if (value && value !== "false") {
                nValue = new opcua.Variant({
                    dataType: opcua.DataType.Boolean,
                    value: true
                });
            } else {
                nValue = new opcua.Variant({
                    dataType: opcua.DataType.Boolean,
                    value: false
                });
            }
            break;
        case "String":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.String,
                value: value
            });
            break;
        case "LocalizedText":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.LocalizedText,
                value: new opcua.LocalizedText({locale: "en", text: value})
            });
            break;
        case "DateTime":
            nValue = {
                dataType: opcua.DataType.DateTime,
                value: new Date(value)
            };
            break;
        case "Byte":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Byte,
                value: value
            });
            break;
        case "SByte":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.SByte,
                value: value
            });
            break;
        default:
            nValue = new opcua.Variant({
                dataType: opcua.DataType.BaseDataType,
                value: value
            });
            break;
    }
    // Checks if Array and grabs Data Type
    var m = datatype.match(/\b(\w+) Array\b/);
    if (m) {
        nValue = new opcua.Variant({
            dataType: opcua.DataType[m[1]],
            value: value,
            arrayType: opcua.VariantArrayType.Array,
            arrayDimensions: [value.length]
        });
        console.log("NEW ARRAY VARIANT:" + nValue.toString());
    }

    return nValue;
};

function getArrayValues(datatype, items) {
    var uaArray = {};
    uaArray.values = [];
    uaArray.uaType = null;
    
    console.debug("### getArrayValues:" + datatype + " items:" + items);

    // Check datatype string, example Byte Array, Double Array etc.
    if (datatype.indexOf("Boolean") === 0) {
        uaArray.uaType = opcua.DataType.Boolean;
        uaArray.values = new Array(items.length);
    }
    if (datatype.indexOf("UInt8") === 0 || datatype.indexOf("Byte") === 0) {
        uaArray.uaType = opcua.DataType.Byte;
        uaArray.values = new Uint8Array(items);
    }
    if (datatype.indexOf("UInt16") === 0) {
        uaArray.uaType = opcua.DataType.UInt16;
        uaArray.values = new Uint16Array(items);
    }
    if (datatype.indexOf("UInt32") === 0) {
        uaArray.uaType = opcua.DataType.UInt32;
        uaArray.values = new Uint32Array(items);
    }
    if (datatype.indexOf("Int8") === 0 || datatype.indexOf("SByte") === 0) {
        uaArray.uaType = opcua.DataType.SByte;
        uaArray.values = new Int8Array(items);
    }
    if (datatype.indexOf("Int16") === 0) {
        uaArray.uaType = opcua.DataType.Int16;
        uaArray.values = new Int16Array(items);
    }
    if (datatype.indexOf("Int32") === 0) {
        uaArray.uaType = opcua.DataType.Int32;
        uaArray.values = new Int32Array(items);
    }
    if (datatype.indexOf("Float") === 0) {
        uaArray.uaType = opcua.DataType.Float;
        uaArray.values = new Float32Array(items);
    }
    if (datatype.indexOf("Double") >= 0) {
        uaArray.uaType = opcua.DataType.Double;
        uaArray.values = new Float64Array(items);
    }
    if (uaArray.uaType === null) {
        console.warn("Array support for String nor ByteString etc. not implemented, only basic types supported!");
        console.error("Unknown type for Array: " + datatype + " cannot convert items:" + items);
    }

    function setValue(item, index, arr) {
        // TODO Boolean, Float conversions
        if (uaArray.uaType === opcua.DataType.Float || uaArray.uaType === opcua.DataType.Double) {
            uaArray.values[index] = parseFloat(item);
        }
        else if (uaArray.uaType === opcua.DataType.Boolean) {
            uaArray.values[index] = false;
            if (item === 1 || item === "true") {
                uaArray.values[index] = true;
            }
        }
        else {
            uaArray.values[index] = parseInt(item);
        }
        // console.debug("ARRAY index=" + index + " value=" + uaArray.values[index]);
    }
    items.forEach(setValue);

    console.log("uaArray:" + stringify(uaArray));
    return uaArray.values;
}

function getArrayType(datatype) {
    
    console.debug("getArrayType:" + datatype);

    // Check datatype string, example Byte Array, Double Array etc.
    if (datatype.indexOf("Boolean") >= 0) {
        return opcua.DataType.Boolean;
    }
    if (datatype.indexOf("UInt8") >= 0 || datatype.indexOf("Byte") >= 0) {
        return opcua.DataType.Byte;
    }
    if (datatype.indexOf("UInt16") >= 0) {
        return opcua.DataType.UInt16;
    }
    if (datatype.indexOf("UInt32") >= 0) {
        return opcua.DataType.UInt32;
    }
    if (datatype.indexOf("Int8") >= 0 || datatype.indexOf("SByte") >= 0) {
        return opcua.DataType.SByte;
    }
    if (datatype.indexOf("Int16") >= 0) {
        return opcua.DataType.Int16;
    }
    if (datatype.indexOf("Int32") >= 0) {
        return opcua.DataType.Int32;
    }
    if (datatype.indexOf("Float") >= 0 || datatype.indexOf("Float32") >= 0) {
        return opcua.DataType.Float;
    }
    if (datatype.indexOf("Double") >= 0 || datatype.indexOf("Float64") >= 0) {
        return opcua.DataType.Double;
    }
    console.warn("Array support for String nor ByteString etc. not implemented, only basic types supported!");
    console.error("Unknown type for Array: " + datatype);

    return null;
}

module.exports.build_new_value_by_datatype = function (datatype, value) {

    var nValue = 0;
    console.log("Build new value by datatype= " + datatype + " value=" + value);
    var uaType;
    
    switch (datatype) {
        case "Float":
            uaType = opcua.DataType.Float;
            // nValue = parseFloat(value);
            var float32 = new Float32Array([value]);
            nValue = float32[0];
            break;
        case "Double":
            uaType = opcua.DataType.Double;
            // nValue = parseFloat(value); // (Double) or Float64 ?
            var float64 = new Float64Array([value]);
            nValue = float64[0];
            break;
        case "SByte":
            uaType = opcua.DataType.SByte;
            var int8 = new Int8Array([value]);
            nValue = int8[0];
            break;
        case "Int8":
            uaType = opcua.DataType.Int8;
            var int8 = new Int8Array([value]);
            nValue = int8[0];
            break;
        case "Int16":
            uaType = opcua.DataType.Int16;
            var int16 = new Int16Array([value]);
            nValue = int16[0];
            break;
        case "Int32":
            uaType = opcua.DataType.Int32;
            var int32 = new Int32Array([value]);
            nValue = int32[0];
            break;
        case "Byte":
            uaType = opcua.DataType.Byte;
            var uint8 = new Uint8Array([value]);
            nValue = uint8[0];
            break;
        case "ByteString":
            uaType = opcua.DataType.ByteString;
            var nValue = Buffer.from(value);
            break;
        case "UInt8":
            uaType = opcua.DataType.Byte;
            var uint8 = new Uint8Array([value]);
            nValue = uint8[0];
            break;
        case "UInt16":
            uaType = opcua.DataType.UInt16;
            var uint16 = new Uint16Array([value]);
            nValue = uint16[0];
            break;
        case "UInt32":
            uaType = opcua.DataType.UInt32;
            var uint32 = new Uint32Array([value]);
            nValue = uint32[0];
            break;
        case "Boolean":
            uaType = opcua.DataType.Boolean;
            if (value && value !== "false") {
                nValue = true;
            } else {
                nValue = false;
            }
            break;
        case "String":
            uaType = opcua.DataType.String;
            nValue = value.toString();
            break;
        case "LocalizedText":
            uaType = opcua.DataType.LocalizedText;
            nValue = new opcua.LocalizedText({locale: "en", text: value});
            break;
        case "DateTime":
            uaType = opcua.DataType.DateTime;
            nValue = value.toString();
            break;
        default:
            // uaType = null;
            nValue = value;
            break;
    }
    // Checks if Array and grabs Data Type
    var m = datatype.match(/\b(\w+) Array\b/);
    if (m) {
        // Convert value (string) to individual array values
        var items = value.split(",");
        var arrayValues = getArrayValues(datatype, items);
        uaType = getArrayType(datatype);

/*        
        if (uaType == opcua.DataType.Byte || opcua.DataType.UInt8) {
            arrayValues = new Uint8Array(items.length);
        }
        function setValue(item, index, arr) {
            // TODO Boolean, Float conversions
            if (uaType === opcua.DataType.Float || uaType === opcua.DataType.Double) {
                arrayValues[index] = parseFloat(item);
            }
            else if (uaType === opcua.DataType.Boolean) {
                arrayValues[index] = false;
                if (item === 1 || item === "true") {
                    arrayValues[index] = true;
                }
            }
            else {
                arrayValues[index] = parseInt(item);
            }
            console.log("ARRAY index=" + index + " value=" + arrayValues[index]);
        }
        items.forEach(setValue);
*/
        console.log("ARRAY VALUES: " + arrayValues); //  + "(uaType=" + uaType + "/" + opcua.DataType[m[1]] + ")");

        nValue = {
            dataType: uaType,
            value: arrayValues,
            arrayType: opcua.VariantArrayType.Array
        };
        console.log("NEW2 ARRAY VARIANT: " + JSON.stringify(nValue));
    }

    return nValue;
};

module.exports.build_new_dataValue = function (datatype, value) {

    var nValue = null;

    console.log("Build new dataValue= " + datatype + " value=" + stringify(value));

    switch (datatype) {
        case "Float":
            nValue = {
                dataType: opcua.DataType.Float,
                value: parseFloat(value)
            };
            break;
        case "Double":
            nValue = {
                dataType: opcua.DataType.Double,
                value: parseFloat(value)
            };
            break;
        case "Int32":
            nValue = {
                dataType: opcua.DataType.Int32,
                value: parseInt(value)
            };
            break;
        case "Int16":
            nValue = {
                dataType: opcua.DataType.Int16,
                value: parseInt(value)
            };
            break;
        case "Int8":
            nValue = {
                dataType: opcua.DataType.SByte,
                value: parseInt(value)
            };
            break;
        case "UInt32":
            nValue = {
                dataType: opcua.DataType.UInt32,
                value: parseInt(value)
            };
            break;
        case "UInt16":
            nValue = {
                dataType: opcua.DataType.UInt16,
                value: parseInt(value)
            };
            break;
        case "UInt8":
            nValue = {
                dataType: opcua.DataType.Byte,
                value: parseInt(value)
            };
            break;
        case "Boolean":
            if (value && value !== "false") {
                nValue = {
                    dataType: opcua.DataType.Boolean,
                    value: true
                };
            } else {
                nValue = {
                    dataType: opcua.DataType.Boolean,
                    value: false
                };
            }
            break;
        case "String":
            nValue = {
                dataType: opcua.DataType.String,
                value: value
            };
            break;
        case "LocalizedText":
            nValue = {
                dataType: opcua.DataType.LocalizedText,
                value: new opcua.LocalizedText({locale: "en", text: value })
            };
            break;
        case "DateTime":
            nValue = {
                dataType: opcua.DataType.UtcTime,
                value: Date.parse(value)
            };
            break;
        case "Byte":
            nValue = {
                dataType: opcua.DataType.Byte,
                value: parseInt(value)
            };
            break;
        case "SByte":
            nValue = {
                dataType: opcua.DataType.SByte,
                value: parseInt(value)
            };
            break;
        default:
            nValue = {
                dataType: opcua.DataType.BaseDataType,
                value: value
            };
            break;
    }

    // Checks if Array and grabs Data Type
    var m = datatype.match(/\b(\w+) Array\b/);
    if (m) {
        var uaType = nValue.dataType;
        // TODO typed Array and value conversions
        console.debug("VALUES: " + Object.values(value.value));
        var arrayValues = getArrayValues(datatype, Object.values(value.value));
        uaType = getArrayType(datatype);
        console.log("ARRAY: " + arrayValues);
        // /var arrayValues = arr.values;
        // var arrayValues = new Uint8Array(Object.values(value.value)); // WAS OK
        // var arrayValues = new typedArrays[opcua.DataType[m[1]]];
        // console.log("ARRAY VALUES: " + arrayValues + "(uaType=" + opcua.DataType[m[1]] + ")");

        nValue = {
            dataType: uaType, // maps SByte and Byte // opcua.DataType[m[1]],
            value: arrayValues,
            arrayType: opcua.VariantArrayType.Array,
        };
    }

    return nValue;
};
