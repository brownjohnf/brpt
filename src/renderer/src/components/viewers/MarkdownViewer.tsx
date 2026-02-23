import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { classNames } from "../../classNames";
import type { Annotation, ContentWidthConfig, ContentWidthMode, MarkdownTab } from "../../types";
import { useCurrentHeading } from "../../useCurrentHeading";
import { SegmentedControl } from "../ui-elements/SegmentedControl";

const { mdview } = window;

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
}: MarkdownTopBarContentProps): JSX.Element {
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

interface MarkdownContentProps {
  tab: MarkdownTab;
  contentWidth: ContentWidthConfig;
  onRetryRemoved: (path: string) => void;
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
  // Future: "html" would pass through, "text" would escape and wrap in <pre>
  return mdview.renderMarkdown(a.content);
}

interface AnnotatedChunk {
  html: string;
  annotations: Annotation[];
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
      chunks.push({ html: mdview.renderMarkdown(chunk), annotations: byLine.get(bp)! });
      cursor = lineIdx;
    } else {
      // Annotation at or before cursor — attach to previous chunk or create empty one
      if (chunks.length > 0) {
        chunks[chunks.length - 1].annotations.push(...byLine.get(bp)!);
      } else {
        chunks.push({ html: "", annotations: byLine.get(bp)! });
      }
    }
  }

  // Remaining content after the last annotation
  if (cursor < lines.length) {
    const chunk = lines.slice(cursor).join("\n");
    chunks.push({ html: mdview.renderMarkdown(chunk), annotations: [] });
  }

  return chunks;
}

export function MarkdownContent({
  tab,
  contentWidth,
  onRetryRemoved,
}: MarkdownContentProps): JSX.Element {
  const hasAnnotations = tab.annotations && tab.annotations.length > 0;

  const renderedHtml = useMemo(() => {
    if (hasAnnotations) {
      return null;
    }
    return mdview.renderMarkdown(tab.content);
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
      {annotatedChunks ? (
        <div className="mx-auto" style={contentStyle}>
          {annotatedChunks.map((chunk, i) => (
            <div key={i}>
              {chunk.html && (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: chunk.html }}
                />
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
      ) : (
        <div
          className="markdown-body mx-auto"
          style={contentStyle}
          dangerouslySetInnerHTML={{ __html: renderedHtml! }}
        />
      )}
    </>
  );
}
