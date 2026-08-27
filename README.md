# Lumatic

Lumatic is a private, browser-based photo editor designed as the human foundation for a future shared human-agent workspace. It provides a Lightroom-like editing surface, deterministic GPU adjustments, ordered history, durable local storage, and full-resolution export without uploading a photo to a server.

Built for OpenAI's [WebMCP Challenge](https://openai.com/webmcp-challenge/). This milestone intentionally contains no agent or WebMCP integration; those will be thin adapters over the same command layer used by the interface.

## What works

- Multi-image JPEG and PNG import with editing previews and thumbnails
- Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, and vibrance
- Five-point RGB, red, green, and blue tone curves
- Eight-channel HSL Color Mix and four-way Color Grading with hue, saturation, luminance, blending, and balance
- Texture, clarity, dehaze, post-crop vignette controls, and adjustable grain
- Sharpening, luminance noise reduction, and color noise reduction with detail controls
- Human-drawn linear gradients with normalized geometry, feathering, and the same ten local adjustments
- Select, move, resize, reset, and delete gradients directly on the photo
- PixiJS/WebGL preview with fit, 100%, zoom, and pan controls
- Structured per-photo history for global and spatial edits, with undo, redo, redo-tail replacement, and resets
- Before/after toggle and `\` hold-to-view-original shortcut
- IndexedDB persistence for originals, previews, edit state, history, and selection
- Full-resolution JPEG/PNG export using the same shader as the preview
- Tiled GPU export for images larger than a single 4096px tile
- Local-only privacy model: image data never leaves the browser

## Run locally

Requirements: Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The end-to-end suite covers mixed valid/corrupt imports, curves, color tools, effects, detail, global and gradient history, undo/redo, refresh restoration, spatially correct exports, library clearing, and a 6000×4000 tiled export.

## Architecture

```text
src/
  app/                    Next.js shell and global visual system
  components/editor/      Workspace, canvas, adjustments, masks, history, filmstrip
  editor/domain/          Photo, adjustment, mask, history, and workspace models
  editor/commands/        Framework-independent editor command service
  editor/state/           Zustand runtime state and draft interactions
  editor/persistence/     Dexie schema and transactional repository
  editor/imaging/         Decode, preview generation, and full-res export
  editor/renderer/        PixiJS renderer and shared GLSL adjustment filter
  validation/             Zod command and import validation
tests/                    Unit, IndexedDB integration, and Chromium E2E tests
```

React controls only invoke the editor service. A slider or gradient drag may update a temporary GPU preview many times, but only its final value or geometry becomes one structured history event and one durable IndexedDB transaction. Gradient coordinates are stored from `0` to `1`, so the same edit works on the preview and tiled original-resolution export. Future WebMCP tools will validate their input and call this same service.

## Local data and export

The active library belongs to the current browser and origin. Vercel preview URLs therefore have separate libraries from the stable production URL. Clearing site data or starting a New Library removes the stored originals and edits.

Exports retain original pixel dimensions and source format. JPEGs use quality `0.95`; PNGs remain PNG. EXIF/IPTC metadata is not copied in this milestone.

## Deploy to Vercel

Production: [lumatic.vercel.app](https://lumatic.vercel.app)

Import the repository into Vercel or run:

```bash
pnpm dlx vercel
```

No environment variables, API routes, databases, or storage services are required. Use the stable production alias when demonstrating persistence.

## Deferred

WebMCP, agents, radial masks, subject/sky segmentation, crop/rotation, RAW/HEIC, batch export, named projects, cloud sync, accounts, and production color-management profiles.

## License

[MIT](LICENSE)
