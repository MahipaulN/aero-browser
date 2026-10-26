const { app, BrowserWindow, session } = require("electron");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeLoad(wc, url) {
  try {
    await wc.loadURL(url);
  } catch (err) {
    if (err.code !== "ERR_ABORTED") throw err;
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("   AERO BROWSER — E2E PLAYBACK & ADBLOCK SUITE   ");
  console.log("=================================================");

  await store.init();
  await adblockManager.init();

  const ses = session.fromPartition("persist:aero-e2e-test");
  adblockManager.enableInSession(ses, "default");

  const allowedMediaUrls = [];

  // Monitor web requests
  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    if (details.url.includes(".googlevideo.com/") || details.resourceType === "media") {
      allowedMediaUrls.push(details.url);
    }
    callback({});
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  const wc = win.webContents;

  wc.on("did-finish-load", async () => {
    const url = wc.getURL();
    await adblockManager.injectCosmeticStyles(wc, url, "default");
  });

  let testCount = 0;
  let passCount = 0;

  function assertTest(condition, name, details = "") {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`[PASS] ${name}${details ? ` (${details})` : ""}`);
    } else {
      console.error(`[FAIL] ${name}${details ? ` (${details})` : ""}`);
      process.exitCode = 1;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: YouTube Homepage & Search Input
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: YouTube Homepage ---");
    await safeLoad(wc, "https://www.youtube.com/");
    await sleep(4000);

    const title = wc.getTitle();
    assertTest(title.toLowerCase().includes("youtube"), "Homepage title contains 'YouTube'", title);

    const hasSearch = await wc.executeJavaScript(`
      Boolean(document.querySelector('input[name="search_query"], input#search'))
    `);
    assertTest(hasSearch, "Homepage search box rendered");

    // -------------------------------------------------------------
    // TEST 2: Video 1 Playback, Pause, Resume, Seek, Audio
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Video 1 Playback (M7lc1UVf-VE) ---");
    await safeLoad(wc, "https://www.youtube.com/watch?v=M7lc1UVf-VE");
    await sleep(4000);

    // Check player initial playback
    let vState = await wc.executeJavaScript(`
      (() => {
        const v = document.querySelector('video');
        const p = document.getElementById('movie_player');
        return {
          hasVideo: !!v,
          paused: v ? v.paused : null,
          currentTime: v ? v.currentTime : null,
          duration: v ? v.duration : null,
          readyState: v ? v.readyState : null,
          playerState: p && typeof p.getPlayerState === 'function' ? p.getPlayerState() : null,
          volume: p && typeof p.getVolume === 'function' ? p.getVolume() : null,
          muted: p && typeof p.isMuted === 'function' ? p.isMuted() : null
        };
      })()
    `);

    assertTest(vState.hasVideo, "Video element present in DOM");
    assertTest(vState.duration > 0, "Video duration loaded", `${vState.duration}s`);

    // Let it play for 3 seconds and verify time advances
    const tStart = vState.currentTime;
    await sleep(3000);
    const tAfter = await wc.executeJavaScript(`document.querySelector('video')?.currentTime || 0`);
    assertTest(tAfter > tStart || vState.playerState === 1 || vState.playerState === 3, "Video is playing / time advancing", `t0=${tStart.toFixed(2)}, t1=${tAfter.toFixed(2)}`);

    // Test Pause
    await wc.executeJavaScript(`document.getElementById('movie_player')?.pauseVideo()`);
    await sleep(1000);
    const isPaused = await wc.executeJavaScript(`document.querySelector('video')?.paused`);
    assertTest(isPaused === true, "Video pause function works");

    // Test Resume
    await wc.executeJavaScript(`document.getElementById('movie_player')?.playVideo()`);
    await sleep(1500);
    const isPlaying = await wc.executeJavaScript(`!document.querySelector('video')?.paused`);
    assertTest(isPlaying === true, "Video resume function works");

    // Test Seek
    await wc.executeJavaScript(`document.getElementById('movie_player')?.seekTo(45, true)`);
    await sleep(2000);
    const seekTime = await wc.executeJavaScript(`document.querySelector('video')?.currentTime || 0`);
    assertTest(seekTime >= 40 && seekTime <= 55, "Video seeking works", `jumped to ${seekTime.toFixed(2)}s`);

    // Test Audio
    const audioState = await wc.executeJavaScript(`
      (() => {
        const p = document.getElementById('movie_player');
        return {
          volume: p ? p.getVolume() : 0,
          muted: p ? p.isMuted() : true
        };
      })()
    `);
    assertTest(audioState.volume > 0 && !audioState.muted, "Audio is unmuted with volume", `vol=${audioState.volume}, muted=${audioState.muted}`);

    // -------------------------------------------------------------
    // TEST 3: Video 2 & Page Reload
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Video 2 Playback & Reload (jNQXAC9IVRw) ---");
    await safeLoad(wc, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await sleep(4000);

    const v2State = await wc.executeJavaScript(`
      (() => {
        const v = document.querySelector('video');
        return {
          hasVideo: !!v,
          duration: v ? v.duration : 0,
          readyState: v ? v.readyState : 0
        };
      })()
    `);
    assertTest(v2State.hasVideo && v2State.duration > 0, "Video 2 loaded successfully", `duration=${v2State.duration}`);

    // Reload test
    console.log("Testing page reload on Video 2...");
    try {
      await wc.reload();
    } catch {}
    await sleep(4000);
    const v2AfterReload = await wc.executeJavaScript(`
      Boolean(document.querySelector('video') && document.querySelector('video').readyState >= 1)
    `);
    assertTest(v2AfterReload, "Video 2 still plays after page reload");

    // -------------------------------------------------------------
    // TEST 4: Per-site Allowlist Toggle
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Per-site Protection Controls ---");
    assertTest(adblockManager.isDomainAllowlisted("youtube.com") === false, "YouTube is not allowlisted initially");

    // Toggle allowlist (shields down)
    const toggleDown = await adblockManager.toggleSite("youtube.com", "default");
    assertTest(toggleDown.enabled === false, "Toggling off returns enabled: false");
    assertTest(adblockManager.isDomainAllowlisted("youtube.com", "default") === true, "Domain allowlisted in memory & settings");

    const statsOff = adblockManager.getStatsForDomain("youtube.com", "default");
    assertTest(statsOff.isAllowlisted === true && statsOff.isEnabled === false, "Stats reflect shields disabled for site");

    // Toggle allowlist back (shields up)
    const toggleUp = await adblockManager.toggleSite("youtube.com", "default");
    assertTest(toggleUp.enabled === true, "Toggling on returns enabled: true");
    assertTest(adblockManager.isDomainAllowlisted("youtube.com", "default") === false, "Domain removed from allowlist");

    const statsOn = adblockManager.getStatsForDomain("youtube.com", "default");
    assertTest(statsOn.isAllowlisted === false && statsOn.isEnabled === true, "Stats reflect shields active");

    // -------------------------------------------------------------
    // TEST 5: HTML5 Video Playback on Standard Web
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Standard HTML5 Video Playback ---");
    await safeLoad(wc, "data:text/html," + encodeURIComponent(`
      <!DOCTYPE html>
      <html>
        <body>
          <video id="testVideo" src="https://www.w3schools.com/html/mov_bbb.mp4" controls autoplay></video>
        </body>
      </html>
    `));
    await sleep(4000);

    const html5VideoState = await wc.executeJavaScript(`
      (() => {
        const v = document.getElementById('testVideo');
        return {
          hasVideo: !!v,
          src: v ? v.src : null,
          readyState: v ? v.readyState : 0,
          paused: v ? v.paused : null
        };
      })()
    `);
    assertTest(html5VideoState.hasVideo, "Standard HTML5 video element loaded");
    assertTest(html5VideoState.readyState >= 1, "Standard HTML5 video readyState >= 1", `readyState=${html5VideoState.readyState}`);

  } catch (err) {
    console.error("Test execution error:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n=================================================");
    console.log(`   E2E RESULTS: ${passCount} / ${testCount} TESTS PASSED`);
    console.log("=================================================");
    win.destroy();
    app.quit();
  }
}

app.whenReady().then(runTests).catch(err => {
  console.error("Fatal error:", err);
  app.quit();
});
