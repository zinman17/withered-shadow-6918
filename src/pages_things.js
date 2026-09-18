const { CFG, esc, htmlReply, getParam, getInt, nowSql, todaySql, nowMs, strField } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const H = require('./helpers');
const items = require('./items');
const currency = require('./currency');
const { requireLogin, page } = require('./pages_social');

async function games(ctx) {
    let sort = getParam(ctx.url, 'sort') || 'popular';
    if (sort !== 'popular' && sort !== 'new') { sort = 'popular'; }
    let pageNum = 1;
    const pv = ctx.url.searchParams.get('p');
    if (pv !== null && /^\d{1,3}$/.test(pv)) { pageNum = parseInt(pv, 10); }
    const per = 9;
    const total = await ctx.db.get('SELECT COUNT(*) AS c FROM games').c;
    const pages = Math.max(1, Math.ceil(total / per));
    if (pageNum > pages) { pageNum = pages; }
    const off = (pageNum - 1) * per;
    const order = sort === 'popular' ? 'g.visits DESC, g.created DESC' : 'g.created DESC, g.id DESC';
    const rows = await ctx.db.all('SELECT g.id, g.name, g.visits, g.thumb, g.created, g.creator_id, u.username AS creator FROM games g JOIN users u ON u.id = g.creator_id ORDER BY ' + order + ' LIMIT ' + per + ' OFFSET ' + off);
    const first = total === 0 ? 0 : off + 1;
    const last = Math.min(off + per, total);
    let grid = '';
    if (total === 0) {
        grid = '<p>No places have been built yet.</p>\n';
    } else {
        let cells = '';
        let i = 0;
        for (const g of rows) {
            if (i > 0 && i % 3 === 0) { cells += '</tr>\n<tr>\n'; }
            const mine = ctx.user !== null && Number(g.creator_id) === Number(ctx.user.id);
            cells += '<td class="Game">\n<div class="GameThumbnail"><a href="game?id=' + Number(g.id) + '"><img src="' + esc(H.gameThumbUrl(g)) + '" alt="' + esc(g.name) + '"></a></div>\n' +
                '<div class="GameDetails">\n<div class="GameName"><a href="game?id=' + Number(g.id) + '">' + esc(g.name) + '</a></div>\n' +
                '<div><span class="Label">Creator:</span> <a href="profile?u=' + esc(encodeURIComponent(g.creator)) + '">' + esc(g.creator) + '</a></div>\n' +
                '<div><span class="Label">Played:</span> ' + H.num(g.visits) + ' times</div>\n' +
                '<div><span class="Label">Added:</span> ' + esc(H.dateShort(g.created)) + '</div>\n' +
                (mine ? '<div><a class="Button" href="studio?id=' + Number(g.id) + '">Edit in Studio</a></div>\n' : '') +
                '</div>\n</td>\n';
            i++;
        }
        while (i % 3 !== 0) { cells += '<td class="Game"></td>\n'; i++; }
        grid = '<table class="Grid">\n<tbody><tr>\n' + cells + '</tr>\n</tbody></table>\n';
    }
    const memberLinks = ctx.user !== null
        ? '| <a href="game_new">Upload a Place</a> | <a href="my">My Places</a>'
        : '| <a href="login?next=games">Log In</a> | <a href="register">Sign Up</a>';
    let pager = 'Games ' + first + '-' + last + ' of ' + total + ' ';
    if (pageNum > 1) { pager += '<a href="games?sort=' + sort + '&amp;p=' + (pageNum - 1) + '">&lt;&lt; Previous</a>'; }
    if (pageNum < pages) { pager += (pageNum > 1 ? ' | ' : '') + '<a href="games?sort=' + sort + '&amp;p=' + (pageNum + 1) + '">Next &gt;&gt;</a>'; }
    const body = '<div class="bottombar panel center">\n<h2>Games</h2>\n<p>\n<a href="games?sort=popular">Most Popular</a> | <a href="games?sort=new">Newest</a> ' + memberLinks + '</p>\n' +
        (ctx.user !== null ? '<p class="FormNotes">Each builder can run up to ' + CFG.gamesPerPlayer + ' places.</p>\n' : '') +
        '<p class="Pager">' + pager + '</p>\n' + grid +
        '<p class="FormNotes">Page ' + pageNum + ' of ' + pages + '</p>\n</div>\n';
    return page(ctx, 'WallOfBricks Games', body);
}

