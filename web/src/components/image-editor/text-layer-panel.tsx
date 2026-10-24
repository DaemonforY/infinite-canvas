import { useEffect } from "react";
import { Button, ColorPicker, Input, InputNumber, Segmented, Select, Slider } from "antd";
import { Brush, Plus, ScrollText, Stamp, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { createSealLayer, createTextLayer, fontFamilyOf, loadFontsCss, poemTemplate, TEXT_FONTS, type TextLayer } from "@/lib/image-editor/text-layers";

const COLOR_SWATCHES = ["#ffffff", "#f4ecd8", "#1c1917", "#b3302a", "#d4a64a", "#1e3a5f", "#2f6b4f"];

function Row({ label, value, children }: { label: string; value?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
                <span>{label}</span>
                {value !== undefined ? <span className="tabular-nums">{value}</span> : null}
            </div>
            {children}
        </div>
    );
}

function Swatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {COLOR_SWATCHES.map((color) => (
                <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => onChange(color)}
                    className={`size-6 rounded-full border ${value.toLowerCase() === color ? "ring-2 ring-[var(--primary)] ring-offset-1" : "border-stone-300 dark:border-stone-600"}`}
                    style={{ background: color }}
                />
            ))}
            <ColorPicker size="small" value={value} onChangeComplete={(c) => onChange(c.toHexString())} />
        </div>
    );
}

/**
 * Controls for the image editor's 「文字」 tab: add text / seal layers or a 古诗词 template, pick a layer,
 * and edit its content, direction, font, size, colour, spacing and effect. Layers are dragged on the preview.
 */
