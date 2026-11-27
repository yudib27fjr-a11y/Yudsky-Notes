// Yudsky Notes — agar aplikasi tetap bisa dibuka tanpa internet
// Aturan: coba ambil versi terbaru dari internet maksimal 2,5 detik.
// Kalau internet lambat/mati, langsung pakai salinan tersimpan (aplikasi tidak pernah macet di logo),
// sambil memperbarui salinan di belakang layar.
const CACHE = 'yudsky-notes-v38';
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
