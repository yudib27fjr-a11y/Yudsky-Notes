// Yudsky Notes — agar aplikasi tetap bisa dibuka tanpa internet
// Aturan: coba ambil versi terbaru dari internet maksimal 2,5 detik.
// Kalau internet lambat/mati, langsung pakai salinan tersimpan (aplikasi tidak pernah macet di logo),
// sambil memperbarui salinan di belakang layar.
const CACHE = 'yudsky-notes-v70';
const SHARE = 'yudsky-share';   // kotak masuk sementara untuk isi yang dibagikan dari aplikasi lain
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const WAIT = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}));  // memori penuh: tetap lanjut
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k)))).catch(() => {}));
  self.clients.claim();
});

const save = (req, res) => { try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); } catch {} };

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  // dibagikan dari aplikasi lain (menu Bagikan Android) -> simpan sementara, lalu buka aplikasi
  if (req.method === 'POST' && url.searchParams.has('share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('files').filter((f) => f && typeof f !== 'string' && f.size);
        const c = await caches.open(SHARE);
        const base = self.registration.scope + '__share/';
        for (const k of await c.keys()) await c.delete(k);
        await c.put(base + 'meta', new Response(JSON.stringify({ title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', at: Date.now(),
          files: files.map((f, i) => ({ i, name: f.name || ('file-' + i), type: f.type || 'application/octet-stream' })) })));
        for (let i = 0; i < files.length; i++) await c.put(base + 'f' + i, new Response(files[i]));
      } catch (err) {}
      return Response.redirect(self.registration.scope + '?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('.js') && url.pathname.includes('ekspor')) return; // selalu langsung dari internet
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true }).catch(() => null)
      || (req.mode === 'navigate' ? await caches.match('./index.html').catch(() => null) : null);
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res && res.ok) save(req, res); return res; });
    if (!cached) return net.catch(() => new Response('Tidak ada internet', { status: 503 }));
    // ada salinan: tunggu internet maksimal 2,5 detik, lalu pakai salinan
    const timer = new Promise((r) => setTimeout(() => r(cached), WAIT));
    try { const res = await Promise.race([net, timer]); return res && res.ok ? res : cached; }
    catch { return cached; }
  })());
});

// ===== pengingat jadwal jaga =====
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
const idbMeta = (mode, fn) => new Promise((res) => {
  try {
    const r = indexedDB.open('catatan-ios');
    r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('meta')) { db.close(); return res(null); } const t = db.transaction('meta', mode); const out = fn(t.objectStore('meta')); t.oncomplete = () => { db.close(); res(out && out.result); }; t.onerror = () => { db.close(); res(null); }; };
    r.onerror = () => res(null);
  } catch { res(null); }
});
async function jagaCheckSW() {
  const J = await idbMeta('readonly', (s) => s.get('jaga'));
  if (!J || !J.remind || !J.remind.on || !Array.isArray(J.shifts)) return;
  const sent = (await idbMeta('readonly', (s) => s.get('jagaNotif'))) || {}, now = Date.now(); let ch = false;
  const H = J.hours || {}; const DT = (t, date) => { const wd = date ? new Date(date + 'T12:00').getDay() : 1; return /malam|night/i.test(t) ? (H.malam || ['19:00', '07:00']) : /pagi/i.test(t) ? (H.pagi || ['07:00', '19:00']) : /24/.test(t) ? ['07:00', '07:00'] : (wd === 0 || wd === 6) ? (H.libur || ['07:00', '07:00']) : (H.biasa || ['16:00', '07:00']); };
  for (const s of J.shifts) {
    const [y, m, d] = String(s.date).split('-').map(Number); const [h, mi] = (s.start || DT(s.type, s.date)[0]).split(':').map(Number);
    const st = new Date(y, m - 1, d, h || 0, mi || 0).getTime(); if (!(st > now)) continue;
    const evs = [];
    if (J.remind.eve) { const e = new Date(st - 864e5); const [eh, em] = (J.remind.eveTime || '19:00').split(':').map(Number); e.setHours(eh, em || 0, 0, 0); evs.push(['eve', e.getTime(), 'Besok jaga']); }
    if (J.remind.pre) evs.push(['pre', st - J.remind.pre * 6e4, 'Jaga ' + (J.remind.pre % 60 === 0 ? J.remind.pre / 60 + ' jam' : J.remind.pre + ' menit') + ' lagi']);
    for (const [k, at, t] of evs) {
      const id = s.id + ':' + s.date + ':' + k;
      if (now >= at && now < st && !sent[id]) {
        sent[id] = now; ch = true;
        const tgl = new Date(st).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
        await self.registration.showNotification('🔔 ' + t, { body: tgl + ' · ' + s.type + ' ' + (s.start || DT(s.type, s.date)[0]).replace(':', '.') + (s.place ? ' · ' + s.place : ''), tag: id, icon: 'icon-192.png', data: { url: './?jaga=1' } });
      }
    }
  }
  if (ch) await idbMeta('readwrite', (s) => s.put(sent, 'jagaNotif'));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'jaga') e.waitUntil(jagaCheckSW()); });
