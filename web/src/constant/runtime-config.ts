import { DEFAULT_SKIN, isSkinName, type SkinName } from "@/lib/skins";

// Runtime configuration access layer.
// Priority: window.__RUNTIME_CONFIG__ (injected by the container entrypoint) > build-time VITE_ variables > defaults.
// This supports both configuring the same image with docker run -e and injecting values during custom builds.
//
// Each analytics provider has its own variable; configured providers are enabled independently and all are disabled by default.
// Only GA4 and Baidu are supported. Both accept IDs only, and script URLs are assembled in code without arbitrary scripts or inline JavaScript.

type RuntimeConfig = {
    ANALYTICS_GA4_ID?: string; // GA4 measurement ID (G-XXXX)
    ANALYTICS_BAIDU_ID?: string; // Baidu Analytics site ID
    MAIN_SITE_URL?: string; // Main site users register / buy plans / manage keys on (e.g. https://hivegpt.cn)
    MAIN_SITE_NAME?: string; // Display name of the main site
    MAIN_SITE_API_BASE_URL?: string; // Default OpenAI-compatible endpoint (usually the main site's gateway)
    DEFAULT_SKIN?: string; // Default color skin for first-time visitors (classic/nebula/ocean/forest/sunset/sakura)
};

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

const runtime: RuntimeConfig = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) || {};

function read(key: keyof RuntimeConfig, buildTime: string | undefined, fallback = ""): string {
    const value = runtime[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return fallback;
}

export const ANALYTICS_GA4_ID = read("ANALYTICS_GA4_ID", import.meta.env.VITE_ANALYTICS_GA4_ID);
export const ANALYTICS_BAIDU_ID = read("ANALYTICS_BAIDU_ID", import.meta.env.VITE_ANALYTICS_BAIDU_ID);

// Main site (the product this canvas is bundled with). All three fall back to HiveGPT so the
// default image works out of the box; override via docker env or VITE_ variables for other sites.
export const MAIN_SITE_URL = read("MAIN_SITE_URL", import.meta.env.VITE_MAIN_SITE_URL, "https://hivegpt.cn").replace(/\/+$/, "");
export const MAIN_SITE_NAME = read("MAIN_SITE_NAME", import.meta.env.VITE_MAIN_SITE_NAME, "HiveGPT");
export const MAIN_SITE_API_BASE_URL = read("MAIN_SITE_API_BASE_URL", import.meta.env.VITE_MAIN_SITE_API_BASE_URL, MAIN_SITE_URL).replace(/\/+$/, "");

/** Build a link into the main site with UTM tags so cross-site traffic is measurable. */
export function mainSiteLink(path: string, medium: string): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, `${MAIN_SITE_URL}/`);
    url.searchParams.set("utm_source", "canvas");
    url.searchParams.set("utm_medium", medium);
    return url.toString();
}

function hostOf(value: string): string {
    try {
        return new URL(value.trim()).host.toLowerCase();
    } catch {
        return "";
    }
}

/** True when a channel endpoint points at the main site's gateway (ignores path, trailing slash and /v1). */
export function isMainSiteBaseUrl(baseUrl: string): boolean {
    const host = hostOf(baseUrl);
    return Boolean(host) && host === hostOf(MAIN_SITE_API_BASE_URL);
}

const configuredSkin = read("DEFAULT_SKIN", import.meta.env.VITE_DEFAULT_SKIN, DEFAULT_SKIN);
/** Skin used before the visitor picks one. */
export const DEFAULT_SKIN_NAME: SkinName = isSkinName(configuredSkin) ? configuredSkin : DEFAULT_SKIN;
