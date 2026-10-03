import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Image as ImageIcon, 
  Star, 
  Terminal, 
  Bookmark, 
  Bot, 
  Trash2, 
  FolderPlus, 
  Folder, 
  ChevronRight, 
  Sun, 
  Moon, 
  LogOut, 
  Layers, 
  HardDrive,
  Sparkles
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { useAuthStore } from '../store/useAuthStore';

export function Sidebar({ files = [], folders = [], prompts = [], links = [], trash = [] }) {
  const { 
    currentFilter, 
    setFilter, 
    currentFolderFilter, 
    setFolderFilter, 
    openNewFolderModal,
    theme,
    toggleTheme
  } = useDriveStore();
  const { user, logout, providerToken } = useAuthStore();

  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Filter calculations
  const isImageTab = currentFilter === 'images';
  const docFiles = files.filter(f => !f.is_trash && !isImageFile(f));
  const imageFiles = files.filter(f => !f.is_trash && isImageFile(f));
  const favCount = files.filter(f => f.is_favorite && !f.is_trash).length +
                   prompts.filter(p => p.is_favorite).length +
                   links.filter(l => l.is_favorite).length;

  const relevantFiles = isImageTab ? imageFiles : docFiles;

  function isImageFile(f) {
    if (!f) return false;
    const mime = (f.mime_type || f.type || '').toLowerCase();
    const name = (f.original_name || f.name || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  }

  const toggleFolder = (folderId, e) => {
    e.stopPropagation();
    const idStr = String(folderId);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  };

  // Build recursive tree
  const folderMap = new Map();
  const rootNodes = [];
  folders.forEach(f => folderMap.set(String(f.id), { ...f, children: [] }));
  folders.forEach(f => {
    const node = folderMap.get(String(f.id));
    if (f.parent_id && folderMap.has(String(f.parent_id))) {
      folderMap.get(String(f.parent_id)).children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  const navItems = [
    { id: 'overview', label: 'Beranda', icon: LayoutDashboard, badge: null, color: 'text-zinc-400' },
    { id: 'files', label: 'Dokumen', icon: FileText, badge: docFiles.length, color: 'text-blue-500' },
    { id: 'images', label: 'Galeri Gambar', icon: ImageIcon, badge: imageFiles.length, color: 'text-emerald-500' },
    { id: 'favorites', label: 'Favorit & Pin', icon: Star, badge: favCount, color: 'text-amber-500' },
    { id: 'prompts', label: 'Catatan & Prompt', icon: Terminal, badge: prompts.length, color: 'text-purple-500' },
    { id: 'links', label: 'Tautan Tersimpan', icon: Bookmark, badge: links.length, color: 'text-amber-500' },
    { id: 'ai', label: 'Arka AI Assistant', icon: Bot, badge: 'AI', color: 'text-amber-500', isAi: true },
    { id: 'trash', label: 'Tong Sampah', icon: Trash2, badge: trash.length, color: 'text-rose-500' },
  ];

  const renderTreeNode = (node, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedFolders.has(String(node.id));
    const isActive = currentFolderFilter === node.name || currentFolderFilter === node.path;
    const folderFiles = relevantFiles.filter(f => f.folder_name === node.name || f.folder_id === node.id);

    return (
      <div key={node.id} style={{ paddingLeft: `${depth * 10}px` }}>
        <div 
          onClick={() => {
            setFolderFilter(node.name);
            if (currentFilter !== 'files' && currentFilter !== 'images') {
              setFilter('files');
            }
          }}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
            isActive 
              ? 'bg-blue-500/10 text-blue-500 font-medium' 
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          {hasChildren ? (
            <button 
              type="button" 
              onClick={(e) => toggleFolder(node.id, e)}
              className="p-0.5 text-zinc-500 hover:text-zinc-300"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-3" />
          )}
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
          <span className="truncate flex-1">{node.name}</span>
          <span className="text-[10px] font-mono text-zinc-500 px-1 rounded bg-zinc-800/50">
            {folderFiles.length}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-zinc-800/60 ml-2 mt-0.5 space-y-0.5">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Dhaifan';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <aside className="w-64 h-screen flex flex-col flex-shrink-0 border-r border-zinc-800/60 bg-zinc-950/90 backdrop-blur-xl select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5 text-zinc-100">
              ARKA <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PRO</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400">AI Drive Assistant</div>
          </div>
        </div>

        <button 
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          title="Ganti Tema"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
        <div className="px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
          Menu Utama
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentFilter === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setFilter(item.id);
                setFolderFilter(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${item.color}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  item.isAi 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                    : 'bg-zinc-800/80 text-zinc-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Folder Hierarchy Section */}
        <div className="pt-4 pb-1 flex items-center justify-between px-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
            Pohon Folder
          </span>
          <button
            type="button"
            onClick={openNewFolderModal}
            className="p-1 rounded text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            title="Folder Baru"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Root Node */}
        <div
          onClick={() => {
            setFolderFilter(null);
            if (currentFilter !== 'files' && currentFilter !== 'images') setFilter('files');
          }}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
            !currentFolderFilter && (currentFilter === 'files' || currentFilter === 'images')
              ? 'bg-blue-500/10 text-blue-500 font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-zinc-400" />
          <span className="truncate flex-1">{isImageTab ? 'Semua Gambar' : 'Semua Dokumen'}</span>
          <span className="text-[10px] font-mono text-zinc-400 px-1 rounded bg-zinc-800/50">
            {relevantFiles.length}
          </span>
        </div>

        {/* Tree Nodes */}
        <div className="space-y-0.5 mt-1">
          {rootNodes.map(root => renderTreeNode(root))}
        </div>
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/60">
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/50">
          <div className="flex items-center gap-2.5 min-w-0">
            {userAvatar ? (
              <img src={userAvatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                {userName.charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate text-zinc-200">{userName}</div>
              <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                {providerToken ? (
                  <span className="text-emerald-400 flex items-center gap-0.5">
                    <HardDrive className="w-2.5 h-2.5" /> Drive Terhubung
                  </span>
                ) : (
                  <span>Supabase Cloud</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
