import { classNames } from "../../classNames";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div className="flex rounded-md overflow-hidden border border-[var(--sidebar-border)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={classNames(
            "px-3 py-0.5 text-[11px] font-medium border-none cursor-pointer",
            value === opt.value
              ? "bg-[var(--seg-active-bg)] text-[var(--seg-active-text)]"
              : "bg-[var(--btn-bg)] text-[var(--tab-text)] hover:bg-[var(--btn-hover-bg)]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
