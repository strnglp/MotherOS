const AUDIO_BASE = "/audio/";

const PRESETS = {
  teletext: "teletext.mp3",
  "dot-matrix": "dot-matrix.wav",
  "digital-beep": "digital-beep.mp3",
  "arcade-blip": "arcade-blip.wav",
  "terminal-confirm": "terminal-confirm.wav",
};

export function preloadAudio() {
  for (const [name, file] of Object.entries(PRESETS)) {
    const audio = new Audio(getSrc(name));
    audio.preload = "auto";
    audio.load();
  }
}

function getSrc(nameOrPath) {
  if (nameOrPath.startsWith("/") || nameOrPath.startsWith("http")) {
    return nameOrPath;
  }
  if (PRESETS[nameOrPath]) {
    return `${AUDIO_BASE}${PRESETS[nameOrPath]}`;
  }
  return `${AUDIO_BASE}${nameOrPath}`;
}

function createAudio(nameOrPath) {
  return new Audio(getSrc(nameOrPath));
}

let currentLoop = null;

export function startTypingSound(settings = {}) {
  const { soundEnabled = true, soundVolume = 0.7, typingSound = "teletext", typingSoundRate = 1.0 } = settings;

  if (!soundEnabled) return;

  stopTypingSound();

  const audio = createAudio(typingSound);
  audio.loop = true;
  audio.volume = soundVolume;
  audio.playbackRate = typingSoundRate;
  audio.play().catch(() => {});
  currentLoop = audio;
}

export function stopTypingSound() {
  if (currentLoop) {
    currentLoop.pause();
    currentLoop.currentTime = 0;
    currentLoop = null;
  }
}

export function playNavSound(settings = {}) {
  const { soundEnabled = true, soundVolume = 0.7, navSound = "digital-beep" } = settings;

  if (!soundEnabled || !navSound) return;

  const audio = createAudio(navSound);
  audio.volume = soundVolume;
  audio.play().catch(() => {});
}

let previewAudio = null;

export function playPreview(soundName, volume = 0.7, rate = 1.0) {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewAudio = null;
    return false;
  }

  const audio = createAudio(soundName);
  audio.loop = true;
  audio.volume = volume;
  audio.playbackRate = rate;
  audio.play().catch(() => {});
  previewAudio = audio;
  return true;
}

export function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewAudio = null;
  }
}

export function playOnce(soundName, volume = 0.7) {
  const audio = createAudio(soundName);
  audio.volume = volume;
  audio.play().catch(() => {});
}
