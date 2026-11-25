<p align="center"><img src="icon-512.png" width="120" alt="Yudsky Notes"></p>

# Yudsky Notes

Aplikasi catatan ala iPhone Notes, untuk PPDS. Semua catatan tersimpan di ponsel (IndexedDB), tidak dikirim ke server mana pun.

**Buka:** https://yudib27fjr-a11y.github.io/Yudsky-Notes/ → Chrome ⋮ → *Instal aplikasi*. Pembaruan terpasang otomatis.

Cadangan: tombol ⋯ di halaman Folder → Unduh/Salin Cadangan.

## Impor dari iCloud (Apple Notes) lewat Mac

1. Di Mac, buka **Terminal** (Cmd+Spasi → ketik Terminal).
2. Tempel perintah ini lalu tekan Enter:

```
curl -sL https://yudib27fjr-a11y.github.io/Yudsky-Notes/ekspor-icloud.js -o /tmp/yn.js && osascript -l JavaScript /tmp/yn.js
```

3. Bila muncul izin *"Terminal ingin mengontrol Notes"*, pilih **OK / Izinkan**.
4. Tunggu sampai muncul pesan **Selesai**. File `yudsky-icloud.json` ada di **Desktop**.
5. Kirim file itu ke HP Android (WhatsApp ke diri sendiri, Google Drive, atau kabel).
6. Di Yudsky Notes: ⋯ (halaman Folder) → **Impor dari iCloud (Mac)** → **Pilih File**.

Folder, judul, tanggal, teks tebal/miring, daftar, tabel, foto, dan file (PDF dll.) ikut pindah. Catatan yang dikunci di iPhone dilewati. Impor bisa diulang kapan saja: catatan yang sudah ada tidak digandakan.
