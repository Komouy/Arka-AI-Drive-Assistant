/**
 * ARKA AI — Usage Guide (Web App)
 *
 * Gives the agent accurate knowledge to answer "how do I use ARKA?"
 * All instructions reference the web dashboard UI, not the CLI.
 */

export const GUIDE_TOPICS = [
  'mulai', 'upload', 'inbox', 'file', 'trash', 'prompt', 'link', 'search', 'ai'
];

const GUIDE = {
  overview: {
    title: 'Ringkasan cara pakai ARKA Web App',
    text: `ARKA = penyimpanan file pribadi + AI, 100% lewat web browser di arkaapp.vercel.app.
Alur harian: Masuk → Unggah file → AI otomatis menganalisis → Cari/kelola di dashboard.
Fitur utama: unggah file (maks 500 MB), Catatan/Prompt, Bookmark Web, Perapian AI Otomatis, AI Assistant (chat ini).
Topik tersedia: ${['mulai', 'upload', 'inbox', 'file', 'trash', 'prompt', 'link', 'search', 'ai'].join(', ')}`
  },

  mulai: {
    title: 'Memulai ARKA Web App',
    text: `Buka arkaapp.vercel.app di browser.
Masuk: klik "Lanjutkan dengan Google" atau pilih "Masuk dengan Kata Sandi" lalu isi Nama Pengguna dan Kata Sandi.
Setelah masuk, kamu langsung berada di dashboard utama.
Dashboard menampilkan: statistik (jumlah file, prompt, tautan, penyimpanan terpakai), panel "Unggah File" / "Catatan / Prompt Baru" / "Tambah Tautan", dan daftar semua item.
Untuk keluar: klik tombol "Keluar" di kanan atas.`
  },

  upload: {
    title: 'Mengunggah file',
    text: `Di panel atas dashboard, tab "Unggah File" sudah aktif.
Cara mengunggah:
  1. Letakkan file di area "Letakkan file di sini atau klik untuk memilih" ATAU klik area itu untuk memilih file
  2. Bisa pilih beberapa file sekaligus (multi-select)
  3. Isi "Folder / Proyek (Opsional)" agar file langsung masuk ke folder tertentu
  4. Klik tombol "Unggah File"
Setelah diunggah: AI otomatis menganalisis file → mengisi deskripsi, tag, kategori, dan saran folder.
Batas ukuran: 500 MB per file. Format yang didukung: semua format umum (gambar, video, audio, dokumen, kode).`
  },

  inbox: {
    title: 'Inbox & perapian file',
    text: `Inbox = file yang belum punya folder/organisasi.
Pada filter "Semua Item", file yang masih di inbox ditandai dengan label inbox.
Perapian AI Otomatis: klik tombol "Perapian AI Otomatis" (ikon sparkles) di toolbar — AI menganalisis file inbox lalu memindahkannya ke folder saran AI.
Cara per item: klik tombol "→ NamaFolder" pada baris file untuk menerima saran folder AI.
Tips: unggah file apa adanya dulu, lalu jalankan "Perapian AI Otomatis" sekali untuk merapikan semuanya sekaligus.`
  },

  file: {
    title: 'Mengelola file',
    text: `Di daftar file, setiap item punya tombol aksi:
  - "pratinjau": buka detail file (deskripsi AI, tag, tipe, ukuran, tanggal)
  - "Analisis AI" / "analisis ulang": analisis ulang dengan AI → perbarui deskripsi, tag, kategori
  - "Ganti Nama AI": terima nama file usulan AI
  - "→ NamaFolder": pindahkan file ke folder usulan AI
  - "unduh": unduh file ke perangkat
  - "hapus": pindahkan ke sampah (belum terhapus permanen)
Filter tampilan: gunakan tombol "Semua Item", "File", "Prompt", "Tautan".
Cari file: ketik di kotak "Cari kata kunci..." — mencari di nama, deskripsi AI, dan tag.`
  },

  trash: {
    title: 'Sampah (Trash)',
    text: `Menghapus item dari daftar → item masuk ke sampah (belum terhapus permanen).
Item di sampah disembunyikan dari daftar dan tidak dihitung dalam kuota penyimpanan.
Pulihkan file: jalankan CLI "arka restore <nama file>".
Lihat isi sampah: "arka trash". Kosongkan permanen: "arka trash empty" atau hapus dengan "arka rm --permanent".
Catatan: file yang sudah dihapus permanen tidak bisa dikembalikan.`
  },

  prompt: {
    title: 'Prompt & Knowledge Hub',
    text: `Tab "Catatan / Prompt Baru" di panel atas untuk menyimpan catatan atau prompt AI.
Isi: Judul, Kategori, Konten (teks bebas), Tag (Opsional), lalu klik "Simpan Catatan".
Cocok untuk menyimpan: prompt ChatGPT/Gemini, catatan riset, snippet teks penting.
Filter "Prompt" di toolbar untuk menampilkan hanya prompt.
Tombol "salin prompt" menyalin isinya ke clipboard; "pratinjau" membuka detail lengkap.
Prompt ikut dicari lewat kotak pencarian utama.`
  },

  link: {
    title: 'Bookmark Web / Tautan',
    text: `Tab "Tambah Tautan" di panel atas untuk menyimpan bookmark/URL.
Isi: URL (wajib), Judul (Opsional — terisi otomatis dari halaman), Kategori, Deskripsi (Opsional), lalu klik "Simpan Tautan".
Analisis AI untuk tautan: klik "Analisis AI" pada baris tautan → AI mengisi judul, deskripsi, kategori, dan tag dari isi halaman web.
Filter "Tautan" di toolbar untuk menampilkan hanya tautan.
Domain halaman terdeteksi otomatis; "buka tautan" membuka halaman aslinya di tab baru.`
  },

  search: {
    title: 'Pencarian',
    text: `Kotak "Cari kata kunci..." di toolbar — mencari di seluruh workspace.
Pencarian meliputi: nama file, deskripsi AI, tag, kategori, judul prompt, konten prompt, URL tautan.
Gabungkan filter: klik "File", "Prompt", atau "Tautan" sambil mengetik untuk mempersempit hasil.
Tips: hasil "Analisis AI" (deskripsi & tag) membuat file jauh lebih mudah ditemukan lewat pencarian.`
  },

  ai: {
    title: 'Fitur AI (Groq + Gemini)',
    text: `ARKA menggunakan 2 model AI:
  - Groq (teks/agent/search): analisis dokumen, kode, prompt, dan AI chat assistant ini
  - Gemini (multimodal): analisis gambar, video, audio

Analisis AI (per file): klik "Analisis AI" pada file → AI membuat deskripsi, topik, tag, kategori, saran folder, dan saran nama file.
Perapian AI Otomatis: klik tombolnya di toolbar → analisis massal + rapikan semua file inbox sekaligus.
Analisis AI untuk tautan: klik "Analisis AI" pada tautan → AI meringkas halaman web dan mengisi metadata.
AI Assistant (chat ini): tanya apa saja tentang workspace kamu — cari file, lihat statistik, cek inbox, dll.
AI bersifat read-only: tidak bisa memindah/upload/hapus file — gunakan tombol di dashboard untuk aksi tersebut.`
  }
};

/** All topics available to the agent. */
export function guideTopicsText() {
  return GUIDE_TOPICS.join(', ');
}

/**
 * Guide text for one topic.
 */
export function getGuideText(topic) {
  const key = String(topic || '').trim().toLowerCase();
  const entry = GUIDE[key];
  if (entry) return `TOPIK: ${entry.title}\n${entry.text}`;

  return `TOPIK: Ringkasan cara pakai ARKA\n${GUIDE.overview.text}\n\nTopik tersedia: ${GUIDE_TOPICS.join(', ')}`;
}

export default { GUIDE_TOPICS, getGuideText, guideTopicsText };
