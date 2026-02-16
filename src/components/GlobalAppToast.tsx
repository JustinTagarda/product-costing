"use client";

type GlobalNotice = {
  kind: "info" | "success" | "error";
  message: string;
};

type GlobalAppToastProps = {
  notice: GlobalNotice | null;
};

function toastBackground(kind: GlobalNotice["kind"]): string {
  if (kind === "error") return "#FA8072";
  if (kind === "success") return "#B0E0E6";
  return "#FFFFF0";
}

export function GlobalAppToast({ notice }: GlobalAppToastProps) {
  if (!notice) return null;

  return (
    <div
      className="app-global-toast"
      role="status"
      aria-live="polite"
      data-toast-kind={notice.kind}
      style={{ backgroundColor: toastBackground(notice.kind) }}
    >
      {notice.message}
    </div>
  );
}

