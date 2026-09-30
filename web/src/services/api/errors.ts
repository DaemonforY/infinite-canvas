import axios from "axios";

import i18n from "@/i18n";
import { MAIN_SITE_API_BASE_URL, MAIN_SITE_NAME } from "@/constant/runtime-config";
import { classifyProviderError, isNetworkFailureMessage, type ProviderErrorInput, type ProviderErrorKind } from "@/lib/provider-errors";

// Shared "turn any API failure into an actionable sentence" helpers for image / chat / video /
// audio / model-list requests. Classification lives in lib/provider-errors (pure, unit-tested);
// this file extracts the error fields from response bodies and renders the i18n text.

export const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

type ExtractedError = Omit<ProviderErrorInput, "status">;

// Messages this module produced. A humanized error is often re-thrown and caught again by an outer
// handler; remembering them keeps the second pass from re-classifying (e.g. in the en locale).
const produced = new Set<string>();

function remember(text: string) {
    if (produced.size > 300) produced.clear();
    produced.add(text);
    return text;
}

function renderKind(kind: Exclude<ProviderErrorKind, null>, fallback: string) {
    const params = { site: MAIN_SITE_NAME, baseUrl: `${MAIN_SITE_API_BASE_URL}/v1`, ...kind.params };
    const base = kind.key === "unknown" ? fallback : apiText(kind.key, params);
    return remember(kind.detail ? `${base}${apiText("detailSuffix", { detail: kind.detail })}` : base);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textOf(value: unknown): string {
    if (typeof value === "string") return value;
    // FastAPI-style detail arrays: [{ msg: "..." }]
    if (Array.isArray(value)) return value.map((item) => (isRecord(item) ? textOf(item.msg ?? item.message) : textOf(item))).filter(Boolean).join("; ");
    return "";
}

/** Pulls message / code / type out of any error body shape (JSON object, JSON string, HTML, plain text). */
export function extractApiError(value: unknown): ExtractedError {
    if (!value) return { message: "" };
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^[[{]/.test(trimmed)) {
            try {
                return extractApiError(JSON.parse(trimmed));
            } catch {
                // Not JSON after all; fall through.
            }
        }
        if (/<(?:!doctype|html|head|body|title|center|h1)\b/i.test(trimmed)) return { message: trimmed.slice(0, 2000), html: true };
        return { message: trimmed };
    }
    if (!isRecord(value)) return { message: "" };
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    const message =
        textOf(value.msg) ||
        textOf(value.message) ||
        textOf(error?.message) ||
        textOf(value.error) ||
        textOf(responseError?.message) ||
        textOf(value.detail) ||
        textOf(value.error_description);
    const rawCode = error?.code ?? responseError?.code ?? value.code;
    const code = typeof rawCode === "string" || (typeof rawCode === "number" && rawCode !== 0) ? rawCode : undefined;
    const rawType = error?.type ?? error?.status ?? responseError?.type;
    const type = typeof rawType === "string" ? rawType : undefined;
    // error.message may itself be a serialized error body.
    const inner = /^\s*[[{]/.test(message) ? extractApiError(message) : undefined;
    if (inner?.message) return { message: inner.message, code: inner.code ?? code, type: inner.type ?? type, html: inner.html };
    return { message, code, type };
}

/** Renders a classified error. `fallback` replaces the generic "request failed" sentence when nothing matched. */
export function humanizeApiError(input: ProviderErrorInput, fallback: string = apiText("requestFailed")): string {
    const message = (input.message || "").trim();
    if (message && produced.has(message)) return message;
    const kind = classifyProviderError(input);
    if (!kind) return message || fallback;
    return renderKind(kind, fallback);
}

/** Humanizes an error response body (any shape) with an optional HTTP status. */
export function humanizeApiPayload(value: unknown, fallback?: string, status?: number): string {
    return humanizeApiError({ ...extractApiError(value), status }, fallback);
}

/**
 * Humanizes the message of an already-thrown Error. Unlike API bodies, a plain message that matches
 * nothing is returned unchanged: it is usually one of our own sentences or a script's own error.
 */
export function humanizeErrorMessage(message: string, fallback: string = apiText("requestFailed")): string {
    if (!message) return fallback;
    if (produced.has(message)) return message;
    const kind = classifyProviderError(extractApiError(message));
    if (!kind || kind.key === "unknown") return message;
    return renderKind(kind, fallback);
}

export function networkErrorText() {
    return remember(apiText("networkError", { site: MAIN_SITE_NAME, baseUrl: `${MAIN_SITE_API_BASE_URL}/v1` }));
}

/** Turns an axios / fetch / plugin failure into an actionable message. */
export function readAxiosError(error: unknown, fallback: string = apiText("requestFailed")): string {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return remember(apiText("imageTimeout"));
        // No response at all: offline, DNS, wrong Base URL, or a proxy error page without CORS headers.
        if (!error.response) return networkErrorText();
        return humanizeApiError({ ...extractApiError(error.response.data), status: error.response.status }, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    // fetch() rejects with a TypeError ("Failed to fetch" / "NetworkError…" / "Load failed").
    if (error instanceof TypeError && isNetworkFailureMessage(error.message)) return networkErrorText();
    return error instanceof Error ? humanizeErrorMessage(error.message, fallback) : fallback;
}

/** Same as readAxiosError, but first reads Blob / ArrayBuffer error bodies (responseType "blob"). */
export async function readAxiosErrorAsync(error: unknown, fallback?: string): Promise<string> {
    if (axios.isAxiosError(error) && error.response) {
        const data: unknown = error.response.data;
        try {
            if (typeof Blob !== "undefined" && data instanceof Blob) error.response.data = await data.text();
            else if (data instanceof ArrayBuffer) error.response.data = new TextDecoder().decode(data);
        } catch {
            // Keep the original body; status-based text still applies.
        }
    }
    return readAxiosError(error, fallback);
}

/** Humanizes a non-ok fetch() Response. */
export async function readFetchError(response: Response, fallback: string = apiText("requestFailed")): Promise<string> {
    const text = await response.text().catch(() => "");
    return humanizeApiError({ ...extractApiError(text), status: response.status }, fallback);
}
