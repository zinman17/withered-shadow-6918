const { CFG, esc, strField, nowSql } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const { requireLogin, page } = require('./pages_social');
const currency = require('./currency');

const PALETTE = ['C4281C', 'DA8541', 'F5CD30', '4B974B', '0D69AC', 'B4D2E4', 'F2F3F3', 'A3A2A5', '635F62', '1B2A35', '694028', 'CC8E69', 'E8BAC8', '7FBFAF'];
const ZONES = { head: 'Head', torso: 'Torso', arms: 'Arms', legs: 'Legs' };

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
    const fig = '<td width="190">\n<h4 class="center">Your Figure</h4>\n<div id="FigurePreview">\n' +
        '<div class="FigHead" data-fill="#' + esc(skin.head) + '"></div>\n' +
        '<div class="FigRow">\n<div class="FigArm" data-fill="#' + esc(skin.arms) + '"></div>\n<div class="FigTorso" data-fill="#' + esc(skin.torso) + '"></div>\n<div class="FigArm" data-fill="#' + esc(skin.arms) + '"></div>\n</div>\n' +
        '<div class="FigRow">\n<div class="FigLeg" data-fill="#' + esc(skin.legs) + '"></div>\n<div class="FigLeg" data-fill="#' + esc(skin.legs) + '"></div>\n</div>\n' +
        '</div>\n</td>\n';
    const body = '<div class="bottombar panel">\n<h2 class="center">Character</h2>\n<p class="FormNotes center">Pick the body colors for your figure. They show up in every place you play.</p>\n' +
        (err !== '' ? '<p class="Attention center">' + esc(err) + '</p>\n' : '') +
        '<table class="CharTable">\n<tbody><tr valign="top">\n' + fig +
        '<td>\n<form method="post" action="character">\n' + L.csrfField(ctx) +
        '<h4>Body Colors</h4>\n' + zonesHtml +
        '<p class="FormNotes">Click a color square for a body part. The Custom box takes a hex code like 0D69AC and beats the squares. Colors you buy from the Catalog show up here too.</p>\n' +
        '<p class="center"><button class="YesButton Button" type="submit" name="save_skin" value="1">Save Colors</button> <a class="NoButton Button" href="my">Back</a></p>\n</form>\n</td>\n</tr></tbody></table>\n</div>\n';
    return page(ctx, 'Character - WallOfBricks', body, '<script src="assets/js/character.js?v=' + CFG.assetVersion + '"></script>\n');
}

module.exports = { character };
