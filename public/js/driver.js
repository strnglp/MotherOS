import { createCRTScreen, renderContent, getAllLinks, setHeaderFooter } from "./crt-renderer.js";
import { createWSClient } from "./ws-client.js";
import { slowType } from "./slow-type.js";
import { setupImageReveals } from "./image-reveal.js";
import { preloadAudio, startTypingSound, stopTypingSound, playNavSound } from "./audio.js";

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
  let animating = false;

  const ws = createWSClient({
    onOpen() {
      ws.send({ type: "join", role: "driver", terminal: terminalId, room });
    },
    onMessage(msg) {
      if (msg.type === "state") {
        terminal = msg.terminal;
        settings = terminal.defaults || {};
        crt = createCRTScreen(container, settings);
        document.fonts.ready.then(() => setTimeout(() => navigateTo(msg.currentScreen, false), 1000));
      }
      if (msg.type === "navigate") {
        // Acknowledgement from server, already handled locally
      }
    },
  });

  function navigateTo(screenId, broadcast = true) {
    if (!terminal) return;

    if (screenId.toLowerCase() === "return") {
      if (history.length > 0) {
        const prev = history.pop();
        currentScreen = null;
        navigateTo(prev, true);
      }
      return;
    }

    // Case-insensitive screen lookup
    if (!terminal.screens[screenId]) {
      const match = Object.keys(terminal.screens).find((k) => k.toLowerCase() === screenId.toLowerCase());
      if (match) screenId = match;
      else return;
    }

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
        if (animating) {
          if (cancelTyping) cancelTyping();
          cancelTyping = null;
          animating = false;
          stopTypingSound();
          ws.send({ type: "skip" });
          updateSelection();
          return;
        }
        playNavSound(effectiveSettings);
        navigateTo(link.target);
      },
      onLinkHover: (link) => {
        if (animating) return;
        selectedIndex = links.findIndex((l) => l.id === link.id);
        updateSelection();
      },
    });

    // Start reveals
    if (cancelTyping) cancelTyping();
    cancelTyping = null;
    animating = true;
    startTypingSound(effectiveSettings);
    cancelTyping = slowType(crt.content, screen.content, effectiveSettings, () => {
      stopTypingSound();
      animating = false;
    });
    setupImageReveals(crt.content, terminal.id, effectiveSettings);

    if (broadcast) {
      ws.send({ type: "navigate", screen: screenId, header: screen.header || navHints });
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
        if (selectedIndex === 0) {
          crt.content.scrollTop = 0;
        } else if (selectedIndex === links.length - 1) {
          crt.content.scrollTop = crt.content.scrollHeight;
        } else {
          target.scrollIntoView({ block: "nearest" });
        }
      }
      ws.send({ type: "select", linkId: links[selectedIndex].id });
    }
    crt.content.classList.add("kb-active");
  }

  document.addEventListener("mousemove", (e) => {
    if (!crt) return;
    crt.content.classList.remove("kb-active");
    // If hovering a navigable item, hide .selected; otherwise show it
    const hovering = e.target.closest?.(".crt-line.navigable");
    if (hovering) {
      const sel = crt.content.querySelector(".crt-line.selected");
      if (sel && sel !== hovering) sel.classList.remove("selected");
    } else {
      // Mouse left menu items — re-apply selection
      if (!crt.content.querySelector(".crt-line.selected") && links[selectedIndex]) {
        const target = crt.content.querySelector(`[data-link-id="${links[selectedIndex].id}"]`);
        if (target) target.classList.add("selected");
      }
    }
  });


  document.addEventListener("keydown", (e) => {
    if (!crt) return;

    // Any key finishes animation
    if (animating) {
      e.preventDefault();
      if (cancelTyping) cancelTyping();
      cancelTyping = null;
      animating = false;
      stopTypingSound();
      ws.send({ type: "skip" });
      updateSelection();
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (links.length > 0 && selectedIndex > 0) {
          selectedIndex--;
          updateSelection();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (links.length > 0 && selectedIndex < links.length - 1) {
          selectedIndex++;
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
          currentScreen = null;
          navigateTo(prev, true);
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
