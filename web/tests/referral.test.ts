import { describe, expect, test } from "bun:test";

import { captureReferral, loadReferral, normalizeReferralCode, withReferral } from "../src/lib/referral";

describe("referral", () => {
    test("normalizes codes with the main site's rule", () => {
        expect(normalizeReferralCode(" ab-12_x ")).toBe("AB-12_X");
        expect(normalizeReferralCode("abc")).toBe("");
        expect(normalizeReferralCode("a".repeat(33))).toBe("");
        expect(normalizeReferralCode("ab cd")).toBe("");
        expect(normalizeReferralCode("<script>")).toBe("");
        expect(normalizeReferralCode(undefined)).toBe("");
    });

    test("keeps the landing code for 30 days", () => {
        localStorage.clear();
        const now = 1_000_000;
        captureReferral("?utm_source=x", now);
        expect(loadReferral(now)).toBe("");
        captureReferral("?aff=hive2024", now);
        expect(loadReferral(now + 1000)).toBe("HIVE2024");
        captureReferral("?aff_code=OTHER1", now);
        expect(loadReferral(now)).toBe("OTHER1");
        captureReferral("?aff=bad code", now);
        expect(loadReferral(now)).toBe("OTHER1");
        expect(loadReferral(now + 31 * 24 * 3600 * 1000)).toBe("");
        expect(loadReferral(now)).toBe("");
    });

    test("adds the code to links", () => {
        expect(withReferral("https://canvas.example/w/3", "hive2024")).toBe("https://canvas.example/w/3?aff=HIVE2024");
        expect(withReferral("https://canvas.example/w/3?x=1", "")).toBe("https://canvas.example/w/3?x=1");
        expect(withReferral("https://canvas.example/w/3?aff=OLD1", "new22")).toBe("https://canvas.example/w/3?aff=NEW22");
    });
});

describe("forgetOwnReferral", () => {
    test("drops only the signed-in user's own code", async () => {
        const { forgetOwnReferral } = await import("../src/lib/referral");
        localStorage.clear();
        captureReferral("?aff=OTHER1");
        forgetOwnReferral("MINE22");
        expect(loadReferral()).toBe("OTHER1");
        captureReferral("?aff=mine22");
        forgetOwnReferral("MINE22");
        expect(loadReferral()).toBe("");
    });
});
