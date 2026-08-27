# Lumatic — WebMCP Hackathon Project Brief

## 1. Hackathon context

This project is being built for OpenAI's WebMCP Challenge.

Official challenge links:
- OpenAI challenge page: https://openai.com/webmcp-challenge/
- OpenAI developer documentation: https://developers.openai.com/

The challenge is centered around building web experiences that become meaningfully better when humans and agents can work together on the same live application through WebMCP.

The project should therefore make WebMCP essential to the experience rather than simply adding an AI chat box on top of a normal web app.

---

## 2. Product idea

Build a browser-based Lightroom-like photo editor where a photographer can teach an agent their editing style by editing photos normally.

The key idea is that the agent does not only inspect the final slider values. It can understand:

- the original image,
- the ordered sequence of editing actions,
- intermediate editing states,
- spatial edits such as gradients and masks,
- the final edited result,
- and later, corrections made to agent-generated edits.

The agent can then infer the photographer's intent and adapt that editing behavior to new photos.

Example:

1. The photographer edits a backlit portrait.
2. They raise exposure, reduce highlights, warm the image, then add a top-down gradient to control the sky.
3. The application records that ordered trajectory.
4. The agent sees both the image and the edit history and infers why those decisions were made.
5. A second photo may have a different exposure or horizon position, so the agent should not blindly copy values. It should recreate the editing intent using different settings and mask geometry where appropriate.

The core product principle is:

> Teach the photo editor by editing, not by prompting.

The product should feel like an apprentice that observes the photographer's workflow, learns from demonstrations, tries to continue the work, and improves when corrected.

---

## 3. Product principles

### Shared human-agent workspace

The photographer and the agent manipulate the exact same editor state.

The agent should not have a separate hidden editing pipeline. Human edits and agent edits must go through the same commands, update the same UI, and appear in the same history.

### Deterministic editing

The product is not primarily a generative image editor.

The agent decides which adjustments and masks to apply, while the application performs deterministic, reversible photo-processing operations such as:

- exposure,
- contrast,
- highlights,
- shadows,
- white balance,
- saturation,
- tone adjustments,
- linear gradients,
- radial masks.

### Ordered history matters

The order of editing actions must be preserved.

The agent should be able to reason about a trajectory such as:

1. Correct exposure.
2. Protect highlights.
3. Adjust white balance.
4. Shape contrast.
5. Add a gradient.
6. Reposition the gradient.
7. Fine-tune the local exposure.

The final state alone is not enough.

### Adaptive imitation, not preset copying

A learned editing style should represent an aesthetic goal and workflow rather than fixed slider values.

For example, two photos with different starting exposure should receive different exposure adjustments while still converging toward the same visual intent.

---

## 4. Progressive feature roadmap

## Phase 1 — Lightroom-like editor foundation

Goal: create a deterministic photo editor before introducing AI.

### 1. Photo library

Implement:

- multi-image upload,
- thumbnail grid,
- selected photo,
- previous/next navigation,
- edited/unedited indicator,
- basic image metadata where easily available.

For the hackathon, support JPEG/PNG first.

Do not implement RAW support initially.

### 2. Core global adjustments

Start with:

- Exposure
- Contrast
- Highlights
- Shadows
- Whites
- Blacks
- Temperature
- Tint
- Saturation
- Vibrance

Optional after those are stable:

- Crop
- Rotation
- Basic tone curve

### 3. Before / after

Provide an easy original/current comparison.

---

## Phase 2 — Ordered history engine

This is a critical part of the project.

Every meaningful editor action should produce a structured history event.

Example:

```ts
{
  id: "event-182",
  photoId: "photo-7",
  actor: "user",
  timestamp: 123456,
  type: "adjustment.changed",
  property: "exposure",
  previousValue: 0.1,
  nextValue: 0.4
}
```

History events should preserve:

- order,
- timestamp,
- actor (`user` or `agent`),
- previous state,
- resulting state,
- target object / adjustment.

