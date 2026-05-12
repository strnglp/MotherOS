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

  // Build segments from all elements that need revealing: header, content blocks, dividers, footer
  const segments = [];
  const inner = contentEl.closest(".crt-inner");

  // Header
  const headerEl = inner?.querySelector(".crt-header");
  if (headerEl && headerEl.style.display !== "none" && headerEl.dataset.fullText) {
    segments.push({ type: "header", el: headerEl, text: headerEl.dataset.fullText });
  }

  // Content children: dividers, pre (text/menu), images, footer
  let blockIdx = 0;
  for (const child of contentEl.children) {
    if (child.classList.contains("crt-divider")) {
      segments.push({ type: "divider", el: child });
    } else if (child.classList.contains("crt-footer")) {
      segments.push({ type: "footer", el: child, text: child.dataset.fullText || child.textContent });
    } else if (child.classList.contains("crt-image-canvas")) {
      segments.push({ type: "image", el: child });
    } else if (child.tagName === "PRE") {
      const block = typeable[blockIdx];
      let text;
      if (block?.type === "text") {
        text = block.value;
      } else if (block?.type === "menu") {
        text = block.items.map((item) => item.label).join("\n");
      } else {
        text = Array.from(child.querySelectorAll(".crt-line")).map((l) => l.innerText || " ").join("\n");
      }
      segments.push({ type: "text", el: child, pre: child, text });
      blockIdx++;
    }
  }

  // Hide all initially
  for (const seg of segments) {
    if (seg.type === "header" || seg.type === "footer") {
      seg.el.style.visibility = "hidden";
      seg.el.textContent = "";
    } else if (seg.type === "divider") {
      seg.el.style.visibility = "hidden";
    } else if (seg.type === "image") {
      seg.el.style.visibility = "hidden";
    } else if (seg.type === "text") {
      updatePreVisibility(seg.pre, seg.text, 0);
    }
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

    if (seg.type === "divider") {
      seg.el.style.visibility = "visible";
      segIndex++;
      charIndex = 0;
      setTimeout(tick, slowTypeSpeed * 1000);
      return;
    }

    if (seg.type === "image") {
      seg.el.style.visibility = "visible";
      seg.el.dispatchEvent(new CustomEvent("startReveal"));
      segIndex++;
      charIndex = 0;
      setTimeout(tick, slowTypeSpeed * 1000);
      return;
    }

    if (seg.type === "header" || seg.type === "footer") {
      seg.el.style.visibility = "visible";
      const batch = Math.ceil(Math.random() * slowTypeBatchSize) + 1;
      charIndex = Math.min(charIndex + batch, seg.text.length);
      seg.el.textContent = seg.text.substring(0, charIndex).toUpperCase();
      if (charIndex >= seg.text.length) {
        segIndex++;
        charIndex = 0;
      }
      setTimeout(tick, slowTypeSpeed * 1000);
      return;
    }

    // Text/menu block
    const batch = Math.ceil(Math.random() * slowTypeBatchSize) + 1;
    charIndex = Math.min(charIndex + batch, seg.text.length);
    updatePreVisibility(seg.pre, seg.text, charIndex);

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
      if (seg.type === "header" || seg.type === "footer") {
        seg.el.style.visibility = "visible";
        seg.el.textContent = seg.text.toUpperCase();
      } else if (seg.type === "divider") {
        seg.el.style.visibility = "visible";
      } else if (seg.type === "image") {
        seg.el.style.visibility = "visible";
        seg.el.dispatchEvent(new CustomEvent("startReveal"));
      } else if (seg.type === "text") {
        updatePreVisibility(seg.pre, seg.text, seg.text.length);
      }
    }
    onComplete?.();
  };
}

const colorizeCache = new Map();

function partialColorize(fullLine, rawCharsVisible) {
  // Parse the full line to find paired delimiters, then reveal chars without showing delimiters
  const tokens = [];
  let i = 0;
  while (i < fullLine.length) {
    if (fullLine[i] === "*") {
      const end = fullLine.indexOf("*", i + 1);
      if (end !== -1) {
        tokens.push({ type: "alert", text: fullLine.substring(i + 1, end), rawStart: i, rawEnd: end + 1 });
        i = end + 1;
        continue;
      }
    }
    if (fullLine[i] === "/") {
      const end = fullLine.indexOf("/", i + 1);
      if (end !== -1) {
        tokens.push({ type: "highlight", text: fullLine.substring(i + 1, end), rawStart: i, rawEnd: end + 1 });
        i = end + 1;
        continue;
      }
    }
    // Find next delimiter or end
    let next = fullLine.length;
    const nextStar = fullLine.indexOf("*", i);
    const nextSlash = fullLine.indexOf("/", i);
    if (nextStar !== -1 && nextStar < next) next = nextStar;
    if (nextSlash !== -1 && nextSlash < next) next = nextSlash;
    tokens.push({ type: "normal", text: fullLine.substring(i, next), rawStart: i, rawEnd: next });
    i = next;
  }

  // Build output up to rawCharsVisible
  let html = "";
  for (const token of tokens) {
    if (token.rawStart >= rawCharsVisible) break;
    const rawVisible = Math.min(rawCharsVisible, token.rawEnd) - token.rawStart;
    // How many content chars are visible (exclude delimiters)
    let contentVisible;
    if (token.type === "normal") {
      contentVisible = rawVisible;
    } else {
      // Delimiters are 1 char each at start and end
      contentVisible = Math.max(0, rawVisible - 1); // skip opening delimiter
      contentVisible = Math.min(contentVisible, token.text.length); // cap at content length
    }
    if (contentVisible <= 0) continue;
    const visibleText = escapeHtml(token.text.substring(0, contentVisible));
    if (token.type === "alert") {
      html += `<span class="crt-alert">${visibleText}</span>`;
    } else if (token.type === "highlight") {
      html += `<span class="crt-highlight">${visibleText}</span>`;
    } else {
      html += visibleText;
    }
  }
  return html;
}

function cachedColorize(text) {
  if (!text) return " ";
  if (colorizeCache.has(text)) return colorizeCache.get(text);
  const result = colorize(text);
  colorizeCache.set(text, result);
  return result;
}

function updatePreVisibility(pre, fullText, visibleChars) {
  const lines = fullText.split("\n");
  const spans = pre.querySelectorAll(".crt-line");
  let charCount = 0;

  for (let i = 0; i < spans.length; i++) {
    const lineText = lines[i] || "";
    const lineStart = charCount;
    const lineEnd = charCount + lineText.length;

    if (lineStart >= visibleChars) {
      spans[i].innerHTML = "";
      spans[i].style.visibility = "hidden";
    } else if (lineEnd <= visibleChars) {
      spans[i].innerHTML = cachedColorize(lineText);
      spans[i].style.visibility = "visible";
    } else {
      const rawPartial = lineText.substring(0, visibleChars - lineStart);
      spans[i].innerHTML = partialColorize(lineText, rawPartial.length);
      spans[i].style.visibility = "visible";
    }

    charCount = lineEnd + 1;
  }
}
