const path = require("node:path");
const fs = require("node:fs/promises");
const { app, webContents } = require("electron");
const { ElectronBlocker, Request } = require("@ghostery/adblocker-electron");
const store = require("./store");
const { normalizeHostname } = require("./url-utils");

class AdBlockManager {
  constructor() {
    this.blocker = null;
    this.initialized = false;
    this.configuredSessions = new WeakSet();
    this.siteStats = new Map(); // hostname -> blocked count
    this.maxSiteStatsSize = 500;
    this.sendToRenderer = () => {};
    this._notifyTimers = new Map();
  }

  setSendFunction(fn) {
    this.sendToRenderer = fn;
  }

  async init() {
    if (this.initialized) return;

    try {
      const cacheDir = app ? app.getPath("userData") : process.cwd();
      const cacheFile = path.join(cacheDir, "aero-adblock-cache.bin");

      let cachedBuffer = null;
      try {
        cachedBuffer = await fs.readFile(cacheFile);
      } catch {
        // No cache yet
      }

      if (cachedBuffer) {
        try {
          this.blocker = ElectronBlocker.deserialize(cachedBuffer);
        } catch {
          this.blocker = null;
        }
      }

      if (!this.blocker) {
        try {
          // Fetch maintained ad/tracker lists using globalThis.fetch
          this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch);
          const serialized = this.blocker.serialize();
          await fs.writeFile(cacheFile, Buffer.from(serialized));
        } catch (fetchErr) {
          console.warn("[AdBlockManager] Remote fetch failed, falling back to built-in rules:", fetchErr.message);
          this.blocker = ElectronBlocker.parse(`
            ||doubleclick.net^
            ||googleads.g.doubleclick.net^
            ||static.doubleclick.net/instream/*
            ||google-analytics.com^
            ||googletagservices.com^
            ||facebook.com/tr/^
            ||adnxs.com^
            ||advertising.com^
            ||criteo.com^
            ||taboola.com^
            ||outbrain.com^
            ||amazon-adsystem.com^
            ||scorecardresearch.com^
            ||quantserve.com^
            ||pubmatic.com^
            ||rubiconproject.com^
            ||adroll.com^
            ||casalemedia.com^
            ||moatads.com^
            ||openx.net^
            ||chartbeat.com^
            ||hotjar.com^
            ||youtube.com/pagead/*
            ||google.com/pagead/*
          `);
        }
      }

      this.initialized = true;
    } catch (err) {
      console.error("[AdBlockManager] Failed to initialize ad blocker:", err);
    }
  }

  isGlobalEnabled(profileId = "default") {
    const settings = store.getSettings(profileId);
    return settings.adblockEnabled !== false; // enabled by default
  }

  isDomainAllowlisted(domain, profileId = "default") {
    const clean = normalizeHostname(domain);
    if (!clean) return false;
    const settings = store.getSettings(profileId);
    const allowlist = Array.isArray(settings.adblockAllowlist) ? settings.adblockAllowlist : [];
    return allowlist.some(allowed => {
      const normAllowed = normalizeHostname(allowed);
      if (!normAllowed) return false;
      if (clean === normAllowed) return true;
      if (clean.endsWith("." + normAllowed)) return true;
      if (normAllowed.startsWith("www.") && clean === normAllowed.slice(4)) return true;
      if (clean.startsWith("www.") && normAllowed === clean.slice(4)) return true;
      return false;
    });
  }

  async toggleSite(domain, profileId = "default") {
    const cleanDomain = normalizeHostname(domain);
    if (!cleanDomain) {
      return { enabled: false, siteEnabled: false, domain: "", blockedCount: 0 };
    }
    const settings = store.getSettings(profileId);
    const rawList = Array.isArray(settings.adblockAllowlist) ? [...settings.adblockAllowlist] : [];
    const allowlist = rawList.map(d => normalizeHostname(d)).filter(Boolean);

    const idx = allowlist.indexOf(cleanDomain);
    let allowedNow = false;
    if (idx >= 0) {
      // Remove from allowlist -> shields UP (blocking active)
      allowlist.splice(idx, 1);
      allowedNow = false;
    } else {
      // Add to allowlist -> shields DOWN (allowed)
      allowlist.push(cleanDomain);
      allowedNow = true;
    }

    await store.updateSettings({ adblockAllowlist: allowlist }, profileId);
    const isNowActive = !allowedNow;
    const count = this.siteStats.get(cleanDomain) || 0;
    this.notifyStats(cleanDomain, profileId, true);

    return {
      enabled: isNowActive,
      siteEnabled: isNowActive,
      domain: cleanDomain,
      blockedCount: count
    };
  }

  async toggleGlobal(profileId = "default") {
    const current = this.isGlobalEnabled(profileId);
    const updated = !current;
    await store.updateSettings({ adblockEnabled: updated }, profileId);
    this.sendToRenderer("adblock:global-updated", updated);
    return {
      enabled: updated,
      globalEnabled: updated
    };
  }

  getTotalBlockedCount() {
    let total = 0;
    for (const count of this.siteStats.values()) {
      total += count;
    }
    return total;
  }

  recordBlocked(host, profileId = "default") {
    if (!host) return;
    const cleanHost = normalizeHostname(host) || host;
    const current = this.siteStats.get(cleanHost) || 0;
    if (this.siteStats.size >= this.maxSiteStatsSize && !this.siteStats.has(cleanHost)) {
      const firstKey = this.siteStats.keys().next().value;
      if (firstKey) this.siteStats.delete(firstKey);
    }
    this.siteStats.set(cleanHost, current + 1);
    this.notifyStats(cleanHost, profileId);
  }

  getStatsForDomain(domain = "", profileId = "default") {
    const cleanDomain = normalizeHostname(domain);
    const blockedCount = cleanDomain ? (this.siteStats.get(cleanDomain) || 0) : 0;
    const isGlobal = this.isGlobalEnabled(profileId);
    const isAllowlisted = cleanDomain ? this.isDomainAllowlisted(cleanDomain, profileId) : false;
    const isEnabled = isGlobal && !isAllowlisted;

    return {
      domain: cleanDomain,
      blockedCount,
      siteBlocked: blockedCount,
      isEnabled,
      siteEnabled: isEnabled,
      isGlobalEnabled: isGlobal,
      globalEnabled: isGlobal,
      isAllowlisted,
      totalBlocked: this.getTotalBlockedCount()
    };
  }

  notifyStats(domain, profileId = "default", immediate = false) {
    if (!domain) return;
    if (immediate) {
      if (this._notifyTimers && this._notifyTimers.has(domain)) {
        clearTimeout(this._notifyTimers.get(domain));
        this._notifyTimers.delete(domain);
      }
      const stats = this.getStatsForDomain(domain, profileId);
      this.sendToRenderer("adblock:stats-updated", stats);
      return;
    }

    if (this._notifyTimers && this._notifyTimers.has(domain)) {
      return;
    }

    if (!this._notifyTimers) this._notifyTimers = new Map();
    const timer = setTimeout(() => {
      this._notifyTimers.delete(domain);
      const stats = this.getStatsForDomain(domain, profileId);
      this.sendToRenderer("adblock:stats-updated", stats);
    }, 120);
    this._notifyTimers.set(domain, timer);
  }

  /**
   * Identifies ad, tracker, and commercial endpoints used by YouTube.
   */
  isYouTubeAdResource(url) {
    if (!url) return false;
    return (
      url.includes("/pagead/") ||
      url.includes("/api/stats/ads") ||
      url.includes("/get_midroll_info") ||
      url.includes("googleads.g.doubleclick.net") ||
      url.includes("static.doubleclick.net/instream/") ||
      url.includes("ad.doubleclick.net") ||
      url.includes("pubads.g.doubleclick.net") ||
      url.includes("securepubads.g.doubleclick.net") ||
      url.includes("play.google.com/log?format=json") ||
      url.includes("/ptracking?adformat=")
    );
  }

  /**
   * Check whether a URL or resource type is essential for video playback or player functionality.
   * Essential resources must NEVER be blocked to avoid breaking playback, audio, quality switching, or manifests.
   */
  isEssentialMediaOrPlaybackResource(url, resourceType) {
    if (!url) return false;

    // Known ad resources are never essential
    if (this.isYouTubeAdResource(url)) {
      return false;
    }

    // Direct media streams, blob URLs, data video streams
    if (
      resourceType === "media" ||
      url.startsWith("blob:") ||
      url.startsWith("mediasource:") ||
      url.startsWith("data:video/") ||
      url.startsWith("data:audio/")
    ) {
      return true;
    }

    // Google Video / YouTube video and audio segments
    if (url.includes(".googlevideo.com/")) {
      return true;
    }

    // YouTube core player manifests, scripts, endpoints, and liveness beacons
    if (
      url.includes("/youtubei/v1/player") ||
      url.includes("/youtubei/v1/next") ||
      url.includes("/youtubei/v1/browse") ||
      url.includes("/youtubei/v1/att/get") ||
      url.includes("/s/player/") ||
      url.includes("/yts/jsbin/") ||
      url.includes("/s/desktop/") ||
      url.includes("youtube.com/watch") ||
      url.includes("youtube.com/embed/") ||
      url.includes("youtube.com/generate_204") ||
      url.includes("youtube.com/api/stats/qoe") ||
      url.includes("youtube.com/api/stats/playback") ||
      url.includes("youtube.com/api/stats/watchtime") ||
      url.includes("youtube.com/ptracking")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Enable real network-level ad and tracker blocking on an Electron session.
   * Uses a unified webRequest pipeline that prevents listener collisions,
   * respects per-site allowlists dynamically on every request, and guarantees
   * legitimate media playback is never broken.
   */
  enableInSession(ses, profileId = "default") {
    if (!ses || !ses.webRequest) return;
    if (this.configuredSessions.has(ses)) {
      return; // Coordinated: exactly one webRequest pipeline per session
    }
    this.configuredSessions.add(ses);

    // 1. Intercept requests before they go to the network
    ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
      const url = details.url;

      // Allow internal schemes and main frame navigations
      if (
        !url ||
        url.startsWith("aero://") ||
        url.startsWith("devtools://") ||
        url.startsWith("chrome-extension://") ||
        details.resourceType === "mainFrame"
      ) {
        return callback({});
      }

      // Check if adblock protection is globally disabled
      if (!this.isGlobalEnabled(profileId)) {
        return callback({});
      }

      // Determine requesting site host
      let siteDomain = "";
      if (details.webContentsId) {
        try {
          const wc = webContents.fromId(details.webContentsId);
          if (wc && !wc.isDestroyed()) {
            const pageUrl = wc.getURL();
            if (pageUrl) siteDomain = normalizeHostname(pageUrl);
          }
        } catch {}
      }
      if (!siteDomain && details.referrer) {
        siteDomain = normalizeHostname(details.referrer);
      }
      if (!siteDomain && details.initiator) {
        siteDomain = normalizeHostname(details.initiator);
      }

      const requestHost = normalizeHostname(url);

      // Check per-site allowlist for site domain OR target request host
      if (
        (siteDomain && this.isDomainAllowlisted(siteDomain, profileId)) ||
        (requestHost && this.isDomainAllowlisted(requestHost, profileId))
      ) {
        return callback({});
      }

      // Explicitly block YouTube ads and trackers if request is an ad resource
      if (this.isYouTubeAdResource(url)) {
        const host = siteDomain || requestHost || "www.youtube.com";
        this.recordBlocked(host, profileId);
        return callback({ cancel: true });
      }

      // Never block essential media streaming or YouTube player resources
      if (this.isEssentialMediaOrPlaybackResource(url, details.resourceType)) {
        return callback({});
      }

      // Match against adblock engine
      if (this.blocker) {
        try {
          const req = Request.fromRawDetails({
            requestId: `${details.id}`,
            url: details.url,
            sourceUrl: details.referrer || (siteDomain ? `https://${siteDomain}/` : details.url),
            type: details.resourceType || "other"
          });

          const match = this.blocker.match(req);

          // If the rule specifies a safe redirect
          if (match.redirect && match.redirect.dataUrl) {
            const host = siteDomain || requestHost;
            this.recordBlocked(host, profileId);
            return callback({ redirectURL: match.redirect.dataUrl });
          }

          // If matching an ad or tracker rule
          if (match.match) {
            const host = siteDomain || requestHost;
            this.recordBlocked(host, profileId);
            return callback({ cancel: true });
          }
        } catch {
          return callback({});
        }
      }

      return callback({});
    });

    // 2. Response headers handling
    ses.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      // Apply nosniff to non-media responses (avoid breaking media chunks with generic content types)
      if (details.resourceType !== "media" && !details.url.includes(".googlevideo.com/")) {
        responseHeaders["X-Content-Type-Options"] = ["nosniff"];
      }
      responseHeaders["Referrer-Policy"] = ["strict-origin-when-cross-origin"];

      callback({ responseHeaders });
    });
  }

  disableInSession(ses) {
    if (!ses || !ses.webRequest) return;
    try {
      ses.webRequest.onBeforeRequest(null);
      ses.webRequest.onHeadersReceived(null);
    } catch {}
    this.configuredSessions.delete(ses);
  }

  /**
   * Inject safe CSS-only cosmetic ad hiding without executing dangerous scriptlets
   * that can cause stack overflows or break complex web applications.
   */
  async injectCosmeticStyles(wc, url, profileId = "default") {
    if (!wc || wc.isDestroyed() || !url) return;

    if (!this.isGlobalEnabled(profileId)) return;
    const host = normalizeHostname(url);
    if (host && this.isDomainAllowlisted(host, profileId)) return;

    // Tailored, non-destructive CSS hiding for YouTube ad banners and overlay slots
    if (url.includes("youtube.com")) {
      try {
        await wc.insertCSS(`
          .ytp-ad-overlay-container,
          .ytp-ad-message-container,
          .video-ads,
          ytd-ad-slot-renderer,
          #player-ads,
          ytd-banner-promo-renderer,
          ytd-in-feed-ad-layout-renderer,
          ytd-promoted-video-renderer,
          ytd-promoted-sparkles-web-renderer,
          ytd-display-ad-renderer,
          ytd-statement-banner-renderer,
          ytd-ad-hover-text-button-renderer,
          #masthead-ad,
          .ytp-ad-progress-list {
            display: none !important;
          }
        `, { cssOrigin: "user" });

        // Event-driven auto-skip for in-stream ads (clicks native skip button without polling or jumping content)
        await wc.executeJavaScript(`
          (() => {
            if (window.__aero_yt_ad_handler) return;
            window.__aero_yt_ad_handler = true;
            const trySkip = () => {
              const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button.ytp-ad-skip-button-text');
              if (skipBtn) skipBtn.click();
            };
            trySkip();
            const obs = new MutationObserver(trySkip);
            obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
          })()
        `, true);
      } catch {}
      return;
    }

    // Generic cosmetic CSS hiding from filter engine
    if (this.blocker && typeof this.blocker.getCosmeticsFilters === "function") {
      try {
        const { styles } = this.blocker.getCosmeticsFilters({
          domain: host,
          hostname: host,
          url,
          getBaseRules: true,
          getInjectionRules: false,
          getExtendedRules: false,
          getRulesFromHostname: true,
          getRulesFromDOM: false
        });

        if (styles && styles.length > 0) {
          await wc.insertCSS(styles, { cssOrigin: "user" });
        }
      } catch {}
    }
  }
}

module.exports = new AdBlockManager();
