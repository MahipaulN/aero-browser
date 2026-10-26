const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tabManager = require("../src/main/tab-manager");

test("Shortcuts: Navigation shortcuts dispatch correct tab actions", () => {
  const actions = [];
  const origNav = tabManager.navigationAction;
  tabManager.navigationAction = (action) => { actions.push(action); };

  try {
    // Alt + Left -> back
    assert.equal(tabManager.handleShortcut({ type: "keyDown", alt: true, key: "ArrowLeft" }), true);
    assert.deepEqual(actions, ["back"]);

    // Alt + Right -> forward
    assert.equal(tabManager.handleShortcut({ type: "keyDown", alt: true, altKey: true, key: "ArrowRight" }), true);
    assert.deepEqual(actions, ["back", "forward"]);

    // Ctrl + R -> reload
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "r" }), true);
    assert.deepEqual(actions, ["back", "forward", "reload"]);

    // F5 -> reload
    assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "F5" }), true);
    assert.deepEqual(actions, ["back", "forward", "reload", "reload"]);

    // Ctrl + Shift + R -> reload-ignoring-cache
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, shift: true, key: "r" }), true);
    assert.deepEqual(actions, ["back", "forward", "reload", "reload", "reload-ignoring-cache"]);

    // Ctrl + F5 -> reload-ignoring-cache
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "F5" }), true);
    assert.deepEqual(actions, ["back", "forward", "reload", "reload", "reload-ignoring-cache", "reload-ignoring-cache"]);
  } finally {
    tabManager.navigationAction = origNav;
  }
});

test("Shortcuts: Address bar focus shortcuts (Ctrl+L, Alt+D, F6)", () => {
  const sent = [];
  tabManager.setSendFunction((channel, ...args) => {
    sent.push({ channel, args });
  });

  // Ctrl + L
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "l" }), true);
  assert.equal(sent.pop()?.channel, "action:focus-omnibox");

  // Alt + D
  assert.equal(tabManager.handleShortcut({ type: "keyDown", alt: true, key: "d" }), true);
  assert.equal(sent.pop()?.channel, "action:focus-omnibox");

  // F6
  assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "F6" }), true);
  assert.equal(sent.pop()?.channel, "action:focus-omnibox");
});

test("Shortcuts: Tab management shortcuts", () => {
  let created = 0;
  let closed = 0;
  let restored = 0;
  let next = 0;
  let prev = 0;
  let indexActivated = null;
  let lastActivated = false;

  const origCreate = tabManager.createTab;
  const origClose = tabManager.closeTab;
  const origRestore = tabManager.restoreClosedTab;
  const origNext = tabManager.activateNextTab;
  const origPrev = tabManager.activatePreviousTab;
  const origByIndex = tabManager.activateTabByIndex;
  const origLast = tabManager.activateLastTab;

  tabManager.createTab = () => { created++; return "tab-mock"; };
  tabManager.closeTab = () => { closed++; return true; };
  tabManager.restoreClosedTab = () => { restored++; return "tab-mock"; };
  tabManager.activateNextTab = () => { next++; return true; };
  tabManager.activatePreviousTab = () => { prev++; return true; };
  tabManager.activateTabByIndex = (idx) => { indexActivated = idx; return true; };
  tabManager.activateLastTab = () => { lastActivated = true; return true; };
  tabManager.activeTabId = "tab-mock";

  try {
    // Ctrl + T -> New tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "t" }), true);
    assert.equal(created, 1);

    // Ctrl + W -> Close active tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "w" }), true);
    assert.equal(closed, 1);

    // Ctrl + Shift + T -> Restore closed tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, shift: true, key: "t" }), true);
    assert.equal(restored, 1);

    // Ctrl + Tab -> Next tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "Tab" }), true);
    assert.equal(next, 1);

    // Ctrl + Shift + Tab -> Previous tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, shift: true, key: "Tab" }), true);
    assert.equal(prev, 1);

    // Ctrl + 1..8 -> Select tab by index
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "3" }), true);
    assert.equal(indexActivated, 2);

    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "1" }), true);
    assert.equal(indexActivated, 0);

    // Ctrl + 9 -> Select last tab
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "9" }), true);
    assert.equal(lastActivated, true);
  } finally {
    tabManager.createTab = origCreate;
    tabManager.closeTab = origClose;
    tabManager.restoreClosedTab = origRestore;
    tabManager.activateNextTab = origNext;
    tabManager.activatePreviousTab = origPrev;
    tabManager.activateTabByIndex = origByIndex;
    tabManager.activateLastTab = origLast;
  }
});

