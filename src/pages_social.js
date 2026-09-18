const { CFG, esc, htmlReply, redirectReply, getParam, getInt, nowSql, todaySql, clientIp, strField, jsonReply } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const H = require('./helpers');
const currency = require('./currency');

async function requireLogin(ctx, nextName) {
    if (ctx.user !== null) { return null; }
    await auth.setFlash(ctx.db, ctx.session, 'err', 'You need to log in to do that.');
    const safe = ['my', 'games', 'people', 'game_new', 'character', 'catalog', 'item_new', 'colors', 'studio'].indexOf(nextName) !== -1 ? nextName : 'my';
    return ctx.redirect('login?next=' + encodeURIComponent(safe));
}

async function page(ctx, title, body, extraScript) {
    ctx.flash = await auth.takeFlash(ctx.db, ctx.session);
    return htmlReply(L.header(ctx, title) + body + L.footer(ctx, extraScript), 200, ctx.responseHeaders());
}

function index(ctx) {
    return page(ctx, 'My WallOfBricks', '<div class="bottombar">\n<center><p>nothing here yet! go to other pages like go login or signup if havent or play games if did</p></center>\n</div>\n');
}

async function login(ctx) {
    if (ctx.user !== null) { return ctx.redirect('my'); }
    let next = getParam(ctx.url, 'next') || 'my';
    const okNext = ['my', 'games', 'people', 'game_new', 'catalog', 'item_new', 'colors'];
    if (okNext.indexOf(next) === -1 && !/^play\?id=\d{1,10}$/.test(next)) { next = 'my'; }
    let err = '';
    let name = strField(ctx.fields, 'username', 20);
    if (ctx.method === 'POST') {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const pass = typeof ctx.fields.password === 'string' ? ctx.fields.password : '';
        const ip = ctx.ip;
        if (name === '' || pass === '') {
            err = 'Fill in both fields.';
        } else if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
            err = 'Invalid username or password.';
        } else if (await auth.loginThrottled(ctx.db, ip, name)) {
            err = 'Too many attempts. Wait ' + CFG.loginLockMinutes + ' minutes and try again.';
        } else {
            const row = await ctx.db.get('SELECT id, password_hash FROM users WHERE username = ?', [name]);
            let good = false;
            let uid = 0;
            if (row) {
                good = await auth.verifyPassword(pass, row.password_hash);
                uid = Number(row.id);
            } else {
                await auth.verifyPassword(pass, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
                good = false;
            }
            if (!good) {
                await auth.recordAttempt(ctx.db, ip, name);
                err = 'Invalid username or password.';
            } else {
                await auth.clearAttempts(ctx.db, ip, name);
                await await auth.destroySession(ctx.db, ctx.session.row.token_hash);
                const fresh = await auth.createSession(ctx.db, uid, ctx.secure);
                ctx.setCookie(fresh.cookie);
                ctx.session = await auth.loadSessionByToken(ctx.db, fresh.token);
                await ctx.db.run('UPDATE users SET last_login = ? WHERE id = ?', [nowSql(), uid]);
                let dailyMsg = '';
                try {
                    if (await currency.dailyCheck(ctx.db, uid)) { dailyMsg = ' Daily bonus: 10 Tix.'; }
                } catch (e) { }
                await auth.setFlash(ctx.db, ctx.session, 'ok', 'You are logged in.' + dailyMsg);
                return ctx.redirect(next);
            }
        }
    }
    const body = '<div class="bottombar panel center">\n<h2>Member Login</h2>\n' +
        (err !== '' ? '<p class="Attention">' + esc(err) + '</p>\n' : '') +
        '<form method="post" action="login?next=' + esc(encodeURIComponent(next)) + '">\n' + L.csrfField(ctx) +
        '<p><label for="UserName" class="FormLabel">Character Name</label><br>\n<input name="username" type="text" id="UserName" tabindex="1" class="TextBox" maxlength="20" autocomplete="username" value="' + esc(name) + '"></p>\n' +
        '<p><label for="Password" class="FormLabel">Password</label><br>\n<input name="password" type="password" id="Password" tabindex="2" class="TextBox" maxlength="128" autocomplete="current-password"></p>\n' +
        '<p><button type="submit" tabindex="4" class="Button">Login</button></p>\n</form>\n</div>\n' +
        '<div class="bottombar panel center">\n<h3>No Account Yet?</h3>\n<p>Sign up to build places and play with everyone.</p>\n<p><a class="Button" href="register">Sign Up</a></p>\n</div>\n';
    return page(ctx, 'Log In - WallOfBricks', body);
}

