const { CFG, esc, strField, nowSql } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const items = require('./items');
const { requireLogin, page } = require('./pages_social');
const currency = require('./currency');

const PALETTE = ['C4281C', 'DA8541', 'F5CD30', '4B974B', '0D69AC', 'B4D2E4', 'F2F3F3', 'A3A2A5', '635F62', '1B2A35', '694028', 'CC8E69', 'E8BAC8', '7FBFAF'];
const ZONES = { head: 'Head', torso: 'Torso', arms: 'Arms', legs: 'Legs' };

function wearSelect(field, label, owned, currentId) {
    let opts = '<option value="0"' + (currentId === 0 ? ' selected' : '') + '>None</option>';
    for (let i = 0; i < owned.length; i++) {
        opts += '<option value="' + Number(owned[i].id) + '"' + (currentId === Number(owned[i].id) ? ' selected' : '') + '>' + esc(owned[i].name) + '</option>';
    }
    return '<div class="SkinZone">\n<span class="SkinZoneLabel">' + label + '</span>\n<span class="WearSelect"><select class="DropDownList" name="' + field + '">' + opts + '</select></span>\n</div>\n';
}

async function character(ctx) {
    const red = await requireLogin(ctx, 'character');
    if (red) { return red; }
    const me = ctx.user;
    const skin = { head: 'F5CD30', torso: '0D69AC', arms: 'F5CD30', legs: '4B974B' };
    const row = await ctx.db.get('SELECT head, torso, arms, legs FROM user_skins WHERE user_id = ?', [me.id]);
    if (row) {
        for (const zone of Object.keys(ZONES)) {
            const v = String(row[zone]).toUpperCase();
            if (/^[0-9A-F]{6}$/.test(v)) { skin[zone] = v; }
        }
    }
    let err = '';
    if (ctx.method === 'POST' && ctx.fields.save_skin) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const nu = {};
        let bad = false;
        for (const zone of Object.keys(ZONES)) {
            let v = strField(ctx.fields, 'skinhex_' + zone, 7).toUpperCase().replace(/^#/, '');
            if (!/^[0-9A-F]{6}$/.test(v)) {
                v = strField(ctx.fields, 'skin_' + zone, 6).toUpperCase();
            }
            if (!/^[0-9A-F]{6}$/.test(v)) { bad = true; break; }
            nu[zone] = v;
        }
        if (bad) {
            err = 'Pick a color for every body part.';
        } else {
            if (row) {
                await ctx.db.run('UPDATE user_skins SET head = ?, torso = ?, arms = ?, legs = ? WHERE user_id = ?', [nu.head, nu.torso, nu.arms, nu.legs, me.id]);
            } else {
                await ctx.db.run('INSERT INTO user_skins (user_id, head, torso, arms, legs) VALUES (?, ?, ?, ?, ?)', [me.id, nu.head, nu.torso, nu.arms, nu.legs]);
            }
            await auth.setFlash(ctx.db, ctx.session, 'ok', 'Character colors saved.');
            return ctx.redirect('character');
        }
    }
    const av = { face_item_id: 0, hat_item_id: 0, shirt_item_id: 0, pants_item_id: 0 };
    const ownedFaces = await items.ownedOf(ctx.db, me.id, 'face');
    const ownedHats = await items.ownedOf(ctx.db, me.id, 'hat');
    const ownedShirts = await items.ownedOf(ctx.db, me.id, 'shirt');
    const ownedPants = await items.ownedOf(ctx.db, me.id, 'pants');
    const avrow = await ctx.db.get('SELECT face_item_id, hat_item_id, shirt_item_id, pants_item_id FROM user_avatar WHERE user_id = ?', [me.id]);
    if (avrow) {
        av.face_item_id = Number(avrow.face_item_id);
        av.hat_item_id = Number(avrow.hat_item_id);
        av.shirt_item_id = Number(avrow.shirt_item_id);
        av.pants_item_id = Number(avrow.pants_item_id);
    }
    if (ctx.method === 'POST' && ctx.fields.save_avatar) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const slots = { face_item: [ownedFaces, 'face_item_id'], hat_item: [ownedHats, 'hat_item_id'], shirt_item: [ownedShirts, 'shirt_item_id'], pants_item: [ownedPants, 'pants_item_id'] };
        const picked = {};
        let allOk = true;
        for (const field of Object.keys(slots)) {
            let sid = 0;
            const raw = typeof ctx.fields[field] === 'string' ? ctx.fields[field].trim() : '';
            if (/^\d{1,10}$/.test(raw)) { sid = parseInt(raw, 10); }
            if (sid !== 0) {
                let found = false;
                const pool = slots[field][0];
                for (let i = 0; i < pool.length; i++) {
                    if (Number(pool[i].id) === sid) { found = true; break; }
                }
                if (!found) { allOk = false; break; }
            }
            picked[slots[field][1]] = sid;
        }
        if (!allOk) {
            err = 'You can only wear items from your collection.';
        } else {
            if (avrow) {
                await ctx.db.run('UPDATE user_avatar SET face_item_id = ?, hat_item_id = ?, shirt_item_id = ?, pants_item_id = ? WHERE user_id = ?', [picked.face_item_id, picked.hat_item_id, picked.shirt_item_id, picked.pants_item_id, me.id]);
            } else {
                await ctx.db.run('INSERT INTO user_avatar (user_id, face_item_id, hat_item_id, shirt_item_id, pants_item_id) VALUES (?, ?, ?, ?, ?)', [me.id, picked.face_item_id, picked.hat_item_id, picked.shirt_item_id, picked.pants_item_id]);
            }
            av.face_item_id = picked.face_item_id;
            av.hat_item_id = picked.hat_item_id;
            av.shirt_item_id = picked.shirt_item_id;
            av.pants_item_id = picked.pants_item_id;
            await auth.setFlash(ctx.db, ctx.session, 'ok', 'Avatar updated.');
            return ctx.redirect('character');
        }
    }
    let faceFile = '', hatFile = '', shirtId = 0, pantsId = 0;
    for (let i = 0; i < ownedFaces.length; i++) { if (Number(ownedFaces[i].id) === av.face_item_id) { faceFile = String(ownedFaces[i].file); } }
    for (let i = 0; i < ownedHats.length; i++) { if (Number(ownedHats[i].id) === av.hat_item_id) { hatFile = String(ownedHats[i].file); } }
    for (let i = 0; i < ownedShirts.length; i++) { if (Number(ownedShirts[i].id) === av.shirt_item_id) { shirtId = Number(ownedShirts[i].id); } }
    for (let i = 0; i < ownedPants.length; i++) { if (Number(ownedPants[i].id) === av.pants_item_id) { pantsId = Number(ownedPants[i].id); } }
    let zonesHtml = '';
    let mine = [];
    try {
        mine = await currency.owned(ctx.db, me.id);
    } catch (e) {
        mine = [];
    }
    for (const zone of Object.keys(ZONES)) {
        let swatches = '';
        for (const hex of PALETTE) {
            swatches += '<label class="SkinSwatch Sw-' + hex + '" title="' + hex + '"><input type="radio" name="skin_' + zone + '" value="' + hex + '"' + (skin[zone] === hex ? ' checked' : '') + '></label>\n';
        }
        for (let i = 0; i < mine.length; i++) {
            const item = mine[i];
            if (String(item.zone) !== zone) { continue; }
            const hex = String(item.hex).toUpperCase();
            if (!/^[0-9A-F]{6}$/.test(hex)) { continue; }
            swatches += '<label class="SkinSwatch OwnSwatch" style="background:#' + esc(hex) + '" title="' + esc(item.name) + '"><input type="radio" name="skin_' + zone + '" value="' + hex + '"' + (skin[zone] === hex ? ' checked' : '') + '></label>\n';
        }
        zonesHtml += '<div class="SkinZone">\n<span class="SkinZoneLabel">' + esc(ZONES[zone]) + '</span>\n<span class="SkinSwatches">\n' + swatches +
            '<span class="SkinCustom">Custom <input type="text" class="TextBox SkinHex" name="skinhex_' + zone + '" maxlength="7" placeholder="#000000"></span>\n</span>\n</div>\n';
    }
    const ownAny = ownedFaces.length + ownedHats.length + ownedShirts.length + ownedPants.length;
    let wearHtml;
    if (ownAny === 0) {
        wearHtml = '<p class="FormNotes">You own nothing to wear yet. Get hats, faces, shirts and pants from the <a href="catalog">Catalog</a> or upload your own.</p>\n';
    } else {
        wearHtml = wearSelect('face_item', 'Face', ownedFaces, av.face_item_id) +
            wearSelect('hat_item', 'Hat', ownedHats, av.hat_item_id) +
            wearSelect('shirt_item', 'Shirt', ownedShirts, av.shirt_item_id) +
            wearSelect('pants_item', 'Pants', ownedPants, av.pants_item_id) +
            '<p class="FormNotes">Faces show on your head, hats sit on top, shirts wrap your torso and pants wrap your legs in every place you play.</p>\n' +
            '<p class="center"><button class="YesButton Button" type="submit" name="save_avatar" value="1">Save Wearing</button></p>\n';
    }
    const fig = '<td width="190">\n<h4 class="center">Your Figure</h4>\n<div id="FigurePreview" data-shirt="' + (shirtId > 0 ? esc('cloth_image?id=' + shirtId) : '') + '" data-pants="' + (pantsId > 0 ? esc('cloth_image?id=' + pantsId) : '') + '">\n' +
        '<div class="FigHead" data-fill="#' + esc(skin.head) + '">' + (faceFile !== '' ? '<img class="FigFaceImg" src="' + esc('uploads/' + faceFile) + '" alt="">' : '') + '</div>\n' +
        '<div class="FigRow">\n<div class="FigArm" data-fill="#' + esc(skin.arms) + '"></div>\n<div class="FigTorso" data-fill="#' + esc(skin.torso) + '"></div>\n<div class="FigArm" data-fill="#' + esc(skin.arms) + '"></div>\n</div>\n' +
        '<div class="FigRow">\n<div class="FigLeg" data-fill="#' + esc(skin.legs) + '"></div>\n<div class="FigLeg" data-fill="#' + esc(skin.legs) + '"></div>\n</div>\n' +
        (hatFile !== '' ? '<div class="FigHat"><img src="assets/img/placeholder_hat.png" alt=""></div>' : '') +
        '</div>\n</td>\n';
    const body = '<div class="bottombar panel">\n<h2 class="center">Character</h2>\n<p class="FormNotes center">Pick the body colors for your figure. They show up in every place you play.</p>\n' +
        (err !== '' ? '<p class="Attention center">' + esc(err) + '</p>\n' : '') +
        '<table class="CharTable">\n<tbody><tr valign="top">\n' + fig +
        '<td>\n<form method="post" action="character">\n' + L.csrfField(ctx) +
        '<h4>Body Colors</h4>\n' + zonesHtml +
        '<p class="FormNotes">Click a color square for a body part. The Custom box takes a hex code like 0D69AC and beats the squares. Colors you buy on the <a href="colors">Body Colors</a> page show up here too.</p>\n' +
        '<p class="center"><button class="YesButton Button" type="submit" name="save_skin" value="1">Save Colors</button> <a class="NoButton Button" href="my">Back</a></p>\n</form>\n' +
        '<form method="post" action="character">\n' + L.csrfField(ctx) + '<h4>Wear</h4>\n' + wearHtml + '</form>\n</td>\n</tr></tbody></table>\n</div>\n';
    return page(ctx, 'Character - WallOfBricks', body, '<script src="assets/js/cloth.js?v=' + CFG.assetVersion + '"></script>\n<script src="assets/js/character.js?v=' + CFG.assetVersion + '"></script>\n');
}

module.exports = { character };
