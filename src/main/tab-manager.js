const { WebContentsView, app, shell } = require("electron");
const { normalizeUrl, isAllowedWebUrl, isInternalUrl } = require("./url-utils");
const profileManager = require("./profile-manager");
const permissionManager = require("./permission-manager");
const adblockManager = require("./adblock-manager");
const store = require("./store");

const MAX_TABS = 32;

class TabManager {
  constructor() {
    this.mainWindow = null;
    this.tabs = new Map(); // id -> tabObject
    this.activeTabId = null;
    this.tabCounter = 0;
    this.closedTabsStack = []; // for Ctrl+Shift+T restore
    this.chromeHeight = 88; // Dynamic: 88px default without bookmarks, 118px with bookmarks
    this.showBookmarks = true;
    this.profileId = "default";
    this.isPrivate = false;
    this.sendToRenderer = () => {};
  }

  init(mainWindow, options = {}) {
    this.mainWindow = mainWindow;
    this.profileId = options.profileId || "default";
    this.isPrivate = Boolean(options.isPrivate);
    this.chromeHeight = options.showBookmarks ? 118 : 88;
    this.showBookmarks = Boolean(options.showBookmarks);
  }

  setSendFunction(fn) {
    this.sendToRenderer = fn;
  }

  setChromeHeight(height) {
    const newHeight = Math.max(70, Number(height) || 88);
    if (this.chromeHeight === newHeight) return;
    this.chromeHeight = newHeight;
    this.layoutActiveView();
  }

  setShowBookmarks(visible) {
    const next = Boolean(visible);
    if (this.showBookmarks === next) return;
    this.showBookmarks = next;
    this.chromeHeight = this.showBookmarks ? 118 : 88;
    this.layoutActiveView();
  }

