import { describe, expect, test } from "bun:test";

import { promptLacksReferencedContent } from "./prompt-context-hint";

describe("promptLacksReferencedContent", () => {
    test("flags prompts that point at content the model cannot see", () => {
        expect(promptLacksReferencedContent("根据以上内容生成一张用于PPT的图片，比例16:9，可编辑图片中的文字内容，可复制粘贴到PPT中", false)).toBe(true);
        expect(promptLacksReferencedContent("把上面的文章做成一页PPT", false)).toBe(true);
        expect(promptLacksReferencedContent("Make a slide from the above article", false)).toBe(true);
    });

    test("leaves prompts that carry their content, or have reference images, alone", () => {
        expect(promptLacksReferencedContent("生成一张“发展优势”的PPT配图，比例16:9", false)).toBe(false);
        expect(promptLacksReferencedContent(`根据以下内容生成PPT：${"集团围绕主责主业，推动存量资源提质、增量业务拓展。".repeat(6)}`, false)).toBe(false);
        expect(promptLacksReferencedContent("根据以上内容画一张图", true)).toBe(false);
        expect(promptLacksReferencedContent("", false)).toBe(false);
    });
});
