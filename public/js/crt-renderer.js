import { createNoiseCanvas } from "./barrel-distortion.js";

function computeGlow(hex) {
  const h = (hex || "#00ff33").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue, sat, lit = (max + min) / 2;

  if (max === min) {
    hue = sat = 0;
  } else {
    const d = max - min;
    sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
  }

  // Shift hue 30deg, darken to 40% lightness, boost saturation
  const shiftedHue = (hue + 30 / 360) % 1.0;
  const shiftedLit = lit * 0.4;
  const shiftedSat = Math.min(1, sat * 1.2);

  const hsl2rgb = (h2, s2, l2) => {
    if (s2 === 0) return [l2, l2, l2];
    const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
    const p = 2 * l2 - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    return [hue2rgb(h2 + 1/3), hue2rgb(h2), hue2rgb(h2 - 1/3)];
  };

  const [ro, go, bo] = hsl2rgb(shiftedHue, shiftedSat, shiftedLit);
  return `#${Math.round(ro * 255).toString(16).padStart(2, "0")}${Math.round(go * 255).toString(16).padStart(2, "0")}${Math.round(bo * 255).toString(16).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorize(text) {
  return escapeHtml(text)
    .replace(/\*([^*]+)\*/g, '<span class="crt-alert">$1</span>')
    .replace(/\/([^/]+)\//g, '<span class="crt-highlight">$1</span>');
}

export function createCRTScreen(container, settings = {}) {
  const defaults = {
    colorForeground: "#00ff33",
    colorBackground: "#001a00",
    colorAlert: "#ff3333",
    colorHighlight: "#ffb000",
    glowIntensity: 0.8,
    glowRadius: 8,
    scanlineIntensity: 0.15,
    scanlineSpacing: 3,
    scanlineSpeed: 0.5,
    curvatureAmount: 0.03,
    vignetteIntensity: 0.4,
    flickerIntensity: 0.03,
    flickerSpeed: 60,
    noiseIntensity: 0.05,
    fontSize: 18,
    fontFamily: "monospace",
    cursorBlink: true,
    cursorBlinkSpeed: 530,
    cursorChar: "█",
  };

  const s = { ...defaults, ...settings };
  container.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = "crt-screen crt-bezel";

  const inner = document.createElement("div");
  inner.className = "crt-inner";

  const header = document.createElement("div");
  header.className = "crt-header";
  header.style.display = "none";

  const content = document.createElement("div");
  content.className = "crt-content";

  const footer = document.createElement("div");
  footer.className = "crt-footer";
  footer.style.display = "none";

  inner.appendChild(header);
  inner.appendChild(content);
  inner.appendChild(footer);

  const noiseCanvas = createNoiseCanvas();
  noiseCanvas.className = "crt-noise";

  screen.appendChild(inner);
  screen.appendChild(noiseCanvas);
  container.appendChild(screen);

  applySettings(screen, content, s);

  return { screen, content, header, footer, update: (newSettings) => applySettings(screen, content, { ...s, ...newSettings }) };
}

function applySettings(screen, content, s) {
  const style = screen.style;
  style.setProperty("--fg", s.colorForeground);
  style.setProperty("--bg", s.colorBackground);
  style.setProperty("--glow", computeGlow(s.colorForeground));
  style.setProperty("--alert", s.colorAlert || "#ff3333");
  style.setProperty("--alert-glow", computeGlow(s.colorAlert || "#ff3333"));
  style.setProperty("--highlight", s.colorHighlight || "#ffff00");
  style.setProperty("--highlight-glow", computeGlow(s.colorHighlight || "#ffff00"));
  const r = s.glowRadius * s.glowIntensity;
  const glowVal = computeGlow(s.colorForeground);
  style.setProperty("--glow-radius", `${s.glowRadius}px`);
  style.setProperty("--text-glow", r > 0 ? `0 0 ${r}px ${glowVal}` : "none");
  style.setProperty("--scanline-intensity", s.scanlineIntensity);
  style.setProperty("--scanline-spacing", `${s.scanlineSpacing}px`);
  style.setProperty("--vignette-intensity", s.vignetteIntensity);
  style.setProperty("--flicker-min", 1 - s.flickerIntensity);
  style.setProperty("--flicker-speed", `${s.flickerSpeed}ms`);
  style.setProperty("--noise-intensity", s.noiseIntensity);
  style.setProperty("--font-size", `${s.fontSize}px`);
  style.setProperty("--cursor-blink-speed", `${s.cursorBlinkSpeed}ms`);

  const scrollSpeed = s.scanlineSpeed > 0 ? (s.scanlineSpacing / s.scanlineSpeed) * 16.67 : 999999;
  style.setProperty("--scanline-duration", `${scrollSpeed}ms`);

  content.style.fontFamily = `"${s.fontFamily}", monospace`;

  const noise = screen.querySelector(".crt-noise");
  if (noise) {
    noise.style.opacity = s.noiseIntensity;
  }
}

export function renderContent(contentEl, contentBlocks, options = {}) {
  contentEl.innerHTML = "";
  const { selectedLinkId, onLinkClick, onLinkHover } = options;

  if (typeof contentBlocks === "string") {
    contentBlocks = [{ type: "text", value: contentBlocks }];
  }

  for (const block of contentBlocks) {
    if (block.type === "text") {
      const pre = document.createElement("pre");
      if (block.fontFamily) pre.style.fontFamily = `"${block.fontFamily}", monospace`;
      const lines = block.value.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const span = document.createElement("span");
        span.className = "crt-line";
        if (!lines[i]) {
          span.textContent = " ";
          span.style.height = "1.4em";
        } else {
          span.innerHTML = colorize(lines[i]);
        }

        const link = block.links?.find((l) => l.line === i);
        if (link) {
          span.classList.add("navigable");
          span.dataset.linkId = link.id;
          span.dataset.target = link.target;
          if (link.id === selectedLinkId) {
            span.classList.add("selected");
          }
          if (onLinkClick) {
            span.addEventListener("click", () => onLinkClick(link));
          }
          if (onLinkHover) {
            span.addEventListener("mouseenter", () => onLinkHover(link));
          }
        }
        pre.appendChild(span);
      }
      contentEl.appendChild(pre);
    } else if (block.type === "menu") {
      const nav = document.createElement("pre");
      nav.className = "crt-menu";
      if (block.fontFamily) nav.style.fontFamily = `"${block.fontFamily}", monospace`;
      for (let i = 0; i < block.items.length; i++) {
        const item = block.items[i];
        const span = document.createElement("span");
        span.className = "crt-line crt-menu-item navigable";
        span.innerHTML = colorize(item.label);
        span.dataset.linkId = `${block.id || "menu"}-${i}`;
        span.dataset.target = item.target;
        if (span.dataset.linkId === selectedLinkId) {
          span.classList.add("selected");
        }
        if (onLinkClick) {
          span.addEventListener("click", () => onLinkClick({ id: span.dataset.linkId, target: item.target }));
        }
        if (onLinkHover) {
          span.addEventListener("mouseenter", () => onLinkHover({ id: span.dataset.linkId, target: item.target }));
        }
        nav.appendChild(span);
      }
      contentEl.appendChild(nav);
    } else if (block.type === "image") {
      const canvas = document.createElement("canvas");
      canvas.className = "crt-image-canvas";
      canvas.dataset.src = block.src;
      canvas.dataset.revealStyle = block.revealStyle || "pixelate";
      canvas.dataset.revealSpeed = block.revealSpeed || 150;
      canvas.dataset.blendMode = block.blendMode || "normal";
      contentEl.appendChild(canvas);
    }
  }
}

export function setHeaderFooter(crt, screen, terminal = null) {
  const header = screen.header || terminal?.defaultHeader;
  const footer = screen.footer || terminal?.defaultFooter;

  if (header) {
    crt.header.textContent = header;
    crt.header.style.display = "";
    const hFont = screen.headerFont || terminal?.defaultHeaderFont;
    crt.header.style.fontFamily = hFont ? `"${hFont}", monospace` : "";
  } else {
    crt.header.style.display = "none";
  }
  if (footer) {
    crt.footer.textContent = footer;
    crt.footer.style.display = "";
    const fFont = screen.footerFont || terminal?.defaultFooterFont;
    crt.footer.style.fontFamily = fFont ? `"${fFont}", monospace` : "";
  } else {
    crt.footer.style.display = "none";
  }
}

export function getAllLinks(contentBlocks) {
  if (typeof contentBlocks === "string") return [];
  const links = [];
  for (const block of contentBlocks) {
    if (block.type === "text" && block.links) {
      links.push(...block.links);
    } else if (block.type === "menu") {
      for (let i = 0; i < block.items.length; i++) {
        links.push({ id: `${block.id || "menu"}-${i}`, target: block.items[i].target });
      }
    }
  }
  return links;
}
