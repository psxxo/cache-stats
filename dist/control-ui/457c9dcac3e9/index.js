// ../../../../../usr/local/lib/node_modules/openclaw/dist/plugin-sdk/control-ui.js
function defineControlUiPlugin(plugin) {
  return plugin;
}

// src/control-ui.js
var PLUGIN_ID = "cache-stats";
var METHOD = "cache-stats.session";
var REFRESH_MS = 3e4;
var Z_INDEX = 2147482999;
var PILL_HEIGHT = 22;
var PANEL_WIDTH = 392;
var COMPOSER_OFFSET = 12;
var NEIGHBOUR_GAP = 8;
var SWITCH_GAP = 16;
var SWITCH_OFFSET_X = 61;
var COMPOSER_SHELL_SELECTOR = ".agent-chat__composer-shell";
var ADMISSION_LABEL = /完全访问|只读|保护|工作区|Full access|Read-only|Guarded|Workspace/;
var STYLE = `
:host { display: inline-flex; align-items: center; }
.cs-pill {
  display: inline-flex; align-items: center; gap: 4px;
  height: 22px; padding: 0 8px;
  border: 0; outline: none; border-radius: 999px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12px; line-height: 1;
  letter-spacing: .02em; font-variant-numeric: tabular-nums;
  cursor: pointer; user-select: none; white-space: nowrap;
  pointer-events: auto; z-index: 2147483000;
  opacity: .8; transition: opacity .12s ease;
}
.cs-pill:hover, .cs-pill[aria-expanded="true"] { opacity: 1; }
.cs-pill:focus-visible { outline: 2px solid #4c8dff; outline-offset: 2px; }
.cs-pill[data-state="error"] { opacity: .55; }
.cs-pill .cs-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: currentColor; opacity: .55;
}
.cs-panel {
  position: fixed;
  pointer-events: auto;
  width: ${PANEL_WIDTH}px; max-height: 62vh; overflow: auto;
  box-sizing: border-box; padding: 14px 14px 12px;
  border-radius: 14px;
  background: Canvas; color: CanvasText;
  border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .28);
  font: 12px/1.5 var(--font-body, system-ui, sans-serif);
  z-index: ${Z_INDEX};
}
.cs-panel[hidden] { display: none; }
.cs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cs-title { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }
.cs-rate { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cs-note { margin: 2px 0 6px; opacity: .62; font-size: 11px; }
.cs-stamp { margin: 0 0 10px; opacity: .45; font-size: 10px; font-variant-numeric: tabular-nums; }
.cs-bar {
  display: flex; height: 10px; border-radius: 999px; overflow: hidden;
  background: color-mix(in srgb, CanvasText 8%, transparent);
}
.cs-bar span { display: block; height: 100%; }
.cs-seg-miss { background: color-mix(in srgb, CanvasText 42%, transparent); }
.cs-seg-read { background: #4c8dff; }
.cs-seg-write { background: #e0a63c; }
.cs-legend { display: grid; gap: 4px; margin: 8px 0 12px; }
.cs-legend div { display: flex; align-items: center; gap: 6px; }
.cs-legend i { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.cs-legend b { font-weight: 600; font-variant-numeric: tabular-nums; }
.cs-legend small { opacity: .58; }
.cs-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px; margin: 0 0 12px;
}
.cs-cell { background: color-mix(in srgb, CanvasText 5%, transparent); border-radius: 8px; padding: 6px 8px; }
.cs-cell em { display: block; font-style: normal; font-size: 10px; opacity: .55; }
.cs-cell b { font-weight: 600; font-variant-numeric: tabular-nums; }
.cs-sub { margin: 12px 0 6px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .5; }
.cs-turns { display: grid; gap: 3px; font-variant-numeric: tabular-nums; }
.cs-turn { display: grid; grid-template-columns: 34px 54px 1fr 1fr; gap: 6px; align-items: baseline; }
.cs-turn span { opacity: .78; }
.cs-turn .cs-n { opacity: .45; }
.cs-turn .cs-warn { color: #d9534f; opacity: 1; }
.cs-hist { display: grid; gap: 4px; }
.cs-hist-row { display: grid; grid-template-columns: 62px 1fr 62px; gap: 6px; align-items: center; }
.cs-hist-label { opacity: .6; font-variant-numeric: tabular-nums; }
.cs-hist-track { height: 8px; border-radius: 999px; background: color-mix(in srgb, CanvasText 7%, transparent); overflow: hidden; }
.cs-hist-fill { height: 100%; background: #4c8dff; border-radius: 999px; }
.cs-hist-value { text-align: right; opacity: .7; font-variant-numeric: tabular-nums; }
.cs-glossary { display: grid; gap: 5px; }
.cs-glossary div { display: grid; grid-template-columns: 88px 1fr; gap: 8px; }
.cs-glossary dt { opacity: .5; }
.cs-glossary dd { margin: 0; opacity: .82; }
.cs-empty { opacity: .55; padding: 8px 0; }
.cs-error { color: #d9534f; padding: 8px 0; }
.cs-setup {
  position: fixed; width: 268px; padding: 12px;
  border-radius: 12px; background: Canvas; color: CanvasText;
  border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .28);
  font: 12px/1.5 var(--font-body, system-ui, sans-serif);
  pointer-events: auto; z-index: 2147483001;
}
.cs-setup[hidden] { display: none; }
.cs-setup-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cs-setup-title span { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }
.cs-setup-close { border: 0; background: transparent; color: inherit; cursor: pointer; opacity: .6; font-size: 14px; }
.cs-row { display: grid; grid-template-columns: 48px 22px 1fr 22px; gap: 6px; align-items: center; margin-bottom: 6px; }
.cs-step { width: 22px; height: 22px; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: transparent; color: inherit; cursor: pointer; line-height: 1; }
.cs-val { text-align: center; font-variant-numeric: tabular-nums; opacity: .85; }
input.cs-val {
  width: 100%; height: 22px; text-align: center; font: inherit;
  font-variant-numeric: tabular-nums; color: inherit;
  background: transparent; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
  border-radius: 6px; padding: 0 2px;
}
input.cs-val:focus { outline: 2px solid #4c8dff; outline-offset: 1px; opacity: 1; }
.cs-actions { display: flex; gap: 6px; margin-top: 10px; }
.cs-btn { flex: 1; height: 26px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: transparent; color: inherit; cursor: pointer; }
.cs-btn.primary { background: #4c8dff; border-color: transparent; color: #fff; }
`;
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
function shortCount(value) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (number >= 1e7) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return String(Math.round(number));
}
function percent(rate) {
  return typeof rate === "number" && Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : "\u2014";
}
function visible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}
function widerAncestor(element) {
  const width = element.getBoundingClientRect().width;
  let node = element.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1) {
    if (node.getBoundingClientRect().width > width + 1) return node;
    node = node.parentElement;
  }
  return node;
}
function findComposer(container) {
  const areas = Array.from(document.querySelectorAll("textarea")).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 120 && rect.height > 0 && element.offsetParent !== null;
  });
  if (areas.length === 0) return null;
  const ownPane = container.closest(PANE_SELECTOR);
  let textarea = areas[0];
  if (areas.length > 1) {
    const ranked = areas.map((element) => ({
      element,
      width: element.getBoundingClientRect().width,
      visible: isReallyVisible(element),
      samePane: ownPane !== null && element.closest(PANE_SELECTOR) === ownPane
    })).sort((a, b) => {
      if (a.samePane !== b.samePane) return a.samePane ? -1 : 1;
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return b.width - a.width;
    });
    textarea = ranked[0].element;
  }
  const shell = textarea.closest(COMPOSER_SHELL_SELECTOR) ?? textarea.closest("[class*='composer']");
  return { textarea, shell: shell ?? textarea };
}
function switchPlacement() {
  const offset = globalThis?.__openclawTypedDecisions?.state?.placement?.offset;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("td-switch-style") ?? "null");
  } catch {
    saved = null;
  }
  return {
    offsetX: Number(offset?.x) || SWITCH_OFFSET_X,
    dx: Number(saved?.dx) || 0,
    dy: Number(saved?.dy) || 0
  };
}
function hideHostReadout(composer, cache, ours) {
  if (cache.element?.isConnected) {
    cache.element.style.display = "none";
    return;
  }
  if (Date.now() - cache.at < 1e3) return;
  cache.at = Date.now();
  cache.element = null;
  const matches = (element) => {
    if (element.childElementCount > 0) return false;
    if (element === ours || ours?.contains(element)) return false;
    return /^缓存\s*[\d.]+\s*%$/.test(element.textContent?.trim() ?? "");
  };
  let found = Array.from(composer.shell.querySelectorAll("span,div")).find(matches);
  if (!found && !cache.pageSearched) {
    cache.pageSearched = true;
    found = Array.from(document.querySelectorAll("span,div")).find(matches);
  }
  if (!found) return;
  if (found.dataset.csHidden === void 0) found.dataset.csHidden = found.style.display;
  found.style.display = "none";
  cache.element = found;
}
function findAdmission(composer, cache) {
  if (cache.element?.isConnected) {
    const rect = cache.element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return cache.element;
  }
  if (Date.now() - cache.at < 2e3) return cache.element ?? null;
  cache.at = Date.now();
  cache.element = null;
  const band = composer.textarea.getBoundingClientRect();
  const inRow = (element) => {
    const rect = element.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    return centre >= band.top - 16 && centre <= band.bottom + 16;
  };
  const matches = Array.from(composer.shell.querySelectorAll("*")).filter((element) => {
    const text = (element.textContent ?? "").trim();
    return text.length > 0 && ADMISSION_LABEL.test(text) && inRow(element);
  });
  const tightest = matches.filter((element) => !matches.some((other) => other !== element && element.contains(other))).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
  for (const candidate of tightest) {
    const control = candidate.closest("button, [role='button']") ?? candidate;
    const anchor = composer.shell.contains(control) ? control : candidate;
    if (visible(anchor)) {
      cache.element = anchor;
      return anchor;
    }
  }
  return null;
}
var BUILD = "v28-poll-resume";
var PANE_SELECTOR = ".chat-pane-cache__pane";
var PANE_VISIBLE_CLASS = "chat-pane-cache__pane--visible";
function isReallyVisible(element) {
  if (!element) return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  let node = element;
  for (let depth = 0; depth < 12 && node; depth += 1) {
    const style = getComputedStyle(node);
    if (style.opacity === "0" || style.visibility === "hidden" || style.display === "none") return false;
    node = node.parentElement;
  }
  return true;
}
var OFFSET_KEY = "cache-stats-style";
var DEFAULT_STYLE = { dx: 0, dy: 2, fontSize: 12 };
function readStyle() {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      dx: Number(parsed?.dx) || 0,
      dy: parsed?.dy === void 0 ? DEFAULT_STYLE.dy : Number(parsed.dy) || 0,
      fontSize: Number(parsed?.fontSize) > 0 ? Number(parsed.fontSize) : DEFAULT_STYLE.fontSize
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}
function writeStyle(style) {
  try {
    if (style === null) localStorage.removeItem(OFFSET_KEY);
    else localStorage.setItem(OFFSET_KEY, JSON.stringify(style));
  } catch {
  }
}
var control_ui_default = defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host) {
    host.ui.registerAccessory({
      id: "cache-hit-pill",
      placement: "session-header",
      mount(container, context) {
        const props = context.props ?? {};
        const sessionKeyOf = () => typeof props.sessionKey === "string" && props.sessionKey || typeof props.key === "string" && props.key || host.sessions.selectedKey || null;
        let sessionKey = sessionKeyOf();
        let data = null;
        let error = null;
        let loadedAt = 0;
        let open = false;
        let disposed = false;
        let presented = context.presented !== false;
        const wrapper = container;
        wrapper.dataset.openclawPlugin = PLUGIN_ID;
        wrapper.dataset.build = BUILD;
        wrapper.dataset.session = sessionKey ?? "";
        wrapper.style.pointerEvents = "none";
        const root = wrapper.attachShadow ? wrapper.attachShadow({ mode: "open" }) : wrapper;
        const style = document.createElement("style");
        style.textContent = STYLE;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "cs-pill";
        pill.setAttribute("aria-label", "\u7F13\u5B58\u547D\u4E2D\u7387");
        pill.setAttribute("aria-expanded", "false");
        const dot = document.createElement("span");
        dot.className = "cs-dot";
        const label = document.createElement("span");
        label.className = "cs-label";
        label.textContent = "\u2014";
        pill.append(dot, label);
        const panel = document.createElement("div");
        panel.className = "cs-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "\u7F13\u5B58\u7ED3\u6784");
        panel.hidden = true;
        const confirm = document.createElement("div");
        confirm.className = "cs-confirm";
        confirm.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483001;background:var(--card,#fff);color:var(--text,#111);border:1px solid var(--border,#c9c9c9);border-radius:12px;padding:16px 18px;box-shadow:0 12px 32px rgba(0,0,0,.25);font-size:13px;display:none;min-width:220px;text-align:center;pointer-events:auto";
        confirm.innerHTML = '<div style="margin-bottom:12px">\u662F\u5426\u91CD\u7F6E\u7EDF\u8BA1</div><div style="display:flex;gap:10px;justify-content:center"><button type="button" data-act="yes" style="pointer-events:auto;padding:6px 18px;border-radius:8px;border:1px solid var(--border,#c9c9c9);background:var(--card,#fff);color:inherit;font-weight:600;cursor:pointer">\u662F</button><button type="button" data-act="no" style="pointer-events:auto;padding:6px 18px;border-radius:8px;border:1px solid var(--border,#c9c9c9);background:var(--card,#fff);color:inherit;cursor:pointer">\u5426</button></div>';
        root.append(style, pill, panel, confirm);
        const setup = document.createElement("div");
        setup.className = "cs-setup";
        setup.hidden = true;
        setup.innerHTML = `
          <div class="cs-setup-title"><span>\u7F13\u5B58\u547D\u4E2D \xB7 \u5916\u89C2</span><button class="cs-setup-close" type="button" data-act="close" aria-label="\u5173\u95ED">\xD7</button></div>
          <div class="cs-row"><label>\u5B57\u53F7</label><button class="cs-step" type="button" data-k="fontSize" data-d="-0.1">\u2212</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="fontSize" /><button class="cs-step" type="button" data-k="fontSize" data-d="0.1">+</button></div>
          <div class="cs-row"><label>\u5DE6\u53F3</label><button class="cs-step" type="button" data-k="dx" data-d="-0.1">\u2212</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="dx" /><button class="cs-step" type="button" data-k="dx" data-d="0.1">+</button></div>
          <div class="cs-row"><label>\u4E0A\u4E0B</label><button class="cs-step" type="button" data-k="dy" data-d="-0.1">\u2212</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="dy" /><button class="cs-step" type="button" data-k="dy" data-d="0.1">+</button></div>
          <div class="cs-actions"><button class="cs-btn" type="button" data-act="reset">\u6062\u590D\u9ED8\u8BA4</button><button class="cs-btn primary" type="button" data-act="save">\u4FDD\u5B58</button></div>
        `;
        root.append(setup);
        let liveStyle = readStyle();
        const round1 = (value) => Math.round(value * 10) / 10;
        const syncSetup = () => {
          for (const key of ["fontSize", "dx", "dy"]) {
            const field = setup.querySelector(`[data-v="${key}"]`);
            if (field) field.value = liveStyle[key].toFixed(1);
          }
        };
        const commitField = (key, raw, options = {}) => {
          const restate = options.restate !== false;
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            if (restate) syncSetup();
            return;
          }
          const next = round1(parsed);
          liveStyle = { ...liveStyle, [key]: key === "fontSize" ? Math.max(1, next) : next };
          if (restate) syncSetup();
          place();
        };
        setup.addEventListener("input", (event) => {
          const field = event.target;
          const key = field?.dataset?.v;
          if (!field || !["fontSize", "dx", "dy"].includes(key)) return;
          commitField(key, field.value, { restate: false });
        });
        setup.addEventListener("change", (event) => {
          const field = event.target;
          const key = field?.dataset?.v;
          if (!field || !["fontSize", "dx", "dy"].includes(key)) return;
          commitField(key, field.value);
        });
        setup.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          const field = event.target;
          const key = field?.dataset?.v;
          if (!field || !["fontSize", "dx", "dy"].includes(key)) return;
          event.preventDefault();
          commitField(key, field.value);
          field.blur();
        });
        const toggleSetup = (show) => {
          setup.hidden = !show;
          if (show) syncSetup();
          place();
        };
        setup.addEventListener("click", (event) => {
          const target = event.target?.closest?.("button");
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          const act = target.dataset.act;
          if (act === "close") {
            toggleSetup(false);
            return;
          }
          if (act === "save") {
            writeStyle(liveStyle);
            target.textContent = "\u5DF2\u4FDD\u5B58";
            setTimeout(() => {
              target.textContent = "\u4FDD\u5B58";
            }, 900);
            return;
          }
          if (act === "reset") {
            liveStyle = { ...DEFAULT_STYLE };
            writeStyle(null);
            syncSetup();
            place();
            return;
          }
          const key = target.dataset.k;
          const step = Number(target.dataset.d);
          if (key && Number.isFinite(step)) {
            const next = round1(liveStyle[key] + step);
            liveStyle = { ...liveStyle, [key]: key === "fontSize" ? Math.max(1, next) : next };
            syncSetup();
            place();
          }
        });
        let composerCache = null;
        let composerAt = 0;
        let pillSize = { width: 0, height: PILL_HEIGHT };
        let observedAdmission = null;
        let observedTrailing = null;
        const currentComposer = () => {
          if (composerCache?.shell?.isConnected && composerCache.textarea?.isConnected) {
            return composerCache;
          }
          if (Date.now() - composerAt < 1e3) return composerCache;
          composerAt = Date.now();
          composerCache = findComposer(container);
          return composerCache;
        };
        const admissionCache = { element: null, at: 0 };
        const hostReadoutCache = { element: null, at: 0 };
        const place = () => {
          if (disposed) return;
          const ownPane = container.closest(PANE_SELECTOR);
          const paneVisible = ownPane ? isReallyVisible(ownPane) || ownPane.classList.contains(PANE_VISIBLE_CLASS) : isReallyVisible(container);
          const hasSession = Boolean(sessionKey);
          wrapper.style.display = presented && paneVisible && hasSession ? "" : "none";
          setActive(presented && paneVisible && hasSession && !document.hidden);
          const composer = currentComposer();
          if (!composer) {
            wrapper.style.visibility = "hidden";
            return;
          }
          wrapper.style.visibility = "";
          hideHostReadout(composer, hostReadoutCache, wrapper);
          const frame = composer.shell.getBoundingClientRect();
          const band = composer.textarea.getBoundingClientRect();
          const inRow = (element) => {
            const rect = element.getBoundingClientRect();
            if (!(rect.width > 0 && rect.height > 0)) return false;
            const centre = rect.top + rect.height / 2;
            return centre >= band.top - 16 && centre <= band.bottom + 16;
          };
          pillSize = {
            width: pill.offsetWidth || 0,
            height: pill.offsetHeight || PILL_HEIGHT
          };
          const width = pillSize.width;
          const height = pillSize.height;
          const buttons = Array.from(composer.shell.querySelectorAll("button")).filter(inRow);
          const trailingElement = buttons[buttons.length - 1] ?? null;
          const trailing = trailingElement?.getBoundingClientRect();
          const placement = switchPlacement();
          const slotTop = trailing && trailing.height > 0 ? trailing.top + trailing.height / 2 + placement.dy : frame.bottom - 12 + placement.dy;
          let top = Math.round(slotTop - height / 2);
          const admission = findAdmission(composer, admissionCache);
          observedAdmission = admission;
          observedTrailing = trailingElement;
          const slotLeft = (admission ? admission.getBoundingClientRect().right + SWITCH_GAP : frame.left + placement.offsetX) + placement.dx;
          let left = Math.round(slotLeft - NEIGHBOUR_GAP - width);
          let anchor = admission ? "before-switch" : "after-composer-edge";
          if (left < frame.left + 4) {
            left = Math.round(frame.left + COMPOSER_OFFSET);
            anchor = "composer-offset";
          }
          const clamp = (value, min, max) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
          left = clamp(left, frame.left + 4, frame.right - width - 4);
          top = clamp(top, frame.top, frame.bottom - height);
          pill.dataset.anchor = anchor;
          pill.style.visibility = "";
          pill.style.fontSize = `${liveStyle.fontSize}px`;
          label.style.fontSize = `${liveStyle.fontSize}px`;
          wrapper.style.position = "fixed";
          wrapper.style.left = `${Math.round(left + liveStyle.dx)}px`;
          wrapper.style.top = `${Math.round(top + liveStyle.dy)}px`;
          wrapper.style.zIndex = String(Z_INDEX);
          if (open) {
            const rect = pill.getBoundingClientRect();
            const panelWidth = Math.min(PANEL_WIDTH, window.innerWidth - 16);
            panel.style.width = `${panelWidth}px`;
            panel.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8)))}px`;
            panel.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
          }
          if (!setup.hidden) {
            const rect = pill.getBoundingClientRect();
            setup.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - 284)))}px`;
            setup.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
          }
        };
        const render = () => {
          if (error) {
            label.textContent = "\u2014";
            pill.dataset.state = "error";
            panel.innerHTML = `<div class="cs-error">${escapeHtml(error)}</div>`;
            place();
            return;
          }
          pill.dataset.state = "";
          label.textContent = data ? percent(data.rate) : "\u2014";
          if (!data) {
            panel.innerHTML = '<div class="cs-empty">\u6B63\u5728\u8BFB\u53D6\u7F13\u5B58\u7EDF\u8BA1\u2026</div>';
            place();
            return;
          }
          const totals = data.totals ?? {};
          const prompt = totals.promptTokens || 0;
          const miss = totals.uncachedInput || 0;
          const read = totals.cacheRead || 0;
          const write = totals.cacheWrite || 0;
          const share = (value) => prompt > 0 ? value / prompt * 100 : 0;
          const histogram = (data.histogram ?? []).filter((row) => row.count > 0);
          const turns = data.turns ?? [];
          const descriptions = data.descriptions ?? {};
          const glossary = [
            ["rate", descriptions.rate],
            ["promptTokens", descriptions.promptTokens],
            ["uncachedInput", descriptions.uncachedInput],
            ["cacheRead", descriptions.cacheRead],
            ["cacheWrite", descriptions.cacheWrite],
            ["output", descriptions.output],
            ["latestPromptTokens", descriptions.latestPromptTokens],
            ["cumulativePromptTokens", descriptions.cumulativePromptTokens],
            ["miss", descriptions.miss]
          ].filter(([, text]) => typeof text === "string");
          panel.innerHTML = `
            <div class="cs-head">
              <span class="cs-title">\u7F13\u5B58\u547D\u4E2D\u7387</span>
              <span class="cs-rate">${percent(data.rate)}</span>
            </div>
            <div class="cs-note">\u7F13\u5B58\u8BFB \xF7 \u63D0\u793A\u8BCD\u5408\u8BA1\uFF1B\u8F93\u51FA\u4E0D\u8BA1\u5165\u5206\u6BCD\uFF0C\u65E0\u8BA1\u8D39\u63D0\u793A\u8BCD\u65F6\u4E3A\u7A7A\u3002</div>
            <div class="cs-stamp">\u66F4\u65B0\u4E8E ${loadedAt ? new Date(loadedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "\u2014"}</div>

            <div class="cs-bar" role="img" aria-label="\u63D0\u793A\u8BCD\u6784\u6210">
              ${miss > 0 ? `<span class="cs-seg-miss" style="width:${share(miss)}%"></span>` : ""}
              ${read > 0 ? `<span class="cs-seg-read" style="width:${share(read)}%"></span>` : ""}
              ${write > 0 ? `<span class="cs-seg-write" style="width:${share(write)}%"></span>` : ""}
            </div>
            <div class="cs-legend">
              <div><i class="cs-seg-miss"></i><b>${shortCount(miss)}</b><small>\u672A\u547D\u4E2D\u8F93\u5165 \xB7 \u8FD9\u6B21\u8BF7\u6C42\u65B0\u53D1\u9001\u3001\u6CA1\u88AB\u524D\u7F00\u7F13\u5B58\u8986\u76D6\u7684\u63D0\u793A\u8BCD</small></div>
              <div><i class="cs-seg-read"></i><b>${shortCount(read)}</b><small>\u7F13\u5B58\u8BFB \xB7 \u547D\u4E2D\u5DF2\u6709\u524D\u7F00\u7F13\u5B58\u3001\u6309\u6298\u6263\u4EF7\u590D\u7528\u7684\u63D0\u793A\u8BCD</small></div>
              <div><i class="cs-seg-write"></i><b>${shortCount(write)}</b><small>\u7F13\u5B58\u5199 \xB7 \u4E3A\u5EFA\u7ACB\u6216\u5237\u65B0\u7F13\u5B58\u8BA1\u8D39\u7684\u63D0\u793A\u8BCD\uFF1BDeepSeek \u76F4\u8FDE\u901A\u5E38\u4E3A 0</small></div>
            </div>

            <div class="cs-grid">
              <div class="cs-cell"><em>\u63D0\u793A\u8BCD\u5408\u8BA1</em><b>${shortCount(prompt)}</b></div>
              <div class="cs-cell"><em>\u8F93\u51FA\uFF08\u4E0D\u53C2\u4E0E\u547D\u4E2D\u7387\uFF09</em><b>${shortCount(totals.output)}</b></div>
              <div class="cs-cell"><em>\u8F6E\u6B21 / \u6837\u672C</em><b>${data.totalTurns ?? turns.length} / ${data.measured ?? 0}</b></div>
              <div class="cs-cell"><em>\u672A\u547D\u4E2D\u6837\u672C</em><b>${data.misses ?? 0}</b></div>
            </div>

            <div class="cs-sub">\u6700\u8FD1\u8F6E\u6B21</div>
            <div class="cs-turns">
              ${turns.length === 0 ? '<div class="cs-empty">\u6CA1\u6709\u643A\u5E26 usage \u7684\u6837\u672C\u3002</div>' : turns.map((turn) => `
                <div class="cs-turn">
                  <span class="cs-n">\u7B2C${turn.turn}\u8F6E</span>
                  <span class="${turn.miss ? "cs-warn" : ""}">${percent(turn.rate)}</span>
                  <span>\u6700\u65B0 ${shortCount(turn.latestPromptTokens)}</span>
                  <span>\u7D2F\u8BA1 ${shortCount(turn.cumulativePromptTokens)}</span>
                </div>`).join("")}
            </div>

            <div class="cs-sub">\u547D\u4E2D\u7387\u5206\u5E03\uFF08\u6309\u63D0\u793A\u8BCD token \u52A0\u6743\uFF09</div>
            <div class="cs-hist">
              ${histogram.length === 0 ? '<div class="cs-empty">\u8FD8\u6CA1\u6709\u53EF\u5206\u6863\u7684\u8F6E\u6B21\u3002</div>' : histogram.map((row) => {
            const from = Math.round(row.from * 100);
            const to = Math.round(row.to * 100);
            const sharePercent = Math.max(1, row.share * 100);
            return `<div class="cs-hist-row">
                  <span class="cs-hist-label">${from}\u2013${to}%</span>
                  <span class="cs-hist-track"><span class="cs-hist-fill" style="width:${sharePercent}%"></span></span>
                  <span class="cs-hist-value">${row.share * 100 >= 10 ? (row.share * 100).toFixed(0) : (row.share * 100).toFixed(1)}% \xB7 ${row.count}\u8F6E</span>
                </div>`;
          }).join("")}
            </div>

            <div class="cs-sub">\u7ED3\u6784\u8BF4\u660E</div>
            <dl class="cs-glossary">
              ${glossary.map(([field, text]) => `<div><dt>${escapeHtml(field)}</dt><dd>${escapeHtml(text)}</dd></div>`).join("")}
            </dl>
          `;
          place();
        };
        const load = async () => {
          const key = sessionKeyOf();
          if (key !== sessionKey) sessionKey = key;
          if (!sessionKey) {
            error = "\u6CA1\u6709\u53EF\u8BC6\u522B\u7684\u4F1A\u8BDD\u3002";
            render();
            return;
          }
          lastLoadAt = Date.now();
          try {
            const response = await host.request(METHOD, { sessionKey, build: BUILD });
            data = response;
            error = null;
            loadedAt = Date.now();
            if (response?.openSetup === true) toggleSetup(true);
          } catch (caught) {
            error = caught?.message ?? String(caught);
          }
          render();
        };
        const close = () => {
          open = false;
          panel.hidden = true;
          pill.setAttribute("aria-expanded", "false");
          render();
        };
        const openPanel = () => {
          open = true;
          panel.hidden = false;
          pill.setAttribute("aria-expanded", "true");
          render();
          load();
        };
        pill.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) close();
          else openPanel();
        });
        pill.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          confirm.style.display = "block";
        });
        confirm.addEventListener("click", async (event) => {
          const button = event.target?.closest?.("button");
          const act = button?.getAttribute?.("data-act");
          if (act === "no") {
            confirm.style.display = "none";
            return;
          }
          if (act !== "yes") return;
          confirm.style.display = "none";
          try {
            await host.request("cache-stats.reset", { sessionKey, build: BUILD });
            loadedAt = 0;
            await load();
          } catch (caught) {
            error = caught?.message ?? String(caught);
            render();
          }
        });
        const onOutside = (event) => {
          if (!open) return;
          const path = event.composedPath?.() ?? [];
          if (path.includes(pill) || path.includes(panel) || path.includes(setup) || path.includes(confirm)) return;
          close();
        };
        const onKey = (event) => {
          if (event.key === "Escape") {
            if (confirm.style.display === "block") confirm.style.display = "none";
            else if (open) close();
          }
          if (event.ctrlKey && event.altKey && (event.key === "c" || event.key === "C")) {
            event.preventDefault();
            toggleSetup(setup.hidden);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
        window.__cacheStats = {
          openSettings(show = true) {
            toggleSetup(show);
            return { open: !setup.hidden };
          },
          nudge(dx, dy) {
            liveStyle = {
              ...liveStyle,
              dx: round1(liveStyle.dx + (Number(dx) || 0)),
              dy: round1(liveStyle.dy + (Number(dy) || 0))
            };
            writeStyle(liveStyle);
            syncSetup();
            place();
            return { ...liveStyle, anchor: pill.dataset.anchor };
          },
          reset() {
            liveStyle = { ...DEFAULT_STYLE };
            writeStyle(null);
            syncSetup();
            place();
            return { ...liveStyle, anchor: pill.dataset.anchor };
          },
          state() {
            const rect = pill.getBoundingClientRect();
            return {
              anchor: pill.dataset.anchor,
              style: { ...liveStyle },
              rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
            };
          }
        };
        const followSignature = () => {
          const composer = currentComposer();
          const box = composer?.shell.getBoundingClientRect();
          const admission = observedAdmission?.isConnected ? observedAdmission.getBoundingClientRect() : null;
          const trailing = observedTrailing?.isConnected ? observedTrailing.getBoundingClientRect() : null;
          return [
            box ? Math.round(box.left) : -1,
            box ? Math.round(box.top) : -1,
            box ? Math.round(box.width) : -1,
            box ? Math.round(box.height) : -1,
            admission ? Math.round(admission.right) : -1,
            admission ? Math.round(admission.top) : -1,
            trailing ? Math.round(trailing.top) : -1,
            pillSize.width,
            pillSize.height
          ].join(":");
        };
        const safePlace = () => {
          try {
            place();
          } catch (error2) {
            console.warn(`[${PLUGIN_ID}] \u5B9A\u4F4D\u5931\u8D25\uFF1A${error2?.message ?? error2}`);
          }
        };
        const POLL_MS = 250;
        let signature = followSignature();
        let lastSync = 0;
        let followFrame = 0;
        const syncNow = () => {
          lastSync = Date.now();
          safePlace();
          signature = followSignature();
        };
        const follow = () => {
          signature = "";
        };
        const followLoop = () => {
          if (disposed) return;
          followFrame = requestAnimationFrame(followLoop);
          if (followSignature() !== signature || Date.now() - lastSync >= POLL_MS) {
            syncNow();
          }
        };
        followFrame = requestAnimationFrame(followLoop);
        let observed = [];
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
          if (disposed) return;
          watchComposer();
          syncNow();
        }) : null;
        const watchComposer = () => {
          if (!observer) return;
          const shell = currentComposer()?.shell ?? null;
          const next = shell ? [shell, widerAncestor(shell)].filter(Boolean) : [];
          const same = next.length === observed.length && next.every((element) => observed.includes(element));
          if (same) return;
          for (const element of observed) {
            if (!next.includes(element)) observer.unobserve(element);
          }
          for (const element of next) {
            if (!observed.includes(element)) observer.observe(element);
          }
          observed = next;
        };
        observer?.observe(document.documentElement);
        watchComposer();
        const onWindow = () => follow();
        const onScroll = () => syncNow();
        window.addEventListener("resize", onWindow);
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        document.addEventListener("fullscreenchange", onWindow);
        window.visualViewport?.addEventListener("resize", onWindow);
        window.visualViewport?.addEventListener("scroll", onScroll);
        const watchdog = setInterval(() => {
          if (disposed) return;
          watchComposer();
          safePlace();
          signature = followSignature();
        }, 400);
        let refreshTimer = null;
        let activeNow = false;
        let lastLoadAt = 0;
        const scheduleNext = () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = null;
          if (!activeNow || disposed) return;
          const wait = Math.max(0, REFRESH_MS - (Date.now() - lastLoadAt));
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (disposed || !activeNow) return;
            if (!document.hidden) void load();
            scheduleNext();
          }, wait);
        };
        const setActive = (next) => {
          if (next === activeNow) {
            if (next && !refreshTimer && !disposed) scheduleNext();
            return;
          }
          activeNow = next;
          if (!next) {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = null;
            return;
          }
          if (Date.now() - lastLoadAt >= REFRESH_MS) void load();
          scheduleNext();
        };
        const onVisibility = () => {
          if (document.hidden) return;
          place();
          if (activeNow) scheduleNext();
        };
        document.addEventListener("visibilitychange", onVisibility);
        void load();
        place();
        return {
          update(next) {
            presented = next?.presented !== false;
            const key = sessionKeyOf();
            if (key !== sessionKey) {
              sessionKey = key;
              wrapper.dataset.session = key ?? "";
              composerCache = null;
              void load();
            }
            place();
          },
          dispose() {
            disposed = true;
            cancelAnimationFrame(followFrame);
            clearInterval(watchdog);
            if (refreshTimer) clearTimeout(refreshTimer);
            document.removeEventListener("visibilitychange", onVisibility);
            observer?.disconnect();
            window.removeEventListener("resize", onWindow);
            window.removeEventListener("scroll", onScroll, { capture: true });
            window.removeEventListener("fullscreenchange", onWindow);
            window.visualViewport?.removeEventListener("resize", onWindow);
            window.visualViewport?.removeEventListener("scroll", onScroll);
            document.removeEventListener("pointerdown", onOutside, true);
            document.removeEventListener("keydown", onKey, true);
            root.innerHTML = "";
            wrapper.style.position = "";
            wrapper.style.left = "";
            wrapper.style.top = "";
            wrapper.style.zIndex = "";
            wrapper.style.display = "";
            wrapper.style.pointerEvents = "";
            for (const element of document.querySelectorAll("[data-cs-hidden]")) {
              element.style.display = element.dataset.csHidden ?? "";
              delete element.dataset.csHidden;
            }
          }
        };
      }
    });
  }
});
export {
  control_ui_default as default
};
