const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

const CONFIG_PATH = path.join(__dirname, "config.json");

let mainWindow = null;
const watchers = new Map(); // absolute path -> chokidar watcher

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { theme: "light", openFiles: [] };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function resolveFilePath(filePath) {
  return path.resolve(filePath);
}

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return null;
  }
}

function watchFile(filePath) {
  const abs = resolveFilePath(filePath);
  if (watchers.has(abs)) {
    return;
  }

  const watcher = chokidar.watch(abs, { persistent: true });
  watcher.on("change", () => {
    const content = readFileContent(abs);
    if (content !== null && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("file-updated", { path: abs, content });
    }
  });
  watchers.set(abs, watcher);
}

function unwatchFile(filePath) {
  const abs = resolveFilePath(filePath);
  const watcher = watchers.get(abs);
  if (watcher) {
    watcher.close();
    watchers.delete(abs);
  }
}

function getCliFiles(argv) {
  // In packaged app, argv[0] is the app. In dev, argv[0] is electron, argv[1] is '.'.
  // Files come after '--' when using `npm start -- file.md`
  const dashDashIndex = argv.indexOf("--");
  let args;
  if (dashDashIndex !== -1) {
    args = argv.slice(dashDashIndex + 1);
  } else {
    // Skip electron binary and the '.' entry point
    args = argv.slice(2);
  }
  return args
    .filter((a) => !a.startsWith("-") && a.endsWith(".md"))
    .map((a) => resolveFilePath(a));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "Brett's Rad Preview Tool",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    const config = loadConfig();
    mainWindow.webContents.send("config-loaded", config);

    const cliFiles = getCliFiles(process.argv);
    const sessionFiles = config.openFiles || [];

    // CLI files take priority; fall back to session restore
    const filesToOpen = cliFiles.length > 0 ? cliFiles : sessionFiles;

    if (filesToOpen.length > 0) {
      const fileData = filesToOpen
        .map((fp) => {
          const abs = resolveFilePath(fp);
          const content = readFileContent(abs);
          if (content !== null) {
            watchFile(abs);
            return { path: abs, content };
          }
          return null;
        })
        .filter(Boolean);

      if (fileData.length > 0) {
        mainWindow.webContents.send("files-from-args", fileData);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const files = getCliFiles(argv);
    if (files.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      const fileData = files
        .map((fp) => {
          const abs = resolveFilePath(fp);
          const content = readFileContent(abs);
          if (content !== null) {
            watchFile(abs);
            return { path: abs, content };
          }
          return null;
        })
        .filter(Boolean);

      if (fileData.length > 0) {
        mainWindow.webContents.send("files-from-args", fileData);
      }

      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
    app.quit();
  });
}

// IPC handlers

ipcMain.handle("open-file-dialog", async () => {
  if (!mainWindow) {
    return [];
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });
  if (result.canceled) {
    return [];
  }
  return result.filePaths.map((fp) => {
    const abs = resolveFilePath(fp);
    const content = readFileContent(abs);
    watchFile(abs);
    return { path: abs, content };
  });
});

ipcMain.handle("request-file", (_event, filePath) => {
  const abs = resolveFilePath(filePath);
  const content = readFileContent(abs);
  if (content !== null) {
    watchFile(abs);
    return { path: abs, content };
  }
  return null;
});

ipcMain.on("close-file", (_event, filePath) => {
  unwatchFile(filePath);
});

ipcMain.handle("get-config", () => {
  return loadConfig();
});

ipcMain.on("set-config", (_event, key, value) => {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
});

ipcMain.on("save-open-files", (_event, files) => {
  const config = loadConfig();
  config.openFiles = files;
  saveConfig(config);
});
