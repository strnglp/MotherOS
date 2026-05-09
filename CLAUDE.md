# CRT Terminal — MotherOS

Multiplayer shared CRT terminal prop for FoundryVTT tabletop RPG sessions. See `/home/jv/PLAN.md` for full design spec.

## Stack

- **Server:** Node.js 18+ with Express and `ws` (WebSocket)
- **Client:** Vanilla JS (ES modules), no frontend framework, no build step
- **Package manager:** npm
- **Linting/Formatting:** Biome
- **Testing:** Node built-in test runner (`node --test`) for server integration tests
- **Browser targets:** Last 2 versions of evergreen browsers (Chrome, Firefox, Safari, Edge)

## Architecture

```
server.js          — Express + WebSocket server
public/            — Static client files (served by Express)
  index.html       — Entry point, mode router via URL params
  css/             — CRT effects, builder UI, common styles
  js/              — ES modules: renderer, driver, passenger, builder, audio, etc.
  audio/           — Bundled sound effect MP3s
data/              — Terminal JSON data + per-terminal asset folders (gitignored)
test/              — Integration tests for REST API and WebSocket protocol
```

## Guardrails

### Forbidden
- No frontend frameworks (React, Vue, Svelte, Angular, etc.)
- No heavy wrapper libraries — prefer native APIs (WebSocket, Canvas 2D, HTML5 Audio, Fetch)
- No TypeScript (vanilla JS only)
- No build step for production — files in `public/` are served directly
- No database — JSON files on disk only

### Allowed dependencies (keep this list short)
- `express` — HTTP server and static file serving
- `ws` — WebSocket server
- `@biomejs/biome` — dev dependency for lint + format
- Small focused utilities only when native APIs are truly insufficient

### Code style
- ES modules (`import`/`export`), not CommonJS
- No classes unless genuinely warranted — prefer plain functions and objects
- Biome handles formatting and lint; run `npx biome check .` before committing
- No comments unless explaining a non-obvious WHY

### Git workflow
- Feature branches merged via PR
- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Never force-push to main

## Key design principles

1. **Keyboard-first interaction** — all driver navigation reachable via keyboard. Mouse is secondary.
2. **CRT atmosphere is the product** — the visual effects ARE the feature. Quality of glow, scanlines, curvature matters more than code elegance.
3. **Mixed content model** — screens contain ordered arrays of text blocks and image blocks. Links use named anchors (`id` field), not line numbers.
4. **Image reveal is distinct from text** — images use progressive pixelation on canvas (resolution stepping with `imageSmoothingEnabled = false`), not the same slow-type used for text.
5. **Sound enhances immersion** — teletype audio loops during text reveal, beep on navigation. Controlled by visual settings.
6. **Keep it simple** — no database, no auth, no complex build pipeline. One `npm start` to run.

## Running

```bash
npm install
npm start          # starts server on :3001
```

## Testing

```bash
npm test           # runs node --test on test/ directory
npx biome check . # lint + format check
```

## Modes

- `http://localhost:3001/?mode=builder` — GM authoring interface
- `http://localhost:3001/?mode=driver&terminal=<id>&room=<room>` — player driving the terminal
- `http://localhost:3001/?mode=passenger&room=<room>` — read-only viewer synced to driver
