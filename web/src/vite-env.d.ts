/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_RELEASES__: import("@/lib/release").ReleaseInfo[];

interface ImportMetaEnv {
    // Comma-separated local development plugin URLs, refetched on every startup without caching or persistence.
    readonly VITE_DEV_PLUGINS?: string;
    // Optional build-time analytics configuration, with one independent variable per provider.
    // GA4 measurement ID (G-XXXX)
    readonly VITE_ANALYTICS_GA4_ID?: string;
    // Baidu Analytics site ID
    readonly VITE_ANALYTICS_BAIDU_ID?: string;
    /** Main site users register / buy plans / manage keys on (default https://hivegpt.cn) */
    readonly VITE_MAIN_SITE_URL?: string;
    /** Display name of the main site (default HiveGPT) */
    readonly VITE_MAIN_SITE_NAME?: string;
    /** Default OpenAI-compatible endpoint (default: main site URL) */
    readonly VITE_MAIN_SITE_API_BASE_URL?: string;
    /** Default color skin (default nebula) */
    readonly VITE_DEFAULT_SKIN?: string;
}
