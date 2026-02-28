// ==UserScript==
// @name         ROMATSA flight-plan autofill
// @version      1.2.0
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
// @grant        GM_xmlhttpRequest
// @connect      firestore.googleapis.com
// ==/UserScript==

(async function () {
    'use strict';

    /* ─────── Per-field autofill fallbacks ─────── */
    const DEFAULTS = { speed: 'K0140', typz: '', endurance: '0500', hasElt: false, pob: '2', wake: 'L' };

    /* ─────── Firebase / Firestore config ─────── */
    const FIREBASE_PROJECT_ID = 'auto-flight-plan';
    const FIREBASE_API_KEY    = 'AIzaSyD7tRrn49vFLlohOf74-eT1kmVgWWgMpLU';
    const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/profiles`;

    /* ─────── Load saved config ─────── */
    let FLEET   = await GM_getValue('fleet',   null);
    let DETAILS = await GM_getValue('details', null);

    // First run: no local data — prompt user to pick a cloud profile
    if (!FLEET || !DETAILS) openCloudProfilesModal(true);

    /* ─────── Settings UI ─────── */
    GM_registerMenuCommand('Edit Fleet', () => openFleetEditor());
    GM_registerMenuCommand('Edit Defaults', () => openDefaultsEditor());
    GM_registerMenuCommand('☁ Cloud Profiles', () => openCloudProfilesModal());

    /* ─────── Firestore helpers ─────── */
    function gmFetch(url, { method = 'GET', body } = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method, url,
                headers: { 'Content-Type': 'application/json' },
                data: body ? JSON.stringify(body) : undefined,
                onload: r => resolve({ ok: r.status >= 200 && r.status < 300, json: () => JSON.parse(r.responseText) }),
                onerror: reject,
            });
        });
    }

    function toFsVal(v) {
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'string')  return { stringValue: v };
        if (v !== null && typeof v === 'object')
            return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFsVal(x)])) } };
        return { nullValue: null };
    }
    function fromFsVal(v) {
        if ('stringValue'  in v) return v.stringValue;
        if ('booleanValue' in v) return v.booleanValue;
        if ('mapValue'     in v) return Object.fromEntries(Object.entries(v.mapValue.fields).map(([k, x]) => [k, fromFsVal(x)]));
        return null;
    }
    const toFsDoc   = obj => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFsVal(v)])) });
    const fromFsDoc = doc => Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFsVal(v)]));

    /* ─────── Cloud Profiles modal ─────── */
    async function openCloudProfilesModal(firstRun = false) {
        if (document.getElementById('script-settings-modal')) return;

        const style = document.createElement('style');
        style.textContent = `
            #script-settings-modal { position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; }
            #script-settings-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
            #script-settings-box { position: relative; background: white; border-radius: 10px; padding: 16px; width: 95%; max-width: 600px; max-height: 90vh; overflow: auto; font-family: sans-serif; }
            #script-settings-box h2 { margin-top: 0; }
            .script-btn { padding: 4px 8px; cursor: pointer; border: 1px solid #aaa; border-radius: 4px; background: #f5f5f5; }
            .cloud-profile-item { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
            .cloud-profile-meta { flex: 1; }
            .cloud-profile-name { font-weight: bold; font-size: 14px; }
            .cloud-profile-sub  { font-size: 12px; color: #666; margin-top: 2px; }
            .cloud-publish { border-top: 1px solid #ddd; margin-top: 14px; padding-top: 14px; }
            .cloud-publish h3 { margin: 0 0 10px; font-size: 14px; }
            .cloud-publish label { display: block; font-size: 12px; font-weight: bold; margin-bottom: 4px; }
            .cloud-publish input { width: 100%; padding: 5px; margin-bottom: 10px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            .cloud-publish-actions { text-align: right; }
            #cloud-feedback { font-size: 13px; margin-top: 6px; min-height: 18px; }
        `;
        document.body.appendChild(style);

        const root = document.createElement('div');
        root.id = 'script-settings-modal';
        root.innerHTML = `
          <div id="script-settings-backdrop"></div>
          <div id="script-settings-box">
            <h2>☁ Cloud Profiles</h2>
            ${firstRun ? '<p style="margin:0 0 12px;padding:10px;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;font-size:13px;">No local configuration found. Select a profile below to get started.</p>' : ''}
            <div id="cloud-profiles-list">Loading profiles…</div>
            ${!firstRun ? `
            <div class="cloud-publish">
              <h3>Publish current config</h3>
              <label>Profile name</label>
              <input id="cloud-pub-name" type="text" placeholder="e.g. Aeroclub Brasov">
              <label>Your name</label>
              <input id="cloud-pub-author" type="text" placeholder="e.g. Sebastian">
              <div class="cloud-publish-actions">
                <button class="script-btn" id="cloud-pub-btn">Publish to Cloud</button>
              </div>
              <div id="cloud-feedback"></div>
            </div>` : ''}
            <div style="text-align:right;margin-top:12px">
              <button class="script-btn" id="script-cancel">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(root);

        root.querySelector('#script-settings-backdrop').onclick = () => root.remove();
        root.querySelector('#script-cancel').onclick = () => root.remove();

        const listEl = root.querySelector('#cloud-profiles-list');
        const feedback = root.querySelector('#cloud-feedback');

        /* ── Load profiles ── */
        const renderProfiles = async () => {
            listEl.textContent = 'Loading profiles…';
            try {
                const res = await gmFetch(`${FIRESTORE_URL}?key=${FIREBASE_API_KEY}&pageSize=50`);
                if (!res.ok) throw new Error('Fetch failed');
                const data = res.json();
                const docs = data.documents || [];
                if (docs.length === 0) {
                    listEl.textContent = 'No profiles yet — be the first to publish one!';
                    return;
                }
                listEl.innerHTML = '';
                docs.forEach(doc => {
                    const p = fromFsDoc(doc);
                    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
                    const item = document.createElement('div');
                    item.className = 'cloud-profile-item';
                    item.innerHTML = `
                      <div class="cloud-profile-meta">
                        <div class="cloud-profile-name">${p.name || '(unnamed)'}</div>
                        <div class="cloud-profile-sub">by ${p.author || 'unknown'} · ${date}</div>
                      </div>
                      <button class="script-btn">Load</button>
                    `;
                    item.querySelector('button').onclick = async () => {
                        if (!confirm(`Load profile "${p.name}"? This will overwrite your local fleet and defaults.`)) return;
                        FLEET   = p.fleet;
                        DETAILS = p.details;
                        await GM_setValue('fleet', FLEET);
                        await GM_setValue('details', DETAILS);
                        root.remove();
                        alert('Profile loaded! Reload the page to apply changes.');
                    };
                    listEl.appendChild(item);
                });
            } catch (e) {
                listEl.textContent = 'Failed to load profiles. Check your Firebase credentials.';
            }
        };

        await renderProfiles();

        /* ── Publish ── */
        root.querySelector('#cloud-pub-btn').onclick = async () => {
            const name   = root.querySelector('#cloud-pub-name').value.trim();
            const author = root.querySelector('#cloud-pub-author').value.trim();
            if (!name || !author) { feedback.textContent = 'Please fill in both fields.'; return; }
            feedback.textContent = 'Publishing…';
            feedback.style.color = '';
            // Derive a stable document ID from the profile name so names are unique and immutable.
            // currentDocument.exists=false makes Firestore reject the request if the ID is already taken.
            const docId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const url = `${FIRESTORE_URL}/${docId}?currentDocument.exists=false&key=${FIREBASE_API_KEY}`;
            try {
                const body = toFsDoc({ name, author, fleet: FLEET, details: DETAILS, createdAt: new Date().toISOString() });
                const res = await gmFetch(url, { method: 'PATCH', body });
                if (!res.ok) {
                    const err = res.json();
                    const alreadyExists = err?.error?.status === 'ALREADY_EXISTS';
                    feedback.style.color = 'red';
                    feedback.textContent = alreadyExists
                        ? `A profile named "${name}" already exists. Choose a different name.`
                        : `Publish failed: ${err?.error?.message ?? err?.error?.status ?? 'unknown error'}`;
                    return;
                }
                feedback.style.color = 'green';
                feedback.textContent = 'Published! Refreshing list…';
                root.querySelector('#cloud-pub-name').value = '';
                root.querySelector('#cloud-pub-author').value = '';
                await renderProfiles();
                feedback.textContent = '';
            } catch (e) {
                feedback.style.color = 'red';
                feedback.textContent = `Publish failed: ${e?.message ?? String(e)}`;
            }
        };
    }

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
            if (FLEET) Object.entries(FLEET).forEach(([reg, data]) => addFleetRow(content, reg, data));
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add Aircraft';
            addBtn.className = 'script-btn';
            addBtn.onclick = () => addFleetRow(content, '', {});
            content.appendChild(addBtn);

            const cloudBtn = document.createElement('button');
            cloudBtn.textContent = '☁ Load from Cloud';
            cloudBtn.type = 'button';
            cloudBtn.style.marginLeft = '12px';
            cloudBtn.addEventListener('click', () => {
                document.getElementById('script-settings-modal')?.remove();
                openCloudProfilesModal();
            });
            content.appendChild(cloudBtn);
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

            (DETAILS ? Object.entries(DETAILS) : []).forEach(([key, val]) => {
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

            const cloudBtn = document.createElement('button');
            cloudBtn.textContent = '☁ Load from Cloud';
            cloudBtn.type = 'button';
            cloudBtn.style.marginTop = '12px';
            cloudBtn.addEventListener('click', () => {
                document.getElementById('script-settings-modal')?.remove();
                openCloudProfilesModal();
            });
            content.appendChild(cloudBtn);
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
        if (!FLEET) return; // no profile loaded yet

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
        if (DETAILS) Object.entries(DETAILS).forEach(([k, v]) => set(k, v));

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
