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

export type DiffMode = "diff" | "diff-by-files";

export type SavedDiff =
  | { type: "diff"; file: string; diffFile: string }
  | { type: "diff-by-files"; file: string; oldFile: string };

export type OpenEntry = string | SavedDiff;

export interface AppConfig {
  theme: "light" | "dark";
  openFiles: OpenEntry[];
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

export interface DiffData {
  mode: DiffMode;
  newPath: string;
  newContent: string;
  secondPath: string;
  oldContent?: string;
  diff: string;
}
