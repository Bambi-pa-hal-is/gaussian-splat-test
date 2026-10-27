import * as pc from 'playcanvas';
import { REVEAL_WIDTH, SCENE_BOUNDS, type SplatScene } from './splatScene';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Animates the wavefront between the unstyled (progress 0) and styled (progress 1) splat. */
export class RevealTransition {
    /** called every frame while animating */
    onProgress?: (progress: number) => void;

    private progress = 0;
    private maxRadius = 1;
    private readonly origin = new pc.Vec3();
    private anim: { from: number; to: number; elapsed: number; duration: number } | null = null;
    private readonly scene: SplatScene;

    constructor(scene: SplatScene) {
        this.scene = scene;
    }

    /** true while the wave is moving */
    get animating() {
        return this.anim !== null;
    }

    get styled() {
        return this.anim ? this.anim.to === 1 : this.progress >= 1;
    }

    /** Starts the wave towards the given style, from `origin` (world space). */
    transitionTo(styled: boolean, duration: number, origin: pc.Vec3) {
        const target = styled ? 1 : 0;
        if (this.progress === target && !this.anim) return;
        if (!this.anim) {
            // at rest the scene is fully one style, so the wave can restart anywhere:
            // nearby surfaces transform first
            this.origin.copy(origin);
            this.maxRadius = this.computeMaxRadius();
        }
        // scale duration by how far there is left to go
        this.anim = { from: this.progress, to: target, elapsed: 0, duration: duration * Math.abs(target - this.progress) };
        if (this.anim.duration <= 0) this.anim = null;
    }

    /** Switches instantly. */
    set(styled: boolean) {
        this.anim = null;
        this.progress = styled ? 1 : 0;
        this.apply();
        this.onProgress?.(this.progress);
    }

    update(dt: number) {
        if (!this.anim) return;
        const anim = this.anim;
        anim.elapsed = Math.min(anim.elapsed + dt, anim.duration);
        this.progress = anim.from + (anim.to - anim.from) * easeInOutCubic(anim.elapsed / anim.duration);
        if (anim.elapsed >= anim.duration) this.anim = null;
        this.apply();
        this.onProgress?.(this.progress);
    }

    private apply() {
        // at the end points push the front infinitely far so splats outside SCENE_BOUNDS
        // (floaters, the view out of the windows) are fully switched too
        const p = this.progress;
        const radius = p <= 0 ? -Infinity : p >= 1 ? Infinity : p * this.maxRadius;
        this.scene.setReveal(this.origin, radius);
    }

    // distance from the origin to the furthest corner of the scene, plus the band width and noise margin
    private computeMaxRadius() {
        const { center: c, halfExtents: h } = SCENE_BOUNDS;
        // the scene can be rotated around Y, so use the horizontal radius of the bounds
        const horizontal = Math.hypot(h.x, h.z);
        const dx = Math.hypot(this.origin.x - c.x, this.origin.z - c.z) + horizontal;
        const dy = Math.abs(this.origin.y - c.y) + h.y;
        return Math.hypot(dx, dy) + REVEAL_WIDTH * 2.5;
    }
}
