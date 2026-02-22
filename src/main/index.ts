import { is } from "@electron-toolkit/utils";
import { FSWatcher, watch } from "chokidar";
import { createTwoFilesPatch } from "diff";
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import fs from "fs";
import os from "os";
import { basename, dirname, join, resolve } from "path";
import type { AppConfig, DiffData, FileData, OpenEntry, SavedDiff } from "../shared/types";

const DEFAULT_CONFIG: AppConfig = {
  theme: "light",
  openFiles: [],
  containerFolders: [],
  contentWidth: {
    mode: "fixed",
    fixedWidth: "880px",
    cappedWidth: "1200px",
  },
};

const DEFAULT_CONFIG_PATH = join(os.homedir(), ".brpt", "brpt-config.json");
const CONFIG_PATH = process.env.BRPT_CONFIG || DEFAULT_CONFIG_PATH;

let mainWindow: BrowserWindow | null = null;
let windowReady = false;
const pendingFiles: string[] = [];
let pendingDiff: DiffData | null = null;
const watchers = new Map<string, FSWatcher>();

/** Tracks diff mode info for file-watching purposes */
interface DiffWatch {
  mode: "diff" | "diff-by-files";
  newPath: string;
  secondPath: string;
}
const diffWatches = new Map<string, DiffWatch>();

function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: AppConfig): void {
  try {
    fs.mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(`Failed to save config to ${CONFIG_PATH}:`, err);
  }
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
    const diffWatch = diffWatches.get(abs);
    if (diffWatch) {
      handleDiffFileChange(diffWatch);
      return;
    }

    const file = readFile(abs);
    if (file && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("file-updated", { path: abs, ...file });
    }
  });
  watcher.on("unlink", () => {
    unwatchFile(abs);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("file-removed", { path: abs });
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
  diffWatches.delete(abs);
}

function handleDiffFileChange(dw: DiffWatch): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const newFile = readFile(dw.newPath);
  if (!newFile) {
    return;
  }

  if (dw.mode === "diff-by-files") {
    const oldFile = readFile(dw.secondPath);
    if (!oldFile) {
      return;
    }
    const diff = createTwoFilesPatch(
      basename(dw.secondPath),
      basename(dw.newPath),
      oldFile.content,
      newFile.content,
    );
    const data: DiffData = {
      mode: "diff-by-files",
      newPath: dw.newPath,
      newContent: newFile.content,
      secondPath: dw.secondPath,
      oldContent: oldFile.content,
      diff,
    };
    mainWindow.webContents.send("diff-updated", data);
  } else {
    const diffFile = readFile(dw.secondPath);
    if (!diffFile) {
      return;
    }
    const data: DiffData = {
      mode: "diff",
      newPath: dw.newPath,
      newContent: newFile.content,
      secondPath: dw.secondPath,
      diff: diffFile.content,
    };
    mainWindow.webContents.send("diff-updated", data);
  }
}

interface ParsedCliArgs {
  markdownFiles: string[];
  diff?: DiffData;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  // electron-vite and Electron may reorder args, so search the full argv
  // for our flags and collect trailing non-flag file paths separately.
  const hasDiff = argv.includes("--diff");
  const hasDiffByFiles = argv.includes("--diff-by-files");

  // Collect non-flag, non-electron args (file paths are always last)
  const filePaths = argv.filter(
    (a) => !a.startsWith("-") && a !== "." && !a.includes("Electron") && !a.includes("electron"),
  );

  if (hasDiff && filePaths.length >= 2) {
    const newPath = resolveFilePath(filePaths[filePaths.length - 2]);
    const diffPath = resolveFilePath(filePaths[filePaths.length - 1]);

    const newFile = readFile(newPath);
    const diffFile = readFile(diffPath);
    if (newFile && diffFile) {
      return {
        markdownFiles: [],
        diff: {
          mode: "diff",
          newPath,
          newContent: newFile.content,
          secondPath: diffPath,
          diff: diffFile.content,
        },
      };
    }
    return { markdownFiles: [] };
  }

  if (hasDiffByFiles && filePaths.length >= 2) {
    const newPath = resolveFilePath(filePaths[filePaths.length - 2]);
    const oldPath = resolveFilePath(filePaths[filePaths.length - 1]);

    const newFile = readFile(newPath);
    const oldFile = readFile(oldPath);
    if (newFile && oldFile) {
      const diff = createTwoFilesPatch(
        basename(oldPath),
        basename(newPath),
        oldFile.content,
        newFile.content,
      );
      return {
        markdownFiles: [],
        diff: {
          mode: "diff-by-files",
          newPath,
          newContent: newFile.content,
          secondPath: oldPath,
          oldContent: oldFile.content,
          diff,
        },
      };
    }
    return { markdownFiles: [] };
  }

  const markdownFiles = filePaths
    .filter((a) => a.endsWith(".md"))
    .map((a) => resolveFilePath(a));

