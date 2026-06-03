"use strict";

/* =========================================================================
   GREYNET — SECTION PROGRESSION + GUIDED WALKTHROUGH

   Adds a real Local → City → Planet → Orbit → Deep Space progression on
   top of the free-form CAD editor. Every section has:
     - a completion check (validates the state),
     - an unlock rule (which section must be complete to enter),
     - walkthrough text, and an end-state recommendation.

   Persistence: lives on state.progression and is serialized with the diagram.

   I18N: All user-facing strings are pulled from the I18N_STRINGS table at
   the bottom of this file. To localize, ship a second strings file that
   redefines I18N_STRINGS before progression.js loads, or merge into it.
   ========================================================================= */

// Resolve a dotted-path key from the active locale; falls back to English.
function t(key, vars) {
  const table = (typeof I18N_STRINGS === 'object' && I18N_STRINGS) ? I18N_STRINGS : {};
  const locale = (typeof I18N_LOCALE === 'string' && table[I18N_LOCALE]) ? I18N_LOCALE : 'en';
  const root = table[locale] || table.en || {};
  const parts = key.split('.');
  let cur = root;
  for (const p of parts) { cur = cur && cur[p]; if (cur == null) break; }
  if (cur == null && locale !== 'en') {
    // English fallback for missing translations
    cur = table.en || {};
    for (const p of parts) { cur = cur && cur[p]; if (cur == null) break; }
  }
  if (cur == null) return key;          // last-ditch: surface the key itself
  if (vars && typeof cur === 'string') {
    return cur.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : '{' + k + '}'));
  }
  return cur;
}

const SECTION_ORDER = ['local', 'city', 'planet', 'orbit', 'deepspace'];

// View toggle uses 'world' as the internal name for Planet view. Normalize.
const SECTION_TO_VIEW = {
  local: 'local', city: 'city', planet: 'world',
  orbit: 'space', deepspace: 'deepspace',
};
const VIEW_TO_SECTION = {
  local: 'local', city: 'city', world: 'planet',
  space: 'orbit', deepspace: 'deepspace',
};

// Section definitions are looked up through t(). The `requires` field stays
// structural — it's not user-facing copy.
const SECTION_REQUIRES = {
  local: null, city: 'local', planet: 'city', orbit: 'planet', deepspace: 'orbit',
};
function sectionDef(section) {
  return {
    label:       t(`sections.${section}.label`),
    blurb:       t(`sections.${section}.blurb`),
    actionHint:  t(`sections.${section}.actionHint`),
    successHint: t(`sections.${section}.successHint`),
    nextHint:    t(`sections.${section}.nextHint`),
    requires:    SECTION_REQUIRES[section],
  };
}
// Back-compat shim: legacy code reads SECTION_DEFINITIONS[sec].label etc.
const SECTION_DEFINITIONS = new Proxy({}, {
  get(_t, sec) { return SECTION_REQUIRES[sec] !== undefined ? sectionDef(sec) : undefined; },
});

/* ------------------------------------------------------------------------ */
/* COMPLETION CHECKS                                                        */
/* ------------------------------------------------------------------------ */

// Delegates to validateArchitectureGraph (validator.js) so progression chips
// reflect the same connectivity rules the rest of the app uses.
//
// Falls back to legacy shallow checks ONLY if validator.js failed to load
// (e.g. in unit tests that boot a stripped DOM). This keeps the app
// debuggable without silently masking missing modules.
function checkSectionComplete(section) {
  if (typeof validateArchitectureGraph === 'function') {
    try {
      const v = validateArchitectureGraph(state);
      return !!v.sectionStatus?.[section]?.complete;
    } catch (e) {
      // Fall through to legacy
      console.warn('validateArchitectureGraph failed; using legacy check', e);
    }
  }
  switch (section) {
    case 'local':
      return (state.devices || []).length >= 3 && (state.links || []).length >= 1;
    case 'city':
      return (state.cities || []).length >= 1 && (state.endpoints || []).length >= 1;
    case 'planet':
      return (state.sites || []).length >= 2 && (state.siteLinks || []).length >= 1;
    case 'orbit': {
      const assets = state.spaceAssets || [], links = state.spaceLinks || [];
      return assets.some(a => a.type === 'ground_station')
          && assets.some(a => a.type !== 'ground_station')
          && links.some(l => ['uplink','downlink','feeder'].includes(l.type));
    }
    case 'deepspace':
      return (state.deepSpaceUnits || []).length >= 1
          && ((state.deepSpaceLinks || []).length >= 1 || (state.deepSpaceUnits || []).length >= 2);
    default: return false;
  }
}

