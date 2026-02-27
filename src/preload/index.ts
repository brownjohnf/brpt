import { contextBridge, ipcRenderer } from "electron";
import hljs from "highlight.js";
import { Marked, type Token, type Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import os from "os";
import type { Annotation, AppConfig, BrptNotification, DiffData, FileData, OpenEntry, SidecarExtras } from "../shared/types";
export type { AppConfig, BrptNotification, DiffData, FileData, OpenEntry, SidecarExtras };

export interface MdviewApi {
  renderMarkdown(text: string, startLine?: number): string;
  onFileUpdated(callback: (data: FileData) => void): () => void;
  onFileRemoved(callback: (data: { path: string }) => void): () => void;
  onFilesFromArgs(callback: (files: FileData[]) => void): () => void;
  onDiffFromArgs(callback: (data: DiffData) => void): () => void;
  onDiffUpdated(callback: (data: DiffData) => void): () => void;
  onAnnotationsUpdated(callback: (data: { targetPath: string; annotations: Annotation[] }) => void): () => void;
  onConfigLoaded(callback: (config: AppConfig) => void): () => void;
  onActivateFile(callback: (path: string) => void): () => void;
  openFileDialog(): Promise<FileData[]>;
  requestFile(filePath: string): Promise<FileData | null>;
  requestDiff(newPath: string, diffPath: string): Promise<DiffData | null>;
  requestDiffByFiles(newPath: string, oldPath: string): Promise<DiffData | null>;
  closeFile(filePath: string): void;
  getConfig(): Promise<AppConfig>;
  setConfig(key: string, value: unknown): void;
  saveOpenFiles(entries: OpenEntry[]): void;
  onNotificationReceived(callback: (data: { targetPath: string; notification: BrptNotification }) => void): () => void;
  getExtras(targetPath: string): Promise<SidecarExtras>;
  markNotificationsRead(targetPath: string): void;
  dismissAnnotation(targetPath: string, annotationId: string): void;
  startFileDrag(filePath: string): void;
  homedir: string;
}

/**
 * Blockquote inner tokens have `raw` values stripped of `> ` prefixes,
 * so counting newlines in `raw` doesn't give source line offsets.
 * Instead, locate each token's text within the blockquote's `text`
 * property (which preserves line structure) to compute line offsets.
 */
function assignBlockquoteLineNumbers(bqToken: Tokens.Blockquote, startLine: number): void {
  let searchOffset = 0;
  for (const token of bqToken.tokens) {
    const pos = bqToken.text.indexOf(token.raw, searchOffset);
    const lineOffset = pos >= 0
      ? bqToken.text.substring(0, pos).split("\n").length - 1
      : 0;
    const tokenLine = startLine + lineOffset;
    (token as Record<string, unknown>)._line = tokenLine;

    if (token.type === "blockquote") {
      assignBlockquoteLineNumbers(token as Tokens.Blockquote, tokenLine);
    }

    if (pos >= 0) {
      searchOffset = pos + token.raw.length;
    }
  }
}

/** Assign `_line` to tokens based on cumulative newlines in `raw`. */
function assignLineNumbers(tokens: Token[], startLine: number = 1): void {
  let line = startLine;
  for (const token of tokens) {
    (token as Record<string, unknown>)._line = line;

    if (token.type === "list") {
      const listToken = token as Tokens.List;
      let itemLine = line;
      for (const item of listToken.items) {
        (item as unknown as Record<string, unknown>)._line = itemLine;
        itemLine += item.raw.split("\n").length - 1;
      }
    }

    if (token.type === "blockquote") {
      const bqToken = token as Tokens.Blockquote;
      assignBlockquoteLineNumbers(bqToken, line);
    }

    if (token.type === "table") {
      const tableToken = token as Tokens.Table & { _headerLine?: number; _rowLines?: number[] };
      // Header row is the first line of the table, separator is the second
      tableToken._headerLine = line;
      tableToken._rowLines = [];
      // +2 for header row + separator row
      let rowLine = line + 2;
      for (let i = 0; i < tableToken.rows.length; i++) {
        tableToken._rowLines.push(rowLine);
        rowLine++;
      }
    }

    const newlines = token.raw.split("\n").length - 1;
    line += newlines;
  }
}

function injectLineAttr(tag: string, line: number | undefined): string {
  if (line == null) {
    return tag;
  }
  return tag.replace(/>/, ` data-source-line="${line}">`);
}

const lineRenderer = {
  code(this: { parser: { parseInline(tokens: Token[]): string } }, token: Tokens.Code & { _line?: number }) {
    const langString = (token.lang || "").match(/\S+/)?.[0] ? token.lang : "";
    const raw = token.text.replace(/\n$/, "") + "\n";

    // markedHighlight's renderer is overridden by ours, so highlight here directly.
    let highlighted: string;
    if (langString && hljs.getLanguage(langString)) {
      highlighted = hljs.highlight(raw, { language: langString }).value;
    } else {
      highlighted = hljs.highlightAuto(raw).value;
    }

    // Wrap each line in a span with data-source-line.
    // _line is the opening ```, so code lines start at _line + 1.
    let wrappedInner = highlighted;
    if (token._line != null) {
      const codeStartLine = token._line + 1;
      const lines = highlighted.split("\n");
      wrappedInner = lines
        .map((l, i) => {
          if (i === lines.length - 1 && l === "") {
            return "";
          }
          return `<span data-source-line="${codeStartLine + i}">${l}</span>`;
        })
        .join("\n");
    }

    const langClass = langString ? `hljs language-${langString}` : "hljs";
    return `<pre><code class="${langClass}">${wrappedInner}</code></pre>\n`;
  },
  blockquote(this: { parser: { parse(tokens: Token[]): string } }, token: Tokens.Blockquote & { _line?: number }) {
    const body = this.parser.parse(token.tokens);
    return `<blockquote>\n${body}</blockquote>\n`;
  },
  heading(this: { parser: { parseInline(tokens: Token[]): string } }, token: Tokens.Heading & { _line?: number }) {
    const text = this.parser.parseInline(token.tokens);
    return injectLineAttr(`<h${token.depth}>${text}</h${token.depth}>\n`, token._line);
  },
  hr(token: Tokens.Hr & { _line?: number }) {
    return injectLineAttr("<hr>\n", token._line);
  },
  list(this: { parser: { parse(tokens: Token[], loose: boolean): string } }, token: Tokens.List & { _line?: number }) {
    const ordered = token.ordered;
    const start = token.start;
    let body = "";
    for (const item of token.items) {
      const itemWithLine = item as Tokens.ListItem & { _line?: number };
      let itemBody = "";
      if (item.task) {
        const checkbox = `<input ${item.checked ? 'checked="" ' : ''}disabled="" type="checkbox">`;
        if (item.loose) {
          if (item.tokens[0]?.type === "paragraph") {
            const pToken = item.tokens[0] as Tokens.Paragraph;
            item.tokens[0] = { ...pToken, text: checkbox + " " + pToken.text } as Tokens.Paragraph;
          }
        } else {
          itemBody += checkbox + " ";
        }
      }
      itemBody += this.parser.parse(item.tokens, !!item.loose);
      body += injectLineAttr(`<li>${itemBody}</li>\n`, itemWithLine._line);
    }
    const type = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
    return `<${type}${startAttr}>\n${body}</${type}>\n`;
  },
  paragraph(this: { parser: { parseInline(tokens: Token[]): string } }, token: Tokens.Paragraph & { _line?: number }) {
    return injectLineAttr(`<p>${this.parser.parseInline(token.tokens)}</p>\n`, token._line);
  },
  table(this: { parser: { parseInline(tokens: Token[]): string } }, token: Tokens.Table & { _line?: number; _headerLine?: number; _rowLines?: number[] }) {
    let header = "";
    let cell = "";
    for (let j = 0; j < token.header.length; j++) {
      const h = token.header[j];
      const align = h.align ? ` align="${h.align}"` : "";
      cell += `<th${align}>${this.parser.parseInline(h.tokens)}</th>\n`;
    }
    header += injectLineAttr(`<tr>\n${cell}</tr>\n`, token._headerLine);
    let body = "";
    for (let i = 0; i < token.rows.length; i++) {
      const row = token.rows[i];
      let rowStr = "";
      for (let j = 0; j < row.length; j++) {
        const c = row[j];
        const align = c.align ? ` align="${c.align}"` : "";
        rowStr += `<td${align}>${this.parser.parseInline(c.tokens)}</td>\n`;
      }
      body += injectLineAttr(`<tr>\n${rowStr}</tr>\n`, token._rowLines?.[i]);
    }
    return `<table>\n<thead>\n${header}</thead>\n<tbody>${body}</tbody>\n</table>\n`;
  },
};

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
  { renderer: lineRenderer },
);

