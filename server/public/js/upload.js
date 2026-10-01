// ── ARKA Upload & Item Creation Module ──────────────────────────────────────
let selectedUploadFiles = [];
let uploadPreviewUrls = [];

function cleanupUploadPreviewUrls() {
  uploadPreviewUrls.forEach(url => {
    try { URL.revokeObjectURL(url); } catch {}
  });
  uploadPreviewUrls = [];
}

function renderUploadPreviews() {
  cleanupUploadPreviewUrls();
  const container = document.getElementById('uploadPreviewContainer');
  const grid = document.getElementById('uploadPreviewGrid');
  const summaryEl = document.getElementById('uploadPreviewSummary');
  const titleEl = document.getElementById('dropZoneTitle');
  const selectedListEl = document.getElementById('selectedFilesList');
  if (selectedListEl) selectedListEl.style.display = 'none';

  if (!container || !grid) return;

  if (!selectedUploadFiles || selectedUploadFiles.length === 0) {
    container.style.display = 'none';
    grid.innerHTML = '';
    if (titleEl) titleEl.textContent = 'Letakkan file di sini atau klik untuk memilih';
    return;
  }

  container.style.display = 'block';
  let totalBytes = 0;
  selectedUploadFiles.forEach(f => { totalBytes += (f.size || 0); });

  if (summaryEl) {
    summaryEl.textContent = `${selectedUploadFiles.length} file dipilih (${formatBytes(totalBytes)})`;
  }
  if (titleEl) {
    titleEl.textContent = `${selectedUploadFiles.length} file siap diunggah — klik atau seret lagi untuk menambah`;
  }

  grid.innerHTML = selectedUploadFiles.map((file, idx) => {
    const isImg = isImageFile(file);
    const ext = (file.name || '').split('.').pop().toLowerCase();
    let thumbHtml = '';

    if (isImg) {
      const blobUrl = URL.createObjectURL(file);
      uploadPreviewUrls.push(blobUrl);
      thumbHtml = `
        <img src="${blobUrl}" class="w-full h-full object-cover rounded-t" alt="${escapeHtml(file.name)}">
        <span class="absolute bottom-1 left-1 text-[10px] font-mono font-semibold uppercase bg-black/80 text-zinc-200 px-1.5 py-0.5 rounded backdrop-blur-sm">${escapeHtml(ext.toUpperCase() || 'IMG')}</span>
      `;
    } else {
      const cat = getFileCategoryIcon(file.type, file.name);
      thumbHtml = `
        <div class="flex flex-col items-center justify-center gap-1" style="color:${cat.color};">
          <i data-lucide="${cat.icon}" class="w-6 h-6"></i>
          <span class="absolute bottom-1 left-1 text-[10px] font-mono font-semibold uppercase bg-black/80 text-zinc-200 px-1.5 py-0.5 rounded backdrop-blur-sm">${escapeHtml(cat.label)}</span>
        </div>
      `;
    }

    return `
      <div class="relative bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-md overflow-hidden flex flex-col group transition-all" title="${escapeHtml(file.name)} (${formatBytes(file.size)})">
        <button type="button" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-500 border border-white/20 text-white flex items-center justify-center text-xs transition-transform hover:scale-110 z-10" onclick="removeUploadFile(${idx}, event)" title="Batalkan file ini">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
        <div class="relative h-20 w-full bg-zinc-950 flex items-center justify-center overflow-hidden">
          ${thumbHtml}
        </div>
        <div class="p-2 flex flex-col gap-0.5 bg-zinc-900">
          <span class="text-xs font-medium text-zinc-200 truncate">${escapeHtml(file.name)}</span>
          <span class="text-[11px] font-mono text-zinc-500">${formatBytes(file.size)}</span>
        </div>
      </div>
    `;
  }).join('');

  refreshIcons();
}

function addFilesToUpload(newFiles) {
  if (!newFiles || newFiles.length === 0) return;
  for (const f of newFiles) {
    const exists = selectedUploadFiles.some(item => item.name === f.name && item.size === f.size && item.lastModified === f.lastModified);
    if (!exists) {
      selectedUploadFiles.push(f);
    }
  }
  syncFileInputData();
  renderUploadPreviews();
}

function removeUploadFile(index, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (index >= 0 && index < selectedUploadFiles.length) {
    selectedUploadFiles.splice(index, 1);
    syncFileInputData();
    renderUploadPreviews();
  }
}

function clearUploadSelection(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  selectedUploadFiles = [];
  cleanupUploadPreviewUrls();
  const input = document.getElementById('fileInput');
  if (input) input.value = '';
  renderUploadPreviews();
}

