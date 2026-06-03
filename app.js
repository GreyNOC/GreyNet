"use strict";



/* =========================================================================
   UTILITIES
   ========================================================================= */
function uid() { return 'id-' + Math.random().toString(36).slice(2, 11); }
function snap(v) { return state.snapToGrid ? Math.round(v / state.gridSize) * state.gridSize : Math.round(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function deviceById(id)   { return state.devices.find(d => d.id === id); }
function linkById(id)     { return state.links.find(l => l.id === id);  }
function zoneById(id)     { return state.zones.find(z => z.id === id);  }
function siteById(id)     { return state.sites.find(s => s.id === id);  }
function siteLinkById(id) { return state.siteLinks.find(l => l.id === id); }
function spaceAssetById(id) { return state.spaceAssets.find(a => a.id === id); }
function spaceLinkById(id)  { return state.spaceLinks.find(l => l.id === id);  }
function anyById(id) {
  return deviceById(id) || linkById(id) || zoneById(id)
      || siteById(id) || siteLinkById(id)
      || endpointById(id) || cityLinkById(id) || cityById(id)
      || spaceAssetById(id) || spaceLinkById(id)
      || planetInfraByIdSafe(id)
      || deepSpaceUnitByIdSafe(id)
      || deepSpaceLinkByIdSafe(id);
}
// Defensive accessors — file-load order means these may be called before
// the renderers below define their own. Inline copies that fall back gracefully.
function planetInfraByIdSafe(id)   { return (state.planetInfra   || []).find(p => p.id === id); }
function deepSpaceUnitByIdSafe(id) { return (state.deepSpaceUnits || []).find(u => u.id === id); }
function deepSpaceLinkByIdSafe(id) { return (state.deepSpaceLinks || []).find(l => l.id === id); }
function typeOf(item) {
  if (!item) return null;
  if (item.fromAssetId && item.toAssetId)         return 'spacelink';
  if (item.type && SPACE_ASSET_TYPES[item.type])  return 'spaceasset';
  if (item.fromEpId && item.toEpId)               return 'citylink';
  if (item.type && ENDPOINT_TYPES[item.type])     return 'endpoint';
  if (item.centerLat != null)                     return 'city';
  if (item.type && typeof DEEP_SPACE_UNIT_TYPES !== 'undefined' && DEEP_SPACE_UNIT_TYPES[item.type]) return 'deepunit';
  if (item.type && typeof DEEP_SPACE_LINK_TYPES !== 'undefined' && DEEP_SPACE_LINK_TYPES[item.type] && item.fromId && item.toId) return 'deeplink';
  if (item.type && typeof PLANET_INFRA_TYPES !== 'undefined' && PLANET_INFRA_TYPES[item.type] && item.lat != null) return 'planetinfra';
  if (item.lat != null && item.lng != null)       return 'site';
  if (item.fromSiteId && item.toSiteId)           return 'sitelink';
  if (item.type && DEVICE_TYPES[item.type])       return 'device';
  if (item.type && LINK_TYPES[item.type])         return 'link';
  if (item.type && ZONE_TYPES[item.type])         return 'zone';
  return null;
}
function screenToWorld(sx, sy) {
  const rect = dom.svg.getBoundingClientRect();
  return {
    x: (sx - rect.left - state.view.pan.x) / state.view.zoom,
    y: (sy - rect.top  - state.view.pan.y) / state.view.zoom,
  };
}
function svgEl(tag, attrs, children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); }
  if (children) for (const c of children) el.appendChild(c);
  return el;
}


/* =========================================================================
   PALETTE
   ========================================================================= */
function renderPalette() {
  const categories = {};
  for (const [type, def] of Object.entries(DEVICE_TYPES)) {
    (categories[def.category] = categories[def.category] || []).push([type, def]);
  }

  const html = [];

  // === SPACE ASSETS (space mode only) ===
  html.push(`<div class="pal-space">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Orbit Assets</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const [type, def] of Object.entries(SPACE_ASSET_TYPES)) {
    html.push(
      `<button class="pal-item" data-spaceasset-type="${type}" title="${def.label}">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${def.label}</span>` +
      `</button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Orbit Link Type</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-links">`);
  for (const [type, def] of Object.entries(SPACE_LINK_TYPES)) {
    html.push(
      `<button class="pal-link-btn ${type === state.activeSpaceLinkType ? 'active' : ''}" data-spacelink-type="${type}">` +
      `<span class="pal-link-swatch" style="background:${def.color}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`</div>`);

  // === ENDPOINTS (city mode only) ===
  html.push(`<div class="pal-endpoints">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>City Endpoints</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const [type, def] of Object.entries(ENDPOINT_TYPES)) {
    html.push(
      `<button class="pal-item" data-endpoint-type="${type}" title="${def.label}">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${def.label}</span>` +
      `</button>`
    );
  }
  html.push(`</div></div>`);
  // City-link types
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Infrastructure Link Type</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-links">`);
  for (const [type, def] of Object.entries(CITY_LINK_TYPES)) {
    html.push(
      `<button class="pal-link-btn ${type === state.activeCityLinkType ? 'active' : ''}" data-citylink-type="${type}">` +
      `<span class="pal-link-swatch" style="background:${def.color}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`</div>`);

  // === BUILT SITES (city mode only) ===
  html.push(`<div class="pal-city-sites">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Built Sites</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const s of state.sites) {
    const def = SITE_TYPES[s.type] || SITE_TYPES.office;
    const count = state.devices.filter(d => d.siteId === s.id).length;
    html.push(
      `<button class="pal-item" draggable="true" data-city-site-id="${s.id}" title="Place ${escapeHtml(s.name)} on this city map">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${escapeHtml(s.name)}</span>` +
      `<span class="pal-label" style="font-size:9px;color:var(--text-faint)">${count} devices</span>` +
      `</button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`</div>`);

  // === PLANET INFRA (world mode only) — global, non-site infrastructure ===
  html.push(`<div class="pal-planetinfra">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Global Infrastructure</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const [type, def] of Object.entries(PLANET_INFRA_TYPES)) {
    html.push(
      `<button class="pal-item" data-planetinfra-type="${type}" title="${def.label} - ${def.purpose}">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${def.label}</span>` +
      `</button>`
    );
  }
  html.push(`</div></div></div>`);

  // === DEEP SPACE UNITS (deepspace mode only) ===
  html.push(`<div class="pal-deepspace">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Deep-Space Units</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const [type, def] of Object.entries(DEEP_SPACE_UNIT_TYPES)) {
    html.push(
      `<button class="pal-item" data-deepunit-type="${type}" title="${def.label} - ${def.purpose}">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${def.label}</span>` +
      `</button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Deep-Space Link Type</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-links">`);
  for (const [type, def] of Object.entries(DEEP_SPACE_LINK_TYPES)) {
    html.push(
      `<button class="pal-link-btn ${type === state.activeDeepLinkType ? 'active' : ''}" data-deeplink-type="${type}">` +
      `<span class="pal-link-swatch" style="background:${def.color}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div></div>`);

  // === SITES (world mode only) ===
  html.push(`<div class="pal-sites">`);
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Physical Sites</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-grid">`);
  for (const [type, def] of Object.entries(SITE_TYPES)) {
    html.push(
      `<button class="pal-item" data-site-type="${type}" title="${def.label}">` +
      `<svg viewBox="0 0 80 80" style="color:${def.color}"><use href="#${def.icon}"/></svg>` +
      `<span class="pal-label">${def.label}</span>` +
      `</button>`
    );
  }
  html.push(`</div></div>`);
  // Site-link types
  html.push(`<div class="pal-section">`);
  html.push(`<div class="pal-header"><span>Inter-site Link Type</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-links">`);
  for (const [type, def] of Object.entries(SITE_LINK_TYPES)) {
    html.push(
      `<button class="pal-link-btn ${type === state.activeSiteLinkType ? 'active' : ''}" data-sitelink-type="${type}">` +
      `<span class="pal-link-swatch" style="background:${def.color}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`</div>`);

  // === DEVICES (local mode only) ===
  html.push(`<div class="pal-devices">`);
  for (const cat in categories) {
    html.push(`<div class="pal-section" data-cat="${cat}">`);
    html.push(`<div class="pal-header"><span>${cat}</span><span class="chev">▾</span></div>`);
    html.push(`<div class="pal-grid">`);
    for (const [type, def] of categories[cat]) {
      html.push(
        `<button class="pal-item" draggable="true" data-device-type="${type}" title="${def.label}">` +
        `<svg viewBox="0 0 80 80"><use href="#${def.icon}"/></svg>` +
        `<span class="pal-label">${def.label}</span>` +
        `</button>`
      );
    }
    html.push(`</div></div>`);
  }

  // zones
  html.push(`<div class="pal-section" data-cat="zones">`);
  html.push(`<div class="pal-header"><span>Security Zones</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-zones">`);
  for (const [type, def] of Object.entries(ZONE_TYPES)) {
    html.push(
      `<button class="pal-zone-btn" data-zone-type="${type}">` +
      `<span class="pal-zone-swatch" style="background:${def.stroke}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div>`);

  // link types
  html.push(`<div class="pal-section" data-cat="links">`);
  html.push(`<div class="pal-header"><span>Connection Type</span><span class="chev">▾</span></div>`);
  html.push(`<div class="pal-links">`);
  for (const [type, def] of Object.entries(LINK_TYPES)) {
    const cssColor = def.color.replace('var(--link-eth)','#8a95a4')
      .replace('var(--link-fiber)','#ff8c42').replace('var(--link-wifi)','#5fb3ff')
      .replace('var(--link-vpn)','#b388eb').replace('var(--link-trunk)','#6fcf97');
    html.push(
      `<button class="pal-link-btn ${type === state.activeLinkType ? 'active' : ''}" data-link-type="${type}">` +
      `<span class="pal-link-swatch" style="background:${cssColor}"></span>` +
      `<span>${def.label}</span></button>`
    );
  }
  html.push(`</div></div>`);
  html.push(`</div>`);

  dom.palette.innerHTML = html.join('');

  // events
  dom.palette.querySelectorAll('.pal-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
  });
  dom.palette.querySelectorAll('.pal-item[data-device-type]').forEach(it => {
    it.addEventListener('dragstart', onPaletteDragStart);
  });
  dom.palette.querySelectorAll('.pal-item[data-city-site-id]').forEach(it => {
    it.addEventListener('dragstart', onCitySiteDragStart);
    it.addEventListener('click', () => {
      state.activeCitySiteId = it.getAttribute('data-city-site-id');
      state.activeEndpointType = null;
      dom.svg.classList.add('place-site');
      const site = siteById(state.activeCitySiteId);
      dom.sbModeHint.textContent = `Click the city map to place ${site ? site.name : 'this site'}.`;
      clearCitySitePaletteSelection();
      dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(x => x.style.background = '');
      it.style.background = 'var(--bg-3)';
    });
  });
  dom.palette.querySelectorAll('.pal-item[data-site-type]').forEach(it => {
    it.addEventListener('click', () => {
      state.activeNewSiteType = it.getAttribute('data-site-type');
      dom.svg.classList.add('place-site');
      dom.sbModeHint.textContent = `Click anywhere on the map to place a ${SITE_TYPES[state.activeNewSiteType].label}.`;
      dom.palette.querySelectorAll('.pal-item[data-site-type]').forEach(x => x.style.background = '');
      it.style.background = 'var(--bg-3)';
    });
  });
  dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(it => {
    it.addEventListener('click', () => {
      state.activeEndpointType = it.getAttribute('data-endpoint-type');
      state.activeCitySiteId = null;
      dom.svg.classList.add('place-site');
      dom.sbModeHint.textContent = `Click on the city map to place a ${ENDPOINT_TYPES[state.activeEndpointType].label}.`;
      dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(x => x.style.background = '');
      clearCitySitePaletteSelection();
      it.style.background = 'var(--bg-3)';
    });
  });
  dom.palette.querySelectorAll('.pal-link-btn[data-citylink-type]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeCityLinkType = b.getAttribute('data-citylink-type');
      dom.palette.querySelectorAll('.pal-link-btn[data-citylink-type]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  dom.palette.querySelectorAll('.pal-item[data-spaceasset-type]').forEach(it => {
    it.addEventListener('click', () => {
      state.activeSpaceAssetType = it.getAttribute('data-spaceasset-type');
      dom.svg.classList.add('place-site');
      const def = SPACE_ASSET_TYPES[state.activeSpaceAssetType];
      dom.sbModeHint.textContent = `Click on the orbital ring to place a ${def.label}.`;
      dom.palette.querySelectorAll('.pal-item[data-spaceasset-type]').forEach(x => x.style.background = '');
      it.style.background = 'var(--bg-3)';
    });
  });
  dom.palette.querySelectorAll('.pal-link-btn[data-spacelink-type]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeSpaceLinkType = b.getAttribute('data-spacelink-type');
      dom.palette.querySelectorAll('.pal-link-btn[data-spacelink-type]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  dom.palette.querySelectorAll('.pal-zone-btn').forEach(b => {
    b.addEventListener('click', () => {
      state.pendingZoneType = b.getAttribute('data-zone-type');
      setMode('zone');
    });
  });
  dom.palette.querySelectorAll('.pal-link-btn[data-link-type]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeLinkType = b.getAttribute('data-link-type');
      dom.palette.querySelectorAll('.pal-link-btn[data-link-type]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  dom.palette.querySelectorAll('.pal-link-btn[data-sitelink-type]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeSiteLinkType = b.getAttribute('data-sitelink-type');
      dom.palette.querySelectorAll('.pal-link-btn[data-sitelink-type]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  // Planet infra
  dom.palette.querySelectorAll('.pal-item[data-planetinfra-type]').forEach(it => {
    it.addEventListener('click', () => {
      state.activePlanetInfraType = it.getAttribute('data-planetinfra-type');
      state.activeNewSiteType = null;
      dom.svg.classList.add('place-site');
      const def = PLANET_INFRA_TYPES[state.activePlanetInfraType];
      dom.sbModeHint.textContent = `Click on the world map to place a ${def.label}.`;
      dom.palette.querySelectorAll('.pal-item[data-planetinfra-type]').forEach(x => x.style.background = '');
      dom.palette.querySelectorAll('.pal-item[data-site-type]').forEach(x => x.style.background = '');
      it.style.background = 'var(--bg-3)';
    });
  });
  // Deep-space units
  dom.palette.querySelectorAll('.pal-item[data-deepunit-type]').forEach(it => {
    it.addEventListener('click', () => {
      state.activeDeepUnitType = it.getAttribute('data-deepunit-type');
      dom.svg.classList.add('place-site');
      const def = DEEP_SPACE_UNIT_TYPES[state.activeDeepUnitType];
      dom.sbModeHint.textContent = `Click in deep space to place a ${def.label}.`;
      dom.palette.querySelectorAll('.pal-item[data-deepunit-type]').forEach(x => x.style.background = '');
      it.style.background = 'var(--bg-3)';
    });
  });
  // Deep-space link type
  dom.palette.querySelectorAll('.pal-link-btn[data-deeplink-type]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeDeepLinkType = b.getAttribute('data-deeplink-type');
      dom.palette.querySelectorAll('.pal-link-btn[data-deeplink-type]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
}

function onPaletteDragStart(e) {
  e.dataTransfer.setData('text/device-type', e.currentTarget.getAttribute('data-device-type'));
  e.dataTransfer.effectAllowed = 'copy';
}

function onCitySiteDragStart(e) {
  e.dataTransfer.setData('text/site-id', e.currentTarget.getAttribute('data-city-site-id'));
  e.dataTransfer.effectAllowed = 'copy';
}


/* =========================================================================
   RENDERING
   ========================================================================= */
function updateWorldTransform() {
  dom.world.setAttribute('transform',
    `translate(${state.view.pan.x} ${state.view.pan.y}) scale(${state.view.zoom})`);
  dom.sbZoom.textContent = Math.round(state.view.zoom * 100) + '%';
  dom.zoomResetBtn.textContent = Math.round(state.view.zoom * 100) + '%';
}

function renderAll() {
  if (state.viewMode === 'world') {
    renderWorldMap();
    renderSiteLinks();
    renderSites();
    renderPlanetInfra();
  } else if (state.viewMode === 'city') {
    renderCityMap();
    renderCityLinks();
    renderEndpoints();
  } else if (state.viewMode === 'space') {
    renderSpaceMap();
    renderSpaceLinks();
    renderSpaceAssets();
  } else if (state.viewMode === 'deepspace') {
    renderDeepSpace();
    renderDeepSpaceUnits();
  } else {
    renderZones();
    renderLinks();
    renderDevices();
  }
  renderProperties();
  renderWarnings();
  renderEmptyState();
  updateCounts();
  updateSiteBar();
  // Re-evaluate section progression and update toolbar / tray.
  if (typeof progressionTick === 'function') progressionTick();
}

// === SPACE VIEW RENDERING ===
// === 3D EARTH + ORBITS ===
// Builds the static parts of the Orbit view ONCE (backdrop, stars, Earth
// scaffold, label) and creates animated groups whose contents are recomputed
// every frame by renderEarth3D() / renderOrbits3D() while the view is active.

// Real-ish orbital inclinations (degrees from the equator).
const ORBIT_INCLINATIONS = {
  iss:  51.6,   // ISS
  leo:  53.0,   // Starlink-class
  meo:  55.0,   // GPS-class
  geo:   0.0,   // equatorial
  deep: 23.5,   // ecliptic-ish cislunar
};
// Longitude of the ascending node — purely stylistic so the 5 rings are
// readable and don't overlap.
const ORBIT_RAAN = { iss: 35, leo: -40, meo: 80, geo: 0, deep: -75 };

// Major city lights to scatter on the night side of the rotating Earth.
const EARTH_NIGHT_CITIES = [
  [-74.0,  40.7], [-87.6,  41.9], [-122.4, 37.8], [-118.2, 34.0],
  [-79.4,  43.7], [-99.1,  19.4], [-46.6, -23.6], [-58.4, -34.6],
  [-0.1,   51.5], [ 2.35,  48.9], [ 13.4,  52.5], [ 12.5,  41.9],
  [ 28.9,  41.0], [ 37.6,  55.7], [ 39.3,  21.4], [ 51.5,  25.3],
  [ 55.3,  25.2], [ 72.8,  19.0], [ 77.2,  28.6], [ 88.4,  22.6],
  [ 121.5, 31.2], [ 116.4, 39.9], [ 114.2, 22.3], [ 126.9, 37.6],
  [ 139.7, 35.7], [ 151.2, -33.9], [ 174.8, -36.8],
  [ 31.2,  30.0], [ 18.4, -33.9], [ 36.8,  -1.3], [ 3.4,   6.5],
];

let _orbitAnim = { rafId: 0, lastTs: 0, earthAngle: 0, runs: false };

function renderSpaceMap() {
  if (dom.spacemapLayer.dataset.built === '1') return;
  dom.spacemapLayer.innerHTML = '';
  const frag = document.createDocumentFragment();
  // Backdrop and deterministic deep-space starfield
  frag.appendChild(svgEl('rect', {
    class: 'space-bg', x: -5000, y: -5000, width: 10000, height: 10000
  }));
  const rng = (seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280)(42);
  for (let i = 0; i < 420; i++) {
    const x = (rng() - 0.5) * 4600;
    const y = (rng() - 0.5) * 4600;
    const near = rng() > 0.88;
    const r = near ? 1.5 + rng() * 1.9 : 0.4 + rng() * 1.1;
    const op = near ? 0.6 + rng() * 0.38 : 0.18 + rng() * 0.5;
    frag.appendChild(svgEl('circle', {
      class: 'space-star' + (near ? ' near' : ''), cx: x, cy: y, r, opacity: op
    }));
  }
  // Earth outer halo (large soft cyan glow, well outside the limb)
  frag.appendChild(svgEl('circle', { class: 'earth3d-halo', cx: 0, cy: 0, r: 290 }));
  // Atmospheric scattering disc (matches the earth disc + a few px)
  frag.appendChild(svgEl('circle', { class: 'earth3d-atmos', cx: 0, cy: 0, r: 260 }));
  // Back-half orbital arcs (behind Earth) — drawn now so Earth covers them.
  const orbitsBack = svgEl('g', { id: 'orbits-back-layer' });
  frag.appendChild(orbitsBack);
  // Earth body group — recomputed each frame inside renderEarth3D().
  const earth = svgEl('g', { id: 'earth3d-group' });
  frag.appendChild(earth);
  // Front-half orbital arcs + labels (in front of Earth).
  const orbitsFront = svgEl('g', { id: 'orbits-front-layer' });
  frag.appendChild(orbitsFront);
  // Scale label (footer)
  const scale = svgEl('text', { class: 'space-scale-label', x: -1030, y: 1040 });
  scale.textContent = 'Earth-centered orbital model · radius compressed for legibility · inclinations and rotation are real-ish';
  frag.appendChild(scale);
  dom.spacemapLayer.appendChild(frag);
  dom.spacemapLayer.dataset.built = '1';

  // Initial paint so the view isn't empty before the animation frame.
  renderEarth3D(0);
  renderOrbits3D();
}

// === Orthographic projection helpers ===
// Sphere is centered at (0,0,0), radius EARTH_R. Camera looks down +Z.
// X right, Y down, Z out of the screen toward the viewer.
const EARTH_R = 240;
const EARTH_TILT = 0.4101524;   // 23.5° axial tilt, in radians
const SUN_DIR = (() => {
  // Sun is up-and-right and slightly in front of the camera.
  // Normalize once.
  const v = { x: 0.66, y: -0.42, z: 0.62 };
  const m = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / m, y: v.y / m, z: v.z / m };
})();

// Rotate point (x,y,z) by angle around Y, then by axial tilt around X.
// `ang` advances eastward (positive = clockwise when viewed from north pole).
function _earthRot(x, y, z, ang) {
  // Rotate around Y (longitude)
  const c = Math.cos(ang), s = Math.sin(ang);
  let rx = x * c + z * s;
  let ry = y;
  let rz = -x * s + z * c;
  // Tilt around X (axial)
  const ct = Math.cos(EARTH_TILT), st = Math.sin(EARTH_TILT);
  const ty = ry * ct - rz * st;
  const tz = ry * st + rz * ct;
  return { x: rx, y: ty, z: tz };
}

// Convert (lng,lat) on a unit sphere to 3D point, then rotate by `ang`,
// scale to EARTH_R, return { sx, sy, vis, lit }.
//   sx, sy: screen coords (SVG world units), origin at Earth center.
//   vis:    true if point is on the visible hemisphere (z >= 0)
//   lit:    dot product with sun direction in [-1, 1]; >0 = day side
function _projLngLat(lng, lat, ang) {
  const rlng = lng * Math.PI / 180;
  const rlat = lat * Math.PI / 180;
  const cosLat = Math.cos(rlat);
  // Geographic (lng,lat) → unit-sphere xyz, with +X at lng=0, equator on XZ plane
  const ux = cosLat * Math.cos(rlng);
  const uy = -Math.sin(rlat);
  const uz = cosLat * Math.sin(rlng);
  const r = _earthRot(ux, uy, uz, ang);
  const sx = r.x * EARTH_R;
  const sy = r.y * EARTH_R;
  const vis = r.z >= -0.05;     // small tolerance for limb pixels
  const lit = r.x * SUN_DIR.x + r.y * SUN_DIR.y + r.z * SUN_DIR.z;
  return { sx, sy, vis, lit };
}

// Project a closed polygon of [lng,lat] vertices to a list of points on the
// visible hemisphere. If part of the polygon wraps around the back, we split
// it at the limb so we don't draw lines through the Earth.
function _projContinent(poly, ang) {
  // Walk the polygon; whenever a point becomes invisible, close the current
  // segment along the limb. (Approximate but visually clean for stylized
  // continents.)
  const segments = [];
  let current = [];
  for (let i = 0; i <= poly.length; i++) {
    const [lng, lat] = poly[i % poly.length];
    const p = _projLngLat(lng, lat, ang);
    if (p.vis) {
      current.push(p);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

// renderEarth3D dispatches to a WebGL textured-sphere path (preferred — wraps
// the worldmap.png photo onto a real 3D-projected globe) or falls back to a
// procedural SVG path that draws CONTINENT_POLYGONS via orthographic
// projection. The choice is made once on the first call.
function renderEarth3D(ang) {
  const g = document.getElementById('earth3d-group');
  if (!g) return;
  if (_earth3d.mode === 'init') initEarthWebGL(g);
  if (_earth3d.mode === 'webgl') {
    renderEarth3D_WebGL(ang);
    return;
  }
  renderEarth3D_SVG(ang, g);
}

function renderEarth3D_SVG(ang, g) {
  g.innerHTML = '';

  // 1. Ocean disc with deep-sea radial gradient
  g.appendChild(svgEl('circle', { class: 'earth3d-ocean', cx: 0, cy: 0, r: EARTH_R }));

  // 2. Sun-side specular highlight on the ocean
  const spec = svgEl('circle', { class: 'earth3d-specular', cx: 0, cy: 0, r: EARTH_R });
  spec.setAttribute('clip-path', 'url(#earth3d-clip)');
  g.appendChild(spec);

  // 3. Continents — projected and clipped to the disc
  const land = svgEl('g', { class: 'earth3d-land' });
  land.setAttribute('clip-path', 'url(#earth3d-clip)');
  for (const poly of CONTINENT_POLYGONS) {
    const segs = _projContinent(poly, ang);
    for (const seg of segs) {
      if (seg.length < 3) continue;
      const d = 'M ' + seg.map(p => `${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`).join(' L ') + ' Z';
      land.appendChild(svgEl('path', { d }));
    }
  }
  g.appendChild(land);

  // 4. Day/night terminator — a dark gradient that follows the sun direction.
  const sunAngleDeg = Math.atan2(SUN_DIR.y, SUN_DIR.x) * 180 / Math.PI;
  const night = svgEl('circle', {
    class: 'earth3d-night', cx: 0, cy: 0, r: EARTH_R,
    transform: `rotate(${(sunAngleDeg + 180).toFixed(1)})`
  });
  night.setAttribute('clip-path', 'url(#earth3d-clip)');
  g.appendChild(night);

  // 5. City lights — only on the night side
  const cityG = svgEl('g', { class: 'earth3d-citylight' });
  cityG.setAttribute('clip-path', 'url(#earth3d-clip)');
  for (const [lng, lat] of EARTH_NIGHT_CITIES) {
    const p = _projLngLat(lng, lat, ang);
    if (!p.vis) continue;
    if (p.lit > 0.1) continue;
    const opacity = clamp((-p.lit + 0.05) * 1.4, 0.2, 1.0);
    cityG.appendChild(svgEl('circle', {
      cx: p.sx.toFixed(1), cy: p.sy.toFixed(1),
      r: 1.4, opacity: opacity.toFixed(2),
    }));
  }
  g.appendChild(cityG);

  // 6. Limb shading — soft inner shadow at the edge for sphere depth
  const limb = svgEl('circle', { class: 'earth3d-limb', cx: 0, cy: 0, r: EARTH_R });
  limb.setAttribute('clip-path', 'url(#earth3d-clip)');
  g.appendChild(limb);
}

// === WebGL textured Earth ===
// Wraps the project's worldmap.png onto a real 3D-projected sphere with
// per-fragment sun lighting and a Fresnel-based atmospheric rim. Renders into
// a canvas hosted inside a <foreignObject> so it sits in SVG world coords —
// the canvas pans and zooms with the rest of the orbital scene.
const _earth3d = {
  mode: 'init',     // 'init' | 'webgl' | 'svg'
  gl: null, program: null, mesh: null, texture: null,
  foreign: null, canvas: null,
  uMVP: null, uModel: null, uSunDir: null, uDayTex: null,
  aPos: 0, aNorm: 0, aUV: 0,
  textureReady: false,
};

function _earthCompileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('Earth shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// UV-sphere mesh, north pole at +Y. Returns interleaved-attribute buffers.
function _earthBuildSphereMesh(gl, stacks, slices) {
  const positions = [], uvs = [], normals = [], indices = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = i * Math.PI / stacks;
    const v = i / stacks;             // 0 at north pole, 1 at south pole
    for (let j = 0; j <= slices; j++) {
      const theta = j * 2 * Math.PI / slices;
      const u = j / slices;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + (slices + 1);
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  const mkBuf = (data, Type, target) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(target, buf);
    gl.bufferData(target, new Type(data), gl.STATIC_DRAW);
    return buf;
  };
  return {
    posBuf:  mkBuf(positions, Float32Array, gl.ARRAY_BUFFER),
    normBuf: mkBuf(normals,   Float32Array, gl.ARRAY_BUFFER),
    uvBuf:   mkBuf(uvs,       Float32Array, gl.ARRAY_BUFFER),
    idxBuf:  mkBuf(indices,   Uint16Array,  gl.ELEMENT_ARRAY_BUFFER),
    indexCount: indices.length,
  };
}

// Combined Model+View+Projection: orthographic projection that scales the
// unit sphere to fit in clip space [-s, +s], rotated by angleY around the
// vertical axis and tilted by tiltX around the horizontal axis.
function _earthMVPMatrix(angleY, tiltX, scale) {
  const cy = Math.cos(angleY), sy = Math.sin(angleY);
  const cx = Math.cos(tiltX),  sx = Math.sin(tiltX);
  const s = scale;
  // Column-major. Derivation: ScaleByS * TiltX * RotY * vertex.
  return new Float32Array([
    // column 0 → x
    s*cy,       s*sx*sy,    -s*cx*sy,   0,
    // column 1 → y
    0,          s*cx,        s*sx,      0,
    // column 2 → z (depth; used for cull but not visible in orthographic)
    s*sy,      -s*sx*cy,     s*cx*cy,   0,
    // column 3 → translation
    0,          0,           0,         1,
  ]);
}
function _earthModelMatrix(angleY, tiltX) {
  return _earthMVPMatrix(angleY, tiltX, 1);  // same rotation, no scale
}

function initEarthWebGL(parentGroup) {
  if (_earth3d.mode !== 'init') return _earth3d.mode === 'webgl';
  try {
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreign.setAttribute('x', -260);
    foreign.setAttribute('y', -260);
    foreign.setAttribute('width', 520);
    foreign.setAttribute('height', 520);
    foreign.setAttribute('id', 'earth3d-foreign');

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width  = 520 * dpr;
    canvas.height = 520 * dpr;
    canvas.style.width  = '520px';
    canvas.style.height = '520px';
    canvas.style.display = 'block';

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) { _earth3d.mode = 'svg'; return false; }

    const vs = _earthCompileShader(gl, gl.VERTEX_SHADER, `
      attribute vec3 aPos;
      attribute vec3 aNorm;
      attribute vec2 aUV;
      uniform mat4 uMVP;
      uniform mat4 uModel;
      varying vec2 vUV;
      varying vec3 vNorm;
      void main() {
        vUV = aUV;
        vNorm = (uModel * vec4(aNorm, 0.0)).xyz;
        gl_Position = uMVP * vec4(aPos, 1.0);
      }
    `);
    const fs = _earthCompileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 vUV;
      varying vec3 vNorm;
      uniform sampler2D uDayTex;
      uniform vec3 uSunDir;
      void main() {
        vec3 N = normalize(vNorm);
        vec3 V = vec3(0.0, 0.0, 1.0);     // orthographic view direction
        float sunDot = dot(N, uSunDir);
        vec3 raw = texture2D(uDayTex, vUV).rgb;
        // The user's worldmap.png is a dark night-Earth photo: ocean is very
        // dark, land is slightly brighter, city lights are bright. Push the
        // contrast so continents pop on the day side and lights pop at night.
        float luma = dot(raw, vec3(0.30, 0.59, 0.11));
        vec3 day = raw * (1.0 + luma * 1.4);                      // boost mids/highs
        day = clamp(day * 1.35, 0.0, 1.0);
        float dayMix = smoothstep(-0.20, 0.30, sunDot);
        // Night side: city lights stay bright (their relative luma is
        // already high in the photo); base is dimmed with a faint blue tint.
        vec3 night = raw * 0.35 + vec3(0.015, 0.030, 0.075);
        // Pull out the brightest texels (city lights) and keep them visible
        // on the night side at full strength.
        float lightMask = smoothstep(0.55, 0.85, luma);
        night += raw * lightMask * 0.6;
        vec3 surface = mix(night, day, dayMix);
        // Atmospheric rim (Fresnel-style), tinted by how lit the limb is.
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        vec3 atmos = vec3(0.40, 0.70, 1.0) * fresnel * (0.45 + 0.55 * dayMix);
        gl_FragColor = vec4(surface + atmos, 1.0);
      }
    `);
    if (!vs || !fs) { _earth3d.mode = 'svg'; return false; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Earth program link failed:', gl.getProgramInfoLog(prog));
      _earth3d.mode = 'svg';
      return false;
    }

    const mesh = _earthBuildSphereMesh(gl, 48, 96);

    // Placeholder texture (dark blue ocean) until the photo loads.
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([15, 50, 95, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);          // wrap longitudinally
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);   // clamp at poles

    // Async-load the equirectangular Earth photo from disk. Try a few names.
    const tryNext = (candidates) => {
      if (!candidates.length) return;
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        _earth3d.textureReady = true;
        if (state.viewMode === 'space') renderEarth3D(_orbitAnim.earthAngle);
      };
      img.onerror = () => tryNext(candidates.slice(1));
      img.src = candidates[0];
    };
    tryNext(['worldmap.jpg', 'worldmap.png', 'worldmap.webp']);

    foreign.appendChild(canvas);
    // Clear any existing SVG land/night layers — WebGL handles the surface.
    parentGroup.innerHTML = '';
    parentGroup.appendChild(foreign);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    _earth3d.gl = gl;
    _earth3d.program = prog;
    _earth3d.mesh = mesh;
    _earth3d.texture = tex;
    _earth3d.foreign = foreign;
    _earth3d.canvas = canvas;
    _earth3d.uMVP    = gl.getUniformLocation(prog, 'uMVP');
    _earth3d.uModel  = gl.getUniformLocation(prog, 'uModel');
    _earth3d.uSunDir = gl.getUniformLocation(prog, 'uSunDir');
    _earth3d.uDayTex = gl.getUniformLocation(prog, 'uDayTex');
    _earth3d.aPos    = gl.getAttribLocation(prog, 'aPos');
    _earth3d.aNorm   = gl.getAttribLocation(prog, 'aNorm');
    _earth3d.aUV     = gl.getAttribLocation(prog, 'aUV');

    _earth3d.mode = 'webgl';
    return true;
  } catch (e) {
    console.warn('Earth WebGL init failed:', e);
    _earth3d.mode = 'svg';
    return false;
  }
}

function renderEarth3D_WebGL(angleY) {
  const { gl, program, mesh, texture, uMVP, uModel, uSunDir, uDayTex, aPos, aNorm, aUV } = _earth3d;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.posBuf);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normBuf);
  gl.enableVertexAttribArray(aNorm);
  gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuf);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idxBuf);

  const sphereR = 0.92;                                          // leave a margin for the rim glow
  gl.uniformMatrix4fv(uMVP,   false, _earthMVPMatrix(angleY, EARTH_TILT, sphereR));
  gl.uniformMatrix4fv(uModel, false, _earthModelMatrix(angleY, EARTH_TILT));
  // SUN_DIR is in SVG coords (y down). WebGL world is y-up — flip y.
  gl.uniform3f(uSunDir, SUN_DIR.x, -SUN_DIR.y, SUN_DIR.z);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(uDayTex, 0);

  gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
}

// === 3D-projected orbital rings ===
// Each orbit lies in a plane defined by its inclination + RAAN. We sample
// the orbit, project to screen, and split the loop into a "back" arc
// (z < 0, hidden behind Earth, dim + dashed) and a "front" arc (z >= 0,
// visible, bright). Label sits at the highest visible point.
function renderOrbits3D() {
  const back = document.getElementById('orbits-back-layer');
  const front = document.getElementById('orbits-front-layer');
  if (!back || !front) return;
  back.innerHTML = '';
  front.innerHTML = '';

  for (const [key, def] of Object.entries(ORBIT_ALTITUDES)) {
    const inc  = (ORBIT_INCLINATIONS[key] || 0) * Math.PI / 180;
    const raan = (ORBIT_RAAN[key] || 0) * Math.PI / 180;
    const R    = def.radius;
    // Sample the orbit once and bucket into front/back continuous arcs.
    const arcs = [[]];     // alternating "back" / "front" segments
    let lastWasFront = null;
    let highest = { sy: Infinity, sx: 0 };
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * 2 * Math.PI;
      // Position in orbital plane (X-Z plane, Y up)
      let ox = R * Math.cos(t);
      let oy = 0;
      let oz = R * Math.sin(t);
      // Rotate by RAAN around Y
      const cr = Math.cos(raan), sr = Math.sin(raan);
      const rx = ox * cr + oz * sr;
      const rz = -ox * sr + oz * cr;
      ox = rx; oz = rz;
      // Tilt by inclination around X
      const ci = Math.cos(inc), si = Math.sin(inc);
      const ry = oy * ci - oz * si;
      const rz2 = oy * si + oz * ci;
      oy = ry; oz = rz2;
      // Project (Y down in SVG)
      const sx = ox;
      const sy = -oy;
      const z  = oz;
      const isFront = z >= 0;
      if (lastWasFront === null) {
        lastWasFront = isFront;
        arcs[0] = [{ sx, sy, front: isFront }];
      } else if (isFront !== lastWasFront) {
        arcs.push([{ sx, sy, front: isFront }]);
        lastWasFront = isFront;
      } else {
        arcs[arcs.length - 1].push({ sx, sy, front: isFront });
      }
      if (sy < highest.sy && isFront) { highest = { sx, sy }; }
    }
    // Emit each arc into the right layer
    for (const arc of arcs) {
      if (arc.length < 2) continue;
      const d = 'M ' + arc.map(p => `${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`).join(' L ');
      if (arc[0].front) {
        front.appendChild(svgEl('path', { class: `orbit3d-front ${key}`, d }));
      } else {
        back.appendChild(svgEl('path', { class: `orbit3d-back ${key}`, d }));
      }
    }
    // Label at the topmost visible point of the orbit
    const lbl = svgEl('text', {
      class: 'orbit3d-label',
      x: highest.sx.toFixed(1), y: (highest.sy - 6).toFixed(1),
    });
    lbl.textContent = `${def.label} · ${def.km.toLocaleString()} km · ${(ORBIT_INCLINATIONS[key] || 0).toFixed(1)}°`;
    front.appendChild(lbl);
  }
}

function orbitPoint2D(orbitKey, angle) {
  const def = ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo;
  const inc  = (ORBIT_INCLINATIONS[orbitKey] || 0) * Math.PI / 180;
  const raan = (ORBIT_RAAN[orbitKey] || 0) * Math.PI / 180;
  const R = def.radius;
  let ox = R * Math.cos(angle);
  let oy = 0;
  let oz = R * Math.sin(angle);
  const cr = Math.cos(raan), sr = Math.sin(raan);
  const rx = ox * cr + oz * sr;
  const rz = -ox * sr + oz * cr;
  ox = rx; oz = rz;
  const ci = Math.cos(inc), si = Math.sin(inc);
  const ry = oy * ci - oz * si;
  const rz2 = oy * si + oz * ci;
  return { x: ox, y: -ry, z: rz2, front: rz2 >= 0 };
}

function orbitAngleFromWorld(orbitKey, x, y) {
  let best = { angle: Math.atan2(y, x), d2: Infinity };
  for (let i = 0; i < 240; i++) {
    const angle = (i / 240) * Math.PI * 2;
    const p = orbitPoint2D(orbitKey, angle);
    const d2v = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d2v < best.d2) best = { angle, d2: d2v };
  }
  return best.angle;
}

function orbitPeriodMinutes(orbitKey) {
  if (orbitKey === 'ground') return 0;
  const alt = (ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo).km;
  const earthMu = 398600.4418; // km^3/s^2
  const radiusKm = 6371 + alt;
  return 2 * Math.PI * Math.sqrt(Math.pow(radiusKm, 3) / earthMu) / 60;
}

function orbitSpeedKms(orbitKey) {
  if (orbitKey === 'ground') return 0;
  const alt = (ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo).km;
  return Math.sqrt(398600.4418 / (6371 + alt));
}

function spaceAssetVectorKm(a) {
  const def = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
  const orbitKey = a.type === 'ground_station' ? 'ground' : (a.orbit || def.orbit || 'leo');
  if (orbitKey === 'ground') {
    const ang = a.angle || Math.atan2(a.y || 0, a.x || 1);
    return { x: 6371 * Math.cos(ang), y: 0, z: 6371 * Math.sin(ang), orbitKey };
  }
  const radiusKm = 6371 + (ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo).km;
  const p = orbitPoint2D(orbitKey, a.angle || 0);
  const scale = radiusKm / (ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo).radius;
  return { x: p.x * scale, y: -p.y * scale, z: p.z * scale, orbitKey };
}

function spaceLinkMetrics(a, b) {
  const va = spaceAssetVectorKm(a), vb = spaceAssetVectorKm(b);
  const dx = vb.x - va.x, dy = vb.y - va.y, dz = vb.z - va.z;
  const distanceKm = Math.hypot(dx, dy, dz);
  const latencyMs = distanceKm / 299792.458 * 1000;
  let occulted = false;
  const aGround = a.type === 'ground_station';
  const bGround = b.type === 'ground_station';
  if (aGround !== bGround) {
    const g = aGround ? va : vb;
    const s = aGround ? vb : va;
    occulted = ((s.x - g.x) * g.x + (s.y - g.y) * g.y + (s.z - g.z) * g.z) <= 0;
  } else if (!aGround && !bGround) {
    const seg2 = dx * dx + dy * dy + dz * dz;
    const t = seg2 ? clamp(-(va.x * dx + va.y * dy + va.z * dz) / seg2, 0, 1) : 0;
    const cx = va.x + dx * t, cy = va.y + dy * t, cz = va.z + dz * t;
    occulted = t > 0.02 && t < 0.98 && Math.hypot(cx, cy, cz) < 6371;
  }
  return { distanceKm, latencyMs, occulted };
}

// === Rotation animation ===
// Starts when the Orbit view is shown, stops on view switch. Earth spins at
// a scaled rate (one full revolution per ~90 visible seconds).
function startOrbitAnimation() {
  if (_orbitAnim.runs) return;
  _orbitAnim.runs = true;
  _orbitAnim.lastTs = performance.now();
  const step = (ts) => {
    if (!_orbitAnim.runs) return;
    const dt = (ts - _orbitAnim.lastTs) / 1000;
    _orbitAnim.lastTs = ts;
    // 2π per 90 seconds → smooth visible rotation
    _orbitAnim.earthAngle += (2 * Math.PI / 90) * dt;
    if (state.viewMode === 'space') {
      renderEarth3D(_orbitAnim.earthAngle);
      // Orbits do not need re-projection (they're static in world space),
      // but satellites that ride them might in future — leave the helper
      // callable per frame and just call it once at start.
    }
    _orbitAnim.rafId = requestAnimationFrame(step);
  };
  _orbitAnim.rafId = requestAnimationFrame(step);
}
function stopOrbitAnimation() {
  _orbitAnim.runs = false;
  if (_orbitAnim.rafId) cancelAnimationFrame(_orbitAnim.rafId);
  _orbitAnim.rafId = 0;
}

function renderSpaceAssets() {
  dom.spaceassetsLayer.innerHTML = '';
  const assetRows = state.spaceAssets.map(a => ({ asset: a, pos: spaceAssetPosition(a) }))
    .sort((a, b) => (a.pos.z || 0) - (b.pos.z || 0));
  for (const row of assetRows) {
    const a = row.asset;
    const def = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
    const pos = row.pos;
    const selected = state.selectedIds.has(a.id);
    const pending = state.pendingConnectId === a.id;
    const linkCount = state.spaceLinks.filter(l => l.fromAssetId === a.id || l.toAssetId === a.id).length;
    const status = linkCount ? (pos.front === false ? 'warn' : 'ok') : 'idle';
    const g = svgEl('g', {
      class: 'space-asset' + (pos.front === false ? ' back' : '') + (selected ? ' selected' : '') + (pending ? ' connect-pending' : ''),
      transform: `translate(${pos.x} ${pos.y})`,
      'data-id': a.id, 'data-kind': 'spaceasset'
    });
    if (a.type !== 'ground_station') {
      g.appendChild(svgEl('line', { class: 'sa-stem', x1: -pos.x, y1: -pos.y, x2: 0, y2: 0 }));
    }
    g.appendChild(svgEl('circle', { class: 'sa-halo', cx: 0, cy: 0, r: 26, stroke: def.color }));
    g.appendChild(svgEl('circle', { class: 'sa-bg', cx: 0, cy: 0, r: 22, stroke: def.color }));
    g.appendChild(svgEl('path', { class: `sa-status ${status}`, d: 'M -15 -18 A 23 23 0 0 1 15 -18' }));
    g.appendChild(svgEl('use', {
      class: 'sa-icon', href: '#' + def.icon, x: -16, y: -16, width: 32, height: 32
    }));
    const lbl = svgEl('text', { class: 'sa-label', x: 0, y: 40 });
    lbl.textContent = a.label || def.label;
    g.appendChild(lbl);
    const ty = svgEl('text', { class: 'sa-type', x: 0, y: 53 });
    ty.textContent = def.label;
    g.appendChild(ty);
    const alt = svgEl('text', { class: 'sa-alt', x: 0, y: 66 });
    alt.textContent = spaceAssetAltitudeLabel(a);
    g.appendChild(alt);
    dom.spaceassetsLayer.appendChild(g);
  }
}

function renderSpaceLinks() {
  dom.spacelinksLayer.innerHTML = '';
  for (const sl of state.spaceLinks) {
    const a = spaceAssetById(sl.fromAssetId), b = spaceAssetById(sl.toAssetId);
    if (!a || !b) continue;
    const pa = spaceAssetPosition(a), pb = spaceAssetPosition(b);
    const def = SPACE_LINK_TYPES[sl.type] || SPACE_LINK_TYPES.laser_isl;
    const selected = state.selectedIds.has(sl.id);
    const metrics = spaceLinkMetrics(a, b);
    const g = svgEl('g', { 'data-id': sl.id, 'data-kind': 'spacelink' });
    const cone = spaceCoverageCone(a, b, def);
    if (cone) g.appendChild(cone);
    g.appendChild(svgEl('line', { class: 'space-link-hit', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }));
    const attrs = {
      class: 'space-link' + (metrics.occulted ? ' occulted' : '') + (selected ? ' selected' : ''),
      x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
      stroke: def.color, 'stroke-width': def.width, 'stroke-linecap': 'round',
    };
    if (def.dash) attrs['stroke-dasharray'] = def.dash;
    g.appendChild(svgEl('line', attrs));
    const pulseAttrs = {
      class: 'space-link pulse' + (metrics.occulted ? ' occulted' : ''),
      x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
      stroke: def.color, 'stroke-width': Math.max(1.4, def.width * 0.65),
      'stroke-dasharray': '1 14', 'stroke-linecap': 'round',
    };
    g.appendChild(svgEl('line', pulseAttrs));
    if (sl.label || selected) {
      const t = svgEl('text', { class: 'space-link-label', x: (pa.x+pb.x)/2, y: (pa.y+pb.y)/2 - 6 });
      const metricLabel = `${Math.round(metrics.distanceKm).toLocaleString()} km - ${metrics.latencyMs.toFixed(1)} ms`;
      t.textContent = sl.label ? `${sl.label} - ${metricLabel}` : metricLabel;
      g.appendChild(t);
    }
    dom.spacelinksLayer.appendChild(g);
  }
}

// Place an asset around an orbital ring at its `angle` (radians).
// Ground stations are placed at the Earth surface (radius 240).
function spaceAssetPosition(a) {
  const def = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
  const ang = a.angle || 0;
  if (a.type === 'ground_station') {
    return { x: 240 * Math.cos(ang), y: 240 * Math.sin(ang), z: 1, front: true };
  }
  return orbitPoint2D(a.orbit || def.orbit || 'leo', ang);
}

function spaceAssetAltitudeLabel(a) {
  const def = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
  if (a.type === 'ground_station') return 'surface';
  const orbitKey = a.orbit || def.orbit || 'leo';
  const orbitDef = ORBIT_ALTITUDES[orbitKey] || ORBIT_ALTITUDES.leo;
  const minutes = orbitPeriodMinutes(orbitKey);
  const period = minutes >= 1440 ? `${(minutes / 1440).toFixed(1)} d` : `${Math.round(minutes)} m`;
  return `${orbitDef.label} - ${orbitDef.km.toLocaleString()} km - ${period}`;
}

function spaceCoverageCone(a, b, linkDef) {
  const ground = a.type === 'ground_station' ? a : (b.type === 'ground_station' ? b : null);
  const other = ground === a ? b : (ground === b ? a : null);
  if (!ground || !other) return null;
  const pg = spaceAssetPosition(ground);
  const po = spaceAssetPosition(other);
  const dx = po.x - pg.x, dy = po.y - pg.y;
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const nx = -dy / len, ny = dx / len;
  const spread = Math.min(90, Math.max(34, len * 0.12));
  const near = Math.min(80, len * 0.22);
  const p1 = { x: pg.x + nx * 10, y: pg.y + ny * 10 };
  const p2 = { x: po.x + nx * spread, y: po.y + ny * spread };
  const p3 = { x: po.x - nx * spread, y: po.y - ny * spread };
  const p4 = { x: pg.x - nx * 10, y: pg.y - ny * 10 };
  const d = `M ${p1.x} ${p1.y} C ${pg.x + dx * 0.35 + nx * near} ${pg.y + dy * 0.35 + ny * near}, ${po.x + nx * spread} ${po.y + ny * spread}, ${p2.x} ${p2.y} L ${p3.x} ${p3.y} C ${po.x - nx * spread} ${po.y - ny * spread}, ${pg.x + dx * 0.35 - nx * near} ${pg.y + dy * 0.35 - ny * near}, ${p4.x} ${p4.y} Z`;
  return svgEl('path', { class: 'coverage-cone', d, stroke: linkDef.color });
}

function renderCityMap() {
  const city = cityById(state.activeCityId);
  dom.citymapLayer.innerHTML = '';
  if (!city) return;
  const w = city.mapW || 2000, h = city.mapH || 1400;
  const frag = document.createDocumentFragment();
  // base background rectangle (always)
  frag.appendChild(svgEl('rect', {
    class: 'city-bg-rect', x: 0, y: 0, width: w, height: h
  }));
  if (city.mapBackend === 'image' && city.imageUrl) {
    const img = svgEl('image', {
      class: 'city-bg-image',
      href: city.imageUrl, 'xlink:href': city.imageUrl,
      x: 0, y: 0, width: w, height: h,
      preserveAspectRatio: 'xMidYMid slice',
    });
    frag.appendChild(img);
  } else if (city.mapBackend === 'osm' || city.mapBackend === 'gmaps') {
    // SVG layer is hidden; the Leaflet/Google div is shown
    const tip = svgEl('text', {
      class: 'city-bg-tip', x: w/2, y: h/2
    });
    tip.textContent = `${city.mapBackend === 'osm' ? 'OSM' : 'Google Maps'} tiles render in overlay div`;
    frag.appendChild(tip);
  } else {
    // No backdrop — show tip
    const tip1 = svgEl('text', { class: 'city-bg-tip', x: w/2, y: h/2 - 12 });
    tip1.textContent = `${city.name} — no map backdrop`;
    frag.appendChild(tip1);
    const tip2 = svgEl('text', { class: 'city-bg-tip', x: w/2, y: h/2 + 12, 'font-size': 11 });
    tip2.textContent = `Choose a backend in the sub-header above (Image / OSM / Google).`;
    frag.appendChild(tip2);
  }
  dom.citymapLayer.appendChild(frag);
}

function renderEndpoints() {
  dom.endpointsLayer.innerHTML = '';
  for (const ep of state.endpoints) {
    if (state.activeCityId && ep.cityId !== state.activeCityId) continue;
    const def = ENDPOINT_TYPES[ep.type] || ENDPOINT_TYPES.building;
    const site = ep.siteId ? siteById(ep.siteId) : null;
    const siteDef = site ? (SITE_TYPES[site.type] || SITE_TYPES.office) : null;
    const selected = state.selectedIds.has(ep.id);
    const pending = state.pendingConnectId === ep.id;
    const g = svgEl('g', {
      class: 'endpoint' + (selected ? ' selected' : '') + (pending ? ' connect-pending' : ''),
      transform: `translate(${ep.x} ${ep.y})`,
      'data-id': ep.id, 'data-kind': 'endpoint'
    });
    g.appendChild(svgEl('circle', { class: 'ep-ring', cx: 0, cy: 0, r: 22, stroke: siteDef ? siteDef.color : def.color }));
    g.appendChild(svgEl('use', {
      class: 'ep-icon', href: '#' + (siteDef ? siteDef.icon : def.icon), x: -16, y: -16, width: 32, height: 32
    }));
    const lbl = svgEl('text', { class: 'ep-label', x: 0, y: 40 });
    lbl.textContent = ep.label || def.label;
    g.appendChild(lbl);
    dom.endpointsLayer.appendChild(g);
  }
}

function renderCityLinks() {
  dom.citylinksLayer.innerHTML = '';
  for (const cl of state.cityLinks) {
    const a = endpointById(cl.fromEpId), b = endpointById(cl.toEpId);
    if (!a || !b) continue;
    if (state.activeCityId && (a.cityId !== state.activeCityId || b.cityId !== state.activeCityId)) continue;
    const def = CITY_LINK_TYPES[cl.type] || CITY_LINK_TYPES.fiber_buried;
    const selected = state.selectedIds.has(cl.id);
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx/dist, uy = dy/dist;
    const inset = 22;
    const x1 = a.x + ux*inset, y1 = a.y + uy*inset;
    const x2 = b.x - ux*inset, y2 = b.y - uy*inset;
    const g = svgEl('g', { 'data-id': cl.id, 'data-kind': 'citylink' });
    g.appendChild(svgEl('line', { class: 'citylink-hit', x1, y1, x2, y2 }));
    const lineAttrs = {
      class: 'citylink' + (selected ? ' selected' : ''),
      x1, y1, x2, y2, stroke: def.color, 'stroke-width': def.width, 'stroke-linecap': 'round',
    };
    if (def.dash) lineAttrs['stroke-dasharray'] = def.dash;
    g.appendChild(svgEl('line', lineAttrs));
    if (cl.label) {
      const t = svgEl('text', { class: 'citylink-label', x: (x1+x2)/2, y: (y1+y2)/2 - 6 });
      t.textContent = cl.label;
      g.appendChild(t);
    }
    dom.citylinksLayer.appendChild(g);
  }
}

function cityById(id)     { return state.cities.find(c => c.id === id); }
function endpointById(id) { return state.endpoints.find(e => e.id === id); }
function cityLinkById(id) { return state.cityLinks.find(c => c.id === id); }

function renderEmptyState() {
  // Only relevant in local view
  if (state.viewMode !== 'local') {
    dom.emptyState.classList.add('hidden');
    return;
  }
  // Count devices in the active site (or all if no active filter)
  const visible = state.devices.filter(d =>
    !state.activeSiteId || !d.siteId || d.siteId === state.activeSiteId);
  if (visible.length > 0) {
    dom.emptyState.classList.add('hidden');
    return;
  }
  const site = siteById(state.activeSiteId);
  // Build message and action buttons
  dom.emptyStateTitle.textContent = site
    ? `"${site.name}" has no devices yet`
    : 'No devices yet';
  dom.emptyStateMsg.innerHTML = 'Drag a device from the left palette to begin designing this site\'s network.';
  // Show buttons to jump to populated sites
  const populated = state.sites
    .filter(s => s.id !== state.activeSiteId && state.devices.some(d => d.siteId === s.id))
    .slice(0, 3);
  let actionsHtml = '';
  for (const s of populated) {
    const cnt = state.devices.filter(d => d.siteId === s.id).length;
    actionsHtml += `<button data-go="${s.id}">→ ${escapeHtml(s.name)} (${cnt} devices)</button>`;
  }
  // True-empty state (no devices, no other populated sites) → offer demo or walkthrough.
  const trulyEmpty = visible.length === 0 && populated.length === 0;
  if (trulyEmpty) {
    actionsHtml += `<button data-go-walkthrough>Open Guided Walkthrough</button>`;
    actionsHtml += `<button class="primary" data-go-demo>Load demo network</button>`;
  } else {
    actionsHtml += `<button class="primary" data-go-world>Open Planet view</button>`;
  }
  dom.emptyStateActions.innerHTML = actionsHtml;
  dom.emptyStateActions.querySelectorAll('[data-go]').forEach(b => {
    b.addEventListener('click', () => setActiveSite(b.getAttribute('data-go')));
  });
  dom.emptyStateActions.querySelector('[data-go-world]')?.addEventListener('click', () => setViewMode('world'));
  dom.emptyStateActions.querySelector('[data-go-walkthrough]')?.addEventListener('click', () => {
    if (typeof openWalkthrough === 'function') openWalkthrough(0);
  });
  dom.emptyStateActions.querySelector('[data-go-demo]')?.addEventListener('click', loadDemoNetwork);
  dom.emptyState.classList.remove('hidden');
}

// Populate the rich seed example on user demand.
function loadDemoNetwork() {
  if (state.devices.length || state.spaceAssets.length || state.cities.length > 1) {
    if (!confirm('Loading the demo network will overwrite your current diagram. Continue?')) return;
  }
  pushHistory();
  // Reset everything seedExample touches.
  state.devices = []; state.links = []; state.zones = [];
  state.sites = []; state.siteLinks = [];
  state.cities = []; state.endpoints = []; state.cityLinks = [];
  state.spaceAssets = []; state.spaceLinks = [];
  state.planetInfra = [];
  state.deepSpaceUnits = []; state.deepSpaceLinks = [];
  seedExample();
  ensureDefaultSite();
  ensureDefaultCity(false);
  state.selectedIds.clear();
  renderAll();
}

function renderWorldMap() {
  if (dom.worldmapLayer.childElementCount > 0) return; // built once
  const frag = document.createDocumentFragment();
  // Deep ocean with gradient (fallback when no image)
  frag.appendChild(svgEl('rect', {
    class: 'world-ocean', x: 0, y: 0, width: 3600, height: 1800
  }));
  // Photographic background image (if user has saved one)
  // Tries 'worldmap.jpg', 'worldmap.png', 'worldmap.webp' in order
  tryLoadWorldImage(['worldmap.jpg', 'worldmap.png', 'worldmap.webp']);
  // Tip text (hidden once image loads)
  const tip1 = svgEl('text', { class: 'image-tip', x: 1800, y: 1700 });
  tip1.textContent = 'Tip: save your night-Earth image as worldmap.jpg in the project folder for a photographic planet background.';
  frag.appendChild(tip1);
  // lat/lng grid every 30°
  const grid = svgEl('g', { class: 'latlng-grid' });
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = (lng + 180) * 10;
    grid.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: 1800 }));
    if (lng !== -180 && lng !== 180) {
      const t = svgEl('text', { x: x + 4, y: 16 });
      t.textContent = (lng > 0 ? '+' : '') + lng + '°';
      grid.appendChild(t);
    }
  }
  for (let lat = -60; lat <= 80; lat += 30) {
    const y = (90 - lat) * 10;
    const ln = svgEl('line', { x1: 0, y1: y, x2: 3600, y2: y });
    if (lat === 0) ln.classList.add('equator');
    grid.appendChild(ln);
    const t = svgEl('text', { x: 6, y: y - 4 });
    t.textContent = (lat > 0 ? '+' : '') + lat + '°';
    grid.appendChild(t);
  }
  frag.appendChild(grid);
  // continents — render twice: blurred rim underneath, solid body on top
  for (const poly of CONTINENT_POLYGONS) {
    const pts = poly.map(([lng, lat]) => {
      const p = latLngToWorld(lat, lng);
      return `${p.x.toFixed(0)},${p.y.toFixed(0)}`;
    }).join(' ');
    frag.appendChild(svgEl('polygon', { class: 'continent-rim', points: pts }));
  }
  for (const poly of CONTINENT_POLYGONS) {
    const pts = poly.map(([lng, lat]) => {
      const p = latLngToWorld(lat, lng);
      return `${p.x.toFixed(0)},${p.y.toFixed(0)}`;
    }).join(' ');
    frag.appendChild(svgEl('polygon', { class: 'continent', points: pts }));
  }
  // Outer frame
  frag.appendChild(svgEl('rect', {
    class: 'world-frame', x: 0, y: 0, width: 3600, height: 1800, rx: 4
  }));
  dom.worldmapLayer.appendChild(frag);

  // Live layer — cities, planes, satellites
  buildLiveLayer();
}

function tryLoadWorldImage(candidates) {
  if (!candidates.length) return;
  const url = candidates[0];
  // Use a hidden HTMLImageElement to test loadability without committing to SVG
  const probe = new Image();
  probe.onload = () => {
    // Insert SVG <image> at the bottom of the worldmap layer (above ocean rect)
    const svgImg = svgEl('image', {
      class: 'world-image',
      href: url, 'xlink:href': url,
      x: 0, y: 0, width: 3600, height: 1800,
      preserveAspectRatio: 'none',
    });
    // Insert just after the world-ocean rect so it overlays it
    const ocean = dom.worldmapLayer.querySelector('.world-ocean');
    if (ocean && ocean.nextSibling) dom.worldmapLayer.insertBefore(svgImg, ocean.nextSibling);
    else dom.worldmapLayer.insertBefore(svgImg, dom.worldmapLayer.firstChild);
    dom.svg.classList.add('has-bg-image');
  };
  probe.onerror = () => tryLoadWorldImage(candidates.slice(1));
  probe.src = url + '?cb=' + Date.now();  // cache-bust so re-checks work after the user adds the file
}

function buildLiveLayer() {
  const layer = document.getElementById('live-layer');
  if (layer.childElementCount > 0) return;
  const frag = document.createDocumentFragment();

  // City lights
  const cityGroup = svgEl('g', { id: 'cities-group' });
  for (let i = 0; i < MAJOR_CITIES.length; i++) {
    const [name, lat, lng, big] = MAJOR_CITIES[i];
    const p = latLngToWorld(lat, lng);
    const r = big ? 8 : 5;
    const dot = svgEl('circle', {
      class: 'city-light' + (big ? ' big' : ''),
      cx: p.x, cy: p.y, r,
    });
    // stagger pulses so they don't sync
    dot.style.animationDelay = ((i * 0.27) % 4).toFixed(2) + 's';
    cityGroup.appendChild(dot);
    if (big) {
      const t = svgEl('text', {
        x: p.x + 12, y: p.y + 4,
        fill: 'rgba(255,230,168,0.65)',
        'font-size': 11, 'font-family': '-apple-system, sans-serif',
        'pointer-events': 'none',
      });
      t.textContent = name;
      cityGroup.appendChild(t);
    }
  }
  frag.appendChild(cityGroup);

  // Flight routes (faint dashed arcs) and animated planes
  const planeGroup = svgEl('g', { id: 'planes-group' });
  for (let i = 0; i < FLIGHT_ROUTES.length; i++) {
    const [aLat, aLng, bLat, bLng, dur] = FLIGHT_ROUTES[i];
    const pa = latLngToWorld(aLat, aLng);
    const pb = latLngToWorld(bLat, bLng);
    // arc midpoint above the chord
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2 - Math.abs(pb.x - pa.x) * 0.22 - 60;
    const d = `M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;
    // visible route
    planeGroup.appendChild(svgEl('path', { class: 'flight-route', d }));
    // moving plane
    const planeWrap = svgEl('g', { class: 'plane-icon' });
    planeWrap.appendChild(svgEl('use', {
      href: '#plane-shape',
      x: -12, y: -8, width: 24, height: 16,
    }));
    const motion = svgEl('animateMotion', {
      dur: dur + 's', repeatCount: 'indefinite', rotate: 'auto', path: d,
      begin: `${-i * 3}s`,
    });
    planeWrap.appendChild(motion);
    planeGroup.appendChild(planeWrap);
  }
  frag.appendChild(planeGroup);

  // Satellites
  const satGroup = svgEl('g', { id: 'satellites-group' });
  for (let i = 0; i < SATELLITE_ORBITS.length; i++) {
    const o = SATELLITE_ORBITS[i];
    const isHorizontal = o.yLow === o.yHigh;
    let d;
    if (isHorizontal) {
      // straight equatorial pass — extra leading segment for entry
      d = `M -200 ${o.yLow} L 3800 ${o.yLow}`;
    } else {
      // inclined sinusoidal orbit
      const ymid = (o.yLow + o.yHigh) / 2;
      const amp = (o.yHigh - o.yLow) / 2;
      d = `M -200 ${ymid}`;
      for (let x = 0; x <= 3800; x += 200) {
        const y = ymid + amp * Math.sin((x / 3600) * Math.PI * 2);
        d += ` L ${x} ${y.toFixed(0)}`;
      }
    }
    satGroup.appendChild(svgEl('path', { class: 'satellite-orbit', d }));
    const satWrap = svgEl('g', { class: 'satellite-icon' });
    satWrap.appendChild(svgEl('use', {
      href: '#satellite-shape', x: -12, y: -8, width: 24, height: 16,
    }));
    satWrap.appendChild(svgEl('animateMotion', {
      dur: o.dur + 's', repeatCount: 'indefinite', rotate: 'auto', path: d,
      begin: ((o.delay || 0) + i * 4) + 's',
    }));
    satGroup.appendChild(satWrap);
  }
  frag.appendChild(satGroup);

  layer.appendChild(frag);
}

function renderSites() {
  dom.sitesLayer.innerHTML = '';
  for (const s of state.sites) {
    const def = SITE_TYPES[s.type] || SITE_TYPES.office;
    const w = latLngToWorld(s.lat, s.lng);
    const selected = state.selectedIds.has(s.id);
    const pending = state.pendingConnectId === s.id;

    const g = svgEl('g', {
      class: 'site' + (selected ? ' selected' : '') + (pending ? ' connect-pending' : ''),
      transform: `translate(${w.x} ${w.y})`,
      'data-id': s.id, 'data-kind': 'site'
    });

    // colored halo
    g.appendChild(svgEl('circle', {
      class: 'site-icon-bg',
      cx: 0, cy: 0, r: 38, fill: def.color
    }));
    // ring
    g.appendChild(svgEl('circle', {
      class: 'site-ring',
      cx: 0, cy: 0, r: 24, stroke: def.color
    }));
    // icon (white)
    const useEl = svgEl('use', {
      class: 'site-icon',
      href: '#' + def.icon, x: -18, y: -18, width: 36, height: 36
    });
    g.appendChild(useEl);

    // device count badge
    const deviceCount = state.devices.filter(d => d.siteId === s.id).length;
    if (deviceCount > 0) {
      g.appendChild(svgEl('circle', {
        class: 'site-count-bg',
        cx: 18, cy: -18, r: 9, stroke: def.color
      }));
      const tx = svgEl('text', {
        class: 'site-count-badge',
        x: 18, y: -15
      });
      tx.textContent = deviceCount;
      g.appendChild(tx);
    }

    // name
    const nm = svgEl('text', { class: 'site-name', x: 0, y: 50 });
    nm.textContent = s.name || def.label;
    g.appendChild(nm);
    // type
    const ty = svgEl('text', { class: 'site-type', x: 0, y: 66 });
    ty.textContent = def.label.split(' ')[0];
    g.appendChild(ty);
    // coords
    const co = svgEl('text', { class: 'site-coord', x: 0, y: 80 });
    co.textContent = formatLatLng(s.lat, s.lng);
    g.appendChild(co);

    dom.sitesLayer.appendChild(g);
  }
}

function renderSiteLinks() {
  dom.sitelinksLayer.innerHTML = '';
  for (const sl of state.siteLinks) {
    const a = state.sites.find(s => s.id === sl.fromSiteId);
    const b = state.sites.find(s => s.id === sl.toSiteId);
    if (!a || !b) continue;
    const def = SITE_LINK_TYPES[sl.type] || SITE_LINK_TYPES.wan;
    const selected = state.selectedIds.has(sl.id);

    const pa = latLngToWorld(a.lat, a.lng);
    const pb = latLngToWorld(b.lat, b.lng);
    // curve mid-point above for arc effect
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2 - Math.abs(pb.x - pa.x) * 0.18;
    const d = `M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;

    const g = svgEl('g', { 'data-id': sl.id, 'data-kind': 'sitelink' });
    g.appendChild(svgEl('path', { class: 'sitelink-hit', d }));
    const pathAttrs = {
      class: 'sitelink' + (selected ? ' selected' : ''),
      d, stroke: def.color, 'stroke-width': def.width,
      'stroke-linecap': 'round'
    };
    if (def.dash) pathAttrs['stroke-dasharray'] = def.dash;
    g.appendChild(svgEl('path', pathAttrs));

    if (sl.label || sl.bandwidth) {
      const t = svgEl('text', { class: 'sitelink-label', x: mx, y: my });
      t.textContent = [sl.label, sl.bandwidth].filter(Boolean).join(' · ');
      g.appendChild(t);
    }

    dom.sitelinksLayer.appendChild(g);
  }
}

/* =========================================================================
   PLANET INFRASTRUCTURE — placed on world view by lat/lng. Distinct from
   physical sites: these represent global mesh (CDN nodes, ground uplinks,
   AI centers, etc.) without per-site internals.
   ========================================================================= */
function planetInfraById(id) {
  return (state.planetInfra || []).find(p => p.id === id);
}

function renderPlanetInfra() {
  const layer = dom.planetInfraLayer;
  if (!layer) return;
  layer.innerHTML = '';
  if (state.viewMode !== 'world') return;
  for (const pi of state.planetInfra) {
    const def = PLANET_INFRA_TYPES[pi.type] || PLANET_INFRA_TYPES.global_dc;
    const w = latLngToWorld(pi.lat, pi.lng);
    const selected = state.selectedIds.has(pi.id);
    const g = svgEl('g', {
      class: 'pi-marker' + (selected ? ' selected' : ''),
      transform: `translate(${w.x} ${w.y})`,
      'data-id': pi.id, 'data-kind': 'planetinfra',
    });
    g.appendChild(svgEl('circle', { class: 'pi-bg', cx: 0, cy: 0, r: 18, stroke: def.color }));
    g.appendChild(svgEl('use', {
      class: 'pi-icon', href: '#' + def.icon, x: -13, y: -13, width: 26, height: 26
    }));
    const lbl = svgEl('text', { class: 'pi-label', x: 0, y: 32 });
    lbl.textContent = pi.label || def.label;
    g.appendChild(lbl);
    const sub = svgEl('text', { class: 'pi-sub', x: 0, y: 44 });
    sub.textContent = def.label;
    g.appendChild(sub);
    layer.appendChild(g);
  }
}

/* =========================================================================
   DEEP SPACE UNITS — placeable in deepspace view alongside the link-budget
   studio. Each unit is positioned in synthetic deep-space coords (x,y).
   ========================================================================= */
function deepSpaceUnitById(id) {
  return (state.deepSpaceUnits || []).find(u => u.id === id);
}
function deepSpaceLinkByIdLocal(id) {
  return (state.deepSpaceLinks || []).find(l => l.id === id);
}

// Compute the rendered (x, y) of a deep-space unit. If `anchor` is set to a
// known DS_TARGETS body, the unit is positioned RELATIVE to that body's live
// position in the heliocentric system. Otherwise its absolute x/y is used.
//   u.anchor      - body id from DS_TARGETS (e.g. 'mars', 'earth', 'jwst')
//   u.anchorOffX  - radial-from-host offset (px in deep-space coords)
//   u.anchorOffY  - tangential offset (px)
// Falls back gracefully if the anchor body or ephemeris isn't available
// (e.g. when this function runs before the heliocentric module loads).
function resolveDeepUnitPosition(u, epoch = Date.now()) {
  if (!u.anchor || typeof DS_TARGETS === 'undefined' || typeof dsPlanetAU !== 'function') {
    return { x: u.x || 0, y: u.y || 0, anchored: false };
  }
  const body = DS_TARGETS[u.anchor];
  if (!body) return { x: u.x || 0, y: u.y || 0, anchored: false };
  // Resolve host planet's screen position the same way renderDeepSpace does.
  let host = u.anchor;
  if (body.kind === 'satellite' || body.kind === 'spacecraft') host = body.parent || 'earth';
  if (host === 'sun') return { x: (u.anchorOffX || 0), y: (u.anchorOffY || 0), anchored: true };
  let R = 200; let theta = 0;
  try {
    const hostDef = DS_TARGETS[host];
    if (hostDef && hostDef.a != null) {
      R = dsLogOrbitR(hostDef.a);
      const ph = dsPlanetAU(host, epoch);
      theta = Math.atan2(ph.y, ph.x);
    }
  } catch (_) { /* ignore — fall through to fallback */ }
  const baseX = R * Math.cos(theta);
  const baseY = R * Math.sin(theta);
  // For sub-bodies (Moon/JWST) offset radially outward from host so multiple
  // anchored units don't stack on the planet.
  const radialOff = (body.kind === 'satellite' || body.kind === 'spacecraft') ? 30 : 0;
  const offRadial = (u.anchorOffX || 0) + radialOff;
  const offTangen = (u.anchorOffY || 0);
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  return {
    x: baseX + cosT * offRadial - sinT * offTangen,
    y: baseY + sinT * offRadial + cosT * offTangen,
    anchored: true,
  };
}

function renderDeepSpaceUnits() {
  const layer = dom.deepSpaceUnitsLayer;
  const linkLayer = dom.deepSpaceUnitlinksLayer;
  if (!layer || !linkLayer) return;
  layer.innerHTML = '';
  linkLayer.innerHTML = '';
  if (state.viewMode !== 'deepspace') return;

  const epoch = (state.comms && state.comms.epochMs) || Date.now();
  // Cache resolved positions so links use the same coords as units.
  const pos = new Map();
  for (const u of state.deepSpaceUnits) pos.set(u.id, resolveDeepUnitPosition(u, epoch));

  // Draw links first so units render above them.
  for (const lk of state.deepSpaceLinks) {
    const a = deepSpaceUnitById(lk.fromId);
    const b = deepSpaceUnitById(lk.toId);
    if (!a || !b) continue;
    const pa = pos.get(a.id) || { x: a.x, y: a.y };
    const pb = pos.get(b.id) || { x: b.x, y: b.y };
    const def = DEEP_SPACE_LINK_TYPES[lk.type] || DEEP_SPACE_LINK_TYPES.ds_laser;
    const selected = state.selectedIds.has(lk.id);
    const g = svgEl('g', { 'data-id': lk.id, 'data-kind': 'deeplink' });
    g.appendChild(svgEl('line', {
      class: 'ds-unitlink-hit', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y
    }));
    const attrs = {
      class: 'ds-unitlink' + (selected ? ' selected' : ''),
      x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
      stroke: def.color, 'stroke-width': def.width,
    };
    if (def.dash) attrs['stroke-dasharray'] = def.dash;
    g.appendChild(svgEl('line', attrs));
    linkLayer.appendChild(g);
  }

  // Units
  for (const u of state.deepSpaceUnits) {
    const def = DEEP_SPACE_UNIT_TYPES[u.type] || DEEP_SPACE_UNIT_TYPES.ds_relay;
    const selected = state.selectedIds.has(u.id);
    const pending  = state.pendingConnectId === u.id;
    const p = pos.get(u.id) || { x: u.x, y: u.y };
    const g = svgEl('g', {
      class: 'ds-unit' + (selected ? ' selected' : '') + (pending ? ' connect-pending' : '') + (p.anchored ? ' anchored' : ''),
      transform: `translate(${p.x} ${p.y})`,
      'data-id': u.id, 'data-kind': 'deepunit'
    });
    g.appendChild(svgEl('circle', { class: 'du-halo', cx: 0, cy: 0, r: 28, stroke: def.color }));
    g.appendChild(svgEl('circle', { class: 'du-bg',   cx: 0, cy: 0, r: 22, stroke: def.color }));
    g.appendChild(svgEl('use', {
      class: 'du-icon', href: '#' + def.icon, x: -16, y: -16, width: 32, height: 32
    }));
    const lbl = svgEl('text', { class: 'du-label', x: 0, y: 38 });
    lbl.textContent = u.label || def.label;
    g.appendChild(lbl);
    const ty = svgEl('text', { class: 'du-type', x: 0, y: 50 });
    const anchorTag = (u.anchor && typeof DS_TARGETS !== 'undefined' && DS_TARGETS[u.anchor])
      ? ` · @ ${DS_TARGETS[u.anchor].label}` : '';
    ty.textContent = def.label + anchorTag;
    g.appendChild(ty);
    layer.appendChild(g);
  }
}

function formatLatLng(lat, lng) {
  const a = lat >= 0 ? 'N' : 'S';
  const o = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${a} ${Math.abs(lng).toFixed(2)}°${o}`;
}

function renderDevices() {
  dom.devicesLayer.innerHTML = '';
  for (const d of state.devices) {
    if (state.activeSiteId && d.siteId && d.siteId !== state.activeSiteId) continue;
    const def = DEVICE_TYPES[d.type];
    if (!def) continue;
    const selected = state.selectedIds.has(d.id);
    const pending = state.pendingConnectId === d.id;

    const g = svgEl('g', {
      class: 'device' + (selected ? ' selected' : '') + (pending ? ' connect-pending' : ''),
      transform: `translate(${d.x} ${d.y})`,
      'data-id': d.id, 'data-kind': 'device'
    });

    g.appendChild(svgEl('circle', {
      class: 'icon-bg',
      cx: 0, cy: 0, r: 28
    }));
    g.appendChild(svgEl('use', {
      class: 'icon-fg',
      href: '#' + def.icon, x: -22, y: -22, width: 44, height: 44
    }));

    const label = svgEl('text', { x: 0, y: 48, class: 'device-label' });
    label.textContent = d.label || def.label;
    g.appendChild(label);

    if (d.props && d.props.ip) {
      const ipText = svgEl('text', { x: 0, y: 61, class: 'device-ip' });
      ipText.textContent = d.props.ip + (d.props.cidr ? '/' + d.props.cidr : '');
      g.appendChild(ipText);
    }

    dom.devicesLayer.appendChild(g);
  }
}

function renderLinks() {
  dom.linksLayer.innerHTML = '';
  for (const link of state.links) {
    const from = deviceById(link.fromId);
    const to   = deviceById(link.toId);
    if (!from || !to) continue;
    if (state.activeSiteId && from.siteId !== state.activeSiteId) continue;
    if (state.activeSiteId && to.siteId !== state.activeSiteId) continue;
    const def = LINK_TYPES[link.type] || LINK_TYPES.ethernet;
    const selected = state.selectedIds.has(link.id);

    // unit vector to inset from device edges
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const inset = 28;
    const x1 = from.x + ux * inset, y1 = from.y + uy * inset;
    const x2 = to.x   - ux * inset, y2 = to.y   - uy * inset;

    const g = svgEl('g', { 'data-id': link.id, 'data-kind': 'link' });
    g.appendChild(svgEl('line', {
      class: 'link-hit',
      x1, y1, x2, y2
    }));

    const lineAttrs = {
      class: 'link' + (selected ? ' selected' : ''),
      x1, y1, x2, y2,
      stroke: def.color, 'stroke-width': def.width,
      'stroke-linecap': 'round'
    };
    if (def.dash) lineAttrs['stroke-dasharray'] = def.dash;
    g.appendChild(svgEl('line', lineAttrs));

    // trunk = double line: render second offset line
    if (link.type === 'trunk') {
      const ox = -uy * 2.5, oy = ux * 2.5;
      g.appendChild(svgEl('line', {
        x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy,
        stroke: def.color, 'stroke-width': 1.5, 'stroke-linecap': 'round'
      }));
    }

    if (link.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const lbl = svgEl('text', { x: mx, y: my - 6, class: 'link-label' });
      lbl.textContent = link.label;
      g.appendChild(lbl);
    }
    dom.linksLayer.appendChild(g);
  }
}

function renderZones() {
  dom.zonesLayer.innerHTML = '';
  for (const z of state.zones) {
    if (state.activeSiteId && z.siteId && z.siteId !== state.activeSiteId) continue;
    const def = ZONE_TYPES[z.type] || ZONE_TYPES.internal;
    const selected = state.selectedIds.has(z.id);

    const g = svgEl('g', {
      class: 'zone' + (selected ? ' selected' : ''),
      'data-id': z.id, 'data-kind': 'zone'
    });
    g.appendChild(svgEl('rect', {
      class: 'zone-rect',
      x: z.x, y: z.y, width: z.w, height: z.h, rx: 6,
      fill: def.fill, stroke: def.stroke,
      'stroke-width': 2, 'stroke-dasharray': '8 5'
    }));

    const label = svgEl('text', {
      x: z.x + 14, y: z.y + 24, class: 'zone-label',
      fill: def.labelColor
    });
    label.textContent = (z.label || def.label).toUpperCase();
    g.appendChild(label);

    if (selected) {
      g.appendChild(svgEl('rect', {
        class: 'resize-handle',
        x: z.x + z.w - 9, y: z.y + z.h - 9, width: 18, height: 18, rx: 2,
        'data-handle': 'se'
      }));
    }
    dom.zonesLayer.appendChild(g);
  }
}

function clearOverlay() { dom.overlayLayer.innerHTML = ''; }

function renderPreviewLine(fromId, wx, wy) {
  clearOverlay();
  const from = state.viewMode === 'space' ? spaceAssetById(fromId)
    : state.viewMode === 'city' ? endpointById(fromId)
    : deviceById(fromId);
  if (!from) return;
  const p = state.viewMode === 'space' ? spaceAssetPosition(from) : from;
  const line = svgEl('line', {
    class: 'preview-line', x1: p.x, y1: p.y, x2: wx, y2: wy
  });
  dom.overlayLayer.appendChild(line);
}

function renderPreviewRect(x, y, w, h) {
  clearOverlay();
  const rect = svgEl('rect', {
    class: 'preview-rect', x, y, width: w, height: h, rx: 4
  });
  dom.overlayLayer.appendChild(rect);
}

function updateCounts() {
  dom.sbCounts.textContent =
    `${state.devices.length} device${state.devices.length === 1 ? '' : 's'}, ` +
    `${state.links.length} link${state.links.length === 1 ? '' : 's'}, ` +
    `${state.zones.length} zone${state.zones.length === 1 ? '' : 's'}`;
}


/* =========================================================================
   PROPERTIES PANEL
   ========================================================================= */
function renderProperties() {
  const ids = [...state.selectedIds];

  if (ids.length === 0) {
    if (state.viewMode === 'deepspace') {
      renderLinkBudgetStudio();
      dom.prActions.style.display = 'none';
      return;
    }
    dom.prType.textContent = '';
    dom.prBody.innerHTML = `<div class="pr-empty">No selection.<br><br>Drag a device from the left panel onto the canvas to start designing.</div>`;
    dom.prActions.style.display = 'none';
    return;
  }

  if (ids.length > 1) {
    dom.prType.textContent = `${ids.length} items`;
    dom.prBody.innerHTML = `<div class="pr-empty">Multiple items selected.<br><br>Use <b>Delete</b> or <b>Duplicate</b> below.</div>`;
    dom.prActions.style.display = 'flex';
    return;
  }

  const id = ids[0];
  const item = anyById(id);
  const kind = typeOf(item);
  if (!kind) {
    dom.prBody.innerHTML = `<div class="pr-empty">Selection lost.</div>`;
    dom.prActions.style.display = 'none';
    return;
  }

  if (kind === 'device') renderDeviceProperties(item);
  else if (kind === 'link') renderLinkProperties(item);
  else if (kind === 'zone') renderZoneProperties(item);
  else if (kind === 'site') renderSiteProperties(item);
  else if (kind === 'sitelink') renderSiteLinkProperties(item);
  else if (kind === 'endpoint') renderEndpointProperties(item);
  else if (kind === 'citylink') renderCityLinkProperties(item);
  else if (kind === 'city') renderCityProperties(item);
  else if (kind === 'spaceasset') renderSpaceAssetProperties(item);
  else if (kind === 'spacelink') renderSpaceLinkProperties(item);
  else if (kind === 'planetinfra') renderPlanetInfraProperties(item);
  else if (kind === 'deepunit') renderDeepUnitProperties(item);
  else if (kind === 'deeplink') renderDeepLinkProperties(item);

  dom.prActions.style.display = 'flex';
}

function renderPlanetInfraProperties(pi) {
  const def = PLANET_INFRA_TYPES[pi.type] || PLANET_INFRA_TYPES.global_dc;
  dom.prType.textContent = def.label;
  let html = '';
  html += `<div class="unit-purpose">${escapeHtml(def.purpose)}</div>`;
  html += `<div class="pr-field"><label>Label</label><input data-key="label" type="text" value="${escapeHtml(pi.label || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(PLANET_INFRA_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === pi.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>Latitude</label><input data-key="lat" data-num="1" type="number" step="0.01" value="${(pi.lat || 0).toFixed(2)}"/></div>` +
    `<div class="pr-field"><label>Longitude</label><input data-key="lng" data-num="1" type="number" step="0.01" value="${(pi.lng || 0).toFixed(2)}"/></div>` +
    `</div>`;
  const p = pi.props || {};
  for (const [k, v] of Object.entries(p)) {
    html += `<div class="pr-field"><label>${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}</label>` +
      `<input data-key="${escapeHtml(k)}" data-prop="1" type="text" value="${escapeHtml(v)}"/></div>`;
  }
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      if (inp.getAttribute('data-prop')) { pi.props = pi.props || {}; pi.props[key] = inp.value; }
      else if (inp.getAttribute('data-num')) { pi[key] = Number(inp.value) || 0; }
      else { pi[key] = inp.value; }
      renderAll();
    });
  });
}

function renderDeepUnitProperties(u) {
  const def = DEEP_SPACE_UNIT_TYPES[u.type] || DEEP_SPACE_UNIT_TYPES.ds_relay;
  dom.prType.textContent = def.label;
  let html = '';
  html += `<div class="unit-purpose">${escapeHtml(def.purpose)}</div>`;
  if (def.stats) {
    html += `<div class="stats-grid">`;
    if (def.stats.range_au)   html += `<span class="k">Range</span><span class="v">${def.stats.range_au} AU</span>`;
    if (def.stats.bandwidth)  html += `<span class="k">Bandwidth</span><span class="v">${escapeHtml(def.stats.bandwidth)}</span>`;
    if (def.stats.power_w)    html += `<span class="k">Power</span><span class="v">${def.stats.power_w.toLocaleString()} W</span>`;
    if (def.stats.security)   html += `<span class="k">Security</span><span class="v">${escapeHtml(def.stats.security)}</span>`;
    html += `</div>`;
  }
  html += `<div class="pr-field"><label>Label</label><input data-key="label" type="text" value="${escapeHtml(u.label || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(DEEP_SPACE_UNIT_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === u.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  // Anchor selector: tie this unit to a heliocentric body so its position
  // updates as the body moves. "None" = use absolute x/y.
  if (typeof DS_TARGETS !== 'undefined') {
    const anchorOptions = Object.entries(DS_TARGETS)
      .filter(([k, v]) => v.kind !== 'custom')
      .map(([k, v]) => `<option value="${k}" ${k === u.anchor ? 'selected' : ''}>${escapeHtml(v.label)}</option>`)
      .join('');
    html += `<div class="pr-field"><label>Anchor to body</label><select data-key="anchor">` +
      `<option value="">— No anchor (absolute) —</option>${anchorOptions}` +
      `</select></div>`;
    if (u.anchor) {
      html += `<div class="pr-field-row">` +
        `<div class="pr-field"><label>Radial offset</label><input data-key="anchorOffX" data-num="1" type="number" step="5" value="${u.anchorOffX || 0}"/></div>` +
        `<div class="pr-field"><label>Tangential offset</label><input data-key="anchorOffY" data-num="1" type="number" step="5" value="${u.anchorOffY || 0}"/></div>` +
        `</div>`;
    }
  }
  const p = u.props || {};
  for (const [k, v] of Object.entries(p)) {
    html += `<div class="pr-field"><label>${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}</label>` +
      `<input data-key="${escapeHtml(k)}" data-prop="1" type="text" value="${escapeHtml(v)}"/></div>`;
  }
  // Show linked unit count
  const linkCount = state.deepSpaceLinks.filter(l => l.fromId === u.id || l.toId === u.id).length;
  html += `<div class="pr-field"><label>Linked units</label><input value="${linkCount}" disabled/></div>`;
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      if (inp.getAttribute('data-prop')) { u.props = u.props || {}; u.props[key] = inp.value; }
      else if (inp.getAttribute('data-num')) { u[key] = Number(inp.value) || 0; }
      else if (key === 'anchor') {
        u.anchor = inp.value || null;
        // When anchoring for the first time, zero offsets — user can dial them in.
        if (u.anchor && u.anchorOffX == null) u.anchorOffX = 0;
        if (u.anchor && u.anchorOffY == null) u.anchorOffY = 0;
      }
      else { u[key] = inp.value; }
      renderAll();
    });
  });
}

function renderDeepLinkProperties(lk) {
  const def = DEEP_SPACE_LINK_TYPES[lk.type] || DEEP_SPACE_LINK_TYPES.ds_laser;
  dom.prType.textContent = def.label;
  let html = '';
  html += `<div class="pr-field"><label>Label</label><input data-key="label" type="text" value="${escapeHtml(lk.label || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(DEEP_SPACE_LINK_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === lk.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  const from = deepSpaceUnitByIdSafe(lk.fromId);
  const to   = deepSpaceUnitByIdSafe(lk.toId);
  html += `<div class="pr-field"><label>From</label><input value="${escapeHtml(from ? from.label : lk.fromId)}" disabled/></div>`;
  html += `<div class="pr-field"><label>To</label><input value="${escapeHtml(to ? to.label : lk.toId)}" disabled/></div>`;
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      lk[key] = inp.value;
      renderAll();
    });
  });
}

function renderSpaceAssetProperties(a) {
  const def = SPACE_ASSET_TYPES[a.type];
  dom.prType.textContent = def.label;
  let html = '';
  if (def.purpose) html += `<div class="unit-purpose">${escapeHtml(def.purpose)}</div>`;
  if (def.stats) {
    html += `<div class="stats-grid">`;
    if (def.stats.coverage_km) html += `<span class="k">Coverage</span><span class="v">${def.stats.coverage_km.toLocaleString()} km</span>`;
    if (def.stats.bandwidth)   html += `<span class="k">Bandwidth</span><span class="v">${escapeHtml(def.stats.bandwidth)}</span>`;
    if (def.stats.power_w)     html += `<span class="k">Power</span><span class="v">${def.stats.power_w.toLocaleString()} W</span>`;
    if (def.stats.security)    html += `<span class="k">Security</span><span class="v">${escapeHtml(def.stats.security)}</span>`;
    html += `</div>`;
  }
  html += `<div class="pr-field"><label>Label</label><input data-key="label" type="text" value="${escapeHtml(a.label || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(SPACE_ASSET_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  if (a.type !== 'ground_station') {
    const orbitKey = a.orbit || def.orbit || 'leo';
    html += `<div class="pr-field"><label>Orbit Band</label><select data-key="orbit">` +
      Object.entries(ORBIT_ALTITUDES).map(([k, v]) =>
        `<option value="${k}" ${k === orbitKey ? 'selected' : ''}>${v.label} (${v.km.toLocaleString()} km)</option>`).join('') +
      `</select></div>`;
    html += `<div class="pr-field-row">` +
      `<div class="pr-field"><label>Period</label><input value="${orbitPeriodMinutes(orbitKey).toFixed(1)} min" disabled/></div>` +
      `<div class="pr-field"><label>Speed</label><input value="${orbitSpeedKms(orbitKey).toFixed(2)} km/s" disabled/></div>` +
      `</div>`;
  }
  html += `<div class="pr-field"><label>Angle on orbit (radians)</label><input data-key="angle" data-num="1" type="number" step="0.01" value="${(a.angle || 0).toFixed(3)}"/></div>`;
  const p = a.props || {};
  for (const [k, v] of Object.entries(p)) {
    html += `<div class="pr-field"><label>${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}</label>` +
      `<input data-key="${escapeHtml(k)}" data-prop="1" type="text" value="${escapeHtml(v)}"/></div>`;
  }
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      if (inp.getAttribute('data-prop')) { a.props = a.props || {}; a.props[key] = inp.value; }
      else if (inp.getAttribute('data-num')) { a[key] = Number(inp.value) || 0; }
      else {
        a[key] = inp.value;
        if (key === 'type') {
          const nextDef = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
          a.orbit = a.type === 'ground_station' ? 'ground' : nextDef.orbit;
          if (a.type === 'ground_station') {
            a.x = 240 * Math.cos(a.angle || 0);
            a.y = 240 * Math.sin(a.angle || 0);
          }
        }
      }
      renderAll();
    });
  });
}

function renderSpaceLinkProperties(sl) {
  dom.prType.textContent = 'Orbit Link';
  const a = spaceAssetById(sl.fromAssetId), b = spaceAssetById(sl.toAssetId);
  const metrics = a && b ? spaceLinkMetrics(a, b) : null;
  let html = '';
  html += `<div class="pr-field"><label>Label</label><input data-key="label" type="text" value="${escapeHtml(sl.label || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(SPACE_LINK_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === sl.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field"><label>From</label><input value="${escapeHtml(a ? a.label : '?')}" disabled/></div>`;
  html += `<div class="pr-field"><label>To</label><input value="${escapeHtml(b ? b.label : '?')}" disabled/></div>`;
  if (metrics) {
    html += `<div class="pr-field-row">` +
      `<div class="pr-field"><label>Range</label><input value="${Math.round(metrics.distanceKm).toLocaleString()} km" disabled/></div>` +
      `<div class="pr-field"><label>One-way delay</label><input value="${metrics.latencyMs.toFixed(1)} ms" disabled/></div>` +
      `</div>`;
    html += `<div class="pr-field"><label>Line of sight</label><input value="${metrics.occulted ? 'Earth occulted / below horizon' : 'Clear'}" disabled/></div>`;
  }
  // Extended validation via orbit-metrics.js (range/latency/issues using a
  // richer model + a per-link issue list).
  if (typeof orbitLinkSummary === 'function') {
    try {
      const ext = orbitLinkSummary(sl.id, state);
      if (ext && ext.issues && ext.issues.length) {
        html += `<div class="pr-field" style="border:1px solid #7a611e;background:#2a230f;border-radius:4px;padding:8px;margin-top:8px">` +
          `<label style="color:#f5d77a">Validator</label>` +
          `<div style="font-size:11px;color:#f5d77a">${ext.issues.map(escapeHtml).join('<br>')}</div>` +
          `</div>`;
      }
    } catch (e) { /* silent fall-through */ }
  }
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      sl[inp.getAttribute('data-key')] = inp.value;
      renderAll();
    });
  });
}

function renderEndpointProperties(ep) {
  const def = ENDPOINT_TYPES[ep.type];
  const linkedSite = ep.siteId ? siteById(ep.siteId) : null;
  dom.prType.textContent = linkedSite ? 'Placed Site' : def.label;
  const props = ep.props || {};
  let html = '';
  if (linkedSite) {
    const deviceCount = state.devices.filter(d => d.siteId === linkedSite.id).length;
    html += `<div class="pr-field" style="border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:12px">` +
      `<label>Linked local site</label>` +
      `<div style="font-size:12px;color:var(--text)"><b>${escapeHtml(linkedSite.name)}</b></div>` +
      `<div style="font-size:11px;color:var(--text-faint);margin-top:3px">${deviceCount} device${deviceCount === 1 ? '' : 's'} in local setup</div>` +
      `<button type="button" data-enter-linked-site style="margin-top:8px;padding:6px 10px;background:var(--accent);color:var(--bg-0);border:none;border-radius:3px;font-size:11px;font-weight:600;cursor:pointer;width:100%">Open local site →</button>` +
      `</div>`;
  }
  // When this endpoint is linked to a site, the label and address mirror the
  // site and are read-only here — edit them on the site instead, which keeps
  // both views in sync.
  if (linkedSite) {
    html += `<div class="pr-field"><label>Label <span style="color:var(--text-faint);font-weight:400">(from linked site)</span></label>` +
      `<input data-key="label" type="text" value="${escapeHtml(ep.label || '')}" disabled/></div>`;
  } else {
    html += `<div class="pr-field"><label>Label</label>` +
      `<input data-key="label" type="text" value="${escapeHtml(ep.label || '')}"/></div>`;
  }
  // Type-specific fields
  for (const [k, v] of Object.entries(props)) {
    const lockedByLinkedSite = linkedSite && (k === 'address' || k === 'notes');
    const lockNote = lockedByLinkedSite
      ? ' <span style="color:var(--text-faint);font-weight:400">(from linked site)</span>' : '';
    html += `<div class="pr-field"><label>${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}${lockNote}</label>` +
      `<input data-key="${escapeHtml(k)}" data-prop="1" type="text" value="${escapeHtml(v)}"${lockedByLinkedSite ? ' disabled' : ''}/></div>`;
  }
  if (ep.lat != null) {
    html += `<div class="pr-field-row">` +
      `<div class="pr-field"><label>Latitude</label><input data-key="lat" data-num="1" type="number" step="0.0001" value="${ep.lat}"/></div>` +
      `<div class="pr-field"><label>Longitude</label><input data-key="lng" data-num="1" type="number" step="0.0001" value="${ep.lng}"/></div>` +
      `</div>`;
  } else {
    html += `<div class="pr-field-row">` +
      `<div class="pr-field"><label>X</label><input data-key="x" data-num="1" type="number" value="${ep.x}"/></div>` +
      `<div class="pr-field"><label>Y</label><input data-key="y" data-num="1" type="number" value="${ep.y}"/></div>` +
      `</div>`;
  }
  dom.prBody.innerHTML = html;
  dom.prBody.querySelector('[data-enter-linked-site]')?.addEventListener('click', () => setActiveSite(linkedSite.id));
  dom.prBody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      if (inp.getAttribute('data-prop')) {
        ep.props = ep.props || {}; ep.props[key] = inp.value;
      } else if (inp.getAttribute('data-num')) {
        ep[key] = Number(inp.value) || 0;
      } else { ep[key] = inp.value; }
      renderAll();
      syncLeafletMarkers();
    });
  });
}

function renderCityLinkProperties(cl) {
  dom.prType.textContent = 'City Infrastructure Link';
  const a = endpointById(cl.fromEpId), b = endpointById(cl.toEpId);
  let html = '';
  html += `<div class="pr-field"><label>Label</label>` +
    `<input data-key="label" type="text" value="${escapeHtml(cl.label || '')}" placeholder="e.g. Cable 1234"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(CITY_LINK_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === cl.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field"><label>Length / distance</label>` +
    `<input data-key="length" type="text" value="${escapeHtml(cl.length || '')}" placeholder="e.g. 1.2 km"/></div>`;
  html += `<div class="pr-field"><label>From</label><input value="${escapeHtml(a ? a.label : '?')}" disabled/></div>`;
  html += `<div class="pr-field"><label>To</label><input value="${escapeHtml(b ? b.label : '?')}" disabled/></div>`;
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      cl[inp.getAttribute('data-key')] = inp.value;
      renderAll();
      syncLeafletPolylines();
    });
  });
}

function renderCityProperties(c) {
  dom.prType.textContent = 'City';
  let html = '';
  html += `<div class="pr-field"><label>Name</label>` +
    `<input data-key="name" type="text" value="${escapeHtml(c.name || '')}"/></div>`;
  html += `<div class="pr-field"><label>Map backend</label><select data-key="mapBackend">` +
    Object.entries(CITY_BACKENDS).map(([k, v]) =>
      `<option value="${k}" ${k === c.mapBackend ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field"><label>Background image URL (image backend)</label>` +
    `<input data-key="imageUrl" type="text" value="${escapeHtml(c.imageUrl || '')}" placeholder="e.g. city-downtown.jpg"/></div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>Center latitude</label><input data-key="centerLat" data-num="1" type="number" step="0.0001" value="${c.centerLat || 0}"/></div>` +
    `<div class="pr-field"><label>Center longitude</label><input data-key="centerLng" data-num="1" type="number" step="0.0001" value="${c.centerLng || 0}"/></div>` +
    `</div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>Map width (SVG units)</label><input data-key="mapW" data-num="1" type="number" value="${c.mapW || 2000}"/></div>` +
    `<div class="pr-field"><label>Map height</label><input data-key="mapH" data-num="1" type="number" value="${c.mapH || 1400}"/></div>` +
    `</div>`;
  html += `<div class="pr-field"><label>Notes</label>` +
    `<textarea data-key="notes" rows="3">${escapeHtml(c.notes || '')}</textarea></div>`;
  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select, textarea').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      c[key] = inp.getAttribute('data-num') ? Number(inp.value) || 0 : inp.value;
      syncTileMap();
      renderAll();
    });
  });
}

function renderSiteProperties(s) {
  const def = SITE_TYPES[s.type];
  dom.prType.textContent = 'Site';
  const deviceCount  = state.devices.filter(d => d.siteId === s.id).length;
  const linkedEps    = endpointsLinkedToSite(s.id);
  const linkedCities = [...new Set(linkedEps.map(ep => ep.cityId).filter(Boolean))]
    .map(cid => cityById(cid)).filter(Boolean);
  let html = '';
  html += `<div class="pr-field"><label>Site name</label>` +
    `<input data-key="name" type="text" value="${escapeHtml(s.name || '')}"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(SITE_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === s.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>Latitude</label><input data-key="lat" data-num="1" type="number" step="0.01" value="${s.lat}"/></div>` +
    `<div class="pr-field"><label>Longitude</label><input data-key="lng" data-num="1" type="number" step="0.01" value="${s.lng}"/></div>` +
    `</div>`;
  html += `<div class="pr-field"><label>Address</label>` +
    `<input data-key="address" type="text" value="${escapeHtml(s.address || '')}" placeholder="Street, City, Country"/></div>`;
  html += `<div class="pr-field"><label>Notes</label>` +
    `<textarea data-key="notes" rows="3">${escapeHtml(s.notes || '')}</textarea></div>`;
  html += `<div class="pr-field" style="border-top:1px solid var(--border);padding-top:10px;margin-top:14px">` +
    `<label>Devices at this site</label>` +
    `<div style="font-size:12px;color:var(--text)">${deviceCount} device${deviceCount === 1 ? '' : 's'}</div>` +
    `<button type="button" data-enter-site style="margin-top:8px;padding:6px 10px;background:var(--accent);color:var(--bg-0);border:none;border-radius:3px;font-size:11px;font-weight:600;cursor:pointer;width:100%">Enter site (Local view) →</button>` +
    `</div>`;
  // Reverse navigation: if this site has been placed as a "Built site"
  // endpoint on a city map, offer a button per city that jumps there and
  // selects the endpoint.
  if (linkedCities.length) {
    html += `<div class="pr-field" style="border-top:1px solid var(--border);padding-top:10px;margin-top:14px">` +
      `<label>Placed on city map${linkedCities.length === 1 ? '' : 's'}</label>`;
    for (const c of linkedCities) {
      const ep = linkedEps.find(e => e.cityId === c.id);
      html += `<button type="button" data-show-on-city="${c.id}" data-ep-id="${ep ? ep.id : ''}" ` +
        `style="margin-top:6px;padding:6px 10px;background:var(--bg-2);color:var(--text);border:1px solid var(--border-2);border-radius:3px;font-size:11px;cursor:pointer;width:100%;text-align:left">` +
        `→ Show on ${escapeHtml(c.name)} city map</button>`;
    }
    html += `</div>`;
  }

  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select, textarea').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      s[key] = inp.getAttribute('data-num') ? Number(inp.value) || 0 : inp.value;
      // Push name / address / type / coord changes to linked city endpoints
      // so the City view immediately reflects the edit.
      propagateSiteChange(s.id);
      renderAll();
      syncLeafletMarkers();
    });
  });
  dom.prBody.querySelector('[data-enter-site]')?.addEventListener('click', () => setActiveSite(s.id));
  dom.prBody.querySelectorAll('[data-show-on-city]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveCity(btn.getAttribute('data-show-on-city'),
        { selectEndpointId: btn.getAttribute('data-ep-id') });
    });
  });
}

function renderSiteLinkProperties(sl) {
  dom.prType.textContent = 'Inter-site Link';
  const a = siteById(sl.fromSiteId), b = siteById(sl.toSiteId);
  let html = '';
  html += `<div class="pr-field"><label>Label</label>` +
    `<input data-key="label" type="text" value="${escapeHtml(sl.label || '')}" placeholder="e.g. Primary WAN"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(SITE_LINK_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === sl.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field"><label>Bandwidth</label>` +
    `<input data-key="bandwidth" type="text" value="${escapeHtml(sl.bandwidth || '')}" placeholder="e.g. 1 Gbps"/></div>`;
  html += `<div class="pr-field"><label>SLA</label>` +
    `<input data-key="sla" type="text" value="${escapeHtml(sl.sla || '')}" placeholder="e.g. 99.99% / <50ms"/></div>`;
  html += `<div class="pr-field"><label>From</label>` +
    `<input value="${escapeHtml(a ? a.name : '?')}" disabled/></div>`;
  html += `<div class="pr-field"><label>To</label>` +
    `<input value="${escapeHtml(b ? b.name : '?')}" disabled/></div>`;

  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      sl[inp.getAttribute('data-key')] = inp.value;
      renderAll();
    });
  });
}

function renderDeviceProperties(d) {
  const def = DEVICE_TYPES[d.type];
  dom.prType.textContent = def.label;

  const props = d.props || {};
  const fields = [
    { key: 'label',   label: 'Name',        type: 'text', value: d.label, onDevice: true },
    { key: 'ip',      label: 'IP address',  type: 'text', value: props.ip || '', placeholder: '10.0.1.1' },
    { key: 'cidr',    label: 'CIDR',        type: 'text', value: props.cidr || '', placeholder: '24' },
    { key: 'vlan',    label: 'VLAN',        type: 'text', value: props.vlan || '', placeholder: '10' },
    { key: 'mac',     label: 'MAC',         type: 'text', value: props.mac || '', placeholder: 'aa:bb:cc:dd:ee:ff' },
    { key: 'role',    label: 'Role',        type: 'text', value: props.role || '' },
  ];

  if (d.type === 'wap')      fields.splice(4, 0, { key:'ssid', label:'SSID', type:'text', value: props.ssid || '' });
  if (d.type === 'server')   fields.splice(6, 0, { key:'os',   label:'OS',   type:'text', value: props.os || '' });
  if (['laptop','workstation'].includes(d.type)) fields.push({ key:'os', label:'OS', type:'text', value: props.os || '' });
  if (['mobile','tablet'].includes(d.type)) {
    fields.push({ key:'os',  label:'OS',  type:'text', value: props.os || '' });
    fields.push({ key:'mdm', label:'MDM', type:'text', value: props.mdm || '', placeholder:'Intune / Jamf / none' });
  }
  if (d.type === 'cloud') {
    fields.length = 1;
    fields.push({ key: 'provider', label: 'Provider', type: 'select', value: props.provider || 'AWS', options: ['AWS','Azure','GCP','Other'] });
    fields.push({ key: 'region',   label: 'Region',   type: 'text',   value: props.region || '' });
  }
  if (d.type === 'internet') {
    fields.length = 1;
  }
  // Cost override — appears for any device with a catalog entry
  if (COST_CATALOG[d.type] && COST_CATALOG[d.type].capex > 0) {
    const def = COST_CATALOG[d.type];
    fields.push({ key:'cost', label:`Unit cost USD (default: $${def.capex})`, type:'text',
                  value: props.cost != null ? String(props.cost) : '',
                  placeholder: String(def.capex) });
  }
  fields.push({ key: 'notes',   label: 'Notes',       type: 'textarea', value: props.notes || '' });

  const xy = { x: d.x, y: d.y };

  let html = '';
  for (const f of fields) {
    const id = `f-${f.key}`;
    if (f.type === 'select') {
      html += `<div class="pr-field"><label>${f.label}</label>` +
        `<select data-key="${f.key}" ${f.onDevice ? '' : 'data-prop="1"'}>` +
        f.options.map(o => `<option ${o === f.value ? 'selected' : ''}>${o}</option>`).join('') +
        `</select></div>`;
    } else if (f.type === 'textarea') {
      html += `<div class="pr-field"><label>${f.label}</label>` +
        `<textarea data-key="${f.key}" ${f.onDevice ? '' : 'data-prop="1"'} rows="3">${escapeHtml(f.value)}</textarea></div>`;
    } else {
      html += `<div class="pr-field"><label>${f.label}</label>` +
        `<input data-key="${f.key}" ${f.onDevice ? '' : 'data-prop="1"'} type="text" value="${escapeHtml(f.value)}" placeholder="${escapeHtml(f.placeholder || '')}"/></div>`;
    }
  }

  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>X</label><input data-key="x" data-num="1" type="number" value="${xy.x}"/></div>` +
    `<div class="pr-field"><label>Y</label><input data-key="y" data-num="1" type="number" value="${xy.y}"/></div>` +
    `</div>`;

  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select, textarea').forEach(inp => {
    inp.addEventListener('change', (e) => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      if (inp.getAttribute('data-prop')) {
        d.props = d.props || {};
        d.props[key] = inp.value;
      } else if (inp.getAttribute('data-num')) {
        d[key] = Number(inp.value) || 0;
      } else {
        d[key] = inp.value;
      }
      renderAll();
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
}

function renderLinkProperties(l) {
  const def = LINK_TYPES[l.type];
  dom.prType.textContent = 'Connection';
  const from = deviceById(l.fromId), to = deviceById(l.toId);
  let html = '';

  html += `<div class="pr-field"><label>Label</label>` +
    `<input data-key="label" type="text" value="${escapeHtml(l.label || '')}" placeholder="e.g. gi0/1 ↔ gi0/2"/></div>`;
  html += `<div class="pr-field"><label>Type</label><select data-key="type">` +
    Object.entries(LINK_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === l.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;

  html += `<div class="pr-field"><label>From</label>` +
    `<input value="${escapeHtml(from ? (from.label || DEVICE_TYPES[from.type].label) : '?')}" disabled/></div>`;
  html += `<div class="pr-field"><label>To</label>` +
    `<input value="${escapeHtml(to ? (to.label || DEVICE_TYPES[to.type].label) : '?')}" disabled/></div>`;

  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      l[inp.getAttribute('data-key')] = inp.value;
      renderAll();
    });
  });
}

function renderZoneProperties(z) {
  const def = ZONE_TYPES[z.type];
  dom.prType.textContent = 'Zone';
  let html = '';

  html += `<div class="pr-field"><label>Label</label>` +
    `<input data-key="label" type="text" value="${escapeHtml(z.label || '')}" placeholder="${def.label}"/></div>`;
  html += `<div class="pr-field"><label>Trust level</label><select data-key="type">` +
    Object.entries(ZONE_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === z.type ? 'selected' : ''}>${v.label}</option>`).join('') +
    `</select></div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>X</label><input data-key="x" data-num="1" type="number" value="${z.x}"/></div>` +
    `<div class="pr-field"><label>Y</label><input data-key="y" data-num="1" type="number" value="${z.y}"/></div>` +
    `</div>`;
  html += `<div class="pr-field-row">` +
    `<div class="pr-field"><label>Width</label><input data-key="w" data-num="1" type="number" value="${z.w}"/></div>` +
    `<div class="pr-field"><label>Height</label><input data-key="h" data-num="1" type="number" value="${z.h}"/></div>` +
    `</div>`;

  dom.prBody.innerHTML = html;
  dom.prBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('change', () => {
      pushHistory();
      const key = inp.getAttribute('data-key');
      z[key] = inp.getAttribute('data-num') ? (Number(inp.value) || 0) : inp.value;
      renderAll();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}


/* =========================================================================
   CANVAS INTERACTION
   ========================================================================= */
let drag = null;
let mouseWorld = { x: 0, y: 0 };

function findHitElement(target) {
  return target.closest('[data-kind]');
}

dom.svg.addEventListener('mousedown', (e) => {
  if (e.button === 2) return; // right click = context menu
  const world = screenToWorld(e.clientX, e.clientY);
  const hitEl = findHitElement(e.target);
  const id = hitEl && hitEl.getAttribute('data-id');
  const kind = hitEl && hitEl.getAttribute('data-kind');
  const handle = e.target.getAttribute && e.target.getAttribute('data-handle');

  // Middle mouse OR Alt+drag = pan
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    drag = { kind: 'pan', startX: e.clientX, startY: e.clientY,
             panStart: { ...state.view.pan } };
    dom.svg.classList.add('panning');
    return;
  }

  // === SPACE VIEW interactions ===
  if (state.viewMode === 'space') {
    // Place new asset
    if (state.activeSpaceAssetType && !hitEl) {
      pushHistory();
      const def = SPACE_ASSET_TYPES[state.activeSpaceAssetType];
      const n = state.spaceAssets.filter(a => a.type === state.activeSpaceAssetType).length + 1;
      let asset;
      if (state.activeSpaceAssetType === 'ground_station') {
        // Place on Earth surface at click position (normalized to radius 240)
        const ang = Math.atan2(world.y, world.x);
        asset = {
          id: uid(), type: 'ground_station',
          label: `${def.label} ${n}`,
          x: 240 * Math.cos(ang), y: 240 * Math.sin(ang),
          angle: ang, orbit: 'ground',
          props: { name:'', lat:'', lng:'', dishM:'4.5', notes:'' },
        };
      } else {
        // Place at click's angle on the asset's orbit
        const ang = orbitAngleFromWorld(def.orbit, world.x, world.y);
        asset = {
          id: uid(), type: state.activeSpaceAssetType,
          label: `${def.label} ${n}`,
          angle: ang, orbit: def.orbit,
          props: { norad:'', operator:'', frequency:'', notes:'' },
        };
      }
      state.spaceAssets.push(asset);
      state.activeSpaceAssetType = null;
      dom.svg.classList.remove('place-site');
      dom.palette.querySelectorAll('.pal-item[data-spaceasset-type]').forEach(x => x.style.background = '');
      state.selectedIds.clear(); state.selectedIds.add(asset.id);
      renderAll();
      return;
    }
    // Connect mode: link two space assets
    if (state.mode === 'connect') {
      if (kind !== 'spaceasset') return;
      if (!state.pendingConnectId) {
        state.pendingConnectId = id;
        renderPreviewLine(id, world.x, world.y);
        renderSpaceAssets();
      } else if (state.pendingConnectId !== id) {
        pushHistory();
        state.spaceLinks.push({
          id: uid(), fromAssetId: state.pendingConnectId, toAssetId: id,
          type: state.activeSpaceLinkType, label: ''
        });
        state.pendingConnectId = null;
        clearOverlay();
        renderAll();
      }
      return;
    }
    // Select / move asset (drag changes angle along orbit ring)
    if (hitEl && kind === 'spaceasset') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      pushHistory();
      drag = { kind: 'spaceasset-move', assetId: id };
      return;
    }
    if (hitEl && kind === 'spacelink') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      return;
    }
    state.selectedIds.clear();
    renderAll();
    return;
  }

  // === DEEP SPACE VIEW interactions (placeable units + links) ===
  if (state.viewMode === 'deepspace') {
    // Place new deep-space unit
    if (state.activeDeepUnitType && !hitEl) {
      pushHistory();
      const def = DEEP_SPACE_UNIT_TYPES[state.activeDeepUnitType];
      const n = state.deepSpaceUnits.filter(u => u.type === state.activeDeepUnitType).length + 1;
      const u = {
        id: uid(), type: state.activeDeepUnitType,
        label: `${def.label} ${n}`,
        x: snap(world.x), y: snap(world.y),
        props: { range: def.stats?.range_au ? `${def.stats.range_au} AU` : '', bandwidth: def.stats?.bandwidth || '', power: def.stats?.power_w ? `${def.stats.power_w} W` : '', security: def.stats?.security || '', notes:'' },
      };
      state.deepSpaceUnits.push(u);
      state.activeDeepUnitType = null;
      dom.svg.classList.remove('place-site');
      dom.palette.querySelectorAll('.pal-item[data-deepunit-type]').forEach(x => x.style.background = '');
      state.selectedIds.clear(); state.selectedIds.add(u.id);
      renderAll();
      return;
    }
    // Connect mode: link two deep-space units
    if (state.mode === 'connect') {
      if (kind !== 'deepunit') return;
      if (!state.pendingConnectId) {
        state.pendingConnectId = id;
        renderDeepSpaceUnits();
      } else if (state.pendingConnectId !== id) {
        pushHistory();
        state.deepSpaceLinks.push({
          id: uid(), fromId: state.pendingConnectId, toId: id,
          type: state.activeDeepLinkType, label: ''
        });
        state.pendingConnectId = null;
        clearOverlay();
        renderAll();
      }
      return;
    }
    // Select unit
    if (hitEl && kind === 'deepunit') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      pushHistory();
      drag = {
        kind: 'deepunit-move', startWorld: world,
        items: [...state.selectedIds].map(uid_ => {
          const u = deepSpaceUnitById(uid_);
          if (!u) return null;
          return { id: uid_, startX: u.x, startY: u.y };
        }).filter(Boolean),
      };
      return;
    }
    if (hitEl && kind === 'deeplink') {
      state.selectedIds.clear(); state.selectedIds.add(id);
      renderAll();
      return;
    }
    state.selectedIds.clear();
    renderAll();
    return;
  }

  // === CITY VIEW interactions (image backend uses SVG; OSM uses Leaflet) ===
  if (state.viewMode === 'city') {
    const city = cityById(state.activeCityId);
    if (!city || city.mapBackend !== 'image') {
      // Tile-map backends handle clicks via Leaflet listeners; for now,
      // only image-backend supports SVG endpoint placement on click here.
      // Still allow site-style select/move for endpoints rendered in SVG.
    }
    // Place new endpoint (image backend only)
    if (state.activeCitySiteId && city && city.mapBackend === 'image' && !hitEl) {
      placeSiteOnCityImage(state.activeCitySiteId, city, snap(world.x), snap(world.y));
      state.activeCitySiteId = null;
      dom.svg.classList.remove('place-site');
      clearCitySitePaletteSelection();
      return;
    }
    if (state.activeEndpointType && city && city.mapBackend === 'image' && !hitEl) {
      pushHistory();
      const def = ENDPOINT_TYPES[state.activeEndpointType];
      const n = state.endpoints.filter(e => e.cityId === city.id && e.type === state.activeEndpointType).length + 1;
      const ep = {
        id: uid(), type: state.activeEndpointType,
        label: `${def.label} ${n}`,
        x: snap(world.x), y: snap(world.y), lat: null, lng: null,
        cityId: city.id, props: deepClone(def.defaultProps || {}),
      };
      state.endpoints.push(ep);
      state.activeEndpointType = null;
      dom.svg.classList.remove('place-site');
      dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(x => x.style.background = '');
      state.selectedIds.clear(); state.selectedIds.add(ep.id);
      renderAll();
      return;
    }
    // Connect mode in city view: link two endpoints
    if (state.mode === 'connect') {
      if (kind !== 'endpoint') return;
      if (!state.pendingConnectId) {
        state.pendingConnectId = id;
        renderPreviewLine(id, world.x, world.y);
        renderEndpoints();
      } else if (state.pendingConnectId !== id) {
        pushHistory();
        state.cityLinks.push({
          id: uid(), fromEpId: state.pendingConnectId, toEpId: id,
          type: state.activeCityLinkType, label: ''
        });
        state.pendingConnectId = null;
        clearOverlay();
        renderAll();
      }
      return;
    }
    // Select / move endpoint
    if (hitEl && kind === 'endpoint') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      pushHistory();
      drag = {
        kind: 'endpoint-move', startWorld: world,
        items: [...state.selectedIds].map(eid => {
          const ep = endpointById(eid);
          if (!ep) return null;
          return { id: eid, startX: ep.x, startY: ep.y };
        }).filter(Boolean),
      };
      return;
    }
    if (hitEl && kind === 'citylink') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      return;
    }
    state.selectedIds.clear();
    renderAll();
    return;
  }

  // === WORLD VIEW interactions ===
  if (state.viewMode === 'world') {
    // Place global infrastructure marker (data center, ground uplink, etc.)
    if (state.activePlanetInfraType && !hitEl) {
      const ll = worldToLatLng(world.x, world.y);
      if (ll.lat > 85 || ll.lat < -85 || ll.lng < -180 || ll.lng > 180) return;
      pushHistory();
      const def = PLANET_INFRA_TYPES[state.activePlanetInfraType];
      const n = state.planetInfra.filter(p => p.type === state.activePlanetInfraType).length + 1;
      const pi = {
        id: uid(), type: state.activePlanetInfraType,
        label: `${def.label} ${n}`,
        lat: ll.lat, lng: ll.lng,
        props: deepClone(def.defaultProps || {}),
      };
      state.planetInfra.push(pi);
      state.activePlanetInfraType = null;
      dom.svg.classList.remove('place-site');
      dom.palette.querySelectorAll('.pal-item[data-planetinfra-type]').forEach(x => x.style.background = '');
      state.selectedIds.clear(); state.selectedIds.add(pi.id);
      renderAll();
      return;
    }
    // Select planet-infra marker
    if (hitEl && kind === 'planetinfra') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      return;
    }
    // place-site mode: clicking empty world drops a new site
    if (state.activeNewSiteType && !hitEl) {
      const ll = worldToLatLng(world.x, world.y);
      if (ll.lat > 85 || ll.lat < -85 || ll.lng < -180 || ll.lng > 180) return;
      pushHistory();
      const def = SITE_TYPES[state.activeNewSiteType];
      const n = state.sites.filter(s => s.type === state.activeNewSiteType).length + 1;
      const site = {
        id: uid(), type: state.activeNewSiteType,
        name: `${def.label.split(' ')[0]} ${n}`,
        lat: ll.lat, lng: ll.lng,
        address: '', notes: '', color: def.color,
      };
      state.sites.push(site);
      state.activeNewSiteType = null;
      dom.svg.classList.remove('place-site');
      dom.palette.querySelectorAll('.pal-item[data-site-type]').forEach(x => x.style.background = '');
      state.selectedIds.clear(); state.selectedIds.add(site.id);
      renderAll();
      return;
    }
    // connect mode in world view: link two sites
    if (state.mode === 'connect') {
      if (kind !== 'site') return;
      if (!state.pendingConnectId) {
        state.pendingConnectId = id;
        renderPreviewSiteLine(id, world.x, world.y);
        renderSites();
      } else if (state.pendingConnectId !== id) {
        pushHistory();
        state.siteLinks.push({
          id: uid(), fromSiteId: state.pendingConnectId, toSiteId: id,
          type: state.activeSiteLinkType, label: '', bandwidth: '', sla: ''
        });
        state.pendingConnectId = null;
        clearOverlay();
        renderAll();
      }
      return;
    }
    // select / move site
    if (hitEl && kind === 'site') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) {
        state.selectedIds.clear();
        state.selectedIds.add(id);
      }
      renderAll();
      pushHistory();
      drag = {
        kind: 'site-move', startWorld: world,
        items: [...state.selectedIds].map(sid => {
          const s = siteById(sid);
          if (!s) return null;
          const w = latLngToWorld(s.lat, s.lng);
          return { id: sid, startX: w.x, startY: w.y };
        }).filter(Boolean),
      };
      return;
    }
    if (hitEl && kind === 'sitelink') {
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else { state.selectedIds.clear(); state.selectedIds.add(id); }
      renderAll();
      return;
    }
    // clicked empty world
    state.selectedIds.clear();
    renderAll();
    return;
  }

  // === LOCAL VIEW interactions (existing logic) ===
  // Connect mode
  if (state.mode === 'connect') {
    if (kind !== 'device') return;
    if (!state.pendingConnectId) {
      state.pendingConnectId = id;
      renderPreviewLine(id, world.x, world.y);
      renderDevices();
    } else if (state.pendingConnectId !== id) {
      pushHistory();
      state.links.push({
        id: uid(), fromId: state.pendingConnectId, toId: id,
        type: state.activeLinkType, label: ''
      });
      state.pendingConnectId = null;
      clearOverlay();
      renderAll();
    }
    return;
  }

  // Zone mode
  if (state.mode === 'zone' && state.pendingZoneType) {
    drag = { kind: 'zone-create', start: world, zoneType: state.pendingZoneType };
    return;
  }

  // Resize handle
  if (handle === 'se' && kind === 'zone') {
    const z = zoneById(id);
    pushHistory();
    drag = { kind: 'zone-resize', zone: z, startWorld: world,
             startW: z.w, startH: z.h };
    return;
  }

  // Select mode
  if (hitEl) {
    if (e.shiftKey) {
      if (state.selectedIds.has(id)) state.selectedIds.delete(id);
      else state.selectedIds.add(id);
    } else if (!state.selectedIds.has(id)) {
      state.selectedIds.clear();
      state.selectedIds.add(id);
    }
    renderAll();

    if (kind === 'device' || kind === 'zone') {
      pushHistory();
      drag = {
        kind: 'move', startWorld: world,
        items: [...state.selectedIds].map(sid => {
          const it = anyById(sid);
          if (!it) return null;
          return { id: sid, kind: typeOf(it), startX: it.x, startY: it.y };
        }).filter(Boolean)
      };
    }
  } else {
    state.selectedIds.clear();
    renderAll();
    // start rubber-band? skipping for v1
  }
});

dom.svg.addEventListener('mousemove', (e) => {
  const world = screenToWorld(e.clientX, e.clientY);
  mouseWorld = world;
  dom.sbCoords.textContent = `x: ${Math.round(world.x)}, y: ${Math.round(world.y)}`;

  if (drag) {
    if (drag.kind === 'pan') {
      state.view.pan.x = drag.panStart.x + (e.clientX - drag.startX);
      state.view.pan.y = drag.panStart.y + (e.clientY - drag.startY);
      updateWorldTransform();
    } else if (drag.kind === 'move') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      for (const it of drag.items) {
        const obj = anyById(it.id);
        if (!obj) continue;
        obj.x = snap(it.startX + dx);
        obj.y = snap(it.startY + dy);
      }
      renderDevices(); renderLinks(); renderZones();
    } else if (drag.kind === 'zone-create') {
      const x = snap(Math.min(drag.start.x, world.x));
      const y = snap(Math.min(drag.start.y, world.y));
      const w = snap(Math.abs(world.x - drag.start.x));
      const h = snap(Math.abs(world.y - drag.start.y));
      renderPreviewRect(x, y, w, h);
    } else if (drag.kind === 'zone-resize') {
      drag.zone.w = Math.max(40, snap(drag.startW + (world.x - drag.startWorld.x)));
      drag.zone.h = Math.max(40, snap(drag.startH + (world.y - drag.startWorld.y)));
      renderZones();
    } else if (drag.kind === 'site-move') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      for (const it of drag.items) {
        const s = siteById(it.id);
        if (!s) continue;
        const ll = worldToLatLng(it.startX + dx, it.startY + dy);
        s.lat = clamp(ll.lat, -89, 89);
        s.lng = ((ll.lng + 540) % 360) - 180;
      }
      renderSites();
      renderSiteLinks();
    } else if (drag.kind === 'endpoint-move') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      for (const it of drag.items) {
        const ep = endpointById(it.id);
        if (!ep) continue;
        ep.x = snap(it.startX + dx);
        ep.y = snap(it.startY + dy);
      }
      renderEndpoints();
      renderCityLinks();
    } else if (drag.kind === 'spaceasset-move') {
      const a = spaceAssetById(drag.assetId);
      if (a) {
        const def = SPACE_ASSET_TYPES[a.type] || SPACE_ASSET_TYPES.satellite_leo;
        a.angle = a.type === 'ground_station'
          ? Math.atan2(world.y, world.x)
          : orbitAngleFromWorld(a.orbit || def.orbit || 'leo', world.x, world.y);
        if (a.type === 'ground_station') {
          a.x = 240 * Math.cos(a.angle);
          a.y = 240 * Math.sin(a.angle);
        }
        renderSpaceAssets();
        renderSpaceLinks();
      }
    } else if (drag.kind === 'deepunit-move') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      for (const it of drag.items) {
        const u = deepSpaceUnitById(it.id);
        if (!u) continue;
        u.x = snap(it.startX + dx);
        u.y = snap(it.startY + dy);
      }
      renderDeepSpaceUnits();
    }
  }

  if (state.mode === 'connect' && state.pendingConnectId) {
    if (state.viewMode === 'world' && siteById(state.pendingConnectId)) {
      renderPreviewSiteLine(state.pendingConnectId, world.x, world.y);
    } else {
      renderPreviewLine(state.pendingConnectId, world.x, world.y);
    }
  }
});

dom.svg.addEventListener('dblclick', (e) => {
  const hitEl = findHitElement(e.target);
  if (hitEl && hitEl.getAttribute('data-kind') === 'site') {
    const id = hitEl.getAttribute('data-id');
    setActiveSite(id);
  } else if (hitEl && hitEl.getAttribute('data-kind') === 'endpoint') {
    const ep = endpointById(hitEl.getAttribute('data-id'));
    if (ep && ep.siteId) setActiveSite(ep.siteId);
  }
});

function renderPreviewSiteLine(siteId, wx, wy) {
  clearOverlay();
  const s = siteById(siteId);
  if (!s) return;
  const p = latLngToWorld(s.lat, s.lng);
  const mx = (p.x + wx) / 2;
  const my = (p.y + wy) / 2 - Math.abs(wx - p.x) * 0.18;
  const path = svgEl('path', {
    class: 'preview-line',
    d: `M ${p.x} ${p.y} Q ${mx} ${my} ${wx} ${wy}`,
    fill: 'none'
  });
  dom.overlayLayer.appendChild(path);
}

dom.svg.addEventListener('mouseup', (e) => {
  if (!drag) return;
  if (drag.kind === 'zone-create') {
    const world = screenToWorld(e.clientX, e.clientY);
    const x = snap(Math.min(drag.start.x, world.x));
    const y = snap(Math.min(drag.start.y, world.y));
    const w = snap(Math.abs(world.x - drag.start.x));
    const h = snap(Math.abs(world.y - drag.start.y));
    if (w >= 40 && h >= 40) {
      pushHistory();
      const id = uid();
      state.zones.push({ id, type: drag.zoneType, x, y, w, h, label: '' });
      state.selectedIds.clear();
      state.selectedIds.add(id);
    }
    clearOverlay();
    setMode('select');
    renderAll();
  }
  drag = null;
  dom.svg.classList.remove('panning');
});

dom.svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newZoom = clamp(state.view.zoom * factor, 0.2, 4);
  const rect = dom.svg.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const wx = (cx - state.view.pan.x) / state.view.zoom;
  const wy = (cy - state.view.pan.y) / state.view.zoom;
  state.view.zoom = newZoom;
  state.view.pan.x = cx - wx * newZoom;
  state.view.pan.y = cy - wy * newZoom;
  updateWorldTransform();
}, { passive: false });

dom.svg.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const hitEl = findHitElement(e.target);
  if (hitEl) {
    const id = hitEl.getAttribute('data-id');
    if (!state.selectedIds.has(id)) {
      state.selectedIds.clear(); state.selectedIds.add(id);
      renderAll();
    }
  }
  showContextMenu(e.clientX, e.clientY);
});

// Drop from palette
dom.svg.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('text/device-type') || e.dataTransfer.types.includes('text/site-id')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
});
dom.svg.addEventListener('drop', (e) => {
  e.preventDefault();
  const droppedSiteId = e.dataTransfer.getData('text/site-id');
  if (droppedSiteId) {
    if (state.viewMode !== 'city') return;
    const city = cityById(state.activeCityId);
    if (!city || city.mapBackend !== 'image') return;
    const world = screenToWorld(e.clientX, e.clientY);
    placeSiteOnCityImage(droppedSiteId, city, snap(world.x), snap(world.y));
    return;
  }
  if (state.viewMode === 'world' || state.viewMode === 'city' || state.viewMode === 'space') return; // device drops only in local view
  const type = e.dataTransfer.getData('text/device-type');
  if (!type || !DEVICE_TYPES[type]) return;
  const world = screenToWorld(e.clientX, e.clientY);
  pushHistory();
  const def = DEVICE_TYPES[type];
  const n = state.devices.filter(d => d.type === type).length + 1;
  const id = uid();
  state.devices.push({
    id, type, x: snap(world.x), y: snap(world.y),
    label: `${def.label} ${n}`,
    props: deepClone(def.defaultProps || {}),
    siteId: state.activeSiteId,
  });
  state.selectedIds.clear();
  state.selectedIds.add(id);
  renderAll();
});

function createCitySiteEndpoint(siteId, city, placement) {
  const site = siteById(siteId);
  if (!site || !city) return null;
  const existing = state.endpoints.find(ep => ep.cityId === city.id && ep.siteId === site.id);
  const base = existing || {
    id: uid(),
    type: 'building',
    label: site.name,
    cityId: city.id,
    siteId: site.id,
    props: {
      address: site.address || '',
      ip: '',
      notes: `Linked local site: ${site.name}`,
    },
  };
  base.label = site.name;
  base.type = 'building';
  base.cityId = city.id;
  base.siteId = site.id;
  base.props = { ...(base.props || {}), address: site.address || base.props?.address || '', notes: base.props?.notes || `Linked local site: ${site.name}` };
  if (placement.lat != null && placement.lng != null) {
    base.lat = placement.lat; base.lng = placement.lng;
    base.x = 0; base.y = 0;
  } else {
    base.x = placement.x; base.y = placement.y;
    base.lat = null; base.lng = null;
  }
  if (!existing) state.endpoints.push(base);
  return base;
}

function placeSiteOnCityImage(siteId, city, x, y) {
  pushHistory();
  const ep = createCitySiteEndpoint(siteId, city, { x, y });
  if (!ep) return;
  state.selectedIds.clear();
  state.selectedIds.add(ep.id);
  renderAll();
}

function placeSiteOnCityLatLng(siteId, city, lat, lng) {
  pushHistory();
  const ep = createCitySiteEndpoint(siteId, city, { lat, lng });
  if (!ep) return;
  state.selectedIds.clear();
  state.selectedIds.add(ep.id);
  syncLeafletMarkers();
  renderAll();
}


/* =========================================================================
   CONTEXT MENU
   ========================================================================= */
let ctxMenuEl = null;
function showContextMenu(x, y) {
  hideContextMenu();
  const hasSel = state.selectedIds.size > 0;
  const items = [
    { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !hasSel, action: duplicateSelection },
    { label: 'Delete',    shortcut: 'Del',    disabled: !hasSel, action: deleteSelection },
    { sep: true },
    { label: 'Select all', shortcut: 'Ctrl+A', action: selectAll },
    { label: 'Clear selection', disabled: !hasSel, action: () => { state.selectedIds.clear(); renderAll(); } },
    { sep: true },
    { label: 'Bring to front', disabled: !hasSel, action: bringToFront },
    { label: 'Send to back',   disabled: !hasSel, action: sendToBack },
  ];
  const menu = document.createElement('div');
  menu.style.cssText = `
    position:fixed; left:${x}px; top:${y}px; background:var(--bg-1);
    border:1px solid var(--border); border-radius:4px; padding:4px 0;
    box-shadow:0 6px 20px rgba(0,0,0,0.5); z-index:1000; min-width:180px;
    font-size:12px;
  `;
  for (const it of items) {
    if (it.sep) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
      menu.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.style.cssText = `
      padding:5px 14px; display:flex; justify-content:space-between; gap:20px;
      cursor:${it.disabled ? 'default' : 'pointer'};
      color:${it.disabled ? 'var(--text-faint)' : 'var(--text)'};
    `;
    el.innerHTML = `<span>${it.label}</span><span style="color:var(--text-faint);font-size:10px">${it.shortcut || ''}</span>`;
    if (!it.disabled) {
      el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-3)');
      el.addEventListener('mouseleave', () => el.style.background = '');
      el.addEventListener('click', () => { it.action(); hideContextMenu(); });
    }
    menu.appendChild(el);
  }
  document.body.appendChild(menu);
  ctxMenuEl = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
}
function hideContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}
document.addEventListener('click', hideContextMenu);
document.addEventListener('mousedown', (e) => { if (ctxMenuEl && !ctxMenuEl.contains(e.target)) hideContextMenu(); });

function bringToFront() {
  pushHistory();
  const ids = state.selectedIds;
  state.devices = [...state.devices.filter(d => !ids.has(d.id)), ...state.devices.filter(d => ids.has(d.id))];
  state.zones   = [...state.zones.filter(z => !ids.has(z.id)),   ...state.zones.filter(z => ids.has(z.id))];
  renderAll();
}
function sendToBack() {
  pushHistory();
  const ids = state.selectedIds;
  state.devices = [...state.devices.filter(d => ids.has(d.id)), ...state.devices.filter(d => !ids.has(d.id))];
  state.zones   = [...state.zones.filter(z => ids.has(z.id)),   ...state.zones.filter(z => !ids.has(z.id))];
  renderAll();
}


/* =========================================================================
   ACTIONS
   ========================================================================= */
function setMode(m) {
  state.mode = m;
  state.pendingConnectId = null;
  if (m !== 'zone') state.pendingZoneType = null;
  clearOverlay();
  dom.toolbar.querySelectorAll('[data-mode]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-mode') === m));
  dom.svg.classList.toggle('connect-mode', m === 'connect');
  dom.svg.classList.toggle('zone-mode', m === 'zone');
  dom.modePill.className = 'tb-mode-pill ' + m;
  const isWorld = state.viewMode === 'world';
  dom.modePill.textContent =
    m === 'connect' ? (isWorld ? 'Connect — click two sites for inter-site link' : 'Connect — click two devices') :
    m === 'zone' ? `Drawing ${ZONE_TYPES[state.pendingZoneType]?.label || ''} zone` :
    'Select';
  renderAll();
}

let _savedLocalView = { pan: { x: 0, y: 0 }, zoom: 1 };

function setViewMode(mode) {
  if (mode === state.viewMode) return;
  // Section progression gate: refuse locked sections.
  if (typeof progressionCanEnter === 'function' && !progressionCanEnter(mode)) return;
  // Save current viewport
  if (state.viewMode === 'local')          _savedLocalView = { pan: { ...state.view.pan }, zoom: state.view.zoom };
  else if (state.viewMode === 'world')     state.worldView = { pan: { ...state.view.pan }, zoom: state.view.zoom };
  else if (state.viewMode === 'city')      state.cityView  = { pan: { ...state.view.pan }, zoom: state.view.zoom };
  else if (state.viewMode === 'space')     state.spaceView = { pan: { ...state.view.pan }, zoom: state.view.zoom };
  else if (state.viewMode === 'deepspace') state.deepView  = { pan: { ...state.view.pan }, zoom: state.view.zoom };
  state.viewMode = mode;
  if (mode === 'city') ensureDefaultCity(true);
  // Restore target viewport
  state.view =
    mode === 'world'     ? { pan: { ...state.worldView.pan }, zoom: state.worldView.zoom } :
    mode === 'city'      ? { pan: { ...state.cityView.pan  }, zoom: state.cityView.zoom  } :
    mode === 'space'     ? { pan: { ...state.spaceView.pan }, zoom: state.spaceView.zoom } :
    mode === 'deepspace' ? { pan: { ...state.deepView.pan  }, zoom: state.deepView.zoom  } :
                           { pan: { ..._savedLocalView.pan }, zoom: _savedLocalView.zoom };
  document.body.classList.toggle('world-mode',     mode === 'world');
  document.body.classList.toggle('city-mode',      mode === 'city');
  document.body.classList.toggle('space-mode',     mode === 'space');
  document.body.classList.toggle('deepspace-mode', mode === 'deepspace');
  dom.svg.classList.toggle('world-mode',     mode === 'world');
  dom.svg.classList.toggle('city-mode',      mode === 'city');
  dom.svg.classList.toggle('space-mode',     mode === 'space');
  dom.svg.classList.toggle('deepspace-mode', mode === 'deepspace');
  dom.svg.classList.remove('place-site');
  state.activeNewSiteType = null;
  state.activeEndpointType = null;
  state.activeCitySiteId = null;
  state.activeSpaceAssetType = null;
  state.selectedIds.clear();
  state.pendingConnectId = null;
  clearOverlay();
  updateViewToggleButtons();
  renderPalette();
  syncTileMap();
  updateWorldTransform();
  renderAll();
  if (mode === 'world' && state.worldView.zoom === 0.3) requestAnimationFrame(fitWorld);
  if (mode === 'city' && cityById(state.activeCityId)) requestAnimationFrame(fitCity);
  if (mode === 'space') requestAnimationFrame(fitSpace);
  if (mode === 'deepspace') requestAnimationFrame(fitDeepSpace);
  // Start/stop the Orbit-view rotation loop when entering/leaving Orbit.
  if (mode === 'space') startOrbitAnimation();
  else stopOrbitAnimation();
}

function updateViewToggleButtons() {
  document.querySelectorAll('[data-set-view]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-set-view') === state.viewMode);
  });
}

function cycleViewMode() {
  const order = ['local', 'city', 'world', 'space', 'deepspace'];
  const idx = order.indexOf(state.viewMode);
  setViewMode(order[(idx + 1) % order.length]);
}

function fitSpace() {
  const rect = dom.svg.getBoundingClientRect();
  const pad = 80;
  const w = 2200, h = 2200; // space view world is centered around (0,0), ±1100
  const zoom = clamp(Math.min((rect.width - pad*2) / w, (rect.height - pad*2) / h), 0.1, 4);
  state.view.zoom = zoom;
  state.view.pan.x = rect.width / 2;
  state.view.pan.y = rect.height / 2;
  updateWorldTransform();
}

function fitCity() {
  const city = cityById(state.activeCityId);
  if (!city) return;
  const rect = dom.svg.getBoundingClientRect();
  const pad = 30;
  const w = city.mapW || 2000, h = city.mapH || 1400;
  const zoom = clamp(Math.min((rect.width - pad*2) / w, (rect.height - pad*2) / h), 0.1, 4);
  state.view.zoom = zoom;
  state.view.pan.x = (rect.width  - w * zoom) / 2;
  state.view.pan.y = (rect.height - h * zoom) / 2;
  updateWorldTransform();
}

// === TILE MAP (Leaflet / Google) ===
let _leafletMap = null;
let _leafletLoaded = false;
let _leafletMarkers = new Map();   // endpointId → L.marker
let _leafletPolylines = new Map(); // cityLinkId → L.polyline
let _gmapMap = null;
let _gmapLoaded = false;
let _gmapMarkers = new Map();      // endpointId → google.maps.Marker
let _gmapPolylines = new Map();    // cityLinkId → google.maps.Polyline
let _gmapLoadPromise = null;
let _activeBackend = null;          // 'osm' | 'gmaps' | 'image' | null

function setTileStatus(message, level = 'info') {
  let status = dom.tileMap.querySelector('.tile-map-status');
  if (!message) {
    if (status) status.remove();
    return;
  }
  if (!status) {
    status = document.createElement('div');
    status.className = 'tile-map-status';
    dom.tileMap.appendChild(status);
  }
  status.className = 'tile-map-status' + (level === 'error' ? ' error' : '');
  status.textContent = message;
}

function syncTileMap() {
  const city = cityById(state.activeCityId);
  const showTile = state.viewMode === 'city' && city && (city.mapBackend === 'osm' || city.mapBackend === 'gmaps');
  dom.tileMap.classList.toggle('hidden', !showTile);
  dom.svg.classList.toggle('has-tile-map', !!showTile);
  if (!showTile) {
    setTileStatus('');
    _activeBackend = null;
    return;
  }
  setTileStatus(city.mapBackend === 'osm' ? 'Loading street map tiles…' : '');
  // Switching backend: clear the tile-map div so the new backend can take over
  if (_activeBackend && _activeBackend !== city.mapBackend) {
    // Destroy previous map instance so it doesn't fight for the div
    if (_activeBackend === 'osm' && _leafletMap) {
      try { _leafletMap.remove(); } catch (e) {}
      _leafletMap = null; _leafletMarkers.clear(); _leafletPolylines.clear();
    } else if (_activeBackend === 'gmaps' && _gmapMap) {
      _gmapMap = null; _gmapMarkers.clear(); _gmapPolylines.clear();
    }
    dom.tileMap.innerHTML = '';
  }
  _activeBackend = city.mapBackend;
  if (city.mapBackend === 'osm')   ensureLeafletMap(city);
  if (city.mapBackend === 'gmaps') ensureGoogleMap(city);
}

// === GOOGLE MAPS BACKEND ===
function loadGoogleMaps(apiKey) {
  if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve();
  if (_gmapLoadPromise) return _gmapLoadPromise;
  _gmapLoadPromise = new Promise((resolve, reject) => {
    const cbName = '_gmaps_cb_' + Math.random().toString(36).slice(2, 8);
    window[cbName] = () => { _gmapLoaded = true; resolve(); delete window[cbName]; };
    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${cbName}`;
    s.onerror = () => { _gmapLoadPromise = null; reject(new Error('Google Maps script failed to load')); };
    document.head.appendChild(s);
  });
  return _gmapLoadPromise;
}

async function ensureGoogleMap(city) {
  const key = await getGoogleMapsApiKey();
  if (!key) {
    dom.tileMap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
      height:100%;color:#8a95a4;text-align:center;padding:20px;font-size:13px">
      <div style="max-width:320px">
        <div style="font-size:10px;letter-spacing:1px;color:#5a6471;margin-bottom:8px">
          GOOGLE MAPS BACKEND
        </div>
        <div style="font-size:13px;color:#d6dde6;margin-bottom:6px;font-weight:600">
          API key required
        </div>
        <div>
          Open <b>Settings</b> in the toolbar to add a key,<br>
          or switch the backend dropdown to <b>OpenStreetMap</b>.
        </div>
      </div></div>`;
    return;
  }
  try {
    await loadGoogleMaps(key);
  } catch (e) {
    dom.tileMap.innerHTML = `<div style="padding:20px;color:#ff6b6b">
      Failed to load Google Maps. Verify your API key in Settings.<br>${escapeHtml(e.message)}</div>`;
    return;
  }
  if (!_gmapMap) {
    _gmapMap = new google.maps.Map(dom.tileMap, {
      center: { lat: city.centerLat, lng: city.centerLng },
      zoom: 13,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      backgroundColor: '#0b1118',
      styles: GMAP_DARK_STYLE,
    });
    _gmapMap.addListener('click', onGoogleMapClick);
  } else {
    _gmapMap.setCenter({ lat: city.centerLat, lng: city.centerLng });
  }
  syncGoogleMarkers();
}

const GMAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a2433' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1116' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a95a4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#232b36' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a1a8b3' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1f3a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5fb3ff' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a4452' }] },
];

function gmapMarkerIconForType(type, opts) {
  const def = ENDPOINT_TYPES[type] || ENDPOINT_TYPES.building;
  const sym = document.getElementById(def.icon);
  const inner = sym ? sym.innerHTML : '';
  const isSelected = opts && opts.selected;
  const ring = isSelected ? '#ffd24a' : def.color;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 80 80">` +
      `<circle cx="40" cy="40" r="34" fill="#11161d" stroke="${ring}" stroke-width="3"/>` +
      `<g style="color:#fff" color="#fff" stroke="#fff" fill="none">${inner}</g>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(40, 40),
    anchor:     new google.maps.Point(20, 20),
  };
}

function syncGoogleMarkers() {
  if (!_gmapMap || !window.google) return;
  for (const m of _gmapMarkers.values()) m.setMap(null);
  for (const p of _gmapPolylines.values()) p.setMap(null);
  _gmapMarkers.clear(); _gmapPolylines.clear();
  for (const ep of state.endpoints) {
    if (ep.cityId !== state.activeCityId) continue;
    if (ep.lat == null || ep.lng == null) continue;
    const marker = new google.maps.Marker({
      position: { lat: ep.lat, lng: ep.lng },
      map: _gmapMap,
      title: ep.label,
      icon: gmapMarkerIconForType(ep.type, { selected: state.selectedIds.has(ep.id) }),
      draggable: true,
    });
    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      ep.lat = pos.lat(); ep.lng = pos.lng();
      syncGooglePolylines();
    });
    marker.addListener('click', () => onTileMarkerClick(ep.id));
    _gmapMarkers.set(ep.id, marker);
  }
  syncGooglePolylines();
}

function syncGooglePolylines() {
  if (!_gmapMap || !window.google) return;
  for (const p of _gmapPolylines.values()) p.setMap(null);
  _gmapPolylines.clear();
  for (const cl of state.cityLinks) {
    const a = endpointById(cl.fromEpId), b = endpointById(cl.toEpId);
    if (!a || !b || a.cityId !== state.activeCityId || b.cityId !== state.activeCityId) continue;
    if (a.lat == null || b.lat == null) continue;
    const def = CITY_LINK_TYPES[cl.type] || CITY_LINK_TYPES.fiber_buried;
    const opts = {
      path: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }],
      strokeColor: def.color, strokeWeight: def.width, strokeOpacity: def.dash ? 0 : 0.9,
      map: _gmapMap,
    };
    if (def.dash) {
      // Google dashed lines via icons
      opts.icons = [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
        offset: '0', repeat: '14px',
      }];
    }
    const poly = new google.maps.Polyline(opts);
    _gmapPolylines.set(cl.id, poly);
  }
}

function onGoogleMapClick(e) {
  // Same logic as the Leaflet click: only place when there's a pending endpoint type
  if (!state.activeEndpointType) return;
  const def = ENDPOINT_TYPES[state.activeEndpointType];
  const city = cityById(state.activeCityId);
  pushHistory();
  const n = state.endpoints.filter(ep => ep.cityId === city.id && ep.type === state.activeEndpointType).length + 1;
  const ep = {
    id: uid(), type: state.activeEndpointType,
    label: `${def.label} ${n}`,
    lat: e.latLng.lat(), lng: e.latLng.lng(),
    x: 0, y: 0, cityId: city.id,
    props: deepClone(def.defaultProps || {}),
  };
  state.endpoints.push(ep);
  state.activeEndpointType = null;
  dom.svg.classList.remove('place-site');
  dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(x => x.style.background = '');
  state.selectedIds.clear(); state.selectedIds.add(ep.id);
  syncGoogleMarkers();
  renderAll();
}

// Shared marker-click handler — handles connect mode for both Leaflet and Google
function onTileMarkerClick(epId) {
  if (state.mode === 'connect') {
    if (!state.pendingConnectId) {
      state.pendingConnectId = epId;
      // Visually mark by reselecting
      state.selectedIds.clear(); state.selectedIds.add(epId);
    } else if (state.pendingConnectId !== epId) {
      pushHistory();
      state.cityLinks.push({
        id: uid(), fromEpId: state.pendingConnectId, toEpId: epId,
        type: state.activeCityLinkType, label: '',
      });
      state.pendingConnectId = null;
      if (_leafletMap) syncLeafletPolylines();
      if (_gmapMap)    syncGooglePolylines();
    }
    renderProperties();
    return;
  }
  state.selectedIds.clear();
  state.selectedIds.add(epId);
  renderProperties();
}

function ensureLeafletMap(city) {
  if (_leafletLoaded) { initLeafletMap(city); return; }
  // Lazy-load Leaflet from the local npm package to avoid CDN script execution.
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'node_modules/leaflet/dist/leaflet.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = 'node_modules/leaflet/dist/leaflet.js';
  script.onload = () => { _leafletLoaded = true; initLeafletMap(city); };
  script.onerror = () => {
    setTileStatus('Street map engine failed to load. Switch Backend to Image for offline use.', 'error');
    dom.sbModeHint.textContent = 'Street map engine failed to load. Switch backend to "Image" for offline use.';
  };
  document.head.appendChild(script);
}

function initLeafletMap(city) {
  if (!window.L) return;
  if (!_leafletMap) {
    _leafletMap = L.map('tile-map', { zoomControl: true, attributionControl: true })
      .setView([city.centerLat, city.centerLng], 13);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(_leafletMap);
    let loadedOneTile = false;
    tiles.on('tileload', () => {
      if (!loadedOneTile) {
        loadedOneTile = true;
        setTileStatus('');
      }
    });
    tiles.on('tileerror', () => {
      if (!loadedOneTile) {
        setTileStatus('Could not load OpenStreetMap street tiles. Check internet access, or switch Backend to Image.', 'error');
      }
    });
    _leafletMap.on('click', onLeafletMapClick);
    const mapEl = _leafletMap.getContainer();
    mapEl.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('text/site-id')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    mapEl.addEventListener('drop', (e) => {
      const siteId = e.dataTransfer.getData('text/site-id');
      if (!siteId) return;
      e.preventDefault();
      const activeCity = cityById(state.activeCityId);
      if (!activeCity) return;
      const point = _leafletMap.mouseEventToLatLng(e);
      placeSiteOnCityLatLng(siteId, activeCity, point.lat, point.lng);
    });
  } else {
    _leafletMap.setView([city.centerLat, city.centerLng], 13);
    _leafletMap.invalidateSize();
  }
  setTimeout(() => { try { _leafletMap.invalidateSize(); } catch (e) {} }, 80);
  syncLeafletMarkers();
}

function syncLeafletMarkers() {
  if (!_leafletMap || !window.L) return;
  // Remove all existing markers and lines
  for (const m of _leafletMarkers.values()) _leafletMap.removeLayer(m);
  for (const p of _leafletPolylines.values()) _leafletMap.removeLayer(p);
  _leafletMarkers.clear();
  _leafletPolylines.clear();

  // Add endpoint markers for active city
  for (const ep of state.endpoints) {
    if (ep.cityId !== state.activeCityId) continue;
    if (ep.lat == null || ep.lng == null) continue;
    const def = ENDPOINT_TYPES[ep.type] || ENDPOINT_TYPES.building;
    const linkedSite = ep.siteId ? siteById(ep.siteId) : null;
    const siteDef = linkedSite ? (SITE_TYPES[linkedSite.type] || SITE_TYPES.office) : null;
    const icon = linkedSite
      ? L.divIcon({
          className: 'leaflet-site-ref',
          html: `<div class="site-ref-marker" style="border-color:${siteDef.color};box-shadow:0 0 8px ${siteDef.color}99">⌂</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        })
      : L.divIcon({
          className: 'leaflet-endpoint',
          html: `<div style="width:32px;height:32px;border-radius:50%;background:#11161d;border:2px solid ${def.color};display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${def.color}99"><svg viewBox="0 0 80 80" width="22" height="22" style="color:#fff"><use href="#${def.icon}"/></svg></div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        });
    const m = L.marker([ep.lat, ep.lng], { icon, draggable: true })
      .addTo(_leafletMap)
      .bindPopup(linkedSite
        ? `<b>${escapeHtml(linkedSite.name)}</b><br>Linked local site<br><small>Double-click marker to open local setup.</small>`
        : `<b>${escapeHtml(ep.label)}</b><br>${escapeHtml(def.label)}`);
    m.on('dragend', (e) => {
      const ll = e.target.getLatLng();
      ep.lat = ll.lat; ep.lng = ll.lng;
      syncLeafletPolylines();
    });
    m.on('click', () => onTileMarkerClick(ep.id));
    m.on('dblclick', () => { if (ep.siteId) setActiveSite(ep.siteId); });
    _leafletMarkers.set(ep.id, m);
  }
  syncLeafletPolylines();
}

function syncLeafletPolylines() {
  if (!_leafletMap || !window.L) return;
  for (const p of _leafletPolylines.values()) _leafletMap.removeLayer(p);
  _leafletPolylines.clear();
  for (const cl of state.cityLinks) {
    const a = endpointById(cl.fromEpId), b = endpointById(cl.toEpId);
    if (!a || !b || a.cityId !== state.activeCityId || b.cityId !== state.activeCityId) continue;
    if (a.lat == null || b.lat == null) continue;
    const def = CITY_LINK_TYPES[cl.type] || CITY_LINK_TYPES.fiber_buried;
    const opts = { color: def.color, weight: def.width };
    if (def.dash) opts.dashArray = def.dash;
    const poly = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], opts).addTo(_leafletMap);
    if (cl.label) poly.bindTooltip(cl.label);
    _leafletPolylines.set(cl.id, poly);
  }
}

function onLeafletMapClick(e) {
  if (state.activeCitySiteId) {
    const city = cityById(state.activeCityId);
    placeSiteOnCityLatLng(state.activeCitySiteId, city, e.latlng.lat, e.latlng.lng);
    state.activeCitySiteId = null;
    dom.svg.classList.remove('place-site');
    clearCitySitePaletteSelection();
    return;
  }
  if (!state.activeEndpointType) return;
  const def = ENDPOINT_TYPES[state.activeEndpointType];
  const city = cityById(state.activeCityId);
  pushHistory();
  const n = state.endpoints.filter(ep => ep.cityId === city.id && ep.type === state.activeEndpointType).length + 1;
    const ep = {
      id: uid(), type: state.activeEndpointType,
      label: `${def.label} ${n}`,
      lat: e.latlng.lat, lng: e.latlng.lng,
      x: 0, y: 0, // SVG coords only used in image backend
    cityId: city.id,
    props: deepClone(def.defaultProps || {}),
  };
  state.endpoints.push(ep);
  state.activeEndpointType = null;
  dom.svg.classList.remove('place-site');
  dom.palette.querySelectorAll('.pal-item[data-endpoint-type]').forEach(x => x.style.background = '');
  state.selectedIds.clear(); state.selectedIds.add(ep.id);
  syncLeafletMarkers();
  renderAll();
}

function clearCitySitePaletteSelection() {
  dom.palette.querySelectorAll('.pal-item[data-city-site-id]').forEach(x => x.style.background = '');
}

const LIVE_MAP_KEY = 'greynet:livemap:v1';
function setLiveMap(on) {
  state.liveMap = on;
  dom.svg.classList.toggle('live-map', on);
  const btn = document.getElementById('live-toggle-btn');
  if (btn) btn.classList.toggle('live-on', on);
  try { localStorage.setItem(LIVE_MAP_KEY, on ? '1' : '0'); } catch (e) {}
}

function fitWorld() {
  const rect = dom.svg.getBoundingClientRect();
  const pad = 40;
  const w = 3600, h = 1800;
  const zoom = clamp(Math.min((rect.width - pad*2) / w, (rect.height - pad*2) / h), 0.1, 4);
  state.view.zoom = zoom;
  state.view.pan.x = (rect.width  - w * zoom) / 2;
  state.view.pan.y = (rect.height - h * zoom) / 2;
  updateWorldTransform();
}

// === CROSS-VIEW SYNC HELPERS ===
//
// The same network can be referenced from several views: a Site appears on
// the Planet view, can be placed as a "linked" endpoint on a City map, and
// owns Devices in the Local view. These helpers keep all views consistent
// when a Site (or City) is edited or removed, so changes the user makes in
// one view propagate to the others automatically.

// Find all city endpoints that are linked to a given site.
function endpointsLinkedToSite(siteId) {
  return state.endpoints.filter(ep => ep.siteId === siteId);
}

// Push a site's current state down to every linked city endpoint so the
// label, address, and notes stay in lock-step with the Planet/Local view.
// Safe to call after any site-property mutation.
function propagateSiteChange(siteId) {
  const site = siteById(siteId);
  if (!site) return;
  for (const ep of endpointsLinkedToSite(siteId)) {
    ep.label = site.name;
    ep.props = ep.props || {};
    if (site.address != null) ep.props.address = site.address;
    // Preserve user-edited endpoint notes unless the original is the
    // auto-generated "Linked local site:" line, in which case re-sync it.
    if (!ep.props.notes || /^Linked local site:/.test(ep.props.notes)) {
      ep.props.notes = `Linked local site: ${site.name}`;
    }
  }
}

// Push a city's current state down to dependent things (right now: nothing
// beyond a hook for future use). Cheap no-op; call it freely.
function propagateCityChange(cityId) {
  const _city = cityById(cityId);
  if (!_city) return;
  // Reserved for future cross-references (e.g., planet pins that mirror a
  // city's center coords).
}

// Cascade-delete a site: remove its devices, zones, links, inter-site links,
// AND any linked city endpoints (plus their city links). Without this the
// city view would show "Linked local site" pointing at a phantom site.
function cascadeSiteDeletion(siteIds) {
  if (!(siteIds instanceof Set)) siteIds = new Set(siteIds);
  if (siteIds.size === 0) return;
  // Endpoints linked to a deleted site
  const removedEndpointIds = new Set(
    state.endpoints.filter(ep => siteIds.has(ep.siteId)).map(ep => ep.id)
  );
  state.endpoints   = state.endpoints.filter(ep => !removedEndpointIds.has(ep.id));
  state.cityLinks   = state.cityLinks.filter(cl =>
    !removedEndpointIds.has(cl.fromEpId) && !removedEndpointIds.has(cl.toEpId));
  state.devices     = state.devices.filter(d => !siteIds.has(d.siteId));
  state.zones       = state.zones.filter(z => !siteIds.has(z.siteId));
  state.links       = state.links.filter(l => {
    const a = deviceById(l.fromId), b = deviceById(l.toId);
    return a && b;   // surviving devices on both ends
  });
  state.siteLinks   = state.siteLinks.filter(sl =>
    !siteIds.has(sl.fromSiteId) && !siteIds.has(sl.toSiteId));
}

function setActiveSite(siteId) {
  state.activeSiteId = siteId;
  state.selectedIds.clear();
  // Always switch to local view when opening a site, regardless of which
  // view we came from (planet/city/space/deepspace). setViewMode itself
  // calls renderAll() for us, so don't double-render.
  if (state.viewMode !== 'local') {
    setViewMode('local');
  } else {
    renderAll();
  }
  // auto-fit if site has devices
  const hasDevices = state.devices.some(d => d.siteId === siteId);
  if (hasDevices) requestAnimationFrame(fitView);
}

// Symmetric helper: switch to City view of a given city and (optionally)
// select an endpoint there. Used by reverse navigation buttons.
function setActiveCity(cityId, opts) {
  if (!cityById(cityId)) return;
  state.activeCityId = cityId;
  // setViewMode itself clears selectedIds, so add the requested selection
  // AFTER the mode switch and re-render once more.
  if (state.viewMode !== 'city') setViewMode('city');
  state.selectedIds.clear();
  if (opts && opts.selectEndpointId) state.selectedIds.add(opts.selectEndpointId);
  syncTileMap();
  renderAll();
  requestAnimationFrame(fitCity);
}

function updateSiteBar() {
  const mode = state.viewMode;
  // Show city-only controls only in city mode
  dom.cityBarControls.style.display = (mode === 'city') ? 'flex' : 'none';

  if (mode === 'world') {
    dom.sbIcon.textContent = 'PLANET';
    dom.sbContextLabel.textContent = 'Planet';
    dom.sbActiveSiteName.textContent = `${state.sites.length} site${state.sites.length === 1 ? '' : 's'}`;
    dom.sbModeHint.textContent = state.activeNewSiteType
      ? `Click anywhere on the map to place a ${SITE_TYPES[state.activeNewSiteType].label}.`
      : 'Drag sites, connect with inter-site links, double-click to enter a site.';
  } else if (mode === 'city') {
    dom.sbIcon.textContent = 'CITY';
    const city = cityById(state.activeCityId);
    dom.sbContextLabel.textContent = city ? 'City' : '—';
    dom.sbActiveSiteName.textContent = city ? city.name : '(no city)';
    if (city) dom.cityBackendSel.value = city.mapBackend || 'osm';
    dom.sbModeHint.textContent = state.activeEndpointType
      ? `Click the map to place a ${ENDPOINT_TYPES[state.activeEndpointType].label}.`
      : (state.mode === 'connect'
          ? 'Connect mode — click two endpoints to link them with the selected cable type.'
          : 'Pick a backend, place endpoints, connect them.');
  } else if (mode === 'space') {
    dom.sbIcon.textContent = 'ORBIT';
    dom.sbContextLabel.textContent = 'Orbit network';
    dom.sbActiveSiteName.textContent = `${state.spaceAssets.length} asset${state.spaceAssets.length === 1 ? '' : 's'}`;
    dom.sbModeHint.textContent = state.activeSpaceAssetType
      ? `Click on the orbital ring to place a ${SPACE_ASSET_TYPES[state.activeSpaceAssetType].label}.`
      : (state.mode === 'connect'
          ? 'Connect mode — click two assets to link them with the selected link type.'
          : 'Drag satellites along their orbit, double-click for details.');
  } else if (mode === 'deepspace') {
    dom.sbIcon.textContent = 'DEEP SPACE';
    const src = DS_SOURCES[state.comms.sourceId] || DS_SOURCES.dsn70;
    const tgt = DS_TARGETS[state.comms.targetId];
    dom.sbContextLabel.textContent = 'Link budget';
    dom.sbActiveSiteName.textContent = `${src.label} → ${tgt ? tgt.label : 'custom'}`;
    dom.sbModeHint.textContent = 'Click a planet to switch target. Drag sliders on the right to tune the link.';
  } else {
    dom.sbIcon.textContent = 'SITE';
    const site = siteById(state.activeSiteId);
    dom.sbContextLabel.textContent = site ? 'Site' : '—';
    dom.sbActiveSiteName.textContent = site ? site.name : '(no site selected)';
    dom.sbModeHint.textContent = 'Designing this site\'s local network.';
  }
}

function renderSiteSwitcherMenu() {
  const isCity = state.viewMode === 'city';
  let items;
  if (isCity) {
    items = state.cities.map(c => {
      const cnt = state.endpoints.filter(ep => ep.cityId === c.id).length;
      const active = c.id === state.activeCityId ? 'active' : '';
      return `<div class="sb-site ${active}" data-city-id="${c.id}">
        <span class="swatch" style="background:#5fb3ff"></span>
        <span>${escapeHtml(c.name)}</span>
        <span class="stype">${escapeHtml((CITY_BACKENDS[c.mapBackend] || CITY_BACKENDS.osm).label.split(' ')[0])} · ${cnt}</span>
      </div>`;
    }).join('');
  } else {
    items = state.sites.map(s => {
      const def = SITE_TYPES[s.type] || SITE_TYPES.office;
      const cnt = state.devices.filter(d => d.siteId === s.id).length;
      const active = s.id === state.activeSiteId ? 'active' : '';
      return `<div class="sb-site ${active}" data-site-id="${s.id}">
        <span class="swatch" style="background:${def.color}"></span>
        <span>${escapeHtml(s.name)}</span>
        <span class="stype">${escapeHtml(def.label.split(' ')[0])} · ${cnt}</span>
      </div>`;
    }).join('');
  }
  const actions = isCity
    ? `<div class="sb-action" data-action="new-city">+ Add new city…</div>
       <div class="sb-action" data-action="open-world">Open Planet view</div>`
    : `<div class="sb-action" data-action="open-world">Open Planet view</div>
       <div class="sb-action" data-action="new-city">+ Add new city…</div>
       <div class="sb-action" data-action="add-site">+ Add new site…</div>`;
  dom.sbSwitchMenu.innerHTML = items + `<div class="sb-sep"></div>` + actions;
  dom.sbSwitchMenu.querySelectorAll('.sb-site').forEach(el => {
    el.addEventListener('click', () => {
      dom.sbSwitchMenu.setAttribute('hidden', '');
      if (isCity) {
        state.activeCityId = el.getAttribute('data-city-id');
        state.selectedIds.clear();
        syncTileMap();
        renderAll();
        requestAnimationFrame(fitCity);
      } else {
        setActiveSite(el.getAttribute('data-site-id'));
      }
    });
  });
  dom.sbSwitchMenu.querySelectorAll('.sb-action').forEach(el => {
    el.addEventListener('click', () => {
      dom.sbSwitchMenu.setAttribute('hidden', '');
      const a = el.getAttribute('data-action');
      if (a === 'open-world') setViewMode('world');
      else if (a === 'add-site') {
        setViewMode('world');
        if (typeof toast === 'function') {
          toast('Click a site type in the left palette, then click the map to place it.',
                { variant: 'info', ttlMs: 5000 });
        }
      } else if (a === 'new-city') {
        promptNewCity();
      }
    });
  });
}

function promptNewCity() {
  const base = cityById(state.activeCityId) || { centerLat: 40.71, centerLng: -74.00 };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="min-width:420px;max-width:92vw">
      <h3>Add City</h3>
      <div class="form-grid">
        <div>
          <label>City name</label>
          <input id="new-city-name" type="text" value="New City" placeholder="e.g. Atlanta"/>
        </div>
        <div class="pr-field-row">
          <div class="pr-field">
            <label>Latitude</label>
            <input id="new-city-lat" type="number" step="0.0001" value="${Number(base.centerLat || 0).toFixed(4)}"/>
          </div>
          <div class="pr-field">
            <label>Longitude</label>
            <input id="new-city-lng" type="number" step="0.0001" value="${Number(base.centerLng || 0).toFixed(4)}"/>
          </div>
        </div>
        <div>
          <label>Map backend</label>
          <select id="new-city-backend">
            <option value="osm" selected>Streets (OpenStreetMap)</option>
            <option value="image">Image / offline blank canvas</option>
          </select>
          <div class="form-help">Streets need internet access. Image mode works offline and can use an uploaded city map.</div>
        </div>
      </div>
      <div class="modal-actions">
        <button data-close>Cancel</button>
        <button class="primary" id="new-city-create">Create city</button>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.hasAttribute('data-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
  const nameInput = overlay.querySelector('#new-city-name');
  nameInput.focus();
  nameInput.select();
  overlay.querySelector('#new-city-create').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const city = {
      id: uid(), name,
      centerLat: clampNum(overlay.querySelector('#new-city-lat').value, -90, 90, 40.71),
      centerLng: clampNum(overlay.querySelector('#new-city-lng').value, -180, 180, -74.00),
      mapW: 2000, mapH: 1400,
      mapBackend: overlay.querySelector('#new-city-backend').value,
      imageUrl: '', notes: '',
    };
    pushHistory();
    state.cities.push(city);
    state.activeCityId = city.id;
    overlay.remove();
    if (state.viewMode !== 'city') setViewMode('city');
    else {
      syncTileMap();
      renderAll();
      requestAnimationFrame(fitCity);
    }
  });
}

// Wire city-bar controls (once)
dom.cityBackendSel.addEventListener('change', () => {
  const city = cityById(state.activeCityId);
  if (!city) return;
  pushHistory();
  city.mapBackend = dom.cityBackendSel.value;
  syncTileMap();
  renderAll();
});
dom.cityNewBtn.addEventListener('click', promptNewCity);
dom.cityImageBtn.addEventListener('click', () => dom.cityImageInput.click());
dom.cityImageInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const city = cityById(state.activeCityId);
    if (!city) return;
    pushHistory();
    city.imageUrl = reader.result;  // data URI
    city.mapBackend = 'image';
    dom.cityBackendSel.value = 'image';
    syncTileMap();
    renderAll();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

dom.sbSwitchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (dom.sbSwitchMenu.hasAttribute('hidden')) {
    renderSiteSwitcherMenu();
    dom.sbSwitchMenu.removeAttribute('hidden');
  } else {
    dom.sbSwitchMenu.setAttribute('hidden', '');
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#sb-switcher')) dom.sbSwitchMenu.setAttribute('hidden', '');
});

function deleteSelection() {
  if (state.selectedIds.size === 0) return;
  pushHistory();
  const ids = state.selectedIds;
  const deletedSiteIds = new Set([...ids].filter(id => siteById(id)));
  const deletedCityIds = new Set([...ids].filter(id => cityById(id)));
  // First handle direct deletions of non-site / non-city items.
  state.devices = state.devices.filter(d => !ids.has(d.id));
  state.links = state.links.filter(l => !ids.has(l.id) && !ids.has(l.fromId) && !ids.has(l.toId));
  state.zones = state.zones.filter(z => !ids.has(z.id));
  state.sites = state.sites.filter(s => !ids.has(s.id));
  state.siteLinks = state.siteLinks.filter(sl => !ids.has(sl.id));
  // Cascade the site deletions across views (devices / zones / links / inter-site
  // links / linked city endpoints / city links). Keeps the network coherent.
  if (deletedSiteIds.size) cascadeSiteDeletion(deletedSiteIds);
  // City-level deletes
  state.endpoints = state.endpoints.filter(ep => !ids.has(ep.id) && !deletedCityIds.has(ep.cityId));
  state.cityLinks = state.cityLinks.filter(cl => !ids.has(cl.id)
    && endpointById(cl.fromEpId) && endpointById(cl.toEpId));
  state.cities = state.cities.filter(c => !ids.has(c.id));
  // Space-level deletes
  state.spaceAssets = state.spaceAssets.filter(a => !ids.has(a.id));
  state.spaceLinks = state.spaceLinks.filter(l => !ids.has(l.id)
    && spaceAssetById(l.fromAssetId) && spaceAssetById(l.toAssetId));
  // Planet-infra + deep-space deletes
  state.planetInfra    = (state.planetInfra    || []).filter(p => !ids.has(p.id));
  state.deepSpaceUnits = (state.deepSpaceUnits || []).filter(u => !ids.has(u.id));
  state.deepSpaceLinks = (state.deepSpaceLinks || []).filter(l => !ids.has(l.id)
    && deepSpaceUnitByIdSafe(l.fromId) && deepSpaceUnitByIdSafe(l.toId));
  if (state.activeSiteId && deletedSiteIds.has(state.activeSiteId)) {
    state.activeSiteId = state.sites[0] ? state.sites[0].id : null;
  }
  if (state.activeCityId && deletedCityIds.has(state.activeCityId)) {
    state.activeCityId = state.cities[0] ? state.cities[0].id : null;
  }
  state.selectedIds.clear();
  renderAll();
  syncLeafletMarkers();
}

function duplicateSelection() {
  if (state.selectedIds.size === 0) return;
  pushHistory();
  const idMap = {};
  const newIds = new Set();
  for (const id of state.selectedIds) {
    const item = anyById(id);
    if (!item) continue;
    const kind = typeOf(item);
    const copy = deepClone(item);
    copy.id = uid();
    idMap[id] = copy.id;
    newIds.add(copy.id);
    if (kind === 'device') { copy.x += 40; copy.y += 40; state.devices.push(copy); }
    else if (kind === 'zone') { copy.x += 30; copy.y += 30; state.zones.push(copy); }
    else if (kind === 'link') { /* relink later */ }
  }
  // duplicate links between selected devices
  for (const id of state.selectedIds) {
    const link = linkById(id);
    if (link && idMap[link.fromId] && idMap[link.toId]) {
      const copy = deepClone(link);
      copy.id = uid();
      copy.fromId = idMap[link.fromId];
      copy.toId = idMap[link.toId];
      state.links.push(copy);
      newIds.add(copy.id);
    }
  }
  state.selectedIds = newIds;
  renderAll();
}

function selectAll() {
  state.selectedIds.clear();
  for (const d of state.devices) state.selectedIds.add(d.id);
  for (const l of state.links) state.selectedIds.add(l.id);
  for (const z of state.zones) state.selectedIds.add(z.id);
  renderAll();
}

function zoomBy(factor) {
  const rect = dom.svg.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const wx = (cx - state.view.pan.x) / state.view.zoom;
  const wy = (cy - state.view.pan.y) / state.view.zoom;
  state.view.zoom = clamp(state.view.zoom * factor, 0.2, 4);
  state.view.pan.x = cx - wx * state.view.zoom;
  state.view.pan.y = cy - wy * state.view.zoom;
  updateWorldTransform();
}
function resetView() {
  state.view.zoom = 1;
  state.view.pan.x = 0; state.view.pan.y = 0;
  updateWorldTransform();
}
function fitView() {
  if (state.devices.length === 0 && state.zones.length === 0) return resetView();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of state.devices) {
    minX = Math.min(minX, d.x - 40); minY = Math.min(minY, d.y - 40);
    maxX = Math.max(maxX, d.x + 40); maxY = Math.max(maxY, d.y + 70);
  }
  for (const z of state.zones) {
    minX = Math.min(minX, z.x);     minY = Math.min(minY, z.y);
    maxX = Math.max(maxX, z.x+z.w); maxY = Math.max(maxY, z.y+z.h);
  }
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return resetView();
  const rect = dom.svg.getBoundingClientRect();
  const pad = 60;
  const zoom = clamp(Math.min((rect.width - pad*2) / w, (rect.height - pad*2) / h), 0.2, 4);
  state.view.zoom = zoom;
  state.view.pan.x = (rect.width  - w * zoom) / 2 - minX * zoom;
  state.view.pan.y = (rect.height - h * zoom) / 2 - minY * zoom;
  updateWorldTransform();
}


/* =========================================================================
   SECURITY VALIDATION
   ========================================================================= */
function pointInZone(x, y, z) {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}
function deviceZone(d) {
  // return innermost (smallest) zone containing the device
  let best = null;
  for (const z of state.zones) {
    if (pointInZone(d.x, d.y, z)) {
      if (!best || (z.w * z.h) < (best.w * best.h)) best = z;
    }
  }
  return best;
}

function validate() {
  const warnings = [];

  // === Architecture validator output (cross-layer connectivity) ===
  // Adds blockers/warnings/recommendations from validator.js, grouped by
  // section. Mapped to the tray's severity scheme:
  //   blocker → err, warning → warn, recommendation → info
  // Falls back silently if validator.js is missing (smoke tests etc).
  if (typeof validateArchitectureGraph === 'function') {
    try {
      const v = validateArchitectureGraph(state);
      const sectionLabel = {
        local: 'Local', city: 'City', planet: 'Planet',
        orbit: 'Orbit', deepspace: 'Deep Space',
      };
      for (const sec of ['local','city','planet','orbit','deepspace']) {
        const st = v.sectionStatus[sec];
        for (const m of st.blockers) {
          warnings.push({ severity: 'err',  msg: `[${sectionLabel[sec]}] ${m}` });
        }
        for (const m of st.warnings) {
          warnings.push({ severity: 'warn', msg: `[${sectionLabel[sec]}] ${m}` });
        }
        for (const m of st.recommendations) {
          warnings.push({ severity: 'info', msg: `[${sectionLabel[sec]}] ${m}` });
        }
      }
      // Orphan-object roll-up across all layers — clickable selection.
      for (const o of v.orphanedObjects) {
        warnings.push({
          severity: 'warn',
          msg: `[${sectionLabel[o.layer] || o.layer}] Orphan ${o.kind}: "${o.label}"`,
          sourceIds: [o.id],
        });
      }
      if (!v.fullPathExists) {
        warnings.push({
          severity: 'info',
          msg: '[Global] No proven Local→Deep Space connectivity path yet.',
        });
      }
    } catch (e) {
      console.warn('Architecture validator failed inside renderWarnings()', e);
    }
  }

  // duplicate IPs
  const byIp = {};
  for (const d of state.devices) {
    const ip = d.props && d.props.ip;
    if (!ip) continue;
    (byIp[ip] = byIp[ip] || []).push(d);
  }
  for (const [ip, devs] of Object.entries(byIp)) {
    if (devs.length > 1) {
      warnings.push({
        severity: 'err',
        msg: `Duplicate IP ${ip} on ${devs.length} devices: ${devs.map(d => d.label).join(', ')}`,
        sourceIds: devs.map(d => d.id),
      });
    }
  }

  // links crossing zones without firewall
  const securityTypes = new Set(['firewall','waf','ids','vpn','proxy']);
  for (const link of state.links) {
    const a = deviceById(link.fromId), b = deviceById(link.toId);
    if (!a || !b) continue;
    const za = deviceZone(a), zb = deviceZone(b);
    if (za && zb && za.id !== zb.id) {
      // crossing zones; is either endpoint a security device?
      if (!securityTypes.has(a.type) && !securityTypes.has(b.type)) {
        warnings.push({
          severity: 'warn',
          msg: `Direct link between zones "${(za.label || ZONE_TYPES[za.type].label)}" and "${(zb.label || ZONE_TYPES[zb.type].label)}" without a security device`,
          sourceIds: [link.id, a.id, b.id],
        });
      }
    }
  }

  // Internet zone devices that aren't internet/cloud type or security
  for (const d of state.devices) {
    const z = deviceZone(d);
    if (z && z.type === 'internet') {
      const ok = new Set(['internet','cloud','firewall','router','vpn','proxy','waf']);
      if (!ok.has(d.type)) {
        warnings.push({
          severity: 'warn',
          msg: `${d.label} placed in Internet zone — only edge/security devices should live here`,
          sourceIds: [d.id, z.id],
        });
      }
    }
  }

  // unmanaged endpoints (in a zone but no firewall on any path is hard; skip for v1)
  // dangling links
  for (const link of state.links) {
    if (!deviceById(link.fromId) || !deviceById(link.toId)) {
      warnings.push({
        severity: 'err',
        msg: `Dangling link with missing endpoint`,
        sourceIds: [link.id],
      });
    }
  }

  // devices with no connection (orphans)
  const connected = new Set();
  for (const l of state.links) { connected.add(l.fromId); connected.add(l.toId); }
  for (const d of state.devices) {
    if (!connected.has(d.id) && d.type !== 'internet' && d.type !== 'cloud') {
      warnings.push({
        severity: 'info',
        msg: `${d.label} has no connections`,
        sourceIds: [d.id],
      });
    }
  }

  return warnings;
}

let _lastWarnings = [];
function renderWarnings() {
  const warnings = validate();
  _lastWarnings = warnings;
  if (warnings.length === 0) {
    // Clear the body + counter so a previously-rendered tray can't leak stale
    // findings into the next render (e.g. after Load demo fixes everything).
    dom.warningsTray.classList.add('hidden');
    dom.warningsCount.textContent = '0';
    dom.warningsCount.classList.remove('err');
    dom.warningsBody.innerHTML = '';
    return;
  }
  dom.warningsTray.classList.remove('hidden');
  const errs = warnings.filter(w => w.severity === 'err').length;
  dom.warningsCount.textContent = warnings.length;
  dom.warningsCount.classList.toggle('err', errs > 0);

  const sortOrder = { err: 0, warn: 1, info: 2 };
  warnings.sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity]);

  dom.warningsBody.innerHTML = warnings.map((w, i) =>
    `<div class="warning-item" data-idx="${i}">` +
      `<span class="sev ${w.severity}"></span>` +
      `<div class="msg">${escapeHtml(w.msg)}<div class="src">${w.severity.toUpperCase()}</div></div>` +
    `</div>`
  ).join('');
  dom.warningsBody.querySelectorAll('.warning-item').forEach(el => {
    el.addEventListener('click', () => {
      const w = _lastWarnings[Number(el.getAttribute('data-idx'))];
      if (w && w.sourceIds) {
        state.selectedIds.clear();
        for (const id of w.sourceIds) state.selectedIds.add(id);
        renderAll();
      }
    });
  });
}

document.getElementById('warnings-header').addEventListener('click', () => {
  dom.warningsTray.classList.toggle('collapsed');
});


/* =========================================================================
   SAVE / LOAD / EXPORT
   ========================================================================= */
const STORAGE_KEY = 'greynet:autosave:v1';

function diagramToJson() {
  const body = {
    app: 'GreyNet',
    savedAt: new Date().toISOString(),
    view: state.view,
    worldView: state.worldView,
    cityView: state.cityView,
    spaceView: state.spaceView,
    deepView: state.deepView,
    viewMode: state.viewMode,
    activeSiteId: state.activeSiteId,
    activeCityId: state.activeCityId,
    devices: state.devices,
    links: state.links,
    zones: state.zones,
    sites: state.sites,
    siteLinks: state.siteLinks,
    cities: state.cities,
    endpoints: state.endpoints,
    cityLinks: state.cityLinks,
    spaceAssets: state.spaceAssets,
    spaceLinks: state.spaceLinks,
    planetInfra: state.planetInfra,
    deepSpaceUnits: state.deepSpaceUnits,
    deepSpaceLinks: state.deepSpaceLinks,
    progression: state.progression,
    comms: state.comms,
  };
  // Stamp app+schemaVersion (and legacy `version`) via migrations.js when
  // it's loaded; otherwise fall back to the old version field.
  if (typeof stampDiagram === 'function') return stampDiagram(body);
  return Object.assign({ schemaVersion: 5, version: 5 }, body);
}

const MAX_IMPORT_ITEMS = 2000;
const MAX_STRING = 1000;
const MAX_PROP_STRING = 2000;

function clampNum(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanString(value, max = MAX_STRING) {
  return String(value == null ? '' : value).slice(0, max);
}

function cleanId(value) {
  const id = cleanString(value, 96).replace(/[^\w:.-]/g, '');
  return id || uid();
}

function cleanEnum(value, table, fallback) {
  return Object.prototype.hasOwnProperty.call(table, value) ? value : fallback;
}

function cleanProps(props) {
  const out = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  for (const [k, v] of Object.entries(props).slice(0, 50)) {
    out[cleanString(k, 64)] = cleanString(v, MAX_PROP_STRING);
  }
  return out;
}

function cleanUrl(value) {
  const url = cleanString(value, 2048).trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : '';
  } catch (e) {
    return /^[\w./ -]+\.(png|jpe?g|webp|gif)$/i.test(url) ? url : '';
  }
}

function cleanArray(value) {
  return Array.isArray(value) ? value.slice(0, MAX_IMPORT_ITEMS) : [];
}

function cleanView(value) {
  if (!value || typeof value !== 'object') return null;
  const pan = value.pan && typeof value.pan === 'object' ? value.pan : {};
  return {
    pan: {
      x: clampNum(pan.x, -1000000, 1000000, 0),
      y: clampNum(pan.y, -1000000, 1000000, 0),
    },
    zoom: clampNum(value.zoom, 0.05, 10, 1),
  };
}

function sanitizeDiagram(obj) {
  const devices = cleanArray(obj.devices).map(d => ({
    id: cleanId(d.id),
    type: cleanEnum(d.type, DEVICE_TYPES, 'workstation'),
    x: clampNum(d.x, -100000, 100000),
    y: clampNum(d.y, -100000, 100000),
    label: cleanString(d.label || DEVICE_TYPES[cleanEnum(d.type, DEVICE_TYPES, 'workstation')].label),
    props: cleanProps(d.props),
    siteId: cleanString(d.siteId, 96),
  }));
  const deviceIds = new Set(devices.map(d => d.id));

  const zones = cleanArray(obj.zones).map(z => ({
    id: cleanId(z.id),
    type: cleanEnum(z.type, ZONE_TYPES, 'internal'),
    x: clampNum(z.x, -100000, 100000),
    y: clampNum(z.y, -100000, 100000),
    w: clampNum(z.w, 20, 100000, 200),
    h: clampNum(z.h, 20, 100000, 140),
    label: cleanString(z.label),
    siteId: cleanString(z.siteId, 96),
  }));

  const links = cleanArray(obj.links).map(l => ({
    id: cleanId(l.id),
    fromId: cleanString(l.fromId, 96),
    toId: cleanString(l.toId, 96),
    type: cleanEnum(l.type, LINK_TYPES, 'ethernet'),
    label: cleanString(l.label),
  })).filter(l => deviceIds.has(l.fromId) && deviceIds.has(l.toId));

  const sites = cleanArray(obj.sites).map(s => ({
    id: cleanId(s.id),
    type: cleanEnum(s.type, SITE_TYPES, 'office'),
    name: cleanString(s.name || 'Site'),
    lat: clampNum(s.lat, -90, 90, 0),
    lng: clampNum(s.lng, -180, 180, 0),
    address: cleanString(s.address),
    notes: cleanString(s.notes, MAX_PROP_STRING),
    color: SITE_TYPES[cleanEnum(s.type, SITE_TYPES, 'office')].color,
  }));
  const siteIds = new Set(sites.map(s => s.id));

  const siteLinks = cleanArray(obj.siteLinks).map(sl => ({
    id: cleanId(sl.id),
    fromSiteId: cleanString(sl.fromSiteId, 96),
    toSiteId: cleanString(sl.toSiteId, 96),
    type: cleanEnum(sl.type, SITE_LINK_TYPES, 'wan'),
    label: cleanString(sl.label),
    bandwidth: cleanString(sl.bandwidth),
    sla: cleanString(sl.sla),
  })).filter(sl => siteIds.has(sl.fromSiteId) && siteIds.has(sl.toSiteId));

  const cities = cleanArray(obj.cities).map(c => ({
    id: cleanId(c.id),
    name: cleanString(c.name || 'City'),
    centerLat: clampNum(c.centerLat, -90, 90, 0),
    centerLng: clampNum(c.centerLng, -180, 180, 0),
    mapW: clampNum(c.mapW, 100, 100000, 2000),
    mapH: clampNum(c.mapH, 100, 100000, 1400),
    mapBackend: cleanEnum(c.mapBackend, CITY_BACKENDS, 'image'),
    imageUrl: cleanUrl(c.imageUrl),
    notes: cleanString(c.notes, MAX_PROP_STRING),
  }));
  const cityIds = new Set(cities.map(c => c.id));

  const endpoints = cleanArray(obj.endpoints).map(ep => ({
    id: cleanId(ep.id),
    type: cleanEnum(ep.type, ENDPOINT_TYPES, 'building'),
    label: cleanString(ep.label || 'Endpoint'),
    x: clampNum(ep.x, -100000, 100000),
    y: clampNum(ep.y, -100000, 100000),
    lat: ep.lat == null ? null : clampNum(ep.lat, -90, 90, null),
    lng: ep.lng == null ? null : clampNum(ep.lng, -180, 180, null),
    cityId: cleanString(ep.cityId, 96),
    siteId: cleanString(ep.siteId, 96),
    props: cleanProps(ep.props),
  }));
  const endpointIds = new Set(endpoints.map(ep => ep.id));

  const cityLinks = cleanArray(obj.cityLinks).map(cl => ({
    id: cleanId(cl.id),
    fromEpId: cleanString(cl.fromEpId, 96),
    toEpId: cleanString(cl.toEpId, 96),
    type: cleanEnum(cl.type, CITY_LINK_TYPES, 'fiber_buried'),
    label: cleanString(cl.label),
    length: cleanString(cl.length),
  })).filter(cl => endpointIds.has(cl.fromEpId) && endpointIds.has(cl.toEpId));

  const spaceAssets = cleanArray(obj.spaceAssets).map(a => ({
    id: cleanId(a.id),
    type: cleanEnum(a.type, SPACE_ASSET_TYPES, 'satellite_leo'),
    label: cleanString(a.label || 'Orbit Asset'),
    angle: clampNum(a.angle, -Math.PI * 20, Math.PI * 20, 0),
    orbit: cleanEnum(a.orbit || SPACE_ASSET_TYPES[cleanEnum(a.type, SPACE_ASSET_TYPES, 'satellite_leo')].orbit, ORBIT_ALTITUDES, 'leo'),
    props: cleanProps(a.props),
  }));
  const spaceAssetIds = new Set(spaceAssets.map(a => a.id));

  const spaceLinks = cleanArray(obj.spaceLinks).map(sl => ({
    id: cleanId(sl.id),
    fromAssetId: cleanString(sl.fromAssetId, 96),
    toAssetId: cleanString(sl.toAssetId, 96),
    type: cleanEnum(sl.type, SPACE_LINK_TYPES, 'laser_isl'),
    label: cleanString(sl.label),
  })).filter(sl => spaceAssetIds.has(sl.fromAssetId) && spaceAssetIds.has(sl.toAssetId));

  // === New: planet-level global infrastructure ===
  const planetInfraTbl = (typeof PLANET_INFRA_TYPES !== 'undefined') ? PLANET_INFRA_TYPES : {};
  const planetInfra = cleanArray(obj.planetInfra).map(pi => ({
    id: cleanId(pi.id),
    type: planetInfraTbl[pi.type] ? pi.type : Object.keys(planetInfraTbl)[0] || 'global_dc',
    label: cleanString(pi.label || 'Infrastructure'),
    lat: clampNum(pi.lat, -90, 90, 0),
    lng: clampNum(pi.lng, -180, 180, 0),
    props: cleanProps(pi.props),
  })).filter(pi => planetInfraTbl[pi.type]);

  // === New: deep-space placeable units + links ===
  const dsUnitTbl = (typeof DEEP_SPACE_UNIT_TYPES !== 'undefined') ? DEEP_SPACE_UNIT_TYPES : {};
  const dsLinkTbl = (typeof DEEP_SPACE_LINK_TYPES !== 'undefined') ? DEEP_SPACE_LINK_TYPES : {};
  const dsAnchorIds = (typeof DS_TARGETS !== 'undefined') ? Object.keys(DS_TARGETS) : [];
  const deepSpaceUnits = cleanArray(obj.deepSpaceUnits).map(u => ({
    id: cleanId(u.id),
    type: dsUnitTbl[u.type] ? u.type : Object.keys(dsUnitTbl)[0] || 'ds_relay',
    label: cleanString(u.label || 'Unit'),
    x: clampNum(u.x, -10000, 10000),
    y: clampNum(u.y, -10000, 10000),
    // Optional anchor: planet/spacecraft id from DS_TARGETS, plus offsets.
    anchor: (u.anchor && dsAnchorIds.includes(u.anchor)) ? u.anchor : null,
    anchorOffX: clampNum(u.anchorOffX, -1000, 1000, 0),
    anchorOffY: clampNum(u.anchorOffY, -1000, 1000, 0),
    props: cleanProps(u.props),
  })).filter(u => dsUnitTbl[u.type]);
  const dsUnitIds = new Set(deepSpaceUnits.map(u => u.id));
  // Deep-space links can also be cross-domain handoffs to an orbit
  // ground station (or any orbit asset). Both endpoints just need to
  // resolve to a known DS unit OR a known orbit asset.
  const deepSpaceLinks = cleanArray(obj.deepSpaceLinks).map(l => ({
    id: cleanId(l.id),
    fromId: cleanString(l.fromId, 96),
    toId: cleanString(l.toId, 96),
    type: dsLinkTbl[l.type] ? l.type : Object.keys(dsLinkTbl)[0] || 'ds_laser',
    label: cleanString(l.label),
  })).filter(l =>
    (dsUnitIds.has(l.fromId) || spaceAssetIds.has(l.fromId)) &&
    (dsUnitIds.has(l.toId)   || spaceAssetIds.has(l.toId))
  );

  // Progression — be lenient: any malformed value falls back to defaults.
  const progIn = obj.progression && typeof obj.progression === 'object' ? obj.progression : null;
  const sections = ['local','city','planet','orbit','deepspace'];
  function progBoolMap(src, defaultTrueIdx) {
    const out = {};
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const v = src && typeof src === 'object' ? src[s] : undefined;
      out[s] = typeof v === 'boolean' ? v : (i === defaultTrueIdx ? true : false);
    }
    return out;
  }
  const progression = progIn ? {
    walkthroughDone: !!progIn.walkthroughDone,
    walkthroughStep: clampNum(progIn.walkthroughStep, 0, 50, 0),
    completed: progBoolMap(progIn.completed, -1),
    unlocked:  progBoolMap(progIn.unlocked,   0),
  } : null;

  return {
    devices, links, zones, sites, siteLinks, cities, endpoints, cityLinks, spaceAssets, spaceLinks,
    planetInfra, deepSpaceUnits, deepSpaceLinks, progression,
    activeSiteId: siteIds.has(obj.activeSiteId) ? obj.activeSiteId : null,
    activeCityId: cityIds.has(obj.activeCityId) ? obj.activeCityId : null,
    viewMode: ['local', 'world', 'city', 'space', 'deepspace'].includes(obj.viewMode) ? obj.viewMode : 'local',
    view: cleanView(obj.view),
    worldView: cleanView(obj.worldView),
    cityView: cleanView(obj.cityView),
    spaceView: cleanView(obj.spaceView),
    deepView:  cleanView(obj.deepView),
    comms: cleanComms(obj.comms),
  };
}

// Deep Space Link Budget Studio state — sanitized so a hand-edited JSON file
// can't push absurd values into the sliders. Mirrors the bounds the UI
// enforces on the studio inputs.
function cleanComms(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const validSources = (typeof DS_SOURCES === 'object' && DS_SOURCES) ? DS_SOURCES : null;
  const validTargets = (typeof DS_TARGETS === 'object' && DS_TARGETS) ? DS_TARGETS : null;
  const validModFec  = (typeof DS_MODFEC  === 'object' && DS_MODFEC)  ? DS_MODFEC  : null;
  return {
    sourceId:        validSources ? cleanEnum(c.sourceId, validSources, 'dsn70')        : cleanString(c.sourceId, 64),
    targetId:        validTargets ? cleanEnum(c.targetId, validTargets, 'mars')         : cleanString(c.targetId, 64),
    customTargetKm:  clampNum(c.customTargetKm, 1000, 1e15, 225e6),
    txPowerW:        clampNum(c.txPowerW, 0.001, 1e8, 20000),
    txGainDbi:       clampNum(c.txGainDbi, 0, 120, 47),
    rxGainDbi:       clampNum(c.rxGainDbi, 0, 120, 73),
    freqGHz:         clampNum(c.freqGHz, 0.01, 1000, 8.4),
    dataBps:         clampNum(c.dataBps, 1, 1e12, 6_000_000),
    noiseTempK:      clampNum(c.noiseTempK, 1, 5000, 21),
    modFec:          validModFec  ? cleanEnum(c.modFec, validModFec, 'qpsk_12_ldpc')    : cleanString(c.modFec, 64),
    atmLossDb:       clampNum(c.atmLossDb, 0, 100, 0.3),
    pointingLossDb:  clampNum(c.pointingLossDb, 0, 100, 0.5),
  };
}

function sanitizeAiAction(action) {
  if (!action || typeof action !== 'object') return null;
  return sanitizeDiagram({
    app: 'GreyNet',
    devices: action.type === 'addDevice' ? [{ type: action.deviceType, label: action.label, x: action.x, y: action.y, props: action.props, siteId: action.siteId }] : [],
    zones: action.type === 'addZone' ? [{ type: action.zoneType, x: action.x, y: action.y, w: action.w, h: action.h, label: action.label, siteId: action.siteId }] : [],
    sites: action.type === 'addSite' ? [{ type: action.siteType, name: action.name, lat: action.lat, lng: action.lng, address: action.address, notes: action.notes }] : [],
    endpoints: action.type === 'addEndpoint' ? [{ type: action.endpointType, label: action.label, x: action.x, y: action.y, lat: action.lat, lng: action.lng, props: action.props, cityId: action.cityId }] : [],
    spaceAssets: action.type === 'addSpaceAsset' ? [{ type: action.assetType, label: action.label, angle: action.angle, props: action.props }] : [],
  });
}

function loadFromJson(obj) {
  if (!obj || (obj.app !== 'GreyNet' && obj.app !== 'gREYnET')) throw new Error('Not a GreyNet diagram');
  // Bring old schema versions up to current BEFORE sanitizing, so newly-added
  // fields aren't silently dropped on import of an old save.
  if (typeof migrateDiagram === 'function') {
    try { obj = migrateDiagram(obj); }
    catch (e) { throw new Error('Migration failed: ' + (e.message || e)); }
  }
  obj = sanitizeDiagram(obj);
  pushHistory();
  state.devices = obj.devices || [];
  state.links = obj.links || [];
  state.zones = obj.zones || [];
  state.sites = obj.sites || [];
  state.siteLinks = obj.siteLinks || [];
  state.cities = obj.cities || [];
  state.endpoints = obj.endpoints || [];
  state.cityLinks = obj.cityLinks || [];
  state.spaceAssets = obj.spaceAssets || [];
  state.spaceLinks = obj.spaceLinks || [];
  state.planetInfra = obj.planetInfra || [];
  state.deepSpaceUnits = obj.deepSpaceUnits || [];
  state.deepSpaceLinks = obj.deepSpaceLinks || [];
  if (obj.progression) state.progression = obj.progression;
  state.activeSiteId = obj.activeSiteId || null;
  state.activeCityId = obj.activeCityId || null;
  if (obj.view)      state.view      = obj.view;
  if (obj.worldView) state.worldView = obj.worldView;
  if (obj.cityView)  state.cityView  = obj.cityView;
  if (obj.spaceView) state.spaceView = obj.spaceView;
  if (obj.deepView)  state.deepView  = obj.deepView;
  if (obj.viewMode)  state.viewMode  = obj.viewMode;
  if (obj.comms)     state.comms     = obj.comms;
  ensureDefaultSite();
  ensureDefaultCity(state.viewMode === 'city');
  state.selectedIds.clear();
  document.body.classList.toggle('world-mode',     state.viewMode === 'world');
  document.body.classList.toggle('city-mode',      state.viewMode === 'city');
  document.body.classList.toggle('space-mode',     state.viewMode === 'space');
  document.body.classList.toggle('deepspace-mode', state.viewMode === 'deepspace');
  dom.svg.classList.toggle('world-mode',     state.viewMode === 'world');
  dom.svg.classList.toggle('city-mode',      state.viewMode === 'city');
  dom.svg.classList.toggle('space-mode',     state.viewMode === 'space');
  dom.svg.classList.toggle('deepspace-mode', state.viewMode === 'deepspace');
  syncTileMap();
  updateWorldTransform();
  renderAll();
}

function ensureDefaultCity(force = false) {
  // Ensure endpoints' cityIds point to valid cities
  if (state.cities.length === 0 && (force || state.endpoints.length > 0)) {
    state.cities.push({
      id: uid(), name: 'Default City',
      centerLat: 40.71, centerLng: -74.00, mapW: 2000, mapH: 1400,
      mapBackend: 'osm', imageUrl: '', notes: '',
    });
  }
  const validCityIds = new Set(state.cities.map(c => c.id));
  const defaultCityId = state.cities[0] ? state.cities[0].id : null;
  for (const ep of state.endpoints) {
    if (!validCityIds.has(ep.cityId)) ep.cityId = defaultCityId;
  }
  state.cityLinks = state.cityLinks.filter(cl =>
    endpointById(cl.fromEpId) && endpointById(cl.toEpId));
  if (state.activeCityId && !validCityIds.has(state.activeCityId)) {
    state.activeCityId = defaultCityId;
  } else if (!state.activeCityId && defaultCityId) {
    state.activeCityId = defaultCityId;
  }
}

// Ensure at least one site exists and all devices/zones have a valid siteId
function ensureDefaultSite() {
  if (state.sites.length === 0) {
    state.sites.push({
      id: uid(), type: 'office', name: 'HQ',
      lat: 40.71, lng: -74.00, address: '', notes: '', color: SITE_TYPES.office.color,
    });
  }
  const defaultId = state.sites[0].id;
  const validSiteIds = new Set(state.sites.map(s => s.id));
  // Reassign any device/zone whose siteId is missing OR points to a deleted site
  for (const d of state.devices) {
    if (!d.siteId || !validSiteIds.has(d.siteId)) d.siteId = defaultId;
  }
  for (const z of state.zones) {
    if (!z.siteId || !validSiteIds.has(z.siteId)) z.siteId = defaultId;
  }
  // Drop site-links that reference dead sites
  state.siteLinks = state.siteLinks.filter(sl =>
    validSiteIds.has(sl.fromSiteId) && validSiteIds.has(sl.toSiteId));
  // Active site must be valid
  if (!state.activeSiteId || !validSiteIds.has(state.activeSiteId)) state.activeSiteId = defaultId;
}

function saveJSON() {
  const data = JSON.stringify(diagramToJson(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  downloadBlob(blob, `network-${Date.now()}.json`);
}

function openJSON() { dom.fileInput.click(); }

// Cap the file we'll read in. A GreyNet diagram with 2000 items × MAX_STRING
// each tops out well under 8 MB — anything larger is either a different
// format or someone trying to wedge the renderer with a multi-GB blob.
const MAX_JSON_BYTES = 8 * 1024 * 1024;

dom.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  // Always clear the input synchronously so re-selecting the same file works.
  e.target.value = '';
  if (!file) return;
  const t = (msg, variant = 'error') => {
    if (typeof toast === 'function') toast(msg, { variant, ttlMs: 7000 });
    else alert(msg);
  };
  if (file.size > MAX_JSON_BYTES) {
    t(`That JSON is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the ${(MAX_JSON_BYTES / 1024 / 1024).toFixed(0)} MB import limit.`);
    return;
  }
  if (file.size === 0) {
    t('That file is empty.', 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (err) {
      t('Failed to parse JSON: ' + (err.message || 'invalid syntax'));
      return;
    }
    try {
      loadFromJson(parsed);
      t('Diagram loaded.', 'success');
    }
    catch (err) {
      t('Failed to load: ' + (err.message || String(err)));
    }
  };
  reader.onerror = () => t('Failed to read the file.');
  reader.readAsText(file);
});

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

function exportSVG() {
  const bbox = computeBBox();
  if (!bbox) return alert('Nothing to export.');
  const pad = 40;
  const w = bbox.maxX - bbox.minX + pad * 2;
  const h = bbox.maxY - bbox.minY + pad * 2;

  // Build a standalone SVG. We inline computed colors (no CSS vars) for portability.
  const colors = {
    '--bg-0': '#0e1116', '--bg-1': '#161b22', '--text': '#d6dde6',
    '--text-dim': '#8a95a4', '--text-faint': '#5a6471',
    '--border-2': '#3a4452', '--select': '#ffd24a',
    '--link-eth': '#8a95a4', '--link-fiber': '#ff8c42',
    '--link-wifi': '#5fb3ff', '--link-vpn': '#b388eb', '--link-trunk': '#6fcf97',
  };
  const iconDefs = document.querySelector('svg defs').parentElement.innerHTML.match(/<defs>[\s\S]*?<\/defs>/)[0];

  let body = '';
  // zones
  for (const z of state.zones) {
    const d = ZONE_TYPES[z.type];
    body += `<rect x="${z.x - bbox.minX + pad}" y="${z.y - bbox.minY + pad}" width="${z.w}" height="${z.h}" rx="6"
      fill="${cssVarToHex(d.fill)}" stroke="${d.stroke}" stroke-width="2" stroke-dasharray="8 5"/>`;
    body += `<text x="${z.x - bbox.minX + pad + 14}" y="${z.y - bbox.minY + pad + 24}"
      fill="${d.labelColor}" font-size="13" font-weight="700"
      font-family="-apple-system,sans-serif" letter-spacing="1">${escapeHtml((z.label || d.label).toUpperCase())}</text>`;
  }
  // links
  for (const link of state.links) {
    const a = deviceById(link.fromId), b = deviceById(link.toId);
    if (!a || !b) continue;
    const def = LINK_TYPES[link.type];
    const dx = b.x-a.x, dy = b.y-a.y, dist = Math.hypot(dx,dy) || 1;
    const ux = dx/dist, uy = dy/dist;
    const x1 = a.x + ux*28 - bbox.minX + pad, y1 = a.y + uy*28 - bbox.minY + pad;
    const x2 = b.x - ux*28 - bbox.minX + pad, y2 = b.y - uy*28 - bbox.minY + pad;
    const dashAttr = def.dash ? ` stroke-dasharray="${def.dash}"` : '';
    body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${colors[def.color.match(/--[a-z\-]+/)[0]] || '#888'}" stroke-width="${def.width}" stroke-linecap="round"${dashAttr}/>`;
    if (link.type === 'trunk') {
      const ox = -uy*2.5, oy = ux*2.5;
      body += `<line x1="${x1+ox}" y1="${y1+oy}" x2="${x2+ox}" y2="${y2+oy}"
        stroke="${colors[def.color.match(/--[a-z\-]+/)[0]] || '#888'}" stroke-width="1.5" stroke-linecap="round"/>`;
    }
    if (link.label) {
      body += `<text x="${(x1+x2)/2}" y="${(y1+y2)/2 - 6}" fill="${colors['--text-dim']}"
        font-size="10" text-anchor="middle" font-family="-apple-system,sans-serif">${escapeHtml(link.label)}</text>`;
    }
  }
  // devices
  for (const d of state.devices) {
    const def = DEVICE_TYPES[d.type];
    const cx = d.x - bbox.minX + pad;
    const cy = d.y - bbox.minY + pad;
    body += `<g transform="translate(${cx} ${cy})">`;
    body += `<circle cx="0" cy="0" r="28" fill="${colors['--bg-1']}" stroke="${colors['--border-2']}" stroke-width="1.5"/>`;
    body += `<use href="#${def.icon}" x="-22" y="-22" width="44" height="44" color="${colors['--text']}"/>`;
    body += `<text x="0" y="48" fill="${colors['--text']}" font-size="11" font-weight="500"
      text-anchor="middle" font-family="-apple-system,sans-serif">${escapeHtml(d.label || def.label)}</text>`;
    if (d.props && d.props.ip) {
      body += `<text x="0" y="61" fill="${colors['--text-dim']}" font-size="9.5"
        text-anchor="middle" font-family="Menlo,monospace">${escapeHtml(d.props.ip + (d.props.cidr ? '/' + d.props.cidr : ''))}</text>`;
    }
    body += `</g>`;
  }

  const svgText =
`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="${colors['--bg-0']}"/>
  ${iconDefs}
  ${body}
</svg>`;

  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  downloadBlob(blob, `network-${Date.now()}.svg`);
}

function cssVarToHex(s) {
  // already rgba — leave as-is; SVG accepts rgba
  return s.replace('var(--z-internet)', '#ff6b6b').replace('var(--z-dmz)', '#f5c84c')
          .replace('var(--z-internal)', '#6fcf97').replace('var(--z-mgmt)', '#5fb3ff')
          .replace('var(--z-guest)', '#b388eb');
}

function exportPNG() {
  // strategy: build the same SVG string used by exportSVG(), then rasterize
  const bbox = computeBBox();
  if (!bbox) return alert('Nothing to export.');
  // Generate SVG (reuses exportSVG logic but inlines into image)
  const svgEl = buildExportSvgElement();
  if (!svgEl) return;
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const w = parseInt(svgEl.getAttribute('width'), 10);
  const h = parseInt(svgEl.getAttribute('height'), 10);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => {
      downloadBlob(b, `network-${Date.now()}.png`);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG export failed.');
  };
  img.src = url;
}

function buildExportSvgElement() {
  // Same as exportSVG but returns an SVG element instead of writing a file
  const bbox = computeBBox();
  if (!bbox) return null;
  const pad = 40;
  const w = bbox.maxX - bbox.minX + pad * 2;
  const h = bbox.maxY - bbox.minY + pad * 2;
  const colors = {
    '--bg-0': '#0e1116', '--bg-1': '#161b22', '--text': '#d6dde6',
    '--text-dim': '#8a95a4', '--border-2': '#3a4452',
    '--link-eth': '#8a95a4', '--link-fiber': '#ff8c42',
    '--link-wifi': '#5fb3ff', '--link-vpn': '#b388eb', '--link-trunk': '#6fcf97',
  };
  const defsHTML = document.querySelector('svg defs').parentElement.innerHTML.match(/<defs>[\s\S]*?<\/defs>/)[0];

  let body = `<rect width="100%" height="100%" fill="${colors['--bg-0']}"/>${defsHTML}`;
  for (const z of state.zones) {
    const d = ZONE_TYPES[z.type];
    body += `<rect x="${z.x - bbox.minX + pad}" y="${z.y - bbox.minY + pad}" width="${z.w}" height="${z.h}" rx="6"
      fill="${cssVarToHex(d.fill)}" stroke="${d.stroke}" stroke-width="2" stroke-dasharray="8 5"/>`;
    body += `<text x="${z.x - bbox.minX + pad + 14}" y="${z.y - bbox.minY + pad + 24}"
      fill="${d.labelColor}" font-size="13" font-weight="700"
      font-family="Arial,sans-serif" letter-spacing="1">${escapeHtml((z.label || d.label).toUpperCase())}</text>`;
  }
  for (const link of state.links) {
    const a = deviceById(link.fromId), b = deviceById(link.toId);
    if (!a || !b) continue;
    const def = LINK_TYPES[link.type];
    const dx = b.x-a.x, dy = b.y-a.y, dist = Math.hypot(dx,dy) || 1;
    const ux = dx/dist, uy = dy/dist;
    const x1 = a.x + ux*28 - bbox.minX + pad, y1 = a.y + uy*28 - bbox.minY + pad;
    const x2 = b.x - ux*28 - bbox.minX + pad, y2 = b.y - uy*28 - bbox.minY + pad;
    const color = colors[def.color.match(/--[a-z\-]+/)[0]] || '#888';
    const dashAttr = def.dash ? ` stroke-dasharray="${def.dash}"` : '';
    body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${color}" stroke-width="${def.width}" stroke-linecap="round"${dashAttr}/>`;
    if (link.type === 'trunk') {
      const ox = -uy*2.5, oy = ux*2.5;
      body += `<line x1="${x1+ox}" y1="${y1+oy}" x2="${x2+ox}" y2="${y2+oy}"
        stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
    }
    if (link.label) {
      body += `<text x="${(x1+x2)/2}" y="${(y1+y2)/2 - 6}" fill="${colors['--text-dim']}"
        font-size="10" text-anchor="middle" font-family="Arial,sans-serif">${escapeHtml(link.label)}</text>`;
    }
  }
  for (const d of state.devices) {
    const def = DEVICE_TYPES[d.type];
    const cx = d.x - bbox.minX + pad;
    const cy = d.y - bbox.minY + pad;
    body += `<g transform="translate(${cx} ${cy})">`;
    body += `<circle cx="0" cy="0" r="28" fill="${colors['--bg-1']}" stroke="${colors['--border-2']}" stroke-width="1.5"/>`;
    body += `<use href="#${def.icon}" x="-22" y="-22" width="44" height="44" color="${colors['--text']}"/>`;
    body += `<text x="0" y="48" fill="${colors['--text']}" font-size="11" font-weight="500"
      text-anchor="middle" font-family="Arial,sans-serif">${escapeHtml(d.label || def.label)}</text>`;
    if (d.props && d.props.ip) {
      body += `<text x="0" y="61" fill="${colors['--text-dim']}" font-size="9.5"
        text-anchor="middle" font-family="Menlo,monospace">${escapeHtml(d.props.ip + (d.props.cidr ? '/' + d.props.cidr : ''))}</text>`;
    }
    body += `</g>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
    'image/svg+xml'
  );
  return doc.documentElement;
}

function computeBBox() {
  if (state.devices.length === 0 && state.zones.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of state.devices) {
    minX = Math.min(minX, d.x - 30); minY = Math.min(minY, d.y - 30);
    maxX = Math.max(maxX, d.x + 30); maxY = Math.max(maxY, d.y + 65);
  }
  for (const z of state.zones) {
    minX = Math.min(minX, z.x);     minY = Math.min(minY, z.y);
    maxX = Math.max(maxX, z.x+z.w); maxY = Math.max(maxY, z.y+z.h);
  }
  return { minX, minY, maxX, maxY };
}

function newDiagram() {
  if (state.devices.length || state.zones.length) {
    if (!confirm('Discard current diagram?')) return;
  }
  pushHistory();
  state.devices = []; state.links = []; state.zones = [];
  state.selectedIds.clear();
  resetView();
  renderAll();
}

/* =========================================================================
   CONNECT EVERYTHING ENGINE
   ========================================================================= */
function connectEverything() {
  pushHistory();
  const result = {
    local: connectLocalDevices(),
    planet: connectPlanetSites(),
    city: connectCityEndpoints(),
    space: connectSpaceAssets(),
  };
  const total = result.local + result.planet + result.city + result.space;
  if (total > 0) {
    renderAll();
    autosave();
  } else {
    history.past.pop();
  }
  alert(total
    ? `Auto-connect added ${total} connection${total === 1 ? '' : 's'}:\n` +
      `Local: ${result.local}\nPlanet: ${result.planet}\nCity: ${result.city}\nOrbit: ${result.space}`
    : 'Auto-connect did not find any missing likely connections.');
}

function pairKey(a, b) {
  return [a, b].sort().join('::');
}

function dist2(a, b) {
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  return dx * dx + dy * dy;
}

function latLngDist2(a, b) {
  const dx = Number(a.lng || a.centerLng || 0) - Number(b.lng || b.centerLng || 0);
  const dy = Number(a.lat || a.centerLat || 0) - Number(b.lat || b.centerLat || 0);
  return dx * dx + dy * dy;
}

function nearest(item, candidates, distanceFn = dist2) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    if (!c || c.id === item.id) continue;
    const d = distanceFn(item, c);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function addUniqueLocalLink(existing, fromId, toId, type = 'ethernet', label = '') {
  if (!fromId || !toId || fromId === toId) return 0;
  const key = pairKey(fromId, toId);
  if (existing.has(key)) return 0;
  state.links.push({ id: uid(), fromId, toId, type, label });
  existing.add(key);
  return 1;
}

function addUniqueSiteLink(existing, fromSiteId, toSiteId, type = 'wan', label = '') {
  if (!fromSiteId || !toSiteId || fromSiteId === toSiteId) return 0;
  const key = pairKey(fromSiteId, toSiteId);
  if (existing.has(key)) return 0;
  state.siteLinks.push({ id: uid(), fromSiteId, toSiteId, type, label, bandwidth: '', sla: '' });
  existing.add(key);
  return 1;
}

function addUniqueCityLink(existing, fromEpId, toEpId, type = 'fiber_buried', label = '') {
  if (!fromEpId || !toEpId || fromEpId === toEpId) return 0;
  const key = pairKey(fromEpId, toEpId);
  if (existing.has(key)) return 0;
  state.cityLinks.push({ id: uid(), fromEpId, toEpId, type, label, length: '' });
  existing.add(key);
  return 1;
}

function addUniqueSpaceLink(existing, fromAssetId, toAssetId, type = 'laser_isl', label = '') {
  if (!fromAssetId || !toAssetId || fromAssetId === toAssetId) return 0;
  const key = pairKey(fromAssetId, toAssetId);
  if (existing.has(key)) return 0;
  state.spaceLinks.push({ id: uid(), fromAssetId, toAssetId, type, label });
  existing.add(key);
  return 1;
}

function connectLocalDevices() {
  let added = 0;
  const existing = new Set(state.links.map(l => pairKey(l.fromId, l.toId)));
  const siteIds = new Set(state.sites.map(s => s.id));
  for (const siteId of siteIds) {
    const ds = state.devices.filter(d => d.siteId === siteId);
    if (ds.length < 2) continue;
    const byType = (types) => ds.filter(d => types.includes(d.type));
    const internet = byType(['internet']);
    const cloud = byType(['cloud']);
    const firewalls = byType(['firewall']);
    const routers = byType(['router', 'vpn']);
    const cores = byType(['l3switch', 'router']);
    const switches = byType(['switch', 'l3switch']);
    const access = switches.length ? switches : cores.length ? cores : byType(['firewall', 'router']);
    const security = byType(['firewall', 'waf', 'ids', 'proxy', 'vpn']);
    const servers = byType(['server', 'database', 'storage', 'loadbalancer']);
    const clients = byType(['workstation', 'laptop', 'mobile', 'tablet', 'phone', 'printer', 'iot', 'camera', 'wap']);

    for (const inet of internet) {
      const target = nearest(inet, firewalls) || nearest(inet, routers) || nearest(inet, cores) || nearest(inet, ds.filter(d => d.id !== inet.id));
      added += addUniqueLocalLink(existing, inet.id, target?.id, 'fiber', 'auto edge');
    }
    for (const fw of firewalls) {
      const edge = nearest(fw, routers) || nearest(fw, internet);
      const core = nearest(fw, cores.filter(d => d.id !== fw.id)) || nearest(fw, switches.filter(d => d.id !== fw.id));
      if (edge && edge.type !== 'internet') added += addUniqueLocalLink(existing, edge.id, fw.id, 'ethernet', 'auto edge');
      added += addUniqueLocalLink(existing, fw.id, core?.id, 'trunk', 'auto core');
    }
    for (const r of routers) {
      const core = nearest(r, cores.filter(d => d.id !== r.id)) || nearest(r, switches.filter(d => d.id !== r.id));
      added += addUniqueLocalLink(existing, r.id, core?.id, 'trunk', 'auto core');
    }
    for (const sw of switches.filter(d => d.type === 'switch')) {
      const core = nearest(sw, cores.filter(d => d.id !== sw.id));
      added += addUniqueLocalLink(existing, core?.id, sw.id, 'trunk', 'auto access');
    }
    for (const c of cloud) {
      const target = nearest(c, security) || nearest(c, routers) || nearest(c, cores);
      added += addUniqueLocalLink(existing, c.id, target?.id, 'vpn', 'auto cloud');
    }
    for (const s of servers) {
      const zone = deviceZone(s);
      const preferred = zone?.type === 'dmz'
        ? (nearest(s, byType(['loadbalancer', 'waf']).filter(d => d.id !== s.id)) || nearest(s, firewalls) || nearest(s, access))
        : (nearest(s, access) || nearest(s, firewalls));
      const type = ['database', 'storage'].includes(s.type) ? 'fiber' : 'ethernet';
      added += addUniqueLocalLink(existing, preferred?.id, s.id, type, 'auto service');
    }
    for (const sec of security.filter(d => d.type !== 'firewall')) {
      const target = nearest(sec, firewalls) || nearest(sec, cores) || nearest(sec, access);
      added += addUniqueLocalLink(existing, target?.id, sec.id, sec.type === 'vpn' ? 'vpn' : 'ethernet', 'auto security');
    }
    for (const c of clients) {
      const target = c.type === 'mobile' || c.type === 'tablet'
        ? (nearest(c, byType(['wap'])) || nearest(c, access))
        : nearest(c, access);
      const type = ['mobile', 'tablet'].includes(c.type) ? 'wireless' : 'ethernet';
      added += addUniqueLocalLink(existing, target?.id, c.id, type, 'auto access');
    }
  }
  return added;
}

function connectPlanetSites() {
  if (state.sites.length < 2) return 0;
  let added = 0;
  const existing = new Set(state.siteLinks.map(l => pairKey(l.fromSiteId, l.toSiteId)));
  const priority = { datacenter: 0, cloudregion: 1, noc: 2, soc: 3, office: 4, branch: 5 };
  const sorted = [...state.sites].sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
  const connected = [sorted[0]];
  for (const site of sorted.slice(1)) {
    const target = nearest(site, connected, latLngDist2);
    const type = site.type === 'cloudregion' || target?.type === 'cloudregion' ? 'vpn'
      : site.type === 'datacenter' || target?.type === 'datacenter' ? 'mpls'
      : site.type === 'branch' ? 'sdwan'
      : 'wan';
    added += addUniqueSiteLink(existing, target?.id, site.id, type, 'auto');
    connected.push(site);
  }
  return added;
}

function connectCityEndpoints() {
  let added = 0;
  const existing = new Set(state.cityLinks.map(l => pairKey(l.fromEpId, l.toEpId)));
  for (const city of state.cities) {
    const eps = state.endpoints.filter(ep => ep.cityId === city.id);
    if (eps.length < 2) continue;
    const hubs = eps.filter(ep => ['cabinet', 'fiberjunction', 'building'].includes(ep.type));
    const cabinets = eps.filter(ep => ep.type === 'cabinet');
    const fiber = eps.filter(ep => ep.type === 'fiberjunction');
    for (const ep of eps) {
      if (ep.type === 'fiberjunction') continue;
      let target;
      if (ep.type === 'cabinet') target = nearest(ep, fiber) || nearest(ep, eps.filter(x => x.id !== ep.id), latLngDist2);
      else target = nearest(ep, cabinets) || nearest(ep, hubs) || nearest(ep, eps.filter(x => x.id !== ep.id), latLngDist2);
      const type = ep.type === 'vehiclesensor' || ep.type === 'streetlight' ? 'copper'
        : ep.type === 'trafficcam' ? 'fiber_aerial'
        : ep.type === 'messagesign' ? 'cellular'
        : 'fiber_buried';
      added += addUniqueCityLink(existing, target?.id, ep.id, type, 'auto');
    }
  }
  return added;
}

function connectSpaceAssets() {
  if (state.spaceAssets.length < 2) return 0;
  let added = 0;
  const existing = new Set(state.spaceLinks.map(l => pairKey(l.fromAssetId, l.toAssetId)));
  const grounds = state.spaceAssets.filter(a => a.type === 'ground_station');
  const sats = state.spaceAssets.filter(a => a.type !== 'ground_station');
  for (const g of grounds) {
    const near = nearest(g, sats, (a, b) => dist2(spaceAssetPosition(a), spaceAssetPosition(b)));
    added += addUniqueSpaceLink(existing, g.id, near?.id, 'uplink', 'auto uplink');
  }
  const byOrbit = {};
  for (const a of sats) (byOrbit[a.orbit || SPACE_ASSET_TYPES[a.type]?.orbit || 'leo'] ||= []).push(a);
  for (const assets of Object.values(byOrbit)) {
    if (assets.length < 2) continue;
    assets.sort((a, b) => (a.angle || 0) - (b.angle || 0));
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i], b = assets[(i + 1) % assets.length];
      const type = a.orbit === 'geo' || b.orbit === 'geo' ? 'rf_isl' : 'laser_isl';
      added += addUniqueSpaceLink(existing, a.id, b.id, type, 'auto ISL');
    }
  }
  for (const relay of state.spaceAssets.filter(a => ['relay', 'satellite_geo'].includes(a.type))) {
    const ground = nearest(relay, grounds, (a, b) => dist2(spaceAssetPosition(a), spaceAssetPosition(b)));
    added += addUniqueSpaceLink(existing, relay.id, ground?.id, 'feeder', 'auto feeder');
  }
  return added;
}

// Autosave to localStorage. Anything we put in localStorage must be treated
// as untrusted on read — another script (extension, dev tools, malicious
// browser session) could have rewritten it. Every restore goes through the
// same sanitizeDiagram() the file-open path uses.
const AUTOSAVE_MAX_BYTES = 8 * 1024 * 1024;     // 8 MB hard ceiling
function autosave() {
  try {
    const payload = JSON.stringify(diagramToJson());
    if (payload.length > AUTOSAVE_MAX_BYTES) return;  // too big — skip
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (e) { /* quota / serialization failures: leave previous autosave intact */ }
}
function tryRestoreAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    if (raw.length > AUTOSAVE_MAX_BYTES) {        // someone stuffed the slot
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    let obj;
    try { obj = JSON.parse(raw); }
    catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (obj.app !== 'GreyNet' && obj.app !== 'gREYnET') return false;
    if (typeof migrateDiagram === 'function') {
      try { obj = migrateDiagram(obj); }
      catch (_) { /* fall through; sanitizer is still defensive */ }
    }
    obj = sanitizeDiagram(obj);
    const hasAnyContent =
      (obj.devices && obj.devices.length) ||
      (obj.zones && obj.zones.length) ||
      (obj.sites && obj.sites.length) ||
      (obj.cities && obj.cities.length) ||
      (obj.spaceAssets && obj.spaceAssets.length) ||
      (obj.planetInfra && obj.planetInfra.length) ||
      (obj.deepSpaceUnits && obj.deepSpaceUnits.length) ||
      (obj.progression && obj.progression.walkthroughDone);
    if (!hasAnyContent) return false;

    state.devices     = obj.devices     || [];
    state.links       = obj.links       || [];
    state.zones       = obj.zones       || [];
    state.sites       = obj.sites       || [];
    state.siteLinks   = obj.siteLinks   || [];
    state.cities      = obj.cities      || [];
    state.endpoints   = obj.endpoints   || [];
    state.cityLinks   = obj.cityLinks   || [];
    state.spaceAssets = obj.spaceAssets || [];
    state.spaceLinks  = obj.spaceLinks  || [];
    state.planetInfra = obj.planetInfra || [];
    state.deepSpaceUnits = obj.deepSpaceUnits || [];
    state.deepSpaceLinks = obj.deepSpaceLinks || [];
    if (obj.progression) state.progression = obj.progression;
    state.activeSiteId = cleanString(obj.activeSiteId, 96) || null;
    state.activeCityId = cleanString(obj.activeCityId, 96) || null;
    const v  = cleanView(obj.view);      if (v)  state.view      = v;
    const wv = cleanView(obj.worldView); if (wv) state.worldView = wv;
    const cv = cleanView(obj.cityView);  if (cv) state.cityView  = cv;
    const sv = cleanView(obj.spaceView); if (sv) state.spaceView = sv;
    const dv = cleanView(obj.deepView);  if (dv) state.deepView  = dv;
    const validViews = new Set(['local', 'world', 'city', 'space', 'deepspace']);
    if (validViews.has(obj.viewMode)) state.viewMode = obj.viewMode;
    if (obj.comms) state.comms = obj.comms;   // already sanitized by sanitizeDiagram
    return true;
  } catch (e) { /* unreachable, but be defensive */ }
  return false;
}
setInterval(autosave, 5000);


/* =========================================================================
   KEYBOARD
   ========================================================================= */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveJSON(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openJSON(); return; }

  if (e.key === 'Escape') {
    state.pendingConnectId = null;
    state.activeCitySiteId = null;
    clearCitySitePaletteSelection();
    clearOverlay();
    state.selectedIds.clear();
    setMode('select');
    dom.svg.classList.remove('place-site');
    renderAll();
    return;
  }
  if (e.key === 'v' || e.key === 'V') setMode('select');
  else if (e.key === 'c' || e.key === 'C') setMode('connect');
  else if (e.key === 'g' || e.key === 'G') { state.showGrid = !state.showGrid; updateGridVisibility(); }
  else if (e.key === '+' || e.key === '=') zoomBy(1.2);
  else if (e.key === '-' || e.key === '_') zoomBy(1/1.2);
  else if (e.key === '0') resetView();
  else if (e.key === 'f' || e.key === 'F') fitView();
  else if (e.key === 'w' || e.key === 'W') cycleViewMode();
});

function updateGridVisibility() {
  dom.gridBg.style.display = state.showGrid ? '' : 'none';
  dom.gridBtn.classList.toggle('active', state.showGrid);
}


/* =========================================================================
   TOOLBAR EVENTS
   ========================================================================= */
dom.toolbar.addEventListener('click', (e) => {
  const setView = e.target.closest('[data-set-view]')?.getAttribute('data-set-view');
  if (setView) { setViewMode(setView); return; }
  const action = e.target.closest('[data-action]')?.getAttribute('data-action');
  const mode   = e.target.closest('[data-mode]')?.getAttribute('data-mode');
  if (mode) { setMode(mode); return; }
  if (!action) return;
  // Close export menu unless we're toggling it
  if (action !== 'toggle-export') closeExportMenu();
  switch (action) {
    case 'new': newDiagram(); break;
    case 'open': openJSON(); break;
    case 'save': saveJSON(); break;
    case 'toggle-export': toggleExportMenu(); break;
    case 'export-png': exportPNG(); break;
    case 'export-svg': exportSVG(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'duplicate': duplicateSelection(); break;
    case 'delete': deleteSelection(); break;
    case 'connect-all': connectEverything(); break;
    case 'zoom-in': zoomBy(1.2); break;
    case 'zoom-out': zoomBy(1/1.2); break;
    case 'zoom-reset': resetView(); break;
    case 'fit': fitView(); break;
    case 'toggle-grid':
      state.showGrid = !state.showGrid;
      updateGridVisibility();
      break;
    case 'toggle-snap':
      state.snapToGrid = !state.snapToGrid;
      dom.snapBtn.classList.toggle('active', state.snapToGrid);
      break;
    case 'validate':
      renderWarnings();
      dom.warningsTray.classList.remove('hidden', 'collapsed');
      break;
    case 'scan': showScanResults(); break;
    case 'toggle-view': cycleViewMode(); break;
    case 'cycle-view': cycleViewMode(); break;
    case 'toggle-live': setLiveMap(!state.liveMap); break;
    case 'settings': showSettings(); break;
    case 'ai': showAiAssistant(); break;
    case 'help': showHelp(); break;
    case 'walkthrough':
      if (typeof openWalkthrough === 'function') openWalkthrough(0);
      break;
    case 'load-demo': loadDemoNetwork(); break;
  }
});

// Progress-tray "Guide" button is rendered into the body, not the toolbar.
// Delegate clicks at the document level so the handler survives re-renders.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action="walkthrough"]');
  if (a && typeof openWalkthrough === 'function') {
    e.preventDefault();
    openWalkthrough(0);
  }
});

// Export dropdown
const exportMenu = document.getElementById('export-menu');
function toggleExportMenu() {
  if (exportMenu.hasAttribute('hidden')) exportMenu.removeAttribute('hidden');
  else exportMenu.setAttribute('hidden', '');
}
function closeExportMenu() { exportMenu.setAttribute('hidden', ''); }
exportMenu.addEventListener('click', (e) => {
  const fmt = e.target.closest('[data-export]')?.getAttribute('data-export');
  if (!fmt) return;
  closeExportMenu();
  switch (fmt) {
    case 'png':     exportPNG(); break;
    case 'svg':     exportSVG(); break;
    case 'report':  exportReport(); break;
    case 'specs':   exportSpecs(); break;
    case 'expense': exportExpense(); break;
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.tb-dropdown')) closeExportMenu();
});

dom.prActions.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')?.getAttribute('data-action');
  if (a === 'duplicate') duplicateSelection();
  if (a === 'delete') deleteSelection();
});


/* =========================================================================
   SETTINGS MODAL (API keys, etc.)
   ========================================================================= */
const SETTINGS_KEY = 'greynet:settings:v1';
async function loadSettings() {
  await migrateLegacySettings();
  try {
    const s = await window.greynetSecure?.getSettingsSummary?.();
    if (!s) return;
    state.aiProvider = s.aiProvider || 'anthropic';
    state.hasAiKeys = { ...state.hasAiKeys, ...(s.hasAiKeys || {}) };
    state.aiModel  = { ...state.aiModel,  ...(s.aiModel  || {}) };
    state.hasGmapsApiKey = !!s.hasGmapsApiKey;
  } catch (e) {
    console.warn('Unable to load secure settings', e);
  }
  applyKeyVisibility();
}

async function migrateLegacySettings() {
  if (!window.greynetSecure?.saveSettings) return;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw);
    await window.greynetSecure.saveSettings({
      aiProvider: legacy.aiProvider,
      aiApiKeys: legacy.aiApiKeys || {},
      gmapsApiKey: legacy.gmapsApiKey || '',
    });
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {
    console.warn('Unable to migrate legacy settings', e);
  }
}

async function saveSettings(payload) {
  const s = await window.greynetSecure.saveSettings(payload);
  state.aiProvider = s.aiProvider || payload.aiProvider || 'anthropic';
  state.hasAiKeys = { ...state.hasAiKeys, ...(s.hasAiKeys || {}) };
  state.aiModel  = { ...state.aiModel,  ...(s.aiModel  || {}) };
  state.hasGmapsApiKey = !!s.hasGmapsApiKey;
  applyKeyVisibility();
}

async function getGoogleMapsApiKey() {
  try { return (await window.greynetSecure?.getGoogleMapsApiKey?.()) || ''; }
  catch (e) { return ''; }
}

function applyKeyVisibility() {
  // AI button: only visible if at least one AI key configured
  const hasAi = !!(state.hasAiKeys.anthropic || state.hasAiKeys.openai);
  const aiBtn = document.getElementById('ai-btn');
  if (aiBtn) aiBtn.hidden = !hasAi;
  // Google Maps backend option: only visible if a key is configured
  const hasGmaps = !!state.hasGmapsApiKey;
  const opt = document.getElementById('city-backend-gmaps-opt');
  if (opt) opt.hidden = !hasGmaps;
  // If the active city uses gmaps but no key, fall back to image
  const city = cityById(state.activeCityId);
  if (city && city.mapBackend === 'gmaps' && !hasGmaps) {
    city.mapBackend = 'image';
    if (state.viewMode === 'city') {
      if (dom.cityBackendSel) dom.cityBackendSel.value = 'image';
      syncTileMap();
      renderAll();
    }
  }
}

async function showSettings() {
  await loadSettings();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="min-width:520px;max-width:92vw">
      <h3>Settings</h3>
      <div class="form-grid">
        <div>
          <label>AI provider</label>
          <select id="set-ai-provider">
            <option value="anthropic" ${state.aiProvider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
            <option value="openai" ${state.aiProvider === 'openai' ? 'selected' : ''}>OpenAI (GPT-4 / GPT-5)</option>
          </select>
        </div>
        <div>
          <label>Anthropic API key</label>
          <input id="set-ai-anthropic" type="password" autocomplete="off" value="" placeholder="${state.hasAiKeys.anthropic ? 'Saved - leave blank to keep' : 'sk-ant-...'}"/>
          <div class="form-help">Stored encrypted by the desktop app. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a>.</div>
        </div>
        <div>
          <label>Anthropic model <span style="color:var(--text-faint);font-weight:400">(optional override)</span></label>
          <input id="set-ai-anthropic-model" type="text" autocomplete="off"
            value="${escapeHtml(state.aiModel?.anthropic || '')}"
            placeholder="claude-opus-4-7"/>
          <div class="form-help">Leave blank to use the built-in default.</div>
        </div>
        <div>
          <label>OpenAI API key</label>
          <input id="set-ai-openai" type="password" autocomplete="off" value="" placeholder="${state.hasAiKeys.openai ? 'Saved - leave blank to keep' : 'sk-...'}"/>
          <div class="form-help">Stored encrypted by the desktop app. Get a key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>.</div>
        </div>
        <div>
          <label>OpenAI model <span style="color:var(--text-faint);font-weight:400">(optional override)</span></label>
          <input id="set-ai-openai-model" type="text" autocomplete="off"
            value="${escapeHtml(state.aiModel?.openai || '')}"
            placeholder="gpt-4o"/>
          <div class="form-help">Leave blank to use the built-in default.</div>
        </div>
        <div>
          <label>Google Maps API key (optional — for the City view Google backend)</label>
          <input id="set-gmaps" type="password" autocomplete="off" value="" placeholder="${state.hasGmapsApiKey ? 'Saved - leave blank to keep' : 'AIza...'}"/>
          <div class="form-help">Required only if you want Google Maps as a city backdrop. OSM works without a key.</div>
        </div>
      </div>
      <p class="form-help" style="margin-top:14px">
        <b>Security note:</b> API keys are stored by the Electron main process, not renderer localStorage.
        Leave a saved key field blank to keep it, or type <code>clear</code> to remove it.
      </p>
      <div class="modal-actions">
        <button data-close>Cancel</button>
        <button class="primary" id="set-save">Save</button>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.hasAttribute('data-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('#set-save').addEventListener('click', async () => {
    const normalizeSecret = (value) => {
      const v = value.trim();
      if (!v) return undefined;
      return v.toLowerCase() === 'clear' ? '' : v;
    };
    await saveSettings({
      aiProvider: overlay.querySelector('#set-ai-provider').value,
      aiApiKeys: {
        anthropic: normalizeSecret(overlay.querySelector('#set-ai-anthropic').value),
        openai: normalizeSecret(overlay.querySelector('#set-ai-openai').value),
      },
      aiModel: {
        anthropic: overlay.querySelector('#set-ai-anthropic-model').value.trim(),
        openai:    overlay.querySelector('#set-ai-openai-model').value.trim(),
      },
      gmapsApiKey: normalizeSecret(overlay.querySelector('#set-gmaps').value),
    });
    overlay.remove();
  });
}


/* =========================================================================
   AI ASSISTANT
   ========================================================================= */
function showAiAssistant() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const provider = state.aiProvider;
  const hasKey = !!state.hasAiKeys[provider];
  overlay.innerHTML = `
    <div class="modal ai-modal">
      <div class="ai-head">
        <h3>Ask AI</h3>
        <div style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim)">
          Provider: <b>${provider === 'anthropic' ? 'Claude' : 'OpenAI'}</b>
          <button class="tb-btn" data-open-settings style="padding:2px 8px;font-size:10px">change</button>
        </div>
      </div>
      <div class="ai-body">
        ${hasKey ? '' : `<div class="ai-status error">No API key set for ${provider}. Open <b>Settings</b> to add one.</div>`}
        <div class="form-grid" style="margin-top:8px">
          <div>
            <label>What should AI build or change?</label>
            <textarea id="ai-prompt" rows="4" placeholder="Examples:
• Build me a 3-tier network for a small e-commerce site with proper segmentation
• Add 5 traffic signals along Broadway in the current city
• Audit my current network and suggest improvements
• Add a Starlink LEO constellation of 20 satellites"></textarea>
          </div>
        </div>
        <div class="ai-suggestions">
          <button data-sugg="Build a small office network: edge router, firewall, L3 switch, two servers (web + DB), 5 workstations. Put servers in DMZ, workstations in Internal.">Small office network</button>
          <button data-sugg="Add 8 traffic signals to the current city distributed along 5th Ave, connected to one roadside cabinet via buried fiber.">Traffic corridor</button>
          <button data-sugg="Create a Starlink-style LEO constellation: 12 LEO satellites evenly spaced, 3 ground stations, all linked with laser ISL.">LEO constellation</button>
          <button data-sugg="Look at the current diagram and tell me three high-impact security improvements.">Security suggestions</button>
        </div>
        <div id="ai-status" class="ai-status" style="display:none"></div>
      </div>
      <div class="ai-foot">
        <button data-close>Close</button>
        <button class="primary" id="ai-send" ${hasKey ? '' : 'disabled'}>Send</button>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.hasAttribute('data-close')) overlay.remove();
  });
  overlay.querySelector('[data-open-settings]')?.addEventListener('click', () => { overlay.remove(); showSettings(); });
  overlay.querySelectorAll('[data-sugg]').forEach(b => {
    b.addEventListener('click', () => { overlay.querySelector('#ai-prompt').value = b.getAttribute('data-sugg'); });
  });
  document.body.appendChild(overlay);
  overlay.querySelector('#ai-send')?.addEventListener('click', async () => {
    const prompt = overlay.querySelector('#ai-prompt').value.trim();
    if (!prompt) return;
    const statusEl = overlay.querySelector('#ai-status');
    statusEl.style.display = '';
    statusEl.className = 'ai-status';
    statusEl.textContent = 'Calling ' + (provider === 'anthropic' ? 'Claude' : 'OpenAI') + '…';
    overlay.querySelector('#ai-send').disabled = true;
    try {
      const result = await callAi(prompt);
      // Prefer the v2 applier — it validates each action, rejects duplicates,
      // and reports a per-action skip list. Falls back to the legacy applier
      // only if ai-actions.js failed to load.
      let summary;
      if (typeof applyAiActionsV2 === 'function') {
        const r = applyAiActionsV2(result, {
          state, uid, snap,
          pushHistory, renderAll,
          syncLeafletMarkers: typeof syncLeafletMarkers === 'function' ? syncLeafletMarkers : null,
        });
        summary = `Applied ${r.appliedCount}, skipped ${r.skippedCount}. ${r.notes || ''}`.trim();
        if (r.skippedCount && typeof toast === 'function') {
          const top = r.skipped.slice(0, 3).map(x => `${x.type}: ${x.reason}`).join('; ');
          toast(`AI: ${r.skippedCount} action(s) skipped — ${top}`, { variant: 'warn', ttlMs: 6000 });
        }
      } else {
        summary = applyAiActions(result);
      }
      statusEl.className = 'ai-status success';
      statusEl.textContent = `✓ ${summary}`;
    } catch (err) {
      statusEl.className = 'ai-status error';
      statusEl.textContent = '✕ ' + (err.message || String(err));
      overlay.querySelector('#ai-send').disabled = false;
    }
  });
}

const AI_SYSTEM_PROMPT = `You are a network-design assistant for an app called "GreyNet". The user describes what they want; you respond with ONLY a JSON object describing actions to take. NO markdown, NO commentary — just the JSON.

The response shape:
{
  "actions": [ {action objects} ... ],
  "notes": "1-sentence summary of what you did, shown to the user"
}

Supported action types (each action's "type" field):

1. addDevice — { type:"addDevice", deviceType, label, x, y, props:{ip,cidr,vlan,mac,role,notes}, siteId? }
   deviceType ∈ ["router","l3switch","switch","wap","firewall","waf","ids","vpn","proxy","server","database","storage","loadbalancer","workstation","laptop","mobile","tablet","phone","printer","iot","camera","cloud","internet"]

2. addLink — { type:"addLink", fromId, toId, linkType, label? }
   linkType ∈ ["ethernet","fiber","wireless","vpn","trunk"]
   You may reference devices added in this same response by giving them temp IDs in labels and then referencing those labels in fromId/toId — see below.

3. addZone — { type:"addZone", zoneType, x, y, w, h, label?, siteId? }
   zoneType ∈ ["internet","dmz","internal","mgmt","guest"]

4. addSite — { type:"addSite", siteType, name, lat, lng, address?, notes? }
   siteType ∈ ["datacenter","noc","soc","office","branch","warehouse","factory","retail","cloudregion"]

5. addEndpoint — { type:"addEndpoint", endpointType, label, lat?, lng?, x?, y?, props?, cityId? }
   endpointType ∈ ["building","trafficsignal","trafficcam","vehiclesensor","messagesign","cabinet","streetlight","fiberjunction"]

6. addCityLink — { type:"addCityLink", fromLabel, toLabel, linkType, label?, length? }
   linkType ∈ ["fiber_buried","fiber_aerial","copper","microwave","cellular"]

7. addSpaceAsset — { type:"addSpaceAsset", assetType, label, angle?, props? }
   assetType ∈ ["satellite_leo","satellite_meo","satellite_geo","station","ground_station","constellation","relay"]
   angle is in radians; pick evenly distributed angles for constellations (0, 2π/N, 4π/N, ...).

8. addSpaceLink — { type:"addSpaceLink", fromLabel, toLabel, linkType, label? }
   linkType ∈ ["laser_isl","rf_isl","uplink","downlink","feeder"]

CONVENTIONS:
- For addLink/addCityLink/addSpaceLink, reference endpoints by their unique "label" string from the actions you create earlier in the same response.
- Use clean integer coordinates for x/y in addDevice (multiples of 20 for snap-to-grid). For a small layout, x ∈ [100, 1000], y ∈ [100, 600].
- For zones, use reasonable extents (200×140 minimum) and position so they enclose the devices inside.
- Choose realistic IPs (RFC1918 for internal: 10.0.x.x or 192.168.x.x).
- Keep responses minimal — only the JSON, no prose.`;

async function callAi(userPrompt) {
  const provider = state.aiProvider;
  if (!state.hasAiKeys[provider]) throw new Error('No API key configured for ' + provider);
  // Provide current state as context to the model
  const ctx = {
    sites: state.sites.map(s => ({id: s.id, name: s.name, type: s.type})),
    cities: state.cities.map(c => ({id: c.id, name: c.name})),
    activeSiteId: state.activeSiteId,
    activeCityId: state.activeCityId,
    counts: {
      devices: state.devices.length, links: state.links.length, zones: state.zones.length,
      sites: state.sites.length, endpoints: state.endpoints.length, spaceAssets: state.spaceAssets.length,
    },
  };
  const fullPrompt = `Current diagram context:\n${JSON.stringify(ctx, null, 2)}\n\nUser request:\n${userPrompt}\n\nRespond ONLY with the JSON object as described in your instructions.`;

  // Prefer the live system prompt built from current constants tables (so
  // newly-added device/link/space/deep-space types stay in sync). Falls
  // back to the legacy AI_SYSTEM_PROMPT constant if ai-actions.js didn't load.
  const systemPrompt = typeof buildAiSystemPrompt === 'function'
    ? buildAiSystemPrompt()
    : AI_SYSTEM_PROMPT;
  const result = await window.greynetSecure.callAi({ system: systemPrompt, prompt: fullPrompt });
  return parseAiJson(result.text || '');
}

function parseAiJson(text) {
  // Strip code fences if present
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  }
  try { return JSON.parse(t); }
  catch (e) {
    // Try to find the first JSON object
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI response was not valid JSON: ' + t.slice(0, 200));
  }
}

function applyAiActions(result) {
  if (!result || !Array.isArray(result.actions)) throw new Error('AI response missing "actions" array');
  pushHistory();
  const labelMap = {};   // user-facing label → real id, for cross-references within this batch
  let added = 0;
  for (const a of result.actions.slice(0, 100)) {
    try {
      const cleaned = sanitizeAiAction(a);
      if (a.type === 'addDevice') {
        const d0 = cleaned.devices[0]; if (!d0) continue;
        const id = uid();
        state.devices.push({
          id, type: d0.type,
          x: snap(d0.x || 200), y: snap(d0.y || 200),
          label: d0.label || (DEVICE_TYPES[d0.type]?.label || 'Device'),
          props: { ...(DEVICE_TYPES[d0.type]?.defaultProps || {}), ...d0.props },
          siteId: d0.siteId || state.activeSiteId,
        });
        labelMap[d0.label] = id;
        added++;
      } else if (a.type === 'addLink') {
        const f = labelMap[cleanString(a.fromId, 96)] || cleanString(a.fromId, 96);
        const t = labelMap[cleanString(a.toId, 96)] || cleanString(a.toId, 96);
        if (deviceById(f) && deviceById(t)) {
          state.links.push({ id: uid(), fromId: f, toId: t, type: cleanEnum(a.linkType, LINK_TYPES, 'ethernet'), label: cleanString(a.label) });
          added++;
        }
      } else if (a.type === 'addZone') {
        const z0 = cleaned.zones[0]; if (!z0) continue;
        state.zones.push({ ...z0, id: uid(), x: snap(z0.x), y: snap(z0.y), w: snap(z0.w), h: snap(z0.h), siteId: z0.siteId || state.activeSiteId });
        added++;
      } else if (a.type === 'addSite') {
        const s0 = cleaned.sites[0]; if (!s0) continue;
        const def = SITE_TYPES[s0.type];
        const id = uid();
        state.sites.push({
          id, type: s0.type, name: s0.name, lat: s0.lat, lng: s0.lng,
          address: s0.address || '', notes: s0.notes || '', color: def?.color || '#5fb3ff',
        });
        labelMap[s0.name] = id;
        added++;
      } else if (a.type === 'addEndpoint') {
        const ep0 = cleaned.endpoints[0]; if (!ep0) continue;
        const def = ENDPOINT_TYPES[ep0.type];
        const id = uid();
        state.endpoints.push({
          id, type: ep0.type, label: ep0.label,
          x: ep0.x || 0, y: ep0.y || 0, lat: ep0.lat || null, lng: ep0.lng || null,
          cityId: ep0.cityId || state.activeCityId,
          props: { ...(def?.defaultProps || {}), ...ep0.props },
        });
        labelMap[ep0.label] = id;
        added++;
      } else if (a.type === 'addCityLink') {
        const f = labelMap[cleanString(a.fromLabel, 96)], t = labelMap[cleanString(a.toLabel, 96)];
        if (f && t) {
          state.cityLinks.push({ id: uid(), fromEpId: f, toEpId: t, type: cleanEnum(a.linkType, CITY_LINK_TYPES, 'fiber_buried'), label: cleanString(a.label), length: cleanString(a.length) });
          added++;
        }
      } else if (a.type === 'addSpaceAsset') {
        const sp0 = cleaned.spaceAssets[0]; if (!sp0) continue;
        const def = SPACE_ASSET_TYPES[sp0.type];
        const id = uid();
        state.spaceAssets.push({
          id, type: sp0.type, label: sp0.label,
          angle: sp0.angle != null ? sp0.angle : 0, orbit: def?.orbit,
          props: sp0.props || {},
        });
        labelMap[sp0.label] = id;
        added++;
      } else if (a.type === 'addSpaceLink') {
        const f = labelMap[cleanString(a.fromLabel, 96)], t = labelMap[cleanString(a.toLabel, 96)];
        if (f && t) {
          state.spaceLinks.push({ id: uid(), fromAssetId: f, toAssetId: t, type: cleanEnum(a.linkType, SPACE_LINK_TYPES, 'laser_isl'), label: cleanString(a.label) });
          added++;
        }
      }
    } catch (e) { console.warn('AI action failed', a, e); }
  }
  renderAll();
  syncLeafletMarkers();
  return `Applied ${added} action${added === 1 ? '' : 's'}. ${result.notes || ''}`;
}


/* =========================================================================
   HELP MODAL
   ========================================================================= */
function showHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal help-content">
      <h3>Keyboard shortcuts</h3>
      <table>
        <tr><td><kbd>V</kbd></td><td>Select mode</td></tr>
        <tr><td><kbd>C</kbd></td><td>Connect mode (click two devices)</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel / deselect / return to select</td></tr>
        <tr><td><kbd>Del</kbd> / <kbd>Backspace</kbd></td><td>Delete selection</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicate</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Undo / Redo</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save JSON</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Open JSON</td></tr>
        <tr><td><kbd>Shift</kbd>+click</td><td>Add to selection</td></tr>
        <tr><td><kbd>Alt</kbd>+drag / middle drag</td><td>Pan canvas</td></tr>
        <tr><td>Wheel</td><td>Zoom in/out</td></tr>
        <tr><td><kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> / <kbd>F</kbd></td><td>Zoom in / out / reset / fit</td></tr>
        <tr><td><kbd>G</kbd></td><td>Toggle grid</td></tr>
      </table>
      <p style="color:var(--text-faint);font-size:11px">
        Drag devices from the left palette onto the canvas. Click a zone type to draw a security zone.
        Right-click for a context menu. Diagrams autosave to your browser every 5 seconds.
      </p>
      <div class="modal-actions"><button class="primary" data-close>Close</button></div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.hasAttribute('data-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
}


/* =========================================================================
   VULNERABILITY SCANNER
   ========================================================================= */
function runScan() {
  const findings = [];
  const add = (severity, category, title, msg, ids, remediation) =>
    findings.push({ severity, category, title, msg, ids: ids || [], remediation: remediation || '' });

  const securityTypes  = new Set(['firewall','waf','ids','vpn','proxy']);
  const sensitiveTypes = new Set(['database','storage']);
  const endpointTypes  = new Set(['workstation','laptop','phone','mobile','tablet','printer','iot','camera']);

  // 1. Duplicate IPs
  const byIp = {};
  for (const d of state.devices) {
    const ip = d.props && d.props.ip; if (!ip) continue;
    (byIp[ip] = byIp[ip] || []).push(d);
  }
  for (const [ip, devs] of Object.entries(byIp)) if (devs.length > 1)
    add('critical', 'IP Plan', 'Duplicate IP address',
      `IP ${ip} is assigned to ${devs.length} devices: ${devs.map(d=>d.label).join(', ')}.`,
      devs.map(d=>d.id),
      'Assign each device a unique address; use DHCP reservations to prevent reuse.');

  // 2. Duplicate MACs
  const byMac = {};
  for (const d of state.devices) {
    const mac = (d.props && d.props.mac || '').toLowerCase().trim(); if (!mac) continue;
    (byMac[mac] = byMac[mac] || []).push(d);
  }
  for (const [mac, devs] of Object.entries(byMac)) if (devs.length > 1)
    add('high', 'Layer 2', 'Duplicate MAC address',
      `MAC ${mac} appears on ${devs.length} devices.`,
      devs.map(d=>d.id),
      'Two devices sharing a MAC will corrupt ARP tables and cause intermittent connectivity loss.');

  // 3. Devices in Internet zone that shouldn't be there
  const okInInternet = new Set(['internet','cloud','firewall','router','vpn','proxy','waf']);
  for (const d of state.devices) {
    const z = deviceZone(d);
    if (z && z.type === 'internet' && !okInInternet.has(d.type))
      add('high', 'Architecture', 'Internal device exposed to Internet',
        `${DEVICE_TYPES[d.type].label} "${d.label}" sits inside an Internet zone.`,
        [d.id, z.id],
        'Move behind a perimeter firewall in the DMZ or Internal zone.');
  }

  // 4. Cross-zone links without security inspection
  for (const link of state.links) {
    const a = deviceById(link.fromId), b = deviceById(link.toId);
    if (!a || !b) continue;
    const za = deviceZone(a), zb = deviceZone(b);
    if (za && zb && za.id !== zb.id && !securityTypes.has(a.type) && !securityTypes.has(b.type)) {
      const crossingInternet = za.type === 'internet' || zb.type === 'internet';
      add(crossingInternet ? 'critical' : 'high', 'Architecture',
        'Cross-zone link without inspection',
        `${a.label} (${ZONE_TYPES[za.type].label}) → ${b.label} (${ZONE_TYPES[zb.type].label}) has no firewall/IDS/proxy in path.`,
        [link.id, a.id, b.id],
        'Route this traffic through a security device. Direct zone-to-zone links bypass policy enforcement.');
    }
  }

  // 5. Databases/storage in untrusted zones
  for (const d of state.devices) {
    if (!sensitiveTypes.has(d.type)) continue;
    const z = deviceZone(d);
    if (z && (z.type === 'internet' || z.type === 'dmz'))
      add('critical', 'Data Protection', 'Sensitive data system in untrusted zone',
        `${d.label} (${DEVICE_TYPES[d.type].label}) is placed in the ${ZONE_TYPES[z.type].label} zone.`,
        [d.id, z.id],
        'Move data systems to the Internal zone. Front them with an application server in the DMZ if needed.');
  }

  // 6. Internet zone present but no firewall in the diagram
  const hasInternetZone = state.zones.some(z => z.type === 'internet');
  const hasFirewall     = state.devices.some(d => d.type === 'firewall');
  if (hasInternetZone && !hasFirewall)
    add('critical', 'Architecture', 'No perimeter firewall',
      'Diagram includes an Internet zone but no firewall device.',
      [], 'Add a perimeter firewall between the Internet and internal zones.');

  // 7. Public-facing servers without WAF
  const hasWAF = state.devices.some(d => d.type === 'waf');
  for (const d of state.devices) {
    if (d.type !== 'server') continue;
    const z = deviceZone(d);
    if (!z || z.type !== 'dmz') continue;
    const inboundFromInternet = state.links.some(l => {
      const otherId = l.fromId === d.id ? l.toId : (l.toId === d.id ? l.fromId : null);
      if (!otherId) return false;
      const other = deviceById(otherId);
      const oz = other && deviceZone(other);
      return oz && oz.type === 'internet';
    });
    if (inboundFromInternet && !hasWAF)
      add('medium', 'Web Security', 'Public server without WAF',
        `${d.label} is reachable from the Internet zone with no WAF anywhere in the design.`,
        [d.id],
        'Add a Web Application Firewall in front of public-facing application servers.');
  }

  // 8. No IDS/IPS in non-trivial networks
  const hasIDS = state.devices.some(d => d.type === 'ids');
  if (state.devices.length >= 5 && !hasIDS)
    add('low', 'Detection', 'No IDS/IPS in the design',
      'For networks of this size, intrusion detection is recommended.',
      [], 'Add IDS/IPS at the perimeter and at major internal segment boundaries.');

  // 9. IoT/Cameras without VLAN isolation
  for (const d of state.devices) {
    if (!['iot','camera'].includes(d.type)) continue;
    if (!(d.props && d.props.vlan))
      add('medium', 'Segmentation', 'IoT/Camera without dedicated VLAN',
        `${d.label} has no VLAN tag. IoT and surveillance devices should be isolated.`,
        [d.id],
        'Place IoT and CCTV devices on a dedicated VLAN with restrictive egress ACLs.');
  }

  // 10. Wireless APs without SSID/MDM context
  for (const d of state.devices) {
    if (d.type !== 'wap') continue;
    if (!(d.props && d.props.ssid))
      add('low', 'Wireless', 'Wireless AP without SSID configured',
        `${d.label} has no SSID specified.`,
        [d.id],
        'Document SSID and authentication. WPA3-Enterprise (802.1X) is recommended for corporate networks.');
  }

  // 11. Mobile/tablet without MDM in Internal zone (BYOD risk)
  for (const d of state.devices) {
    if (!['mobile','tablet'].includes(d.type)) continue;
    const z = deviceZone(d);
    const noMdm = !(d.props && d.props.mdm);
    if (z && z.type === 'internal' && noMdm)
      add('medium', 'BYOD / Mobile', 'Mobile device in Internal zone without MDM',
        `${d.label} sits in the Internal trust zone with no MDM platform recorded.`,
        [d.id],
        'Enroll in MDM (Intune, Jamf, etc.), enforce posture checks, and consider isolating BYOD to a separate VLAN.');
  }
  for (const d of state.devices) {
    if (d.type !== 'laptop') continue;
    const z = deviceZone(d);
    if (z && z.type === 'guest')
      add('info', 'BYOD / Mobile', 'Corporate laptop in Guest zone',
        `${d.label} is placed in the Guest zone — verify this is intentional.`,
        [d.id], 'Guest zone typically has no corporate access.');
  }

  // 12. Devices without IP addresses (documentation hygiene)
  for (const d of state.devices) {
    if (['internet','cloud'].includes(d.type)) continue;
    if (!(d.props && d.props.ip))
      add('info', 'Documentation', 'Device missing IP address',
        `${d.label} (${DEVICE_TYPES[d.type].label}) has no IP assigned.`,
        [d.id], 'Document IP addressing for asset inventory and incident response.');
  }

  // 13. Orphaned devices (no connections)
  const connected = new Set();
  for (const l of state.links) { connected.add(l.fromId); connected.add(l.toId); }
  for (const d of state.devices) {
    if (['internet','cloud'].includes(d.type)) continue;
    if (!connected.has(d.id))
      add('low', 'Topology', 'Disconnected device',
        `${d.label} has no network connections.`,
        [d.id], 'Either connect it or remove it from the diagram.');
  }

  // 14. Dangling links
  for (const link of state.links) {
    if (!deviceById(link.fromId) || !deviceById(link.toId))
      add('high', 'Topology', 'Dangling link',
        'A link references a deleted device.',
        [link.id], 'Remove or reconnect the link.');
  }

  // 15. Single perimeter firewall (no HA) on a non-trivial network
  const firewalls = state.devices.filter(d => d.type === 'firewall');
  if (firewalls.length === 1 && state.devices.length >= 10)
    add('low', 'Resilience', 'Single perimeter firewall (no HA)',
      'Only one firewall protects the perimeter — a failure causes total outage.',
      firewalls.map(d => d.id),
      'Deploy firewalls in an HA pair (active/passive or active/active).');

  // 16. Multiple DMZ servers without a load balancer
  const dmzServers = state.devices.filter(d => d.type === 'server' && deviceZone(d) && deviceZone(d).type === 'dmz');
  const hasLB = state.devices.some(d => d.type === 'loadbalancer');
  if (dmzServers.length >= 2 && !hasLB)
    add('info', 'Resilience', 'Multiple DMZ servers without load balancer',
      `${dmzServers.length} servers in the DMZ but no load balancer present.`,
      dmzServers.map(d => d.id),
      'Add a load balancer for availability and even traffic distribution.');

  // 17. Endpoints in DMZ (anti-pattern)
  for (const d of state.devices) {
    if (!endpointTypes.has(d.type)) continue;
    const z = deviceZone(d);
    if (z && z.type === 'dmz')
      add('high', 'Architecture', 'Endpoint device in DMZ',
        `${d.label} (${DEVICE_TYPES[d.type].label}) is in the DMZ.`,
        [d.id, z.id],
        'User endpoints should live in Internal or Guest zones, not the DMZ.');
  }

  // 18. No management zone for switches/firewalls (info)
  const mgmtPresent = state.zones.some(z => z.type === 'mgmt');
  const mgmtCapableCount = state.devices.filter(d =>
    ['router','switch','l3switch','firewall','waf','ids','vpn','wap','loadbalancer'].includes(d.type)).length;
  if (mgmtCapableCount >= 5 && !mgmtPresent)
    add('low', 'Management', 'No out-of-band management zone',
      'No Management zone defined. Infrastructure devices should have a dedicated mgmt network.',
      [], 'Create a Management zone and put management interfaces of switches, firewalls, and APs into it.');

  // 19. Guest WAPs not isolated in Guest zone
  for (const d of state.devices) {
    if (d.type !== 'wap') continue;
    const role = ((d.props && d.props.role) || '').toLowerCase();
    const ssid = ((d.props && d.props.ssid) || '').toLowerCase();
    const isGuest = role.includes('guest') || ssid.includes('guest');
    if (!isGuest) continue;
    const z = deviceZone(d);
    if (z && z.type !== 'guest')
      add('high', 'Wireless', 'Guest WAP outside Guest zone',
        `${d.label} appears to be a guest WAP but is not in the Guest zone.`,
        [d.id], 'Move guest WAPs into a Guest zone with Internet-only egress.');
  }

  // 20. Sensitive systems with no VLAN
  for (const d of state.devices) {
    if (!sensitiveTypes.has(d.type)) continue;
    if (!(d.props && d.props.vlan))
      add('low', 'Segmentation', 'Sensitive system without VLAN',
        `${d.label} has no VLAN tag.`,
        [d.id], 'Place databases and storage on dedicated VLANs with strict ingress filtering.');
  }

  // === Additional rules (v2 scanner) ===

  // 21. Malformed IPv4 addresses (each octet 0-255, four octets)
  const ipv4Re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  for (const d of state.devices) {
    const ip = d.props && d.props.ip; if (!ip) continue;
    const m = ipv4Re.exec(String(ip).trim());
    if (!m || m.slice(1).some(o => Number(o) < 0 || Number(o) > 255))
      add('high', 'IP Plan', 'Malformed IP address',
        `${d.label}: "${ip}" is not a valid IPv4 address.`,
        [d.id], 'Use dotted-quad form with each octet between 0 and 255.');
  }

  // 22. VLAN out of range (valid VLAN IDs are 1-4094; 0 and 4095 are reserved)
  for (const d of state.devices) {
    const v = d.props && d.props.vlan; if (v == null || v === '') continue;
    const n = Number(String(v).trim());
    if (!Number.isFinite(n) || n < 1 || n > 4094 || !Number.isInteger(n))
      add('medium', 'Layer 2', 'Invalid VLAN ID',
        `${d.label}: VLAN "${v}" is outside the valid 1-4094 range.`,
        [d.id], 'Use an integer between 1 and 4094. Reserve 0 and 4095 per 802.1Q.');
  }

  // 23. Cleartext protocol hints in role/notes — telnet, ftp, http (not https),
  // rsh, rlogin, snmpv1/2. Looking for these strings in the device metadata.
  const cleartextRe = /(\btelnet\b|\bftp\b|\brsh\b|\brlogin\b|\bsnmpv?[12]\b)/i;
  // "http" needs a special check so we don't match "https" or "http/3".
  const httpRe = /(?<![a-z])http(?!s|\d)/i;
  for (const d of state.devices) {
    const blob = [d.label, d.props?.role, d.props?.notes, d.props?.os].filter(Boolean).join(' ');
    if (cleartextRe.test(blob))
      add('high', 'Protocol', 'Cleartext protocol referenced',
        `${d.label} mentions telnet / ftp / rsh / SNMPv1-v2 in its metadata.`,
        [d.id], 'Use SSH, SFTP/SCP, and SNMPv3. Disable cleartext alternatives at the device.');
    else if (httpRe.test(blob))
      add('medium', 'Protocol', 'Cleartext HTTP referenced',
        `${d.label} appears to use plain HTTP. Browser and credential traffic should be TLS-protected.`,
        [d.id], 'Terminate TLS at the device or front it with a WAF / reverse proxy.');
  }

  // 24. Default-credential smell test on documented passwords. Look at the
  // notes / role fields for canned values like "admin/admin" or "password".
  const credRe = /\b(admin\s*[:\/=]\s*admin|password\s*[:\/=]\s*password|root\s*[:\/=]\s*(?:root|toor)|cisco\s*[:\/=]\s*cisco|user\s*[:\/=]\s*user|test\s*[:\/=]\s*test)\b/i;
  for (const d of state.devices) {
    const blob = [d.props?.notes, d.props?.role].filter(Boolean).join(' ');
    if (credRe.test(blob))
      add('critical', 'Credentials', 'Default-looking credentials documented',
        `${d.label}'s notes contain a default-style credential pair.`,
        [d.id], 'Rotate to a unique, long credential and remove the doc string — committed diagrams may be shared.');
  }

  // 25. RFC1918 fitness — devices in Internet/DMZ zone with a private IP look
  // wrong (no NAT documented). Devices in Internal/Mgmt with a public IP also
  // look wrong.
  const isPrivateIp = (ip) => {
    const m = ipv4Re.exec(String(ip).trim()); if (!m) return false;
    const o = m.slice(1).map(Number);
    if (o[0] === 10) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true; // link-local
    if (o[0] === 127) return true;                  // loopback
    if (o[0] >= 224) return false;                  // multicast/reserved → not private
    return false;
  };
  for (const d of state.devices) {
    const ip = d.props && d.props.ip; if (!ip) continue;
    if (!ipv4Re.test(String(ip).trim())) continue;       // skip malformed (already flagged)
    const z = deviceZone(d); if (!z) continue;
    const priv = isPrivateIp(ip);
    if (['internal','mgmt'].includes(z.type) && !priv)
      add('medium', 'IP Plan', 'Public IP in trusted zone',
        `${d.label} (${ip}) sits in the ${ZONE_TYPES[z.type].label} zone but uses a non-RFC1918 address.`,
        [d.id], 'Private (RFC1918) addressing is standard for internal/mgmt networks.');
    if (['dmz'].includes(z.type) && priv && d.type !== 'workstation')
      add('low', 'IP Plan', 'Private IP on DMZ host',
        `${d.label} (${ip}) is in the DMZ but uses RFC1918 addressing.`,
        [d.id], 'DMZ hosts typically NAT to a public address. Verify the NAT/edge routing is configured.');
  }

  // 26. Inter-site links should be encrypted on shared / public transports.
  // wan / internet site-link types are public-by-default and should be VPN or
  // MPLS. (We treat dark-fiber as private and skip it.)
  for (const sl of state.siteLinks) {
    if (sl.type === 'wan' || sl.type === 'internet') {
      const labelBlob = [sl.label, sl.bandwidth, sl.sla, sl.notes].filter(Boolean).join(' ').toLowerCase();
      const usesEncryption = /(\bvpn\b|\bipsec\b|\bmacsec\b|\bdtls\b|\btls\b|\bwireguard\b)/.test(labelBlob);
      if (!usesEncryption)
        add('high', 'Inter-site', 'Site-to-site link without encryption indicator',
          `Inter-site link "${sl.label || '(unnamed)'}" rides public transport with no encryption marked in the description.`,
          [sl.id], 'Run IPsec / WireGuard / MACsec across public WANs, and document the choice in the link label or notes.');
    }
  }

  // 27. Management zone directly linked to Internet zone — should never happen.
  for (const link of state.links) {
    const a = deviceById(link.fromId), b = deviceById(link.toId);
    if (!a || !b) continue;
    const za = deviceZone(a), zb = deviceZone(b);
    if (!za || !zb) continue;
    const pairTypes = new Set([za.type, zb.type]);
    if (pairTypes.has('mgmt') && pairTypes.has('internet'))
      add('critical', 'Management', 'Management plane reachable from Internet',
        `${a.label} (${ZONE_TYPES[za.type].label}) ↔ ${b.label} (${ZONE_TYPES[zb.type].label}) bridges Mgmt and Internet zones.`,
        [link.id, a.id, b.id, za.id, zb.id],
        'Management interfaces must be reachable only from a jump host on a dedicated VLAN, never directly from the public Internet.');
  }

  // 28. Wireless APs with open auth (no auth / WEP / WPA1 in props)
  for (const d of state.devices) {
    if (d.type !== 'wap') continue;
    const auth = ((d.props && (d.props.auth || d.props.security || d.props.encryption)) || '').toLowerCase();
    if (!auth) continue;
    if (/\b(open|none|no(?:ne)?)\b/.test(auth) || /\bwep\b/.test(auth) || /^wpa[\s\-]?1\b/.test(auth) || /\btkip\b/.test(auth))
      add('high', 'Wireless', 'Weak or absent wireless authentication',
        `${d.label} uses "${auth}". WEP, open, and WPA1/TKIP are obsolete.`,
        [d.id], 'Use WPA3-Personal (SAE) for small networks or WPA3-Enterprise (802.1X) for managed deployments.');
  }

  // 29. Database with a direct internet link — should be brokered.
  for (const d of state.devices) {
    if (d.type !== 'database') continue;
    const hasInetLink = state.links.some(l => {
      const otherId = l.fromId === d.id ? l.toId : (l.toId === d.id ? l.fromId : null);
      if (!otherId) return false;
      const other = deviceById(otherId);
      const oz = other && deviceZone(other);
      return oz && oz.type === 'internet';
    });
    if (hasInetLink)
      add('critical', 'Data Protection', 'Database directly linked to Internet zone',
        `${d.label} has a path that touches the Internet zone with no intermediate tier.`,
        [d.id], 'Front databases with application servers behind a firewall/WAF. Never expose the DB tier to the public Internet.');
  }

  // 30. Inter-site link describes "<1ms" or unrealistic latency — likely typo.
  for (const sl of state.siteLinks) {
    const sla = (sl.sla || '').toLowerCase();
    const m = /(\d+(?:\.\d+)?)\s*(?:ms|millisecond)/i.exec(sla);
    if (m && Number(m[1]) > 1000)
      add('low', 'Inter-site', 'Inter-site SLA latency looks unrealistic',
        `Link "${sl.label || '(unnamed)'}" lists ${m[1]} ms — values above 1 second are very unusual outside satellite paths.`,
        [sl.id], 'Re-check the SLA value; typical terrestrial WANs range 5–80 ms.');
  }

  return findings;
}

function computeSecurityScore(findings) {
  let score = 100;
  for (const f of findings) score -= (SEVERITY[f.severity] || {}).weight || 0;
  return Math.max(0, Math.min(100, score));
}
function scoreGrade(score) {
  if (score >= 90) return { letter: 'A', label: 'Strong', color: '#6fcf97' };
  if (score >= 75) return { letter: 'B', label: 'Adequate', color: '#5fb3ff' };
  if (score >= 60) return { letter: 'C', label: 'Needs work', color: '#f5c84c' };
  if (score >= 40) return { letter: 'D', label: 'Weak', color: '#ff8c42' };
  return                  { letter: 'F', label: 'Critical', color: '#ff4d4d' };
}


/* =========================================================================
   SCAN MODAL
   ========================================================================= */
function showScanResults() {
  const findings = runScan();
  const score = computeSecurityScore(findings);
  const grade = scoreGrade(score);
  const counts = { critical:0, high:0, medium:0, low:0, info:0 };
  for (const f of findings) counts[f.severity]++;

  let activeFilter = 'all';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const render = () => {
    const visible = activeFilter === 'all' ? findings : findings.filter(f => f.severity === activeFilter);
    visible.sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);

    const countPills = ['critical','high','medium','low','info'].map(sev => `
      <button class="scan-count-pill ${activeFilter === sev ? 'active' : ''}" data-filter="${sev}">
        <span class="dot" style="background:${SEVERITY[sev].color}"></span>
        <span>${SEVERITY[sev].label.toLowerCase()}</span>
        <span class="num">${counts[sev]}</span>
      </button>`).join('');

    const listHtml = findings.length === 0
      ? `<div class="scan-empty"><div class="big">✓</div>No issues found.<br>This design passes all current checks.</div>`
      : visible.length === 0
        ? `<div class="scan-empty">No ${activeFilter} findings.</div>`
        : visible.map((f, i) => `
            <div class="finding" data-idx="${findings.indexOf(f)}">
              <span class="sev-badge" style="background:${SEVERITY[f.severity].color}">${SEVERITY[f.severity].label}</span>
              <div class="finding-body">
                <div class="fcat">${escapeHtml(f.category)}</div>
                <div class="ft">${escapeHtml(f.title)}</div>
                <div class="fm">${escapeHtml(f.msg)}</div>
                ${f.remediation ? `<div class="fr">→ ${escapeHtml(f.remediation)}</div>` : ''}
              </div>
            </div>`).join('');

    overlay.innerHTML = `
      <div class="modal scan-modal">
        <div class="scan-head">
          <div class="scan-score-wrap">
            <div class="scan-score" style="color:${grade.color}">${score}</div>
            <div class="scan-score-label">Score</div>
          </div>
          <div class="scan-summary">
            <h3>Vulnerability Scan</h3>
            <div class="scan-tagline">
              <span class="scan-grade" style="background:${grade.color};color:#0e1116">Grade ${grade.letter} — ${grade.label}</span>
              &nbsp;${findings.length} finding${findings.length === 1 ? '' : 's'} across ${Object.keys(counts).filter(k=>counts[k]>0).length} severit${Object.keys(counts).filter(k=>counts[k]>0).length===1?'y':'ies'}
            </div>
          </div>
          <button class="tb-btn" data-close style="font-size:16px;padding:2px 10px">✕</button>
        </div>
        <div class="scan-counts">
          <button class="scan-count-pill ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">
            <span>All</span><span class="num">${findings.length}</span>
          </button>
          ${countPills}
        </div>
        <div class="scan-list">${listHtml}</div>
        <div class="scan-foot">
          <button data-action="open-report">Open full report</button>
          <button data-close class="primary">Close</button>
        </div>
      </div>`;

    overlay.querySelectorAll('[data-filter]').forEach(b => {
      b.addEventListener('click', () => { activeFilter = b.getAttribute('data-filter'); render(); });
    });
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('[data-action="open-report"]').addEventListener('click', () => {
      overlay.remove();
      exportReport();
    });
    overlay.querySelectorAll('.finding').forEach(el => {
      el.addEventListener('click', () => {
        const f = findings[Number(el.getAttribute('data-idx'))];
        if (!f || !f.ids.length) return;
        state.selectedIds.clear();
        for (const id of f.ids) state.selectedIds.add(id);
        renderAll();
        // briefly close so user sees canvas selection
        overlay.style.opacity = '0.15';
        overlay.style.pointerEvents = 'none';
        setTimeout(() => { overlay.style.opacity = ''; overlay.style.pointerEvents = ''; }, 900);
      });
    });
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  render();
}


/* =========================================================================
   EXPORT: HTML REPORT / SPECS / EXPENSE CSV
   ========================================================================= */
const REPORT_CSS = `
  body { font: 14px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1a1f2a; background: #f7f8fa; margin: 0; padding: 0; }
  .doc { max-width: 880px; margin: 0 auto; background: #fff; padding: 50px 60px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05); min-height: 100vh; }
  h1 { font-size: 26px; margin: 0 0 4px 0; color: #11161d; }
  h2 { font-size: 17px; margin: 30px 0 10px 0; padding-bottom: 6px;
    border-bottom: 2px solid #d6dde6; color: #11161d; }
  h3 { font-size: 14px; margin: 18px 0 8px 0; color: #283140; }
  .subtitle { color: #8a95a4; font-size: 13px; margin-bottom: 0; }
  .meta { display: flex; gap: 30px; padding: 14px 0; border-bottom: 1px solid #e5e9f0;
    margin-bottom: 20px; font-size: 12px; color: #5a6471; }
  .meta b { color: #11161d; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 20px 0; font-size: 12.5px; }
  th { text-align: left; padding: 8px 10px; background: #f0f2f6; font-weight: 600;
    border-bottom: 2px solid #d6dde6; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e9f0; vertical-align: top; }
  tr:nth-child(even) td { background: #fafbfd; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px;
    font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
  .pill-critical { background: #ff4d4d; }
  .pill-high     { background: #ff8c42; }
  .pill-medium   { background: #d4a017; }
  .pill-low      { background: #4090dd; }
  .pill-info     { background: #6a7585; }
  .score-card { display: flex; gap: 30px; align-items: center;
    padding: 20px; background: #f0f2f6; border-radius: 6px; margin: 15px 0; }
  .score-num { font-size: 56px; font-weight: 700; line-height: 1; font-family: "SF Mono", Menlo, monospace; }
  .score-meta .grade { font-size: 16px; font-weight: 700; padding: 3px 12px;
    border-radius: 12px; color: #fff; display: inline-block; margin-bottom: 4px; }
  .score-meta .summary { color: #5a6471; font-size: 13px; }
  .kv { display: grid; grid-template-columns: 160px 1fr; gap: 4px 16px;
    font-size: 13px; margin: 8px 0 16px 0; }
  .kv dt { color: #5a6471; }
  .kv dd { margin: 0; color: #11161d; font-weight: 500; }
  .toolbar { position: sticky; top: 0; background: #11161d; color: #fff;
    padding: 10px 60px; display: flex; justify-content: space-between; align-items: center;
    z-index: 10; }
  .toolbar h4 { margin: 0; font-size: 13px; font-weight: 600; }
  .toolbar button { background: #5fb3ff; color: #11161d; border: none; padding: 7px 16px;
    border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px; }
  .toolbar button:hover { background: #85c3ff; }
  .totals { background: #11161d; color: #d6dde6; padding: 14px 20px;
    border-radius: 6px; margin: 14px 0; display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; }
  .totals .item .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: #8a95a4; }
  .totals .item .val { font-size: 18px; font-weight: 700; font-family: "SF Mono", Menlo, monospace;
    color: #fff; }
  .finding-card { padding: 12px 14px; margin: 8px 0; border-left: 4px solid #d6dde6;
    background: #fafbfd; }
  .finding-card.critical { border-left-color: #ff4d4d; }
  .finding-card.high     { border-left-color: #ff8c42; }
  .finding-card.medium   { border-left-color: #d4a017; }
  .finding-card.low      { border-left-color: #4090dd; }
  .finding-card.info     { border-left-color: #6a7585; }
  .finding-card .head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  .finding-card .ttl { font-weight: 600; }
  .finding-card .cat { font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.6px; color: #5a6471; }
  .finding-card .msg { color: #283140; font-size: 13px; }
  .finding-card .rem { font-size: 12px; color: #4a5568; font-style: italic; margin-top: 4px; padding-left: 10px; border-left: 2px solid #e5e9f0; }
  .small { font-size: 11px; color: #8a95a4; }
  .footer { text-align: center; color: #8a95a4; font-size: 11px; padding: 30px 0; }
  @media print {
    .toolbar { display: none; }
    .doc { box-shadow: none; padding: 30px; max-width: none; }
    body { background: #fff; }
  }
`;

function exportReport() {
  const findings = runScan();
  const score = computeSecurityScore(findings);
  const grade = scoreGrade(score);
  const counts = { critical:0, high:0, medium:0, low:0, info:0 };
  for (const f of findings) counts[f.severity]++;
  const grouped = { critical:[], high:[], medium:[], low:[], info:[] };
  for (const f of findings) grouped[f.severity].push(f);

  const inventory = {};
  for (const d of state.devices) inventory[d.type] = (inventory[d.type] || 0) + 1;

  const findingsHtml = ['critical','high','medium','low','info'].map(sev => {
    if (grouped[sev].length === 0) return '';
    return `<h3 style="color:${SEVERITY[sev].color}">${SEVERITY[sev].label} <span style="color:#8a95a4">(${grouped[sev].length})</span></h3>` +
      grouped[sev].map(f => `
        <div class="finding-card ${sev}">
          <div class="head"><span class="pill pill-${sev}">${SEVERITY[sev].label}</span><span class="cat">${escapeHtml(f.category)}</span></div>
          <div class="ttl">${escapeHtml(f.title)}</div>
          <div class="msg">${escapeHtml(f.msg)}</div>
          ${f.remediation ? `<div class="rem">→ ${escapeHtml(f.remediation)}</div>` : ''}
        </div>`).join('');
  }).join('');

  const inventoryRows = Object.entries(inventory).sort()
    .map(([t, n]) => `<tr><td>${escapeHtml(DEVICE_TYPES[t].label)}</td><td>${n}</td></tr>`).join('');

  const siteRows = state.sites.map(s => {
    const def = SITE_TYPES[s.type];
    const cnt = state.devices.filter(d => d.siteId === s.id).length;
    return `<tr>
      <td><b>${escapeHtml(s.name)}</b></td>
      <td>${escapeHtml(def.label)}</td>
      <td>${escapeHtml(s.address || '')}</td>
      <td><code>${formatLatLng(s.lat, s.lng)}</code></td>
      <td>${cnt}</td>
    </tr>`;
  }).join('');
  const siteLinkRows = state.siteLinks.map(sl => {
    const a = siteById(sl.fromSiteId), b = siteById(sl.toSiteId);
    return `<tr>
      <td>${a ? escapeHtml(a.name) : '?'}</td>
      <td>${b ? escapeHtml(b.name) : '?'}</td>
      <td>${escapeHtml(SITE_LINK_TYPES[sl.type]?.label || sl.type)}</td>
      <td>${escapeHtml(sl.bandwidth || '')}</td>
      <td>${escapeHtml(sl.sla || '')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>GreyNet — Security Report</title>
<style>${REPORT_CSS}</style></head>
<body>
<div class="toolbar"><h4>GreyNet — Security Report</h4><button onclick="window.print()">Print / Save PDF</button></div>
<div class="doc">
  <h1>Network Security Report</h1>
  <p class="subtitle">Automated assessment of the designed network architecture</p>
  <div class="meta">
    <span><b>Generated</b> ${new Date().toLocaleString()}</span>
    <span><b>Devices</b> ${state.devices.length}</span>
    <span><b>Links</b> ${state.links.length}</span>
    <span><b>Zones</b> ${state.zones.length}</span>
  </div>

  <h2>Executive Summary</h2>
  <div class="score-card">
    <div class="score-num" style="color:${grade.color}">${score}</div>
    <div class="score-meta">
      <div class="grade" style="background:${grade.color}">Grade ${grade.letter} — ${grade.label}</div>
      <div class="summary">${findings.length} finding${findings.length === 1 ? '' : 's'}:
        ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info.</div>
    </div>
  </div>
  <p>This automated assessment evaluates the documented network design against common security architecture
  patterns. Findings are advisory and do not replace a manual review or penetration test.</p>

  <h2>Physical Sites</h2>
  <table>
    <thead><tr><th>Site</th><th>Type</th><th>Address</th><th>Coordinates</th><th>Devices</th></tr></thead>
    <tbody>${siteRows || '<tr><td colspan="5">No sites defined.</td></tr>'}</tbody>
  </table>
  ${state.siteLinks.length ? `
  <h3>Inter-site Links</h3>
  <table>
    <thead><tr><th>From</th><th>To</th><th>Type</th><th>Bandwidth</th><th>SLA</th></tr></thead>
    <tbody>${siteLinkRows}</tbody>
  </table>` : ''}

  <h2>Asset Inventory</h2>
  <table>
    <thead><tr><th>Device type</th><th>Count</th></tr></thead>
    <tbody>${inventoryRows || '<tr><td colspan="2">No devices.</td></tr>'}</tbody>
  </table>

  <h2>Findings</h2>
  ${findings.length === 0
    ? '<p>No issues detected. The design passes all current checks.</p>'
    : findingsHtml}

  <h2>Recommendations</h2>
  <ul>
    <li>Resolve all <b style="color:#ff4d4d">critical</b> findings before deploying to production.</li>
    <li>Document an incident-response plan and validate logging from all security devices.</li>
    <li>Schedule quarterly architecture reviews and an annual third-party penetration test.</li>
    <li>Maintain an IP and VLAN registry; this design's documentation completeness is part of the score.</li>
  </ul>

  <div class="footer">Generated by GreyNet — Network Designer · ${new Date().toISOString()}</div>
</div>
</body></html>`;

  openOrDownloadHtml(html, `security-report-${Date.now()}.html`);
}

function exportSpecs() {
  // Per-site, per-device tech sheet + IP plan + VLAN map + connections
  const sitesById = Object.fromEntries(state.sites.map(s => [s.id, s]));
  const bySite = {};
  for (const d of state.devices) {
    const k = d.siteId || '__none__';
    (bySite[k] = bySite[k] || []).push(d);
  }
  const sortedDevices = (ds) => [...ds].sort((a,b) => (a.label||'').localeCompare(b.label||''));

  const renderDevTbl = (ds) => `<table>
      <thead><tr><th>Hostname</th><th>IP / CIDR</th><th>VLAN</th><th>MAC</th><th>Role</th><th>Zone</th></tr></thead>
      <tbody>${sortedDevices(ds).map(d => {
        const def = DEVICE_TYPES[d.type], p = d.props || {};
        const z = deviceZone(d);
        return `<tr>
          <td><b>${escapeHtml(d.label)}</b><div class="small">${escapeHtml(def.label)}</div></td>
          <td>${escapeHtml(p.ip || '—')}${p.ip && p.cidr ? '/' + escapeHtml(p.cidr) : ''}</td>
          <td>${escapeHtml(p.vlan || '—')}</td>
          <td>${escapeHtml(p.mac || '—')}</td>
          <td>${escapeHtml(p.role || '—')}</td>
          <td>${z ? '<span class="pill" style="background:'+ZONE_TYPES[z.type].stroke+'">'+escapeHtml(ZONE_TYPES[z.type].label)+'</span>' : '—'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No devices.</td></tr>'}</tbody></table>`;

  const siteSections = state.sites.map(s => {
    const def = SITE_TYPES[s.type];
    return `<h3 style="margin-top:24px"><span class="pill" style="background:${def.color}">${escapeHtml(def.label.split(' ')[0])}</span> ${escapeHtml(s.name)} <span class="small">— ${escapeHtml(s.address || '')} (${formatLatLng(s.lat, s.lng)})</span></h3>` +
      renderDevTbl(bySite[s.id] || []);
  }).join('');
  const orphanSection = bySite['__none__']
    ? `<h3>Unassigned devices</h3>${renderDevTbl(bySite['__none__'])}`
    : '';
  const intersiteSection = state.siteLinks.length ? `
    <h2>Inter-site Connectivity</h2>
    <table>
      <thead><tr><th>From</th><th>To</th><th>Type</th><th>Bandwidth</th><th>SLA</th><th>Label</th></tr></thead>
      <tbody>${state.siteLinks.map(sl => {
        const a = sitesById[sl.fromSiteId], b = sitesById[sl.toSiteId];
        return `<tr>
          <td>${a ? escapeHtml(a.name) : '?'}</td>
          <td>${b ? escapeHtml(b.name) : '?'}</td>
          <td>${escapeHtml(SITE_LINK_TYPES[sl.type]?.label || sl.type)}</td>
          <td>${escapeHtml(sl.bandwidth || '')}</td>
          <td>${escapeHtml(sl.sla || '')}</td>
          <td>${escapeHtml(sl.label || '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : '';

  // IP plan grouped by VLAN
  const byVlan = {};
  for (const d of state.devices) {
    if (!(d.props && d.props.ip)) continue;
    const v = (d.props.vlan || 'untagged').toString();
    (byVlan[v] = byVlan[v] || []).push(d);
  }
  const vlanSections = Object.entries(byVlan).sort().map(([v, ds]) => `
    <h3>VLAN ${escapeHtml(v)} <span class="small">(${ds.length} host${ds.length === 1 ? '' : 's'})</span></h3>
    <table>
      <thead><tr><th>IP</th><th>Device</th><th>Role</th><th>MAC</th></tr></thead>
      <tbody>${ds.sort((a,b)=> (a.props.ip||'').localeCompare(b.props.ip||'')).map(d => `
        <tr>
          <td><code>${escapeHtml(d.props.ip)}${d.props.cidr ? '/'+escapeHtml(d.props.cidr) : ''}</code></td>
          <td>${escapeHtml(d.label)}</td>
          <td>${escapeHtml((d.props.role)||'')}</td>
          <td>${escapeHtml((d.props.mac)||'')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`).join('');

  const linkRows = state.links.map(l => {
    const a = deviceById(l.fromId), b = deviceById(l.toId);
    return `<tr>
      <td>${a ? escapeHtml(a.label) : '?'}</td>
      <td>${b ? escapeHtml(b.label) : '?'}</td>
      <td>${escapeHtml(LINK_TYPES[l.type].label)}</td>
      <td>${escapeHtml(l.label || '')}</td>
    </tr>`;
  }).join('');

  const zoneRows = state.zones.map(z => {
    const members = state.devices.filter(d => deviceZone(d) && deviceZone(d).id === z.id);
    return `<tr>
      <td><span class="pill" style="background:${ZONE_TYPES[z.type].stroke}">${escapeHtml(z.label || ZONE_TYPES[z.type].label)}</span></td>
      <td>${escapeHtml(ZONE_TYPES[z.type].label)}</td>
      <td>${members.length}</td>
      <td class="small">${members.map(m => escapeHtml(m.label)).join(', ') || '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>GreyNet — Technical Specifications</title>
<style>${REPORT_CSS}</style></head>
<body>
<div class="toolbar"><h4>GreyNet — Technical Specifications</h4><button onclick="window.print()">Print / Save PDF</button></div>
<div class="doc">
  <h1>Network Technical Specifications</h1>
  <p class="subtitle">Device inventory, IP plan, VLAN map, and connectivity matrix</p>
  <div class="meta">
    <span><b>Generated</b> ${new Date().toLocaleString()}</span>
    <span><b>Devices</b> ${state.devices.length}</span>
    <span><b>Links</b> ${state.links.length}</span>
    <span><b>Zones</b> ${state.zones.length}</span>
  </div>

  <h2>Device Inventory by Site</h2>
  ${siteSections || '<p>No sites defined.</p>'}
  ${orphanSection}
  ${intersiteSection}

  <h2>IP Address Plan</h2>
  ${Object.keys(byVlan).length ? vlanSections : '<p>No devices with IP addresses.</p>'}

  <h2>Connections</h2>
  <table>
    <thead><tr><th>From</th><th>To</th><th>Type</th><th>Label / Ports</th></tr></thead>
    <tbody>${linkRows || '<tr><td colspan="4">No connections.</td></tr>'}</tbody>
  </table>

  <h2>Security Zones</h2>
  <table>
    <thead><tr><th>Zone</th><th>Trust level</th><th>Members</th><th>Devices</th></tr></thead>
    <tbody>${zoneRows || '<tr><td colspan="4">No zones.</td></tr>'}</tbody>
  </table>

  <div class="footer">Generated by GreyNet — Network Designer · ${new Date().toISOString()}</div>
</div>
</body></html>`;

  openOrDownloadHtml(html, `tech-specs-${Date.now()}.html`);
}

function exportExpense() {
  // Build line items, totals, and a summary HTML/CSV
  const lines = state.devices.map(d => {
    const cat = COST_CATALOG[d.type] || { capex:0, license:0, label: DEVICE_TYPES[d.type].label };
    const capex = (d.props && d.props.cost != null) ? Number(d.props.cost) : cat.capex;
    const license = cat.license;
    const opex = Math.round(capex * OPEX_RATE);
    return {
      hostname: d.label, type: DEVICE_TYPES[d.type].label, sku: cat.label,
      capex, license, annualOpex: opex, threeYearTco: capex + (license + opex) * 3,
    };
  });

  const totals = lines.reduce((a, l) => ({
    capex: a.capex + l.capex, license: a.license + l.license,
    annualOpex: a.annualOpex + l.annualOpex, threeYearTco: a.threeYearTco + l.threeYearTco,
  }), { capex:0, license:0, annualOpex:0, threeYearTco:0 });

  // CSV
  const csv = [
    'Hostname,Type,SKU,CAPEX (USD),Annual License (USD),Annual OPEX (USD),3-Year TCO (USD)',
    ...lines.map(l => [l.hostname, l.type, l.sku, l.capex, l.license, l.annualOpex, l.threeYearTco]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')),
    '',
    `"TOTAL","","",${totals.capex},${totals.license},${totals.annualOpex},${totals.threeYearTco}`,
  ].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `cost-estimate-${Date.now()}.csv`);

  // Also open an HTML summary
  const $ = (n) => '$' + Number(n || 0).toLocaleString('en-US');
  const lineRows = lines.map(l => `<tr>
    <td><b>${escapeHtml(l.hostname)}</b><div class="small">${escapeHtml(l.type)}</div></td>
    <td class="small">${escapeHtml(l.sku)}</td>
    <td style="text-align:right">${$(l.capex)}</td>
    <td style="text-align:right">${$(l.license)}</td>
    <td style="text-align:right">${$(l.annualOpex)}</td>
    <td style="text-align:right"><b>${$(l.threeYearTco)}</b></td>
  </tr>`).join('');

  // Per-site rollup
  const siteCost = {};
  for (const d of state.devices) {
    const cat = COST_CATALOG[d.type] || { capex: 0, license: 0 };
    const cap = (d.props && d.props.cost != null) ? Number(d.props.cost) : cat.capex;
    const k = d.siteId || '__none__';
    if (!siteCost[k]) siteCost[k] = { capex: 0, license: 0, annualOpex: 0, threeYearTco: 0, count: 0 };
    const opex = Math.round(cap * OPEX_RATE);
    siteCost[k].capex += cap;
    siteCost[k].license += cat.license;
    siteCost[k].annualOpex += opex;
    siteCost[k].threeYearTco += cap + (cat.license + opex) * 3;
    siteCost[k].count += 1;
  }
  const siteCostRows = Object.entries(siteCost).map(([sid, v]) => {
    const s = siteById(sid);
    return `<tr>
      <td><b>${escapeHtml(s ? s.name : 'Unassigned')}</b>${s ? '<div class="small">'+escapeHtml(SITE_TYPES[s.type].label)+'</div>' : ''}</td>
      <td>${v.count}</td>
      <td style="text-align:right">${$(v.capex)}</td>
      <td style="text-align:right">${$(v.license)}</td>
      <td style="text-align:right">${$(v.annualOpex)}</td>
      <td style="text-align:right"><b>${$(v.threeYearTco)}</b></td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>GreyNet — Cost Estimate</title>
<style>${REPORT_CSS}</style></head>
<body>
<div class="toolbar"><h4>GreyNet — Cost Estimate</h4><button onclick="window.print()">Print / Save PDF</button></div>
<div class="doc">
  <h1>Network Cost Estimate</h1>
  <p class="subtitle">Hardware CAPEX, annual licensing, and 3-year total cost of ownership</p>
  <div class="meta">
    <span><b>Generated</b> ${new Date().toLocaleString()}</span>
    <span><b>Line items</b> ${lines.length}</span>
    <span><b>OPEX assumption</b> ${(OPEX_RATE*100).toFixed(0)}% of CAPEX / year</span>
  </div>

  <div class="totals">
    <div class="item"><div class="lbl">Total CAPEX</div><div class="val">${$(totals.capex)}</div></div>
    <div class="item"><div class="lbl">Annual licenses</div><div class="val">${$(totals.license)}</div></div>
    <div class="item"><div class="lbl">Annual OPEX</div><div class="val">${$(totals.annualOpex)}</div></div>
    <div class="item"><div class="lbl">3-Year TCO</div><div class="val">${$(totals.threeYearTco)}</div></div>
  </div>

  <h2>By Site</h2>
  <table>
    <thead><tr><th>Site</th><th>Devices</th><th style="text-align:right">CAPEX</th>
      <th style="text-align:right">License/yr</th><th style="text-align:right">OPEX/yr</th>
      <th style="text-align:right">3-yr TCO</th></tr></thead>
    <tbody>${siteCostRows || '<tr><td colspan="6">No sites with devices.</td></tr>'}</tbody>
  </table>

  <h2>Line items</h2>
  <table>
    <thead><tr><th>Device</th><th>SKU / Tier</th><th style="text-align:right">CAPEX</th>
      <th style="text-align:right">License/yr</th><th style="text-align:right">OPEX/yr</th>
      <th style="text-align:right">3-yr TCO</th></tr></thead>
    <tbody>${lineRows || '<tr><td colspan="6">No devices.</td></tr>'}</tbody>
  </table>

  <p class="small">Estimates are based on a built-in default catalog and do not reflect specific vendor quotes,
  volume discounts, professional services, rack/power costs, ISP recurring fees, or cloud subscriptions.
  Override per-device cost via the Properties panel <code>cost</code> field.</p>

  <p class="small"><b>CSV also downloaded</b> — open in Excel/Google Sheets for analysis.</p>

  <div class="footer">Generated by GreyNet — Network Designer · ${new Date().toISOString()}</div>
</div>
</body></html>`;

  openOrDownloadHtml(html, `cost-estimate-${Date.now()}.html`);
}

function openOrDownloadHtml(html, filename) {
  const w = window.open('', '_blank');
  if (w && !w.closed) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      return;
    } catch (e) {}
  }
  // Fallback if popup blocked
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}


/* =========================================================================
   DEEP SPACE — INTERPLANETARY LINK BUDGET STUDIO

   Physics is straightforward closed-form:
     FSPL_dB    = 92.45 + 20·log10(d_km) + 20·log10(f_GHz)
     Pr_dBW     = Pt_dBW + Gt + Gr − FSPL − L_atm − L_pointing
     C/N0_dBHz  = Pr_dBW + 228.6 − 10·log10(Ts)            (Boltzmann)
     Eb/N0_dB   = C/N0 − 10·log10(R_bps)
     Margin_dB  = Eb/N0_achieved − Eb/N0_required(mod+FEC)

   Planet positions use simplified Standish J2000 mean elements. Good to
   ~arcminutes over decades — plenty for link-distance estimation.
   ========================================================================= */

const DS_AU_KM  = 149597870.7;
const DS_C_KMS  = 299792.458;
const DS_K_DBW  = -228.6;             // 10·log10(Boltzmann constant) dBW/Hz/K

// Transmit stations (source endpoints). Defaults reflect real ground/space gear.
const DS_SOURCES = {
  dsn70:    { label: 'DSN 70m (Goldstone)', host: 'earth', altKm: 0,
              defaultTxW: 20000, defaultGtDbi: 73, defaultTsK: 21,
              note: 'NASA Deep Space Network 70-meter antenna, X-band.' },
  dsn34:    { label: 'DSN 34m BWG',         host: 'earth', altKm: 0,
              defaultTxW: 20000, defaultGtDbi: 68, defaultTsK: 25,
              note: 'DSN 34-meter beam-waveguide antenna, X/Ka-band.' },
  estrack:  { label: 'ESA Estrack 35m',     host: 'earth', altKm: 0,
              defaultTxW: 20000, defaultGtDbi: 68.5, defaultTsK: 28,
              note: 'ESA deep-space stations (New Norcia, Cebreros, Malargüe).' },
  starship: { label: 'Starship LEO',        host: 'earth', altKm: 500,
              defaultTxW: 1000,  defaultGtDbi: 38, defaultTsK: 200,
              note: 'Hypothetical Starship phased-array, V/Ka-band.' },
  marsrelay:{ label: 'Mars relay orbiter',  host: 'mars',  altKm: 400,
              defaultTxW: 100,   defaultGtDbi: 47, defaultTsK: 150,
              note: 'MRO-class 3m HGA on a Mars science orbit.' },
  lunargate:{ label: 'Lunar Gateway',       host: 'moon',  altKm: 70000,
              defaultTxW: 200,   defaultGtDbi: 45, defaultTsK: 200,
              note: 'NRHO Lunar Gateway X/Ka-band terminal.' },
};

// Targets — planets, the Moon, and a few notable spacecraft.
// Planets get full Keplerian elements; spacecraft use a fixed distance.
const DS_TARGETS = {
  mercury: { label: 'Mercury', kind: 'planet', color: '#a8a29e', radiusVis: 5,
             a: 0.38709927, e: 0.20563593, L0: 252.25032350, peri: 77.45779628,
             rate: 149472.67411175 },
  venus:   { label: 'Venus',   kind: 'planet', color: '#e6c478', radiusVis: 8,
             a: 0.72333566, e: 0.00677672, L0: 181.97909950, peri: 131.60246718,
             rate: 58517.81538729 },
  earth:   { label: 'Earth',   kind: 'planet', color: '#5fb3ff', radiusVis: 8.5,
             a: 1.00000261, e: 0.01671123, L0: 100.46457166, peri: 102.93768193,
             rate: 35999.37244981 },
  moon:    { label: 'Moon',    kind: 'satellite', parent: 'earth',
             distKm: 384400, color: '#cbd5d8', radiusVis: 4,
             note: 'Mean Earth-Moon distance.' },
  mars:    { label: 'Mars',    kind: 'planet', color: '#d97644', radiusVis: 6.5,
             a: 1.52371034, e: 0.09339410, L0: -4.55343205,  peri: -23.94362959,
             rate: 19140.30268499 },
  jupiter: { label: 'Jupiter', kind: 'planet', color: '#d8a460', radiusVis: 18,
             a: 5.20288700, e: 0.04838624, L0: 34.39644051,  peri: 14.72847983,
             rate: 3034.74612775 },
  saturn:  { label: 'Saturn',  kind: 'planet', color: '#e9c97a', radiusVis: 15,
             a: 9.53667594, e: 0.05386179, L0: 49.95424423,  peri: 92.59887831,
             rate: 1222.49362201 },
  uranus:  { label: 'Uranus',  kind: 'planet', color: '#9bd5d9', radiusVis: 10,
             a: 19.18916464,e: 0.04725744, L0: 313.23810451, peri: 170.95427630,
             rate: 428.48202785 },
  neptune: { label: 'Neptune', kind: 'planet', color: '#5b7ddc', radiusVis: 10,
             a: 30.06992276,e: 0.00859048, L0: -55.12002969, peri: 44.96476227,
             rate: 218.45945325 },
  jwst:    { label: 'JWST (Sun-Earth L2)', kind: 'spacecraft', parent: 'earth',
             distKm: 1.5e6, color: '#ffd166', radiusVis: 3,
             note: 'JWST orbits Sun-Earth L2 at ~1.5 million km from Earth.' },
  voyager1:{ label: 'Voyager 1', kind: 'spacecraft', parent: 'sun',
             distKm: 2.47e10, color: '#cccccc', radiusVis: 3,
             note: 'Now ~165 AU from the Sun and receding at 17 km/s.' },
  custom:  { label: 'Custom range', kind: 'custom',
             color: '#d6dde6', radiusVis: 5,
             note: 'Type any distance in km to model arbitrary scenarios.' },
};

// Frequency band labels for slider annotation.
const DS_BANDS = [
  { name: 'UHF',  lo: 0.3,  hi: 1.0  },
  { name: 'L',    lo: 1.0,  hi: 2.0  },
  { name: 'S',    lo: 2.0,  hi: 4.0  },
  { name: 'C',    lo: 4.0,  hi: 8.0  },
  { name: 'X',    lo: 8.0,  hi: 12.0 },
  { name: 'Ku',   lo: 12.0, hi: 18.0 },
  { name: 'Ka',   lo: 26.5, hi: 40.0 },
  { name: 'V',    lo: 40.0, hi: 75.0 },
  { name: 'W',    lo: 75.0, hi: 110.0},
];
function dsBandFor(fGhz) {
  for (const b of DS_BANDS) if (fGhz >= b.lo && fGhz <= b.hi) return b.name;
  return '—';
}

// Modulation + FEC presets. Required Eb/N0 values are typical operating points
// for BER ~ 1e-6 from DVB-S2 / DSN telecom design handbook tables.
const DS_MODFEC = {
  bpsk_uncoded:    { label: 'BPSK uncoded',          ebn0Req: 10.5, bitsPerSym: 1 },
  bpsk_12_conv:    { label: 'BPSK 1/2 Viterbi',      ebn0Req: 4.5,  bitsPerSym: 1 },
  bpsk_16_turbo:   { label: 'BPSK 1/6 Turbo (DSN)',  ebn0Req: 0.5,  bitsPerSym: 1 },
  qpsk_uncoded:    { label: 'QPSK uncoded',          ebn0Req: 10.5, bitsPerSym: 2 },
  qpsk_12_conv:    { label: 'QPSK 1/2 Viterbi',      ebn0Req: 4.5,  bitsPerSym: 2 },
  qpsk_12_ldpc:    { label: 'QPSK 1/2 LDPC',         ebn0Req: 1.0,  bitsPerSym: 2 },
  qpsk_34_ldpc:    { label: 'QPSK 3/4 LDPC',         ebn0Req: 2.2,  bitsPerSym: 2 },
  '8psk_23_ldpc':  { label: '8PSK 2/3 LDPC',         ebn0Req: 3.7,  bitsPerSym: 3 },
  '16apsk_34_ldpc':{ label: '16APSK 3/4 LDPC',       ebn0Req: 6.4,  bitsPerSym: 4 },
  '32apsk_910_ldpc':{label: '32APSK 9/10 LDPC',      ebn0Req: 11.3, bitsPerSym: 5 },
};

// One-click scenarios that snap the state to a realistic configuration.
const DS_PRESETS = {
  dsn_mro: {
    label: 'DSN ↔ MRO at Mars',
    apply: c => Object.assign(c, {
      sourceId: 'dsn70', targetId: 'mars',
      txPowerW: 100, txGainDbi: 47, rxGainDbi: 73, freqGHz: 8.4,
      dataBps: 6_000_000, noiseTempK: 21, modFec: 'qpsk_12_ldpc',
    }),
  },
  voyager: {
    label: 'Voyager 1 today',
    apply: c => Object.assign(c, {
      sourceId: 'dsn70', targetId: 'voyager1',
      txPowerW: 23, txGainDbi: 48, rxGainDbi: 73, freqGHz: 8.4,
      dataBps: 160, noiseTempK: 30, modFec: 'bpsk_16_turbo',
    }),
  },
  apollo: {
    label: 'Apollo S-band Earth↔Moon',
    apply: c => Object.assign(c, {
      sourceId: 'dsn70', targetId: 'moon',
      txPowerW: 20, txGainDbi: 27, rxGainDbi: 61, freqGHz: 2.287,
      dataBps: 1_024_000, noiseTempK: 100, modFec: 'bpsk_12_conv',
    }),
  },
  jwst: {
    label: 'JWST Ka downlink',
    apply: c => Object.assign(c, {
      sourceId: 'dsn34', targetId: 'jwst',
      txPowerW: 32, txGainDbi: 56, rxGainDbi: 79, freqGHz: 25.9,
      dataBps: 28_000_000, noiseTempK: 30, modFec: 'qpsk_12_ldpc',
    }),
  },
  marslink: {
    label: 'Hypothetical Mars Starlink',
    apply: c => Object.assign(c, {
      sourceId: 'starship', targetId: 'mars',
      txPowerW: 500, txGainDbi: 42, rxGainDbi: 42, freqGHz: 27.0,
      dataBps: 25_000_000, noiseTempK: 200, modFec: '8psk_23_ldpc',
    }),
  },
  pluto: {
    label: 'New Horizons-class to Pluto orbit',
    apply: c => Object.assign(c, {
      sourceId: 'dsn70', targetId: 'neptune',  // neptune ≈ 30 AU (Pluto ~39)
      txPowerW: 12, txGainDbi: 42, rxGainDbi: 73, freqGHz: 8.4,
      dataBps: 1000, noiseTempK: 25, modFec: 'bpsk_16_turbo',
    }),
  },
};

// === Ephemeris: simplified Standish J2000 mean elements ===
function dsJulianDate(ms) { return ms / 86400000 + 2440587.5; }
function dsCenturiesSinceJ2000(ms) { return (dsJulianDate(ms) - 2451545.0) / 36525; }
function dsSolveKepler(M, e) {
  // M in radians. Newton iteration converges in <5 steps for e<0.3.
  let E = M;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}
function dsPlanetAU(targetId, atMs) {
  // Returns heliocentric ecliptic-plane (x, y) in AU, ignoring inclination
  // (fine for distance estimation between Earth and another planet).
  const p = DS_TARGETS[targetId];
  if (!p || p.kind !== 'planet') return { x: 0, y: 0, r: 0 };
  const T = dsCenturiesSinceJ2000(atMs);
  const L  = (p.L0   + p.rate * T) * Math.PI / 180;
  const w  = (p.peri) * Math.PI / 180;
  const M  = L - w;
  const E  = dsSolveKepler(M, p.e);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + p.e) * Math.sin(E / 2),
    Math.sqrt(1 - p.e) * Math.cos(E / 2)
  );
  const r  = p.a * (1 - p.e * Math.cos(E));
  return { x: r * Math.cos(nu + w), y: r * Math.sin(nu + w), r };
}

// Distance from Earth to a target (km).
function dsDistanceKm(targetId, atMs) {
  const t = DS_TARGETS[targetId];
  if (!t) return 0;
  if (t.kind === 'custom') return state.comms.customTargetKm;
  if (t.kind === 'spacecraft' || t.kind === 'satellite') return t.distKm;
  const earth = dsPlanetAU('earth', atMs);
  const tgt   = dsPlanetAU(targetId, atMs);
  const dxAU = tgt.x - earth.x, dyAU = tgt.y - earth.y;
  return Math.sqrt(dxAU * dxAU + dyAU * dyAU) * DS_AU_KM;
}

// === Pure link-budget calculation ===
function dsComputeLinkBudget(c, atMs) {
  const distKm  = Math.max(1, dsDistanceKm(c.targetId, atMs));
  const ptDbW   = 10 * Math.log10(Math.max(1e-6, c.txPowerW));
  const fGHz    = Math.max(0.05, c.freqGHz);
  const fsplDb  = 92.45 + 20 * Math.log10(distKm) + 20 * Math.log10(fGHz);
  const prDbW   = ptDbW + c.txGainDbi + c.rxGainDbi - fsplDb - c.atmLossDb - c.pointingLossDb;
  const cn0     = prDbW - DS_K_DBW - 10 * Math.log10(c.noiseTempK); // -228.6 -> + thus subtract
  const rBps    = Math.max(1, c.dataBps);
  const ebN0    = cn0 - 10 * Math.log10(rBps);
  const mod     = DS_MODFEC[c.modFec] || DS_MODFEC.qpsk_12_ldpc;
  const margin  = ebN0 - mod.ebn0Req;
  const lightS  = distKm / DS_C_KMS;
  // Shannon capacity bound at the achieved C/N (per Hz of bandwidth).
  // Use bandwidth ≈ R_bps / bits_per_symbol as a rough channel BW.
  const bwHz    = rBps / mod.bitsPerSym;
  const snrLin  = Math.pow(10, (cn0 - 10 * Math.log10(bwHz)) / 10);
  const shannon = bwHz * Math.log2(1 + Math.max(0, snrLin));

  // Limiting factor explanation
  let limiter = 'closed';
  if (margin < 0) {
    if (fsplDb > 250) limiter = 'free-space loss dominates — increase aperture or drop bit-rate';
    else if (c.noiseTempK > 80) limiter = 'noise-floor limited — cool the LNA or use a colder receiver';
    else if (rBps > shannon * 1.2) limiter = 'bit-rate exceeds Shannon bound for this C/N — slow down';
    else limiter = 'gain-limited — add aperture or boost TX power';
  } else if (margin < 3) {
    limiter = 'marginal — add ≥3 dB of safety against rain/pointing fades';
  }

  return {
    distKm, fsplDb, ptDbW, prDbW, cn0, ebN0, margin,
    lightS,            // one-way light delay (s)
    shannonBps: shannon,
    requiredEbN0: mod.ebn0Req,
    modLabel: mod.label,
    bitsPerSym: mod.bitsPerSym,
    bandName: dsBandFor(fGHz),
    limiter,
  };
}

// === Heliocentric SVG renderer ===
// World-space: Sun at (0,0), planets on log-scaled circular orbits.
function dsLogOrbitR(au) { return 200 * Math.log2(au + 1); }

function renderDeepSpace() {
  const layer = dom.deepspaceLayer;
  const linkLayer = dom.deepspaceLinkLayer;
  layer.innerHTML = '';
  linkLayer.innerHTML = '';
  state.comms.epochMs = Date.now();

  const frag = document.createDocumentFragment();

  // Backdrop and starfield (deterministic for stable repaints).
  frag.appendChild(svgEl('rect', {
    class: 'ds-bg', x: -5000, y: -5000, width: 10000, height: 10000
  }));
  const rng = (seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280)(7);
  for (let i = 0; i < 280; i++) {
    const x = (rng() - 0.5) * 4200, y = (rng() - 0.5) * 4200;
    const r = 0.5 + rng() * 1.4, op = 0.18 + rng() * 0.55;
    frag.appendChild(svgEl('circle', { class: 'space-star', cx: x, cy: y, r, opacity: op }));
  }

  // Sun + corona at origin.
  frag.appendChild(svgEl('circle', { class: 'ds-sun-corona', cx: 0, cy: 0, r: 120 }));
  frag.appendChild(svgEl('circle', { class: 'ds-sun',        cx: 0, cy: 0, r: 30  }));
  const sunLabel = svgEl('text', { class: 'ds-orbit-label', x: 0, y: 50, 'text-anchor': 'middle' });
  sunLabel.textContent = 'Sun';
  frag.appendChild(sunLabel);

  // Orbits and planets.
  const planets = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
  const epoch = state.comms.epochMs;
  const positions = {};
  for (const pid of planets) {
    const p = DS_TARGETS[pid];
    const R = dsLogOrbitR(p.a);
    // Orbit circle
    frag.appendChild(svgEl('circle', { class: 'ds-orbit', cx: 0, cy: 0, r: R }));
    // Orbit label (along +x for outer planets, slight offset for inner)
    const ol = svgEl('text', { class: 'ds-orbit-label', x: R + 4, y: -4 });
    ol.textContent = `${p.label} · ${p.a.toFixed(2)} AU`;
    frag.appendChild(ol);
    // Live planet position
    const ph = dsPlanetAU(pid, epoch);
    // Map heliocentric AU -> SVG: angle is preserved, radius uses log-orbit.
    const theta = Math.atan2(ph.y, ph.x);
    const px = R * Math.cos(theta);
    const py = R * Math.sin(theta);
    positions[pid] = { x: px, y: py, R, theta };

    const g = svgEl('g', { class: 'ds-planet' + (state.comms.targetId === pid ? ' target' : ''),
                           'data-target': pid, transform: `translate(${px.toFixed(2)},${py.toFixed(2)})` });
    g.appendChild(svgEl('circle', { class: 'ds-planet-body', r: p.radiusVis, fill: p.color }));
    const nameY = p.radiusVis + 14;
    const nm = svgEl('text', { class: 'ds-planet-label', y: nameY });
    nm.textContent = p.label;
    g.appendChild(nm);
    if (state.comms.targetId === pid) {
      const meta = svgEl('text', { class: 'ds-planet-meta', y: nameY + 11 });
      const d = dsDistanceKm(pid, epoch);
      meta.textContent = `${(d / DS_AU_KM).toFixed(2)} AU · ${(d / 1e6).toFixed(1)}M km`;
      g.appendChild(meta);
    }
    g.addEventListener('click', () => {
      state.comms.targetId = pid;
      renderAll();
    });
    frag.appendChild(g);
  }

  // Source: anchored to its host planet, slightly offset radially outward.
  const src = DS_SOURCES[state.comms.sourceId] || DS_SOURCES.dsn70;
  const hostPos = positions[src.host] || positions.earth || { x: 0, y: 0 };
  // Push the source marker outward a little so it's visible from the planet.
  const srcOffset = 22;
  const ang = Math.atan2(hostPos.y, hostPos.x) || 0;
  const sx = hostPos.x + Math.cos(ang) * srcOffset;
  const sy = hostPos.y + Math.sin(ang) * srcOffset;
  const sg = svgEl('g', { class: 'ds-source', transform: `translate(${sx.toFixed(2)},${sy.toFixed(2)})` });
  sg.appendChild(svgEl('circle', { class: 'ds-source-pulse', r: 9 }));
  sg.appendChild(svgEl('circle', { class: 'ds-source-ring',  r: 5.5 }));
  const sl = svgEl('text', { class: 'ds-source-label', y: -10 });
  sl.textContent = src.label;
  sg.appendChild(sl);
  frag.appendChild(sg);
  layer.appendChild(frag);

  // === Link line + light-speed packet ===
  // Target position in SVG coords: planet uses its drawn position, spacecraft
  // get a synthetic offset from their parent planet for visualization.
  const tgt = DS_TARGETS[state.comms.targetId];
  let tx = positions.earth ? positions.earth.x : 0;
  let ty = positions.earth ? positions.earth.y : 0;
  if (tgt) {
    if (tgt.kind === 'planet' && positions[state.comms.targetId]) {
      tx = positions[state.comms.targetId].x;
      ty = positions[state.comms.targetId].y;
    } else if (tgt.kind === 'satellite' || tgt.kind === 'spacecraft') {
      const parent = positions[tgt.parent] || positions.earth || { x: 0, y: 0 };
      const off = 28;
      const pa = Math.atan2(parent.y, parent.x) || 0;
      tx = parent.x + Math.cos(pa) * off;
      ty = parent.y + Math.sin(pa) * off;
    } else if (tgt.kind === 'custom') {
      // Draw a synthetic node in the +x direction at outer-edge of viz
      tx = 1100; ty = 0;
    }
  }

  const lb = dsComputeLinkBudget(state.comms, epoch);
  const cls = lb.margin >= 3 ? 'ok' : (lb.margin >= 0 ? 'marginal' : 'fail');

  // Curved link path: a slight Bezier arc so even short hops are visible.
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const nx = -(ty - sy), ny = (tx - sx);
  const norm = Math.max(1, Math.hypot(nx, ny));
  const dist = Math.hypot(tx - sx, ty - sy);
  const arc = Math.min(dist * 0.12, 90);
  const cpx = mx + (nx / norm) * arc;
  const cpy = my + (ny / norm) * arc;
  const linkPath = `M ${sx} ${sy} Q ${cpx} ${cpy} ${tx} ${ty}`;
  linkLayer.appendChild(svgEl('path', { class: `ds-link ${cls}`, d: linkPath, id: 'ds-link-path' }));

  // Light-speed packet — duration scaled so a real light-minute = 6 visual seconds.
  // Real one-way light delay can be tens of minutes; we cap visible animation to 14s.
  const visDurS = Math.max(1.5, Math.min(14, lb.lightS / 60 * 6));
  const packet = svgEl('circle', { class: 'ds-packet', cx: sx, cy: sy, r: 2.4 });
  const animMo = svgEl('animateMotion', {
    dur: `${visDurS}s`,
    repeatCount: 'indefinite',
    rotate: 'auto',
    path: linkPath,
  });
  packet.appendChild(animMo);
  linkLayer.appendChild(packet);

  // Distance + delay readout near the midpoint of the link.
  const txt = svgEl('text', { class: 'ds-readout-text', x: cpx, y: cpy - 6, 'text-anchor': 'middle' });
  txt.textContent = `${(lb.distKm / 1e6).toFixed(1)}M km · ${dsFormatDelay(lb.lightS)} one-way`;
  linkLayer.appendChild(txt);
  const sub = svgEl('text', { class: 'ds-readout-dim', x: cpx, y: cpy + 7, 'text-anchor': 'middle' });
  sub.textContent = `${lb.bandName}-band · ${state.comms.freqGHz} GHz · ${(state.comms.dataBps / 1e3).toFixed(0)} kbps`;
  linkLayer.appendChild(sub);
}

function dsFormatDelay(s) {
  if (s < 1)   return (s * 1000).toFixed(1) + ' ms';
  if (s < 60)  return s.toFixed(2) + ' s';
  if (s < 3600) {
    const m = Math.floor(s / 60), r = (s - 60 * m).toFixed(0);
    return `${m} min ${r}s`;
  }
  const h = Math.floor(s / 3600), m = Math.floor((s - 3600 * h) / 60);
  return `${h}h ${m}m`;
}

function fitDeepSpace() {
  const rect = dom.svg.getBoundingClientRect();
  const pad = 80;
  const w = 2400, h = 2400;
  const zoom = clamp(Math.min((rect.width - pad*2) / w, (rect.height - pad*2) / h), 0.1, 4);
  state.view.zoom = zoom;
  state.view.pan.x = rect.width / 2;
  state.view.pan.y = rect.height / 2;
  updateWorldTransform();
}

// === Link Budget Studio (right-panel UI) ===
function renderLinkBudgetStudio() {
  const c = state.comms;
  const lb = dsComputeLinkBudget(c, Date.now());
  const verdictCls = lb.margin >= 3 ? 'ok' : (lb.margin >= 0 ? 'warn' : 'err');
  const verdictText = lb.margin >= 3 ? 'Link closed' : (lb.margin >= 0 ? 'Marginal' : 'Fails');

  // Helper to fmt dB / numbers with sign
  const sf = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
  const f  = (v, d = 1) => v.toFixed(d);
  const dBm = lb.prDbW + 30;
  const prWatts = Math.pow(10, lb.prDbW / 10);

  // Build options
  const srcOpts = Object.entries(DS_SOURCES).map(([k, v]) =>
    `<option value="${k}" ${k === c.sourceId ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
  const tgtOpts = Object.entries(DS_TARGETS).map(([k, v]) =>
    `<option value="${k}" ${k === c.targetId ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
  const modOpts = Object.entries(DS_MODFEC).map(([k, v]) =>
    `<option value="${k}" ${k === c.modFec ? 'selected' : ''}>${escapeHtml(v.label)} (Eb/N₀≥${v.ebn0Req} dB)</option>`).join('');
  const presetBtns = Object.entries(DS_PRESETS).map(([k, p]) =>
    `<button data-preset="${k}">${escapeHtml(p.label)}</button>`).join('');

  // Log-slider helpers
  const logSlider = (id, val, lo, hi, label, unit, fmtFn) => {
    const logVal = Math.log10(val);
    const logLo  = Math.log10(lo);
    const logHi  = Math.log10(hi);
    return `
      <div class="lbs-row">
        <label>${label}</label>
        <input type="range" id="${id}" min="${logLo}" max="${logHi}" step="0.01" value="${logVal}">
        <span class="val" id="${id}-val">${fmtFn(val)}<span class="unit">${unit}</span></span>
      </div>`;
  };
  const linSlider = (id, val, lo, hi, step, label, unit) => `
    <div class="lbs-row">
      <label>${label}</label>
      <input type="range" id="${id}" min="${lo}" max="${hi}" step="${step}" value="${val}">
      <span class="val" id="${id}-val">${val}<span class="unit">${unit}</span></span>
    </div>`;

  // Waterfall — show dB contributions to received power.
  // Pt → +Gt → +Gr → −FSPL → −losses → Pr  (relative to a 300 dB scale)
  const bar = (name, db, kind) => {
    const widthPct = Math.min(100, Math.abs(db) / 3); // 1% per 3 dB
    const sideStyle = db >= 0 ? `left:50%;width:${widthPct}%` : `right:50%;width:${widthPct}%`;
    return `
      <div class="lbs-bar ${kind}">
        <span class="name">${name}</span>
        <div class="track"><div class="fill" style="${sideStyle}"></div></div>
        <span class="v">${sf(db, 1)} dB</span>
      </div>`;
  };

  const dom_pr = dom.prBody;
  const sourceInfo = DS_SOURCES[c.sourceId] || {};
  const targetInfo = DS_TARGETS[c.targetId] || {};

  dom.prType.textContent = 'Link Budget Studio';
  dom_pr.innerHTML = `
  <div class="lbs">
    <div class="lbs-head">
      <span class="lbs-title"><b>${escapeHtml(sourceInfo.label || '')}</b> → <b>${escapeHtml(targetInfo.label || '')}</b></span>
      <span class="lbs-verdict ${verdictCls}">${verdictText}</span>
    </div>
    <div class="lbs-body">

      <div class="lbs-section">
        <h4>Scenario presets</h4>
        <div class="lbs-presets">${presetBtns}</div>
      </div>

      <div class="lbs-section">
        <h4>Endpoints</h4>
        <div class="lbs-row full"><label>Transmit station</label>
          <select id="lbs-source">${srcOpts}</select></div>
        <div class="lbs-row full"><label>Target</label>
          <select id="lbs-target">${tgtOpts}</select></div>
        ${targetInfo.kind === 'custom' ? `
          <div class="lbs-row"><label>Distance</label>
            <input type="range" id="lbs-customdist" min="3" max="13" step="0.01"
              value="${Math.log10(Math.max(1000, c.customTargetKm))}">
            <span class="val" id="lbs-customdist-val">${(c.customTargetKm / 1e6).toFixed(1)}<span class="unit">M km</span></span>
          </div>` : ''}
        <div class="lbs-explain"><b>Source:</b> ${escapeHtml(sourceInfo.note || '')}<br>
          <b>Target:</b> ${escapeHtml(targetInfo.note || '')}</div>
      </div>

      <div class="lbs-section">
        <h4>Transmitter</h4>
        ${logSlider('lbs-pt', c.txPowerW, 0.1, 100000, 'TX power', 'W',
          v => v < 1 ? v.toFixed(2) : v < 1000 ? v.toFixed(0) : (v / 1000).toFixed(1) + 'k')}
        ${linSlider('lbs-gt', c.txGainDbi, 0, 80, 0.5, 'TX antenna gain', 'dBi')}
        ${linSlider('lbs-freq', c.freqGHz, 0.1, 100, 0.1, 'Carrier frequency', 'GHz')}
        <div class="lbs-explain">
          Band: <b>${lb.bandName}</b>.
          Higher freq buys aperture gain (Gt ∝ f²) but suffers more rain/atm loss.
        </div>
      </div>

      <div class="lbs-section">
        <h4>Receiver &amp; channel</h4>
        ${linSlider('lbs-gr', c.rxGainDbi, 0, 80, 0.5, 'RX antenna gain', 'dBi')}
        ${linSlider('lbs-ts', c.noiseTempK, 20, 500, 1, 'System noise temp', 'K')}
        ${logSlider('lbs-rate', c.dataBps, 1, 1e9, 'Data rate', 'bps',
          v => v < 1000 ? v.toFixed(0) : v < 1e6 ? (v / 1e3).toFixed(0) + 'k' : v < 1e9 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e9).toFixed(1) + 'G')}
        <div class="lbs-row full"><label>Modulation + FEC</label>
          <select id="lbs-modfec">${modOpts}</select></div>
        ${linSlider('lbs-atm', c.atmLossDb, 0, 10, 0.1, 'Atmospheric loss', 'dB')}
        ${linSlider('lbs-point', c.pointingLossDb, 0, 5, 0.1, 'Pointing loss', 'dB')}
      </div>

      <div class="lbs-section">
        <h4>Live readout</h4>
        <div class="lbs-readout">
          <span class="k">Distance</span>
            <span class="v">${(lb.distKm / 1e6).toFixed(1)} M km
              <span class="sub">${(lb.distKm / DS_AU_KM).toFixed(3)} AU</span></span>
          <span class="k">One-way delay</span>
            <span class="v">${dsFormatDelay(lb.lightS)}
              <span class="sub">round trip ${dsFormatDelay(lb.lightS * 2)}</span></span>
          <span class="k">FSPL</span>
            <span class="v">${f(lb.fsplDb, 1)} dB</span>
          <span class="k">Received power</span>
            <span class="v">${f(lb.prDbW, 1)} dBW
              <span class="sub">${f(dBm, 1)} dBm · ${prWatts < 1e-15 ? prWatts.toExponential(2) : prWatts.toExponential(2)} W</span></span>
          <span class="k">C/N₀</span>
            <span class="v">${f(lb.cn0, 1)} dB·Hz</span>
          <span class="k">Eb/N₀ achieved</span>
            <span class="v ${lb.margin >= 3 ? 'good' : (lb.margin >= 0 ? 'warn' : 'bad')}">${f(lb.ebN0, 1)} dB</span>
          <span class="k">Eb/N₀ required</span>
            <span class="v">${f(lb.requiredEbN0, 1)} dB
              <span class="sub">${escapeHtml(lb.modLabel)}</span></span>
          <span class="k">Margin</span>
            <span class="v ${lb.margin >= 3 ? 'good' : (lb.margin >= 0 ? 'warn' : 'bad')}">${sf(lb.margin, 1)} dB</span>
          <span class="k">Shannon bound</span>
            <span class="v">${lb.shannonBps > 1e6 ? (lb.shannonBps / 1e6).toFixed(1) + ' Mbps' : (lb.shannonBps / 1e3).toFixed(2) + ' kbps'}</span>
        </div>
        <div class="lbs-explain"><b>Verdict:</b> ${escapeHtml(lb.limiter)}.</div>
      </div>

      <div class="lbs-section">
        <h4>dB waterfall</h4>
        <div class="lbs-waterfall">
          ${bar('TX power',  lb.ptDbW,         'note')}
          ${bar('+ TX gain', c.txGainDbi,      'gain')}
          ${bar('+ RX gain', c.rxGainDbi,      'gain')}
          ${bar('− FSPL',    -lb.fsplDb,       'loss')}
          ${bar('− atm/point', -(c.atmLossDb + c.pointingLossDb), 'loss')}
          ${bar('= Pr',      lb.prDbW,         'note')}
        </div>
      </div>

    </div>
  </div>`;

  // === Wire up slider/select interactions ===
  const $ = id => dom_pr.querySelector(`#${id}`);
  const setVal = (id, val, fmt) => {
    const el = dom_pr.querySelector(`#${id}-val`);
    if (el) {
      // preserve the .unit child if present
      const unit = el.querySelector('.unit');
      el.firstChild && (el.firstChild.nodeValue = fmt(val));
      if (!el.firstChild) el.textContent = fmt(val);
      if (unit) el.appendChild(unit);
    }
  };
  // Wire log sliders
  const wireLog = (id, key, fmt) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      c[key] = Math.pow(10, parseFloat(el.value));
      setVal(id, c[key], fmt);
      // Re-render canvas + readouts (debounced via rAF would be nicer; this is fine)
      renderDeepSpace();
      renderLinkBudgetStudio();
    });
  };
  const wireLin = (id, key, fmt) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      c[key] = parseFloat(el.value);
      setVal(id, c[key], fmt);
      renderDeepSpace();
      renderLinkBudgetStudio();
    });
  };
  wireLog('lbs-pt',   'txPowerW',
    v => v < 1 ? v.toFixed(2) : v < 1000 ? v.toFixed(0) : (v / 1000).toFixed(1) + 'k');
  wireLin('lbs-gt',   'txGainDbi',  v => v.toFixed(1));
  wireLin('lbs-freq', 'freqGHz',    v => v.toFixed(2));
  wireLin('lbs-gr',   'rxGainDbi',  v => v.toFixed(1));
  wireLin('lbs-ts',   'noiseTempK', v => v.toFixed(0));
  wireLog('lbs-rate', 'dataBps',
    v => v < 1000 ? v.toFixed(0) : v < 1e6 ? (v / 1e3).toFixed(0) + 'k' : v < 1e9 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e9).toFixed(1) + 'G');
  wireLin('lbs-atm',  'atmLossDb',     v => v.toFixed(1));
  wireLin('lbs-point','pointingLossDb',v => v.toFixed(1));

  // Custom distance slider (only when target is 'custom')
  const cd = $('lbs-customdist');
  if (cd) {
    cd.addEventListener('input', () => {
      c.customTargetKm = Math.pow(10, parseFloat(cd.value));
      renderDeepSpace();
      renderLinkBudgetStudio();
    });
  }

  // Selects
  const onSel = (id, key, after) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      c[key] = el.value;
      if (after) after();
      renderDeepSpace();
      renderLinkBudgetStudio();
      updateSiteBar();
    });
  };
  onSel('lbs-source', 'sourceId', () => {
    // When source changes, adopt its sensible defaults if user hasn't tweaked.
    const s = DS_SOURCES[c.sourceId];
    if (s) {
      c.txPowerW  = s.defaultTxW;
      c.txGainDbi = s.defaultGtDbi;
      c.noiseTempK = s.defaultTsK;
    }
  });
  onSel('lbs-target', 'targetId');
  onSel('lbs-modfec', 'modFec');

  // Presets
  dom_pr.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = DS_PRESETS[btn.getAttribute('data-preset')];
      if (p && p.apply) {
        p.apply(c);
        renderDeepSpace();
        renderLinkBudgetStudio();
        updateSiteBar();
      }
    });
  });

  // Click a planet in the viz to set it as target (event delegation here so it
  // survives re-renders) — handled in renderDeepSpace's per-planet click.

  // Append the Deep Space Mesh panel below the Link Budget Studio so the user
  // sees their placed units, anchors, latency and reachability summary in the
  // same right-side pane.
  if (typeof renderDeepSpaceMeshPanel === 'function') {
    const meshHost = document.createElement('div');
    meshHost.className = 'lbs-section';
    meshHost.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #1f2937';
    meshHost.innerHTML = '<h4 style="margin:0 0 8px">Deep Space Mesh</h4>';
    const mountPoint = document.createElement('div');
    meshHost.appendChild(mountPoint);
    dom_pr.appendChild(meshHost);
    try { renderDeepSpaceMeshPanel(mountPoint, state); }
    catch (e) { console.warn('renderDeepSpaceMeshPanel failed', e); }
  }
}


/* =========================================================================
   INIT
   ========================================================================= */
async function init() {
  await loadSettings();
  applyKeyVisibility();
  renderPalette();
  const restored = tryRestoreAutosave();
  // First-run ships EMPTY so the user actually experiences the section gating
  // and the walkthrough. The "Load demo" button (see renderEmptyState) lets
  // them populate the rich seedExample at any time.
  ensureDefaultSite();
  ensureDefaultCity(state.viewMode === 'city');
  updateGridVisibility();
  // Restore Live Map setting (default ON)
  try {
    const v = localStorage.getItem(LIVE_MAP_KEY);
    setLiveMap(v === null ? true : v === '1');
  } catch (e) { setLiveMap(true); }
  document.body.classList.toggle('world-mode',     state.viewMode === 'world');
  document.body.classList.toggle('city-mode',      state.viewMode === 'city');
  document.body.classList.toggle('space-mode',     state.viewMode === 'space');
  document.body.classList.toggle('deepspace-mode', state.viewMode === 'deepspace');
  dom.svg.classList.toggle('world-mode',     state.viewMode === 'world');
  dom.svg.classList.toggle('city-mode',      state.viewMode === 'city');
  dom.svg.classList.toggle('space-mode',     state.viewMode === 'space');
  dom.svg.classList.toggle('deepspace-mode', state.viewMode === 'deepspace');
  updateViewToggleButtons();
  updateWorldTransform();
  syncTileMap();
  // Safety nets: ensure new arrays exist on restored / fresh state.
  state.planetInfra     = state.planetInfra     || [];
  state.deepSpaceUnits  = state.deepSpaceUnits  || [];
  state.deepSpaceLinks  = state.deepSpaceLinks  || [];
  // Bootstrap progression: evaluate completion, decorate toolbar, open
  // walkthrough on first run.
  if (typeof initProgression === 'function') initProgression();
  renderAll();
  // Kick off the Orbit rotation loop if we restored a session already in
  // Orbit view (setViewMode normally does this; init bypasses it).
  if (state.viewMode === 'space') startOrbitAnimation();
  // Wait one frame so canvas has its final size, then fit if no saved viewport
  if (!restored) requestAnimationFrame(fitView);
}

function seedExample() {
  // Three sites globally distributed
  const hq   = { id: uid(), type: 'office',     name: 'HQ — New York',    lat:  40.71, lng:  -74.00, address: 'New York, NY, USA',     notes: '', color: SITE_TYPES.office.color };
  const dc   = { id: uid(), type: 'datacenter', name: 'DC — Ashburn',     lat:  39.04, lng:  -77.49, address: 'Ashburn, VA, USA',      notes: 'Primary east-coast data center', color: SITE_TYPES.datacenter.color };
  const eu   = { id: uid(), type: 'branch',     name: 'Branch — London',  lat:  51.51, lng:   -0.13, address: 'London, UK',            notes: '', color: SITE_TYPES.branch.color };
  const noc  = { id: uid(), type: 'noc',        name: 'NOC — Bengaluru',  lat:  12.97, lng:   77.59, address: 'Bengaluru, IN',         notes: '24×7 monitoring', color: SITE_TYPES.noc.color };
  state.sites = [hq, dc, eu, noc];
  state.siteLinks = [
    { id: uid(), fromSiteId: hq.id, toSiteId: dc.id,  type: 'mpls',  label: 'MPLS core', bandwidth: '10 Gbps', sla: '99.99%' },
    { id: uid(), fromSiteId: hq.id, toSiteId: eu.id,  type: 'sdwan', label: 'SD-WAN',    bandwidth: '500 Mbps', sla: '99.9%' },
    { id: uid(), fromSiteId: hq.id, toSiteId: noc.id, type: 'vpn',   label: 'Mgmt VPN',  bandwidth: '100 Mbps', sla: '99.5%' },
    { id: uid(), fromSiteId: dc.id, toSiteId: eu.id,  type: 'leased',label: 'Leased',    bandwidth: '1 Gbps',  sla: '99.99%' },
  ];

  // Populate HQ network as the local example
  state.activeSiteId = hq.id;
  const internet = { id: uid(), type: 'internet', x: 100, y: 100, label: 'Internet', props: {}, siteId: hq.id };
  const fw       = { id: uid(), type: 'firewall', x: 300, y: 100, label: 'Edge FW', props: { ip: '198.51.100.1', cidr: '30', role: 'Perimeter FW' }, siteId: hq.id };
  const sw       = { id: uid(), type: 'l3switch', x: 500, y: 100, label: 'Core SW',  props: { ip: '10.0.0.1', cidr: '24', role: 'Core L3' }, siteId: hq.id };
  const srv      = { id: uid(), type: 'server',   x: 700, y:  40, label: 'Web Srv',  props: { ip: '10.0.1.10', cidr: '24', role: 'NGINX' }, siteId: hq.id };
  const db       = { id: uid(), type: 'database', x: 700, y: 180, label: 'Postgres', props: { ip: '10.0.1.20', cidr: '24', role: 'PostgreSQL 16' }, siteId: hq.id };
  const ws       = { id: uid(), type: 'workstation', x: 500, y: 280, label: 'User PC', props: { ip: '10.0.2.10', cidr: '24', role: 'Workstation' }, siteId: hq.id };
  state.devices = [internet, fw, sw, srv, db, ws];
  state.links = [
    { id: uid(), fromId: internet.id, toId: fw.id,  type: 'fiber',    label: 'WAN' },
    { id: uid(), fromId: fw.id,       toId: sw.id,  type: 'ethernet', label: '' },
    { id: uid(), fromId: sw.id,       toId: srv.id, type: 'ethernet', label: '' },
    { id: uid(), fromId: sw.id,       toId: db.id,  type: 'ethernet', label: '' },
    { id: uid(), fromId: sw.id,       toId: ws.id,  type: 'ethernet', label: '' },
  ];
  state.zones = [
    { id: uid(), type: 'internet', x:  60, y:  40, w: 200, h: 140, label: '', siteId: hq.id },
    { id: uid(), type: 'dmz',      x: 260, y:  40, w: 200, h: 140, label: '', siteId: hq.id },
    { id: uid(), type: 'internal', x: 460, y:  40, w: 320, h: 280, label: '', siteId: hq.id },
  ];

  // A second site (DC Ashburn) with a tiny server farm to demonstrate per-site networks
  const dcSwitch = { id: uid(), type: 'l3switch', x: 200, y: 200, label: 'DC Spine',  props: { ip: '10.10.0.1', cidr: '24', role: 'DC core' }, siteId: dc.id };
  const dcSrv1   = { id: uid(), type: 'server',   x: 400, y: 120, label: 'App-1',     props: { ip: '10.10.1.10', cidr: '24', role: 'App server' }, siteId: dc.id };
  const dcSrv2   = { id: uid(), type: 'server',   x: 400, y: 200, label: 'App-2',     props: { ip: '10.10.1.11', cidr: '24', role: 'App server' }, siteId: dc.id };
  const dcStor   = { id: uid(), type: 'storage',  x: 400, y: 280, label: 'SAN',       props: { ip: '10.10.1.20', cidr: '24', role: 'iSCSI SAN' }, siteId: dc.id };
  state.devices.push(dcSwitch, dcSrv1, dcSrv2, dcStor);
  state.links.push(
    { id: uid(), fromId: dcSwitch.id, toId: dcSrv1.id, type: 'fiber', label: '' },
    { id: uid(), fromId: dcSwitch.id, toId: dcSrv2.id, type: 'fiber', label: '' },
    { id: uid(), fromId: dcSwitch.id, toId: dcStor.id, type: 'fiber', label: '' },
  );

  // Example city: downtown Manhattan with traffic infrastructure
  const city = {
    id: uid(), name: 'Manhattan — Midtown',
    centerLat: 40.7549, centerLng: -73.9840,
    mapW: 2000, mapH: 1400,
    mapBackend: 'osm',      // streets-first; switch to "Image" in the city-bar for offline use
    imageUrl: '',
    notes: 'Example city with traffic infrastructure. Pick a backend in the city-bar above.',
  };
  state.cities = [city];
  state.activeCityId = city.id;
  // Seed a few endpoints in image coords (used if user switches to image backend)
  // and lat/lng (used by OSM)
  const eps = [
    { type: 'cabinet',       label: 'Cabinet TS-42',       x: 500,  y: 400, lat: 40.7589, lng: -73.9851, props: { cabinetId:'TS-42', ip:'10.20.1.1', power:'120V', notes:'' } },
    { type: 'trafficsignal', label: '42nd × 5th Ave',      x: 700,  y: 500, lat: 40.7547, lng: -73.9840, props: { intersection:'42nd & 5th Ave', controller:'TS-42', ip:'10.20.1.10', vlan:'30', notes:'' } },
    { type: 'trafficsignal', label: '42nd × 6th Ave',      x: 700,  y: 700, lat: 40.7555, lng: -73.9860, props: { intersection:'42nd & 6th Ave', controller:'TS-42', ip:'10.20.1.11', vlan:'30', notes:'' } },
    { type: 'trafficcam',    label: 'Cam 42-A',            x: 900,  y: 550, lat: 40.7541, lng: -73.9828, props: { ip:'10.20.2.10', stream:'rtsp://cam.example/42a', vlan:'40', notes:'' } },
    { type: 'vehiclesensor', label: 'Sensor 42-1',         x: 850,  y: 470, lat: 40.7544, lng: -73.9837, props: { sensorType:'Inductive loop', ip:'10.20.3.5', vlan:'50', notes:'' } },
    { type: 'messagesign',   label: 'VMS Times Sq',        x: 1100, y: 350, lat: 40.7589, lng: -73.9851, props: { ip:'10.20.4.1', controller:'TS-42', notes:'' } },
    { type: 'streetlight',   label: 'Light 42-N',          x: 750,  y: 600, lat: 40.7551, lng: -73.9845, props: { ip:'10.20.5.1', lumens:'5000', notes:'' } },
    { type: 'fiberjunction', label: 'Fiber FJ-42',         x: 600,  y: 500, lat: 40.7560, lng: -73.9845, props: { boxId:'FJ-42', strands:'48', notes:'' } },
    { type: 'building',      label: 'Substation 8',        x: 400,  y: 700, lat: 40.7530, lng: -73.9865, props: { address:'500 W 42nd St', ip:'10.20.0.1', notes:'' } },
  ];
  for (const e of eps) {
    state.endpoints.push({
      id: uid(), type: e.type, label: e.label,
      x: e.x, y: e.y, lat: e.lat, lng: e.lng,
      cityId: city.id, props: e.props,
    });
  }
  // Place the HQ site onto the city map so the validator sees a real
  // site↔city linkage (architecture brief: "linked site and city endpoint
  // are connected").
  const hqPlacement = {
    id: uid(), type: 'building', label: 'HQ — placed in NYC',
    x: 300, y: 300, lat: 40.7128, lng: -74.0060,
    cityId: city.id, siteId: hq.id, props: { address: 'HQ on city map' },
  };
  state.endpoints.push(hqPlacement);
  // Wire up some cable runs
  const ep = (label) => state.endpoints.find(x => x.label === label);
  state.cityLinks = [
    { id: uid(), fromEpId: ep('Cabinet TS-42').id,   toEpId: ep('42nd × 5th Ave').id, type: 'fiber_buried', label: 'F-1', length: '120 m' },
    { id: uid(), fromEpId: ep('Cabinet TS-42').id,   toEpId: ep('42nd × 6th Ave').id, type: 'fiber_buried', label: 'F-2', length: '180 m' },
    { id: uid(), fromEpId: ep('Cabinet TS-42').id,   toEpId: ep('Cam 42-A').id,       type: 'fiber_aerial', label: 'F-3', length: '210 m' },
    { id: uid(), fromEpId: ep('Cabinet TS-42').id,   toEpId: ep('Sensor 42-1').id,    type: 'copper',       label: 'C-1', length: '140 m' },
    { id: uid(), fromEpId: ep('Fiber FJ-42').id,     toEpId: ep('VMS Times Sq').id,   type: 'fiber_buried', label: 'F-4', length: '350 m' },
    { id: uid(), fromEpId: ep('Fiber FJ-42').id,     toEpId: ep('Cabinet TS-42').id,  type: 'fiber_buried', label: 'F-0 trunk', length: '40 m' },
    { id: uid(), fromEpId: ep('Substation 8').id,    toEpId: ep('Fiber FJ-42').id,    type: 'fiber_buried', label: '', length: '220 m' },
    { id: uid(), fromEpId: ep('Cabinet TS-42').id,   toEpId: ep('Light 42-N').id,     type: 'copper',       label: '',    length: '80 m' },
    // Linked HQ placement → city infrastructure (satisfies the new validator).
    { id: uid(), fromEpId: ep('HQ — placed in NYC').id, toEpId: ep('Fiber FJ-42').id, type: 'fiber_buried', label: 'HQ ↔ city fiber', length: '60 m' },
  ];

  // Seed a small space network: 4 LEO sats, 1 GEO relay, 2 ground stations, 1 station
  const TAU = Math.PI * 2;
  const leoSats = [0, 1, 2, 3].map(i => ({
    id: uid(), type: 'satellite_leo', label: `LEO-${i+1}`,
    angle: i * TAU / 4 + 0.2, orbit: 'leo',
    props: { norad:'', operator:'GreyNet', frequency:'Ka-band', notes:'' },
  }));
  const geoRelay = {
    id: uid(), type: 'relay', label: 'GEO Relay',
    angle: -TAU / 4, orbit: 'geo',
    props: { norad:'', operator:'GreyNet', frequency:'Ka-band', notes:'GEO relay over the Americas' },
  };
  const iss = {
    id: uid(), type: 'station', label: 'Station Alpha',
    angle: TAU / 6, orbit: 'iss',
    props: { norad:'25544', operator:'NASA', frequency:'S-band', notes:'' },
  };
  const gs1 = {
    id: uid(), type: 'ground_station', label: 'GS New York',
    angle: 0, x: 240, y: 0,
    props: { name:'GS-NY', lat:'40.71', lng:'-74.00', dishM:'4.5', notes:'' },
  };
  const gs2 = {
    id: uid(), type: 'ground_station', label: 'GS Tokyo',
    angle: Math.PI, x: -240, y: 0,
    props: { name:'GS-TKY', lat:'35.68', lng:'139.65', dishM:'9.0', notes:'' },
  };
  state.spaceAssets = [...leoSats, geoRelay, iss, gs1, gs2];
  state.spaceLinks = [
    { id: uid(), fromAssetId: leoSats[0].id, toAssetId: leoSats[1].id, type: 'laser_isl', label: '' },
    { id: uid(), fromAssetId: leoSats[1].id, toAssetId: leoSats[2].id, type: 'laser_isl', label: '' },
    { id: uid(), fromAssetId: leoSats[2].id, toAssetId: leoSats[3].id, type: 'laser_isl', label: '' },
    { id: uid(), fromAssetId: leoSats[3].id, toAssetId: leoSats[0].id, type: 'laser_isl', label: '' },
    { id: uid(), fromAssetId: gs1.id,        toAssetId: leoSats[0].id, type: 'uplink',    label: 'cmd' },
    { id: uid(), fromAssetId: gs2.id,        toAssetId: leoSats[2].id, type: 'uplink',    label: 'cmd' },
    { id: uid(), fromAssetId: leoSats[0].id, toAssetId: geoRelay.id,   type: 'rf_isl',    label: '' },
    { id: uid(), fromAssetId: iss.id,        toAssetId: gs1.id,        type: 'downlink',  label: 'telemetry' },
  ];

  // Seed a small deep-space mesh anchored to real planets, with a handoff
  // back to a ground station so the validator sees a full Local→Deep Space
  // path on the demo.
  const dsRelay = {
    id: uid(), type: 'ds_relay', label: 'Mars Relay-1',
    anchor: 'mars', x: 0, y: 0, anchorOffX: 30, anchorOffY: 0,
    props: { operator: 'GreyNet DSN', notes: 'Anchored to Mars' },
  };
  const dsProbe = {
    id: uid(), type: 'ds_probe', label: 'Jupiter Probe',
    anchor: 'jupiter', x: 0, y: 0, anchorOffX: 25, anchorOffY: 20,
    props: { operator: 'GreyNet', notes: 'Outer-system science probe' },
  };
  const dsArchive = {
    id: uid(), type: 'ds_archive', label: 'Earth-L2 Archive',
    anchor: 'jwst', x: 0, y: 0,
    props: { operator: 'GreyNet', notes: 'Cold archive at Earth-Sun L2' },
  };
  state.deepSpaceUnits = [dsRelay, dsProbe, dsArchive];
  state.deepSpaceLinks = [
    { id: uid(), fromId: dsProbe.id, toId: dsRelay.id, type: 'ds_relay', label: 'Jupiter→Mars relay' },
    { id: uid(), fromId: dsRelay.id, toId: gs1.id,     type: 'ds_dsn',   label: 'Mars→Earth DSN' },
    { id: uid(), fromId: dsArchive.id, toId: gs2.id,   type: 'ds_dsn',   label: 'L2→Earth DSN' },
  ];
}

init().catch(err => {
  console.error('GreyNet failed to initialize', err);
  alert('GreyNet failed to initialize: ' + (err.message || String(err)));
});
