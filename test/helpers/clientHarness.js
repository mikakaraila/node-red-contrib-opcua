// Tests for the robustness of the OPC UA client node:
//  - an action that fails must be reported, never become an unhandled promise rejection
//    (an unhandled rejection terminates the whole Node-RED process)
//  - closing the node must disconnect the client
//  - a write with a value that does not match the datatype is reported clearly
//  - the liveness watchdog reads the server state
//  - subscriptions keep delivering values when the triggering msg has a circular reference
//
// The OPC UA library is stubbed. The stubs validate values like the real library does:
// a Variant throws for a value that does not fit its datatype.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

const ENDPOINT = "opc.tcp://localhost:4840";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };

const DataType = { Null: 0, Boolean: 1, Int16: 4, Int32: 6, String: 12, NodeId: 17 };

// JSON.stringify that survives circular references, like the flatted package used by the node
function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  });
}

function createClientNode() {
  const log = { read: [], write: [], register: [], unregister: [], browse: [], monitorItems: [], clientsCreated: 0, disconnects: 0 };
  const errors = [];
  const statuses = [];
  const sent = [];
  const handlers = {};
  const subscriptions = [];
  const monitoredItems = [];
  const state = { readFails: false, disconnectDelay: false };

  const certificateManager = {
    async initialize() {},
    trustedFolder: "trusted", rejectedFolder: "rejected", crlFolder: "crl", issuersCertFolder: "issuers", issuersCrlFolder: "issuers-crl"
  };

  const good = { isGoodish: () => true, description: "Good", name: "Good", toString: () => "Good" };

  function makeSession() {
    const session = {
      sessionId: "active",
      isReconnecting: false,
      isChannelValid: () => true,
      async read(arg) {
        log.read.push(arg);
        const id = arg && arg.nodeId;
        if (state.readFails) throw new Error("BadConnectionClosed"); // a dead channel fails every read
        if (typeof id === "string" && !/^(ns=\d+;)?[isgb]=/.test(id)) throw new Error("String cannot be coerced to a nodeId : " + id);
        return { statusCode: good, value: { dataType: DataType.Null, value: null } };
      },
      write(nodeToWrite, callback) { log.write.push(nodeToWrite); callback(null, good); },
      async registerNodes(nodes) { log.register.push(nodes); return nodes; },
      async unregisterNodes(nodes) { log.unregister.push(nodes); return nodes; },
      async browse(nodeId) { log.browse.push(nodeId); return { references: [] }; },
      close(callback) { if (callback) callback(); return Promise.resolve(); },
    };
    return session;
  }

  class MockClient extends EventEmitter {
    constructor() { super(); this.clientCertificateManager = certificateManager; }
    async connect() {}
    async createSession() { return makeSession(); }
    disconnect(callback) {
      log.disconnects++;
      if (state.disconnectDelay) setImmediate(() => callback && callback()); else if (callback) callback();
      return undefined;
    }
  }

  class Variant {
    constructor(options) {
      // like node-opcua: a value that does not fit the datatype fails an assertion without a message
      if (options.dataType === DataType.Int16 && !(Number.isInteger(options.value) && options.value >= -32768 && options.value <= 32767)) throw new Error();
      if (options.dataType === DataType.String && typeof options.value !== "string") throw new Error();
      Object.assign(this, options);
    }
  }
  class DataValue { constructor(options) { Object.assign(this, options); } }

  const opcua = {
    AttributeIds: { Value: 13 },
    DataType,
    DataValue,
    Variant,
    MessageSecurityMode: { None: 1 },
    SecurityPolicy: { None: "None" },
    TimestampsToReturn: { Both: 3, Neither: 0 },
    UserTokenType: { Anonymous: 0, Certificate: 2, UserName: 1 },
    StatusCodes: { Good: good },
    VariantArrayType: { Array: 1 },
    OPCUAClient: { create() { log.clientsCreated++; return new MockClient(); } },
    coerceNodeId(s) {
      if (typeof s !== "string" || !/^(ns=\d+;)?[isgb]=/.test(s)) throw new Error("String cannot be coerced to a nodeId : " + s);
      return { toString: () => s, isEmpty: () => false };
    },
    makeBrowsePath: () => ({}),
    resolveNodeId: (s) => s,
    extractConditionFields: async () => [],
    constructEventFilter: () => ({}),
    ofType: () => ({}),
    DataChangeFilter: class { constructor(o) { Object.assign(this, o); } },
    DataChangeTrigger: { StatusValue: 1 },
    DeadbandType: { Absolute: 1, Percent: 2 },
    ClientSubscription: {
      create() {
        const sub = new EventEmitter();
        Object.assign(sub, {
          subscriptionId: 1, isActive: true, terminate() {}, toString: () => "subscription",
          async monitorItems(items) { log.monitorItems.push(items); return new EventEmitter(); },
        });
        subscriptions.push(sub);
        return sub;
      },
    },
    ClientMonitoredItem: {
      create() {
        const item = new EventEmitter();
        item.toString = () => "monitoredItem";
        monitoredItems.push(item);
        return item;
      },
    },
  };

  const identity = (value) => value;
  const chalk = new Proxy(identity, { get: () => identity });
  const stubs = {
    "async": { queue: function () { return { push() {} }; } },
    "chalk": chalk,
    "flatted": { stringify: safeStringify },
    "lodash.clonedeep": (value) => value,
    "node-opcua": opcua,
    "node-opcua-client-crawler": { NodeCrawler: class {} },
    "node-opcua-crypto": {},
    "node-opcua-file-transfer": {},
    "./opcua-basics": {
      calc_milliseconds_by_time_and_unit: () => 1000,
      get_node_status: (status) => ({ fill: "green", shape: "dot", status }),
      getSubscriptionParameters: () => ({}),
      getEventSubscriptionParameters: () => ({}),
      build_new_dataValue: (datatype, value) => ({ dataType: DataType[datatype], value: datatype === "Int16" ? parseInt(value) : value }),
    },
    "./utils": { createClientCertificateManager: () => certificateManager },
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  let ClientNode;
  const modulePath = require.resolve("../../opcua/102-opcuaclient");
  delete require.cache[modulePath];
  try {
    require(modulePath)({
      nodes: {
        createNode(node) {
          Object.assign(node, {
            debug() {},
            error(text) { errors.push(String(text)); },
            on(event, handler) { handlers[event] = handler; },
            send(msg) { sent.push(msg); },
            status(status) { statuses.push(status); },
            warn() {},
          });
        },
        getNode() { return { endpoint: ENDPOINT, login: false, none: true, securityMode: "None", securityPolicy: "None", usercert: false }; },
        registerType(name, constructor) { if (name === "OpcUa-Client") ClientNode = constructor; },
      },
      settings: { verbose: false },
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }

  // an unhandled rejection must not be hidden by, or attributed to, the test runner
  const unhandled = [];
  const previous = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason) => unhandled.push(reason));

  const node = new ClientNode({ action: "read", endpoint: "endpoint", keepsessionalive: false, name: "client", time: 1, timeUnit: "s" });

  return {
    node, log, errors, statuses, sent, handlers, unhandled, state, subscriptions, monitoredItems,
    send: (msg) => handlers.input(msg),
    async connect() { await settle(); assert.ok(node.session, "the node must have a session"); },
    async dispose() {
      // stops the liveness watchdog so the test process can exit
      try { await handlers.close(() => {}); } catch (e) { /* ignore */ }
      process.removeAllListeners("unhandledRejection");
      previous.forEach((l) => process.on("unhandledRejection", l));
    },
  };
}

module.exports = { createClientNode, settle, tick, DataType, ENDPOINT };
