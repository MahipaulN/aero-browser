const { shell, dialog } = require("electron");
const path = require("node:path");
const store = require("./store");

class DownloadManager {
  constructor() {
    this.activeDownloads = new Map(); // id -> { item, meta }
    this.downloadHistory = []; // array of finished or past download metas
    this.idCounter = 0;
    this.sendToRenderer = () => {};
  }

  setSendFunction(fn) {
    this.sendToRenderer = fn;
  }

  setupSessionDownloads(ses, mainWindow, profileId = "default") {
    ses.on("will-download", async (event, item, _webContents) => {
      const id = `dl-${++this.idCounter}`;
      const filename = item.getFilename();
      const totalBytes = item.getTotalBytes();
      const url = item.getURL();
      const mimeType = item.getMimeType();
      const startTime = Date.now();

      const settings = store.getSettings(profileId);
      let defaultDir = settings.downloadPath;
      if (!defaultDir) {
        try {
          const { app } = require("electron");
          defaultDir = app.getPath("downloads");
        } catch {
          defaultDir = process.cwd();
        }
      }

      // Check if user requested "Ask where to save each file"
      if (settings.askDownloadPath && mainWindow && !mainWindow.isDestroyed()) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: "Save File",
          defaultPath: path.join(defaultDir, filename)
        });
        if (result.canceled || !result.filePath) {
          item.cancel();
          return;
        }
        item.setSavePath(result.filePath);
      } else {
        item.setSavePath(path.join(defaultDir, filename));
      }

      const meta = {
        id,
        filename,
        savePath: item.getSavePath(),
        totalBytes,
        receivedBytes: 0,
        speed: 0,
        state: "progressing", // "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
        canResume: item.canResume(),
        url,
        mimeType,
        startTime,
        endTime: null
      };

      this.activeDownloads.set(id, { item, meta });
      this.sendToRenderer("downloads:updated", this.listDownloads());

      let lastBytes = 0;
      let lastTime = Date.now();

      item.on("updated", (_event, state) => {
        const now = Date.now();
        const deltaBytes = item.getReceivedBytes() - lastBytes;
        const deltaTime = (now - lastTime) / 1000;
        const speed = deltaTime > 0 ? Math.round(deltaBytes / deltaTime) : 0;

        lastBytes = item.getReceivedBytes();
        lastTime = now;

        meta.receivedBytes = item.getReceivedBytes();
        meta.totalBytes = item.getTotalBytes();
        meta.state = state; // 'progressing' or 'interrupted'
        meta.canResume = item.canResume();
        meta.speed = speed;

        this.sendToRenderer("downloads:updated", this.listDownloads());
      });

      item.once("done", (_event, state) => {
        meta.state = state; // 'completed', 'cancelled' or 'interrupted'
        meta.endTime = Date.now();
        meta.speed = 0;
        meta.savePath = item.getSavePath();

        this.activeDownloads.delete(id);
        this.downloadHistory.unshift(meta);
        if (this.downloadHistory.length > 50) {
          this.downloadHistory = this.downloadHistory.slice(0, 50);
        }

        this.sendToRenderer("downloads:updated", this.listDownloads());
        this.sendToRenderer("downloads:done", {
          id,
          filename: meta.filename,
          state,
          savePath: meta.savePath
        });
      });
    });
  }

  listDownloads() {
    const active = [...this.activeDownloads.values()].map(d => ({ ...d.meta }));
    return [...active, ...this.downloadHistory];
  }

  pauseDownload(id) {
    const active = this.activeDownloads.get(id);
    if (active && active.meta.state === "progressing") {
      active.item.pause();
      active.meta.state = "paused";
      this.sendToRenderer("downloads:updated", this.listDownloads());
      return true;
    }
    return false;
  }

  resumeDownload(id) {
    const active = this.activeDownloads.get(id);
    if (active && active.item.canResume()) {
      active.item.resume();
      active.meta.state = "progressing";
      this.sendToRenderer("downloads:updated", this.listDownloads());
      return true;
    }
    return false;
  }

  cancelDownload(id) {
    const active = this.activeDownloads.get(id);
    if (active) {
      active.item.cancel();
      active.meta.state = "cancelled";
      this.sendToRenderer("downloads:updated", this.listDownloads());
      return true;
    }
    return false;
  }

  openDownload(id) {
    const all = this.listDownloads();
    const item = all.find(d => d.id === id);
    if (item && item.savePath && item.state === "completed") {
      shell.openPath(item.savePath).catch(err => {
        console.error("[DownloadManager] Failed to open path:", err);
      });
      return true;
    }
    return false;
  }

  showInFolder(id) {
    const all = this.listDownloads();
    const item = all.find(d => d.id === id);
    if (item && item.savePath) {
      shell.showItemInFolder(item.savePath);
      return true;
    }
    return false;
  }

  clearHistory() {
    this.downloadHistory = [];
    this.sendToRenderer("downloads:updated", this.listDownloads());
    return true;
  }
}

module.exports = new DownloadManager();
