import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { classNames } from "../classNames";
import type { useDocumentSearch } from "../hooks/useDocumentSearch";

interface FindBarProps {
  search: ReturnType<typeof useDocumentSearch>;
  onClose: () => void;
}

export function FindBar({ search, onClose }: FindBarProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, next, prev, clear } = search;
  const { matchCount, activeIndex, query } = state;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        e.preventDefault();
        clear();
        onClose();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        prev();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        next();
        return;
      }
      if (mod && e.key === "f") {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        inputRef.current?.select();
        return;
      }
    },
    [clear, onClose, next, prev],
  );

  const countLabel = matchCount === 0
    ? (query ? "No results" : "")
    : `${activeIndex + 1} of ${matchCount}`;

  return (
    <div
      className={classNames(
        "fixed top-12 right-4 z-50",
        "flex items-center gap-2 px-3 py-2",
        "rounded-lg shadow-lg",
        "border border-[var(--sidebar-border)]",
        "bg-[var(--sidebar-bg)]",
      )}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Find…"
        value={query}
        onChange={(e) => search.search(e.target.value)}
        onKeyDown={handleKeyDown}
        className={classNames(
          "w-48 text-[13px] bg-transparent outline-none",
          "text-[var(--tab-active-text)] placeholder:text-[var(--tab-text)]",
        )}
      />
      {countLabel && (
        <span className="text-[11px] text-[var(--tab-text)] shrink-0 min-w-[4ch] text-right">
          {countLabel}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={prev}
          disabled={matchCount === 0}
          title="Previous match (Shift+Enter)"
          className={classNames(
            "w-6 h-6 flex items-center justify-center rounded text-[var(--tab-text)]",
            "hover:bg-[var(--tab-hover-bg)] disabled:opacity-30",
          )}
        >
          ↑
        </button>
        <button
          onClick={next}
          disabled={matchCount === 0}
          title="Next match (Enter)"
          className={classNames(
            "w-6 h-6 flex items-center justify-center rounded text-[var(--tab-text)]",
            "hover:bg-[var(--tab-hover-bg)] disabled:opacity-30",
          )}
        >
          ↓
        </button>
        <button
          onClick={() => { clear(); onClose(); }}
          title="Close (Escape)"
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--tab-text)] hover:bg-[var(--tab-hover-bg)]"
        >
          ×
        </button>
      </div>
    </div>
  );
}