async function register(ctx) {
    if (ctx.user !== null) { return ctx.redirect('my'); }
    let err = '';
    let name = '';
    if (ctx.method === 'POST') {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        name = strField(ctx.fields, 'username', 20);
        const pass = typeof ctx.fields.password === 'string' ? ctx.fields.password : '';
        const pass2 = typeof ctx.fields.password2 === 'string' ? ctx.fields.password2 : '';
        const trap = typeof ctx.fields.website === 'string' ? ctx.fields.website.trim() : '';
        const ip = ctx.ip;
        if (trap !== '') {
            err = 'Sign up failed. Try again.';
        } else if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
            err = 'Username must be 3 to 20 letters, numbers or underscores.';
        } else if (pass.length < 8 || pass.length > 128) {
            err = 'Password must be at least 8 characters.';
        } else if (pass !== pass2) {
            err = 'The two passwords do not match.';
        } else if (await auth.registerThrottled(ctx.db, ip)) {
            err = 'Too many accounts from this network today. Come back tomorrow.';
        } else {
            const dup = await ctx.db.get('SELECT id FROM users WHERE username = ?', [name]);
            if (dup) {
                err = 'That username is taken.';
            } else {
                const hash = await auth.hashPassword(pass);
                const now = nowSql();
                await ctx.db.run('INSERT INTO users (username, password_hash, blurb, joined, last_login, registration_ip) VALUES (?, ?, ?, ?, ?, ?)', [name, hash, '', now, now, ip]);
                const row = await ctx.db.get('SELECT id FROM users WHERE username = ?', [name]);
                if (!row) { throw new Error('registration insert failed'); }
                await await auth.destroySession(ctx.db, ctx.session.row.token_hash);
                const fresh = await auth.createSession(ctx.db, Number(row.id), ctx.secure);
                ctx.setCookie(fresh.cookie);
                ctx.session = await auth.loadSessionByToken(ctx.db, fresh.token);
                await auth.setFlash(ctx.db, ctx.session, 'ok', 'Account created.');
                return ctx.redirect('my');
            }
        }
    }
    const body = '<div class="bottombar panel center">\n<h3>Why Join?</h3>\n<ul class="centerlist">\n<li>A figure with your own colors</li>\n<li>A wall on your profile</li>\n<li>Up to ' + CFG.gamesPerPlayer + ' places of your own</li>\n</ul>\n</div>\n' +
        '<div class="bottombar panel">\n<h2 class="center">Sign Up for WallOfBricks</h2>\n' +
        (err !== '' ? '<p class="Attention center">' + esc(err) + '</p>\n' : '') +
        '<form method="post" action="register">\n' + L.csrfField(ctx) +
        '<p class="hidden-field"><label for="website">Website</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></p>\n' +
        '<p><label for="UserName" class="FormLabel">Character Name</label><br>\n<input name="username" type="text" id="UserName" class="TextBox" maxlength="20" autocomplete="username" value="' + esc(name) + '"></p>\n' +
        '<p class="FormNotes">3 to 20 letters, numbers or underscores.</p>\n' +
        '<p><label for="Password" class="FormLabel">Password</label><br>\n<input name="password" type="password" id="Password" class="TextBox" minlength="8" maxlength="128" autocomplete="new-password"></p>\n' +
        '<p><label for="Password2" class="FormLabel">Password Again</label><br>\n<input name="password2" type="password" id="Password2" class="TextBox" minlength="8" maxlength="128" autocomplete="new-password"></p>\n' +
        '<p class="FormNotes">At least 8 characters.</p>\n' +
        '<p class="center"><button class="YesButton Button" type="submit">Sign Up</button></p>\n</form>\n</div>\n';
    return page(ctx, 'Sign Up - WallOfBricks', body);
}

