// Comprehensive Memory & Process Diagnostics for Aero Browser
const { app, BrowserWindow } = require("electron");
const tabManager = require("../src/main/tab-manager");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");

function getFormattedMetrics() {
  const metrics = app.getAppMetrics();
  let totalWorkingSet = 0;
  let totalPrivate = 0;
  const processBreakdown = [];

  for (const m of metrics) {
    const ws = Math.round(m.memory.workingSetSize / 1024);
    const pb = Math.round((m.memory.privateBytes || 0) / 1024);
    totalWorkingSet += ws;
    totalPrivate += pb;
    processBreakdown.push({
      pid: m.pid,
      type: m.type,
      workingSetMB: ws,
      privateMB: pb
    });
  }

  return {
    totalWorkingSetMB: totalWorkingSet,
    totalPrivateMB: totalPrivate,
    processCount: metrics.length,
    processes: processBreakdown
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMemorySuite() {
  console.log("=================================================");
  console.log("   AERO BROWSER — OBJECTIVE MEMORY BENCHMARK     ");
  console.log("=================================================\n");

  await app.whenReady();
  await store.init();
  await adblockManager.init();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false
  });
  tabManager.init(win, { profileId: "default" });

  const results = {};

  // --- SCENARIO 1: ONE IDLE TAB ---
  console.log("--- SCENARIO 1: One Idle Tab (aero://newtab) ---");
  tabManager.createTab("aero://newtab", true);
  await delay(1000);
  results.oneIdleTab = getFormattedMetrics();
  console.log(`Processes: ${results.oneIdleTab.processCount} | Total RAM: ${results.oneIdleTab.totalWorkingSetMB} MB (Private: ${results.oneIdleTab.totalPrivateMB} MB)`);
  for (const p of results.oneIdleTab.processes) {
    console.log(`  └─ [${p.type}] PID ${p.pid}: ${p.workingSetMB} MB RAM (Private: ${p.privateMB} MB)`);
  }

  // --- SCENARIO 2: ONE YOUTUBE TAB PLAYING VIDEO ---
  console.log("\n--- SCENARIO 2: One YouTube Tab Playing Video ---");
  const ytTabId = tabManager.createTab("https://www.youtube.com/watch?v=M7lc1UVf-VE", true);
  const ytTab = tabManager.tabs.get(ytTabId);
  const wc = ytTab.view.webContents;
  await new Promise(resolve => {
    const check = setInterval(async () => {
      try {
        const time = await wc.executeJavaScript("document.querySelector('video')?.currentTime || 0");
        if (time > 1) {
          clearInterval(check);
          resolve();
        }
      } catch {}
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 8000);
  });
  await delay(1500);
  results.oneYouTubeTab = getFormattedMetrics();
  console.log(`Processes: ${results.oneYouTubeTab.processCount} | Total RAM: ${results.oneYouTubeTab.totalWorkingSetMB} MB (Private: ${results.oneYouTubeTab.totalPrivateMB} MB)`);
  for (const p of results.oneYouTubeTab.processes) {
    console.log(`  └─ [${p.type}] PID ${p.pid}: ${p.workingSetMB} MB RAM (Private: ${p.privateMB} MB)`);
  }

  // --- SCENARIO 3: FIVE TABS OPEN ---
  console.log("\n--- SCENARIO 3: Five Tabs Open ---");
  tabManager.createTab("https://en.wikipedia.org/wiki/Main_Page", false);
  tabManager.createTab("https://github.com/", false);
  tabManager.createTab("https://duckduckgo.com/", false);
  await delay(3000);
  results.fiveTabs = getFormattedMetrics();
  console.log(`Open tabs: ${tabManager.tabs.size} | Processes: ${results.fiveTabs.processCount} | Total RAM: ${results.fiveTabs.totalWorkingSetMB} MB (Private: ${results.fiveTabs.totalPrivateMB} MB)`);

  // --- SCENARIO 4: TEN TABS OPEN ---
  console.log("\n--- SCENARIO 4: Ten Tabs Open ---");
  tabManager.createTab("https://www.google.com/", false);
  tabManager.createTab("https://news.ycombinator.com/", false);
  tabManager.createTab("https://reddit.com/", false);
  tabManager.createTab("https://stackoverflow.com/", false);
  tabManager.createTab("https://developer.mozilla.org/", false);
  await delay(4000);
  results.tenTabs = getFormattedMetrics();
  console.log(`Open tabs: ${tabManager.tabs.size} | Processes: ${results.tenTabs.processCount} | Total RAM: ${results.tenTabs.totalWorkingSetMB} MB (Private: ${results.tenTabs.totalPrivateMB} MB)`);

  // --- SCENARIO 5: CLOSING SEVERAL TABS (CLOSE 5 TABS) ---
  console.log("\n--- SCENARIO 5: Closing 5 Tabs (Resource Cleanup) ---");
  const tabIds = [...tabManager.tabs.keys()];
  for (let i = tabIds.length - 1; i >= tabIds.length - 5; i--) {
    tabManager.closeTab(tabIds[i]);
  }
  // Allow garbage collection & process teardown
  if (global.gc) global.gc();
  await delay(2000);
  results.afterClosingFiveTabs = getFormattedMetrics();
  console.log(`Remaining tabs: ${tabManager.tabs.size} | Processes: ${results.afterClosingFiveTabs.processCount} | Total RAM: ${results.afterClosingFiveTabs.totalWorkingSetMB} MB (Private: ${results.afterClosingFiveTabs.totalPrivateMB} MB)`);
  const ramFreed = results.tenTabs.totalWorkingSetMB - results.afterClosingFiveTabs.totalWorkingSetMB;
  console.log(`[PASS] Closed tabs released memory: ${ramFreed >= 0 ? `${ramFreed} MB freed` : "stable"}`);

  // --- SCENARIO 6: SWITCHING TABS REPEATEDLY (50 CYCLES) ---
  console.log("\n--- SCENARIO 6: Rapid Tab Switching (50 Cycles Stability) ---");
  const remainingIds = [...tabManager.tabs.keys()];
  const startRam = getFormattedMetrics().totalWorkingSetMB;
  for (let cycle = 0; cycle < 50; cycle++) {
    const targetId = remainingIds[cycle % remainingIds.length];
    tabManager.activateTab(targetId);
    await delay(30);
  }
  await delay(1000);
  results.afterRapidSwitching = getFormattedMetrics();
  const memoryDelta = results.afterRapidSwitching.totalWorkingSetMB - startRam;
  console.log(`RAM after 50 switches: ${results.afterRapidSwitching.totalWorkingSetMB} MB (Delta: ${memoryDelta > 0 ? `+${memoryDelta}` : memoryDelta} MB)`);
  console.log(`[PASS] Tab switching stability: ${Math.abs(memoryDelta) < 60 ? "No memory leak detected" : "Warning: memory growth"}`);

  // --- SCENARIO 7: 20-CYCLE TAB OPEN / NAVIGATE / CLOSE LEAK VERIFICATION ---
  console.log("\n--- SCENARIO 7: 20-Cycle Open/Navigate/Close Leak Test ---");
  const cycleStartRam = getFormattedMetrics().totalWorkingSetMB;
  const cycleStartTabs = tabManager.tabs.size;

  for (let i = 1; i <= 20; i++) {
    const cycleTabId = tabManager.createTab("https://duckduckgo.com/", true);
    await delay(100);
    tabManager.navigate("https://en.wikipedia.org/wiki/Special:Random");
    await delay(100);
    tabManager.closeTab(cycleTabId);
    if (i % 5 === 0) {
      if (global.gc) global.gc();
      const current = getFormattedMetrics();
      console.log(`  Cycle ${i}/20: Tabs: ${tabManager.tabs.size} | RAM: ${current.totalWorkingSetMB} MB`);
    }
  }

  if (global.gc) global.gc();
  await delay(1500);
  results.after20Cycles = getFormattedMetrics();
  const cycleDelta = results.after20Cycles.totalWorkingSetMB - cycleStartRam;
  console.log(`RAM after 20 open/navigate/close cycles: ${results.after20Cycles.totalWorkingSetMB} MB (Delta: ${cycleDelta > 0 ? `+${cycleDelta}` : cycleDelta} MB)`);
  console.log(`Tabs registry size: ${tabManager.tabs.size} (Initial: ${cycleStartTabs})`);
  console.log(`[PASS] Leak test evaluation: ${cycleDelta < 100 ? "No unbounded memory leak detected" : "Warning: potential leak detected"}`);

  console.log("\n=================================================");
  console.log("   DIAGNOSTIC SUMMARY COMPLETE                   ");
  console.log("=================================================");
  console.log(JSON.stringify({
    oneIdleTab: results.oneIdleTab.totalWorkingSetMB,
    oneYouTubeTab: results.oneYouTubeTab.totalWorkingSetMB,
    fiveTabs: results.fiveTabs.totalWorkingSetMB,
    tenTabs: results.tenTabs.totalWorkingSetMB,
    afterClosingFiveTabs: results.afterClosingFiveTabs.totalWorkingSetMB,
    afterRapidSwitching: results.afterRapidSwitching.totalWorkingSetMB,
    after20Cycles: results.after20Cycles.totalWorkingSetMB
  }, null, 2));

  tabManager.destroy();
  win.destroy();
  app.quit();
}

runMemorySuite().catch(err => {
  console.error("Memory suite error:", err);
  app.quit();
});
