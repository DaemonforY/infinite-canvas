import { nanoid } from "nanoid";

import { promptAssistConfig } from "@/lib/prompt-assist";
import {
    cellEditPrompt,
    cellPrompt,
    characterSheetPrompt,
    findBubbles,
    pagePrompt,
    panelEditPrompt,
    panelRects,
    panelSegments,
    parseStory,
    placeBubbles,
    NOTE_INSTRUCTION,
    noteRequest,
    parseNote,
    slideInsertRequest,
    splitSlideRequest,
    subSceneRequest,
    slidePrompt,
    SLIDES_INSTRUCTION,
    STORY_INSTRUCTION,
    storyRequest,
    type ComicCellVersion,
    type ComicCharacter,
    type ComicImage,
    type ComicNote,
    type ComicPage,
    type ComicProject,
    type ComicStory,
    type ComicStyleChoice,
    type ComicSubPanel,
    type StoryInput,
} from "@/lib/comic";
import { layoutPage, placeCellBubbles, placeSlideBubbles, ratioFor, SLIDE_HEIGHT, SLIDE_TEXT_SCALE, SLIDE_WIDTH } from "@/lib/comic-layout";
import { imageSizePresets } from "@/lib/media-size";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ComicSceneSource } from "./comic-lettering";

// The model calls of 画漫画, all on the user's own channel (text model for the story, image model for the rest).

export async function writeStory(config: AiConfig, input: StoryInput, onDelta: (text: string) => void, signal?: AbortSignal) {
    const slides = input.format === "slides";
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: slides ? SLIDES_INSTRUCTION : STORY_INSTRUCTION },
            { role: "user", content: storyRequest(input) },
        ],
        onDelta,
        { signal },
    );
    return parseStory(answer, slides ? input.panelCount || 18 : input.panelCount);
}

/** 小红书多图: one new slide written to fit after `index`. */
export async function writeInsertedSlide(config: AiConfig, project: ComicProject, index: number) {
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: SLIDES_INSTRUCTION },
            { role: "user", content: slideInsertRequest(project, index) },
        ],
        () => undefined,
    );
    return parseStory(
        answer,
        1,
        project.characters.map((item) => item.name),
    ).panels[0];
}

/** 一张放两格: the 下格 written to follow the slide's own scene. */
export async function writeSubScene(config: AiConfig, project: ComicProject, index: number): Promise<ComicSubPanel> {
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: SLIDES_INSTRUCTION },
            { role: "user", content: subSceneRequest(project, index) },
        ],
        () => undefined,
    );
    const { shot, action, place, characters, lines } = parseStory(
        answer,
        1,
        project.characters.map((item) => item.name),
    ).panels[0];
    return { shot, action, place, characters, lines };
}

/** 拆成两张: one slide rewritten as two. */
export async function writeSplitSlides(config: AiConfig, project: ComicProject, index: number) {
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: SLIDES_INSTRUCTION },
            { role: "user", content: splitSlideRequest(project, index) },
        ],
        () => undefined,
    );
    const panels = parseStory(
        answer,
        2,
        project.characters.map((item) => item.name),
    ).panels;
    if (panels.length < 2) throw new Error("no panels");
    return panels;
}

/** 笔记文案 for posting the slides. */
export async function writeNote(config: AiConfig, project: ComicProject): Promise<ComicNote> {
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: NOTE_INSTRUCTION },
            { role: "user", content: noteRequest(project) },
        ],
        () => undefined,
    );
    return parseNote(answer);
}

export function storyOf(project: ComicProject): ComicStory {
    return {
        title: project.title,
        characters: project.characters.map(({ name, role, look }) => ({ name, role, look })),
        panels: project.panels.map(({ id: _id, ...panel }) => panel),
    };
}

/**
 * Comic art is drawn at 1K and at most medium quality: a page with several reference sheets is slow, and the
 * upstream gives up after about two minutes. Line art looks fine at medium (even low).
 */
function comicRequest(config: AiConfig, ratio: string): AiConfig {
    return { ...config, count: "1", size: imageSizePresets["1k"][ratio] || "1024x1536", quality: config.quality === "low" ? "low" : "medium" };
}

async function store(dataUrl: string): Promise<ComicImage> {
    const stored = await uploadImage(dataUrl);
    return { url: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), width: stored.width, height: stored.height, mimeType: stored.mimeType };
}

export async function comicImageUrl(image: ComicImage) {
    return resolveImageUrl(image.storageKey, image.url);
}

function toReference(image: ComicImage, name: string): ReferenceImage {
    return { id: nanoid(), name, type: image.mimeType || "image/png", dataUrl: image.storageKey ? "" : image.url, ...(image.storageKey ? { storageKey: image.storageKey } : {}) };
}

export function chosenSheet(character: ComicCharacter) {
    return character.sheet >= 0 ? character.sheets[character.sheet] : undefined;
}

const smallSheets = new Map<string, string>();