async function logout(ctx) {
    if (ctx.method !== 'POST') { return ctx.redirect('index'); }
    if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
    await await auth.destroySession(ctx.db, ctx.session.row.token_hash);
    ctx.setCookie('wob_session=; Path=/; HttpOnly; SameSite=Lax' + (ctx.secure ? '; Secure' : '') + '; Max-Age=0');
    const fresh = await auth.createSession(ctx.db, 0, ctx.secure);
    ctx.setCookie(fresh.cookie);
    ctx.session = await auth.loadSessionByToken(ctx.db, fresh.token);
    await auth.setFlash(ctx.db, ctx.session, 'ok', 'You are logged out.');
    return ctx.redirect('index');
}

async function my(ctx) {
    const red = await requireLogin(ctx, 'my');
    if (red) { return red; }
    const me = ctx.user;
    const myGames = await ctx.db.all('SELECT id, name, visits, thumb FROM games WHERE creator_id = ? ORDER BY visits DESC', [me.id]);
    const sum = await ctx.db.get('SELECT COALESCE(SUM(visits), 0) AS s FROM games WHERE creator_id = ?', [me.id]);
    let gamesHtml = '';
    if (myGames.length === 0) {
        gamesHtml = '<p>You have not built a place yet.</p>\n';
    } else {
        gamesHtml = '<table class="Grid">\n<tbody><tr>\n';
        for (const g of myGames) {
            gamesHtml += '<td class="Game">\n<div class="GameThumbnail"><a title="' + esc(g.name) + '" href="game?id=' + Number(g.id) + '"><img src="' + esc(H.gameThumbUrl(g)) + '" alt="' + esc(g.name) + '"></a></div>\n<div class="GameDetails"><div class="GameName"><a href="game?id=' + Number(g.id) + '">' + esc(g.name) + '</a></div></div>\n<div><a class="Button" href="studio?id=' + Number(g.id) + '">Edit in Studio</a></div>\n</td>\n';
        }
        gamesHtml += '</tr>\n</tbody></table>\n';
    }
    const body = '<div class="bottombar panel center">\n<h2>' + esc(me.username) + '</h2>\n' +
        '<p><span class="Label">Place Visits Earned</span> ' + H.num(sum.s) + '</p>\n' +
        '<p><a class="Button" href="profile?u=' + esc(encodeURIComponent(me.username)) + '">View My Profile</a> <a class="Button" href="settings">Edit My Profile</a></p>\n' +
        '<p><a class="Button" href="game_new">Upload a Place</a></p>\n' +
        '<p class="FormNotes">You run ' + myGames.length + ' of the ' + CFG.gamesPerPlayer + ' places each builder gets.</p>\n' +
        '</div>\n<div class="bottombar panel center">\n<h3>My Places</h3>\n' + gamesHtml + '</div>\n';
    return page(ctx, 'My WallOfBricks', body);
}

