// AI 动画: what the user can ask for (scenarios), how it should look (styles) and the canvas shape.
// The `brief` strings go to the model, so they are written for it; labels and examples are i18n keys.

export type AnimationScenario = {
    id: string;
    /** What the model should make for this kind of animation. */
    brief: string;
};

export type AnimationStyle = {
    id: string;
    /** Swatch shown on the style button. */
    swatch: string[];
    /** Visual direction for the model; empty means the model decides. */
    brief: string;
};

export type AnimationRatio = { id: "16:9" | "9:16" | "1:1" | "4:3"; width: number; height: number };

export const animationScenarios: AnimationScenario[] = [
    { id: "free", brief: "Make whatever animation best fits the request." },
    {
        id: "logo",
        brief: "A logo reveal: the mark builds itself (strokes draw in, shapes assemble or morph), the wordmark follows, then a short hold before it loops. Keep it brand-like: one idea, clean geometry, at most 3 colours.",
    },
    {
        id: "text",
        brief: "Kinetic typography: the words enter one by one or letter by letter (stagger with animation-delay), with emphasis on the key word (scale, colour or underline). Large, legible type; never more than ~20 visible characters per line.",
    },
    {
        id: "loader",
        brief: "A loading / progress animation that loops seamlessly with no visible jump. Small and centred, works on both light and dark backgrounds, 1–2.4 s cycle.",
    },
    {
        id: "line",
        brief: "A line-drawing animation: paths are traced with stroke-dasharray / stroke-dashoffset in a deliberate order, then fills or accents fade in, hold, and the drawing resets.",
    },
    {
        id: "flow",
        brief: "An animated flowchart / process diagram: nodes appear in order, connectors draw between them, and a highlight or dot travels along the path to show the flow. Labels inside the nodes, short and readable.",
    },
    {
        id: "chart",
        brief: "An animated data chart (bar, line, pie or ring — whichever suits the data): axes and labels first, then the values grow in with easing, then the key number is called out. If the user gave no data, invent plausible round numbers and say so in a small footnote.",
    },
    {
        id: "science",
        brief: "A science / maths explainer scene for students: one concept shown step by step (e.g. a wave, an orbit, a unit circle, a lever, a cell), with a title, labelled parts and a one-line takeaway. Accuracy matters more than decoration.",
    },
    {
        id: "icon",
        brief: "A set of 3–6 animated icons in a row or grid (e.g. for a website or app), each with its own small looping micro-interaction, consistent stroke width and style.",
    },
    {
        id: "scene",
        brief: "A small illustrated scene with motion (weather, a city at night, a character waving, a product floating): layered shapes with parallax and secondary motion so it feels alive.",
    },
];

export const animationStyles: AnimationStyle[] = [
    { id: "auto", swatch: ["#f5f5f4", "#a8a29e", "#1c1917"], brief: "" },
    { id: "flat", swatch: ["#ffffff", "#3b82f6", "#f59e0b"], brief: "Flat minimal: white or very light background, 2–3 saturated accent colours, no gradients or shadows, generous spacing, rounded geometry." },
    { id: "neon", swatch: ["#0b1020", "#22d3ee", "#a855f7"], brief: "Dark tech neon: near-black navy background, cyan / violet glowing strokes (use an feGaussianBlur glow filter), thin grid lines, monospace labels." },
    {
        id: "marker",
        swatch: ["#fffdf5", "#111827", "#f97316"],
        brief: "Hand-drawn marker: off-white paper background, slightly wobbly dark strokes (use an feTurbulence + feDisplacementMap filter for a hand-made edge), highlighter-yellow and orange accents, handwritten-looking text.",
    },
    { id: "glass", swatch: ["#312e81", "#ec4899", "#f0abfc"], brief: "Gradient glass: deep blue-to-magenta gradient background, frosted translucent cards (white at 10–20% opacity with a light border), soft blurred colour blobs drifting behind." },
    { id: "chalk", swatch: ["#1f3b2d", "#f8fafc", "#fde047"], brief: "Chalkboard: dark green board background, chalk-white strokes with a rough texture, yellow chalk for emphasis — like a teacher drawing it live." },
    { id: "pixel", swatch: ["#1e1b4b", "#facc15", "#f43f5e"], brief: "Retro pixel: everything built from square cells on an 8 px grid, limited 8-colour palette, steps() timing functions, chunky blocky text." },
    { id: "business", swatch: ["#f8fafc", "#1d4ed8", "#0f172a"], brief: "Clean corporate: light grey background, navy and royal blue with one green or orange highlight, precise alignment, crisp sans-serif labels, restrained motion." },
    { id: "cute", swatch: ["#fff1f2", "#fb7185", "#60a5fa"], brief: "Cute cartoon: pastel background, rounded chubby shapes with thick dark outlines, bouncy squash-and-stretch easing, little sparkles." },
    { id: "ink", swatch: ["#f5f0e6", "#1c1917", "#b91c1c"], brief: "Chinese ink wash: rice-paper background, black ink strokes of varying weight with soft bleeding edges (blur filter), a red seal accent, lots of empty space." },
];

export const animationRatios: AnimationRatio[] = [
    { id: "16:9", width: 1280, height: 720 },
    { id: "9:16", width: 720, height: 1280 },
    { id: "1:1", width: 800, height: 800 },
    { id: "4:3", width: 1024, height: 768 },
];

export const findScenario = (id: string) => animationScenarios.find((item) => item.id === id) || animationScenarios[0];
export const findStyle = (id: string) => animationStyles.find((item) => item.id === id) || animationStyles[0];
export const findRatio = (id: string) => animationRatios.find((item) => item.id === id) || animationRatios[0];
