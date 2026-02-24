import "diff2html/bundles/css/diff2html.min.css";
import { html } from "diff2html";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { classNames } from "../../classNames";
import { annotationInsertionLine } from "../../../../shared/annotations";
import type { Annotation, DiffTab, ViewerCapabilities } from "../../types";
import { AnnotationGutter, type GutterLine } from "../AnnotationGutter";
import { SegmentedControl } from "../ui-elements/SegmentedControl";

const { mdview } = window;

export function diffCapabilities(tab: DiffTab): ViewerCapabilities {
  return { draggablePath: tab.path };
}

function measureDiffByFilesLines(contentEl: HTMLElement, gutterEl: HTMLElement): GutterLine[] {
  const gutterRect = gutterEl.getBoundingClientRect();
  const rows = contentEl.querySelectorAll<HTMLElement>("tr:not(.d2h-info)");
  const result: GutterLine[] = [];
  for (const row of rows) {
    const lineNum2 = row.querySelector<HTMLElement>(".line-num2");
    const text = lineNum2?.textContent?.trim();
    if (!text) {
      continue;
    }
    const line = parseInt(text, 10);
    if (isNaN(line)) {
      continue;
    }
    const rect = row.getBoundingClientRect();
    result.push({
      line,
      endLine: line,
      top: rect.top - gutterRect.top,
      bottom: rect.bottom - gutterRect.top,
    });
  }
  return result;
}

type DiffViewMode = "line-by-line" | "side-by-side";

const viewModeOptions: { value: DiffViewMode; label: string }[] = [
  { value: "line-by-line", label: "Unified" },
  { value: "side-by-side", label: "Split" },
];

interface DiffContentProps {
  tab: DiffTab;
  viewMode: DiffViewMode;
}

/**
 * For --diff-by-files mode, map primary (new) file line numbers to diff file
 * line numbers so we can split the diff output at the right positions.
 */
function mapNewLineNumbersToDiffLines(diffText: string): Map<number, number> {
  const lines = diffText.split("\n");
  const mapping = new Map<number, number>();
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("-")) {
      // Deleted line — no new-file line number
      continue;
    }
    if (line.startsWith("+") || line.startsWith(" ")) {
      // Added or context line — maps to a new-file line
      mapping.set(newLine, i + 1); // 1-indexed diff line
      newLine++;
    }
  }
  return mapping;
}

interface DiffAnnotationChunk {
  diffHtml: string;
  annotations: Annotation[];
  startLine: number;
  endLine: number;
}

function buildDiffAnnotatedChunks(
  diffText: string,
  annotations: Annotation[],
  mode: "diff" | "diff-by-files",
): DiffAnnotationChunk[] {
  const sorted = [...annotations].sort(
    (a, b) => annotationInsertionLine(a) - annotationInsertionLine(b),
  );

  // Resolve annotation line numbers to diff file line numbers
  let lineMapping: Map<number, number> | null = null;
  if (mode === "diff-by-files") {
    lineMapping = mapNewLineNumbersToDiffLines(diffText);
  }

  // Group annotations by diff line number
  const byDiffLine = new Map<number, Annotation[]>();
  for (const a of sorted) {
    const targetLine = annotationInsertionLine(a);
    let diffLine: number;
    if (lineMapping) {
      // Find the closest mapped diff line at or before the target
      let best = 0;
      for (const [newLine, dLine] of lineMapping) {
        if (newLine <= targetLine && dLine > best) {
          best = dLine;
        }
      }
      diffLine = best || targetLine;
    } else {
      diffLine = targetLine;
    }
    const group = byDiffLine.get(diffLine);
    if (group) {
      group.push(a);
    } else {
      byDiffLine.set(diffLine, [a]);
    }
  }

  // Split diff text at annotation insertion points
  const diffLines = diffText.split("\n");
  const breakpoints = [...byDiffLine.keys()].sort((a, b) => a - b);
  const chunks: DiffAnnotationChunk[] = [];
  let cursor = 0;

  for (const bp of breakpoints) {
    const lineIdx = Math.min(bp, diffLines.length);
    if (lineIdx > cursor) {
      const chunk = diffLines.slice(cursor, lineIdx).join("\n");
      const diffHtml = html(chunk, {
        drawFileList: false,
        outputFormat: "line-by-line",
        matching: "lines",
        colorScheme: "auto" as never,
      });
      chunks.push({
        diffHtml,
        annotations: byDiffLine.get(bp)!,
        startLine: cursor + 1,
        endLine: lineIdx,
      });
      cursor = lineIdx;
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1].annotations.push(...byDiffLine.get(bp)!);
    } else {
      chunks.push({ diffHtml: "", annotations: byDiffLine.get(bp)!, startLine: 1, endLine: 0 });
    }
  }

  if (cursor < diffLines.length) {
    const chunk = diffLines.slice(cursor).join("\n");
    const diffHtml = html(chunk, {
      drawFileList: false,
      outputFormat: "line-by-line",
      matching: "lines",
      colorScheme: "auto" as never,
    });
    chunks.push({
      diffHtml,
      annotations: [],
      startLine: cursor + 1,
      endLine: diffLines.length,
    });
  }

  return chunks;
}

