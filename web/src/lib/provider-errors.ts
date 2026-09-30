// Upstream content-safety rejections (e.g. OpenAI "moderation_blocked") arrive as English text;
// callers replace them with an actionable localized message and keep the provider's request id.
const SAFETY_REJECTION = /rejected by the safety system|moderation_blocked|content_policy_violation|safety_violations?|violates? (?:our|the) (?:content|usage) polic/i;

export function isSafetyRejection(message: string): boolean {
    return Boolean(message) && SAFETY_REJECTION.test(message);
}

/** The provider request id quoted in a rejection ("… include the request ID <id>"), if any. */
export function safetyRequestId(message: string): string | undefined {
    return /request ID\s+([0-9a-f-]{8,})/i.exec(message)?.[1];
}

// ---------------------------------------------------------------------------------------------
// Gateway / upstream / network error classification.
//
// The HiveGPT gateway (a Sub2API fork) and upstream providers return errors in several shapes:
//   OpenAI-compatible: {"error":{"type":"...","code":"...","message":"..."}}
//   Auth middleware:   {"code":"INSUFFICIENT_BALANCE","message":"..."}
//   Gemini:            {"error":{"code":403,"message":"...","status":"PERMISSION_DENIED"}}
// Callers extract message / code / type (Gemini's error.status goes into `type`) plus the HTTP
// status, and this pure function maps them to an `apiErrors.*` i18n key. It never touches i18n
// so it can be unit-tested without the app runtime.
// ---------------------------------------------------------------------------------------------

export type ProviderErrorInput = {
    message?: string;
    status?: number;
    code?: string | number;
    type?: string;
    /** The body was an HTML page (proxy / CDN error page, or a Base URL that points at a website). */
    html?: boolean;
};

/**
 * `key` is an `apiErrors.*` key. `detail` is a shortened copy of the original text that callers
 * append so support can still see what the provider said. `key: "unknown"` means nothing matched
 * and there is no HTTP status: callers substitute their own context-specific fallback sentence.
 * `null` means "show the original message as-is" (already Chinese, or nothing to show).
 */
export type ProviderErrorKind = { key: string; params?: Record<string, string>; detail?: string } | null;
type Kind = Exclude<ProviderErrorKind, null>;

const DETAIL_MAX = 120;
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const NETWORK_FAILURE = /failed to fetch|networkerror|network error|load failed|err_network|net::err_/i;

export function isNetworkFailureMessage(message: string): boolean {
    return Boolean(message) && NETWORK_FAILURE.test(message);
}

/** Strips tags, collapses whitespace and truncates to ~120 chars for appending to a friendly message. */
export function shortErrorDetail(message: string): string {
    const text = message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text;
}

