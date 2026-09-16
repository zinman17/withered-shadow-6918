(function () {
    var menu = document.getElementById('header-menu-icon');
    var nav = document.getElementById('navigation-container');
    if (menu && nav) {
        menu.addEventListener('click', function () {
            nav.className = nav.className === 'light-theme nav-open' ? 'light-theme' : 'light-theme nav-open';
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
})();