async function game(ctx) {
    const id = getInt(ctx.url, 'id');
    if (id === null) { return ctx.redirect('games'); }
    const g = await ctx.db.get('SELECT g.id, g.name, g.description, g.visits, g.thumb, g.created, g.creator_id, u.username AS creator FROM games g JOIN users u ON u.id = g.creator_id WHERE g.id = ?', [id]);
    if (!g) { return ctx.redirect('games'); }
    if (ctx.method === 'POST' && ctx.fields.do_play) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        if (ctx.user === null) {
            await auth.setFlash(ctx.db, ctx.session, 'err', 'Log in first to launch this place.');
            return ctx.redirect('login?next=' + encodeURIComponent('games'));
        }
        await ctx.db.run('UPDATE games SET visits = visits + 1 WHERE id = ?', [id]);
        return ctx.redirect('play?id=' + id);
    }
    const related = await ctx.db.all('SELECT g.id, g.name, g.visits, g.thumb, u.username AS creator FROM games g JOIN users u ON u.id = g.creator_id WHERE g.id <> ? ORDER BY g.visits DESC LIMIT 3', [id]);
    let relHtml = '';
    if (related.length > 0) {
        relHtml = '<div class="bottombar panel center">\n<h3>More Cool Places</h3>\n<table class="Grid">\n<tbody><tr>\n';
        for (const r of related) {
            relHtml += '<td class="Game">\n<div class="GameThumbnail"><a href="game?id=' + Number(r.id) + '"><img src="' + esc(H.gameThumbUrl(r)) + '" alt="' + esc(r.name) + '"></a></div>\n<div class="GameDetails">\n<div class="GameName"><a href="game?id=' + Number(r.id) + '">' + esc(r.name) + '</a></div>\n<div><span class="Label">Creator:</span> ' + esc(r.creator) + '</div>\n<div><span class="Label">Played:</span> ' + H.num(r.visits) + ' times</div>\n</div>\n</td>\n';
        }
        relHtml += '</tr>\n</tbody></table>\n</div>\n';
    }
    let playHtml;
    if (ctx.user === null) {
        playHtml = '<p><a class="Button" href="login?next=games">Log In to Play</a></p>\n';
    } else {
        playHtml = '<form method="post" action="game?id=' + Number(g.id) + '">\n' + L.csrfField(ctx) + '<button class="Button ButtonPlay" type="submit" name="do_play" value="1">Play</button>\n</form>\n';
        if (Number(g.creator_id) === Number(ctx.user.id)) {
            playHtml += '<p><a class="Button" href="studio?id=' + Number(g.id) + '">Edit in Studio</a></p>\n';
        }
    }
    const body = '<div class="bottombar panel center">\n<h2>' + esc(g.name) + '</h2>\n<p><img src="' + esc(H.gameThumbUrl(g)) + '" alt="' + esc(g.name) + '" class="PlaceThumb"></p>\n<h3>About this Place</h3>\n<p class="lefttext">' + H.nl2br(g.description !== '' ? g.description : 'No description yet.') + '</p>\n</div>\n' +
        '<div class="bottombar panel center">\n<h3>Play</h3>\n<p>By <a href="profile?u=' + esc(encodeURIComponent(g.creator)) + '">' + esc(g.creator) + '</a> | Visited ' + H.num(g.visits) + ' times | Created ' + esc(H.dateShort(g.created)) + '</p>\n' + playHtml + '</div>\n' + relHtml;
    return page(ctx, g.name + ' - WallOfBricks Place', body);
}