Implement:

- ordered history timeline,
- undo,
- redo,
- ability to reconstruct intermediate states.

The system should be able to represent:

`original -> action 1 -> state 1 -> action 2 -> state 2 -> ... -> final`.

---

## Phase 3 — Spatial editing

### 4. Linear gradients

This is the first major local-edit feature and one of the most important for the demo.

Store gradient geometry using normalized coordinates from `0` to `1`, never raw pixels.

Example:

```ts
{
  id: "gradient-1",
  startX: 0.5,
  startY: 0.02,
  endX: 0.5,
  endY: 0.38,
  feather: 0.65,
  adjustments: {
    exposure: -0.5,
    highlights: -20
  }
}
```

The user must be able to create, move, resize, and edit gradient settings.

Every interaction should be represented in the history.

### 5. Radial masks

Add after linear gradients are stable.

Store:

- center,
- radius X,
- radius Y,
- rotation,
- feather,
- invert,
- local adjustments.

Subject/sky segmentation is a stretch feature and should not block the core project.

---

## Phase 4 — WebMCP integration

Expose the editor to the agent through WebMCP.

The key rule is that both UI interactions and WebMCP tools must call the same Editor Command/API layer.

Example architecture:

```text
React UI -----------\
                    -> Editor Commands -> State -> Renderer
WebMCP tools -------/
```

Do not maintain separate human and agent logic.

### Initial read tools

Suggested tools:

- `list_photos`
- `get_current_photo`
- `get_photo_state`
- `get_edit_history`
- `get_adjustments`
- `get_masks`

### Initial write tools

Suggested tools:

- `set_adjustment`
- `create_linear_gradient`
- `update_linear_gradient`
- `create_radial_mask`
- `update_radial_mask`
- `revert_edit`

The first WebMCP milestone is simple:

> Tell the agent to change exposure or create a gradient and see the existing editor UI update immediately.

---

## Phase 5 — Agent understands one editing demonstration

Add a higher-level way for the agent to inspect a photo's editing trajectory.

Conceptually expose:

- original image,
- ordered editing history,
- final adjustment state,
- masks,
- final image.

The agent should be able to answer questions such as:

- What did I do to this photo?
- In what order did I make the changes?
- Why do you think I added this gradient?
- What visual problem was I correcting?

This phase validates whether history representation is useful before attempting automation.

---

## Phase 6 — Image-aware reasoning

The agent should reason about the image itself together with the history.

The target capability is not merely:

> "The user set highlights to -30."

It should infer something closer to:

> "The subject is backlit and the sky is bright, so the photographer protected highlights and lifted the subject while preserving the warm lighting."

The image can be shown to the agent using a reduced preview rather than the full-resolution original.

The full-resolution image does not need to be sent to the model for reasoning.

---

## Phase 7 — Adaptive edit transfer

This is the first major "magic" feature.

Workflow:

1. User edits Photo A.
2. Agent studies Photo A and its history.
3. User opens Photo B.
4. User asks the agent to apply the same editing intent.
5. The agent adapts the edits based on Photo B's actual content.

Examples:

- Photo A may need `+0.7` exposure while Photo B only needs `+0.1`.
- A sky gradient may cover the top 30% in one photo and 50% in another.
- White balance adjustments should depend on the new image's lighting.

This must clearly behave differently from copying a preset.

---

## Phase 8 — Multi-example style learning

Allow the agent to inspect several manually edited photos and infer a temporary editing profile.

Example profile:

```json
{
  "style": {
    "contrast": "moderately_soft",
    "highlights": "strongly_protected",
    "skin": "warm",
    "greens": "slightly_desaturated"
  },
  "workflow": [
    "normalize exposure",
    "protect highlights",
    "set white balance",
    "shape contrast",
    "apply local corrections"
  ],
  "conditionalRules": [
    {
      "condition": "bright sky above subject",
      "action": "top-down gradient"
    }
  ]
}
```