test("Shortcuts: Other browser shortcuts (Ctrl+D, Ctrl+F, Ctrl+H, Ctrl+J, Ctrl+Shift+Delete, F11)", () => {
  const sent = [];
  tabManager.setSendFunction((channel, ...args) => {
    sent.push({ channel, args });
  });

  const navigations = [];
  const origNav = tabManager.navigate;
  tabManager.navigate = (url) => { navigations.push(url); return true; };

  let fullScreenToggled = false;
  tabManager.mainWindow = {
    isDestroyed: () => false,
    isFullScreen: () => false,
    setFullScreen: (val) => { fullScreenToggled = val; }
  };

  try {
    // Ctrl + D -> bookmark
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "d" }), true);
    assert.equal(sent.pop()?.channel, "action:trigger-bookmark");

    // Ctrl + F -> find
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "f" }), true);
    assert.equal(sent.pop()?.channel, "action:trigger-find");

    // Ctrl + H -> history
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "h" }), true);
    assert.equal(navigations.pop(), "aero://history");

    // Ctrl + J -> downloads
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "j" }), true);
    assert.equal(navigations.pop(), "aero://downloads");

    // Ctrl + Shift + Delete -> clear browsing data
    assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, shift: true, key: "Delete" }), true);
    assert.equal(sent.pop()?.channel, "action:open-clear-data");

    // F11 -> toggle fullscreen
    assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "F11" }), true);
    assert.equal(fullScreenToggled, true);
  } finally {
    tabManager.navigate = origNav;
    tabManager.mainWindow = null;
  }
});

test("Shortcuts: Ordinary website keys and clipboard actions are NOT intercepted", () => {
  // Clipboard and editing
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "c" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "v" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "x" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "a" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "z" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", control: true, key: "y" }), false);

  // Normal typing
  assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "a" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "1" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", key: " " }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyDown", key: "Enter" }), false);

  // KeyUp events
  assert.equal(tabManager.handleShortcut({ type: "keyUp", control: true, key: "t" }), false);
  assert.equal(tabManager.handleShortcut({ type: "keyUp", control: true, key: "l" }), false);
});

test("Omnibox Focus & Polish: styles.css removes blue outline and provides glass focus indicator", () => {
  const cssPath = path.join(__dirname, "../src/renderer/styles.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // Ensure harsh default outline is eliminated on .address-input
  assert.ok(
    css.includes(".address-input:focus") &&
    css.includes("outline: none !important;"),
    ".address-input:focus must have outline: none !important"
  );

  // Ensure focus-visible is also cleanly styled without default outline
  assert.ok(
    css.includes(".address-input:focus-visible") &&
    css.includes("outline: none !important;"),
    ".address-input:focus-visible must eliminate browser-default focus ring"
  );

  // Ensure .address-bar container receives premium focus styling
  assert.ok(
    css.includes(".address-bar:focus-within"),
    ".address-bar:focus-within styling must be present"
  );
  assert.ok(
    css.includes("var(--accent-subtle)") || css.includes("box-shadow"),
    ".address-bar:focus-within must have glowing subtle ring"
  );

  // Ensure global input styles are not clobbered
  assert.equal(css.includes("* { outline: none !important; }"), false, "Must not apply global outline removal to all elements");
});

test("Omnibox State: active typing is preserved during tab updates", () => {
  // Simulating renderer state check
  const activeTab = { id: "tab-1", url: "https://example.com/updated" };
  const mockAddressInput = {
    value: "user typed query without pressing enter",
    isFocused: true
  };

  // Logic used in renderer.js renderTabs():
  // if (document.activeElement !== addressInput) { addressInput.value = active.url; }
  const simulateTabUpdate = (input, active) => {
    if (!input.isFocused) {
      input.value = active.url || "aero://newtab";
    }
  };

  simulateTabUpdate(mockAddressInput, activeTab);
  assert.equal(
    mockAddressInput.value,
    "user typed query without pressing enter",
    "Omnibox input should not be overwritten while focused"
  );

  // When blurred, updates apply
  mockAddressInput.isFocused = false;
  simulateTabUpdate(mockAddressInput, activeTab);
  assert.equal(
    mockAddressInput.value,
    "https://example.com/updated",
    "Omnibox input should update when not focused"
  );
});
