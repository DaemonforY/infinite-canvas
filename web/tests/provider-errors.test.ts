import { expect, test } from "bun:test";

import { isSafetyRejection, safetyRequestId } from "../src/lib/provider-errors";

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
