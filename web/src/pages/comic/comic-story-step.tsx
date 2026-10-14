import { useState } from "react";
import { Button, Input, Select, Tooltip } from "antd";
import { ArrowDown, ArrowUp, Lightbulb, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BEAT_TIPS, SHOTS, type ComicLine, type ComicLineKind, type ComicPanel, type ComicProject } from "@/lib/comic";

export const BEAT_COLORS: Record<string, string> = {
    起: "bg-blue-600",
    承: "bg-green-600",
    转: "bg-orange-600",
    合: "bg-purple-600",
    提问: "bg-blue-600",
    解释: "bg-green-600",
    举例: "bg-orange-600",
    总结: "bg-purple-600",
    痛点: "bg-blue-600",
    转机: "bg-green-600",
    产品: "bg-orange-600",
    结果: "bg-purple-600",
    封面: "bg-rose-600",
    交代: "bg-blue-600",
    发展: "bg-green-600",
    转折: "bg-orange-600",
    高潮: "bg-purple-600",
    反转: "bg-pink-600",
    结局: "bg-indigo-600",
    互动: "bg-teal-600",
};

const SLIDE_GUIDE = ["封面", "交代", "发展", "转折", "反转", "互动"];

export function BeatTag({ beat }: { beat: string }) {
    if (!beat) return null;
    return <span className={`inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold text-white ${BEAT_COLORS[beat] || "bg-stone-500"}`}>{beat}</span>;
}

const KINDS: ComicLineKind[] = ["speech", "thought", "shout", "narration"];

