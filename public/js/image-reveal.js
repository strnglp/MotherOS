const RESOLUTION_STEPS = [0.01, 0.02, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1.0];

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
  try {
    const fg = parseColor(fgColor);
    const bg = parseColor(bgColor);
    const glow = parseColor(glowColor || fgColor);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let maxBri = 0;
    let minBri = 765;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum > maxBri) maxBri = sum;
      if (sum < minBri) minBri = sum;
    }
    const range = maxBri - minBri || 1;

    // Pixels below 5% brightness = bg, rest blend glow→fg
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const raw = (data[i] + data[i + 1] + data[i + 2] - minBri) / range;
      if (raw <= 0.05) {
        data[i] = bg[0];
        data[i + 1] = bg[1];
        data[i + 2] = bg[2];
      } else {
        const t = (raw - 0.05) / 0.95;
        // Bias toward fg
        const lifted = 0.75 * Math.sqrt(Math.sqrt(t)) + 0.25 * t;
        data[i] = glow[0] + (fg[0] - glow[0]) * lifted;
        data[i + 1] = glow[1] + (fg[1] - glow[1]) * lifted;
        data[i + 2] = glow[2] + (fg[2] - glow[2]) * lifted;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  } catch (e) {
    console.warn("Palette apply failed:", e.message);
  }
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
  const glowColor = settings.colorGlow || fgColor;

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
