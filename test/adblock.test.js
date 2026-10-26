const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");
const { ElectronBlocker, Request } = require("@ghostery/adblocker-electron");

test("AdBlock: offline rule parser matches known ad/tracker patterns and allows benign requests", () => {
  const blocker = ElectronBlocker.parse(`
    ||doubleclick.net^
    ||google-analytics.com^
    ||adnxs.com^
    ||criteo.com^
    ||taboola.com^
  `);

  // Matching requests should be blocked
  const adReq1 = Request.fromRawDetails({
    url: "https://ad.doubleclick.net/adj/test.js",
    type: "script",
    sourceUrl: "https://example.com"
  });
  assert.equal(blocker.match(adReq1).match, true, "doubleclick.net should match blocking rule");

  const trackerReq = Request.fromRawDetails({
    url: "https://google-analytics.com/analytics.js",
    type: "script",
    sourceUrl: "https://example.com"
  });
  assert.equal(blocker.match(trackerReq).match, true, "google-analytics.com should match blocking rule");

  // Benign requests should NOT be blocked
  const benignReq1 = Request.fromRawDetails({
    url: "https://github.com/torvalds/linux",
    type: "main_frame",
    sourceUrl: "https://github.com"
  });
  assert.equal(blocker.match(benignReq1).match, false, "github.com should not be blocked");

  const benignReq2 = Request.fromRawDetails({
    url: "https://en.wikipedia.org/static/images/project-logos/enwiki.png",
    type: "image",
    sourceUrl: "https://en.wikipedia.org"
  });
  assert.equal(blocker.match(benignReq2).match, false, "wikipedia image should not be blocked");
});

test("AdBlockManager: essential media and YouTube playback resources are protected", () => {
  const protectedCases = [
    { url: "https://rr3---sn-5hne6nsy.googlevideo.com/videoplayback?expire=123", type: "media" },
    { url: "blob:https://www.youtube.com/a84c9876-0000-4000-8000-123456789abc", type: "media" },
    { url: "https://www.youtube.com/youtubei/v1/player?key=test", type: "xhr" },
    { url: "https://www.youtube.com/youtubei/v1/next?key=test", type: "xhr" },
    { url: "https://www.youtube.com/s/player/228d7a12/player_ias.vflset/en_US/base.js", type: "script" },
    { url: "https://www.youtube.com/generate_204", type: "xhr" },
    { url: "https://www.youtube.com/api/stats/qoe?ns=yt", type: "xhr" },
    { url: "https://www.youtube.com/api/stats/playback?ns=yt", type: "xhr" },
    { url: "https://www.youtube.com/api/stats/watchtime?ns=yt", type: "xhr" },
    { url: "https://www.youtube.com/ptracking?html5=1", type: "xhr" },
    { url: "https://video.vimeo.com/video/123456", type: "media" }
  ];

  for (const c of protectedCases) {
    const isProtected = adblockManager.isEssentialMediaOrPlaybackResource(c.url, c.type);
    assert.equal(isProtected, true, `Expected ${c.url} (${c.type}) to be protected from blocking`);
  }

  // Non-essential ad requests must NOT be protected
  const adCases = [
    { url: "https://googleads.g.doubleclick.net/pagead/ads", type: "xhr" },
    { url: "https://static.doubleclick.net/instream/ad_status.js", type: "script" },
    { url: "https://www.youtube.com/pagead/viewthroughconversion/123", type: "xhr" },
    { url: "https://www.google-analytics.com/analytics.js", type: "script" }
  ];

  for (const a of adCases) {
    const isProtected = adblockManager.isEssentialMediaOrPlaybackResource(a.url, a.type);
    assert.equal(isProtected, false, `Expected ad request ${a.url} NOT to be protected`);
  }
});

