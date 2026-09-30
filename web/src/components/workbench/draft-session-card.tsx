import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Pinned "draft" entry at the top of the generation log: the prompt being written in the new session. */
export function DraftSessionCard({ prompt, referenceCount, active, onClick }: { prompt: string; referenceCount: number; active: boolean; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            data-testid="workbench-draft-card"
            onClick={onClick}
            className={`block w-full rounded-lg border border-dashed p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-300 bg-background hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"}`}
        >
            <div className="flex items-center gap-1.5 text-sm font-semibold leading-5">
                <PenLine className="size-3.5 shrink-0" />
                {t("workbench.draft")}
                {referenceCount ? <span className="text-xs font-normal text-stone-500 dark:text-stone-400">· {t("workbench.draftReferences", { count: referenceCount })}</span> : null}
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{prompt.trim() || t("workbench.draftNoText")}</div>
        </button>
    );
}
