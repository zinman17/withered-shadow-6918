(function () {
    var menu = document.getElementById('header-menu-icon');
    var nav = document.getElementById('navigation-container');
    if (menu && nav) {
        menu.addEventListener('click', function () {
            var open = nav.className.indexOf('nav-open') !== -1;
            nav.className = open ? 'dark-theme gotham-font' : 'dark-theme gotham-font nav-open';
        });
    }
    var blurb = document.getElementById('blurb');
    var count = document.getElementById('blurb-count');
    if (blurb && count) {
        var max = parseInt(count.textContent, 10) + blurb.value.length;
        var upd = function () {
            count.textContent = String(Math.max(0, max - blurb.value.length));
        };
        blurb.addEventListener('input', upd);
        upd();
    }
    var forms = document.getElementsByTagName('form');
    for (var i = 0; i < forms.length; i++) {
        forms[i].addEventListener('submit', function () {
            var b = this.querySelector('button[type=submit]');
            if (b) {
                var f = this;
                setTimeout(function () {
                    if (!f.querySelector('.in:invalid')) {
                        b.disabled = true;
                    }
                }, 0);
            }
        });
    }

    var fc = document.getElementById('footer-container');
    if (fc && fc.children.length === 0) {
        var links = [
            ['news', 'About Us'],
            ['forum', 'Jobs'],
            ['news', 'Blog'],
            ['forum', 'Parents'],
            ['forum', 'Help'],
            ['news', 'Terms'],
            ['news', 'Privacy'],
            ['forum', 'Accessibility']
        ];
        var cell = '';
        for (var j = 0; j < links.length; j++) {
            cell += '<div class="footer-link footer-link-wide col-xs-3"><a class="text-footer-nav" href="' + links[j][0] + '">' + links[j][1] + '</a></div>';
        }
        fc.innerHTML = '<div class="container"><div class="row"><div class="col-md-12 footer">'
            + '<div class="row"><div class="col-md-10 col-md-offset-2"><div class="row footer-links">' + cell + '</div></div></div>'
            + '<div class="row"><div class="col-md-10 col-md-offset-2 copyright-container"><p class="text-footer caption footer-note">\u00a92026 WallOfBricks</p></div></div>'
            + '</div></div></div>';
    }

    var cookie = document.querySelector('.alert-cookie-notice');
    if (cookie) {
        var killCookie = function () {
            cookie.style.display = 'none';
        };
        var x = cookie.querySelector('.cookie-law-notice-dismiss');
        if (x) {
            x.addEventListener('click', killCookie);
        }
        setTimeout(killCookie, 20000);
    }

    var home = document.getElementById('HomeContainer');
    if (home) {
        fetch('api_home', { credentials: 'same-origin' }).then(function (r) {
            if (!r.ok) {
                throw new Error('bad');
            }
            return r.json();
        }).then(function (d) {
            var eh = function (s) {
                return String(s).replace(/[&<>"']/g, function (c) {
                    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
                });
            };
            var hh = document.getElementById('home-header');
            if (hh && d.user) {
                hh.innerHTML = '<div class="home-header"><span class="avatar-container avatar-card-full"><img class="avatar-card-image" src="assets/img/favicon.png" alt=""></span><h1 class="home-header-username font-header-2">Hello, ' + eh(d.user) + '!</h1></div>';
            }
            var pl = document.getElementById('people-list-container');
            if (pl && d.user && d.friends && d.friends.length > 0) {
                var fitems = '';
                for (var k = 0; k < d.friends.length; k++) {
                    var fn = eh(d.friends[k].name);
                    fitems += '<li class="friend"><a class="friend-link" href="profile?u=' + encodeURIComponent(fn) + '"><span class="avatar-container"><img class="avatar-card-image" src="assets/img/favicon.png" alt=""></span><div class="friend-name">' + fn + '</div></a></li>';
                }
                pl.innerHTML = '<div class="people-list-header container-header"><h3>Friends <span class="friends-count font-caption">(' + d.friends.length + ')</span></h3></div>'
                    + '<ul class="people-list clearfix">' + fitems + '</ul>';
            }
            var gl = document.getElementById('place-list');
            if (gl && d.games && d.games.length > 0) {
                var gitems = '';
                for (var m = 0; m < d.games.length; m++) {
                    var g = d.games[m];
                    gitems += '<li class="game-card-container"><div class="game-card"><a class="game-card-link" href="game?id=' + g.id + '">'
                        + '<div class="game-card-thumb-container"><img class="game-card-thumb" src="' + eh(g.thumb) + '" alt="' + eh(g.name) + '"></div>'
                        + '<div class="game-card-name-info"><div class="game-card-name" title="' + eh(g.name) + '">' + eh(g.name) + '</div>'
                        + '<div class="game-card-info"><span class="playing-counts-label">' + eh(g.plays) + ' playing</span></div>'
                        + '</div></a></div></li>';
                }
                gl.innerHTML = '<div class="container-header"><h3>Recommended For You</h3></div>'
                    + '<ul class="game-cards clearfix">' + gitems + '</ul>';
            }
        }).catch(function () {});
    }
})();
