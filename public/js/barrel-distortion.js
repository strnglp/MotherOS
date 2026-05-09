export function injectBarrelFilter(amount = 0.03) {
  if (document.getElementById("barrel-distortion-svg")) return;

  const scale = Math.round(amount * 1000);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "barrel-distortion-svg";
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";

  svg.innerHTML = `
    <defs>
      <filter id="barrel-distortion" x="-10%" y="-10%" width="120%" height="120%">
        <feImage href="data:image/svg+xml,${encodeURIComponent(createDisplacementMap())}" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  `;

  document.body.appendChild(svg);
}

function createDisplacementMap() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <defs>
      <radialGradient id="rg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgb(128,128,0)"/>
        <stop offset="100%" stop-color="rgb(128,128,0)"/>
      </radialGradient>
    </defs>
    <rect width="200" height="200" fill="rgb(128,128,0)"/>
    <circle cx="100" cy="100" r="100" fill="url(#rg)"/>
  </svg>`;
}

export function createNoiseCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  let animFrame;

  function drawNoise() {
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 40;
    }
    ctx.putImageData(imageData, 0, 0);
    animFrame = requestAnimationFrame(drawNoise);
  }

  drawNoise();

  canvas.destroy = () => cancelAnimationFrame(animFrame);
  return canvas;
}

export function updateBarrelAmount(amount) {
  const svg = document.getElementById("barrel-distortion-svg");
  if (svg) {
    svg.remove();
  }
  if (amount > 0) {
    injectBarrelFilter(amount);
  }
}
