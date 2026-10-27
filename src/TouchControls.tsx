import { useRef, useState } from 'react';

// On-screen controls for phones: a joystick to walk (bottom left) and a jump button
// (bottom right). Looking around is done by dragging on the view itself.

// how far (px) the knob can travel from the center
const KNOB_TRAVEL = 44;
// ignore tiny pushes so the player doesn't creep
const DEADZONE = 0.12;

export function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: React.PointerEvent) => {
    const rect = baseRef.current!.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > KNOB_TRAVEL) {
      dx = dx / len * KNOB_TRAVEL;
      dy = dy / len * KNOB_TRAVEL;
    }
    setKnob({ x: dx, y: dy });
    const amount = Math.min(len / KNOB_TRAVEL, 1);
    // screen up is forward
    onMove(amount < DEADZONE ? 0 : dx / KNOB_TRAVEL, amount < DEADZONE ? 0 : -dy / KNOB_TRAVEL);
  };

  const release = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="joystick"
      onPointerDown={(e) => {
        if (pointerRef.current !== null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerRef.current = e.pointerId;
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointerRef.current) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

export function JumpButton({ onJump }: { onJump: () => void }) {
  return (
    <button
      className="jump-button"
      aria-label="Jump"
      onPointerDown={(e) => {
        e.preventDefault();
        onJump();
      }}
    >
      Jump
    </button>
  );
}
