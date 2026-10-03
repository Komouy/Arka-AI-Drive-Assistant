// ── ARKA In-Browser Preview Engines Module ────────────────────────────────────

function togglePreviewExpand() {
  const backdrop = document.getElementById('previewModalBackdrop');
  if (!backdrop) return;
  const modalWindow = backdrop.querySelector('.modal-window');
  const btn = document.getElementById('previewModalExpandBtn');
  if (!modalWindow) return;

  const isFull = modalWindow.classList.toggle('fullscreen');
  if (btn) {
    btn.innerHTML = isFull ? '<i data-lucide="minimize-2" class="w-4 h-4"></i>' : '<i data-lucide="maximize-2" class="w-4 h-4"></i>';
    btn.title = isFull ? 'Kecilkan Layar' : 'Perbesar Layar Penuh';
  }
  refreshIcons();
}

function closePreview() {
  const backdrop = document.getElementById('previewModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.classList.add('hidden');
  const viewer = document.getElementById('previewViewerContainer');
  if (viewer) viewer.innerHTML = '';
}

function navigatePreview(direction) {
  if (!currentPreviewList || currentPreviewList.length <= 1) return;
  let nextIdx = currentPreviewIndex + direction;
  if (nextIdx < 0) nextIdx = currentPreviewList.length - 1;
  if (nextIdx >= currentPreviewList.length) nextIdx = 0;
  const nextItem = currentPreviewList[nextIdx];
  if (nextItem) {
    openPreview(nextItem.type || 'FILE', nextItem.id, false);
  }
}

// ── Multi-Format Rendering Engines ──────────────────────────────────────────
function renderSpreadsheetPreview(buffer, container, fileName) {
  try {
    if (typeof XLSX === 'undefined') throw new Error('Mesin pembaca spreadsheet belum termuat.');
    const wb = XLSX.read(buffer, { type: 'array' });
    if (!wb.SheetNames || wb.SheetNames.length === 0) throw new Error('File tidak memiliki sheet.');

    let activeSheetIdx = 0;

    function colName(n) {
      let s = '';
      while (n >= 0) {
        s = String.fromCharCode((n % 26) + 65) + s;
        n = Math.floor(n / 26) - 1;
      }
      return s;
    }

    function renderActiveSheet() {
      const sheetName = wb.SheetNames[activeSheetIdx];
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const maxCols = data.reduce((m, r) => Math.max(m, r.length), 0);
      let theadHtml = '<th class="corner-cell">#</th>';
      for (let c = 0; c < maxCols; c++) theadHtml += `<th>${colName(c)}</th>`;

      const tbodyHtml = data.map((row, rIdx) => {
        let rowHtml = `<td class="row-idx">${rIdx + 1}</td>`;
        for (let c = 0; c < maxCols; c++) {
          rowHtml += `<td>${escapeHtml(String(row[c] !== undefined ? row[c] : ''))}</td>`;
        }
        return `<tr>${rowHtml}</tr>`;
      }).join('');

      const tableWrap = container.querySelector('.excel-table-scroll');
      if (tableWrap) {
        tableWrap.innerHTML = `
          <table class="excel-table">
            <thead><tr>${theadHtml}</tr></thead>
            <tbody>${tbodyHtml || '<tr><td colspan="5" class="p-4 text-center text-zinc-500">Sheet kosong</td></tr>'}</tbody>
          </table>
        `;
      }
    }

    const tabsHtml = wb.SheetNames.map((name, idx) => `
      <button type="button" class="px-2.5 py-1 rounded text-xs font-mono transition-colors ${idx === 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-semibold' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700'}" data-idx="${idx}">
        ${escapeHtml(name)}
      </button>
    `).join('');

    container.innerHTML = `
      <div class="w-full flex flex-col h-full bg-white dark:bg-zinc-950 min-h-[360px] rounded overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center justify-between gap-3 p-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
          <div class="flex items-center gap-1.5 overflow-x-auto excel-sheet-tabs">
            ${tabsHtml}
          </div>
          <span class="text-xs font-mono text-zinc-500">${wb.SheetNames.length} sheet</span>
        </div>
        <div class="excel-table-scroll flex-1 overflow-auto max-h-[460px]"></div>
      </div>
    `;

    container.querySelectorAll('.excel-sheet-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.excel-sheet-tabs button').forEach(b => {
          b.className = 'px-2.5 py-1 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition-colors';
        });
        btn.className = 'px-2.5 py-1 rounded text-xs font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-semibold';
        activeSheetIdx = parseInt(btn.dataset.idx, 10);
        renderActiveSheet();
      });
    });

    renderActiveSheet();
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">Gagal merender spreadsheet: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderDocxPreview(buffer, container, fileName) {
  try {
    if (typeof mammoth === 'undefined') throw new Error('Mesin pembaca Word belum termuat.');
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    container.innerHTML = `
      <div class="w-full flex flex-col h-full bg-zinc-100 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div class="overflow-y-auto max-h-[500px] p-2 sm:p-6 flex justify-center bg-zinc-100 dark:bg-zinc-950">
          <div class="docx-paper">
            ${result.value || '<p class="text-zinc-500">Dokumen kosong.</p>'}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">Gagal merender dokumen Word: ${escapeHtml(err.message)}</div>`;
  }
}

