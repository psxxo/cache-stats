// Cache Stats — native Control UI contribution.
//
// A transparent pill in the chat composer row showing the session's cache hit
// rate ("99.9%"). Clicking it toggles a popover with the cache structure:
// disjoint buckets, per-turn rows, the hit-rate distribution, and one Chinese
// line per part explaining what that part holds.
//
// The Control UI offers exactly one accessory placement (`session-header`), so
// the pill is mounted there and then positioned with `position: fixed` the same
// way the 「决策介入」switch positions itself: centred on the composer row's
// trailing control, sitting immediately before that switch (after the admission
// control when the switch is absent, an offset from the composer's left edge as
// the last resort), and clamped inside the composer shell. A fixed element
// escapes ancestor clipping; the host stylesheet never touches it. All data
// comes through the plugin host: the page CSP forbids direct connections, and
// the backend owns the read-only database access.

import { defineControlUiPlugin } from "openclaw/plugin-sdk/control-ui";

const PLUGIN_ID = "cache-stats";
const METHOD = "cache-stats.session";
const REFRESH_MS = 30_000;
const Z_INDEX = 2147482999;
const PILL_HEIGHT = 22;
const PANEL_WIDTH = 392;
/** Distance from the composer's left edge when neither control is found. */
const COMPOSER_OFFSET = 12;
/** Gap between the pill and the 「决策介入」switch. */
const NEIGHBOUR_GAP = 8;
/** The gap the switch itself keeps after the admission control. */
const SWITCH_GAP = 16;
/** The switch's fallback offset from the composer's left edge. */
const SWITCH_OFFSET_X = 61;
/** The composer's own box; the pill must never leave it. */
const COMPOSER_SHELL_SELECTOR = ".agent-chat__composer-shell";
/** Admission-control labels (the row control the switch sits after). */
const ADMISSION_LABEL = /完全访问|只读|保护|工作区|Full access|Read-only|Guarded|Workspace/;

