/**
 * ARKA AI — Usage Guide knowledge
 *
 * Gives the agent something to teach with: when the user asks "cara pakai ARKA
 * gimana?" the model calls `get_usage_guide` instead of inventing commands.
 *
 * NOTE: the CLI keeps its own ANSI-formatted guide in `cli/bin/arka.js`
 * (`arka guide`) because the CLI is a single portable file with zero deps —
 * Termux copies only that file, so it cannot import from `server/`.
 * Keep the two in sync when commands change.
 */

export const GUIDE_TOPICS = [
  'mulai', 'upload', 'inbox', 'file', 'trash', 'prompt', 'search', 'ai', 'termux'
];

const GUIDE = {
  overview: {
    title: 'Ringkasan cara pakai ARKA',
    text: `ARKA = penyimpanan file pribadi + AI, 100% lewat terminal.
Alur harian: arka start -> arka upload <file> --inbox -> arka triage -> arka search / arka ask.
Perintah inti: arka (status), arka ls, arka upload, arka inbox, arka triage, arka move, arka search, arka ask, arka prompt ls, arka trash.
Semua perintah menerima ID angka atau nama file. Detail per topik: ${GUIDE_TOPICS.join(', ')} (panggil lagi tool ini dengan menyebut topik).`
  },

  mulai: {
    title: 'Menyalakan & menghentikan ARKA',
    text: `Sekali saja (Windows): arka install  (mendaftarkan perintah 'arka' ke user PATH; --dry-run untuk pratinjau), lalu buka terminal BARU.
Setiap akan dipakai: arka start  -> menyalakan ARKA Core di background, PID di storage/logs/server.pid, log di storage/logs/server.log
  - arka start --foreground (atau -f): server jalan di terminal ini, Ctrl+C untuk berhenti
  - arka start --port 5001: ganti port
Cek kondisi: arka  atau  arka status  (health + statistik + rincian storage)
Berhenti: arka stop  (hanya mematikan proses node pada port target)
Alamat API: arka config show | arka config set-url http://<IP>:5000/api
Alternatif lama: npm run server / node server/index.js.
Bila perintah lain gagal connect: jalankan arka start dulu.`
  },

  upload: {
    title: 'Meng-upload file',
    text: `arka upload                        -> buka picker file Windows (bisa multi-pilih)
arka upload "foto.jpg"             -> masuk ke root workspace
arka upload "catatan.txt" --inbox  -> masuk Inbox (belum dikelompokkan)
arka upload "C:\\Aset" --project "Website"          -> upload seluruh folder rekursif
arka upload a.png b.pdf --project "Instagram/Mockups"  -> folder tujuan dibuat otomatis
Catatan: struktur sub-folder lokal tidak ikut disimpan (hanya filenya), MIME type ditebak dari ekstensi, batas upload 500 MB per file.
Setelah upload, ARKA otomatis meminta AI membuat deskripsi + tag (lihat topik: ai).`
  },

  inbox: {
    title: 'Inbox & perapian (triage)',
    text: `arka inbox   -> daftar file yang belum masuk folder
arka triage  -> mode interaktif per file:
   Enter         = terima saran folder dari AI
   ketik nama/id = pindah ke folder itu (folder baru / path "A/B/C" dibuat otomatis)
   s             = lewati file ini
   q             = berhenti (yang sudah diproses tetap tersimpan)
arka move <file> <folder>  -> pindah manual
arka mkdir "Instagram/Mockups" -> buat folder bersarang`
  },

  file: {
    title: 'Melihat & mengambil file',
    text: `arka ls                -> struktur folder + jumlah file
arka ls Instagram      -> isi satu folder
arka info <id|nama>    -> metadata lengkap (ukuran, tipe, folder, hasil AI)
arka view <id|nama>    -> baca isi file teks/kode di terminal (menolak file biner, memotong teks > 512 KB)
arka download <id|nama>-> unduh ke folder aktif; tidak pernah menimpa (jadi "nama (1).ext")
arka mkdir "<path>"    -> buat folder
Setiap listing menampilkan [ID n] dan ID itu bisa dipakai di semua perintah yang butuh file.`
  },

  trash: {
    title: 'Sampah (trash)',
    text: `arka rm <id|nama>             -> pindah ke sampah (masih bisa dipulihkan)
arka rm <id|nama> --permanent -> hapus permanen (file fisik ikut terhapus)
arka restore <id|nama>        -> kembalikan dari sampah
arka trash                    -> lihat isi sampah
arka trash empty              -> kosongkan sampah permanen
Menghapus folder tidak menghapus file di dalamnya: file yang aman dipindah ke Inbox.`
  },

  prompt: {
    title: 'Prompt & knowledge hub',
    text: `arka prompt ls                               -> daftar prompt
arka prompt show <id>                        -> baca isi lengkap
arka prompt add "Judul" --content "isi" --category Tech --tags a,b
arka prompt edit <id> --content "versi baru" -> juga menerima --title/--category/--tags
arka prompt rm <id>                          -> hapus
Prompt ikut dicari oleh: arka search "kata"  dan  arka ask "prompt tentang ..."`
  },

  search: {
    title: 'Pencarian',
    text: `arka search "kata" -> mencari di nama file, deskripsi AI, tag, kategori, dan isi prompt.
Pencarian masih berbasis substring (SQL LIKE), bukan semantik; kata kunci pendek paling efektif.
Hasil "arka analyze" (deskripsi & tag) membuat file jauh lebih mudah dicari.`
  },

  ai: {
    title: 'Fitur AI (Groq + Gemini)',
    text: `arka ai-status             -> Groq/Gemini ONLINE atau OFFLINE (alasan ditampilkan, mis. API key invalid / model retired)
arka ask "<permintaan>"    -> agen bahasa alami. Tool miliknya: search_files, search_prompts, list_inbox,
                              get_workspace_stats, list_folders, get_usage_guide, answer.
                              Agen bersifat read-only: TIDAK bisa memindah/mengubah/menghapus file;
                              untuk aksi itu arahkan ke arka triage / arka move / arka rm.
                              Pertanyaan lanjutan ("yang lebih detail") diingat maks 10 menit;
                              arka ask --reset  -> lupa konteks, jawab dari nol.
arka analyze <id|nama>     -> analisis ulang 1 file (gambar/video/audio -> Gemini; teks/kode -> Groq)
Analisis otomatis berjalan saat upload; bila AI gagal, metadata tidak disimpan sebagai palsu.
API key dibaca dari .env di root project (GROQ_API_KEY, GEMINI_API_KEY); status tidak pernah menampilkan key.`
  },

  termux: {
    title: 'ARKA di Android (Termux)',
    text: `Sekali: bash setup-termux.sh http://<IP_PC>:5000/api   (pasang nodejs, tulis ~/.arkarc, buat perintah 'arka' global)
Hubungkan: arka config set-url http://<IP_PC>:5000/api
Contoh: arka upload ~/storage/shared/DCIM/Camera/IMG_001.jpg --inbox
        arka ask "cari video terbaru saya"
Server TIDAK berjalan di HP - ARKA Core jalan di PC, jadi 'arka start' hanya untuk PC.
PC dan HP harus satu jaringan; cek IP PC dengan ipconfig.`
  }
};

/** All topics available to the agent (used in the tool description). */
export function guideTopicsText() {
  return GUIDE_TOPICS.join(', ');
}

/**
 * Guide text for one topic. Unknown or empty topic returns the short overview so
 * the model always has something correct to say.
 */
export function getGuideText(topic) {
  const key = String(topic || '').trim().toLowerCase();
  const entry = GUIDE[key];
  if (entry) return `TOPIK: ${entry.title}\n${entry.text}`;

  return `TOPIK: Ringkasan cara pakai ARKA\n${GUIDE.overview.text}\n\nTopik tersedia: ${GUIDE_TOPICS.join(', ')}`;
}

export default { GUIDE_TOPICS, getGuideText, guideTopicsText };
