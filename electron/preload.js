"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getBackendUrl: () => ipcRenderer.invoke("app:get-backend-url"),
});
