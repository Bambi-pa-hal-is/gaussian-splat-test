import * as pc from 'playcanvas';
import type { SplatAdjust } from '../collision/colliders';
import { QUALITY_PRESETS, type Quality } from './quality';
import { revealModifier } from './revealShader';

// The two captures live in different coordinate frames. This transform maps the
// unstyled splat onto the styled one. It was estimated offline by registering the
// two floor plans (wall splats, brute-force search over scale / rotation / offset)
// and matching floor and ceiling heights - the captures differ slightly in vertical scale.
const NOSTYLE_TO_STYLED = {
    scale: [4.87, 4.87, 5.246489],
    // rotation around the capture's Z (up) axis, in degrees
    rotationZ: 175.5,
    translation: [-0.165885, -7.273975, -0.016377]
};

// The captures are Z-up; rotate the whole scene so Z maps to PlayCanvas' Y-up.
const SCENE_ROTATION = new pc.Vec3(-90, 0, 0);

// Rough world-space bounds of the scene (after SCENE_ROTATION).
export const SCENE_BOUNDS = new pc.BoundingBox(new pc.Vec3(0.16, 0.36, 0.135), new pc.Vec3(1.05, 0.45, 1.0));

// Point on the ground plane that CollisionData.sceneYaw rotates around (middle of the apartment).
export const SCENE_PIVOT = { x: SCENE_BOUNDS.center.x, z: SCENE_BOUNDS.center.z };

// World-space floor and ceiling heights of the styled capture.
export const FLOOR_Y = -0.026;
export const CEILING_Y = 0.737;

// The captures have no real-world scale. Assuming a 2.5 m ceiling gives the number of
// world units per meter, used to size the player and its movement.
export const METER = (CEILING_Y - FLOOR_Y) / 2.5;

export const REVEAL_WIDTH = 0.35;

// Vertical field of view in landscape. On tall (portrait) screens that would leave a
// narrow tunnel, so the vertical FOV grows until at least MIN_HORIZONTAL_FOV fits across.
const BASE_FOV = 70;
const MAX_FOV = 100;
const MIN_HORIZONTAL_FOV = 65;

// LOD switch distances in world units (the apartment is about 2.4 units across): full
// detail within LOD_BASE_DISTANCE, each coarser level LOD_MULTIPLIER times further away.
// With a splat budget these only shape how detail falls off; the budget sets the total.
const LOD_BASE_DISTANCE = 0.5;
const LOD_MULTIPLIER = 2;
const REVEAL_GLOW = [0.55, 0.85, 1.0];

export type SplatSceneEvents = {
    onLoadProgress?: (progress: number) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
};

/** Chunk downloads of the streamed LOD sets so far. */
export type StreamingStatus = {
    /** chunks downloaded (or given up on) */
    done: number;
    /** chunks downloading or waiting to */
    pending: number;
};

// The engine's chunk loader keeps its queue in fields that aren't part of its public API.
// They are read defensively: if a later engine version renames them, nothing breaks,
// the status just reads as nothing pending.
type ChunkLoaderInternals = {
    _urlToAsset?: Map<string, pc.Asset>;
    _loadQueue?: Map<string, number>;
    _failed?: Set<string>;
};

function chunkStatus(asset: pc.Asset | null): StreamingStatus {
    const resource = asset?.resource as { octree?: { assetLoader?: ChunkLoaderInternals } } | undefined;
    const loader = resource?.octree?.assetLoader;
    if (!loader?._urlToAsset) return { done: 0, pending: 0 };
    let done = 0;
    for (const [url, chunk] of loader._urlToAsset) {
        if (chunk.loaded || loader._failed?.has(url)) done++;
    }
    return { done, pending: loader._urlToAsset.size - done + (loader._loadQueue?.size ?? 0) };
}