async function settings(ctx) {
    const red = await requireLogin(ctx, 'settings');
    if (red) { return red; }
    const me = ctx.user;
    let errP = '', okP = '', errB = '', okB = '';
    if (ctx.method === 'POST' && ctx.fields.do_password) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const old = typeof ctx.fields.old === 'string' ? ctx.fields.old : '';
        const nw = typeof ctx.fields.new === 'string' ? ctx.fields.new : '';
        const nw2 = typeof ctx.fields.new2 === 'string' ? ctx.fields.new2 : '';
        const row = await ctx.db.get('SELECT password_hash FROM users WHERE id = ?', [me.id]);
        if (!row || !(await auth.verifyPassword(old, row.password_hash))) {
            errP = 'The current password is not right.';
        } else if (nw.length < 8 || nw.length > 128) {
            errP = 'New password must be at least 8 characters.';
        } else if (nw !== nw2) {
            errP = 'The two new passwords do not match.';
        } else if (old === nw) {
            errP = 'The new password matches the old one.';
        } else {
            await ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await auth.hashPassword(nw), me.id]);
            okP = 'Password changed.';
        }
    }
    if (ctx.method === 'POST' && ctx.fields.do_blurb) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        const blurb = strField(ctx.fields, 'blurb', CFG.blurbMax);
        await ctx.db.run('UPDATE users SET blurb = ? WHERE id = ?', [blurb, me.id]);
        me.blurb = blurb;
        okB = 'Profile saved.';
    }
    const chars = Array.from(String(me.blurb || '')).length;
    const body = '<div class="bottombar panel center">\n<h2>My Account</h2>\n<h3>About Me</h3>\n' +
        (okB !== '' ? '<p class="DetailHighlighted">' + esc(okB) + '</p>\n' : '') +
        (errB !== '' ? '<p class="Attention">' + esc(errB) + '</p>\n' : '') +
        '<form method="post" action="settings">\n' + L.csrfField(ctx) +
        '<p><textarea class="MultilineTextBox" name="blurb" rows="6" maxlength="' + CFG.blurbMax + '" id="blurb">' + esc(me.blurb) + '</textarea></p>\n' +
        '<p class="FormNotes"><span id="blurb-count">' + (CFG.blurbMax - chars) + '</span> characters left.</p>\n' +
        '<p><button class="Button" type="submit" name="do_blurb" value="1">Save Profile</button></p>\n</form>\n</div>\n' +
        '<div class="bottombar panel center">\n<h3>Change Password</h3>\n' +
        (okP !== '' ? '<p class="DetailHighlighted">' + esc(okP) + '</p>\n' : '') +
        (errP !== '' ? '<p class="Attention">' + esc(errP) + '</p>\n' : '') +
        '<form method="post" action="settings">\n' + L.csrfField(ctx) +
        '<p><label for="old" class="FormLabel">Current</label><br>\n<input type="password" id="old" name="old" class="TextBox" maxlength="128" autocomplete="current-password"></p>\n' +
        '<p><label for="new" class="FormLabel">New</label><br>\n<input type="password" id="new" name="new" class="TextBox" minlength="8" maxlength="128" autocomplete="new-password"></p>\n' +
        '<p><label for="new2" class="FormLabel">Again</label><br>\n<input type="password" id="new2" name="new2" class="TextBox" minlength="8" maxlength="128" autocomplete="new-password"></p>\n' +
        '<p><button class="Button" type="submit" name="do_password" value="1">Save New Password</button></p>\n</form>\n</div>\n';
    return page(ctx, 'My Account - WallOfBricks', body);
}

