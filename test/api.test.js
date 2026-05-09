import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3002";
const DATA_DIR = join(import.meta.dirname, "..", "data");

let serverModule;
let server;

before(async () => {
  process.env.PORT = "3002";
  await mkdir(DATA_DIR, { recursive: true });
  serverModule = await import("../server.js");
  server = serverModule.server;
  await new Promise((resolve) => {
    if (server.listening) resolve();
    else server.once("listening", resolve);
  });
});

after(async () => {
  server.close();
  await rm(DATA_DIR, { recursive: true, force: true });
});

describe("REST API", () => {
  beforeEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
    await mkdir(DATA_DIR, { recursive: true });
  });

  it("GET /api/terminals returns empty array initially", async () => {
    const res = await fetch(`${BASE_URL}/api/terminals`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.deepStrictEqual(data, []);
  });

  it("POST /api/terminals creates a terminal", async () => {
    const terminal = {
      id: "test-terminal",
      name: "Test Terminal",
      defaults: {},
      screens: { main: { content: [{ type: "text", value: "Hello", links: [] }], overrides: null } },
      entryScreen: "main",
    };

    const res = await fetch(`${BASE_URL}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(terminal),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.id, "test-terminal");
  });

  it("GET /api/terminals/:id returns the terminal", async () => {
    const terminal = {
      id: "fetch-test",
      name: "Fetch Test",
      defaults: {},
      screens: { main: { content: [{ type: "text", value: "Hi", links: [] }], overrides: null } },
      entryScreen: "main",
    };

    await fetch(`${BASE_URL}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(terminal),
    });

    const res = await fetch(`${BASE_URL}/api/terminals/fetch-test`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.name, "Fetch Test");
  });

  it("PUT /api/terminals/:id updates the terminal", async () => {
    const terminal = {
      id: "update-test",
      name: "Original",
      defaults: {},
      screens: { main: { content: [{ type: "text", value: "v1", links: [] }], overrides: null } },
      entryScreen: "main",
    };

    await fetch(`${BASE_URL}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(terminal),
    });

    const updated = { ...terminal, name: "Updated" };
    const res = await fetch(`${BASE_URL}/api/terminals/update-test`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.name, "Updated");
  });

  it("DELETE /api/terminals/:id removes the terminal", async () => {
    const terminal = { id: "delete-test", name: "Delete Me", defaults: {}, screens: {}, entryScreen: null };

    await fetch(`${BASE_URL}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(terminal),
    });

    const res = await fetch(`${BASE_URL}/api/terminals/delete-test`, { method: "DELETE" });
    assert.strictEqual(res.status, 204);

    const check = await fetch(`${BASE_URL}/api/terminals/delete-test`);
    assert.strictEqual(check.status, 404);
  });

  it("GET /api/terminals/:id returns 404 for missing", async () => {
    const res = await fetch(`${BASE_URL}/api/terminals/nonexistent`);
    assert.strictEqual(res.status, 404);
  });

  it("POST /api/terminals/:id/assets uploads a file", async () => {
    const terminal = { id: "asset-test", name: "Asset Test", defaults: {}, screens: {}, entryScreen: null };
    await fetch(`${BASE_URL}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(terminal),
    });

    // Upload a tiny PNG (1x1 transparent pixel)
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const res = await fetch(`${BASE_URL}/api/terminals/asset-test/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "test.png", data: pngBase64 }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.filename, "test.png");
  });
});
