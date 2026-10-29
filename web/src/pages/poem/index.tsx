import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Segmented, Select, Spin, Switch } from "antd";
import { ArrowLeft, BookOpenText, Check, ChevronDown, Copy, Dices, ImagePlus, LoaderCircle, PenLine, RefreshCw, Search, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ImageEditorDialog } from "@/components/image-editor/image-editor-dialog";
import { drawTextLayers, ensureLayerFonts, TEXT_FONTS, type TextFontId, type TextLayer } from "@/lib/image-editor/text-layers";
import { imageSizePresets } from "@/lib/media-size";
import {
    authorLine,
    blankHint,
    calmBox,
    cleanScene,
    defaultLines,
    KEYWORDS_INSTRUCTION,
    parseKeywords,
    parsePicks,
    PICK_INSTRUCTION,
    pickRequest,
    POEM_RATIOS,
    POEM_STYLES,
    buildPoemPrompt,
    DEFAULT_TEMPLATE,
    DEFAULT_TEMPLATE_ID,
    POEM_TEMPLATE_VARS,
    poemLayers,
    SCENE_INSTRUCTION,
    sceneRequest,
    type PoemBox,
    type PoemCandidate,
    type PoemImage,
    type PoemInk,
    type PoemProject,
    type PoemRatio,
    type PoemSource,
    type PoemTemplate,
} from "@/lib/poem";
import { promptAssistConfig } from "@/lib/prompt-assist";
import { requestGeneration, requestImageQuestion } from "@/services/api/image";
import { getPoem, poemCandidates, searchPoems, type MainSitePoem } from "@/services/api/main-site-poems";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";
import { useSaveImage } from "../image/use-save-image";
import { deletePoem, deleteTemplate, listPoems, listTemplates, readPoem, savePoem, saveTemplate } from "./poem-store";

// 诗画 (/poem): 选诗 → 画面 → 生成 → 配诗. Poems come from the main site's corpus (or are pasted in); every model
// call runs on the user's own channel. The poem is set on the picture as text layers, never drawn by the model.
// The style cards show the same 村居 scene drawn in each style (web/public/poem-styles). The image prompt comes
// from a template (DEFAULT_POEM_TEMPLATE or the user's own); the AI scene is optional and goes last.

const DYNASTIES = ["先秦", "汉", "魏晋", "南北朝", "隋", "唐", "五代", "宋", "金", "元", "明", "清"];
const LETTER_FONTS: TextFontId[] = ["ma-shan-zheng", "zhi-mang-xing", "long-cang", "zcool-xiaowei", "noto-serif-sc"];
const FONT_NAMES: Record<string, string> = { "ma-shan-zheng": "马善政楷书", "zhi-mang-xing": "志莽行书", "long-cang": "龙藏行书", "zcool-xiaowei": "站酷小薇", "noto-serif-sc": "思源宋体" };
const PLACES = ["auto", "topRight", "topLeft", "right", "left"] as const;
type Place = (typeof PLACES)[number];
const PLACE_NAMES: Record<Place, string> = { auto: "自动找留白", topRight: "右上", topLeft: "左上", right: "右侧", left: "左侧" };
const PLACE_BOXES: Record<Exclude<Place, "auto">, PoemBox> = {
    topRight: { x0: 0.5, y0: 0.04, x1: 0.95, y1: 0.48 },
    topLeft: { x0: 0.05, y0: 0.04, x1: 0.5, y1: 0.48 },
    right: { x0: 0.62, y0: 0.05, x1: 0.95, y1: 0.9 },
    left: { x0: 0.05, y0: 0.05, x1: 0.38, y1: 0.9 },
};

function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function useReadyCheck() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const imageConfig: AiConfig = { ...effectiveConfig, model: effectiveConfig.imageModel || effectiveConfig.model };
    const ready = (config: AiConfig) => {
        if (isAiConfigReady(config, config.model)) return true;
        message.warning("请先连接账号或配置渠道");
        openConfigDialog(true);
        return false;
    };
    return { effectiveConfig, imageConfig, readyText: () => ready(promptAssistConfig(effectiveConfig)), readyImage: () => ready(imageConfig) };
}

function useImageUrl(image?: PoemImage) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let alive = true;
        if (!image) return setUrl("");
        void resolveImageUrl(image.storageKey, image.url).then((value) => alive && setUrl(value));
        return () => {
            alive = false;
        };
    }, [image]);
    return url;
}

function PoemImageView({ image, className }: { image?: PoemImage; className?: string }) {
    const url = useImageUrl(image);
    return url ? <img src={url} alt="" className={className} draggable={false} /> : <div className={`${className || ""} bg-stone-100 dark:bg-stone-800`} />;
}

function newProject(poem: PoemSource): PoemProject {
    const now = Date.now();
    return {
        id: nanoid(),
        poem,
        lines: defaultLines(poem.content),
        style: "xinzhongshi",
        ratio: "2:3",
        scene: "",
        drawings: [],
        font: "ma-shan-zheng",
        titleFont: "zhi-mang-xing",
        seal: "诗画",
        createdAt: now,
        updatedAt: now,
    };
}

function toSource(poem: MainSitePoem): PoemSource {
    return { id: poem.id, title: poem.title, author: poem.author, dynasty: poem.dynasty, content: poem.content, collection: poem.collection };
}

