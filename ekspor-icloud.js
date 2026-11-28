// Ekspor catatan Apple Notes (iCloud) ke file cadangan Yudsky Notes — versi hemat ruang.
// Jalankan di Terminal Mac:
//   curl -sL https://yudib27fjr-a11y.github.io/Yudsky-Notes/ekspor-icloud.js -o /tmp/yn.js && osascript -l JavaScript /tmp/yn.js
// Bisa pilih folder, pilih isi (lengkap / tanpa video besar / teks saja), dan pilih tujuan (Desktop atau flashdisk).
// Hasil: yudsky-icloud-N.json (maks ±40 MB per file; foto di dalam catatan dipisah jadi lampiran, catatan besar boleh terbagi ke beberapa file). Kirim ke HP Android, lalu di Yudsky Notes: Pengaturan → Impor dari iCloud (Mac).
ObjC.import('Foundation');

const app = Application.currentApplication(); app.includeStandardAdditions = true;
const Notes = Application('Notes');
const FM = $.NSFileManager.defaultManager;
const SKIP_FOLDERS = ['Recently Deleted', 'Baru Dihapus', 'Nylig slettet'];
const TITLE = 'Yudsky Notes — Ekspor iCloud';

function freeGB(path) {
  try { const a = FM.attributesOfFileSystemForPathError(path, null); return Number(ObjC.unwrap(a.objectForKey('NSFileSystemFreeSize'))) / 1073741824; } catch (e) { return -1; }
}
function b64(path) { const d = $.NSData.dataWithContentsOfFile(path); return d.isNil() ? null : d.base64EncodedStringWithOptions(0).js; }
function fsize(path) { try { return Number(ObjC.unwrap(FM.attributesOfItemAtPathError(path, null).objectForKey('NSFileSize'))); } catch (e) { return 0; } }
function rm(path) { try { FM.removeItemAtPathError(path, null); } catch (e) {} }
function mimeOf(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
    mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', m4a: 'audio/mp4', mp3: 'audio/mpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain' })[e] || 'application/octet-stream';
}

// ---------- 1. folder ----------
console.log('Membaca daftar folder…');
const fObjs = Notes.folders(), fList = [];
for (let i = 0; i < fObjs.length; i++) {
  try { const nm = fObjs[i].name(); if (SKIP_FOLDERS.indexOf(nm) >= 0) continue; const c = fObjs[i].notes.length; if (c) fList.push({ i, nm, c, label: nm + '  (' + c + ')' }); } catch (e) {}
}
let allCount = 0; try { allCount = Notes.notes.length; } catch (e) {}
const ALL = '★ SEMUA catatan (' + allCount + ')';
const free0 = freeGB('/');
const pickF = app.chooseFromList([ALL, ...fList.map((f) => f.label)], {
  withTitle: TITLE, withPrompt: 'Sisa ruang Mac: ' + (free0 >= 0 ? free0.toFixed(1) + ' GB' : '?') + '\n\nPilih folder yang mau diekspor (tahan ⌘ untuk pilih beberapa).\nTips: kalau ruang sempit, ekspor beberapa folder dulu, kirim ke HP, hapus hasilnya, lalu lanjut folder berikutnya.',
  multipleSelectionsAllowed: true, defaultItems: [ALL], okButtonName: 'Lanjut', cancelButtonName: 'Batal',
});
if (!pickF) throw new Error('Dibatalkan');
const useAll = pickF.indexOf(ALL) >= 0;
const chosen = useAll ? [{ i: -1, nm: '', c: allCount }] : fList.filter((f) => pickF.indexOf(f.label) >= 0);

// ---------- 2. isi ----------
const MODES = ['Teks + foto + file kecil (lewati video & file > 15 MB) — disarankan', 'Lengkap: semua lampiran termasuk video (paling besar)', 'Teks saja, tanpa foto & lampiran (paling hemat)'];
const pickM = app.chooseFromList(MODES, { withTitle: TITLE, withPrompt: 'Apa saja yang diekspor?', defaultItems: [MODES[free0 >= 0 && free0 < 3 ? 2 : 0]], okButtonName: 'Lanjut', cancelButtonName: 'Batal' });
if (!pickM) throw new Error('Dibatalkan');
const mode = MODES.indexOf(pickM[0]); // 0 hemat, 1 lengkap, 2 teks
const MAXATT = mode === 0 ? 15 * 1048576 : 30 * 1048576; // file > 30 MB tidak muat di memori skrip -> dilewati (dicatat)

