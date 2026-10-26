const { dialog } = require("electron");
const store = require("./store");
const { isAllowedWebUrl, getOrigin } = require("./url-utils");

class PermissionManager {
  constructor() {
    this.sessionPermissions = new Map(); // origin:permission -> "granted" | "denied" (for Allow Once / in-memory)
  }

  setupPermissionHandlers(ses, mainWindow, profileId = "default", isPrivate = false) {
    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      const origin = requestingOrigin || "unknown";
      // Check session/temporary grants first
      const memKey = `${origin}:${permission}`;
      if (this.sessionPermissions.has(memKey)) {
        return this.sessionPermissions.get(memKey) === "granted";
      }

      if (isPrivate) return false;

      // Check persistent profile permissions
      const perms = store.getPermissions(profileId);
      if (perms[origin] && perms[origin][permission]) {
        return perms[origin][permission].state === "granted";
      }
      return false;
    });

    ses.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
      const requestUrl = details?.requestingUrl || webContents.getURL();
      if (!isAllowedWebUrl(requestUrl)) {
        return callback(false);
      }

      const origin = getOrigin(requestUrl);
      const memKey = `${origin}:${permission}`;

      // Check if already decided in session or persistent store
      if (this.sessionPermissions.has(memKey)) {
        return callback(this.sessionPermissions.get(memKey) === "granted");
      }

      if (!isPrivate) {
        const perms = store.getPermissions(profileId);
        if (perms[origin] && perms[origin][permission]) {
          return callback(perms[origin][permission].state === "granted");
        }
      }

      // Prompt the user
      try {
        const permissionLabels = {
          geolocation: "access your location",
          notifications: "show desktop notifications",
          media: "access your camera and/or microphone",
          midi: "access MIDI devices",
          pointerLock: "lock your mouse pointer",
          fullscreen: "display content in full screen",
          openExternal: "open an external application"
        };

        const label = permissionLabels[permission] || `request permission: ${permission}`;

        const { response } = await dialog.showMessageBox(mainWindow, {
          type: "question",
          buttons: isPrivate ? ["Allow Once", "Block"] : ["Allow Always", "Allow Once", "Block"],
          defaultId: isPrivate ? 0 : 1,
          cancelId: isPrivate ? 1 : 2,
          noLink: true,
          title: "Permission Request",
          message: `${origin} wants to ${label}.`,
          detail: "Only grant permissions to websites you know and trust."
        });

        if (isPrivate) {
          const granted = response === 0;
          this.sessionPermissions.set(memKey, granted ? "granted" : "denied");
          callback(granted);
        } else {
          if (response === 0) {
            // Allow Always
            await store.setPermission(origin, permission, "granted", profileId);
            this.sessionPermissions.set(memKey, "granted");
            callback(true);
          } else if (response === 1) {
            // Allow Once
            this.sessionPermissions.set(memKey, "granted");
            callback(true);
          } else {
            // Block
            await store.setPermission(origin, permission, "denied", profileId);
            this.sessionPermissions.set(memKey, "denied");
            callback(false);
          }
        }
      } catch (err) {
        console.error("[PermissionManager] Prompt failed:", err);
        callback(false);
      }
    });
  }

  async revokePermission(origin, permission, profileId = "default") {
    const memKey = `${origin}:${permission}`;
    this.sessionPermissions.delete(memKey);
    const perms = store.getPermissions(profileId);
    if (perms[origin]) {
      delete perms[origin][permission];
      if (Object.keys(perms[origin]).length === 0) {
        await store.clearPermissions(origin, profileId);
      } else {
        await store.save();
      }
    }
  }

  listPermissions(profileId = "default") {
    const perms = store.getPermissions(profileId);
    const list = [];
    for (const [origin, originPerms] of Object.entries(perms)) {
      for (const [permission, data] of Object.entries(originPerms)) {
        list.push({
          origin,
          permission,
          state: data.state,
          updatedAt: data.updatedAt
        });
      }
    }
    return list;
  }
}

module.exports = new PermissionManager();