let currentPdfDoc = null;
let currentPdfPage = 1;
let currentPdfScale = 1.0;

async function renderPdfPreview(url, container, fileName) {
  try {
    if (typeof pdfjsLib === 'undefined') {
      container.innerHTML = `<iframe class="w-full h-[520px] rounded border border-zinc-200 dark:border-zinc-800 bg-white" src="${url}"></iframe>`;
      return;
    }

    container.innerHTML = `
      <div class="pdf-viewer-wrap">
        <div class="pdf-toolbar">
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <button type="button" id="pdfPrevBtn" class="p-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <span class="text-zinc-600 dark:text-zinc-400 px-1">
              Hal <span id="pdfCurrentPage" class="font-bold text-zinc-900 dark:text-zinc-100">1</span> / <span id="pdfTotalPages">?</span>
            </span>
            <button type="button" id="pdfNextBtn" class="p-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <button type="button" id="pdfZoomOutBtn" title="Perkecil (-)" class="p-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
              <i data-lucide="zoom-out" class="w-4 h-4"></i>
            </button>
            <span id="pdfZoomLevel" class="text-zinc-600 dark:text-zinc-400 px-1">100%</span>
            <button type="button" id="pdfZoomInBtn" title="Perbesar (+)" class="p-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
              <i data-lucide="zoom-in" class="w-4 h-4"></i>
            </button>
            <button type="button" id="pdfFitWidthBtn" title="Sesuaikan Lebar" class="p-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
              <i data-lucide="maximize" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <div class="pdf-canvas-container" id="pdfCanvasWrap">
          <canvas id="pdfViewerCanvas"></canvas>
        </div>
      </div>
    `;
    refreshIcons();

    const res = await authFetch(url);
    if (!res.ok) throw new Error('Gagal mengambil file PDF.');
    const arrayBuffer = await res.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    currentPdfDoc = await loadingTask.promise;
    currentPdfPage = 1;
    currentPdfScale = 1.0;

    const totalPagesEl = container.querySelector('#pdfTotalPages');
    if (totalPagesEl) totalPagesEl.textContent = currentPdfDoc.numPages;

    async function renderPage(pageNum) {
      if (!currentPdfDoc || pageNum < 1 || pageNum > currentPdfDoc.numPages) return;
      currentPdfPage = pageNum;
      const page = await currentPdfDoc.getPage(pageNum);
      const canvas = container.querySelector('#pdfViewerCanvas');
      if (!canvas) return;
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: currentPdfScale });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      await page.render(renderContext).promise;

      const curPageEl = container.querySelector('#pdfCurrentPage');
      if (curPageEl) curPageEl.textContent = pageNum;
      const zoomLevelEl = container.querySelector('#pdfZoomLevel');
      if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(currentPdfScale * 100)}%`;
    }

    container.querySelector('#pdfPrevBtn')?.addEventListener('click', () => {
      if (currentPdfPage > 1) renderPage(currentPdfPage - 1);
    });
    container.querySelector('#pdfNextBtn')?.addEventListener('click', () => {
      if (currentPdfPage < currentPdfDoc.numPages) renderPage(currentPdfPage + 1);
    });
    container.querySelector('#pdfZoomInBtn')?.addEventListener('click', () => {
      if (currentPdfScale < 3.0) {
        currentPdfScale += 0.2;
        renderPage(currentPdfPage);
      }
    });
    container.querySelector('#pdfZoomOutBtn')?.addEventListener('click', () => {
      if (currentPdfScale > 0.4) {
        currentPdfScale -= 0.2;
        renderPage(currentPdfPage);
      }
    });
    container.querySelector('#pdfFitWidthBtn')?.addEventListener('click', () => {
      const wrap = container.querySelector('#pdfCanvasWrap');
      if (wrap) {
        const wrapWidth = wrap.clientWidth - 40;
        currentPdfDoc.getPage(currentPdfPage).then(p => {
          const unscaledVp = p.getViewport({ scale: 1.0 });
          currentPdfScale = Math.max(0.4, Math.min(2.5, wrapWidth / unscaledVp.width));
          renderPage(currentPdfPage);
        });
      }
    });

    await renderPage(1);
  } catch (err) {
    console.warn('[PDF Preview Fallback]', err);
    container.innerHTML = `<iframe class="w-full h-[520px] rounded border border-zinc-200 dark:border-zinc-800 bg-white" src="${url}"></iframe>`;
  }
}

async function renderTextCodePreview(url, container, fileName, ext) {
  try {
    const res = await authFetch(url);
    if (!res.ok) throw new Error('Gagal mengambil file teks.');
    const text = await res.text();
    const isMd = ['md', 'markdown'].includes(ext);

    if (isMd && typeof marked !== 'undefined') {
      container.innerHTML = `
        <div class="w-full flex flex-col h-full bg-white dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div class="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <span class="text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">Pratinjau Markdown</span>
          </div>
          <div class="overflow-y-auto max-h-[500px] p-4 sm:p-6 bg-white dark:bg-zinc-950 prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 font-sans leading-relaxed">
            ${marked.parse(text)}
          </div>
        </div>
      `;
      refreshIcons();
      return;
    }

    // Code files with Highlight.js
    let highlightedCode = '';
    const langMap = {
      js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
      py: 'python', json: 'json', html: 'xml', htm: 'xml', css: 'css', scss: 'scss', sql: 'sql', sh: 'bash',
      yml: 'yaml', yaml: 'yaml', toml: 'ini', xml: 'xml', c: 'c', cpp: 'cpp', java: 'java', go: 'go', rs: 'rust', php: 'php'
    };
    const targetLang = langMap[ext];

    if (typeof hljs !== 'undefined') {
      try {
        const textToHighlight = text.length > 100000 ? text.slice(0, 100000) : text;
        if (targetLang && hljs.getLanguage(targetLang)) {
          highlightedCode = hljs.highlight(textToHighlight, { language: targetLang }).value;
        } else {
          highlightedCode = hljs.highlightAuto(textToHighlight).value;
        }
        if (text.length > 100000) {
          highlightedCode += '\n\n' + escapeHtml(text.slice(100000));
        }
      } catch {
        highlightedCode = escapeHtml(text);
      }
    } else {
      highlightedCode = escapeHtml(text);
    }

    const lines = text.split('\n');
    const lineNums = lines.map((_, i) => i + 1).join('\n');

    container.innerHTML = `
      <div class="w-full flex flex-col bg-white dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div class="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs font-mono">
          <span class="text-zinc-600 dark:text-zinc-400 font-semibold uppercase text-[11px]">${ext.toUpperCase()} • ${lines.length} baris</span>
          <button type="button" id="copyCodeBtn" class="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 transition-colors inline-flex items-center gap-1.5">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i> <span>Salin Kode</span>
          </button>
        </div>
        <div class="flex overflow-auto max-h-[500px] font-mono text-xs">
          <div class="code-line-numbers select-none text-zinc-400 dark:text-zinc-600 text-right p-3 bg-zinc-50 dark:bg-zinc-900/60 border-r border-zinc-200 dark:border-zinc-800 min-w-[40px] leading-relaxed whitespace-pre">${lineNums}</div>
          <pre class="flex-1 p-3 text-zinc-800 dark:text-zinc-200 whitespace-pre overflow-x-auto leading-relaxed m-0 bg-white dark:bg-zinc-950"><code class="hljs">${highlightedCode}</code></pre>
        </div>
      </div>
    `;

    container.querySelector('#copyCodeBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      showToast('success', 'Kode berhasil disalin!');
    });

    refreshIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">Gagal membaca kode: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderZipPreview(buffer, container, fileName) {
  try {
    if (typeof JSZip === 'undefined') throw new Error('Mesin pembaca ZIP belum termuat.');
    const zip = await JSZip.loadAsync(buffer);
    const files = [];
    zip.forEach((relPath, file) => {
      files.push({ name: relPath, dir: file.dir, date: file.date });
    });

    const rows = files.map(f => `
      <div class="flex items-center justify-between px-3 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 font-mono text-xs text-zinc-700 dark:text-zinc-300">
        <span class="flex items-center gap-2 truncate">
          <i data-lucide="${f.dir ? 'folder' : 'file'}" class="w-3.5 h-3.5 ${f.dir ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}"></i>
          <span class="truncate">${escapeHtml(f.name)}</span>
        </span>
        <span class="text-[11px] text-zinc-400 dark:text-zinc-500">${f.date ? formatDate(f.date) : ''}</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="w-full flex flex-col h-full bg-white dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div class="p-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400">${files.length} berkas dalam arsip ZIP</div>
        <div class="overflow-y-auto max-h-[460px] p-2 flex flex-col gap-0.5">${rows || '<div class="p-4 text-center text-zinc-500">Arsip kosong</div>'}</div>
      </div>
    `;
    refreshIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">Gagal membaca arsip ZIP: ${escapeHtml(err.message)}</div>`;
  }
}