/** The model name quoted in an error (`Model "gpt-x" is not supported …`, "The model `x` does not exist"). */
export function quotedModelName(message: string): string | undefined {
    return /["'`“「]([^"'`”」\s]{1,80})["'`”」]/.exec(message)?.[1];
}

const plain = (key: string) => (): Kind => ({ key });
const withDetail = (key: string) => (message: string): Kind => ({ key, detail: shortErrorDetail(message) || undefined });

function modelKind(message: string): Kind {
    const model = quotedModelName(message);
    return model ? { key: "modelUnsupported", params: { model } } : { key: "modelUnsupportedUnknown" };
}

function usageLimitKind(message: string): Kind {
    if (/daily|今日|每日/i.test(message)) return { key: "usageLimitDaily" };
    if (/weekly|本周|每周/i.test(message)) return { key: "usageLimitWeekly" };
    if (/monthly|本月|每月/i.test(message)) return { key: "usageLimitMonthly" };
    return { key: "usageLimitExceeded" };
}

function ipKind(message: string): Kind {
    const ip = /your IP is\s*([0-9a-f.:]+[0-9a-f])/i.exec(message)?.[1];
    return ip ? { key: "ipNotAllowedWithIp", params: { ip } } : { key: "ipNotAllowed" };
}

// Gateway error codes (auth middleware `code`, OpenAI-compatible `error.code`). Upper-cased before lookup.
const CODE_RULES: Record<string, (message: string) => Kind> = {
    INVALID_API_KEY: plain("authenticationFailed"),
    API_KEY_REQUIRED: plain("authenticationFailed"),
    INVALID_AUTH_HEADER: plain("authenticationFailed"),
    USER_NOT_FOUND: plain("authenticationFailed"),
    API_KEY_DISABLED: plain("apiKeyDisabled"),
    API_KEY_EXPIRED: plain("apiKeyExpired"),
    API_KEY_QUOTA_EXHAUSTED: plain("apiKeyQuotaExhausted"),
    INSUFFICIENT_QUOTA: plain("apiKeyQuotaExhausted"),
    INSUFFICIENT_BALANCE: plain("insufficientBalance"),
    SUBSCRIPTION_NOT_FOUND: plain("subscriptionNotFound"),
    SUBSCRIPTION_EXPIRED: plain("subscriptionExpired"),
    SUBSCRIPTION_SUSPENDED: plain("subscriptionSuspended"),
    USAGE_LIMIT_EXCEEDED: usageLimitKind,
    DAILY_LIMIT_EXCEEDED: plain("usageLimitDaily"),
    WEEKLY_LIMIT_EXCEEDED: plain("usageLimitWeekly"),
    MONTHLY_LIMIT_EXCEEDED: plain("usageLimitMonthly"),
    USER_INACTIVE: plain("userInactive"),
    ACCESS_DENIED: (message) => (/your IP is/i.test(message) ? ipKind(message) : withDetail("forbidden")(message)),
    INVALID_AUTH_RATE_LIMITED: plain("authRateLimited"),
    API_KEY_AUTH_OVERLOADED: plain("serviceBusy"),
    RATE_LIMITED: plain("rateLimited"),
    RATE_LIMIT_EXCEEDED: plain("rateLimited"),
    MODEL_NOT_FOUND: modelKind,
    CONTEXT_LENGTH_EXCEEDED: plain("contextTooLong"),
    STREAM_READ_ERROR: plain("badGateway"),
};

// Message patterns, checked in order when the code alone is not decisive.
const MESSAGE_RULES: Array<[RegExp, (message: string) => Kind]> = [
    [/invalid api key|incorrect api key|api key not valid|invalid x-api-key|api key is required|user associated with api key not found/i, plain("authenticationFailed")],
    [/api key is disabled/i, plain("apiKeyDisabled")],
    [/api key (?:has )?expired/i, plain("apiKeyExpired")],
    [/api key quota|key quota (?:has been )?exhausted/i, plain("apiKeyQuotaExhausted")],
    [/insufficient (?:account )?balance/i, plain("insufficientBalance")],
    [/no active subscription/i, plain("subscriptionNotFound")],
    [/subscription (?:has )?expired/i, plain("subscriptionExpired")],
    [/subscription is suspended/i, plain("subscriptionSuspended")],
    [/(?:daily|weekly|monthly) usage limit/i, usageLimitKind],
    [/user account is not active/i, plain("userInactive")],
    [/your IP is/i, ipKind],
    [/too many invalid authentication/i, plain("authRateLimited")],
    [/image generation is not enabled/i, plain("imageGroupUnsupported")],
    [/is not supported by any configured account|model `[^`]+` does not exist|model[^.]{0,80}(?:not found|does not exist)|unsupported model|model not supported/i, modelKind],
    [/upstream access forbidden/i, plain("upstreamForbidden")],
    [/gateway time-?out|upstream[^.]{0,40}timed? ?out/i, plain("gatewayTimeout")],
    [/upstream request failed|upstream service temporarily unavailable|stream_read_error|bad gateway/i, plain("badGateway")],
    [/no available [a-z ]*accounts|all available accounts|service temporarily unavailable/i, plain("noAvailableAccounts")],
    [/concurrency limit|requests?[- ]per[- ]minute|too many requests|rate[- ]limit/i, plain("rateLimited")],
    [/overloaded|an error occurred while processing your request/i, plain("upstreamOverloaded")],
    [/too large|request entity/i, plain("requestTooLarge")],
    [/maximum context length|context_length_exceeded|context window/i, plain("contextTooLong")],
    [NETWORK_FAILURE, plain("networkError")],
    [/failed to parse request body|invalid request|invalid_request/i, withDetail("invalidRequest")],
];

// OpenAI / Anthropic `error.type` and Gemini `error.status`. Lower-cased before lookup.
const TYPE_RULES: Record<string, (message: string) => Kind> = {
    authentication_error: plain("authenticationFailed"),
    unauthenticated: plain("authenticationFailed"),
    permission_denied: plain("authenticationFailed"),
    permission_error: withDetail("forbidden"),
    insufficient_quota: plain("apiKeyQuotaExhausted"),
    rate_limit_error: plain("rateLimited"),
    resource_exhausted: plain("rateLimited"),
    overloaded_error: plain("upstreamOverloaded"),
    unavailable: plain("upstreamOverloaded"),
    upstream_error: plain("badGateway"),
    stream_read_error: plain("badGateway"),
    deadline_exceeded: plain("gatewayTimeout"),
    invalid_request_error: withDetail("invalidRequest"),
    invalid_argument: withDetail("invalidRequest"),
};

function statusKind(status: number, message: string, html: boolean): Kind | null {
    const detail = html ? undefined : shortErrorDetail(message) || undefined;
    // An HTML page with a success / not-found status means the Base URL points at a website.
    if (html && (status < 400 || status === 404 || status === 405)) return { key: "baseUrlReturnedHtml" };
    if (status === 401) return { key: "authenticationFailed" };
    if (status === 403) return { key: "forbidden", detail };
    if (status === 404 || status === 405) return /model/i.test(message) ? modelKind(message) : { key: "notFound", params: { status: String(status) }, detail };
    if (status === 408 || status === 504 || status === 524) return { key: "gatewayTimeout" };
    if (status === 413) return { key: "requestTooLarge" };
    if (status === 429) return { key: "rateLimited" };
    if (status === 502 || (status >= 520 && status <= 523)) return { key: "badGateway" };
    if (status === 503 || status === 529) return { key: "upstreamOverloaded" };
    if (html || status < 400) return null;
    if (status === 400 || status === 422) return { key: "invalidRequest", detail };
    return { key: "httpFailed", params: { status: String(status) }, detail };
}

// The gateway already answers several errors in Chinese (group disabled, subscription limits with
// reset time, …); those are shown untouched. Only a couple of terse ones get a more actionable text.
function classifyChinese(message: string): ProviderErrorKind {
    if (/^api key 额度已用完[。.]?$/i.test(message)) return { key: "apiKeyQuotaExhausted" };
    if (/^api key 已过期[。.]?$/i.test(message)) return { key: "apiKeyExpired" };
    return null;
}

export function classifyProviderError(input: ProviderErrorInput): ProviderErrorKind {
    const html = Boolean(input.html);
    const message = (input.message || "").trim();
    const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
    const type = (input.type || "").trim().toLowerCase();
    // Gemini puts the HTTP status in the numeric error.code.
    const numericCode = typeof input.code === "number" ? input.code : 0;
    const status = input.status || (numericCode >= 400 && numericCode < 600 ? numericCode : undefined);

    if (!html) {
        if (isSafetyRejection(message) || code === "MODERATION_BLOCKED" || code === "CONTENT_POLICY_VIOLATION") {
            const requestId = safetyRequestId(message);
            return requestId ? { key: "safetyRejectedWithId", params: { requestId } } : { key: "safetyRejected" };
        }
        if (CJK.test(message)) return classifyChinese(message);
        const byCode = code ? CODE_RULES[code] : undefined;
        if (byCode) return byCode(message);
        const byMessage = MESSAGE_RULES.find(([pattern]) => pattern.test(message));
        if (byMessage) return byMessage[1](message);
        const byType = type ? TYPE_RULES[type] : undefined;
        if (byType) return byType(message);
    }
    if (status) {
        const byStatus = statusKind(status, message, html);
        if (byStatus) return byStatus;
    }
    if (html) return { key: "htmlError", params: { preview: `${shortErrorDetail(message).slice(0, 80)}…` } };
    if (!message) return null;
    return { key: "unknown", detail: shortErrorDetail(message) };
}
