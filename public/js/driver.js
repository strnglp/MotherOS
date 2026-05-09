import { createCRTScreen, renderContent, getAllLinks, setHeaderFooter } from "./crt-renderer.js";
import { createWSClient } from "./ws-client.js";
import { slowType } from "./slow-type.js";
import { revealAllImages } from "./image-reveal.js";
import { preloadAudio, startTypingSound, stopTypingSound, playNavSound } from "./audio.js";
import { injectBarrelFilter } from "./barrel-distortion.js";

export function initDriver(container, { terminal: terminalId, room }) {
  preloadAudio();

  let terminal = null;
  let currentScreen = null;
  let settings = {};
  let links = [];
  let selectedIndex = 0;
  let cancelTyping = null;
  let crt = null;
  let history = [];

  const ws = createWSClient({
    onOpen() {
      ws.send({ type: "join", role: "driver", terminal: terminalId, room });
    },
    onMessage(msg) {
      if (msg.type === "state") {
        terminal = msg.terminal;
        settings = terminal.defaults || {};
        injectBarrelFilter(settings.curvatureAmount || 0.03);
        crt = createCRTScreen(container, settings);
        navigateTo(msg.currentScreen, false);
      }
      if (msg.type === "navigate") {
        // Acknowledgement from server, already handled locally
      }
    },
  });

  function navigateTo(screenId, broadcast = true) {
    if (!terminal || !terminal.screens[screenId]) return;

    if (currentScreen) {
      history.push(currentScreen);
    }

    currentScreen = screenId;
    const screen = terminal.screens[screenId];
    const effectiveSettings = { ...settings, ...screen.overrides };

    crt.update(effectiveSettings);

    const navHints = history.length > 0 ? "[ESC] BACK  [↑↓] SELECT  [ENTER] GO" : "[↑↓] SELECT  [ENTER] GO";
    setHeaderFooter(crt, { header: screen.header || navHints, footer: screen.footer }, terminal);

    links = getAllLinks(screen.content);
    selectedIndex = 0;

    renderContent(crt.content, screen.content, {
      selectedLinkId: links[0]?.id,
      onLinkClick: (link) => {
        playNavSound(effectiveSettings);
        navigateTo(link.target);
      },
    });

    // Start reveals
    if (cancelTyping) cancelTyping();
    startTypingSound(effectiveSettings);
    cancelTyping = slowType(crt.content, screen.content, effectiveSettings, () => {
      stopTypingSound();
    });
    revealAllImages(crt.content, terminal.id);

    if (broadcast) {
      ws.send({ type: "navigate", screen: screenId });
      playNavSound(effectiveSettings);
    }
  }

  function updateSelection() {
    const navigables = crt.content.querySelectorAll(".crt-line.navigable");
    navigables.forEach((el) => el.classList.remove("selected"));
    if (links[selectedIndex]) {
      const target = crt.content.querySelector(`[data-link-id="${links[selectedIndex].id}"]`);
      if (target) {
        target.classList.add("selected");
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }

  document.addEventListener("keydown", (e) => {
    if (!crt) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (links.length > 0) {
          selectedIndex = (selectedIndex - 1 + links.length) % links.length;
          updateSelection();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (links.length > 0) {
          selectedIndex = (selectedIndex + 1) % links.length;
          updateSelection();
        }
        break;
      case "Enter":
        e.preventDefault();
        if (links[selectedIndex]) {
          const effectiveSettings = { ...settings, ...terminal.screens[currentScreen]?.overrides };
          playNavSound(effectiveSettings);
          navigateTo(links[selectedIndex].target);
        }
        break;
      case "Escape":
        e.preventDefault();
        if (history.length > 0) {
          const prev = history.pop();
          currentScreen = null; // prevent double-push
          navigateTo(prev);
          history.pop(); // remove the re-pushed entry
        }
        break;
      case "PageUp":
        e.preventDefault();
        crt.content.scrollBy(0, -200);
        ws.send({ type: "scroll", y: crt.content.scrollTop });
        break;
      case "PageDown":
        e.preventDefault();
        crt.content.scrollBy(0, 200);
        ws.send({ type: "scroll", y: crt.content.scrollTop });
        break;
    }
  });
}
