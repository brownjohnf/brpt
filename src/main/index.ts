import { is } from "@electron-toolkit/utils";
import { FSWatcher, watch } from "chokidar";
import { Command, Help } from "commander";
import { createHash } from "crypto";
import { createTwoFilesPatch } from "diff";
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import fs from "fs";
import os from "os";
import { basename, dirname, join, resolve } from "path";
import type {
  Annotation,
  AppConfig,
  BrptNotification,
  DiffData,
  FileData,
  OpenEntry,
  SavedDiff,
  SidecarExtras,
  Store,
} from "../shared/types";

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
const SIDECARS_DIR = join(dirname(CONFIG_PATH), "sidecars");
const STORE_PATH = join(dirname(CONFIG_PATH), "store.json");

let mainWindow: BrowserWindow | null = null;
let windowReady = false;
const pendingFiles: string[] = [];
let pendingDiff: DiffData | null = null;
let firstLaunchCliResult: CliResult | null = null;
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

function loadStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { tabActivations: {} };
  }
}

let storeWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStore: Store | null = null;

function saveStore(store: Store): void {
  pendingStore = store;
  if (storeWriteTimer) {
    clearTimeout(storeWriteTimer);
  }
  storeWriteTimer = setTimeout(() => {
    storeWriteTimer = null;
    if (!pendingStore) {
      return;
    }
    try {
      fs.mkdirSync(dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(pendingStore, null, 2));
    } catch (err) {
      console.error(`Failed to save store to ${STORE_PATH}:`, err);
    }
    pendingStore = null;
  }, 1000);
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

function sidecarPathFor(targetPath: string): string {
  const hash = createHash("sha256").update(targetPath).digest("hex").slice(0, 16);
  return join(SIDECARS_DIR, hash, "extras.json");
}

function loadExtras(targetPath: string): SidecarExtras {
  try {
    const raw = fs.readFileSync(sidecarPathFor(targetPath), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      targetPath,
      notifications: parsed.notifications ?? [],
      annotations: parsed.annotations ?? [],
    };
  } catch {
    return { targetPath, notifications: [], annotations: [] };
  }
}

function saveExtras(targetPath: string, extras: SidecarExtras): void {
  try {
    const p = sidecarPathFor(targetPath);
    fs.mkdirSync(dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(extras, null, 2));
  } catch (err) {
    console.error("Failed to save extras:", err);
  }
}

function appendNotification(targetPath: string, content: string): BrptNotification {
  const extras = loadExtras(targetPath);
  const now = new Date().toISOString();
  const notification: BrptNotification = { id: now, content, receivedAt: now, read: false };
  extras.notifications.push(notification);
  saveExtras(targetPath, extras);
  return notification;
}

function appendAnnotation(targetPath: string, partial: Omit<Annotation, "id">): SidecarExtras {
  const extras = loadExtras(targetPath);
  const annotation: Annotation = { id: new Date().toISOString(), ...partial };
  extras.annotations.push(annotation);
  saveExtras(targetPath, extras);
  return extras;
}

function normalizeImportedAnnotation(raw: Record<string, unknown>): Omit<Annotation, "id"> | null {
  const content = typeof raw.content === "string" ? raw.content : null;
  if (!content) { return null; }
  let startLine: number;
  let endLine: number;
  if (typeof raw.startLine === "number" && typeof raw.endLine === "number") {
    startLine = raw.startLine;
    endLine = raw.endLine;
  } else if (typeof raw.line === "number") {
    startLine = raw.line;
    endLine = raw.line;
  } else {
    return null;
  }
  return {
    startLine,
    endLine,
    format: typeof raw.format === "string" ? raw.format : "markdown",
    content,
    source: typeof raw.source === "string" ? raw.source : undefined,
  };
}

function appendAnnotations(targetPath: string, raws: Record<string, unknown>[]): SidecarExtras {
  const extras = loadExtras(targetPath);
  const base = new Date().toISOString();
  raws.forEach((raw, i) => {
    const partial = normalizeImportedAnnotation(raw);
    if (partial) {
      extras.annotations.push({ id: `${base}-${i}`, ...partial });
    }
  });
  saveExtras(targetPath, extras);
  return extras;
}

function removeAnnotation(targetPath: string, annotationId: string): SidecarExtras {
  const extras = loadExtras(targetPath);
  extras.annotations = extras.annotations.filter((a) => a.id !== annotationId);
  saveExtras(targetPath, extras);
  return extras;
}

function clearAnnotations(targetPath: string): SidecarExtras {
  const extras = loadExtras(targetPath);
  extras.annotations = [];
  saveExtras(targetPath, extras);
  return extras;
}

function migrateNotificationsIfNeeded(): void {
  const oldDir = join(dirname(CONFIG_PATH), "notifications");
  if (!fs.existsSync(oldDir)) { return; }
  try {
    for (const file of fs.readdirSync(oldDir)) {
      if (!file.endsWith(".json")) { continue; }
      try {
        const raw = fs.readFileSync(join(oldDir, file), "utf-8");
        const parsed = JSON.parse(raw);
        const targetPath: string = parsed.targetPath;
        const notifications: BrptNotification[] = parsed.notifications ?? [];
        if (targetPath && notifications.length > 0) {
          const extras = loadExtras(targetPath);
          const existingIds = new Set(extras.notifications.map((n) => n.id));
          for (const n of notifications) {
            if (!existingIds.has(n.id)) {
              extras.notifications.push(n);
            }
          }
          saveExtras(targetPath, extras);
        }
      } catch {
        // Skip malformed files
      }
    }
    fs.rmSync(oldDir, { recursive: true, force: true });
  } catch (err) {
    console.error("Failed to migrate notifications:", err);
  }
}

function watchFile(filePath: string): void {
  const abs = resolve(filePath);
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
  const abs = resolve(filePath);
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
      mtimeMs: newFile.mtimeMs,
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
      mtimeMs: diffFile.mtimeMs,
    };
    mainWindow.webContents.send("diff-updated", data);
  }
}


