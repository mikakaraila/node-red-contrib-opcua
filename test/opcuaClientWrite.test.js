const assert = require("node:assert/strict");
const test = require("node:test");

const { createClientNode, settle } = require("./helpers/clientHarness");

test("write of a value that does not match the datatype is reported and not written", async () => {
  const h = createClientNode();
  try {
    await h.connect();
    h.send({ action: "write", topic: "ns=4;s=x;datatype=String", payload: 1700745221747 });
    await settle();
    assert.equal(h.unhandled.length, 0);
    assert.equal(h.log.write.length, 0, "an invalid value must not be written");
    assert.ok(h.errors.some((e) => /does not match datatype String/.test(e)), "got: " + JSON.stringify(h.errors));
  } finally {
    await h.dispose();
  }
});

test("write of an Int16 value that is too large is limited to 32767 and written", async () => {
  const h = createClientNode();
  try {
    await h.connect();
    h.send({ action: "write", topic: "ns=4;s=x;datatype=Int16", payload: 40000 });
    await settle();
    assert.equal(h.log.write.length, 1, "the limited value must be written; errors: " + JSON.stringify(h.errors));
    assert.equal(h.log.write[0].value.value.value, 32767);
  } finally {
    await h.dispose();
  }
});

test("write of a valid value is written unchanged", async () => {
  const h = createClientNode();
  try {
    await h.connect();
    h.send({ action: "write", topic: "ns=4;s=x;datatype=Int16", payload: 7 });
    await settle();
    assert.equal(h.log.write.length, 1);
    assert.equal(h.log.write[0].value.value.value, 7);
    assert.equal(h.errors.length, 0);
  } finally {
    await h.dispose();
  }
});
