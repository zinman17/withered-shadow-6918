const { CFG, esc } = require('./kit');
const { csrfToken } = require('./auth');

function navStrip() {
    let out = '';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="games">Games</a></li>';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="character">Avatar Shop</a></li>';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="studio">Create</a></li>';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="forum">Forum</a></li>';
    return out;
}

function rightNav(ctx) {
    const cur = ctx.user;
    let out = '';
    if (cur !== null) {
        out += '<li class="rbx-navbar-user-item cursor-pointer"><a class="nav-menu-title text-header rbx-navbar-username" href="profile?u=' + esc(encodeURIComponent(cur.username)) + '">' + esc(cur.username) + '</a></li>';
        out += '<li class="cursor-pointer"><a class="rbx-menu-icon" href="settings" aria-label="Settings"><span class="icon-nav-settings"></span></a></li>';
        out += '<li class="rbx-navbar-logout-item cursor-pointer"><form method="post" action="logout" class="inlineform">' + csrfField(ctx) + '<button type="submit" class="linklike nav-menu-title">Logout</button></form></li>';
    } else {
        out += '<li class="signup-button-container"><a id="sign-up-button" class="rbx-navbar-signup nav-menu-title signup-button" href="register">Sign Up</a></li>';
        out += '<li class="login-action"><a class="rbx-navbar-login nav-menu-title rbx-menu-item" href="login"> Log In </a></li>';
        out += '<li class="rbx-navbar-right-search cursor-pointer"><a class="rbx-menu-icon" href="people"><span class="icon-nav-search-white"></span></a></li>';
    }
    return out;
}

function header(ctx, pageTitle) {
    const cur = ctx.user;
    const home = cur !== null ? 'my' : 'index';
    const authed = cur !== null ? 'true' : 'false';
    const files = ['wb2020_base', 'wb2020_styleguide', 'wb2020_navigation', 'wb2020_footer', 'styles'];
    let css = '';
    for (let i = 0; i < files.length; i++) {
        css += '<link rel="stylesheet" href="assets/css/' + files[i] + '.css?v=' + CFG.assetVersion + '">\n';
    }
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(pageTitle || CFG.site) + '</title>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' + css + '<link rel="Shortcut Icon" type="image/png" href="assets/img/favicon.png">\n</head>\n<body class="rbx-body gotham-font light-theme">\n'
        + '<div id="navigation-container" class="light-theme">\n'
        + '<div id="header" class="navbar-fixed-top rbx-header light-theme gotham-font" data-isauthenticated="' + authed + '" role="navigation">\n'
        + '<div class="container-fluid">\n'
        + '<div class="rbx-navbar-header">\n'
        + '<div id="header-menu-icon" data-behavior="nav-notification" class="rbx-nav-collapse" onselectstart="return false"></div>\n'
        + '<div class="navbar-header"><a class="navbar-brand homelink" href="' + home + '"><img class="icon-logo-img" src="assets/images/wob_logo.png" alt="WallOfBricks"><span class="icon-logo-r"></span></a></div>\n'
        + '</div>\n'
        + '<ul class="nav rbx-navbar hidden-xs hidden-sm col-md-5 col-lg-4">' + navStrip() + '</ul>\n'
        + '<div id="navbar-universal-search" class="navbar-left rbx-navbar-search col-xs-5 col-sm-6 col-md-2 col-lg-3" role="search">\n'
        + '<form class="input-group" method="get" action="people">\n'
        + '<input id="navbar-search-input" class="form-control input-field" type="text" name="q" maxlength="120" placeholder="Search" autocomplete="off">\n'
        + '<div class="input-group-btn"><button id="navbar-search-btn" class="input-addon-btn" type="submit"><span class="icon-nav-search"></span></button></div>\n'
        + '</form>\n'
        + '</div>\n'
        + '<div class="navbar-right rbx-navbar-right">\n<ul class="nav navbar-right rbx-navbar-right-nav">' + rightNav(ctx) + '</ul>\n</div>\n'
        + '<ul class="nav rbx-navbar hidden-md hidden-lg col-xs-12">' + navStrip() + '</ul>\n'
        + '</div>\n</div>\n</div>\n'
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
    const links = [
        ['news', 'About Us'],
        ['forum', 'Jobs'],
        ['news', 'Blog'],
        ['forum', 'Parents'],
        ['forum', 'Help'],
        ['news', 'Terms'],
        ['news', 'Privacy'],
        ['forum', 'Accessibility']
    ];
    let out = '';
    for (let i = 0; i < links.length; i++) {
        out += '<div class="footer-link footer-link-wide col-xs-3"><a class="text-footer-nav" href="' + links[i][0] + '">' + links[i][1] + '</a></div>';
    }
    return (extra || '')
        + '<footer class="container-footer" id="footer-container">\n<div class="container">\n<div class="row">\n<div class="col-md-12 footer">\n'
        + '<div class="row">\n<div class="col-md-10 col-md-offset-2">\n<div class="row footer-links">' + out + '</div>\n</div>\n</div>\n'
        + '<div class="row">\n<div class="col-md-10 col-md-offset-2 copyright-container">\n<p class="text-footer caption footer-note">©2026 WallOfBricks</p>\n</div>\n</div>\n'
        + '</div>\n</div>\n</div>\n</footer>\n'
        + '<script src="assets/js/main.js?v=' + CFG.assetVersion + '"></script>\n</body>\n</html>';
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