Display this inferred profile in the UI so the user can understand what the agent learned.

---

## Phase 9 — Batch apply

Allow the learned style to be applied to multiple photos.

For the hackathon demo, target roughly 10–30 photos rather than hundreds.

The agent should decide different edits for different images rather than applying one identical recipe.

All resulting edits must remain normal editable state inside the editor.

---

## Phase 10 — Human correction loop

When the agent edits a photo incorrectly:

1. The photographer manually corrects it.
2. The application records the difference between the agent edit and the human correction.
3. The agent can inspect that correction.
4. The inferred editing rules can be revised.
5. Similar photos can be reevaluated.

This creates the apprentice-like loop:

`observe -> try -> correction -> improve`.

---

## Phase 11 — Confidence and ask-for-example

Stretch feature.

Classify remaining photos into categories such as:

- high confidence,
- medium confidence,
- low confidence.

For unfamiliar visual conditions, the agent can ask the user to edit one representative image first.

Example:

> "I have not yet learned how you treat direct-flash images. Edit one of these three first."

After the new demonstration, the agent can reevaluate similar photos.

---

## Phase 12 — Additional stretch features

Only after the core experience works well:

- saved learned editing styles,
- subject segmentation,
- sky segmentation,
- more advanced tone curve,
- batch clustering,
- photo similarity analysis,
- style reuse between shoots,
- full-resolution export,
- RAW support.

---

## 5. Tech stack

## Frontend

### Next.js + React + TypeScript

Use Next.js with React and TypeScript.

The editor should be primarily client-side because the application is interaction-heavy and image-processing-heavy.

Suggested UI structure:

```text
Editor
├── Library
├── PhotoCanvas
├── AdjustmentPanel
├── HistoryPanel
└── Mask overlays
```

### Tailwind CSS + shadcn/ui

Use Tailwind for styling and shadcn/ui for common interface primitives.

Avoid spending hackathon time building low-level UI components from scratch.

---

## State management

### Zustand

Use Zustand as the main in-memory editor state.

Important: there are no accounts and no persisted storage in the initial version.

If the page reloads, losing the current session is acceptable for the hackathon MVP.

Do not add Supabase, IndexedDB, Dexie, authentication, or cloud project storage initially.

The state should contain:

- loaded photos,
- selected photo,
- adjustment state,
- masks,
- ordered history,
- undo/redo data,
- agent/user actor information,
- inferred style profile if present.

---

## Editor Command/API layer

Create a framework-independent command layer that owns all editor mutations.

Example commands:

```ts
editor.setAdjustment(...)
editor.createLinearGradient(...)
editor.updateLinearGradient(...)
editor.createRadialMask(...)
editor.updateMaskAdjustment(...)
editor.undo(...)
editor.redo(...)
```

Both React UI controls and WebMCP tools must call these same commands.

This is a critical architectural rule.

---

## History architecture

Use structured event-style history.

Each event should contain at minimum:

```ts
{
  id,
  photoId,
  actor: "user" | "agent",
  timestamp,
  type,
  previousState,
  nextState
}
```

More specialized events may contain mask geometry or adjustment-specific values.

The application must preserve order and allow reconstruction of intermediate states.

---

## Rendering / image processing

### PixiJS + WebGL

Use PixiJS as the main GPU-backed rendering layer.

Reasons:

- browser-friendly,
- GPU accelerated,
- suitable for 2D image processing,
- supports textures and shaders,
- easier than managing raw WebGL directly,
- more appropriate than Three.js for a 2D photo editor.

The rendering pipeline can conceptually look like:

```text
image texture
  -> exposure
  -> contrast / tone
  -> white balance
  -> saturation
  -> local masks / gradients
  -> display
```

Do not regenerate JPEGs every time a slider changes.

The editor should update the GPU-rendered preview interactively.

---

## Preview strategy

Keep separate image representations:

```text
original image
editing preview
thumbnail
```

Example:

