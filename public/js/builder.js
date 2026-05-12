import { createCRTScreen, renderContent, setHeaderFooter } from "./crt-renderer.js";
import { listTerminals, getTerminal, createTerminal, updateTerminal, uploadAsset } from "./api-client.js";
import { playPreview, playOnce, updatePreview, preloadAudio, getAvailableSounds } from "./audio.js";
import { revealAllImages } from "./image-reveal.js";

export async function initBuilder(container) {
  await preloadAudio();

  let terminals = [];
  let activeTerminal = null;
  let activeScreenId = null;

  container.innerHTML = `
    <div class="builder-layout">
      <div class="builder-header">
        <h1>CRT Terminal Builder</h1>
        <div class="actions">
          <button id="btn-add-terminal">+ Terminal</button>
          <button id="btn-load-terminal">Load Terminal</button>
          <button id="btn-import">Import</button>
          <button id="btn-export">Export</button>
          <button id="btn-launch">Launch</button>
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
      name.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showTerminalContextMenu(e, t.id, t.name || t.id);
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

  }

  async function loadTerminal(id) {
    activeTerminal = await getTerminal(id);
    activeScreenId = activeTerminal.entryScreen || Object.keys(activeTerminal.screens)[0];
    localStorage.setItem("crt-last-terminal", id);
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

  let currentCrt = null;

  function renderPreview() {
    if (!activeTerminal) return;

    if (!activeScreenId) {
      const settings = { ...getDefaultSettings(), ...activeTerminal.defaults };
      currentCrt = createCRTScreen(previewContainer, settings);
      const sampleContent = [
        { type: "text", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ\n0123456789 !@#$%^&*()\n\nThe quick brown fox jumps\nover the lazy dog.\n\n*Alert text sample*\n/Highlight text sample/" },
        { type: "menu", id: "sample-menu", items: [
          { label: "Menu Item One", target: "" },
          { label: "Menu Item Two", target: "" },
          { label: "Menu Item Three", target: "" },
        ]},
      ];
      setHeaderFooter(currentCrt, { header: activeTerminal.defaultHeader || "HEADER PREVIEW", footer: activeTerminal.defaultFooter || "FOOTER PREVIEW" }, activeTerminal);
      currentCrt.header.textContent = currentCrt.header.dataset.fullText || "";
      currentCrt.footer.textContent = currentCrt.footer.dataset.fullText || "";
      renderContent(currentCrt.content, sampleContent, { selectedLinkId: "sample-menu-1" });
      return;
    }

    const screen = activeTerminal.screens[activeScreenId];
    if (!screen) return;

    const settings = { ...getDefaultSettings(), ...activeTerminal.defaults, ...screen.overrides };
    currentCrt = createCRTScreen(previewContainer, settings);
    setHeaderFooter(currentCrt, screen, activeTerminal);
    currentCrt.header.textContent = currentCrt.header.dataset.fullText || "";
    currentCrt.footer.textContent = currentCrt.footer.dataset.fullText || "";
    renderContent(currentCrt.content, screen.content, {});
    revealAllImages(currentCrt.content, activeTerminal.id, settings);
  }

  function updatePreviewSettings() {
    if (!activeTerminal || !currentCrt) return;
    const screen = activeScreenId ? activeTerminal.screens[activeScreenId] : null;
    const settings = { ...getDefaultSettings(), ...activeTerminal.defaults, ...(screen?.overrides || {}) };
    currentCrt.update(settings);
    if (currentCrt.renderer) {
      currentCrt.renderer.setSettings(settings);
      currentCrt.renderer._dirty = true;
    }
    updatePreview(settings.soundVolume || 0.7, settings.typingSoundRate || 1.0);
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

      // Divider toggle
      const dividerLabel = document.createElement("label");
      dividerLabel.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#666;margin-bottom:4px;";
      const dividerCheck = document.createElement("input");
      dividerCheck.type = "checkbox";
      dividerCheck.checked = !!block.divider;
      dividerCheck.addEventListener("change", () => {
        block.divider = dividerCheck.checked || null;
        screen.content = content;
        save();
        renderPreview();
      });
      dividerLabel.appendChild(dividerCheck);
      dividerLabel.appendChild(document.createTextNode("Line above"));
      blockEl.appendChild(dividerLabel);

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

        const widthRow = document.createElement("div");
        widthRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:6px;";
        const widthLabel = document.createElement("label");
        widthLabel.textContent = "Width (px):";
        widthLabel.style.cssText = "font-size:11px;color:#666;";
        const widthInput = document.createElement("input");
        widthInput.type = "number";
        widthInput.min = "32";
        widthInput.max = "1920";
        widthInput.value = block.width || "";
        widthInput.placeholder = "native";
        widthInput.style.cssText = "width:70px;font-size:11px;";
        widthInput.addEventListener("change", () => {
          block.width = parseInt(widthInput.value) || null;
          screen.content = content;
          save();
          renderPreview();
        });
        widthRow.appendChild(widthLabel);
        widthRow.appendChild(widthInput);
        blockEl.appendChild(widthRow);
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
        { key: "glowIntensity", label: "Intensity", min: 0, max: 3, step: 0.1 },
        { key: "glowRadius", label: "Radius", min: 0, max: 40, step: 1 },
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
        { key: "typingSound", label: "Draw Sound", type: "select", options: getAvailableSounds() },
        { key: "typingSoundRate", label: "Pitch", min: 0.5, max: 2, step: 0.1 },
        { key: "navSound", label: "Nav Sound", type: "select", options: [...getAvailableSounds(), ""] },
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
          const hex = document.createElement("input");
          hex.type = "text";
          hex.value = input.value;
          hex.style.cssText = "width:70px;font-size:11px;";
          input.addEventListener("input", () => { hex.value = input.value; updateSetting(s.key, input.value); });
          hex.addEventListener("change", () => { const v = hex.value.startsWith("#") ? hex.value : `#${hex.value}`; input.value = v; hex.value = v; updateSetting(s.key, v); });
          const colorGroup = document.createElement("span");
          colorGroup.style.cssText = "display:flex;align-items:center;gap:4px;";
          colorGroup.appendChild(input);
          colorGroup.appendChild(hex);
          row.appendChild(colorGroup);
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

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (activeTerminal) updateTerminal(activeTerminal.id, activeTerminal);
    }, 300);
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

  function showTerminalContextMenu(e, terminalId, terminalName) {
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#111;border:1px solid #333;padding:4px 0;z-index:1000;`;

    const items = [
      { label: "Rename", action: async () => {
        const newName = prompt("Rename terminal:", terminalName);
        if (!newName) return;
        if (!activeTerminal || activeTerminal.id !== terminalId) await loadTerminal(terminalId);
        activeTerminal.name = newName;
        save();
        refresh();
      }},
      { label: "Delete", action: async () => {
        if (!confirm(`Delete terminal "${terminalName}"? This cannot be undone.`)) return;
        await deleteTerminal(terminalId);
        if (activeTerminal?.id === terminalId) {
          activeTerminal = null;
          activeScreenId = null;
          previewContainer.innerHTML = "";
          editorPanel.innerHTML = "";
          settingsPanel.innerHTML = "";
        }
        await refresh();
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
    const driverUrl = `${base}/?terminal=${activeTerminal.id}&room=${encodeURIComponent(room)}`;
    const passengerUrl = `${base}/passenger?room=${encodeURIComponent(room)}`;

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
      try {
        const text = await file.text();
        const terminal = JSON.parse(text);
        const created = await createTerminal(terminal);
        await refresh();
        await loadTerminal(created.id);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    });
    input.click();
  });

  document.getElementById("btn-add-terminal").addEventListener("click", addNewTerminal);

  document.getElementById("btn-load-terminal").addEventListener("click", () => {
    const dialog = document.createElement("div");
    dialog.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;";
    const list = terminals.length === 0
      ? `<p style="color:#888;font-size:13px;">No saved terminals yet. Create one with "+ Terminal" or "Import".</p>`
      : `<ul style="list-style:none;padding:0;margin:0;max-height:60vh;overflow:auto;">${terminals.map((t) => `<li><button class="load-pick" data-id="${t.id}" style="display:block;width:100%;text-align:left;padding:8px 12px;margin:2px 0;background:#222;border:1px solid #333;color:var(--fg);cursor:pointer;font-family:monospace;">${t.name || t.id} <span style="color:#666;font-size:11px;">(${t.id})</span></button></li>`).join("")}</ul>`;
    dialog.innerHTML = `
      <div style="background:#111;border:1px solid #333;border-radius:4px;padding:20px;min-width:320px;max-width:480px;">
        <h2 style="margin:0 0 12px 0;font-size:14px;color:var(--fg);">Load Terminal</h2>
        ${list}
        <div style="margin-top:12px;text-align:right;"><button id="load-cancel">Close</button></div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.remove(); });
    dialog.querySelector("#load-cancel").addEventListener("click", () => dialog.remove());
    for (const btn of dialog.querySelectorAll(".load-pick")) {
      btn.addEventListener("click", async () => {
        dialog.remove();
        await loadTerminal(btn.dataset.id);
      });
    }
  });

  await refresh();
  const lastId = localStorage.getItem("crt-last-terminal");
  const lastValid = lastId && terminals.some((t) => t.id === lastId);
  if (lastValid) {
    await loadTerminal(lastId);
  } else if (terminals.length > 0) {
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
    slowTypeSpeed: 0.03,
    slowTypeBatchSize: 5,
    fontSize: 18,
    fontFamily: "monospace",
    cursorBlink: true,
    cursorBlinkSpeed: 530,
    cursorChar: "█",
    soundEnabled: true,
    soundVolume: 0.7,
    typingSound: "teletext.mp3",
    typingSoundRate: 1.0,
    navSound: "digital-beep.mp3",
  };
}