function syncFileInputData() {
  const input = document.getElementById('fileInput');
  if (!input) return;
  try {
    const dt = new DataTransfer();
    selectedUploadFiles.forEach(f => dt.items.add(f));
    input.files = dt.files;
  } catch (err) {}
}

function handleFileSelected(input) {
  if (input.files && input.files.length > 0) {
    addFilesToUpload(Array.from(input.files));
  }
}

// ── Drag & Drop with Global Fullscreen Overlay ──────────────────────────────
function setupDragAndDrop() {
  const zone = document.getElementById('dropZone');
  const globalOverlay = document.getElementById('globalDragOverlay');

  // Specific dropzone
  if (zone) {
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('border-zinc-500', 'bg-zinc-900/60');
    }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('border-zinc-500', 'bg-zinc-900/60');
    }));
    zone.addEventListener('drop', e => {
      if (e.dataTransfer?.files?.length) {
        addFilesToUpload(Array.from(e.dataTransfer.files));
      }
    });
  }

  // Global window drag & drop (UX paling nyaman: lempar file di mana saja di browser)
  let dragCounter = 0;
  window.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    if (globalOverlay && e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      globalOverlay.classList.add('active');
    }
  });

  window.addEventListener('dragleave', e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 && globalOverlay) {
      dragCounter = 0;
      globalOverlay.classList.remove('active');
    }
  });

  window.addEventListener('dragover', e => e.preventDefault());

  window.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    if (globalOverlay) globalOverlay.classList.remove('active');
    if (e.dataTransfer?.files?.length) {
      switchCreateTab('upload');
      addFilesToUpload(Array.from(e.dataTransfer.files));
      showToast('success', `${e.dataTransfer.files.length} file ditambahkan ke antrean.`);
    }
  });
}

// ── Clipboard Paste (Ctrl+V) Support ─────────────────────────────────────────
// UX kenyamanan maksimal: user bisa paste screenshot langsung dari Snip Tool / clipboard
function setupClipboardPaste() {
  window.addEventListener('paste', e => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      return; // Jangan intercept jika user sedang mengetik di input/textarea
    }
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          // Beri nama yang rapi jika dari screenshot clipboard
          let fileName = file.name;
          if (!fileName || fileName === 'image.png') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            fileName = `screenshot-${timestamp}.png`;
          }
          const namedFile = new File([file], fileName, { type: file.type });
          files.push(namedFile);
        }
      }
    }

    if (files.length > 0) {
      switchCreateTab('upload');
      addFilesToUpload(files);
      showToast('success', `${files.length} gambar dari clipboard ditambahkan.`);
    }
  });
}

// ── Creation Panel Tab Switcher ──────────────────────────────────────────────
function switchCreateTab(tab) {
  ['upload', 'note', 'link'].forEach(t => {
    const form = document.getElementById(`${t}Form`);
    const btn  = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    if (form) form.classList.toggle('hidden', t !== tab);
    if (btn) {
      btn.classList.toggle('bg-zinc-800', t === tab);
      btn.classList.toggle('text-zinc-100', t === tab);
      btn.classList.toggle('border-zinc-700', t === tab);
      btn.classList.toggle('text-zinc-400', t !== tab);
      btn.classList.toggle('border-transparent', t !== tab);
    }
  });
  const body = document.getElementById('createPanelBody');
  const toggleBtn = document.getElementById('panelToggleBtn');
  if (body && body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = 'tutup [-]';
  }
}

function toggleCreatePanel() {
  const body      = document.getElementById('createPanelBody');
  const toggleBtn = document.getElementById('panelToggleBtn');
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (toggleBtn) toggleBtn.textContent = isHidden ? 'buka [+]' : 'tutup [-]';
}