/** CLI result types — one variant per subcommand */

type CliResult =
  | { kind: "open-files"; files: string[]; foreground: boolean }
  | { kind: "diff"; newFile: string; patchFile: string; foreground: boolean }
  | { kind: "diff-files"; newFile: string; oldFile: string; foreground: boolean }
  | { kind: "notify"; target: string; message?: string; messageFile?: string; foreground: boolean }
  | { kind: "annotate-add"; target: string; startLine: number; endLine: number; message: string; messageFile?: string; source?: string; foreground: boolean }
  | { kind: "annotate-import"; target: string; importFile: string; foreground: boolean }
  | { kind: "annotate-remove"; target: string; annotationId: string; foreground: boolean }
  | { kind: "annotate-clear"; target: string; foreground: boolean }
  | { kind: "annotate-list"; target: string; foreground: boolean }
  | { kind: "help"; text: string }
  | { kind: "none" };

/**
 * Strip Electron-injected args from argv before passing to commander.
 *
 * On first launch, `process.argv` is `[electronBinary, appEntry, ...userArgs]`.
 * On second-instance, `argv` is `[electronBinary, appEntry?, ...userArgs, cwd?]`.
 * Extract user args from argv by finding the `--` sentinel.
 * The launcher inserts `--` before user-provided args. Electron/Chromium
 * treats `--` as "end of options" and does not inject flags after it.
 */
function stripElectronArgs(argv: string[]): string[] {
  const idx = argv.indexOf("--");
  if (idx !== -1) {
    return argv.slice(idx + 1);
  }
  return [];
}

function parseLineRange(spec: string): { startLine: number; endLine: number } {
  const parts = spec.split(":");
  const startLine = parseInt(parts[0], 10);
  if (isNaN(startLine) || startLine < 1) {
    throw new Error(`Invalid line number: ${spec}`);
  }
  const endLine = parts.length > 1 ? parseInt(parts[1], 10) : startLine;
  if (isNaN(endLine) || endLine < startLine) {
    throw new Error(`Invalid line range: ${spec}`);
  }
  return { startLine, endLine };
}