  getContentBounds() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return { x: 0, y: this.chromeHeight, width: 1200, height: 700 };
    }
    const [width, height] = this.mainWindow.getContentSize();
    return {
      x: 0,
      y: this.chromeHeight,
      width,
      height: Math.max(100, height - this.chromeHeight)
    };
  }

  tabSummary(tab) {
    const wc = tab.view?.webContents;
    const isDestroyed = !wc || wc.isDestroyed();
    let canGoBack = false;
    let canGoForward = false;
    if (!isDestroyed) {
      try {
        canGoBack = Boolean(wc.navigationHistory ? wc.navigationHistory.canGoBack() : (wc.canGoBack ? wc.canGoBack() : false));
        canGoForward = Boolean(wc.navigationHistory ? wc.navigationHistory.canGoForward() : (wc.canGoForward ? wc.canGoForward() : false));
      } catch {}
    }
    return {
      id: tab.id,
      title: tab.title || "New Tab",
      url: tab.url || "aero://newtab",
      favicon: tab.favicon || null,
      loading: Boolean(tab.loading),
      canGoBack,
      canGoForward,
      pinned: Boolean(tab.pinned),
      isPrivate: Boolean(tab.isPrivate),
      zoomLevel: tab.zoomLevel || 1.0
    };
  }

  publishTabs() {
    const list = [...this.tabs.values()].map(t => this.tabSummary(t));
    this.sendToRenderer("tabs:updated", {
      tabs: list,
      activeTabId: this.activeTabId,
      canRestoreClosedTab: this.closedTabsStack.length > 0
    });
  }

  getActiveTab() {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : null;
  }

  layoutActiveView() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const bounds = this.getContentBounds();
    const activeTab = this.getActiveTab();

    if (!activeTab || !activeTab.view || activeTab.view.webContents.isDestroyed()) {
      return;
    }

    // Hide any inactive tab views without destroying their presentation surfaces
    for (const [id, entry] of this.tabs.entries()) {
      if (!entry.view || entry.view.webContents.isDestroyed()) continue;
      if (id !== this.activeTabId) {
        try {
          entry.view.setVisible(false);
        } catch {}
      }
    }

    const isWeb = isAllowedWebUrl(activeTab.url);
    if (isWeb) {
      try {
        if (!this.mainWindow.contentView.children.includes(activeTab.view)) {
          this.mainWindow.contentView.addChildView(activeTab.view);
        }
        const last = activeTab.lastBounds;
        if (!last || last.x !== bounds.x || last.y !== bounds.y || last.width !== bounds.width || last.height !== bounds.height) {
          activeTab.view.setBounds(bounds);
          activeTab.lastBounds = { ...bounds };
        }
        activeTab.view.setVisible(true);
      } catch (err) {
        console.error("[TabManager] Error attaching active WebContentsView:", err);
      }
    } else {
      // Inactive or internal aero:// URL: hide WebContentsView so renderer HTML start page is visible
      try {
        activeTab.view.setVisible(false);
      } catch {}
    }
  }

  createTab(initialUrl = "aero://newtab", activate = true, options = {}) {
    if (this.tabs.size >= MAX_TABS) {
      this.sendToRenderer("app:toast", `Maximum ${MAX_TABS} tabs reached`);
      return null;
    }

    const id = `tab-${++this.tabCounter}`;
    const isPrivate = this.isPrivate || Boolean(options.isPrivate);

    let ses;
    let privatePartition = null;
    if (isPrivate) {
      const p = profileManager.createPrivateSession();
      ses = p.session;
      privatePartition = p.partition;
    } else {
      ses = profileManager.getSessionForProfile(this.profileId);
    }

    permissionManager.setupPermissionHandlers(ses, this.mainWindow, this.profileId, isPrivate);

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
        autoplayPolicy: "no-user-gesture-required"
      }
    });

    view.setBackgroundColor("#ffffff");
    view.setVisible(false);

    const resolvedUrl = initialUrl || "aero://newtab";
    let initialTitle = "New Tab";
    if (isInternalUrl(resolvedUrl)) {
      const route = resolvedUrl.replace("aero://", "");
      initialTitle = route === "newtab" ? "New Tab" : (route.charAt(0).toUpperCase() + route.slice(1));
    }

    const tab = {
      id,
      view,
      title: initialTitle,
      url: resolvedUrl,
      favicon: null,
      loading: false,
      pinned: Boolean(options.pinned),
      isPrivate,
      privatePartition,
      zoomLevel: 1.0
    };

    this.tabs.set(id, tab);
    const wc = view.webContents;

    // Window open handler for target="_blank"
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowedWebUrl(url)) {
        this.createTab(url, true, { isPrivate: tab.isPrivate });
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: "deny" };
    });

    // Intercept keyboard shortcuts while web content has focus
    wc.on("before-input-event", (event, input) => {
      const handled = this.handleShortcut(input);
      if (handled) {
        event.preventDefault();
      }
    });

    wc.on("page-title-updated", (_event, title) => {
      tab.title = title || "New Tab";
      this.publishTabs();
    });

    wc.on("page-favicon-updated", (_event, favicons) => {
      if (Array.isArray(favicons) && favicons.length > 0) {
        tab.favicon = favicons[0];
        this.publishTabs();
      }
    });

    wc.on("did-start-loading", () => {
      tab.loading = true;
      this.publishTabs();
    });

    wc.on("did-stop-loading", () => {
      tab.loading = false;
      this.publishTabs();
    });

    // Apply safe cosmetic CSS rules when page DOM is ready
    wc.on("dom-ready", () => {
      const currentUrl = wc.getURL();
      if (currentUrl && isAllowedWebUrl(currentUrl)) {
        adblockManager.injectCosmeticStyles(wc, currentUrl, this.profileId);
      }
    });

    wc.on("did-navigate", (_event, url) => {
      if (!isAllowedWebUrl(url)) return;
      tab.url = url;
      this.layoutActiveView();

      if (!isPrivate) {
        store.addHistory({ title: tab.title, url }, this.profileId);
      }
      adblockManager.injectCosmeticStyles(wc, url, this.profileId);
      this.publishTabs();
    });

    wc.on("did-navigate-in-page", (_event, url) => {
      if (isAllowedWebUrl(url)) {
        tab.url = url;
        adblockManager.injectCosmeticStyles(wc, url, this.profileId);
        this.publishTabs();
      }
    });

    wc.on("render-process-gone", (_event, details) => {
      console.warn(`[TabManager] Tab ${id} render process gone:`, details);
      tab.loading = false;
      this.sendToRenderer("app:toast", `Tab crashed (${details.reason}): ${tab.title}`);
      this.publishTabs();
    });

    wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      // Ignore aborts like -3 (ERR_ABORTED) when navigation was cancelled
      if (errorCode !== -3 && errorCode !== 0) {
        this.sendToRenderer("app:toast", `Failed to load ${validatedURL}: ${errorDescription}`);
      }
      tab.loading = false;
      this.publishTabs();
    });

    // Find in page events
    wc.on("found-in-page", (_event, result) => {
      this.sendToRenderer("find:result", {
        tabId: id,
        requestId: result.requestId,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate
      });
    });

    if (initialUrl && initialUrl !== "aero://newtab") {
      const settings = store.getSettings(this.profileId);
      const target = normalizeUrl(initialUrl, settings.searchEngine);
      if (isAllowedWebUrl(target)) {
        wc.loadURL(target).catch(() => {});
      }
    }

    if (activate) {
      this.activateTab(id);
    } else {
      this.publishTabs();
    }

    return id;
  }

  activateTab(id) {
    if (!this.tabs.has(id)) return false;
    const prevId = this.activeTabId;
    if (prevId && prevId !== id && this.tabs.has(prevId)) {
      const prevTab = this.tabs.get(prevId);
      if (prevTab && prevTab.view && !prevTab.view.webContents.isDestroyed()) {
        try {
          prevTab.view.setVisible(false);
        } catch {}
      }
    }
    this.activeTabId = id;
    this.layoutActiveView();
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed() && isAllowedWebUrl(activeTab.url)) {
      try {
        activeTab.view.webContents.focus();
      } catch {}
    }
    this.publishTabs();
    return true;
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return false;

    // Save to closed tabs stack if it had a URL
    if (tab.url && isAllowedWebUrl(tab.url)) {
      this.closedTabsStack.push({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned
      });
      if (this.closedTabsStack.length > 20) {
        this.closedTabsStack.shift();
      }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        if (this.mainWindow.contentView.children.includes(tab.view)) {
          this.mainWindow.contentView.removeChildView(tab.view);
        }
      } catch {}
    }

    this.tabs.delete(id);
    if (tab.view) {
      try {
        const wc = tab.view.webContents;
        if (wc && !wc.isDestroyed()) {
          wc.stop();
          wc.removeAllListeners();
          wc.close();
        }
      } catch {}
      tab.view = null;
    }

    if (tab.isPrivate && tab.privatePartition) {
      profileManager.destroyPrivateSession(tab.privatePartition).catch(() => {});
    }

    if (this.activeTabId === id) {
      const keys = [...this.tabs.keys()];
      if (keys.length > 0) {
        this.activeTabId = keys[keys.length - 1];
        this.layoutActiveView();
      } else {
        // If last tab was closed, create a fresh new tab
        this.createTab("aero://newtab", true);
      }
    }

    this.publishTabs();
    return true;
  }

  restoreClosedTab() {
    if (this.closedTabsStack.length === 0) return null;
    const last = this.closedTabsStack.pop();
    return this.createTab(last.url, true, { pinned: last.pinned });
  }

  duplicateTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return null;
    return this.createTab(tab.url || "aero://newtab", true, { pinned: tab.pinned });
  }

  togglePinTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return false;
    tab.pinned = !tab.pinned;
    this.publishTabs();
    return tab.pinned;
  }

  reorderTabs(orderedIds) {
    if (!Array.isArray(orderedIds)) return false;
    const reordered = new Map();
    for (const id of orderedIds) {
      if (this.tabs.has(id)) {
        reordered.set(id, this.tabs.get(id));
      }
    }
    // Append any remaining tabs not present in orderedIds
    for (const [id, tab] of this.tabs.entries()) {
      if (!reordered.has(id)) {
        reordered.set(id, tab);
      }
    }
    this.tabs = reordered;
    this.publishTabs();
    return true;
  }

  navigate(value) {
    const tab = this.getActiveTab();
    if (!tab) return false;

    const settings = store.getSettings(this.profileId);
    const targetUrl = normalizeUrl(value, settings.searchEngine);

    if (isInternalUrl(targetUrl)) {
      tab.url = targetUrl;
      const route = targetUrl.replace("aero://", "");
      tab.title = route === "newtab" ? "New Tab" : (route.charAt(0).toUpperCase() + route.slice(1));
      this.layoutActiveView();
      this.publishTabs();
      return true;
    }

    if (isAllowedWebUrl(targetUrl)) {
      tab.url = targetUrl;
      tab.view.webContents.loadURL(targetUrl).catch(() => {
        this.sendToRenderer("app:toast", "Could not navigate to address");
      });
      this.layoutActiveView();
      this.publishTabs();
      return true;
    }
    return false;
  }

  navigationAction(action) {
    const tab = this.getActiveTab();
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return false;
    const wc = tab.view.webContents;

    switch (action) {
      case "back": {
        const canBack = (wc.navigationHistory && typeof wc.navigationHistory.canGoBack === "function")
          ? wc.navigationHistory.canGoBack()
          : (typeof wc.canGoBack === "function" ? wc.canGoBack() : false);
        if (canBack) {
          if (wc.navigationHistory && typeof wc.navigationHistory.goBack === "function") {
            wc.navigationHistory.goBack();
          } else {
            wc.goBack();
          }
        }
        break;
      }
      case "forward": {
        const canFwd = (wc.navigationHistory && typeof wc.navigationHistory.canGoForward === "function")
          ? wc.navigationHistory.canGoForward()
          : (typeof wc.canGoForward === "function" ? wc.canGoForward() : false);
        if (canFwd) {
          if (wc.navigationHistory && typeof wc.navigationHistory.goForward === "function") {
            wc.navigationHistory.goForward();
          } else {
            wc.goForward();
          }
        }
        break;
      }
      case "reload":
        wc.reload();
        break;
      case "reload-ignoring-cache":
        if (typeof wc.reloadIgnoringCache === "function") {
          wc.reloadIgnoringCache();
        } else {
          wc.reload();
        }
        break;
      case "stop":
        wc.stop();
        break;
      case "home": {
        const settings = store.getSettings(this.profileId);
        const home = settings.homePage || "aero://newtab";
        this.navigate(home);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  activateTabByIndex(index) {
    const tabList = [...this.tabs.keys()];
    if (tabList.length === 0) return false;
    const targetIdx = Math.max(0, Math.min(index, tabList.length - 1));
    return this.activateTab(tabList[targetIdx]);
  }

  activateLastTab() {
    const tabList = [...this.tabs.keys()];
    if (tabList.length === 0) return false;
    return this.activateTab(tabList[tabList.length - 1]);
  }

  activateNextTab() {
    const tabList = [...this.tabs.keys()];
    if (tabList.length <= 1) return false;
    const currIdx = tabList.indexOf(this.activeTabId);
    const nextIdx = (currIdx + 1) % tabList.length;
    return this.activateTab(tabList[nextIdx]);
  }

  activatePreviousTab() {
    const tabList = [...this.tabs.keys()];
    if (tabList.length <= 1) return false;
    const currIdx = tabList.indexOf(this.activeTabId);
    const prevIdx = (currIdx - 1 + tabList.length) % tabList.length;
    return this.activateTab(tabList[prevIdx]);
  }

  handleShortcut(input) {
    if (!input || input.type !== "keyDown") return false;

    const isCtrlOrCmd = process.platform === "darwin" ? Boolean(input.meta) : Boolean(input.control);
    const isAlt = Boolean(input.alt);
    const isShift = Boolean(input.shift);
    const key = (input.key || "").toLowerCase();

    // 1. Navigation shortcuts
    // Alt + Left: Back
    if (isAlt && !isCtrlOrCmd && (input.key === "ArrowLeft" || input.code === "ArrowLeft")) {
      this.navigationAction("back");
      return true;
    }
    // Alt + Right: Forward
    if (isAlt && !isCtrlOrCmd && (input.key === "ArrowRight" || input.code === "ArrowRight")) {
      this.navigationAction("forward");
      return true;
    }
    // Ctrl + R or F5: Reload (with Shift for hard reload)
    if ((isCtrlOrCmd && !isAlt && key === "r") || input.key === "F5") {
      if (isShift || (input.key === "F5" && isCtrlOrCmd)) {
        this.navigationAction("reload-ignoring-cache");
      } else {
        this.navigationAction("reload");
      }
      return true;
    }
    // Escape: Stop loading or cancel omnibox editing
    if (input.key === "Escape" && !isCtrlOrCmd && !isAlt && !isShift) {
      const active = this.getActiveTab();
      if (active && active.loading) {
        this.navigationAction("stop");
        return true;
      }
      this.sendToRenderer("action:escape");
      return true;
    }

    // 2. Address bar shortcuts (Ctrl+L, Alt+D, F6)
    if (
      (isCtrlOrCmd && !isAlt && !isShift && key === "l") ||
      (isAlt && !isCtrlOrCmd && !isShift && key === "d") ||
      (input.key === "F6" && !isCtrlOrCmd && !isAlt && !isShift)
    ) {
      this.sendToRenderer("action:focus-omnibox");
      return true;
    }

    // 3. Tab management shortcuts
    // Ctrl + T: New tab
    if (isCtrlOrCmd && !isAlt && !isShift && key === "t") {
      this.createTab("aero://newtab", true);
      return true;
    }
    // Ctrl + W: Close current tab
    if (isCtrlOrCmd && !isAlt && !isShift && key === "w") {
      if (this.activeTabId) this.closeTab(this.activeTabId);
      return true;
    }
    // Ctrl + Shift + T: Reopen closed tab
    if (isCtrlOrCmd && !isAlt && isShift && key === "t") {
      this.restoreClosedTab();
      return true;
    }
    // Ctrl + Tab / Ctrl + Shift + Tab: Switch tabs
    if (isCtrlOrCmd && !isAlt && (input.key === "Tab" || input.code === "Tab")) {
      if (isShift) {
        this.activatePreviousTab();
      } else {
        this.activateNextTab();
      }
      return true;
    }
    // Ctrl + 1..8: Select corresponding tab
    if (isCtrlOrCmd && !isAlt && !isShift && /^[1-8]$/.test(input.key)) {
      const index = parseInt(input.key, 10) - 1;
      this.activateTabByIndex(index);
      return true;
    }
    // Ctrl + 9: Select last tab
    if (isCtrlOrCmd && !isAlt && !isShift && input.key === "9") {
      this.activateLastTab();
      return true;
    }

    // 4. Other shortcuts
    // Ctrl + D: Bookmark current page
    if (isCtrlOrCmd && !isAlt && !isShift && key === "d") {
      this.sendToRenderer("action:trigger-bookmark");
      return true;
    }
    // Ctrl + F: Find in page
    if (isCtrlOrCmd && !isAlt && !isShift && key === "f") {
      this.sendToRenderer("action:trigger-find");
      return true;
    }
    // Ctrl + H: History
    if (isCtrlOrCmd && !isAlt && !isShift && key === "h") {
      this.navigate("aero://history");
      return true;
    }
    // Ctrl + J: Downloads
    if (isCtrlOrCmd && !isAlt && !isShift && key === "j") {
      this.navigate("aero://downloads");
      return true;
    }
    // Ctrl + Shift + Delete: Clear browsing data
    if (isCtrlOrCmd && !isAlt && isShift && (input.key === "Delete" || input.code === "Delete")) {
      this.sendToRenderer("action:open-clear-data");
      return true;
    }
    // F11: Toggle fullscreen
    if (input.key === "F11" && !isCtrlOrCmd && !isAlt && !isShift) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
      }
      return true;
    }

    return false;
  }

  setZoom(factor) {
    const tab = this.getActiveTab();
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return;
    tab.zoomLevel = factor;
    tab.view.webContents.setZoomFactor(factor);
    this.publishTabs();
  }

  findInPage(text, options = {}) {
    const tab = this.getActiveTab();
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return;
    if (!text) {
      tab.view.webContents.stopFindInPage("clearSelection");
      return;
    }
    tab.view.webContents.findInPage(text, {
      forward: options.forward !== false,
      findNext: Boolean(options.findNext),
      matchCase: false
    });
  }

  stopFindInPage(action = "clearSelection") {
    const tab = this.getActiveTab();
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return;
    tab.view.webContents.stopFindInPage(action);
  }

  destroy() {
    for (const id of [...this.tabs.keys()]) {
      this.closeTab(id);
    }
    this.tabs.clear();
    this.mainWindow = null;
  }
}

module.exports = new TabManager();
