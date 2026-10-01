import { expect, test } from "bun:test";

import { IMAGE_QUICK_TOOLS_VERSION, readImageQuickToolsConfig } from "../src/components/canvas/canvas-image-toolbar-tools";

test("toolbars saved before the edit tool existed get it once", () => {
    const config = readImageQuickToolsConfig({ ids: ["info", "download", "crop"], showLabels: true });
    expect(config.ids.includes("edit")).toBe(true);
    expect(config.toolsVersion).toBe(IMAGE_QUICK_TOOLS_VERSION);
});

test("a user who hid the edit tool after the upgrade keeps it hidden", () => {
    const config = readImageQuickToolsConfig({ ids: ["info", "download", "crop"], showLabels: false, toolsVersion: IMAGE_QUICK_TOOLS_VERSION });
    expect(config.ids.includes("edit")).toBe(false);
});

test("fresh installs show the edit tool by default", () => {
    expect(readImageQuickToolsConfig(null).ids.includes("edit")).toBe(true);
});

test("toolbars saved at version 2 get the outpaint tool once, and keep it hidden afterwards", () => {
    const upgraded = readImageQuickToolsConfig({ ids: ["info", "edit", "maskEdit", "crop"], showLabels: false, toolsVersion: 2 });
    expect(upgraded.ids).toEqual(["info", "edit", "maskEdit", "outpaint", "crop"]);
    const hidden = readImageQuickToolsConfig({ ids: ["info", "edit", "maskEdit", "crop"], showLabels: false, toolsVersion: IMAGE_QUICK_TOOLS_VERSION });
    expect(hidden.ids.includes("outpaint")).toBe(false);
});
