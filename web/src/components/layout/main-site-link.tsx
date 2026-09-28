import { Home } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";

type MainSiteLinkProps = {
    className?: string;
    style?: React.CSSProperties;
    medium?: string;
};

/** Icon link back to the main site (registration, plans, API keys). Replaces the upstream GitHub link. */
export function MainSiteLink({ className, style, medium = "top-nav" }: MainSiteLinkProps) {
    const { t } = useTranslation();
    const label = t("topNav.mainSite", { site: MAIN_SITE_NAME });
    return (
        <a
            className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white", className)}
            style={style}
            href={mainSiteLink("/", medium)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
        >
            <Home className="size-4" />
        </a>
    );
}
