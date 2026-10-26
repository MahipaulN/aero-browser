const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const store = require("../src/main/store");
const adblockManager = require("../src/main/adblock-manager");

test("Deterministic Network Filtering: live HTTP server with real requests and toggle verification", async (t) => {
  const tmpFile = path.join(os.tmpdir(), `aero-det-net-${Date.now()}.json`);
  await store.init(tmpFile);
  await adblockManager.init();

  const receivedRequests = [];

  // 1. Controlled HTTP test server
  const server = http.createServer((req, res) => {
    receivedRequests.push({
      url: req.url,
      method: req.method,
      headers: req.headers
    });

    if (req.url === "/benign-script.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end("console.log('benign script executed');");
    } else if (req.url === "/videoplayback?expire=999") {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end("BINARY_VIDEO_DATA_CHUNK");
    } else if (req.url.startsWith("/pagead/ads")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ad": "test ad payload"}');
    } else if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/benign-script.js" });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Aero Deterministic Test Server</body></html>");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { await fs.unlink(tmpFile); } catch {}
  });

  // 2. Wire up mock session with adblockManager
  let beforeRequestListener = null;
  const mockSession = {
    webRequest: {
      onBeforeRequest: (_filter, callback) => {
        beforeRequestListener = callback;
      },
      onHeadersReceived: () => {}
    }
  };

  adblockManager.enableInSession(mockSession, "default");
  assert.ok(beforeRequestListener, "onBeforeRequest listener must be attached");

  // Helper to execute interceptor callback
  function dispatchInterceptor(details) {
    return new Promise((resolve) => {
      beforeRequestListener(details, (res) => resolve(res));
    });
  }

  // TEST 1: Benign request reaches network and receives 200 OK
  const benignRes = await dispatchInterceptor({
    id: 101,
    url: `${baseUrl}/benign-script.js`,
    resourceType: "script",
    referrer: `${baseUrl}/index.html`
  });
  assert.deepEqual(benignRes, {}, "Benign script must be allowed by interceptor");

  const reqCountBefore = receivedRequests.length;
  await globalThis.fetch(`${baseUrl}/benign-script.js`);
  assert.equal(receivedRequests.length, reqCountBefore + 1, "Benign request must physically reach server");
  assert.equal(receivedRequests[receivedRequests.length - 1].url, "/benign-script.js");

  // TEST 2: Essential video playback request is protected and never blocked
  const videoRes = await dispatchInterceptor({
    id: 102,
    url: `${baseUrl}/videoplayback?expire=999`,
    resourceType: "media",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.deepEqual(videoRes, {}, "Video playback must not be blocked");
  await globalThis.fetch(`${baseUrl}/videoplayback?expire=999`);
  assert.equal(receivedRequests[receivedRequests.length - 1].url, "/videoplayback?expire=999");

  // TEST 3: Known ad request is intercepted and cancelled
  const adUrl = `${baseUrl}/pagead/ads?client=ca-pub-123`;
  const adRes = await dispatchInterceptor({
    id: 103,
    url: adUrl,
    resourceType: "xhr",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.equal(adRes.cancel, true, "Ad request must be cancelled when shields are ON");

  // TEST 4: Per-site allowlisting allows the previously blocked ad request
  const siteDomain = `127.0.0.1`;
  const toggleRes = await adblockManager.toggleSite(siteDomain, "default");
  assert.equal(toggleRes.isAllowlisted, true, "Site must now be allowlisted");
  assert.equal(toggleRes.isEffectiveEnabled, false, "Effective shields should be DOWN for this site");

  const adResAfterAllow = await dispatchInterceptor({
    id: 104,
    url: adUrl,
    resourceType: "xhr",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.deepEqual(adResAfterAllow, {}, "Ad request must be allowed when site is allowlisted");

  // TEST 5: Removing site from allowlist restores ad blocking
  const toggleBackRes = await adblockManager.toggleSite(siteDomain, "default");
  assert.equal(toggleBackRes.isAllowlisted, false, "Site must no longer be allowlisted");
  assert.equal(toggleBackRes.isEffectiveEnabled, true, "Effective shields must be restored to ON");

  const adResRestored = await dispatchInterceptor({
    id: 105,
    url: adUrl,
    resourceType: "xhr",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.equal(adResRestored.cancel, true, "Ad request must be blocked again after removing allowlist");

  // TEST 6: Global toggle OFF disables filtering everywhere
  const globalOffRes = await adblockManager.toggleGlobal("default");
  assert.equal(globalOffRes.isGlobalEnabled, false, "Global adblock must be disabled");

  const adResGlobalOff = await dispatchInterceptor({
    id: 106,
    url: adUrl,
    resourceType: "xhr",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.deepEqual(adResGlobalOff, {}, "Ad request must be allowed when global adblocking is OFF");

  // TEST 7: Global toggle ON restores filtering everywhere
  const globalOnRes = await adblockManager.toggleGlobal("default");
  assert.equal(globalOnRes.isGlobalEnabled, true, "Global adblock must be restored");

  const adResGlobalOn = await dispatchInterceptor({
    id: 107,
    url: adUrl,
    resourceType: "xhr",
    referrer: `${baseUrl}/watch?v=sample`
  });
  assert.equal(adResGlobalOn.cancel, true, "Ad request must be blocked again when global adblocking is ON");

  // TEST 8: Redirect handling
  const redirectRes = await dispatchInterceptor({
    id: 108,
    url: `${baseUrl}/redirect`,
    resourceType: "main_frame",
    referrer: `${baseUrl}/index.html`
  });
  assert.deepEqual(redirectRes, {}, "Benign redirects must not be cancelled");
});
