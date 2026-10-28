const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const gameURL = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
let gameWindow;

function isGameSender(event) {
  return gameWindow && event.sender === gameWindow.webContents &&
    event.senderFrame?.url === gameURL;
}

ipcMain.on("window:work-area", (event) => {
  if (!isGameSender(event)) {
    event.returnValue = null;
    return;
  }
  const { width, height } = screen.getDisplayMatching(gameWindow.getBounds()).workAreaSize;
  event.returnValue = { width, height };
});

ipcMain.on("window:minimize", (event) => {
  if (isGameSender(event)) gameWindow.minimize();
});

ipcMain.on("window:close", (event) => {
  if (isGameSender(event)) app.quit();
});

ipcMain.on("window:resize", (event, width, height) => {
  if (!isGameSender(event)) return;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    console.error("Rejected invalid game window dimensions:", width, height);
    return;
  }
  const area = screen.getDisplayMatching(gameWindow.getBounds()).workAreaSize;
  const size = [Math.min(width, area.width), Math.min(height, area.height)];
  const current = gameWindow.getContentSize();
  if (size[0] !== current[0] || size[1] !== current[1]) {
    gameWindow.setContentSize(...size);
  }
  if (!gameWindow.isVisible()) gameWindow.show();
});

app.whenReady().then(() => {
  gameWindow = new BrowserWindow({
    title: "Minesweeper",
    width: 290,
    height: 480,
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#c0c0c0",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  gameWindow.setMenu(null);
  gameWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  gameWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  gameWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Unable to load Minesweeper (${code}): ${description}`);
    app.exit(1);
  });
  gameWindow.loadURL(gameURL).catch((error) => {
    console.error("Unable to open Minesweeper:", error);
    app.exit(1);
  });
});

app.on("window-all-closed", () => app.quit());
