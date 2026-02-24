import type { Annotation } from "./types";

export function annotationInsertionLine(a: Annotation): number {
  if (a.startLine != null && a.endLine != null) {
    return a.endLine;
  }
  return a.line ?? 0;
}

