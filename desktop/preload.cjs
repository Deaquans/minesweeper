const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nativeWindow", {
  workArea: ipcRenderer.sendSync("window:work-area"),
  onDeactivate: (callback) => {
    ipcRenderer.on("window:deactivate", () => callback());
  },
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
  resize: (width, height) => ipcRenderer.send("window:resize", width, height)
});
