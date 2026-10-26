const test = require("node:test");
const assert = require("node:assert/strict");
const {
  looksLikeDomain,
  normalizeUrl,
  isAllowedWebUrl,
  isInternalUrl,
  isSecureUrl,
  getOrigin,
  getHostname,
  normalizeHostname
} = require("../src/main/url-utils");

test("looksLikeDomain identifies common web host patterns", () => {
  assert.equal(looksLikeDomain("google.com"), true);
  assert.equal(looksLikeDomain("sub.domain.co.uk/path?q=1"), true);
  assert.equal(looksLikeDomain("localhost"), true);
  assert.equal(looksLikeDomain("localhost:3000"), true);
  assert.equal(looksLikeDomain("127.0.0.1:8080"), true);
  assert.equal(looksLikeDomain("192.168.1.1"), true);

  // Queries and invalid hosts
  assert.equal(looksLikeDomain("how to bake sourdough bread"), false);
  assert.equal(looksLikeDomain("electron vs tauri"), false);
  assert.equal(looksLikeDomain("?search=test"), false);
  assert.equal(looksLikeDomain("!help"), false);
});

test("normalizeUrl converts inputs to navigable URLs or search queries", () => {
  assert.equal(normalizeUrl(""), "aero://newtab");
  assert.equal(normalizeUrl("aero://newtab"), "aero://newtab");
  assert.equal(normalizeUrl("aero://settings"), "aero://settings");
  assert.equal(normalizeUrl("aero://history"), "aero://history");

  // Fully qualified URLs
  assert.equal(normalizeUrl("https://github.com"), "https://github.com/");
  assert.equal(normalizeUrl("http://example.org/test"), "http://example.org/test");

  // Domain with auto-prepended https
  assert.equal(normalizeUrl("wikipedia.org"), "https://wikipedia.org/");
  assert.equal(normalizeUrl("localhost:3000/api"), "https://localhost:3000/api");

  // Search queries with default Google engine
  const googleQuery = normalizeUrl("electron desktop framework", "google");
  assert.ok(googleQuery.startsWith("https://www.google.com/search?q="));
  assert.ok(googleQuery.includes("electron%20desktop%20framework"));

  // Search queries with DuckDuckGo
  const ddgQuery = normalizeUrl("rust vs go", "duckduckgo");
  assert.ok(ddgQuery.startsWith("https://duckduckgo.com/?q="));
  assert.ok(ddgQuery.includes("rust%20vs%20go"));

  // Search queries with Bing
  const bingQuery = normalizeUrl("weather today", "bing");
  assert.ok(bingQuery.startsWith("https://www.bing.com/search?q="));

  // Search queries with Brave
  const braveQuery = normalizeUrl("privacy tools", "brave");
  assert.ok(braveQuery.startsWith("https://search.brave.com/search?q="));

  // Search queries with Ecosia
  const ecosiaQuery = normalizeUrl("tree planting", "ecosia");
  assert.ok(ecosiaQuery.startsWith("https://www.ecosia.org/search?q="));
});

test("isAllowedWebUrl only allows safe http and https schemes", () => {
  assert.equal(isAllowedWebUrl("https://example.com"), true);
  assert.equal(isAllowedWebUrl("http://localhost:3000"), true);
  assert.equal(isAllowedWebUrl("file:///C:/secret.txt"), false);
  assert.equal(isAllowedWebUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedWebUrl("data:text/html,<h1>Hello</h1>"), false);
  assert.equal(isAllowedWebUrl("chrome://settings"), false);
  assert.equal(isAllowedWebUrl("aero://settings"), false);
  assert.equal(isAllowedWebUrl(null), false);
  assert.equal(isAllowedWebUrl(123), false);
});

test("isInternalUrl correctly identifies aero:// pages", () => {
  assert.equal(isInternalUrl("aero://newtab"), true);
  assert.equal(isInternalUrl("aero://settings"), true);
  assert.equal(isInternalUrl("https://aero.com"), false);
});

test("isSecureUrl verifies HTTPS protocol", () => {
  assert.equal(isSecureUrl("https://secure.site"), true);
  assert.equal(isSecureUrl("http://insecure.site"), false);
  assert.equal(isSecureUrl("not a url"), false);
});

test("getOrigin and getHostname extract safe values", () => {
  assert.equal(getOrigin("https://sub.example.com:8443/page?x=1"), "https://sub.example.com:8443");
  assert.equal(getHostname("https://sub.example.com:8443/page?x=1"), "sub.example.com");
  assert.equal(getOrigin("invalid"), "unknown");
});

test("normalizeHostname correctly strips protocol, port, path, query, credentials, and ignores internal schemes", () => {
  assert.equal(normalizeHostname("https://edition.cnn.com:8080/world?q=test#top"), "edition.cnn.com");
  assert.equal(normalizeHostname("HTTP://SUB.EXAMPLE.COM/PATH"), "sub.example.com");
  assert.equal(normalizeHostname("user:pass@example.com:443"), "example.com");
  assert.equal(normalizeHostname("example.com:3000"), "example.com");
  assert.equal(normalizeHostname("example.com."), "example.com");
  assert.equal(normalizeHostname("localhost:8080"), "localhost");
  assert.equal(normalizeHostname("https://www.youtube.com/watch?v=123"), "www.youtube.com");
  assert.equal(normalizeHostname("aero://newtab"), "");
  assert.equal(normalizeHostname("devtools://devtools"), "");
  assert.equal(normalizeHostname("chrome-extension://xyz"), "");
  assert.equal(normalizeHostname("about:blank"), "");
  assert.equal(normalizeHostname(null), "");
  assert.equal(normalizeHostname(""), "");
});
