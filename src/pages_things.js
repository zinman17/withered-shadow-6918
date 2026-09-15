const { CFG, esc, htmlReply, getParam, getInt, nowSql, todaySql, strField } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const H = require('./helpers');
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

function uploadsToday(db, uid) {
    const today = todaySql();
    const a = db.get('SELECT COUNT(*) AS c FROM games WHERE creator_id = ? AND created >= ?', [uid, today + ' 00:00:00']).c;
    return a;
}

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

module.exports = { games, game, gameNew, uploadsRoute, uploadsToday };
