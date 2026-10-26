const path = require("node:path");
const fs = require("node:fs/promises");
const { app } = require("electron");

const DEFAULT_SETTINGS = {
  theme: "system",
  accentColor: "#6489f5",
  searchEngine: "google",
  homePage: "aero://newtab",
  startupBehavior: "newtab",
  startupUrl: "",
  downloadPath: "",
  askDownloadPath: false,
  defaultZoom: 1.0,
  newTabWallpaper: "aurora",
  showBookmarksBar: true,
  adblockEnabled: true,
  adblockAllowlist: []
};

const DEFAULT_PROFILE_META = {
  id: "default",
  name: "Default Profile",
  avatar: "👤",
  createdAt: Date.now()
};

class Store {
  constructor() {
    this.storePath = null;
    this.data = {
      version: 1,
      activeProfileId: "default",
      profiles: [DEFAULT_PROFILE_META],
      profileData: {
        default: {
          bookmarks: [
            { id: "bm-1", title: "Google", url: "https://www.google.com/", folder: "Favorites", createdAt: Date.now() },
            { id: "bm-2", title: "GitHub", url: "https://github.com/", folder: "Favorites", createdAt: Date.now() },
            { id: "bm-3", title: "Wikipedia", url: "https://www.wikipedia.org/", folder: "Favorites", createdAt: Date.now() },
            { id: "bm-4", title: "YouTube", url: "https://www.youtube.com/", folder: "Favorites", createdAt: Date.now() }
          ],
          history: [],
          settings: { ...DEFAULT_SETTINGS },
          permissions: {}
        }
      }
    };
  }