// ── Open Preview Modal ───────────────────────────────────────────────────────
function openPreview(type, id, buildList = true) {
  const backdrop = document.getElementById('previewModalBackdrop');
  const titleEl = document.getElementById('previewModalTitle');
  const typeBadge = document.getElementById('previewModalTypeBadge');
  const categoryBadge = document.getElementById('previewModalCategoryBadge');
  const viewerContainer = document.getElementById('previewViewerContainer');
  const metaContainer = document.getElementById('previewMetaContainer');
  const footerActions = document.getElementById('previewFooterActions');
  const navIndicator = document.getElementById('previewNavIndicator');

  if (!backdrop) return;

  viewerContainer.innerHTML = '';
  metaContainer.innerHTML = '';
  footerActions.innerHTML = '';

  const modalWindow = backdrop.querySelector('.modal-window');
  if (modalWindow) modalWindow.classList.remove('wide', 'fullscreen');

  // Siapkan daftar item untuk navigasi Next / Prev
  if (buildList) {
    if (type === 'FILE' && currentFilter === 'images') {
      currentPreviewList = (allData.files || []).filter(isImageFile).map(f => ({ type: 'FILE', id: f.id }));
    } else if (type === 'FILE' && currentFilter === 'files') {
      currentPreviewList = (allData.files || []).filter(f => !isImageFile(f)).map(f => ({ type: 'FILE', id: f.id }));
    } else if (type === 'FILE') {
      currentPreviewList = (allData.files || []).map(f => ({ type: 'FILE', id: f.id }));
    } else {
      currentPreviewList = [];
    }
  }

  currentPreviewIndex = currentPreviewList.findIndex(item => String(item.id) === String(id));
  if (navIndicator) {
    if (currentPreviewList.length > 1 && currentPreviewIndex >= 0) {
      navIndicator.textContent = `${currentPreviewIndex + 1} / ${currentPreviewList.length}`;
      navIndicator.parentElement.classList.remove('hidden');
    } else {
      navIndicator.parentElement.classList.add('hidden');
    }
  }

  if (type === 'PROMPT') {
    const item = allData.prompts.find(p => String(p.id) === String(id));
    if (!item) return;

    titleEl.textContent = item.title || 'Pratinjau Prompt';
    typeBadge.textContent = 'PROMPT';
    categoryBadge.textContent = item.category || 'General';

    viewerContainer.innerHTML = `<pre class="font-mono text-xs p-4 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">${escapeHtml(item.content)}</pre>`;
    footerActions.innerHTML = `
      <button class="px-3 py-1.5 rounded text-xs font-mono transition-colors inline-flex items-center gap-1.5 ${item.is_favorite ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700'}" onclick="toggleFavorite('PROMPT', '${escapeHtml(String(item.id))}', event); openPreview('PROMPT', '${escapeHtml(String(item.id))}', false);"><i data-lucide="star" class="w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : ''}"></i> <span>${item.is_favorite ? 'Favorit ⭐' : 'Tandai Favorit'}</span></button>
      <button class="px-3 py-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition-colors inline-flex items-center gap-1.5" onclick="handleCopyPrompt('${escapeHtml(String(item.id))}', this)"><i data-lucide="copy" class="w-3.5 h-3.5"></i> <span>Salin Prompt</span></button>
    `;
  } else if (type === 'LINK') {
    const item = allData.links.find(l => String(l.id) === String(id));
    if (!item) return;

    titleEl.textContent = item.title || item.domain || 'Pratinjau Link';
    typeBadge.textContent = 'LINK';
    categoryBadge.textContent = item.category || 'General';

    const safeUrl = escapeHtml(item.url || '');
    viewerContainer.innerHTML = `
      <div class="w-full flex flex-col h-[400px] rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white">
        <iframe class="w-full h-full border-none" src="${safeUrl}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
      </div>
      <div class="text-[11px] font-mono text-zinc-500 text-center mt-1">Jika situs dibatasi di dalam iframe, gunakan tombol Buka Tautan di bawah.</div>
    `;
    footerActions.innerHTML = `
      <button class="px-3 py-1.5 rounded text-xs font-mono transition-colors inline-flex items-center gap-1.5 ${item.is_favorite ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700'}" onclick="toggleFavorite('LINK', '${escapeHtml(String(item.id))}', event); openPreview('LINK', '${escapeHtml(String(item.id))}', false);"><i data-lucide="star" class="w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : ''}"></i> <span>${item.is_favorite ? 'Favorit ⭐' : 'Tandai Favorit'}</span></button>
      <button class="px-3 py-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition-colors inline-flex items-center gap-1.5" onclick="handleCopyLink('${escapeHtml(String(item.id))}', this)"><i data-lucide="copy" class="w-3.5 h-3.5"></i> <span>Salin URL</span></button>
      <a href="${safeUrl}" class="px-3 py-1.5 rounded text-xs font-mono bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-medium transition-colors inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" class="w-3.5 h-3.5"></i> <span>Buka Asli</span></a>
    `;
  } else if (type === 'FILE' || type === 'TRASH') {
    const item = allData.files.find(f => String(f.id) === String(id)) || allData.trash.find(f => String(f.id) === String(id));
    if (!item) return;

    titleEl.textContent = item.original_name || 'Pratinjau File';
    typeBadge.textContent = type === 'TRASH' ? 'SAMPAH' : 'FILE';
    categoryBadge.textContent = item.folder_name || 'root';

    const downloadUrl = `/api/files/${item.id}/download${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
    const viewUrl = item.public_url || item.publicUrl || `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}inline=1`;
    const mime = (item.mime_type || '').toLowerCase();
    const ext = (item.original_name || '').split('.').pop().toLowerCase();

    const isSpreadsheet = ['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext);
    const isDocx = ext === 'docx';
    const isMarkdown = ['md', 'markdown'].includes(ext);
    const isCodeText = ['txt', 'json', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'py', 'sql', 'sh', 'yml', 'yaml', 'toml', 'xml', 'log', 'env', 'c', 'cpp', 'java', 'go', 'rs', 'php'].includes(ext);
    const isZip = ext === 'zip';
    const isPdf = mime === 'application/pdf' || ext === 'pdf';

    if (modalWindow && (isSpreadsheet || isDocx || isMarkdown || isCodeText || isZip || isPdf)) {
      modalWindow.classList.add('wide');
    }

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      viewerContainer.innerHTML = `
        <div class="relative w-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800 min-h-[300px] max-h-[500px] overflow-hidden group">
          <img src="${viewUrl}" class="max-w-full max-h-[480px] object-contain rounded transition-transform duration-200" alt="${escapeHtml(item.original_name)}">
        </div>
      `;
    } else if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) {
      viewerContainer.innerHTML = `<video controls class="w-full max-h-[460px] rounded bg-black" src="${viewUrl}"></video>`;
    } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
      viewerContainer.innerHTML = `<div class="p-8 w-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800"><audio controls class="w-full max-w-md" src="${viewUrl}"></audio></div>`;
    } else if (isPdf) {
      viewerContainer.innerHTML = `<div class="p-12 text-center text-zinc-500 dark:text-zinc-400 font-mono text-xs flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 spin text-red-500 dark:text-red-400"></i> Memuat dokumen PDF...</div>`;
      renderPdfPreview(downloadUrl, viewerContainer, item.original_name);
    } else if (isSpreadsheet) {
      viewerContainer.innerHTML = `<div class="p-12 text-center text-zinc-500 dark:text-zinc-400 font-mono text-xs flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 spin text-emerald-500 dark:text-emerald-400"></i> Membaca spreadsheet...</div>`;
      authFetch(downloadUrl)
        .then(res => res.arrayBuffer())
        .then(buf => renderSpreadsheetPreview(buf, viewerContainer, item.original_name))
        .catch(err => { viewerContainer.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">${escapeHtml(err.message)}</div>`; });
    } else if (isDocx) {
      viewerContainer.innerHTML = `<div class="p-12 text-center text-zinc-500 dark:text-zinc-400 font-mono text-xs flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 spin text-blue-500 dark:text-blue-400"></i> Membaca dokumen Word...</div>`;
      authFetch(downloadUrl)
        .then(res => res.arrayBuffer())
        .then(buf => renderDocxPreview(buf, viewerContainer, item.original_name))
        .catch(err => { viewerContainer.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">${escapeHtml(err.message)}</div>`; });
    } else if (isMarkdown || isCodeText) {
      viewerContainer.innerHTML = `<div class="p-12 text-center text-zinc-500 dark:text-zinc-400 font-mono text-xs flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 spin text-cyan-500 dark:text-cyan-400"></i> Membaca kode teks...</div>`;
      renderTextCodePreview(downloadUrl, viewerContainer, item.original_name, ext);
    } else if (isZip) {
      viewerContainer.innerHTML = `<div class="p-12 text-center text-zinc-500 dark:text-zinc-400 font-mono text-xs flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 spin text-purple-500 dark:text-purple-400"></i> Membaca arsip ZIP...</div>`;
      authFetch(downloadUrl)
        .then(res => res.arrayBuffer())
        .then(buf => renderZipPreview(buf, viewerContainer, item.original_name))
        .catch(err => { viewerContainer.innerHTML = `<div class="p-8 text-center text-red-500 dark:text-red-400 font-mono text-xs">${escapeHtml(err.message)}</div>`; });
    } else {
      viewerContainer.innerHTML = `
        <div class="py-16 text-center text-zinc-500 font-sans flex flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800">
          <i data-lucide="file" class="w-10 h-10 text-zinc-400 dark:text-zinc-600"></i>
          <div class="text-sm font-medium text-zinc-750 dark:text-zinc-300">${escapeHtml(item.original_name)}</div>
          <div class="text-xs text-zinc-500">Pratinjau langsung tidak tersedia untuk tipe format ini. Silakan unduh file untuk membukanya.</div>
        </div>
      `;
    }

    const starBtnModal = type !== 'TRASH' ? `
      <button type="button" onclick="toggleFavorite('FILE', '${escapeHtml(String(item.id))}', event); openPreview('FILE', '${escapeHtml(String(item.id))}', false);" class="px-3 py-1.5 rounded text-xs font-mono transition-colors inline-flex items-center gap-1.5 ${item.is_favorite ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700'}" title="${item.is_favorite ? 'Lepas Pin / Hapus dari Favorit' : 'Sematkan ke Favorit ⭐'}">
        <i data-lucide="star" class="w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : ''}"></i>
        <span>${item.is_favorite ? 'Favorit ⭐' : 'Tandai Favorit'}</span>
      </button>
    ` : '';

    const askAiBtn = type !== 'TRASH' ? `
      <button type="button" onclick="askAiAboutFile('${escapeHtml(String(item.id))}', '${escapeHtml(item.original_name || '')}')" class="px-3 py-1.5 rounded text-xs font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors inline-flex items-center gap-1.5" title="Tanya AI tentang isi dokumen ini">
        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400"></i>
        <span>Tanya AI Dokumen</span>
      </button>
    ` : '';

    footerActions.innerHTML = `
      ${askAiBtn}
      ${starBtnModal}
      <button type="button" onclick="downloadFile('${escapeHtml(String(item.id))}', '${escapeHtml(item.original_name || 'unduhan')}')" class="px-3.5 py-1.5 rounded text-xs font-mono bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-medium transition-colors inline-flex items-center gap-1.5"><i data-lucide="download" class="w-3.5 h-3.5"></i> <span>Unduh File</span></button>
    `;
  }

  backdrop.classList.remove('hidden');
  backdrop.classList.add('open');
  refreshIcons();
}

function askAiAboutFile(fileId, fileName) {
  closePreview();
  if (typeof setFilter === 'function') {
    setFilter('ai');
  }
  const promptText = `Tolong jelaskan isi dan ringkasan penting dari file "${fileName}" (ID: ${fileId})`;
  setTimeout(() => {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.value = promptText;
      if (typeof aiChatAutoResize === 'function') aiChatAutoResize(input);
      input.focus();
    }
  }, 160);
}
