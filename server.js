import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { readdir, readFile, writeFile, mkdir, rm, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || 3001;
const DATA_DIR = join(import.meta.dirname, "data");
const PUBLIC_DIR = join(import.meta.dirname, "public");
const DATA_ROOT = resolve(DATA_DIR);

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const ASSET_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const ALLOWED_ASSET_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp3", ".ogg", ".wav", ".m4a"]);
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

function isValidId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}

function isValidAssetName(name) {
  if (typeof name !== "string" || !ASSET_NAME_PATTERN.test(name)) return false;
  if (name.includes("..")) return false;
  return ALLOWED_ASSET_EXTS.has(extname(name).toLowerCase());
}

function safeTerminalDir(id) {
  if (!isValidId(id)) return null;
  const dir = resolve(join(DATA_DIR, id));
  if (dir !== DATA_ROOT && !dir.startsWith(DATA_ROOT + sep)) return null;
  return dir;
}

function safeAssetPath(id, name) {
  const dir = safeTerminalDir(id);
  if (!dir || !isValidAssetName(name)) return null;
  const file = resolve(join(dir, "assets", name));
  if (!file.startsWith(dir + sep)) return null;
  return file;
}

function validateTerminalShape(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return "must be an object";
  if (t.id !== undefined && !isValidId(t.id)) return "id must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,63}";
  if (t.name !== undefined && typeof t.name !== "string") return "name must be a string";
  if (t.entryScreen !== undefined && t.entryScreen !== null && typeof t.entryScreen !== "string") return "entryScreen must be a string or null";
  if (!t.screens || typeof t.screens !== "object" || Array.isArray(t.screens)) return "screens must be an object";
  for (const key of Object.keys(t.screens)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) return `invalid screen id: ${key}`;
  }
  return null;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(PUBLIC_DIR, { etag: false, lastModified: false, setHeaders: (res) => res.set("Cache-Control", "no-store") }));

// Route all modes to index.html
app.get("/builder", (req, res) => res.sendFile(join(PUBLIC_DIR, "index.html")));
app.get("/passenger", (req, res) => res.sendFile(join(PUBLIC_DIR, "index.html")));

// Serve terminal assets as static files
app.use("/assets/:terminalId", (req, res, next) => {
  const dir = safeTerminalDir(req.params.terminalId);
  if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
  express.static(join(dir, "assets"))(req, res, next);
});

// --- REST API ---

