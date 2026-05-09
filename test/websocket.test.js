import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocket } from "ws";

const WS_URL = "ws://localhost:3002";
const BASE_URL = "http://localhost:3002";
const DATA_DIR = join(import.meta.dirname, "..", "data");

let serverModule;
let server;

function createWS() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

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

async function createTestTerminal() {
  const terminal = {
    id: "ws-test",
    name: "WS Test",
    defaults: {},
    screens: {
      main: {
        content: [{ type: "text", value: "Main screen", links: [{ id: "go-next", line: 0, target: "next" }] }],
        overrides: null,
      },
      next: {
        content: [{ type: "text", value: "Next screen", links: [] }],
        overrides: null,
      },
    },
    entryScreen: "main",
  };

  const dir = join(DATA_DIR, "ws-test");
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "terminal.json"), JSON.stringify(terminal));
}

describe("WebSocket Protocol", () => {
  beforeEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
    await mkdir(DATA_DIR, { recursive: true });
    await createTestTerminal();
  });

  it("driver receives state on join", async () => {
    const ws = await createWS();
    const msgPromise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: "join", role: "driver", terminal: "ws-test", room: "room1" }));
    const msg = await msgPromise;
    assert.strictEqual(msg.type, "state");
    assert.strictEqual(msg.currentScreen, "main");
    assert.strictEqual(msg.terminal.id, "ws-test");
    ws.close();
  });

  it("passenger receives state on join after driver", async () => {
    const driver = await createWS();
    const driverMsg = waitForMessage(driver);
    driver.send(JSON.stringify({ type: "join", role: "driver", terminal: "ws-test", room: "room2" }));
    await driverMsg;

    const passenger = await createWS();
    const passengerMsg = waitForMessage(passenger);
    passenger.send(JSON.stringify({ type: "join", role: "passenger", room: "room2" }));
    const msg = await passengerMsg;
    assert.strictEqual(msg.type, "state");
    assert.strictEqual(msg.currentScreen, "main");

    driver.close();
    passenger.close();
  });

  it("passenger receives navigate when driver navigates", async () => {
    const driver = await createWS();
    const driverMsg = waitForMessage(driver);
    driver.send(JSON.stringify({ type: "join", role: "driver", terminal: "ws-test", room: "room3" }));
    await driverMsg;

    const passenger = await createWS();
    const passengerState = waitForMessage(passenger);
    passenger.send(JSON.stringify({ type: "join", role: "passenger", room: "room3" }));
    await passengerState;

    const navPromise = waitForMessage(passenger);
    driver.send(JSON.stringify({ type: "navigate", screen: "next" }));
    const nav = await navPromise;
    assert.strictEqual(nav.type, "navigate");
    assert.strictEqual(nav.screen, "next");

    driver.close();
    passenger.close();
  });

  it("scroll events are broadcast to passengers", async () => {
    const driver = await createWS();
    const driverMsg = waitForMessage(driver);
    driver.send(JSON.stringify({ type: "join", role: "driver", terminal: "ws-test", room: "room4" }));
    await driverMsg;

    const passenger = await createWS();
    const passengerState = waitForMessage(passenger);
    passenger.send(JSON.stringify({ type: "join", role: "passenger", room: "room4" }));
    await passengerState;

    const scrollPromise = waitForMessage(passenger);
    driver.send(JSON.stringify({ type: "scroll", y: 150 }));
    const scroll = await scrollPromise;
    assert.strictEqual(scroll.type, "scroll");
    assert.strictEqual(scroll.y, 150);

    driver.close();
    passenger.close();
  });
});
