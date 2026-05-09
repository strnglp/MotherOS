const RESOLUTION_STEPS = [0.01, 0.02, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1.0];

function computeGlowHex(hex) {
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
    const p2 = 2 * l2 - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p2 + (q - p2) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p2 + (q - p2) * (2/3 - t) * 6;
      return p2;
    };
    return [hue2rgb(h2 + 1/3), hue2rgb(h2), hue2rgb(h2 - 1/3)];
  };

  const [ro, go, bo] = hsl2rgb(shiftedHue, shiftedSat, shiftedLit);
  return `#${Math.round(ro * 255).toString(16).padStart(2, "0")}${Math.round(go * 255).toString(16).padStart(2, "0")}${Math.round(bo * 255).toString(16).padStart(2, "0")}`;
}

export function revealImage(canvas, options = {}) {
  const { src, revealStyle = "pixelate", revealSpeed = 150, blendMode = "normal", terminalId = null, fgColor = null, bgColor = null, glowColor = null } = options;

  canvas.style.mixBlendMode = blendMode;

  const img = new Image();
  let imgSrc;
  if (!src) { return Promise.resolve(); }
  if (src.startsWith("http") || src.startsWith("/")) {
    imgSrc = src;
  } else {
    const filename = src.replace(/^assets\//, "");
    imgSrc = terminalId ? `/assets/${terminalId}/${filename}` : src;
  }

  return new Promise((resolve) => {
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (revealStyle === "instant") {
        ctx.drawImage(img, 0, 0);
        applyPalette(ctx, canvas.width, canvas.height, fgColor, bgColor, glowColor);
        resolve();
        return;
      }

      if (revealStyle === "scanline") {
        animateScanline(ctx, img, canvas.width, canvas.height, revealSpeed, fgColor, bgColor, glowColor, resolve);
        return;
      }

      // pixelate (default)
      animatePixelate(ctx, img, canvas.width, canvas.height, revealSpeed, fgColor, bgColor, glowColor, resolve);
    };

    img.onerror = () => resolve();
    img.src = imgSrc;
  });
}

function animatePixelate(ctx, img, w, h, speed, fgColor, bgColor, glowColor, resolve) {
  let step = 0;

  function tick() {
    if (step >= RESOLUTION_STEPS.length) {
      resolve();
      return;
    }

    const factor = RESOLUTION_STEPS[step];
    const sw = Math.max(1, Math.floor(w * factor));
    const sh = Math.max(1, Math.floor(h * factor));

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    const offscreen = new OffscreenCanvas(sw, sh);
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(img, 0, 0, sw, sh);

    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);

    applyPalette(ctx, w, h, fgColor, bgColor, glowColor);

    step++;
    setTimeout(tick, speed);
  }

  tick();
}

function animateScanline(ctx, img, w, h, speed, fgColor, bgColor, glowColor, resolve) {
  const linesPerTick = Math.max(1, Math.floor(h / 60));
  let y = 0;

  ctx.drawImage(img, 0, 0);
  const fullData = ctx.getImageData(0, 0, w, h);
  ctx.clearRect(0, 0, w, h);

  function tick() {
    if (y >= h) {
      applyPalette(ctx, w, h, fgColor, bgColor, glowColor);
      resolve();
      return;
    }

    const chunk = Math.min(linesPerTick, h - y);
    const sliceData = ctx.createImageData(w, chunk);
    const srcOffset = y * w * 4;
    sliceData.data.set(fullData.data.subarray(srcOffset, srcOffset + w * chunk * 4));
    ctx.putImageData(sliceData, 0, y);

    y += chunk;
    setTimeout(tick, speed / 4);
  }

  tick();
}

function applyPalette(ctx, w, h, fgColor, bgColor, glowColor) {
  const fg = parseColor(fgColor);
  const bg = parseColor(bgColor);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    data[i] = bg[0] + (fg[0] - bg[0]) * r;
    data[i + 1] = bg[1] + (fg[1] - bg[1]) * g;
    data[i + 2] = bg[2] + (fg[2] - bg[2]) * b;
  }

  ctx.putImageData(imageData, 0, 0);
}

function parseColor(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function revealAllImages(container, terminalId, settings = {}) {
  const canvases = container.querySelectorAll(".crt-image-canvas");
  // Read actual colors from CSS custom properties as ground truth
  const screen = container.closest(".crt-screen");
  const computedFg = screen ? getComputedStyle(screen).getPropertyValue("--fg").trim() : null;
  const computedBg = screen ? getComputedStyle(screen).getPropertyValue("--bg").trim() : null;
  const fgColor = settings.colorForeground || computedFg || "#00ff33";
  const bgColor = settings.colorBackground || computedBg || "#001a00";
  const glowColor = computeGlowHex(fgColor);

  const promises = [];
  for (const canvas of canvases) {
    promises.push(
      revealImage(canvas, {
        src: canvas.dataset.src,
        revealStyle: canvas.dataset.revealStyle,
        revealSpeed: Number(canvas.dataset.revealSpeed) || 150,
        blendMode: canvas.dataset.blendMode,
        terminalId,
        fgColor,
        bgColor,
        glowColor,
      })
    );
  }
  return Promise.all(promises);
}
