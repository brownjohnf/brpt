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

export interface BrptNotification {
  id: string;
  content: string;
  receivedAt: string;
  read: boolean;
}

export interface Annotation {
  id: string;
  startLine: number;
  endLine: number;
  format: string;
  content: string;
  source?: string;
}

export interface SidecarExtras {
  targetPath: string;
  notifications: BrptNotification[];
  annotations: Annotation[];
}

export interface OpenFileEntry {
  entry: string | SavedDiff;
}

export type OpenEntry = string | OpenFileEntry;

export type ProjectEntry = string | { path: string; alias?: string };

export interface AppConfig {
  theme: "light" | "dark";
  openFiles: OpenEntry[];
  containerFolders: string[];
  projects?: ProjectEntry[];
  activeFile?: string;
  groupOrder?: string[];
  contentWidth: ContentWidthConfig;
  brpt_development_roots?: string[];
  windowBounds?: WindowBounds;
  sidebarWidth?: number;
  drawerWidth?: number;
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
  mtimeMs: number;
}
