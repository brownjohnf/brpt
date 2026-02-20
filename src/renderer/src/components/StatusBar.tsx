interface StatusBarProps {
  path: string | null
}

export function StatusBar({ path }: StatusBarProps): JSX.Element {
  return (
    <div
      className="
        h-7 flex items-center px-3 text-xs
        bg-[var(--status-bg)] border-t border-[var(--status-border)]
        text-[var(--status-text)]
      "
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {path ? `Watching: ${path}` : ""}
      </span>
    </div>
  )
}
