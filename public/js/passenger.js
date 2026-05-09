import { createCRTScreen, renderContent, setHeaderFooter, getAllLinks } from "./crt-renderer.js";
import { createWSClient } from "./ws-client.js";
import { slowType } from "./slow-type.js";
import { revealAllImages } from "./image-reveal.js";
import { preloadAudio, startTypingSound, stopTypingSound, playNavSound } from "./audio.js";

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
        crt = createCRTScreen(container, settings);
        crt.screen.classList.add("crt-passenger");

        const screen = terminal.screens[msg.currentScreen];
        if (screen) {
          document.fonts.ready.then(() => showScreen(screen));
        }
      }

      if (msg.type === "navigate") {
        if (!crt) return;
        const screen = terminal.screens[msg.screen];
        const effectiveSettings = { ...settings, ...(msg.overrides || {}) };
        crt.update(effectiveSettings);
        setHeaderFooter(crt, { header: msg.header || screen?.header, footer: screen?.footer }, terminal);
        playNavSound(effectiveSettings);

        const links = getAllLinks(msg.content);
        renderContent(crt.content, msg.content, { selectedLinkId: links[0]?.id });

        if (cancelTyping) cancelTyping();
        startTypingSound(effectiveSettings);
        cancelTyping = slowType(crt.content, msg.content, effectiveSettings, () => {
          stopTypingSound();
        });
        revealAllImages(crt.content, terminal?.id, effectiveSettings);
      }

      if (msg.type === "skip") {
        if (cancelTyping) cancelTyping();
        cancelTyping = null;
        stopTypingSound();
      }

      if (msg.type === "select") {
        if (!crt) return;
        const navigables = crt.content.querySelectorAll(".crt-line.navigable");
        navigables.forEach((el) => el.classList.remove("selected"));
        const target = crt.content.querySelector(`[data-link-id="${msg.linkId}"]`);
        if (target) target.classList.add("selected");
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
    const navHints = "[↑↓] SELECT  [ENTER] GO";
    setHeaderFooter(crt, { header: screen.header || navHints, footer: screen.footer }, terminal);
    crt.content.classList.add("keyboard-active");
    const links = getAllLinks(screen.content);
    renderContent(crt.content, screen.content, { selectedLinkId: links[0]?.id });

    if (cancelTyping) cancelTyping();
    startTypingSound(effectiveSettings);
    cancelTyping = slowType(crt.content, screen.content, effectiveSettings, () => {
      stopTypingSound();
    });
    revealAllImages(crt.content, terminal?.id, effectiveSettings);
  }
}