// Expose section blockers so the warnings tray + properties panel can show
// "what's still missing" for an incomplete section.
function sectionBlockersForUi(section) {
  if (typeof validateArchitectureGraph !== 'function') return [];
  try {
    const v = validateArchitectureGraph(state);
    return v.sectionStatus?.[section]?.blockers || [];
  } catch (_) { return []; }
}

/* ------------------------------------------------------------------------ */
/* UNLOCK / EVALUATION                                                      */
/* ------------------------------------------------------------------------ */

// Recompute completion + unlock state from current data. Idempotent.
// Returns true if any field changed.
function evaluateProgression() {
  const p = state.progression;
  let changed = false;
  for (const sec of SECTION_ORDER) {
    const done = checkSectionComplete(sec);
    if (p.completed[sec] !== done) { p.completed[sec] = done; changed = true; }
  }
  // Local is always unlocked. Each subsequent section is unlocked once the
  // previous one has been completed AT LEAST ONCE. We never re-lock.
  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const sec  = SECTION_ORDER[i];
    const prev = i === 0 ? null : SECTION_ORDER[i - 1];
    const should = i === 0 ? true : (p.unlocked[sec] || p.completed[prev]);
    if (p.unlocked[sec] !== should) { p.unlocked[sec] = should; changed = true; }
  }
  return changed;
}

function isSectionUnlocked(section) {
  return !!state.progression?.unlocked?.[section];
}
function isSectionComplete(section) {
  return !!state.progression?.completed?.[section];
}
function sectionStatus(section) {
  if (isSectionComplete(section)) return 'complete';
  if (isSectionUnlocked(section)) return 'available';
  return 'locked';
}

function firstIncompleteSection() {
  for (const s of SECTION_ORDER) if (!isSectionComplete(s)) return s;
  return null;
}

// Validate whether the user can connect (logically) section A to section B.
// Returns { ok: bool, reason: string }.
function validateConnection(fromSection, toSection) {
  const fromIdx = SECTION_ORDER.indexOf(fromSection);
  const toIdx   = SECTION_ORDER.indexOf(toSection);
  if (fromIdx < 0 || toIdx < 0) return { ok: false, reason: 'Unknown section.' };
  if (Math.abs(fromIdx - toIdx) > 1) {
    return { ok: false, reason: `${SECTION_DEFINITIONS[fromSection].label} cannot connect directly to ${SECTION_DEFINITIONS[toSection].label}. Use the intermediate layers.` };
  }
  return { ok: true, reason: '' };
}

/* ------------------------------------------------------------------------ */
/* TOOLBAR DECORATION                                                       */
/* ------------------------------------------------------------------------ */

function decorateViewButtons() {
  document.querySelectorAll('[data-set-view]').forEach(btn => {
    const view = btn.getAttribute('data-set-view');
    const section = VIEW_TO_SECTION[view];
    if (!section) return;
    const st = sectionStatus(section);
    btn.classList.toggle('locked',   st === 'locked');
    btn.classList.toggle('complete', st === 'complete');
    const def = sectionDef(section);
    const reqDef = def.requires ? sectionDef(def.requires) : null;
    if (st === 'locked') {
      btn.title = t('ui.buttonLocked', { requires: reqDef ? reqDef.label : 'the previous section' });
    } else if (st === 'complete') {
      btn.title = t('ui.buttonComplete', { section: def.label });
    } else {
      btn.title = t('ui.buttonAvailable', { section: def.label, actionHint: def.actionHint });
    }
  });
}

