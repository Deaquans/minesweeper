const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nativeWindow", {
  workArea: ipcRenderer.sendSync("window:work-area"),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
  resize: (width, height) => ipcRenderer.send("window:resize", width, height)
});
