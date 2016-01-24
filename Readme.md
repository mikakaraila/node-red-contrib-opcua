node-red-contrib-opcua
========================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to communicate [OPC UA](https://www.npmjs.com/package/node-opcua).

Install
-------

Run command on Node-RED installation directory.

	npm install

Pre-reqs
--------

Install first node-opcua.

Usage
-----

Use OpcUaItem to define variables.
Use OpcUaClient to read / write / subscribe / browse OPC UA server.
Added example flow for Browse (from file) TEST_OPCUA.json.

Subscription interval is not anymore used in read requests, but left in UI.

Example Node-RED flow, look OPC UA from:
http://flows.nodered.org/

