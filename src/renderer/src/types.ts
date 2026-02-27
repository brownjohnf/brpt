import type { Annotation, BrptNotification, DiffMode } from "../../shared/types";

export type {
  Annotation,
  AppConfig,
  BrptNotification,
  ContentWidthConfig,
  ContentWidthMode,
  DiffData,
  DiffMode,
  FileData,
  OpenEntry,
  OpenFileEntry,
  ProjectEntry,
  SavedDiff,
  SidecarExtras,
} from "../../shared/types";

export interface BaseTab {
  path: string;
  scrollTop: number;
  lastModifiedAt: Temporal.Instant | null;
  lastActivatedAt?: Temporal.Instant;
  hasUnseenChanges: boolean;
  removed?: boolean;
  annotations?: Annotation[];
  notifications: BrptNotification[];
  unreadNotificationCount: number;
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

export interface ViewerCapabilities {
  draggablePath?: string;
}
