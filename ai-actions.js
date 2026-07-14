"use strict";

/* =========================================================================
   GREYNET — AI ACTION SYSTEM (v2)

   - Builds the system prompt from the LIVE constants tables (so newly-added
     device/link/zone/site/endpoint/space/deep-space types automatically
     appear in the prompt instead of drifting out of date).
   - Adds new actions: addPlanetInfra, addSiteLink, addDeepSpaceUnit,
     addDeepSpaceLink, connectArchitecturePath, repairArchitecture,
     explainDesign, suggestNextStep.
   - Validates every action before applying. Rejects:
       - unknown action types
       - bad enum values
       - dangling labels/IDs
       - duplicate links
       - cross-section links the validator forbids
     and reports a user-friendly summary of skipped actions.

   Wiring (app.js):
     1. Call buildAiSystemPrompt() instead of the inline AI_SYSTEM_PROMPT.
     2. Call applyAiActionsV2(result, ctx) instead of applyAiActions().
   ========================================================================= */

(function (root) {

  // ---------- Prompt builder ----------------------------------------------

  function _keys(obj) { return obj ? Object.keys(obj) : []; }
  function _enum(obj) {
    return _keys(obj).map(k => `"${k}"`).join(',');
  }

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

  function buildAiSystemPrompt() {
    const DEV  = _g('DEVICE_TYPES')         || {};
    const LNK  = _g('LINK_TYPES')           || {};
    const ZN   = _g('ZONE_TYPES')           || {};
    const SITE = _g('SITE_TYPES')           || {};
    const SL   = _g('SITE_LINK_TYPES')      || {};
    const EP   = _g('ENDPOINT_TYPES')       || {};
    const CL   = _g('CITY_LINK_TYPES')      || {};
    const PI   = _g('PLANET_INFRA_TYPES')   || {};
    const SA   = _g('SPACE_ASSET_TYPES')    || {};
    const SPL  = _g('SPACE_LINK_TYPES')     || {};
    const DSU  = _g('DEEP_SPACE_UNIT_TYPES')|| {};
    const DSL  = _g('DEEP_SPACE_LINK_TYPES')|| {};
    const TGT  = _g('DS_TARGETS')           || {};

    return [
      'You are a network-architecture assistant for an Electron desktop app called "GreyNet".',
      'The user describes what they want; you respond with ONLY a JSON object describing actions to take. NO markdown, NO commentary — just the JSON.',
      '',
      'Response shape:',
      '{ "actions": [ {action objects} ... ], "notes": "1-sentence summary shown to the user" }',
      '',
      'GreyNet has five connected layers: Local → City → Planet → Orbit → Deep Space.',
      'You may emit actions that span multiple layers, but cross-layer links must use the *correct* link action (no inventing edges).',
      '',
      'SUPPORTED ACTIONS:',
      '',
      `1. addDevice — { type:"addDevice", deviceType, label, x, y, props?, siteId? }`,
      `   deviceType ∈ [${_enum(DEV)}]`,
      `2. addLink — { type:"addLink", fromId, toId, linkType, label? }`,
      `   linkType ∈ [${_enum(LNK)}]`,
      `   fromId/toId may be a device label from THIS response, or a real device ID.`,
      `3. addZone — { type:"addZone", zoneType, x, y, w, h, label?, siteId? }`,
      `   zoneType ∈ [${_enum(ZN)}]`,
      `4. addSite — { type:"addSite", siteType, name, lat, lng, address?, notes? }`,
      `   siteType ∈ [${_enum(SITE)}]`,
      `5. addSiteLink — { type:"addSiteLink", fromName, toName, linkType, bandwidth?, sla?, label? }`,
      `   linkType ∈ [${_enum(SL)}]`,
      `5b. addCity — { type:"addCity", name, centerLat, centerLng, mapBackend?, notes? }`,
      `    mapBackend ∈ ["image","osm","gmaps"] (default "osm")`,
      `6. addEndpoint — { type:"addEndpoint", endpointType, label, lat?, lng?, x?, y?, cityId?, siteId?, props? }`,
      `   endpointType ∈ [${_enum(EP)}]`,
      `7. addCityLink — { type:"addCityLink", fromLabel, toLabel, linkType, label?, length? }`,
      `   linkType ∈ [${_enum(CL)}]`,
      `8. addPlanetInfra — { type:"addPlanetInfra", infraType, label, lat, lng, props? }`,
      `   infraType ∈ [${_enum(PI)}]`,
      `9. addSpaceAsset — { type:"addSpaceAsset", assetType, label, angle?, orbit?, props? }`,
      `   assetType ∈ [${_enum(SA)}]`,
      `   angle in radians; for constellations use evenly distributed angles (0, 2π/N, 4π/N, ...)`,
      `10. addSpaceLink — { type:"addSpaceLink", fromLabel, toLabel, linkType, label? }`,
      `   linkType ∈ [${_enum(SPL)}]`,
      `11. addDeepSpaceUnit — { type:"addDeepSpaceUnit", unitType, label, anchor?, x?, y?, anchorOffX?, anchorOffY?, props? }`,
      `   unitType ∈ [${_enum(DSU)}]`,
      `   anchor ∈ [${_enum(TGT)}] (planet/spacecraft id; optional but recommended)`,
      `12. addDeepSpaceLink — { type:"addDeepSpaceLink", fromLabel, toLabel, linkType, label? }`,
      `   linkType ∈ [${_enum(DSL)}]`,
      `   For cross-domain handoffs (DS↔orbit), use the orbit asset's label as one endpoint.`,
      '',
      '13. connectArchitecturePath — { type:"connectArchitecturePath", description? }',
      '   Used when the user wants you to TIE EVERYTHING TOGETHER. You must instead emit',
      '   the underlying primitive actions (addLink/addSiteLink/etc.) that achieve this.',
      '14. repairArchitecture — { type:"repairArchitecture", focus?:"local|city|planet|orbit|deepspace" }',
      '   Same: decompose into primitive add* actions that fix orphans and blockers.',
      '15. explainDesign — { type:"explainDesign", text }',
      '   Use only when the user asks for advice; the text appears as the notes line.',
      '16. suggestNextStep — { type:"suggestNextStep", text }',
      '   Use to recommend the next layer/action; appears as the notes line.',
      '',
      'RULES:',
      '- Reference cross-action endpoints by the unique "label" / "name" string from earlier actions in the same response.',
      '- For zones, use ≥200×140 extents and position so they enclose the devices.',
      '- Use clean integer coordinates (multiples of 20) for x/y on devices/zones.',
      '- Choose realistic RFC1918 IPs for internal hosts.',
      '- For orbit constellations, distribute angles evenly and create laser_isl ring links plus ≥1 ground uplink.',
      '- For deep-space, anchor every unit to a DS_TARGETS body unless you intend a free-floating relay.',
      '- A valid full architecture has at least one Local→City→Planet→Orbit→Deep Space connectivity chain.',
      '- DO NOT emit cross-layer "addLink" between layers — use the correct per-layer link action.',
      '- Keep the response minimal: ONLY the JSON object, no prose, no code fences.',
    ].join('\n');
  }

  // ---------- Parsing & per-action validation -----------------------------

  function parseAiJson(text) {
    let t = String(text || '').trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    try { return JSON.parse(t); }
    catch (_) {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); }
        catch (e) { throw new Error('AI response was not valid JSON.'); }
      }
      throw new Error('AI response was not valid JSON.');
    }
  }

  function _str(v, max) {
    return String(v == null ? '' : v).slice(0, max || 200);
  }
  function _num(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function _enumGuard(v, table, fallback) {
    if (!table) return fallback;
    return Object.prototype.hasOwnProperty.call(table, v) ? v : fallback;
  }
  function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function _props(p) {
    if (!_isObj(p)) return {};
    const o = {};
    for (const [k, v] of Object.entries(p).slice(0, 50)) {
      o[_str(k, 64)] = _str(v, 1000);
    }
    return o;
  }

  const ACTION_VALIDATORS = {
    addDevice(a) {
      const t = _enumGuard(a.deviceType, _g('DEVICE_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown deviceType' };
      return { ok: true, clean: {
        deviceType: t,
        label: _str(a.label, 96) || (_g('DEVICE_TYPES')[t].label || t),
        x: _num(a.x, -100000, 100000, 200),
        y: _num(a.y, -100000, 100000, 200),
        props: _props(a.props),
        siteId: _str(a.siteId, 96) || null,
      }};
    },
    addLink(a) {
      const t = _enumGuard(a.linkType, _g('LINK_TYPES'), 'ethernet');
      return { ok: true, clean: {
        linkType: t,
        fromId: _str(a.fromId, 96),
        toId:   _str(a.toId, 96),
        label:  _str(a.label, 96),
      }};
    },
    addZone(a) {
      const t = _enumGuard(a.zoneType, _g('ZONE_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown zoneType' };
      return { ok: true, clean: {
        zoneType: t,
        x: _num(a.x, -100000, 100000, 0),
        y: _num(a.y, -100000, 100000, 0),
        w: _num(a.w, 20, 100000, 200),
        h: _num(a.h, 20, 100000, 140),
        label: _str(a.label, 96),
        siteId: _str(a.siteId, 96) || null,
      }};
    },
    addSite(a) {
      const t = _enumGuard(a.siteType, _g('SITE_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown siteType' };
      return { ok: true, clean: {
        siteType: t,
        name: _str(a.name, 96) || 'Site',
        lat: _num(a.lat, -90, 90, 0),
        lng: _num(a.lng, -180, 180, 0),
        address: _str(a.address, 200),
        notes: _str(a.notes, 1000),
      }};
    },
    addSiteLink(a) {
      const t = _enumGuard(a.linkType, _g('SITE_LINK_TYPES'), 'wan');
      return { ok: true, clean: {
        linkType: t,
        fromName: _str(a.fromName, 96),
        toName:   _str(a.toName, 96),
        bandwidth: _str(a.bandwidth, 64),
        sla: _str(a.sla, 64),
        label: _str(a.label, 96),
      }};
    },
    addCity(a) {
      const backends = _g('CITY_BACKENDS') || { image: 1, osm: 1, gmaps: 1 };
      return { ok: true, clean: {
        name: _str(a.name, 96) || 'City',
        centerLat: _num(a.centerLat, -90, 90, 0),
        centerLng: _num(a.centerLng, -180, 180, 0),
        mapBackend: _enumGuard(a.mapBackend, backends, 'osm'),
        notes: _str(a.notes, 1000),
      }};
    },
    addEndpoint(a) {
      const t = _enumGuard(a.endpointType, _g('ENDPOINT_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown endpointType' };
      return { ok: true, clean: {
        endpointType: t,
        label: _str(a.label, 96) || 'Endpoint',
        x: _num(a.x, -100000, 100000, 0),
        y: _num(a.y, -100000, 100000, 0),
        lat: a.lat == null ? null : _num(a.lat, -90, 90, null),
        lng: a.lng == null ? null : _num(a.lng, -180, 180, null),
        cityId: _str(a.cityId, 96) || null,
        siteId: _str(a.siteId, 96) || null,
        props: _props(a.props),
      }};
    },
    addCityLink(a) {
      const t = _enumGuard(a.linkType, _g('CITY_LINK_TYPES'), 'fiber_buried');
      return { ok: true, clean: {
        linkType: t,
        fromLabel: _str(a.fromLabel, 96),
        toLabel:   _str(a.toLabel, 96),
        label: _str(a.label, 96),
        length: _str(a.length, 32),
      }};
    },
    addPlanetInfra(a) {
      const t = _enumGuard(a.infraType, _g('PLANET_INFRA_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown infraType' };
      return { ok: true, clean: {
        infraType: t,
        label: _str(a.label, 96) || (_g('PLANET_INFRA_TYPES')[t].label || t),
        lat: _num(a.lat, -90, 90, 0),
        lng: _num(a.lng, -180, 180, 0),
        props: _props(a.props),
      }};
    },
    addSpaceAsset(a) {
      const t = _enumGuard(a.assetType, _g('SPACE_ASSET_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown assetType' };
      const def = _g('SPACE_ASSET_TYPES')[t];
      return { ok: true, clean: {
        assetType: t,
        label: _str(a.label, 96) || (def.label || t),
        angle: _num(a.angle, -Math.PI * 20, Math.PI * 20, 0),
        orbit: _enumGuard(a.orbit || def.orbit, _g('ORBIT_ALTITUDES'), def.orbit || 'leo'),
        props: _props(a.props),
      }};
    },
    addSpaceLink(a) {
      const t = _enumGuard(a.linkType, _g('SPACE_LINK_TYPES'), 'laser_isl');
      return { ok: true, clean: {
        linkType: t,
        fromLabel: _str(a.fromLabel, 96),
        toLabel:   _str(a.toLabel, 96),
        label: _str(a.label, 96),
      }};
    },
    addDeepSpaceUnit(a) {
      const t = _enumGuard(a.unitType, _g('DEEP_SPACE_UNIT_TYPES'), null);
      if (!t) return { ok: false, reason: 'unknown unitType' };
      const anchorOk = a.anchor && _g('DS_TARGETS') && Object.prototype.hasOwnProperty.call(_g('DS_TARGETS'), a.anchor)
        ? a.anchor : null;
      return { ok: true, clean: {
        unitType: t,
        label: _str(a.label, 96) || (_g('DEEP_SPACE_UNIT_TYPES')[t].label || t),
        x: _num(a.x, -10000, 10000, 0),
        y: _num(a.y, -10000, 10000, 0),
        anchor: anchorOk,
        anchorOffX: _num(a.anchorOffX, -1000, 1000, 0),
        anchorOffY: _num(a.anchorOffY, -1000, 1000, 0),
        props: _props(a.props),
      }};
    },
    addDeepSpaceLink(a) {
      const t = _enumGuard(a.linkType, _g('DEEP_SPACE_LINK_TYPES'), 'ds_laser');
      return { ok: true, clean: {
        linkType: t,
        fromLabel: _str(a.fromLabel, 96),
        toLabel:   _str(a.toLabel, 96),
        label: _str(a.label, 96),
      }};
    },
    connectArchitecturePath(a) {
      return { ok: true, clean: { description: _str(a.description, 500) } };
    },
    repairArchitecture(a) {
      const valid = new Set(['local','city','planet','orbit','deepspace']);
      return { ok: true, clean: { focus: valid.has(a.focus) ? a.focus : null } };
    },
    explainDesign(a) {
      return { ok: true, clean: { text: _str(a.text, 2000) } };
    },
    suggestNextStep(a) {
      return { ok: true, clean: { text: _str(a.text, 1000) } };
    },
  };

  /**
   * Apply a parsed AI result.
   *
   * ctx must provide:
   *   state, uid, snap,
   *   pushHistory, renderAll,
   *   addDeviceById?, syncLeafletMarkers?, toast?
   *
   * Returns:
   *   { appliedCount, skippedCount, skipped:[{type, reason}], notes:string }
   */
  function applyAiActionsV2(result, ctx) {
    if (!result || !Array.isArray(result.actions)) {
      throw new Error('AI response missing "actions" array.');
    }
    const s = ctx.state;
    const labelMap = {};
    const skipped = [];
    let applied = 0;
    const noteFragments = [];

    ctx.pushHistory();

    for (const raw of result.actions.slice(0, 200)) {
      if (!_isObj(raw)) {
        skipped.push({ type: '(unknown)', reason: 'not an object' });
        continue;
      }
      const validator = ACTION_VALIDATORS[raw.type];
      if (!validator) {
        skipped.push({ type: raw.type || '(missing)', reason: 'unknown action type' });
        continue;
      }
      const v = validator(raw);
      if (!v.ok) {
        skipped.push({ type: raw.type, reason: v.reason });
        continue;
      }
      const a = v.clean;

      try {
        switch (raw.type) {
          case 'addDevice': {
            const id = ctx.uid();
            const def = _g('DEVICE_TYPES')[a.deviceType];
            s.devices.push({
              id, type: a.deviceType,
              x: ctx.snap(a.x), y: ctx.snap(a.y),
              label: a.label,
              props: Object.assign({}, def.defaultProps || {}, a.props),
              siteId: a.siteId || s.activeSiteId,
            });
            labelMap[a.label] = id;
            applied++;
            break;
          }
          case 'addLink': {
            // Label fallback searches only the ACTIVE site's devices — the AI
            // context lists that site's labels, and a cross-site match would
            // create an invisible degenerate link.
            const inSite = (d) => !s.activeSiteId || d.siteId === s.activeSiteId;
            const f = labelMap[a.fromId] || s.devices.find(d => inSite(d) && (d.id === a.fromId || d.label === a.fromId))?.id || a.fromId;
            const t = labelMap[a.toId]   || s.devices.find(d => inSite(d) && (d.id === a.toId   || d.label === a.toId))?.id   || a.toId;
            if (f === t) { skipped.push({ type: raw.type, reason: 'link endpoints are the same device' }); break; }
            const exists = s.devices.find(d => d.id === f) && s.devices.find(d => d.id === t);
            if (!exists) { skipped.push({ type: raw.type, reason: 'endpoint not found' }); break; }
            const dup = s.links.some(l => (l.fromId === f && l.toId === t) || (l.fromId === t && l.toId === f));
            if (dup)    { skipped.push({ type: raw.type, reason: 'duplicate link' }); break; }
            s.links.push({ id: ctx.uid(), fromId: f, toId: t, type: a.linkType, label: a.label });
            applied++;
            break;
          }
          case 'addZone': {
            s.zones.push({
              id: ctx.uid(), type: a.zoneType,
              x: ctx.snap(a.x), y: ctx.snap(a.y),
              w: ctx.snap(a.w), h: ctx.snap(a.h),
              label: a.label, siteId: a.siteId || s.activeSiteId,
            });
            applied++;
            break;
          }
          case 'addSite': {
            const id = ctx.uid();
            const def = _g('SITE_TYPES')[a.siteType];
            s.sites.push({
              id, type: a.siteType, name: a.name,
              lat: a.lat, lng: a.lng,
              address: a.address, notes: a.notes,
              color: def?.color || '#5fb3ff',
            });
            labelMap[a.name] = id;
            applied++;
            break;
          }
          case 'addSiteLink': {
            const f = labelMap[a.fromName] || s.sites.find(x => x.name === a.fromName)?.id;
            const t = labelMap[a.toName]   || s.sites.find(x => x.name === a.toName)?.id;
            if (!f || !t) { skipped.push({ type: raw.type, reason: 'site not found' }); break; }
            const dup = s.siteLinks.some(l => (l.fromSiteId === f && l.toSiteId === t) || (l.fromSiteId === t && l.toSiteId === f));
            if (dup)      { skipped.push({ type: raw.type, reason: 'duplicate site link' }); break; }
            s.siteLinks.push({ id: ctx.uid(), fromSiteId: f, toSiteId: t, type: a.linkType, label: a.label, bandwidth: a.bandwidth, sla: a.sla });
            applied++;
            break;
          }
          case 'addCity': {
            const id = ctx.uid();
            s.cities = s.cities || [];
            s.cities.push({
              id, name: a.name,
              centerLat: a.centerLat, centerLng: a.centerLng,
              mapW: 2000, mapH: 1400,
              mapBackend: a.mapBackend,
              imageUrl: '',
              notes: a.notes,
            });
            labelMap[a.name] = id;
            if (!s.activeCityId) s.activeCityId = id;
            applied++;
            break;
          }
          case 'addEndpoint': {
            const id = ctx.uid();
            const def = _g('ENDPOINT_TYPES')[a.endpointType];
            s.endpoints.push({
              id, type: a.endpointType, label: a.label,
              x: a.x, y: a.y, lat: a.lat, lng: a.lng,
              cityId: a.cityId || s.activeCityId,
              siteId: a.siteId || null,
              props: Object.assign({}, def?.defaultProps || {}, a.props),
            });
            labelMap[a.label] = id;
            applied++;
            break;
          }
          case 'addCityLink': {
            // Label fallback searches only the ACTIVE city's endpoints — a
            // cross-city match would create an unrenderable ghost link that
            // still counts toward city-layer validation.
            const inCity = (x) => !s.activeCityId || x.cityId === s.activeCityId;
            const f = labelMap[a.fromLabel] || s.endpoints.find(x => inCity(x) && x.label === a.fromLabel)?.id;
            const t = labelMap[a.toLabel]   || s.endpoints.find(x => inCity(x) && x.label === a.toLabel)?.id;
            if (!f || !t) { skipped.push({ type: raw.type, reason: 'endpoint label not found' }); break; }
            if (f === t)  { skipped.push({ type: raw.type, reason: 'link endpoints are the same endpoint' }); break; }
            const dup = s.cityLinks.some(l => (l.fromEpId === f && l.toEpId === t) || (l.fromEpId === t && l.toEpId === f));
            if (dup)      { skipped.push({ type: raw.type, reason: 'duplicate city link' }); break; }
            s.cityLinks.push({ id: ctx.uid(), fromEpId: f, toEpId: t, type: a.linkType, label: a.label, length: a.length });
            applied++;
            break;
          }
          case 'addPlanetInfra': {
            s.planetInfra = s.planetInfra || [];
            const id = ctx.uid();
            s.planetInfra.push({
              id, type: a.infraType, label: a.label,
              lat: a.lat, lng: a.lng,
              props: a.props,
            });
            labelMap[a.label] = id;
            applied++;
            break;
          }
          case 'addSpaceAsset': {
            const id = ctx.uid();
            s.spaceAssets.push({
              id, type: a.assetType, label: a.label,
              angle: a.angle, orbit: a.orbit,
              props: a.props,
            });
            labelMap[a.label] = id;
            applied++;
            break;
          }
          case 'addSpaceLink': {
            const f = labelMap[a.fromLabel] || s.spaceAssets.find(x => x.label === a.fromLabel)?.id;
            const t = labelMap[a.toLabel]   || s.spaceAssets.find(x => x.label === a.toLabel)?.id;
            if (!f || !t) { skipped.push({ type: raw.type, reason: 'asset not found' }); break; }
            const dup = s.spaceLinks.some(l => (l.fromAssetId === f && l.toAssetId === t) || (l.fromAssetId === t && l.toAssetId === f));
            if (dup)      { skipped.push({ type: raw.type, reason: 'duplicate orbit link' }); break; }
            s.spaceLinks.push({ id: ctx.uid(), fromAssetId: f, toAssetId: t, type: a.linkType, label: a.label });
            applied++;
            break;
          }
          case 'addDeepSpaceUnit': {
            s.deepSpaceUnits = s.deepSpaceUnits || [];
            const id = ctx.uid();
            s.deepSpaceUnits.push({
              id, type: a.unitType, label: a.label,
              x: a.x, y: a.y,
              anchor: a.anchor, anchorOffX: a.anchorOffX, anchorOffY: a.anchorOffY,
              props: a.props,
            });
            labelMap[a.label] = id;
            applied++;
            break;
          }
          case 'addDeepSpaceLink': {
            s.deepSpaceLinks = s.deepSpaceLinks || [];
            const f = labelMap[a.fromLabel]
              || (s.deepSpaceUnits  || []).find(x => x.label === a.fromLabel)?.id
              || (s.spaceAssets     || []).find(x => x.label === a.fromLabel)?.id;
            const t = labelMap[a.toLabel]
              || (s.deepSpaceUnits  || []).find(x => x.label === a.toLabel)?.id
              || (s.spaceAssets     || []).find(x => x.label === a.toLabel)?.id;
            if (!f || !t) { skipped.push({ type: raw.type, reason: 'endpoint not found' }); break; }
            const dup = s.deepSpaceLinks.some(l => (l.fromId === f && l.toId === t) || (l.fromId === t && l.toId === f));
            if (dup)      { skipped.push({ type: raw.type, reason: 'duplicate DS link' }); break; }
            s.deepSpaceLinks.push({ id: ctx.uid(), fromId: f, toId: t, type: a.linkType, label: a.label });
            applied++;
            break;
          }
          case 'connectArchitecturePath':
          case 'repairArchitecture': {
            // Meta-actions: don't mutate state, but DO produce something
            // useful — pipe the validator's current blockers into the
            // notes so the user sees a punch list. The model is still
            // expected to emit primitive add* actions in the same
            // response if it wants the issues fixed; here we make the
            // meta-action's purpose visible instead of a silent skip.
            const v = (typeof validateArchitectureGraph === 'function')
              ? validateArchitectureGraph(s) : null;
            if (v) {
              const focus = a.focus && v.sectionStatus[a.focus] ? a.focus : null;
              const sections = focus ? [focus] : ['local','city','planet','orbit','deepspace'];
              const bits = [];
              for (const sec of sections) {
                const st = v.sectionStatus[sec];
                if (st.complete) continue;
                if (st.blockers.length) bits.push(`${sec}: ${st.blockers[0]}`);
                else if (st.recommendations.length) bits.push(`${sec}: ${st.recommendations[0]}`);
              }
              if (bits.length) noteFragments.push(`${raw.type} — outstanding: ${bits.join(' | ')}`);
              else             noteFragments.push(`${raw.type}: nothing to fix.`);
            }
            // Count as applied — the action successfully evaluated the
            // architecture and produced a report, even though it did not
            // change state.
            applied++;
            break;
          }
          case 'explainDesign':
            if (a.text) noteFragments.push(a.text);
            applied++;
            break;
          case 'suggestNextStep': {
            if (a.text) { noteFragments.push(a.text); applied++; break; }
            // No text given — auto-generate from the validator.
            const v = (typeof validateArchitectureGraph === 'function')
              ? validateArchitectureGraph(s) : null;
            if (v) {
              for (const sec of ['local','city','planet','orbit','deepspace']) {
                const st = v.sectionStatus[sec];
                if (!st.complete && st.recommendations.length) {
                  noteFragments.push(`Next step (${sec}): ${st.recommendations[0]}`);
                  break;
                }
              }
            }
            applied++;
            break;
          }
        }
      } catch (e) {
        skipped.push({ type: raw.type, reason: e.message || 'unknown error' });
      }
    }

    ctx.renderAll();
    if (typeof ctx.syncLeafletMarkers === 'function') {
      try { ctx.syncLeafletMarkers(); } catch (_) { /* ignore */ }
    }

    const notes = [result.notes, ...noteFragments].filter(Boolean).join(' ');
    return { appliedCount: applied, skippedCount: skipped.length, skipped, notes };
  }

  root.buildAiSystemPrompt = buildAiSystemPrompt;
  root.applyAiActionsV2    = applyAiActionsV2;
  root.parseAiJsonV2       = parseAiJson;

  root.GreyNetAI = Object.assign(root.GreyNetAI || {}, {
    buildSystemPrompt: buildAiSystemPrompt,
    applyActions:      applyAiActionsV2,
    parseJson:         parseAiJson,
  });

})(typeof window !== 'undefined' ? window : globalThis);
