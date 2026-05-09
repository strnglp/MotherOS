const RESOLUTION_STEPS = [0.01, 0.02, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1.0];

export function revealImage(canvas, options = {}) {
  const { src, revealStyle = "pixelate", revealSpeed = 150, blendMode = "normal", palette = null, terminalId = null } = options;

  canvas.style.mixBlendMode = blendMode;

  const img = new Image();
  let imgSrc;
  if (src.startsWith("http") || src.startsWith("/")) {
    imgSrc = src;
  } else {
    const filename = src.replace(/^assets\//, "");
    imgSrc = terminalId ? `/assets/${terminalId}/${filename}` : src;
  }
  img.crossOrigin = "anonymous";

  return new Promise((resolve) => {
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");

      if (revealStyle === "instant") {
        ctx.drawImage(img, 0, 0);
        if (palette) applyPalette(ctx, canvas.width, canvas.height, palette);
        resolve();
        return;
      }

      if (revealStyle === "scanline") {
        animateScanline(ctx, img, canvas.width, canvas.height, revealSpeed, palette, resolve);
        return;
      }

      // pixelate (default)
      animatePixelate(ctx, img, canvas.width, canvas.height, revealSpeed, palette, resolve);
    };

    img.onerror = () => resolve();
    img.src = imgSrc;
  });
}

function animatePixelate(ctx, img, w, h, speed, palette, resolve) {
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

    // Draw scaled down to offscreen, then scale back up
    const offscreen = new OffscreenCanvas(sw, sh);
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(img, 0, 0, sw, sh);

    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);

    if (palette) applyPalette(ctx, w, h, palette);

    step++;
    setTimeout(tick, speed);
  }

  tick();
}

function animateScanline(ctx, img, w, h, speed, palette, resolve) {
  const linesPerTick = Math.max(1, Math.floor(h / 60));
  let y = 0;

  ctx.drawImage(img, 0, 0);
  const fullData = ctx.getImageData(0, 0, w, h);
  ctx.clearRect(0, 0, w, h);

  function tick() {
    if (y >= h) {
      if (palette) applyPalette(ctx, w, h, palette);
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

function applyPalette(ctx, w, h, palette) {
  const colors = getPaletteColors(palette);
  if (!colors) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const closest = findClosestColor(data[i], data[i + 1], data[i + 2], colors);
    data[i] = closest[0];
    data[i + 1] = closest[1];
    data[i + 2] = closest[2];
  }

  ctx.putImageData(imageData, 0, 0);
}

function getPaletteColors(palette) {
  if (palette === "phosphor") {
    return [
      [0, 40, 0],
      [0, 80, 0],
      [0, 128, 20],
      [0, 200, 40],
      [0, 255, 51],
      [100, 255, 120],
    ];
  }
  if (palette === "amber") {
    return [
      [40, 20, 0],
      [80, 50, 0],
      [160, 100, 0],
      [220, 160, 0],
      [255, 200, 0],
      [255, 230, 100],
    ];
  }
  return null;
}

function findClosestColor(r, g, b, colors) {
  let minDist = Infinity;
  let closest = colors[0];
  for (const c of colors) {
    const dist = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }
  return closest;
}

export function revealAllImages(container, terminalId) {
  const canvases = container.querySelectorAll(".crt-image-canvas");
  const promises = [];
  for (const canvas of canvases) {
    promises.push(
      revealImage(canvas, {
        src: canvas.dataset.src,
        revealStyle: canvas.dataset.revealStyle,
        revealSpeed: Number(canvas.dataset.revealSpeed) || 150,
        blendMode: canvas.dataset.blendMode,
        palette: canvas.dataset.palette || null,
        terminalId,
      })
    );
  }
  return Promise.all(promises);
}