export default function PoemPage() {
    const { id } = useParams();
    return id ? <PoemEditor key={id} id={id} /> : <PoemHome />;
}

// ---------------------------------------------------------------------------------------------
// 选诗

function PoemCard({ poem, reason, onDraw }: { poem: MainSitePoem; reason?: string; onDraw: () => void }) {
    const lines = poem.content.split("\n");
    return (
        <div className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900" data-testid={`poem-card-${poem.id}`}>
            <div className="font-serif text-base font-semibold text-stone-900 dark:text-stone-100">{poem.title}</div>
            <div className="mt-0.5 text-xs text-stone-500">
                {authorLine(poem)}
                {poem.famous ? <span className="ml-1.5 rounded bg-rose-50 px-1 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">名篇</span> : null}
            </div>
            {reason ? <div className="mt-2 rounded-lg bg-(--skin-accent)/10 px-2.5 py-1.5 text-xs text-stone-700 dark:text-stone-200">{reason}</div> : null}
            <div className="mt-2 flex-1 font-serif text-sm leading-7 text-stone-700 dark:text-stone-300">
                {lines.slice(0, 4).map((line, i) => (
                    <div key={i} className="truncate">
                        {line}
                    </div>
                ))}
                {lines.length > 4 ? <div className="text-stone-400">……</div> : null}
            </div>
            <Button type="primary" size="small" className="mt-3 self-start" icon={<Wand2 className="size-3.5" />} onClick={onDraw} data-testid={`poem-draw-${poem.id}`}>
                画这首
            </Button>
        </div>
    );
}

