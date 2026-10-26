const { app, BrowserWindow, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const store = require("./store");
const profileManager = require("./profile-manager");
const downloadManager = require("./download-manager");
const adblockManager = require("./adblock-manager");
const tabManager = require("./tab-manager");
const { registerIpcHandlers } = require("./ipc-handlers");

const APP_NAME = "Aero Browser";
let mainWindow = null;

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function createWindow() {
  const profileId = store.getActiveProfileId();
  const settings = store.getSettings(profileId);

  let iconPath = path.join(__dirname, "../../build/icon.ico");
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, "../renderer/assets/icon.png");
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 840,
    minHeight: 560,
    title: APP_NAME,
    icon: iconPath,
    frame: false,
    backgroundColor: settings.theme === "dark" ? "#171b26" : "#edf1f8",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  // Connect manager sender functions
  tabManager.setSendFunction(sendToWindow);
  downloadManager.setSendFunction(sendToWindow);
  adblockManager.setSendFunction(sendToWindow);

  // Initialize subsystems
  tabManager.init(mainWindow, {
    profileId,
    isPrivate: false,
    showBookmarks: settings.showBookmarksBar
  });

  const ses = profileManager.getSessionForProfile(profileId);
  downloadManager.setupSessionDownloads(ses, mainWindow, profileId);

  registerIpcHandlers(mainWindow, { isPrivate: false });

  // Load the chrome interface
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // Create the single primary tab on start
    const startupBehavior = settings.startupBehavior || "newtab";
    if (startupBehavior === "custom" && settings.startupUrl) {
      tabManager.createTab(settings.startupUrl, true);
    } else {
      tabManager.createTab("aero://newtab", true);
    }
  });

  let resizeTimer = null;
  mainWindow.on("resize", () => {
    if (resizeTimer) return;
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      tabManager.layoutActiveView();
    }, 16);
  });

  mainWindow.on("maximize", () => {
    sendToWindow("window:state", true);
    tabManager.layoutActiveView();
  });

  mainWindow.on("unmaximize", () => {
    sendToWindow("window:state", false);
    tabManager.layoutActiveView();
  });

  mainWindow.on("closed", () => {
    tabManager.destroy();
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.aerobrowser.desktop");
    await store.init();
    await adblockManager.init();

    const profileId = store.getActiveProfileId();
    const settings = store.getSettings(profileId);
    nativeTheme.themeSource = settings.theme || "system";

    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