export type SplatScene = {
    app: pc.Application;
    camera: pc.Entity;
    /** Sets the wavefront. A radius of -Infinity shows only the unstyled splat, +Infinity only the styled one. */
    setReveal: (origin: pc.Vec3, radius: number) => void;
    /** Hides all splats above this world height. */
    setClipHeight: (y: number) => void;
    /** Rotates both splats around the Y axis through SCENE_PIVOT, in degrees. */
    setSceneYaw: (yaw: number) => void;
    /** Applies a rendering quality preset (splat budget, finest LOD, resolution). */
    setQuality: (quality: Quality) => void;
    /** chunk downloads of both splats, for loading indicators */
    getStreamingStatus: () => StreamingStatus;
    /** Fine-adjusts one splat (tilt, height, lift) around SCENE_PIVOT on the floor. */
    setSplatAdjust: (splat: 'styled' | 'nostyle', adjust: SplatAdjust) => void;
    destroy: () => void;
};

function loadSplat(app: pc.AppBase, name: string, url: string, onProgress: (p: number) => void) {
    return new Promise<pc.Asset>((resolve, reject) => {
        const asset = new pc.Asset(name, 'gsplat', { url });
        asset.on('progress', (received: number, length: number) => {
            if (length > 0) onProgress(received / length);
        });
        asset.once('load', () => {
            onProgress(1);
            resolve(asset);
        });
        asset.once('error', (err: string) => reject(new Error(`${name}: ${err}`)));
        app.assets.add(asset);
        app.assets.load(asset);
    });
}

