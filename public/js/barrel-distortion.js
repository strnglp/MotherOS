const VERTEX_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_scanlineSpacing;
uniform float u_scanlineSpeed;
uniform float u_vignetteIntensity;
uniform float u_flickerIntensity;
uniform float u_noiseIntensity;
uniform float u_glowRadius;
uniform float u_glowIntensity;
uniform vec2 u_resolution;

// Barrel distortion
vec2 curveUV(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
  uv += uv * offset * offset * u_curvature * 33.0;
  uv = uv * 0.5 + 0.5;
  return uv;
}

// Pseudo-random
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = curveUV(v_uv);

  // Outside curved screen = black
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Sample source texture
  vec3 color = texture2D(u_texture, uv).rgb;

  // Glow/bloom: multi-sample box blur at varying distances
  if (u_glowIntensity > 0.0) {
    vec3 bloom = vec3(0.0);
    float px = u_glowRadius / u_resolution.x;
    float py = u_glowRadius / u_resolution.y;
    float total = 0.0;
    for (float x = -3.0; x <= 3.0; x += 1.0) {
      for (float y = -3.0; y <= 3.0; y += 1.0) {
        float d = length(vec2(x, y));
        if (d > 3.0) continue;
        float weight = 1.0 - d / 3.5;
        bloom += texture2D(u_texture, uv + vec2(x * px, y * py)).rgb * weight;
        total += weight;
      }
    }
    bloom /= total;
    color += bloom * u_glowIntensity * 0.5;
  }

  // Scanlines
  if (u_scanlineIntensity > 0.0) {
    float scanline = sin((uv.y * u_resolution.y / u_scanlineSpacing + u_time * u_scanlineSpeed) * 3.14159) * 0.5 + 0.5;
    color *= 1.0 - scanline * u_scanlineIntensity;
  }

  // Vignette
  if (u_vignetteIntensity > 0.0) {
    vec2 vig = uv * (1.0 - uv);
    float vigFactor = vig.x * vig.y * 15.0;
    vigFactor = pow(vigFactor, u_vignetteIntensity * 0.5);
    color *= vigFactor;
  }

  // Flicker
  if (u_flickerIntensity > 0.0) {
    float flicker = 1.0 - u_flickerIntensity * rand(vec2(u_time, 0.0));
    color *= flicker;
  }

  // Noise
  if (u_noiseIntensity > 0.0) {
    float noise = rand(uv + u_time) * u_noiseIntensity;
    color += vec3(noise) - u_noiseIntensity * 0.5;
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export function createCRTRenderer(container, width, height) {
  const glCanvas = document.createElement("canvas");
  glCanvas.width = width;
  glCanvas.height = height;
  glCanvas.style.cssText = "width:100%;height:100%;display:block;border-radius:20px;";
  container.appendChild(glCanvas);

  const gl = glCanvas.getContext("webgl", { alpha: false });
  if (!gl) return null;

  const program = buildProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
  gl.useProgram(program);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    u_texture: gl.getUniformLocation(program, "u_texture"),
    u_time: gl.getUniformLocation(program, "u_time"),
    u_curvature: gl.getUniformLocation(program, "u_curvature"),
    u_scanlineIntensity: gl.getUniformLocation(program, "u_scanlineIntensity"),
    u_scanlineSpacing: gl.getUniformLocation(program, "u_scanlineSpacing"),
    u_scanlineSpeed: gl.getUniformLocation(program, "u_scanlineSpeed"),
    u_vignetteIntensity: gl.getUniformLocation(program, "u_vignetteIntensity"),
    u_flickerIntensity: gl.getUniformLocation(program, "u_flickerIntensity"),
    u_noiseIntensity: gl.getUniformLocation(program, "u_noiseIntensity"),
    u_glowRadius: gl.getUniformLocation(program, "u_glowRadius"),
    u_glowIntensity: gl.getUniformLocation(program, "u_glowIntensity"),
    u_resolution: gl.getUniformLocation(program, "u_resolution"),
  };

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.uniform1i(uniforms.u_texture, 0);
  gl.uniform2f(uniforms.u_resolution, width, height);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const ctx = sourceCanvas.getContext("2d");

  function resize(w, h) {
    glCanvas.width = w;
    glCanvas.height = h;
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.u_resolution, w, h);
  }

  function setSettings(s) {
    gl.uniform1f(uniforms.u_curvature, s.curvatureAmount || 0);
    gl.uniform1f(uniforms.u_scanlineIntensity, s.scanlineIntensity || 0);
    gl.uniform1f(uniforms.u_scanlineSpacing, s.scanlineSpacing || 3);
    gl.uniform1f(uniforms.u_scanlineSpeed, s.scanlineSpeed || 0);
    gl.uniform1f(uniforms.u_vignetteIntensity, s.vignetteIntensity || 0);
    gl.uniform1f(uniforms.u_flickerIntensity, s.flickerIntensity || 0);
    gl.uniform1f(uniforms.u_noiseIntensity, s.noiseIntensity || 0);
    gl.uniform1f(uniforms.u_glowRadius, s.glowRadius || 0);
    gl.uniform1f(uniforms.u_glowIntensity, s.glowIntensity || 0);
  }

  function render(time) {
    gl.uniform1f(uniforms.u_time, time * 0.001);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { glCanvas, ctx, sourceCanvas, resize, setSettings, render };
}

function buildProgram(gl, vSrc, fSrc) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vSrc);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fSrc);
  gl.compileShader(fs);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return prog;
}
