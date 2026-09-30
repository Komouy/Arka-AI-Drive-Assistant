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
Alur harian: Login → Upload file → AI otomatis analisis → Cari/kelola di dashboard.
Fitur utama: Upload file (max 500 MB), Notes/Prompts, Web Bookmarks, AI Smart Triage, AI Assistant (chat ini).
Topik tersedia: ${['mulai', 'upload', 'inbox', 'file', 'trash', 'prompt', 'link', 'search', 'ai'].join(', ')}`
  },

  mulai: {
    title: 'Memulai ARKA Web App',
    text: `Buka arkaapp.vercel.app di browser.
Login: Klik "Continue with Google" atau masukkan password di form login.
Setelah login, kamu langsung masuk ke dashboard utama.
Dashboard menampilkan: Stats (jumlah file, prompts, links, storage), panel upload, dan daftar semua item.
Untuk logout: klik tombol "Sign out" di header kanan atas.`
  },

  upload: {
    title: 'Meng-upload file',
    text: `Di panel atas dashboard, tab "Upload File" sudah aktif.
Cara upload:
  1. Drag & drop file ke area upload ATAU klik area abu-abu untuk pilih file
  2. Bisa pilih beberapa file sekaligus (multi-select)
  3. Isi "Folder / Project" (opsional) untuk langsung menempatkan file ke folder tertentu
  4. Klik tombol "Upload File"
Setelah upload: AI otomatis menganalisis file → mengisi deskripsi, tags, kategori, dan saran folder.
Batas ukuran: 500 MB per file. Format yang didukung: semua format umum (image, video, audio, dokumen, kode).`
  },

  inbox: {
    title: 'Inbox & perapian file',
    text: `Inbox = file yang belum punya folder/organisasi.
Filter ke "All Items" di dashboard → file yang masih di inbox muncul dengan label.
AI Smart Triage: Klik tombol "AI Smart Triage" (ikon sparkles) di toolbar — AI otomatis memindahkan file inbox ke folder yang disarankan.
Untuk organize manual: Klik file → Edit → pilih folder tujuan.
Tips: Upload file ke inbox dulu, lalu jalankan AI Smart Triage untuk rapikan semuanya sekaligus.`
  },

  file: {
    title: 'Mengelola file',
    text: `Di daftar file, setiap item punya tombol aksi:
  - "Analyze" (ikon sparkles): analisis ulang file dengan AI → update deskripsi, tags, kategori
  - "Download": unduh file ke komputer
  - "Edit" (ikon pensil): ubah nama, folder, tags, deskripsi
  - "Delete" (ikon tong sampah): pindah ke trash (masih bisa restore)
Filter tampilan: gunakan tombol tab "All Items", "Files", "Prompts", "Links".
Cari file: ketik di kotak pencarian "Search keywords..." — mencari di nama, deskripsi, tags.`
  },

  trash: {
    title: 'Trash / Sampah',
    text: `Menghapus file dari daftar → file masuk ke trash (belum dihapus permanen).
Untuk restore: Tampilkan trash → klik "Restore" pada file yang ingin dikembalikan.
Untuk hapus permanen: Klik "Delete permanently" atau kosongkan trash.
Catatan: File yang sudah dihapus permanen tidak bisa dipulihkan.`
  },

  prompt: {
    title: 'Prompt & Knowledge Hub',
    text: `Tab "New Note / Prompt" di panel atas untuk menyimpan catatan atau prompt AI.
Isi: Judul, Kategori, Konten (teks bebas), Tags (opsional).
Gunakan untuk menyimpan: prompt ChatGPT/Gemini, catatan riset, snippet teks penting.
Filter "Prompts" di toolbar untuk lihat hanya prompts.
Edit/hapus: klik ikon di setiap item prompt.
Pencarian: prompt ikut dicari di kotak search utama.`
  },

  link: {
    title: 'Web Bookmarks / Links',
    text: `Tab "Add Link" di panel atas untuk menyimpan bookmark/URL.
Isi: URL (wajib), Judul (opsional — diisi otomatis dari halaman), Kategori, Deskripsi.
Fitur AI Link Analyzer: Klik ikon "Analyze" pada link → AI otomatis mengisi judul, deskripsi, kategori, tags dari konten halaman web.
Filter "Links" di toolbar untuk lihat hanya links.
Domain halaman dideteksi otomatis.`
  },

  search: {
    title: 'Pencarian',
    text: `Kotak "Search keywords..." di toolbar — mencari di seluruh workspace.
Pencarian meliputi: nama file, deskripsi AI, tags, kategori, judul prompt, konten prompt, URL link.
Filter bersamaan: klik tab "Files", "Prompts", atau "Links" sambil cari untuk mempersempit hasil.
Tips: Hasil "Analyze AI" (deskripsi & tag) membuat file jauh lebih mudah ditemukan lewat pencarian.`
  },

  ai: {
    title: 'Fitur AI (Groq + Gemini)',
    text: `ARKA menggunakan 2 model AI:
  - Groq (teks/agent/search): analisis dokumen, kode, prompt, dan AI chat assistant ini
  - Gemini (multimodal): analisis gambar, video, audio

AI Smart Analyze (per file): Klik "Analyze" di file → AI buat deskripsi, topic, tags, kategori, saran folder, saran nama file.
AI Smart Triage: Klik tombol "AI Smart Triage" → batch analyze + auto-organize semua file inbox.
AI Link Analyzer: Klik "Analyze" di link → AI summarize halaman web dan isi metadata.
AI Assistant (chat ini): Tanya apa saja tentang workspace kamu — search file, lihat statistik, cek inbox, dll.
AI bersifat read-only: tidak bisa memindah/upload/hapus file — gunakan UI dashboard untuk aksi tersebut.`
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
