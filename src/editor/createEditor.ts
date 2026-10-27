import * as pc from 'playcanvas';
import { rotateCollision, rotateY, withDefaults, type ColliderBox, type CollisionData } from '../collision/colliders';
import { FlyCamera } from '../viewer/flyCamera';
import { FpsController } from '../viewer/fpsController';
import { RevealTransition } from '../viewer/revealTransition';
import { createSplatScene, FLOOR_Y, METER, SCENE_BOUNDS, SCENE_PIVOT } from '../viewer/splatScene';

// Dev-only collision editor.
//
// Top view (orthographic, looking straight down):
//   drag on empty space         - draw a box, aligned to the current view rotation
//   click                       - select the box under the cursor
//   drag inside selected box    - move it
//   drag an edge of selected box - resize it
//   right / middle drag         - pan, wheel - zoom
// Spawn tool: click to place the spawn (green arrow), drag to aim it.
// Align tool: press on a point and drag around it; the splats (and all boxes) twist
// live around that point, following the cursor. Guide lines through the point show
// the world axes, so a wall can be lined up with them.

export type EditorMode = 'top' | 'fly' | 'walk';
export type EditorTool = 'box' | 'spawn' | 'align';

export type EditorEvents = {
    onLoadProgress?: (progress: number) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
    onChange?: (data: CollisionData) => void;
    onSelect?: (index: number | null) => void;
    onTransitionProgress?: (progress: number) => void;
};

export type Editor = {
    setData: (data: CollisionData) => void;
    setSelected: (index: number | null) => void;
    setMode: (mode: EditorMode) => void;
    setTool: (tool: EditorTool) => void;
    /** switches instantly */
    setStyled: (styled: boolean) => void;
    /** switches instantly to the other splat */
    toggleStyled: () => void;
    setClipHeight: (y: number) => void;
    /** rotation of the top view; new boxes are drawn with this yaw */
    setViewYaw: (yaw: number) => void;
    /** heights given to newly drawn boxes */
    setDrawHeights: (bottom: number, top: number) => void;
    destroy: () => void;
};

const COLOR_BOX = new pc.Color(0.3, 0.85, 1);
const COLOR_SELECTED = new pc.Color(1, 0.85, 0.2);
const COLOR_PREVIEW = new pc.Color(1, 1, 1);
const COLOR_SPAWN = new pc.Color(0.4, 1, 0.4);
const COLOR_ALIGN = new pc.Color(1, 0.35, 0.9);
const COLOR_GUIDE = new pc.Color(1, 0.35, 0.9, 0.6);
// pixels the cursor must move away from the anchor before twisting starts
const ALIGN_DEADZONE_PX = 15;
// screen pixels within which an edge of the selected box can be grabbed
const EDGE_GRAB_PX = 8;
// drags shorter than this (pixels) count as clicks
const CLICK_PX = 4;

type Drag =
    | { kind: 'draw'; start: pc.Vec3; end: pc.Vec3 }
    | { kind: 'move'; index: number; start: pc.Vec3; box: ColliderBox }
    | { kind: 'resize'; index: number; box: ColliderBox; edgeX: number; edgeZ: number }
    | { kind: 'spawn'; start: pc.Vec3; end: pc.Vec3 }
    | {
        kind: 'align';
        /** world point that stays fixed on screen while twisting */
        anchor: pc.Vec3;
        /** data and camera center when the drag started; the twist is applied on top of these */
        base: CollisionData;
        baseCenter: pc.Vec3;
        /** cursor angle (screen space) the twist is measured from, set once the cursor leaves the anchor */
        refAngle: number | null;
        cursor: pc.Vec3;
    }
    | { kind: 'pan'; lastX: number; lastY: number };