/* ------------------------------------------------------------------------ */
/* PROGRESS TRAY                                                             */
/* ------------------------------------------------------------------------ */

function renderProgressTray() {
  if (!dom.progressTray) return;
  const total = SECTION_ORDER.length;
  const doneCount = SECTION_ORDER.filter(isSectionComplete).length;
  const pct = Math.round((doneCount / total) * 100);
  const chips = SECTION_ORDER.map(sec => {
    const st = sectionStatus(sec);
    const cur = VIEW_TO_SECTION[state.viewMode] === sec;
    const def = sectionDef(sec);
    return `<button class="prog-chip ${st}${cur ? ' current' : ''}" data-prog-section="${sec}" title="${escapeHtmlSafe(def.blurb)}">
      <span class="prog-dot"></span>
      <span class="prog-name">${escapeHtmlSafe(def.label)}</span>
    </button>`;
  }).join('<span class="prog-sep">›</span>');
  dom.progressTray.innerHTML = `
    <div class="prog-bar"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
    <div class="prog-chips">${chips}</div>
    <button class="prog-help-btn" data-action="walkthrough" title="${escapeHtmlSafe(t('ui.guideButton'))}">${escapeHtmlSafe(t('ui.guideButton'))}</button>
  `;
  dom.progressTray.querySelectorAll('[data-prog-section]').forEach(b => {
    b.addEventListener('click', () => {
      const sec = b.getAttribute('data-prog-section');
      if (!isSectionUnlocked(sec)) {
        showLockedSectionDialog(sec);
        return;
      }
      setViewMode(SECTION_TO_VIEW[sec]);
    });
  });
}

// Centralized locked-section dialog. Prefers the in-app modal; falls back
// to the native alert() only if the modal helper isn't loaded (tests).
function showLockedSectionDialog(section) {
  const def = sectionDef(section);
  const reqDef = def.requires ? sectionDef(def.requires) : null;
  const title = t('ui.lockedAlertTitle', { section: def.label });
  const body  = t('ui.lockedAlertBody', {
    section: def.label,
    requires: reqDef ? reqDef.label : 'the previous section',
    actionHint: reqDef ? reqDef.actionHint : '',
  });
  // Add live blockers from the validator so the user knows what to do.
  const blockers = (typeof sectionBlockersForUi === 'function' && reqDef)
    ? sectionBlockersForUi(def.requires)
    : [];
  const richBody = blockers.length
    ? body + '\n\nStill needed:\n• ' + blockers.join('\n• ')
    : body;
  if (typeof showModalAlert === 'function') {
    showModalAlert(title, richBody);
  } else {
    // eslint-disable-next-line no-alert
    alert(title + '\n\n' + richBody);
  }
}

