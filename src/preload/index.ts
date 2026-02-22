import { contextBridge, ipcRenderer } from "electron";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import os from "os";
import type { AppConfig, DiffData, FileData, OpenEntry } from "../shared/types";
export type { AppConfig, DiffData, FileData, OpenEntry };

export interface MdviewApi {
  renderMarkdown(text: string): string;
  onFileUpdated(callback: (data: FileData) => void): () => void;
  onFileRemoved(callback: (data: { path: string }) => void): () => void;
  onFilesFromArgs(callback: (files: FileData[]) => void): () => void;
  onDiffFromArgs(callback: (data: DiffData) => void): () => void;
  onDiffUpdated(callback: (data: DiffData) => void): () => void;
  onConfigLoaded(callback: (config: AppConfig) => void): () => void;
  openFileDialog(): Promise<FileData[]>;
  requestFile(filePath: string): Promise<FileData | null>;
  closeFile(filePath: string): void;
  getConfig(): Promise<AppConfig>;
  setConfig(key: string, value: unknown): void;
  saveOpenFiles(entries: OpenEntry[]): void;
  homedir: string;
}

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  })
);

const api: MdviewApi = {
  renderMarkdown: (text: string) =>
    marked.parse(text, { async: false }) as string,

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
  closeFile: (filePath: string) => ipcRenderer.send("close-file", filePath),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.send("set-config", key, value),
  saveOpenFiles: (entries: OpenEntry[]) =>
    ipcRenderer.send("save-open-files", entries),
  homedir: os.homedir(),
};

contextBridge.exposeInMainWorld("mdview", api);
