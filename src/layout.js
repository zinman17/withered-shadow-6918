const { CFG, esc } = require('./kit');
const { csrfToken } = require('./auth');
const WB = require('./wb2020_chrome');

function rightNav(ctx) {
    const cur = ctx.user;
    let out = '';
    out += '<ul class="nav navbar-right rbx-navbar-right nav-menu-right" id="navbar-right">\n';
    out += '<li class="rbx-navbar-right-search" role="search">\n'
        + '<form class="form-horizontal" method="get" action="people">\n'
        + '<div class="form-group has-feedback has-clear-left">\n'
        + '<input id="navbar-search-input" class="form-control input-field" type="text" name="q" maxlength="100" placeholder="Search" autocomplete="off">\n'
        + '<span class="form-control-feedback icon-search"></span>\n'
        + '</div>\n</form>\n</li>\n';
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
    out += '</ul>\n';
    return out;
}

function header(ctx, pageTitle) {
    const cur = ctx.user;
    return WB.fill(WB.top, {
        title: esc(pageTitle || CFG.site),
        csrf: esc(csrfToken(ctx.session)),
        pageName: esc(pageTitle || 'Home'),
        wrapClass: cur !== null ? 'logged-in' : '',
        home: cur !== null ? 'my' : 'index',
        auth: cur !== null ? 'true' : 'false',
        rightNav: rightNav(ctx),
        flash: flashHtml(ctx),
        ver: CFG.assetVersion
    });
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
    return WB.tail.replace('<!--Bootstrap Footer React Component -->', (extra || '') + '<!--Bootstrap Footer React Component -->')
        + '<script src="assets/js/main.js?v=' + CFG.assetVersion + '"></script>\n</body>\n</html>';
}

const homeContent = WB.home;

function downPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>WallOfBricks is not ready yet</h1><p>Try again soon.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

function errorPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>Something broke</h1><p>Try again soon.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

function csrfBlockPage() {
    return '<!doctype html><html><head><title>WallOfBricks</title></head><body style=font-family:Helvetica,Arial,sans-serif;background:#e3e3e3><div style=text-align:center;margin-top:90px><h1>Request blocked</h1><p>That action did not pass the security check.</p><p><a href=/>Back to WallOfBricks</a></p></div></body></html>';
}

module.exports = { header, footer, homeContent, csrfField, downPage, errorPage, csrfBlockPage };
