// ── ARKA Data Fetching & List/Gallery Render Module ─────────────────────────

async function loadStatus() {
  try {
    const res = await authFetch(`${API_BASE}/status`);
    if (res.status === 401) { handleLogout(); return; }
    const json = await res.json();
    if (json.success && json.data) {
      const stats = json.data.stats || {};
      const statFiles = document.getElementById('statFiles');
      const statPrompts = document.getElementById('statPrompts');
      const statLinks = document.getElementById('statLinks');
      const statStorage = document.getElementById('statStorage');
      const statusInd = document.getElementById('statusIndicator');
      const statusTxt = document.getElementById('statusText');

      if (statFiles) statFiles.textContent = stats.totalFiles || 0;
      if (statPrompts) statPrompts.textContent = stats.prompts || 0;
      if (statLinks) statLinks.textContent = stats.links || 0;
      if (statStorage) statStorage.textContent = formatBytes(stats.totalBytes);
      if (statusInd) {
        statusInd.classList.remove('bg-red-500', 'bg-amber-500');
        statusInd.classList.add('bg-emerald-500');
      }
      if (statusTxt) statusTxt.textContent = 'core online';

      const aiWarn = document.getElementById('aiSchemaWarning');
      if (aiWarn) {
        aiWarn.style.display = (json.data.ai && json.data.ai.ready === false) ? 'block' : 'none';
      }
    }
  } catch {
    const statusTxt = document.getElementById('statusText');
    const statusInd = document.getElementById('statusIndicator');
    if (statusTxt) statusTxt.textContent = 'terputus';
    if (statusInd) {
      statusInd.classList.remove('bg-emerald-500');
      statusInd.classList.add('bg-red-500');
    }
  }
}

function renderSkeleton() {
  const container = document.getElementById('dataList');
  if (!container) return;
  const rows = Array.from({ length: 4 }, () => `
    <div class="p-4 border-b border-zinc-800/80 flex flex-col gap-2 animate-pulse">
      <div class="flex items-center gap-2">
        <div class="h-3 w-12 bg-zinc-800 rounded"></div>
        <div class="h-4 w-48 bg-zinc-800 rounded"></div>
        <div class="h-3 w-16 bg-zinc-800 rounded"></div>
      </div>
      <div class="h-3 w-3/4 bg-zinc-800/60 rounded"></div>
    </div>
  `).join('');
  container.innerHTML = rows;
}

