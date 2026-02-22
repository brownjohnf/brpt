import type { DiffMode } from "../../shared/types";

export type {
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  DiffData,
  DiffMode,
  FileData,
  OpenEntry,
  SavedDiff,
} from "../../shared/types";

export interface BaseTab {
  path: string;
  scrollTop: number;
  lastModifiedAt: Temporal.Instant | null;
  hasUnseenChanges: boolean;
  removed?: boolean;
}

export interface MarkdownTab extends BaseTab {
  kind: "markdown";
  content: string;
  mtimeMs: number;
}

export interface DiffTab extends BaseTab {
  kind: "diff";
  mode: DiffMode;
  secondPath: string;
  newContent: string;
  oldContent?: string;
  diff: string;
}

export type Tab = MarkdownTab | DiffTab;
