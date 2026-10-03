import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { useDriveStore } from './store/useDriveStore';
import { api } from './services/api';

// Components & Views
import { Sidebar } from './components/Sidebar';
import { HeaderBar } from './components/HeaderBar';
import { LoginScreen } from './components/LoginScreen';
import { OverviewView } from './views/OverviewView';
import { DocumentView } from './views/DocumentView';
import { GalleryView } from './views/GalleryView';
import { PromptsView } from './views/PromptsView';
import { LinksView } from './views/LinksView';
import { AiChatView } from './views/AiChatView';
import { TrashView } from './views/TrashView';
import { PreviewModal } from './components/PreviewModal';
import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { BatchMoveModal } from './components/BatchMoveModal';
import { FloatingBatchBar } from './components/FloatingBatchBar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30 // 30 detik
    }
  }
});

function DashboardContent() {
  const queryClient = useQueryClient();
  const { currentFilter } = useDriveStore();

  // Queries
  const { data: files = [], refetch: refetchFiles, isFetching: isFetchingFiles } = useQuery({
    queryKey: ['files'],
    queryFn: () => api.getFiles()
  });

  const { data: folders = [], refetch: refetchFolders } = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.getFolders()
  });

  const { data: prompts = [], refetch: refetchPrompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api.getPrompts()
  });

  const { data: links = [], refetch: refetchLinks } = useQuery({
    queryKey: ['links'],
    queryFn: () => api.getLinks()
  });

  const { data: systemStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: () => api.getStatus()
  });

  const refreshAll = () => {
    refetchFiles();
    refetchFolders();
    refetchPrompts();
    refetchLinks();
    refetchStatus();
  };

  const trashFiles = files.filter(f => f.is_trash);
  const activeFiles = files.filter(f => !f.is_trash);

  // Active View Rendering
  const renderActiveView = () => {
    switch (currentFilter) {
      case 'overview':
        return <OverviewView files={activeFiles} prompts={prompts} links={links} systemStatus={systemStatus} />;
      case 'files':
        return <DocumentView files={activeFiles} onRefresh={refreshAll} />;
      case 'images':
        return <GalleryView files={activeFiles} onRefresh={refreshAll} />;
      case 'favorites':
        return (
          <DocumentView 
            files={activeFiles.filter(f => f.is_favorite)} 
            onRefresh={refreshAll} 
          />
        );
      case 'prompts':
        return <PromptsView prompts={prompts} onRefresh={refreshAll} />;
      case 'links':
        return <LinksView links={links} onRefresh={refreshAll} />;
      case 'ai':
        return <AiChatView onRefreshData={refreshAll} />;
      case 'trash':
        return <TrashView files={files} onRefresh={refreshAll} />;
      default:
        return <OverviewView files={activeFiles} prompts={prompts} links={links} systemStatus={systemStatus} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar 
        files={files} 
        folders={folders} 
        prompts={prompts} 
        links={links} 
        trash={trashFiles} 
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <HeaderBar 
          systemStatus={systemStatus} 
          onRefresh={refreshAll} 
          isRefreshing={isFetchingFiles} 
        />

        <main className="flex-1 overflow-y-auto bg-zinc-950">
          {renderActiveView()}
        </main>
      </div>

      {/* Floating & Modal Components */}
      <FloatingBatchBar onRefresh={refreshAll} />
      <PreviewModal files={files} prompts={prompts} />
      <UploadModal folders={folders} onUploadSuccess={refreshAll} />
      <NewFolderModal onFolderCreated={refetchFolders} />
      <BatchMoveModal folders={folders} onMoveSuccess={refreshAll} />
    </div>
  );
}

export default function App() {
  const { user, token, checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-400 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <span>Memuat sesi ARKA...</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
