const { CFG, esc } = require('./kit');
const { csrfToken } = require('./auth');

function header(ctx, pageTitle) {
    const cur = ctx.user;
    const home = cur !== null ? 'my' : 'index';
    let auth;
    if (cur !== null) {
        auth = '<form method="post" action="logout" class="inlineform">' + csrfField(ctx) + '<button type="submit" class="linklike">Logout</button></form>';
    } else {
        auth = '<a href="login">Login</a> <span class="pipe">|</span> <a href="register">Sign Up</a>';
    }
    let strip = '';
    strip += '<a href="' + (cur !== null ? 'my' : 'index') + '">My WallOfBricks</a> <span class="pipe">|</span> ';
    strip += '<a href="character">Character</a> <span class="pipe">|</span> ';
    strip += '<a href="catalog">Catalog</a> <span class="pipe">|</span> ';
    strip += '<a href="games">Games</a> <span class="pipe">|</span> ';
    strip += '<a href="people">Browse</a> <span class="pipe">|</span> ';
    strip += '<a href="forum">Forum</a> <span class="pipe">|</span> ';
    strip += '<a href="news">News</a>';
    if (cur !== null) {
        strip += ' <span class="pipe">|</span> <a href="settings">My Account</a>';
    }
    let money = '';
    if (cur !== null && ctx.userMoney) {
        money = '<span class="MoneyStrip">Brux: ' + Number(ctx.userMoney.brux) + ' <span class="pipe">|</span> Tix: ' + Number(ctx.userMoney.tix) + '</span> <span class="pipe">|</span> ';
    }
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(pageTitle || CFG.site) + '</title>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="stylesheet" href="assets/css/styles.css?v=' + CFG.assetVersion + '">\n<link rel="Shortcut Icon" type="image/png" href="assets/img/favicon.png">\n</head>\n<body>\n'
        + '<div class="masthead">\n<a class="homelink" href="' + home + '"><img class="logo" src="assets/images/wob_logo.png" alt="WallOfBricks"></a>\n</div>\n'
        + '<div class="navstrip">\n<span class="navlinks">' + strip + '</span>\n<span class="navauth">' + money + auth + '</span>\n</div>\n'
        + flashHtml(ctx);
}

function flashHtml(ctx) {
    const f = ctx.flash;
    if (!f) { return ''; }
    return '<div class="Flash' + (f.type === 'ok' ? '' : ' Flash-err') + '"><center>' + esc(f.text) + '</center></div>\n';
}

function csrfField(ctx) {
    return '<input type="hidden" name="csrf" value="' + esc(csrfToken(ctx.session)) + '">';
}

function footer(ctx, extra) {
    return (extra || '') + '<div class="sitefoot">© WallOfBricks 2026</div>\n<script src="assets/js/main.js?v=' + CFG.assetVersion + '"></script>\n</body>\n</html>';
}

function downPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body bgcolor="#aed0ee" style="font-family:Comic Neue,Comic Sans MS,Verdana,sans-serif"><div align="center"><br><br><h1>WallOfBricks is not ready yet</h1><p>Try again soon.</p><p><a href="/">Back to WallOfBricks</a></p></div></body></html>';
}

function errorPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body bgcolor="#aed0ee" style="font-family:Comic Neue,Comic Sans MS,Verdana,sans-serif"><div align="center"><br><br><h1>Something broke</h1><p>Try again soon.</p><p><a href="/">Back to WallOfBricks</a></p></div></body></html>';
}

function csrfBlockPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body bgcolor="#aed0ee" style="font-family:Comic Neue,Comic Sans MS,Verdana,sans-serif"><div align="center"><br><br><h1>Request blocked</h1><p>That action did not pass the security check.</p><p><a href="/">Back to WallOfBricks</a></p></div></body></html>';
}

module.exports = { header, footer, csrfField, downPage, errorPage, csrfBlockPage };
