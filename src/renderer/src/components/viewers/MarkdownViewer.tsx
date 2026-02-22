import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { classNames } from "../../classNames";
import type { ContentWidthConfig, ContentWidthMode, MarkdownTab } from "../../types";
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

export function MarkdownContent({
  tab,
  contentWidth,
  onRetryRemoved,
}: MarkdownContentProps): JSX.Element {
  const renderedHtml = useMemo(() => {
    return mdview.renderMarkdown(tab.content);
  }, [tab.content]);

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
      <div
        className="markdown-body mx-auto"
        style={contentStyle}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </>
  );
}
