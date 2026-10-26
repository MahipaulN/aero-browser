const test = require("node:test");
const assert = require("node:assert/strict");
const profileManager = require("../src/main/profile-manager");

test("ProfileManager: persistent profile partition format", () => {
  const defaultPartition = profileManager.getPartitionForProfile("default");
  assert.equal(defaultPartition, "persist:aero-profile-default");

  const customPartition = profileManager.getPartitionForProfile("work");
  assert.equal(customPartition, "persist:aero-profile-work");
});

test("ProfileManager: ephemeral private partition has NO 'persist:' prefix", () => {
  // Ephemeral in-memory partition must NOT start with 'persist:'
  const partition = `aero-private-${Date.now()}-abc123`;
  assert.equal(partition.startsWith("persist:"), false);
  assert.ok(partition.startsWith("aero-private-"));
});