export function createEditor(canvas: HTMLCanvasElement, events: EditorEvents = {}): Editor {
    // the editor runs on the dev machine; render at full quality
    const scene = createSplatScene(canvas, 'high', events);
    const { app, camera } = scene;

    let data: CollisionData = withDefaults({ spawn: { x: 0, z: 0, yaw: 0 }, boxes: [] });
    let selected: number | null = null;
    let mode: EditorMode = 'top';
    let tool: EditorTool = 'box';
    let clipY = Infinity;
    let viewYaw = 0;
    let drawHeights = { bottom: 0, top: 1 };

    // top view camera state
    const topCenter = new pc.Vec3(SCENE_BOUNDS.center.x, 0, SCENE_BOUNDS.center.z);
    let topZoom = 1.4;

    let fly: FlyCamera | null = null;
    let walk: FpsController | null = null;
    let drag: Drag | null = null;
    let downX = 0;
    let downY = 0;

    const transition = new RevealTransition(scene);
    transition.onProgress = (progress) => events.onTransitionProgress?.(progress);

    const setDataInternal = (next: CollisionData) => {
        data = next;
        scene.setSceneYaw(data.sceneYaw);
        scene.setSplatAdjust('styled', data.adjust.styled);
        scene.setSplatAdjust('nostyle', data.adjust.nostyle);
        walk?.setCollision(data);
    };

    const emitChange = (next: CollisionData) => {
        setDataInternal(next);
        events.onChange?.(data);
    };

    const updateBox = (index: number, box: ColliderBox) => {
        const boxes = data.boxes.slice();
        boxes[index] = box;
        emitChange({ ...data, boxes });
    };

    const select = (index: number | null) => {
        selected = index;
        events.onSelect?.(index);
    };

    // ---- camera modes ----

    const applyTopCamera = () => {
        const cam = camera.camera!;
        cam.projection = pc.PROJECTION_ORTHOGRAPHIC;
        cam.orthoHeight = topZoom;
        camera.setPosition(topCenter.x, 20, topCenter.z);
        // look straight down, then spin around the world Y axis by the view yaw
        const rot = new pc.Quat().setFromEulerAngles(0, viewYaw, 0).mul(new pc.Quat().setFromEulerAngles(-90, 0, 0));
        camera.setRotation(rot);
    };

    const applyClip = () => scene.setClipHeight(mode === 'top' ? clipY : Infinity);

    const setMode = (next: EditorMode) => {
        fly?.destroy();
        fly = null;
        walk?.destroy();
        walk = null;
        drag = null;
        mode = next;

        const cam = camera.camera!;
        if (mode === 'top') {
            applyTopCamera();
        } else {
            cam.projection = pc.PROJECTION_PERSPECTIVE;
            if (mode === 'fly') {
                fly = new FlyCamera(camera, canvas);
                // start above the middle of what the top view was showing
                fly.lookAt(
                    new pc.Vec3(topCenter.x, 1.6, topCenter.z + 1.2),
                    new pc.Vec3(topCenter.x, 0, topCenter.z)
                );
            } else {
                walk = new FpsController(camera, canvas, data);
            }
        }
        applyClip();
    };

    // ---- picking ----

    const canvasPos = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    /** world position under the cursor on the ground plane (top view only) */
    const groundPoint = (e: MouseEvent) => {
        const { x, y } = canvasPos(e);
        const p = camera.camera!.screenToWorld(x, y, 1);
        return new pc.Vec3(p.x, 0, p.z);
    };

    const worldPerPixel = () => (topZoom * 2) / canvas.getBoundingClientRect().height;

    const toLocal = (box: ColliderBox, p: pc.Vec3) => rotateY(p.x - box.x, p.z - box.z, -box.yaw);

    const boxAt = (p: pc.Vec3) => {
        if (selected !== null) {
            const [lx, lz] = toLocal(data.boxes[selected], p);
            const b = data.boxes[selected];
            if (Math.abs(lx) <= b.width / 2 && Math.abs(lz) <= b.depth / 2) return selected;
        }
        // otherwise the smallest box under the cursor, so walls win over the floor
        let best: number | null = null;
        let bestArea = Infinity;
        data.boxes.forEach((b, i) => {
            const [lx, lz] = toLocal(b, p);
            const area = b.width * b.depth;
            if (Math.abs(lx) <= b.width / 2 && Math.abs(lz) <= b.depth / 2 && area < bestArea) {
                best = i;
                bestArea = area;
            }
        });
        return best;
    };

    /** which edges of the selected box are under the cursor: -1, 0 or 1 along local X and Z */
    const edgeAt = (p: pc.Vec3) => {
        if (selected === null) return null;
        const b = data.boxes[selected];
        const [lx, lz] = toLocal(b, p);
        const tol = EDGE_GRAB_PX * worldPerPixel();
        const hw = b.width / 2;
        const hd = b.depth / 2;
        if (Math.abs(lx) > hw + tol || Math.abs(lz) > hd + tol) return null;
        const edgeX = Math.abs(lx - hw) < tol ? 1 : Math.abs(lx + hw) < tol ? -1 : 0;
        const edgeZ = Math.abs(lz - hd) < tol ? 1 : Math.abs(lz + hd) < tol ? -1 : 0;
        return edgeX || edgeZ ? { edgeX, edgeZ } : null;
    };

    /** box spanning two corners in the view-aligned frame */
    const boxFromCorners = (a: pc.Vec3, b: pc.Vec3): ColliderBox => {
        const [ex, ez] = rotateY(b.x - a.x, b.z - a.z, -viewYaw);
        const [cx, cz] = rotateY(ex / 2, ez / 2, viewYaw);
        return {
            x: a.x + cx,
            z: a.z + cz,
            width: Math.abs(ex),
            depth: Math.abs(ez),
            yaw: viewYaw,
            bottom: drawHeights.bottom,
            top: drawHeights.top
        };
    };

    // ---- pointer input (top view) ----

    const onPointerDown = (e: PointerEvent) => {
        if (mode !== 'top') return;
        canvas.setPointerCapture(e.pointerId);
        downX = e.clientX;
        downY = e.clientY;

        if (e.button === 1 || e.button === 2) {
            drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
            return;
        }
        if (e.button !== 0) return;

        const p = groundPoint(e);
        if (tool === 'spawn') {
            drag = { kind: 'spawn', start: p, end: p.clone() };
            return;
        }
        if (tool === 'align') {
            drag = { kind: 'align', anchor: p, base: data, baseCenter: topCenter.clone(), refAngle: null, cursor: p.clone() };
            return;
        }

        const edge = edgeAt(p);
        if (edge && selected !== null) {
            drag = { kind: 'resize', index: selected, box: { ...data.boxes[selected] }, ...edge };
        } else if (selected !== null && boxAt(p) === selected) {
            drag = { kind: 'move', index: selected, start: p, box: { ...data.boxes[selected] } };
        } else {
            drag = { kind: 'draw', start: p, end: p.clone() };
        }
    };

    const onPointerMove = (e: PointerEvent) => {
        if (mode !== 'top') return;
        const p = groundPoint(e);

        if (!drag) {
            const edge = edgeAt(p);
            canvas.style.cursor = edge ? 'crosshair' : selected !== null && boxAt(p) === selected ? 'move' : 'default';
            return;
        }

        switch (drag.kind) {
            case 'pan': {
                const k = worldPerPixel();
                const [dx, dz] = rotateY(-(e.clientX - drag.lastX) * k, -(e.clientY - drag.lastY) * k, viewYaw);
                topCenter.x += dx;
                topCenter.z += dz;
                drag.lastX = e.clientX;
                drag.lastY = e.clientY;
                applyTopCamera();
                break;
            }
            case 'draw':
            case 'spawn':
                drag.end.copy(p);
                break;
            case 'align': {
                drag.cursor.copy(p);
                // measure in screen space: the camera pans during the twist to keep the
                // anchor in place, so world positions under the cursor would feed back
                const sx = e.clientX - downX;
                const sy = e.clientY - downY;
                if (Math.hypot(sx, sy) < ALIGN_DEADZONE_PX) break;
                const angle = Math.atan2(sy, sx) * pc.math.RAD_TO_DEG;
                drag.refAngle ??= angle;
                // rotateY turns screen-space angles the other way round, hence ref - current
                const delta = drag.refAngle - angle;
                emitChange(rotateCollision(drag.base, delta, SCENE_PIVOT));
                // pan so the anchor (which moved with the scene) stays under where it was pressed
                const a = drag.anchor;
                const [rx, rz] = rotateY(a.x - SCENE_PIVOT.x, a.z - SCENE_PIVOT.z, delta);
                topCenter.set(
                    drag.baseCenter.x + SCENE_PIVOT.x + rx - a.x,
                    0,
                    drag.baseCenter.z + SCENE_PIVOT.z + rz - a.z
                );
                applyTopCamera();
                break;
            }
            case 'move':
                updateBox(drag.index, {
                    ...drag.box,
                    x: drag.box.x + p.x - drag.start.x,
                    z: drag.box.z + p.z - drag.start.z
                });
                break;
            case 'resize': {
                // keep the opposite edge fixed and move the grabbed one to the cursor
                const b = drag.box;
                const [lx, lz] = toLocal(b, p);
                let minX = -b.width / 2, maxX = b.width / 2;
                let minZ = -b.depth / 2, maxZ = b.depth / 2;
                if (drag.edgeX > 0) maxX = Math.max(lx, minX + 0.005);
                if (drag.edgeX < 0) minX = Math.min(lx, maxX - 0.005);
                if (drag.edgeZ > 0) maxZ = Math.max(lz, minZ + 0.005);
                if (drag.edgeZ < 0) minZ = Math.min(lz, maxZ - 0.005);
                const [cx, cz] = rotateY((minX + maxX) / 2, (minZ + maxZ) / 2, b.yaw);
                updateBox(drag.index, { ...b, x: b.x + cx, z: b.z + cz, width: maxX - minX, depth: maxZ - minZ });
                break;
            }
        }
    };

    const onPointerUp = (e: PointerEvent) => {
        if (mode !== 'top' || !drag) return;
        const isClick = Math.hypot(e.clientX - downX, e.clientY - downY) < CLICK_PX;
        const p = groundPoint(e);

        if (drag.kind === 'draw') {
            if (isClick) {
                select(boxAt(p));
            } else {
                emitChange({ ...data, boxes: [...data.boxes, boxFromCorners(drag.start, drag.end)] });
                select(data.boxes.length - 1);
            }
        } else if (drag.kind === 'spawn') {
            const spawn = { ...data.spawn, x: drag.start.x, z: drag.start.z };
            if (!isClick) {
                spawn.yaw = Math.atan2(-(drag.end.x - drag.start.x), -(drag.end.z - drag.start.z)) * pc.math.RAD_TO_DEG;
            }
            emitChange({ ...data, spawn });
        }
        drag = null;
    };

    const onWheel = (e: WheelEvent) => {
        if (mode !== 'top') return;
        e.preventDefault();
        // zoom around the cursor
        const before = groundPoint(e);
        topZoom = pc.math.clamp(topZoom * Math.pow(1.0015, e.deltaY), 0.05, 5);
        applyTopCamera();
        const after = groundPoint(e);
        topCenter.x += before.x - after.x;
        topCenter.z += before.z - after.z;
        applyTopCamera();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    // ---- keyboard ----

    const onKeyDown = (e: KeyboardEvent) => {
        if (mode !== 'top' || selected === null) return;
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, select')) return;

        const b = data.boxes[selected];
        if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault();
            emitChange({ ...data, boxes: data.boxes.filter((_, i) => i !== selected) });
            select(null);
        } else if (e.code === 'Escape') {
            select(null);
        } else if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            // duplicate, offset a little so it is visible
            const [ox, oz] = rotateY(0.05, 0.05, viewYaw);
            emitChange({ ...data, boxes: [...data.boxes, { ...b, x: b.x + ox, z: b.z + oz }] });
            select(data.boxes.length - 1);
        } else if (e.code.startsWith('Arrow')) {
            e.preventDefault();
            // nudge along the screen axes; shift for bigger steps
            const step = (e.shiftKey ? 10 : 1) * 0.01 * METER;
            const sx = e.code === 'ArrowRight' ? step : e.code === 'ArrowLeft' ? -step : 0;
            const sz = e.code === 'ArrowDown' ? step : e.code === 'ArrowUp' ? -step : 0;
            const [dx, dz] = rotateY(sx, sz, viewYaw);
            updateBox(selected, { ...b, x: b.x + dx, z: b.z + dz });
        }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);

    // ---- drawing ----

    const lines: pc.Vec3[] = [];
    const colors: pc.Color[] = [];

    const pushLine = (a: pc.Vec3, b: pc.Vec3, color: pc.Color) => {
        lines.push(a, b);
        colors.push(color, color);
    };

    const pushBox = (box: ColliderBox, color: pc.Color) => {
        const corners: pc.Vec3[] = [];
        for (const y of [box.bottom, box.top]) {
            for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                const [x, z] = rotateY(sx * box.width / 2, sz * box.depth / 2, box.yaw);
                corners.push(new pc.Vec3(box.x + x, y, box.z + z));
            }
        }
        for (let i = 0; i < 4; i++) {
            pushLine(corners[i], corners[(i + 1) % 4], color);
            pushLine(corners[i + 4], corners[(i + 1) % 4 + 4], color);
            pushLine(corners[i], corners[i + 4], color);
        }
    };

    const pushSpawn = (x: number, z: number, yaw: number, y: number) => {
        const size = 0.3 * METER;
        const [fx, fz] = rotateY(0, -size * 2, yaw);
        const [rx, rz] = rotateY(size, 0, yaw);
        const tip = new pc.Vec3(x + fx, y, z + fz);
        pushLine(new pc.Vec3(x - rx, y, z - rz), tip, COLOR_SPAWN);
        pushLine(new pc.Vec3(x + rx, y, z + rz), tip, COLOR_SPAWN);
        pushLine(new pc.Vec3(x - rx, y, z - rz), new pc.Vec3(x + rx, y, z + rz), COLOR_SPAWN);
    };

    app.on('update', (dt: number) => {
        fly?.update(dt);
        walk?.update(dt);
        transition.update(dt);

        if (mode === 'walk') return;
        lines.length = 0;
        colors.length = 0;
        data.boxes.forEach((b, i) => {
            if (i !== selected) pushBox(b, COLOR_BOX);
        });
        if (selected !== null && data.boxes[selected]) pushBox(data.boxes[selected], COLOR_SELECTED);
        if (drag?.kind === 'draw') pushBox(boxFromCorners(drag.start, drag.end), COLOR_PREVIEW);
        if (drag?.kind === 'align') {
            // horizontal and vertical guides through the anchor's position on screen, plus the handle
            const y = FLOOR_Y + 0.01;
            const anchor = new pc.Vec3(
                drag.anchor.x + topCenter.x - drag.baseCenter.x,
                y,
                drag.anchor.z + topCenter.z - drag.baseCenter.z
            );
            const reach = 20;
            for (const [gx, gz] of [rotateY(reach, 0, viewYaw), rotateY(0, reach, viewYaw)]) {
                pushLine(new pc.Vec3(anchor.x - gx, y, anchor.z - gz), new pc.Vec3(anchor.x + gx, y, anchor.z + gz), COLOR_GUIDE);
            }
            pushLine(anchor, new pc.Vec3(drag.cursor.x, y, drag.cursor.z), COLOR_ALIGN);
        }

        const spawnY = FLOOR_Y + 0.01;
        if (drag?.kind === 'spawn') {
            const d = drag;
            const yaw = d.end.distance(d.start) > 0.01
                ? Math.atan2(-(d.end.x - d.start.x), -(d.end.z - d.start.z)) * pc.math.RAD_TO_DEG
                : data.spawn.yaw;
            pushSpawn(d.start.x, d.start.z, yaw, spawnY);
        } else {
            pushSpawn(data.spawn.x, data.spawn.z, data.spawn.yaw, spawnY);
        }

        if (lines.length) app.drawLines(lines, colors, false);
    });

    setMode('top');

    return {
        setData(next) {
            setDataInternal(next);
            if (selected !== null && selected >= data.boxes.length) select(null);
        },
        setSelected(index) {
            selected = index;
        },
        setMode,
        setTool(next) {
            tool = next;
        },
        setStyled(styled) {
            transition.set(styled);
        },
        toggleStyled() {
            transition.set(!transition.styled);
        },
        setClipHeight(y) {
            clipY = y;
            applyClip();
        },
        setViewYaw(yaw) {
            viewYaw = yaw;
            if (mode === 'top') applyTopCamera();
        },
        setDrawHeights(bottom, top) {
            drawHeights = { bottom, top };
        },
        destroy() {
            fly?.destroy();
            walk?.destroy();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
            window.removeEventListener('keydown', onKeyDown);
            scene.destroy();
        }
    };
}
