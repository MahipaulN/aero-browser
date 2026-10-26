const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const store = require("../src/main/store");

test("Store: initializes and saves to custom file", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-test-store-${Date.now()}.json`);
  await store.init(tmpFile);

  assert.equal(store.getActiveProfileId(), "default");
  const profiles = store.getProfiles();
  assert.ok(profiles.length >= 1);
  assert.equal(profiles[0].id, "default");

  // Cleanup
  try { await fs.unlink(tmpFile); } catch {}
});

test("Store: bookmark management (add, toggle, remove)", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-test-bm-${Date.now()}.json`);
  await store.init(tmpFile);

  // Add bookmark
  const added = await store.addBookmark({
    title: "MDN Web Docs",
    url: "https://developer.mozilla.org/",
    folder: "Dev"
  });
  assert.ok(added.id);
  assert.equal(added.title, "MDN Web Docs");

  const bookmarks = store.getBookmarks();
  assert.ok(bookmarks.some(b => b.url === "https://developer.mozilla.org/"));

  // Toggle existing bookmark removes it
  const toggleResult = await store.toggleBookmark("MDN Web Docs", "https://developer.mozilla.org/");
  assert.equal(toggleResult.saved, false);
  assert.equal(store.getBookmarks().some(b => b.url === "https://developer.mozilla.org/"), false);

  // Toggle new bookmark adds it
  const toggleAdd = await store.toggleBookmark("Rust Lang", "https://www.rust-lang.org/");
  assert.equal(toggleAdd.saved, true);
  assert.equal(store.getBookmarks().some(b => b.url === "https://www.rust-lang.org/"), true);

  // Remove by ID
  await store.removeBookmark(toggleAdd.bookmark.id);
  assert.equal(store.getBookmarks().some(b => b.url === "https://www.rust-lang.org/"), false);

  // Cleanup
  try { await fs.unlink(tmpFile); } catch {}
});

test("Store: history recording and range clearing", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-test-hist-${Date.now()}.json`);
  await store.init(tmpFile);

  // Record navigations
  await store.addHistory({ title: "Site A", url: "https://site-a.com" });
  await store.addHistory({ title: "Site B", url: "https://site-b.com" });

  let history = store.getHistory();
  assert.equal(history.length, 2);
  // getHistory returns reversed (most recent first)
  assert.equal(history[0].url, "https://site-b.com");

  // Does not record internal aero:// routes
  await store.addHistory({ title: "New Tab", url: "aero://newtab" });
  assert.equal(store.getHistory().length, 2);

  // Clear all history
  await store.clearHistory("all");
  assert.equal(store.getHistory().length, 0);

  // Cleanup
  try { await fs.unlink(tmpFile); } catch {}
});

test("Store: settings persistence", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-test-settings-${Date.now()}.json`);
  await store.init(tmpFile);

  const initial = store.getSettings();
  assert.equal(initial.theme, "system");

  const updated = await store.updateSettings({
    theme: "dark",
    searchEngine: "duckduckgo",
    accentColor: "#9333ea"
  });

  assert.equal(updated.theme, "dark");
  assert.equal(updated.searchEngine, "duckduckgo");
  assert.equal(updated.accentColor, "#9333ea");

  const reloaded = store.getSettings();
  assert.equal(reloaded.theme, "dark");
  assert.equal(reloaded.searchEngine, "duckduckgo");

  // Cleanup
  try { await fs.unlink(tmpFile); } catch {}
});

test("Store: origin permissions", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-test-perms-${Date.now()}.json`);
  await store.init(tmpFile);

  await store.setPermission("https://maps.google.com", "geolocation", "granted");
  await store.setPermission("https://bad.site", "notifications", "denied");

  const perms = store.getPermissions();
  assert.equal(perms["https://maps.google.com"].geolocation.state, "granted");
  assert.equal(perms["https://bad.site"].notifications.state, "denied");

  await store.clearPermissions("https://bad.site");
  const cleared = store.getPermissions();
  assert.equal(cleared["https://bad.site"], undefined);
  assert.ok(cleared["https://maps.google.com"]);

  // Cleanup
  try { await fs.unlink(tmpFile); } catch {}
});
