node-red-contrib-opcua
========================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to communicate [OPC UA](https://www.npmjs.com/package/node-opcua).

Install
-------

Run command on Node-RED installation directory.

	npm install node-red-contrib-opcua


Usage
-----

Use OpcUa-Item to define variables.
Use OpcUa-Client to read / write / subscribe / browse OPC UA server.

See some flows under [examples].

Here you got some ready to use examples.
You can use the Import in Node-RED in the right upper corner menu.

![node-red-opcua-flow] (images/Example.png)

Examples are available for Schneider IGSS and Prosys Simulation Server as Node-RED flow.
Search for OPC UA on: http://flows.nodered.org/

![node-red-opcua-flow-Prosys] (images/PROSYS-OPC-UA-EXAMPLE.png)

Testing
------

    karma start opcua.conf.js --log-level debug --single-run