async function gameNew(ctx) {
    const red = await requireLogin(ctx, 'game_new');
    if (red) { return red; }
    const me = ctx.user;
    let err = '';
    if (ctx.method === 'POST' && ctx.fields.do_upload) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        try {
            const name = strField(ctx.fields, 'name', 60);
            const desc = strField(ctx.fields, 'description', 2000);
            if (Array.from(name).length < 3) { throw new Error('Give the place a name with at least 3 letters.'); }
            const mine = await ctx.db.get('SELECT COUNT(*) AS c FROM games WHERE creator_id = ?', [me.id]).c;
            if (mine >= CFG.gamesPerPlayer) { throw new Error('You already have ' + CFG.gamesPerPlayer + ' places. That is the limit.'); }
            if (uploadsToday(ctx.db, me.id) >= CFG.uploadsPerDay) { throw new Error('Daily upload limit reached. Try again tomorrow.'); }
            let thumb = '';
            const tf = ctx.files.thumb;
            if (tf && tf.size > 0) {
                const saved = H.saveUpload('img', tf);
                await H.storeFile(ctx.db, saved);
                thumb = saved.name;
            }
            await ctx.db.run('INSERT INTO games (name, description, creator_id, thumb, visits, created) VALUES (?, ?, ?, ?, 0, ?)', [name, desc, me.id, thumb, nowSql()]);
            const gid = await ctx.db.get('SELECT last_insert_rowid() AS id').id;
            await auth.setFlash(ctx.db, ctx.session, 'ok', 'Place created. Studio is opening.');
            return ctx.redirect('studio?id=' + Number(gid));
        } catch (ex) {
            err = ex.message;
        }
    }
    const left = Math.max(0, CFG.gamesPerPlayer - await ctx.db.get('SELECT COUNT(*) AS c FROM games WHERE creator_id = ?', [me.id]).c);
    let formHtml;
    if (left === 0) {
        formHtml = '<p class="Attention center">You already have ' + CFG.gamesPerPlayer + ' places. That is the limit.</p>\n<p class="center"><a class="Button" href="my">My Places</a></p>\n';
    } else {
        formHtml = '<form method="post" action="game_new" enctype="multipart/form-data">\n' + L.csrfField(ctx) +
            '<p><label for="g-name" class="FormLabel">Name</label><br>\n<input type="text" id="g-name" name="name" class="TextBox" maxlength="60" value=""></p>\n' +
            '<p class="FormNotes">Give the place a name with at least 3 letters. You have ' + left + ' of ' + CFG.gamesPerPlayer + ' places left.</p>\n' +
            '<p><label for="g-desc" class="FormLabel">Description</label><br>\n<textarea class="MultilineTextBox" id="g-desc" name="description" rows="5" maxlength="2000"></textarea></p>\n' +
            '<p><label for="g-thumb" class="FormLabel">Picture</label><br>\n<input type="file" id="g-thumb" name="thumb" class="TextBox" accept=".jpg,.jpeg,.png,.webp"></p>\n' +
            '<p class="FormNotes">Optional. Jpg, png or webp up to 1.5 MB.</p>\n' +
            '<p class="center"><button class="YesButton Button" type="submit" name="do_upload" value="1">Upload Place</button> <a class="NoButton Button" href="games">Cancel</a></p>\n</form>\n';
    }
    const body = '<div class="bottombar panel">\n<h2 class="center">Upload a Place</h2>\n' +
        (err !== '' ? '<p class="Attention center">' + esc(err) + '</p>\n' : '') + formHtml + '</div>\n';
    return page(ctx, 'Upload a Place - WallOfBricks', body);
}

async function uploadsToday(db, uid) {
    const today = todaySql();
    const a = await db.get('SELECT COUNT(*) AS c FROM games WHERE creator_id = ? AND created >= ?', [uid, today + ' 00:00:00']);
    const b = await db.get('SELECT COUNT(*) AS c FROM items WHERE creator_id = ? AND created >= ?', [uid, today + ' 00:00:00']);
    return Number(a.c) + Number(b.c);
}

