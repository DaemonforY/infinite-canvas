// Helpers for the creator stats page.

export type CreatorMetric = "views" | "likes" | "favorites" | "remixes" | "followers";

export const CREATOR_METRICS: CreatorMetric[] = ["views", "likes", "favorites", "remixes", "followers"];

/** Change from the previous period: { kind: "new" } when there was nothing before. */
export function periodChange(current: number, previous: number): { kind: "same" } | { kind: "new" } | { kind: "up" | "down"; percent: number } {
    if (current === previous) return { kind: "same" };
    if (previous === 0) return { kind: "new" };
    const percent = Math.round((Math.abs(current - previous) / previous) * 100);
    return { kind: current > previous ? "up" : "down", percent };
}

/** Indexes of the days to label under a chart of n bars (first, last and evenly in between). */
export function labelIndexes(n: number, maxLabels = 6): number[] {
    if (n <= 0) return [];
    if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
    const step = (n - 1) / (maxLabels - 1);
    return Array.from(new Set(Array.from({ length: maxLabels }, (_, i) => Math.round(i * step))));
}

/** A round axis maximum at or above the largest value (1, 2, 5, 10, 20, 50…). */
export function niceMax(value: number): number {
    if (value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    for (const m of [1, 2, 5, 10]) if (m * power >= value) return m * power;
    return 10 * power;
}

/** "10-02" from "2026-10-02". */
export const shortDay = (day: string) => day.slice(5);
