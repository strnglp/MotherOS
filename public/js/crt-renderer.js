import { createCRTRenderer } from "./barrel-distortion.js";

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
  content.appendChild(footer);

  screen.appendChild(inner);
  container.appendChild(screen);

  // Set up WebGL renderer
  let renderer = null;
  const rect = screen.getBoundingClientRect();
  const w = Math.round(rect.width) || 800;
  const h = Math.round(rect.height) || 600;
  renderer = createCRTRenderer(screen, w, h);
  if (renderer) {
    renderer.glCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:15;pointer-events:none;border-radius:20px;";
    renderer.setSettings(s);
    inner.style.opacity = "0";
    inner.style.zIndex = "16";
    document.fonts.ready.then(() => startRenderLoop(renderer, inner, screen, s));
  }

  applySettings(screen, content, s);

  return { screen, content, header, footer, renderer, update: (newSettings) => {
    Object.assign(s, newSettings);
    if (renderer?._settings) Object.assign(renderer._settings, s);
    applySettings(screen, content, s);
  }};
}

function startRenderLoop(renderer, inner, screen, settings) {
  renderer._settings = settings;
  let running = true;

  function paint(time) {
    if (!running) return;

    const { ctx, sourceCanvas } = renderer;
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    // Check if resize needed
    const rect = screen.getBoundingClientRect();
    const rw = Math.round(rect.width);
    const rh = Math.round(rect.height);
    if (rw > 0 && rh > 0 && (rw !== w || rh !== h)) {
      renderer.resize(rw, rh);
    }

    const cw = sourceCanvas.width;
    const ch = sourceCanvas.height;

    // Clear with background
    ctx.fillStyle = settings.colorBackground || "#001a00";
    ctx.fillRect(0, 0, cw, ch);

    // Draw text/images from DOM state onto 2D canvas
    ctx.save();
    renderDOMToCanvas(ctx, inner, cw, ch, settings);
    ctx.restore();

    // Push to WebGL (shader applies scanlines, vignette, glow, noise, flicker, curvature)
    renderer.render(time);

    requestAnimationFrame(paint);
  }

  paint();

  renderer.glCanvas.destroy = () => { running = false; };
}

