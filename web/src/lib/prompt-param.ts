/** Takes a "?prompt=" left by 做同款 (once: it is removed from the address bar). */
export function readInitialPromptParam(): string {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const value = (params.get("prompt") || "").slice(0, 4000);
    if (!value) return "";
    params.delete("prompt");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    return value;
}
