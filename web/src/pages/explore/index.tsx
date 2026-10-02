import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Empty, Segmented, Spin } from "antd";
import { ImagePlus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useWorksFeed } from "@/components/community/use-works-feed";
import { WorkGrid } from "@/components/community/work-grid";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { COMMUNITY_TAGS as TAGS, type Feed, type WorkKind } from "@/services/api/community";

/** 发现: recommended / latest / following works, filtered by tag. */
export default function ExplorePage() {
    const { t } = useTranslation();
    const [feed, setFeed] = useState<Feed>("recommended");
    const [searchParams] = useSearchParams();
    const [tag, setTag] = useState(() => searchParams.get("tag") || "");
    const [kind, setKind] = useState<WorkKind | "">(() => (searchParams.get("kind") === "site" ? "site" : searchParams.get("kind") === "image" ? "image" : ""));
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const openPublish = usePublishWorkStore((state) => state.open);
    const { works, loading, error, hasMore, loadMore, reload } = useWorksFeed({ feed, tag, kind }, feed !== "following" || signedIn);

    return (
        <div className="h-full overflow-y-auto bg-background px-3 py-6 text-stone-900 sm:px-6 dark:text-stone-100">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{t("community.explore.title")}</h1>
                        <p className="mt-1 text-sm text-stone-500">{t("community.explore.description")}</p>
                    </div>
                    <Button type="primary" icon={<ImagePlus className="size-4" />} onClick={() => openPublish({ source: "canvas" })} data-testid="explore-publish">
                        {t("community.publish.action")}
                    </Button>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Segmented
                        value={feed}
                        onChange={(value) => setFeed(value as Feed)}
                        options={[
                            { value: "recommended", label: t("community.explore.recommended") },
                            { value: "latest", label: t("community.explore.latest") },
                            { value: "following", label: t("community.explore.following") },
                        ]}
                    />
                    <Segmented
                        value={kind}
                        onChange={(value) => setKind(value as WorkKind | "")}
                        options={[
                            { value: "", label: t("community.explore.allKinds") },
                            { value: "image", label: t("community.explore.images") },
                            { value: "site", label: t("community.explore.sites") },
                        ]}
                        data-testid="explore-kind"
                    />
                    <div className="hide-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                        {["", ...TAGS, ...(tag && !TAGS.includes(tag) ? [tag] : [])].map((value) => (
                            <button
                                key={value || "all"}
                                type="button"
                                onClick={() => setTag(value)}
                                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${tag === value ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200" : "border-stone-200 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300"}`}
                            >
                                {value || t("community.explore.allTags")}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-5">
                    {feed === "following" && !signedIn ? (
                        <Empty description={t("community.explore.signInForFollowing")} className="py-16" />
                    ) : error && !works.length ? (
                        <Empty description={error} className="py-16">
                            <Button icon={<RefreshCw className="size-4" />} onClick={reload}>
                                {t("community.retry")}
                            </Button>
                        </Empty>
                    ) : !works.length && !loading ? (
                        <Empty description={feed === "following" ? t("community.explore.emptyFollowing") : t("community.explore.empty")} className="py-16" />
                    ) : (
                        <WorkGrid works={works} />
                    )}
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <Spin />
                        </div>
                    ) : hasMore ? (
                        <div className="flex justify-center py-6">
                            <Button onClick={loadMore}>{t("community.loadMore")}</Button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
