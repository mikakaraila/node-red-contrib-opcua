const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const test = require("node:test");

async function createClientNode({ connectionError } = {}) {
  const clients = [];
  const errors = [];
  let closeNode;
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
      if (connectionError) throw connectionError;
      this.connected = true;
    }

    async createSession() {
      return { sessionId: "active", async close() {} };
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
            error(message, msg) {
              if (msg?.error && Object.hasOwn(msg.error, "source")) {
                assert.ok(msg.error.source, "error source must not be undefined");
              }
              errors.push({ message, msg });
            },
            on(event, handler) {
              if (event === "close") closeNode = handler;
            },
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

  return { node, clients, errors, close: () => closeNode(() => {}) };
}

test("the connected OPC UA client retains its reconnection listeners", async () => {
  const { node, clients, close } = await createClientNode();
  try {
    assert.equal(clients.length, 1, "connect must reuse the client that owns reconnection listeners");
    assert.strictEqual(node.client, clients[0]);
    assert.equal(node.client.listenerCount("backoff"), 1);
    assert.equal(node.client.listenerCount("start_reconnection"), 1);
    assert.equal(node.client.listenerCount("connection_reestablished"), 1);
  } finally {
    await close();
  }
});

test("an unavailable endpoint reports a catchable error without an invalid source", async () => {
  const { errors, close } = await createClientNode({ connectionError: new Error("device offline") });
  try {
    const error = errors.find((entry) => entry.message === "Invalid endpoint");
    assert.ok(error, "connection failure must be reported to Node-RED");
    assert.match(error.msg.error.message, /device offline/);
    assert.equal(Object.hasOwn(error.msg.error, "source"), false);
  } finally {
    await close();
  }
});
