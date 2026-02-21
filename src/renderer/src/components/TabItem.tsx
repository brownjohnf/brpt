import { classNames } from "../classNames";
import type { Tab } from "../types";

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  groupRootPath?: string;
  onClick: () => void;
  onClose: () => void;
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
  isActive,
  groupRootPath,
  onClick,
  onClose,
}: TabItemProps): JSX.Element {
  const filename = getFilename(tab.path);
  const prefix = groupRootPath
    ? getRelativePrefix(tab.path, groupRootPath)
    : null;
  const textColor = isActive ? "var(--tab-active-text)" : "var(--tab-text)";

  return (
    <div
      className={classNames(
        "group flex items-center gap-1",
        "px-2 py-1.5 mb-1 rounded-md cursor-pointer",
        "text-[13px] whitespace-nowrap overflow-hidden",
        isActive
          ? "bg-[var(--tab-active-bg)] font-semibold"
          : "bg-[var(--tab-bg)] hover:bg-[var(--tab-hover-bg)]"
      )}
      style={{ color: textColor }}
      onClick={onClick}
    >
      {tab.hasUnseenChanges && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--tab-changed-dot)]" />
      )}
      <span
        className={classNames(
          "overflow-hidden text-ellipsis flex-1",
          groupRootPath && "text-right [direction:rtl]"
        )}
        style={groupRootPath ? { color: "var(--sidebar-border)" } : undefined}
        title={tab.path}
      >
        <bdo dir="ltr">
          {prefix && <span>{prefix}</span>}
          <span style={groupRootPath ? { color: textColor } : undefined}>
            {filename}
          </span>
        </bdo>
      </span>
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
    </div>
  );
}