async function profile(ctx) {
    const uname = getParam(ctx.url, 'u');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(uname)) { return ctx.redirect('people'); }
    const p = await ctx.db.get('SELECT id, username, blurb, views, joined, last_login FROM users WHERE username = ?', [uname]);
    const me = ctx.user;
    if (!p) {
        ctx.flash = await auth.takeFlash(ctx.db, ctx.session);
        return htmlReply(L.header(ctx, 'Builder Not Found - WallOfBricks') + '<div class="bottombar panel center"><h2>Builder Not Found</h2><p>No builder with that name.</p><p><a class="Button" href="people">Back to Browse</a></p></div>\n' + L.footer(ctx), 200, ctx.responseHeaders());
    }
    const pid = Number(p.id);
    const isMe = me !== null && Number(me.id) === pid;
    if (!isMe) {
        await ctx.db.run('UPDATE users SET views = views + 1 WHERE id = ?', [pid]);
        p.views = Number(p.views) + 1;
    }
    let cerr = '';
    if (ctx.method === 'POST' && ctx.fields.do_comment) {
        if (!auth.csrfOk(ctx.session, ctx.fields.csrf)) { return ctx.csrfBlock(); }
        if (me === null) {
            await auth.setFlash(ctx.db, ctx.session, 'err', 'Log in first to leave a message on the wall.');
            return ctx.redirect('login?next=' + encodeURIComponent('people'));
        }
        const body = strField(ctx.fields, 'body', CFG.commentMax);
        if (body === '') {
            cerr = 'Say something first.';
        } else if (me.username === p.username) {
            cerr = 'You cannot post on your own wall.';
        } else {
            const last = await ctx.db.get('SELECT created FROM profile_comments WHERE author_id = ? ORDER BY created DESC LIMIT 1', [me.id]);
            if (last) {
                const t = Date.parse(String(last.created).replace(' ', 'T') + 'Z');
                if (!isNaN(t)) {
                    const diff = Math.floor((Date.now() - t) / 1000);
                    if (diff < CFG.commentCooldown) {
                        cerr = 'Wait ' + (CFG.commentCooldown - diff) + ' more seconds.';
                    }
                }
            }
            if (cerr === '') {
                await ctx.db.run('INSERT INTO profile_comments (user_id, author_id, body, created) VALUES (?, ?, ?, ?)', [pid, me.id, body, nowSql()]);
                await auth.setFlash(ctx.db, ctx.session, 'ok', 'Message posted on the wall of ' + p.username + '.');
                return ctx.redirect('profile?u=' + encodeURIComponent(p.username));
            }
        }
    }
    const comments = await ctx.db.all('SELECT c.body, c.created, a.username AS author FROM profile_comments c JOIN users a ON a.id = c.author_id WHERE c.user_id = ? ORDER BY c.created DESC LIMIT 20', [pid]);
    const theirGames = await ctx.db.all('SELECT id, name, visits, thumb FROM games WHERE creator_id = ? ORDER BY visits DESC', [pid]);
    const sum = await ctx.db.get('SELECT COALESCE(SUM(visits), 0) AS s FROM games WHERE creator_id = ?', [pid]);
    let gHtml = '';
    if (theirGames.length > 0) {
        gHtml = '<div class="bottombar panel center">\n<h3>Places</h3>\n<table class="Grid">\n<tbody><tr>\n';
        for (const tg of theirGames) {
            gHtml += '<td class="Game">\n<div class="GameThumbnail"><a title="' + esc(tg.name) + '" href="game?id=' + Number(tg.id) + '"><img src="' + esc(H.gameThumbUrl(tg)) + '" alt="' + esc(tg.name) + '"></a></div>\n<div class="GameDetails"><div class="GameName"><a href="game?id=' + Number(tg.id) + '">' + esc(tg.name) + '</a></div></div>\n</td>\n';
        }
        gHtml += '</tr>\n</tbody></table>\n</div>\n';
    }
    let cHtml = '';
    if (me === null) {
        cHtml = '<p class="center"><a href="login">Log in</a> to leave a message.</p>\n';
    } else if (!isMe) {
        cHtml = (cerr !== '' ? '<p class="Attention center">' + esc(cerr) + '</p>' : '') +
            '<form method="post" action="profile?u=' + esc(encodeURIComponent(p.username)) + '">\n' + L.csrfField(ctx) +
            '<p class="center"><textarea class="MultilineTextBox" name="body" rows="3" maxlength="' + CFG.commentMax + '" required></textarea></p>\n' +
            '<p class="center"><button class="Button" type="submit" name="do_comment" value="1">Post to the Wall</button></p>\n</form>\n';
    } else {
        cHtml = '<p class="center FormNotes">This is your wall. Other builders can leave messages here.</p>\n';
    }
    if (comments.length === 0) {
        cHtml += '<p class="center">No messages yet.</p>\n';
    } else {
        for (const c of comments) {
            cHtml += '<div class="Comment">\n<div class="Commenter"><a href="profile?u=' + esc(encodeURIComponent(c.author)) + '">' + esc(c.author) + '</a> <span class="Detail">' + esc(H.ago(c.created)) + '</span></div>\n<div class="CommentBody">' + H.nl2br(c.body) + '</div>\n</div>\n';
        }
    }
    const body = '<div class="bottombar panel center">\n<h2>' + esc(p.username) + '</h2>\n' +
        '<p class="BlurbText lefttext">' + H.nl2br(p.blurb !== '' ? p.blurb : 'This builder has not written anything yet.') + '</p>\n' +
        '<p>Member Since ' + esc(H.dateShort(p.joined)) + ' | Last Seen ' + esc(H.ago(p.last_login)) + ' | Profile Views ' + H.num(p.views) + '</p>\n' +
        '<p>Place Visits ' + H.num(sum.s) + '</p>\n' +
        (isMe ? '<p><a class="Button" href="settings">Edit My Profile</a></p>\n' : '') +
        '</div>\n' + gHtml +
        '<div class="bottombar panel">\n<h3 class="center">Wall Messages</h3>\n' + cHtml + '</div>\n';
    return page(ctx, p.username + ' - WallOfBricks Profile', body);
}

