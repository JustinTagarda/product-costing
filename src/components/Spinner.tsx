type SpinnerProps = {
  className?: string;
  size?: number;
};

export function Spinner({ className, size = 22 }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={["animate-spin text-accent", className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.18"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Centered spinner + caption for content areas that would otherwise render
// as an empty box while data loads (a table with zero rows so far, a card
// list before its first item arrives, etc.).
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={["flex flex-col items-center justify-center gap-3 px-4 py-14 text-center", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Spinner size={26} />
      {label ? <p className="text-xs font-medium tracking-wide text-muted">{label}</p> : null}
    </div>
  );
}