function generateHelpAll(program: Command): string {
  const defaultHelp = new Help();
  const sections: string[] = [];

  // Root command help (without the "Run --help-all" footer)
  sections.push(defaultHelp.formatHelp(program, defaultHelp));

  // Each subcommand's help
  for (const cmd of program.commands) {
    sections.push("---\n");
    sections.push(defaultHelp.formatHelp(cmd, defaultHelp));

    // Nested subcommands (e.g. annotate add, annotate import, ...)
    for (const sub of cmd.commands) {
      if (sub.name() === "help") {
        continue;
      }
      sections.push("");
      sections.push(defaultHelp.formatHelp(sub, defaultHelp));
    }
  }

  sections.push(`---

OVERVIEW

  A live-updating preview tool for markdown files, diffs, and annotated
  documents. Built with Electron. Files are watched on disk and the preview
  auto-refreshes when they change. This makes it useful as a render target
  for other tools — write a markdown file, point brpt at it, and see live
  updates as the file changes.

  The app is single-instance: if brpt is already running, new invocations
  forward their arguments to the existing window and exit. Tabs persist
  across sessions and are restored on launch.

MODES

  Plain file view (default):

    brpt README.md
    brpt file1.md file2.md file3.md

    Opens one or more files as tabs. Each file is watched for changes
    and the preview updates automatically. Any text file works, though
    markdown files get full rendering with syntax-highlighted code blocks.

  Diff from a unified diff file:

    brpt diff document.md changes.patch

    Opens a diff view. The first argument is the "new" file (the current
    version). The second argument is a unified diff file (the output of
    \`diff -u\` or \`git diff\`). The diff is rendered with line-by-line or
    side-by-side view modes. Both files are watched — if either changes,
    the diff view updates.

  Diff computed from two files:

    brpt diff-files document.md document.old.md

    Opens a diff view computed by comparing the two files. The first
    argument is the "new" file, the second is the "old" file. The diff
    is computed internally. Both files are watched for changes.

ANNOTATIONS

    echo "note" | brpt annotate add document.md 5 -
    brpt annotate add document.md 10:15 --message-file note.md
    brpt annotate import document.md annotations.json

    Annotations attach contextual notes to specific lines of a file or
    diff. They are persisted to disk and survive tab close and app restart.

    Annotations can target a single line or a line range. The annotation
    body is markdown, so code blocks, inline code, links, etc. all work.
    Annotations appear as highlighted blocks interleaved with the document
    content at their target line positions.

    Annotations are designed to be generated by other tools. A typical
    workflow is:

    1. Write a markdown file with your content.
    2. Have your tool (linter, code review, AI agent, etc.) add
       annotations via the CLI.
    3. The preview updates automatically as annotations are added.

NOTIFICATIONS

    brpt notify README.md "Check the formatting on line 12."
    echo "Build **failed** — see errors." | brpt notify README.md -
    brpt notify README.md --message-file report.md

    Notifications send a markdown message associated with a target file.
    The message is persisted to disk and delivered to the app. If the
    target file is open as a tab, a bell icon appears in the status bar
    with an unread indicator. Click the bell to open the notification
    drawer.

    By default, \`brpt notify\` sends without bringing the app to the
    foreground. Add --foreground to also focus the window.

    Notifications are designed for programmatic use — other tools (CI,
    linters, AI agents) can push messages into brpt about specific files.

STDIN

    Commands that accept a message body (notify, annotate add) support
    reading from stdin by passing - as the message argument. The brpt
    launcher reads stdin, writes it to a temp file, and passes
    --message-file to the Electron app. This is the recommended way to
    send multi-line or markdown-rich content.

CONFIGURATION

    Config is stored at ~/.brpt/brpt-config.json (override with the
    BRPT_CONFIG environment variable). The config file is managed by
    the app and generally should not be edited by hand, but relevant
    fields include:

    theme                    "light" or "dark"
    openFiles                Persisted tab state (restored on launch)
    containerFolders         Project roots for grouping tabs in sidebar
    brpt_development_roots   Paths to brpt source checkouts (for dev
                             mode forwarding — see below)

DEV MODE

    If brpt_development_roots is set in the config and a running
    \`electron-vite dev\` instance is detected at one of those roots,
    brpt forwards files to the dev instance instead of the packaged app.
    This allows testing changes without rebuilding.

    To run brpt from source during development:

        python3 resources/brpt [args...]

    Do NOT use the installed /usr/local/bin/brpt symlink during
    development — it points to the packaged app's copy which may be
    stale.
`);

  return sections.join("\n");
}

