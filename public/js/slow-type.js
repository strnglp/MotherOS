function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorize(text) {
  return escapeHtml(text)
    .replace(/\*([^*]+)\*/g, '<span class="crt-alert">$1</span>')
    .replace(/\/([^/]+)\//g, '<span class="crt-highlight">$1</span>');
}

export function slowType(contentEl, contentBlocks, settings = {}, onComplete) {
  const { slowTypeSpeed = 0.03, slowTypeBatchSize = 5 } = settings;

  if (typeof contentBlocks === "string") {
    contentBlocks = [{ type: "text", value: contentBlocks }];
  }

  const typeable = contentBlocks.filter((b) => b.type === "text" || b.type === "menu");
  const preElements = contentEl.querySelectorAll("pre");

  // Build a flat list of characters to reveal across all typeable blocks
  const segments = [];
  let preIdx = 0;
  for (const block of typeable) {
    const pre = preElements[preIdx];
    if (!pre) { preIdx++; continue; }

    if (block.type === "text") {
      segments.push({ pre, text: block.value, type: "text" });
    } else if (block.type === "menu") {
      const fullText = block.items.map((item) => item.label).join("\n");
      segments.push({ pre, text: fullText, type: "menu" });
    }
    preIdx++;
  }

  // Hide all initially
  for (const seg of segments) {
    updateVisibility(seg.pre, seg.text, 0);
  }

  let segIndex = 0;
  let charIndex = 0;
  let cancel = false;

  function tick() {
    if (cancel) return;
    if (segIndex >= segments.length) {
      onComplete?.();
      return;
    }

    const seg = segments[segIndex];
    const batch = Math.ceil(Math.random() * slowTypeBatchSize) + 1;
    charIndex = Math.min(charIndex + batch, seg.text.length);

    updateVisibility(seg.pre, seg.text, charIndex);

    if (charIndex >= seg.text.length) {
      segIndex++;
      charIndex = 0;
    }

    setTimeout(tick, slowTypeSpeed * 1000);
  }

  tick();

  return () => {
    cancel = true;
    for (const seg of segments) {
      updateVisibility(seg.pre, seg.text, seg.text.length);
    }
    onComplete?.();
  };
}

const colorizeCache = new Map();

function cachedColorize(text) {
  if (!text) return " ";
  if (colorizeCache.has(text)) return colorizeCache.get(text);
  const result = colorize(text);
  colorizeCache.set(text, result);
  return result;
}

function updateVisibility(pre, fullText, visibleChars) {
  const lines = fullText.split("\n");
  const spans = pre.querySelectorAll(".crt-line");
  let charCount = 0;

  for (let i = 0; i < spans.length; i++) {
    const lineText = lines[i] || "";
    const lineStart = charCount;
    const lineEnd = charCount + lineText.length;

    if (lineStart >= visibleChars) {
      spans[i].textContent = "";
      spans[i].style.visibility = "hidden";
    } else if (lineEnd <= visibleChars) {
      spans[i].innerHTML = cachedColorize(lineText);
      spans[i].style.visibility = "visible";
    } else {
      // Partial line — use textContent (no colorize, avoids broken tags)
      spans[i].textContent = lineText.substring(0, visibleChars - lineStart);
      spans[i].style.visibility = "visible";
    }

    charCount = lineEnd + 1;
  }
}