/** Step 1: the panels the text model wrote, every field editable, with one-tap rewrites on the side. */
export function ComicStoryStep({
    project,
    busy,
    onChange,
    onRewrite,
    onCoverTitle,
    onInsert,
    inserting,
}: {
    project: ComicProject;
    busy: boolean;
    onChange: (panels: ComicPanel[]) => void;
    onRewrite: (change: string, panelCount?: number) => void;
    /** 小红书多图 only. */
    onCoverTitle?: (title: string) => void;
    onInsert?: (afterIndex: number) => void;
    inserting?: number | null;
}) {
    const { t } = useTranslation();
    const slides = project.format === "slides";
    const count = project.panels.length;
    const move = (index: number, by: number) => {
        const next = [...project.panels];
        const [item] = next.splice(index, 1);
        next.splice(index + by, 0, item);
        onChange(next);
    };
    const [ask, setAsk] = useState("");
    const names = project.characters.map((character) => character.name);
    const quick = t("comic.story.quick", { returnObjects: true }) as string[];

    const setPanel = (index: number, next: Partial<ComicPanel>) => onChange(project.panels.map((panel, i) => (i === index ? { ...panel, ...next } : panel)));
    const setLine = (index: number, lineIndex: number, next: Partial<ComicLine>) => setPanel(index, { lines: project.panels[index].lines.map((line, i) => (i === lineIndex ? { ...line, ...next } : line)) });

    return (
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                    <b className="text-stone-900 dark:text-stone-100">{t("comic.story.idea")}</b>
                    {project.idea}
                    <div className="mt-1 text-xs text-stone-400">{t("comic.story.editHint")}</div>
                </div>
                <div className={`grid gap-3 ${project.panels.length > 4 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"} ${busy ? "pointer-events-none opacity-50" : ""}`}>
                    {project.panels.map((panel, index) => (
                        <div key={panel.id} className="flex flex-col gap-2.5 rounded-xl border border-stone-200 bg-white p-3.5 dark:border-stone-700 dark:bg-stone-900" data-testid="comic-panel-card">
                            <div className="flex items-center gap-2">
                                <BeatTag beat={panel.beat} />
                                <b className="text-sm text-stone-900 dark:text-stone-100">{slides ? t("comic.slides.slideN", { n: index + 1 }) : t("comic.panelN", { n: index + 1 })}</b>
                                <span className="flex-1" />
                                {slides ? (
                                    <>
                                        <Tooltip title={t("comic.slides.moveUp")}>
                                            <Button type="text" size="small" disabled={index === 0} icon={<ArrowUp className="size-3.5" />} onClick={() => move(index, -1)} />
                                        </Tooltip>
                                        <Tooltip title={t("comic.slides.moveDown")}>
                                            <Button type="text" size="small" disabled={index === count - 1} icon={<ArrowDown className="size-3.5" />} onClick={() => move(index, 1)} />
                                        </Tooltip>
                                        <Tooltip title={t("comic.slides.remove")}>
                                            <Button type="text" size="small" disabled={count <= 3} icon={<Trash2 className="size-3.5" />} onClick={() => onChange(project.panels.filter((_, i) => i !== index))} />
                                        </Tooltip>
                                    </>
                                ) : null}
                                <Tooltip title={t("comic.story.rewritePanel")}>
                                    <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => onRewrite(t(slides ? "comic.slides.rewriteAsk" : "comic.story.rewritePanelAsk", { n: index + 1 }))} />
                                </Tooltip>
                            </div>
                            {slides && panel.beat === "封面" ? (
                                <Field label={t("comic.slides.coverTitle")}>
                                    <div className="flex flex-col gap-1.5">
                                        {(project.coverTitles || []).map((title) => (
                                            <button
                                                key={title}
                                                type="button"
                                                onClick={() => onCoverTitle?.(title)}
                                                className={`rounded-lg border px-2.5 py-1.5 text-left text-sm font-semibold ${title === project.coverTitle ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"}`}
                                            >
                                                {title}
                                            </button>
                                        ))}
                                        <Input size="small" value={project.coverTitle || ""} onChange={(event) => onCoverTitle?.(event.target.value.slice(0, 30))} placeholder={t("comic.slides.coverTitlePlaceholder")} />
                                    </div>
                                </Field>
                            ) : null}
                            {BEAT_TIPS[panel.beat] ? (
                                <div className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs leading-5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                    <b className="text-stone-800 dark:text-stone-100">{panel.beat}：</b>
                                    {BEAT_TIPS[panel.beat]}
                                </div>
                            ) : null}
                            <Field label={t("comic.story.action")}>
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={panel.action} onChange={(event) => setPanel(index, { action: event.target.value })} />
                            </Field>
                            <Field label={t("comic.story.place")}>
                                <Input value={panel.place} onChange={(event) => setPanel(index, { place: event.target.value })} />
                            </Field>
                            <Field label={t("comic.story.lines")}>
                                <div className="flex flex-col gap-1.5">
                                    {panel.lines.map((line, lineIndex) => (
                                        <div key={lineIndex} className="flex items-start gap-1">
                                            <Select
                                                size="small"
                                                value={line.speaker}
                                                className="w-20 shrink-0"
                                                popupMatchSelectWidth={false}
                                                onChange={(value) => setLine(index, lineIndex, { speaker: value, kind: value === "旁白" ? "narration" : line.kind === "narration" ? "speech" : line.kind })}
                                                options={[...names, "旁白"].map((name) => ({ value: name, label: name }))}
                                            />
                                            <Input.TextArea
                                                autoSize={{ minRows: 1, maxRows: 3 }}
                                                value={line.text}
                                                onChange={(event) => setLine(index, lineIndex, { text: event.target.value.slice(0, 40) })}
                                                className="!bg-amber-50 dark:!bg-amber-950/30"
                                            />
                                            <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => setPanel(index, { lines: panel.lines.filter((_, i) => i !== lineIndex) })} aria-label={t("common.delete")} />
                                        </div>
                                    ))}
                                    {panel.lines.length < 3 ? (
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 self-start text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
                                            onClick={() => setPanel(index, { lines: [...panel.lines, { speaker: names[0] || "旁白", text: "", kind: names.length ? "speech" : "narration" }] })}
                                        >
                                            <Plus className="size-3" />
                                            {t("comic.story.addLine")}
                                        </button>
                                    ) : null}
                                    {panel.lines.some((line) => line.text.length > 14) ? <span className="text-[11px] text-amber-600">{t("comic.story.lineTooLong")}</span> : null}
                                </div>
                            </Field>
                            <Field label={t("comic.story.shot")}>
                                <div className="flex flex-wrap gap-1">
                                    {SHOTS.map((shot) => (
                                        <button
                                            key={shot}
                                            type="button"
                                            onClick={() => setPanel(index, { shot })}
                                            className={`rounded-md border px-2 py-0.5 text-xs ${panel.shot === shot ? "border-(--skin-accent) bg-(--skin-accent)/10 text-stone-900 dark:text-stone-100" : "border-stone-200 text-stone-500 dark:border-stone-700"}`}
                                        >
                                            {shot}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            {slides && panel.beat !== "封面" ? (
                                <Field label={panel.beat === "互动" ? t("comic.slides.question") : t("comic.slides.caption")}>
                                    <Input value={panel.caption || ""} onChange={(event) => setPanel(index, { caption: event.target.value.slice(0, 40) })} placeholder={t("comic.slides.captionPlaceholder")} />
                                </Field>
                            ) : null}
                            {slides && panel.hook ? (
                                <div className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs leading-5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                                    ↪ <b>{t("comic.slides.hook")}</b>
                                    {panel.hook}
                                </div>
                            ) : null}
                            {names.length ? (
                                <Field label={t("comic.story.cast")}>
                                    <Select mode="multiple" size="small" value={panel.characters} onChange={(value) => setPanel(index, { characters: value })} options={names.map((name) => ({ value: name, label: name }))} className="w-full" />
                                </Field>
                            ) : null}
                            {slides && index < count - 1 && count < 18 ? (
                                <Button
                                    size="small"
                                    type="dashed"
                                    className="mt-auto"
                                    icon={inserting === index ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                                    disabled={inserting !== null && inserting !== undefined}
                                    onClick={() => onInsert?.(index)}
                                >
                                    {t("comic.slides.insertAfter")}
                                </Button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>

            <aside className="w-full shrink-0 overflow-y-auto border-t border-stone-200 bg-white p-4 lg:w-80 lg:border-l lg:border-t-0 dark:border-stone-800 dark:bg-stone-950">
                <h3 className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.story.quickTitle")}</h3>
                <div className="flex flex-wrap gap-1.5">
                    {quick.map((item) => (
                        <Button key={item} size="small" disabled={busy} onClick={() => onRewrite(item)}>
                            {item}
                        </Button>
                    ))}
                    {slides ? (
                        <>
                            <Button size="small" disabled={busy || count <= 3} onClick={() => onRewrite(t("comic.slides.shorterAsk", { count: Math.max(3, count - 2) }), Math.max(3, count - 2))}>
                                {t("comic.slides.shorter", { count: Math.max(3, count - 2) })}
                            </Button>
                            <Button size="small" disabled={busy || count >= 18} onClick={() => onRewrite(t("comic.slides.longerAsk", { count: Math.min(18, count + 2) }), Math.min(18, count + 2))}>
                                {t("comic.slides.longer", { count: Math.min(18, count + 2) })}
                            </Button>
                        </>
                    ) : (
                        <Button size="small" disabled={busy} onClick={() => onRewrite(t("comic.story.toCount", { count: project.panels.length > 4 ? 4 : 6 }), project.panels.length > 4 ? 4 : 6)}>
                            {t("comic.story.toCount", { count: project.panels.length > 4 ? 4 : 6 })}
                        </Button>
                    )}
                </div>
                <div className="mt-2 flex gap-1.5">
                    <Input size="small" value={ask} onChange={(event) => setAsk(event.target.value)} placeholder={t("comic.story.askPlaceholder")} onPressEnter={() => ask.trim() && onRewrite(ask)} />
                    <Button size="small" type="primary" disabled={busy || !ask.trim()} icon={busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} onClick={() => onRewrite(ask)} />
                </div>
                {busy ? <div className="mt-2 text-xs text-stone-400">{t("comic.story.rewriting")}</div> : null}

                <h3 className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <Lightbulb className="size-4 text-(--skin-accent)" />
                    {slides ? t("comic.slides.guideTitle") : t("comic.story.guideTitle")}
                </h3>
                <div className="space-y-1.5 rounded-xl bg-(--skin-accent)/5 p-3 text-xs leading-5 text-stone-600 dark:text-stone-300">
                    {(slides ? SLIDE_GUIDE : ["起", "承", "转", "合"]).map((beat) => (
                        <div key={beat} className="flex items-start gap-2">
                            <BeatTag beat={beat} />
                            <span>{slides ? BEAT_TIPS[beat] : t(`comic.story.guide.${beat}`)}</span>
                        </div>
                    ))}
                    <div className="pt-1">{slides ? t("comic.slides.guideMore") : t("comic.story.guide.more")}</div>
                </div>

                {project.characters.length ? (
                    <>
                        <h3 className="mb-2 mt-6 text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.story.foundCast")}</h3>
                        <ul className="space-y-1.5 text-xs text-stone-600 dark:text-stone-300">
                            {project.characters.map((character) => (
                                <li key={character.id}>
                                    <b className="text-stone-900 dark:text-stone-100">{character.name}</b> · {character.role} — {character.look}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-1 text-[11px] text-stone-400">{t("comic.story.castNext")}</div>
                    </>
                ) : null}
            </aside>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1 text-[11px] text-stone-400">{label}</div>
            {children}
        </div>
    );
}

export const LINE_KINDS = KINDS;