```text
Original: 6000 x 4000
Preview: 1600 x 1067
Thumbnail: 240 x 160
```

Use the preview while editing.

All edit parameters and masks should remain resolution-independent.

### Normalized coordinates

All mask geometry must use normalized `0..1` coordinates.

Example:

```ts
{
  startX: 0.52,
  startY: 0.03,
  endX: 0.50,
  endY: 0.38
}
```

This allows the same mask to work on thumbnails, previews, full-resolution images, and agent instructions.

---

## Image loading

Use browser `File` objects and `URL.createObjectURL()` for the initial version.

No upload backend is required.

Files live only in the current browser session.

This keeps the project simple and avoids unnecessary:

- authentication,
- database work,
- file storage infrastructure,
- upload APIs,
- privacy complexity.

---

## Validation

### Zod

Use Zod for validating:

- editor commands,
- WebMCP tool inputs,
- masks,
- adjustment values,
- style-profile structures.

This is especially useful because agent-controlled inputs should be validated before mutating editor state.

---

## WebMCP

Use the native WebMCP API exposed through `document.modelContext`.

Keep WebMCP registration isolated from React UI components.

Suggested structure:

```text
src/
  webmcp/
    registerEditorTools.ts
    tools/
      getPhoto.ts
      getHistory.ts
      setAdjustment.ts
      createGradient.ts
      updateGradient.ts
```

The WebMCP layer should be thin.

Tool handlers should validate input and delegate immediately to the Editor Command/API layer.

---

## AI usage

For the core hackathon experience, the main agent should be ChatGPT interacting with the site through WebMCP.

Do not start by building a separate large backend AI system.

Possible later use of the OpenAI API includes:

- batch photo classification,
- clustering,
- image-aware preprocessing,
- saved style extraction,
- large-shoot processing.

These are secondary to proving the WebMCP interaction first.

---

## 6. Suggested project structure

```text
src/
  app/
    page.tsx

  components/
    editor/
      Editor.tsx
      Library.tsx
      PhotoCanvas.tsx
      AdjustmentPanel.tsx
      HistoryPanel.tsx

    masks/
      LinearGradientOverlay.tsx
      RadialMaskOverlay.tsx

  editor/
    models/
      photo.ts
      adjustment.ts
      mask.ts
      history.ts

    state/
      store.ts

    commands/
      adjustments.ts
      masks.ts
      history.ts

    renderer/
      PhotoRenderer.ts
      shaders/

  webmcp/
    registerEditorTools.ts
    tools/
      getProject.ts
      getPhoto.ts
      getHistory.ts
      setAdjustment.ts
      createGradient.ts
      updateGradient.ts

  validation/
    schemas.ts
```

---

## 7. MVP success criteria

The minimum compelling hackathon demo should work even without batch processing.

A strong MVP demonstration is:

1. Import several photos.
2. Edit Photo A manually using global adjustments and a linear gradient.
3. The ordered history records every action.
4. Ask the agent to inspect and explain the editing process.
5. Open Photo B, which has different exposure/composition.
6. Ask the agent to apply the same editing intent.
7. The agent changes the real editor state through WebMCP rather than generating a new image.
8. The agent chooses different numeric values and/or different gradient placement based on Photo B.
9. The user manually corrects one agent decision.
10. That correction is recorded as a human event and can later be used as another demonstration.

This proves the core idea:

> An agent can learn a photographer's editing process from image-aware, ordered human demonstrations and then continue the workflow inside the same live editor.

---

## 8. Explicit non-goals for the first version

Do not prioritize these until the core workflow works:

- user accounts,
- persistent storage,
- cloud projects,
- Supabase,
- IndexedDB,
- RAW support,
- Photoshop-style generative editing,
- subject/sky segmentation,
- production-grade export pipeline,
- complex collaboration,
- mobile-first editing,
- advanced color-management workflows.

The priority is to build the cleanest possible demonstration of human-to-agent workflow learning through WebMCP.
