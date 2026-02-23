import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { classNames } from "../classNames";
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
  collapsedInsertionLines?: Set<number>;
  onDotClick?: (insertionLines: number[]) => void;
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

function annotationInsertionLine(a: Annotation): number {
  if (a.startLine != null && a.endLine != null) {
    return a.endLine;
  }
  return a.line ?? 0;
}

export function AnnotationGutter({
  contentRef,
  measureLines,
  deps,
  annotations,
  collapsedInsertionLines,
  onDotClick,
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

  const { annotatedLines, dotInsertionLines } = useMemo(() => {
    const set = new Set<number>();
    const dotMap = new Map<number, number[]>();
    if (!annotations) {
      return { annotatedLines: set, dotInsertionLines: dotMap };
    }
    for (const a of annotations) {
      const insertionLine = annotationInsertionLine(a);
      if (a.startLine != null && a.endLine != null) {
        const startEntry = findLineEntry(lines, a.startLine);
        const endEntry = findLineEntry(lines, a.endLine);
        if (startEntry) {
          set.add(startEntry.endLine);
          const existing = dotMap.get(startEntry.endLine);
          if (existing) {
            if (!existing.includes(insertionLine)) {
              existing.push(insertionLine);
            }
          } else {
            dotMap.set(startEntry.endLine, [insertionLine]);
          }
        }
        if (endEntry) {
          set.add(endEntry.endLine);
          const existing = dotMap.get(endEntry.endLine);
          if (existing) {
            if (!existing.includes(insertionLine)) {
              existing.push(insertionLine);
            }
          } else {
            dotMap.set(endEntry.endLine, [insertionLine]);
          }
        }
      } else if (a.line != null) {
        const entry = findLineEntry(lines, a.line);
        if (entry) {
          set.add(entry.endLine);
          const existing = dotMap.get(entry.endLine);
          if (existing) {
            if (!existing.includes(insertionLine)) {
              existing.push(insertionLine);
            }
          } else {
            dotMap.set(entry.endLine, [insertionLine]);
          }
        }
      }
    }
    return { annotatedLines: set, dotInsertionLines: dotMap };
  }, [annotations, lines]);

  const rangeLines = useMemo(() => {
    if (!annotations || lines.length === 0) {
      return [];
    }
    const result: { key: number; top: number; bottom: number; insertionLine: number }[] = [];
    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i];
      if (a.startLine != null && a.endLine != null) {
        const startEntry = findLineEntry(lines, a.startLine);
        const endEntry = findLineEntry(lines, a.endLine);
        if (startEntry && endEntry && startEntry !== endEntry) {
          const dotOffset = 9;
          const dotRadius = 4;
          result.push({
            key: i,
            top: startEntry.bottom - dotOffset + dotRadius,
            bottom: endEntry.bottom - dotOffset - dotRadius,
            insertionLine: annotationInsertionLine(a),
          });
        }
      }
    }
    return result;
  }, [annotations, lines]);

  const hasAnnotations = annotations != null && annotations.length > 0;

  const maxDigits = useMemo(() => {
    if (lines.length === 0) {
      return 1;
    }
    return String(Math.max(...lines.map((l) => l.line))).length;
  }, [lines]);

  const gutterWidth = `calc(${maxDigits + (hasAnnotations ? 1 : 0)}ch + 8px)`;

  return (
    <div ref={gutterRef} className="annotation-gutter" style={{ width: gutterWidth }}>
      {lines.map((l) => {
        const insertionLines = dotInsertionLines.get(l.endLine);
        const hasDot = annotatedLines.has(l.endLine);
        const isCollapsed = hasDot && insertionLines != null &&
          collapsedInsertionLines != null &&
          insertionLines.every((il) => collapsedInsertionLines.has(il));

        return (
          <div
            key={l.line}
            className={classNames(
              "gutter-line-entry",
              hasDot && "gutter-line-entry--clickable",
            )}
            style={{ top: l.top, height: l.bottom - l.top }}
            onClick={hasDot && insertionLines && onDotClick
              ? () => onDotClick(insertionLines)
              : undefined}
          >
            {hasDot && (
              <div className={classNames(
                "gutter-annotation-dot",
                isCollapsed && "gutter-annotation-dot--collapsed",
              )} />
            )}
            <span className="gutter-line-number">{l.line}</span>
            <div className="gutter-line-divider" />
          </div>
        );
      })}
      {rangeLines.map((r) => (
        <div
          key={`range-${r.key}`}
          className={classNames(
            "gutter-annotation-range-line",
            collapsedInsertionLines?.has(r.insertionLine) && "gutter-annotation-range-line--collapsed",
          )}
          style={{ top: r.top, height: r.bottom - r.top }}
        />
      ))}
    </div>
  );
}
