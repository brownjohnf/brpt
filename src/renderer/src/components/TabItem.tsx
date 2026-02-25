import { useCallback, useRef, useState, type ReactNode } from "react";
import { classNames } from "../classNames";
import type { Tab } from "../types";

const TAB_MIME = "application/x-brpt-tab";
const TAB_GROUP_MIME = "application/x-brpt-tab-group";

type DropPosition = "above" | "below" | null;

interface TabItemProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  groupRootPath?: string;
  onClick: () => void;
  onClose: () => void;
  onReorderTab: (fromIndex: number, toIndex: number) => void;
}

function getFilename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function getRelativePrefix(filePath: string, rootPath: string): string {
  if (!filePath.startsWith(rootPath + "/")) {
    return "./";
  }
  const relative = filePath.slice(rootPath.length + 1);
  const parts = relative.split("/");
  if (parts.length <= 1) {
    return "./";
  }
  return parts.slice(0, -1).join("/") + "/";
}

export function TabItem({
  tab,
  index,
  isActive,
  groupRootPath,
  onClick,
  onClose,
  onReorderTab,
}: TabItemProps): ReactNode {
  const filename = getFilename(tab.path);
  const prefix = groupRootPath
    ? getRelativePrefix(tab.path, groupRootPath)
    : null;
  const textColor = isActive ? "var(--tab-active-text)" : "var(--tab-text)";

  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const groupKey = groupRootPath ?? "__ungrouped__";

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(TAB_MIME, String(index));
      e.dataTransfer.setData(TAB_GROUP_MIME, groupKey);
      e.dataTransfer.effectAllowed = "move";
    },
    [index, groupKey],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TAB_MIME)) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (divRef.current) {
        const rect = divRef.current.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        setDropPosition(e.clientY < midY ? "above" : "below");
      }
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDropPosition(null);
      const fromStr = e.dataTransfer.getData(TAB_MIME);
      const fromGroup = e.dataTransfer.getData(TAB_GROUP_MIME);
      if (!fromStr || fromGroup !== groupKey) {
        return;
      }
      const fromIndex = parseInt(fromStr, 10);
      if (fromIndex === index) {
        return;
      }
      const rect = divRef.current!.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let toIndex = e.clientY < midY ? index : index + 1;
      if (fromIndex < toIndex) {
        toIndex--;
      }
      onReorderTab(fromIndex, toIndex);
    },
    [index, groupKey, onReorderTab],
  );

  const handleDragEnd = useCallback(() => {
    setDropPosition(null);
  }, []);

  return (
    <div
      ref={divRef}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      className={classNames(
        "group flex items-center gap-1",
        "px-2 py-1.5 mb-1 rounded-md cursor-pointer select-none",
        "text-[13px] whitespace-nowrap overflow-hidden",
        isActive
          ? "bg-[var(--tab-active-bg)] font-semibold"
          : "bg-[var(--tab-bg)] hover:bg-[var(--tab-hover-bg)]",
        tab.removed && "opacity-50"
      )}
      style={{
        color: textColor,
        borderTop: `2px solid ${dropPosition === "above" ? "var(--tab-changed-dot)" : "transparent"}`,
        borderBottom: `2px solid ${dropPosition === "below" ? "var(--tab-changed-dot)" : "transparent"}`,
      }}
      onClick={onClick}
    >
      <button
        className={classNames(
          "hidden group-hover:block",
          "bg-transparent border-none text-[var(--tab-close)] cursor-pointer",
          "text-sm px-0.5 leading-none rounded-sm shrink-0",
          "hover:text-[var(--tab-close-hover)] hover:bg-[var(--tab-hover-bg)]"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        &times;
      </button>
      {tab.hasUnseenChanges && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--tab-changed-dot)]" />
      )}
      <span
        className="overflow-hidden text-ellipsis flex-1 text-right [direction:rtl]"
        style={groupRootPath ? { color: "var(--sidebar-border)" } : undefined}
        title={tab.path}
      >
        <bdo dir="ltr">
          {prefix && <span>{prefix}</span>}
          <span
            className={classNames(tab.removed && "line-through")}
            style={groupRootPath ? { color: textColor } : undefined}
          >
            {filename}
          </span>
        </bdo>
      </span>
    </div>
  );
}
