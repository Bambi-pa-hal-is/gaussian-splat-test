import { useEffect, useRef, useState } from 'react';
import { JumpButton, Joystick } from './TouchControls';
import { createViewer, type QualitySetting, type Viewer } from './viewer/createViewer';
import type { Quality } from './viewer/quality';

const TRANSITION_SECONDS = 4;
const QUALITY_KEY = 'apartment-quality';
const QUALITY_LABELS: Record<Quality, string> = { low: 'Low', medium: 'Medium', high: 'High' };

// phones and tablets get on-screen controls; add ?touch to the URL to try them on a desktop
const TOUCH_UI = window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(window.location.search).has('touch');

function loadQualitySetting(): QualitySetting {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (saved === 'auto' || saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    // storage unavailable; fall back to auto
  }
  return 'auto';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const styledRef = useRef(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styled, setStyled] = useState(false);
  const [transition, setTransition] = useState(0);
  const [locked, setLocked] = useState(false);
  const [qualitySetting, setQualitySetting] = useState<QualitySetting>(loadQualitySetting);
  const [quality, setQuality] = useState<Quality>('medium');
  // touch hint stays until the first touch on the view
  const [touchHint, setTouchHint] = useState(true);

  useEffect(() => {
    const viewer = createViewer(canvasRef.current!, loadQualitySetting(), {
      onLoadProgress: setLoadProgress,
      onReady: () => setReady(true),
      onTransitionProgress: setTransition,
      onError: setError,
      onPointerLockChange: setLocked,
      onQualityChange: (q) => setQuality(q),
    });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
    // the viewer is created once; later quality changes go through changeQuality
  }, []);

  const changeQuality = (setting: QualitySetting) => {
    setQualitySetting(setting);
    viewerRef.current?.setQuality(setting);
    try {
      localStorage.setItem(QUALITY_KEY, setting);
    } catch {
      // the choice just won't be remembered
    }
  };

  const toggle = () => {
    const next = !styledRef.current;
    styledRef.current = next;
    setStyled(next);
    viewerRef.current?.transitionTo(next, TRANSITION_SECONDS);
  };

  // T toggles the transition, so it works while the mouse is captured
  useEffect(() => {
    if (!ready) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !e.repeat) toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready]);

  const animating = transition > 0 && transition < 1;

  return (
    <div className={TOUCH_UI ? 'app touch' : 'app'}>
      <canvas ref={canvasRef} className="viewer" onPointerDown={() => setTouchHint(false)} />

      {!ready && (
        <div className="overlay">
          {error ? (
            <p className="error">Failed to load splats: {error}</p>
          ) : (
            <>
              <p>Loading splats… {Math.round(loadProgress * 100)}%</p>
              <div className="bar">
                <div style={{ width: `${loadProgress * 100}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {TOUCH_UI ? (
        <>
          {ready && touchHint && <div className="click-hint">Drag to look around · use the stick to walk</div>}
          <Joystick onMove={(x, y) => viewerRef.current?.setMoveAxis(x, y)} />
          <JumpButton onJump={() => viewerRef.current?.jump()} />
        </>
      ) : (
        <>
          {ready && !locked && <div className="click-hint">Click to walk around</div>}
          {locked && <div className="crosshair" />}
        </>
      )}

      <div className="panel">
        <button
          onClick={(e) => {
            // drop focus so keys pressed later don't re-trigger the button
            e.currentTarget.blur();
            toggle();
          }}
          disabled={!ready}
        >
          {styled ? 'Back to unstyled' : 'Transition to styled'}
          {!TOUCH_UI && <kbd>T</kbd>}
        </button>
        <div className="bar" aria-label="Transition progress">
          <div style={{ width: `${transition * 100}%` }} />
        </div>
        <span className="status">
          {animating ? 'Transforming…' : transition >= 1 ? 'Styled' : 'Unstyled'}
        </span>
        <label className="quality">
          <span>Quality</span>
          <select
            value={qualitySetting}
            onChange={(e) => {
              changeQuality(e.target.value as QualitySetting);
              e.currentTarget.blur();
            }}
          >
            <option value="auto">Auto ({QUALITY_LABELS[quality]})</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {!TOUCH_UI && (
        <div className="help">
          Mouse to look · WASD to walk · Shift to sprint · Space to jump · T to transform · Esc to release mouse
        </div>
      )}

      <div className="rotate-hint">Turn your phone upright to explore the apartment</div>
    </div>
  );
}
