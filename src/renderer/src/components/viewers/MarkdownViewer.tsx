import { useCallback, useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { annotationInsertionLine } from "../../../../shared/annotations";
import { classNames } from "../../classNames";
import type { Annotation, ContentWidthConfig, ContentWidthMode, MarkdownTab, ViewerCapabilities } from "../../types";
import { AnnotationGutter, type GutterLine } from "../AnnotationGutter";
import { useCurrentHeading } from "../../useCurrentHeading";
import { SegmentedControl } from "../ui-elements/SegmentedControl";

const { mdview } = window;

export function markdownCapabilities(tab: MarkdownTab): ViewerCapabilities {
  return { draggablePath: tab.path };
}

const modeOptions: { value: ContentWidthMode; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "capped", label: "Capped" },
  { value: "full", label: "Full" },
];

const validUnits = ["px", "pt", "rem", "em", "ch", "vw", "vh"];

function normalizeCssWidth(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.includes("%")) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([\w]+)$/);
  if (match && validUnits.includes(match[2])) {
    return `${match[1]}${match[2]}`;
  }

  return null;
}

interface MarkdownTopBarContentProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  content: string;
  contentWidth: ContentWidthConfig;
  onChangeMode: (mode: ContentWidthMode) => void;
  onChangeWidthValue: (value: string) => void;
}

export function MarkdownTopBarContent({
  scrollRef,
  content,
  contentWidth,
  onChangeMode,
  onChangeWidthValue,
}: MarkdownTopBarContentProps): ReactNode {
  const currentHeading = useCurrentHeading(scrollRef, content);
  const widthValue =
    contentWidth.mode === "fixed"
      ? contentWidth.fixedWidth
      : contentWidth.cappedWidth;
  const showInput = contentWidth.mode !== "full";

  const [draft, setDraft] = useState(widthValue);

  useEffect(() => {
    setDraft(widthValue);
  }, [widthValue]);

  const commitValue = useCallback(() => {
    const normalized = normalizeCssWidth(draft);
    if (normalized) {
      setDraft(normalized);
      onChangeWidthValue(normalized);
    } else {
      setDraft(widthValue);
    }
  }, [draft, widthValue, onChangeWidthValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitValue();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setDraft(widthValue);
        (e.target as HTMLInputElement).blur();
      }
    },
    [commitValue, widthValue],
  );

  return (
    <>
      <div className="text-[11px] text-[var(--tab-text)] truncate min-w-0">
        {currentHeading.map((text, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="mx-1 opacity-40">&rsaquo;</span>
            )}
            {text}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showInput && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            className={classNames(
              "w-20 px-2 py-0.5 text-[11px] rounded-md",
              "bg-[var(--sidebar-bg)] text-[var(--tab-active-text)]",
              "border border-[var(--sidebar-border)]",
              "outline-none focus:border-[var(--tab-active-text)]",
            )}
          />
        )}
        <SegmentedControl
          options={modeOptions}
          value={contentWidth.mode}
          onChange={onChangeMode}
        />
      </div>
    </>
  );
}

function measureMarkdownLines(contentEl: HTMLElement, gutterEl: HTMLElement): GutterLine[] {
  const gutterRect = gutterEl.getBoundingClientRect();
  const allElements = contentEl.querySelectorAll<HTMLElement>("[data-source-line]");
  const elements = Array.from(allElements).filter(e =>
    !e.closest(".annotation-block") &&
    !e.querySelector("[data-source-line]")
  );
  const byLine = new Map<number, { line: number; top: number; bottom: number }>();

  for (const element of elements) {
    const line = parseInt(element.dataset.sourceLine!, 10);
    const rect = element.getBoundingClientRect();
    byLine.set(line, {
      line,
      top: rect.top - gutterRect.top,
      bottom: rect.bottom - gutterRect.top,
    });
  }

  const raw = [...byLine.values()];

  return raw.map((entry, i) => {
    const nextLine = i < raw.length - 1 ? raw[i + 1].line : null;
    const endLine = nextLine != null ? nextLine - 1 : entry.line;
    return { ...entry, endLine: Math.max(endLine, entry.line) };
  });
}

interface MarkdownContentProps {
  tab: MarkdownTab;
  contentWidth: ContentWidthConfig;
  onRetryRemoved: (path: string) => void;
}

interface AnnotatedChunk {
  html: string;
  annotations: Annotation[];
  startLine: number;
  endLine: number;
}

