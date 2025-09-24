// ==UserScript==
// @name         ROMATSA flight‑plan autofill
// @version      1.0.12
// @author       Avrigeanu Sebastian
// @license      MIT
// @description  Adds an aircraft picker and fills the New Flight Plan form
// @match        https://flightplan.romatsa.ro/index.php?option=com_wrapper&view=wrapper&Itemid=69*
// @downloadURL  https://github.com/sand14/romatsa-auto-flightplan/raw/refs/heads/main/romatsa-fpl-autofill.user.js
// @updateURL    https://github.com/sand14/romatsa-auto-flightplan/raw/refs/heads/main/romatsa-fpl-autofill.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ─────── YOUR FLEET (add / edit as needed) ─────── */
    const FLEET = {
        'YR5651': { type: 'SVNH', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', level: 'VFR', color: 'WHITE AND BLUE' },
        'YR5604': { type: 'SVNH', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', level: 'VFR', color: 'WHITE AND BLUE' },
        'YRBVI': { type: 'IR46', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', level: 'VFR', color: 'WHITE AND BLUE AND RED', endurance: '0400' },
        'YRARL': { type: 'CRUZ', wake: 'L', equip: 'ODY', surv: 'S', speed: 'K0160', level: 'VFR', color: 'WHITE AND BLUE DOTS', endurance: '0600', hasElt: true },
        'YRZCP': { type: 'Z42', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0170', level: 'VFR', color: 'WHITE AND RED', endurance: '0500', hasElt: true },
        'YR1810': { type: 'ZZZZ', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', level: 'VFR', color: 'WHITE AND RED', endurance: '0600', typz: 'IS28M2' },
        'YRPBF': { type: 'AN2', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0180', level: 'VFR', color: 'WHITE AND BLUE', endurance: '0300' }
    };
    /* Default values if you leave a property out of a fleet entry */
    const DEFAULTS = { speed: 'K0140', level: 'VFR', typz: '', endurance: '0500', hasElt: false };
    /* ──────────────────────────────────────────────── */

    /* wait for iframe to load */
    const frame = document.querySelector('#blockrandom');
    if (!frame) return;
    frame.addEventListener('load', onFrameLoad);
    if (frame.contentDocument?.readyState === 'complete') onFrameLoad();

    function onFrameLoad() {
        const doc = frame.contentDocument;
        if (!doc || doc.querySelector('#acPicker')) return;

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
        const d = new Date();
        let minutes = d.getUTCMinutes();

        if (minutes % 10 === 0) {
            // exact x0 → add 40 min
            d.setUTCMinutes(minutes + 40);
        } else {
            // otherwise → add 30 min
            d.setUTCMinutes(minutes + 30);

            // then round up to next 10
            const newMinutes = d.getUTCMinutes();
            d.setUTCMinutes(Math.ceil(newMinutes / 10) * 10);
        }

        const hhmm = d.toISOString().slice(11, 16).replace(':', '');
        const iso = d.toISOString().slice(0, 10).replace(/-/g, '');
        const dof = iso.slice(2);
        const ac = { ...DEFAULTS, ...FLEET[reg] };

        /* helper: set by name (first matching element) */
        const set = (name, val) => {
            const el = doc.querySelector(`[name="${name}"]`);
            if (el) el.value = val;
        };

        /* 1 ── plain text / select fields */
        set('ARCID', reg);
        set('FLTRUL', 'V');
        set('FLTTYP', 'G');
        set('ARCTYP', ac.type);
        set('WKTRB', ac.wake);

        set('IOBT', hhmm);
        set('IOBD', dof);

        set('SPEED', ac.speed);
        set('FLLEVEL', ac.level);

        set('ROUTE', 'ZONA BRASOV GHIMBAV');
        set('ADES', 'ZZZZ');
        set('ADEP', 'ZZZZ');
        set('TTLEET', '0900');
        set('ALTRNT1', 'LRBV');
        set('ALTRNT2', 'LRSB');
        set('DEPZ', 'GHIMBAV 4541N02531E');
        set('DESTZ', 'GHIMBAV 4541N02531E');
        set('OPR', 'AEROCLUBUL ROMANIEI');
        set('ENDURANCE', ac.endurance);
        set('PERSONBOARD', '2');
        set('ACFT_COLOUR', ac.color);
        set('TYPZ', ac.typz); //ALTERNATE TYPE IF type = ZZZZ

        /* 2 ── TICK the correct equipment & capability boxes */

        /** convenience: untick everything first, then tick what we need */
        const untickAll = name => {
            doc.querySelectorAll(`input[type="checkbox"][name="${name}"]`)
                .forEach(cb => { cb.checked = false; });
        };

        const tickSet = (name, codes /*string like "SDFG" or "E1E2"*/) =>
            codes.match(/([A-Z]\d?)/g)?.forEach(code => {
                const cb = doc.querySelector(`input[type="checkbox"][name="${name}"][value="${code}"]`);
                if (cb) cb.checked = true;
            });

        untickAll('EQPT');
        untickAll('SEQPT');
        untickAll('SURV_EQPT');
        untickAll('JACKETS');
        untickAll('UHF');
        untickAll('UHT');

        tickSet('EQPT', ac.equip || 'Y');
        tickSet('SEQPT', ac.surv || 'S');
        tickSet('SURV_EQPT', 'PDMJ');
        tickSet('JACKETS', 'LFUV');
        tickSet('UHF', 'U');

        if (!ac.hasElt) {
            tickSet('UHT', 'E');
        }


        console.log('[ROMATSA‑auto] form filled for', reg);
    }
})();