export function DiffContent({ tab, viewMode }: DiffContentProps): ReactNode {
  const hasAnnotations = tab.annotations && tab.annotations.length > 0;
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [collapsedInsertionLines, setCollapsedInsertionLines] = useState<Set<number>>(new Set());

  const handleDotClick = useCallback((insertionLines: number[]) => {
    setCollapsedInsertionLines((prev) => {
      const next = new Set(prev);
      const allCollapsed = insertionLines.every((il) => next.has(il));
      for (const il of insertionLines) {
        if (allCollapsed) {
          next.delete(il);
        } else {
          next.add(il);
        }
      }
      return next;
    });
  }, []);

  const diffHtml = useMemo(() => {
    if (hasAnnotations) {
      return null;
    }
    return html(tab.diff, {
      drawFileList: false,
      outputFormat: viewMode,
      matching: "lines",
      colorScheme: "auto" as never,
    });
  }, [tab.diff, viewMode, hasAnnotations]);

  const annotatedChunks = useMemo(() => {
    if (!hasAnnotations) {
      return null;
    }
    return buildDiffAnnotatedChunks(tab.diff, tab.annotations!, tab.mode);
  }, [tab.diff, tab.annotations, tab.mode, hasAnnotations]);

  return (
    <div className="flex min-h-full">
      <AnnotationGutter
        contentEl={contentEl}
        measureLines={measureDiffByFilesLines}
        deps={[tab.diff, tab.annotations, collapsedInsertionLines]}
        annotations={tab.annotations}
        collapsedInsertionLines={collapsedInsertionLines}
        onDotClick={handleDotClick}
      />
      <div
        ref={setContentEl}
        className={classNames(
          "diff-viewer flex-1 min-w-0 pl-8",
          annotatedChunks ? "d2h-unified" : (viewMode === "side-by-side" ? "d2h-side-by-side" : "d2h-unified"),
        )}
      >
        {annotatedChunks ? (
          annotatedChunks.map((chunk, i) => (
            <div key={i}>
              {chunk.diffHtml && (
                <div
                  data-chunk-lines={`${chunk.startLine}-${chunk.endLine}`}
                  dangerouslySetInnerHTML={{ __html: chunk.diffHtml }}
                />
              )}
              {!collapsedInsertionLines.has(chunk.endLine) && chunk.annotations.map((a, j) => (
                <div key={j} className="annotation-wrapper">
                  <div className="annotation-block">
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: mdview.renderMarkdown(a.content) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div dangerouslySetInnerHTML={{ __html: diffHtml! }} />
        )}
      </div>
    </div>
  );
}

function fileLabel(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

interface DiffTopBarContentProps {
  tab: DiffTab;
  viewMode: DiffViewMode;
  onChangeViewMode: (mode: DiffViewMode) => void;
}

export function DiffTopBarContent({
  tab,
  viewMode,
  onChangeViewMode,
}: DiffTopBarContentProps): ReactNode {
  const label = tab.oldContent != null
    ? `${fileLabel(tab.path)} \u2194 ${fileLabel(tab.path)}`
    : fileLabel(tab.path);

  return (
    <>
      <div className="text-[11px] text-[var(--tab-text)] truncate min-w-0">
        {label}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SegmentedControl
          options={viewModeOptions}
          value={viewMode}
          onChange={onChangeViewMode}
        />
      </div>
    </>
  );
}

export function useDiffViewMode(): [DiffViewMode, (mode: DiffViewMode) => void] {
  return useState<DiffViewMode>("line-by-line");
}
