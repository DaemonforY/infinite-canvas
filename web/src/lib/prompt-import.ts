// Bulk import for 「我的提示词」: people keep prompts in notes, chats and spreadsheets, so a pasted
// note or a dropped file is split into separate prompts here (no model needed). The AI split in
// prompt-assist.ts handles messier text. The user checks the list before anything is saved.

export type ImportDraft = { title: string; prompt: string; tags: string[] };

/** Below this a piece is a heading or a stray line, not a prompt. */
const MIN_PROMPT_CHARS = 6;
/** A first line this short with more text below is taken as the title. */
const TITLE_MAX_CHARS = 30;
export const IMPORT_MAX_DRAFTS = 500;

const TITLE_KEYS = ["title", "name", "标题", "名称", "名字"];
const PROMPT_KEYS = ["prompt", "content", "text", "提示词", "内容", "正文", "描述"];
const TAG_KEYS = ["tags", "tag", "标签", "分类"];

function cleanText(text: string) {
    return text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
}

function splitTags(value: unknown): string[] {
    const list = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/[,，、#\s]+/) : [];
    return [...new Set(list.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 8);
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
    for (const [key, value] of Object.entries(record)) if (keys.includes(key.trim().toLowerCase())) return value;
    return undefined;
}

/** Strips list markers and labels people put in front of a prompt ("1.", "- ", "提示词：", "Prompt:"). */
function stripMarkers(text: string) {
    return text
        .replace(/^\s*(?:[-*•·]|\d{1,3}[.、)）]|[（(]\d{1,3}[)）]|[一二三四五六七八九十]{1,3}[、.．])\s*/, "")
        .replace(/^\s*(?:提示词|prompt|正文|内容)\s*[:：]\s*/i, "")
        .trim();
}

function stripFence(text: string) {
    return text.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
}

/** One piece of text → a draft: a short first line becomes the title ("标题：…" too). */
export function pieceToDraft(piece: string): ImportDraft | null {
    const lines = cleanText(piece).split("\n");
    let title = "";
    const titleMatch = lines[0]?.match(/^\s*(?:#{1,6}\s*)?(?:标题|title|名称)\s*[:：]\s*(.+)$/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
        lines.shift();
    } else if (lines.length > 1) {
        // A heading or a bold line is a title; a plain short line only when clearly more text follows
        // (「1. 国风插画，水墨山水 / 远处有飞鸟」 is one prompt over two lines).
        const marked = /^\s*(?:#{1,6}\s|\*\*.+\*\*\s*$)/.test(lines[0]);
        const firstClean = stripMarkers(lines[0].replace(/^\s*#{1,6}\s*/, "").replace(/^\*\*(.+)\*\*\s*$/, "$1")).replace(/[:：]$/, "");
        const restLength = lines.slice(1).join("").trim().length;
        const short = firstClean.length > 0 && firstClean.length <= TITLE_MAX_CHARS && !/[。.!！?？]$/.test(firstClean);
        if (short && (marked || restLength >= Math.max(MIN_PROMPT_CHARS, firstClean.length * 2))) {
            title = firstClean;
            lines.shift();
        }
    }
    let tags: string[] = [];
    const rest = lines.filter((line) => {
        const tagMatch = line.match(/^\s*(?:标签|tags?)\s*[:：]\s*(.+)$/i);
        if (tagMatch) {
            tags = splitTags(tagMatch[1]);
            return false;
        }
        // Folder lines come from our own Markdown export; the import picks the folder itself.
        return !/^\s*(?:文件夹|folder)\s*[:：]/i.test(line);
    });
    const prompt = stripFence(stripMarkers(rest.join("\n").trim()));
    if (prompt.length < MIN_PROMPT_CHARS) return null;
    return { title: title.slice(0, 60), prompt: prompt.slice(0, 8000), tags };
}

const SEPARATOR = /^\s*(?:-{3,}|={3,}|\*{3,}|_{3,}|—{2,}|#{3,}\s*$)\s*$/m;
const NUMBERED = /^\s*(?:\d{1,3}[.、)）]|[（(]\d{1,3}[)）]|[一二三四五六七八九十]{1,3}[、．.])\s*\S/;
const HEADING = /^#{1,4}\s+\S/;

/** Splits pasted text: separators (---), markdown headings, code blocks, numbered items, then blank lines. */
export function splitPromptText(input: string): ImportDraft[] {
    const text = cleanText(input);
    if (!text) return [];
    const json = parseJsonPrompts(text);
    if (json) return json;

    let pieces: string[];
    const fences = [...text.matchAll(/(?:^|\n)([^\n]*)\n?```[\w-]*\n([\s\S]*?)```/g)];
    if (fences.length >= 2) {
        // A note of code blocks: each block is a prompt, the line above it the title.
        pieces = fences.map((m) => (m[1].trim() ? `${m[1].trim()}\n${m[2]}` : m[2]));
    } else if (SEPARATOR.test(text)) {
        pieces = text.split(new RegExp(SEPARATOR.source, "gm"));
    } else if (HEADING.test(text) || text.split("\n").filter((line) => HEADING.test(line)).length >= 2) {
        pieces = text.split(/\n(?=#{1,4}\s+\S)/);
    } else if (text.split("\n").filter((line) => NUMBERED.test(line)).length >= 2) {
        pieces = splitBefore(text, NUMBERED);
    } else {
        pieces = text.split(/\n\s*\n+/);
    }
    const drafts = pieces.map(pieceToDraft).filter((draft): draft is ImportDraft => draft !== null);
    // A single title line followed by an empty piece is merged by pieceToDraft returning null.
    return dedupeDrafts(drafts).slice(0, IMPORT_MAX_DRAFTS);
}

function splitBefore(text: string, pattern: RegExp) {
    const pieces: string[] = [];
    let current: string[] = [];
    for (const line of text.split("\n")) {
        if (pattern.test(line) && current.some((l) => l.trim())) {
            pieces.push(current.join("\n"));
            current = [];
        }
        current.push(line);
    }
    if (current.length) pieces.push(current.join("\n"));
    return pieces;
}

export function dedupeDrafts(drafts: ImportDraft[]): ImportDraft[] {
    const seen = new Set<string>();
    return drafts.filter((draft) => {
        const key = draft.prompt.replace(/\s+/g, "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** A JSON array of strings or of {title, prompt, tags} objects (exports from other tools). */
function parseJsonPrompts(text: string): ImportDraft[] | null {
    if (!/^[[{]/.test(text)) return null;
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    const list = Array.isArray(data) ? data : data && typeof data === "object" ? (Object.values(data).find(Array.isArray) as unknown[] | undefined) : undefined;
    if (!list) return null;
    const drafts: ImportDraft[] = [];
    for (const entry of list) {
        if (typeof entry === "string") {
            const draft = pieceToDraft(entry);
            if (draft) drafts.push(draft);
        } else if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const prompt = String(pick(record, PROMPT_KEYS) ?? "").trim();
            if (prompt.length < MIN_PROMPT_CHARS) continue;
            drafts.push({ title: String(pick(record, TITLE_KEYS) ?? "").trim().slice(0, 60), prompt: prompt.slice(0, 8000), tags: splitTags(pick(record, TAG_KEYS)) });
        }
    }
    return dedupeDrafts(drafts).slice(0, IMPORT_MAX_DRAFTS);
}

/** Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    const src = text.replace(/^\uFEFF/, "");
    const sep = (src.split("\n")[0].match(/\t/g)?.length || 0) > (src.split("\n")[0].match(/,/g)?.length || 0) ? "\t" : ",";
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"' && field === "") quoted = true;
        else if (ch === sep) {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else field += ch;
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim()));
}

/** CSV / TSV: a header row with 标题 / 提示词 / 标签 (or title / prompt / tags), else title + prompt or prompt only. */
export function csvToDrafts(text: string): ImportDraft[] {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const header = rows[0].map((cell) => cell.trim().toLowerCase());
    const col = (keys: string[]) => header.findIndex((cell) => keys.includes(cell));
    let titleCol = col(TITLE_KEYS);
    let promptCol = col(PROMPT_KEYS);
    let tagCol = col(TAG_KEYS);
    let body = rows.slice(1);
    if (promptCol < 0) {
        body = rows;
        const width = Math.max(...rows.map((r) => r.length));
        // Without a header: the longest column is the prompt, a shorter one before it the title.
        const avg = (c: number) => rows.reduce((sum, r) => sum + (r[c]?.length || 0), 0) / rows.length;
        promptCol = [...Array(width).keys()].sort((a, b) => avg(b) - avg(a))[0];
        titleCol = width > 1 ? [...Array(width).keys()].filter((c) => c !== promptCol).sort((a, b) => avg(a) - avg(b))[0] : -1;
        tagCol = -1;
    }
    const drafts: ImportDraft[] = [];
    for (const r of body) {
        const prompt = (r[promptCol] || "").trim();
        if (prompt.length < MIN_PROMPT_CHARS) continue;
        drafts.push({ title: titleCol >= 0 ? (r[titleCol] || "").trim().slice(0, 60) : "", prompt: prompt.slice(0, 8000), tags: tagCol >= 0 ? splitTags(r[tagCol]) : [] });
    }
    return dedupeDrafts(drafts).slice(0, IMPORT_MAX_DRAFTS);
}

/** Reads a dropped file: .csv / .tsv by columns, anything else (txt, md, json) as text. */
export function fileTextToDrafts(name: string, text: string): ImportDraft[] {
    return /\.(csv|tsv)$/i.test(name) ? csvToDrafts(text) : splitPromptText(text);
}

export const IMPORT_FILE_ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json";
