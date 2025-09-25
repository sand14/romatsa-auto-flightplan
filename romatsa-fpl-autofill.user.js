// ==UserScript==
// @name         ROMATSA flight-plan autofill
// @version      1.1.0
// @author       Avrigeanu Sebastian
// @license      MIT
// @description  Adds an aircraft picker and fills the New Flight Plan form
// @match        https://flightplan.romatsa.ro/index.php?option=com_wrapper&view=wrapper&Itemid=69*
// @downloadURL  https://github.com/sand14/romatsa-auto-flightplan/raw/refs/heads/main/romatsa-fpl-autofill.user.js
// @updateURL    https://github.com/sand14/romatsa-auto-flightplan/raw/refs/heads/main/romatsa-fpl-autofill.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// ==/UserScript==

(async function () {
    'use strict';

    /* ─────── YOUR FLEET (defaults) ─────── */
    const DEFAULT_FLEET = {
        'YR5651': { type: 'SVNH', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', color: 'WHITE AND BLUE', endurance: '0500', pob: '2' },
        'YR5604': { type: 'SVNH', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', color: 'WHITE AND BLUE', endurance: '0500', pob: '2' },
        'YRBVI': { type: 'IR46', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', color: 'WHITE AND BLUE AND RED', endurance: '0400', pob: '2' },
        'YRARL': { type: 'CRUZ', wake: 'L', equip: 'ODY', surv: 'S', speed: 'K0160', color: 'WHITE AND BLUE DOTS', endurance: '0600', hasElt: true, pob: '2' },
        'YRZCP': { type: 'Z42', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0170', color: 'WHITE AND RED', endurance: '0500', hasElt: true, pob: '2' },
        'YR1810': { type: 'ZZZZ', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0140', color: 'WHITE AND RED', endurance: '0600', typz: 'IS28M2', pob: '2' },
        'YRPBF': { type: 'AN2', wake: 'L', equip: 'Y', surv: 'S', speed: 'K0180', color: 'WHITE AND BLUE', endurance: '0300', pob: '2' }
    };
    const DEFAULTS = { speed: 'K0140', typz: '', endurance: '0500', hasElt: false, pob: '2' , wake: 'L' };

    /* ─────── OTHER DEFAULT DETAILS ─────── */
    const DEFAULT_DETAILS = {
        ROUTE: 'ZONA BRASOV GHIMBAV',
        ADES: 'ZZZZ',
        ADEP: 'ZZZZ',
        TTLEET: '0900',
        ALTRNT1: 'LRBV',
        ALTRNT2: 'LRSB',
        DEPZ: 'GHIMBAV 4541N02531E',
        DESTZ: 'GHIMBAV 4541N02531E',
        OPR: 'AEROCLUBUL ROMANIEI',
        RMK: '',
    };

    /* ─────── Load saved or fallback ─────── */
    let FLEET = await GM_getValue('fleet', DEFAULT_FLEET);
    let DETAILS = await GM_getValue('details', DEFAULT_DETAILS);

    /* ─────── Settings UI ─────── */
    GM_registerMenuCommand('Edit Fleet', () => openFleetEditor());
    GM_registerMenuCommand('Edit Defaults', () => openDefaultsEditor());

    function createModal(title, contentBuilder, onSave) {
        if (document.getElementById('script-settings-modal')) return;

        const style = document.createElement('style');
        style.textContent = `
            #script-settings-modal { position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; }
            #script-settings-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
            #script-settings-box { position: relative; background: white; border-radius: 10px; padding: 16px; width: 95%; max-width: 1200px; max-height: 90vh; overflow: auto; font-family: sans-serif; }
            #script-settings-box h2 { margin-top: 0; }
            #script-settings-box input[type="text"] { width: 100%; padding: 4px; }
            .script-row { display: grid; grid-template-columns: 80px 90px 40px 60px 60px 1fr 80px 80px 80px 100px 50px 50px; gap: 6px; align-items: center; }
            .script-actions { text-align: right; margin-top: 10px; }
            .script-btn { padding: 4px 8px; cursor: pointer; border: 1px solid #aaa; border-radius: 4px; background: #f5f5f5; }
            .elt-cell { display: flex; justify-content: center; align-items: center; }
            .script-defaults { display: flex; flex-direction: column; gap: 10px; }
            .script-defaults label { display: flex; flex-direction: column; font-size: 12px; font-weight: bold; }
            .script-defaults input { padding: 6px; width: 100%; }
            .script-defaults .defaults-row { display: flex; flex-direction: column; }
        `;

        document.body.appendChild(style);

        const root = document.createElement('div');
        root.id = 'script-settings-modal';
        root.innerHTML = `
          <div id="script-settings-backdrop"></div>
          <div id="script-settings-box">
            <h2>${title}</h2>
            <div id="script-settings-content"></div>
            <div class="script-actions">
              <button class="script-btn" id="script-cancel">Cancel</button>
              <button class="script-btn" id="script-save">Save</button>
            </div>
          </div>
        `;
        document.body.appendChild(root);

        const content = root.querySelector('#script-settings-content');
        contentBuilder(content);

        root.querySelector('#script-cancel').onclick = () => root.remove();
        root.querySelector('#script-save').onclick = async () => {
            await onSave(content);
            root.remove();
            alert('Saved! Reload the page to apply changes.');
        };
        root.querySelector('#script-settings-backdrop').onclick = () => root.remove();
    }

    /* ─────── Fleet editor ─────── */
    function openFleetEditor() {
        createModal('Edit Fleet', content => {
            Object.entries(FLEET).forEach(([reg, data]) => addFleetRow(content, reg, data));
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add Aircraft';
            addBtn.className = 'script-btn';
            addBtn.onclick = () => addFleetRow(content, '', {});
            content.appendChild(addBtn);

            // Reset button
            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset to Defaults';
            resetBtn.type = 'button';
            resetBtn.style.marginLeft = '12px';
            resetBtn.addEventListener('click', async () => {
                if (confirm("Reset fleet to built-in values?")) {
                    await GM_deleteValue('fleet');
                    FLEET = DEFAULT_FLEET; // use your hardcoded fleet object
                    alert("Fleet reset. Please reopen the editor.");
                }
            });
            content.appendChild(resetBtn);
        }, async content => {
            const rows = content.querySelectorAll('.script-row');
            const newFleet = {};
            rows.forEach(row => {
                const reg = row.querySelector('.reg').value.trim();
                if (!reg) return;
                newFleet[reg] = {
                    type: row.querySelector('.type').value.trim(),
                    wake: row.querySelector('.wake').value.trim(),
                    equip: row.querySelector('.equip').value.trim(),
                    surv: row.querySelector('.surv').value.trim(),
                    color: row.querySelector('.color').value.trim(),
                    endurance: row.querySelector('.endurance').value.trim(),
                    speed: row.querySelector('.speed').value.trim(),
                    typz: row.querySelector('.typz').value.trim(),
                    pob: row.querySelector('.pob').value.trim(),
                    hasElt: row.querySelector('.hasElt').checked
                };
            });
            FLEET = newFleet;
            await GM_setValue('fleet', FLEET);
        });
    }

    function addFleetRow(container, reg, data) {
        const row = document.createElement('div');
        row.className = 'script-row';
        row.innerHTML = `
        <input class="reg" placeholder="Reg" value="${reg || ''}">
        <input class="type" placeholder="Type" value="${data.type || ''}">
        <input class="wake" placeholder="Wake" value="${data.wake || 'L'}">
        <input class="equip" placeholder="Equip" value="${data.equip || 'Y'}">
        <input class="surv" placeholder="Surv" value="${data.surv || 'S'}">
        <input class="color" placeholder="Color" value="${data.color || ''}">
        <input class="endurance" placeholder="Endurance" value="${data.endurance || '0500'}">
        <input class="speed" placeholder="Speed" value="${data.speed || 'K0140'}">
        <input class="typz" placeholder="Typz" value="${data.typz || ''}">
        <input class="pob" placeholder="POB" value="${data.pob || '2'}">
        <div class="elt-cell"><input type="checkbox" class="hasElt" ${data.hasElt ? 'checked' : ''}>ELT</div>
        <button class="script-btn delete-btn">✕</button>
            `;
        row.querySelector('.delete-btn').onclick = () => row.remove();
        container.appendChild(row);
    }

    /* ─────── Defaults editor ─────── */
    function openDefaultsEditor() {
        createModal('Edit Defaults', content => {
            // container for stacked layout
            const wrapper = document.createElement('div');
            wrapper.className = 'script-defaults';
            content.appendChild(wrapper);

            Object.entries(DETAILS).forEach(([key, val]) => {
                const row = document.createElement('div');
                row.className = 'defaults-row';

                const label = document.createElement('label');
                label.textContent = key;
                label.htmlFor = 'def-' + key;

                const input = document.createElement('input');
                input.id = 'def-' + key;
                input.dataset.key = key;
                input.value = val;

                row.appendChild(label);
                row.appendChild(input);
                wrapper.appendChild(row);
            });

            // Reset button
            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset to Defaults';
            resetBtn.type = 'button';
            resetBtn.style.marginTop = '12px';
            resetBtn.addEventListener('click', async () => {
                if (confirm("Reset defaults to built-in values?")) {
                    await GM_deleteValue('details');
                    DETAILS = DEFAULT_DETAILS;
                    alert("Defaults reset. Please reopen the editor.");
                }
            });
            content.appendChild(resetBtn);
        }, async content => {
            const inputs = content.querySelectorAll('input');
            const newDetails = {};
            inputs.forEach(inp => newDetails[inp.dataset.key] = inp.value);
            DETAILS = newDetails;
            await GM_setValue('details', DETAILS);
        });
    }

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
        console.log('[ROMATSA-auto] picker ready');
    }

    function autofill(doc, reg) {
        if (!reg) return;
        const d = new Date();
        let minutes = d.getUTCMinutes();

        if (minutes % 10 === 0) {
            d.setUTCMinutes(minutes + 40);
        } else {
            d.setUTCMinutes(minutes + 30);
            const newMinutes = d.getUTCMinutes();
            d.setUTCMinutes(Math.ceil(newMinutes / 10) * 10);
        }

        const hhmm = d.toISOString().slice(11, 16).replace(':', '');
        const iso = d.toISOString().slice(0, 10).replace(/-/g, '');
        const dof = iso.slice(2);
        const ac = { ...DEFAULTS, ...FLEET[reg] };

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
        set('FLLEVEL', 'VFR'); // always VFR

        // use DETAILS instead of hardcoded
        Object.entries(DETAILS).forEach(([k, v]) => set(k, v));

        set('ENDURANCE', ac.endurance);
        set('PERSONBOARD', ac.pob);
        set('ACFT_COLOUR', ac.color);
        set('TYPZ', ac.typz);

        /* 2 ── TICK the correct equipment & capability boxes */
        const untickAll = name => {
            doc.querySelectorAll(`input[type="checkbox"][name="${name}"]`)
                .forEach(cb => { cb.checked = false; });
        };

        const tickSet = (name, codes) =>
            codes?.match(/([A-Z]\d?)/g)?.forEach(code => {
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

        console.log('[ROMATSA-auto] form filled for', reg);
    }
})();