function PoemHome() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { effectiveConfig, readyText } = useReadyCheck();
    const [projects, setProjects] = useState<PoemProject[]>([]);
    const [tab, setTab] = useState<"search" | "find" | "paste">("search");
    const [q, setQ] = useState("");
    const [dynasty, setDynasty] = useState("");
    const [famous, setFamous] = useState(true);
    const [results, setResults] = useState<MainSitePoem[]>([]);
    const [searching, setSearching] = useState(false);
    const [scene, setScene] = useState("");
    const [finding, setFinding] = useState("");
    const [picks, setPicks] = useState<{ poem: MainSitePoem; reason: string }[]>([]);
    const [paste, setPaste] = useState({ title: "", author: "", dynasty: "", content: "" });
    const opened = useRef(false);
    // Opened from 用这首诗生图: a loading state until the new project opens (not the empty start page).
    const [openingPoem, setOpeningPoem] = useState(() => Boolean(Number(searchParams.get("poem"))));

    const start = useCallback(
        async (poem: PoemSource) => {
            const project = newProject(poem);
            await savePoem(project);
            navigate(`/poem/${project.id}`);
        },
        [navigate],
    );

    // 用这首诗生图 on the main site: /poem?poem=<id> opens a new 诗画 with that poem.
    useEffect(() => {
        const poemId = Number(searchParams.get("poem"));
        if (!poemId || opened.current) return;
        opened.current = true;
        void getPoem(poemId)
            .then((poem) => start(toSource(poem)))
            .catch((error) => {
                message.error(errorText(error, "没能打开这首诗"));
                setOpeningPoem(false);
                setSearchParams({}, { replace: true });
            });
    }, [message, searchParams, setSearchParams, start]);

    useEffect(() => {
        void listPoems().then(setProjects);
    }, []);

    const search = async (random = false) => {
        setSearching(true);
        try {
            const res = await searchPoems({ q: random ? "" : q.trim(), dynasty, famous: random || famous, random });
            setResults(res.items);
        } catch (error) {
            message.error(errorText(error, "诗词库暂时打不开"));
        } finally {
            setSearching(false);
        }
    };

    // Famous poems to start from (only on opening the page).
    const firstSearch = useRef(false);
    useEffect(() => {
        if (firstSearch.current || searchParams.get("poem")) return;
        firstSearch.current = true;
        void search(true);
    });

    const find = async () => {
        if (!scene.trim() || !readyText()) return;
        setPicks([]);
        try {
            setFinding("AI 正在把画面拆成检索词…");
            const config = promptAssistConfig(effectiveConfig);
            const words = parseKeywords(await requestImageQuestion(config, [{ role: "system", content: KEYWORDS_INSTRUCTION }, { role: "user", content: `画面：${scene.trim()}` }], () => undefined));
            if (!words.length) throw new Error("没能拆出检索词，换个说法再试");
            setFinding(`在诗库里找「${words.slice(0, 6).join("、")}」…`);
            const { items } = await poemCandidates(words, dynasty);
            if (!items.length) throw new Error("诗库里没找到相关的诗，换个说法再试");
            setFinding("AI 正在挑最合适的几首…");
            const chosen = parsePicks(await requestImageQuestion(config, [{ role: "system", content: PICK_INSTRUCTION }, { role: "user", content: pickRequest(scene.trim(), items as PoemCandidate[], 6) }], () => undefined), items as PoemCandidate[], 6);
            setPicks(chosen.length ? (chosen as { poem: MainSitePoem; reason: string }[]) : items.slice(0, 6).map((poem) => ({ poem, reason: "" })));
        } catch (error) {
            message.error(errorText(error, "找诗失败，请重试"));
        } finally {
            setFinding("");
        }
    };

    const remove = async (project: PoemProject) => {
        await deletePoem(project);
        setProjects(await listPoems());
    };

    if (openingPoem)
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-stone-500" data-testid="poem-opening">
                <Spin />
                正在打开这首诗…
            </div>
        );

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
                <div className="text-center">
                    <h1 className="font-serif text-2xl font-bold text-stone-950 sm:text-3xl dark:text-stone-50">诗画</h1>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">选一首诗，AI 画出诗里的画面，再把诗句用书法写上去</p>
                </div>

                <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-(--skin-accent)/50 bg-white p-4 shadow-[0_10px_30px_rgba(124,58,237,0.08)] dark:bg-stone-900">
                    <Segmented
                        value={tab}
                        onChange={(value) => setTab(value as typeof tab)}
                        options={[
                            { value: "search", label: "搜诗" },
                            { value: "find", label: "按画面找" },
                            { value: "paste", label: "自己贴诗" },
                        ]}
                    />
                    {tab === "search" ? (
                        <div className="mt-3 space-y-2">
                            <div className="flex gap-2">
                                <Input value={q} onChange={(event) => setQ(event.target.value)} onPressEnter={() => void search()} placeholder="篇名、作者或诗句里的字词，比如：纸鸢 春风" prefix={<Search className="size-4 text-stone-400" />} data-testid="poem-q" />
                                <Button type="primary" loading={searching} onClick={() => void search()}>
                                    搜索
                                </Button>
                                <Button icon={<Dices className="size-4" />} onClick={() => void search(true)}>
                                    随便来几首
                                </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                                <Select size="small" value={dynasty} onChange={setDynasty} className="w-28" options={[{ value: "", label: "全部朝代" }, ...DYNASTIES.map((d) => ({ value: d, label: d }))]} />
                                <span className="flex items-center gap-1.5">
                                    <Switch size="small" checked={famous} onChange={setFamous} /> 只看名篇
                                </span>
                            </div>
                        </div>
                    ) : null}
                    {tab === "find" ? (
                        <div className="mt-3 space-y-2">
                            <textarea
                                value={scene}
                                onChange={(event) => setScene(event.target.value.slice(0, 200))}
                                rows={2}
                                placeholder="描述想画的画面或心情，比如：春天田野里孩子们放风筝；秋夜一个人想家"
                                className="w-full resize-none rounded-lg border border-stone-200 bg-transparent p-2.5 text-sm outline-none focus:border-(--skin-accent) dark:border-stone-700"
                                data-testid="poem-scene"
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <Button type="primary" icon={finding ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} disabled={Boolean(finding) || !scene.trim()} onClick={() => void find()} data-testid="poem-find">
                                    {finding || "帮我找诗"}
                                </Button>
                                <span className="text-xs text-stone-400">AI 只把画面拆成检索词、从真实诗库里挑，不会编诗；用你自己的渠道计费</span>
                            </div>
                        </div>
                    ) : null}
                    {tab === "paste" ? (
                        <div className="mt-3 space-y-2">
                            <div className="flex gap-2">
                                <Input value={paste.title} onChange={(event) => setPaste({ ...paste, title: event.target.value })} placeholder="标题" />
                                <Input value={paste.author} onChange={(event) => setPaste({ ...paste, author: event.target.value })} placeholder="作者" className="w-32" />
                                <Input value={paste.dynasty} onChange={(event) => setPaste({ ...paste, dynasty: event.target.value })} placeholder="朝代" className="w-20" />
                            </div>
                            <Input.TextArea value={paste.content} onChange={(event) => setPaste({ ...paste, content: event.target.value })} rows={4} placeholder="诗句，一行一句（比如照课本抄的版本）" />
                            <Button type="primary" disabled={!paste.title.trim() || !paste.content.trim()} onClick={() => void start({ title: paste.title.trim(), author: paste.author.trim(), dynasty: paste.dynasty.trim(), content: paste.content.trim() })}>
                                开始画
                            </Button>
                        </div>
                    ) : null}
                </div>

                {tab === "search" && results.length ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {results.map((poem) => (
                            <PoemCard key={poem.id} poem={poem} onDraw={() => void start(toSource(poem))} />
                        ))}
                    </div>
                ) : null}
                {tab === "find" && picks.length ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {picks.map((pick) => (
                            <PoemCard key={pick.poem.id} poem={pick.poem} reason={pick.reason} onDraw={() => void start(toSource(pick.poem))} />
                        ))}
                    </div>
                ) : null}

                {projects.length ? (
                    <div className="mt-10">
                        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">我的诗画</h2>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project) => {
                                const cover = project.poster || project.drawings.find((d) => d.id === project.chosen)?.image || project.drawings[0]?.image;
                                return (
                                    <div key={project.id} className="group flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-900">
                                        <button type="button" className="shrink-0" onClick={() => navigate(`/poem/${project.id}`)}>
                                            {cover ? (
                                                <PoemImageView image={cover} className="h-20 w-14 rounded-md object-cover" />
                                            ) : (
                                                <span className="flex h-20 w-14 items-center justify-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-800">
                                                    <BookOpenText className="size-4" />
                                                </span>
                                            )}
                                        </button>
                                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/poem/${project.id}`)}>
                                            <span className="block truncate font-serif text-sm font-medium text-stone-900 dark:text-stone-100">{project.poem.title}</span>
                                            <span className="mt-0.5 block text-xs text-stone-500">{authorLine(project.poem)}</span>
                                            <span className="mt-0.5 block text-xs text-stone-400">{project.poster ? "已配诗" : project.drawings.length ? `${project.drawings.length} 张画` : "还没画"}</span>
                                        </button>
                                        <Popconfirm title="删除这幅诗画？画和成品都会删掉" okText="删除" cancelText="取消" onConfirm={() => void remove(project)}>
                                            <Button type="text" size="small" icon={<Trash2 className="size-4" />} className="opacity-60 group-hover:opacity-100" aria-label="删除" />
                                        </Popconfirm>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// 画面 → 生成 → 配诗

type Step = "scene" | "draw" | "letter";
const STEPS: { key: Step; label: string }[] = [
    { key: "scene", label: "画面" },
    { key: "draw", label: "生成" },
    { key: "letter", label: "配诗" },
];

function PoemEditor({ id }: { id: string }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { effectiveConfig, imageConfig, readyText, readyImage } = useReadyCheck();
    const [project, setProject] = useState<PoemProject | null | undefined>(undefined);
    const projectRef = useRef<PoemProject | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const [step, setStep] = useState<Step>("scene");
    const [writing, setWriting] = useState(false);
    const [drawing, setDrawing] = useState(0);

    useEffect(() => {
        void readPoem(id).then((value) => {
            projectRef.current = value;
            setProject(value);
            if (value) setStep(value.poster || value.chosen ? "letter" : value.drawings.length ? "draw" : "scene");
        });
        return () => {
            window.clearTimeout(saveTimer.current);
            if (projectRef.current) void savePoem(projectRef.current);
        };
    }, [id]);

    const patch = useCallback((change: (current: PoemProject) => PoemProject) => {
        const current = projectRef.current;
        if (!current) return;
        const next = { ...change(current), updatedAt: Date.now() };
        projectRef.current = next;
        setProject(next);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void savePoem(next), 400);
    }, []);

    const writeScene = useCallback(async () => {
        const current = projectRef.current;
        if (!current || !readyText()) return;
        setWriting(true);
        try {
            const answer = await requestImageQuestion(
                promptAssistConfig(effectiveConfig),
                [
                    { role: "system", content: SCENE_INSTRUCTION },
                    { role: "user", content: sceneRequest(current.poem, current.ratio, current.lines) },
                ],
                (text) => patch((p) => ({ ...p, scene: cleanScene(text) })),
            );
            patch((p) => ({ ...p, scene: cleanScene(answer) }));
        } catch (error) {
            message.error(errorText(error, "写画面失败，请重试"));
        } finally {
            setWriting(false);
        }
        // readyText and effectiveConfig change identity on every render; the latest are read when called.
    }, [effectiveConfig, message, patch, readyText]);

    // Prompt templates: the built-in default and the user's own.
    const [templates, setTemplates] = useState<PoemTemplate[]>([DEFAULT_TEMPLATE]);
    const [templateEdit, setTemplateEdit] = useState<PoemTemplate | null>(null);
    const [sceneOpen, setSceneOpen] = useState(false);
    const reloadTemplates = useCallback(async () => setTemplates([DEFAULT_TEMPLATE, ...(await listTemplates())]), []);
    useEffect(() => {
        void reloadTemplates();
    }, [reloadTemplates]);
    const templateOf = (current: PoemProject) => templates.find((t) => t.id === (current.templateId || DEFAULT_TEMPLATE_ID)) || DEFAULT_TEMPLATE;
    const promptOf = (current: PoemProject) =>
        buildPoemPrompt({ template: templateOf(current).text, style: current.style, ratio: current.ratio, poem: current.poem, lines: current.lines, scene: current.scene });

    const draw = async (count = 2) => {
        const current = projectRef.current;
        if (!current || !(current.lines || current.poem.content).trim() || !readyImage()) return;
        setStep("draw");
        setDrawing((n) => n + count);
        const prompt = promptOf(current);
        // One image per request, in parallel: the upstream gives up after about two minutes, and two images in
        // one request take longer than one.
        const config: AiConfig = { ...imageConfig, count: "1", size: imageSizePresets["1k"][current.ratio] || "1024x1536" };
        try {
            const settled = await Promise.allSettled(Array.from({ length: count }, () => requestGeneration(config, prompt)));
            const result = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
            if (!result.length) throw settled.find((item): item is PromiseRejectedResult => item.status === "rejected")?.reason || new Error("没有收到图片");
            if (result.length < count) message.warning(`有 ${count - result.length} 张没画出来，可以再画`);
            const stored = await Promise.all(result.map((item) => uploadImage(item.dataUrl)));
            patch((p) => ({
                ...p,
                drawings: [
                    ...stored.map((s) => ({ id: nanoid(), image: { url: s.url, ...(s.storageKey ? { storageKey: s.storageKey } : {}), width: s.width, height: s.height, mimeType: s.mimeType }, prompt, createdAt: Date.now() })),
                    ...p.drawings,
                ],
            }));
        } catch (error) {
            message.error(errorText(error, "生成失败，请重试"));
        } finally {
            setDrawing((n) => Math.max(0, n - count));
        }
    };

    if (project === undefined)
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    if (project === null)
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-stone-500">
                找不到这幅诗画，可能已经删除了
                <Button onClick={() => navigate("/poem")}>回到诗画</Button>
            </div>
        );

    const chosen = project.drawings.find((d) => d.id === project.chosen);
    const canEnter = (key: Step) => (key === "draw" ? project.drawings.length > 0 || drawing > 0 : key === "letter" ? Boolean(chosen) : true);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/poem")}>
                        诗画
                    </Button>
                    <div className="min-w-0">
                        <span className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100">{project.poem.title}</span>
                        <span className="ml-2 text-sm text-stone-500">{authorLine(project.poem)}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        {STEPS.map((s, i) => (
                            <button
                                key={s.key}
                                type="button"
                                disabled={!canEnter(s.key)}
                                onClick={() => setStep(s.key)}
                                className={`rounded-full px-3 py-1 text-sm transition disabled:opacity-40 ${step === s.key ? "bg-(--skin-accent) text-white" : "text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"}`}
                                data-testid={`poem-step-${s.key}`}
                            >
                                {i + 1}. {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {step === "scene" ? (
                    <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_1fr]">
                        <div className="h-fit rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
                            <div className="text-xs text-stone-500">原诗</div>
                            <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-line font-serif text-sm leading-7 text-stone-800 dark:text-stone-200">{project.poem.content}</div>
                            <div className="mt-4 text-xs text-stone-500">写在画上的诗句（长诗可以只留几句）</div>
                            <Input.TextArea value={project.lines} onChange={(event) => patch((p) => ({ ...p, lines: event.target.value }))} autoSize={{ minRows: 3, maxRows: 10 }} className="mt-1 font-serif" data-testid="poem-lines" />
                        </div>
                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 text-sm font-medium text-stone-800 dark:text-stone-200">画风</div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {POEM_STYLES.map((style) => (
                                        <button
                                            key={style.id}
                                            type="button"
                                            onClick={() => patch((p) => ({ ...p, style: style.id }))}
                                            className={`rounded-xl border p-3 text-left transition ${project.style === style.id ? "border-(--skin-accent) ring-2 ring-(--skin-accent)/30" : "border-stone-200 hover:border-stone-300 dark:border-stone-700"}`}
                                            data-testid={`poem-style-${style.id}`}
                                        >
                                            <img src={`/poem-styles/${style.id}.webp`} alt={style.name} loading="lazy" draggable={false} className="aspect-[16/9] w-full rounded-lg object-cover object-bottom" style={{ background: style.swatch[3] }} />
                                            <div className="mt-2 text-sm font-medium text-stone-900 dark:text-stone-100">{style.name}</div>
                                            <div className="mt-0.5 text-xs text-stone-500">{style.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">比例</span>
                                <Segmented value={project.ratio} onChange={(value) => patch((p) => ({ ...p, ratio: value as PoemRatio }))} options={POEM_RATIOS.map((r) => ({ value: r, label: r === "2:3" ? "2:3 竖版" : r === "3:4" ? "3:4 小红书" : r === "9:16" ? "9:16 手机" : r === "1:1" ? "1:1 方图" : "3:2 横版" }))} />
                            </div>
                            <div>
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">提示词模板</span>
                                    <Select
                                        size="small"
                                        className="min-w-40"
                                        value={templateOf(project).id}
                                        onChange={(value) => patch((p) => ({ ...p, templateId: value }))}
                                        options={templates.map((t) => ({ value: t.id, label: t.name }))}
                                        data-testid="poem-template"
                                    />
                                    <Button size="small" icon={<PenLine className="size-3.5" />} onClick={() => setTemplateEdit({ ...templateOf(project) })} data-testid="poem-template-edit">
                                        {templateOf(project).id === DEFAULT_TEMPLATE_ID ? "改成我的模板" : "编辑模板"}
                                    </Button>
                                </div>
                                <div className="relative rounded-lg border border-stone-200 bg-stone-50 p-3 pr-10 dark:border-stone-700 dark:bg-stone-800/50">
                                    <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-stone-700 dark:text-stone-300" data-testid="poem-prompt">
                                        {promptOf(project)}
                                    </pre>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!absolute right-1.5 top-1.5"
                                        icon={<Copy className="size-3.5" />}
                                        aria-label="复制提示词"
                                        onClick={() => void navigator.clipboard.writeText(promptOf(project)).then(() => message.success("已复制提示词"))}
                                    />
                                </div>
                                <div className="mt-1 text-xs text-stone-400">这就是发给生图模型的完整提示词；画风、比例、诗句改了会自动更新。</div>
                            </div>
                            <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!(project.lines || project.poem.content).trim() || writing} onClick={() => void draw(2)} data-testid="poem-generate">
                                生成 2 张
                            </Button>
                            <div className="rounded-lg border border-dashed border-stone-200 p-3 dark:border-stone-700">
                                <button type="button" className="flex w-full items-center gap-1.5 text-left text-sm text-stone-600 dark:text-stone-300" onClick={() => setSceneOpen((v) => !v)} data-testid="poem-scene-toggle">
                                    <ChevronDown className={`size-4 transition ${sceneOpen || project.scene ? "" : "-rotate-90"}`} />
                                    AI 画面描述（可选）
                                    <span className="text-xs text-stone-400">优先级最低：写了会加在提示词最后作参考</span>
                                </button>
                                {sceneOpen || project.scene ? (
                                    <div className="mt-2 space-y-2">
                                        <Button size="small" icon={writing ? <LoaderCircle className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />} disabled={writing} onClick={() => void writeScene()} data-testid="poem-write-scene">
                                            {project.scene ? "AI 重写" : "AI 写画面"}
                                        </Button>
                                        <Input.TextArea value={project.scene} onChange={(event) => patch((p) => ({ ...p, scene: event.target.value }))} autoSize={{ minRows: 3, maxRows: 8 }} placeholder={writing ? "AI 正在读诗…" : "可以留空。想补充画面细节时写在这里：季节、时辰、人物、景物……"} data-testid="poem-scene-text" />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}

                {step === "draw" ? (
                    <div className="mt-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-stone-500">挑一张满意的，下一步把诗写上去</span>
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} disabled={drawing > 0} onClick={() => void draw(2)}>
                                再画 2 张
                            </Button>
                            <Button size="small" type="text" onClick={() => setStep("scene")}>
                                改画面再画
                            </Button>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {Array.from({ length: drawing }, (_, i) => (
                                <div key={`pending-${i}`} className="flex aspect-[2/3] items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400 dark:bg-stone-800">
                                    <LoaderCircle className="mr-1.5 size-4 animate-spin" /> 正在画，约 1–2 分钟
                                </div>
                            ))}
                            {project.drawings.map((d) => (
                                <div key={d.id} className={`overflow-hidden rounded-xl border ${project.chosen === d.id ? "border-(--skin-accent) ring-2 ring-(--skin-accent)/40" : "border-stone-200 dark:border-stone-700"}`}>
                                    <PoemImageView image={d.image} className="block w-full" />
                                    <div className="flex items-center justify-between p-2">
                                        <Button
                                            size="small"
                                            type={project.chosen === d.id ? "primary" : "default"}
                                            icon={<Check className="size-3.5" />}
                                            onClick={() => {
                                                patch((p) => ({ ...p, chosen: d.id, layers: undefined, poster: undefined }));
                                                setStep("letter");
                                            }}
                                            data-testid={`poem-choose-${d.id}`}
                                        >
                                            {project.chosen === d.id ? "已选，去配诗" : "选这张"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {step === "letter" && chosen ? <PoemLetter project={project} drawing={chosen.image} patch={patch} /> : null}
                <TemplateEditor
                    template={templateEdit}
                    onClose={() => setTemplateEdit(null)}
                    onSaved={async (saved) => {
                        await reloadTemplates();
                        patch((p) => ({ ...p, templateId: saved.id }));
                        setTemplateEdit(null);
                    }}
                    onDeleted={async () => {
                        await reloadTemplates();
                        patch((p) => ({ ...p, templateId: DEFAULT_TEMPLATE_ID }));
                        setTemplateEdit(null);
                    }}
                />
            </div>
        </div>
    );
}

/** Edits a prompt template. The built-in default can't be changed; saving it makes a copy (我的模板). */
function TemplateEditor({ template, onClose, onSaved, onDeleted }: { template: PoemTemplate | null; onClose: () => void; onSaved: (t: PoemTemplate) => void; onDeleted: () => void }) {
    const { message } = App.useApp();
    const [name, setName] = useState("");
    const [text, setText] = useState("");
    const areaRef = useRef<HTMLTextAreaElement | null>(null);
    const isDefault = template?.id === DEFAULT_TEMPLATE_ID;
    useEffect(() => {
        if (!template) return;
        setName(isDefault ? "我的模板" : template.name);
        setText(template.text);
    }, [isDefault, template]);

    const insert = (key: string) => {
        const el = areaRef.current;
        const token = `{${key}}`;
        if (!el) return setText((t) => t + token);
        const start = el.selectionStart ?? text.length;
        const end = el.selectionEnd ?? text.length;
        setText(text.slice(0, start) + token + text.slice(end));
        window.setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const save = async (asNew: boolean) => {
        if (!text.trim()) return message.warning("模板不能是空的");
        const saved: PoemTemplate = { id: asNew || isDefault || !template ? nanoid() : template.id, name: name.trim() || "我的模板", text };
        await saveTemplate(saved);
        message.success("模板已保存");
        onSaved(saved);
    };

    return (
        <Modal
            open={Boolean(template)}
            title={isDefault ? "改成我的模板" : "编辑模板"}
            width={760}
            onCancel={onClose}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    {!isDefault && template ? (
                        <Popconfirm title="删除这个模板？" okText="删除" cancelText="取消" onConfirm={() => void deleteTemplate(template.id).then(onDeleted)}>
                            <Button danger className="mr-auto">
                                删除
                            </Button>
                        </Popconfirm>
                    ) : null}
                    <Button onClick={onClose}>取消</Button>
                    {!isDefault ? <Button onClick={() => void save(true)}>另存为新模板</Button> : null}
                    <Button type="primary" onClick={() => void save(false)} data-testid="poem-template-save">
                        {isDefault ? "保存为我的模板" : "保存"}
                    </Button>
                </div>
            }
        >
            <div className="space-y-3">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="模板名称" maxLength={20} />
                <div className="flex flex-wrap gap-1.5">
                    {POEM_TEMPLATE_VARS.map((v) => (
                        <button key={v.key} type="button" title={v.desc} onClick={() => insert(v.key)} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-stone-600 hover:bg-black/10 dark:bg-white/10 dark:text-stone-300">
                            {`{${v.key}}`}
                        </button>
                    ))}
                </div>
                <textarea
                    ref={areaRef}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    rows={14}
                    className="w-full rounded-lg border border-stone-200 bg-transparent p-3 font-mono text-xs leading-relaxed outline-none focus:border-(--skin-accent) dark:border-stone-700"
                    data-testid="poem-template-text"
                />
                <p className="text-xs leading-relaxed text-stone-400">
                    点上面的变量插入到光标处，生成时会替换成实际内容。{"{篇名} {诗句}"} 是诗本身；{"{画风}"} 来自所选画风卡片；{"{画面描述}"} 是可选的 AI 描述（没写就去掉那一行；模板里没放它时会加在最后）。想让模型把诗写在画上，把「不要出现任何文字」那一句改掉就行，但模型可能写错字。
                </p>
            </div>
        </Modal>
    );
}

/** Luminance grid of a w×h downscale of the picture. */
function grayGrid(img: HTMLImageElement, w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return gray;
}

function loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片加载失败"));
        img.src = url;
    });
}

/** The chosen picture with the poem set on it, at full size (for saving). */
async function renderPoster(img: HTMLImageElement, layers: TextLayer[]) {
    await ensureLayerFonts(layers);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0);
    drawTextLayers(ctx, layers, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

function PoemLetter({ project, drawing, patch }: { project: PoemProject; drawing: PoemImage; patch: (change: (current: PoemProject) => PoemProject) => void }) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const { save, overlay } = useSaveImage();
    const url = useImageUrl(drawing);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [place, setPlace] = useState<Place>("auto");
    const [ink, setInk] = useState<PoemInk | "auto">("auto");
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const posterUrl = useImageUrl(project.poster);

    useEffect(() => {
        if (!url) return;
        let alive = true;
        void loadImage(url).then((el) => alive && setImg(el)).catch(() => message.error("图片加载失败"));
        return () => {
            alive = false;
        };
    }, [message, url]);

    // Where the poem goes and in which ink: the blank area the prompt left (or a chosen place), dark ink on light ground.
    const auto = useMemo(() => {
        if (!img) return null;
        const gw = 96;
        const gh = Math.round((96 * img.naturalHeight) / img.naturalWidth);
        const gray = grayGrid(img, gw, gh);
        if (!gray) return null;
        const found = calmBox(gray, gw, gh, blankHint(project.ratio));
        const box = found || (project.ratio === "3:2" ? PLACE_BOXES.left : PLACE_BOXES.topRight);
        return { box, gray, gw, gh };
    }, [img, project.ratio]);

    const layers = useMemo(() => {
        if (!img || !auto) return [];
        const box = place === "auto" ? auto.box : PLACE_BOXES[place];
        let tone: PoemInk = "ink";
        if (ink !== "auto") tone = ink;
        else {
            let sum = 0;
            let n = 0;
            for (let y = Math.floor(box.y0 * auto.gh); y < Math.ceil(box.y1 * auto.gh); y++) {
                for (let x = Math.floor(box.x0 * auto.gw); x < Math.ceil(box.x1 * auto.gw); x++) {
                    sum += auto.gray[y * auto.gw + x] || 0;
                    n++;
                }
            }
            tone = n && sum / n < 135 ? "light" : "ink";
        }
        return poemLayers({
            title: project.poem.title,
            author: authorLine(project.poem),
            lines: project.lines || project.poem.content,
            box,
            aspect: img.naturalWidth / img.naturalHeight,
            font: project.font,
            titleFont: project.titleFont,
            ink: tone,
            seal: project.seal,
        });
    }, [auto, img, ink, place, project.font, project.lines, project.poem, project.seal, project.titleFont]);

    // Preview: the picture at ~900 px with the layers drawn on it.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !img) return;
        let alive = true;
        const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const paint = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx || !alive) return;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            drawTextLayers(ctx, layers, canvas.width, canvas.height);
        };
        paint();
        void ensureLayerFonts(layers).then(paint);
        return () => {
            alive = false;
        };
    }, [img, layers]);

    const storePoster = async (dataUrl: string) => {
        const stored = await uploadImage(dataUrl);
        const poster: PoemImage = { url: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), width: stored.width, height: stored.height, mimeType: stored.mimeType };
        patch((p) => ({ ...p, poster, layers }));
        return { stored, poster };
    };

    /** The finished poster: the one saved from the editor, else the picture with the current layers. */
    const posterDataUrl = async () => {
        if (project.poster && posterUrl) return posterUrl;
        if (!img) throw new Error("图片还没加载好");
        const dataUrl = await renderPoster(img, layers);
        await storePoster(dataUrl);
        return dataUrl;
    };

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        try {
            await task();
        } catch (error) {
            message.error(errorText(error, "操作失败，请重试"));
        } finally {
            setBusy(false);
        }
    };

    const saveFile = () =>
        run(async () => {
            const dataUrl = await posterDataUrl();
            await save({ dataUrl, width: img?.naturalWidth || 0, height: img?.naturalHeight || 0, mimeType: "image/png" }, `${project.poem.title}-诗画`);
        });

    const toAssets = () =>
        run(async () => {
            const dataUrl = await posterDataUrl();
            const stored = await uploadImage(dataUrl);
            addAsset({
                kind: "image",
                title: `${project.poem.title} · 诗画`,
                coverUrl: stored.url,
                tags: ["诗画"],
                source: "诗画",
                data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
                metadata: { source: "poem", prompt: project.drawings.find((d) => d.id === project.chosen)?.prompt || "" },
            });
            message.success("已存到我的资产");
        });

    const publish = () =>
        run(async () => {
            const dataUrl = await posterDataUrl();
            usePublishWorkStore.getState().open({
                images: [dataUrl],
                prompt: project.drawings.find((d) => d.id === project.chosen)?.prompt || "",
                title: `${project.poem.title}（${authorLine(project.poem)}）`,
                source: "image_workbench",
            });
        });

    const fontOptions = LETTER_FONTS.filter((id) => TEXT_FONTS.some((f) => f.id === id)).map((id) => ({ value: id, label: FONT_NAMES[id] || id }));

    return (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="flex justify-center rounded-xl bg-stone-100 p-3 dark:bg-stone-800/60">
                {project.poster && posterUrl ? (
                    <img src={posterUrl} alt="" className="max-h-[78vh] max-w-full rounded shadow-sm" data-testid="poem-poster" />
                ) : img ? (
                    <canvas ref={canvasRef} className="max-h-[78vh] max-w-full rounded shadow-sm" data-testid="poem-preview" />
                ) : (
                    <Spin className="my-20" />
                )}
            </div>
            <div className="space-y-4">
                {project.poster ? (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        这是在编辑器里调整过的成品。
                        <button type="button" className="ml-1 underline" onClick={() => patch((p) => ({ ...p, poster: undefined }))}>
                            重新自动排版
                        </button>
                    </div>
                ) : (
                    <>
                        <label className="block text-xs text-stone-500">
                            正文字体
                            <Select className="mt-1 w-full" value={project.font} onChange={(value) => patch((p) => ({ ...p, font: value }))} options={fontOptions} data-testid="poem-font" />
                        </label>
                        <label className="block text-xs text-stone-500">
                            标题字体
                            <Select className="mt-1 w-full" value={project.titleFont} onChange={(value) => patch((p) => ({ ...p, titleFont: value }))} options={fontOptions} />
                        </label>
                        <div className="text-xs text-stone-500">
                            位置
                            <div className="mt-1">
                                <Segmented size="small" value={place} onChange={(value) => setPlace(value as Place)} options={PLACES.map((p) => ({ value: p, label: PLACE_NAMES[p] }))} />
                            </div>
                        </div>
                        <div className="text-xs text-stone-500">
                            字色
                            <div className="mt-1">
                                <Segmented
                                    size="small"
                                    value={ink}
                                    onChange={(value) => setInk(value as PoemInk | "auto")}
                                    options={[
                                        { value: "auto", label: "自动" },
                                        { value: "ink", label: "墨色" },
                                        { value: "light", label: "浅色" },
                                    ]}
                                />
                            </div>
                        </div>
                        <label className="block text-xs text-stone-500">
                            印章（1–4 个字，留空不加）
                            <Input className="mt-1" maxLength={4} value={project.seal} onChange={(event) => patch((p) => ({ ...p, seal: event.target.value }))} />
                        </label>
                        <Button block icon={<PenLine className="size-4" />} onClick={() => setEditing(true)} disabled={!url} data-testid="poem-edit">
                            在编辑器里细调（拖动、改字号、加字）
                        </Button>
                    </>
                )}
                <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-700">
                    <Button type="primary" block loading={busy} onClick={() => void saveFile()} data-testid="poem-save">
                        保存图片
                    </Button>
                    <Button block disabled={busy} onClick={() => void toAssets()}>
                        存到我的资产
                    </Button>
                    <Button block disabled={busy} icon={<Send className="size-4" />} onClick={() => void publish()}>
                        发布到社区
                    </Button>
                </div>
                <p className="text-xs leading-relaxed text-stone-400">诗句由程序用书法字体写上去，不会写错字；诗文来自开源古诗词语料，个别字可能与课本不同，可以在「画面」一步改。</p>
            </div>
            {url ? (
                <ImageEditorDialog
                    open={editing}
                    src={url}
                    initialLayers={layers}
                    initialTab="text"
                    onClose={() => setEditing(false)}
                    onSave={async (result) => {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = () => reject(new Error("read"));
                            reader.readAsDataURL(result.blob);
                        });
                        await storePoster(dataUrl);
                        setEditing(false);
                        message.success("已保存调整");
                    }}
                />
            ) : null}
            {overlay}
        </div>
    );
}
