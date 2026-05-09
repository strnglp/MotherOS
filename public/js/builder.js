import { createCRTScreen, renderContent, setHeaderFooter } from "./crt-renderer.js";
import { listTerminals, getTerminal, createTerminal, updateTerminal, deleteTerminal, uploadAsset } from "./api-client.js";
import { playPreview, stopPreview, playOnce, preloadAudio } from "./audio.js";
import { injectBarrelFilter } from "./barrel-distortion.js";
import { revealAllImages } from "./image-reveal.js";

export async function initBuilder(container) {
  preloadAudio();

  let terminals = [];
  let activeTerminal = null;
  let activeScreenId = null;

  container.innerHTML = `
    <div class="builder-layout">
      <div class="builder-header">
        <h1>CRT Terminal Builder</h1>
        <div class="actions">
          <button id="btn-launch">Launch</button>
          <button id="btn-export">Export</button>
          <button id="btn-import">Import</button>
        </div>
      </div>
      <div class="builder-sidebar" id="sidebar"></div>
      <div class="builder-center">
        <div class="builder-preview-container" id="preview-container"></div>
        <div class="builder-editor" id="editor-panel"></div>
      </div>
      <div class="builder-settings" id="settings-panel"></div>
    </div>
  `;

  const sidebar = document.getElementById("sidebar");
  const previewContainer = document.getElementById("preview-container");
  const editorPanel = document.getElementById("editor-panel");
  const settingsPanel = document.getElementById("settings-panel");

  const FONT_OPTIONS = ["", "VT323", "Share Tech Mono", "Space Mono", "DotGothic16", "Silkscreen", "Press Start 2P", "Doto", "Martian Mono", "Sometype Mono", "Fira Code", "IBM Plex Mono", "monospace"];

  function createFontSelect(currentValue, onChange) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;";
    const lbl = document.createElement("label");
    lbl.textContent = "Font:";
    lbl.style.cssText = "font-size:11px;color:#666;";
    const select = document.createElement("select");
    select.style.fontSize = "11px";
    for (const f of FONT_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f || "(default)";
      if (currentValue === f) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => onChange(select.value || null));
    wrapper.appendChild(lbl);
    wrapper.appendChild(select);
    return wrapper;
  }

  async function refresh() {
    terminals = await listTerminals();
    renderSidebar();
  }

  function renderSidebar() {
    sidebar.innerHTML = "";
    for (const t of terminals) {
      const group = document.createElement("div");
      group.className = "terminal-group";

      const name = document.createElement("div");
      name.className = "terminal-name";
      name.textContent = t.name || t.id;
      name.addEventListener("click", () => loadTerminal(t.id));
      name.addEventListener("dblclick", async () => {
        const newName = prompt("Rename terminal:", activeTerminal?.name || t.name || t.id);
        if (!newName) return;
        if (!activeTerminal || activeTerminal.id !== t.id) await loadTerminal(t.id);
        activeTerminal.name = newName;
        save();
        refresh();
      });
      group.appendChild(name);

      if (activeTerminal && activeTerminal.id === t.id) {
        const list = document.createElement("ul");
        list.className = "screen-list";

        const defaultsItem = document.createElement("li");
        defaultsItem.className = "screen-item";
        if (activeScreenId === null) defaultsItem.classList.add("active");
        defaultsItem.textContent = "⚙ defaults";
        defaultsItem.addEventListener("click", () => selectTerminalDefaults());
        list.appendChild(defaultsItem);

        for (const screenId of Object.keys(activeTerminal.screens)) {
          const item = document.createElement("li");
          item.className = "screen-item";
          item.style.display = "flex";
          item.style.alignItems = "center";
          item.style.justifyContent = "space-between";
          if (screenId === activeScreenId) item.classList.add("active");
          if (screenId === activeTerminal.entryScreen) item.classList.add("entry");

          const itemLabel = document.createElement("span");
          itemLabel.textContent = screenId;
          itemLabel.style.flex = "1";
          itemLabel.addEventListener("click", () => selectScreen(screenId));
          itemLabel.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            const newId = prompt("Rename screen:", screenId);
            if (!newId || newId === screenId) return;
            // Move screen data to new key
            activeTerminal.screens[newId] = activeTerminal.screens[screenId];
            delete activeTerminal.screens[screenId];
            // Update entry screen reference
            if (activeTerminal.entryScreen === screenId) activeTerminal.entryScreen = newId;
            // Update all link targets pointing to old name
            for (const s of Object.values(activeTerminal.screens)) {
              const content = Array.isArray(s.content) ? s.content : [];
              for (const block of content) {
                if (block.type === "text" && block.links) {
                  for (const link of block.links) {
                    if (link.target === screenId) link.target = newId;
                  }
                }
                if (block.type === "menu" && block.items) {
                  for (const item of block.items) {
                    if (item.target === screenId) item.target = newId;
                  }
                }
              }
            }
            if (activeScreenId === screenId) activeScreenId = newId;
            save();
            renderSidebar();
            selectScreen(activeScreenId);
          });
          item.appendChild(itemLabel);

          if (screenId !== activeTerminal.entryScreen) {
            const delBtn = document.createElement("button");
            delBtn.textContent = "×";
            delBtn.style.cssText = "font-size:12px;padding:0 4px;border:none;color:#666;background:none;cursor:pointer;";
            delBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (!confirm(`Delete screen "${screenId}"?`)) return;
              delete activeTerminal.screens[screenId];
              if (activeScreenId === screenId) {
                activeScreenId = activeTerminal.entryScreen || Object.keys(activeTerminal.screens)[0];
              }
              save();
              renderSidebar();
              if (activeScreenId) selectScreen(activeScreenId);
            });
            item.appendChild(delBtn);
          }

          item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showScreenContextMenu(e, screenId);
          });
          list.appendChild(item);
        }
        group.appendChild(list);

        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Screen";
        addBtn.style.marginTop = "4px";
        addBtn.style.fontSize = "11px";
        addBtn.addEventListener("click", addScreen);
        group.appendChild(addBtn);
      }

      sidebar.appendChild(group);
    }

    const addTermBtn = document.createElement("button");
    addTermBtn.textContent = "+ Terminal";
    addTermBtn.style.marginTop = "12px";
    addTermBtn.addEventListener("click", addNewTerminal);
    sidebar.appendChild(addTermBtn);
  }

  async function loadTerminal(id) {
    activeTerminal = await getTerminal(id);
    activeScreenId = activeTerminal.entryScreen || Object.keys(activeTerminal.screens)[0];
    renderSidebar();
    selectScreen(activeScreenId);
  }

  function selectScreen(screenId) {
    activeScreenId = screenId;
    renderSidebar();
    renderEditor();
    renderPreview();
    renderSettings();
  }

  function selectTerminalDefaults() {
    activeScreenId = null;
    renderSidebar();
    renderPreview();

    editorPanel.innerHTML = "";

    const desc = document.createElement("p");
    desc.style.cssText = "color:#888;font-size:13px;margin-bottom:12px;";
    desc.textContent = "Editing terminal defaults. These apply to all screens unless overridden.";
    editorPanel.appendChild(desc);

    const headerLabel = document.createElement("label");
    headerLabel.textContent = "Default Header";
    editorPanel.appendChild(headerLabel);
    const headerInput = document.createElement("input");
    headerInput.type = "text";
    headerInput.placeholder = "Shown on all screens (optional)";
    headerInput.value = activeTerminal.defaultHeader || "";
    headerInput.style.width = "100%";
    headerInput.style.marginBottom = "12px";
    headerInput.addEventListener("input", () => {
      activeTerminal.defaultHeader = headerInput.value || null;
      save();
      renderPreview();
    });
    editorPanel.appendChild(headerInput);
    editorPanel.appendChild(createFontSelect(activeTerminal.defaultHeaderFont || "", (val) => {
      activeTerminal.defaultHeaderFont = val;
      save();
      renderPreview();
    }));

    const footerLabel = document.createElement("label");
    footerLabel.textContent = "Default Footer";
    footerLabel.style.marginTop = "12px";
    editorPanel.appendChild(footerLabel);
    const footerInput = document.createElement("input");
    footerInput.type = "text";
    footerInput.placeholder = "Shown on all screens (optional)";
    footerInput.value = activeTerminal.defaultFooter || "";
    footerInput.style.width = "100%";
    footerInput.addEventListener("input", () => {
      activeTerminal.defaultFooter = footerInput.value || null;
      save();
      renderPreview();
    });
    editorPanel.appendChild(footerInput);
    editorPanel.appendChild(createFontSelect(activeTerminal.defaultFooterFont || "", (val) => {
      activeTerminal.defaultFooterFont = val;
      save();
      renderPreview();
    }));

    renderSettings();
  }

  function renderPreview() {
    if (!activeTerminal) return;

    if (!activeScreenId) {
      // Defaults preview
      const settings = { ...getDefaultSettings(), ...activeTerminal.defaults };
      injectBarrelFilter(settings.curvatureAmount || 0.03);
      const crt = createCRTScreen(previewContainer, settings);
      const sampleContent = [
        { type: "text", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ\n0123456789 !@#$%^&*()\n\nThe quick brown fox jumps\nover the lazy dog." },
        { type: "menu", id: "sample-menu", items: [
          { label: "Menu Item One", target: "" },
          { label: "Menu Item Two", target: "" },
          { label: "Menu Item Three", target: "" },
        ]},
      ];
      setHeaderFooter(crt, { header: activeTerminal.defaultHeader || "HEADER PREVIEW", footer: activeTerminal.defaultFooter || "FOOTER PREVIEW" }, activeTerminal);
      renderContent(crt.content, sampleContent, { selectedLinkId: "sample-menu-1" });
      return;
    }

    const screen = activeTerminal.screens[activeScreenId];
    if (!screen) return;

    const settings = { ...getDefaultSettings(), ...activeTerminal.defaults, ...screen.overrides };
    injectBarrelFilter(settings.curvatureAmount || 0.03);
    const crt = createCRTScreen(previewContainer, settings);
    setHeaderFooter(crt, screen, activeTerminal);
    renderContent(crt.content, screen.content, {});
    revealAllImages(crt.content, activeTerminal.id, settings);
  }

  function renderEditor() {
    if (!activeTerminal || !activeScreenId) {
      editorPanel.innerHTML = "<p style='color:#666'>Select a screen to edit</p>";
      return;
    }
    const screen = activeTerminal.screens[activeScreenId];

    editorPanel.innerHTML = "";

    // Header input
    const headerLabel = document.createElement("label");
    headerLabel.textContent = "Header";
    editorPanel.appendChild(headerLabel);
    const headerInput = document.createElement("input");
    headerInput.type = "text";
    headerInput.placeholder = "Single line header (optional)";
    headerInput.value = screen.header || "";
    headerInput.style.width = "100%";
    headerInput.style.marginBottom = "8px";
    headerInput.addEventListener("input", () => {
      screen.header = headerInput.value || null;
      save();
      renderPreview();
    });
    editorPanel.appendChild(headerInput);
    editorPanel.appendChild(createFontSelect(screen.headerFont || "", (val) => {
      screen.headerFont = val;
      save();
      renderPreview();
    }));

    const label = document.createElement("label");
    label.textContent = "Screen Content";
    editorPanel.appendChild(label);

    // Content blocks editor
    const blocksContainer = document.createElement("div");
    blocksContainer.className = "content-blocks";

    const content = normalizeContent(screen.content);

    content.forEach((block, idx) => {
      const blockEl = document.createElement("div");
      blockEl.className = `content-block ${block.type === "image" ? "image-block" : ""}`;

      const header = document.createElement("div");
      header.className = "block-header";
      header.innerHTML = `<span>${block.type.toUpperCase()} BLOCK ${idx + 1}</span>`;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "X";
      removeBtn.addEventListener("click", () => {
        content.splice(idx, 1);
        screen.content = content;
        save();
        renderEditor();
        renderPreview();
      });
      header.appendChild(removeBtn);
      blockEl.appendChild(header);

      if (block.type === "text") {
        const textarea = document.createElement("textarea");
        textarea.value = block.value;
        textarea.rows = Math.max(3, block.value.split("\n").length);
        textarea.addEventListener("input", () => {
          block.value = textarea.value;
          screen.content = content;
          save();
          renderPreview();
        });
        blockEl.appendChild(textarea);
        blockEl.appendChild(createFontSelect(block.fontFamily || "", (val) => {
          block.fontFamily = val;
          screen.content = content;
          save();
          renderPreview();
        }));

        // Links for this text block
        const linksDiv = document.createElement("div");
        linksDiv.className = "links-editor";
        linksDiv.innerHTML = "<label>Links</label>";
        (block.links || []).forEach((link, li) => {
          const row = document.createElement("div");
          row.className = "link-row";
          const lineText = block.value.split("\n")[link.line] || "";
          row.innerHTML = `
            <span class="link-id">"${lineText.trim()}"</span>
            <span class="link-target">→ ${link.target}</span>
          `;
          const delBtn = document.createElement("button");
          delBtn.textContent = "X";
          delBtn.addEventListener("click", () => {
            block.links.splice(li, 1);
            screen.content = content;
            save();
            renderEditor();
            renderPreview();
          });
          row.appendChild(delBtn);
          linksDiv.appendChild(row);
        });

        const addLinkBtn = document.createElement("button");
        addLinkBtn.textContent = "+ Link";
        addLinkBtn.addEventListener("click", () => {
          const lines = block.value.split("\n");
          const lineOptions = lines.map((l, i) => `${i}: ${l}`).filter((_, i) => lines[i].trim()).join("\n");
          const lineNum = parseInt(prompt(`Which line is the link?\n\n${lineOptions}`), 10);
          if (isNaN(lineNum) || lineNum >= lines.length) return;

          const screens = Object.keys(activeTerminal.screens).filter((s) => s !== activeScreenId);
          const target = prompt(`Navigate to which screen?\n\nAvailable: ${screens.join(", ")}`);
          if (!target || !activeTerminal.screens[target]) return;

          if (!block.links) block.links = [];
          const id = `${activeScreenId}-to-${target}-${lineNum}`;
          block.links.push({ id, line: lineNum, target, label: lines[lineNum].trim() });
          screen.content = content;
          save();
          renderEditor();
          renderPreview();
        });
        linksDiv.appendChild(addLinkBtn);
        blockEl.appendChild(linksDiv);
      } else if (block.type === "image") {
        const srcInput = document.createElement("input");
        srcInput.type = "text";
        srcInput.placeholder = "Image path or URL";
        srcInput.value = block.src || "";
        srcInput.addEventListener("change", () => {
          block.src = srcInput.value;
          screen.content = content;
          save();
          renderPreview();
        });
        blockEl.appendChild(srcInput);

        const uploadBtn = document.createElement("button");
        uploadBtn.textContent = "Upload";
        uploadBtn.addEventListener("click", async () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.addEventListener("change", async () => {
            const file = input.files[0];
            if (!file) return;
            const result = await uploadAsset(activeTerminal.id, file);
            block.src = result.src;
            srcInput.value = result.src;
            screen.content = content;
            save();
            renderPreview();
          });
          input.click();
        });
        blockEl.appendChild(uploadBtn);
      } else if (block.type === "menu") {
        const itemsList = document.createElement("div");
        itemsList.style.cssText = "display:flex;flex-direction:column;gap:4px;";

        (block.items || []).forEach((item, mi) => {
          const row = document.createElement("div");
          row.className = "link-row";

          const labelInput = document.createElement("input");
          labelInput.type = "text";
          labelInput.value = item.label;
          labelInput.placeholder = "Label";
          labelInput.style.flex = "1";
          labelInput.addEventListener("input", () => {
            item.label = labelInput.value;
            screen.content = content;
            save();
            renderPreview();
          });

          const targetSelect = document.createElement("select");
          const screens = Object.keys(activeTerminal.screens);
          for (const s of screens) {
            if (s === activeScreenId) continue;
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            if (item.target === s) opt.selected = true;
            targetSelect.appendChild(opt);
          }
          targetSelect.addEventListener("change", () => {
            item.target = targetSelect.value;
            screen.content = content;
            save();
            renderPreview();
          });

          const delBtn = document.createElement("button");
          delBtn.textContent = "X";
          delBtn.addEventListener("click", () => {
            block.items.splice(mi, 1);
            screen.content = content;
            save();
            renderEditor();
            renderPreview();
          });

          row.appendChild(labelInput);
          row.appendChild(targetSelect);
          row.appendChild(delBtn);
          itemsList.appendChild(row);
        });

        const addItemBtn = document.createElement("button");
        addItemBtn.textContent = "+ Menu Item";
        addItemBtn.addEventListener("click", () => {
          const screens = Object.keys(activeTerminal.screens).filter((s) => s !== activeScreenId);
          block.items.push({ label: "New Item", target: screens[0] || "" });
          screen.content = content;
          save();
          renderEditor();
          renderPreview();
        });

        blockEl.appendChild(itemsList);
        blockEl.appendChild(addItemBtn);
        blockEl.appendChild(createFontSelect(block.fontFamily || "", (val) => {
          block.fontFamily = val;
          screen.content = content;
          save();
          renderPreview();
        }));
      }

      blocksContainer.appendChild(blockEl);
    });

    editorPanel.appendChild(blocksContainer);

    const addButtons = document.createElement("div");
    addButtons.className = "builder-add-buttons";

    const addTextBtn = document.createElement("button");
    addTextBtn.textContent = "+ Text Block";
    addTextBtn.addEventListener("click", () => {
      content.push({ type: "text", value: "", links: [] });
      screen.content = content;
      save();
      renderEditor();
    });

    const addImageBtn = document.createElement("button");
    addImageBtn.textContent = "+ Image Block";
    addImageBtn.addEventListener("click", () => {
      content.push({ type: "image", src: "", revealStyle: "pixelate", revealSpeed: 150, blendMode: "normal", palette: null });
      screen.content = content;
      save();
      renderEditor();
    });

    const addMenuBtn = document.createElement("button");
    addMenuBtn.textContent = "+ Menu Block";
    addMenuBtn.addEventListener("click", () => {
      content.push({ type: "menu", id: `menu-${Date.now()}`, items: [] });
      screen.content = content;
      save();
      renderEditor();
    });

    addButtons.appendChild(addTextBtn);
    addButtons.appendChild(addMenuBtn);
    addButtons.appendChild(addImageBtn);
    editorPanel.appendChild(addButtons);

    // Footer input
    const footerLabel = document.createElement("label");
    footerLabel.textContent = "Footer";
    footerLabel.style.marginTop = "12px";
    editorPanel.appendChild(footerLabel);
    const footerInput = document.createElement("input");
    footerInput.type = "text";
    footerInput.placeholder = "Single line footer (optional)";
    footerInput.value = screen.footer || "";
    footerInput.style.width = "100%";
    footerInput.addEventListener("input", () => {
      screen.footer = footerInput.value || null;
      save();
      renderPreview();
    });
    editorPanel.appendChild(footerInput);
    editorPanel.appendChild(createFontSelect(screen.footerFont || "", (val) => {
      screen.footerFont = val;
      save();
      renderPreview();
    }));
  }

  function renderSettings() {
    if (!activeTerminal) {
      settingsPanel.innerHTML = "";
      return;
    }
    const screen = activeScreenId ? activeTerminal.screens[activeScreenId] : null;
    const defaults = activeTerminal.defaults || {};
    const overrides = screen?.overrides || {};
    const hasOverride = screen?.overrides != null;
    const editingDefaults = activeScreenId === null;

    const settings = { ...getDefaultSettings(), ...defaults, ...overrides };

    settingsPanel.innerHTML = "";

    if (editingDefaults) {
      const heading = document.createElement("p");
      heading.style.cssText = "font-size:12px;color:var(--fg);margin-bottom:12px;";
      heading.textContent = "TERMINAL DEFAULTS";
      settingsPanel.appendChild(heading);
    } else {
      // Override toggle
      const overrideLabel = document.createElement("label");
      overrideLabel.style.display = "flex";
      overrideLabel.style.alignItems = "center";
      overrideLabel.style.gap = "8px";
      overrideLabel.style.marginBottom = "12px";
      overrideLabel.style.fontSize = "12px";
      overrideLabel.style.color = "#aaa";
      const overrideCheck = document.createElement("input");
      overrideCheck.type = "checkbox";
      overrideCheck.checked = hasOverride;
      overrideCheck.addEventListener("change", () => {
        if (overrideCheck.checked) {
          screen.overrides = {};
        } else {
          screen.overrides = null;
        }
        save();
        renderSettings();
        renderPreview();
      });
      overrideLabel.appendChild(overrideCheck);
      overrideLabel.appendChild(document.createTextNode("Override terminal defaults for this screen"));
      settingsPanel.appendChild(overrideLabel);
    }

    const groups = [
      { name: "Color", settings: [
        { key: "colorForeground", label: "Foreground", type: "color" },
        { key: "colorBackground", label: "Background", type: "color" },
        { key: "colorAlert", label: "Alert *text*", type: "color" },
        { key: "colorHighlight", label: "Highlight /text/", type: "color" },
      ]},
      { name: "Glow", settings: [
        { key: "glowIntensity", label: "Intensity", min: 0, max: 2, step: 0.1 },
        { key: "glowRadius", label: "Radius", min: 0, max: 30, step: 1 },
      ]},
      { name: "Scanlines", settings: [
        { key: "scanlineIntensity", label: "Intensity", min: 0, max: 1, step: 0.05 },
        { key: "scanlineSpacing", label: "Spacing", min: 1, max: 10, step: 1 },
        { key: "scanlineSpeed", label: "Speed", min: 0, max: 5, step: 0.1 },
      ]},
      { name: "Curvature", settings: [
        { key: "curvatureAmount", label: "Amount", min: 0, max: 0.1, step: 0.005 },
      ]},
      { name: "Vignette", settings: [
        { key: "vignetteIntensity", label: "Intensity", min: 0, max: 1, step: 0.05 },
      ]},
      { name: "Flicker", settings: [
        { key: "flickerIntensity", label: "Intensity", min: 0, max: 0.2, step: 0.01 },
        { key: "flickerSpeed", label: "Speed (ms)", min: 16, max: 200, step: 1 },
      ]},
      { name: "Noise", settings: [
        { key: "noiseIntensity", label: "Intensity", min: 0, max: 0.5, step: 0.01 },
      ]},
      { name: "Slow Type", settings: [
        { key: "slowTypeSpeed", label: "Speed (s)", min: 0.01, max: 0.2, step: 0.005 },
        { key: "slowTypeBatchSize", label: "Batch Size", min: 1, max: 20, step: 1 },
      ]},
      { name: "Font", settings: [
        { key: "fontFamily", label: "Family", type: "select", options: FONT_OPTIONS.filter(Boolean) },
        { key: "fontSize", label: "Size (px)", min: 10, max: 32, step: 1 },
      ]},
      { name: "Audio", settings: [
        { key: "soundEnabled", label: "Enabled", type: "checkbox" },
        { key: "soundVolume", label: "Volume", min: 0, max: 1, step: 0.05 },
        { key: "typingSound", label: "Draw Sound", type: "select", options: ["teletext", "dot-matrix"] },
        { key: "typingSoundRate", label: "Pitch", min: 0.5, max: 2, step: 0.1 },
        { key: "navSound", label: "Nav Sound", type: "select", options: ["digital-beep", "arcade-blip", "terminal-confirm", ""] },
      ]},
    ];

    for (const group of groups) {
      const h3 = document.createElement("h3");
      h3.textContent = group.name;
      settingsPanel.appendChild(h3);

      for (const s of group.settings) {
        const row = document.createElement("div");
        row.className = "setting-row";

        const label = document.createElement("label");
        label.textContent = s.label;
        row.appendChild(label);

        if (s.type === "color") {
          const input = document.createElement("input");
          input.type = "color";
          input.value = settings[s.key] || getDefaultSettings()[s.key] || "#00ff33";
          input.addEventListener("input", () => updateSetting(s.key, input.value));
          row.appendChild(input);
        } else if (s.type === "checkbox") {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = settings[s.key] !== false;
          input.addEventListener("change", () => updateSetting(s.key, input.checked));
          row.appendChild(input);
        } else if (s.type === "select") {
          const select = document.createElement("select");
          for (const opt of s.options) {
            const option = document.createElement("option");
            option.value = opt;
            option.textContent = opt || "(none)";
            if (settings[s.key] === opt) option.selected = true;
            select.appendChild(option);
          }
          select.addEventListener("change", () => updateSetting(s.key, select.value));
          row.appendChild(select);
        } else {
          const input = document.createElement("input");
          input.type = "range";
          input.min = s.min;
          input.max = s.max;
          input.step = s.step;
          input.value = settings[s.key] ?? s.min;

          const valueDisplay = document.createElement("span");
          valueDisplay.className = "value-display";
          valueDisplay.textContent = input.value;

          input.addEventListener("input", () => {
            valueDisplay.textContent = parseFloat(input.value).toFixed(s.step < 1 ? 2 : 0);
            updateSetting(s.key, parseFloat(input.value));
          });

          row.appendChild(input);
          row.appendChild(valueDisplay);
        }

        settingsPanel.appendChild(row);
      }
    }

    // Audio preview buttons
    const previewBtn = document.createElement("button");
    previewBtn.textContent = "Preview Draw Sound";
    previewBtn.style.marginTop = "8px";
    previewBtn.addEventListener("click", () => {
      const current = getCurrentSettings();
      const playing = playPreview(current.typingSound || "teletype", current.soundVolume || 0.7, current.typingSoundRate || 1.0);
      previewBtn.textContent = playing ? "Stop" : "Preview Draw Sound";
    });
    settingsPanel.appendChild(previewBtn);

    const navPreviewBtn = document.createElement("button");
    navPreviewBtn.textContent = "Preview Nav Sound";
    navPreviewBtn.style.marginTop = "4px";
    navPreviewBtn.addEventListener("click", () => {
      const current = getCurrentSettings();
      if (current.navSound) {
        playOnce(current.navSound, current.soundVolume || 0.7);
      }
    });
    settingsPanel.appendChild(navPreviewBtn);
  }

  function getCurrentSettings() {
    const screen = activeTerminal?.screens[activeScreenId];
    const defaults = activeTerminal?.defaults || {};
    const overrides = screen?.overrides || {};
    return { ...getDefaultSettings(), ...defaults, ...overrides };
  }

  function updateSetting(key, value) {
    if (!activeScreenId) {
      if (!activeTerminal.defaults) activeTerminal.defaults = {};
      activeTerminal.defaults[key] = value;
    } else {
      const screen = activeTerminal.screens[activeScreenId];
      if (screen?.overrides != null) {
        screen.overrides[key] = value;
      } else {
        if (!activeTerminal.defaults) activeTerminal.defaults = {};
        activeTerminal.defaults[key] = value;
      }
    }
    save();
    renderPreview();
  }

  async function save() {
    if (activeTerminal) {
      await updateTerminal(activeTerminal.id, activeTerminal);
    }
  }

  async function addNewTerminal() {
    const name = prompt("Terminal name:");
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const terminal = {
      id,
      name,
      defaults: getDefaultSettings(),
      screens: {
        main: {
          content: [{ type: "text", value: `  ${name.toUpperCase()}\n  ${"━".repeat(name.length)}\n\n  Welcome.`, links: [] }],
          overrides: null,
        },
      },
      entryScreen: "main",
    };
    await createTerminal(terminal);
    await refresh();
    await loadTerminal(id);
  }

  function addScreen() {
    const rawId = prompt("Screen ID (e.g., 'search'):");
    if (!rawId || !activeTerminal) return;
    const id = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    activeTerminal.screens[id] = {
      content: [{ type: "text", value: `  ${id.toUpperCase()}`, links: [] }],
      overrides: null,
    };
    save();
    renderSidebar();
    selectScreen(id);
  }

  function showScreenContextMenu(e, screenId) {
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#111;border:1px solid #333;padding:4px 0;z-index:1000;`;

    const items = [
      { label: "Set as entry", action: () => { activeTerminal.entryScreen = screenId; save(); renderSidebar(); }},
      { label: "Delete", action: () => {
        if (!confirm(`Delete screen "${screenId}"?`)) return;
        delete activeTerminal.screens[screenId];
        if (activeScreenId === screenId) {
          activeScreenId = Object.keys(activeTerminal.screens)[0] || null;
        }
        save();
        renderSidebar();
        if (activeScreenId) selectScreen(activeScreenId);
      }},
    ];

    for (const item of items) {
      const div = document.createElement("div");
      div.textContent = item.label;
      div.style.cssText = "padding:4px 16px;cursor:pointer;font-size:12px;color:#ccc;";
      div.addEventListener("mouseenter", () => { div.style.background = "#222"; });
      div.addEventListener("mouseleave", () => { div.style.background = ""; });
      div.addEventListener("click", () => { item.action(); menu.remove(); });
      menu.appendChild(div);
    }

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }

  // Launch
  document.getElementById("btn-launch").addEventListener("click", () => {
    if (!activeTerminal) return;
    const room = prompt("Room name:", "table1");
    if (!room) return;

    const base = window.location.origin;
    const driverUrl = `${base}/?mode=driver&terminal=${activeTerminal.id}&room=${encodeURIComponent(room)}`;
    const passengerUrl = `${base}/?mode=passenger&room=${encodeURIComponent(room)}`;

    const dialog = document.createElement("div");
    dialog.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);";
    dialog.innerHTML = `
      <div style="background:#111;border:1px solid var(--fg);padding:24px;border-radius:8px;max-width:600px;width:90%;">
        <h2 style="margin-bottom:12px;font-size:14px;color:var(--fg);">Launch URLs for "${activeTerminal.name}"</h2>
        <label style="font-size:11px;color:#888;">DRIVER (give to the player controlling the terminal)</label>
        <input type="text" readonly value="${driverUrl}" style="width:100%;margin:4px 0 12px;font-size:12px;" onclick="this.select()">
        <label style="font-size:11px;color:#888;">PASSENGER (give to all other players)</label>
        <input type="text" readonly value="${passengerUrl}" style="width:100%;margin:4px 0 16px;font-size:12px;" onclick="this.select()">
        <div style="display:flex;gap:8px;">
          <button id="launch-driver">Open as Driver</button>
          <button id="launch-passenger">Open as Passenger</button>
          <button id="launch-close" style="margin-left:auto;">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector("#launch-driver").addEventListener("click", () => window.open(driverUrl, "_blank"));
    dialog.querySelector("#launch-passenger").addEventListener("click", () => window.open(passengerUrl, "_blank"));
    dialog.querySelector("#launch-close").addEventListener("click", () => dialog.remove());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.remove(); });
  });

  // Export/Import
  document.getElementById("btn-export").addEventListener("click", () => {
    if (!activeTerminal) return;
    const blob = new Blob([JSON.stringify(activeTerminal, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTerminal.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const terminal = JSON.parse(text);
      await createTerminal(terminal);
      await refresh();
      await loadTerminal(terminal.id);
    });
    input.click();
  });

  await refresh();
  if (terminals.length > 0) {
    await loadTerminal(terminals[0].id);
  }
}

function normalizeContent(content) {
  if (typeof content === "string") {
    return [{ type: "text", value: content, links: [] }];
  }
  if (Array.isArray(content)) return content;
  return [{ type: "text", value: "", links: [] }];
}

function getDefaultSettings() {
  return {
    colorForeground: "#00ff33",
    colorBackground: "#001a00",
    colorAlert: "#ff3333",
    colorHighlight: "#ffff00",
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
    slowTypeSpeed: 0.03,
    slowTypeBatchSize: 5,
    fontSize: 18,
    fontFamily: "monospace",
    cursorBlink: true,
    cursorBlinkSpeed: 530,
    cursorChar: "█",
    soundEnabled: true,
    soundVolume: 0.7,
    typingSound: "teletext",
    typingSoundRate: 1.0,
    navSound: "digital-beep",
  };
}