/** A design sheet as a reference: a 1024px JPEG instead of a ~2 MB PNG, so the request uploads and runs faster. */
async function sheetReference(image: ComicImage, index: number): Promise<ReferenceImage> {
    const key = image.storageKey || image.url;
    let dataUrl = smallSheets.get(key);
    if (!dataUrl) {
        const element = await loadImage(await comicImageUrl(image));
        const scale = Math.min(1, 1024 / Math.max(element.naturalWidth, element.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(element.naturalWidth * scale);
        canvas.height = Math.round(element.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) return toReference(image, `character-${index + 1}.png`);
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        smallSheets.set(key, dataUrl);
    }
    return { id: nanoid(), name: `character-${index + 1}.jpg`, type: "image/jpeg", dataUrl };
}

export async function drawCharacterSheet(config: AiConfig, character: ComicCharacter, style: ComicStyleChoice) {
    const prompt = characterSheetPrompt(character, style, Boolean(character.photo));
    const request = comicRequest(config, "3:2");
    const result = character.photo ? await requestEdit(request, prompt, [toReference(character.photo, "photo.png")]) : await requestGeneration(request, prompt);
    if (!result[0]) throw new Error("no image");
    return store(result[0].dataUrl);
}

/** Characters with a chosen design sheet, in the order their sheets are sent (图片1, 图片2…). */
export function sheetCharacters(project: ComicProject) {
    return project.characters.filter((character) => chosenSheet(character));
}

export async function drawPage(config: AiConfig, project: ComicProject): Promise<ComicPage> {
    const characters = sheetCharacters(project);
    const prompt = pagePrompt(project, characters);
    const request = comicRequest(config, "2:3");
    const references = await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index)));
    const result = references.length ? await requestEdit(request, prompt, references) : await requestGeneration(request, prompt);
    if (!result[0]) throw new Error("no image");
    const image = await store(result[0].dataUrl);
    return { id: nanoid(), image, bubbles: await letter(project, image), createdAt: Date.now(), prompt };
}

/** Redraws one panel: the page plus a copy with that panel tinted blue, and the character sheets. */
export async function redrawPanel(config: AiConfig, project: ComicProject, page: ComicPage, panelIndex: number, instruction: string): Promise<ComicPage> {
    const characters = sheetCharacters(project);
    const rect = panelRects(project.panels.length)[panelIndex];
    const maskDataUrl = await tintRect(await comicImageUrl(page.image), rect);
    const mask = await store(maskDataUrl);
    const references = [toReference(page.image, "page.png"), toReference(mask, "mask.png"), ...(await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index))))];
    const panel = project.panels[panelIndex];
    const panelText = panelSegments(panel, project.characters, project.style)
        .filter((segment) => segment.kind !== "style")
        .map((segment) => segment.text)
        .join("，");
    const prompt = panelEditPrompt(panelIndex, instruction, characters, panelText);
    const result = await requestEdit({ ...comicRequest(config, "2:3"), size: "auto" }, prompt, references);
    if (!result[0]) throw new Error("no image");
    const image = await store(result[0].dataUrl);
    // Keep the lettering of the other panels; place this panel's lines again.
    const fresh = await letter(project, image);
    const bubbles = [
        ...page.bubbles.filter((bubble) => bubble.panel !== panelIndex),
        ...fresh.filter((bubble) => bubble.panel === panelIndex).map((bubble) => ({ ...bubble, text: page.bubbles.find((old) => old.panel === panelIndex && old.line === bubble.line)?.text ?? bubble.text })),
    ];
    return { id: nanoid(), image, bubbles, createdAt: Date.now(), prompt, label: `第 ${panelIndex + 1} 格：${instruction.trim()}` };
}

// ---------------------------------------------------------------------------------------------
// 逐格精画: every panel is its own image, in the shape of its cell in the chosen layout.

export function projectLayout(project: Pick<ComicProject, "layout" | "panels">) {
    return layoutPage(project.layout || "manga", project.panels.length);
}

/** The panel's cast with a chosen design sheet (sent as 图片1, 图片2… for that panel only). */
export function panelSheetCharacters(project: ComicProject, panelIndex: number) {
    const panel = project.panels[panelIndex];
    const cast = new Set([...panel.characters, ...(panel.sub?.characters || [])]);
    return sheetCharacters(project).filter((character) => cast.has(character.name));
}

function panelText(project: ComicProject, panelIndex: number) {
    return panelSegments(project.panels[panelIndex], project.characters, project.style, "cells")
        .filter((segment) => segment.kind !== "style")
        .map((segment) => segment.text)
        .join("，");
}

export function cellRatio(project: ComicProject, panelIndex: number) {
    // Slides are 3:4; they are drawn at 2:3 (1024×1536, the closest size the model returns reliably) and cropped.
    if (project.format === "slides") return "2:3";
    return ratioFor(projectLayout(project).cells[panelIndex]);
}

/** The prompt a panel (or slide) is drawn from. */
export function panelPrompt(project: ComicProject, panelIndex: number) {
    const characters = panelSheetCharacters(project, panelIndex);
    return project.format === "slides" ? slidePrompt(project, panelIndex, characters) : cellPrompt(project, panelIndex, characters, cellRatio(project, panelIndex));
}

