import { useEffect, useRef, useState } from 'react';
import { defaultCollision, rotateCollision, withDefaults, type ColliderBox, type CollisionData, type SplatAdjust } from '../collision/colliders';
import { CEILING_Y, FLOOR_Y, METER, SCENE_PIVOT } from '../viewer/splatScene';
import { createEditor, type Editor as EditorCore, type EditorMode, type EditorTool } from './createEditor';
import './editor.css';

// Dev-only page (/editor) for drawing the collision boxes. Export the JSON and paste it
// into src/collision/colliders.json.

const STORAGE_KEY = 'apartment-collision-draft';

const PRESETS = {
  wall: { label: 'Wall', bottom: FLOOR_Y - 0.1 * METER, top: CEILING_Y + 0.1 * METER },
  floor: { label: 'Floor', bottom: FLOOR_Y - 0.5 * METER, top: FLOOR_Y },
  low: { label: 'Low (1 m)', bottom: FLOOR_Y, top: FLOOR_Y + 1 * METER },
};
type PresetKey = keyof typeof PRESETS;

const round = (v: number) => Math.round(v * 10000) / 10000;

const roundAdjust = (a: SplatAdjust): SplatAdjust => ({ x: round(a.x), z: round(a.z), height: round(a.height), y: round(a.y) });

const ADJUST_FIELDS = [
  { key: 'x', label: 'Tilt X', min: -10, max: 10, step: 0.1, format: (v: number) => `${v.toFixed(1)}°` },
  { key: 'z', label: 'Tilt Z', min: -10, max: 10, step: 0.1, format: (v: number) => `${v.toFixed(1)}°` },
  { key: 'height', label: 'Height', min: 0.75, max: 1.25, step: 0.002, format: (v: number) => `${((v - 1) * 100).toFixed(1)}%` },
  { key: 'y', label: 'Lift', min: -0.1, max: 0.1, step: 0.001, format: (v: number) => `${(v / METER * 100).toFixed(1)} cm` },
] as const;

function toJson(data: CollisionData) {
  const rounded: CollisionData = {
    version: 1,
    sceneYaw: round(data.sceneYaw),
    adjust: { styled: roundAdjust(data.adjust.styled), nostyle: roundAdjust(data.adjust.nostyle) },
    spawn: { x: round(data.spawn.x), z: round(data.spawn.z), yaw: round(data.spawn.yaw) },
    boxes: data.boxes.map((b) => ({
      x: round(b.x),
      z: round(b.z),
      width: round(b.width),
      depth: round(b.depth),
      yaw: round(b.yaw),
      bottom: round(b.bottom),
      top: round(b.top),
    })),
  };
  // one box per line keeps the file readable and diffs small
  const boxes = rounded.boxes.map((b) => `    ${JSON.stringify(b)}`).join(',\n');
  return `{\n  "version": 1,\n  "sceneYaw": ${rounded.sceneYaw},\n  "adjust": {\n    "styled": ${JSON.stringify(rounded.adjust.styled)},\n    "nostyle": ${JSON.stringify(rounded.adjust.nostyle)}\n  },\n  "spawn": ${JSON.stringify(rounded.spawn)},\n  "boxes": [\n${boxes}\n  ]\n}\n`;
}

function parseJson(text: string): CollisionData {
  const parsed = JSON.parse(text) as CollisionData;
  if (!parsed.spawn || !Array.isArray(parsed.boxes)) throw new Error('Expected { spawn, boxes }');
  return withDefaults(parsed);
}

function loadDraft(): CollisionData {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseJson(text);
  } catch {
    // ignore unreadable drafts
  }
  return defaultCollision;
}

