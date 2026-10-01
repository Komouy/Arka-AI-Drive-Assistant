// ── ARKA Application Lifecycle & Keyboard Shortcuts ─────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  setupDragAndDrop();
  setupClipboardPaste();
  checkAuthOnLoad();

  // ── Global Keyboard Shortcuts for Maximum UX Comfort ───────────────────────
  window.addEventListener('keydown', (e) => {
    const isTyping = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
    const isModalOpen = !document.getElementById('previewModalBackdrop')?.classList.contains('hidden');

    // 1. ESC: Close modal or AI chat
    if (e.key === 'Escape') {
      if (isModalOpen) {
        closePreview();
        return;
      }
      if (aiChatOpen) {
        toggleAiChat();
        return;
      }
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

    // 3. Ctrl+K or Cmd+K: Toggle Arka AI Assistant
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggleAiChat();
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

    // 6. Number keys (1-6): Quick Tab Switching
    const tabKeys = {
      '1': 'all',
      '2': 'files',
      '3': 'images',
      '4': 'prompts',
      '5': 'links',
      '6': 'trash'
    };
    if (tabKeys[e.key]) {
      const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
      if (isDashboardVisible) {
        setFilter(tabKeys[e.key]);
      }
    }
  });
});
