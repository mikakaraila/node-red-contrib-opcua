node-red-contrib-opcua
========================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to communicate [OPC UA](https://www.npmjs.com/package/node-opcua).


Pre-reqs
--------

Install first node-opcua.

    npm install node-opcua    

Install
-------

Run command on Node-RED installation directory.

	npm install node-red-contrib-opcua

Usage
-----

Use OpcUaItem to define variables.
Use OpcUaClient to read / write / subscribe / browse OPC UA server.

Subscription interval is not anymore used in read requests, but left in UI.

Here you got some ready to use examples.
You can use the Import in Node-RED in the right upper corner menu.

![node-red-opcua-flow] (Example.png)

Example Node-RED flow:

![node-red-opcua-flow-export] (ExampleFlow.json)

Example Prosys OPC UA Simulation Server Node-RED flow:

![node-red-opcua-flow-export-Prosys] (SYSopcuaFlow.json)

![node-red-opcua-flow-Prosys] (PROSYS-OPC-UA-EXAMPLE.png)