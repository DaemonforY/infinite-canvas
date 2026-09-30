import { expect, test } from "bun:test";

import { classifyProviderError, isSafetyRejection, quotedModelName, safetyRequestId, shortErrorDetail, type ProviderErrorInput } from "../src/lib/provider-errors";

const openai = "Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID 972e8cc2-a614-49b3-a2ed-91aa2785a88d.";

test("recognizes upstream safety rejections", () => {
    expect(isSafetyRejection(openai)).toBe(true);
    expect(isSafetyRejection('{"error":{"code":"moderation_blocked"}}')).toBe(true);
    expect(isSafetyRejection("content_policy_violation")).toBe(true);
});

test("ignores unrelated errors", () => {
    expect(isSafetyRejection("Invalid API key")).toBe(false);
    expect(isSafetyRejection("")).toBe(false);
});

test("extracts the provider request id", () => {
    expect(safetyRequestId(openai)).toBe("972e8cc2-a614-49b3-a2ed-91aa2785a88d");
    expect(safetyRequestId("no id here")).toBe(undefined);
});

const classify = (input: ProviderErrorInput) => classifyProviderError(input);
const keyOf = (input: ProviderErrorInput) => classify(input)?.key;

test("safety rejections keep their dedicated message and review id", () => {
    expect(keyOf({ message: openai, status: 400, type: "invalid_request_error" })).toBe("safetyRejectedWithId");
    expect(classify({ message: openai })?.params?.requestId).toBe("972e8cc2-a614-49b3-a2ed-91aa2785a88d");
    expect(keyOf({ message: "blocked", code: "moderation_blocked" })).toBe("safetyRejected");
});

test("messages that are already Chinese are shown as-is", () => {
    expect(classify({ message: "API Key 所属分组已停用", code: "GROUP_DISABLED", status: 403 })).toBeNull();
    expect(classify({ message: "订阅今日额度已用完，将于 2026-10-01 08:00 重置", code: "USAGE_LIMIT_EXCEEDED", status: 429 })).toBeNull();
    expect(classify({ message: "API Key 所属专属分组不再允许当前用户使用", code: "GROUP_NOT_ALLOWED" })).toBeNull();
});

test("terse Chinese gateway messages get the actionable text", () => {
    expect(keyOf({ message: "API key 已过期", code: "API_KEY_EXPIRED", status: 403 })).toBe("apiKeyExpired");
    expect(keyOf({ message: "API key 额度已用完", type: "insufficient_quota", code: "insufficient_quota", status: 429 })).toBe("apiKeyQuotaExhausted");
});

test("invalid / missing API key", () => {
    expect(keyOf({ code: "INVALID_API_KEY", message: "Invalid API key", status: 401 })).toBe("authenticationFailed");
    expect(keyOf({ code: "API_KEY_REQUIRED", message: "API key is required in Authorization header", status: 401 })).toBe("authenticationFailed");
    expect(keyOf({ type: "authentication_error", message: "Something odd" })).toBe("authenticationFailed");
    expect(keyOf({ message: "Incorrect API key provided: sk-****" })).toBe("authenticationFailed");
    expect(keyOf({ status: 401 })).toBe("authenticationFailed");
    expect(keyOf({ code: "USER_NOT_FOUND", message: "User associated with API key not found", status: 401 })).toBe("authenticationFailed");
});

test("disabled, expired and quota-exhausted keys", () => {
    expect(keyOf({ code: "API_KEY_DISABLED", message: "API key is disabled", status: 401 })).toBe("apiKeyDisabled");
    expect(keyOf({ message: "API key is disabled" })).toBe("apiKeyDisabled");
    expect(keyOf({ code: "API_KEY_EXPIRED", message: "API key expired", status: 403 })).toBe("apiKeyExpired");
    expect(keyOf({ code: "API_KEY_QUOTA_EXHAUSTED", message: "quota", status: 429 })).toBe("apiKeyQuotaExhausted");
    expect(keyOf({ code: "insufficient_quota", message: "You exceeded your quota", status: 429 })).toBe("apiKeyQuotaExhausted");
});

test("insufficient balance", () => {
    expect(keyOf({ code: "INSUFFICIENT_BALANCE", message: "Insufficient account balance", status: 403 })).toBe("insufficientBalance");
    expect(keyOf({ message: "insufficient balance", status: 403 })).toBe("insufficientBalance");
    // Gemini-style body from the gateway: message wins over the PERMISSION_DENIED status.
    expect(keyOf({ code: 403, type: "PERMISSION_DENIED", message: "Insufficient account balance" })).toBe("insufficientBalance");
});

