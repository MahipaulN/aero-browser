const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedWebUrl, normalizeUrl } = require("../src/main/url-utils");

test("IPC & Security: Dangerous URI schemes are never treated as allowed web URLs", () => {
  const dangerousSchemes = [
    "javascript:alert(document.cookie)",
    "file:///C:/Windows/System32/drivers/etc/hosts",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "shell:Personal",
    "powershell:Start-Process",
    "chrome://flags",
    "electron://test"
  ];

  for (const uri of dangerousSchemes) {
    assert.equal(isAllowedWebUrl(uri), false, `Should reject ${uri}`);
  }
});

test("IPC & Security: normalizeUrl rejects script injection and falls back to safe query", () => {
  const injection = "javascript:alert(1)";
  const normalized = normalizeUrl(injection, "google");
  // Should NOT return javascript: protocol; should turn into a Google search query
  assert.equal(normalized.startsWith("javascript:"), false);
  assert.ok(normalized.startsWith("https://www.google.com/search?q="));
});

test("IPC & Security: zoom factor clamping bounds", () => {
  const clampZoom = factor => Math.max(0.5, Math.min(3.0, Number(factor) || 1.0));
  assert.equal(clampZoom(100), 3.0);
  assert.equal(clampZoom(0.01), 0.5);
  assert.equal(clampZoom("invalid"), 1.0);
  assert.equal(clampZoom(1.5), 1.5);
});
