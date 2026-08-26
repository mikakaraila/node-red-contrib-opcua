const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const test = require("node:test");

test("the connected OPC UA client retains its reconnection listeners", async () => {
  const clients = [];
  const certificateManager = {
    async initialize() {},
    trustedFolder: "trusted",
    rejectedFolder: "rejected",
    crlFolder: "crl",
    issuersCertFolder: "issuers",
    issuersCrlFolder: "issuers-crl"
  };

  class MockClient extends EventEmitter {
    constructor() {
      super();
      this.clientCertificateManager = certificateManager;
    }

    async connect() {
      this.connected = true;
    }

    async createSession() {
      return { sessionId: "active" };
    }
  }

  const opcua = {
    AttributeIds: {},
    DataType: { Null: 0, NodeId: 17 },
    MessageSecurityMode: { None: 1 },
    OPCUAClient: {
      create() {
        const client = new MockClient();
        clients.push(client);
        return client;
      }
    },
    SecurityPolicy: { None: "None" },
    TimestampsToReturn: {},
    UserTokenType: { Anonymous: 0, Certificate: 2, UserName: 1 }
  };

  const identity = (value) => value;
  const chalk = new Proxy(identity, { get: () => identity });
  const basics = {
    calc_milliseconds_by_time_and_unit: () => 300000,
    get_node_status: (status) => ({ fill: "green", shape: "dot", status })
  };
  const stubs = {
    "async": { queue: function () { return { push() {} }; } },
    "chalk": chalk,
    "flatted": { stringify: JSON.stringify },
    "lodash.clonedeep": (value) => value,
    "node-opcua": opcua,
    "node-opcua-client-crawler": { NodeCrawler: class {} },
    "node-opcua-crypto": {},
    "node-opcua-file-transfer": {},
    "./opcua-basics": basics,
    "./utils": { createClientCertificateManager: () => certificateManager }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let ClientNode;
  try {
    const registerClientNode = require("../opcua/102-opcuaclient");
    registerClientNode({
      nodes: {
        createNode(node) {
          Object.assign(node, {
            debug() {},
            error() {},
            on() {},
            send() {},
            status() {},
            warn() {}
          });
        },
        getNode() {
          return {
            endpoint: "opc.tcp://localhost:4840",
            login: false,
            none: true,
            securityMode: "None",
            securityPolicy: "None",
            usercert: false
          };
        },
        registerType(name, constructor) {
          if (name === "OpcUa-Client") ClientNode = constructor;
        }
      },
      settings: { verbose: false }
    });
  } finally {
    Module._load = originalLoad;
  }

  const node = new ClientNode({
    action: "read",
    endpoint: "endpoint",
    keepsessionalive: false,
    name: "client",
    time: 1,
    timeUnit: "s"
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(clients.length, 1, "connect must reuse the client that owns reconnection listeners");
  assert.strictEqual(node.client, clients[0]);
  assert.equal(node.client.listenerCount("backoff"), 1);
  assert.equal(node.client.listenerCount("start_reconnection"), 1);
  assert.equal(node.client.listenerCount("connection_reestablished"), 1);
});
