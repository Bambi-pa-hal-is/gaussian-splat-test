import collidersJson from './colliders.json';

// Collision for the apartment, shared by both splats (they are aligned in world space).
// Edit it visually in the dev-only /editor page, export the JSON and paste it into
// colliders.json.

/** A solid box, rotated around the world Y axis. All values are world units. */
export type ColliderBox = {
    /** center on the ground plane */
    x: number;
    z: number;
    /** size along the box's local X and Z axes */
    width: number;
    depth: number;
    /** rotation around Y in degrees */
    yaw: number;
    /** world heights of the box's underside and top */
    bottom: number;
    top: number;
};

export type Spawn = {
    x: number;
    z: number;
    /** view direction in degrees, same convention as ColliderBox.yaw */
    yaw: number;
};

/** Fine adjustment of one splat, relative to SCENE_PIVOT on the floor. */
export type SplatAdjust = {
    /** levelling rotation around the scene's X and Z axes, degrees */
    x: number;
    z: number;
    /** vertical scale, measured from the floor (1 = unchanged) */
    height: number;
    /** vertical offset, world units */
    y: number;
};

const NO_ADJUST: SplatAdjust = { x: 0, z: 0, height: 1, y: 0 };

export type CollisionData = {
    version: 1;
    /**
     * Rotation of both splats around the world Y axis (degrees), pivoting on SCENE_PIVOT.
     * The editor sets it so the walls line up with the world axes. Boxes and spawn are
     * in the rotated world.
     */
    sceneYaw: number;
    /** per-splat fine adjustment, applied after sceneYaw; boxes are not affected */
    adjust: { styled: SplatAdjust; nostyle: SplatAdjust };
    spawn: Spawn;
    boxes: ColliderBox[];
};

/** Fills in fields that older exports don't have. */
export function withDefaults(data: Partial<CollisionData> & Pick<CollisionData, 'spawn' | 'boxes'>): CollisionData {
    return {
        version: 1,
        sceneYaw: data.sceneYaw ?? 0,
        adjust: {
            styled: { ...NO_ADJUST, ...data.adjust?.styled },
            nostyle: { ...NO_ADJUST, ...data.adjust?.nostyle }
        },
        spawn: data.spawn,
        boxes: data.boxes
    };
}

export const defaultCollision = withDefaults(collidersJson as CollisionData);

/** Rotates (x, z) around the Y axis, matching PlayCanvas' rotation convention. */
export function rotateY(x: number, z: number, yawDeg: number): [number, number] {
    const a = yawDeg * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [x * c + z * s, -x * s + z * c];
}

const normalizeAngle = (deg: number) => ((deg % 360) + 540) % 360 - 180;

/**
 * Rotates the whole world (splats, boxes and spawn) by `delta` degrees around the Y axis
 * through `pivot`, so already placed boxes stay put relative to the apartment.
 */
export function rotateCollision(data: CollisionData, delta: number, pivot: { x: number; z: number }): CollisionData {
    const rotatePoint = (x: number, z: number) => {
        const [rx, rz] = rotateY(x - pivot.x, z - pivot.z, delta);
        return { x: pivot.x + rx, z: pivot.z + rz };
    };
    return {
        ...data,
        sceneYaw: normalizeAngle(data.sceneYaw + delta),
        spawn: { ...rotatePoint(data.spawn.x, data.spawn.z), yaw: normalizeAngle(data.spawn.yaw + delta) },
        boxes: data.boxes.map((b) => ({ ...b, ...rotatePoint(b.x, b.z), yaw: normalizeAngle(b.yaw + delta) }))
    };
}

/** The player is an upright cylinder standing on its feet position. */
export type PlayerShape = {
    radius: number;
    height: number;
    /** obstacles at most this far above the feet are stepped onto instead of blocking */
    stepHeight: number;
};

export type CollisionResult = {
    grounded: boolean;
    hitCeiling: boolean;
};

/**
 * Pushes the player (feet position, modified in place) out of every box it overlaps.
 * Overlaps are resolved by stepping up when the box top is within stepHeight of the
 * feet (landing, low obstacles), otherwise along the smaller of down (bumping your
 * head) and sideways (walls).
 */
export function resolveCollisions(
    feet: { x: number; y: number; z: number },
    shape: PlayerShape,
    boxes: ColliderBox[]
): CollisionResult {
    const result: CollisionResult = { grounded: false, hitCeiling: false };

    // a few passes so corners between boxes settle
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const box of boxes) {
            const head = feet.y + shape.height;
            if (head <= box.bottom || feet.y >= box.top) continue;

            // player center in box space
            const [lx, lz] = rotateY(feet.x - box.x, feet.z - box.z, -box.yaw);
            const hw = box.width / 2;
            const hd = box.depth / 2;

            // sideways push: circle vs rectangle
            let pushX = 0;
            let pushZ = 0;
            let side = Infinity;
            const cx = Math.max(-hw, Math.min(hw, lx));
            const cz = Math.max(-hd, Math.min(hd, lz));
            const dx = lx - cx;
            const dz = lz - cz;
            const distSq = dx * dx + dz * dz;
            if (distSq > 0) {
                const dist = Math.sqrt(distSq);
                if (dist >= shape.radius) continue;
                side = shape.radius - dist;
                pushX = dx / dist * side;
                pushZ = dz / dist * side;
            } else {
                // center is inside the rectangle: leave through the nearest edge
                const exits = [
                    { d: hw - lx, x: 1, z: 0 },
                    { d: lx + hw, x: -1, z: 0 },
                    { d: hd - lz, x: 0, z: 1 },
                    { d: lz + hd, x: 0, z: -1 }
                ];
                const exit = exits.reduce((a, b) => (b.d < a.d ? b : a));
                side = exit.d + shape.radius;
                pushX = exit.x * side;
                pushZ = exit.z * side;
            }

            const up = box.top - feet.y;
            const down = head - box.bottom;

            // anything low enough is stepped onto, even when the sideways push is smaller
            if (up <= shape.stepHeight) {
                feet.y += up;
                result.grounded = true;
            } else if (down <= shape.stepHeight && down < side) {
                feet.y -= down;
                result.hitCeiling = true;
            } else {
                const [wx, wz] = rotateY(pushX, pushZ, box.yaw);
                feet.x += wx;
                feet.z += wz;
            }
            moved = true;
        }
        if (!moved) break;
    }

    return result;
}
