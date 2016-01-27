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
Added example flow for Browse (from file) TEST_OPCUA.json.

Subscription interval is not anymore used in read requests, but left in UI.

Here you got some ready to use examples.
You can use the Import in Node-RED in the right upper corner menu.

![node-red-opcua-flow] (Example.png)

Examples are available for Schneider IGSS and Prosys Simulation Server as Node-RED flow.
Search for OPC UA on: http://flows.nodered.org/

![node-red-opcua-flow-Prosys] (PROSYS-OPC-UA-EXAMPLE.png)

