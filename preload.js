const { contextBridge, ipcRenderer } = require("electron");
const { Marked } = require("marked");
const { markedHighlight } = require("marked-highlight");
const hljs = require("highlight.js");

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

contextBridge.exposeInMainWorld("mdview", {
  renderMarkdown: (text) => marked.parse(text),

  onFileUpdated: (callback) => {
    ipcRenderer.on("file-updated", (_event, data) => callback(data));
  },
  onFilesFromArgs: (callback) => {
    ipcRenderer.on("files-from-args", (_event, files) => callback(files));
  },
  onConfigLoaded: (callback) => {
    ipcRenderer.on("config-loaded", (_event, config) => callback(config));
  },
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  requestFile: (filePath) => ipcRenderer.invoke("request-file", filePath),
  closeFile: (filePath) => ipcRenderer.send("close-file", filePath),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (key, value) => ipcRenderer.send("set-config", key, value),
  saveOpenFiles: (files) => ipcRenderer.send("save-open-files", files),
});
