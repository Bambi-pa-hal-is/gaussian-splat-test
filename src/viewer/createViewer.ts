import { defaultCollision } from '../collision/colliders';
import { FpsController } from './fpsController';
import { detectQuality, FrameRateMonitor, QUALITY_LEVELS, type Quality } from './quality';
import { RevealTransition } from './revealTransition';
import { createSplatScene } from './splatScene';

export type ViewerEvents = {
    onLoadProgress?: (progress: number) => void;
    onReady?: () => void;
    onTransitionProgress?: (progress: number) => void;
    onError?: (message: string) => void;
    onPointerLockChange?: (locked: boolean) => void;
    /** the preset in use changed; `auto` tells whether it was picked automatically */
    onQualityChange?: (quality: Quality, auto: boolean) => void;
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
    destroy: () => void;
};

export function createViewer(canvas: HTMLCanvasElement, quality: QualitySetting, events: ViewerEvents = {}): Viewer {
    let auto = quality === 'auto';
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

    app.on('update', (dt: number) => {
        player.update(dt);
        transition.update(dt);
        if (auto) monitor.update(dt);
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
            scene.setQuality(current);
            monitor.reset();
            events.onQualityChange?.(current, auto);
        },
        destroy() {
            removeDebugKey();
            player.destroy();
            scene.destroy();
        }
    };
}
