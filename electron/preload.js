"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  getNetworkMode: () => ipcRenderer.invoke("app:get-network-mode"),
  setNetworkMode: (mode) => ipcRenderer.invoke("app:set-network-mode", mode),
  getRuntimeInfo: () => ipcRenderer.invoke("v2:app:get-runtime-info"),
  setRuntimeVersion: async (runtimeVersion) => ({
    ok: false,
    changed: false,
    restarting: false,
    runtimeVersion: "v2",
    reason: "runtime_locked_v2",
    requestedRuntimeVersion: String(runtimeVersion || "").trim().toLowerCase(),
  }),
  listDisplaySources: () => ipcRenderer.invoke("screen:list-display-sources"),
  prepareDisplayCapture: (payload) => ipcRenderer.invoke("screen:prepare-display-capture", payload),
  clearPreparedDisplayCapture: () => ipcRenderer.invoke("screen:clear-prepared-display-capture"),
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
