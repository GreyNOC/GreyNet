"use strict";



/* =========================================================================
   STATE
   ========================================================================= */
const state = {
  devices: [],     // { id, type, x, y, label, props, siteId }
  links: [],       // { id, fromId, toId, type, label }
  zones: [],       // { id, type, x, y, w, h, label, siteId }
  sites: [],       // { id, type, name, lat, lng, address, notes, color }
  siteLinks: [],   // { id, fromSiteId, toSiteId, type, bandwidth, label, sla }
  cities: [],      // { id, name, centerLat, centerLng, imageUrl, mapBackend, mapW, mapH, notes }
  endpoints: [],   // { id, type, x, y, label, props, cityId }
  cityLinks: [],   // { id, fromEpId, toEpId, type, label, length }
  view: { pan: { x: 0, y: 0 }, zoom: 1 },
  worldView: { pan: { x: 0, y: 0 }, zoom: 0.3 }, // separate viewport for world mode
  cityView:  { pan: { x: 0, y: 0 }, zoom: 0.6 }, // separate viewport for city mode
  spaceView: { pan: { x: 0, y: 0 }, zoom: 0.5 }, // separate viewport for space mode
  deepView:  { pan: { x: 0, y: 0 }, zoom: 0.5 }, // separate viewport for deep-space mode
  viewMode: 'local',    // 'local' | 'world' | 'city' | 'space' | 'deepspace'
  activeSiteId: null,   // which site's network is being designed in local view
  activeCityId: null,   // which city is being designed in city view
  activeEndpointType: null, // set when user picks an endpoint to place
  activeCitySiteId: null,   // set when user picks an existing local site to place on a city map
  activeCityLinkType: 'fiber_buried',
  activeSpaceAssetType: null,    // set when user picks a space asset to place
  activeSpaceLinkType: 'laser_isl',
  spaceAssets: [],   // { id, type, x, y, label, angle, orbit, props }
  spaceLinks: [],    // { id, fromAssetId, toAssetId, type, label }
  // === Planet-level global infrastructure (placeable on world view) ===
  activePlanetInfraType: null,
  planetInfra: [],   // { id, type, label, lat, lng, props }
  // === Deep-space placeable units (in addition to the link-budget studio) ===
  activeDeepUnitType: null,
  activeDeepLinkType: 'ds_laser',
  deepSpaceUnits: [],  // { id, type, label, x, y, anchor, props }
  deepSpaceLinks: [],  // { id, fromId, toId, type, label }
  // === Section progression ===
  // Tracks which sections are unlocked/completed. Persisted with the diagram.
  progression: {
    walkthroughDone: false,         // true once the user finishes the intro walkthrough
    walkthroughStep: 0,             // current step in walkthrough
    completed: {                    // user has met the completion criteria for the section
      local: false, city: false, planet: false, orbit: false, deepspace: false,
    },
    unlocked: {                     // section is accessible from the toolbar
      local: true, city: false, planet: false, orbit: false, deepspace: false,
    },
  },
  hasGmapsApiKey: false,
  hasAiKeys: { anthropic: false, openai: false },
  aiModel: { anthropic: '', openai: '' },
  aiProvider: 'anthropic',
  selectedIds: new Set(),
  mode: 'select', // 'select' | 'connect' | 'zone'
  pendingZoneType: null,
  pendingConnectId: null,
  activeLinkType: 'ethernet',
  activeSiteLinkType: 'wan',
  activeNewSiteType: null,  // when set, next world-canvas click drops this site type
  snapToGrid: true,
  gridSize: 20,
  showGrid: true,
  liveMap: true,

  // === DEEP SPACE LINK BUDGET ===
  comms: {
    sourceId: 'dsn70',          // station preset id or 'custom'
    targetId: 'mars',           // planet/spacecraft id or 'custom'
    customTargetKm: 225e6,      // used when targetId === 'custom'
    txPowerW: 20000,            // 20 kW (DSN-class default)
    txGainDbi: 73,              // 70m dish at X-band
    rxGainDbi: 47,              // 3m HGA at X-band
    freqGHz: 8.4,               // X-band downlink
    dataBps: 6_000_000,         // 6 Mbps
    noiseTempK: 21,             // very cold LNA
    modFec: 'qpsk_12_ldpc',     // QPSK 1/2 LDPC default
    atmLossDb: 0.3,             // small atmospheric loss
    pointingLossDb: 0.5,
    epochMs: Date.now(),        // for ephemeris (refreshed on render)
    epochOverrideMs: null,      // when set, ephemeris is frozen at this instant
    activePresetId: null,       // highlighted scenario preset, if any
  },
};

const history = {
  past: [],
  future: [],
  max: 100,
};

