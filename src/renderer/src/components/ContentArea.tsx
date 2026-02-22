import { forwardRef, useMemo } from "react";
import type { ContentWidthConfig, Tab } from "../types";

const { mdview } = window;

interface ContentAreaProps {
  activeTab: Tab | null;
  contentWidth: ContentWidthConfig;
  onDrop: (e: React.DragEvent) => void;
  onRetryRemoved: (path: string) => void;
}

export const ContentArea = forwardRef<HTMLDivElement, ContentAreaProps>(
  function ContentArea({ activeTab, contentWidth, onDrop, onRetryRemoved }, ref) {
    const renderedHtml = useMemo(() => {
      if (!activeTab) {
        return "";
      }
      return mdview.renderMarkdown(activeTab.content);
    }, [activeTab?.content]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleDragOver(e: React.DragEvent): void {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    }

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
      <div
        ref={ref}
        className="flex-1 overflow-auto p-8 relative"
        style={{ background: "var(--bg)" }}
        onDragOver={handleDragOver}
        onDrop={onDrop}
      >
        {activeTab ? (
          <>
            {activeTab.removed && (
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
                  onClick={() => onRetryRemoved(activeTab.path)}
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
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full text-center gap-2"
            style={{ color: "var(--empty-text)" }}
          >
            <p className="text-lg font-semibold">No files open</p>
            <p className="text-sm">
              Drop a{" "}
              <code className="bg-[var(--sidebar-bg)] px-1.5 py-0.5 rounded text-[13px]">
                .md
              </code>{" "}
              file here, click <strong>+</strong>, or pass files as CLI
              arguments
            </p>
          </div>
        )}
      </div>
    );
  },
);
