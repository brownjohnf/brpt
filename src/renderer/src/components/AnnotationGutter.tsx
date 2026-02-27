import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { annotationInsertionLine } from "../../../shared/annotations";
import { classNames } from "../classNames";
import type { Annotation } from "../types";

const DOT_SIZE = 8;
const DOT_BOTTOM = 5;
const DOT_LEFT = 4;
const DOT_RADIUS = DOT_SIZE / 2;
const DOT_CENTER_FROM_BOTTOM = DOT_BOTTOM + DOT_RADIUS;
const RANGE_LINE_WIDTH = 2;
const RANGE_LINE_LEFT = DOT_LEFT + DOT_RADIUS - RANGE_LINE_WIDTH / 2;

export interface GutterLine {
  line: number;
  endLine: number;
  top: number;
  bottom: number;
}

export type MeasureGutterLines = (contentEl: HTMLElement, gutterEl: HTMLElement) => GutterLine[];

interface AnnotationGutterProps {
  contentEl: HTMLDivElement | null;
  measureLines: MeasureGutterLines;
  contentKey: unknown;
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

export function AnnotationGutter({
  contentEl,
  measureLines,
  contentKey,
  annotations,
  collapsedInsertionLines,
  onDotClick,
}: AnnotationGutterProps): ReactNode {
  const [lines, setLines] = useState<GutterLine[]>([]);
  const gutterRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const gutter = gutterRef.current;
    if (!contentEl || !gutter) {
      return;
    }
    setLines(measureLines(contentEl, gutter));
  }, [contentEl, measureLines]);

  useLayoutEffect(() => {
    measure();
  }, [measure, contentKey, annotations]);

  useLayoutEffect(() => {
    measure();
    const start = performance.now();
    let raf: number;
    function tick() {
      measure();
      if (performance.now() - start < 250) {
        raf = requestAnimationFrame(tick);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [measure, collapsedInsertionLines]);

  useEffect(() => {
    if (!contentEl) {
      return;
    }
    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          measure();
        });
      }
    });
    observer.observe(contentEl);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [contentEl, measure]);

  const { annotatedLines, dotInsertionLines } = useMemo(() => {
    const set = new Set<number>();
    const dotMap = new Map<number, number[]>();
    if (!annotations) {
      return { annotatedLines: set, dotInsertionLines: dotMap };
    }

    function markEntry(entry: GutterLine, insertionLine: number) {
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

    for (const a of annotations) {
      const insertionLine = annotationInsertionLine(a);
      const startEntry = findLineEntry(lines, a.startLine);
      const endEntry = findLineEntry(lines, a.endLine);
      if (startEntry) { markEntry(startEntry, insertionLine); }
      if (endEntry && endEntry !== startEntry) { markEntry(endEntry, insertionLine); }
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
          result.push({
            key: i,
            top: startEntry.bottom - DOT_CENTER_FROM_BOTTOM + DOT_RADIUS,
            bottom: endEntry.bottom - DOT_CENTER_FROM_BOTTOM - DOT_RADIUS,
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
              <div
                className={classNames(
                  "gutter-annotation-dot",
                  isCollapsed && "gutter-annotation-dot--collapsed",
                )}
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  left: DOT_LEFT,
                  bottom: DOT_BOTTOM,
                }}
              />
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
          style={{ top: r.top, height: r.bottom - r.top, left: RANGE_LINE_LEFT, width: RANGE_LINE_WIDTH }}
        />
      ))}
    </div>
  );
}
