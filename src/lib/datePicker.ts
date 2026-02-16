export function openNativeDatePicker(input: HTMLInputElement | null): void {
  if (!input || input.type !== "date") return;

  const maybeShowPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
  if (typeof maybeShowPicker !== "function") return;

  try {
    maybeShowPicker.call(input);
  } catch {
    // Ignore browsers that block programmatic picker opening.
  }
}
