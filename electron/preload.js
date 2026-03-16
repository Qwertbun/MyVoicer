"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getBackendUrl: () => ipcRenderer.invoke("app:get-backend-url"),
  notificationsSupported: () => ipcRenderer.invoke("notifications:supported"),
  showDesktopNotification: (payload) => ipcRenderer.invoke("notifications:show", payload),
  onNotificationActivated: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on("notifications:activated", listener);
    return () => {
      ipcRenderer.removeListener("notifications:activated", listener);
    };
  },
});