/**
 * Build the commander program with all commands and options declared.
 * Action handlers write to `result` via the returned setter.
 */
function buildCliProgram(): { program: Command; getResult: () => CliResult } {
  let result: CliResult = { kind: "none" };

  const program = new Command();
  program
    .name("brpt")
    .description("Brett's Rad Preview Tool — live-updating preview for markdown, diffs, and annotated documents")
    .option("--foreground", "bring window to front")
    .option("--cwd <path>", "working directory for resolving relative paths (set by the launcher; only needed when bypassing brpt)")
    .argument("[files...]", "files to open")
    .addHelpText("after", "\nRun brpt --help-all for the full reference (suitable for CLAUDE.md).")
    .action((files: string[], _opts: unknown, cmd: Command) => {
      if (files.length > 0) {
        const globals = cmd.optsWithGlobals();
        const cwd = globals.cwd || process.cwd();
        result = {
          kind: "open-files",
          files: files.map((f: string) => resolve(cwd, f)),
          foreground: !!globals.foreground,
        };
      }
    });

  program
    .command("diff <new-file> <patch-file>")
    .description("open a diff view from a file and a unified diff file")
    .action((newFile: string, patchFile: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "diff",
        newFile: resolve(cwd, newFile),
        patchFile: resolve(cwd, patchFile),
        foreground: !!globals.foreground,
      };
    });

  program
    .command("diff-files <new-file> <old-file>")
    .description("open a diff view computed from two files")
    .action((newFile: string, oldFile: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "diff-files",
        newFile: resolve(cwd, newFile),
        oldFile: resolve(cwd, oldFile),
        foreground: !!globals.foreground,
      };
    });

  program
    .command("notify <target> <message>")
    .description(
      "send a notification to a file tab.\n" +
      "Pass - as <message> to read from stdin (via the brpt launcher).\n" +
      "Pass --message-file to read from a file.",
    )
    .option("--message-file <path>", "path to file containing notification body (markdown)")
    .action((target: string, message: string, opts: { messageFile?: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "notify",
        target: resolve(cwd, target),
        message,
        messageFile: opts.messageFile ? resolve(cwd, opts.messageFile) : undefined,
        foreground: !!globals.foreground,
      };
    });

  const annotate = program
    .command("annotate")
    .description("manage annotations on file tabs");

  annotate
    .command("add <target> <line> <message>")
    .description(
      "add an annotation at a line or line range (start:end).\n" +
      "Pass - as <message> to read from stdin (via the brpt launcher).\n" +
      "Pass --message-file to read from a file.",
    )
    .option("--message-file <path>", "path to file containing annotation body (markdown)")
    .option("--source <name>", "optional source identifier (e.g. agent name, tool name)")
    .action((target: string, line: string, message: string, opts: { messageFile?: string; source?: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      const range = parseLineRange(line);
      result = {
        kind: "annotate-add",
        target: resolve(cwd, target),
        startLine: range.startLine,
        endLine: range.endLine,
        message,
        messageFile: opts.messageFile ? resolve(cwd, opts.messageFile) : undefined,
        source: opts.source,
        foreground: !!globals.foreground,
      };
    });

  annotate
    .command("import <target> <annotations-file>")
    .description("bulk import annotations from a JSON file")
    .action((target: string, importFile: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "annotate-import",
        target: resolve(cwd, target),
        importFile: resolve(cwd, importFile),
        foreground: !!globals.foreground,
      };
    });

  annotate
    .command("remove <target> <annotation-id>")
    .description("remove a specific annotation by ID")
    .action((target: string, annotationId: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "annotate-remove",
        target: resolve(cwd, target),
        annotationId,
        foreground: !!globals.foreground,
      };
    });

  annotate
    .command("clear <target>")
    .description("remove all annotations for a file")
    .action((target: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "annotate-clear",
        target: resolve(cwd, target),
        foreground: !!globals.foreground,
      };
    });

  annotate
    .command("list <target>")
    .description("list all annotations for a file as JSON")
    .action((target: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const cwd = globals.cwd || process.cwd();
      result = {
        kind: "annotate-list",
        target: resolve(cwd, target),
        foreground: !!globals.foreground,
      };
    });

  return { program, getResult: () => result };
}

