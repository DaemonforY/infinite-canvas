import { Button, ColorPicker, Segmented, Select, Slider } from "antd";
import { useTranslation } from "react-i18next";

import type { CollageLayout, CollageOptions } from "@/lib/image-collage";

const EDGE_PRESETS = [720, 1080, 1440, 2048];

/** Layout, size, spacing and background of a collage. */
export function CollageOptionsForm({ value, onChange }: { value: CollageOptions; onChange: (value: CollageOptions) => void }) {
    const { t } = useTranslation();
    const transparent = value.background === "transparent";
    return (
        <div className="grid gap-4 text-sm">
            <div className="grid gap-1.5">
                <span className="font-medium">{t("toolbox.collage.layout")}</span>
                <Segmented
                    block
                    value={value.layout}
                    onChange={(layout) => onChange({ ...value, layout: layout as CollageLayout })}
                    options={(["vertical", "horizontal", "grid"] as const).map((layout) => ({ value: layout, label: t(`toolbox.collage.layouts.${layout}`) }))}
                />
            </div>
            {value.layout === "grid" ? (
                <div className="grid gap-1.5">
                    <span className="font-medium">{t("toolbox.collage.columns")}</span>
                    <Segmented block value={value.columns} onChange={(columns) => onChange({ ...value, columns: Number(columns) })} options={[2, 3, 4].map((columns) => ({ value: columns, label: String(columns) }))} />
                </div>
            ) : null}
            <div className="grid gap-1.5">
                <span className="font-medium">{value.layout === "horizontal" ? t("toolbox.collage.height") : t("toolbox.collage.width")}</span>
                <Select value={value.edge} onChange={(edge) => onChange({ ...value, edge })} options={EDGE_PRESETS.map((edge) => ({ value: edge, label: `${edge}px` }))} />
            </div>
            <div className="grid gap-1.5">
                <span className="font-medium">{t("toolbox.collage.gap", { value: value.gap })}</span>
                <Slider min={0} max={60} step={2} value={value.gap} onChange={(gap) => onChange({ ...value, gap })} />
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t("toolbox.collage.background")}</span>
                <div className="flex items-center gap-2">
                    <Button size="small" type={transparent ? "primary" : "default"} onClick={() => onChange({ ...value, background: transparent ? "#ffffff" : "transparent" })}>
                        {t("toolbox.ai.transparent")}
                    </Button>
                    <ColorPicker size="small" disabled={transparent} value={transparent ? "#ffffff" : value.background} onChangeComplete={(color) => onChange({ ...value, background: color.toHexString() })} />
                </div>
            </div>
            <p className="m-0 text-xs text-stone-500">{value.layout === "grid" ? t("toolbox.collage.gridHint") : t("toolbox.collage.orderHint")}</p>
        </div>
    );
}
