import { createCRTScreen, renderContent, setHeaderFooter } from "./crt-renderer.js";
import { createWSClient } from "./ws-client.js";
import { slowType } from "./slow-type.js";
import { revealAllImages } from "./image-reveal.js";
import { preloadAudio, startTypingSound, stopTypingSound, playNavSound } from "./audio.js";
import { injectBarrelFilter } from "./barrel-distortion.js";

export function initPassenger(container, { room }) {
  preloadAudio();

  let terminal = null;
  let settings = {};
  let crt = null;
  let cancelTyping = null;

  const ws = createWSClient({
    onOpen() {
      ws.send({ type: "join", role: "passenger", room });
    },
    onMessage(msg) {
      if (msg.type === "state") {
        terminal = msg.terminal;
        settings = terminal.defaults || {};
        injectBarrelFilter(settings.curvatureAmount || 0.03);
        crt = createCRTScreen(container, settings);

        const screen = terminal.screens[msg.currentScreen];
        if (screen) {
          showScreen(screen);
        }
      }

      if (msg.type === "navigate") {
        if (!crt) return;
        const effectiveSettings = { ...settings, ...(msg.overrides || {}) };
        crt.update(effectiveSettings);
        playNavSound(effectiveSettings);

        renderContent(crt.content, msg.content, {});

        if (cancelTyping) cancelTyping();
        startTypingSound(effectiveSettings);
        cancelTyping = slowType(crt.content, msg.content, effectiveSettings, () => {
          stopTypingSound();
        });
        revealAllImages(crt.content, terminal?.id, effectiveSettings);
      }

      if (msg.type === "scroll") {
        if (crt) {
          crt.content.scrollTop = msg.y;
        }
      }
    },
  });

  function showScreen(screen) {
    const effectiveSettings = { ...settings, ...screen.overrides };
    crt.update(effectiveSettings);
    setHeaderFooter(crt, screen, terminal);
    renderContent(crt.content, screen.content, {});

    if (cancelTyping) cancelTyping();
    startTypingSound(effectiveSettings);
    cancelTyping = slowType(crt.content, screen.content, effectiveSettings, () => {
      stopTypingSound();
    });
    revealAllImages(crt.content, terminal?.id, effectiveSettings);
  }
}
