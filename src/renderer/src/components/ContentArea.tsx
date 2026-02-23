import { forwardRef, type ReactNode } from "react";
import type { BaseTab } from "../types";

interface ContentAreaProps {
  activeTab: BaseTab | null;
  children?: ReactNode;
  onDrop: (e: React.DragEvent) => void;
}

export const ContentArea = forwardRef<HTMLDivElement, ContentAreaProps>(
  function ContentArea({ activeTab, children, onDrop }, ref) {
    function handleDragOver(e: React.DragEvent): void {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    }

    return (
      <div
        ref={ref}
        className="flex-1 overflow-auto pt-8 pr-8 pb-8 relative"
        style={{ background: "var(--bg)" }}
        onDragOver={handleDragOver}
        onDrop={onDrop}
      >
        {activeTab ? (
          children
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
