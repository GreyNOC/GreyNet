"use strict";

/* =========================================================================
   GREYNET — DIAGRAM SCHEMA MIGRATIONS

   Every save the app writes carries:
     { app: "GreyNet", schemaVersion: N, version: legacyN, ... }

   `version` is the old field; `schemaVersion` is the new canonical one.
   This module bumps any loaded diagram up to CURRENT_SCHEMA_VERSION, then
   the existing sanitizeDiagram() does the per-field validation.

   Adding a new migration:
     1) push a function into MIGRATIONS in version order
     2) bump CURRENT_SCHEMA_VERSION
     3) document the change in CHANGELOG.md

   Migrations MUST be idempotent and pure (no side effects beyond returning
   the new object).
   ========================================================================= */

(function (root) {

  const CURRENT_SCHEMA_VERSION = 5;

  // Each entry transforms `(N → N+1)`. Index `i` migrates v(i+1) → v(i+2).
  const MIGRATIONS = [
    // 1 → 2  (legacy: introduced planetInfra)
    function migrate1to2(d) {
      d.planetInfra = Array.isArray(d.planetInfra) ? d.planetInfra : [];
      return d;
    },
    // 2 → 3  (legacy: introduced deep-space placeable mesh)
    function migrate2to3(d) {
      d.deepSpaceUnits = Array.isArray(d.deepSpaceUnits) ? d.deepSpaceUnits : [];
      d.deepSpaceLinks = Array.isArray(d.deepSpaceLinks) ? d.deepSpaceLinks : [];
      return d;
    },
    // 3 → 4  (legacy: introduced section progression)
    function migrate3to4(d) {
      if (!d.progression || typeof d.progression !== 'object') {
        d.progression = {
          walkthroughDone: false, walkthroughStep: 0,
          completed: { local:false, city:false, planet:false, orbit:false, deepspace:false },
          unlocked:  { local:true,  city:false, planet:false, orbit:false, deepspace:false },
        };
      }
      return d;
    },
    // 4 → 5  (current: normalize view names, repair orphan links, drop legacy
    //         viewModes, add schemaVersion. Preserves comms + city image data.)
    function migrate4to5(d) {
      // Normalize legacy view names: 'space' is internal, 'orbit' the section.
      // We don't rename here (would break too much), just sanity-check.
      const validViews = new Set(['local','world','city','space','deepspace']);
      if (!validViews.has(d.viewMode)) d.viewMode = 'local';

      // Repair missing progression.unlocked entries (e.g. very old saves)
      if (d.progression && d.progression.unlocked) {
        for (const s of ['local','city','planet','orbit','deepspace']) {
          if (typeof d.progression.unlocked[s] !== 'boolean') {
            d.progression.unlocked[s] = (s === 'local');
          }
          if (typeof d.progression.completed[s] !== 'boolean') {
            d.progression.completed[s] = false;
          }
        }
      }

      // Remove orphan links (defensive — sanitizeDiagram does this too, but
      // doing it here lets older saves migrate cleanly without losing useful
      // shape data). Coerce every collection to an array first: a malicious or
      // hand-edited file can set these to a string/number/object, and calling
      // .map()/.filter() on a non-array would crash the whole import.
      const arr = (v) => Array.isArray(v) ? v : [];
      const idOf = (x) => (x && typeof x === 'object') ? x.id : undefined;
      const deviceIds = new Set(arr(d.devices).map(idOf));
      const epIds     = new Set(arr(d.endpoints).map(idOf));
      const siteIds   = new Set(arr(d.sites).map(idOf));
      const assetIds  = new Set(arr(d.spaceAssets).map(idOf));
      const dsIds     = new Set(arr(d.deepSpaceUnits).map(idOf));

      d.links     = arr(d.links).filter(l => l && deviceIds.has(l.fromId) && deviceIds.has(l.toId));
      d.siteLinks = arr(d.siteLinks).filter(l => l && siteIds.has(l.fromSiteId) && siteIds.has(l.toSiteId));
      d.cityLinks = arr(d.cityLinks).filter(l => l && epIds.has(l.fromEpId) && epIds.has(l.toEpId));
      d.spaceLinks = arr(d.spaceLinks).filter(l => l && assetIds.has(l.fromAssetId) && assetIds.has(l.toAssetId));
      // Deep-space links may also cross-reference orbit assets (handoff).
      d.deepSpaceLinks = arr(d.deepSpaceLinks).filter(l =>
        l && (dsIds.has(l.fromId) || assetIds.has(l.fromId)) &&
        (dsIds.has(l.toId)   || assetIds.has(l.toId))
      );

      d.schemaVersion = 5;
      return d;
    },
  ];

  /**
   * Migrate a loaded diagram up to CURRENT_SCHEMA_VERSION.
   * Returns the migrated diagram. Throws if the input is not a GreyNet diagram.
   */
  function migrateDiagram(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('migrateDiagram: input must be an object');
    }
    if (input.app !== 'GreyNet' && input.app !== 'gREYnET') {
      throw new Error('Not a GreyNet diagram (app field missing/wrong).');
    }

    // Determine starting version. Old saves used `version`; new ones use
    // `schemaVersion`. Prefer schemaVersion when present.
    let v;
    if (Number.isFinite(input.schemaVersion)) {
      v = Math.max(1, Math.min(CURRENT_SCHEMA_VERSION, Math.floor(input.schemaVersion)));
    } else if (Number.isFinite(input.version)) {
      v = Math.max(1, Math.min(CURRENT_SCHEMA_VERSION, Math.floor(input.version)));
    } else {
      v = 1;
    }

    // Clone so we don't mutate caller's object.
    let d;
    try { d = JSON.parse(JSON.stringify(input)); }
    catch (e) { throw new Error('migrateDiagram: input not JSON-serializable'); }

    // Run migrations in order from v -> v+1 -> ... -> current
    for (let from = v; from < CURRENT_SCHEMA_VERSION; from++) {
      const fn = MIGRATIONS[from - 1];
      if (typeof fn === 'function') {
        try { d = fn(d) || d; }
        catch (e) {
          throw new Error(`Migration v${from}→v${from+1} failed: ${e.message}`);
        }
      }
    }

    d.app = 'GreyNet';
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    return d;
  }

  /**
   * Return the body that should be written to disk. Stamps both
   * schemaVersion (new) and version (legacy) so older clients fail
   * gracefully (they see a higher version and warn / sanitize).
   */
  function stampDiagram(body) {
    return Object.assign({}, body, {
      app: 'GreyNet',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      version: CURRENT_SCHEMA_VERSION,
    });
  }

  root.GREYNET_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  root.migrateDiagram = migrateDiagram;
  root.stampDiagram   = stampDiagram;

  root.GreyNetPersistence = Object.assign(root.GreyNetPersistence || {}, {
    SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
    migrate: migrateDiagram,
    stamp:   stampDiagram,
  });

})(typeof window !== 'undefined' ? window : globalThis);