function parseCliArgs(argv: string[]): CliResult {
  const userArgs = stripElectronArgs(argv);

  // Handle --help-all before commander — generate the full reference and exit.
  if (userArgs.includes("--help-all")) {
    const { program } = buildCliProgram();
    return { kind: "help", text: generateHelpAll(program) };
  }

  const { program, getResult } = buildCliProgram();

  // Prevent commander from calling process.exit() — it would kill Electron.
  // Capture help/error output into a string so we can return it as a result.
  let capturedOutput = "";
  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => { capturedOutput += str; },
    writeErr: () => {},
  });

  try {
    program.parse(userArgs, { from: "user" });
  } catch {
    // Commander throws on --help or parse errors after writing output.
    if (capturedOutput) {
      return { kind: "help", text: capturedOutput };
    }
  }

  return getResult();
}

function buildDiffDataFromFiles(newPath: string, secondPath: string, mode: "diff" | "diff-by-files"): DiffData | null {
  const newFile = readFile(newPath);
  if (!newFile) {
    return null;
  }

  if (mode === "diff-by-files") {
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
      diff: createTwoFilesPatch(basename(secondPath), basename(newPath), oldFile.content, newFile.content),
      mtimeMs: newFile.mtimeMs,
    };
  }

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
    mtimeMs: diffFile.mtimeMs,
  };
}

/**
 * Resolve a message body from either an inline string or a file path.
 * If a messageFile is provided, reads and returns its content (and deletes
 * temp files created by the launcher's stdin bridge).
 */
function resolveMessageBody(inline?: string, messageFile?: string): string | null {
  if (inline && inline !== "-") {
    return inline;
  }
  if (messageFile) {
    try {
      const content = fs.readFileSync(messageFile, "utf-8");
      // Clean up temp files created by the launcher (prefixed with brpt-msg-)
      if (basename(messageFile).startsWith("brpt-msg-")) {
        fs.unlinkSync(messageFile);
      }
      return content;
    } catch {
      console.error(`brpt: could not read message file: ${messageFile}`);
      return null;
    }
  }
  return null;
}