function escapeHtmlSafe(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------------ */
/* WALKTHROUGH OVERLAY                                                       */
/* ------------------------------------------------------------------------ */

// Structural step definitions: title/body/cta come from t(), behavior stays here.
const WALKTHROUGH_STEP_BLUEPRINTS = [
  { key: 'welcome',   onAfter: () => trySetView('local') },
  { key: 'local',     onAfter: null },
  { key: 'city',      onAfter: () => trySetView('city') },
  { key: 'planet',    onAfter: () => trySetView('world') },
  { key: 'orbit',     onAfter: () => trySetView('space') },
  { key: 'deepspace', onAfter: () => trySetView('deepspace') },
  { key: 'done',      onAfter: () => { state.progression.walkthroughDone = true; } },
];
function walkthroughStep(i) {
  const b = WALKTHROUGH_STEP_BLUEPRINTS[i];
  if (!b) return null;
  return {
    title:  t(`walkthrough.${b.key}.title`),
    body:   t(`walkthrough.${b.key}.body`),
    cta:    t(`walkthrough.${b.key}.cta`),
    onAfter: b.onAfter,
  };
}
// Back-compat shim for any code reading WALKTHROUGH_STEPS as an array.
const WALKTHROUGH_STEPS = new Proxy([], {
  get(_t, prop) {
    if (prop === 'length') return WALKTHROUGH_STEP_BLUEPRINTS.length;
    const i = Number(prop);
    if (Number.isInteger(i)) return walkthroughStep(i);
    return undefined;
  },
});

function trySetView(v) {
  if (typeof setViewMode !== 'function') return;
  // If the user has progress in a later section, don't drag them back.
  setViewMode(v);
}

function openWalkthrough(stepIndex = 0) {
  if (!dom.walkthrough) return;
  state.progression.walkthroughStep = Math.max(0, Math.min(WALKTHROUGH_STEPS.length - 1, stepIndex));
  renderWalkthrough();
  dom.walkthrough.classList.remove('hidden');
}
function closeWalkthrough() {
  if (!dom.walkthrough) return;
  dom.walkthrough.classList.add('hidden');
}

function renderWalkthrough() {
  if (!dom.walkthrough) return;
  const i = state.progression.walkthroughStep;
  const n = WALKTHROUGH_STEP_BLUEPRINTS.length;
  const step = walkthroughStep(i);
  if (!step) { closeWalkthrough(); return; }
  dom.walkthroughBody.innerHTML = `
    <div class="wt-stepnum">${escapeHtmlSafe(t('ui.stepLabel', { i: i + 1, n }))}</div>
    <h2 class="wt-title">${escapeHtmlSafe(step.title)}</h2>
    <div class="wt-content">${step.body}</div>
  `;
  const isLast  = i === n - 1;
  const isFirst = i === 0;
  const dots = WALKTHROUGH_STEP_BLUEPRINTS
    .map((_, j) => `<span class="wt-dot ${j === i ? 'active' : ''}"></span>`).join('');
  dom.walkthroughFoot.innerHTML = `
    <div class="wt-dots">${dots}</div>
    <div class="wt-actions">
      <button class="wt-skip" data-wt-action="skip">${escapeHtmlSafe(t('ui.skip'))}</button>
      <button class="wt-back" data-wt-action="back" ${isFirst ? 'disabled' : ''}>${escapeHtmlSafe(t('ui.back'))}</button>
      <button class="wt-next" data-wt-action="next">${escapeHtmlSafe(step.cta || (isLast ? 'Finish' : t('ui.next')))}</button>
    </div>
  `;
  dom.walkthroughFoot.querySelectorAll('[data-wt-action]').forEach(btn => {
    btn.addEventListener('click', () => onWalkthroughAction(btn.getAttribute('data-wt-action')));
  });
}

function onWalkthroughAction(action) {
  const i = state.progression.walkthroughStep;
  const n = WALKTHROUGH_STEP_BLUEPRINTS.length;
  const step = walkthroughStep(i);
  if (action === 'skip') {
    state.progression.walkthroughDone = true;
    closeWalkthrough();
    return;
  }
  if (action === 'back') {
    state.progression.walkthroughStep = Math.max(0, i - 1);
    renderWalkthrough();
    return;
  }
  // next
  if (step && typeof step.onAfter === 'function') {
    try { step.onAfter(); } catch (e) { console.warn('walkthrough step error', e); }
  }
  if (i >= n - 1) {
    state.progression.walkthroughDone = true;
    closeWalkthrough();
    return;
  }
  state.progression.walkthroughStep = i + 1;
  renderWalkthrough();
}

/* ------------------------------------------------------------------------ */
/* HOOK                                                                      */
/* ------------------------------------------------------------------------ */

// Call this from renderAll() so the UI reflects the latest state.
function progressionTick() {
  evaluateProgression();
  decorateViewButtons();
  renderProgressTray();
}

// Public: gate a view switch through progression. Returns true if allowed.
function progressionCanEnter(view) {
  const sec = VIEW_TO_SECTION[view];
  if (!sec) return true;
  if (isSectionUnlocked(sec)) return true;
  showLockedSectionDialog(sec);
  return false;
}

/* =========================================================================
   I18N STRINGS — single source of truth for user-facing copy.
   Add a new locale by adding another key (e.g. I18N_STRINGS.es = { ... })
   and setting I18N_LOCALE = 'es'.
   ========================================================================= */
let I18N_LOCALE = 'en';
const I18N_STRINGS = {
  en: {
    sections: {
      local: {
        label: 'Local',
        blurb: 'Your starting zone. Lay out the devices and security zones inside a single site — routers, switches, firewalls, servers and endpoints.',
        actionHint: 'Drag at least 3 devices from the palette and connect 2 of them.',
        successHint: 'Local is complete when you have at least 3 devices and 1 link between them.',
        nextHint: 'Next: connect this site into a wider City.',
      },
      city: {
        label: 'City',
        blurb: 'Expand outward. Drop your local site onto a city map and add city-scale infrastructure: cabinets, fiber junctions, traffic signals, cameras.',
        actionHint: 'Create a city, place at least 1 endpoint, and link your existing site to the city (drag a Built Site onto the map).',
        successHint: 'City is complete when ≥1 city exists, holds your local site, and has ≥1 endpoint linked to it.',
        nextHint: 'Next: pin cities and sites onto the Planet.',
      },
      planet: {
        label: 'Planet',
        blurb: 'Step back to the globe. Place physical sites and global infrastructure (data centers, ground uplinks, comm towers) and connect them with WAN/SD-WAN/MPLS.',
        actionHint: 'Place ≥2 sites OR ≥1 global infra unit, and create ≥1 inter-site link.',
        successHint: 'Planet is complete when ≥2 sites exist with ≥1 site-link, OR ≥1 global infra unit is placed.',
        nextHint: 'Next: lift off into Orbit.',
      },
      orbit: {
        label: 'Orbit',
        blurb: 'Add the orbital layer: satellites, relays, defense nodes, GPS, comm arrays and firewalls. Connect them to ground stations so the network reaches space.',
        actionHint: 'Place ≥1 ground station + ≥1 satellite (or relay/defense node), and connect them with an uplink.',
        successHint: 'Orbit is complete when ≥1 ground station + ≥1 non-ground asset exist AND ≥1 uplink/downlink/feeder link ties them.',
        nextHint: 'Next: extend into Deep Space.',
      },
      deepspace: {
        label: 'Deep Space',
        blurb: 'Beyond orbit: relays, probes, quantum gateways, research stations and threat-detection arrays. Connect them back to your orbital network.',
        actionHint: 'Place ≥1 deep-space unit and link it to a deep-space anchor (or open the Link Budget Studio).',
        successHint: 'Deep Space is complete when ≥1 deep-space unit is placed and ≥1 deep-space link exists.',
        nextHint: 'Network online. Use Save / Export to deliver the plan.',
      },
    },
    walkthrough: {
      welcome: {
        title: 'Welcome to GreyNET',
        body: `<p>GreyNET helps you design and connect a network across five layers:</p>
          <ul class="wt-layer-list">
            <li><b>Local</b> — devices inside a single site</li>
            <li><b>City</b> — city-scale infrastructure</li>
            <li><b>Planet</b> — sites and global mesh</li>
            <li><b>Orbit</b> — satellites, relays, defense</li>
            <li><b>Deep Space</b> — probes, gateways, archives</li>
          </ul>
          <p>You progress from Local → Deep Space. Each layer unlocks when the previous one is built.</p>`,
        cta: 'Start at Local',
      },
      local: {
        title: 'Step 1 — Local network',
        body: `<p>Drag at least <b>3 devices</b> from the left palette into the canvas (try a Firewall, an L3 Switch, and a Server). Then switch to <b>Connect</b> mode (press <kbd>C</kbd>) and click two devices to wire them together.</p>
          <p>Local is done when you have ≥3 devices and ≥1 connection.</p>`,
        cta: 'Got it',
      },
      city: {
        title: 'Step 2 — City',
        body: `<p>City turns one or more local sites into part of a metropolitan network. In the City view (top toolbar):</p>
          <ol>
            <li>Pick or create a city.</li>
            <li>Drag your existing site from the <b>Built Sites</b> palette onto the map.</li>
            <li>Place at least one city endpoint (cabinet, fiber junction, traffic camera, etc.).</li>
          </ol>`,
        cta: 'Open City view',
      },
      planet: {
        title: 'Step 3 — Planet',
        body: `<p>The Planet view is your global picture. Drop physical sites (HQ, datacenter, NOC) on the world map at real coordinates, and link them with WAN / SD-WAN / MPLS.</p>
          <p>You can also place <b>global infrastructure</b>: data centers, ground uplinks, AI monitoring centers, comm towers.</p>`,
        cta: 'Open Planet view',
      },
      orbit: {
        title: 'Step 4 — Orbit',
        body: `<p>Reach for space. Place at least one ground station + one orbital asset (satellite, relay, defense node, monitoring sat, GPS unit, comm array, orbital firewall, or routing sat) and connect them with an uplink or downlink.</p>
          <p>Hover any orbital unit to see its stats — coverage, bandwidth, power, security.</p>`,
        cta: 'Open Orbit view',
      },
      deepspace: {
        title: 'Step 5 — Deep Space',
        body: `<p>Beyond Earth. Deep Space supports two views:</p>
          <ul>
            <li>The <b>Link Budget Studio</b> (right panel) for interplanetary RF math.</li>
            <li>A <b>Deep Space Mesh</b> where you place probes, relays, quantum gateways, sensors and archives — and connect them back into the network. Anchor a unit to a planet to make it follow that planet's heliocentric position.</li>
          </ul>
          <p>Place at least 1 deep-space unit and 1 deep-space link to finish.</p>`,
        cta: 'Open Deep Space',
      },
      done: {
        title: 'You are set',
        body: `<p>Use the <b>Guide</b> button in the bottom-right at any time to re-open this walkthrough. The chip strip in the status bar shows progress; locked sections show why they're locked.</p>
          <p>Tip: <kbd>Ctrl+S</kbd> saves a JSON snapshot, autosave runs every 5 s.</p>`,
        cta: 'Finish',
      },
    },
    ui: {
      lockedAlertTitle: '{section} is locked.',
      lockedAlertBody: 'To unlock it, finish {requires}:\n{actionHint}\n\nThen return here.',
      buttonLocked: 'Locked — finish {requires} first',
      buttonComplete: '{section} complete · click to revisit',
      buttonAvailable: '{section} · {actionHint}',
      guideButton: 'Guide',
      stepLabel: 'Step {i} of {n}',
      skip: 'Skip',
      back: 'Back',
      next: 'Next',
    },
  },
};

// Called once the DOM is ready (from app.js init()).
function initProgression() {
  if (!state.progression) {
    state.progression = {
      walkthroughDone: false, walkthroughStep: 0,
      completed: { local:false, city:false, planet:false, orbit:false, deepspace:false },
      unlocked:  { local:true,  city:false, planet:false, orbit:false, deepspace:false },
    };
  }
  evaluateProgression();
  decorateViewButtons();
  renderProgressTray();
  if (!state.progression.walkthroughDone) {
    // Defer slightly so the rest of the UI paints first.
    setTimeout(() => openWalkthrough(0), 200);
  }
}
