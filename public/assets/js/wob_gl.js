(function () {
    function sh(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s) || 'shader failed');
        }
        return s;
    }

    const VS = [
        'attribute vec3 aPos;',
        'attribute vec3 aNor;',
        'attribute vec4 aCol;',
        'attribute vec2 aUv;',
        'uniform mat4 uCam;',
        'uniform mat4 uModel;',
        'varying vec3 vNor;',
        'varying vec4 vCol;',
        'varying vec2 vUv;',
        'void main() {',
        '    vec4 wp = uModel * vec4(aPos, 1.0);',
        '    gl_Position = uCam * wp;',
        '    vNor = normalize(mat3(uModel) * aNor);',
        '    vCol = aCol;',
        '    vUv = aUv;',
        '}'
    ].join('\n');

    const FS = [
        'precision mediump float;',
        'varying vec3 vNor;',
        'varying vec4 vCol;',
        'varying vec2 vUv;',
        'uniform vec3 uSun;',
        'uniform vec4 uColor;',
        'uniform float uStuds;',
        'uniform float uSpawn;',
        'uniform float uMode;',
        'uniform float uUseTex;',
        'uniform float uAlpha;',
        'uniform sampler2D uTex;',
        'void main() {',
        '    if (uMode > 0.5) {',
        '        vec4 t = texture2D(uTex, vUv);',
        '        gl_FragColor = vec4(t.rgb, t.a * uAlpha);',
        '        return;',
        '    }',
        '    vec4 base = vCol * uColor;',
        '    float lam = max(dot(normalize(vNor), uSun), 0.0);',
        '    float light = 0.62 + 0.45 * lam;',
        '    vec3 c = base.rgb * light;',
        '    if (uStuds > 0.5) {',
        '        vec2 f = fract(vUv);',
        '        float d = distance(f, vec2(0.5));',
        '        float ring = smoothstep(0.20, 0.24, d) - smoothstep(0.30, 0.34, d);',
        '        c *= 1.0 - 0.16 * ring;',
        '    }',
        '    if (uSpawn > 0.5) {',
        '        float r = distance(vUv, vec2(0.5));',
        '        float disc = smoothstep(0.30, 0.34, r) - smoothstep(0.44, 0.48, r);',
        '        c = mix(c, c * 0.55, disc * step(0.5, vNor.y));',
        '    }',
        '    gl_FragColor = vec4(c, base.a * uAlpha);',
        '}'
    ].join('\n');

    const LVS = [
        'attribute vec3 aPos;',
        'attribute vec3 aCol;',
        'uniform mat4 uCam;',
        'varying vec3 vCol;',
        'void main() {',
        '    gl_Position = uCam * vec4(aPos, 1.0);',
        '    vCol = aCol;',
        '}'
    ].join('\n');

    const LFS = [
        'precision mediump float;',
        'varying vec3 vCol;',
        'void main() {',
        '    gl_FragColor = vec4(vCol, 1.0);',
        '}'
    ].join('\n');

    function boot(canvas) {
        const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl', { antialias: true });
        if (!gl) {
            throw new Error('no webgl');
        }
        const pm = gl.createProgram();
        gl.attachShader(pm, sh(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(pm, sh(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(pm);
        if (!gl.getProgramParameter(pm, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(pm) || 'link failed');
        }
        const pl = gl.createProgram();
        gl.attachShader(pl, sh(gl, gl.VERTEX_SHADER, LVS));
        gl.attachShader(pl, sh(gl, gl.FRAGMENT_SHADER, LFS));
        gl.linkProgram(pl);
        if (!gl.getProgramParameter(pl, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(pl) || 'link failed');
        }
        const A = {
            pos: gl.getAttribLocation(pm, 'aPos'),
            nor: gl.getAttribLocation(pm, 'aNor'),
            col: gl.getAttribLocation(pm, 'aCol'),
            uv: gl.getAttribLocation(pm, 'aUv')
        };
        const U = {
            cam: gl.getUniformLocation(pm, 'uCam'),
            model: gl.getUniformLocation(pm, 'uModel'),
            sun: gl.getUniformLocation(pm, 'uSun'),
            color: gl.getUniformLocation(pm, 'uColor'),
            studs: gl.getUniformLocation(pm, 'uStuds'),
            spawn: gl.getUniformLocation(pm, 'uSpawn'),
            mode: gl.getUniformLocation(pm, 'uMode'),
            useTex: gl.getUniformLocation(pm, 'uUseTex'),
            alpha: gl.getUniformLocation(pm, 'uAlpha'),
            tex: gl.getUniformLocation(pm, 'uTex')
        };
        const LA = { pos: gl.getAttribLocation(pl, 'aPos'), col: gl.getAttribLocation(pl, 'aCol') };
        const LU = { cam: gl.getUniformLocation(pl, 'uCam') };
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.43, 0.65, 0.93, 1);
        const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const SUN = new Float32Array([0.4472, 0.8944, 0.2236]);

        function upload(arr, stride) {
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
            return { buf: buf, n: arr.length, stride: stride || 12 };
        }

        function free(m) {
            if (m) {
                gl.deleteBuffer(m.buf);
            }
        }

        function update(m, arr) {
            gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
            gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
            m.n = arr.length;
        }

        function drawMesh(m, o) {
            if (!m || m.n < 1) {
                return;
            }
            const stride = m.stride * 4;
            gl.useProgram(pm);
            gl.uniformMatrix4fv(U.cam, false, o.cam);
            gl.uniformMatrix4fv(U.model, false, o.model || ID);
            gl.uniform3fv(U.sun, SUN);
            gl.uniform4fv(U.color, o.color || [1, 1, 1, 1]);
            gl.uniform1f(U.studs, o.studs ? 1 : 0);
            gl.uniform1f(U.spawn, o.spawn ? 1 : 0);
            gl.uniform1f(U.mode, o.sky ? 1 : 0);
            gl.uniform1f(U.useTex, o.tex ? 1 : 0);
            gl.uniform1f(U.alpha, o.alpha === undefined ? 1 : o.alpha);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, o.tex || null);
            gl.uniform1i(U.tex, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
            gl.enableVertexAttribArray(A.pos);
            gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, stride, 0);
            if (m.stride === 12) {
                gl.enableVertexAttribArray(A.nor);
                gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, stride, 12);
                gl.enableVertexAttribArray(A.col);
                gl.vertexAttribPointer(A.col, 4, gl.FLOAT, false, stride, 24);
                gl.enableVertexAttribArray(A.uv);
                gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, stride, 40);
            } else if (m.stride === 6) {
                gl.enableVertexAttribArray(A.nor);
                gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, stride, 12);
                gl.disableVertexAttribArray(A.col);
                gl.vertexAttrib4f(A.col, o.color ? o.color[0] : 1, o.color ? o.color[1] : 1, o.color ? o.color[2] : 1, o.color ? o.color[3] : 1);
                gl.disableVertexAttribArray(A.uv);
                gl.vertexAttrib2f(A.uv, 0, 0);
            } else {
                gl.disableVertexAttribArray(A.nor);
                gl.vertexAttrib3f(A.nor, 0, 1, 0);
                gl.disableVertexAttribArray(A.col);
                gl.vertexAttrib4f(A.col, o.color ? o.color[0] : 1, o.color ? o.color[1] : 1, o.color ? o.color[2] : 1, o.color ? o.color[3] : 1);
                gl.enableVertexAttribArray(A.uv);
                gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, stride, 12);
            }
            if (o.blend) {
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.depthMask(false);
            }
            gl.drawArrays(gl.TRIANGLES, 0, m.n / m.stride);
            if (o.blend) {
                gl.depthMask(true);
                gl.disable(gl.BLEND);
            }
        }

        function drawLines(m, cam) {
            if (!m || m.n < 1) {
                return;
            }
            gl.useProgram(pl);
            gl.uniformMatrix4fv(LU.cam, false, cam);
            gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
            gl.enableVertexAttribArray(LA.pos);
            gl.vertexAttribPointer(LA.pos, 3, gl.FLOAT, false, 24, 0);
            gl.enableVertexAttribArray(LA.col);
            gl.vertexAttribPointer(LA.col, 3, gl.FLOAT, false, 24, 12);
            gl.drawArrays(gl.LINES, 0, m.n / 6);
        }

        function texFromImage(img) {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            return t;
        }

        function begin(w, h) {
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        return { gl: gl, upload: upload, update: update, free: free, drawMesh: drawMesh, drawLines: drawLines, texFromImage: texFromImage, begin: begin };
    }

    window.WobGL = { boot: boot };
})();
