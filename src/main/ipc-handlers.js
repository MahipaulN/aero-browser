const { ipcMain, BrowserWindow, Menu, dialog, nativeTheme } = require("electron");
const tabManager = require("./tab-manager");
const store = require("./store");
const downloadManager = require("./download-manager");
const permissionManager = require("./permission-manager");
const profileManager = require("./profile-manager");
const adblockManager = require("./adblock-manager");

function registerIpcHandlers(mainWindow, options = {}) {
  const isPrivate = Boolean(options.isPrivate);

  // Window control
  ipcMain.on("window:control", (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === "minimize") win.minimize();
    if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === "close") win.close();
  });

  // Tab management
  ipcMain.handle("tabs:list", () => {
    return {
      tabs: [...tabManager.tabs.values()].map(t => tabManager.tabSummary(t)),
      activeTabId: tabManager.activeTabId,
      canRestoreClosedTab: tabManager.closedTabsStack.length > 0
    };
  });

  ipcMain.handle("tabs:new", (_event, url, activate = true, tabOptions = {}) => {
    return tabManager.createTab(typeof url === "string" ? url : "aero://newtab", activate, tabOptions);
  });

  ipcMain.handle("tabs:activate", (_event, id) => {
    if (typeof id !== "string") return false;
    return tabManager.activateTab(id);
  });

  ipcMain.handle("tabs:close", (_event, id) => {
    if (typeof id !== "string") return false;
    return tabManager.closeTab(id);
  });

  ipcMain.handle("tabs:duplicate", (_event, id) => {
    if (typeof id !== "string") return null;
    return tabManager.duplicateTab(id);
  });

  ipcMain.handle("tabs:togglePin", (_event, id) => {
    if (typeof id !== "string") return false;
    return tabManager.togglePinTab(id);
  });

  ipcMain.handle("tabs:reorder", (_event, orderedIds) => {
    if (!Array.isArray(orderedIds)) return false;
    return tabManager.reorderTabs(orderedIds);
  });

  ipcMain.handle("tabs:restoreClosed", () => {
    return tabManager.restoreClosedTab();
  });

  // Navigation
  ipcMain.handle("nav:go", (_event, value) => {
    if (typeof value !== "string") return false;
    return tabManager.navigate(value);
  });

  ipcMain.handle("nav:action", (_event, action) => {
    if (!["back", "forward", "reload", "stop", "home"].includes(action)) return false;
    return tabManager.navigationAction(action);
  });

  ipcMain.handle("nav:zoom", (_event, factor) => {
    const zoom = Math.max(0.5, Math.min(3.0, Number(factor) || 1.0));
    tabManager.setZoom(zoom);
    return zoom;
  });

  ipcMain.handle("nav:chromeHeight", (_event, height) => {
    tabManager.setChromeHeight(height);
    return true;
  });

  // Find in page
  ipcMain.handle("find:query", (_event, text, findOptions = {}) => {
    tabManager.findInPage(String(text || ""), findOptions);
    return true;
  });

  ipcMain.handle("find:stop", (_event, action = "clearSelection") => {
    tabManager.stopFindInPage(action);
    return true;
  });

  // Bookmarks
  ipcMain.handle("bookmarks:list", () => {
    return store.getBookmarks(tabManager.profileId);
  });

  ipcMain.handle("bookmarks:add", async (_event, bookmark) => {
    if (!bookmark || typeof bookmark.url !== "string") return null;
    const result = await store.addBookmark(bookmark, tabManager.profileId);
    tabManager.sendToRenderer("bookmarks:updated", store.getBookmarks(tabManager.profileId));
    return result;
  });

  ipcMain.handle("bookmarks:remove", async (_event, idOrUrl) => {
    if (typeof idOrUrl !== "string") return false;
    const removed = await store.removeBookmark(idOrUrl, tabManager.profileId);
    if (removed) {
      tabManager.sendToRenderer("bookmarks:updated", store.getBookmarks(tabManager.profileId));
    }
    return removed;
  });

  ipcMain.handle("bookmarks:toggle", async () => {
    const active = tabManager.getActiveTab();
    if (!active || !active.url) return { saved: false };
    const result = await store.toggleBookmark(active.title, active.url, tabManager.profileId);
    tabManager.sendToRenderer("bookmarks:updated", store.getBookmarks(tabManager.profileId));
    return result;
  });

  ipcMain.handle("bookmarks:export", () => {
    return JSON.stringify(store.getBookmarks(tabManager.profileId), null, 2);
  });

  ipcMain.handle("bookmarks:import", async (_event, jsonStr) => {
    try {
      const items = JSON.parse(jsonStr);
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.url) {
            await store.addBookmark({ title: item.title, url: item.url, folder: item.folder }, tabManager.profileId);
          }
        }
        tabManager.sendToRenderer("bookmarks:updated", store.getBookmarks(tabManager.profileId));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  // History
  ipcMain.handle("history:list", () => {
    if (isPrivate) return [];
    return store.getHistory(tabManager.profileId);
  });

  ipcMain.handle("history:remove", async (_event, id) => {
    if (isPrivate || typeof id !== "string") return false;
    return store.removeHistoryItem(id, tabManager.profileId);
  });

  ipcMain.handle("history:clear", async (_event, range = "all") => {
    if (isPrivate) return true;
    return store.clearHistory(range, tabManager.profileId);
  });

  // Downloads
  ipcMain.handle("downloads:list", () => {
    return downloadManager.listDownloads();
  });

  ipcMain.handle("downloads:pause", (_event, id) => downloadManager.pauseDownload(id));
  ipcMain.handle("downloads:resume", (_event, id) => downloadManager.resumeDownload(id));
  ipcMain.handle("downloads:cancel", (_event, id) => downloadManager.cancelDownload(id));
  ipcMain.handle("downloads:open", (_event, id) => downloadManager.openDownload(id));
  ipcMain.handle("downloads:showInFolder", (_event, id) => downloadManager.showInFolder(id));
  ipcMain.handle("downloads:clearHistory", () => downloadManager.clearHistory());

  // Permissions
  ipcMain.handle("permissions:list", () => {
    return permissionManager.listPermissions(tabManager.profileId);
  });

  ipcMain.handle("permissions:revoke", async (_event, origin, permission) => {
    if (typeof origin !== "string" || typeof permission !== "string") return false;
    await permissionManager.revokePermission(origin, permission, tabManager.profileId);
    return true;
  });

  ipcMain.handle("permissions:clearAll", async () => {
    await store.clearPermissions(null, tabManager.profileId);
    return true;
  });

  // Settings
  ipcMain.handle("settings:get", () => {
    return store.getSettings(tabManager.profileId);
  });

  ipcMain.handle("settings:update", async (_event, newSettings) => {
    if (!newSettings || typeof newSettings !== "object") return null;
    const updated = await store.updateSettings(newSettings, tabManager.profileId);
    if (updated.theme) {
      nativeTheme.themeSource = updated.theme;
      tabManager.sendToRenderer("theme:updated", updated.theme);
    }
    if (typeof updated.showBookmarksBar === "boolean") {
      tabManager.setShowBookmarks(updated.showBookmarksBar);
    }
    return updated;
  });

  // Profiles
  ipcMain.handle("profiles:list", () => {
    return {
      profiles: store.getProfiles(),
      activeProfileId: tabManager.profileId,
      isPrivate
    };
  });

  ipcMain.handle("profiles:switch", async (_event, profileId) => {
    if (isPrivate || typeof profileId !== "string") return false;
    store.setActiveProfileId(profileId);
    // Restart active window session or reload tabs
    return true;
  });

  ipcMain.handle("profiles:create", (_event, id, name) => {
    return store.createProfile(id, name);
  });

  ipcMain.handle("profiles:delete", (_event, id) => {
    return store.deleteProfile(id);
  });

  // Site data cleanup
  ipcMain.handle("siteData:clear", async (_event, options) => {
    await profileManager.clearProfileData(tabManager.profileId, options);
    return true;
  });

  // App info
  ipcMain.handle("app:info", () => {
    return {
      version: process.env.npm_package_version || "0.1.0",
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    };
  });

  // Directory picker for download location
  ipcMain.handle("app:selectDirectory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // AdBlocker
  ipcMain.handle("adblock:getStats", (_event, domain) => {
    if (domain !== undefined && typeof domain !== "string") {
      return adblockManager.getStatsForDomain("", tabManager.profileId);
    }
    return adblockManager.getStatsForDomain(domain || "", tabManager.profileId);
  });

  ipcMain.handle("adblock:toggleSite", async (_event, domain) => {
    if (!domain || typeof domain !== "string") {
      const isGlobal = adblockManager.isGlobalEnabled(tabManager.profileId);
      return {
        enabled: false,
        siteEnabled: false,
        isEffectiveEnabled: false,
        isGlobalEnabled: isGlobal,
        globalEnabled: isGlobal,
        isAllowlisted: false,
        domain: "",
        blockedCount: 0
      };
    }
    return adblockManager.toggleSite(domain, tabManager.profileId);
  });

  ipcMain.handle("adblock:toggleGlobal", async () => {
    return adblockManager.toggleGlobal(tabManager.profileId);
  });

  // Native Context Menus (guaranteed to render on top of any WebContentsView)
  ipcMain.handle("menu:showAppMenu", () => {
    const template = [
      {
        label: "New Tab",
        accelerator: "CmdOrCtrl+T",
        click: () => tabManager.createTab("aero://newtab", true)
      },
      {
        label: "Restore Closed Tab",
        accelerator: "CmdOrCtrl+Shift+T",
        enabled: tabManager.closedTabsStack.length > 0,
        click: () => tabManager.restoreClosedTab()
      },
      { type: "separator" },
      {
        label: "History",
        accelerator: "CmdOrCtrl+H",
        click: () => tabManager.navigate("aero://history")
      },
      {
        label: "Downloads",
        accelerator: "CmdOrCtrl+J",
        click: () => tabManager.navigate("aero://downloads")
      },
      {
        label: "Bookmarks Manager",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => tabManager.navigate("aero://bookmarks")
      },
      {
        label: "Find in Page...",
        accelerator: "CmdOrCtrl+F",
        click: () => tabManager.sendToRenderer("action:trigger-find", true)
      },
      { type: "separator" },
      {
        label: "Toggle Theme",
        click: async () => {
          const s = store.getSettings(tabManager.profileId);
          const next = s.theme === "dark" ? "light" : "dark";
          await store.updateSettings({ theme: next }, tabManager.profileId);
          nativeTheme.themeSource = next;
          tabManager.sendToRenderer("theme:updated", next);
        }
      },
      {
        label: "Settings",
        accelerator: "CmdOrCtrl+,",
        click: () => tabManager.navigate("aero://settings")
      },
      { type: "separator" },
      {
        label: "Clear Cookies & Cache",
        click: async () => {
          await profileManager.clearProfileData(tabManager.profileId, { cookies: true, cache: true, storage: true });
          tabManager.sendToRenderer("app:toast", "Cookies and cache cleared");
        }
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
    return true;
  });

  ipcMain.handle("menu:showTabMenu", (_event, tabId) => {
    const tab = tabManager.tabs.get(tabId);
    if (!tab) return false;

    const template = [
      {
        label: "Reload",
        accelerator: "CmdOrCtrl+R",
        click: () => tabManager.navigationAction("reload")
      },
      {
        label: "Duplicate Tab",
        click: () => tabManager.duplicateTab(tabId)
      },
      {
        label: tab.pinned ? "Unpin Tab" : "Pin Tab",
        click: () => tabManager.togglePinTab(tabId)
      },
      { type: "separator" },
      {
        label: "Close Tab",
        accelerator: "CmdOrCtrl+W",
        click: () => tabManager.closeTab(tabId)
      },
      {
        label: "Close Other Tabs",
        click: () => {
          for (const [id] of tabManager.tabs) {
            if (id !== tabId) tabManager.closeTab(id);
          }
        }
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
    return true;
  });
}

module.exports = { registerIpcHandlers };
