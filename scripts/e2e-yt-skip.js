// Deterministic (no network) check of the YouTube skip helper against a simulated player.
// This does NOT prove real YouTube ad behavior; live ads must be verified separately.
const { app, BrowserWindow } = require("electron");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");

const PAGE = `<!doctype html><body><div id="movie_player" class="html5-video-player ad-showing">
<video class="html5-main-video"></video><button class="ytp-ad-skip-button" onclick="window.clicks=(window.clicks||0)+1">Skip</button>
</div><script>window.clicks=0;
const v=document.querySelector('video');window.seeks=0;v.addEventListener('seeking',()=>window.seeks++);
window.rateChanges=0;v.addEventListener('ratechange',()=>window.rateChanges++);</script></body>`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`[${ok ? "PASS" : "FAIL"}] ${name} ${detail}`); if (!ok) failed++; };

app.whenReady().then(async () => {
  await store.init();
  await adblockManager.init();
  const win = new BrowserWindow({ show: false });
  const wc = win.webContents;
  await wc.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(PAGE));
  const fakeUrl = "https://www.youtube.com/watch?v=test";
  const orig = store.getSettings;
  store.getSettings = (...a) => ({ ...orig.apply(store, a), adblockEnabled: true, adblockAllowlist: [] });

  for (let i = 0; i < 5; i++) await adblockManager.injectCosmeticStyles(wc, fakeUrl, "default"); // repeated injection
  // trigger mutation to schedule a check
  await wc.executeJavaScript(`document.getElementById('movie_player').classList.add('ad-interrupting')`);
  await sleep(700);
  const s = await wc.executeJavaScript(`({clicks:window.clicks,seeks:window.seeks,rate:document.querySelector('video').playbackRate,rc:window.rateChanges,muted:document.querySelector('video').muted,t:document.querySelector('video').currentTime})`);
  check("native Skip button clicked exactly once despite 5 injections", s.clicks === 1, `(clicks=${s.clicks})`);
  check("no seek issued", s.seeks === 0 && s.t === 0, `(seeks=${s.seeks}, t=${s.t})`);
  check("playbackRate untouched", s.rc === 0 && s.rate === 1, `(rate=${s.rate})`);
  check("video not muted by helper", s.muted === false);

  store.getSettings = (...a) => ({ ...orig.apply(store, a), adblockEnabled: false, adblockAllowlist: [] });
  await adblockManager.injectCosmeticStyles(wc, fakeUrl, "default");
  const cleaned = await wc.executeJavaScript(`window.__aero_yt_cleanup === null || window.__aero_yt_cleanup === undefined`);
  check("disabling shields disconnects observer", cleaned);

  console.log(`YT SKIP SUMMARY: ${failed ? failed + " FAILED" : "ALL PASSED"}`);
  app.exit(failed ? 1 : 0);
});
