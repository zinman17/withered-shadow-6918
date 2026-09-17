(function () {
    function loadImg(url) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('load failed')); };
            img.src = url;
        });
    }
    function cropToCanvas(img, rect, w, h) {
        const sw = img.naturalWidth;
        const sh = img.naturalHeight;
        let x = Math.round(rect[0] * sw);
        let y = Math.round(rect[1] * sh);
        let cw = Math.round(rect[2] * sw);
        let ch = Math.round(rect[3] * sh);
        x = Math.max(0, Math.min(x, sw - 1));
        y = Math.max(0, Math.min(y, sh - 1));
        cw = Math.max(1, Math.min(cw, sw - x));
        ch = Math.max(1, Math.min(ch, sh - y));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, w, h);
        cx.drawImage(img, x, y, cw, ch, 0, 0, w, h);
        return cv;
    }
    const SHIRT = {
        torso: { rect: [0.125, 0.0, 0.25, 0.25], w: 128, h: 128 },
        armL: { rect: [0.25, 0.25, 0.125, 0.25], w: 64, h: 128 },
        armR: { rect: [0.75, 0.25, 0.125, 0.25], w: 64, h: 128 }
    };
    const PANTS = {
        legL: { rect: [0.25, 0.0, 0.125, 0.25], w: 64, h: 128 },
        legR: { rect: [0.75, 0.0, 0.125, 0.25], w: 64, h: 128 }
    };
    function fillSlots(root, url, defs, slots) {
        if (!url || url === '') { return Promise.resolve(false); }
        return loadImg(url).then(function (img) {
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                const def = defs[slot[0]];
                if (!def) { continue; }
                const holder = root.querySelectorAll(slot[1])[slot[2]];
                if (!holder) { continue; }
                const cv = cropToCanvas(img, def.rect, def.w, def.h);
                cv.className = 'FigClothImg';
                holder.innerHTML = '';
                holder.appendChild(cv);
            }
            return true;
        }).catch(function () {
            return false;
        });
    }
    const api = {
        cropToCanvas: cropToCanvas,
        loadImg: loadImg,
        SHIRT: SHIRT,
        PANTS: PANTS,
        fillSlots: fillSlots
    };
    window.wobCloth = api;
})();