async function fetchAllData() {
  renderSkeleton();
  try {
    const [filesRes, promptsRes, linksRes, foldersRes, trashRes] = await Promise.all([
      authFetch(`${API_BASE}/files`).then(r => r.json()),
      authFetch(`${API_BASE}/prompts`).then(r => r.json()),
      authFetch(`${API_BASE}/links`).then(r => r.json()),
      authFetch(`${API_BASE}/folders`).then(r => r.json()).catch(() => ({ data: [] })),
      authFetch(`${API_BASE}/files?trash=true`).then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    allData.files = Array.isArray(filesRes.data) ? filesRes.data : [];
    allData.prompts = Array.isArray(promptsRes.data) ? promptsRes.data : [];
    allData.links = Array.isArray(linksRes.data) ? linksRes.data : [];
    allData.folders = Array.isArray(foldersRes.data) ? foldersRes.data : [];
    allData.trash = Array.isArray(trashRes.data) ? trashRes.data : [];

    const folderDatalist = document.getElementById('folderSuggestions');
    if (folderDatalist) {
      folderDatalist.innerHTML = allData.folders.map(f => `<option value="${escapeHtml(f.path || f.name)}">`).join('');
    }

    updateCounts();
    renderFolderChips();
    if (currentFilter === 'overview' || currentFilter === 'all') {
      renderOverview();
    } else {
      render();
    }
    checkAndTriggerBatchAutoOrganize();
    processAutoAnalysisQueue();
  } catch (err) {
    const container = document.getElementById('dataList');
    if (container) {
      container.innerHTML = `<div class="p-8 text-center text-red-400 font-mono text-sm">Gagal memuat data: ${escapeHtml(err.message)}</div>`;
    }
    showToast('error', 'Gagal memuat data: ' + err.message);
  }
}

async function handleRefresh(btn) {
  if (btn && btn.classList.contains('spinning')) return;
  if (btn) btn.classList.add('spinning');
  refreshIcons();
  await Promise.all([fetchAllData(), loadStatus()]);
  if (btn) btn.classList.remove('spinning');
  refreshIcons();
  showToast('success', 'Data berhasil diperbarui.');
}

function updateCounts() {
  const total = allData.files.length + allData.prompts.length + allData.links.length;
  const imageCount = (allData.files || []).filter(isImageFile).length;

  const countAll = document.getElementById('countAll');
  const countFiles = document.getElementById('countFiles');
  const countImages = document.getElementById('countImages');
  const countPrompts = document.getElementById('countPrompts');
  const countLinks = document.getElementById('countLinks');
  const countTrash = document.getElementById('countTrash');

  if (countAll) countAll.textContent = total;
  if (countFiles) countFiles.textContent = allData.files.length;
  if (countImages) countImages.textContent = imageCount;
  if (countPrompts) countPrompts.textContent = allData.prompts.length;
  if (countLinks) countLinks.textContent = allData.links.length;
  if (countTrash) countTrash.textContent = allData.trash.length;

  // Sidebar Badges
  const badgeFiles = document.getElementById('badgeFiles');
  const badgeImages = document.getElementById('badgeImages');
  const badgePrompts = document.getElementById('badgePrompts');
  const badgeLinks = document.getElementById('badgeLinks');
  const badgeTrash = document.getElementById('badgeTrash');

  if (badgeFiles) badgeFiles.textContent = allData.files.length;
  if (badgeImages) badgeImages.textContent = imageCount;
  if (badgePrompts) badgePrompts.textContent = allData.prompts.length;
  if (badgeLinks) badgeLinks.textContent = allData.links.length;
  if (badgeTrash) badgeTrash.textContent = allData.trash.length;
}

// ── Folder Quick-Filter Chips (UX Kenyamanan Ekstra) ─────────────────────────
function renderFolderChips() {
  const container = document.getElementById('folderChipsBar');
  if (!container) return;

  // Kumpulkan semua folder unik yang ada pada files
  const foldersSet = new Set();
  (allData.files || []).forEach(f => {
    const fName = f.folder_name || (f.is_inbox ? 'inbox' : 'root');
    if (fName) foldersSet.add(fName);
  });

  const folders = Array.from(foldersSet).sort();
  if (folders.length <= 1) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="flex items-center gap-1.5 overflow-x-auto py-1 text-xs font-mono scrollbar-none">
      <span class="text-zinc-500 flex-shrink-0 flex items-center gap-1 text-[11px] uppercase mr-1 whitespace-nowrap"><i data-lucide="folder" class="w-3 h-3"></i> Folder:</span>
      <button type="button" class="whitespace-nowrap flex-shrink-0 px-2.5 py-1 rounded text-xs transition-colors ${!currentFolderFilter ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 shadow-sm font-medium' : 'bg-zinc-200/70 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'}" onclick="setFolderFilter(null)">
        Semua Folder
      </button>
      ${folders.map(fName => `
        <button type="button" class="whitespace-nowrap flex-shrink-0 px-2.5 py-1 rounded text-xs transition-colors ${currentFolderFilter === fName ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-sm font-medium' : 'bg-zinc-200/70 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'}" onclick="setFolderFilter('${escapeHtml(fName)}')">
          ${escapeHtml(fName)}
        </button>
      `).join('')}
    </div>
  `;
  refreshIcons();
}

function setFolderFilter(folderName) {
  currentFolderFilter = folderName;
  renderFolderChips();
  render();
}

// ── Tab Navigation Filter ───────────────────────────────────────────────────
function setFilter(type) {
  if (type === 'all') type = 'overview';
  currentFilter = type;
  saveCurrentFilter(type);

  const navTabs = ['overview', 'files', 'images', 'prompts', 'links', 'ai', 'trash'];
  navTabs.forEach(t => {
    const btn = document.getElementById(`nav${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      const isActive = t === type;
      if (isActive) {
        btn.className = 'nav-link w-full flex items-center justify-between px-3 py-2 rounded-lg font-semibold bg-zinc-200/90 dark:bg-zinc-800 text-zinc-900 dark:text-white transition-colors';
      } else {
        btn.className = 'nav-link w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-colors';
      }
    }
  });

  // Header Title & Subtitle updates
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const titles = {
    overview: { title: 'Beranda', subtitle: 'Ringkasan aktivitas dan berkas terkini' },
    files: { title: 'Berkas & Dokumen', subtitle: 'Kelola seluruh berkas dan dokumen di Drive Anda' },
    images: { title: 'Galeri Gambar', subtitle: 'Koleksi foto dan gambar dengan pratinjau langsung' },
    prompts: { title: 'Catatan & Prompt', subtitle: 'Koleksi prompt AI, instruksi, dan catatan kerja' },
    links: { title: 'Tautan Tersimpan', subtitle: 'Daftar bookmark tautan web dan referensi' },
    ai: { title: 'Arka AI Assistant', subtitle: 'Tanya asisten cerdas berbasis Groq & Gemini' },
    trash: { title: 'Tong Sampah', subtitle: 'Berkas terhapus yang dapat dipulihkan atau dibersihkan' }
  };
  if (pageTitle && titles[type]) pageTitle.textContent = titles[type].title;
  if (pageSubtitle && titles[type]) pageSubtitle.textContent = titles[type].subtitle;

  // View containers
  const viewOverview = document.getElementById('viewOverview');
  const viewDataList = document.getElementById('viewDataList');
  const viewAi = document.getElementById('viewAi');
  const folderChips = document.getElementById('folderChipsBar');
  const emptyTrashBtn = document.getElementById('btnEmptyTrash');

  // Hide all view panels
  if (viewOverview) viewOverview.classList.add('hidden');
  if (viewDataList) viewDataList.classList.add('hidden');
  if (viewAi) viewAi.classList.add('hidden');

  // Close mobile sidebar if drawer is open
  toggleMobileSidebar(false);

  if (type === 'overview') {
    if (viewOverview) viewOverview.classList.remove('hidden');
    renderOverview();
  } else if (type === 'ai') {
    if (viewAi) viewAi.classList.remove('hidden');
    const scrollArea = document.getElementById('aiMessagesScroll');
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    setTimeout(() => {
      const input = document.getElementById('aiChatInput');
      if (input) input.focus();
    }, 100);
  } else {
    // files, images, prompts, links, trash
    if (viewDataList) viewDataList.classList.remove('hidden');
    if (emptyTrashBtn) emptyTrashBtn.classList.toggle('hidden', type !== 'trash');
    if (emptyTrashBtn) emptyTrashBtn.classList.toggle('inline-flex', type === 'trash');

    if (folderChips && (type === 'files' || type === 'images')) {
      renderFolderChips();
    } else if (folderChips) {
      folderChips.classList.add('hidden');
    }
    render();
  }
}