test("AdBlockManager: site allowlist and global toggles", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-adblock-test-${Date.now()}.json`);
  await store.init(tmpFile);

  try {
    // 1. By default, global adblock is enabled
    assert.equal(adblockManager.isGlobalEnabled("default"), true);

    // 2. Toggle global adblock off then on
    const globalOff = await adblockManager.toggleGlobal("default");
    assert.equal(globalOff.enabled, false);
    assert.equal(globalOff.globalEnabled, false);
    assert.equal(adblockManager.isGlobalEnabled("default"), false);

    const globalOn = await adblockManager.toggleGlobal("default");
    assert.equal(globalOn.enabled, true);
    assert.equal(globalOn.globalEnabled, true);
    assert.equal(adblockManager.isGlobalEnabled("default"), true);

    // 3. Test site allowlisting
    const testDomain = "ad-supported-news.com";
    assert.equal(adblockManager.isDomainAllowlisted(testDomain, "default"), false);

    // Toggle site to allowlist (shields down)
    const shields1 = await adblockManager.toggleSite(testDomain, "default");
    assert.equal(shields1.enabled, false, "Site is now allowlisted, shields down");
    assert.equal(shields1.siteEnabled, false);
    assert.equal(adblockManager.isDomainAllowlisted(testDomain, "default"), true);

    const statsAllowlisted = adblockManager.getStatsForDomain(testDomain, "default");
    assert.equal(statsAllowlisted.isAllowlisted, true);
    assert.equal(statsAllowlisted.isEnabled, false);
    assert.equal(statsAllowlisted.siteEnabled, false);

    // Toggle site back (shields up / blocking active)
    const shields2 = await adblockManager.toggleSite(testDomain, "default");
    assert.equal(shields2.enabled, true, "Site is removed from allowlist, shields up");
    assert.equal(shields2.siteEnabled, true);
    assert.equal(adblockManager.isDomainAllowlisted(testDomain, "default"), false);

    const statsShieldsUp = adblockManager.getStatsForDomain(testDomain, "default");
    assert.equal(statsShieldsUp.isAllowlisted, false);
    assert.equal(statsShieldsUp.isEnabled, true);
    assert.equal(statsShieldsUp.siteEnabled, true);
  } finally {
    try { await fs.unlink(tmpFile); } catch {}
  }
});

test("AdBlockManager: domain normalization and hierarchical matching", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-adblock-norm-${Date.now()}.json`);
  await store.init(tmpFile);

  try {
    // Allowlist base domain with uppercase and port
    await adblockManager.toggleSite("HTTPS://Example.COM:8443/some/path?q=1#hash", "default");

    // Exact match
    assert.equal(adblockManager.isDomainAllowlisted("example.com", "default"), true);
    // Subdomain match
    assert.equal(adblockManager.isDomainAllowlisted("sub.example.com", "default"), true);
    assert.equal(adblockManager.isDomainAllowlisted("deep.nested.sub.example.com", "default"), true);
    // www. equivalence
    assert.equal(adblockManager.isDomainAllowlisted("www.example.com", "default"), true);
    // Unintended cross-domain matches must NOT match
    assert.equal(adblockManager.isDomainAllowlisted("badexample.com", "default"), false);
    assert.equal(adblockManager.isDomainAllowlisted("notexample.com", "default"), false);
    assert.equal(adblockManager.isDomainAllowlisted("example.org", "default"), false);
    assert.equal(adblockManager.isDomainAllowlisted("aero://newtab", "default"), false);
  } finally {
    try { await fs.unlink(tmpFile); } catch {}
  }
});

