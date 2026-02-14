export const WELCOME_GATE_DISMISSED_KEY = "product-costing:welcome-gate:dismissed";
export const WELCOME_PAGE_PATH = "/calculator";

export function goToWelcomePage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WELCOME_GATE_DISMISSED_KEY);
  } catch {
    // Ignore storage failures.
  }
  window.location.assign(WELCOME_PAGE_PATH);
}
