import type { FileData } from "../../shared/types";

export type {
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  FileData,
} from "../../shared/types";

export interface Tab extends FileData {
  scrollTop: number;
  lastModifiedAt: Temporal.Instant | null;
  hasUnseenChanges: boolean;
  removed?: boolean;
}
