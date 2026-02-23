import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Annotation } from "../types";

export interface GutterLine {
  line: number;
  endLine: number;
  top: number;
  bottom: number;
}

export type MeasureGutterLines = (contentEl: HTMLElement, gutterEl: HTMLElement) => GutterLine[];

interface AnnotationGutterProps {
  contentRef: RefObject<HTMLDivElement | null>;
  measureLines: MeasureGutterLines;
  deps: unknown[];
  annotations: Annotation[] | undefined;
}

function findLineEntry(lines: GutterLine[], targetLine: number): GutterLine | null {
  let firstAfter: GutterLine | null = null;
  for (const entry of lines) {
    if (targetLine >= entry.line && targetLine <= entry.endLine) {
      return entry;
    }
    if (entry.line > targetLine && (firstAfter == null || entry.line < firstAfter.line)) {
      firstAfter = entry;
    }
  }
  return firstAfter;
}

export function AnnotationGutter({
  contentRef,
  measureLines,
  deps,
  annotations,
}: AnnotationGutterProps): ReactNode {
  const [lines, setLines] = useState<GutterLine[]>([]);
  const gutterRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = contentRef.current;
    const gutter = gutterRef.current;
    if (!el || !gutter) {
      return;
    }
    setLines(measureLines(el, gutter));
  }, [contentRef, measureLines]);

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentRef, measure]);

  const annotatedLines = useMemo(() => {
    const set = new Set<number>();
    if (!annotations) {
      return set;
    }
    for (const a of annotations) {
      if (a.startLine != null && a.endLine != null) {
        const startEntry = findLineEntry(lines, a.startLine);
        const endEntry = findLineEntry(lines, a.endLine);
        if (startEntry) {
          set.add(startEntry.endLine);
        }
        if (endEntry) {
          set.add(endEntry.endLine);
        }
      } else if (a.line != null) {
        const entry = findLineEntry(lines, a.line);
        if (entry) {
          set.add(entry.endLine);
        }
      }
    }
    return set;
  }, [annotations, lines]);

  const rangeLines = useMemo(() => {
    if (!annotations || lines.length === 0) {
      return [];
    }
    const result: { key: number; top: number; bottom: number }[] = [];
    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i];
      if (a.startLine != null && a.endLine != null) {
        const startEntry = findLineEntry(lines, a.startLine);
        const endEntry = findLineEntry(lines, a.endLine);
        if (startEntry && endEntry && startEntry !== endEntry) {
          const dotOffset = 9;
          result.push({
            key: i,
            top: startEntry.bottom - dotOffset,
            bottom: endEntry.bottom - dotOffset,
          });
        }
      }
    }
    return result;
  }, [annotations, lines]);

  return (
    <div ref={gutterRef} className="annotation-gutter">
      {lines.map((l) => (
        <div key={l.line} className="gutter-line-entry" style={{ top: l.top, height: l.bottom - l.top }}>
          {annotatedLines.has(l.endLine) && (
            <div className="gutter-annotation-dot" />
          )}
          <span className="gutter-line-number">{l.line}</span>
          <div className="gutter-line-divider" />
        </div>
      ))}
      {rangeLines.map((r) => (
        <div
          key={`range-${r.key}`}
          className="gutter-annotation-range-line"
          style={{ top: r.top, height: r.bottom - r.top }}
        />
      ))}
    </div>
  );
}