  return { markdownFiles };
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

function openDiffAndSend(data: DiffData, mode: "diff" | "diff-by-files", secondPath: string): void {
  if (!windowReady || !mainWindow || mainWindow.isDestroyed()) {
    pendingDiff = data;
    return;
  }

  const dw: DiffWatch = { mode, newPath: data.newPath, secondPath };

  watchFile(data.newPath);
  diffWatches.set(resolveFilePath(data.newPath), dw);

  watchFile(secondPath);
  diffWatches.set(resolveFilePath(secondPath), dw);

  mainWindow.webContents.send("diff-from-args", data);
}

function secondPathFor(saved: SavedDiff): string {
  return saved.type === "diff" ? saved.diffFile : saved.oldFile;
}

function buildDiffData(saved: SavedDiff): DiffData | null {
  const newPath = resolveFilePath(saved.file);
  const secondPath = resolveFilePath(secondPathFor(saved));
  const newFile = readFile(newPath);
  if (!newFile) {
    return null;
  }

  if (saved.type === "diff-by-files") {
    const oldFile = readFile(secondPath);
    if (!oldFile) {
      return null;
    }
    return {
      mode: "diff-by-files",
      newPath,
      newContent: newFile.content,
      secondPath,
      oldContent: oldFile.content,
      diff: createTwoFilesPatch(
        basename(secondPath),
        basename(newPath),
        oldFile.content,
        newFile.content,
      ),
    };
  } else {
    const diffFile = readFile(secondPath);
    if (!diffFile) {
      return null;
    }
    return {
      mode: "diff",
      newPath,
      newContent: newFile.content,
      secondPath,
      diff: diffFile.content,
    };
  }
}

function restoreSessionEntries(entries: OpenEntry[]): void {
  const filePaths: string[] = [];
  const diffs: SavedDiff[] = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      filePaths.push(entry);
    } else {
      diffs.push(entry);
    }
  }

  if (filePaths.length > 0) {
    openFilesAndSend(filePaths);
  }

  for (const saved of diffs) {
    const data = buildDiffData(saved);
    if (data) {
      openDiffAndSend(data, saved.type, resolveFilePath(secondPathFor(saved)));
    }
  }
}

function boundsOverlapDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.bounds;
    return (
      bounds.x < x + width &&
      bounds.x + bounds.width > x &&
      bounds.y < y + height &&
      bounds.y + bounds.height > y
    );
  });
}

function createWindow(): void {
  const config = loadConfig();
  const saved = config.windowBounds;
  const useSaved = saved && boundsOverlapDisplay(saved);

  mainWindow = new BrowserWindow({
    width: useSaved ? saved.width : 1000,
    height: useSaved ? saved.height : 700,
    ...(useSaved ? { x: saved.x, y: saved.y } : {}),
    title: "Brett's Rad Preview Tool",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  function saveBounds(): void {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
    }
    boundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const cfg = loadConfig();
        cfg.windowBounds = mainWindow.getBounds();
        saveConfig(cfg);
      }
    }, 500);
  }
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow!.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
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

    const parsed = parseCliArgs(process.argv);

    const cliFiles = parsed.markdownFiles;
    const sessionEntries = config.openFiles || [];

    // Always restore the session
    restoreSessionEntries(sessionEntries);

    // CLI args open on top of the session
    if (cliFiles.length > 0) {
      openFilesAndSend(cliFiles);
    }

    if (pendingFiles.length > 0) {
      openFilesAndSend(pendingFiles);
      pendingFiles.length = 0;
    }

    if (parsed.diff) {
      openDiffAndSend(parsed.diff, parsed.diff.mode, parsed.diff.secondPath);
    }

    if (pendingDiff) {
      mainWindow.webContents.send("diff-from-args", pendingDiff);
      pendingDiff = null;
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
    saveConfig({ ...DEFAULT_CONFIG });
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
    const parsed = parseCliArgs(argv);

    if (parsed.diff) {
      openDiffAndSend(parsed.diff, parsed.diff.mode, parsed.diff.secondPath);
    }

    if (parsed.markdownFiles.length > 0) {
      openFilesAndSend(parsed.markdownFiles);
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

ipcMain.handle("request-diff-by-files", (_event, newPath: string, oldPath: string) => {
  const absNew = resolveFilePath(newPath);
  const absOld = resolveFilePath(oldPath);
  const newFile = readFile(absNew);
  const oldFile = readFile(absOld);
  if (!newFile || !oldFile) {
    return null;
  }
  const diff = createTwoFilesPatch(
    basename(absOld),
    basename(absNew),
    oldFile.content,
    newFile.content,
  );
  const data: DiffData = {
    mode: "diff-by-files",
    newPath: absNew,
    newContent: newFile.content,
    secondPath: absOld,
    oldContent: oldFile.content,
    diff,
  };

  const dw: DiffWatch = { mode: "diff-by-files", newPath: absNew, secondPath: absOld };
  watchFile(absNew);
  diffWatches.set(absNew, dw);
  watchFile(absOld);
  diffWatches.set(absOld, dw);

  return data;
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

ipcMain.on("save-open-files", (_event, entries: OpenEntry[]) => {
  const config = loadConfig();
  config.openFiles = entries;
  saveConfig(config);
});
