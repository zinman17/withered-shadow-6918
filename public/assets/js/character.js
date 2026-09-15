(function () {
    const selectors = ['.FigHead', '.FigTorso', '.FigArm', '.FigLeg'];
    selectors.forEach(function (sel) {
        const els = document.querySelectorAll(sel);
        for (let i = 0; i < els.length; i++) {
            const c = els[i].getAttribute('data-fill');
            if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) {
                els[i].style.backgroundColor = c;
            }
        }
    });
    const fig = document.getElementById('FigurePreview');
    if (!fig || !window.wobCloth) { return; }
    const shirt = (fig.getAttribute('data-shirt') || '').trim();
    const pants = (fig.getAttribute('data-pants') || '').trim();
    window.wobCloth.fillSlots(fig, shirt, window.wobCloth.SHIRT, [
        ['torso', '.FigTorso', 0],
        ['armR', '.FigArm', 0],
        ['armL', '.FigArm', 1]
    ]);
    window.wobCloth.fillSlots(fig, pants, window.wobCloth.PANTS, [
        ['legR', '.FigLeg', 0],
        ['legL', '.FigLeg', 1]
    ]);
})();