const STYLE = `
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
.cs-turn { display: grid; grid-template-columns: 52px 54px 1fr 1fr; gap: 6px; align-items: baseline; }
.cs-turn span { opacity: .78; }
.cs-turn .cs-n { opacity: .45; white-space: nowrap; }
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

/** Escape text for innerHTML. */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

/** Compact token count: 999, 12.3K, 2.9M. */
function shortCount(value) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (number >= 10_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(Math.round(number));
}

/** Rate as one-decimal percentage; null stays a dash. */
function percent(rate) {
  return typeof rate === "number" && Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : "—";
}

/** Whether an element is laid out and visible. */
function visible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

/**
 * The nearest ancestor whose width tracks the pane/sidebar. The composer shell
 * is capped by `max-width`, so a sidebar drag moves it without resizing it; an
 * observer on the shell alone would never fire during that drag.
 */
function widerAncestor(element) {
  const width = element.getBoundingClientRect().width;
  let node = element.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1) {
    if (node.getBoundingClientRect().width > width + 1) return node;
    node = node.parentElement;
  }
  return node;
}

/** The composer the owner is looking at, ranked the way the 「决策介入」switch does it. */
function findComposer(container) {
  const areas = Array.from(document.querySelectorAll("textarea")).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 120 && rect.height > 0 && element.offsetParent !== null;
  });
  if (areas.length === 0) return null;
  const ownPane = container.closest(PANE_SELECTOR);
  let textarea = areas[0];
  if (areas.length > 1) {
    // A cached pane's composer keeps a real box (the pane is only translucent),
    // so rank the pane that owns this pill first, then genuinely visible
    // composers, then the widest one — the same order the switch uses.
    const ranked = areas
      .map((element) => ({
        element,
        width: element.getBoundingClientRect().width,
        visible: isReallyVisible(element),
        samePane: ownPane !== null && element.closest(PANE_SELECTOR) === ownPane,
      }))
      .sort((a, b) => {
        if (a.samePane !== b.samePane) return a.samePane ? -1 : 1;
        if (a.visible !== b.visible) return a.visible ? -1 : 1;
        return b.width - a.width;
      });
    textarea = ranked[0].element;
  }
  const shell = textarea.closest(COMPOSER_SHELL_SELECTOR) ?? textarea.closest("[class*='composer']");
  return { textarea, shell: shell ?? textarea };
}

/**
 * The 「决策介入」switch's own placement inputs: its fallback offset from the
 * composer's left edge and the operator's saved nudge. The pill sits where that
 * switch sits, derived from the same layout elements instead of reading the
 * switch's JS-written box — a chain of two JS-positioned elements always trails
 * by a frame, because the second one measures the first one's previous frame.
 */
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
    dy: Number(saved?.dy) || 0,
  };
}

/**
 * The host's own compact cache readout (e.g. "缓存 85.9%"). This pill replaces
 * it, so the native line is hidden; the scan is scoped to the composer and the
 * found element is cached, because walking the page is too costly per frame.
 */
function hideHostReadout(composer, cache, ours) {
  if (cache.element?.isConnected) {
    cache.element.style.display = "none";
    return;
  }
  if (Date.now() - cache.at < 1000) return;
  cache.at = Date.now();
  cache.element = null;
  const matches = (element) => {
    if (element.childElementCount > 0) return false;
    if (element === ours || ours?.contains(element)) return false;
    return /^缓存\s*[\d.]+\s*%$/.test(element.textContent?.trim() ?? "");
  };
  let found = Array.from(composer.shell.querySelectorAll("span,div")).find(matches);
  if (!found && !cache.pageSearched) {
    // One page-wide pass at most: a readout parked outside the composer is
    // still hidden, but the scan never repeats frame after frame.
    cache.pageSearched = true;
    found = Array.from(document.querySelectorAll("span,div")).find(matches);
  }
  if (!found) return;
  if (found.dataset.csHidden === undefined) found.dataset.csHidden = found.style.display;
  found.style.display = "none";
  cache.element = found;
}

/**
 * The admission control the switch sits after (完全访问/只读…). Walking every
 * element in the composer is far too costly per frame, so the resolved element
 * is cached and re-scanned at most twice a second.
 */
function findAdmission(composer, cache) {
  if (cache.element?.isConnected) {
    const rect = cache.element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return cache.element;
  }
  if (Date.now() - cache.at < 2000) return cache.element ?? null;
  cache.at = Date.now();
  cache.element = null;
  const band = composer.textarea.getBoundingClientRect();
  const inRow = (element) => {
    const rect = element.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    return centre >= band.top - 16 && centre <= band.bottom + 16;
  };
  // The Control UI renders some chips through custom elements, so match on
  // every element and keep only the tightest matches: a wrapper that merely
  // contains the chip must never capture the anchor.
  const matches = Array.from(composer.shell.querySelectorAll("*")).filter((element) => {
    const text = (element.textContent ?? "").trim();
    return text.length > 0 && ADMISSION_LABEL.test(text) && inRow(element);
  });
  const tightest = matches
    .filter((element) => !matches.some((other) => other !== element && element.contains(other)))
    .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
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

// Build tag written on the mounted wrapper. A plugin reload re-mounts the
// accessory without reloading the page, so only older builds are retired;
// every live session pane keeps its own pill.
const BUILD = "v28-poll-resume";

// A cached pane keeps its DOM at opacity 0; its accessory must stay hidden or
// it paints behind the pane the owner is actually looking at.
const PANE_SELECTOR = ".chat-pane-cache__pane";
const PANE_VISIBLE_CLASS = "chat-pane-cache__pane--visible";

/**
 * Whether the element is genuinely on screen. Cached chat panes stay mounted
 * at `opacity: 0` (they keep a real box), so geometry alone cannot tell them
 * apart from the pane the owner is looking at.
 * @param {Element | null} element
 * @returns {boolean}
 */
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

/** localStorage key holding the operator's manual style (font size + nudge). */
const OFFSET_KEY = "cache-stats-style";
const DEFAULT_STYLE = { dx: 0, dy: 2, fontSize: 12 };

/** Read the saved style, tolerating missing or malformed storage. */
function readStyle() {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      dx: Number(parsed?.dx) || 0,
      dy: parsed?.dy === undefined ? DEFAULT_STYLE.dy : Number(parsed.dy) || 0,
      fontSize: Number(parsed?.fontSize) > 0 ? Number(parsed.fontSize) : DEFAULT_STYLE.fontSize,
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

/** Persist a style; null restores the defaults. */
function writeStyle(style) {
  try {
    if (style === null) localStorage.removeItem(OFFSET_KEY);
    else localStorage.setItem(OFFSET_KEY, JSON.stringify(style));
  } catch {
    // Storage may be unavailable; the in-memory value still applies.
  }
}

export default defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host) {
    host.ui.registerAccessory({
      id: "cache-hit-pill",
      placement: "session-header",
      mount(container, context) {
        const props = (context.props ?? {});
        const sessionKeyOf = () => (typeof props.sessionKey === "string" && props.sessionKey)
          || (typeof props.key === "string" && props.key)
          || host.sessions.selectedKey
          || null;

        let sessionKey = sessionKeyOf();
        let data = null;
        let error = null;
        let loadedAt = 0;
        let open = false;
        let disposed = false;
        let presented = context.presented !== false;

        // The accessory container itself is what gets fixed-positioned, exactly
        // as the 「决策介入」switch does. Appending a pill to <body> put it
        // outside the app's layer tree, so during a pane/sidebar drag it was
        // repositioned a frame behind the content it belongs to — the trailing
        // the owner saw. Staying inside the host's container keeps both in the
        // same compositing pass.
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
        pill.setAttribute("aria-label", "缓存命中率");
        pill.setAttribute("aria-expanded", "false");
        const dot = document.createElement("span");
        dot.className = "cs-dot";
        const label = document.createElement("span");
        label.className = "cs-label";
        label.textContent = "—";
        pill.append(dot, label);

        const panel = document.createElement("div");
        panel.className = "cs-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "缓存结构");
        panel.hidden = true;

        // 右键重置：只影响当前会话的统计起点，不改任何历史数据。
        const confirm = document.createElement("div");
        confirm.className = "cs-confirm";
        confirm.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483001;background:var(--card,#fff);color:var(--text,#111);border:1px solid var(--border,#c9c9c9);border-radius:12px;padding:16px 18px;box-shadow:0 12px 32px rgba(0,0,0,.25);font-size:13px;display:none;min-width:220px;text-align:center;pointer-events:auto";
        confirm.innerHTML = '<div style="margin-bottom:12px">是否重置统计</div><div style="display:flex;gap:10px;justify-content:center"><button type="button" data-act="yes" style="pointer-events:auto;padding:6px 18px;border-radius:8px;border:1px solid var(--border,#c9c9c9);background:var(--card,#fff);color:inherit;font-weight:600;cursor:pointer">是</button><button type="button" data-act="no" style="pointer-events:auto;padding:6px 18px;border-radius:8px;border:1px solid var(--border,#c9c9c9);background:var(--card,#fff);color:inherit;cursor:pointer">否</button></div>';

        root.append(style, pill, panel, confirm);

        const setup = document.createElement("div");
        setup.className = "cs-setup";
        setup.hidden = true;
        setup.innerHTML = `
          <div class="cs-setup-title"><span>缓存命中 · 外观</span><button class="cs-setup-close" type="button" data-act="close" aria-label="关闭">×</button></div>
          <div class="cs-row"><label>字号</label><button class="cs-step" type="button" data-k="fontSize" data-d="-0.1">−</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="fontSize" /><button class="cs-step" type="button" data-k="fontSize" data-d="0.1">+</button></div>
          <div class="cs-row"><label>左右</label><button class="cs-step" type="button" data-k="dx" data-d="-0.1">−</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="dx" /><button class="cs-step" type="button" data-k="dx" data-d="0.1">+</button></div>
          <div class="cs-row"><label>上下</label><button class="cs-step" type="button" data-k="dy" data-d="-0.1">−</button><input class="cs-val" type="number" step="0.1" inputmode="decimal" data-v="dy" /><button class="cs-step" type="button" data-k="dy" data-d="0.1">+</button></div>
          <div class="cs-actions"><button class="cs-btn" type="button" data-act="reset">恢复默认</button><button class="cs-btn primary" type="button" data-act="save">保存</button></div>
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

        /** Apply a value typed straight into the field. */
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
          // Live preview while typing; the field is not restated here so the
          // caret does not jump mid-number.
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
          if (act === "close") { toggleSetup(false); return; }
          if (act === "save") {
            writeStyle(liveStyle);
            target.textContent = "已保存";
            setTimeout(() => { target.textContent = "保存"; }, 900);
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

        // Identity caches. The composer shell, its textarea and the row's
        // trailing control rarely change identity; re-resolving them through
        // querySelectorAll on every frame is what made the pill trail a drag.
        let composerCache = null;
        let composerAt = 0;
        let pillSize = { width: 0, height: PILL_HEIGHT };
        // The elements whose geometry this pill depends on, recorded by the last
        // placement so the frame loop can watch them without re-scanning.
        let observedAdmission = null;
        let observedTrailing = null;
        const currentComposer = () => {
          if (composerCache?.shell?.isConnected && composerCache.textarea?.isConnected) {
            return composerCache;
          }
          if (Date.now() - composerAt < 1000) return composerCache;
          composerAt = Date.now();
          composerCache = findComposer(container);
          return composerCache;
        };

        /** Place the pill and its panel next to the composer row. */
        const admissionCache = { element: null, at: 0 };
        const hostReadoutCache = { element: null, at: 0 };
        const place = () => {
          if (disposed) return;
          // Hide when the host says this surface is not presented, or when this
          // accessory sits in a cached pane (mounted at opacity 0). The className
          // check is a fallback: the host's own class names are not a contract.
          const ownPane = container.closest(PANE_SELECTOR);
          const paneVisible = ownPane
            ? isReallyVisible(ownPane) || ownPane.classList.contains(PANE_VISIBLE_CLASS)
            : isReallyVisible(container);
          // No session key yet means no stats to show.
          const hasSession = Boolean(sessionKey);
          wrapper.style.display = presented && paneVisible && hasSession ? "" : "none";
          // Poll only while this pane is the one on screen. Activation fires one
          // request immediately, then a steady REFRESH_MS cadence; a cached pane,
          // a background tab or a pane with no session costs nothing at all.
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
            height: pill.offsetHeight || PILL_HEIGHT,
          };
          const width = pillSize.width;
          const height = pillSize.height;

          // Everything below is derived from the composer's own layout, the
          // same inputs the 「决策介入」switch reads: the row's trailing control
          // for the vertical centre and the admission control (or the composer's
          // left edge) for the horizontal slot. Reading the switch's rendered
          // box instead would trail one frame behind it, which is the delay.
          const buttons = Array.from(composer.shell.querySelectorAll("button")).filter(inRow);
          const trailingElement = buttons[buttons.length - 1] ?? null;
          const trailing = trailingElement?.getBoundingClientRect();
          const placement = switchPlacement();
          const slotTop = trailing && trailing.height > 0
            ? trailing.top + trailing.height / 2 + placement.dy
            : frame.bottom - 12 + placement.dy;
          let top = Math.round(slotTop - height / 2);

          const admission = findAdmission(composer, admissionCache);
          observedAdmission = admission;
          observedTrailing = trailingElement;
          const slotLeft = (admission
            ? admission.getBoundingClientRect().right + SWITCH_GAP
            : frame.left + placement.offsetX) + placement.dx;
          let left = Math.round(slotLeft - NEIGHBOUR_GAP - width);
          let anchor = admission ? "before-switch" : "after-composer-edge";
          if (left < frame.left + 4) {
            // No room before the switch; fall back to the composer's own edge.
            left = Math.round(frame.left + COMPOSER_OFFSET);
            anchor = "composer-offset";
          }

          // Whatever the anchor resolved to, the pill stays inside the composer.
          const clamp = (value, min, max) =>
            Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
          left = clamp(left, frame.left + 4, frame.right - width - 4);
          top = clamp(top, frame.top, frame.bottom - height);

          pill.dataset.anchor = anchor;
          pill.style.visibility = "";
          pill.style.fontSize = `${liveStyle.fontSize}px`;
          label.style.fontSize = `${liveStyle.fontSize}px`;
          // The operator's own nudge is applied last and is never fought.
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
            label.textContent = "—";
            pill.dataset.state = "error";
            panel.innerHTML = `<div class="cs-error">${escapeHtml(error)}</div>`;
            place();
            return;
          }
          pill.dataset.state = "";
          label.textContent = data ? percent(data.rate) : "—";
          if (!data) {
            panel.innerHTML = '<div class="cs-empty">正在读取缓存统计…</div>';
            place();
            return;
          }

          const totals = data.totals ?? {};
          const prompt = totals.promptTokens || 0;
          const miss = totals.uncachedInput || 0;
          const read = totals.cacheRead || 0;
          const write = totals.cacheWrite || 0;
          const share = (value) => (prompt > 0 ? (value / prompt) * 100 : 0);

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
            ["miss", descriptions.miss],
          ].filter(([, text]) => typeof text === "string");

          panel.innerHTML = `
            <div class="cs-head">
              <span class="cs-title">缓存命中率</span>
              <span class="cs-rate">${percent(data.rate)}</span>
            </div>
            <div class="cs-note">缓存读 ÷ 提示词合计；输出不计入分母，无计费提示词时为空。</div>
            <div class="cs-stamp">更新于 ${loadedAt ? new Date(loadedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "—"}</div>

            <div class="cs-bar" role="img" aria-label="提示词构成">
              ${miss > 0 ? `<span class="cs-seg-miss" style="width:${share(miss)}%"></span>` : ""}
              ${read > 0 ? `<span class="cs-seg-read" style="width:${share(read)}%"></span>` : ""}
              ${write > 0 ? `<span class="cs-seg-write" style="width:${share(write)}%"></span>` : ""}
            </div>
            <div class="cs-legend">
              <div><i class="cs-seg-miss"></i><b>${shortCount(miss)}</b><small>未命中输入 · 这次请求新发送、没被前缀缓存覆盖的提示词</small></div>
              <div><i class="cs-seg-read"></i><b>${shortCount(read)}</b><small>缓存读 · 命中已有前缀缓存、按折扣价复用的提示词</small></div>
              <div><i class="cs-seg-write"></i><b>${shortCount(write)}</b><small>缓存写 · 为建立或刷新缓存计费的提示词；DeepSeek 直连通常为 0</small></div>
            </div>

            <div class="cs-grid">
              <div class="cs-cell"><em>提示词合计</em><b>${shortCount(prompt)}</b></div>
              <div class="cs-cell"><em>输出（不参与命中率）</em><b>${shortCount(totals.output)}</b></div>
              <div class="cs-cell"><em>轮次 / 样本</em><b>${data.totalTurns ?? turns.length} / ${data.measured ?? 0}</b></div>
              <div class="cs-cell"><em>未命中样本</em><b>${data.misses ?? 0}</b></div>
            </div>

            <div class="cs-sub">最近轮次</div>
            <div class="cs-turns">
              ${turns.length === 0 ? '<div class="cs-empty">没有携带 usage 的样本。</div>' : turns.map((turn) => `
                <div class="cs-turn">
                  <span class="cs-n">第${turn.turn}轮</span>
                  <span class="${turn.miss ? "cs-warn" : ""}">${percent(turn.rate)}</span>
                  <span>最新 ${shortCount(turn.latestPromptTokens)}</span>
                  <span>累计 ${shortCount(turn.cumulativePromptTokens)}</span>
                </div>`).join("")}
            </div>

            <div class="cs-sub">命中率分布（按提示词 token 加权）</div>
            <div class="cs-hist">
              ${histogram.length === 0 ? '<div class="cs-empty">还没有可分档的轮次。</div>' : histogram.map((row) => {
                const from = Math.round(row.from * 100);
                const to = Math.round(row.to * 100);
                const sharePercent = Math.max(1, row.share * 100);
                return `<div class="cs-hist-row">
                  <span class="cs-hist-label">${from}–${to}%</span>
                  <span class="cs-hist-track"><span class="cs-hist-fill" style="width:${sharePercent}%"></span></span>
                  <span class="cs-hist-value">${row.share * 100 >= 10 ? (row.share * 100).toFixed(0) : (row.share * 100).toFixed(1)}% · ${row.count}轮</span>
                </div>`;
              }).join("")}
            </div>

            <div class="cs-sub">结构说明</div>
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
            error = "没有可识别的会话。";
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
          if (act === "no") { confirm.style.display = "none"; return; }
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
              dy: round1(liveStyle.dy + (Number(dy) || 0)),
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
              rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
            };
          },
        };

        // Follow the composer exactly the way the 「决策介入」switch does: an
        // rAF loop comparing a geometry signature, a 250ms poll as a floor, a
        // ResizeObserver callback for same-frame placement, and scroll/resize
        // handled in the event that reports them. The pill anchors on the
        // composer's layout (trailing control + admission control), the same
        // inputs the switch reads, not on the switch's JS-written box.
        const followSignature = () => {
          const composer = currentComposer();
          const box = composer?.shell.getBoundingClientRect();
          const admission = observedAdmission?.isConnected
            ? observedAdmission.getBoundingClientRect()
            : null;
          const trailing = observedTrailing?.isConnected
            ? observedTrailing.getBoundingClientRect()
            : null;
          return [
            box ? Math.round(box.left) : -1,
            box ? Math.round(box.top) : -1,
            box ? Math.round(box.width) : -1,
            box ? Math.round(box.height) : -1,
            admission ? Math.round(admission.right) : -1,
            admission ? Math.round(admission.top) : -1,
            trailing ? Math.round(trailing.top) : -1,
            pillSize.width,
            pillSize.height,
          ].join(":");
        };
        // A placement must never kill the follow loop.
        const safePlace = () => {
          try {
            place();
          } catch (error) {
            console.warn(`[${PLUGIN_ID}] 定位失败：${error?.message ?? error}`);
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
        const observer = typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              if (disposed) return;
              // Runs after layout and before paint: placing here lands in the
              // same frame as the composer's new position.
              watchComposer();
              syncNow();
            })
          : null;
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

        // Belt and braces only: a composer that appeared later, or a move no
        // observer reported, at a cadence nobody can perceive as lag.
        const watchdog = setInterval(() => {
          if (disposed) return;
          watchComposer();
          safePlace();
          signature = followSignature();
        }, 400);
        let refreshTimer = null;
        let activeNow = false;
        let lastLoadAt = 0;
        // Switching panes must not become a request storm: an activation only
        // fires when this pane's own 30 s window has elapsed. Switching back
        // inside the window waits out the remainder instead of re-fetching.
        const scheduleNext = () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = null;
          if (!activeNow || disposed) return;
          const wait = Math.max(0, REFRESH_MS - (Date.now() - lastLoadAt));
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (disposed || !activeNow) return;
            // A hidden tab skips the fetch but must keep the cadence: returning
            // here used to kill the timer for good, so the panel stayed frozen
            // until the page was reloaded.
            if (!document.hidden) void load();
            scheduleNext();
          }, wait);
        };
        /** Start/stop the refresh cadence with the pane's own activity. */
        const setActive = (next) => {
          if (next === activeNow) {
            // Re-entry while active must restore a cadence a hidden tick cleared.
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
          // Coming back to the tab refreshes immediately when the last read is
          // stale, then resumes the steady cadence.
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
          },
        };
      },
    });
  },
});