test("subscription problems", () => {
    expect(keyOf({ code: "SUBSCRIPTION_NOT_FOUND", message: "No active subscription found for this group", status: 403 })).toBe("subscriptionNotFound");
    expect(keyOf({ message: "No active subscription found for this group" })).toBe("subscriptionNotFound");
    expect(keyOf({ code: "SUBSCRIPTION_INVALID", message: "subscription has expired", status: 403 })).toBe("subscriptionExpired");
    expect(keyOf({ code: "SUBSCRIPTION_INVALID", message: "subscription is suspended", status: 403 })).toBe("subscriptionSuspended");
});

test("subscription usage limits", () => {
    expect(keyOf({ code: "USAGE_LIMIT_EXCEEDED", message: "daily usage limit exceeded", status: 429 })).toBe("usageLimitDaily");
    expect(keyOf({ code: "USAGE_LIMIT_EXCEEDED", message: "weekly usage limit exceeded", status: 429 })).toBe("usageLimitWeekly");
    expect(keyOf({ code: "USAGE_LIMIT_EXCEEDED", message: "monthly usage limit exceeded", status: 429 })).toBe("usageLimitMonthly");
    expect(keyOf({ code: "USAGE_LIMIT_EXCEEDED", message: "limit exceeded", status: 429 })).toBe("usageLimitExceeded");
    expect(keyOf({ code: "DAILY_LIMIT_EXCEEDED", message: "x" })).toBe("usageLimitDaily");
    expect(keyOf({ code: "WEEKLY_LIMIT_EXCEEDED", message: "x" })).toBe("usageLimitWeekly");
    expect(keyOf({ code: "MONTHLY_LIMIT_EXCEEDED", message: "x" })).toBe("usageLimitMonthly");
    expect(keyOf({ message: "monthly usage limit exceeded" })).toBe("usageLimitMonthly");
});

test("account state, IP allowlist and auth throttling", () => {
    expect(keyOf({ code: "USER_INACTIVE", message: "User account is not active", status: 401 })).toBe("userInactive");
    const ip = classify({ code: "ACCESS_DENIED", message: "Access denied. Your IP is 203.0.113.7", status: 403 });
    expect(ip?.key).toBe("ipNotAllowedWithIp");
    expect(ip?.params?.ip).toBe("203.0.113.7");
    expect(keyOf({ message: "Access denied. Your IP is 2001:db8::1" })).toBe("ipNotAllowedWithIp");
    expect(keyOf({ code: "ACCESS_DENIED", message: "Access denied", status: 403 })).toBe("forbidden");
    expect(keyOf({ code: "INVALID_AUTH_RATE_LIMITED", message: "Too many invalid authentication attempts; retry later", status: 429 })).toBe("authRateLimited");
    expect(keyOf({ code: "API_KEY_AUTH_OVERLOADED", message: "API key authentication is temporarily unavailable", status: 503 })).toBe("serviceBusy");
});

test("image generation not enabled for the group", () => {
    expect(keyOf({ type: "permission_error", message: "Image generation is not enabled for this group", status: 403 })).toBe("imageGroupUnsupported");
});

test("unsupported model extracts the model name", () => {
    const kind = classify({ message: 'Model "gpt-image-1" is not supported by any configured account in this group', status: 400 });
    expect(kind?.key).toBe("modelUnsupported");
    expect(kind?.params?.model).toBe("gpt-image-1");
    const openaiStyle = classify({ code: "model_not_found", message: "The model `gpt-9` does not exist or you do not have access to it.", status: 404 });
    expect(openaiStyle?.params?.model).toBe("gpt-9");
    expect(keyOf({ message: "model not found", status: 404 })).toBe("modelUnsupportedUnknown");
    expect(keyOf({ message: "Requested model is unavailable", status: 404 })).toBe("modelUnsupportedUnknown");
    expect(quotedModelName("no quotes")).toBe(undefined);
});

test("no available upstream accounts", () => {
    expect(keyOf({ message: "Service temporarily unavailable", status: 503 })).toBe("noAvailableAccounts");
    expect(keyOf({ message: "No available accounts", status: 503 })).toBe("noAvailableAccounts");
    expect(keyOf({ message: "No available OpenAI accounts", status: 503 })).toBe("noAvailableAccounts");
    expect(keyOf({ message: "No available compatible accounts" })).toBe("noAvailableAccounts");
    expect(keyOf({ message: "All available accounts are currently rate-limited. Please retry later.", status: 429 })).toBe("noAvailableAccounts");
});

test("rate limits and concurrency", () => {
    expect(keyOf({ type: "rate_limit_error", message: "Slow down" })).toBe("rateLimited");
    expect(keyOf({ code: "RATE_LIMITED", message: "x" })).toBe("rateLimited");
    expect(keyOf({ message: "Concurrency limit exceeded for user, please retry later", status: 429 })).toBe("rateLimited");
    expect(keyOf({ message: "Rate limit reached for requests-per-minute" })).toBe("rateLimited");
    expect(keyOf({ message: "Too many requests" })).toBe("rateLimited");
    expect(keyOf({ status: 429 })).toBe("rateLimited");
    expect(keyOf({ code: 429, type: "RESOURCE_EXHAUSTED", message: "Resource has been exhausted (e.g. check quota)." })).toBe("rateLimited");
});

