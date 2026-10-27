Preview
[https://gaussiansplat-6vxos.ondigitalocean.app/](https://gaussiansplat-6vxos.ondigitalocean.app/)

# My apartment

A walkable Gaussian splat of the apartment, in two versions: the real capture and a
styled one. A button (or `T`) turns one into the other with a wave that spreads out
from where you stand. Built with React, TypeScript, Vite and [PlayCanvas](https://playcanvas.com/).

- First person walking with collision: mouse to look, WASD, Shift to sprint, Space to jump.
  On phones (portrait): a joystick to walk, drag to look, and a jump button.
- Both splats are streamed with 4 levels of detail. A quality setting (Auto / Low /
  Medium / High) picks how many splats are drawn; Auto detects the device and steps down
  if the frame rate stays low. While you stand still the view sharpens to High, and drops
  back to the chosen quality as soon as you move ("Sharpen when still").
- A loading screen until the first splat data has arrived, and a small indicator while
  more detail streams in.
- A dev-only editor for drawing the collision boxes.

## Running

Needs Node 20.19+ or 22.12+.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in build/
```

To try it on a phone on the same network, run `npx vite --host` and open the address it
prints. Add `?touch` to the URL to get the phone controls on a desktop.

## Collision editor (dev only)

Open [http://localhost:5173/editor](http://localhost:5173/editor) while `npm run dev` is
running. It is not part of production builds.

- **Top view:** drag to draw a box, click to select, drag a selected box to move it and its
  edges to resize. Right-drag pans, the wheel zooms. The green arrow is the spawn point.
- **Align:** press on a wall and drag around the point to rotate the splats until the wall
  lines up with the guides.
- **Adjust splat:** tilt, height and lift per splat, to line the two captures up.
- **Fly / Walk test:** check the boxes in 3D.

Export the JSON with **Copy JSON** and paste it into
[`src/collision/colliders.json`](src/collision/colliders.json); the main page reads it
from there.

## Splat files

`public/splats/<name>-lod/` holds the streamed LOD sets: `lod-meta.json` indexes chunks of
the scene at 100%, 50%, 25% and 10% of the splats, each stored in the SOG format (splat
properties packed into WebP images that are uploaded straight to the GPU).

They are generated from the original `.ply` captures (not in the repo, ~250 MB each) with
[splat-transform](https://github.com/playcanvas/splat-transform):

```
# decimated levels (repeat for 25 and 10)
npx @playcanvas/splat-transform styled-splat.ply --decimate-adaptive 50% styled_50.ply

# combine into a streamed LOD set
npx @playcanvas/splat-transform styled-splat.ply -l 0 styled_50.ply -l 1 styled_25.ply -l 2 styled_10.ply -l 3 \
    --lod-chunk-count 64 public/splats/styled-lod/lod-meta.json
```

The same goes for `nostyle-splat.ply` into `public/splats/nostyle-lod/`. The transform that
lines the unstyled capture up with the styled one is in
[`src/viewer/splatScene.ts`](src/viewer/splatScene.ts) (`NOSTYLE_TO_STYLED`).

## Code

| Path | What |
|---|---|
| `src/viewer/splatScene.ts` | PlayCanvas app, both splats, alignment, LOD and quality |
| `src/viewer/revealShader.ts` | shader for the transition wave (and the editor's ceiling slice) |
| `src/viewer/revealTransition.ts` | animates the wave |
| `src/viewer/fpsController.ts` | walking, jumping, mouse / touch input |
| `src/viewer/quality.ts` | quality presets, device detection, frame rate monitor |
| `src/collision/` | collision boxes and the collision code |
| `src/editor/` | the dev-only editor |
| `src/App.tsx`, `src/TouchControls.tsx` | page UI and phone controls |
