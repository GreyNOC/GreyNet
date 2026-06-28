/**
 * GreyNet — Space environments (Orbit + Deep Space) regression tests.
 *
 * Locks in the QA/QC redesign:
 *   - the Link Budget Studio updates in place on slider 'input' (no panel
 *     rebuild → continuous drag and focus survive),
 *   - the studio exposes the new Epoch / Reset / Copy / preset-active controls
 *     and the G/T readout,
 *   - the "New Horizons-class to Pluto" preset actually targets Pluto,
 *   - studio changes are captured by undo (comms in history),
 *   - Fit is mode-aware (frames Deep Space, not the hidden local devices).
 */
const { test, expect } = require('@playwright/test');

async function loadInDeepSpace(page) {
  await page.goto('about:blank');
  await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && state.progression);
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
    state.progression.walkthroughDone = true;
    for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
    setViewMode('deepspace');
  });
}

test.describe('Deep Space — Link Budget Studio', () => {
  test('exposes epoch, reset/copy, preset and G/T controls', async ({ page }) => {
    await loadInDeepSpace(page);
    await expect(page.locator('#lbs-date')).toHaveCount(1);
    await expect(page.locator('#lbs-now')).toHaveCount(1);
    await expect(page.locator('[data-lbs-action="reset"]')).toHaveCount(1);
    await expect(page.locator('[data-lbs-action="copy"]')).toHaveCount(1);
    await expect(page.locator('#lbs-readout')).toContainText('G/T');
    // Every slider label is associated to its input (for/id) for accessibility.
    const orphanLabels = await page.evaluate(() =>
      [...document.querySelectorAll('.lbs-row label[for]')]
        .filter(l => !document.getElementById(l.getAttribute('for'))).length);
    expect(orphanLabels).toBe(0);
  });

  test('slider input updates in place WITHOUT rebuilding the panel', async ({ page }) => {
    await loadInDeepSpace(page);
    const result = await page.evaluate(async () => {
      const el = document.getElementById('lbs-pt');
      if (!el) return 'no-slider';
      // Tag the live element; a full innerHTML rebuild would discard the tag.
      el.dataset.marker = 'keep';
      el.focus();
      el.value = String(parseFloat(el.min) + (parseFloat(el.max) - parseFloat(el.min)) * 0.7);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // Let the rAF-coalesced live update run.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = document.getElementById('lbs-pt');
      return {
        persisted: !!(after && after.dataset.marker === 'keep'),
        stillFocused: document.activeElement === after,
      };
    });
    expect(result.persisted).toBe(true);   // panel was NOT rebuilt
    expect(result.stillFocused).toBe(true); // focus survived (keyboard drag works)
  });

  test('changing a slider clears the active-preset highlight', async ({ page }) => {
    await loadInDeepSpace(page);
    const r = await page.evaluate(async () => {
      // Apply a preset via its button so activePresetId is set + highlighted.
      const btn = document.querySelector('[data-preset="voyager"]');
      btn.click();
      const wasActive = !!document.querySelector('[data-preset="voyager"].active');
      // Now diverge: nudge a slider.
      const el = document.getElementById('lbs-gt');
      el.value = String(parseFloat(el.value) + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => requestAnimationFrame(r));
      return { wasActive, nowActive: !!document.querySelector('[data-preset="voyager"].active'),
               presetId: state.comms.activePresetId };
    });
    expect(r.wasActive).toBe(true);
    expect(r.nowActive).toBe(false);
    expect(r.presetId).toBe(null);
  });

  test('Pluto preset targets Pluto at ~39.5 AU (not Neptune)', async ({ page }) => {
    await loadInDeepSpace(page);
    const r = await page.evaluate(() => {
      DS_PRESETS.pluto.apply(state.comms);
      return { target: state.comms.targetId,
               au: dsDistanceKm('pluto', Date.now()) / DS_AU_KM };
    });
    expect(r.target).toBe('pluto');
    expect(r.au).toBeGreaterThan(38);
    expect(r.au).toBeLessThan(41);
  });

  test('studio changes are undoable (comms captured in history)', async ({ page }) => {
    await loadInDeepSpace(page);
    const r = await page.evaluate(() => {
      state.comms.targetId = 'mars';
      pushHistory();                 // snapshot the "mars" state
      state.comms.targetId = 'jupiter';
      undo();                        // should restore comms → mars
      return state.comms.targetId;
    });
    expect(r).toBe('mars');
  });

  test('epoch can be frozen and snapped back to live', async ({ page }) => {
    await loadInDeepSpace(page);
    const r = await page.evaluate(() => {
      const date = document.getElementById('lbs-date');
      date.value = '2030-01-01';
      date.dispatchEvent(new Event('change', { bubbles: true }));
      const frozen = state.comms.epochOverrideMs;
      document.getElementById('lbs-now').click();
      return { frozen, afterNow: state.comms.epochOverrideMs };
    });
    expect(typeof r.frozen).toBe('number');
    expect(r.afterNow).toBe(null);
  });
});

test.describe('Space views — shell', () => {
  test('Fit is mode-aware (frames Deep Space content, not local devices)', async ({ page }) => {
    await loadInDeepSpace(page);
    const r = await page.evaluate(() => {
      // Move the viewport somewhere arbitrary, then Fit.
      state.view.pan.x = -9999; state.view.pan.y = -9999; state.view.zoom = 0.05;
      fitCurrentView();
      // fitDeepSpace centres the pan on the canvas mid-point and clamps zoom ≥0.1.
      const rect = dom.svg.getBoundingClientRect();
      return { zoom: state.view.zoom, panX: state.view.pan.x, midX: rect.width / 2 };
    });
    expect(r.zoom).toBeGreaterThanOrEqual(0.1);
    expect(Math.abs(r.panX - r.midX)).toBeLessThan(1);
  });

  test('Orbit shows first-entry empty-state guidance', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.progression);
    await page.evaluate(() => {
      if (typeof closeWalkthrough === 'function') closeWalkthrough();
      state.progression.walkthroughDone = true;
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      state.spaceAssets = [];
      setViewMode('space');
    });
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-state-title')).toContainText('orbit');
  });

  test('Grid/Snap/Live toolbar buttons are hidden in Deep Space', async ({ page }) => {
    await loadInDeepSpace(page);
    await expect(page.locator('#grid-btn')).toBeHidden();
    await expect(page.locator('#snap-btn')).toBeHidden();
    await expect(page.locator('#live-toggle-btn')).toBeHidden();
  });
});
