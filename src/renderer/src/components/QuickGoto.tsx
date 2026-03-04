import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Tab } from "../types";

const isMac = navigator.platform.startsWith("Mac");

export interface Command {
  id: string;
  label: string;
  detail?: string;
  action: () => void;
}

interface QuickGotoProps {
  tabs: Tab[];
  mruTabs: { tab: Tab; index: number }[];
  commands: Command[];
  onActivateTab: (index: number) => void;
  onHighlight: (index: number | null) => void;
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
  mruTabs,
  commands,
  onActivateTab,
  onHighlight,
  onClose,
}: QuickGotoProps): ReactNode {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const commandMode = query.startsWith(">");
  const commandQuery = commandMode ? query.slice(1).trim().toLowerCase() : "";

  const filteredCommands = commandMode
    ? (commandQuery === ""
        ? commands
        : commands.filter((cmd) => {
            const segments = commandQuery.split(/\s+/).filter(Boolean);
            const lower = cmd.label.toLowerCase();
            return segments.every((seg) => lower.includes(seg));
          }))
    : [];

  const isSearching = !commandMode && query.trim() !== "";
  const showingMru = !commandMode && !isSearching && mruTabs.length > 0;

  const filtered = isSearching
    ? tabs
        .map((tab, index) => ({ tab, index }))
        .filter(({ tab }) => {
          const segments = query.toLowerCase().split(/\s+/).filter(Boolean);
          const lowerPath = tab.path.toLowerCase();
          return segments.every((seg) => lowerPath.includes(seg));
        })
    : showingMru
      ? mruTabs
      : tabs.map((tab, index) => ({ tab, index }));

  const itemCount = commandMode ? filteredCommands.length : filtered.length;
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (commandMode) {
      onHighlight(null);
    } else {
      const tabIndex = filtered[selectedIndex]?.index ?? null;
      onHighlight(tabIndex);
    }
  }, [selectedIndex, filtered, commandMode, onHighlight]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => onHighlight(null);
  }, [onHighlight]);

  const handleSelectTab = useCallback(
    (tabIndex: number) => {
      onActivateTab(tabIndex);
      onClose();
    },
    [onActivateTab, onClose],
  );

  const handleSelectCommand = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose],
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
        if (commandMode) {
          if (filteredCommands.length > 0) {
            handleSelectCommand(filteredCommands[selectedIndex] ?? filteredCommands[0]);
          }
        } else if (filtered.length > 0) {
          handleSelectTab(filtered[selectedIndex]?.index ?? filtered[0].index);
        }
        return;
      }
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < itemCount - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : itemCount - 1,
        );
        return;
      }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const i = parseInt(e.key, 10) - 1;
        if (commandMode) {
          const cmd = filteredCommands[i];
          if (cmd) {
            handleSelectCommand(cmd);
          }
        } else {
          const item = filtered[i];
          if (item) {
            handleSelectTab(item.index);
          }
        }
        return;
      }
    },
    [commandMode, filteredCommands, filtered, itemCount, selectedIndex, handleSelectTab, handleSelectCommand, onClose],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const selectedStyle = {
    background: "var(--tab-active-bg)",
    boxShadow: "inset 6px 0 8px -8px var(--status-glow)",
  };

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
          placeholder={commandMode ? "Run command..." : showingMru ? "Recent tabs — type to search all..." : "Go to tab..."}
          className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none"
          style={{ color: "var(--tab-active-text)" }}
        />
        <div
          className="max-h-[300px] overflow-y-auto"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          {commandMode ? (
            filteredCommands.length > 0 ? (
              filteredCommands.map((cmd, i) => (
                <div
                  key={cmd.id}
                  className="px-3 py-1.5 cursor-pointer text-[13px]"
                  style={i === selectedIndex ? selectedStyle : undefined}
                  onClick={() => handleSelectCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "var(--tab-active-text)" }}>
                        {cmd.label}
                      </div>
                      {cmd.detail && (
                        <div
                          className="text-[11px] truncate"
                          style={{ color: "var(--tab-text)" }}
                        >
                          {cmd.detail}
                        </div>
                      )}
                    </div>
                    {i < 9 && (
                      <div className="text-[11px] shrink-0" style={{ color: "var(--tab-text)" }}>
                        {isMac ? "⌘" : "^"}{i + 1}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div
                className="px-3 py-2 text-[13px]"
                style={{ color: "var(--tab-text)" }}
              >
                No matching commands
              </div>
            )
          ) : filtered.length > 0 ? (
            filtered.map(({ tab, index }, i) => (
              <div
                key={tab.path}
                className="px-3 py-1.5 cursor-pointer text-[13px]"
                style={i === selectedIndex ? selectedStyle : undefined}
                onClick={() => handleSelectTab(index)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
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
                  {i < 9 && (
                    <div className="text-[11px] shrink-0" style={{ color: "var(--tab-text)" }}>
                      {isMac ? "⌘" : "^"}{i + 1}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : isSearching ? (
            <div
              className="px-3 py-2 text-[13px]"
              style={{ color: "var(--tab-text)" }}
            >
              No matching tabs
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
