import { useRef } from "react";
import { Button, Input, Popconfirm, Tag } from "antd";
import { ImageUp, Lightbulb, LoaderCircle, Lock, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isImageFile } from "@/lib/image-tools";
import type { ComicCharacter, ComicProject } from "@/lib/comic";
import { ComicImageView } from "./comic-lettering";

/** Step 2: a design sheet per character; the chosen one is sent with every page so the cast stays the same. */
export function ComicCharactersStep({
    project,
    drawing,
    onChange,
    onDraw,
    onPhoto,
    onAdd,
    onRemove,
}: {
    project: ComicProject;
    drawing: Record<string, true>;
    onChange: (character: ComicCharacter) => void;
    onDraw: (character: ComicCharacter) => void;
    onPhoto: (character: ComicCharacter, file: File) => void;
    onAdd: () => void;
    onRemove: (character: ComicCharacter) => void;
}) {
    const { t } = useTranslation();
    const fileRef = useRef<HTMLInputElement>(null);
    const photoTarget = useRef<ComicCharacter | null>(null);

    return (
        <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">{t("comic.cast.title")}</h2>
                    <p className="mt-1 text-sm text-stone-500">{t("comic.cast.subtitle")}</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 dark:border-stone-700 dark:text-stone-300">
                    {t("comic.cast.style", { name: project.style.name })}
                    <Lock className="size-3" />
                </span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {project.characters.map((character) => {
                    const busy = Boolean(drawing[character.id]);
                    const sheet = character.sheet >= 0 ? character.sheets[character.sheet] : undefined;
                    return (
                        <div key={character.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900" data-testid="comic-character">
                            <div className="relative flex h-64 items-center justify-center bg-[#fbfaf6] dark:bg-stone-800">
                                {sheet ? (
                                    <ComicImageView image={sheet} className="absolute inset-0 size-full object-contain" />
                                ) : busy ? null : (
                                    <div className="px-6 text-center text-sm text-stone-500">
                                        {character.photo ? <ComicImageView image={character.photo} className="mx-auto mb-2 h-24 rounded-lg object-cover" /> : null}
                                        {t("comic.cast.noSheet")}
                                    </div>
                                )}
                                {busy ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-sm text-stone-600 dark:bg-stone-900/70 dark:text-stone-300">
                                        <LoaderCircle className="size-5 animate-spin text-(--skin-accent)" />
                                        {t("comic.cast.drawing")}
                                    </div>
                                ) : null}
                                {sheet ? (
                                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600/90 px-2 py-0.5 text-xs text-white">
                                        <Lock className="size-3" />
                                        {t("comic.cast.locked")}
                                    </span>
                                ) : null}
                                {character.sheets.length > 1 ? (
                                    <div className="absolute bottom-3 right-3 flex gap-1.5">
                                        {character.sheets.map((image, index) => (
                                            <button
                                                key={image.storageKey || image.url}
                                                type="button"
                                                onClick={() => onChange({ ...character, sheet: index })}
                                                className={`size-11 overflow-hidden rounded-lg border-2 shadow ${index === character.sheet ? "border-(--skin-accent)" : "border-white"}`}
                                                aria-label={t("comic.cast.pick", { n: index + 1 })}
                                            >
                                                <ComicImageView image={image} className="size-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div className="p-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <Input value={character.name} maxLength={12} onChange={(event) => onChange({ ...character, name: event.target.value })} className="!w-32 font-semibold" variant="borderless" />
                                    <Tag>{character.role || t("comic.cast.roleDefault")}</Tag>
                                    {character.photo ? (
                                        <Tag closable onClose={() => onChange({ ...character, photo: undefined })} closeIcon={<X className="size-3" />}>
                                            {t("comic.cast.fromPhoto")}
                                        </Tag>
                                    ) : null}
                                    <span className="flex-1" />
                                    <Popconfirm title={t("comic.cast.removeConfirm")} okText={t("common.delete")} cancelText={t("common.cancel")} onConfirm={() => onRemove(character)}>
                                        <Button type="text" size="small" icon={<Trash2 className="size-4" />} aria-label={t("common.delete")} />
                                    </Popconfirm>
                                </div>
                                <div className="mb-1 text-[11px] text-stone-400">{t("comic.cast.lookLabel")}</div>
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={character.look} onChange={(event) => onChange({ ...character, look: event.target.value.slice(0, 160) })} placeholder={t("comic.cast.lookPlaceholder")} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        type={sheet ? "default" : "primary"}
                                        size="small"
                                        icon={sheet ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                                        disabled={busy || !character.look.trim()}
                                        onClick={() => onDraw(character)}
                                    >
                                        {sheet ? t("comic.cast.drawAgain") : t("comic.cast.draw")}
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<ImageUp className="size-3.5" />}
                                        disabled={busy}
                                        onClick={() => {
                                            photoTarget.current = character;
                                            fileRef.current?.click();
                                        }}
                                    >
                                        {t("comic.cast.photo")}
                                    </Button>
                                    {sheet ? (
                                        <Button size="small" type="text" disabled={busy} onClick={() => onChange({ ...character, sheet: -1 })}>
                                            {t("comic.cast.unlock")}
                                        </Button>
                                    ) : null}
                                </div>
                                <div className="mt-2 text-[11px] text-stone-400">{t("comic.cast.cost")}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {project.characters.length < 4 ? (
                <button
                    type="button"
                    onClick={onAdd}
                    className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-stone-300 text-sm text-stone-600 transition hover:border-stone-400 dark:border-stone-700 dark:text-stone-300"
                >
                    <Plus className="size-4" />
                    {t("comic.cast.add")}
                </button>
            ) : null}

            <div className="mt-4 flex gap-2 rounded-xl bg-teal-50 p-3 text-xs leading-5 text-stone-600 dark:bg-teal-950/30 dark:text-stone-300">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-teal-600" />
                <span>
                    <b className="text-stone-900 dark:text-stone-100">{t("comic.cast.whyTitle")}</b>
                    {t("comic.cast.why")}
                </span>
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = Array.from(event.target.files || []).find(isImageFile);
                    event.target.value = "";
                    if (file && photoTarget.current) onPhoto(photoTarget.current, file);
                }}
            />
        </div>
    );
}