/** Render with no line-tracking (for annotation content, etc.) */
const markedPlain = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

function renderMarkdownWithLines(text: string, startLine: number): string {
  const tokens = marked.lexer(text);
  assignLineNumbers(tokens, startLine);
  return marked.parser(tokens);
}

const api: MdviewApi = {
  renderMarkdown: (text: string, startLine?: number) =>
    startLine != null
      ? renderMarkdownWithLines(text, startLine)
      : (markedPlain.parse(text, { async: false }) as string),

  onFileUpdated: (callback: (data: FileData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: FileData): void =>
      callback(data);
    ipcRenderer.on("file-updated", listener);
    return () => {
      ipcRenderer.removeListener("file-updated", listener);
    };
  },
  onFileRemoved: (callback: (data: { path: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { path: string },
    ): void => callback(data);
    ipcRenderer.on("file-removed", listener);
    return () => {
      ipcRenderer.removeListener("file-removed", listener);
    };
  },
  onFilesFromArgs: (callback: (files: FileData[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: FileData[]): void =>
      callback(files);
    ipcRenderer.on("files-from-args", listener);
    return () => {
      ipcRenderer.removeListener("files-from-args", listener);
    };
  },
  onDiffFromArgs: (callback: (data: DiffData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DiffData): void =>
      callback(data);
    ipcRenderer.on("diff-from-args", listener);
    return () => {
      ipcRenderer.removeListener("diff-from-args", listener);
    };
  },
  onDiffUpdated: (callback: (data: DiffData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DiffData): void =>
      callback(data);
    ipcRenderer.on("diff-updated", listener);
    return () => {
      ipcRenderer.removeListener("diff-updated", listener);
    };
  },
  onAnnotationsUpdated: (callback: (data: { targetPath: string; annotations: Annotation[] }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { targetPath: string; annotations: Annotation[] }): void =>
      callback(data);
    ipcRenderer.on("annotations-updated", listener);
    return () => {
      ipcRenderer.removeListener("annotations-updated", listener);
    };
  },
  onConfigLoaded: (callback: (config: AppConfig) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig): void =>
      callback(config);
    ipcRenderer.on("config-loaded", listener);
    return () => {
      ipcRenderer.removeListener("config-loaded", listener);
    };
  },
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  requestFile: (filePath: string) =>
    ipcRenderer.invoke("request-file", filePath),
  requestDiff: (newPath: string, diffPath: string) =>
    ipcRenderer.invoke("request-diff", newPath, diffPath),
  requestDiffByFiles: (newPath: string, oldPath: string) =>
    ipcRenderer.invoke("request-diff-by-files", newPath, oldPath),
  closeFile: (filePath: string) =>
    ipcRenderer.send("close-file", filePath),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.send("set-config", key, value),
  saveOpenFiles: (entries: OpenEntry[]) =>
    ipcRenderer.send("save-open-files", entries),
  onActivateFile: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string): void =>
      callback(path);
    ipcRenderer.on("activate-file", listener);
    return () => {
      ipcRenderer.removeListener("activate-file", listener);
    };
  },
  onNotificationReceived: (callback: (data: { targetPath: string; notification: BrptNotification }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { targetPath: string; notification: BrptNotification }): void =>
      callback(data);
    ipcRenderer.on("notification-received", listener);
    return () => {
      ipcRenderer.removeListener("notification-received", listener);
    };
  },
  getExtras: (targetPath: string) =>
    ipcRenderer.invoke("get-extras", targetPath),
  markNotificationsRead: (targetPath: string) =>
    ipcRenderer.send("mark-notifications-read", targetPath),
  dismissAnnotation: (targetPath: string, annotationId: string) =>
    ipcRenderer.send("dismiss-annotation", targetPath, annotationId),
  startFileDrag: (filePath: string) =>
    ipcRenderer.send("start-file-drag", filePath),
  homedir: os.homedir(),
};

contextBridge.exposeInMainWorld("mdview", api);
