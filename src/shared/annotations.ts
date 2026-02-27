import type { Annotation } from "./types";

export function annotationInsertionLine(a: Annotation): number {
  return a.endLine;
}