export function TextLayerPanel({
    layers,
    selectedId,
    onLayersChange,
    onSelect,
    onEraseText,
}: {
    layers: TextLayer[];
    selectedId: string;
    onLayersChange: (layers: TextLayer[]) => void;
    onSelect: (id: string) => void;
    /** Opens the mask editor so wrong text in the picture can be painted over and erased first. */
    onEraseText?: () => void;
}) {
    const { t } = useTranslation();
    const selected = layers.find((l) => l.id === selectedId) || null;

    // Load the @font-face rules once so the font menu shows each face in its own style.
    useEffect(() => void loadFontsCss(), []);

    const add = (layer: TextLayer) => {
        onLayersChange([...layers, layer]);
        onSelect(layer.id);
    };
    const update = (patch: Partial<TextLayer>) => {
        if (!selected) return;
        onLayersChange(layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)));
    };
    const remove = (id: string) => {
        const next = layers.filter((l) => l.id !== id);
        onLayersChange(next);
        onSelect(next.length ? next[next.length - 1].id : "");
    };
    const addTemplate = () => {
        const added = poemTemplate(t("imageEditor.text.templateTitle"), t("imageEditor.text.templateBody"), t("imageEditor.text.templateAuthor"));
        onLayersChange([...layers, ...added]);
        onSelect(added[1].id);
    };

    const fontOptions = TEXT_FONTS.map((font) => ({
        value: font.id,
        label: <span style={{ fontFamily: fontFamilyOf(font.id), fontSize: 16 }}>{t(`imageEditor.text.fonts.${font.id}`)}</span>,
    }));

    return (
        <div className="space-y-3" data-testid="image-editor-text">
            <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{t("imageEditor.text.hint")}</p>
            {onEraseText && layers.length === 0 ? (
                <Button block size="small" icon={<Brush className="size-3.5" />} onClick={onEraseText}>
                    {t("imageEditor.text.eraseFirst")}
                </Button>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
                <Button icon={<Plus className="size-4" />} onClick={() => add(createTextLayer({ text: t("imageEditor.text.newText") }))} data-testid="text-add">
                    {t("imageEditor.text.addText")}
                </Button>
                <Button icon={<Stamp className="size-4" />} onClick={() => add(createSealLayer({ text: t("imageEditor.text.newSeal") }))}>
                    {t("imageEditor.text.addSeal")}
                </Button>
                <Button icon={<ScrollText className="size-4" />} onClick={addTemplate}>
                    {t("imageEditor.text.addPoem")}
                </Button>
            </div>

            {layers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {layers.map((layer) => (
                        <button
                            key={layer.id}
                            type="button"
                            onClick={() => onSelect(layer.id)}
                            className={`max-w-[9rem] truncate rounded-full border px-2.5 py-0.5 text-xs ${layer.id === selectedId ? "border-[var(--primary)] text-[var(--primary)]" : "border-stone-200 dark:border-stone-700"}`}
                        >
                            {layer.kind === "seal" ? "印 · " : ""}
                            {layer.text.trim().replace(/\s+/g, " ").slice(0, 10) || t("imageEditor.text.empty")}
                        </button>
                    ))}
                </div>
            ) : null}

            {selected ? (
                <div className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    {selected.kind === "seal" ? (
                        <Input value={selected.text} maxLength={4} onChange={(e) => update({ text: e.target.value })} placeholder={t("imageEditor.text.sealPlaceholder")} />
                    ) : (
                        <Input.TextArea value={selected.text} autoSize={{ minRows: 2, maxRows: 8 }} maxLength={2000} onChange={(e) => update({ text: e.target.value })} placeholder={t("imageEditor.text.placeholder")} data-testid="text-content" />
                    )}

                    <div>
                        {selected.kind === "text" ? (
                            <Segmented
                                block
                                size="small"
                                value={selected.vertical ? "v" : "h"}
                                onChange={(v) => update({ vertical: v === "v" })}
                                options={[
                                    { label: t("imageEditor.text.horizontal"), value: "h" },
                                    { label: t("imageEditor.text.vertical"), value: "v" },
                                ]}
                            />
                        ) : (
                            <Segmented
                                block
                                size="small"
                                value={selected.sealStyle}
                                onChange={(v) => update({ sealStyle: v as TextLayer["sealStyle"] })}
                                options={[
                                    { label: t("imageEditor.text.sealWhite"), value: "white" },
                                    { label: t("imageEditor.text.sealRed"), value: "red" },
                                ]}
                            />
                        )}
                    </div>

                    <Row label={t("imageEditor.text.font")}>
                        <Select className="w-full" value={selected.font} options={fontOptions} onChange={(font) => update({ font })} />
                    </Row>

                    <Row label={t("imageEditor.text.size")} value={Math.round(selected.size * 1000) / 10}>
                        <Slider min={0.01} max={0.25} step={0.002} value={selected.size} onChange={(size) => update({ size })} tooltip={{ open: false }} />
                    </Row>

                    {selected.kind === "text" || selected.sealStyle === "white" ? (
                        <Row label={t("imageEditor.text.color")}>
                            <Swatches value={selected.color} onChange={(color) => update({ color })} />
                        </Row>
                    ) : null}

                    {selected.kind === "text" ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Row label={t("imageEditor.text.letterSpacing")}>
                                    <Slider min={0} max={1} step={0.02} value={selected.letterSpacing} onChange={(letterSpacing) => update({ letterSpacing })} tooltip={{ open: false }} />
                                </Row>
                                <Row label={t("imageEditor.text.lineSpacing")}>
                                    <Slider min={0} max={2} step={0.05} value={selected.lineSpacing} onChange={(lineSpacing) => update({ lineSpacing })} tooltip={{ open: false }} />
                                </Row>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Row label={t(selected.vertical ? "imageEditor.text.wrapAtColumn" : "imageEditor.text.wrapAtLine")}>
                                    <InputNumber size="small" className="w-full" min={0} max={200} value={selected.wrapAt} onChange={(v) => update({ wrapAt: Number(v) || 0 })} placeholder="0" />
                                </Row>
                                <Row label={t("imageEditor.text.align")}>
                                    <Segmented
                                        size="small"
                                        value={selected.align}
                                        onChange={(align) => update({ align: align as TextLayer["align"] })}
                                        options={[
                                            { label: t("imageEditor.text.alignStart"), value: "start" },
                                            { label: t("imageEditor.text.alignCenter"), value: "center" },
                                            { label: t("imageEditor.text.alignEnd"), value: "end" },
                                        ]}
                                    />
                                </Row>
                            </div>
                            <Row label={t("imageEditor.text.effect")}>
                                <Segmented
                                    block
                                    size="small"
                                    value={selected.effect}
                                    onChange={(effect) => update({ effect: effect as TextLayer["effect"] })}
                                    options={[
                                        { label: t("imageEditor.text.effectNone"), value: "none" },
                                        { label: t("imageEditor.text.effectShadow"), value: "shadow" },
                                        { label: t("imageEditor.text.effectStroke"), value: "stroke" },
                                    ]}
                                />
                                {selected.effect !== "none" ? <Swatches value={selected.effectColor} onChange={(effectColor) => update({ effectColor })} /> : null}
                            </Row>
                            <Row label={t("imageEditor.text.opacity")} value={`${Math.round(selected.opacity * 100)}%`}>
                                <Slider min={0.1} max={1} step={0.05} value={selected.opacity} onChange={(opacity) => update({ opacity })} tooltip={{ open: false }} />
                            </Row>
                        </>
                    ) : null}

                    <Button block danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => remove(selected.id)}>
                        {t("imageEditor.text.remove")}
                    </Button>
                </div>
            ) : null}
            <p className="text-[11px] leading-4 text-stone-400">{t("imageEditor.text.fontLicense")}</p>
        </div>
    );
}