  async init(customPath = null) {
    if (customPath) {
      this.storePath = customPath;
    } else {
      const userData = app ? app.getPath("userData") : process.cwd();
      this.storePath = path.join(userData, "aero-data-v2.json");
    }

    if (!this.data.profileData.default.settings.downloadPath && app) {
      try {
        this.data.profileData.default.settings.downloadPath = app.getPath("downloads");
      } catch {
        this.data.profileData.default.settings.downloadPath = "";
      }
    }

    await this.load();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
          this.data.profiles = parsed.profiles;
        }
        if (typeof parsed.activeProfileId === "string") {
          this.data.activeProfileId = parsed.activeProfileId;
        }
        if (parsed.profileData && typeof parsed.profileData === "object") {
          this.data.profileData = parsed.profileData;
        }
        // Ensure default profile exists
        this.ensureProfile("default", "Default Profile");
      }
    } catch {
      // File doesn't exist or is invalid; persist default structure
      await this.save();
    }
  }

  async save() {
    if (!this.storePath) return;
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const tmpPath = `${this.storePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
      await fs.rename(tmpPath, this.storePath);
    } catch (err) {
      console.error("[Store] Failed to save store:", err);
    }
  }

  ensureProfile(profileId, name = "Profile") {
    if (!this.data.profiles.some(p => p.id === profileId)) {
      this.data.profiles.push({
        id: profileId,
        name,
        avatar: "👤",
        createdAt: Date.now()
      });
    }
    if (!this.data.profileData[profileId]) {
      this.data.profileData[profileId] = {
        bookmarks: [],
        history: [],
        settings: { ...DEFAULT_SETTINGS },
        permissions: {}
      };
    }
  }

  getActiveProfileId() {
    return this.data.activeProfileId || "default";
  }

  setActiveProfileId(profileId) {
    if (this.data.profiles.some(p => p.id === profileId)) {
      this.data.activeProfileId = profileId;
      this.save();
      return true;
    }
    return false;
  }

  getProfiles() {
    return [...this.data.profiles];
  }

  createProfile(id, name) {
    const cleanId = String(id).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanId || this.data.profiles.some(p => p.id === cleanId)) {
      return false;
    }
    this.ensureProfile(cleanId, name || cleanId);
    this.save();
    return true;
  }

  deleteProfile(id) {
    if (id === "default" || this.data.profiles.length <= 1) return false;
    this.data.profiles = this.data.profiles.filter(p => p.id !== id);
    delete this.data.profileData[id];
    if (this.data.activeProfileId === id) {
      this.data.activeProfileId = "default";
    }
    this.save();
    return true;
  }

  getProfileData(profileId = null) {
    const id = profileId || this.getActiveProfileId();
    this.ensureProfile(id);
    return this.data.profileData[id];
  }

  // Bookmarks
  getBookmarks(profileId = null) {
    return [...this.getProfileData(profileId).bookmarks];
  }

  async addBookmark(bookmark, profileId = null) {
    const pData = this.getProfileData(profileId);
    const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newBookmark = {
      id,
      title: bookmark.title || "Untitled",
      url: bookmark.url,
      folder: bookmark.folder || "Favorites",
      createdAt: Date.now()
    };
    pData.bookmarks.push(newBookmark);
    await this.save();
    return newBookmark;
  }

  async removeBookmark(idOrUrl, profileId = null) {
    const pData = this.getProfileData(profileId);
    const initialLen = pData.bookmarks.length;
    pData.bookmarks = pData.bookmarks.filter(b => b.id !== idOrUrl && b.url !== idOrUrl);
    const changed = pData.bookmarks.length !== initialLen;
    if (changed) await this.save();
    return changed;
  }

  async toggleBookmark(title, url, profileId = null) {
    const pData = this.getProfileData(profileId);
    const existingIdx = pData.bookmarks.findIndex(b => b.url === url);
    if (existingIdx >= 0) {
      pData.bookmarks.splice(existingIdx, 1);
      await this.save();
      return { saved: false, bookmarks: pData.bookmarks };
    } else {
      const bm = {
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: title || url,
        url,
        folder: "Favorites",
        createdAt: Date.now()
      };
      pData.bookmarks.push(bm);
      await this.save();
      return { saved: true, bookmark: bm, bookmarks: pData.bookmarks };
    }
  }

  // History
  getHistory(profileId = null) {
    return [...this.getProfileData(profileId).history].reverse();
  }

  async addHistory(entry, profileId = null) {
    if (!entry || !entry.url || entry.url.startsWith("aero://")) return;
    const pData = this.getProfileData(profileId);
    // Avoid immediate duplicate navigation spam
    const last = pData.history[pData.history.length - 1];
    if (last && last.url === entry.url && Date.now() - last.visitedAt < 5000) {
      return;
    }
    pData.history.push({
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: entry.title || entry.url,
      url: entry.url,
      visitedAt: Date.now()
    });
    // Keep last 3000 history entries
    if (pData.history.length > 3000) {
      pData.history = pData.history.slice(-3000);
    }
    await this.save();
  }

  async removeHistoryItem(id, profileId = null) {
    const pData = this.getProfileData(profileId);
    pData.history = pData.history.filter(h => h.id !== id);
    await this.save();
    return true;
  }

  async clearHistory(range = "all", profileId = null) {
    const pData = this.getProfileData(profileId);
    if (range === "all") {
      pData.history = [];
    } else if (range === "hour") {
      const cutoff = Date.now() - 3600 * 1000;
      pData.history = pData.history.filter(h => h.visitedAt < cutoff);
    } else if (range === "day") {
      const cutoff = Date.now() - 86400 * 1000;
      pData.history = pData.history.filter(h => h.visitedAt < cutoff);
    } else if (range === "week") {
      const cutoff = Date.now() - 7 * 86400 * 1000;
      pData.history = pData.history.filter(h => h.visitedAt < cutoff);
    }
    await this.save();
    return true;
  }

  // Settings
  getSettings(profileId = null) {
    return { ...DEFAULT_SETTINGS, ...this.getProfileData(profileId).settings };
  }

  async updateSettings(newSettings, profileId = null) {
    const pData = this.getProfileData(profileId);
    pData.settings = { ...pData.settings, ...newSettings };
    await this.save();
    return pData.settings;
  }

  // Permissions
  getPermissions(profileId = null) {
    return { ...this.getProfileData(profileId).permissions };
  }

  async setPermission(origin, permission, state, profileId = null) {
    const pData = this.getProfileData(profileId);
    if (!pData.permissions[origin]) {
      pData.permissions[origin] = {};
    }
    pData.permissions[origin][permission] = {
      state, // "granted" | "denied"
      updatedAt: Date.now()
    };
    await this.save();
    return true;
  }

  async clearPermissions(origin = null, profileId = null) {
    const pData = this.getProfileData(profileId);
    if (origin) {
      delete pData.permissions[origin];
    } else {
      pData.permissions = {};
    }
    await this.save();
    return true;
  }
}

module.exports = new Store();
