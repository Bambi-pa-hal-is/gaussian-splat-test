import { defaultCollision } from '../collision/colliders';
import { FpsController } from './fpsController';
import { detectQuality, FrameRateMonitor, QUALITY_LEVELS, type Quality } from './quality';
import { RevealTransition } from './revealTransition';
import { createSplatScene, type StreamingStatus } from './splatScene';

// after standing still this long (seconds) the view sharpens to the High preset
const STILL_DELAY = 0.6;

export type ViewerEvents = {
    onLoadProgress?: (progress: number) => void;
    onReady?: () => void;
    onTransitionProgress?: (progress: number) => void;
    onError?: (message: string) => void;
    onPointerLockChange?: (locked: boolean) => void;
    /** the preset in use changed; `auto` tells whether it was picked automatically */
    onQualityChange?: (quality: Quality, auto: boolean) => void;
    /** chunk downloads changed (initial load, quality changes, sharpening, transitions) */
    onStreamingChange?: (status: StreamingStatus) => void;
    /** the view switched to or from High because the player stood still */
    onSharpenChange?: (sharpened: boolean) => void;
};

export type QualitySetting = Quality | 'auto';

export type Viewer = {
    /** Animates towards the styled (true) or unstyled (false) splat. */
    transitionTo: (styled: boolean, duration: number) => void;
    /** on-screen joystick input: x = right, y = forward, each -1..1 */
    setMoveAxis: (x: number, y: number) => void;
    jump: () => void;
    /** 'auto' detects a preset and lowers it while the frame rate stays low */
    setQuality: (setting: QualitySetting) => void;
    /** show the High preset while the player stands still */
    setSharpenWhenStill: (enabled: boolean) => void;
    destroy: () => void;
};

export function createViewer(
    canvas: HTMLCanvasElement,
    quality: QualitySetting,
    sharpenWhenStill: boolean,
    events: ViewerEvents = {}
): Viewer {
    let auto = quality === 'auto';
    // the preset picked in the dropdown (or by auto); High replaces it while sharpened
    let current: Quality = quality === 'auto' ? detectQuality() : quality;
    const scene = createSplatScene(canvas, current, events);
    events.onQualityChange?.(current, auto);

    // in auto mode, step down a preset whenever the frame rate stays low
    const monitor = new FrameRateMonitor();
    monitor.onTooSlow = () => {
        const index = QUALITY_LEVELS.indexOf(current);
        if (!auto || index === 0) return;
        current = QUALITY_LEVELS[index - 1];
        scene.setQuality(current);
        events.onQualityChange?.(current, auto);
    };

    let sharpened = false;
    let stillTime = 0;

    const setSharpened = (next: boolean) => {
        if (next === sharpened) return;
        sharpened = next;
        scene.setQuality(sharpened ? 'high' : current);
        // the slow frames while sharpened say nothing about moving around
        monitor.reset();
        events.onSharpenChange?.(sharpened);
    };

    const { app, camera } = scene;
    scene.setSceneYaw(defaultCollision.sceneYaw);
    scene.setSplatAdjust('styled', defaultCollision.adjust.styled);
    scene.setSplatAdjust('nostyle', defaultCollision.adjust.nostyle);

    const player = new FpsController(camera, canvas, defaultCollision);
    player.onLockChange = (locked) => events.onPointerLockChange?.(locked);

    const transition = new RevealTransition(scene);
    transition.onProgress = (progress) => events.onTransitionProgress?.(progress);

    // dev only: L colours every splat by the LOD level it is drawn with
    let removeDebugKey = () => {};
    if (import.meta.env.DEV) {
        const onDebugKey = (e: KeyboardEvent) => {
            if (e.code === 'KeyL' && !e.repeat) app.scene.gsplat.colorizeLod = !app.scene.gsplat.colorizeLod;
        };
        window.addEventListener('keydown', onDebugKey);
        removeDebugKey = () => window.removeEventListener('keydown', onDebugKey);
    }

    let lastStatus: StreamingStatus = { done: -1, pending: -1 };

    app.on('update', (dt: number) => {
        player.update(dt);
        transition.update(dt);

        // sharpen once the player has stood still for a moment; any movement (or a
        // transition, which draws both splats) drops straight back
        if (player.moving || transition.animating) {
            stillTime = 0;
            setSharpened(false);
        } else {
            stillTime += dt;
            if (sharpenWhenStill && stillTime >= STILL_DELAY && current !== 'high') setSharpened(true);
        }

        if (auto && !sharpened) monitor.update(dt);

        const status = scene.getStreamingStatus();
        if (status.done !== lastStatus.done || status.pending !== lastStatus.pending) {
            lastStatus = status;
            events.onStreamingChange?.(status);
        }
    });

    return {
        transitionTo(toStyled, duration) {
            // the wave starts at the viewer
            transition.transitionTo(toStyled, duration, camera.getPosition());
        },
        setMoveAxis(x, y) {
            player.setMoveAxis(x, y);
        },
        jump() {
            player.jump();
        },
        setQuality(setting) {
            auto = setting === 'auto';
            current = setting === 'auto' ? detectQuality() : setting;
            // show the new choice right away; sharpening starts again after standing still
            stillTime = 0;
            sharpened = false;
            scene.setQuality(current);
            monitor.reset();
            events.onQualityChange?.(current, auto);
            events.onSharpenChange?.(false);
        },
        setSharpenWhenStill(enabled) {
            sharpenWhenStill = enabled;
            if (!enabled) setSharpened(false);
        },
        destroy() {
            removeDebugKey();
            player.destroy();
            scene.destroy();
        }
    };
}
