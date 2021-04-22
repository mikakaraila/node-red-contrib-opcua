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
const { ModelChangeStructureDataType } = require('node-opcua');
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

function cloneObject(obj) {
    let cpy;

    // Handle the 3 simple types, and null or undefined
    if (null === obj || "object" != typeof obj) return obj;

    // Handle Buffer
    if (Buffer.isBuffer(obj)) return new Buffer.from(obj);

    // Handle Date
    if (obj instanceof Date) {
        cpy = new Date();
        cpy.setTime(obj.getTime());
        return cpy;
    }

    // Handle Array
    if (Array.isArray(obj)) {
        cpy = [];
        for (let i = 0, len = obj.length; i < len; i++) {
            cpy[i] = cloneObject(obj[i]);
        }
        return cpy;
    }

    // Handle NodeId
    if (obj instanceof opcua.NodeId) {
        cpy = obj.toString();
        return cpy;
    }

    // Handle Object
    if (obj instanceof Object) {
        cpy = {};
        for (let attr in obj) {
            if (obj.hasOwnProperty(attr)) cpy[attr] = cloneObject(obj[attr]);
        }
        return cpy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

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

module.exports.collectAlarmFields = function (field, key, value, payload) {
    console.log("Collect field: " + field + " key: " + key + " value:" + value + " payload:" + payload);
    switch (field) {
        // Common fields
        case "EventId":
            payload.EventId = "0x" + value.toString("hex"); // As in UaExpert
            break;
        case "EventType":
            payload.EventType = value;
            break;
        case "SourceNode":
            payload.SourceNode = value;
            break;
        case "SourceName":
            payload.SourceName = value;
            break;
        case "Time":
            payload.Time = value;
            break;
        case "ReceiveTime":
            payload.ReceiveTime = value;
            break;
        case "Message":
            payload.Message = value.text;
            break;
        case "Severity":
            payload.Severity = value;
            break;

            // ConditionType
        case "ConditionClassId":
            payload.ConditionClassId = value;
            break;
        case "ConditionClassName":
            payload.ConditionClassNameName = value;
            break;
        case "ConditionName":
            payload.ConditionName = value;
            break;
        case "BranchId":
            payload.BranchId = value;
            break;
        case "Retain":
            payload.Retain = value;
            break;
        case "EnabledState":
            payload.EnabledState = value.text;
            break;
        case "Quality":
            payload.Quality = value;
            payload.StatusText = value.toString(); // Clear text
            break;
        case "LastSeverity":
            payload.LastSeverity = value;
            break;
        case "Comment":
            payload.Comment = value.text;
            break;
        case "ClientUserId":
            payload.ClientUserId = value;
            break;

            // AcknowledgeConditionType
        case "AckedState":
            payload.AckedState = value.text;
            break;
        case "ConfirmedState":
            payload.ConfirmedState = value.text;
            break;

            // AlarmConditionType
        case "ActiveState":
            payload.ActiveState = value.text;
            break;
        case "InputNode":
            payload.InputNode = value;
            break;
        case "SupressedState":
            payload.SupressedState = value.text;
            break;

            // Limits
        case "HighHighLimit":
            payload.HighHighLimit = value;
            break;
        case "HighLimit":
            payload.HighLimit = value;
            break;
        case "LowLimit":
            payload.LowLimit = value;
            break;
        case "LowLowLimit":
            payload.LowLowLimit = value;
            break;
        case "Value":
            payload.Value = value;
            break;
        default:
            payload[field] = cloneObject(value);
            break;
    }
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

        // Limits
        "HighLimit",
        "LowLimit",
        "HighHighLimit",
        "LowLowLimit",

        // AutoIdScanEventType & AutoIdDiagnosisEventType
        "3:DeviceName",

        // AutoIdScanEventType
        "3:ScanResult",

        // AutoIdDiagnosisEventType
        "4:DeviceName",

        // AutoIdLastAccessEventType
        "4:Client",
        "4:Command",
        "4:LastAccessResult",

        // AutoIdPresenceEventType
        "4:Presence",

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

/*
ALIASES for Basic types:
<Alias Alias="Boolean">i=1</Alias>
<Alias Alias="SByte">i=2</Alias>
<Alias Alias="Byte">i=3</Alias>
<Alias Alias="Int16">i=4</Alias>
<Alias Alias="UInt16">i=5</Alias>
<Alias Alias="Int32">i=6</Alias>
<Alias Alias="UInt32">i=7</Alias>
<Alias Alias="Int64">i=8</Alias>
<Alias Alias="UInt64">i=9</Alias>
<Alias Alias="Float">i=10</Alias>
<Alias Alias="Double">i=11</Alias>
<Alias Alias="DateTime">i=13</Alias>
<Alias Alias="String">i=12</Alias>
<Alias Alias="ByteString">i=15</Alias>
<Alias Alias="Guid">i=14</Alias>
<Alias Alias="XmlElement">i=16</Alias>
<Alias Alias="NodeId">i=17</Alias>
<Alias Alias="ExpandedNodeId">i=18</Alias>
<Alias Alias="QualifiedName">i=20</Alias>
<Alias Alias="LocalizedText">i=21</Alias>
<Alias Alias="StatusCode">i=19</Alias>
<Alias Alias="Structure">i=22</Alias>
<Alias Alias="Number">i=26</Alias>
<Alias Alias="Integer">i=27</Alias>
<Alias Alias="UInteger">i=28</Alias>
<Alias Alias="HasComponent">i=47</Alias>
<Alias Alias="HasProperty">i=46</Alias>
<Alias Alias="Organizes">i=35</Alias>
<Alias Alias="HasEventSource">i=36</Alias>
<Alias Alias="HasNotifier">i=48</Alias>
<Alias Alias="HasSubtype">i=45</Alias>
<Alias Alias="HasTypeDefinition">i=40</Alias>
<Alias Alias="HasModellingRule">i=37</Alias>
<Alias Alias="HasEncoding">i=38</Alias>
<Alias Alias="HasDescription">i=39</Alias>
*/
module.exports.convertToString = function(dataTypeInNodeFormat) {
    var datatype = "";

    switch (dataTypeInNodeFormat) {
        case "ns=0;i=1":
            datatype = "Boolean";
            break;
        case "ns=0;i=2":
            datatype = "SByte";
            break;
        case "ns=0;i=3":
            datatype = "Byte";
            break;
        case "ns=0;i=4":
            datatype = "Int16";
            break;
        case "ns=0;i=5":
            datatype = "UInt16";
            break;
        case "ns=0;i=6":
            datatype = "Int32";
            break;
        case "ns=0;i=7":
            datatype = "UInt32";
            break;
        case "ns=0;i=10":
            datatype = "Float";
            break;
        case "ns=0;i=11":
            datatype = "Double";
            break;
        case "ns=0;i=12":
            datatype = "String";
            break;
        case "ns=0;i=13":
            datatype = "DateTime";
            break;
        case "ns=0;i=21":
            datatype = "LocalizedText";
            break;
        default:
            datatype = "";
            break;
    }

    return datatype;
}

module.exports.buildBrowseMessage = function (topic) {
    return {
        "topic": topic,
        "nodeId": "",
        "browseName": "",
        "description": "",
        // "nodeClassType": "",
        "typeDefinition": "",
        "dataType": "",
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
            nValue = new opcua.Variant({
                dataType: opcua.DataType.DateTime,
                value: new Date(value)
            });
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
        // Boolean, Float basic conversions TODO DateTime etc. if needed
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
    }
    items.forEach(setValue);

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
            nValue = new Date(value);  // value.toString();
            break;
        case "ExtensionObject":
            uaType = opcua.DataType.ExtensionObject;
            nValue = JSON.parse(value);
            break;
        default:
            // uaType = null;
            nValue = value;
            break;
    }
    // Checks if Array and grabs Data Type
    // var m = datatype.match(/\b(\w+) Array\b/);
    var m = datatype.indexOf("Array");
    if (m > 0) {
        // Convert value (string) to individual array values
        var arrayValues = [];
        if (Array.isArray(value) && value.length === 1) {
            var payload = value[0];
            var items = payload.split(",");
            arrayValues = getArrayValues(datatype, items);
            uaType = getArrayType(datatype);
        }
        else {
            if (value.hasOwnProperty("dataType")) {
                // Already processed, return value
                return value;
            }
            var items = value.split(",");
            arrayValues = getArrayValues(datatype, items);
            uaType = getArrayType(datatype);
        }

        nValue = {
            dataType: uaType,
            value: arrayValues,
            arrayType: opcua.VariantArrayType.Array
        };
    }

    return nValue;
};

module.exports.build_new_dataValue = function (datatype, value) {

    var nValue = null;

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
                dataType: opcua.DataType.DateTime, // was UtcTime
                value: value // Date.parse(value)
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
    // var m = datatype.match(/\b(\w+) Array\b/);
    var m = datatype.indexOf("Array");
    if (m > 0) {
        var uaType = getArrayType(datatype);
        var arrayValues = getArrayValues(datatype, Object.values(value.value));

        nValue = {
            dataType: uaType, // maps SByte and Byte // opcua.DataType[m[1]],
            value: arrayValues,
            arrayType: opcua.VariantArrayType.Array,
        };
    }

    return nValue;
};
