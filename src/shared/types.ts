export type ContentWidthMode = "fixed" | "capped" | "full";

export interface ContentWidthConfig {
  mode: ContentWidthMode;
  fixedWidth: string;
  cappedWidth: string;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppConfig {
  theme: "light" | "dark";
  openFiles: string[];
  containerFolders: string[];
  contentWidth: ContentWidthConfig;
  brpt_development_roots?: string[];
  windowBounds?: WindowBounds;
  sidebarWidth?: number;
}

export interface FileData {
  path: string;
  content: string;
  mtimeMs: number;
}