test("upstream overloaded, failed, forbidden and timeouts", () => {
    expect(keyOf({ type: "overloaded_error", message: "Overloaded" })).toBe("upstreamOverloaded");
    expect(keyOf({ message: "An error occurred while processing your request. You can retry your request." })).toBe("upstreamOverloaded");
    expect(keyOf({ status: 503 })).toBe("upstreamOverloaded");
    expect(keyOf({ message: "Upstream request failed", status: 502 })).toBe("badGateway");
    expect(keyOf({ message: "Upstream service temporarily unavailable", status: 502 })).toBe("badGateway");
    expect(keyOf({ type: "stream_read_error", message: "stream closed" })).toBe("badGateway");
    expect(keyOf({ status: 502 })).toBe("badGateway");
    expect(keyOf({ message: "Upstream access forbidden, please contact administrator", status: 502 })).toBe("upstreamForbidden");
    expect(keyOf({ status: 504 })).toBe("gatewayTimeout");
    expect(keyOf({ message: "Upstream request timed out", status: 502 })).toBe("gatewayTimeout");
});

test("HTML error pages map by status instead of showing markup", () => {
    const page = "<html><head><title>504 Gateway Time-out</title></head><body><center><h1>504 Gateway Time-out</h1></center></body></html>";
    expect(keyOf({ message: page, html: true, status: 504 })).toBe("gatewayTimeout");
    expect(keyOf({ message: "<html><body>502 Bad Gateway</body></html>", html: true, status: 502 })).toBe("badGateway");
    expect(keyOf({ message: "<!doctype html><html><body>app</body></html>", html: true, status: 200 })).toBe("baseUrlReturnedHtml");
    expect(keyOf({ message: "<html>405 Not Allowed</html>", html: true, status: 405 })).toBe("baseUrlReturnedHtml");
    const unknown = classify({ message: "<html><body>Teapot</body></html>", html: true, status: 418 });
    expect(unknown?.key).toBe("htmlError");
    expect(unknown?.params?.preview?.includes("<")).toBe(false);
});

test("request too large, context too long and invalid requests", () => {
    expect(keyOf({ status: 413 })).toBe("requestTooLarge");
    expect(keyOf({ message: "Request body too large", status: 413 })).toBe("requestTooLarge");
    expect(keyOf({ code: "context_length_exceeded", message: "This model's maximum context length is 128000 tokens." })).toBe("contextTooLong");
    const parse = classify({ type: "invalid_request_error", message: "Failed to parse request body", status: 400 });
    expect(parse?.key).toBe("invalidRequest");
    expect(parse?.detail).toBe("Failed to parse request body");
    expect(classify({ type: "invalid_request_error", message: "Unknown parameter: 'foo'.", status: 400 })?.detail).toBe("Unknown parameter: 'foo'.");
});

test("browser network failures", () => {
    expect(keyOf({ message: "Failed to fetch" })).toBe("networkError");
    expect(keyOf({ message: "NetworkError when attempting to fetch resource." })).toBe("networkError");
    expect(keyOf({ message: "Load failed" })).toBe("networkError");
    expect(keyOf({ message: "Network Error" })).toBe("networkError");
});

test("Gemini status codes", () => {
    expect(keyOf({ code: 401, type: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." })).toBe("authenticationFailed");
    expect(keyOf({ code: 403, type: "PERMISSION_DENIED", message: "Permission denied on resource project." })).toBe("authenticationFailed");
    expect(keyOf({ code: 400, type: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." })).toBe("authenticationFailed");
});

test("unmapped English messages keep a status sentence plus the original text", () => {
    const withStatus = classify({ message: "Something unexpected happened", status: 500 });
    expect(withStatus?.key).toBe("httpFailed");
    expect(withStatus?.params?.status).toBe("500");
    expect(withStatus?.detail).toBe("Something unexpected happened");
    expect(keyOf({ message: "Weird thing", status: 400 })).toBe("invalidRequest");
    expect(keyOf({ message: "Forbidden for reasons", status: 403 })).toBe("forbidden");
    const notFound = classify({ message: "Not Found", status: 404 });
    expect(notFound?.key).toBe("notFound");
    const bare = classify({ message: "Something unexpected happened" });
    expect(bare?.key).toBe("unknown");
    expect(bare?.detail).toBe("Something unexpected happened");
    expect(classify({ status: 500 })?.detail).toBe(undefined);
    expect(classify({})).toBeNull();
});

test("details are collapsed and truncated", () => {
    const long = "x".repeat(300);
    expect(shortErrorDetail(long).length).toBe(121);
    expect(shortErrorDetail("  a\n\n b  ")).toBe("a b");
});
