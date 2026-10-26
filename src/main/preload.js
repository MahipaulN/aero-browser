const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel, callback) => {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("aero", Object.freeze({
  // Window control
  controlWindow: action => {
    if (["minimize", "maximize", "close"].includes(action)) {
      ipcRenderer.send("window:control", action);
    }
  },

  // Tabs
  listTabs: () => invoke("tabs:list"),
  newTab: (url, activate, options) => invoke("tabs:new", url, activate, options),
  activateTab: id => invoke("tabs:activate", id),
  closeTab: id => invoke("tabs:close", id),
  duplicateTab: id => invoke("tabs:duplicate", id),
  togglePinTab: id => invoke("tabs:togglePin", id),
  reorderTabs: ids => invoke("tabs:reorder", ids),
  restoreClosedTab: () => invoke("tabs:restoreClosed"),

  // Navigation
  navigate: value => invoke("nav:go", value),
  navigationAction: action => invoke("nav:action", action),
  setZoom: factor => invoke("nav:zoom", factor),
  setChromeHeight: height => invoke("nav:chromeHeight", height),

  // Find in page
  findInPage: (text, options) => invoke("find:query", text, options),
  stopFindInPage: action => invoke("find:stop", action),

  // Bookmarks
  listBookmarks: () => invoke("bookmarks:list"),
  addBookmark: bm => invoke("bookmarks:add", bm),
  removeBookmark: idOrUrl => invoke("bookmarks:remove", idOrUrl),
  toggleBookmark: () => invoke("bookmarks:toggle"),
  exportBookmarks: () => invoke("bookmarks:export"),
  importBookmarks: jsonStr => invoke("bookmarks:import", jsonStr),

  // History
  listHistory: () => invoke("history:list"),
  removeHistoryItem: id => invoke("history:remove", id),
  clearHistory: range => invoke("history:clear", range),

  // Downloads
  listDownloads: () => invoke("downloads:list"),
  pauseDownload: id => invoke("downloads:pause", id),
  resumeDownload: id => invoke("downloads:resume", id),
  cancelDownload: id => invoke("downloads:cancel", id),
  openDownload: id => invoke("downloads:open", id),
  showDownloadInFolder: id => invoke("downloads:showInFolder", id),
  clearDownloadHistory: () => invoke("downloads:clearHistory"),

  // Permissions
  listPermissions: () => invoke("permissions:list"),
  revokePermission: (origin, perm) => invoke("permissions:revoke", origin, perm),
  clearAllPermissions: () => invoke("permissions:clearAll"),

  // Settings & Profiles
  getSettings: () => invoke("settings:get"),
  updateSettings: newSettings => invoke("settings:update", newSettings),
  listProfiles: () => invoke("profiles:list"),
  switchProfile: profileId => invoke("profiles:switch", profileId),
  createProfile: (id, name) => invoke("profiles:create", id, name),
  deleteProfile: id => invoke("profiles:delete", id),
  clearSiteData: options => invoke("siteData:clear", options),

  // App info & FS
  getAppInfo: () => invoke("app:info"),
  selectDirectory: () => invoke("app:selectDirectory"),

  // AdBlocker
  adblockGetStats: domain => invoke("adblock:getStats", domain),
  adblockToggleSite: domain => invoke("adblock:toggleSite", domain),
  adblockToggleGlobal: () => invoke("adblock:toggleGlobal"),

  // Native Menus
  showAppMenu: () => invoke("menu:showAppMenu"),
  showTabMenu: tabId => invoke("menu:showTabMenu", tabId),

  // Subscriptions
  onTabsUpdated: callback => subscribe("tabs:updated", callback),
  onBookmarksUpdated: callback => subscribe("bookmarks:updated", callback),
  onThemeUpdated: callback => subscribe("theme:updated", callback),
  onWindowState: callback => subscribe("window:state", callback),
  onToast: callback => subscribe("app:toast", callback),
  onDownloadsUpdated: callback => subscribe("downloads:updated", callback),
  onDownloadDone: callback => subscribe("downloads:done", callback),
  onFindResult: callback => subscribe("find:result", callback),
  onAdblockStatsUpdated: callback => subscribe("adblock:stats-updated", callback),
  onAdblockGlobalUpdated: callback => subscribe("adblock:global-updated", callback),
  onTriggerFind: callback => subscribe("action:trigger-find", callback)
}));
