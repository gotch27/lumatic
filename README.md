# Lumatic

Lumatic is a private, browser-based photo editor designed as the human foundation for a future shared human-agent workspace. It provides a Lightroom-like editing surface, deterministic GPU adjustments, ordered history, durable local storage, and full-resolution export without uploading a photo to a server.

Built for OpenAI's [WebMCP Challenge](https://openai.com/webmcp-challenge/). This milestone intentionally contains no agent or WebMCP integration; those will be thin adapters over the same command layer used by the interface.

## What works

- Multi-image JPEG and PNG import with editing previews and thumbnails
- Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, and vibrance
- PixiJS/WebGL preview with fit, 100%, zoom, and pan controls
- Structured per-photo history with undo, redo, redo-tail replacement, and Reset All
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

The end-to-end suite covers mixed valid/corrupt imports, adjustment history, undo/redo, refresh restoration, download output, library clearing, and a 6000×4000 tiled export.

## Architecture

```text
src/
  app/                    Next.js shell and global visual system
  components/editor/      Workspace, canvas, adjustments, history, filmstrip
  editor/domain/          Photo, adjustment, history, and workspace models
  editor/commands/        Framework-independent editor command service
  editor/state/           Zustand runtime state and draft interactions
  editor/persistence/     Dexie schema and transactional repository
  editor/imaging/         Decode, preview generation, and full-res export
  editor/renderer/        PixiJS renderer and shared GLSL adjustment filter
  validation/             Zod command and import validation
tests/                    Unit, IndexedDB integration, and Chromium E2E tests
```

React controls only invoke the editor service. A slider may update a temporary GPU preview many times, but only its final value becomes one structured history event and one durable IndexedDB transaction. Future WebMCP tools will validate their input and call this same service.

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

WebMCP, agents, masks, crop/rotation, tone curves, RAW/HEIC, batch export, named projects, cloud sync, accounts, and production color-management profiles.

## License

[MIT](LICENSE)