function handleCliResult(parsed: CliResult): void {
  switch (parsed.kind) {
    case "open-files": {
      openFilesAndSend(parsed.files);
      break;
    }
    case "diff": {
      const data = buildDiffDataFromFiles(parsed.newFile, parsed.patchFile, "diff");
      if (data) {
        openDiffAndSend(data, "diff", parsed.patchFile);
      }
      break;
    }
    case "diff-files": {
      const data = buildDiffDataFromFiles(parsed.newFile, parsed.oldFile, "diff-by-files");
      if (data) {
        openDiffAndSend(data, "diff-by-files", parsed.oldFile);
      }
      break;
    }
    case "notify": {
      const message = resolveMessageBody(parsed.message, parsed.messageFile);
      if (!message) {
        console.error("brpt notify: no message provided (use inline arg, --message-file, or stdin via -)");
        break;
      }
      const notification = appendNotification(parsed.target, message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("notification-received", {
          targetPath: parsed.target,
          notification,
        });
      }
      break;
    }
    case "annotate-add": {
      const message = resolveMessageBody(parsed.message, parsed.messageFile);
      if (!message) {
        console.error("brpt annotate add: no message provided (use --message-file or stdin via -)");
        break;
      }
      const addExtras = appendAnnotation(parsed.target, {
        startLine: parsed.startLine,
        endLine: parsed.endLine,
        format: "markdown",
        content: message,
        source: parsed.source,
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("annotations-updated", {
          targetPath: parsed.target,
          annotations: addExtras.annotations,
        });
      }
      break;
    }
    case "annotate-import": {
      try {
        const raw = fs.readFileSync(parsed.importFile, "utf-8");
        const data = JSON.parse(raw);
        const raws: Record<string, unknown>[] = Array.isArray(data.annotations)
          ? data.annotations
          : Array.isArray(data)
            ? data
            : [];
        const importExtras = appendAnnotations(parsed.target, raws);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("annotations-updated", {
            targetPath: parsed.target,
            annotations: importExtras.annotations,
          });
        }
      } catch (err) {
        console.error(`brpt annotate import: failed to read ${parsed.importFile}:`, err);
      }
      break;
    }
    case "annotate-remove": {
      const removeExtras = removeAnnotation(parsed.target, parsed.annotationId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("annotations-updated", {
          targetPath: parsed.target,
          annotations: removeExtras.annotations,
        });
      }
      break;
    }
    case "annotate-clear": {
      const clearExtras = clearAnnotations(parsed.target);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("annotations-updated", {
          targetPath: parsed.target,
          annotations: clearExtras.annotations,
        });
      }
      break;
    }
    case "annotate-list": {
      // Should be handled in the early-exit block before the single-instance lock.
      console.error("brpt annotate list: internal error (should have exited before single-instance lock)");
      break;
    }
    case "none":
      break;
  }
}

function openFilesAndSend(filePaths: string[]): void {
  if (!windowReady || !mainWindow || mainWindow.isDestroyed()) {
    pendingFiles.push(...filePaths);
    return;
  }

  const fileData: FileData[] = filePaths
    .map((fp) => {
      const abs = resolve(fp);
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
  diffWatches.set(resolve(data.newPath), dw);

  watchFile(secondPath);
  diffWatches.set(resolve(secondPath), dw);

  mainWindow.webContents.send("diff-from-args", data);
}

function secondPathFor(saved: SavedDiff): string {
  return saved.type === "diff" ? saved.diffFile : saved.oldFile;
}

function buildDiffData(saved: SavedDiff): DiffData | null {
  const newPath = resolve(saved.file);
  const secondPath = resolve(secondPathFor(saved));
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
      mtimeMs: newFile.mtimeMs,
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
      mtimeMs: diffFile.mtimeMs,
    };
  }
}

function unwrapEntry(entry: OpenEntry): { inner: string | SavedDiff } {
  if (typeof entry === "string") {
    return { inner: entry };
  }
  return { inner: entry.entry };
}

