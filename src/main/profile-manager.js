const { session } = require("electron");
const store = require("./store");
const adblockManager = require("./adblock-manager");

const PARTITION_PREFIX = "persist:aero-profile-";

class ProfileManager {
  constructor() {
    this.configuredPartitions = new Set();
    this.privateSessions = new Map(); // windowId or privateSessionId -> session
  }

  getPartitionForProfile(profileId = "default") {
    return `${PARTITION_PREFIX}${profileId}`;
  }

  getSessionForProfile(profileId = "default") {
    const partition = this.getPartitionForProfile(profileId);
    const ses = session.fromPartition(partition);
    this.configureSessionIfNeeded(ses, partition, false, profileId);
    return ses;
  }

  createPrivateSession() {
    // Non-persistent partition (omitting 'persist:' prefix makes it ephemeral and in-memory)
    const privatePartition = `aero-private-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ses = session.fromPartition(privatePartition);
    this.configureSessionIfNeeded(ses, privatePartition, true, "private");
    this.privateSessions.set(privatePartition, ses);
    return { session: ses, partition: privatePartition };
  }

  async destroyPrivateSession(privatePartition) {
    const ses = this.privateSessions.get(privatePartition);
    if (ses) {
      try {
        adblockManager.disableInSession(ses);
      } catch {}
      try {
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.clearAuthCache();
      } catch (err) {
        console.error("[ProfileManager] Error clearing private session data:", err);
      }
      this.privateSessions.delete(privatePartition);
      this.configuredPartitions.delete(privatePartition);
    }
  }

  configureSessionIfNeeded(ses, partitionName, isPrivate = false, profileId = "default") {
    if (this.configuredPartitions.has(partitionName)) return;
    this.configuredPartitions.add(partitionName);

    // Network-level ad/tracker blocking and unified security headers are handled by adblockManager
    try {
      adblockManager.enableInSession(ses, profileId);
    } catch (err) {
      console.warn("[ProfileManager] AdBlock enable error:", err.message);
    }


    // Check handler for permissions
    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      if (isPrivate) return false;
      const origin = requestingOrigin || "unknown";
      const permissions = store.getPermissions(profileId);
      const originPerms = permissions[origin];
      if (originPerms && originPerms[permission]) {
        return originPerms[permission].state === "granted";
      }
      return false;
    });
  }

  async clearProfileData(profileId = "default", options = { cookies: true, cache: true, storage: true }) {
    const partition = this.getPartitionForProfile(profileId);
    const ses = session.fromPartition(partition);
    const storages = [];
    if (options.cookies) storages.push("cookies");
    if (options.storage) storages.push("localstorage", "indexdb", "websql", "serviceworkers");

    if (storages.length > 0) {
      await ses.clearStorageData({ storages });
    }
    if (options.cache) {
      await ses.clearCache();
    }
  }
}

module.exports = new ProfileManager();
