node-red-contrib-opcua
========================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to communicate [OPC UA](https://www.npmjs.com/package/node-opcua).

Install
-------

Run command on Node-RED installation directory. Note: not yet in npm registry.

	npm install

Pre-reqs
--------

Install first node-opcua.

Usage
-----

Use OpcUaItem to define variables.
Use OpcUaClient to read / write / subscribe / browse OPC UA server.

You can specify a time for subscription or use interval in read requests.

![node-red-opcua-flow] (example.png)

Example Node-RED flow:

	[
    {
        "type": "tab",
        "id": "30ffd2ee.59fdd6",
        "label": "TEST"
    },
    {
        "id": "fd893569.93f0f8",
        "type": "mqtt-broker",
        "broker": "localhost",
        "port": "1883",
        "clientid": ""
    },
    {
        "id": "ee3dbf04.a66788",
        "type": "OpcUaItem",
        "item": "ns=4;s=free_memory",
        "datatype": "opcua.DataType.Double",
        "value": "",
        "name": "FreeMemory",
        "x": 250,
        "y": 123,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c9496193.44325"
            ]
        ]
    },
    {
        "id": "4b12ca9b.e7e184",
        "type": "OpcUaItem",
        "item": "ns=1;i=1001",
        "datatype": "opcua.DataType.Double",
        "value": "66.6",
        "x": 251,
        "y": 334,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "70dd1397.3c8e44"
            ]
        ]
    },
    {
        "id": "17ab86a2.3ee959",
        "type": "inject",
        "name": "Read",
        "topic": "",
        "payload": "test2",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 79,
        "y": 124,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "ee3dbf04.a66788"
            ]
        ]
    },
    {
        "id": "6b8b25da.cc5354",
        "type": "inject",
        "name": "Write",
        "topic": "",
        "payload": "test2",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 84,
        "y": 334,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "4b12ca9b.e7e184"
            ]
        ]
    },
    {
        "id": "72f27166.cf283",
        "type": "debug",
        "name": "Write value",
        "active": true,
        "console": "false",
        "complete": "true",
        "x": 719,
        "y": 334,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "3036fc6b.cf480c",
        "type": "debug",
        "name": "Read value",
        "active": true,
        "console": "false",
        "complete": "true",
        "x": 690,
        "y": 180,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "4cbe4259.339fc4",
        "type": "OpcUaItem",
        "item": "ns=4;b=1020ffaa",
        "datatype": "opcua.DataType.Double",
        "value": "",
        "x": 249,
        "y": 180,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c9496193.44325"
            ]
        ]
    },
    {
        "id": "70127f72.70d798",
        "type": "inject",
        "name": "Read",
        "topic": "",
        "payload": "",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 79,
        "y": 180,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "4cbe4259.339fc4"
            ]
        ]
    },
    {
        "id": "c9496193.44325",
        "type": "OpcUaClient",
        "endpoint": "opc.tcp://localhost:4334",
        "action": "read",
        "name": "Test server (read items)",
        "x": 505,
        "y": 180,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "3036fc6b.cf480c"
            ]
        ]
    },
    {
        "id": "c6d19868.6966",
        "type": "OpcUaItem",
        "item": "ns=1;i=1001",
        "datatype": "opcua.DataType.Double",
        "value": "",
        "x": 249,
        "y": 226,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c9496193.44325",
                "b8f22a47.4e4be"
            ]
        ]
    },
    {
        "id": "dba6a018.731628",
        "type": "inject",
        "name": "Read",
        "topic": "",
        "payload": "test2",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 80,
        "y": 227,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c6d19868.6966"
            ]
        ]
    },
    {
        "id": "d016d9d3.e4d6f8",
        "type": "inject",
        "name": "Browse",
        "topic": "ns=1;i=1000",
        "payload": "",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 89,
        "y": 27,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "196a8a52.656eee",
                "f6af9204.3c6688"
            ]
        ]
    },
    {
        "id": "abcb612.468c4a",
        "type": "file",
        "name": "Address.txt",
        "filename": "./public/Address.txt",
        "appendNewline": true,
        "overwriteFile": false,
        "x": 782.5,
        "y": 62.249969482421875,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "52331d8d.d34854",
        "type": "function",
        "name": "Items",
        "func": "msg.payload=msg.browseName+\"|\"+msg.topic;\nreturn msg;",
        "outputs": 1,
        "x": 628.75,
        "y": 65.75,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "abcb612.468c4a",
                "c57b4d43.9997c"
            ]
        ]
    },
    {
        "id": "196a8a52.656eee",
        "type": "trigger",
        "op1": "object|address",
        "op2": "0",
        "op1type": "val",
        "op2type": "",
        "duration": "0",
        "extend": "false",
        "units": "ms",
        "name": "Clear file",
        "x": 386.75,
        "y": 25.5,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "1810a3.38a5bf5e"
            ]
        ]
    },
    {
        "id": "1810a3.38a5bf5e",
        "type": "file",
        "name": "Address.txt",
        "filename": "./public/Address.txt",
        "appendNewline": true,
        "overwriteFile": true,
        "x": 782,
        "y": 24.5,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "f6af9204.3c6688",
        "type": "OpcUaClient",
        "endpoint": "opc.tcp://localhost:4334",
        "action": "browse",
        "name": "Test server (browse)",
        "x": 277,
        "y": 66,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "52331d8d.d34854",
                "ec1206b.b9d5b78"
            ]
        ]
    },
    {
        "id": "70dd1397.3c8e44",
        "type": "OpcUaClient",
        "endpoint": "opc.tcp://localhost:4334",
        "action": "write",
        "name": "Test server (write items)",
        "x": 470,
        "y": 334,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "72f27166.cf283"
            ]
        ]
    },
    {
        "id": "b8f22a47.4e4be",
        "type": "OpcUaClient",
        "endpoint": "opc.tcp://localhost:4334",
        "action": "subscribe",
        "time": "60000",
        "name": "Test server (subscribe item)",
        "x": 515,
        "y": 267,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "28681306.81d564"
            ]
        ]
    },
    {
        "id": "28681306.81d564",
        "type": "debug",
        "name": "Subscribed values",
        "active": true,
        "console": "false",
        "complete": "true",
        "x": 748,
        "y": 266,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "c57b4d43.9997c",
        "type": "debug",
        "name": "Address items",
        "active": false,
        "console": "false",
        "complete": "false",
        "x": 935,
        "y": 63,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "f533d1dd.0a9918",
        "type": "comment",
        "name": "v9",
        "info": "Browse node allows user to select item:\n- runtime browse\n- select RootFolder -> SubFolder\n- select Item\n\nActions:\nread\nwrite\nbrowse\nsubscribe\n\nNodes:\nclient node for actions\nitem node for defining item\n",
        "x": 925,
        "y": 23,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "95aa2fc8.66d098",
        "type": "inject",
        "name": "Read",
        "topic": "",
        "payload": "",
        "payloadType": "none",
        "repeat": "",
        "crontab": "",
        "once": false,
        "x": 88,
        "y": 382,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "3f13fb8f.0a8eac",
                "e9392465.fe0e38"
            ]
        ]
    },
    {
        "id": "3f13fb8f.0a8eac",
        "type": "OpcUaBrowse",
        "item": "ns=4;s=free_memory",
        "datatype": "opcua.DataType.Double",
        "value": "",
        "x": 272,
        "y": 380,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c9496193.44325"
            ]
        ]
    },
    {
        "id": "e9392465.fe0e38",
        "type": "OpcUaBrowse",
        "item": "ns=1;i=1001",
        "datatype": "opcua.DataType.Double",
        "value": "",
        "x": 272,
        "y": 448,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "c9496193.44325"
            ]
        ]
    },
    {
        "id": "ec1206b.b9d5b78",
        "type": "template",
        "name": "OpcUaItem",
        "field": "payload",
        "template": "[{\"id\":\"4b12ca9b.e7e184\",\"type\":\"OpcUaItem\",\"item\":\"{{topic}}\",\"datatype\":\"opcua.DataType.Double\",\"value\":\"66.6\",\"name\":\"{{browseName}}\",\"x\":251,\"y\":334,\"z\":\"30ffd2ee.59fdd6\",\"wires\":[[\"70dd1397.3c8e44\"]]}]",
        "x": 481,
        "y": 115,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "1ec1bea.b9e67c1",
                "48ac6fc6.6c4678"
            ]
        ]
    },
    {
        "id": "1ec1bea.b9e67c1",
        "type": "function",
        "name": "Save to lib",
        "func": "msg.filename=\"./lib/templates/OPCUA/\"+msg.browseName+\".js\";\nmsg.payload=\"// name: \"+msg.browseName+\"\\n\"+\"// field: payload\\n\"+msg.payload;\n\nreturn msg;",
        "outputs": 1,
        "x": 632,
        "y": 115,
        "z": "30ffd2ee.59fdd6",
        "wires": [
            [
                "a66697ec.82e908",
                "db27c866.a69b58"
            ]
        ]
    },
    {
        "id": "a66697ec.82e908",
        "type": "debug",
        "name": "Pre-configured library items",
        "active": false,
        "console": "false",
        "complete": "true",
        "x": 843,
        "y": 144,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "db27c866.a69b58",
        "type": "file",
        "name": "OPC UA Items",
        "filename": "",
        "appendNewline": true,
        "overwriteFile": true,
        "x": 793,
        "y": 103,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    },
    {
        "id": "48ac6fc6.6c4678",
        "type": "debug",
        "name": "",
        "active": true,
        "console": "false",
        "complete": "false",
        "x": 575,
        "y": 39,
        "z": "30ffd2ee.59fdd6",
        "wires": []
    }
]
