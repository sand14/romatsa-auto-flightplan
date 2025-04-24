// ==UserScript==
// @name         ROMATSA flight‑plan autofill
// @version      1.2
// @description  Adds an aircraft picker and fills the New Flight Plan form
// @match        https://flightplan.romatsa.ro/index.php?option=com_wrapper&view=wrapper&Itemid=69*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ─────── YOUR FLEET (add / edit as needed) ─────── */
    const FLEET = {
        'YR‑ABC': { type: 'C172', wake: 'L', equip: 'SDFGIR', pbn: 'A1B2', speed: 'K0120', level: 'VFR' },
        'YR‑XYZ': { type: 'PA34', wake: 'L', equip: 'SFG',    pbn: 'A1B2C2', speed: 'N0150', level: 'VFR' },
    };
    /* Default values if you leave a property out of a fleet entry */
    const DEFAULTS = { speed: 'N0120', level: 'F085' };
    /* ──────────────────────────────────────────────── */

    /* wait for iframe to load */
    const frame = document.querySelector('#blockrandom');
    if (!frame) return;
    frame.addEventListener('load', onFrameLoad);
    if (frame.contentDocument?.readyState === 'complete') onFrameLoad();

    function onFrameLoad() {
        const doc = frame.contentDocument;
        if (!doc || doc.querySelector('#acPicker')) return;           // already injected

        /* build picker */
        const sel = doc.createElement('select');
        sel.id = 'acPicker';
        sel.style.margin = '12px 0';
        sel.innerHTML = '<option value="">— choose aircraft —</option>' +
            Object.keys(FLEET).map(r => `<option value="${r}">${r}</option>`).join('');
        /* put picker just above the big maroon title */
        const banner = Array.from(doc.querySelectorAll('div'))
        .find(div => /FLIGHT\s*PLAN\s*MESSAGE/i.test(div.textContent)) || doc.body;
        banner.parentNode.insertBefore(sel, banner);

        sel.addEventListener('change', () => autofill(doc, sel.value));
        console.log('[ROMATSA‑auto] picker ready');
    }

    function autofill(doc, reg) {
        if (!reg) return;
        const d   = new Date();               // now (local JS clock is UTC‑aware)
        d.setUTCMinutes(d.getUTCMinutes() + 30);
        d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 5) * 5, 0, 0);

        const hhmm = d.toISOString().slice(11,16).replace(':',''); // "HHMM"
        const dof  = d.toISOString().slice(0,10).replace(/-/g,'');
        const ac   = { ...DEFAULTS, ...FLEET[reg] };

        /* helper: set by name (first matching element) */
        const set = (name,val) => {
            const el = doc.querySelector(`[name="${name}"]`);
            if (el) el.value = val;
        };

        /* 1 ── plain text / select fields */
        set('ARCID',   reg);
        set('FLTRUL',  'V');           // adjust as needed
        set('FLTTYP',  'G');
        set('ARCTYP',  ac.type);
        set('WKTRB',   ac.wake);

        set('ADEP',    'LRSB');
        set('IOBT',    hhmm);

        set('SPEED',   ac.speed);
        set('FLLEVEL', ac.level);

        set('ROUTE',   'DCT XYZ VFR');
        set('ADES',    'LRBS');
        set('TTLEET',  '0045');
        set('ALTRNT1', 'LRCL');

        /* 2 ── TICK the correct equipment & capability boxes */

        /** convenience: untick everything first, then tick what we need */
        const untickAll = name =>
        doc.querySelectorAll(`input[type="checkbox"][name="${name}"]`)
        .forEach(cb => cb.checked = false);

        const tickSet = (name, codes /*string like "SDFG" or "E1E2"*/ ) =>
        codes.match(/([A-Z]\d?)/g)?.forEach(code => {
            const cb = doc.querySelector(`input[type="checkbox"][name="${name}"][value="${code}"]`);
            if (cb) cb.checked = true;
        });

        untickAll('EQPT');
        untickAll('SEQPT');

        tickSet('EQPT',  ac.equip);    // e.g. "SDFGIR"
        tickSet('SEQPT', ac.surv || 'S'); // example: Mode‑S transponder

        /* 3 ── optional: DOF in Other‑Information text area */
        const other = doc.querySelector('textarea[name="PLNITEM18"]')   // adapt if the name differs
        if (other && !other.value.includes('DOF/')) {
            other.value = `DOF/${dof} PBN/${ac.pbn}`.trim();
        }

        console.log('[ROMATSA‑auto] form filled for', reg);
    }
})();