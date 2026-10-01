// randesherkulesom.com: statické stránky + malé API na prihlášky (D1).
const SLOTS = 13;
const APEX = 'randesherkulesom.com';

const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

function withHeaders(res, extra = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SEC_HEADERS, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// zahodí riadiace znaky, zlúči medzery, oreže na max dĺžku
const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function pocet(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM prihlasky').first();
  return r?.n ?? 0;
}

const volne = (n) => Math.max(1, SLOTS - n);

async function stav(env) {
  const n = await pocet(env);
  return json({ pocet: n, volne: volne(n), spolu: SLOTS });
}

async function prihlaska(request, env) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, chyba: 'Nepovolený pôvod.' }, 403);
  }
  const raw = await request.text();
  if (raw.length > 5000) return json({ ok: false, chyba: 'Príliš dlhá správa.' }, 413);

  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return json({ ok: false, chyba: 'Neplatné údaje.' }, 400);
  }
  if (!d || typeof d !== 'object') return json({ ok: false, chyba: 'Neplatné údaje.' }, 400);

  // honeypot: boti vyplnia skryté pole, tvárime sa, že sa podarilo
  if (clean(d.web, 200)) return json({ ok: true });

  const meno = clean(d.meno, 60);
  const kontakt = clean(d.kontakt, 80);
  const termin = clean(d.termin, 60);
  const rande = clean(d.rande, 300);
  const sprava = clean(d.odkaz, 300);

  if (meno.length < 2) return json({ ok: false, chyba: 'Napíš aspoň svoje meno.' }, 400);
  if (kontakt.length < 3) return json({ ok: false, chyba: 'Potrebujeme Instagram alebo telefón, aby sa ti Herkules mohol ozvať.' }, 400);

  // ochrana pred záplavou: max 30 prihlášok za 10 minút
  const rec = await env.DB.prepare("SELECT COUNT(*) AS n FROM prihlasky WHERE created_at > datetime('now','-10 minutes')").first();
  if ((rec?.n ?? 0) >= 30) return json({ ok: false, chyba: 'Teraz je to tu rušné, skús to o chvíľu.' }, 429);

  // ten istý kontakt dvakrát nezapisujeme, ale ženu to nemá trápiť
  const dup = await env.DB.prepare('SELECT id FROM prihlasky WHERE lower(kontakt) = lower(?)').bind(kontakt).first();
  if (!dup) {
    const ua = clean(request.headers.get('user-agent'), 200);
    await env.DB.prepare('INSERT INTO prihlasky (meno, kontakt, termin, rande, sprava, ua) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(meno, kontakt, termin, rande, sprava, ua)
      .run();
  }
  const n = await pocet(env);
  return json({ ok: true, pocet: n, volne: volne(n), spolu: SLOTS });
}

async function olymp(url, env) {
  const kluc = url.searchParams.get('kluc') || '';
  const ok = env.ADMIN_KEY && kluc && (await safeEqual(kluc, env.ADMIN_KEY));
  const hdr = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
  };
  if (!ok) {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>403</title><p>Sem sa bez Herkulovho kľúča nedostaneš.</p>', {
      status: 403,
      headers: hdr,
    });
  }
  const { results } = await env.DB.prepare('SELECT id, created_at, meno, kontakt, termin, rande, sprava FROM prihlasky ORDER BY id DESC').all();
  const rows = (results || [])
    .map(
      (r) =>
        `<tr><td>${esc(r.id)}</td><td>${esc(r.created_at)}</td><td>${esc(r.meno)}</td><td>${esc(r.kontakt)}</td><td>${esc(r.termin)}</td><td>${esc(r.rande)}</td><td>${esc(r.sprava)}</td></tr>`
    )
    .join('');
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Olymp</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#F6EFE6;color:#2a1217;margin:0;padding:24px}h1{font-family:Georgia,serif;font-style:italic;color:#740B1D;margin:0 0 4px}p{margin:0 0 16px}.w{overflow-x:auto}table{border-collapse:collapse;min-width:100%;background:#fff}th,td{border:1px solid #E8D3B5;padding:8px 10px;text-align:left;vertical-align:top}th{background:#740B1D;color:#F6EFE6;white-space:nowrap}</style></head>
<body><h1>Olymp</h1><p>Prihlášky: <b>${(results || []).length}</b>. Len pre Dominika. Po akcii sa všetko maže.</p>
<div class="w"><table><thead><tr><th>#</th><th>Kedy (UTC)</th><th>Meno</th><th>Kontakt</th><th>Termín</th><th>Kam na rande</th><th>Odkaz</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Zatiaľ nikto. Herkules trpezlivo čaká.</td></tr>'}</tbody></table></div></body></html>`;
  return new Response(html, { headers: hdr });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // www presmerujeme na hlavnú doménu
    if (url.hostname === 'www.' + APEX) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }

    try {
      if (url.pathname === '/api/stav' && request.method === 'GET') return withHeaders(await stav(env));
      if (url.pathname === '/api/prihlaska') {
        if (request.method !== 'POST') return withHeaders(json({ ok: false, chyba: 'Len POST.' }, 405), { allow: 'POST' });
        return withHeaders(await prihlaska(request, env));
      }
      if (url.pathname === '/olymp') return withHeaders(await olymp(url, env));
    } catch (e) {
      console.error('chyba', e && e.message);
      return withHeaders(json({ ok: false, chyba: 'Niečo sa pokazilo na našej strane. Skús to znova.' }, 500));
    }

    return withHeaders(await env.ASSETS.fetch(request));
  },
};
