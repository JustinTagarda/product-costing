"use client";

type MainContentStatusFooterProps = {
  userLabel?: string | null;
  syncLabel: string;
  guestLabel: string;
  className?: string;
};

export function MainContentStatusFooter({
  userLabel,
  syncLabel,
  guestLabel,
  className,
}: MainContentStatusFooterProps) {
  return (
    <footer
      className={[
        "mt-auto pt-3 text-center hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="font-mono text-xs text-muted">
        {userLabel ? (
          <>
            Signed in as <span className="select-all">{userLabel}</span>{" "}
            <span className="text-muted">- {syncLabel}</span>
          </>
        ) : (
          <>
            Guest mode <span className="text-muted">- {guestLabel}</span>
          </>
        )}
      </p>
    </footer>
  );
}
