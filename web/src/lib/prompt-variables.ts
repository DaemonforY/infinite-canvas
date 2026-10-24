// Prompt templates: {主体} or {主体=橘猫} in a prompt becomes a fill-in box when the prompt is used.
// The YouMind library style {argument name="主体" default="橘猫"} is read the same way.
// JSON-like braces ({"a": 1}) and long or punctuated text in braces are left alone.

export type PromptVariable = { name: string; defaultValue: string };

const SIMPLE = /\{([^{}"'\n=:：,，]{1,12})(?:=([^{}"\n]{0,60}))?\}/g;
const ARGUMENT = /\{argument\s+name="([^"]{1,30})"(?:\s+default="([^"]*)")?\s*\}/g;

/** Variables in order of first appearance (each name once). */
export function promptVariables(prompt: string): PromptVariable[] {
    const found = new Map<string, PromptVariable>();
    const add = (name: string, value: string | undefined) => {
        const key = name.trim();
        if (!key || /^\d+$/.test(key)) return;
        const current = found.get(key);
        if (!current) found.set(key, { name: key, defaultValue: (value || "").trim() });
        else if (!current.defaultValue && value) current.defaultValue = value.trim();
    };
    const matches: { index: number; name: string; value?: string }[] = [];
    for (const m of prompt.matchAll(ARGUMENT)) matches.push({ index: m.index ?? 0, name: m[1], value: m[2] });
    for (const m of prompt.matchAll(SIMPLE)) if (!m[1].trim().startsWith("argument ")) matches.push({ index: m.index ?? 0, name: m[1], value: m[2] });
    matches.sort((a, b) => a.index - b.index).forEach((m) => add(m.name, m.value));
    return [...found.values()].slice(0, 12);
}

/** Replaces every variable; an empty value falls back to the default, else the bare name. */
export function fillPromptVariables(prompt: string, values: Record<string, string>): string {
    // A default given once ({主体=橘猫}) also applies to the bare {主体} elsewhere.
    const defaults = new Map(promptVariables(prompt).map((v) => [v.name, v.defaultValue]));
    const value = (name: string, fallback?: string) => {
        const key = name.trim();
        return (values[key] || "").trim() || (fallback || "").trim() || defaults.get(key) || key;
    };
    return prompt
        .replace(ARGUMENT, (_all, name: string, fallback?: string) => value(name, fallback))
        .replace(SIMPLE, (all, name: string, fallback?: string) => (/^\d+$/.test(name.trim()) || name.trim().startsWith("argument ") ? all : value(name, fallback)));
}
