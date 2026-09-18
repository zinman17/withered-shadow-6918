const { CFG, esc, strField, nowSql, getInt } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const { requireLogin, page } = require('./pages_social');
const currency = require('./currency');

const ZONES = { head: 'Head', torso: 'Torso', arms: 'Arms', legs: 'Legs' };

function priceTag(item) {
    if (item.price_brux > 0) {
        return String(item.price_brux) + ' Brux';
    }
    return String(item.price_tix) + ' Tix';
}

function priceKind(item) {
    return item.price_brux > 0 ? 'brux' : 'tix';
}

async function catalog(ctx) {
    await currency.ensureSchema(ctx.db);
    let err = '';
    if (ctx.method === 'POST' && ctx.fields.buy_item) {
        if (ctx.user === null) {
            await auth.setFlash(ctx.db, ctx.session, 'err', 'You need to log in to buy things.');
            return ctx.redirect('login?next=catalog');
        }
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const itemId = getInt(ctx.url, 'id') !== null ? getInt(ctx.url, 'id') : parseInt(strField(ctx.fields, 'item_id', 10), 10);
        const item = isNaN(itemId) ? null : await ctx.db.get('SELECT id, name, zone, hex, price_tix, price_brux FROM catalog_items WHERE id = ?', [itemId]);
        if (!item) {
            err = 'That item is not in the catalog.';
        } else {
            const mine = await ctx.db.get('SELECT item_id FROM inventory WHERE user_id = ? AND item_id = ?', [ctx.user.id, item.id]);
            if (mine) {
                await auth.setFlash(ctx.db, ctx.session, 'err', 'You already own ' + item.name + '.');
                return ctx.redirect('catalog');
            }
            if (item.price_brux > 0) {
                const paid = await ctx.db.run('UPDATE currencies SET brux = brux - ? WHERE user_id = ? AND brux >= ?', [item.price_brux, ctx.user.id, item.price_brux]);
                if (paid.changes !== 1) {
                    await auth.setFlash(ctx.db, ctx.session, 'err', 'You do not have enough brux for ' + item.name + '.');
                    return ctx.redirect('catalog');
                }
            } else {
                const paid = await ctx.db.run('UPDATE currencies SET tix = tix - ? WHERE user_id = ? AND tix >= ?', [item.price_tix, ctx.user.id, item.price_tix]);
                if (paid.changes !== 1) {
                    await auth.setFlash(ctx.db, ctx.session, 'err', 'You do not have enough tix for ' + item.name + '.');
                    return ctx.redirect('catalog');
                }
            }
            const kept = await ctx.db.run('INSERT OR IGNORE INTO inventory (user_id, item_id, bought) VALUES (?, ?, ?)', [ctx.user.id, item.id, nowSql()]);
            if (kept.changes !== 1) {
                await ctx.db.run('UPDATE currencies SET ' + priceKind(item) + ' = ' + priceKind(item) + ' + ? WHERE user_id = ?', [item.price_brux > 0 ? item.price_brux : item.price_tix, ctx.user.id]);
                await auth.setFlash(ctx.db, ctx.session, 'err', 'You already own ' + item.name + '.');
                return ctx.redirect('catalog');
            }
            await auth.setFlash(ctx.db, ctx.session, 'ok', 'You bought ' + item.name + '. Wear it on the Character page.');
            return ctx.redirect('catalog');
        }
    }
    const items = await ctx.db.all('SELECT id, name, zone, hex, price_tix, price_brux, description FROM catalog_items ORDER BY id');
    const mine = ctx.user !== null ? await currency.owned(ctx.db, ctx.user.id) : [];
    const have = {};
    for (let i = 0; i < mine.length; i++) { have[Number(mine[i].id)] = true; }
    const bal = ctx.userMoney;
    let rows = '';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const ownedNow = have[Number(item.id)] === true;
        const action = ownedNow
            ? '<span class="CatOwned">Owned</span>'
            : '<form method="post" action="catalog" class="inlineform">' + L.csrfField(ctx) + '<input type="hidden" name="item_id" value="' + Number(item.id) + '"><button class="Button YesButton" type="submit" name="buy_item" value="1">Buy</button></form>';
        rows += '<tr>\n<td width="70"><span class="CatSwatch" style="background:#' + esc(item.hex) + '" title="#' + esc(item.hex) + '"></span></td>\n' +
            '<td><b>' + esc(item.name) + '</b><br><span class="FormNotes">' + esc(ZONES[item.zone] || item.zone) + ' color. ' + esc(item.description) + '</span></td>\n' +
            '<td class="CatPrice" width="90"><b>' + esc(priceTag(item)) + '</b></td>\n' +
            '<td width="90" align="center">' + action + '</td>\n</tr>\n';
    }
    const money = bal !== null
        ? '<p class="CatMoney center">You have <b>' + Number(bal.brux) + '</b> Brux and <b>' + Number(bal.tix) + '</b> Tix. You get 10 Tix every day you log in.</p>\n'
        : '<p class="CatMoney center"><a href="login?next=catalog">Log in</a> to buy items. New members get 100 Tix and 25 Brux.</p>\n';
    const body = '<div class="bottombar panel">\n<h2 class="center">Catalog</h2>\n' +
        '<p class="FormNotes center">Buy body colors with Tix and Brux. Everything you buy shows up on your Character page.</p>\n' +
        money +
        (err !== '' ? '<p class="Attention center">' + esc(err) + '</p>\n' : '') +
        '<table class="CatTable">\n<tbody>\n' + rows + '</tbody>\n</table>\n</div>\n';
    return page(ctx, 'Catalog - WallOfBricks', body);
}

module.exports = { catalog };
