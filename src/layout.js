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
    strip += '<a class="nav-menu-title text-header" href="' + (cur !== null ? 'my' : 'index') + '">My WallOfBricks</a>';
    strip += '<a class="nav-menu-title text-header" href="character">Character</a>';
    strip += '<a class="nav-menu-title text-header" href="games">Games</a>';
    strip += '<a class="nav-menu-title text-header" href="people">Browse</a>';
    strip += '<a class="nav-menu-title text-header" href="forum">Forum</a>';
    strip += '<a class="nav-menu-title text-header" href="news">News</a>';
    let topauth = '';
    if (cur !== null) {
        topauth = '<a class="UserChip" href="profile?u=' + esc(encodeURIComponent(cur.username)) + '"><span class="UserTile">' + esc(cur.username.slice(0, 1).toUpperCase()) + '</span><span class="UserName">' + esc(cur.username) + '</span></a>';
    } else {
        topauth = '<a class="TopLogin nav-menu-title" href="login">Log In</a><a class="TopSignup" href="register">Sign Up</a>';
    }
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(pageTitle || CFG.site) + '</title>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="stylesheet" href="assets/css/styles.css?v=' + CFG.assetVersion + '">\n<link rel="Shortcut Icon" type="image/png" href="assets/img/favicon.png">\n</head>\n<body>\n'
        + '<div id="navigation-container" class="light-theme">\n<div id="header" class="rbx-header masthead" role="navigation">\n<div class="container-fluid">\n'
        + '<div class="rbx-navbar-header">\n<button id="header-menu-icon" class="rbx-nav-collapse linklike" type="button" aria-label="Menu"><span class="MenuLines"><i></i><i></i><i></i></span></button>\n<a class="navbar-brand homelink" href="' + home + '"><img class="logo" src="assets/images/wob_logo.png" alt="WallOfBricks"></a>\n</div>\n'
        + '<div class="rbx-navbar navstrip"><span class="navlinks">' + strip + '</span>\n<span class="navauth">' + (cur !== null ? auth : '') + '</span></div>\n'
        + '<div class="rbx-navbar-right topauth">\n<form class="topsearch navbar-search" method="get" action="people"><input class="topsearchbox new-input-field" type="text" name="q" maxlength="20" placeholder="Search"></form>\n'
        + '<div class="topauthslot">' + topauth + '</div>\n</div>\n</div>\n</div>\n</div>\n'
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
    return (extra || '') + '<footer class="container-footer sitefoot">\n<div class="footer">\n<div class="footer-links">\n'
        + '<span class="footer-link"><a class="text-footer-nav" href="games">Games</a></span>'
        + '<span class="footer-link"><a class="text-footer-nav" href="forum">Forum</a></span>'
        + '<span class="footer-link"><a class="text-footer-nav" href="news">News</a></span>'
        + '<span class="footer-link"><a class="text-footer-nav" href="people">People</a></span>'
        + '<span class="footer-link"><a class="text-footer-nav" href="help">Help</a></span>\n'
        + '</div>\n<div class="copyright-container"><div class="footer-note">© WallOfBricks 2026</div></div>\n</div>\n</footer>\n<script src="assets/js/main.js?v=' + CFG.assetVersion + '"></script>\n</body>\n</html>';
}

function downPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>WallOfBricks is not ready yet</h1><p>Try again soon.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

function errorPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>Something broke</h1><p>Try again soon.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

function csrfBlockPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>Request blocked</h1><p>That action did not pass the security check.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

module.exports = { header, footer, csrfField, downPage, errorPage, csrfBlockPage };