/** Creates the PlayCanvas app with a camera and both splats loaded, overlapping, into it. */
export function createSplatScene(canvas: HTMLCanvasElement, quality: Quality, events: SplatSceneEvents = {}): SplatScene {
    const app = new pc.Application(canvas, {
        graphicsDeviceOptions: { antialias: false }
    });
    // the canvas is sized by CSS; follow it
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    const camera = new pc.Entity('camera');
    camera.addComponent('camera', {
        clearColor: new pc.Color(0.05, 0.05, 0.07),
        nearClip: 0.01,
        farClip: 100,
        fov: BASE_FOV
    });
    app.root.addChild(camera);

    const fitToCanvas = () => {
        app.resizeCanvas();
        const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
        const halfHorizontal = MIN_HORIZONTAL_FOV / 2 * pc.math.DEG_TO_RAD;
        const vertical = 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * pc.math.RAD_TO_DEG;
        camera.camera!.fov = pc.math.clamp(vertical, BASE_FOV, MAX_FOV);
    };
    const resizeObserver = new ResizeObserver(fitToCanvas);
    resizeObserver.observe(canvas);

    // spins the whole scene around SCENE_PIVOT; sits on the floor so per-splat height
    // scaling and tilting keep the floor in place
    const yawPivot = new pc.Entity('yaw-pivot');
    yawPivot.setLocalPosition(SCENE_PIVOT.x, FLOOR_Y, SCENE_PIVOT.z);
    app.root.addChild(yawPivot);

    // each splat gets its own adjust entity (tilt, height, lift) and capture frame, under the shared yaw
    const addSplatFrame = (name: string) => {
        const tilt = new pc.Entity(`${name}-adjust`);
        yawPivot.addChild(tilt);
        const frame = new pc.Entity(`${name}-frame`);
        frame.setLocalPosition(-SCENE_PIVOT.x, -FLOOR_Y, -SCENE_PIVOT.z);
        frame.setLocalEulerAngles(SCENE_ROTATION);
        tilt.addChild(frame);
        const splat = new pc.Entity(name);
        frame.addChild(splat);
        return { tilt, splat };
    };

    const { tilt: styledTilt, splat: styled } = addSplatFrame('styled');
    const { tilt: nostyleTilt, splat: nostyle } = addSplatFrame('nostyle');

    const { scale, rotationZ, translation } = NOSTYLE_TO_STYLED;
    nostyle.setLocalScale(scale[0], scale[1], scale[2]);
    nostyle.setLocalEulerAngles(0, 0, rotationZ);
    nostyle.setLocalPosition(translation[0], translation[1], translation[2]);

    const reveal = { origin: new pc.Vec3(), radius: -Infinity, clipY: Infinity };

    const applyQuality = () => {
        const preset = QUALITY_PRESETS[quality];
        app.scene.gsplat.splatBudget = preset.splatBudget;
        app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, preset.maxPixelRatio);
        app.resizeCanvas();
        for (const entity of [nostyle, styled]) {
            if (entity.gsplat) entity.gsplat.lodRangeMin = preset.lodRangeMin;
        }
    };
    applyQuality();

    const applyUniforms = () => {
        // a splat that is fully hidden by the reveal is switched off, so it costs nothing
        // (and the visible one gets the whole splat budget); both run during a transition
        nostyle.enabled = reveal.radius !== Infinity;
        styled.enabled = reveal.radius !== -Infinity;

        // keep the values finite for the shader
        const radius = pc.math.clamp(reveal.radius, -1e6, 1e6);
        const clipY = Math.min(reveal.clipY, 1e6);
        for (const [entity, side] of [[nostyle, 0], [styled, 1]] as const) {
            const gs = entity.gsplat;
            if (!gs) continue;
            gs.setParameter('uRevealOrigin', [reveal.origin.x, reveal.origin.y, reveal.origin.z]);
            gs.setParameter('uRevealRadius', radius);
            gs.setParameter('uRevealWidth', REVEAL_WIDTH);
            gs.setParameter('uRevealSide', side);
            gs.setParameter('uRevealGlow', REVEAL_GLOW);
            gs.setParameter('uClipY', clipY);
        }
    };

    let destroyed = false;
    let splatAssets: pc.Asset[] = [];
    const loadProgress = [0, 0];
    const reportLoad = () => events.onLoadProgress?.((loadProgress[0] + loadProgress[1]) / 2);

    Promise.all([
        // streamed LOD sets: the meta file loads here, the chunks stream in afterwards (coarse first)
        loadSplat(app, 'nostyle', '/splats/nostyle-lod/lod-meta.json', (p) => { loadProgress[0] = p; reportLoad(); }),
        loadSplat(app, 'styled', '/splats/styled-lod/lod-meta.json', (p) => { loadProgress[1] = p; reportLoad(); })
    ]).then(([nostyleAsset, styledAsset]) => {
        if (destroyed) return;
        splatAssets = [nostyleAsset, styledAsset];
        for (const [entity, asset] of [[nostyle, nostyleAsset], [styled, styledAsset]] as const) {
            entity.addComponent('gsplat', {
                asset,
                unified: true,
                lodBaseDistance: LOD_BASE_DISTANCE,
                lodMultiplier: LOD_MULTIPLIER
            });
            entity.gsplat!.setWorkBufferModifier(revealModifier);
        }
        applyQuality();
        applyUniforms();
        events.onReady?.();
    }).catch((err: Error) => {
        if (!destroyed) events.onError?.(err.message);
    });

    app.start();

    return {
        app,
        camera,
        setReveal(origin, radius) {
            reveal.origin.copy(origin);
            reveal.radius = radius;
            applyUniforms();
        },
        getStreamingStatus() {
            const total = { done: 0, pending: 0 };
            for (const asset of splatAssets) {
                const status = chunkStatus(asset);
                total.done += status.done;
                total.pending += status.pending;
            }
            return total;
        },
        setQuality(next) {
            quality = next;
            applyQuality();
        },
        setClipHeight(y) {
            reveal.clipY = y;
            applyUniforms();
        },
        setSceneYaw(yaw) {
            yawPivot.setLocalEulerAngles(0, yaw, 0);
        },
        setSplatAdjust(splat, adjust) {
            const entity = splat === 'styled' ? styledTilt : nostyleTilt;
            entity.setLocalPosition(0, adjust.y, 0);
            entity.setLocalEulerAngles(adjust.x, 0, adjust.z);
            entity.setLocalScale(1, adjust.height, 1);
        },
        destroy() {
            destroyed = true;
            resizeObserver.disconnect();
            app.destroy();
        }
    };
}