// ── Submit Handlers ──────────────────────────────────────────────────────────
async function handleUploadSubmit(e) {
  e.preventDefault();
  const input        = document.getElementById('fileInput');
  const project      = document.getElementById('uploadProject').value.trim();
  const submitBtn    = document.getElementById('btnUploadSubmit');
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressLabel= document.getElementById('uploadProgressLabel');

  const filesToUpload = selectedUploadFiles.length > 0 ? selectedUploadFiles : Array.from(input.files || []);

  if (filesToUpload.length === 0) {
    setFormStatus('uploadStatus', 'error', 'Pilih minimal satu file.');
    return;
  }

  setFormStatus('uploadStatus', '', '');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mengunggah...';
  if (progressWrap) progressWrap.classList.remove('hidden');
  if (progressFill) progressFill.style.width = '0%';
  if (progressLabel) progressLabel.textContent = 'Menyiapkan unggahan...';

  const hasOnlyImages = filesToUpload.every(f => isImageFile(f));

  try {
    const formData = new FormData();
    for (let i = 0; i < filesToUpload.length; i++) formData.append('files', filesToUpload[i]);
    if (project) formData.append('project', project);

    const json = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/files/upload`);
      if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      const pt = providerToken || loadProviderToken();
      if (pt) xhr.setRequestHeader('X-Provider-Token', pt);

      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable && progressFill && progressLabel) {
          const pct = Math.round((ev.loaded / ev.total) * 95);
          progressFill.style.width = pct + '%';
          progressLabel.textContent = `Mengunggah... ${pct}%`;
        }
      });
      xhr.addEventListener('load', () => {
        if (progressFill) progressFill.style.width = '100%';
        if (progressLabel) progressLabel.textContent = 'Memproses berkas...';
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Respons server tidak valid.')); }
      });
      xhr.addEventListener('error', () => reject(new Error('Kesalahan jaringan saat mengunggah.')));
      xhr.send(formData);
    });

    if (json.success) {
      const count = Array.isArray(json.data) ? json.data.length : 1;
      showToast('success', `${count} file berhasil diunggah.`);
      setFormStatus('uploadStatus', 'success', `${count} file berhasil diunggah.`);
      clearUploadSelection();
      document.getElementById('uploadProject').value = '';
      await fetchAllData();
      await loadStatus();
      if (hasOnlyImages) {
        setFilter('images');
      } else {
        setFilter('files');
      }
    } else {
      setFormStatus('uploadStatus', 'error', json.error || 'Unggahan gagal.');
      showToast('error', json.error || 'Gagal mengunggah file.');
    }
  } catch (err) {
    setFormStatus('uploadStatus', 'error', 'Kesalahan: ' + err.message);
    showToast('error', 'Kesalahan unggahan: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Unggah File';
    setTimeout(() => {
      if (progressWrap) progressWrap.classList.add('hidden');
      if (progressFill) progressFill.style.width = '0%';
    }, 1200);
  }
}

async function handleNoteSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('noteTitle').value.trim();
  const category = document.getElementById('noteCategory').value.trim() || 'General';
  const content = document.getElementById('noteContent').value.trim();
  const tagsStr = document.getElementById('noteTags').value.trim();
  const submitBtn = document.getElementById('btnNoteSubmit');

  if (!title || !content) {
    setFormStatus('noteStatus', 'error', 'Judul dan konten wajib diisi.');
    return;
  }

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const res = await authFetch(`${API_BASE}/prompts`, {
      method: 'POST',
      body: JSON.stringify({ title, content, category, tags })
    });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('success', 'Catatan/Prompt berhasil disimpan.');
      setFormStatus('noteStatus', 'success', 'Tersimpan.');
      document.getElementById('noteTitle').value = '';
      document.getElementById('noteContent').value = '';
      document.getElementById('noteTags').value = '';
      await fetchAllData();
      await loadStatus();
      setFilter('prompts');
    } else {
      setFormStatus('noteStatus', 'error', json.error || 'Gagal menyimpan.');
      showToast('error', json.error || 'Gagal menyimpan catatan.');
    }
  } catch (err) {
    setFormStatus('noteStatus', 'error', err.message);
    showToast('error', 'Kesalahan: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Catatan';
  }
}

async function handleLinkSubmit(e) {
  e.preventDefault();
  const url = document.getElementById('linkUrl').value.trim();
  const title = document.getElementById('linkTitle').value.trim();
  const category = document.getElementById('linkCategory').value.trim() || 'General';
  const description = document.getElementById('linkDesc').value.trim();
  const submitBtn = document.getElementById('btnLinkSubmit');

  if (!url) {
    setFormStatus('linkStatus', 'error', 'URL wajib diisi.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const res = await authFetch(`${API_BASE}/links`, {
      method: 'POST',
      body: JSON.stringify({ url, title: title || undefined, category, description: description || undefined })
    });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('success', 'Tautan berhasil disimpan.');
      setFormStatus('linkStatus', 'success', 'Tersimpan.');
      document.getElementById('linkUrl').value = '';
      document.getElementById('linkTitle').value = '';
      document.getElementById('linkDesc').value = '';
      await fetchAllData();
      await loadStatus();
      setFilter('links');
    } else {
      setFormStatus('linkStatus', 'error', json.error || 'Gagal menyimpan tautan.');
      showToast('error', json.error || 'Gagal menyimpan tautan.');
    }
  } catch (err) {
    setFormStatus('linkStatus', 'error', err.message);
    showToast('error', 'Kesalahan: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Tautan';
  }
}