/** 小红书多图: lettering of every slide (the defaults until the user edits them). */
export function slideBubbles(project: ComicProject) {
    return project.cellBubbles ?? placeSlideBubbles(project.panels, project.coverTitle || project.coverTitles?.[0] || project.title, nanoid);
}

/** The lettering after one slide changed shape (two panels on or off): that slide gets its defaults again. */
export function relayoutSlide(project: ComicProject, index: number) {
    if (!project.cellBubbles) return undefined;
    const fresh = placeSlideBubbles(project.panels, project.coverTitle || project.coverTitles?.[0] || project.title, nanoid).filter((bubble) => bubble.panel === index);
    return [...project.cellBubbles.filter((bubble) => bubble.panel !== index), ...fresh];
}

/** One slide as a scene: full-bleed art, its own lettering and the page number. */
export function slideSource(project: ComicProject, index: number, bubbles = slideBubbles(project)): ComicSceneSource {
    const rect = { x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT };
    return {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        // Every panel has a frame so bubbles keep their panel index; only this one is drawn.
        cells: project.panels.map((panel, i) => {
            const cell = project.cells?.[panel.id];
            return { rect, image: i === index ? cell?.versions[cell.version]?.image : undefined, focus: cell?.focus, hidden: i !== index, border: false, contain: !!panel.sub };
        }),
        bubbles: bubbles.filter((bubble) => bubble.panel === index),
        pageLabel: project.pageNumbers === false || index === 0 ? undefined : `${index + 1}/${project.panels.length}`,
        textScale: SLIDE_TEXT_SCALE,
        titleStyle: project.titleStyle,
    };
}

export async function drawCell(config: AiConfig, project: ComicProject, panelIndex: number): Promise<ComicCellVersion> {
    const characters = panelSheetCharacters(project, panelIndex);
    const ratio = cellRatio(project, panelIndex);
    const prompt = panelPrompt(project, panelIndex);
    const references = await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index)));
    const request = comicRequest(config, ratio);
    const result = references.length ? await requestEdit(request, prompt, references) : await requestGeneration(request, prompt);
    if (!result[0]) throw new Error("no image");
    return { image: await store(result[0].dataUrl), prompt, createdAt: Date.now() };
}

/** Changes a drawn panel by an instruction: the panel is 图片1, the sheets of its cast follow. */
export async function editCell(config: AiConfig, project: ComicProject, panelIndex: number, base: ComicImage, instruction: string): Promise<ComicCellVersion> {
    const characters = panelSheetCharacters(project, panelIndex);
    const prompt = cellEditPrompt(instruction, characters, panelText(project, panelIndex));
    const references = [toReference(base, "panel.png"), ...(await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index + 1))))];
    const result = await requestEdit(comicRequest(config, cellRatio(project, panelIndex)), prompt, references);
    if (!result[0]) throw new Error("no image");
    return { image: await store(result[0].dataUrl), prompt, label: instruction.trim(), createdAt: Date.now() };
}

/** What the page shows: the current one-image page, or the drawn panels in the layout's cells. */
export function sceneSource(project: ComicProject): ComicSceneSource | null {
    if (project.format === "slides") return slideSource(project, 0);
    if ((project.mode || "page") === "page") {
        const page = project.pages[project.page];
        if (!page) return null;
        return { width: page.image.width || 1024, height: page.image.height || 1536, image: page.image, bubbles: page.bubbles };
    }
    const layout = projectLayout(project);
    return {
        width: layout.width,
        height: layout.height,
        cells: layout.cells.map((rect, index) => {
            const cell = project.cells?.[project.panels[index].id];
            return { rect, image: cell?.versions[cell.version]?.image, focus: cell?.focus };
        }),
        bubbles: project.cellBubbles ?? placeCellBubbles(project.panels, nanoid),
    };
}

/** Panel areas in page pixels for selection: the model's grid on a one-image page, the cells on a 逐格 page. */
export function scenePanelRects(project: ComicProject, source: ComicSceneSource) {
    if (source.cells) return source.cells.map((cell) => cell.rect);
    return panelRects(project.panels.length).map((rect) => ({ x: rect.x * source.width, y: rect.y * source.height, w: rect.w * source.width, h: rect.h * source.height }));
}

/** Finds the empty balloons of a page and puts the story's lines in them. */
export async function letter(project: Pick<ComicProject, "panels">, image: ComicImage) {
    const rects = panelRects(project.panels.length);
    let found: ReturnType<typeof findBubbles> = rects.map(() => []);
    try {
        const pixels = await readPixels(await comicImageUrl(image), 360);
        found = findBubbles(pixels.data, pixels.width, pixels.height, rects);
    } catch {
        // No balloons found: every line gets a drawn balloon.
    }
    return placeBubbles(project.panels, found, rects, nanoid);
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}

async function readPixels(src: string, maxWidth: number) {
    const image = await loadImage(src);
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    return { data: context.getImageData(0, 0, width, height).data, width, height };
}

async function tintRect(src: string, rect: { x: number; y: number; w: number; h: number }) {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0);
    context.fillStyle = "rgba(37, 99, 235, 0.4)";
    context.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
    return canvas.toDataURL("image/png");
}