async function people(ctx) {
    let qs = ctx.method === 'POST' ? strField(ctx.fields, 'q', 20) : '';
    if (qs === '') { qs = getParam(ctx.url, 'q').slice(0, 20); }
    const validQ = /^[A-Za-z0-9_]{1,20}$/.test(qs) ? qs : '';
    let peopleRows;
    if (validQ !== '') {
        const pat = '%' + validQ.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_') + '%';
        peopleRows = await ctx.db.all("SELECT username, joined FROM users WHERE username LIKE ? ESCAPE '!' ORDER BY username ASC LIMIT 60", [pat]);
    } else {
        peopleRows = await ctx.db.all('SELECT username, joined FROM users ORDER BY joined ASC LIMIT 60');
    }
    let rows = '';
    let i = 0;
    for (const p of peopleRows) {
        if (i > 0 && i % 5 === 0) { rows += '</tr>\n<tr>\n'; }
        rows += '<td class="Asset">\n<div><a href="profile?u=' + esc(encodeURIComponent(p.username)) + '">' + esc(p.username) + '</a></div>\n<div><span class="Label">Joined:</span> ' + esc(H.dateShort(p.joined)) + '</div>\n</td>\n';
        i++;
    }
    while (i % 5 !== 0) { rows += '<td class="Asset"></td>\n'; i++; }
    const body = '<div class="bottombar panel center">\n<h2>Browse</h2>\n<div class="SearchBar">\n<form method="get" action="people">\n' +
        '<input type="text" name="q" class="TextBox" maxlength="20" value="' + esc(validQ) + '" aria-label="Search builders">\n<button class="Button" type="submit">Search</button>\n</form>\n</div>\n' +
        '<p><a href="people">Everyone</a> | <a href="games">Places</a></p>\n' +
        '<p class="Pager">' + (validQ !== '' ? 'Search: ' + esc(validQ) : 'All Builders') + ' (' + peopleRows.length + ')</p>\n' +
        (peopleRows.length === 0 ? '<p>No builders found.</p>\n' : '<table class="Grid">\n<tbody><tr>\n' + rows + '</tr>\n</tbody></table>\n') +
        '</div>\n';
    return page(ctx, 'Browse Builders - WallOfBricks', body);
}

async function forum(ctx) {
    const body = '<div class="bottombar panel center">\n<h2>The Forum</h2>\n<p>The forum is not ready yet.</p>\n<p>Until then, post on profile walls.</p>\n<p><a class="Button" href="people">Browse Builders</a> <a class="Button" href="games">See the Places</a></p>\n</div>\n';
    return page(ctx, 'Forum - WallOfBricks', body);
}

async function news(ctx) {
    const body = '<div class="bottombar panel center">\n<h2>Site News</h2>\n<p>Nothing has been posted yet.</p>\n<p class="FormNotes">News will show up here.</p>\n</div>\n';
    return page(ctx, 'News - WallOfBricks', body);
}

module.exports = { requireLogin, page, index, login, register, logout, my, settings, profile, people, forum, news };
