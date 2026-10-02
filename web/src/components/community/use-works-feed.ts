import { useCallback, useEffect, useRef, useState } from "react";

import { listWorks, type Feed, type Work, type WorkKind } from "@/services/api/community";

type FeedParams = { feed?: Feed; tag?: string; kind?: WorkKind | ""; user?: string; collection?: number };

/** Pages through a works feed; `key` changes (feed, tag, user…) restart it. */
export function useWorksFeed(params: FeedParams, enabled = true) {
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasMore, setHasMore] = useState(false);
    const offsetRef = useRef(0);
    const tokenRef = useRef(0);
    const key = JSON.stringify(params);

    const load = useCallback(
        async (reset: boolean) => {
            const token = reset ? ++tokenRef.current : tokenRef.current;
            setLoading(true);
            setError("");
            try {
                const page = await listWorks({ ...JSON.parse(key), offset: reset ? 0 : offsetRef.current, limit: 30 });
                if (token !== tokenRef.current) return;
                offsetRef.current = page.next_offset;
                setHasMore(page.has_more);
                setWorks((current) => (reset ? page.works : [...current, ...page.works.filter((w) => !current.some((c) => c.id === w.id))]));
            } catch (err) {
                if (token === tokenRef.current) setError((err as Error).message);
            } finally {
                if (token === tokenRef.current) setLoading(false);
            }
        },
        [key],
    );

    useEffect(() => {
        if (!enabled) return;
        setWorks([]);
        offsetRef.current = 0;
        void load(true);
    }, [enabled, load]);

    return { works, loading, error, hasMore, loadMore: () => void load(false), reload: () => void load(true), setWorks };
}