app.get("/api/terminals", async (req, res) => {
  try {
    if (!existsSync(DATA_DIR)) {
      return res.json([]);
    }
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    const terminals = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = join(DATA_DIR, entry.name, "terminal.json");
      if (!existsSync(jsonPath)) continue;
      const data = JSON.parse(await readFile(jsonPath, "utf-8"));
      terminals.push({ id: data.id, name: data.name });
    }
    res.json(terminals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/terminals/:id", async (req, res) => {
  try {
    const dir = safeTerminalDir(req.params.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    const jsonPath = join(dir, "terminal.json");
    if (!existsSync(jsonPath)) {
      return res.status(404).json({ error: "Terminal not found" });
    }
    const data = JSON.parse(await readFile(jsonPath, "utf-8"));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/terminals", async (req, res) => {
  try {
    const terminal = req.body;
    const shapeError = validateTerminalShape(terminal);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (!terminal.id) {
      terminal.id = randomUUID().slice(0, 8);
    }
    const dir = safeTerminalDir(terminal.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeFile(join(dir, "terminal.json"), JSON.stringify(terminal, null, 2));
    res.status(201).json(terminal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/terminals/:id", async (req, res) => {
  try {
    const dir = safeTerminalDir(req.params.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    const jsonPath = join(dir, "terminal.json");
    if (!existsSync(jsonPath)) {
      return res.status(404).json({ error: "Terminal not found" });
    }
    const terminal = req.body;
    const shapeError = validateTerminalShape(terminal);
    if (shapeError) return res.status(400).json({ error: shapeError });
    terminal.id = req.params.id;
    await writeFile(jsonPath, JSON.stringify(terminal, null, 2));
    res.json(terminal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/terminals/:id", async (req, res) => {
  try {
    const dir = safeTerminalDir(req.params.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    if (!existsSync(dir)) {
      return res.status(404).json({ error: "Terminal not found" });
    }
    await rm(dir, { recursive: true });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/terminals/:id/assets", async (req, res) => {
  try {
    const dir = safeTerminalDir(req.params.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    const assetsDir = join(dir, "assets");
    if (!existsSync(assetsDir)) {
      return res.status(404).json({ error: "Terminal not found" });
    }
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: "filename and data (base64) required" });
    }
    if (!isValidAssetName(filename)) {
      return res.status(400).json({ error: "invalid filename or unsupported file type" });
    }
    const target = safeAssetPath(req.params.id, filename);
    if (!target) return res.status(400).json({ error: "invalid asset path" });
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > MAX_ASSET_BYTES) {
      return res.status(413).json({ error: `asset exceeds ${MAX_ASSET_BYTES} bytes` });
    }
    await writeFile(target, buffer);
    res.status(201).json({ filename, src: `assets/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/terminals/:id/assets", async (req, res) => {
  try {
    const dir = safeTerminalDir(req.params.id);
    if (!dir) return res.status(400).json({ error: "Invalid terminal id" });
    const assetsDir = join(dir, "assets");
    if (!existsSync(assetsDir)) {
      return res.status(404).json({ error: "Terminal not found" });
    }
    const files = await readdir(assetsDir);
    res.json(files.filter((f) => !f.startsWith(".")));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/terminals/:id/assets/:filename", async (req, res) => {
  try {
    const filePath = safeAssetPath(req.params.id, req.params.filename);
    if (!filePath) return res.status(400).json({ error: "Invalid id or filename" });
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "Asset not found" });
    }
    await unlink(filePath);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WebSocket ---

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      driver: null,
      passengers: new Set(),
      state: null,
    });
  }
  return rooms.get(roomId);
}

function broadcast(room, message, excludeWs = null) {
  const payload = JSON.stringify(message);
  for (const passenger of room.passengers) {
    if (passenger !== excludeWs && passenger.readyState === 1) {
      passenger.send(payload);
    }
  }
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let role = null;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      role = msg.role;
      const room = getRoom(msg.room);
      currentRoom = room;

      if (role === "driver") {
        room.driver = ws;
        if (msg.terminal) {
          const dir = safeTerminalDir(msg.terminal);
          const jsonPath = dir && join(dir, "terminal.json");
          if (jsonPath && existsSync(jsonPath)) {
            const terminal = JSON.parse(await readFile(jsonPath, "utf-8"));
            room.state = {
              terminal,
              currentScreen: terminal.entryScreen || Object.keys(terminal.screens)[0],
              scrollY: 0,
              typingProgress: null,
            };
          }
        }
        if (room.state) {
          ws.send(JSON.stringify({ type: "state", ...room.state }));
        }
      } else {
        room.passengers.add(ws);
        if (room.state) {
          ws.send(JSON.stringify({ type: "state", ...room.state }));
        }
      }
    }

    if (msg.type === "navigate" && role === "driver" && currentRoom) {
      const terminal = currentRoom.state?.terminal;
      if (!terminal) return;
      let screenId = msg.screen;
      let screen = terminal.screens[screenId];
      if (!screen) {
        const match = Object.keys(terminal.screens).find((k) => k.toLowerCase() === screenId.toLowerCase());
        if (match) { screenId = match; screen = terminal.screens[match]; }
        else return;
      }

      currentRoom.state.currentScreen = screenId;
      currentRoom.state.scrollY = 0;
      currentRoom.state.typingProgress = 0;

      const navMsg = {
        type: "navigate",
        screen: screenId,
        content: screen.content,
        overrides: screen.overrides || null,
        header: msg.header || null,
      };
      ws.send(JSON.stringify(navMsg));
      broadcast(currentRoom, navMsg, ws);
    }

    if (msg.type === "select" && role === "driver" && currentRoom) {
      broadcast(currentRoom, { type: "select", linkId: msg.linkId });
    }

    if (msg.type === "skip" && role === "driver" && currentRoom) {
      broadcast(currentRoom, { type: "skip" });
    }

    if (msg.type === "scroll" && role === "driver" && currentRoom) {
      currentRoom.state.scrollY = msg.y;
      broadcast(currentRoom, { type: "scroll", y: msg.y });
    }
  });

  ws.on("close", () => {
    if (!currentRoom) return;
    if (role === "driver" && currentRoom.driver === ws) {
      currentRoom.driver = null;
    } else {
      currentRoom.passengers.delete(ws);
    }
    if (!currentRoom.driver && currentRoom.passengers.size === 0) {
      for (const [key, room] of rooms) {
        if (room === currentRoom) {
          rooms.delete(key);
          break;
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`CRT Terminal server running on http://localhost:${PORT}`);
});

export { app, server };
