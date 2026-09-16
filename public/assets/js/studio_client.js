(function () {
    const bootEl = document.getElementById('StudioBoot');
    if (bootEl) {
        bootEl.style.display = 'none';
    }
    const rootEl = document.getElementById('StudioRoot');
    if (!rootEl || typeof WobGL === 'undefined') {
        return;
    }
    const GAME_ID = parseInt(rootEl.getAttribute('data-game'), 10) || 0;
    const GAME_URL = 'game.php?id=' + GAME_ID;
    const PLAY_URL = 'play.php?id=' + GAME_ID;
    const API_URL = 'api_studio.php?id=' + GAME_ID;

    const viewportEl = document.getElementById('StudioViewport');
    const treeEl = document.getElementById('ExplorerTree');
    const propEl = document.getElementById('PropertyRows');
    const outputEl = document.getElementById('OutputLines');
    const scriptPaneEl = document.getElementById('ScriptPane');
    const scriptTabsEl = document.getElementById('ScriptTabs');
    const scriptCodeEl = document.getElementById('ScriptCode');
    const saveStateEl = document.getElementById('SaveState');
    const statusLeftEl = document.getElementById('StatusLeft');
    const explorerPaneEl = document.getElementById('ExplorerPane');
    const propertiesPaneEl = document.getElementById('PropertiesPane');
    const outputPaneEl = document.getElementById('OutputPane');
    const toolSelectBtn = document.getElementById('ToolSelect');
    const toolMoveBtn = document.getElementById('ToolMove');
    const toolResizeBtn = document.getElementById('ToolResize');
    const btnPlay = document.getElementById('BtnPlay');
    const btnSave = document.getElementById('BtnSave');
    const btnDelete = document.getElementById('BtnDelete');
    const btnSnap = document.getElementById('BtnSnap');

    let E = null;
    let memU8 = null;
    let csrf = '';
    const objects = [];
    const guiButtons = [];
    let selGui = -1;
    const scripts = [];
    let keyN = 0;
    let selKind = '';
    let selObj = null;
    let tool = 'select';
    let dirty = false;
    let saveBusy = false;
    let engineSel = -1;
    let snapIdx = 0;
    const snapVals = [0.5, 1, 2, 4];

    function nextKey() {
        keyN += 1;
        return 'k' + keyN;
    }

    function syncMem() {
        if (!memU8 || memU8.buffer !== E.memory.buffer) {
            memU8 = new Uint8Array(E.memory.buffer);
        }
    }

    function putStr(s) {
        const bytes = new TextEncoder().encode(String(s));
        const p = E.alloc(bytes.length);
        syncMem();
        memU8.set(bytes, p);
        return { p: p, n: bytes.length };
    }

    function readName(i) {
        syncMem();
        const p = E.stNamePtr(i);
        const n = E.stNameLen(i);
        if (!p || n < 1) {
            return '';
        }
        return new TextDecoder().decode(new Uint8Array(E.memory.buffer, p, n));
    }

    function readCode(i) {
        syncMem();
        const p = E.stCodePtr(i);
        const n = E.stCodeLen(i);
        if (!p || n < 1) {
            return '';
        }
        return new TextDecoder().decode(new Uint8Array(E.memory.buffer, p, n));
    }

    function setEngineCode(i, text) {
        const c = putStr(String(text).slice(0, 5000));
        E.stSetCode(i, c.p, c.n);
    }

    function outLine(text, cls) {
        const line = document.createElement('div');
        line.className = cls ? 'OutLine ' + cls : 'OutLine';
        line.textContent = text;
        outputEl.appendChild(line);
        outputEl.scrollTop = outputEl.scrollHeight;
        while (outputEl.children.length > 120) {
            outputEl.removeChild(outputEl.firstChild);
        }
    }

    function setStatus(t) {
        statusLeftEl.textContent = t;
    }

    function markDirty() {
        dirty = true;
        saveStateEl.textContent = 'Editing';
        saveStateEl.className = 'SDirty';
    }

    function markSaved() {
        dirty = false;
        saveStateEl.textContent = 'Saved';
        saveStateEl.className = 'SSaved';
    }

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) {
            e.className = cls;
        }
        if (text !== undefined) {
            e.textContent = text;
        }
        return e;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'StudioCanvas';
    viewportEl.insertBefore(canvas, viewportEl.firstChild);
    let GL = null;
    try {
        GL = WobGL.boot(canvas);
    } catch (err) {
        setStatus('WebGL failed');
        return;
    }

    let studsMesh = null;
    let plainMesh = null;
    let spawnMesh = null;
    let lineMesh = null;

    function uploadFrom(ptr, len, stride) {
        syncMem();
        return GL.upload(new Float32Array(E.memory.buffer, ptr, len).slice(), stride);
    }

    function refreshMesh(m, ptr, len) {
        if (m === null) {
            m = uploadFrom(ptr, Math.max(12, len), 12);
            if (len < 1) {
                m.n = 0;
            }
            return m;
        }
        if (len < 1) {
            m.n = 0;
            return m;
        }
        syncMem();
        GL.update(m, new Float32Array(E.memory.buffer, ptr, len).slice());
        return m;
    }

    function refreshMeshes() {
        studsMesh = refreshMesh(studsMesh, E.stMeshStudsPtr(), E.stMeshStudsLen());
        plainMesh = refreshMesh(plainMesh, E.stMeshPlainPtr(), E.stMeshPlainLen());
        spawnMesh = refreshMesh(spawnMesh, E.stMeshSpawnPtr(), E.stMeshSpawnLen());
    }

    function hexInt(h, def) {
        const s = String(h || '').replace('#', '').toUpperCase();
        return /^[0-9A-F]{6}$/.test(s) ? parseInt(s, 16) : def;
    }

    function hexStr(n) {
        return ('000000' + (n & 0xFFFFFF).toString(16)).slice(-6).toUpperCase();
    }

    function classStr(c) {
        if (c === 1) {
            return 'SpawnLocation';
        }
        if (c === 2) {
            return 'RemoteEvent';
        }
        return 'Part';
    }

    function twistChar(name, hasKids) {
        return function () {
            name.classList.toggle('Twisted');
        };
    }

    function serviceRow(name) {
        const row = el('div', 'TRow ServiceRow');
        row.appendChild(el('span', 'TIcon IcService'));
        row.appendChild(el('span', 'TLabel', name));
        row.addEventListener('click', function () {
            row.classList.toggle('Sel');
        });
        row.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
        });
        return row;
    }

    function objRow(label, iconCls, depth, isSel, onpick, twist, ontwist) {
        const row = el('div', 'TRow ObjRow' + (isSel ? ' Sel' : ''));
        if (depth) {
            row.style.paddingLeft = String(12 + depth * 16) + 'px';
        }
        const tw = el('span', 'TTwist' + (twist ? ' On' : ''));
        if (twist) {
            tw.addEventListener('click', function (ev) {
                ev.stopPropagation();
                twist(row);
            });
        }
        row.appendChild(tw);
        row.appendChild(el('span', 'TIcon ' + iconCls));
        row.appendChild(el('span', 'TLabel', label));
        row.addEventListener('click', onpick);
        row.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            onpick();
        });
        if (ontwist) {
            row.classList.add('TOpen');
        }
        return row;
    }

    function engineObjectAt(i) {
        if (i < 0 || i >= objects.length) {
            return null;
        }
        return objects[i].dead ? null : objects[i];
    }

    function isSel(kind, obj) {
        if (kind === 'part') {
            return E.stSelected() >= 0 && engineObjectAt(E.stSelected()) === obj;
        }
        return selKind === kind && selObj === obj;
    }

    function pick(kind, obj) {
        selKind = kind;
        selObj = obj;
        if (kind === 'part') {
            const idx = objects.indexOf(obj);
            E.stSetSel(idx);
        }
        renderTree();
        renderProps();
    }

    function renderTree() {
        treeEl.innerHTML = '';
        const game = el('div', 'TRow ServiceRow');
        game.appendChild(el('span', 'TIcon IcGame'));
        game.appendChild(el('span', 'TLabel', rootEl.getAttribute('data-gamename') || 'Place'));
        treeEl.appendChild(game);
        const ws = serviceRow('Workspace');
        treeEl.appendChild(ws);
        objects.forEach(function (o, i) {
            if (o.dead || o.class === 'RemoteEvent') {
                return;
            }
            treeEl.appendChild(objRow(o.name, o.class === 'SpawnLocation' ? 'IcSpawn' : 'IcPart', 1, isSel('part', o), function () {
                pick('part', o);
            }, twistChar(o.name, false)));
        });
        const sss = serviceRow('ServerScriptService');
        treeEl.appendChild(sss);
        scripts.forEach(function (s) {
            if (s.kind !== 'Script') {
                return;
            }
            treeEl.appendChild(objRow(s.name, 'IcScript', 1, isSel('script', s), function () {
                pick('script', s);
                openScript(s);
            }, twistChar(s.name, true), true));
        });
        const sps = serviceRow('StarterPlayerScripts');
        treeEl.appendChild(sps);
        scripts.forEach(function (s) {
            if (s.kind !== 'LocalScript') {
                return;
            }
            treeEl.appendChild(objRow(s.name, 'IcLocal', 2, isSel('script', s), function () {
                pick('script', s);
                openScript(s);
            }, twistChar(s.name, true), true));
        });
        const rs = serviceRow('ReplicatedStorage');
        treeEl.appendChild(rs);
        objects.forEach(function (o) {
            if (o.dead || o.class !== 'RemoteEvent') {
                return;
            }
            treeEl.appendChild(objRow(o.name, 'IcRemote', 1, isSel('part', o), function () {
                pick('part', o);
            }, twistChar(o.name, false)));
        });
        const sg = serviceRow('StarterGui');
        treeEl.appendChild(sg);
        guiButtons.forEach(function (g, gi) {
            treeEl.appendChild(objRow(g.name, 'IcGui', 1, selKind === 'gui' && selGui === gi, function () {
                selKind = 'gui';
                selObj = null;
                selGui = gi;
                renderTree();
                renderProps();
                renderGui();
            }, twistChar(g.name, false)));
        });
    }

    function renderGui() {
        const rowsEl = document.getElementById('GuiRows');
        const fieldsEl = document.getElementById('GuiFields');
        if (!rowsEl || !fieldsEl) {
            return;
        }
        rowsEl.innerHTML = '';
        fieldsEl.innerHTML = '';
        guiButtons.forEach(function (g, gi) {
            const row = el('div', 'GuiRow' + (selKind === 'gui' && selGui === gi ? ' GuiRowOn' : ''));
            row.appendChild(el('span', 'GuiRowName', g.name));
            const x = el('span', 'GuiRowX', 'x');
            x.addEventListener('click', function (ev) {
                ev.stopPropagation();
                guiButtons.splice(gi, 1);
                if (selGui === gi) {
                    selGui = -1;
                    selKind = '';
                } else if (selGui > gi) {
                    selGui--;
                }
                renderGui();
                renderTree();
                markDirty();
            });
            row.appendChild(x);
            row.addEventListener('click', function () {
                selKind = 'gui';
                selObj = null;
                selGui = gi;
                renderGui();
                renderTree();
            });
            rowsEl.appendChild(row);
        });
        if (guiButtons.length === 0) {
            rowsEl.appendChild(el('div', 'GuiEmpty', 'No ScreenGui buttons yet. Use Insert then ScreenGui Button.'));
        }
        if (selKind !== 'gui' || selGui < 0 || !guiButtons[selGui]) {
            fieldsEl.appendChild(el('div', 'GuiEmpty', 'Pick a button above to edit it.'));
            return;
        }
        const g = guiButtons[selGui];
        const mkRow = function (label) {
            const r = el('div', 'GuiFieldRow');
            r.appendChild(el('span', 'GuiFieldLabel', label));
            fieldsEl.appendChild(r);
            return r;
        };
        let r = mkRow('Text');
        r.appendChild(guiInput(g.name, function (v) {
            g.name = v;
            renderTree();
            renderGui();
            markDirty();
        }));
        r = mkRow('X');
        r.appendChild(guiNumInput(g.px, function (v) {
            g.px = v;
            markDirty();
        }));
        r = mkRow('Y');
        r.appendChild(guiNumInput(g.py, function (v) {
            g.py = v;
            markDirty();
        }));
        r = mkRow('Width');
        r.appendChild(guiNumInput(g.sx, function (v) {
            g.sx = v;
            markDirty();
        }));
        r = mkRow('Height');
        r.appendChild(guiNumInput(g.sy, function (v) {
            g.sy = v;
            markDirty();
        }));
        r = mkRow('Color');
        r.appendChild(guiInput('#' + g.color, function (v) {
            const c = String(v).replace('#', '').toUpperCase();
            if (/^[0-9A-F]{6}$/.test(c)) {
                g.color = c;
                markDirty();
            }
        }));
        r = mkRow('Script (runs on click)');
        const ta = el('textarea', 'GuiCode');
        ta.spellcheck = false;
        ta.value = g.code || '';
        ta.addEventListener('input', function () {
            g.code = ta.value;
            markDirty();
        });
        fieldsEl.appendChild(ta);
    }

    function guiInput(value, oncommit) {
        const i = el('input', 'PInput');
        i.type = 'text';
        i.value = value;
        i.addEventListener('change', function () {
            oncommit(i.value);
        });
        return i;
    }

    function guiNumInput(value, oncommit) {
        const i = el('input', 'PInput');
        i.type = 'number';
        i.step = 'any';
        i.value = String(value);
        i.addEventListener('change', function () {
            const v = parseFloat(i.value);
            if (isFinite(v)) {
                oncommit(v);
            } else {
                i.value = String(value);
            }
        });
        return i;
    }

    function propRow(label) {
        const row = el('div', 'PRow');
        const lab = el('span', 'PLabel', label);
        row.appendChild(lab);
        propEl.appendChild(row);
        return row;
    }

    function roInput(value) {
        const i = el('input', 'PInput');
        i.type = 'text';
        i.value = value;
        i.readOnly = true;
        return i;
    }

    function textInput(value, oncommit, onlive) {
        const i = el('input', 'PInput');
        i.type = 'text';
        i.value = value;
        i.addEventListener('input', function () {
            if (onlive) {
                onlive(i.value);
            }
        });
        i.addEventListener('change', function () {
            oncommit(i.value);
        });
        return i;
    }

    function numInput(value, oncommit) {
        const i = el('input', 'PInput');
        i.type = 'number';
        i.step = 'any';
        i.value = String(value);
        i.addEventListener('change', function () {
            const v = parseFloat(i.value);
            if (isFinite(v)) {
                oncommit(v);
            } else {
                i.value = String(value);
            }
        });
        return i;
    }

    function checkInput(value, oncommit) {
        const i = el('input', 'PCheck');
        i.type = 'checkbox';
        i.checked = !!value;
        i.addEventListener('change', function () {
            oncommit(i.checked);
        });
        return i;
    }

    function vecWrap(inputs) {
        const w = el('span', 'PVec');
        inputs.forEach(function (i) {
            w.appendChild(i);
        });
        return w;
    }

    function usedName(base) {
        const names = [];
        objects.forEach(function (o) {
            if (!o.dead) {
                names.push(o.name);
            }
        });
        scripts.forEach(function (s) {
            names.push(s.name);
        });
        let n = base;
        let k = 1;
        while (names.indexOf(n) !== -1) {
            k += 1;
            n = base + String(k);
        }
        return n;
    }

    function refreshEngineSel() {
        const i = E.stSelected();
        if (i === engineSel) {
            return;
        }
        engineSel = i;
        if (i >= 0) {
            const o = engineObjectAt(i);
            if (o) {
                selKind = 'part';
                selObj = o;
                pullFromEngine(o, i);
                renderTree();
                renderProps();
            }
        } else {
            selKind = '';
            selObj = null;
            renderTree();
            renderProps();
        }
    }

    function pullFromEngine(o, i) {
        o.px = E.stNum(i, 0);
        o.py = E.stNum(i, 1);
        o.pz = E.stNum(i, 2);
        o.sx = E.stNum(i, 3);
        o.sy = E.stNum(i, 4);
        o.sz = E.stNum(i, 5);
        o.color = hexStr(E.stColor(i));
        o.anchored = E.stAnchored(i) === 1;
        o.name = readName(i);
        o.code = readCode(i);
    }

    function renderProps() {
        propEl.innerHTML = '';
        if (selKind === 'part' && selObj) {
            const o = selObj;
            const idx = objects.indexOf(o);
            let row = propRow('Class');
            row.appendChild(roInput(o.class));
            row = propRow('Name');
            row.appendChild(textInput(o.name, function (v) {
                const s = v.trim().slice(0, 64) || o.class;
                o.name = s;
                const nm = putStr(s);
                E.stSetName(idx, nm.p, nm.n);
                renderTree();
                renderProps();
                markDirty();
            }));
            row = propRow('Position');
            row.appendChild(vecWrap([
                numInput(o.px, function (v) { o.px = v; E.stSetNum(idx, 0, v); markDirty(); }),
                numInput(o.py, function (v) { o.py = v; E.stSetNum(idx, 1, v); markDirty(); }),
                numInput(o.pz, function (v) { o.pz = v; E.stSetNum(idx, 2, v); markDirty(); })
            ]));
            row = propRow('Size');
            row.appendChild(vecWrap([
                numInput(o.sx, function (v) { o.sx = v; E.stSetNum(idx, 3, v); markDirty(); }),
                numInput(o.sy, function (v) { o.sy = v; E.stSetNum(idx, 4, v); markDirty(); }),
                numInput(o.sz, function (v) { o.sz = v; E.stSetNum(idx, 5, v); markDirty(); })
            ]));
            row = propRow('Color');
            row.appendChild(textInput('#' + o.color, function (v) {
                const s = String(v).replace('#', '').toUpperCase();
                if (/^[0-9A-F]{6}$/.test(s)) {
                    o.color = s;
                    E.stSetColor(idx, parseInt(s, 16));
                    markDirty();
                }
            }));
            row = propRow('Anchored');
            row.appendChild(checkInput(o.anchored, function (v) {
                o.anchored = v;
                E.stSetAnchored(idx, v ? 1 : 0);
                markDirty();
            }));
            if (o.class === 'Part' || o.class === 'SpawnLocation') {
                if (o.name === 'Handle') {
                    row = propRow('Image');
                    const ii = textInput(o.service !== 'Workspace' ? o.service : '', function (v) {
                        const s = v.trim();
                        o.service = s !== '' ? s : 'Workspace';
                        markDirty();
                    });
                    row.appendChild(ii);
                }
                row = propRow('Script');
                const hint = el('span', 'PInfoText', o.name === 'Handle' ? 'Runs when a player equips or uses this tool.' : 'Only used when the part is named Handle.');
                row.appendChild(hint);
                const ta = el('textarea', 'PCode');
                ta.spellcheck = false;
                ta.value = o.code || '';
                ta.addEventListener('input', function () {
                    o.code = ta.value;
                    setEngineCode(idx, o.code);
                    markDirty();
                });
                propEl.appendChild(ta);
            }
        } else if (selKind === 'script' && selObj) {
            const s = selObj;
            let row = propRow('Class');
            row.appendChild(roInput(s.kind));
            row = propRow('Name');
            row.appendChild(textInput(s.name, function (v) {
                s.name = v.trim().slice(0, 64) || s.kind;
                renderTree();
                renderTabs();
                markDirty();
            }));
            row = propRow('Runs in');
            row.appendChild(roInput(s.service));
        } else {
            const row = propRow('Info');
            const p = el('span', 'PInfoText', 'Click a part in the 3D view to edit it.');
            row.appendChild(p);
        }
    }

    const openTabs = [];
    let activeTab = '';

    function renderTabs() {
        scriptTabsEl.innerHTML = '';
        openTabs.forEach(function (key) {
            const s = scripts.filter(function (x) { return x.key === key; })[0];
            if (!s) {
                return;
            }
            const t = el('span', 'STab' + (key === activeTab ? ' STabOn' : ''), s.name);
            const x = el('span', 'STabX', 'x');
            x.addEventListener('click', function (ev) {
                ev.stopPropagation();
                closeScript(key);
            });
            t.appendChild(x);
            t.addEventListener('click', function () {
                activeTab = key;
                showActiveScript();
                renderTabs();
            });
            scriptTabsEl.appendChild(t);
        });
    }

    function showActiveScript() {
        const s = scripts.filter(function (x) { return x.key === activeTab; })[0];
        if (!s) {
            scriptCodeEl.value = '';
            return;
        }
        scriptCodeEl.value = s.code;
    }

    function openScript(s) {
        if (openTabs.indexOf(s.key) === -1) {
            openTabs.push(s.key);
        }
        activeTab = s.key;
        scriptPaneEl.classList.remove('Hidden');
        showActiveScript();
        renderTabs();
    }

    function closeScript(key) {
        const i = openTabs.indexOf(key);
        if (i !== -1) {
            openTabs.splice(i, 1);
        }
        if (activeTab === key) {
            activeTab = openTabs[0] || '';
        }
        showActiveScript();
        renderTabs();
    }

    scriptCodeEl.addEventListener('input', function () {
        const s = scripts.filter(function (x) { return x.key === activeTab; })[0];
        if (s) {
            s.code = scriptCodeEl.value;
            markDirty();
        }
    });

    function insertPart() {
        const nm = putStr(usedName('Part'));
        const idx = E.stInsert(0, nm.p, nm.n, putStr('Workspace').p, 9, 0xA3A2A5, 1);
        if (idx < 0) {
            outLine('The place is full. Delete something first.', 'OutErr');
            return;
        }
        afterInsert(idx);
        outLine('Inserted ' + objects[idx].name + '.', 'OutInfo');
    }

    function afterInsert(idx) {
        const cls = classStr(E.stClass(idx));
        const o = {
            key: nextKey(),
            class: cls,
            name: readName(idx),
            service: 'Workspace',
            px: E.stNum(idx, 0),
            py: E.stNum(idx, 1),
            pz: E.stNum(idx, 2),
            sx: E.stNum(idx, 3),
            sy: E.stNum(idx, 4),
            sz: E.stNum(idx, 5),
            color: hexStr(E.stColor(idx)),
            anchored: E.stAnchored(idx) === 1
        };
        objects[idx] = o;
        pick('part', o);
        markDirty();
    }

    function insertSpawn() {
        const nm = putStr(usedName('SpawnLocation'));
        const idx = E.stInsert(1, nm.p, nm.n, putStr('Workspace').p, 9, 0xA3A2A5, 1);
        if (idx < 0) {
            outLine('The place is full. Delete something first.', 'OutErr');
            return;
        }
        afterInsert(idx);
        outLine('Inserted ' + objects[idx].name + '. Builders will spawn on it.', 'OutInfo');
    }

    function insertScript(kind) {
        const s = {
            key: nextKey(),
            name: usedName(kind),
            kind: kind,
            service: kind === 'LocalScript' ? 'StarterPlayerScripts' : 'ServerScriptService',
            code: 'print("Hello world!")'
        };
        scripts.push(s);
        pick('script', s);
        openScript(s);
        renderTree();
        markDirty();
        outLine('Inserted ' + s.name + '.', 'OutInfo');
    }

    function insertRemote() {
        const o = {
            key: nextKey(),
            class: 'RemoteEvent',
            name: usedName('RemoteEvent'),
            service: 'ReplicatedStorage',
            px: 0,
            py: 0,
            pz: 0,
            sx: 4,
            sy: 1.2,
            sz: 2,
            color: 'A3A2A5',
            anchored: true
        };
        const nm = putStr(o.name);
        const sv = putStr(o.service);
        const idx = E.stAdd(2, nm.p, nm.n, sv.p, sv.n, 0, 0, 0, 4, 1.2, 2, 0xA3A2A5, 1);
        objects[idx] = o;
        pick('part', o);
        renderTree();
        markDirty();
        outLine('Inserted ' + o.name + '.', 'OutInfo');
    }

    function insertGuiButton() {
        if (guiButtons.length >= 32) {
            outLine('A place can hold at most 32 ScreenGui buttons.', 'OutErr');
            return;
        }
        const g = {
            class: 'GuiButton',
            name: usedName('Button'),
            px: 20,
            py: 180 + guiButtons.length * 54,
            sx: 170,
            sy: 40,
            color: 'A3A2A5',
            code: 'print("clicked")'
        };
        guiButtons.push(g);
        selKind = 'gui';
        selObj = null;
        selGui = guiButtons.length - 1;
        const pane = document.getElementById('GuiPane');
        if (pane) {
            pane.classList.remove('Hidden');
        }
        renderGui();
        renderTree();
        markDirty();
        outLine('Inserted ' + g.name + '. Its script runs when a player clicks it in game.', 'OutInfo');
    }

    function deleteSelected() {
        if (selKind === 'gui' && selGui >= 0 && guiButtons[selGui]) {
            const g = guiButtons[selGui];
            guiButtons.splice(selGui, 1);
            selGui = -1;
            selKind = '';
            selObj = null;
            renderGui();
            renderTree();
            markDirty();
            outLine('Deleted ' + g.name + '.', 'OutInfo');
            return;
        }
        if (selKind === 'part' && selObj) {
            const o = selObj;
            E.stDeleteSel();
            o.dead = true;
            outLine('Deleted ' + o.name + '.', 'OutInfo');
        } else if (selKind === 'script' && selObj) {
            const s = selObj;
            closeScript(s.key);
            const i = scripts.indexOf(s);
            if (i !== -1) {
                scripts.splice(i, 1);
            }
            outLine('Deleted ' + s.name + '.', 'OutInfo');
        } else {
            outLine('That cannot be deleted.', '');
            return;
        }
        selKind = '';
        selObj = null;
        E.stSetSel(-1);
        engineSel = -1;
        renderTree();
        renderProps();
        markDirty();
    }

    function payload() {
        const objs = objects.filter(function (o) { return !o.dead; }).map(function (o) {
            return { class: o.class, name: o.name, service: o.service, px: o.px, py: o.py, pz: o.pz, sx: o.sx, sy: o.sy, sz: o.sz, color: o.color, anchored: o.anchored, code: o.code || '' };
        });
        guiButtons.forEach(function (g) {
            objs.push({ class: 'GuiButton', name: g.name, service: 'Workspace', px: g.px, py: g.py, pz: 0, sx: g.sx, sy: g.sy, sz: 0, color: g.color, anchored: true, code: g.code || '' });
        });
        return {
            csrf: csrf,
            objects: objs,
            scripts: scripts.map(function (s) {
                return { name: s.name, kind: s.kind, service: s.service, code: s.code };
            })
        };
    }

    function save(done) {
        if (saveBusy) {
            return;
        }
        saveBusy = true;
        setStatus('Saving');
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload())
        }).then(function (r) {
            return r.json();
        }).then(function (d) {
            saveBusy = false;
            if (d && d.ok) {
                markSaved();
                setStatus('Ready');
                if (done) {
                    done();
                }
            } else {
                outLine('Save failed: ' + (d && d.error ? d.error : 'unknown'), 'OutErr');
                setStatus('Save failed');
            }
        }).catch(function (e) {
            saveBusy = false;
            outLine('Save failed: ' + e.message, 'OutErr');
            setStatus('Save failed');
        });
    }

    function playPlace() {
        if (saveBusy) {
            return;
        }
        if (dirty) {
            save(function () {
                window.location.href = PLAY_URL;
            });
        } else {
            window.location.href = PLAY_URL;
        }
    }

    function setTool(t) {
        tool = t;
        E.stSetTool(t === 'select' ? 0 : (t === 'move' ? 1 : 2));
        toolSelectBtn.className = 'STool' + (t === 'select' ? ' SToolOn' : '');
        toolMoveBtn.className = 'STool' + (t === 'move' ? ' SToolOn' : '');
        toolResizeBtn.className = 'STool' + (t === 'resize' ? ' SToolOn' : '');
    }

    toolSelectBtn.addEventListener('click', function () { setTool('select'); });
    toolMoveBtn.addEventListener('click', function () { setTool('move'); });
    toolResizeBtn.addEventListener('click', function () { setTool('resize'); });
    btnPlay.addEventListener('click', playPlace);
    btnSave.addEventListener('click', function () { save(); });
    btnDelete.addEventListener('click', deleteSelected);
    btnSnap.addEventListener('click', function () {
        snapIdx = (snapIdx + 1) % snapVals.length;
        E.stSetSnap(snapVals[snapIdx]);
        btnSnap.textContent = 'Snap ' + String(snapVals[snapIdx]);
    });

    const menus = Array.prototype.slice.call(document.querySelectorAll('.SMenu'));
    function closeMenus() {
        menus.forEach(function (m) { m.classList.remove('Open'); });
    }
    menus.forEach(function (m) {
        const label = m.querySelector('.SMenuLabel');
        function toggle(ev) {
            ev.stopPropagation();
            const was = m.classList.contains('Open');
            closeMenus();
            if (!was) {
                m.classList.add('Open');
            }
        }
        label.addEventListener('pointerdown', toggle);
        label.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
        label.addEventListener('touchend', function (ev) { ev.preventDefault(); });
        label.addEventListener('click', function (ev) { ev.preventDefault(); });
        label.addEventListener('mouseenter', function () {
            if (menus.some(function (x) { return x.classList.contains('Open'); })) {
                closeMenus();
                m.classList.add('Open');
            }
        });
    });
    function docClose(ev) {
        if (!ev.target.closest || !ev.target.closest('.SMenu')) {
            closeMenus();
        }
    }
    document.addEventListener('pointerdown', docClose);
    document.addEventListener('touchstart', docClose, { passive: true });
    document.querySelectorAll('.SItem').forEach(function (item) {
        item.addEventListener('click', function () {
            closeMenus();
            act(item.getAttribute('data-act'));
        });
    });

    function act(a) {
        if (a === 'play') {
            playPlace();
        } else if (a === 'save') {
            save();
        } else if (a === 'exit') {
            window.location.href = GAME_URL;
        } else if (a === 'delete') {
            deleteSelected();
        } else if (a === 'insert-part') {
            insertPart();
        } else if (a === 'insert-spawn') {
            insertSpawn();
        } else if (a === 'insert-script') {
            insertScript('Script');
        } else if (a === 'insert-local') {
            insertScript('LocalScript');
        } else if (a === 'insert-remote') {
            insertRemote();
        } else if (a === 'insert-gui') {
            insertGuiButton();
        } else if (a === 'view-explorer') {
            explorerPaneEl.classList.toggle('Hidden');
        } else if (a === 'view-properties') {
            propertiesPaneEl.classList.toggle('Hidden');
        } else if (a === 'view-output') {
            outputPaneEl.classList.toggle('Hidden');
        } else if (a === 'view-gui') {
            const pane = document.getElementById('GuiPane');
            if (pane) {
                pane.classList.toggle('Hidden');
            }
        } else if (a === 'help') {
            window.location.href = 'help.php';
        }
    }

    canvas.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
    });

    function setNDC(ev) {
        const r = canvas.getBoundingClientRect();
        return [((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1];
    }

    let mouseBtn = -1;
    let lastX = 0;
    let lastY = 0;
    let downPos = null;

    canvas.addEventListener('mousedown', function (ev) {
        mouseBtn = ev.button;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (ev.button === 0) {
            const nd = setNDC(ev);
            E.stMouseDown(0, nd[0], nd[1]);
            downPos = [E.stNum(E.stSelected(), 0), E.stNum(E.stSelected(), 1), E.stNum(E.stSelected(), 2), E.stSelected()];
            refreshEngineSel();
        }
    });

    window.addEventListener('mousemove', function (ev) {
        if (mouseBtn < 0) {
            return;
        }
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (mouseBtn === 2) {
            E.stCamDrag(dx, dy);
        } else if (mouseBtn === 1) {
            E.stCamPan(dx, dy);
        } else if (mouseBtn === 0) {
            const nd = setNDC(ev);
            E.stMouseMove(nd[0], nd[1]);
            const sel = E.stSelected();
            if (sel >= 0 && objects[sel]) {
                pullFromEngine(objects[sel], sel);
                updatePropsLive();
            }
        }
    });

    function updatePropsLive() {
        if (selKind === 'part' && selObj) {
            const nums = propEl.querySelectorAll('input[type=number]');
            if (nums.length >= 6) {
                nums[0].value = String(selObj.px);
                nums[1].value = String(selObj.py);
                nums[2].value = String(selObj.pz);
                nums[3].value = String(selObj.sx);
                nums[4].value = String(selObj.sy);
                nums[5].value = String(selObj.sz);
            }
        }
    }

    window.addEventListener('mouseup', function (ev) {
        if (mouseBtn === 0) {
            E.stMouseUp();
            refreshEngineSel();
            if (downPos && downPos[3] >= 0 && downPos[3] === E.stSelected()) {
                const o = engineObjectAt(downPos[3]);
                if (o && (o.px !== downPos[0] || o.py !== downPos[1] || o.pz !== downPos[2])) {
                    setStatus('Moved ' + o.name + ' to ' + o.px + ', ' + o.py + ', ' + o.pz);
                    markDirty();
                }
            }
            downPos = null;
        }
        mouseBtn = -1;
    });

    canvas.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        E.stCamZoom(ev.deltaY);
    }, { passive: false });

    let pinchDist = 0;
    let touchMode = '';
    let lastTX = 0;
    let lastTY = 0;

    canvas.addEventListener('touchstart', function (ev) {
        if (ev.touches.length === 2) {
            touchMode = 'pinch';
            pinchDist = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
        } else {
            touchMode = 'orbit';
            const t = ev.touches[0];
            lastTX = t.clientX;
            lastTY = t.clientY;
            const nd = setNDC(t);
            E.stMouseDown(0, nd[0], nd[1]);
            refreshEngineSel();
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (ev) {
        ev.preventDefault();
        if (touchMode === 'pinch' && ev.touches.length === 2) {
            const d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
            E.stCamZoom((pinchDist - d) * 2);
            pinchDist = d;
        } else if (touchMode === 'orbit') {
            const t = ev.touches[0];
            const dx = t.clientX - lastTX;
            const dy = t.clientY - lastTY;
            lastTX = t.clientX;
            lastTY = t.clientY;
            if (E.stDragging() === 1) {
                const nd = setNDC(t);
                E.stMouseMove(nd[0], nd[1]);
                const sel = E.stSelected();
                if (sel >= 0 && objects[sel]) {
                    pullFromEngine(objects[sel], sel);
                    updatePropsLive();
                }
            } else {
                E.stCamDrag(dx, dy);
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', function () {
        if (touchMode === 'orbit') {
            E.stMouseUp();
            refreshEngineSel();
        }
        touchMode = '';
    }, { passive: true });

    window.addEventListener('keydown', function (ev) {
        const t = ev.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')) {
            ev.preventDefault();
            save();
            return;
        }
        if (typing) {
            return;
        }
        if (ev.key === 'F5') {
            ev.preventDefault();
            playPlace();
            return;
        }
        if (ev.key === 'Delete') {
            deleteSelected();
        }
    });

    window.addEventListener('beforeunload', function (ev) {
        if (dirty) {
            ev.preventDefault();
            ev.returnValue = 'There are unsaved changes.';
        }
    });

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(64, Math.floor(viewportEl.clientWidth * dpr));
        const h = Math.max(64, Math.floor(viewportEl.clientHeight * dpr));
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = viewportEl.clientWidth + 'px';
        canvas.style.height = viewportEl.clientHeight + 'px';
        if (E) {
            E.stViewSize(w, h);
        }
    }
    window.addEventListener('resize', resize);

    const camBuf = new Float32Array(16);

    function readCam(ptr) {
        syncMem();
        const d = new Float64Array(E.memory.buffer, ptr, 16);
        for (let i = 0; i < 16; i++) {
            camBuf[i] = d[i];
        }
        return camBuf;
    }

    function tick(now) {
        requestAnimationFrame(tick);
        if (!E) {
            return;
        }
        const t = now / 1000;
        const wasDirty = E.stDirtyFlag() === 1;
        E.stFrame(1 / 60, t);
        if (wasDirty) {
            refreshMeshes();
        }
        refreshEngineSel();
        syncMem();
        GL.begin(canvas.width, canvas.height);
        const cam = readCam(E.stCamMatrix());
        GL.drawMesh(studsMesh, { cam: cam, studs: true });
        GL.drawMesh(plainMesh, { cam: cam });
        GL.drawMesh(spawnMesh, { cam: cam, spawn: true });
        syncMem();
        const ln = E.stLineLen();
        if (ln > 0) {
            const arr = new Float32Array(E.memory.buffer, E.stLinePtr(), ln).slice();
            GL.update(lineMesh, arr);
            GL.drawLines(lineMesh, cam);
        }
    }

    renderTree();
    renderProps();
    setStatus('Loading');

    async function bootEngine() {
        const res = await fetch('assets/js/wob_engine.wasm');
        const buf = await res.arrayBuffer();
        const mod = await WebAssembly.instantiate(buf, { env: { abort: function () { throw new Error('wasm abort'); } } });
        E = mod.instance.exports;
        window.__wobStudio = E;
        syncMem();
        E.engInit(24681357, Date.now() / 1000);
        E.stReset();
        E.bootSky();
        studsMesh = uploadFrom(E.stMeshStudsPtr(), E.stMeshStudsLen(), 12);
        lineMesh = GL.upload(new Float32Array(8192), 6);
        resize();
        requestAnimationFrame(tick);
        try {
            const r = await fetch(API_URL);
            const d = await r.json();
            if (!d || d.ok !== true) {
                throw new Error(d && d.error ? d.error : 'load failed');
            }
            csrf = d.csrf || '';
            E.stReset();
            (d.objects || []).forEach(function (o) {
                if (o.class === 'GuiButton') {
                    guiButtons.push({
                        class: 'GuiButton',
                        name: String(o.name),
                        px: Number(o.px) || 20,
                        py: Number(o.py) || 180,
                        sx: Number(o.sx) || 170,
                        sy: Number(o.sy) || 40,
                        color: String(o.color),
                        code: String(o.code || '')
                    });
                    return;
                }
                const cls = o.class === 'RemoteEvent' ? 2 : (o.class === 'SpawnLocation' ? 1 : 0);
                const nm = putStr(String(o.name));
                const sv = putStr(String(o.service));
                const idx = E.stAdd(cls, nm.p, nm.n, sv.p, sv.n, Number(o.px) || 0, Number(o.py) || 0, Number(o.pz) || 0, Number(o.sx) || 4, Number(o.sy) || 1.2, Number(o.sz) || 2, hexInt(o.color, 0xA3A2A5), o.anchored ? 1 : 0);
                objects[idx] = {
                    key: nextKey(),
                    class: classStr(cls),
                    name: String(o.name),
                    service: String(o.service),
                    px: Number(o.px) || 0,
                    py: Number(o.py) || 0,
                    pz: Number(o.pz) || 0,
                    sx: Number(o.sx) || 4,
                    sy: Number(o.sy) || 1.2,
                    sz: Number(o.sz) || 2,
                    color: String(o.color),
                    anchored: !!o.anchored,
                    code: String(o.code || '')
                };
                if (objects[idx].code !== '') {
                    setEngineCode(idx, objects[idx].code);
                }
            });
            renderGui();
            (d.scripts || []).forEach(function (s) {
                scripts.push({
                    key: nextKey(),
                    name: String(s.name),
                    kind: s.kind === 'LocalScript' ? 'LocalScript' : 'Script',
                    service: String(s.service),
                    code: String(s.code)
                });
            });
            refreshMeshes();
            renderTree();
            let nParts = 0;
            objects.forEach(function (o) {
                if (!o.dead && o.class === 'Part') {
                    nParts++;
                }
            });
            outLine('Loaded the place. ' + nParts + ' parts, ' + scripts.length + ' scripts.', 'OutInfo');
            setStatus('Ready');
        } catch (e) {
            outLine('Load failed: ' + e.message, 'OutErr');
            setStatus('Load failed');
        }
    }

    bootEngine().catch(function (e) {
        outLine('The 3D engine failed to load. Refresh the page.', 'OutErr');
        setStatus('Engine failed');
    });
})();