// ---------- 3. tujuan ----------
const DEST = ['Desktop (folder “Yudsky iCloud”)', 'Pilih folder lain… (mis. flashdisk / hard disk eksternal)'];
const pickD = app.chooseFromList(DEST, { withTitle: TITLE, withPrompt: 'Simpan hasil ekspor di mana?', defaultItems: [DEST[0]], okButtonName: 'Mulai Ekspor', cancelButtonName: 'Batal' });
if (!pickD) throw new Error('Dibatalkan');
let dir;
if (pickD[0] === DEST[0]) dir = app.pathTo('desktop').toString() + '/Yudsky iCloud';
else dir = app.chooseFolder({ withPrompt: 'Pilih folder tujuan (flashdisk akan muncul di samping kiri)' }).toString().replace(/\/$/, '') + '/Yudsky iCloud';
FM.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, $(), null);
const tmpDir = $.NSTemporaryDirectory().js + 'yudsky-att-' + Date.now();
FM.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(tmpDir, true, $(), null);

// ---------- 4. ekspor (ditulis per bagian, lampiran sementara langsung dihapus) ----------
const LIMIT = 40 * 1048576;
let cur = { notes: [], files: [] }, size = 0, part = 0, totalMB = 0;
let total = 0, locked = 0, attOk = 0, attFail = 0, attSkip = 0, stopped = '';
const folderNames = {};
// hapus file hasil lama supaya tidak tercampur
try { const old = FM.contentsOfDirectoryAtPathError(dir, null).js.map((x) => x.js); old.filter((x) => /^yudsky-icloud-\d+\.json$/.test(x)).forEach((x) => rm(dir + '/' + x)); } catch (e) {}
function flush(last) {
  if (!cur.notes.length && !cur.files.length) return;
  part++;
  const out = JSON.stringify({ app: 'icloud-export', v: 1, at: Date.now(), part, of: last ? part : 0, folders: Object.keys(folderNames), notes: cur.notes, files: cur.files });
  totalMB += out.length / 1048576;
  $.NSString.alloc.initWithUTF8String(out).writeToFileAtomicallyEncodingError(dir + '/yudsky-icloud-' + part + '.json', true, $.NSUTF8StringEncoding, null);
  console.log('  ✓ yudsky-icloud-' + part + '.json (' + (out.length / 1048576).toFixed(1) + ' MB)');
  cur = { notes: [], files: [] }; size = 0;
}
// lampiran ditulis lebih dulu; bila bagian penuh, bagian ditutup (catatan besar boleh terbagi ke beberapa file)
function pushFile(f) { if (size + f.data.length > LIMIT && (cur.notes.length || cur.files.length)) flush(false); cur.files.push(f); size += f.data.length; }
const bigSkipped = [];
outer:
for (const f of chosen) {
  console.log((f.i < 0 ? 'Semua catatan' : 'Folder ' + f.nm) + ' (' + f.c + ')…');
  let ns = [];
  try { ns = f.i < 0 ? Notes.notes() : fObjs[f.i].notes(); } catch (e) { continue; }
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    try {
      let fname = f.nm;
      if (f.i < 0) { fname = 'Catatan'; try { fname = n.container().name(); } catch (e) {} if (SKIP_FOLDERS.indexOf(fname) >= 0) continue; }
      if (n.passwordProtected()) { locked++; continue; }
      const id = 'icl-' + String(n.id()).replace(/[^a-zA-Z0-9]/g, '').slice(-24);
      let html = '', viaText = false;
      try { html = n.body(); } catch (e) {
        // catatan terlalu besar (biasanya banyak foto) -> ambil teksnya, foto diambil sebagai lampiran
        viaText = true; let t = ''; try { t = n.plaintext(); } catch (e2) {}
        html = t.split('\n').map((l) => '<div>' + (l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>') + '</div>').join('');
        console.log('  catatan besar diambil teks + lampirannya: ' + (t.split('\n')[0] || '').slice(0, 40));
      }
      if (mode === 2) html = html.replace(/<img[^>]*>/gi, '<div>[foto]</div>');
      // foto di dalam isi -> dipisah jadi lampiran sendiri supaya file tidak membengkak
      let pk = 0; const extra = [], noteFiles = [];
      html = html.replace(/<img([^>]*?)src="data:(image\/[a-zA-Z0-9.+-]+);base64,([^"]+)"([^>]*)>/g, (m, a1, mime, data, a2) => {
        const fid = 'p' + id.slice(-10) + (pk++);
        pushFile({ id: fid, name: 'Foto-' + pk + '.' + (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg'), type: mime, size: Math.round(data.length * 0.75), data: 'data:' + mime + ';base64,' + data });
        return '<img' + a1 + 'data-yfid="' + fid + '"' + a2 + '>';
      });
      const hasInlineImg = pk > 0 && !viaText;
      if (mode !== 2) {
        let atts = [];
        try { atts = n.attachments(); } catch (e) {}
        for (let k = 0; k < atts.length; k++) {
          const a = atts[k];
          let name = 'Lampiran';
          try { name = a.name() || name; } catch (e) {}
          const mime = mimeOf(name);
          if (hasInlineImg && mime.indexOf('image/') === 0) continue; // foto sudah ada di isi catatan
          if (mode === 0 && /^video\//.test(mime)) { attSkip++; continue; }
          const path = tmpDir + '/' + i + '-' + k + '-' + name.replace(/[\/:]/g, '_');
          try {
            Notes.save(a, { in: Path(path) });
            const sz = fsize(path);
            if (sz > MAXATT) { attSkip++; if (mode === 1) bigSkipped.push(name + ' (' + (sz / 1048576).toFixed(0) + ' MB)'); rm(path); continue; }
            const data = b64(path); rm(path); // file sementara langsung dihapus
            if (!data) { attFail++; continue; }
            const fid = 'a' + id.slice(-10) + k;
            pushFile({ id: fid, name, type: mime, size: Math.round(data.length * 0.75), data: 'data:' + mime + ';base64,' + data });
            extra.push({ fid, name, type: mime });
            attOk++;
          } catch (e) { attFail++; rm(path); }
        }
      }
      if ((cur.notes.length || cur.files.length) && size + html.length > LIMIT) flush(false);
      folderNames[fname] = true;
      cur.notes.push({ id, folder: fname, html, extra, createdAt: n.creationDate().getTime(), updatedAt: n.modificationDate().getTime() });
      size += html.length; total++; html = null;
      if (total % 20 === 0) {
        console.log('  ' + total + ' catatan…');
        const fr = freeGB(dir);
        if (fr >= 0 && fr < 0.3) { stopped = 'Ruang penyimpanan hampir habis (' + fr.toFixed(2) + ' GB) — ekspor dihentikan supaya Mac aman.'; break outer; }
      }
    } catch (e) { console.log('  dilewati 1 catatan: ' + e); }
  }
}
flush(true);
rm(tmpDir);
const msg = (stopped ? '⚠️ ' + stopped + '\n\n' : '') + 'Selesai: ' + total + ' catatan, ' + attOk + ' lampiran' +
  (attSkip ? ', ' + attSkip + ' video/file besar dilewati' : '') + (attFail ? ', ' + attFail + ' lampiran gagal' : '') + (locked ? ', ' + locked + ' catatan terkunci dilewati' : '') +
  '.\n' + part + ' file (' + totalMB.toFixed(0) + ' MB) di:\n' + dir + (bigSkipped.length ? '\n\nFile > 30 MB dilewati (simpan manual): ' + bigSkipped.slice(0, 8).join(', ') : '') + '\nSisa ruang sekarang: ' + freeGB(dir).toFixed(1) + ' GB';
console.log(msg);
app.doShellScript('open ' + JSON.stringify(dir));
app.displayDialog(msg + '\n\nKirim semua file di folder itu ke HP Android, lalu di Yudsky Notes: Pengaturan → Impor dari iCloud (Mac) → pilih semua file sekaligus.\nSetelah masuk ke HP, file di Mac boleh dihapus untuk mengosongkan ruang.', { buttons: ['OK'], defaultButton: 'OK', withTitle: 'Yudsky Notes' });
