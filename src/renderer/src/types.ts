import type { FileData } from "../../shared/types";

export type {
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  FileData,
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

export type Tab = MarkdownTab;
