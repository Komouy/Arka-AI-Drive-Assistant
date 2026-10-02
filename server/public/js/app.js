// ── ARKA Application Lifecycle & Keyboard Shortcuts ─────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAiChatSection();
  refreshIcons();
  setupDragAndDrop();
  setupClipboardPaste();
  checkAuthOnLoad();

  // ── Global Keyboard Shortcuts for Maximum UX Comfort ───────────────────────
  window.addEventListener('keydown', (e) => {
    const isTyping = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
    const isModalOpen = !document.getElementById('previewModalBackdrop')?.classList.contains('hidden');

    // 1. ESC: Close modal or mobile sidebar
    if (e.key === 'Escape') {
      const isCreateOpen = !document.getElementById('createModalBackdrop')?.classList.contains('hidden');
      if (isModalOpen) {
        closePreview();
        return;
      }
      if (isCreateOpen) {
        closeCreateModal();
        return;
      }
      toggleMobileSidebar(false);
    }

    // 2. Arrow Left & Right: Navigate images / files in preview modal
    if (isModalOpen && !isTyping) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePreview(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigatePreview(1);
        return;
      }
    }

    // 3. Ctrl+K or Cmd+K: Focus Arka AI Assistant
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      focusAiChat();
      return;
    }

    // Shortcuts below only apply when NOT typing in an input
    if (isTyping) return;

    // 4. '/': Focus Search Input
    if (e.key === '/') {
      const searchEl = document.getElementById('searchInput');
      const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
      if (searchEl && isDashboardVisible) {
        e.preventDefault();
        searchEl.focus();
        searchEl.select();
      }
      return;
    }

    // 5. 'r' or 'R': Refresh Data
    if (e.key === 'r' || e.key === 'R') {
      const btn = document.getElementById('btnRefresh');
      const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
      if (btn && isDashboardVisible) {
        handleRefresh(btn);
      }
      return;
    }

    // 6. 'c' or 'C': Open Create Modal
    if (e.key === 'c' || e.key === 'C') {
      const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
      if (isDashboardVisible) {
        e.preventDefault();
        openCreateModal('upload');
      }
      return;
    }

    // 7. Number keys (1-8): Quick Menu Switching
    const tabKeys = {
      '1': 'overview',
      '2': 'files',
      '3': 'images',
      '4': 'prompts',
      '5': 'links',
      '6': 'ai',
      '7': 'graph',
      '8': 'trash'
    };
    if (tabKeys[e.key]) {
      const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
      if (isDashboardVisible) {
        setFilter(tabKeys[e.key]);
      }
    }
  });
});
