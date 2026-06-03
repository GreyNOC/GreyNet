"use strict";

/* =========================================================================
   GREYNET — DEEP SPACE MESH HELPERS

   Layer-specific utilities for the Deep Space view that are too domain-
   specific to live in app.js. All functions are pure and read state passed
   in by the caller; no mutation.

   Public surface (window):
     dsMeshSummary(state)        — totals + handoff count
     dsUnitMetrics(unit, state)  — latency/range/risk for a single unit
     dsLinkMetrics(link, state)  — distance/latency/path estimate
     dsPathBackToHome(unitId, state)
                                 — bfs hops back to local/planet/orbit
     dsExportMissionSummary(state)
                                 — { units, links, paths, risks } object
     renderDeepSpaceMeshPanel(rootEl, state)
                                 — draws the side panel into rootEl
   ========================================================================= */

(function (root) {

  // ---------- Constants & helpers -----------------------------------------

  // Speed of light (km/s) — used to estimate one-way latency when we have an
  // estimated range.
  const C_KMS = 299792.458;

  // See orbit-metrics.js for why we go through `new Function` here.
  const _cache = {};
  function _g(name) {
    if (_cache[name] !== undefined) return _cache[name];
    let v = null;
    try { /* eslint-disable-next-line no-new-func */
      v = (new Function('try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : null; } catch (_) { return null; }'))();
    } catch (_) { v = null; }
    _cache[name] = v;
    return v;
  }

  function _au(unit, state) {
    if (!unit.anchor) return null;
    const tgts = _g('DS_TARGETS');
    if (!tgts || !tgts[unit.anchor]) return null;
    const t = tgts[unit.anchor];
    if (t.kind === 'planet' && Number.isFinite(t.a)) return t.a;
    if (t.kind === 'satellite' && t.distKm) return t.distKm / 149_597_870.7;
    if (t.kind === 'spacecraft' && t.distKm) return t.distKm / 149_597_870.7;
    return null;
  }

  function _typeDef(type) {
    return (_g('DEEP_SPACE_UNIT_TYPES') || {})[type] || null;
  }
  function _linkDef(type) {
    return (_g('DEEP_SPACE_LINK_TYPES') || {})[type] || null;
  }

  // ---------- Per-unit metrics --------------------------------------------

  function dsUnitMetrics(unit, state) {
    const def = _typeDef(unit.type);
    const auRange = _au(unit, state);
    let oneWayLatencySec = null;
    if (auRange != null) {
      const km = auRange * 149_597_870.7;
      oneWayLatencySec = km / C_KMS;
    } else if (def && def.stats && Number.isFinite(def.stats.range_au)) {
      const km = def.stats.range_au * 149_597_870.7;
      oneWayLatencySec = km / C_KMS;
    }
    return {
      type: unit.type,
      label: unit.label || (def ? def.label : unit.type),
      anchor: unit.anchor || null,
      designRangeAU: def ? (def.stats ? def.stats.range_au : null) : null,
      bandwidth:     def ? (def.stats ? def.stats.bandwidth : null) : null,
      powerW:        def ? (def.stats ? def.stats.power_w  : null) : null,
      security:      def ? (def.stats ? def.stats.security : null) : null,
      estRangeAU:    auRange,
      oneWayLatencySec,
      risk: _unitRisk(unit, state),
      health: _unitHealth(unit, state),
    };
  }

  function _unitRisk(unit, state) {
    // Coarse risk scoring (lower = better).
    let r = 0;
    if (!unit.anchor) r += 1;          // free-floating
    const linked = (state.deepSpaceLinks || []).some(l => l.fromId === unit.id || l.toId === unit.id);
    if (!linked) r += 2;
    const def = _typeDef(unit.type);
    if (def && def.stats && def.stats.range_au > 50) r += 1; // long range
    return r;
  }

  function _unitHealth(unit, state) {
    const risk = _unitRisk(unit, state);
    if (risk >= 4) return 'critical';
    if (risk === 3) return 'degraded';
    if (risk === 2) return 'warning';
    if (risk === 1) return 'nominal';
    return 'nominal';
  }

  // ---------- Per-link metrics --------------------------------------------

  function dsLinkMetrics(link, state) {
    const a = (state.deepSpaceUnits || []).find(u => u.id === link.fromId)
           || (state.spaceAssets    || []).find(x => x.id === link.fromId);
    const b = (state.deepSpaceUnits || []).find(u => u.id === link.toId)
           || (state.spaceAssets    || []).find(x => x.id === link.toId);
    const def = _linkDef(link.type);
    if (!a || !b) {
      return { type: link.type, valid: false, reason: 'Endpoint missing', label: def ? def.label : link.type };
    }
    // Use anchor AU difference as a coarse range estimate.
    const auA = _au(a, state), auB = _au(b, state);
    let auEstimate = null;
    if (auA != null && auB != null) auEstimate = Math.abs(auA - auB);
    let oneWayLatencySec = null;
    if (auEstimate != null) {
      const km = auEstimate * 149_597_870.7;
      oneWayLatencySec = km / C_KMS;
    }
    return {
      type: link.type,
      label: def ? def.label : link.type,
      from: a.label || a.id,
      to:   b.label || b.id,
      crossDomain: !!(state.spaceAssets || []).find(x => x.id === a.id || x.id === b.id),
      estRangeAU: auEstimate,
      oneWayLatencySec,
      valid: true,
    };
  }

  // ---------- Path back through orbit/planet/local ------------------------

  function dsPathBackToHome(unitId, state) {
    const dsUnits = state.deepSpaceUnits || [];
    const dsLinks = state.deepSpaceLinks || [];
    const orbitAssets = state.spaceAssets || [];
    const orbitLinks  = state.spaceLinks  || [];
    const planetSites = state.sites || [];

    // BFS over DS units → cross-domain link → orbit asset → ground_station
    // → planet site (any).
    const visited = new Set([unitId]);
    const queue = [{ id: unitId, hops: [unitId] }];
    while (queue.length) {
      const cur = queue.shift();
      // DS links from cur
      for (const l of dsLinks) {
        let nextId = null;
        if (l.fromId === cur.id) nextId = l.toId;
        else if (l.toId === cur.id) nextId = l.fromId;
        if (!nextId || visited.has(nextId)) continue;
        visited.add(nextId);
        const path = cur.hops.concat([nextId]);
        // Hit orbit asset?
        const orbit = orbitAssets.find(a => a.id === nextId);
        if (orbit) {
          if (orbit.type === 'ground_station') {
            // Ground stations are at the planet boundary → consider it
            // reaching planet too.
            return { reached: 'planet', hops: path, terminus: orbit };
          }
          // Need to walk orbit further to find a ground station.
          const orbReach = _orbitToGround(orbit.id, orbitAssets, orbitLinks, new Set([orbit.id]));
          if (orbReach) {
            return { reached: 'planet', hops: path.concat(orbReach.hops.slice(1)), terminus: orbReach.terminus };
          }
          return { reached: 'orbit', hops: path, terminus: orbit };
        }
        queue.push({ id: nextId, hops: path });
      }
    }
    // No reach
    return { reached: 'none', hops: [unitId], terminus: null };
  }

  function _orbitToGround(startId, assets, links, visited) {
    const queue = [{ id: startId, hops: [startId] }];
    while (queue.length) {
      const cur = queue.shift();
      for (const l of links) {
        let nextId = null;
        if (l.fromAssetId === cur.id) nextId = l.toAssetId;
        else if (l.toAssetId === cur.id) nextId = l.fromAssetId;
        if (!nextId || visited.has(nextId)) continue;
        visited.add(nextId);
        const a = assets.find(x => x.id === nextId);
        if (!a) continue;
        if (a.type === 'ground_station') return { hops: cur.hops.concat([nextId]), terminus: a };
        queue.push({ id: nextId, hops: cur.hops.concat([nextId]) });
      }
    }
    return null;
  }

  // ---------- Mesh-level summary ------------------------------------------

  function dsMeshSummary(state) {
    const units = state.deepSpaceUnits || [];
    const links = state.deepSpaceLinks || [];
    const orbitAssets = state.spaceAssets || [];
    const orbitIds = new Set(orbitAssets.map(a => a.id));

    const handoffs = links.filter(l => orbitIds.has(l.fromId) || orbitIds.has(l.toId));
    const anchored = units.filter(u => u.anchor);
    const reachable = units.filter(u => dsPathBackToHome(u.id, state).reached !== 'none');

    return {
      units: units.length,
      anchored: anchored.length,
      links: links.length,
      handoffs: handoffs.length,
      reachableCount: reachable.length,
      orphanedCount: units.length - reachable.length,
    };
  }

  // ---------- Exportable mission summary ----------------------------------

  function dsExportMissionSummary(state) {
    const units = state.deepSpaceUnits || [];
    const links = state.deepSpaceLinks || [];
    return {
      generatedAt: new Date().toISOString(),
      summary: dsMeshSummary(state),
      units: units.map(u => Object.assign({ id: u.id }, dsUnitMetrics(u, state),
                                          { path: dsPathBackToHome(u.id, state) })),
      links: links.map(l => Object.assign({ id: l.id }, dsLinkMetrics(l, state))),
    };
  }

  // ---------- Panel renderer ----------------------------------------------

  function renderDeepSpaceMeshPanel(rootEl, state) {
    if (!rootEl) return;
    const esc = root.escapeHtmlSafe || root.escapeHtml || ((s) => String(s));
    const summary = dsMeshSummary(state);
    const units = state.deepSpaceUnits || [];
    const links = state.deepSpaceLinks || [];

    const unitRows = units.map(u => {
      const m = dsUnitMetrics(u, state);
      const path = dsPathBackToHome(u.id, state);
      const reached = path.reached;
      const dot = reached === 'planet' ? '#6fcf97' : reached === 'orbit' ? '#f5c84c' : '#ff6b6b';
      const lat = m.oneWayLatencySec != null
        ? (m.oneWayLatencySec >= 60
            ? (m.oneWayLatencySec / 60).toFixed(1) + ' min'
            : m.oneWayLatencySec.toFixed(1) + ' s')
        : '—';
      const rng = m.estRangeAU != null ? m.estRangeAU.toFixed(2) + ' AU' : '—';
      return `<tr>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px"></span>${esc(m.label)}</td>
        <td>${esc(u.anchor || '—')}</td>
        <td>${esc(lat)}</td>
        <td>${esc(rng)}</td>
        <td>${esc(m.health)}</td>
        <td>${esc(reached)}</td>
      </tr>`;
    }).join('');

    const linkRows = links.map(l => {
      const m = dsLinkMetrics(l, state);
      const lat = m.oneWayLatencySec != null
        ? (m.oneWayLatencySec >= 60
            ? (m.oneWayLatencySec / 60).toFixed(1) + ' min'
            : m.oneWayLatencySec.toFixed(1) + ' s')
        : '—';
      return `<tr>
        <td>${esc(m.from)}</td>
        <td>${esc(m.to)}</td>
        <td>${esc(m.label)}</td>
        <td>${esc(lat)}</td>
        <td>${esc(m.crossDomain ? 'handoff' : '—')}</td>
      </tr>`;
    }).join('');

    // Build with innerHTML once — content is all escaped above.
    rootEl.innerHTML = `
      <div class="ds-mesh-summary" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:12px">
        <div><b>${summary.units}</b> units</div>
        <div><b>${summary.anchored}</b> anchored</div>
        <div><b>${summary.links}</b> links</div>
        <div><b>${summary.handoffs}</b> handoffs</div>
        <div style="color:${summary.orphanedCount ? '#ff8c42' : '#6fcf97'}">
          <b>${summary.orphanedCount}</b> orphaned
        </div>
      </div>
      <div style="overflow:auto;max-height:300px;border:1px solid #1f2937;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#0f172a;text-align:left">
            <th style="padding:6px">Unit</th>
            <th style="padding:6px">Anchor</th>
            <th style="padding:6px">Latency</th>
            <th style="padding:6px">Range</th>
            <th style="padding:6px">Health</th>
            <th style="padding:6px">Reaches</th>
          </tr></thead>
          <tbody>${unitRows || '<tr><td colspan="6" style="padding:8px;color:#64748b">No deep-space units placed.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;overflow:auto;max-height:200px;border:1px solid #1f2937;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#0f172a;text-align:left">
            <th style="padding:6px">From</th>
            <th style="padding:6px">To</th>
            <th style="padding:6px">Type</th>
            <th style="padding:6px">Latency</th>
            <th style="padding:6px">Domain</th>
          </tr></thead>
          <tbody>${linkRows || '<tr><td colspan="5" style="padding:8px;color:#64748b">No deep-space links.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button data-action="ds-export-mission" class="tb-btn">Export mission summary (JSON)</button>
      </div>
    `;

    const exportBtn = rootEl.querySelector('[data-action="ds-export-mission"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = dsExportMissionSummary(state);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `greynet-deep-space-mission-${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }
  }

  root.dsMeshSummary = dsMeshSummary;
  root.dsUnitMetrics = dsUnitMetrics;
  root.dsLinkMetrics = dsLinkMetrics;
  root.dsPathBackToHome = dsPathBackToHome;
  root.dsExportMissionSummary = dsExportMissionSummary;
  root.renderDeepSpaceMeshPanel = renderDeepSpaceMeshPanel;

})(typeof window !== 'undefined' ? window : globalThis);
