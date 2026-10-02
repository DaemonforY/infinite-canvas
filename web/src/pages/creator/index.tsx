import { useEffect, useState } from "react";
import { Button, Empty, Segmented, Spin, Tag } from "antd";
import { ArrowDown, ArrowUp, BarChart3, ImagePlus, LogIn, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { CREATOR_METRICS, labelIndexes, niceMax, periodChange, shortDay, type CreatorMetric } from "@/lib/creator-stats";
import { compactCount, getCreatorStats, mainSiteAsset, type CreatorStats } from "@/services/api/community";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";

const RANGES = [7, 30, 90];

/** 创作者数据: the signed-in author's views, likes, favorites, remixes and followers. */
export default function CreatorPage() {
    const { t } = useTranslation();
    const status = useMainAccountStore((state) => state.status);
    const profile = useCommunityMeStore((state) => state.profile);
    const { signIn } = useMainSiteSignIn();
    const openPublish = usePublishWorkStore((state) => state.open);
    const [days, setDays] = useState(30);
    const [stats, setStats] = useState<CreatorStats | null>(null);
    const [error, setError] = useState("");
    const [metric, setMetric] = useState<CreatorMetric>("views");

    useEffect(() => {
        document.title = t("creator.title");
    }, [t]);

    useEffect(() => {
        if (status !== "signedIn") return;
        const controller = new AbortController();
        setError("");
        getCreatorStats(days, controller.signal)
            .then(setStats)
            .catch((err: Error) => !controller.signal.aborted && setError(err.message));
        return () => controller.abort();
    }, [days, status]);

    if (status !== "signedIn") {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <Empty description={status === "unknown" ? <Spin /> : t("creator.signIn")}>
                    {status === "signedOut" ? (
                        <Button type="primary" icon={<LogIn className="size-4" />} onClick={signIn}>
                            {t("community.inspiration.signIn")}
                        </Button>
                    ) : null}
                </Empty>
            </div>
        );
    }

    const series = stats?.series || [];
    const values = series.map((d) => d[metric]);
    const max = niceMax(Math.max(0, ...values));
    const labels = new Set(labelIndexes(series.length));
    const trackedLate = metric === "views" || metric === "remixes" ? stats?.tracked_since && series[0] && stats.tracked_since > series[0].day : false;

    return (
        <div className="h-full overflow-y-auto bg-background px-3 py-6 text-stone-900 sm:px-6 dark:text-stone-100" data-testid="creator-page">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="m-0 flex items-center gap-2 text-2xl font-semibold tracking-tight">
                            <BarChart3 className="size-6 text-violet-500" />
                            {t("creator.title")}
                        </h1>
                        <p className="mt-1 text-sm text-stone-500">
                            {profile ? (
                                <Link to={`/u/${profile.handle}`} className="!text-stone-500 hover:underline">
                                    @{profile.handle}
                                </Link>
                            ) : null}
                            {profile ? " · " : ""}
                            {t("creator.description")}
                        </p>
                    </div>
                    <Segmented value={days} onChange={(v) => setDays(Number(v))} options={RANGES.map((d) => ({ value: d, label: t("creator.range", { days: d }) }))} />
                </div>

                {error ? (
                    <Empty description={error} />
                ) : !stats ? (
                    <div className="flex justify-center py-20">
                        <Spin />
                    </div>
                ) : stats.totals.works === 0 ? (
                    <Empty description={t("creator.noWorks")} className="py-16">
                        <Button type="primary" icon={<ImagePlus className="size-4" />} onClick={() => openPublish({ source: "canvas" })}>
                            {t("community.publish.action")}
                        </Button>
                    </Empty>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                            {CREATOR_METRICS.map((m) => (
                                <MetricCard key={m} label={t(`creator.metrics.${m}`)} value={stats.period[m]} previous={stats.previous[m]} total={stats.totals[m]} active={m === metric} onClick={() => setMetric(m)} />
                            ))}
                        </div>

                        <section className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="m-0 text-base font-semibold">{t("creator.trend", { metric: t(`creator.metrics.${metric}`), days })}</h2>
                                {trackedLate ? <span className="text-xs text-stone-500">{t("creator.trackedSince", { day: stats.tracked_since })}</span> : null}
                            </div>
                            <div className="flex h-48 items-end gap-[2px]" role="img" aria-label={t("creator.trend", { metric: t(`creator.metrics.${metric}`), days })}>
                                {series.map((d) => (
                                    <div key={d.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}：${d[metric]}`}>
                                        <div className="rounded-t bg-violet-500/80 transition group-hover:bg-violet-500" style={{ height: `${(d[metric] / max) * 100}%`, minHeight: d[metric] ? 2 : 0 }} />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-1 flex gap-[2px] text-[10px] text-stone-500">
                                {series.map((d, i) => (
                                    <span key={d.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                                        {labels.has(i) ? shortDay(d.day) : ""}
                                    </span>
                                ))}
                            </div>
                        </section>

                        <section>
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 className="m-0 text-base font-semibold">{t("creator.topWorks")}</h2>
                                <span className="text-xs text-stone-500">{t("creator.totals", { works: stats.totals.works, public: stats.totals.public_works })}</span>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead className="text-xs text-stone-500">
                                        <tr className="border-b border-stone-200 dark:border-stone-800">
                                            <th className="px-3 py-2 text-left font-medium">{t("creator.work")}</th>
                                            {(["views", "likes", "favorites", "remixes"] as const).map((m) => (
                                                <th key={m} className="px-3 py-2 text-right font-medium">
                                                    {t(`creator.metrics.${m}`)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.top_works.map(({ work, ...p }) => (
                                            <tr key={work.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800/60" data-testid="creator-work">
                                                <td className="px-3 py-2">
                                                    <Link to={`/w/${work.id}`} className="flex min-w-0 items-center gap-3 !text-inherit">
                                                        <img src={mainSiteAsset(work.cover_thumb_url)} alt="" className="size-11 shrink-0 rounded-lg bg-stone-100 object-cover dark:bg-stone-900" loading="lazy" />
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-medium">{work.title || t("community.untitled")}</span>
                                                            {work.status !== "approved" || work.visibility !== "public" ? (
                                                                <Tag className="m-0 mt-0.5 text-[10px]">{work.status !== "approved" ? t(`community.status.${work.status}`) : t(`community.visibility.${work.visibility}`)}</Tag>
                                                            ) : null}
                                                        </span>
                                                    </Link>
                                                </td>
                                                <Cell total={work.view_count} period={p.period_views} />
                                                <Cell total={work.like_count} period={p.period_likes} />
                                                <Cell total={work.favorite_count} period={p.period_favorites} />
                                                <Cell total={work.remix_count} period={p.period_remixes} />
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-2 text-xs text-stone-500">{t("creator.cellHint", { days })}</p>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

function MetricCard({ label, value, previous, total, active, onClick }: { label: string; value: number; previous: number; total: number; active: boolean; onClick: () => void }) {
    const { t } = useTranslation();
    const change = periodChange(value, previous);
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`rounded-2xl border p-3 text-left transition ${active ? "border-violet-500 bg-violet-500/5" : "border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700"}`}
            data-testid="creator-metric"
        >
            <div className="text-xs text-stone-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{compactCount(value)}</div>
            <div className="mt-1 flex items-center gap-1 text-xs">
                {change.kind === "up" ? (
                    <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                        <ArrowUp className="size-3" />
                        {change.percent}%
                    </span>
                ) : change.kind === "down" ? (
                    <span className="flex items-center text-rose-600 dark:text-rose-400">
                        <ArrowDown className="size-3" />
                        {change.percent}%
                    </span>
                ) : change.kind === "new" ? (
                    <span className="text-emerald-600 dark:text-emerald-400">{t("creator.new")}</span>
                ) : (
                    <span className="flex items-center text-stone-400">
                        <Minus className="size-3" />
                    </span>
                )}
                <span className="text-stone-400">{t("creator.total", { count: compactCount(total) })}</span>
            </div>
        </button>
    );
}

function Cell({ total, period }: { total: number; period: number }) {
    return (
        <td className="px-3 py-2 text-right tabular-nums">
            {compactCount(total)}
            {period ? <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">+{compactCount(period)}</span> : null}
        </td>
    );
}
