// Ekspor semua catatan Apple Notes (iCloud) ke file cadangan Yudsky Notes.
// Jalankan di Terminal Mac:
//   curl -sL https://yudib27fjr-a11y.github.io/Yudsky-Notes/ekspor-icloud.js -o /tmp/yn.js && osascript -l JavaScript /tmp/yn.js
// Hasil: file "yudsky-icloud.json" di Desktop. Kirim ke HP Android, lalu di Yudsky Notes: ⋯ → Pulihkan dari File.
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

const folders = {}, notes = [], files = [];
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
    const extra = [];
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
        files.push({ id: fid, name: name, type: mime, size: Math.round(data.length * 0.75), data: 'data:' + mime + ';base64,' + data });
        extra.push({ fid: fid, name: name, type: mime });
        attOk++;
      } catch (e) { attFail++; }
    }
    folders[folder] = true;
    notes.push({ id: id, folder: folder, html: html, extra: extra,
      createdAt: n.creationDate().getTime(), updatedAt: n.modificationDate().getTime() });
    total++;
    if (total % 20 === 0) console.log('  ' + total + ' catatan…');
  } catch (e) { console.log('  dilewati 1 catatan: ' + e); }
}

const out = JSON.stringify({ app: 'icloud-export', v: 1, at: Date.now(), folders: Object.keys(folders), notes: notes, files: files });
const dest = app.pathTo('desktop').toString() + '/yudsky-icloud.json';
$.NSString.alloc.initWithUTF8String(out).writeToFileAtomicallyEncodingError(dest, true, $.NSUTF8StringEncoding, null);
const msg = 'Selesai: ' + total + ' catatan, ' + attOk + ' lampiran' + (attFail ? ' (' + attFail + ' lampiran gagal)' : '') + (locked ? ', ' + locked + ' catatan terkunci dilewati' : '') +
  '.\nFile: Desktop/yudsky-icloud.json (' + (out.length / 1048576).toFixed(1) + ' MB)';
console.log(msg);
app.displayDialog(msg + '\n\nKirim file ini ke HP Android, lalu di Yudsky Notes: ⋯ → Pulihkan dari File.', { buttons: ['OK'], defaultButton: 'OK', withTitle: 'Yudsky Notes' });
