/** "刚刚", "5 分钟前", "3 天前", else the date. */
export function relativeTime(iso: string, language: string, now = Date.now()): string {
    const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
    const format = new Intl.RelativeTimeFormat(language || "zh-CN", { numeric: "auto" });
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(0, "second");
    if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
    if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
    if (abs < 86400 * 30) return format.format(Math.round(seconds / 86400), "day");
    return new Date(iso).toLocaleDateString(language || "zh-CN");
}
