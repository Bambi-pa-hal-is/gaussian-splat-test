import * as pc from 'playcanvas';
import { resolveCollisions, type CollisionData, type PlayerShape } from '../collision/colliders';
import { FLOOR_Y, METER } from './splatScene';

// First person walking controller:
//   click            - capture the mouse (Esc releases it)
//   mouse            - look around
//   W A S D / arrows - walk
//   Shift            - sprint
//   Space            - jump
// Touch (phones):
//   drag on the view - look around
//   setMoveAxis()    - walk, from the on-screen joystick (analog: a small push walks slowly)
//   jump()           - from the on-screen jump button

const SHAPE: PlayerShape = {
    radius: 0.25 * METER,
    height: 1.75 * METER,
    stepHeight: 0.35 * METER
};
const EYE_HEIGHT = 1.6 * METER;
const WALK_SPEED = 3.5 * METER;
const SPRINT_SPEED = 6 * METER;
const GROUND_ACCEL = 40 * METER;
const AIR_ACCEL = 8 * METER;
const GRAVITY = 18 * METER;
const JUMP_SPEED = 5 * METER;
const MOUSE_SENSITIVITY = 0.12;
// degrees per pixel of finger movement
const TOUCH_SENSITIVITY = 0.25;
// falling this far below the floor means the player escaped the colliders
const RESPAWN_DEPTH = 5 * METER;

export class FpsController {
    /** called when the mouse is captured or released */
    onLockChange?: (locked: boolean) => void;

    private yaw = 0;
    private pitch = 0;
    private readonly feet = new pc.Vec3();
    private readonly velocity = new pc.Vec3();
    private grounded = false;
    private jumpQueued = false;
    private keys = new Set<string>();
    /** analog walk input from the joystick: x = right, y = forward, length <= 1 */
    private readonly moveAxis = { x: 0, y: 0 };
    /** whether the player moved, turned or was in the air during the last update */
    private movedLastUpdate = false;
    private lastYaw = 0;
    private lastPitch = 0;
    /** the finger currently dragging to look, if any */
    private look: { pointerId: number; x: number; y: number } | null = null;
    private collision: CollisionData;
    private readonly entity: pc.Entity;
    private readonly canvas: HTMLCanvasElement;

    constructor(entity: pc.Entity, canvas: HTMLCanvasElement, collision: CollisionData) {
        this.entity = entity;
        this.canvas = canvas;
        this.collision = collision;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('pointercancel', this.onPointerUp);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        this.respawn();
    }

    /** true while walking, falling, jumping or turning the view */
    get moving() {
        return this.movedLastUpdate;
    }

    get locked() {
        return document.pointerLockElement === this.canvas;
    }

    setCollision(collision: CollisionData) {
        this.collision = collision;
    }

    /** analog walk direction from a joystick: x = right, y = forward, each -1..1 */
    setMoveAxis(x: number, y: number) {
        this.moveAxis.x = x;
        this.moveAxis.y = y;
    }

    jump() {
        this.jumpQueued = true;
    }

    respawn() {
        const { spawn } = this.collision;
        // drop in from just above the highest surface under the spawn point
        this.feet.set(spawn.x, FLOOR_Y + 0.5 * METER, spawn.z);
        this.velocity.set(0, 0, 0);
        this.yaw = spawn.yaw;
        this.pitch = 0;
        this.syncCamera();
    }

