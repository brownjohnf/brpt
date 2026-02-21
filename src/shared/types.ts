export type ContentWidthMode = "fixed" | "capped" | "full";

export interface ContentWidthConfig {
  mode: ContentWidthMode;
  fixedWidth: string;
  cappedWidth: string;
}

export interface AppConfig {
  theme: "light" | "dark";
  openFiles: string[];
  containerFolders: string[];
  contentWidth: ContentWidthConfig;
}

export interface FileData {
  path: string;
  content: string;
  mtimeMs: number;
}