function renderDOMToCanvas(ctx, inner, w, h, settings) {
  const fg = settings.colorForeground || "#00ff33";
  const glow = computeGlow(fg);
  const fontSize = settings.fontSize || 18;
  const fontFamily = settings.fontFamily || "monospace";
  const font = `${fontSize}px "${fontFamily}", monospace`;
  const lineHeight = fontSize * 1.4;

  ctx.font = font;
  ctx.textBaseline = "top";

  const screenRect = inner.closest(".crt-screen").getBoundingClientRect();

  // Header
  const headerEl = inner.querySelector(".crt-header");
  if (headerEl && headerEl.style.display !== "none" && headerEl.style.visibility !== "hidden") {
    const r = headerEl.getBoundingClientRect();
    const x = r.left - screenRect.left;
    const y = r.top - screenRect.top;
    drawGlowText(ctx, headerEl.textContent.toUpperCase(), x, y, fg, glow, settings.glowRadius * settings.glowIntensity);
    // Border
    ctx.strokeStyle = fg + "4d";
    ctx.beginPath();
    ctx.moveTo(x, y + r.height);
    ctx.lineTo(x + r.width, y + r.height);
    ctx.stroke();
  }

  // Content
  const contentEl = inner.querySelector(".crt-content");
  if (contentEl) {
    for (const child of contentEl.children) {
      if (child.classList.contains("crt-divider")) {
        if (child.style.visibility === "hidden") continue;
        const r = child.getBoundingClientRect();
        const x = r.left - screenRect.left;
        const y = r.top - screenRect.top;
        ctx.strokeStyle = fg + "4d";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + r.width, y);
        ctx.stroke();
      } else if (child.classList.contains("crt-image-canvas")) {
        if (child.width > 0 && child.height > 0) {
          const r = child.getBoundingClientRect();
          const x = r.left - screenRect.left;
          const y = r.top - screenRect.top;
          ctx.drawImage(child, x, y, r.width, r.height);
        }
      } else {
        const blockFont = child.style.fontFamily
          ? `${fontSize}px ${child.style.fontFamily}`
          : font;
        ctx.font = blockFont;

        const lines = child.querySelectorAll(".crt-line");
        for (const line of lines) {
          if (line.style.visibility === "hidden") continue;
          const text = line.innerText.toUpperCase();
          if (!text.trim() && line.style.height) continue;

          const r = line.getBoundingClientRect();
          const x = r.left - screenRect.left;
          const y = r.top - screenRect.top;

          if (line.classList.contains("selected")) {
            ctx.fillStyle = fg;
            ctx.fillRect(x - 4, y - 2, r.width + 8, lineHeight);
            ctx.fillStyle = settings.colorBackground || "#001a00";
            ctx.font = blockFont;
            drawGlowText(ctx, text, x, y, settings.colorBackground || "#001a00", settings.colorBackground || "#001a00", 0);
          } else {
            ctx.font = blockFont;
            drawGlowText(ctx, text, x, y, fg, glow, settings.glowRadius * settings.glowIntensity);
          }
        }
      }
    }
  }

  // Footer
  const footerEl = inner.querySelector(".crt-footer");
  if (footerEl && footerEl.style.display !== "none" && footerEl.style.visibility !== "hidden") {
    const r = footerEl.getBoundingClientRect();
    const x = r.left - screenRect.left;
    const y = r.top - screenRect.top;
    // Border
    ctx.strokeStyle = fg + "4d";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r.width, y);
    ctx.stroke();
    drawGlowText(ctx, footerEl.textContent.toUpperCase(), x, y + 4, fg, glow, settings.glowRadius * settings.glowIntensity);
  }
}

function drawGlowText(ctx, text, x, y, color, glowColor, radius) {
  const charWidth = ctx.measureText("MMMMMMMMMM").width / 10;

  if (radius > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = radius;
  }
  ctx.fillStyle = color;

  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x + i * charWidth, y);
  }

  ctx.shadowBlur = 0;
}

function applySettings(screen, content, s) {
  const style = screen.style;
  style.setProperty("--fg", s.colorForeground);
  style.setProperty("--bg", s.colorBackground);
  style.setProperty("--font-size", `${s.fontSize}px`);
  content.style.fontFamily = `"${s.fontFamily}", monospace`;
}

export function renderContent(contentEl, contentBlocks, options = {}) {
  // Preserve footer if it's inside content
  const footer = contentEl.querySelector(".crt-footer");
  contentEl.innerHTML = "";
  const { selectedLinkId, onLinkClick, onLinkHover } = options;

  if (typeof contentBlocks === "string") {
    contentBlocks = [{ type: "text", value: contentBlocks }];
  }

  for (const block of contentBlocks) {
    if (block.divider) {
      const hr = document.createElement("hr");
      hr.className = "crt-divider";
      hr.style.visibility = "hidden";
      contentEl.appendChild(hr);
    }

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
      if (block.width) canvas.style.width = `${block.width}px`;
      contentEl.appendChild(canvas);
    }
  }

  // Re-append footer at end of content
  if (footer) contentEl.appendChild(footer);
}

export function setHeaderFooter(crt, screen, terminal = null) {
  const header = screen.header || terminal?.defaultHeader;
  const footer = screen.footer || terminal?.defaultFooter;

  if (header) {
    crt.header.dataset.fullText = header;
    crt.header.textContent = "";
    crt.header.style.display = "";
    const hFont = screen.headerFont || terminal?.defaultHeaderFont;
    crt.header.style.fontFamily = hFont ? `"${hFont}", monospace` : "";
  } else {
    crt.header.style.display = "none";
  }
  if (footer) {
    crt.footer.dataset.fullText = footer;
    crt.footer.textContent = "";
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