    update(dt: number) {
        // clamp long frames (tab switches) so the player can't tunnel through walls
        dt = Math.min(dt, 0.1);

        const k = this.keys;
        let fx = 0;
        let fz = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
        if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
        if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
        if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
        fx += this.moveAxis.x;
        fz += this.moveAxis.y;

        // desired horizontal velocity from yaw only, so looking up/down doesn't slow you down
        const yawRad = this.yaw * pc.math.DEG_TO_RAD;
        const forwardX = -Math.sin(yawRad);
        const forwardZ = -Math.cos(yawRad);
        let wishX = forwardX * fz + -forwardZ * fx;
        let wishZ = forwardZ * fz + forwardX * fx;
        const len = Math.hypot(wishX, wishZ);
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
        if (len > 0) {
            // keys always give full speed; a joystick pushed part way walks slower
            const amount = Math.min(len, 1);
            wishX = wishX / len * speed * amount;
            wishZ = wishZ / len * speed * amount;
        }

        // accelerate towards it; full control on the ground, a little in the air
        const accel = (this.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
        const dvx = wishX - this.velocity.x;
        const dvz = wishZ - this.velocity.z;
        const dv = Math.hypot(dvx, dvz);
        if (dv > 0 && (this.grounded || len > 0)) {
            const step = Math.min(dv, accel);
            this.velocity.x += dvx / dv * step;
            this.velocity.z += dvz / dv * step;
        }

        if (this.jumpQueued && this.grounded) {
            this.velocity.y = JUMP_SPEED;
            this.grounded = false;
        }
        this.jumpQueued = false;
        this.velocity.y -= GRAVITY * dt;

        // sub-step so no single move is larger than half the player radius
        const distance = this.velocity.length() * dt;
        const steps = Math.max(1, Math.ceil(distance / (SHAPE.radius * 0.5)));
        const h = dt / steps;
        this.grounded = false;
        for (let i = 0; i < steps; i++) {
            this.feet.x += this.velocity.x * h;
            this.feet.y += this.velocity.y * h;
            this.feet.z += this.velocity.z * h;
            const hit = resolveCollisions(this.feet, SHAPE, this.collision.boxes);
            if (hit.grounded && this.velocity.y <= 0) {
                this.velocity.y = 0;
                this.grounded = true;
            }
            if (hit.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
        }

        if (this.feet.y < FLOOR_Y - RESPAWN_DEPTH) this.respawn();
        this.syncCamera();

        const walking = Math.hypot(this.velocity.x, this.velocity.z) > 0.02 * METER;
        const turning = this.yaw !== this.lastYaw || this.pitch !== this.lastPitch;
        this.movedLastUpdate = walking || turning || !this.grounded;
        this.lastYaw = this.yaw;
        this.lastPitch = this.pitch;
    }

    destroy() {
        if (this.locked) document.exitPointerLock();
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerUp);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
    }

    private syncCamera() {
        this.entity.setPosition(this.feet.x, this.feet.y + EYE_HEIGHT, this.feet.z);
        this.entity.setEulerAngles(this.pitch, this.yaw, 0);
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') {
            // phones can't capture the pointer, so only a real mouse asks for it
            if (!this.locked) this.canvas.requestPointerLock();
            return;
        }
        if (this.look) return;
        this.canvas.setPointerCapture(e.pointerId);
        this.look = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.look || e.pointerId !== this.look.pointerId) return;
        this.yaw -= (e.clientX - this.look.x) * TOUCH_SENSITIVITY;
        this.pitch = pc.math.clamp(this.pitch - (e.clientY - this.look.y) * TOUCH_SENSITIVITY, -89, 89);
        this.look.x = e.clientX;
        this.look.y = e.clientY;
    };

    private onPointerUp = (e: PointerEvent) => {
        if (this.look?.pointerId === e.pointerId) this.look = null;
    };

    private onPointerLockChange = () => {
        if (!this.locked) this.keys.clear();
        this.onLockChange?.(this.locked);
    };

    private onMouseMove = (e: MouseEvent) => {
        if (!this.locked) return;
        this.yaw -= e.movementX * MOUSE_SENSITIVITY;
        this.pitch = pc.math.clamp(this.pitch - e.movementY * MOUSE_SENSITIVITY, -89, 89);
    };

    private onKeyDown = (e: KeyboardEvent) => {
        if (!this.locked) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) this.jumpQueued = true;
        }
        this.keys.add(e.code);
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };

    private onBlur = () => {
        this.keys.clear();
        this.look = null;
        this.setMoveAxis(0, 0);
    };
}
