"use client";

type GlobalNotice = {
  kind: "info" | "success" | "error";
  message: string;
};

type GlobalAppToastProps = {
  notice: GlobalNotice | null;
  onDismiss?: () => void;
};

function toastBackground(kind: GlobalNotice["kind"]): string {
  if (kind === "error") return "#FA8072";
  if (kind === "success") return "#B0E0E6";
  return "#FFFFF0";
}

export function GlobalAppToast({ notice, onDismiss }: GlobalAppToastProps) {
  if (!notice) return null;

  return (
    <div
      className="app-global-toast"
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
      data-toast-kind={notice.kind}
      style={{ backgroundColor: toastBackground(notice.kind), cursor: onDismiss ? "pointer" : undefined }}
      title={onDismiss ? "Dismiss" : undefined}
      onClick={onDismiss}
    >
      {notice.message}
    </div>
  );
}