function restoreSessionEntries(entries: OpenEntry[]): void {
  const filePaths: string[] = [];
  const diffs: SavedDiff[] = [];

  for (const entry of entries) {
    const { inner } = unwrapEntry(entry);
    if (typeof inner === "string") {
      filePaths.push(inner);
    } else {
      diffs.push(inner);
    }
  }

  if (filePaths.length > 0) {
    openFilesAndSend(filePaths);
  }

  for (const saved of diffs) {
    const data = buildDiffData(saved);
    if (data) {
      openDiffAndSend(data, saved.type, resolve(secondPathFor(saved)));
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
    minWidth: 480,
    minHeight: 300,
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

    const sessionEntries = config.openFiles || [];

    // Always restore the session
    restoreSessionEntries(sessionEntries);

    // Restore the previously active tab
    if (config.activeFile) {
      mainWindow.webContents.send("activate-file", config.activeFile);
    }

    // CLI args open on top of the session
    if (firstLaunchCliResult) {
      handleCliResult(firstLaunchCliResult);
      firstLaunchCliResult = null;
    }

    if (pendingFiles.length > 0) {
      openFilesAndSend(pendingFiles);
      pendingFiles.length = 0;
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

// Handle --help and annotate-list before the single-instance lock. These run
// in every process (first or second), do their work, and exit immediately.
const earlyParsed = parseCliArgs(process.argv);
if (earlyParsed.kind === "help") {
  process.stdout.write(earlyParsed.text);
  process.exit(0);
}
if (earlyParsed.kind === "annotate-list") {
  const extras = loadExtras(earlyParsed.target);
  process.stdout.write(JSON.stringify(extras.annotations, null, 2) + "\n");
  process.exit(0);
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
    handleCliResult(parsed);

    const backgroundByDefault = parsed.kind === "notify" || parsed.kind.startsWith("annotate");
    const shouldFocus = ("foreground" in parsed && parsed.foreground) || !backgroundByDefault;
    if (shouldFocus && mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      app.focus({ steal: true });
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Parse CLI args once on cold launch. The result is reused in did-finish-load.
    firstLaunchCliResult = parseCliArgs(process.argv);

    if (!ensureConfigExists()) {
      app.quit();
      return;
    }
    migrateNotificationsIfNeeded();
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
      const abs = resolve(fp);
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
  const abs = resolve(filePath);
  const file = readFile(abs);
  if (file) {
    watchFile(abs);
    return { path: abs, ...file };
  }
  return null;
});

ipcMain.handle("request-diff", (_event, newPath: string, diffPath: string) => {
  const absNew = resolve(newPath);
  const absDiff = resolve(diffPath);
  const newFile = readFile(absNew);
  const diffFile = readFile(absDiff);
  if (!newFile || !diffFile) {
    return null;
  }
  const data: DiffData = {
    mode: "diff",
    newPath: absNew,
    newContent: newFile.content,
    secondPath: absDiff,
    diff: diffFile.content,
    mtimeMs: diffFile.mtimeMs,
  };

  const dw: DiffWatch = { mode: "diff", newPath: absNew, secondPath: absDiff };
  watchFile(absNew);
  diffWatches.set(absNew, dw);
  watchFile(absDiff);
  diffWatches.set(absDiff, dw);

  return data;
});

ipcMain.handle("request-diff-by-files", (_event, newPath: string, oldPath: string) => {
  const absNew = resolve(newPath);
  const absOld = resolve(oldPath);
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
    mtimeMs: newFile.mtimeMs,
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

ipcMain.handle("get-extras", (_event, targetPath: string) => {
  return loadExtras(resolve(targetPath));
});

ipcMain.on("mark-notifications-read", (_event, targetPath: string) => {
  const absPath = resolve(targetPath);
  const extras = loadExtras(absPath);
  extras.notifications = extras.notifications.map((n) => ({ ...n, read: true }));
  saveExtras(absPath, extras);
});

ipcMain.on("dismiss-annotation", (_event, targetPath: string, annotationId: string) => {
  const absPath = resolve(targetPath);
  const extras = removeAnnotation(absPath, annotationId);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("annotations-updated", {
      targetPath: absPath,
      annotations: extras.annotations,
    });
  }
});

ipcMain.on("start-file-drag", async (event, filePath: string) => {
  const icon = await app.getFileIcon(filePath, { size: "small" });
  event.sender.startDrag({ file: filePath, icon });
});

ipcMain.handle("get-store", () => {
  return loadStore();
});

ipcMain.on("tab-activated", (_event, path: string) => {
  const store = loadStore();
  store.tabActivations[path] = new Date().toISOString();
  saveStore(store);
});
