import { contextBridge, ipcRenderer } from "electron";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import os from "os";

export interface AppConfig {
  theme: "light" | "dark";
  openFiles: string[];
  containerFolders: string[];
}

export interface FileData {
  path: string;
  content: string;
  mtimeMs: number;
}

export interface MdviewApi {
  renderMarkdown(text: string): string;
  onFileUpdated(callback: (data: FileData) => void): void;
  onFilesFromArgs(callback: (files: FileData[]) => void): void;
  onConfigLoaded(callback: (config: AppConfig) => void): void;
  openFileDialog(): Promise<FileData[]>;
  requestFile(filePath: string): Promise<FileData | null>;
  closeFile(filePath: string): void;
  getConfig(): Promise<AppConfig>;
  setConfig(key: string, value: unknown): void;
  saveOpenFiles(files: string[]): void;
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
  renderMarkdown: (text: string) => marked.parse(text) as string,

  onFileUpdated: (callback: (data: FileData) => void) => {
    ipcRenderer.on("file-updated", (_event, data: FileData) => callback(data));
  },
  onFilesFromArgs: (callback: (files: FileData[]) => void) => {
    ipcRenderer.on("files-from-args", (_event, files: FileData[]) =>
      callback(files)
    );
  },
  onConfigLoaded: (callback: (config: AppConfig) => void) => {
    ipcRenderer.on("config-loaded", (_event, config: AppConfig) =>
      callback(config)
    );
  },
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  requestFile: (filePath: string) =>
    ipcRenderer.invoke("request-file", filePath),
  closeFile: (filePath: string) => ipcRenderer.send("close-file", filePath),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.send("set-config", key, value),
  saveOpenFiles: (files: string[]) =>
    ipcRenderer.send("save-open-files", files),
  homedir: os.homedir(),
};

contextBridge.exposeInMainWorld("mdview", api);
