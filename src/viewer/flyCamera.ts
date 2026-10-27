import * as pc from 'playcanvas';

// Minimal fly camera:
//   drag (left / right mouse) or touch drag - look around
//   W A S D / arrow keys                   - move
//   Q / E (or Space / C)                   - down / up
//   Shift                                  - move faster
//   mouse wheel                            - dolly forward / back
export class FlyCamera {
    speed = 0.6;

    private yaw = 0;
    private pitch = 0;
    private keys = new Set<string>();
    private dragging = false;
    private lastX = 0;
    private lastY = 0;
    private wheel = 0;
    private readonly entity: pc.Entity;
    private readonly canvas: HTMLCanvasElement;

    constructor(entity: pc.Entity, canvas: HTMLCanvasElement) {
        this.entity = entity;
        this.canvas = canvas;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('wheel', this.onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
    }

    lookAt(position: pc.Vec3, target: pc.Vec3) {
        const dir = new pc.Vec3().sub2(target, position).normalize();
        this.yaw = Math.atan2(-dir.x, -dir.z) * pc.math.RAD_TO_DEG;
        this.pitch = Math.asin(dir.y) * pc.math.RAD_TO_DEG;
        this.entity.setPosition(position);
        this.entity.setEulerAngles(this.pitch, this.yaw, 0);
    }

    update(dt: number) {
        const move = new pc.Vec3();
        const k = this.keys;
        if (k.has('KeyW') || k.has('ArrowUp')) move.add(this.entity.forward);
        if (k.has('KeyS') || k.has('ArrowDown')) move.sub(this.entity.forward);
        if (k.has('KeyD') || k.has('ArrowRight')) move.add(this.entity.right);
        if (k.has('KeyA') || k.has('ArrowLeft')) move.sub(this.entity.right);
        if (k.has('KeyE') || k.has('Space')) move.y += 1;
        if (k.has('KeyQ') || k.has('KeyC')) move.y -= 1;

        const speed = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1);
        if (move.lengthSq() > 0) move.normalize().mulScalar(speed * dt);
        move.add(this.entity.forward.clone().mulScalar(this.wheel * this.speed * 0.15));
        this.wheel = 0;

        this.entity.translate(move);
        this.entity.setEulerAngles(this.pitch, this.yaw, 0);
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
    }

    private onPointerDown = (e: PointerEvent) => {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.dragging) return;
        const sensitivity = 0.2;
        this.yaw -= (e.clientX - this.lastX) * sensitivity;
        this.pitch = pc.math.clamp(this.pitch - (e.clientY - this.lastY) * sensitivity, -89, 89);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };

    private onPointerUp = () => {
        this.dragging = false;
    };

    private onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.wheel -= Math.sign(e.deltaY);
    };

    private onContextMenu = (e: Event) => e.preventDefault();

    private onKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        this.keys.add(e.code);
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };

    private onBlur = () => {
        this.keys.clear();
        this.dragging = false;
    };
}
