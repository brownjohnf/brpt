import "diff2html/bundles/css/diff2html.min.css";
import { html } from "diff2html";
import { useMemo, useState } from "react";
import { classNames } from "../../classNames";
import type { Annotation, DiffTab } from "../../types";
import { SegmentedControl } from "../ui-elements/SegmentedControl";

const { mdview } = window;

type DiffViewMode = "line-by-line" | "side-by-side";

const viewModeOptions: { value: DiffViewMode; label: string }[] = [
  { value: "line-by-line", label: "Unified" },
  { value: "side-by-side", label: "Split" },
];

interface DiffContentProps {
  tab: DiffTab;
  viewMode: DiffViewMode;
}

function annotationInsertionLine(a: Annotation): number {
  if (a.startLine != null && a.endLine != null) {
    return a.endLine;
  }
  return a.line ?? 0;
}

function renderAnnotationContent(a: Annotation): string {
  if (a.format === "markdown") {
    return mdview.renderMarkdown(a.content);
  }
  return mdview.renderMarkdown(a.content);
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
      chunks.push({ diffHtml, annotations: byDiffLine.get(bp)! });
      cursor = lineIdx;
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1].annotations.push(...byDiffLine.get(bp)!);
    } else {
      chunks.push({ diffHtml: "", annotations: byDiffLine.get(bp)! });
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
    chunks.push({ diffHtml, annotations: [] });
  }

  return chunks;
}

export function DiffContent({ tab, viewMode }: DiffContentProps): JSX.Element {
  const hasAnnotations = tab.annotations && tab.annotations.length > 0;

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

  if (annotatedChunks) {
    return (
      <div
        className={classNames(
          "diff-viewer",
          "d2h-unified",
        )}
      >
        {annotatedChunks.map((chunk, i) => (
          <div key={i}>
            {chunk.diffHtml && (
              <div dangerouslySetInnerHTML={{ __html: chunk.diffHtml }} />
            )}
            {chunk.annotations.map((a, j) => (
              <div key={j} className="annotation-block">
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderAnnotationContent(a) }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "diff-viewer",
        viewMode === "side-by-side" ? "d2h-side-by-side" : "d2h-unified",
      )}
      dangerouslySetInnerHTML={{ __html: diffHtml! }}
    />
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
}: DiffTopBarContentProps): JSX.Element {
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