function snapshot() {
  return JSON.stringify({
    devices: state.devices, links: state.links, zones: state.zones,
    sites: state.sites, siteLinks: state.siteLinks,
    cities: state.cities, endpoints: state.endpoints, cityLinks: state.cityLinks,
    spaceAssets: state.spaceAssets, spaceLinks: state.spaceLinks,
    planetInfra: state.planetInfra,
    deepSpaceUnits: state.deepSpaceUnits, deepSpaceLinks: state.deepSpaceLinks,
    progression: state.progression, comms: state.comms,
    activeSiteId: state.activeSiteId, activeCityId: state.activeCityId, viewMode: state.viewMode,
  });
}
function restoreSnapshot(s) {
  const d = JSON.parse(s);
  state.devices = d.devices || []; state.links = d.links || []; state.zones = d.zones || [];
  state.sites = d.sites || state.sites; state.siteLinks = d.siteLinks || [];
  state.cities = d.cities || state.cities; state.endpoints = d.endpoints || []; state.cityLinks = d.cityLinks || [];
  state.spaceAssets = d.spaceAssets || []; state.spaceLinks = d.spaceLinks || [];
  state.planetInfra = d.planetInfra || [];
  state.deepSpaceUnits = d.deepSpaceUnits || []; state.deepSpaceLinks = d.deepSpaceLinks || [];
  if (d.comms) state.comms = d.comms;
  if (d.progression) state.progression = d.progression;
  state.activeSiteId = d.activeSiteId || state.activeSiteId;
  state.activeCityId = d.activeCityId || state.activeCityId;
  state.viewMode = d.viewMode || state.viewMode;
  state.selectedIds.clear();
}
function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > history.max) history.past.shift();
  history.future.length = 0;
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  restoreSnapshot(history.past.pop());
  renderAll();
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restoreSnapshot(history.future.pop());
  renderAll();
}


/* =========================================================================
   DOM REFERENCES
   ========================================================================= */
const dom = {
  app:           document.getElementById('app'),
  toolbar:       document.getElementById('toolbar'),
  palette:       document.getElementById('palette'),
  svg:           document.getElementById('canvas'),
  world:         document.getElementById('world'),
  gridBg:        document.getElementById('grid-bg'),
  zonesLayer:    document.getElementById('zones-layer'),
  linksLayer:    document.getElementById('links-layer'),
  devicesLayer:  document.getElementById('devices-layer'),
  worldmapLayer: document.getElementById('worldmap-layer'),
  sitesLayer:    document.getElementById('sites-layer'),
  sitelinksLayer:document.getElementById('sitelinks-layer'),
  overlayLayer:  document.getElementById('overlay-layer'),
  siteBar:       document.getElementById('site-bar'),
  sbContextLabel:document.getElementById('sb-context-label'),
  sbActiveSiteName: document.getElementById('sb-active-site-name'),
  sbIcon:        document.getElementById('sb-icon'),
  sbSwitcher:    document.getElementById('sb-switcher'),
  sbSwitchBtn:   document.getElementById('sb-switch-btn'),
  sbSwitchMenu:  document.getElementById('sb-switch-menu'),
  sbModeHint:    document.getElementById('sb-mode-hint'),
  cityBarControls: document.getElementById('city-bar-controls'),
  cityBackendSel:  document.getElementById('city-backend-sel'),
  cityNewBtn:      document.getElementById('city-new-btn'),
  cityImageBtn:    document.getElementById('city-image-btn'),
  cityImageInput:  document.getElementById('city-image-input'),
  cityOnlineHint:  document.getElementById('city-online-hint'),
  viewToggleBtn: document.getElementById('view-toggle-btn'),
  emptyState:    document.getElementById('empty-state'),
  emptyStateTitle: document.getElementById('empty-state-title'),
  emptyStateMsg: document.getElementById('empty-state-msg'),
  emptyStateActions: document.getElementById('empty-state-actions'),
  citymapLayer:  document.getElementById('citymap-layer'),
  endpointsLayer:document.getElementById('endpoints-layer'),
  citylinksLayer:document.getElementById('citylinks-layer'),
  spacemapLayer: document.getElementById('spacemap-layer'),
  spaceassetsLayer: document.getElementById('spaceassets-layer'),
  spacelinksLayer:  document.getElementById('spacelinks-layer'),
  deepspaceLayer:   document.getElementById('deepspace-layer'),
  deepspaceLinkLayer: document.getElementById('deepspace-link-layer'),
  tileMap:       document.getElementById('tile-map'),
  prBody:        document.getElementById('pr-body'),
  prType:        document.getElementById('pr-type'),
  prActions:     document.getElementById('pr-actions'),
  sbCoords:      document.getElementById('sb-coords'),
  sbZoom:        document.getElementById('sb-zoom'),
  sbCounts:      document.getElementById('sb-counts'),
  modePill:      document.getElementById('mode-pill'),
  gridBtn:       document.getElementById('grid-btn'),
  snapBtn:       document.getElementById('snap-btn'),
  zoomResetBtn:  document.getElementById('zoom-reset-btn'),
  warningsTray:  document.getElementById('warnings-tray'),
  warningsCount: document.getElementById('warnings-count'),
  warningsBody:  document.getElementById('warnings-body'),
  fileInput:     document.getElementById('file-input'),
  planetInfraLayer:    document.getElementById('planetinfra-layer'),
  deepSpaceUnitsLayer: document.getElementById('deepspace-units-layer'),
  deepSpaceUnitlinksLayer: document.getElementById('deepspace-unitlinks-layer'),
  walkthrough:    document.getElementById('walkthrough'),
  walkthroughBody:document.getElementById('walkthrough-body'),
  walkthroughFoot:document.getElementById('walkthrough-foot'),
  progressTray:   document.getElementById('progress-tray'),
};
