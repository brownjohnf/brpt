import { is } from "@electron-toolkit/utils";
import { FSWatcher, watch } from "chokidar";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs";
import os from "os";
import { dirname, join, resolve } from "path";

interface AppConfig {
  theme: "light" | "dark";
  openFiles: string[];
  containerFolders: string[];
  contentWidth: {
    mode: "fixed" | "capped" | "full";
    fixedWidth: string;
    cappedWidth: string;
  };
}

interface FileData {
  path: string;
  content: string;
  mtimeMs: number;
}

const DEFAULT_CONFIG_PATH = join(os.homedir(), ".brpt", "brpt-config.json");
const CONFIG_PATH = process.env.BRPT_CONFIG || DEFAULT_CONFIG_PATH;

let mainWindow: BrowserWindow | null = null;
let windowReady = false;
const pendingFiles: string[] = [];
const watchers = new Map<string, FSWatcher>();

function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {
      theme: "light",
      openFiles: [],
      containerFolders: [],
      contentWidth: {
        mode: "fixed",
        fixedWidth: "880px",
        cappedWidth: "1200px",
      },
    };
  }
}

function saveConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function resolveFilePath(filePath: string): string {
  return resolve(filePath);
}

function readFile(filePath: string): { content: string; mtimeMs: number } | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const stat = fs.statSync(filePath);
    return { content, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function watchFile(filePath: string): void {
  const abs = resolveFilePath(filePath);
  if (watchers.has(abs)) {
    return;
  }

  const watcher = watch(abs, { persistent: true });
  watcher.on("change", () => {
    const file = readFile(abs);
    if (file && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("file-updated", { path: abs, ...file });
    }
  });
  watchers.set(abs, watcher);
}

function unwatchFile(filePath: string): void {
  const abs = resolveFilePath(filePath);
  const watcher = watchers.get(abs);
  if (watcher) {
    watcher.close();
    watchers.delete(abs);
  }
}

function getCliFiles(argv: string[]): string[] {
  // In packaged app, argv[0] is the app. In dev, argv[0] is electron, argv[1] is '.'.
  // Files come after '--' when using `npm start -- file.md`
  const dashDashIndex = argv.indexOf("--");
  let args: string[];
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

function openFilesAndSend(filePaths: string[]): void {
  if (!windowReady || !mainWindow || mainWindow.isDestroyed()) {
    pendingFiles.push(...filePaths);
    return;
  }

  const fileData: FileData[] = filePaths
    .map((fp) => {
      const abs = resolveFilePath(fp);
      const file = readFile(abs);
      if (file) {
        watchFile(abs);
        return { path: abs, ...file };
      }
      return null;
    })
    .filter((f): f is FileData => f !== null);

  if (fileData.length > 0) {
    mainWindow.webContents.send("files-from-args", fileData);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "Brett's Rad Preview Tool",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow) {
      return;
    }

    windowReady = true;

    const config = loadConfig();
    mainWindow.webContents.send("config-loaded", config);

    const cliFiles = getCliFiles(process.argv);
    const sessionFiles = config.openFiles || [];

    // CLI files take priority; fall back to session restore
    const filesToOpen = cliFiles.length > 0 ? cliFiles : sessionFiles;

    // Include any files that arrived via open-file before the window was ready
    if (pendingFiles.length > 0) {
      filesToOpen.push(...pendingFiles);
      pendingFiles.length = 0;
    }

    if (filesToOpen.length > 0) {
      openFilesAndSend(filesToOpen);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function ensureConfigExists(): boolean {
  if (fs.existsSync(CONFIG_PATH)) {
    return true;
  }
  try {
    fs.mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    saveConfig({
      theme: "light",
      openFiles: [],
      containerFolders: [],
      contentWidth: {
        mode: "fixed",
        fixedWidth: "880px",
        cappedWidth: "1200px",
      },
    });
    return true;
  } catch {
    dialog.showErrorBox(
      "Configuration Error",
      `Could not create config file at:\n${CONFIG_PATH}\n\nThe application will now exit.`
    );
    return false;
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("open-file", (_event, filePath) => {
    if (filePath.endsWith(".md")) {
      openFilesAndSend([filePath]);
    }
  });

  app.on("second-instance", (_event, argv) => {
    const files = getCliFiles(argv);
    if (files.length > 0) {
      openFilesAndSend(files);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!ensureConfigExists()) {
      app.quit();
      return;
    }
    createWindow();
  });

  app.on("window-all-closed", () => {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
    app.quit();
  });
}

/** IPC handlers */

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
  return result.filePaths
    .map((fp) => {
      const abs = resolveFilePath(fp);
      const file = readFile(abs);
      if (file) {
        watchFile(abs);
        return { path: abs, ...file };
      }
      return null;
    })
    .filter((f): f is FileData => f !== null);
});

ipcMain.handle("request-file", (_event, filePath: string) => {
  const abs = resolveFilePath(filePath);
  const file = readFile(abs);
  if (file) {
    watchFile(abs);
    return { path: abs, ...file };
  }
  return null;
});

ipcMain.on("close-file", (_event, filePath: string) => {
  unwatchFile(filePath);
});

ipcMain.handle("get-config", () => {
  return loadConfig();
});

ipcMain.on("set-config", (_event, key: string, value: unknown) => {
  const config = loadConfig();
  (config as unknown as Record<string, unknown>)[key] = value;
  saveConfig(config);
});

ipcMain.on("save-open-files", (_event, files: string[]) => {
  const config = loadConfig();
  config.openFiles = files;
  saveConfig(config);
});
