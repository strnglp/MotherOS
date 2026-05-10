# MotherOS

A multiplayer shared CRT terminal prop for FoundryVTT tabletop RPG sessions.

## Run locally

```bash
npm install
npm start
```

Server listens on port `3001`.

## Modes

- `http://localhost:3001/builder` — GM authoring interface
- `http://localhost:3001/driver?terminal=<id>&room=<room>` — player driving the terminal
- `http://localhost:3001/passenger?room=<room>` — read-only viewer synced to driver

## Stack

Vanilla JS (ES modules, no build step) + Node/Express + `ws` for WebSocket. Terminal data lives as JSON files under `data/`.
