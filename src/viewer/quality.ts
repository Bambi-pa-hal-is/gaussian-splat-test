// Rendering quality presets. Both splats are streamed with 4 LOD levels (100%, 50%,
// 25% and 10% of the splats); a preset decides how many splats may be drawn in total,
// the finest level that is ever downloaded, and the render resolution.

export type Quality = 'low' | 'medium' | 'high';

export type QualityPreset = {
    /** total splats across the scene; 0 = no limit (finest level everywhere) */
    splatBudget: number;
    /** finest LOD level allowed; 1 skips downloading the full-detail files */
    lodRangeMin: number;
    /** cap on device pixels per CSS pixel */
    maxPixelRatio: number;
};

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
    // sized for phones
    low: { splatBudget: 300_000, lodRangeMin: 1, maxPixelRatio: 1 },
    medium: { splatBudget: 1_000_000, lodRangeMin: 0, maxPixelRatio: 1.5 },
    high: { splatBudget: 0, lodRangeMin: 0, maxPixelRatio: 2 }
};

export const QUALITY_LEVELS: Quality[] = ['low', 'medium', 'high'];

function gpuRenderer(): string {
    try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return '';
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return String(renderer);
    } catch {
        return '';
    }
}

/** Best guess at a preset from the device; the frame rate monitor corrects it at runtime. */
export function detectQuality(): Quality {
    const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
    const mobile = nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const memory = nav.deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency || 4;
    if (mobile || memory <= 4 || cores <= 4) return 'low';

    const gpu = gpuRenderer();
    if (/swiftshader|llvmpipe|software/i.test(gpu)) return 'low';
    if (/nvidia|geforce|rtx|gtx|radeon rx|amd radeon pro|apple m\d (pro|max|ultra)/i.test(gpu)) return 'high';
    return 'medium';
}

const LOW_FPS = 30;
const WARMUP_SECONDS = 3;
const SAMPLE_SECONDS = 2;

/**
 * Watches the frame rate and asks for a lower preset when it stays below LOW_FPS.
 * It never steps back up, so quality doesn't oscillate.
 */
export class FrameRateMonitor {
    /** called with the next lower preset when the frame rate is too low */
    onTooSlow?: () => void;

    private elapsed = 0;
    private frames = 0;
    private warmup = WARMUP_SECONDS;

    /** restart measuring, e.g. after the preset changed */
    reset() {
        this.elapsed = 0;
        this.frames = 0;
        this.warmup = WARMUP_SECONDS;
    }

    update(dt: number) {
        // ignore loading hitches and long frames from background tabs
        if (this.warmup > 0) {
            this.warmup -= dt;
            return;
        }
        if (dt > 0.5) return;
        this.elapsed += dt;
        this.frames++;
        if (this.elapsed < SAMPLE_SECONDS) return;

        const fps = this.frames / this.elapsed;
        this.elapsed = 0;
        this.frames = 0;
        if (fps < LOW_FPS) {
            this.reset();
            this.onTooSlow?.();
        }
    }
}
