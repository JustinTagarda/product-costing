export const WELCOME_PAGE_PATH = "/calculator";

export function goToWelcomePage(): void {
  if (typeof window === "undefined") return;
  window.location.assign(WELCOME_PAGE_PATH);
}
