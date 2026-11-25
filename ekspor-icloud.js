// Ekspor semua catatan Apple Notes (iCloud) ke file cadangan Yudsky Notes.
// Jalankan di Terminal Mac:
//   curl -sL https://yudib27fjr-a11y.github.io/Yudsky-Notes/ekspor-icloud.js -o /tmp/yn.js && osascript -l JavaScript /tmp/yn.js
// Hasil: folder "Yudsky iCloud" di Desktop berisi yudsky-icloud-1.json, -2.json, … (masing-masing maks ±40 MB). Kirim ke HP Android, lalu di Yudsky Notes: ⋯ → Pulihkan dari File.
ObjC.import('Foundation');

const app = Application.currentApplication(); app.includeStandardAdditions = true;
const Notes = Application('Notes');
const SKIP_FOLDERS = ['Recently Deleted', 'Baru Dihapus', 'Nylig slettet'];
const tmpDir = $.NSTemporaryDirectory().js + 'yudsky-att-' + Date.now();
$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(tmpDir, true, $(), null);

function b64(path) {
  const d = $.NSData.dataWithContentsOfFile(path);
  return d.isNil() ? null : d.base64EncodedStringWithOptions(0).js;
}
function mimeOf(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
    mov: 'video/quicktime', mp4: 'video/mp4', m4a: 'audio/mp4', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', txt: 'text/plain' })[e] || 'application/octet-stream';
}

const folders = {}, notes = [], files = []; // notes[i].files = lampiran milik catatan itu
let total = 0, locked = 0, attOk = 0, attFail = 0;
const all = Notes.notes();
console.log('Ditemukan ' + all.length + ' catatan. Mengekspor…');

for (let i = 0; i < all.length; i++) {
  const n = all[i];
  try {
    let folder = 'Catatan';
    try { folder = n.container().name(); } catch (e) {}
    if (SKIP_FOLDERS.indexOf(folder) >= 0) continue;
    if (n.passwordProtected()) { locked++; continue; }
    const id = 'icl-' + String(n.id()).replace(/[^a-zA-Z0-9]/g, '').slice(-24);
    let html = n.body();
    const hasInlineImg = /<img[^>]+src="data:image/i.test(html);
    // lampiran (foto/file) yang tidak ikut di isi catatan
    const extra = [], noteFiles = [];
    let atts = [];
    try { atts = n.attachments(); } catch (e) {}
    for (let k = 0; k < atts.length; k++) {
      const a = atts[k];
      let name = 'Lampiran';
      try { name = a.name() || name; } catch (e) {}
      const mime = mimeOf(name);
      if (hasInlineImg && mime.indexOf('image/') === 0) continue; // foto sudah ada di isi catatan
      const path = tmpDir + '/' + i + '-' + k + '-' + name.replace(/[\/:]/g, '_');
      try {
        Notes.save(a, { in: Path(path) });
        const data = b64(path);
        if (!data) { attFail++; continue; }
        const fid = 'a' + id.slice(-10) + k;
        noteFiles.push({ id: fid, name: name, type: mime, size: Math.round(data.length * 0.75), data: 'data:' + mime + ';base64,' + data });
        extra.push({ fid: fid, name: name, type: mime });
        attOk++;
      } catch (e) { attFail++; }
    }
    folders[folder] = true;
    notes.push({ id: id, folder: folder, html: html, extra: extra, _files: noteFiles,
      createdAt: n.creationDate().getTime(), updatedAt: n.modificationDate().getTime() });
    total++;
    if (total % 20 === 0) console.log('  ' + total + ' catatan…');
  } catch (e) { console.log('  dilewati 1 catatan: ' + e); }
}

// pecah jadi beberapa file supaya ringan dibuka di HP
const LIMIT = 40 * 1048576;
const dir = app.pathTo('desktop').toString() + '/Yudsky iCloud';
$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, $(), null);
const parts = []; let cur = { notes: [], files: [] }, size = 0;
for (const n of notes) {
  const nf = n._files; delete n._files;
  const sz = n.html.length + nf.reduce((t, f) => t + f.data.length, 0);
  if (cur.notes.length && size + sz > LIMIT) { parts.push(cur); cur = { notes: [], files: [] }; size = 0; }
  cur.notes.push(n); cur.files.push(...nf); size += sz;
}
if (cur.notes.length) parts.push(cur);
let totalMB = 0;
parts.forEach((p, k) => {
  const out = JSON.stringify({ app: 'icloud-export', v: 1, at: Date.now(), part: k + 1, of: parts.length, folders: Object.keys(folders), notes: p.notes, files: p.files });
  totalMB += out.length / 1048576;
  $.NSString.alloc.initWithUTF8String(out).writeToFileAtomicallyEncodingError(dir + '/yudsky-icloud-' + (k + 1) + '.json', true, $.NSUTF8StringEncoding, null);
});
const msg = 'Selesai: ' + total + ' catatan, ' + attOk + ' lampiran' + (attFail ? ' (' + attFail + ' lampiran gagal)' : '') + (locked ? ', ' + locked + ' catatan terkunci dilewati' : '') +
  '.\nDesktop/Yudsky iCloud: ' + parts.length + ' file (' + totalMB.toFixed(0) + ' MB total).';
console.log(msg);
app.doShellScript('open ' + JSON.stringify(dir));
app.displayDialog(msg + '\n\nKirim semua file di folder itu ke HP Android, lalu di Yudsky Notes: ⋯ → Impor dari iCloud (Mac) → pilih semua file sekaligus.', { buttons: ['OK'], defaultButton: 'OK', withTitle: 'Yudsky Notes' });
