"use strict";

/* =========================================================================
   GREYNET — TOAST + CONFIRM + ALERT REPLACEMENT

   alert() blocks the renderer and looks like a 2003 win-form. This module
   provides:
     toast(message, opts)           — auto-dismissing pill (info|success|warn|error)
     showModalAlert(title, body)    — async; resolves when user clicks OK
     showModalConfirm(title, body)  — async; resolves true/false
     escapeHtml(s)                  — centralized HTML escaping

   All renderer code that currently calls alert()/confirm() should migrate
   here, but we keep alert() and confirm() working at the runtime to avoid
   a Big-Bang change.
   ========================================================================= */

(function (root) {

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- toast container -----------------------------------------------

  function _container() {
    let el = document.getElementById('greynet-toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'greynet-toast-stack';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = [
        'position:fixed', 'top:14px', 'right:14px', 'z-index:9999',
        'display:flex', 'flex-direction:column', 'gap:8px',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  const TOAST_STYLES = {
    info:    { bg: '#1e2733', bd: '#2d3a4a', fg: '#cbd5e1' },
    success: { bg: '#0f2a1e', bd: '#1e7a4d', fg: '#aaf2c8' },
    warn:    { bg: '#2a230f', bd: '#7a611e', fg: '#f5d77a' },
    error:   { bg: '#2a1010', bd: '#a23030', fg: '#ffb0b0' },
  };

  function toast(message, opts) {
    if (typeof document === 'undefined') return; // safe in tests
    const o = opts || {};
    const variant = TOAST_STYLES[o.variant] ? o.variant : 'info';
    const sty = TOAST_STYLES[variant];
    const ttl = Number.isFinite(o.ttlMs) ? o.ttlMs : (variant === 'error' ? 7000 : 3500);

    const el = document.createElement('div');
    el.className = 'greynet-toast greynet-toast-' + variant;
    el.style.cssText = [
      'pointer-events:auto', 'min-width:240px', 'max-width:420px',
      `background:${sty.bg}`, `border:1px solid ${sty.bd}`, `color:${sty.fg}`,
      'padding:10px 14px', 'border-radius:6px',
      'font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'box-shadow:0 6px 18px rgba(0,0,0,0.45)', 'cursor:pointer',
      'opacity:0', 'transform:translateX(20px)',
      'transition:opacity 160ms ease, transform 200ms ease',
    ].join(';');

    if (o.title) {
      const t = document.createElement('div');
      t.style.cssText = 'font-weight:600;margin-bottom:3px;font-size:13px';
      t.textContent = String(o.title);
      el.appendChild(t);
    }
    const body = document.createElement('div');
    body.textContent = String(message);
    el.appendChild(body);

    el.addEventListener('click', () => _dismiss(el));
    _container().appendChild(el);
    // Force layout, then animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });
    if (ttl > 0) setTimeout(() => _dismiss(el), ttl);
    return el;
  }

  function _dismiss(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }

  // ---------- modal alert/confirm ------------------------------------------

  function _modal(title, body, buttons) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay greynet-modal-overlay';
      overlay.style.cssText = [
        'position:fixed','inset:0','z-index:10000',
        'background:rgba(0,0,0,0.55)','display:flex','align-items:center','justify-content:center',
      ].join(';');

      const card = document.createElement('div');
      card.className = 'modal';
      card.style.cssText = [
        'background:#161b22','border:1px solid #2d3a4a','color:#cbd5e1',
        'min-width:340px','max-width:560px','border-radius:8px',
        'padding:18px 20px','box-shadow:0 12px 36px rgba(0,0,0,0.55)',
        'font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      ].join(';');

      const h = document.createElement('h3');
      h.style.cssText = 'margin:0 0 10px;font-size:15px;color:#e5e9f0';
      h.textContent = title || '';
      card.appendChild(h);

      const b = document.createElement('div');
      b.style.cssText = 'margin:0 0 16px;white-space:pre-wrap';
      b.textContent = body || '';
      card.appendChild(b);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
      for (const btnDef of buttons) {
        const btn = document.createElement('button');
        btn.textContent = btnDef.label;
        btn.className = btnDef.primary ? 'primary' : '';
        btn.style.cssText = [
          'padding:6px 14px','border-radius:4px',
          btnDef.primary
            ? 'background:#3b82f6;border:1px solid #2563eb;color:#fff'
            : 'background:#1f2937;border:1px solid #374151;color:#cbd5e1',
          'cursor:pointer','font-size:12px',
        ].join(';');
        btn.addEventListener('click', () => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(btnDef.value);
        });
        row.appendChild(btn);
      }
      card.appendChild(row);
      overlay.appendChild(card);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(buttons[0]?.value ?? null);
        }
      });
      document.body.appendChild(overlay);
    });
  }

  function showModalAlert(title, body) {
    return _modal(title, body, [{ label: 'OK', primary: true, value: true }]);
  }
  function showModalConfirm(title, body, opts) {
    const o = opts || {};
    return _modal(title, body, [
      { label: o.cancelLabel  || 'Cancel', primary: false, value: false },
      { label: o.confirmLabel || 'OK',     primary: true,  value: true  },
    ]);
  }

  root.toast = toast;
  root.showModalAlert = showModalAlert;
  root.showModalConfirm = showModalConfirm;
  root.escapeHtmlSafe = escapeHtml; // augment progression.js's local one
  if (!root.escapeHtml) root.escapeHtml = escapeHtml;

})(typeof window !== 'undefined' ? window : globalThis);
