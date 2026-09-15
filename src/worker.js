import { dispatch } from './app.js';
import { errorPage } from './layout.js';

function d1Adapter(d1) {
    return {
        async get(sql, params) {
            return await d1.prepare(sql).bind.apply(d1.prepare(sql), params || []).first();
        },
        async all(sql, params) {
            const r = await d1.prepare(sql).bind.apply(d1.prepare(sql), params || []).all();
            return r.results;
        },
        async run(sql, params) {
            const r = await d1.prepare(sql).bind.apply(d1.prepare(sql), params || []).run();
            return { changes: r.meta ? r.meta.changes : 0 };
        },
        async batch(stmts) {
            const bound = stmts.map(function (s) {
                const st = d1.prepare(s.sql);
                return st.bind.apply(st, s.params || []);
            });
            const results = await d1.batch(bound);
            return results.map(function (r) { return { changes: r.meta ? r.meta.changes : 0 }; });
        }
    };
}

export default {
    async fetch(request, env) {
        try {
            const db = d1Adapter(env.DB);
            env.trustedProxy = true;
            return await dispatch(request, env, db);
        } catch (err) {
            console.error('worker error: ' + (err && err.stack ? err.stack : String(err)));
            return new Response(errorPage(), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
        }
    }
};
