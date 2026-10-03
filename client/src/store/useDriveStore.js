import { create } from 'zustand';

export const useDriveStore = create((set, get) => ({
  // Filter & Navigation
  currentFilter: 'overview',
  setFilter: (filter) => {
    set({ currentFilter: filter });
    if (filter !== 'files' && filter !== 'images') {
      get().clearSelection();
    }
  },

  // Folder filtering
  currentFolderFilter: null,
  setFolderFilter: (folderName) => set({ currentFolderFilter: folderName }),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Multi-Selection State for Batch Actions
  selectedFileIds: new Set(),
  toggleSelectFile: (fileId) => {
    const id = String(fileId);
    set((state) => {
      const next = new Set(state.selectedFileIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedFileIds: next };
    });
  },
  selectAllFiles: (ids) => {
    set({ selectedFileIds: new Set(ids.map(String)) });
  },
  clearSelection: () => {
    set({ selectedFileIds: new Set() });
  },

  // Modals & Panels
  isUploadModalOpen: false,
  openUploadModal: () => set({ isUploadModalOpen: true }),
  closeUploadModal: () => set({ isUploadModalOpen: false }),

  isNewFolderModalOpen: false,
  openNewFolderModal: () => set({ isNewFolderModalOpen: true }),
  closeNewFolderModal: () => set({ isNewFolderModalOpen: false }),

  isBatchMoveModalOpen: false,
  openBatchMoveModal: () => set({ isBatchMoveModalOpen: true }),
  closeBatchMoveModal: () => set({ isBatchMoveModalOpen: false }),

  // Preview Modal
  previewItem: null, // { type: 'FILE' | 'PROMPT' | 'LINK', id: string }
  previewList: [], // Array of items for Next/Prev
  openPreview: (type, id, list = []) => set({ previewItem: { type, id: String(id) }, previewList: list }),
  closePreview: () => set({ previewItem: null, previewList: [] }),
  navigatePreview: (direction) => {
    const { previewItem, previewList } = get();
    if (!previewItem || previewList.length <= 1) return;
    const currentIndex = previewList.findIndex((item) => String(item.id) === String(previewItem.id));
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + previewList.length) % previewList.length;
    const nextItem = previewList[nextIndex];
    if (nextItem) set({ previewItem: nextItem });
  },

  // Theme
  theme: localStorage.getItem('arka_theme') || 'dark',
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('arka_theme', newTheme);
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
      return { theme: newTheme };
    });
  }
}));
