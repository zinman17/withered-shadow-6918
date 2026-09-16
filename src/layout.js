const { CFG, esc } = require('./kit');
const { csrfToken } = require('./auth');

const WB_CSS_ORDER = [
    '01_5f133632.css',
    '02_9517d686.css',
    '03_d41f2dd0.css',
    '04_7a42087c.css',
    '05_2c2a7092.css',
    '06_6edb2191.css',
    '07_08def520.css',
    '08_3f7284cb.css',
    '09_5b78f24a.css',
    '10_50e55074.css',
    '11_59281509.css',
    '12_d042af17.css',
    '13_9337c6fe.css',
    '14_a1d4b368.css',
    '15_4fdd2f55.css',
    '16_af90c556.css',
    '17_9ff00644.css'
];

function cssLinks() {
    let out = '';
    for (let i = 0; i < WB_CSS_ORDER.length; i++) {
        out += '<link rel="stylesheet" href="assets/css/2020/' + WB_CSS_ORDER[i] + '?v=' + CFG.assetVersion + '">\n';
    }
    out += '<link rel="stylesheet" href="assets/css/wob_brand.css?v=' + CFG.assetVersion + '">\n';
    out += '<link rel="stylesheet" href="assets/css/styles.css?v=' + CFG.assetVersion + '">\n';
    return out;
}

function navStrip() {
    let out = '';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="games">Games</a></li>\n';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="character">Avatar Shop</a></li>\n';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="studio">Create</a></li>\n';
    out += '<li class="cursor-pointer"><a class="font-header-2 nav-menu-title text-header" href="forum">Forum</a></li>\n';
    return out;
}

function searchBox() {
    return '<li class="rbx-navbar-right-search" role="search">\n'
        + '<form class="form-horizontal" method="get" action="people">\n'
        + '<div class="form-group has-feedback has-clear-left">\n'
        + '<input id="navbar-search-input" class="form-control input-field" type="text" name="q" maxlength="100" placeholder="Search" autocomplete="off">\n'
        + '<span class="form-control-feedback icon-search"></span>\n'
        + '</div>\n</form>\n</li>\n';
}

function rightNav(ctx) {
    const cur = ctx.user;
    let out = searchBox();
    if (cur !== null) {
        out += '<li class="age-bracket-label"><span class="age-bracket-label-username"><a class="text-header nav-menu-title" href="profile?u=' + esc(encodeURIComponent(cur.username)) + '">' + esc(cur.username) + '</a></span><span class="age-bracket-label-text">13+</span></li>\n';
        out += '<li id="navbar-robux"><a class="rbx-menu-item cursor-pointer" href="my"><span class="icon-nav-robux"></span><span class="text-header" id="nav-robux-amount">0</span></a></li>\n';
        out += '<li id="navbar-notifications"><a class="rbx-menu-item cursor-pointer" href="forum"><span class="icon-nav-notification-stream"></span></a></li>\n';
        out += '<li id="navbar-setting"><a class="rbx-menu-item cursor-pointer" href="settings"><span class="icon-nav-settings"></span></a></li>\n';
        out += '<li id="navbar-logout"><form method="post" action="logout" class="inlineform">' + csrfField(ctx) + '<button type="submit" class="linklike nav-menu-title text-header">Logout</button></form></li>\n';
    } else {
        out += '<li class="signup-button-action"><a id="sign-up-button" class="btn-primary-md signup-button" href="register">Sign Up</a></li>\n';
        out += '<li class="login-action"><a class="rbx-navbar-login nav-menu-title rbx-menu-item" href="login">Log In</a></li>\n';
    }
    return out;
}

function header(ctx, pageTitle) {
    const cur = ctx.user;
    const home = cur !== null ? 'my' : 'index';
    const wrapCls = cur !== null ? 'wrap no-gutter-ads logged-in' : 'wrap no-gutter-ads';
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(pageTitle || CFG.site) + '</title>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="author" content="WallOfBricks" />\n' + cssLinks() + '<link rel="Shortcut Icon" type="image/png" href="assets/img/favicon.png">\n</head>\n'
        + '<body id="rbx-body" class="rbx-body dark-theme gotham-font">\n'
        + '<div id="wrap" class="' + wrapCls + '">\n'
        + '<div id="navigation-container" class="dark-theme gotham-font">\n'
        + '<div id="header" class="navbar-fixed-top rbx-header" data-isauthenticated="' + (cur !== null ? 'true' : 'false') + '" role="navigation">\n'
        + '<div class="container-fluid">\n'
        + '<div class="rbx-navbar-header">\n'
        + '<div id="header-menu-icon" role="button" tabindex="0" class="rbx-nav-collapse">\n<span class="icon-nav-menu"></span>\n</div>\n'
        + '<div class="navbar-header">\n<a class="navbar-brand" href="' + home + '"><span class="icon-logo">WallOfBricks</span><span class="icon-logo-r"></span></a>\n</div>\n'
        + '</div>\n'
        + '<ul class="nav rbx-navbar hidden-xs hidden-sm col-md-5 col-lg-4">\n' + navStrip() + '</ul>\n'
        + '<div id="right-navigation-header">\n<ul class="nav navbar-right rbx-navbar-right nav-menu-right" id="navbar-right">\n' + rightNav(ctx) + '</ul>\n</div>\n'
        + '<ul class="nav rbx-navbar hidden-md hidden-lg col-xs-12">\n' + navStrip() + '</ul>\n'
        + '</div>\n</div>\n'
        + '<div id="left-navigation-container"></div>\n'
        + '</div>\n'
        + '<div class="container-main" id="container-main">\n'
        + '<div class="alert-container">\n' + flashHtml(ctx) + '</div>\n'
        + '<div class="content">\n';
}

function flashHtml(ctx) {
    const f = ctx.flash;
    if (!f) { return ''; }
    return '<div class="' + (f.type === 'ok' ? 'alert-success' : 'alert-warning') + '" role="alert">' + esc(f.text) + '</div>\n';
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
        + '</div>\n</div>\n'
        + '<footer class="container-footer dark-theme" id="footer-container">\n<div class="container">\n<div class="row">\n<div class="col-md-12 footer">\n'
        + '<div class="row">\n<div class="col-md-10 col-md-offset-2">\n<div class="row footer-links">' + out + '</div>\n</div>\n</div>\n'
        + '<div class="row">\n<div class="col-md-10 col-md-offset-2 copyright-container">\n<p class="text-footer caption footer-note">\u00a92026 WallOfBricks</p>\n</div>\n</div>\n'
        + '</div>\n</div>\n</div>\n</footer>\n'
        + '</div>\n'
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
