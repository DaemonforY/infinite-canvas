import { createBrowserRouter, Outlet } from "react-router-dom";

import { AccountSync } from "@/components/layout/account-sync";
import { CloudAutoSync } from "@/components/layout/cloud-auto-sync";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AnimationPage from "@/pages/animation";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import ToolsPage from "@/pages/tools";
import VideoPage from "@/pages/video";
import ExplorePage from "@/pages/explore";
import WorkPage from "@/pages/work";
import UserPage from "@/pages/user";
import CollectionPage from "@/pages/collection";
import CreatorPage from "@/pages/creator";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <AccountSync />
                <CloudAutoSync />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/animation", element: <AnimationPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/tools", element: <ToolsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
            { path: "/explore", element: <ExplorePage /> },
            { path: "/w/:id", element: <WorkPage /> },
            { path: "/u/:handle", element: <UserPage /> },
            { path: "/c/:id", element: <CollectionPage /> },
            { path: "/creator", element: <CreatorPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
