// 导出 for 「我的提示词」: Markdown that reads well in a notes app and imports back here, or CSV for spreadsheets.

export type ExportablePrompt = { title: string; prompt: string; tags: string[]; folder?: string };

export function promptsToMarkdown(items: ExportablePrompt[]): string {
    return items
        .map((item) => {
            const lines = [`## ${item.title || "未命名"}`, "", item.prompt.trim()];
            const meta = [item.folder ? `文件夹：${item.folder}` : "", item.tags.length ? `标签：${item.tags.join("、")}` : ""].filter(Boolean);
            if (meta.length) lines.push("", ...meta);
            return lines.join("\n");
        })
        .join("\n\n---\n\n")
        .concat("\n");
}

function csvCell(value: string) {
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** With a BOM so Excel opens the Chinese text correctly. */
export function promptsToCsv(items: ExportablePrompt[]): string {
    const rows = [["标题", "提示词", "标签", "文件夹"], ...items.map((item) => [item.title, item.prompt, item.tags.join(","), item.folder || ""])];
    return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
