const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function measureStartup(enabled) {
  console.log(`\n======================================================`);
  console.log(`   MEASURING YOUTUBE STARTUP (AdBlock Enabled: ${enabled})   `);
  console.log(`======================================================`);

  await store.init();
  await adblockManager.init();

  const partitionName = `persist:measure-${enabled ? "on" : "off"}-${Date.now()}`;
  const ses = session.fromPartition(partitionName);

  if (enabled) {
    adblockManager.enableInSession(ses, "default");
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  const wc = win.webContents;
  const t0 = Date.now();
  const marks = { t0 };

  wc.on("dom-ready", async () => {
    marks.domReady = Date.now() - t0;
    console.log(`[+${marks.domReady}ms] dom-ready`);
    if (enabled) {
      await adblockManager.injectCosmeticStyles(wc, wc.getURL(), "default");
    }
  });

  wc.on("did-finish-load", async () => {
    marks.didFinishLoad = Date.now() - t0;
    console.log(`[+${marks.didFinishLoad}ms] did-finish-load`);
  });

  // Track network requests
  let reqCount = 0;
  let blockedCount = 0;
  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, cb) => {
    reqCount++;
    cb({});
  });

  const targetUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE";
  console.log(`Navigating to ${targetUrl}...`);
  wc.loadURL(targetUrl).catch(err => {
    if (err.code !== "ERR_ABORTED") console.error("loadURL error:", err);
  });

  // Poll video element and player state in renderer
  const pollStart = Date.now();
  let firstCanPlay = null;
  let firstMeta = null;
  let firstTimeAdv = null;
  let isAdDetected = null;

  while (Date.now() - pollStart < 35000) {
    try {
      const state = await wc.executeJavaScript(`
        (() => {
          const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
          const p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          if (!v) return { hasVideo: false };
          return {
            hasVideo: true,
            readyState: v.readyState,
            paused: v.paused,
            currentTime: v.currentTime,
            duration: v.duration,
            playbackRate: v.playbackRate,
            muted: v.muted,
            isAd: p ? (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')) : false,
            playerState: p && typeof p.getPlayerState === 'function' ? p.getPlayerState() : null
          };
        })()
      `);

      const elapsed = Date.now() - t0;

      if (state.hasVideo) {
        if (!firstMeta && state.readyState >= 1) {
          firstMeta = elapsed;
          console.log(`[+${elapsed}ms] Video metadata loaded (duration=${state.duration}s)`);
        }
        if (!firstCanPlay && state.readyState >= 3) {
          firstCanPlay = elapsed;
          console.log(`[+${elapsed}ms] canplay / readyState >= 3`);
        }
        if (state.isAd && !isAdDetected) {
          isAdDetected = elapsed;
          console.log(`[+${elapsed}ms] Ad detected on player`);
        }
        if (!firstTimeAdv && state.currentTime > 0.1) {
          firstTimeAdv = elapsed;
          console.log(`[+${elapsed}ms] Video advancing! currentTime=${state.currentTime.toFixed(2)}s (paused=${state.paused}, rate=${state.playbackRate})`);
          break;
        }
      }
    } catch {}
    await sleep(200);
  }

  console.log(`\n--- SUMMARY (Enabled: ${enabled}) ---`);
  console.log(`DOM Ready:            ${marks.domReady ? `${marks.domReady}ms` : "N/A"}`);
  console.log(`Did Finish Load:      ${marks.didFinishLoad ? `${marks.didFinishLoad}ms` : "N/A"}`);
  console.log(`First Metadata:       ${firstMeta ? `${firstMeta}ms` : "N/A"}`);
  console.log(`First CanPlay:        ${firstCanPlay ? `${firstCanPlay}ms` : "N/A"}`);
  console.log(`First Advancing Time: ${firstTimeAdv ? `${firstTimeAdv}ms` : "FAILED (>35s)"}`);

  win.destroy();
  return {
    enabled,
    domReady: marks.domReady,
    didFinishLoad: marks.didFinishLoad,
    firstMeta,
    firstCanPlay,
    firstTimeAdv
  };
}

async function run() {
  const withAdblock = await measureStartup(true);
  const withoutAdblock = await measureStartup(false);

  console.log("\n======================================================");
  console.log("   COMPARISON REPORT: WITH vs WITHOUT ADBLOCK         ");
  console.log("======================================================");
  console.log(`With Adblock:    Advancing time at ${withAdblock.firstTimeAdv}ms`);
  console.log(`Without Adblock: Advancing time at ${withoutAdblock.firstTimeAdv}ms`);
  console.log("======================================================\n");

  app.quit();
}

app.whenReady().then(run);
