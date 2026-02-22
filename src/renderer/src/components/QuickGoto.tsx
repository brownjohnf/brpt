import { useCallback, useEffect, useRef, useState } from "react";
import { classNames } from "../classNames";
import type { Tab } from "../types";

interface QuickGotoProps {
  tabs: Tab[];
  onActivateTab: (index: number) => void;
  onClose: () => void;
}

function getFilename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function getDirectory(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

export function QuickGoto({
  tabs,
  onActivateTab,
  onClose,
}: QuickGotoProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const filtered = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => {
      const segments = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (segments.length === 0) {
        return true;
      }
      const lowerPath = tab.path.toLowerCase();
      return segments.every((seg) => lowerPath.includes(seg));
    });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (tabIndex: number) => {
      onActivateTab(tabIndex);
      onClose();
    },
    [onActivateTab, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length > 0) {
          handleSelect(filtered[selectedIndex]?.index ?? filtered[0].index);
        }
        return;
      }
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        );
        return;
      }
    },
    [filtered, selectedIndex, handleSelect, onClose],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50"
      onClick={handleOverlayClick}
    >
      <div
        className="mx-auto mt-12 w-[480px] rounded-lg shadow-lg overflow-hidden"
        style={{
          background: "var(--sidebar-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Go to tab..."
          className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none"
          style={{ color: "var(--tab-active-text)" }}
        />
        {filtered.length > 0 && (
          <div
            className="max-h-[300px] overflow-y-auto"
            style={{ borderTop: "1px solid var(--sidebar-border)" }}
          >
            {filtered.map(({ tab, index }, i) => (
              <div
                key={tab.path}
                className={classNames(
                  "px-3 py-1.5 cursor-pointer text-[13px]",
                )}
                style={{
                  background:
                    i === selectedIndex ? "var(--tab-active-bg)" : undefined,
                }}
                onClick={() => handleSelect(index)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div style={{ color: "var(--tab-active-text)" }}>
                  {getFilename(tab.path)}
                </div>
                <div
                  className="text-[11px] truncate"
                  style={{ color: "var(--tab-text)" }}
                >
                  {getDirectory(tab.path)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