test("AdBlockManager: preferences persist across reload and simulated restart", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-adblock-persist-${Date.now()}.json`);
  await store.init(tmpFile);

  try {
    // Configure settings in session 1
    await adblockManager.toggleSite("techblog.org", "default");
    await adblockManager.toggleSite("news.co.uk", "default");
    await adblockManager.toggleGlobal("default"); // Turn global off

    // Simulate browser restart by re-initializing store from disk
    const freshStore = require("../src/main/store");
    await freshStore.init(tmpFile);

    // Verify persisted state
    assert.equal(adblockManager.isGlobalEnabled("default"), false);
    assert.equal(adblockManager.isDomainAllowlisted("techblog.org", "default"), true);
    assert.equal(adblockManager.isDomainAllowlisted("news.co.uk", "default"), true);
    assert.equal(adblockManager.isDomainAllowlisted("google.com", "default"), false);

    // Re-enable global adblock and verify persistence again
    await adblockManager.toggleGlobal("default");
    assert.equal(adblockManager.isGlobalEnabled("default"), true);
    await freshStore.init(tmpFile);
    assert.equal(adblockManager.isGlobalEnabled("default"), true);
  } finally {
    try { await fs.unlink(tmpFile); } catch {}
  }
});

test("AdBlockManager: coordinated webRequest pipeline filters actual requests", async () => {
  const tmpFile = path.join(os.tmpdir(), `aero-adblock-pipeline-${Date.now()}.json`);
  await store.init(tmpFile);

  try {
    // Create mock Electron Session with webRequest interceptor capture
    let beforeRequestListener = null;
    let headersReceivedListener = null;

    let attachCount = 0;
    const mockSession = {
      webRequest: {
        onBeforeRequest: (...args) => {
          attachCount++;
          beforeRequestListener = args.length === 1 ? args[0] : args[1];
        },
        onHeadersReceived: (...args) => {
          headersReceivedListener = args.length === 1 ? args[0] : args[1];
        }
      }
    };

    // 1. Enable in mock session
    adblockManager.enableInSession(mockSession, "default");
    assert.equal(attachCount, 1, "onBeforeRequest should be registered once");
    assert.ok(headersReceivedListener, "onHeadersReceived listener should be registered");

    // 2. Test duplicate enable does NOT register duplicate handlers
    adblockManager.enableInSession(mockSession, "default");
    assert.equal(attachCount, 1, "Duplicate enableInSession must be a no-op");

    // Helper to run mock request through onBeforeRequest
    const executeRequest = (details) => {
      return new Promise((resolve) => {
        beforeRequestListener(details, (res) => resolve(res));
      });
    };

    // 3. YouTube ad request when adblock is enabled -> cancelled
    const ytAdRes = await executeRequest({
      id: 1,
      url: "https://www.youtube.com/pagead/viewthroughconversion/123",
      resourceType: "xhr",
      referrer: "https://www.youtube.com/watch?v=123"
    });
    assert.equal(ytAdRes.cancel, true, "YouTube ad request must be cancelled");

    // 4. Benign video playback request -> allowed
    const videoRes = await executeRequest({
      id: 2,
      url: "https://rr3---sn-5hne6nsy.googlevideo.com/videoplayback?expire=123",
      resourceType: "media",
      referrer: "https://www.youtube.com/watch?v=123"
    });
    assert.deepEqual(videoRes, {}, "Video playback must not be blocked");

    // 5. Allowlist YouTube -> YouTube ad request is allowed
    await adblockManager.toggleSite("www.youtube.com", "default");
    const ytAdAllowedRes = await executeRequest({
      id: 3,
      url: "https://www.youtube.com/pagead/viewthroughconversion/123",
      resourceType: "xhr",
      referrer: "https://www.youtube.com/watch?v=123"
    });
    assert.deepEqual(ytAdAllowedRes, {}, "Ad request must be allowed on allowlisted domain");

    // Remove YouTube from allowlist
    await adblockManager.toggleSite("www.youtube.com", "default");

    // 6. Global adblock toggle OFF -> all requests allowed
    await adblockManager.toggleGlobal("default");
    const ytAdGlobalOff = await executeRequest({
      id: 4,
      url: "https://www.youtube.com/pagead/viewthroughconversion/123",
      resourceType: "xhr",
      referrer: "https://www.youtube.com/watch?v=123"
    });
    assert.deepEqual(ytAdGlobalOff, {}, "Ad request must be allowed when global adblock is disabled");

    // Re-enable global
    await adblockManager.toggleGlobal("default");

    // 7. Test disableInSession cleanly removes listeners
    adblockManager.disableInSession(mockSession);
    assert.equal(beforeRequestListener, null);
    assert.equal(headersReceivedListener, null);
  } finally {
    try { await fs.unlink(tmpFile); } catch {}
  }
});

test("AdBlockManager: siteStats memory is strictly bounded", () => {
  // Push 600 unique domains to siteStats
  for (let i = 0; i < 600; i++) {
    adblockManager.recordBlocked(`domain-${i}.example.com`, "default");
  }
  assert.ok(adblockManager.siteStats.size <= 500, `siteStats size must be <= 500, was ${adblockManager.siteStats.size}`);
});