// ── Overview Rendering Helper ───────────────────────────────────────────────
function renderOverview() {
  // 1. Recent Files (5 items)
  const filesContainer = document.getElementById('overviewRecentFiles');
  if (filesContainer) {
    const sortedFiles = [...(allData.files || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);
    if (sortedFiles.length === 0) {
      filesContainer.innerHTML = `
        <div class="py-8 text-center text-xs font-mono text-zinc-400">
          Belum ada berkas tersimpan. Klik "+ Buat Baru" untuk mengunggah.
        </div>
      `;
    } else {
      filesContainer.innerHTML = sortedFiles.map(f => {
        const safeId = escapeHtml(String(f.id));
        const safeTitle = escapeHtml(f.original_name || 'Tanpa Judul');
        const cat = getFileCategoryIcon(f.mime_type, f.original_name);
        const folderName = f.folder_name || (f.is_inbox ? 'inbox' : 'root');
        const downloadUrl = `/api/files/${safeId}/download${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;

        return `
          <div class="py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: ${cat.color}15; color: ${cat.color};">
                <i data-lucide="${cat.icon}" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:underline" onclick="openPreview('FILE', '${safeId}')" title="${safeTitle}">
                  ${safeTitle}
                </div>
                <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                  <span class="truncate max-w-[80px]">${escapeHtml(folderName)}</span>
                  <span>•</span>
                  <span>${formatBytes(f.size)}</span>
                  <span>•</span>
                  <span>${formatDate(f.created_at)}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <button type="button" onclick="openPreview('FILE', '${safeId}')" title="Pratinjau"
                      class="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
              <button type="button" onclick="downloadFile('${safeId}', '${escapeHtml(f.original_name || f.stored_name || 'unduhan')}')" title="Unduh"
                 class="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Recent Prompts / Notes (3 items)
  const promptsContainer = document.getElementById('overviewRecentPrompts');
  if (promptsContainer) {
    const sortedPrompts = [...(allData.prompts || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 3);
    if (sortedPrompts.length === 0) {
      promptsContainer.innerHTML = `
        <div class="py-8 text-center text-xs font-mono text-zinc-400">
          Belum ada catatan atau prompt. Klik "+ Buat Baru" untuk menulis.
        </div>
      `;
    } else {
      promptsContainer.innerHTML = sortedPrompts.map(p => {
        const safeId = escapeHtml(String(p.id));
        const safeTitle = escapeHtml(p.title || 'Tanpa Judul');
        const category = escapeHtml(p.category || 'General');
        const snippet = escapeHtml((p.content || '').slice(0, 90));

        return `
          <div class="py-2.5 px-3 flex flex-col gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">${safeTitle}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">${category}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="handleCopyPrompt('${safeId}', this)" title="Salin Catatan"
                        class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors text-xs font-mono flex items-center gap-1">
                  <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
                <button type="button" onclick="openPreview('PROMPT', '${safeId}')" title="Buka Detail"
                        class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
                  <i data-lucide="eye" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
            ${snippet ? `<div class="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 font-mono">${snippet}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  refreshIcons();
}

// ── Modal & Mobile Sidebar Helpers ──────────────────────────────────────────
function openCreateModal(tab = 'upload') {
  const modal = document.getElementById('createModalBackdrop');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (typeof switchCreateTab === 'function') {
      switchCreateTab(tab);
    }
    refreshIcons();
  }
}

function closeCreateModal() {
  const modal = document.getElementById('createModalBackdrop');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function toggleMobileSidebar(isOpen) {
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  const show = isOpen !== undefined ? isOpen : sidebar.classList.contains('-translate-x-full');
  if (show) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  const desktopSearch = document.getElementById('searchInput');
  const mobileSearch = document.getElementById('searchInputMobile');
  if (desktopSearch && desktopSearch.value !== val) desktopSearch.value = val;
  if (mobileSearch && mobileSearch.value !== val) mobileSearch.value = val;

  // If in overview, switch to files tab when searching
  if (currentFilter === 'overview' && searchQuery) {
    setFilter('files');
    return;
  }
  render();
}

// ── Core Render Function ─────────────────────────────────────────────────────
function render() {
  const container = document.getElementById('dataList');
  if (!container) return;

  // ── 1. Tab Khusus Gambar: Galeri Visual Card dengan Preview Langsung
  if (currentFilter === 'images') {
    let imageFiles = (allData.files || []).filter(isImageFile);

    if (currentFolderFilter) {
      imageFiles = imageFiles.filter(f => (f.folder_name || (f.is_inbox ? 'inbox' : 'root')) === currentFolderFilter);
    }

    if (searchQuery) {
      const q = searchQuery;
      imageFiles = imageFiles.filter(f => {
        return (f.original_name || '').toLowerCase().includes(q)
          || (f.description || '').toLowerCase().includes(q)
          || (f.folder_name || '').toLowerCase().includes(q)
          || (f.tags || '').toLowerCase().includes(q);
      });
    }

    imageFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (imageFiles.length === 0) {
      container.innerHTML = `
        <div class="py-16 text-center text-zinc-500 font-sans flex flex-col items-center justify-center gap-2">
          <div class="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 mb-1">
            <i data-lucide="image" class="w-6 h-6"></i>
          </div>
          <div class="font-medium text-zinc-800 dark:text-zinc-300 text-sm">${searchQuery ? 'Tidak ada file gambar yang cocok.' : 'Belum ada gambar yang diunggah'}</div>
          <div class="text-xs text-zinc-500 max-w-sm">File gambar (.png, .jpg, .webp, .svg, dll.) akan otomatis tampil dengan pratinjau langsung di sini.</div>
        </div>
      `;
      refreshIcons();
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 p-2.5 sm:p-4">
        ${imageFiles.map(f => {
      const safeId = escapeHtml(String(f.id));
      const safeTitle = escapeHtml(f.original_name || 'Tanpa Judul');
      const deleteId = `del-FILE-${safeId}`;
      const downloadUrl = `/api/files/${safeId}/download${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
      const viewUrl = f.public_url || f.publicUrl || `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}inline=1`;
      const ext = (f.original_name || '').split('.').pop().toLowerCase();
      const category = f.folder_name || (f.is_inbox ? 'inbox' : 'root');

      let aiBadge = '';
      if (f.ai_analyzed) {
        aiBadge = '<span class="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-mono rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/25"><i data-lucide="bot" class="w-3 h-3"></i> AI</span>';
      }

      let suggestBtns = '';
      if (f.suggested_name && f.suggested_name !== f.original_name) {
        suggestBtns = `
              <button class="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-mono bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 transition-colors"
                      title="Ganti nama AI: ${escapeHtml(f.suggested_name)}"
                      data-id="${safeId}" data-value="${escapeHtml(f.suggested_name)}" onclick="handleApplyRename(this)">
                <i data-lucide="pen-line" class="w-3 h-3"></i> <span>Ganti Nama</span>
              </button>
            `;
      }
      if (f.suggested_folder && (!f.folder_name || f.folder_name !== f.suggested_folder) && !f.is_trash) {
        triggerSilentAutoOrganize(f.id, f.suggested_folder);
      }

      return `
            <div class="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-md" id="row-FILE-${safeId}">
              <div class="relative h-40 sm:h-48 w-full bg-zinc-100 dark:bg-zinc-950 overflow-hidden cursor-pointer flex items-center justify-center" onclick="openPreview('FILE', '${safeId}')" title="Buka pratinjau: ${safeTitle}">
                <img src="${viewUrl}" alt="${safeTitle}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.onerror=null; this.src='/placeholder-image.svg';">
                <span class="absolute top-2 left-2 inline-flex items-center justify-center h-5 px-2 text-[10px] font-mono font-bold uppercase bg-white/90 dark:bg-black/70 text-zinc-800 dark:text-zinc-200 rounded-md backdrop-blur-md shadow-sm border border-transparent">${escapeHtml(ext.toUpperCase() || 'IMG')}</span>
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-3">
                  <span class="text-xs text-white font-medium flex items-center gap-1.5 drop-shadow-md"><i data-lucide="maximize-2" class="w-4 h-4"></i> <span class="hidden sm:inline">Lihat Penuh</span></span>
                </div>
              </div>
              <div class="p-3 sm:p-4 flex flex-col justify-between flex-1 gap-3">
                <div>
                  <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 mb-1" title="${safeTitle}">${safeTitle}</div>
                  <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    <span class="inline-flex items-center gap-1 h-5 px-1.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-md border border-transparent truncate max-w-[120px]"><i data-lucide="folder" class="w-3 h-3"></i> ${escapeHtml(category)}</span>
                    <span>•</span>
                    <span>${formatBytes(f.size)}</span>
                  </div>
                </div>
                ${(aiBadge || suggestBtns) ? `
                  <div class="flex items-center gap-2 flex-wrap">
                    ${aiBadge}
                    ${suggestBtns}
                  </div>
                ` : ''}
                <div class="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-zinc-100 dark:border-zinc-800">
                  <span class="inline-flex items-center h-5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500">${formatDate(f.created_at)}</span>
                  <div class="flex items-center gap-1">
                    <button type="button" onclick="downloadFile('${safeId}', '${escapeHtml(f.original_name || 'unduhan')}')" class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center" title="Unduh gambar">
                      <i data-lucide="download" class="w-4 h-4"></i>
                    </button>
                    <button
                      id="${deleteId}"
                      class="p-1.5 rounded-md text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center justify-center"
                      data-type="FILE"
                      data-id="${safeId}"
                      data-btnid="${deleteId}"
                      onclick="handleDelete(this)"
                      title="Hapus gambar"
                    ><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                  </div>
                </div>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
    refreshIcons();
    return;
  }

  // ── 2. Tab Umum: List View Bersih
  let combined = [];

  if (currentFilter === 'all' || currentFilter === 'files') {
    allData.files.forEach(f => {
      const category = f.folder_name || (f.is_inbox ? 'inbox' : 'root');
      if (!currentFolderFilter || category === currentFolderFilter) {
        combined.push({
          type: 'FILE',
          id: f.id,
          title: f.original_name || 'Tanpa Judul',
          category: category,
          desc: f.description || '',
          metaRight: formatBytes(f.size),
          date: f.created_at,
          subInfo: f.tags ? `tags: ${f.tags}` : '',
          raw: f
        });
      }
    });
  }

  if (currentFilter === 'all' || currentFilter === 'prompts') {
    if (!currentFolderFilter) {
      allData.prompts.forEach(p => combined.push({
        type: 'PROMPT',
        id: p.id,
        title: p.title || 'Tanpa Judul',
        category: p.category || 'General',
        desc: p.content || '',
        metaRight: p.tags ? (Array.isArray(p.tags) ? `tags: ${p.tags.join(', ')}` : `tags: ${p.tags}`) : '',
        date: p.created_at,
        subInfo: '',
        raw: p
      }));
    }
  }

  if (currentFilter === 'all' || currentFilter === 'links') {
    if (!currentFolderFilter) {
      allData.links.forEach(l => combined.push({
        type: 'LINK',
        id: l.id,
        title: l.title || l.domain || l.url || 'Tanpa Judul',
        category: l.category || 'General',
        desc: l.description || l.url || '',
        metaRight: l.domain || '',
        date: l.created_at,
        url: l.url,
        subInfo: l.tags ? (Array.isArray(l.tags) ? `tags: ${l.tags.join(', ')}` : `tags: ${l.tags}`) : '',
        raw: l
      }));
    }
  }

  if (currentFilter === 'trash') {
    allData.trash.forEach(f => combined.push({
      type: 'TRASH',
      id: f.id,
      title: f.original_name || 'Tanpa Judul',
      category: f.folder_name || 'Sampah',
      desc: f.description || '',
      metaRight: formatBytes(f.size),
      date: f.updated_at || f.created_at,
      subInfo: 'File di tempat sampah',
      raw: f
    }));
  }

  if (searchQuery) {
    const q = searchQuery;
    combined = combined.filter(item => {
      return (item.title || '').toLowerCase().includes(q)
        || (item.desc || '').toLowerCase().includes(q)
        || (item.category || '').toLowerCase().includes(q)
        || (item.subInfo || '').toLowerCase().includes(q)
        || (item.url || '').toLowerCase().includes(q);
    });
  }

  combined.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (combined.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-zinc-500 font-sans flex flex-col items-center justify-center gap-1">
        <i data-lucide="inbox" class="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-1"></i>
        <div class="text-sm font-medium text-zinc-700 dark:text-zinc-400">Tidak ada item ditemukan</div>
        <div class="text-xs text-zinc-500 dark:text-zinc-600">${searchQuery ? 'Coba gunakan kata kunci pencarian yang lain.' : 'Mulai dengan mengunggah file atau membuat catatan baru.'}</div>
      </div>
    `;
    refreshIcons();
    return;
  }

  container.innerHTML = combined.map(item => {
    const safeId = escapeHtml(String(item.id));
    const safeTitle = escapeHtml(item.title);
    const deleteId = `del-${item.type}-${safeId}`;

    let actionBtn = '';
    let aiBadge = '';
    let miniThumbHtml = '';

    if (item.type === 'PROMPT') {
      actionBtn = `
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="handleCopyPrompt('${safeId}', this)"><i data-lucide="copy" class="w-3 h-3"></i> <span>salin</span></button>
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="openPreview('PROMPT', '${safeId}')"><i data-lucide="eye" class="w-3 h-3"></i> <span>pratinjau</span></button>
      `;
    } else if (item.type === 'FILE') {
      const downloadUrl = `/api/files/${safeId}/download${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
      const isAnalyzed = !!(item.raw?.ai_analyzed);
      if (isAnalyzed) {
        aiBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/25"><i data-lucide="bot" class="w-2.5 h-2.5"></i> AI</span>';
      } else {
        aiBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/25 pulse-badge" id="badge-FILE-${safeId}"><i data-lucide="loader" class="w-2.5 h-2.5 spin"></i> Menganalisis...</span>`;
      }

      if (isImageFile(item.raw)) {
        const viewUrl = item.raw?.public_url || item.raw?.publicUrl || `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}inline=1`;
        miniThumbHtml = `<img src="${viewUrl}" class="w-8 h-8 rounded object-cover border border-zinc-300 dark:border-zinc-700/80 flex-shrink-0 cursor-pointer hover:scale-110 transition-transform" onclick="openPreview('FILE', '${safeId}')" title="Klik pratinjau" loading="lazy" onerror="this.style.display='none'">`;
      }

      let suggestBtns = '';
      const rawObj = item.raw || {};
      const suggName = rawObj.suggested_name;
      const suggFolder = rawObj.suggested_folder;
      const currFolder = rawObj.folder_name;

      if (suggName && suggName !== rawObj.original_name) {
        suggestBtns += `
          <button class="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 transition-colors inline-flex items-center gap-1"
                  title="Ganti nama AI: ${escapeHtml(suggName)}"
                  data-id="${safeId}" data-value="${escapeHtml(suggName)}" onclick="handleApplyRename(this)">
            <i data-lucide="pen-line" class="w-3 h-3"></i> <span></span>
          </button>
        `;
      }
      if (suggFolder && (!currFolder || currFolder !== suggFolder) && !rawObj.is_trash) {
        triggerSilentAutoOrganize(rawObj.id, suggFolder);
      }

      actionBtn = `
        ${suggestBtns}
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="openPreview('FILE', '${safeId}')"><i data-lucide="eye" class="w-3 h-3"></i> <span>pratinjau</span></button>
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="downloadFile('${safeId}', '${escapeHtml(item.title || 'unduhan')}')"><i data-lucide="download" class="w-3 h-3"></i> <span>unduh</span></button>
      `;
    } else if (item.type === 'LINK') {
      const safeUrl = escapeHtml(item.url || '');
      const isLinkAnalyzed = !!(item.desc && item.desc !== item.url && item.raw?.tags && (Array.isArray(item.raw.tags) ? item.raw.tags.length > 0 : String(item.raw.tags).trim().length > 0));
      if (isLinkAnalyzed) {
        aiBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/25"><i data-lucide="bot" class="w-2.5 h-2.5"></i> AI</span>';
      }
      actionBtn = `
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="openPreview('LINK', '${safeId}')"><i data-lucide="eye" class="w-3 h-3"></i> <span>pratinjau</span></button>
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="handleCopyLink('${safeId}', this)"><i data-lucide="copy" class="w-3 h-3"></i> <span>salin URL</span></button>
        <a href="${safeUrl}" class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" class="w-3 h-3"></i> <span>buka</span></a>
      `;
    } else if (item.type === 'TRASH') {
      actionBtn = `
        <button class="px-2 py-1 rounded text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 transition-colors inline-flex items-center gap-1" onclick="handleRestore('${safeId}', this)"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> <span>kembalikan</span></button>
        <button class="px-2 py-1 rounded text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 transition-colors inline-flex items-center gap-1" onclick="openPreview('TRASH', '${safeId}')"><i data-lucide="eye" class="w-3 h-3"></i> <span>pratinjau</span></button>
      `;
    }

    const titleHtml = item.url
      ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="hover:underline text-zinc-900 dark:text-zinc-200">${safeTitle}</a>`
      : `<span class="text-zinc-900 dark:text-zinc-200">${safeTitle}</span>`;
    const deleteLabel = item.type === 'TRASH' ? 'hapus permanen' : 'hapus';

    return `
      <div class="px-3 sm:px-4 py-3 sm:py-3.5 border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors flex flex-col gap-1.5" id="row-${item.type}-${safeId}">
        <div class="flex items-start sm:items-center justify-between gap-2 sm:gap-3 flex-col sm:flex-row">
          <div class="flex items-center gap-2 flex-wrap min-w-0 flex-1 w-full sm:w-auto">
            ${miniThumbHtml}
            <span class="text-[10px] sm:text-[11px] font-mono text-zinc-400 dark:text-zinc-500 flex-shrink-0">#${safeId.length > 8 ? safeId.slice(0, 8) + '...' : safeId}</span>
            <span class="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-md">${titleHtml}</span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 flex-shrink-0">${item.type === 'TRASH' ? 'SAMPAH' : item.type}</span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/40 flex-shrink-0 max-w-[80px] sm:max-w-none truncate">${escapeHtml(item.category)}</span>
            ${aiBadge}
          </div>
          <div class="flex items-center gap-1.5 flex-wrap flex-shrink-0 self-end sm:self-auto pt-1 sm:pt-0">
            ${actionBtn}
            <button
              id="${deleteId}"
              class="px-2 py-1 rounded text-xs font-mono text-zinc-500 hover:text-red-500 dark:hover:text-red-400 bg-zinc-100 hover:bg-red-50 dark:bg-zinc-800/60 dark:hover:bg-red-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-500/30 transition-colors inline-flex items-center gap-1"
              data-type="${item.type}"
              data-id="${safeId}"
              data-btnid="${deleteId}"
              onclick="handleDelete(this)"
            ><i data-lucide="trash-2" class="w-3 h-3"></i> <span>${deleteLabel}</span></button>
          </div>
        </div>
        ${item.desc ? `<div class="text-xs text-zinc-600 dark:text-zinc-400 ${item.type === 'PROMPT' ? 'font-mono bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200' : ''} line-clamp-2">${escapeHtml(item.desc)}</div>` : ''}
        <div class="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-mono text-zinc-500 flex-wrap">
          <span>${formatDate(item.date)}</span>
          ${item.metaRight ? `<span>• ${escapeHtml(item.metaRight)}</span>` : ''}
          ${item.subInfo ? `<span class="truncate max-w-[180px] sm:max-w-none">• ${escapeHtml(item.subInfo)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  refreshIcons();
}

// ── CRUD Actions ────────────────────────────────────────────────────────────
function handleDelete(btn) {
  const type = btn.dataset.type;
  const id = btn.dataset.id;
  const btnId = btn.dataset.btnid;

  if (!deleteConfirmState[btnId]) {
    deleteConfirmState[btnId] = true;
    btn.textContent = 'konfirmasi?';
    btn.classList.add('text-red-400', 'border-red-500/40', 'bg-red-500/10');
    setTimeout(() => {
      if (deleteConfirmState[btnId]) {
        delete deleteConfirmState[btnId];
        if (btn) {
          btn.textContent = type === 'TRASH' ? 'hapus permanen' : 'hapus';
          btn.classList.remove('text-red-400', 'border-red-500/40', 'bg-red-500/10');
        }
      }
    }, 3000);
    return;
  }

  delete deleteConfirmState[btnId];
  btn.textContent = 'menghapus...';
  btn.disabled = true;

  let endpoint = '';
  if (type === 'FILE') endpoint = `/api/files/${id}`;
  else if (type === 'TRASH') endpoint = `/api/files/${id}?permanent=true`;
  else if (type === 'PROMPT') endpoint = `/api/prompts/${id}`;
  else if (type === 'LINK') endpoint = `/api/links/${id}`;

  authFetch(endpoint, { method: 'DELETE' })
    .then(r => r.json())
    .then(json => {
      if (json.success) {
        showToast('success', json.message || 'Item berhasil dihapus.');
        fetchAllData();
        loadStatus();
      } else {
        showToast('error', json.error || 'Gagal menghapus item.');
        btn.disabled = false;
        btn.textContent = 'hapus';
      }
    })
    .catch(err => {
      showToast('error', 'Kesalahan: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'hapus';
    });
}

async function handleRestore(id, btn) {
  btn.disabled = true;
  btn.textContent = 'mengembalikan...';
  try {
    const res = await authFetch(`${API_BASE}/files/${id}/restore`, { method: 'POST' });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('success', 'File berhasil dipulihkan.');
      await fetchAllData();
      await loadStatus();
    } else {
      showToast('error', json.error || 'Gagal mengembalikan file.');
      btn.disabled = false;
      btn.textContent = 'kembalikan';
    }
  } catch (err) {
    showToast('error', 'Kesalahan: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'kembalikan';
  }
}

async function handleEmptyTrash() {
  if (!confirm('Apakah Anda yakin ingin mengosongkan semua file di sampah secara permanen?')) return;
  try {
    const res = await authFetch(`${API_BASE}/trash`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('success', json.message || 'Sampah berhasil dikosongkan.');
      allData.trash = [];
      updateCounts();
      loadStatus();
      render();
    } else {
      showToast('error', json.error || 'Gagal mengosongkan sampah.');
    }
  } catch (err) {
    showToast('error', 'Kesalahan: ' + err.message);
  }
}

function handleCopyPrompt(id, btn) {
  const p = allData.prompts.find(item => String(item.id) === String(id));
  if (!p) return;
  copyToClipboard(p.content, btn, 'tersalin!', 'salin prompt');
}

function handleCopyLink(id, btn) {
  const l = allData.links.find(item => String(item.id) === String(id));
  if (!l) return;
  copyToClipboard(l.url, btn, 'tersalin!', 'salin URL');
}

// ── Smart AI Rename & Auto-Organize ──────────────────────────────────────────
async function triggerSilentAutoOrganize(fileId, folderName) {
  if (autoOrganizingIds.has(fileId)) return;
  autoOrganizingIds.add(fileId);
  try {
    const res = await authFetch(`${API_BASE}/files/${fileId}/organize`, {
      method: 'POST',
      body: JSON.stringify({ project_name: folderName })
    });
    if (res.ok) {
      const file = (allData.files || []).find(f => String(f.id) === String(fileId));
      if (file) {
        file.folder_name = folderName;
        file.is_inbox = false;
      }
      render();
    }
  } catch (e) {
    console.warn('[Silent Auto-Organize]', e.message);
  }
}

async function checkAndTriggerBatchAutoOrganize() {
  if (isAutoOrganizingBatch) return;
  const unorganized = (allData.files || []).filter(f =>
    f.suggested_folder &&
    (!f.folder_name || f.folder_name !== f.suggested_folder) &&
    !f.is_trash
  );
  if (unorganized.length === 0) return;

  isAutoOrganizingBatch = true;
  try {
    const res = await authFetch(`${API_BASE}/files/auto-organize-all`, { method: 'POST' });
    const json = await res.json();
    if (res.ok && json.success && json.count > 0) {
      const [filesRes, foldersRes] = await Promise.all([
        authFetch(`${API_BASE}/files`).then(r => r.json()),
        authFetch(`${API_BASE}/folders`).then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      if (Array.isArray(filesRes.data)) allData.files = filesRes.data;
      if (Array.isArray(foldersRes.data)) allData.folders = foldersRes.data;
      render();
    }
  } catch (err) {
    console.warn('[ARKA AI] Batch organize error:', err.message);
  } finally {
    isAutoOrganizingBatch = false;
  }
}

async function processAutoAnalysisQueue() {
  if (isProcessingAutoQueue) return;
  isProcessingAutoQueue = true;
  try {
    const unanalyzedFiles = (allData.files || []).filter(f => !f.ai_analyzed && !f.is_trash);
    for (const f of unanalyzedFiles) {
      try {
        const res = await authFetch(`${API_BASE}/files/${f.id}/analyze`, { method: 'POST' });
        const json = await res.json();
        if (json.success && json.data) {
          f.ai_analyzed = true;
          f.suggested_name = json.data.suggestedName || f.suggested_name;
          f.suggested_folder = json.data.suggestedFolder || f.suggested_folder;
        }
      } catch { }
    }
    render();
  } finally {
    isProcessingAutoQueue = false;
  }
}

async function handleApplyRename(source, fallbackId, fallbackValue) {
  const id = typeof source === 'string' ? source : (source.dataset?.id || fallbackId);
  const newName = typeof source === 'string' ? fallbackValue : (source.dataset?.value || fallbackValue);
  if (!id || !newName) return;

  try {
    const res = await authFetch(`${API_BASE}/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ original_name: newName })
    });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('success', 'Nama file berhasil diganti.');
      await fetchAllData();
    } else {
      showToast('error', json.error || 'Gagal mengganti nama.');
    }
  } catch (e) {
    showToast('error', e.message);
  }
}