async function catalog(ctx) {
    await items.ensureSchema(ctx.db);
    const types = { hat: 'Hats', face: 'Faces', gear: 'Gear', shirt: 'Shirts', pants: 'Pants' };
    let type = getParam(ctx.url, 'type');
    if (type !== '' && !types[type]) { type = ''; }
    let browse = getParam(ctx.url, 'browse') || 'new';
    if (browse !== 'new' && browse !== 'sale' && browse !== 'free') { browse = 'new'; }
    let qs = getParam(ctx.url, 'q').slice(0, 40).replace(/['"`]/g, '');
    const where = [];
    const args = [];
    if (type !== '') { where.push('i.type = ?'); args.push(type); }
    if (browse === 'sale') { where.push('(i.price_brux > 0 OR i.price_tix > 0)'); }
    if (browse === 'free') { where.push('i.price_brux = 0 AND i.price_tix = 0'); }
    if (qs !== '') {
        where.push("i.name LIKE ? ESCAPE '!'");
        args.push('%' + qs.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_') + '%');
    }
    let sql = 'SELECT i.id, i.name, i.type, i.file, i.price_brux, i.price_tix, i.created, u.username AS creator FROM items i JOIN users u ON u.id = i.creator_id';
    if (where.length > 0) { sql += ' WHERE ' + where.join(' AND '); }
    sql += (browse === 'new' || qs !== '') ? ' ORDER BY i.created DESC, i.id DESC' : ' ORDER BY i.price_brux DESC, i.price_tix DESC, i.created DESC';
    const list = await ctx.db.all(sql, args);
    const owners = await ctx.db.all('SELECT item_id, COUNT(*) AS c FROM owned_items GROUP BY item_id');
    const ownerCount = {};
    for (const o of owners) { ownerCount[Number(o.item_id)] = Number(o.c); }
    const setLabel = qs !== '' ? 'Search: ' + qs : (type !== '' ? types[type] : 'All Items');
    let grid = '';
    if (list.length === 0) {
        grid = '<p>No items in the catalog yet.</p>\n';
    } else {
        let cells = '';
        let i = 0;
        for (const it of list) {
            if (i > 0 && i % 5 === 0) { cells += '</tr>\n<tr>\n'; }
            const pb = Number(it.price_brux);
            const pt = Number(it.price_tix);
            let price = '<div><span class="Label">Price:</span> Free</div>';
            if (pb > 0 || pt > 0) {
                price = '';
                if (pb > 0) { price += '<div><span class="Label">Price:</span> <span class="PriceInRobux">B$ ' + H.num(pb) + '</span></div>'; }
                if (pt > 0) { price += '<div><span class="Label">Price:</span> <span class="PriceInTickets">' + H.num(pt) + ' Tix</span></div>'; }
            }
            cells += '<td class="Asset">\n<div class="AssetThumbnail"><a href="item?id=' + Number(it.id) + '"><img src="' + esc(H.itemIconUrl(it)) + '" alt="' + esc(it.name) + '"></a></div>\n' +
                '<div class="AssetDetails">\n<div class="AssetName"><a href="item?id=' + Number(it.id) + '">' + esc(it.name) + '</a></div>\n' +
                '<div><span class="Label">Creator:</span> <a href="profile?u=' + esc(encodeURIComponent(it.creator)) + '">' + esc(it.creator) + '</a></div>\n' +
                '<div><span class="Label">Type:</span> ' + esc(types[it.type] || 'Item') + '</div>\n' + price +
                '<div><span class="Label">Sold:</span> ' + H.num(ownerCount[Number(it.id)] || 0) + '</div>\n</div>\n</td>\n';
            i++;
        }
        while (i % 5 !== 0) { cells += '<td class="Asset"></td>\n'; i++; }
        grid = '<table class="Grid">\n<tbody><tr>\n' + cells + '</tr>\n</tbody></table>\n';
    }
    const links = ctx.user !== null
        ? '<a href="item_new">Upload an Item</a> | <a href="my">My Collection</a>'
        : '<a href="login?next=catalog">Log In</a> | <a href="register">Sign Up</a>';
    const body = '<div class="bottombar panel center">\n<h2>Catalog</h2>\n<div class="SearchBar">\n<form method="get" action="catalog">\n' +
        '<input type="text" name="q" class="TextBox" maxlength="40" value="' + esc(qs) + '" aria-label="Search the catalog">\n<button class="Button" type="submit">Search</button>\n' +
        (type !== '' ? '<input type="hidden" name="type" value="' + esc(type) + '">' : '') +
        (browse !== 'new' ? '<input type="hidden" name="browse" value="' + esc(browse) + '">' : '') +
        '</form>\n</div>\n<p>\n' +
        '<a href="catalog?browse=new' + (type !== '' ? '&amp;type=' + esc(type) : '') + '">Newest</a> | ' +
        '<a href="catalog?browse=sale' + (type !== '' ? '&amp;type=' + esc(type) : '') + '">For Sale</a> | ' +
        '<a href="catalog?browse=free' + (type !== '' ? '&amp;type=' + esc(type) : '') + '">Free</a> | ' +
        '<a href="catalog?browse=' + esc(browse) + '">All Items</a> ' +
        Object.keys(types).map(function (k) { return '| <a href="catalog?browse=' + esc(browse) + '&amp;type=' + k + '">' + esc(types[k]) + '</a>'; }).join(' ') +
        ' | <a href="colors">Body Colors</a>' +
        '</p>\n<p>' + links + '</p>\n' +
        (ctx.user !== null ? '<p class="FormNotes">Faces, shirts and pants take photos. Hats and gear take 3D meshes: obj or glb.</p>\n' : '') +
        '<p class="Pager">' + esc(setLabel) + ' (' + list.length + ')</p>\n' + grid + '</div>\n';
    return page(ctx, 'WallOfBricks Catalog', body);
}

async function item(ctx) {
    await items.ensureSchema(ctx.db);
    const id = getInt(ctx.url, 'id');
    if (id === null) { return ctx.redirect('catalog'); }
    const it = await ctx.db.get('SELECT i.id, i.name, i.type, i.file, i.price_brux, i.price_tix, i.description, i.created, i.creator_id, u.username AS creator FROM items i JOIN users u ON u.id = i.creator_id WHERE i.id = ?', [id]);
    if (!it) { return ctx.redirect('catalog'); }
    const cur = ctx.user;
    let err = '';
    let ok = false;
    const types = { hat: 'Hat', face: 'Face', gear: 'Gear', shirt: 'Shirt', pants: 'Pants' };
    const isMine = cur !== null && Number(cur.id) === Number(it.creator_id);
    const pb = Number(it.price_brux);
    const pt = Number(it.price_tix);
    if (ctx.method === 'POST' && ctx.fields.do_buy) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        if (cur === null) {
            await auth.setFlash(ctx.db, ctx.session, 'err', 'Log in first to buy from the Catalog.');
            return ctx.redirect('login?next=' + encodeURIComponent('catalog'));
        }
        let money = strField(ctx.fields, 'currency', 4);
        if (pb === 0 && pt === 0) { money = 'free'; }
        else if (pb > 0 && pt > 0) { if (money !== 'brux' && money !== 'tix') { money = ''; } }
        else if (pb > 0) { money = 'brux'; }
        else { money = 'tix'; }
        const uid = Number(cur.id);
        if (isMine) {
            err = 'You made this item.';
        } else if (money === '') {
            err = 'Pick a currency first.';
        } else {
            const owned = await ctx.db.get('SELECT 1 AS x FROM owned_items WHERE user_id = ? AND item_id = ?', [uid, id]);
            if (owned) {
                err = 'You already own this item.';
            } else {
                await currency.balances(ctx.db, uid);
                await currency.balances(ctx.db, Number(it.creator_id));
                try {
                    const stmts = [
                        { sql: 'INSERT INTO owned_items (user_id, item_id, acquired) VALUES (?, ?, ?)', params: [uid, id, nowSql()] }
                    ];
                    if (money === 'brux') {
                        stmts.push({ sql: 'UPDATE currencies SET brux = brux - ? WHERE user_id = ? AND brux >= ?', params: [pb, uid, pb] });
                        stmts.push({ sql: 'UPDATE currencies SET brux = brux + ? WHERE user_id = ?', params: [pb, Number(it.creator_id)] });
                    } else if (money === 'tix') {
                        stmts.push({ sql: 'UPDATE currencies SET tix = tix - ? WHERE user_id = ? AND tix >= ?', params: [pt, uid, pt] });
                        stmts.push({ sql: 'UPDATE currencies SET tix = tix + ? WHERE user_id = ?', params: [pt, Number(it.creator_id)] });
                    }
                    const res = await ctx.db.batch(stmts);
                    if (stmts.length > 1 && (!res[1] || Number(res[1].changes) !== 1)) { throw new Error('balance changed'); }
                    ok = true;
                } catch (ex) {
                    err = 'Something went wrong. Try again.';
                }
            }
        }
    }
    const more = await ctx.db.all('SELECT i.id, i.name, i.type, i.file, u.username AS creator FROM items i JOIN users u ON u.id = i.creator_id WHERE i.id <> ? ORDER BY i.created DESC LIMIT 5', [id]);
    const sold = await ctx.db.get('SELECT COUNT(*) AS c FROM owned_items WHERE item_id = ?', [id]);
    let buyHtml = '';
    if (ok) {
        buyHtml = '<p class="DetailHighlighted">Bought. It is in your collection on <a href="my">My WallOfBricks</a>.</p>\n';
    } else if (err !== '') {
        buyHtml = '<p class="Attention">' + esc(err) + '</p>\n';
    }
    let buttons = '';
    if (cur === null) {
        buttons = '<a class="Button" href="login?next=catalog">Log In to Buy</a>';
    } else if (isMine) {
        buttons = '<span>You uploaded this item.</span> <a class="Button" href="download?id=' + Number(it.id) + '">Download</a>';
    } else if (pb === 0 && pt === 0) {
        buttons = '<form method="post" action="item?id=' + Number(it.id) + '">' + L.csrfField(ctx) + '<button class="Button" type="submit" name="do_buy" value="1">Get for Free</button>\n</form>';
    } else {
        if (pb > 0) { buttons += '<form method="post" action="item?id=' + Number(it.id) + '">' + L.csrfField(ctx) + '<input type="hidden" name="currency" value="brux"><button class="Button" type="submit" name="do_buy" value="1">Buy with Brux</button>\n</form>\n'; }
        if (pt > 0) { buttons += '<form method="post" action="item?id=' + Number(it.id) + '">' + L.csrfField(ctx) + '<input type="hidden" name="currency" value="tix"><button class="Button" type="submit" name="do_buy" value="1">Buy with Tix</button>\n</form>\n'; }
    }
    let moreHtml = '';
    if (more.length > 0) {
        moreHtml = '<div class="bottombar panel center">\n<h3>Also in the Catalog</h3>\n<table class="Grid">\n<tbody><tr>\n';
        for (const m of more) {
            moreHtml += '<td class="Asset">\n<div class="AssetThumbnail"><a href="item?id=' + Number(m.id) + '"><img src="' + esc(H.itemIconUrl(m)) + '" alt="' + esc(m.name) + '"></a></div>\n<div class="AssetDetails">\n<div class="AssetName"><a href="item?id=' + Number(m.id) + '">' + esc(m.name) + '</a></div>\n<div><span class="Label">Creator:</span> ' + esc(m.creator) + '</div>\n</div>\n</td>\n';
        }
        moreHtml += '</tr>\n</tbody></table>\n</div>\n';
    }
    let priceHtml;
    if (pb === 0 && pt === 0) {
        priceHtml = '<p class="PriceInTickets">Free</p>\n';
    } else {
        priceHtml = (pb > 0 ? '<p class="PriceInRobux">B$ ' + H.num(pb) + '</p>\n' : '') + (pt > 0 ? '<p class="PriceInTickets">' + H.num(pt) + ' Tix</p>\n' : '');
    }
    const meshNote = H.isMeshFile(it.file) ? '<p class="FormNotes">This is a 3D mesh. Owners can <a href="download?id=' + Number(it.id) + '">download the file</a>.</p>\n' : '';
    const body = '<div class="bottombar panel center">\n<h2>' + esc(it.name) + '</h2>\n<p><img src="' + esc(H.itemIconUrl(it)) + '" alt="' + esc(it.name) + '" class="ItemBig"></p>\n' +
        '<p>A ' + esc(String(types[it.type] || 'item').toLowerCase()) + ' by <a href="profile?u=' + esc(encodeURIComponent(it.creator)) + '">' + esc(it.creator) + '</a></p>\n' +
        '<p>Type: ' + esc(String(it.type).replace(/^./, function (c) { return c.toUpperCase(); })) + ' | Added: ' + esc(H.dateShort(it.created)) + ' | Sold: ' + H.num(Number(sold.c)) + '</p>\n' +
        buyHtml + '<div class="lefttext">\n<p><span class="Label">Description</span></p>\n<p>' + H.nl2br(it.description !== '' ? it.description : 'No description yet.') + '</p>\n</div>\n' +
        meshNote + priceHtml + '<div>\n' + buttons + '\n</div>\n</div>\n' + moreHtml;
    return page(ctx, it.name + ' - WallOfBricks Catalog', body);
}

async function itemNew(ctx) {
    const red = await requireLogin(ctx, 'item_new');
    if (red) { return red; }
    const me = ctx.user;
    let err = '';
    const types = { hat: 'Hat', face: 'Face', gear: 'Gear', shirt: 'Shirt', pants: 'Pants' };
    let name = '', desc = '', pb = 0, pt = 0;
    await items.ensureSchema(ctx.db);
    if (ctx.method === 'POST' && ctx.fields.do_upload) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        try {
            name = strField(ctx.fields, 'name', 60);
            desc = strField(ctx.fields, 'description', 1000);
            const type = strField(ctx.fields, 'type', 10);
            pb = typeof ctx.fields.price_brux === 'string' && /^\d{1,7}$/.test(ctx.fields.price_brux.trim()) ? parseInt(ctx.fields.price_brux.trim(), 10) : -1;
            pt = typeof ctx.fields.price_tix === 'string' && /^\d{1,7}$/.test(ctx.fields.price_tix.trim()) ? parseInt(ctx.fields.price_tix.trim(), 10) : -1;
            if (Array.from(name).length < 3) { throw new Error('Give the item a name with at least 3 letters.'); }
            if (!types[type]) { throw new Error('Pick a type: hat, face, gear, shirt or pants.'); }
            if (pb < 0 || pt < 0) { throw new Error('Prices must be plain numbers from 0 to 9999999.'); }
            if ((await uploadsToday(ctx.db, me.id)) >= CFG.uploadsPerDay) { throw new Error('Daily upload limit reached. Try again tomorrow.'); }
            const kind = (type === 'shirt' || type === 'pants') ? 'cloth' : (type === 'face' ? 'img' : 'mesh');
            const saved = H.saveUpload(kind, ctx.files.file);
            await H.storeFile(ctx.db, saved);
            await ctx.db.run('INSERT INTO items (name, type, creator_id, file, price_brux, price_tix, description, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, type, me.id, saved.name, pb, pt, desc, nowSql()]);
            const iid = await ctx.db.get('SELECT last_insert_rowid() AS id');
            await auth.setFlash(ctx.db, ctx.session, 'ok', 'Item uploaded. It is live in the Catalog.');
            return ctx.redirect('item?id=' + Number(iid.id));
        } catch (ex) {
            err = ex.message;
        }
    }
    const body = '<div class="bottombar panel">\n<h2 class="center">Upload an Item</h2>\n' +
        (err !== '' ? '<p class="Attention">' + esc(err) + '</p>\n' : '') +
        '<form method="post" action="item_new" enctype="multipart/form-data">\n' + L.csrfField(ctx) +
        '<p><label for="i-name" class="FormLabel">Name</label><br>\n<input type="text" id="i-name" name="name" class="TextBox" maxlength="60" value="' + esc(name) + '"></p>\n' +
        '<p><label for="i-type" class="FormLabel">Type</label><br>\n<select class="DropDownList" id="i-type" name="type">\n<option value="hat">Hat</option>\n<option value="face">Face</option>\n<option value="gear">Gear</option>\n<option value="shirt">Shirt</option>\n<option value="pants">Pants</option>\n</select></p>\n' +
        '<p><label for="i-file" class="FormLabel">File</label><br>\n<input type="file" id="i-file" name="file" class="TextBox" accept=".obj,.glb,.jpg,.jpeg,.png,.webp"></p>\n' +
        '<p class="FormNotes">Faces, shirts and pants take photos: jpg, jpeg, png or webp up to 1.5 MB. Shirts and pants wrap your body in places, so keep the picture simple. Hats and gear take 3D meshes: obj or glb up to 1.5 MB. Meshes show a stand-in picture.</p>\n' +
        '<p class="FormNotes">Clothing templates with the exact body mapping: <a href="assets/img/shirt_template.png" download>shirt template picture</a> and <a href="assets/img/pants_template.png" download>pants template picture</a>. Paint every box on the template, save the picture and upload it as your shirt or pants. The full template stays private so nobody can take it from your item page.</p>\n' +
        '<p><label for="i-brux" class="FormLabel">Price in Brux</label><br>\n<input type="text" inputmode="numeric" id="i-brux" name="price_brux" class="TextBox" maxlength="7" value="' + esc(pb >= 0 ? String(pb) : '0') + '"> <span class="FormNotes">0 means free</span></p>\n' +
        '<p><label for="i-tix" class="FormLabel">Price in Tix</label><br>\n<input type="text" inputmode="numeric" id="i-tix" name="price_tix" class="TextBox" maxlength="7" value="' + esc(pt >= 0 ? String(pt) : '0') + '"></p>\n' +
        '<p><label for="i-desc" class="FormLabel">Description</label><br>\n<textarea class="MultilineTextBox" id="i-desc" name="description" rows="4" maxlength="1000">' + esc(desc) + '</textarea></p>\n' +
        '<p class="center"><button class="YesButton Button" type="submit" name="do_upload" value="1">Upload Item</button> <a class="NoButton Button" href="character">Cancel</a></p>\n</form>\n' +
        '<p class="FormNotes">Sales go straight into your wallet. You cannot buy your own item. Upload only your own work. Up to ' + CFG.uploadsPerDay + ' uploads per day across places and items.</p>\n</div>\n';
    return page(ctx, 'Upload an Item - WallOfBricks', body);
}

async function download(ctx) {
    const id = getInt(ctx.url, 'id');
    if (id === null || ctx.user === null) { return ctx.redirect('catalog'); }
    const it = await ctx.db.get('SELECT id, name, type, file, creator_id FROM items WHERE id = ?', [id]);
    if (!it || String(it.file) === '') { return ctx.redirect('catalog'); }
    const uid = Number(ctx.user.id);
    if ((it.type === 'shirt' || it.type === 'pants') && uid !== Number(it.creator_id)) {
        await auth.setFlash(ctx.db, ctx.session, 'err', 'Clothing templates stay with the maker.');
        return ctx.redirect('item?id=' + id);
    }
    if (uid !== Number(it.creator_id)) {
        const own = await ctx.db.get('SELECT 1 AS x FROM owned_items WHERE user_id = ? AND item_id = ?', [uid, id]);
        if (!own) {
            await auth.setFlash(ctx.db, ctx.session, 'err', 'Buy the item first.');
            return ctx.redirect('item?id=' + id);
        }
    }
    const rel = String(it.file);
    if (!/^[a-z]+\/[0-9a-f]{32}\.[a-z0-9]{2,4}$/.test(rel)) { return ctx.redirect('item?id=' + id); }
    const row = await H.getFile(ctx.db, rel);
    if (!row) {
        await auth.setFlash(ctx.db, ctx.session, 'err', 'The file is missing. Ask the maker to upload it again.');
        return ctx.redirect('item?id=' + id);
    }
    const ext = rel.slice(rel.lastIndexOf('.') + 1);
    const mimes = { obj: 'text/plain', glb: 'model/gltf-binary', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mime = mimes[ext] || 'application/octet-stream';
    const headers = new Headers();
    headers.set('Content-Type', mime);
    headers.set('Content-Disposition', 'attachment; filename="wob_' + Number(it.id) + '_mesh.' + ext + '"');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'no-store');
    return new Response(row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes), { status: 200, headers: headers });
}

async function clothImage(ctx) {
    const id = getInt(ctx.url, 'id');
    const served = { ok: false };
    let bytes = null;
    let mime = '';
    if (id !== null && ctx.user !== null) {
        const it = await ctx.db.get('SELECT type, file, creator_id FROM items WHERE id = ?', [id]);
        if (it && (it.type === 'shirt' || it.type === 'pants')) {
            let own = Number(ctx.user.id) === Number(it.creator_id);
            if (!own) {
                own = !!(await ctx.db.get('SELECT 1 AS x FROM owned_items WHERE user_id = ? AND item_id = ?', [Number(ctx.user.id), id]));
            }
            const rel = String(it.file);
            if (own && /^cloth\/[0-9a-f]{32}\.(png|jpg|jpeg|webp)$/.test(rel)) {
                const row = await H.getFile(ctx.db, rel);
                if (row) {
                    bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
                    mime = String(row.mime);
                    served.ok = true;
                }
            }
        }
    }
    if (!served.ok) {
        return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return new Response(bytes, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}

async function clothPeer(ctx) {
    const id = getInt(ctx.url, 'id');
    const gid = getInt(ctx.url, 'g');
    const served = { ok: false };
    let bytes = null;
    let mime = '';
    if (id !== null && gid !== null && ctx.user !== null) {
        const now = nowMs();
        const fresh = now - CFG.mpPresenceMs;
        const worn = await ctx.db.get('SELECT 1 AS x FROM user_avatar a JOIN mp_state w ON w.user_id = a.user_id AND w.game_id = ? AND w.updated_ms > ? JOIN mp_state v ON v.user_id = ? AND v.game_id = w.game_id AND v.updated_ms > ? WHERE a.shirt_item_id = ? OR a.pants_item_id = ?', [gid, fresh, Number(ctx.user.id), fresh, id, id]);
        if (worn) {
            const it = await ctx.db.get('SELECT type, file FROM items WHERE id = ?', [id]);
            const rel = it ? String(it.file) : '';
            if (it && (it.type === 'shirt' || it.type === 'pants') && /^cloth\/[0-9a-f]{32}\.(png|jpg|jpeg|webp)$/.test(rel)) {
                const row = await H.getFile(ctx.db, rel);
                if (row) {
                    bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
                    mime = String(row.mime);
                    served.ok = true;
                }
            }
        }
    }
    if (!served.ok) {
        return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return new Response(bytes, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}

module.exports = { games, game, gameNew, catalog, item, itemNew, download, clothImage, clothPeer, uploadsRoute, uploadsToday };

async function uploadsRoute(ctx, name) {
    if (!/^(img|mesh)\/[0-9a-f]{32}\.(png|jpg|jpeg|webp|obj|glb)$/.test(name)) {
        return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const row = await H.getFile(ctx.db, name);
    if (!row) { return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
    const headers = new Headers();
    headers.set('Content-Type', String(row.mime));
    headers.set('Cache-Control', 'public, max-age=604800');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return new Response(row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes), { status: 200, headers: headers });
}
