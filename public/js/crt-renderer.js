import { createNoiseCanvas } from "./barrel-distortion.js";

export function createCRTScreen(container, settings = {}) {
  const defaults = {
    colorForeground: "#00ff33",
    colorBackground: "#001a00",
    colorGlow: "#00ff33",
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
  style.setProperty("--glow", s.colorGlow);
  style.setProperty("--glow-radius", `${s.glowRadius}px`);
  style.setProperty("--glow-opacity", `${Math.round(s.glowIntensity * 50)}%`);
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
  const { selectedLinkId, onLinkClick } = options;

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
        span.textContent = lines[i] || " ";
        if (!lines[i]) span.style.height = "1.4em";

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
        span.textContent = item.label;
        span.dataset.linkId = `${block.id || "menu"}-${i}`;
        span.dataset.target = item.target;
        if (span.dataset.linkId === selectedLinkId) {
          span.classList.add("selected");
        }
        if (onLinkClick) {
          span.addEventListener("click", () => onLinkClick({ id: span.dataset.linkId, target: item.target }));
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
