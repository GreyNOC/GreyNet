"use strict";

/* =========================================================================
   GREYNET — ARCHITECTURE VALIDATOR

   Walks the design graph across all five layers and tells you whether
   each layer is "really" built (not just "user dropped one icon").
   Used by: progression chips, warnings tray, export readiness, AI repair.

   Public surface:
     validateArchitectureGraph(state) → {
       complete, sectionStatus, paths, orphanedObjects, recommendations
     }
     sectionBlockers(state, section) → string[]   (convenience)
     hasFullArchitecturePath(state) → boolean      (convenience)

   The function is pure: it never mutates state. It accepts the live
   `state` object so callers can pass it directly.
   ========================================================================= */

(function (root) {

  // ---- Layer-specific completion ------------------------------------------
  //
  // Each section returns:
  //   { complete: bool, blockers: string[], warnings: string[],
  //     stats: {...}, evidence: {...} }
  //
  // `evidence` is what the caller can re-use to build the cross-layer paths.

  function _checkLocal(state) {
    const sites    = state.sites    || [];
    const devices  = state.devices  || [];
    const links    = state.links    || [];
    const blockers = [], warnings = [];

    if (sites.length === 0) blockers.push('No site exists. Create at least one site.');

    const active = state.activeSiteId
      ? sites.find(s => s.id === state.activeSiteId)
      : (sites[0] || null);
    const activeId = active ? active.id : null;

    const inSite   = activeId ? devices.filter(d => d.siteId === activeId) : devices;
    const siteLnks = activeId
      ? links.filter(l => {
          const a = devices.find(d => d.id === l.fromId);
          const b = devices.find(d => d.id === l.toId);
          return a && b && a.siteId === activeId && b.siteId === activeId;
        })
      : links;

    if (inSite.length < 3) blockers.push(`Active site has only ${inSite.length} device(s); need ≥3.`);
    if (siteLnks.length < 1) blockers.push('No links between devices in the active site.');

    // "Meaningful" = at least one edge/security/core role present.
    const meaningfulTypes = new Set(['firewall','router','l3switch','ids','waf','vpn']);
    const meaningful = inSite.filter(d => meaningfulTypes.has(d.type));
    if (meaningful.length === 0) {
      blockers.push('Active site has no edge/security/core device (firewall, router, L3 switch, IDS, WAF, or VPN).');
    }

    // Orphan devices in this site (no links at all)
    const linked = new Set();
    siteLnks.forEach(l => { linked.add(l.fromId); linked.add(l.toId); });
    const orphans = inSite.filter(d => !linked.has(d.id));
    if (inSite.length >= 3 && orphans.length === inSite.length) {
      blockers.push('All devices are unconnected. Wire at least one link.');
    } else if (orphans.length > 0) {
      warnings.push(`${orphans.length} device(s) have no links in the active site.`);
    }

    return {
      complete: blockers.length === 0,
      blockers, warnings,
      stats: { sites: sites.length, devicesInActive: inSite.length, linksInActive: siteLnks.length },
      evidence: { activeSiteId: activeId, devicesInActive: inSite, linksInActive: siteLnks },
    };
  }

  function _checkCity(state) {
    const cities    = state.cities    || [];
    const endpoints = state.endpoints || [];
    const cityLinks = state.cityLinks || [];
    const sites     = state.sites     || [];
    const blockers = [], warnings = [];

    if (cities.length === 0) blockers.push('No city exists. Create at least one city.');

    // At least one local site placed on a city map = endpoint with siteId
    const sitePlacements = endpoints.filter(ep => ep.siteId && sites.find(s => s.id === ep.siteId));
    if (sitePlacements.length === 0) {
      blockers.push('No local site is placed onto any city map. Drag a "Built Site" onto the city.');
    }

    // At least one pure city-infra endpoint (not just placed sites)
    const infraTypes = new Set(['trafficsignal','trafficcam','vehiclesensor','messagesign','cabinet','streetlight','fiberjunction']);
    const cityInfra = endpoints.filter(ep => infraTypes.has(ep.type));
    if (cityInfra.length === 0) {
      blockers.push('No city infrastructure endpoint (cabinet, traffic signal, cam, fiber junction, etc.).');
    }

    // Linked site ↔ city infra: at least one cityLink from a site-placement
    // to a city-infra endpoint counts. If no links exist at all, that's
    // also a blocker.
    if (cityLinks.length === 0 && cities.length > 0 && endpoints.length > 0) {
      blockers.push('No city link wires the site to any city endpoint.');
    } else if (sitePlacements.length > 0 && cityInfra.length > 0) {
      const epIdMap = new Map(endpoints.map(ep => [ep.id, ep]));
      const connected = cityLinks.some(cl => {
        const a = epIdMap.get(cl.fromEpId);
        const b = epIdMap.get(cl.toEpId);
        if (!a || !b) return false;
        const aIsSite  = !!a.siteId, bIsSite  = !!b.siteId;
        const aIsInfra = infraTypes.has(a.type), bIsInfra = infraTypes.has(b.type);
        return (aIsSite && bIsInfra) || (bIsSite && aIsInfra);
      });
      if (!connected) {
        blockers.push('Placed site and city infrastructure are not linked. Connect them with a city link.');
      }
    }

    // Orphaned city endpoints (no links)
    const linkedEps = new Set();
    cityLinks.forEach(cl => { linkedEps.add(cl.fromEpId); linkedEps.add(cl.toEpId); });
    const orphans = endpoints.filter(ep => !linkedEps.has(ep.id));
    if (orphans.length > 0 && endpoints.length > 1) {
      warnings.push(`${orphans.length} city endpoint(s) have no links.`);
    }

    return {
      complete: blockers.length === 0,
      blockers, warnings,
      stats: { cities: cities.length, endpoints: endpoints.length, cityLinks: cityLinks.length, sitePlacements: sitePlacements.length },
      evidence: { sitePlacements, cityInfra, cityLinks },
    };
  }

  function _checkPlanet(state) {
    const sites       = state.sites       || [];
    const siteLinks   = state.siteLinks   || [];
    const planetInfra = state.planetInfra || [];
    const cities      = state.cities      || [];
    const endpoints   = state.endpoints   || [];
    const blockers = [], warnings = [];

    // At least one city/local site represented at planet scale.
    // A site by definition exists at planet scale (it has lat/lng).
    // A city counts too if any of its endpoints is anchored to a real site.
    const cityHasSite = endpoints.some(ep => ep.siteId);
    const planetRepresentation = sites.length + (cityHasSite ? 1 : 0);
    if (planetRepresentation < 1) {
      blockers.push('No site is represented at planet scale.');
    }

    // At least two planet-scale nodes OR one site + one global infra unit.
    const planetNodes = sites.length + planetInfra.length;
    if (!(planetNodes >= 2 || (sites.length >= 1 && planetInfra.length >= 1))) {
      blockers.push(`Need ≥2 planet-scale nodes (sites or global infra); have ${planetNodes}.`);
    }

    // Valid inter-site link OR site-to-global-infra link.
    // Site-to-infra is represented by either a site near an infra (heuristic
    // fallback), or by explicit siteLinks. We accept siteLinks ≥1 as the
    // canonical "valid link"; if no siteLinks but ≥1 infra is geographically
    // near a site (<500 km), we treat that as an implicit link with a warn.
    let hasValidLink = siteLinks.length >= 1;
    if (!hasValidLink && sites.length >= 1 && planetInfra.length >= 1) {
      const near = sites.some(s => planetInfra.some(i => _haversineKm(s, i) < 500));
      if (near) {
        warnings.push('Global infra is near a site but no explicit site link exists.');
      } else {
        blockers.push('No inter-site link and no site-to-global-infra connection.');
      }
    } else if (!hasValidLink) {
      blockers.push('No inter-site or site-to-global-infra link exists.');
    }

    // Orphan siteLinks
    const siteIds = new Set(sites.map(s => s.id));
    const orphanSL = siteLinks.filter(sl => !siteIds.has(sl.fromSiteId) || !siteIds.has(sl.toSiteId));
    if (orphanSL.length) warnings.push(`${orphanSL.length} site link(s) reference deleted sites.`);

    return {
      complete: blockers.length === 0,
      blockers, warnings,
      stats: { sites: sites.length, siteLinks: siteLinks.length, planetInfra: planetInfra.length, cities: cities.length },
      evidence: { sites, siteLinks, planetInfra },
    };
  }

  function _checkOrbit(state) {
    const assets      = state.spaceAssets  || [];
    const links       = state.spaceLinks   || [];
    const planetInfra = state.planetInfra  || [];
    const blockers = [], warnings = [];

    const ground = assets.filter(a => a.type === 'ground_station');
    const uplinkInfra = planetInfra.filter(p => p.type === 'ground_uplink');
    const hasGround = ground.length >= 1 || uplinkInfra.length >= 1;
    if (!hasGround) {
      blockers.push('No ground station or satellite uplink (planet or orbit) to bridge to space.');
    }

    const orbiters = assets.filter(a => a.type !== 'ground_station');
    if (orbiters.length < 1) blockers.push('No orbital asset placed.');

    const uplinkTypes = new Set(['uplink','downlink','feeder']);
    const upLinks = links.filter(l => uplinkTypes.has(l.type));
    if (upLinks.length < 1) {
      blockers.push('No uplink/downlink/feeder link between ground and orbit.');
    } else {
      // Validate that the uplinks actually touch a ground station on one side
      // and a non-ground asset on the other.
      const idMap = new Map(assets.map(a => [a.id, a]));
      const validUplink = upLinks.some(l => {
        const a = idMap.get(l.fromAssetId), b = idMap.get(l.toAssetId);
        if (!a || !b) return false;
        const aG = a.type === 'ground_station', bG = b.type === 'ground_station';
        return (aG && !bG) || (bG && !aG);
      });
      if (!validUplink && ground.length >= 1) {
        warnings.push('Uplink/downlink links exist but don\'t actually connect ground↔orbit.');
      }
    }

    // Orphan orbital assets
    const linkedIds = new Set();
    links.forEach(l => { linkedIds.add(l.fromAssetId); linkedIds.add(l.toAssetId); });
    const orphans = assets.filter(a => !linkedIds.has(a.id));
    if (orphans.length > 0 && assets.length > 1) {
      warnings.push(`${orphans.length} orbital asset(s) have no links.`);
    }

    return {
      complete: blockers.length === 0,
      blockers, warnings,
      stats: { assets: assets.length, links: links.length, ground: ground.length, orbiters: orbiters.length, uplinks: upLinks.length },
      evidence: { ground, orbiters, upLinks, uplinkInfra },
    };
  }

  function _checkDeepSpace(state, orbitEv) {
    const units = state.deepSpaceUnits || [];
    const dsLinks = state.deepSpaceLinks || [];
    const orbitAssets = state.spaceAssets || [];
    const blockers = [], warnings = [];

    if (units.length < 1) blockers.push('No deep-space unit placed.');

    // Need at least one connection to orbit/ground (handoff). The handoff
    // is recorded either as a deepSpaceLink whose `toId` points at an orbit
    // ground_station (cross-domain handoff), or as a DS unit anchored to
    // a target referenced from orbit.
    const orbitIds = new Set(orbitAssets.map(a => a.id));
    const dsIds = new Set(units.map(u => u.id));

    const hasHandoff = dsLinks.some(l =>
      (dsIds.has(l.fromId) && orbitIds.has(l.toId)) ||
      (dsIds.has(l.toId) && orbitIds.has(l.fromId))
    );

    // Allow alternative: at least one DS unit anchored AND one DS-internal link
    // AND orbit layer is complete with ≥1 ground station — that's an implicit
    // handoff path. Otherwise require explicit handoff.
    const anchored = units.some(u => u.anchor);
    const internalLinks = dsLinks.filter(l => dsIds.has(l.fromId) && dsIds.has(l.toId));

    if (units.length >= 1 && !hasHandoff) {
      if (anchored && internalLinks.length >= 1 && orbitEv && orbitEv.ground && orbitEv.ground.length >= 1) {
        warnings.push('No explicit DS↔orbit handoff link; using anchored+internal as implicit path.');
      } else {
        blockers.push('No handoff: connect at least one deep-space unit back to a ground station or orbital asset.');
      }
    }

    // Orphan DS units (no link, no anchor)
    const linkedDsIds = new Set();
    dsLinks.forEach(l => { linkedDsIds.add(l.fromId); linkedDsIds.add(l.toId); });
    const orphans = units.filter(u => !linkedDsIds.has(u.id) && !u.anchor);
    if (orphans.length > 0) {
      warnings.push(`${orphans.length} deep-space unit(s) are orphaned (no anchor, no link).`);
    }

    return {
      complete: blockers.length === 0,
      blockers, warnings,
      stats: { units: units.length, links: dsLinks.length, handoffs: hasHandoff ? 1 : 0, anchored: units.filter(u => u.anchor).length },
      evidence: { units, dsLinks, hasHandoff, anchored, internalLinks },
    };
  }

  // ---- Cross-layer path discovery -----------------------------------------
  //
  // Returns a list of {layers, label} describing each path we can prove
  // from Local to Deep Space, plus paths that stop earlier.

  function _discoverPaths(state, sectionEv) {
    const paths = [];
    const local = sectionEv.local, city = sectionEv.city, planet = sectionEv.planet,
          orbit = sectionEv.orbit, deep  = sectionEv.deepspace;

    // Path 1: Local site → City placement → Planet site → ground/uplink → orbit asset → DS handoff
    const reachable = ['local'];
    if (local.evidence.activeSiteId) {
      const placedSite = city.evidence.sitePlacements.find(ep => ep.siteId === local.evidence.activeSiteId);
      if (placedSite) reachable.push('city');
    }
    if (planet.evidence.sites && planet.evidence.sites.length >= 1) reachable.push('planet');
    if (orbit.evidence.ground.length >= 1 && orbit.evidence.orbiters.length >= 1 && orbit.evidence.upLinks.length >= 1) {
      reachable.push('orbit');
    }
    if (deep.evidence.hasHandoff || (deep.evidence.anchored && deep.evidence.internalLinks.length >= 1)) {
      reachable.push('deepspace');
    }
    if (reachable.length >= 2) {
      paths.push({
        kind: 'main',
        layers: reachable,
        label: `Local→${reachable.slice(1).join('→')}`,
        complete: reachable.length === 5,
      });
    }

    // Path 2: Planet-only (if user skipped city: site directly to orbit via uplink)
    if (planet.complete && orbit.complete && !reachable.includes('city')) {
      paths.push({
        kind: 'planet-direct',
        layers: ['planet','orbit'],
        label: 'Planet→Orbit (no city layer)',
        complete: false,
      });
    }

    return paths;
  }

  // ---- Orphans aggregator -------------------------------------------------

  function _allOrphans(state) {
    const out = [];
    const linked = new Set();
    (state.links || []).forEach(l => { linked.add(l.fromId); linked.add(l.toId); });
    (state.devices || []).forEach(d => {
      if (!linked.has(d.id)) out.push({ layer: 'local', kind: 'device', id: d.id, label: d.label || d.type });
    });

    const epLinked = new Set();
    (state.cityLinks || []).forEach(l => { epLinked.add(l.fromEpId); epLinked.add(l.toEpId); });
    (state.endpoints || []).forEach(ep => {
      if (!epLinked.has(ep.id) && !ep.siteId) {
        out.push({ layer: 'city', kind: 'endpoint', id: ep.id, label: ep.label || ep.type });
      }
    });

    const slIds = new Set();
    (state.siteLinks || []).forEach(l => { slIds.add(l.fromSiteId); slIds.add(l.toSiteId); });
    (state.sites || []).forEach(s => {
      if ((state.siteLinks || []).length > 0 && !slIds.has(s.id)) {
        out.push({ layer: 'planet', kind: 'site', id: s.id, label: s.name });
      }
    });

    const spLinked = new Set();
    (state.spaceLinks || []).forEach(l => { spLinked.add(l.fromAssetId); spLinked.add(l.toAssetId); });
    (state.spaceAssets || []).forEach(a => {
      if (!spLinked.has(a.id) && (state.spaceLinks || []).length > 0) {
        out.push({ layer: 'orbit', kind: 'asset', id: a.id, label: a.label || a.type });
      }
    });

    const dsLinked = new Set();
    (state.deepSpaceLinks || []).forEach(l => { dsLinked.add(l.fromId); dsLinked.add(l.toId); });
    (state.deepSpaceUnits || []).forEach(u => {
      if (!dsLinked.has(u.id) && !u.anchor) {
        out.push({ layer: 'deepspace', kind: 'unit', id: u.id, label: u.label || u.type });
      }
    });

    return out;
  }

  // ---- Recommendations ----------------------------------------------------

  // Per-section, plain-English next-step recommendations. These complement
  // `blockers` (which describe what's wrong) with concrete actions the user
  // can take next.
  function _sectionRecommendations(section, sectionEv, state) {
    const recs = [];
    const r = sectionEv[section];
    if (!r) return recs;

    if (section === 'local') {
      if ((state.sites || []).length === 0)            recs.push('Create a site from the SITE pill in the top bar.');
      if (!r.evidence.activeSiteId)                    recs.push('Activate a site (Site pill → switch).');
      const have = (r.evidence.devicesInActive || []);
      if (have.length === 0)                           recs.push('Drag a Firewall, an L3 Switch, and a Server from the left palette.');
      else if (have.length < 3)                        recs.push(`Add ${3 - have.length} more device(s) to the active site.`);
      if ((r.evidence.linksInActive || []).length === 0) {
        recs.push('Press C (Connect mode) and click two devices to wire them.');
      }
    } else if (section === 'city') {
      if ((state.cities || []).length === 0)           recs.push('Create a city from the city bar.');
      if ((r.evidence.sitePlacements || []).length === 0) recs.push('Drag your local site onto the city map (Built Sites palette).');
      if ((r.evidence.cityInfra || []).length === 0)   recs.push('Place a cabinet, fiber junction, or traffic signal endpoint.');
      if ((r.evidence.cityLinks   || []).length === 0) recs.push('Connect a placed site to a city endpoint with a city link.');
    } else if (section === 'planet') {
      if ((state.sites || []).length < 2 && (state.planetInfra || []).length === 0) {
        recs.push('Add a second site or place a global infra unit (data center, ground uplink, ...).');
      }
      if ((state.siteLinks || []).length === 0) {
        recs.push('Draw at least one inter-site link (WAN / SD-WAN / MPLS / Leased).');
      }
    } else if (section === 'orbit') {
      if ((r.evidence.ground || []).length === 0 && (r.evidence.uplinkInfra || []).length === 0) {
        recs.push('Place a ground station in Orbit view, OR a satellite uplink in Planet view.');
      }
      if ((r.evidence.orbiters || []).length === 0) {
        recs.push('Place at least one satellite, relay, or defense node.');
      }
      if ((r.evidence.upLinks  || []).length === 0) {
        recs.push('Connect ground ↔ orbit with an Uplink, Downlink, or Feeder link.');
      }
    } else if (section === 'deepspace') {
      if ((state.deepSpaceUnits || []).length === 0) {
        recs.push('Place a deep-space relay, probe, or quantum gateway anchored to a planet/body.');
      }
      if (!r.evidence.hasHandoff) {
        recs.push('Link a DS unit to an orbital ground station (cross-domain handoff).');
      }
    }
    return recs;
  }

  function _recommendations(sectionEv, paths) {
    const recs = [];
    for (const sec of ['local','city','planet','orbit','deepspace']) {
      const r = sectionEv[sec];
      if (!r.complete && r.blockers.length) {
        recs.push({ section: sec, severity: 'blocker', message: r.blockers[0] });
      }
      for (const w of r.warnings) {
        recs.push({ section: sec, severity: 'warning', message: w });
      }
    }
    const fullPath = paths.find(p => p.kind === 'main' && p.complete);
    if (!fullPath) {
      recs.push({
        section: 'global', severity: 'info',
        message: 'No proven Local→Deep Space path. Finish each layer and connect them across.',
      });
    }
    return recs;
  }

  // ---- Helpers ------------------------------------------------------------

  function _haversineKm(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
    const toRad = x => x * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat/2) ** 2 +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ---- Public API ---------------------------------------------------------

  function validateArchitectureGraph(state) {
    if (!state) throw new Error('validateArchitectureGraph: state is required');

    const local  = _checkLocal(state);
    const city   = _checkCity(state);
    const planet = _checkPlanet(state);
    const orbit  = _checkOrbit(state);
    const deepspace = _checkDeepSpace(state, orbit);

    const sectionEv = { local, city, planet, orbit, deepspace };
    const paths = _discoverPaths(state, sectionEv);
    const orphanedObjects = _allOrphans(state);
    const recommendations = _recommendations(sectionEv, paths);

    const sectionStatus = {};
    for (const sec of ['local','city','planet','orbit','deepspace']) {
      sectionStatus[sec] = {
        complete: sectionEv[sec].complete,
        warnings: sectionEv[sec].warnings,
        blockers: sectionEv[sec].blockers,
        recommendations: _sectionRecommendations(sec, sectionEv, state),
        stats:    sectionEv[sec].stats,
      };
    }

    const fullPathExists = !!paths.find(p => p.kind === 'main' && p.complete);

    return {
      complete: ['local','city','planet','orbit','deepspace'].every(s => sectionStatus[s].complete),
      fullPathExists,
      sectionStatus,
      paths,
      orphanedObjects,
      recommendations,
    };
  }

  function sectionBlockers(state, section) {
    return validateArchitectureGraph(state).sectionStatus[section]?.blockers || [];
  }

  function sectionRecommendations(state, section) {
    return validateArchitectureGraph(state).sectionStatus[section]?.recommendations || [];
  }

  function hasFullArchitecturePath(state) {
    return validateArchitectureGraph(state).fullPathExists;
  }

  // Top-level exports (back-compat) + namespaced surface that newer code
  // should prefer.
  root.validateArchitectureGraph = validateArchitectureGraph;
  root.sectionBlockers           = sectionBlockers;
  root.sectionRecommendations    = sectionRecommendations;
  root.hasFullArchitecturePath   = hasFullArchitecturePath;

  root.GreyNetValidation = Object.assign(root.GreyNetValidation || {}, {
    validateArchitectureGraph,
    sectionBlockers,
    sectionRecommendations,
    hasFullArchitecturePath,
  });

})(typeof window !== 'undefined' ? window : globalThis);
