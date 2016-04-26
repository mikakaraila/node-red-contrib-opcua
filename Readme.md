[![OPC UA](http://b.repl.ca/v1/OPC-UA-blue.png)](http://opcfoundation.org/)

node-red-contrib-opcua
========================

![opcuanode] (images/opcuanode.png)

A Node-RED[1] nodes to communicate or serve via [OPC UA](https://www.npmjs.com/package/node-opcua).

based on [node-opcua](http://node-opcua.github.io/)

![nodeopcua64] (images/nodeopcua64.png)

Install
-------

Run command on Node-RED installation directory.

	npm install node-red-contrib-opcua


Usage
-----

Use OpcUa-Item to define variables.
Use OpcUa-Client to read / write / subscribe / browse OPC UA server.

See some flows under [Examples] (examples).

Here you got some ready to use examples.
You can use the Import in Node-RED in the right upper corner menu.

![node-red-opcua-flow] (images/Example.png)

Examples are available for Schneider IGSS and Prosys Simulation Server as Node-RED flow.
Search for OPC UA on: http://flows.nodered.org/

![node-red-opcua-flow-Prosys] (images/PROSYS-OPC-UA-EXAMPLE.png)

# Author

* since 2015 [Mika Karaila][2]
* since 2016 [Klaus Landsdorf][3]

Testing
------

    karma start opcua.conf.js --log-level debug --single-run

TBD List
-----

| __**Nodes**__      | __**Function**__          | __**Done**__              |
|--------------------|---------------------------|---------------------------|
|  All               |                           |                           |
|                    | Project structure         | :white_check_mark:        |
|                    | Async calls               | :waxing_crescent_moon:    |
|                    | UnitTesting               | :new_moon:                |
|                    | Documentation             | :waxing_crescent_moon:    |
|  Item              |                           | :white_check_mark:        |
|  Browser           |                           |                           |
|                    | Browse                    | :white_check_mark:        |
|                    | Simple UI interface       | :first_quarter_moon:      |
|  Client            |                           |                           |
|                    | Read                      | :white_check_mark:        |
|                    | Write                     | :white_check_mark:        |
|                    | Subscribe                 | :white_check_mark:        |
|                    | AE                        | :new_moon:                |
|  Server            |                           |                           |
|      Commands      |                           |                           |
|                    | Restart                   | :white_check_mark:        |
|                    | Add Variable              | :new_moon:                |
|                    | Add Object                | :new_moon:                |
|                    | Add Method                | :new_moon:                |
|                    | Add Equipment             | :first_quarter_moon:      |
|                    | Add PhysicalAssets        | :first_quarter_moon:      |
|                    |                           |                           |
|                    | Delete by NodeId          | :white_check_mark:        |
|      Examples      |                           |                           |
|                    | Methods                   |                           |
|                    | Structures                |                           |
|                    | Variables                 |                           |
|                    | Objects                   |                           |
|                    | AE                        |                           |
|                    |                           |                           |
|  Alarm and Events  |                           |                           |
|                    |                           |                           |

[EMOJI CHEAT SHEET](http://www.emoji-cheat-sheet.com/)

[1]:http://nodered.org
[2]:https://github.com/mikakaraila
[3]:https://github.com/biancode