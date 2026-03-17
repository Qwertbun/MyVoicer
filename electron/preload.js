"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  getNetworkMode: () => ipcRenderer.invoke("app:get-network-mode"),
  setNetworkMode: (mode) => ipcRenderer.invoke("app:set-network-mode", mode),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
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
