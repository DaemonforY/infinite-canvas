// Minimal declarations for gifenc (https://github.com/mattdesl/gifenc, MIT), which ships no types.
declare module "gifenc" {
    export type GifPalette = number[][];
    export type GifFrameOptions = {
        palette?: GifPalette;
        delay?: number; // milliseconds
        repeat?: number; // -1 once, 0 forever
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        first?: boolean;
    };
    export type GifEncoderInstance = {
        writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
        finish(): void;
        bytes(): Uint8Array;
    };
    export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance;
    export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean }): GifPalette;
    export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: "rgb565" | "rgb444" | "rgba4444"): Uint8Array;
}
