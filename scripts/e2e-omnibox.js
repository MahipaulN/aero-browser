const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const store = require("../src/main/store");
const tabManager = require("../src/main/tab-manager");
const { registerIpcHandlers } = require("../src/main/ipc-handlers");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2E() {
  console.log("==========================================================");
  console.log("   AERO BROWSER — OMNIBOX & SHORTCUTS E2E TEST SUITE     ");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assertTest(condition, name, details = "") {
    if (condition) {
      passed++;
      console.log(`[PASS] ${name}${details ? ` (${details})` : ""}`);
    } else {
      failed++;
      console.error(`[FAIL] ${name}${details ? ` (${details})` : ""}`);
      process.exitCode = 1;
    }
  }

  await store.init();
  const profileId = store.getActiveProfileId();
  const settings = store.getSettings(profileId);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../src/main/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const sendToWindow = (channel, ...args) => {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...args);
    }
  };

  tabManager.setSendFunction(sendToWindow);
  tabManager.init(win, {
    profileId,
    isPrivate: false,
    showBookmarks: settings.showBookmarksBar
  });

  registerIpcHandlers(win, { isPrivate: false });

  await win.loadFile(path.join(__dirname, "../src/renderer/index.html"));
  await sleep(1000);

  // Initialize a real tab
  tabManager.createTab("https://example.com/", true);
  await sleep(1000);

  const wc = win.webContents;

  // -------------------------------------------------------------
  // TEST 1: Inspect Address Bar & Omnibox Computed Styling
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Omnibox Focus Styling & Outline Removal ---");
  const unfocusedStyles = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      const bar = document.getElementById("addressBar");
      const compInput = window.getComputedStyle(input);
      const compBar = window.getComputedStyle(bar);
      return {
        inputOutline: compInput.outlineStyle,
        inputBorder: compInput.borderStyle,
        barRadius: compBar.borderRadius,
        barShadow: compBar.boxShadow
      };
    })()
  `);

  assertTest(
    unfocusedStyles.inputOutline === "none" || unfocusedStyles.inputOutline === "",
    "Unfocused address input outline is none",
    unfocusedStyles.inputOutline
  );

  // Focus the omnibox and check styles
  const focusedStyles = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      const bar = document.getElementById("addressBar");
      input.focus();
      const compInput = window.getComputedStyle(input);
      const compBar = window.getComputedStyle(bar);
      return {
        inputOutlineStyle: compInput.outlineStyle,
        inputOutlineColor: compInput.outlineColor,
        inputOutlineWidth: compInput.outlineWidth,
        barBorderColor: compBar.borderColor,
        barBoxShadow: compBar.boxShadow
      };
    })()
  `);

  assertTest(
    focusedStyles.inputOutlineStyle === "none" || focusedStyles.inputOutlineWidth === "0px",
    "Focused omnibox has NO default blue outline",
    `outline: ${focusedStyles.inputOutlineStyle} ${focusedStyles.inputOutlineWidth}`
  );

  assertTest(
    focusedStyles.barBoxShadow !== "none" && focusedStyles.barBoxShadow.length > 0,
    "Focused address bar container has refined subtle glass glow ring",
    focusedStyles.barBoxShadow
  );

  // -------------------------------------------------------------
  // TEST 2: Single Mouse Click Selects Full URL
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Single Mouse Click Selects Full URL ---");

  // Blur first
  await wc.executeJavaScript(`document.getElementById("addressInput").blur();`);
  await sleep(200);

  // Simulate user single mouse click on unfocused input
  const clickResult = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      input.focus();
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return {
        isFocused: document.activeElement === input,
        valLength: input.value.length,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        selectedText: input.value.substring(input.selectionStart, input.selectionEnd)
      };
    })()
  `);

  assertTest(clickResult.isFocused, "Single click focuses address input");
  assertTest(
    clickResult.selectionStart === 0 && clickResult.selectionEnd === clickResult.valLength && clickResult.valLength > 0,
    "Single click selects entire URL",
    `Selected: "${clickResult.selectedText}"`
  );

  // -------------------------------------------------------------
  // TEST 3: Typing Replaces the Selected URL
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Typing Replaces Selected URL ---");
  const typingResult = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      // Simulate typing a replacement query
      input.setRangeText("github.com", input.selectionStart, input.selectionEnd, "end");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        value: input.value,
        selectionStart: input.selectionStart
      };
    })()
  `);

  assertTest(
    typingResult.value === "github.com",
    "Typing replaces the full selected URL cleanly",
    `New value: ${typingResult.value}`
  );

  // -------------------------------------------------------------
  // TEST 4: Escape Restores Current Tab URL & Blurs
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Escape Restores Current Page URL ---");
  const escResult = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      return {
        value: input.value,
        isFocused: document.activeElement === input
      };
    })()
  `);

  assertTest(
    escResult.value.includes("example.com"),
    "Escape restores the original active tab URL",
    escResult.value
  );
  assertTest(!escResult.isFocused, "Escape blurs the address input");

  // -------------------------------------------------------------
  // TEST 5: Ctrl+L, Alt+D, F6 Focus & Select Full URL
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Ctrl+L, Alt+D, F6 Shortcuts ---");

  // Trigger Ctrl+L
  tabManager.handleShortcut({ type: "keyDown", control: true, key: "l" });
  await sleep(150);

  let shortcutState = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      return {
        isFocused: document.activeElement === input,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        length: input.value.length
      };
    })()
  `);
  assertTest(
    shortcutState.isFocused && shortcutState.selectionStart === 0 && shortcutState.selectionEnd === shortcutState.length,
    "Ctrl+L focuses omnibox and selects full URL"
  );

  // Blur and test Alt+D
  await wc.executeJavaScript(`document.getElementById("addressInput").blur();`);
  await sleep(100);
  tabManager.handleShortcut({ type: "keyDown", alt: true, key: "d" });
  await sleep(150);

  shortcutState = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      return {
        isFocused: document.activeElement === input,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        length: input.value.length
      };
    })()
  `);
  assertTest(
    shortcutState.isFocused && shortcutState.selectionStart === 0 && shortcutState.selectionEnd === shortcutState.length,
    "Alt+D focuses omnibox and selects full URL"
  );

  // Blur and test F6
  await wc.executeJavaScript(`document.getElementById("addressInput").blur();`);
  await sleep(100);
  tabManager.handleShortcut({ type: "keyDown", key: "F6" });
  await sleep(150);

  shortcutState = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      return { isFocused: document.activeElement === input };
    })()
  `);
  assertTest(shortcutState.isFocused, "F6 focuses address bar");

  // -------------------------------------------------------------
  // TEST 6: Tab Operations via Shortcuts
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Tab Shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab) ---");
  const initialTabsCount = tabManager.tabs.size;

  tabManager.handleShortcut({ type: "keyDown", control: true, key: "t" });
  assertTest(tabManager.tabs.size === initialTabsCount + 1, "Ctrl+T creates a new tab", `Tabs: ${tabManager.tabs.size}`);

  tabManager.handleShortcut({ type: "keyDown", control: true, key: "w" });
  assertTest(tabManager.tabs.size === initialTabsCount, "Ctrl+W closes current tab", `Tabs: ${tabManager.tabs.size}`);

  // -------------------------------------------------------------
  // TEST 7: Background Tab Updates Do Not Clobber Active Omnibox
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Background Tab Updates Do Not Clobber Omnibox ---");
  await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      input.focus();
      input.value = "user is currently typing";
    })()
  `);

  // Trigger tabManager publish/update while input is focused
  tabManager.publishTabs();
  await sleep(200);

  const preserveResult = await wc.executeJavaScript(`
    (() => {
      const input = document.getElementById("addressInput");
      return {
        value: input.value,
        isFocused: document.activeElement === input
      };
    })()
  `);

  assertTest(
    preserveResult.value === "user is currently typing",
    "Background tab updates do NOT overwrite active omnibox editing",
    `Value: "${preserveResult.value}"`
  );

  // -------------------------------------------------------------
  // TEST 8: Capture UI Screenshot
  // -------------------------------------------------------------
  console.log("\n--- TEST 8: Capture Visual Proof of Omnibox Focus UI ---");
  try {
    const artifactDir = "C:\\Users\\mahip\\.gemini\\antigravity-ide\\brain\\4c74b919-7af1-4170-a1e6-00f9c01f7635";
    const imagePath = path.join(artifactDir, "omnibox_focus_verified.png");
    const image = await wc.capturePage({ x: 0, y: 0, width: 1200, height: 180 });
    fs.writeFileSync(imagePath, image.toPNG());
    assertTest(fs.existsSync(imagePath), "Rendered UI screenshot captured successfully", imagePath);
  } catch (err) {
    console.warn("Screenshot capture error:", err.message);
  }

  console.log("\n==========================================================");
  console.log(`   E2E SUMMARY: ${passed} PASSED, ${failed} FAILED         `);
  console.log("==========================================================");

  win.destroy();
  app.quit();
}

app.whenReady().then(runE2E);
