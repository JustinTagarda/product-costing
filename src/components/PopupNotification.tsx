"use client";

type PopupNotificationProps = {
  message: string;
  locationClassName?: string;
};

export function PopupNotification({
  message,
  locationClassName = "fixed right-4 top-20 z-50 max-w-md",
}: PopupNotificationProps) {
  return (
    <div className={["app-popup-notification", locationClassName].join(" ")} role="status" aria-live="polite">
      {message}
    </div>
  );
}