function NumberField({ label, value, step, onChange }: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={round(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<EditorCore | null>(null);
  const [data, setData] = useState<CollisionData>(loadDraft);
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('top');
  const [tool, setTool] = useState<EditorTool>('box');
  const [transition, setTransition] = useState(0);
  const [clipY, setClipY] = useState(FLOOR_Y + 1.2 * METER);
  const [viewYaw, setViewYaw] = useState(0);
  const [preset, setPreset] = useState<PresetKey>('wall');
  const [adjustTarget, setAdjustTarget] = useState<'styled' | 'nostyle'>('nostyle');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  useEffect(() => {
    const editor = createEditor(canvasRef.current!, {
      onLoadProgress: setLoadProgress,
      onReady: () => setReady(true),
      onError: setError,
      onChange: setData,
      onSelect: setSelected,
      onTransitionProgress: setTransition,
    });
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // push React state into the PlayCanvas side
  useEffect(() => {
    editorRef.current?.setData(data);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // the draft just won't survive a reload
    }
  }, [data]);
  useEffect(() => editorRef.current?.setSelected(selected), [selected]);
  useEffect(() => editorRef.current?.setMode(mode), [mode]);
  useEffect(() => editorRef.current?.setTool(tool), [tool]);
  // T switches between the splats, unless typing into a field
  useEffect(() => {
    if (!ready) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT' || e.repeat || (e.target as HTMLElement).closest('input, textarea')) return;
      editorRef.current?.toggleStyled();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready]);
  useEffect(() => editorRef.current?.setClipHeight(clipY), [clipY, ready]);
  useEffect(() => editorRef.current?.setViewYaw(viewYaw), [viewYaw]);
  useEffect(() => {
    const p = PRESETS[preset];
    editorRef.current?.setDrawHeights(p.bottom, p.top);
  }, [preset]);

  const box = selected !== null ? data.boxes[selected] : null;
  const updateSelected = (patch: Partial<ColliderBox>) => {
    if (selected === null) return;
    const boxes = data.boxes.slice();
    boxes[selected] = { ...boxes[selected], ...patch };
    setData({ ...data, boxes });
  };

  const json = toJson(data);

  return (
    <div className="editor">
      <canvas ref={canvasRef} className="editor-canvas" />

      {!ready && (
        <div className="overlay">
          {error ? <p className="error">Failed to load splats: {error}</p> : <p>Loading splats… {Math.round(loadProgress * 100)}%</p>}
        </div>
      )}

      <aside className="sidebar">
        <h1>Collision editor</h1>

        <section>
          <div className="segmented">
            {(['top', 'fly', 'walk'] as const).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {m === 'top' ? 'Top view' : m === 'fly' ? 'Fly' : 'Walk test'}
              </button>
            ))}
          </div>
          <div className="segmented">
            <button className={transition === 0 ? 'active' : ''} onClick={() => editorRef.current?.setStyled(false)}>Unstyled</button>
            <button className={transition === 1 ? 'active' : ''} onClick={() => editorRef.current?.setStyled(true)}>Styled</button>
          </div>
          <p className="hint">Press <kbd>T</kbd> to switch between them.</p>
          <p className="hint">
            {mode === 'top' && 'Drag to draw a box · click to select · drag a selected box to move, its edges to resize · right-drag to pan · wheel to zoom · arrows nudge · Del deletes · Ctrl+D duplicates · green arrow = spawn point'}
            {mode === 'fly' && 'Drag to look · WASD to move · Q/E down/up · Shift faster'}
            {mode === 'walk' && 'Click the view to capture the mouse · WASD · Space to jump · Shift to sprint · Esc to release'}
          </p>
        </section>

        <section>
          <h2>Adjust splat</h2>
          <div className="segmented">
            <button className={adjustTarget === 'nostyle' ? 'active' : ''} onClick={() => setAdjustTarget('nostyle')}>Unstyled</button>
            <button className={adjustTarget === 'styled' ? 'active' : ''} onClick={() => setAdjustTarget('styled')}>Styled</button>
          </div>
          {ADJUST_FIELDS.map((f) => {
            const value = data.adjust[adjustTarget][f.key];
            return (
              <label key={f.key} className="slider">
                <span>{f.label} {f.format(value)}</span>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value}
                  onChange={(e) => setData({
                    ...data,
                    adjust: { ...data.adjust, [adjustTarget]: { ...data.adjust[adjustTarget], [f.key]: parseFloat(e.target.value) } },
                  })}
                />
              </label>
            );
          })}
          <button onClick={() => setData({ ...data, adjust: { ...data.adjust, [adjustTarget]: { x: 0, z: 0, height: 1, y: 0 } } })}>
            Reset {adjustTarget === 'styled' ? 'styled' : 'unstyled'}
          </button>
          <p className="hint">Height scales from the floor, lift moves the splat up or down; boxes stay put. Compare in Fly mode looking straight ahead, flipping between Unstyled and Styled.</p>
        </section>

        {mode === 'top' && (
          <section>
            <h2>View</h2>
            <label className="slider">
              <span>Slice height {((clipY - FLOOR_Y) / METER).toFixed(2)} m</span>
              <input
                type="range"
                min={FLOOR_Y}
                max={CEILING_Y + 0.1}
                step={0.005}
                value={clipY}
                onChange={(e) => setClipY(parseFloat(e.target.value))}
              />
            </label>
            <label className="slider">
              <span>Splat rotation {data.sceneYaw.toFixed(1)}°</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={data.sceneYaw}
                onChange={(e) => setData(rotateCollision(data, parseFloat(e.target.value) - data.sceneYaw, SCENE_PIVOT))}
              />
            </label>
            <p className="hint">Rotates the splats and all boxes. Use the Align tool to set it from a wall.</p>
            <label className="slider">
              <span>View rotation {viewYaw.toFixed(1)}°</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.5}
                value={viewYaw}
                onChange={(e) => setViewYaw(parseFloat(e.target.value))}
              />
            </label>
            <p className="hint">Only turns the camera; new boxes follow it. Handy for walls at odd angles.</p>
            {box && (
              <button onClick={() => setViewYaw(box.yaw)}>Match selected box rotation</button>
            )}
          </section>
        )}

        {mode === 'top' && (
          <section>
            <h2>Tool</h2>
            <div className="segmented">
              <button className={tool === 'box' ? 'active' : ''} onClick={() => setTool('box')}>Box</button>
              <button className={tool === 'spawn' ? 'active' : ''} onClick={() => setTool('spawn')}>Spawn</button>
              <button className={tool === 'align' ? 'active' : ''} onClick={() => {
                // align against the world axes, so the walls end up square to the screen
                setViewYaw(0);
                setTool('align');
              }}>Align</button>
            </div>
            {tool === 'box' ? (
              <>
                <p className="hint">Height of new boxes:</p>
                <div className="segmented">
                  {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                    <button key={k} className={preset === k ? 'active' : ''} onClick={() => setPreset(k)}>
                      {PRESETS[k].label}
                    </button>
                  ))}
                </div>
              </>
            ) : tool === 'spawn' ? (
              <p className="hint">The green arrow is where the player starts. Click to place it, drag to set the direction the player looks.</p>
            ) : (
              <p className="hint">Press on a wall and drag around that point: the splats twist live with the cursor. Line a wall up with the pink guides and let go. Dragging further from the point gives finer control. Existing boxes rotate with the splats.</p>
            )}
          </section>
        )}

        <section>
          <h2>Boxes ({data.boxes.length})</h2>
          <ul className="box-list">
            {data.boxes.map((b, i) => (
              <li key={i}>
                <button className={i === selected ? 'active' : ''} onClick={() => setSelected(i)}>
                  #{i + 1} · {(b.width / METER).toFixed(2)} × {(b.depth / METER).toFixed(2)} m ·{' '}
                  {((b.top - b.bottom) / METER).toFixed(2)} m tall
                </button>
              </li>
            ))}
          </ul>
          {box && selected !== null && (
            <div className="props">
              <NumberField label="x" value={box.x} step={0.005} onChange={(x) => updateSelected({ x })} />
              <NumberField label="z" value={box.z} step={0.005} onChange={(z) => updateSelected({ z })} />
              <NumberField label="width" value={box.width} step={0.005} onChange={(width) => updateSelected({ width })} />
              <NumberField label="depth" value={box.depth} step={0.005} onChange={(depth) => updateSelected({ depth })} />
              <NumberField label="yaw °" value={box.yaw} step={0.5} onChange={(yaw) => updateSelected({ yaw })} />
              <NumberField label="bottom" value={box.bottom} step={0.005} onChange={(bottom) => updateSelected({ bottom })} />
              <NumberField label="top" value={box.top} step={0.005} onChange={(top) => updateSelected({ top })} />
              <div className="row">
                <button onClick={() => {
                  setData({ ...data, boxes: [...data.boxes, { ...box }] });
                  setSelected(data.boxes.length);
                }}>Duplicate</button>
                <button className="danger" onClick={() => {
                  setData({ ...data, boxes: data.boxes.filter((_, i) => i !== selected) });
                  setSelected(null);
                }}>Delete</button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2>Export</h2>
          <textarea readOnly value={json} rows={6} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button onClick={() => {
              navigator.clipboard.writeText(json).then(() => flash('Copied to clipboard'), () => flash('Copy failed, select the text instead'));
            }}>Copy JSON</button>
            <button onClick={() => {
              const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'colliders.json';
              a.click();
              URL.revokeObjectURL(url);
            }}>Download</button>
          </div>
          <p className="hint">Paste into <code>src/collision/colliders.json</code>.</p>
        </section>

        <section>
          <h2>Import</h2>
          <textarea value={importText} rows={3} placeholder="Paste collision JSON…" onChange={(e) => setImportText(e.target.value)} />
          <div className="row">
            <button onClick={() => {
              try {
                setData(parseJson(importText));
                setSelected(null);
                setImportText('');
                flash('Imported');
              } catch (err) {
                flash(`Invalid JSON: ${(err as Error).message}`);
              }
            }}>Load</button>
            <button onClick={() => {
              setData(defaultCollision);
              setSelected(null);
              flash('Reset to colliders.json');
            }}>Reset to colliders.json</button>
          </div>
        </section>

        {message && <div className="toast">{message}</div>}
      </aside>
    </div>
  );
}
