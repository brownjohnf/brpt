import { useCallback, useEffect, useState } from "react";
import { classNames } from "../classNames";
import type { ContentWidthMode } from "../types";
import { SegmentedControl } from "./ui-elements/SegmentedControl";

interface TopBarProps {
  mode: ContentWidthMode;
  widthValue: string;
  onChangeMode: (mode: ContentWidthMode) => void;
  onChangeWidthValue: (value: string) => void;
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

export function TopBar({
  mode,
  widthValue,
  onChangeMode,
  onChangeWidthValue,
}: TopBarProps): JSX.Element {
  const [draft, setDraft] = useState(widthValue);
  const showInput = mode !== "full";

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
    [commitValue, widthValue]
  );

  return (
    <div
      className="flex items-center justify-end gap-2 px-4 py-1 shrink-0 border-b border-[var(--sidebar-border)]"
      style={{ background: "var(--sidebar-bg)" }}
    >
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
            "outline-none focus:border-[var(--tab-active-text)]"
          )}
        />
      )}
      <SegmentedControl
        options={modeOptions}
        value={mode}
        onChange={onChangeMode}
      />
    </div>
  );
}
