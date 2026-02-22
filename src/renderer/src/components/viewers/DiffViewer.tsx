import "diff2html/bundles/css/diff2html.min.css";
import { html } from "diff2html";
import { useMemo, useState } from "react";
import { classNames } from "../../classNames";
import type { DiffTab } from "../../types";
import { SegmentedControl } from "../ui-elements/SegmentedControl";

type DiffViewMode = "line-by-line" | "side-by-side";

const viewModeOptions: { value: DiffViewMode; label: string }[] = [
  { value: "line-by-line", label: "Unified" },
  { value: "side-by-side", label: "Split" },
];

interface DiffContentProps {
  tab: DiffTab;
  viewMode: DiffViewMode;
}

export function DiffContent({ tab, viewMode }: DiffContentProps): JSX.Element {
  const diffHtml = useMemo(() => {
    return html(tab.diff, {
      drawFileList: false,
      outputFormat: viewMode,
      matching: "lines",
      colorScheme: "auto" as never,
    });
  }, [tab.diff, viewMode]);

  return (
    <div
      className={classNames(
        "diff-viewer",
        viewMode === "side-by-side" ? "d2h-side-by-side" : "d2h-unified",
      )}
      dangerouslySetInnerHTML={{ __html: diffHtml }}
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