function buildAnnotatedChunks(content: string, annotations: Annotation[]): AnnotatedChunk[] {
  const lines = content.split("\n");
  const sorted = [...annotations].sort(
    (a, b) => annotationInsertionLine(a) - annotationInsertionLine(b),
  );

  // Group annotations by their insertion line
  const byLine = new Map<number, Annotation[]>();
  for (const a of sorted) {
    const line = annotationInsertionLine(a);
    const group = byLine.get(line);
    if (group) {
      group.push(a);
    } else {
      byLine.set(line, [a]);
    }
  }

  // Get sorted unique insertion points
  const breakpoints = [...byLine.keys()].sort((a, b) => a - b);

  const chunks: AnnotatedChunk[] = [];
  let cursor = 0;

  for (const bp of breakpoints) {
    // Clamp to valid line range (1-indexed)
    const lineIdx = Math.min(bp, lines.length);
    if (lineIdx > cursor) {
      const chunk = lines.slice(cursor, lineIdx).join("\n");
      const chunkStartLine = cursor + 1;
      chunks.push({
        html: mdview.renderMarkdown(chunk, chunkStartLine),
        annotations: byLine.get(bp)!,
        startLine: chunkStartLine,
        endLine: lineIdx,
      });
      cursor = lineIdx;
    } else {
      // Annotation at or before cursor — attach to previous chunk or create empty one
      if (chunks.length > 0) {
        chunks[chunks.length - 1].annotations.push(...byLine.get(bp)!);
      } else {
        chunks.push({ html: "", annotations: byLine.get(bp)!, startLine: 1, endLine: 0 });
      }
    }
  }

  // Remaining content after the last annotation
  if (cursor < lines.length) {
    const chunk = lines.slice(cursor).join("\n");
    const chunkStartLine = cursor + 1;
    chunks.push({
      html: mdview.renderMarkdown(chunk, chunkStartLine),
      annotations: [],
      startLine: chunkStartLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

export function MarkdownContent({
  tab,
  contentWidth,
  onRetryRemoved,
}: MarkdownContentProps): ReactNode {
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

  const renderedHtml = useMemo(() => {
    if (hasAnnotations) {
      return null;
    }
    return mdview.renderMarkdown(tab.content, 1);
  }, [tab.content, hasAnnotations]);

  const annotatedChunks = useMemo(() => {
    if (!hasAnnotations) {
      return null;
    }
    return buildAnnotatedChunks(tab.content, tab.annotations!);
  }, [tab.content, tab.annotations, hasAnnotations]);

  const contentStyle: React.CSSProperties = (() => {
    switch (contentWidth.mode) {
      case "fixed":
        return {
          width: contentWidth.fixedWidth,
          minWidth: contentWidth.fixedWidth,
        };
      case "capped":
        return { maxWidth: contentWidth.cappedWidth };
      case "full":
        return {};
    }
  })();

  return (
    <>
      {tab.removed && (
        <div
          className="mx-auto mb-4 px-3 py-2 rounded text-sm"
          style={{
            ...contentStyle,
            background: "var(--tab-hover-bg)",
            color: "var(--status-text)",
          }}
        >
          This file has been deleted or moved.
          <button
            className="ml-2 px-2 py-0.5 rounded text-[13px] cursor-pointer border-none"
            style={{
              background: "var(--sidebar-border)",
              color: "var(--tab-active-text)",
            }}
            onClick={() => onRetryRemoved(tab.path)}
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex min-h-full">
        <AnnotationGutter
          contentEl={contentEl}
          measureLines={measureMarkdownLines}
          contentKey={tab.content}
          annotations={tab.annotations}
          collapsedInsertionLines={collapsedInsertionLines}
          onDotClick={handleDotClick}
        />
        <div ref={setContentEl} className="flex-1 min-w-0 pl-8">
          <div className="mx-auto" style={contentStyle}>
          {annotatedChunks ? (
            annotatedChunks.map((chunk, i) => (
              <div key={i}>
                {chunk.html && (
                  <div
                    className="markdown-body"
                    data-chunk-lines={`${chunk.startLine}-${chunk.endLine}`}
                    dangerouslySetInnerHTML={{ __html: chunk.html }}
                  />
                )}
                {chunk.annotations.map((a, j) => (
                  <div
                    key={j}
                    className={classNames(
                      "annotation-wrapper",
                      collapsedInsertionLines.has(chunk.endLine) && "annotation-wrapper--collapsed",
                    )}
                  >
                    <div className="annotation-block">
                      <button
                        className="annotation-dismiss"
                        onClick={() => mdview.dismissAnnotation(tab.path, a.id)}
                        aria-label="Dismiss annotation"
                      >
                        ×
                      </button>
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
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderedHtml! }}
            />
          )}
          </div>
        </div>
      </div>
    </>
  );
}
