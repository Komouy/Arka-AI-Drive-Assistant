// ── ARKA Visual Graph Hub (Supabase ERD Style Canvas Engine) ─────────────────
const graphState = {
  mode: 'relations', // 'relations' | 'schema'
  panX: 60,
  panY: 50,
  scale: 1.0,
  isPanning: false,
  isDraggingNode: false,
  dragNodeId: null,
  dragStartX: 0,
  dragStartY: 0,
  nodeStartX: 0,
  nodeStartY: 0,
  searchQuery: '',
  positions: {},
  nodes: [],
  edges: []
};

function setGraphMode(mode) {
  graphState.mode = mode;
  const btnRel = document.getElementById('graphModeRelations');
  const btnSch = document.getElementById('graphModeSchema');
  if (btnRel) {
    btnRel.classList.toggle('bg-zinc-800', mode === 'relations');
    btnRel.classList.toggle('text-white', mode === 'relations');
  }
  if (btnSch) {
    btnSch.classList.toggle('bg-zinc-800', mode === 'schema');
    btnSch.classList.toggle('text-white', mode === 'schema');
  }
  renderGraph(true);
}

function zoomGraph(delta) {
  graphState.scale = Math.min(2.5, Math.max(0.3, graphState.scale + delta));
  applyGraphTransform();
  const zoomLabel = document.getElementById('graphZoomLevel');
  if (zoomLabel) zoomLabel.textContent = `${Math.round(graphState.scale * 100)}%`;
}

function resetGraphView() {
  graphState.panX = 60;
  graphState.panY = 50;
  graphState.scale = 1.0;
  applyGraphTransform();
  const zoomLabel = document.getElementById('graphZoomLevel');
  if (zoomLabel) zoomLabel.textContent = '100%';
}

function toggleGraphFullscreen() {
  const container = document.getElementById('graphContainer');
  if (!container) return;
  container.classList.toggle('fixed');
  container.classList.toggle('inset-0');
  container.classList.toggle('z-50');
  container.classList.toggle('h-screen');
  updateGraphSvgWires();
}

function handleGraphSearch(val) {
  graphState.searchQuery = String(val || '').trim().toLowerCase();
  const query = graphState.searchQuery;
  const nodes = document.querySelectorAll('.graph-node');
  nodes.forEach(node => {
    if (!query) {
      node.style.opacity = '1';
      node.style.borderColor = '#27272a';
      return;
    }
    const text = node.textContent.toLowerCase();
    const matches = text.includes(query);
    node.style.opacity = matches ? '1' : '0.25';
    node.style.borderColor = matches ? '#f97316' : '#27272a';
  });
}

function applyGraphTransform() {
  const world = document.getElementById('graphWorld');
  if (world) {
    world.style.transform = `translate(${graphState.panX}px, ${graphState.panY}px) scale(${graphState.scale})`;
  }
}

function autoLayoutGraph() {
  graphState.positions = {};
  renderGraph(true);
}

function buildGraphData() {
  const nodes = [];
  const edges = [];

  if (graphState.mode === 'schema') {
    nodes.push({
      id: 'schema_file_metadata',
      title: 'file_metadata',
      icon: 'bot',
      badge: 'table',
      defaultX: 60,
      defaultY: 80,
      rows: [
        { name: 'id', type: 'uuid', isPk: true },
        { name: 'file_id', type: 'uuid', isFk: true },
        { name: 'description', type: 'text' },
        { name: 'category', type: 'text' },
        { name: 'project', type: 'text' },
        { name: 'tags', type: 'jsonb' },
        { name: 'ai_analyzed', type: 'bool', isAi: true },
        { name: 'created_at', type: 'timestamptz' },
        { name: 'user_id', type: 'text' },
        { name: 'suggested_name', type: 'text', isAi: true },
        { name: 'suggested_folder', type: 'text', isAi: true }
      ]
    });

    nodes.push({
      id: 'schema_files',
      title: 'files',
      icon: 'files',
      badge: 'table',
      defaultX: 380,
      defaultY: 60,
      rows: [
        { name: 'id', type: 'uuid', isPk: true },
        { name: 'folder_id', type: 'uuid', isFk: true },
        { name: 'original_name', type: 'text', isPk: true },
        { name: 'stored_name', type: 'text', isPk: true },
        { name: 'mime_type', type: 'text' },
        { name: 'size', type: 'int8' },
        { name: 'storage_path', type: 'text', isPk: true },
        { name: 'public_url', type: 'text' },
        { name: 'is_inbox', type: 'bool' },
        { name: 'is_favorite', type: 'bool' },
        { name: 'is_trash', type: 'bool' },
        { name: 'created_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
        { name: 'user_id', type: 'text' },
        { name: 'gdrive_file_id', type: 'text' },
        { name: 'gdrive_view_url', type: 'text' },
        { name: 'storage_provider', type: 'text' }
      ]
    });

    nodes.push({
      id: 'schema_folders',
      title: 'folders',
      icon: 'folder',
      badge: 'table',
      defaultX: 700,
      defaultY: 120,
      rows: [
        { name: 'id', type: 'uuid', isPk: true },
        { name: 'name', type: 'text', isPk: true },
        { name: 'parent_id', type: 'uuid', isFk: true },
        { name: 'color', type: 'text' },
        { name: 'icon', type: 'text' },
        { name: 'created_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
        { name: 'user_id', type: 'text' }
      ]
    });

    nodes.push({
      id: 'schema_prompts',
      title: 'prompts',
      icon: 'terminal',
      badge: 'table',
      defaultX: 60,
      defaultY: 480,
      rows: [
        { name: 'id', type: 'uuid', isPk: true },
        { name: 'title', type: 'text', isPk: true },
        { name: 'content', type: 'text' },
        { name: 'category', type: 'text' },
        { name: 'tags', type: 'jsonb' },
        { name: 'is_favorite', type: 'bool' },
        { name: 'created_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
        { name: 'user_id', type: 'text' }
      ]
    });

    nodes.push({
      id: 'schema_links',
      title: 'links',
      icon: 'bookmark',
      badge: 'table',
      defaultX: 700,
      defaultY: 450,
      rows: [
        { name: 'id', type: 'uuid', isPk: true },
        { name: 'url', type: 'text', isPk: true },
        { name: 'title', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'category', type: 'text' },
        { name: 'tags', type: 'jsonb' },
        { name: 'domain', type: 'text' },
        { name: 'is_favorite', type: 'bool' },
        { name: 'created_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
        { name: 'user_id', type: 'text' }
      ]
    });

    edges.push({ from: 'schema_file_metadata', to: 'schema_files', type: 'relation-meta' });
    edges.push({ from: 'schema_files', to: 'schema_folders', type: 'relation-folder' });
    edges.push({ from: 'schema_folders', to: 'schema_folders', isLoop: true, type: 'relation-schema' });
  } else {
    const folders = (allData.folders || []);
    const files = (allData.files || []).filter(f => !f.is_trash);
    const prompts = (allData.prompts || []);
    const links = (allData.links || []);

    let folderColX = 60;
    let fileColX = 380;
    let metaColX = 700;
    let curFolderY = 60;

    const folderIds = new Set(folders.map(f => String(f.id)));

    // 1. Root Storage Node (Always guaranteed to exist so canvas is never empty)
    const rootFiles = files.filter(f => !f.folder_id && !f.is_inbox);
    nodes.push({
      id: 'folder_root',
      nodeType: 'FOLDER',
      rawId: null,
      title: 'Root Storage',
      icon: 'hard-drive',
      badge: `${rootFiles.length} file`,
      defaultX: folderColX,
      defaultY: curFolderY,
      rows: [
        { name: 'location', type: 'storage/uploads' },
        { name: 'total_files', type: `${rootFiles.length}` },
        { name: 'status', type: 'active' }
      ]
    });
    curFolderY += 200;

    // 2. User Folders
    folders.forEach(f => {
      const filesInFolder = files.filter(file => String(file.folder_id) === String(f.id));
      const folderNodeId = `folder_${f.id}`;
      nodes.push({
        id: folderNodeId,
        nodeType: 'FOLDER',
        rawId: f.id,
        title: f.name,
        icon: 'folder',
        badge: `${filesInFolder.length} file`,
        defaultX: folderColX,
        defaultY: curFolderY,
        rows: [
          { name: 'id', type: 'uuid', isPk: true },
          { name: 'name', type: f.name },
          { name: 'path', type: f.path || f.name },
          { name: 'total_files', type: `${filesInFolder.length}` }
        ]
      });
      curFolderY += 210;
    });

    // 3. Inbox Triage Node
    const inboxFiles = files.filter(f => f.is_inbox);
    if (inboxFiles.length > 0) {
      nodes.push({
        id: 'folder_inbox',
        nodeType: 'FOLDER',
        rawId: 'inbox',
        title: 'Inbox Triage',
        icon: 'inbox',
        badge: `${inboxFiles.length} file`,
        defaultX: folderColX,
        defaultY: curFolderY,
        rows: [
          { name: 'status', type: 'pending triage' },
          { name: 'total_files', type: `${inboxFiles.length}` }
        ]
      });
      curFolderY += 190;
    }

    // 4. Prompts Group
    if (prompts.length > 0) {
      nodes.push({
        id: 'group_prompts',
        nodeType: 'PROMPT',
        rawId: null,
        title: 'Prompts & Catatan',
        icon: 'terminal',
        badge: `${prompts.length} item`,
        defaultX: folderColX,
        defaultY: curFolderY,
        rows: [
          { name: 'type', type: 'knowledge' },
          { name: 'total', type: `${prompts.length}` }
        ]
      });
      curFolderY += 190;
    }

    // 5. Links Group
    if (links.length > 0) {
      nodes.push({
        id: 'group_links',
        nodeType: 'LINK',
        rawId: null,
        title: 'Tautan Web',
        icon: 'bookmark',
        badge: `${links.length} item`,
        defaultX: folderColX,
        defaultY: curFolderY,
        rows: [
          { name: 'type', type: 'bookmarks' },
          { name: 'total', type: `${links.length}` }
        ]
      });
      curFolderY += 190;
    }

    // 6. Files & File AI Nodes
    let curFileY = 60;
    const displayFiles = files.slice(0, 35);
    displayFiles.forEach(f => {
      const fileNodeId = `file_${f.id}`;
      const ext = (f.original_name || '').split('.').pop() || 'file';

      nodes.push({
        id: fileNodeId,
        nodeType: 'FILE',
        rawId: f.id,
        title: f.original_name,
        icon: 'file-text',
        badge: ext.toUpperCase(),
        defaultX: fileColX,
        defaultY: curFileY,
        rows: [
          { name: 'size', type: formatBytes(f.size) },
          { name: 'mime', type: (f.mime_type || '').split('/')[1] || 'binary' },
          { name: 'folder', type: f.folder_name || (f.is_inbox ? 'inbox' : 'root') },
          { name: 'ai_folder', type: f.suggested_folder || 'auto', isAi: true }
        ],
        canPreview: true
      });

      let targetFolderNodeId = 'folder_root';
      if (f.folder_id && folderIds.has(String(f.folder_id))) {
        targetFolderNodeId = `folder_${f.folder_id}`;
      } else if (f.is_inbox && inboxFiles.length > 0) {
        targetFolderNodeId = 'folder_inbox';
      }
      edges.push({ from: targetFolderNodeId, to: fileNodeId, type: 'relation-folder' });

      if (f.ai_analyzed || f.suggested_folder || f.description) {
        const metaNodeId = `meta_${f.id}`;
        nodes.push({
          id: metaNodeId,
          nodeType: 'META',
          rawId: f.id,
          title: `AI: ${f.suggested_folder || f.category || 'Metadata'}`,
          icon: 'bot',
          badge: 'AI Enriched',
          defaultX: metaColX,
          defaultY: curFileY,
          rows: [
            { name: 'category', type: f.category || f.project || 'General', isAi: true },
            { name: 'suggested_folder', type: f.suggested_folder || f.folder_name || '-', isAi: true },
            { name: 'tags', type: f.tags ? (Array.isArray(f.tags) ? f.tags.join(', ') : f.tags) : 'none' }
          ]
        });
        edges.push({ from: fileNodeId, to: metaNodeId, type: 'relation-meta' });
      }

      curFileY += 190;
    });

    // 7. Prompts Nodes
    const displayPrompts = prompts.slice(0, 8);
    displayPrompts.forEach(p => {
      const promptNodeId = `prompt_${p.id}`;
      nodes.push({
        id: promptNodeId,
        nodeType: 'PROMPT',
        rawId: p.id,
        title: p.title || 'Untitled Prompt',
        icon: 'terminal',
        badge: 'PROMPT',
        defaultX: fileColX,
        defaultY: curFileY,
        rows: [
          { name: 'category', type: p.category || 'General' },
          { name: 'tags', type: p.tags ? (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags) : '-' }
        ],
        canPreview: true
      });
      edges.push({ from: 'group_prompts', to: promptNodeId, type: 'relation-meta' });
      curFileY += 170;
    });

    // 8. Links Nodes
    const displayLinks = links.slice(0, 8);
    displayLinks.forEach(l => {
      const linkNodeId = `link_${l.id}`;
      nodes.push({
        id: linkNodeId,
        nodeType: 'LINK',
        rawId: l.id,
        title: l.title || l.domain || 'Link',
        icon: 'bookmark',
        badge: 'LINK',
        defaultX: fileColX,
        defaultY: curFileY,
        rows: [
          { name: 'domain', type: l.domain || 'web' },
          { name: 'category', type: l.category || 'General' }
        ],
        canPreview: true
      });
      edges.push({ from: 'group_links', to: linkNodeId, type: 'relation-folder' });
      curFileY += 170;
    });
  }

  // Filter edges to strictly validate that both ends exist in nodes
  const validNodeIds = new Set(nodes.map(n => n.id));
  const safeEdges = edges.filter(e => validNodeIds.has(e.from) && validNodeIds.has(e.to));

  graphState.nodes = nodes;
  graphState.edges = safeEdges;
  return { nodes, edges: safeEdges };
}

function renderGraph(reposition = false) {
  const container = document.getElementById('graphNodesLayer');
  const stats = document.getElementById('graphStats');
  if (!container) return;

  const { nodes, edges } = buildGraphData();
  if (stats) stats.textContent = `${nodes.length} node · ${edges.length} relasi`;

  container.innerHTML = '';

  nodes.forEach(node => {
    if (reposition || !graphState.positions[node.id]) {
      graphState.positions[node.id] = { x: node.defaultX, y: node.defaultY };
    }
    const pos = graphState.positions[node.id];

    const nodeEl = document.createElement('div');
    nodeEl.className = 'graph-node';
    nodeEl.id = `gnode_${node.id}`;
    nodeEl.dataset.id = node.id;
    nodeEl.dataset.type = node.nodeType || 'TABLE';
    if (node.rawId) nodeEl.dataset.rawId = node.rawId;
    nodeEl.style.left = `${pos.x}px`;
    nodeEl.style.top = `${pos.y}px`;

    const rowsHtml = (node.rows || []).map(r => `
      <div class="graph-node-row">
        <div class="flex items-center gap-1.5 truncate">
          <span class="text-[9px] ${r.isPk ? 'text-amber-400 font-bold' : r.isFk ? 'text-emerald-400 font-bold' : r.isAi ? 'text-sky-400 font-bold' : 'text-zinc-500'}">◆</span>
          <span class="truncate">${escapeHtml(r.name)}</span>
        </div>
        <span class="text-[10px] text-zinc-500">${escapeHtml(r.type || '')}</span>
      </div>
    `).join('');

    let footerHtml = '';
    if (node.canPreview) {
      footerHtml = `
        <div class="graph-node-footer">
          <button class="px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors inline-flex items-center gap-1" onclick="openPreview('FILE', '${node.rawId}')" title="Buka Pratinjau">
            <i data-lucide="eye" class="w-3 h-3"></i> <span>Pratinjau</span>
          </button>
        </div>
      `;
    }

    nodeEl.innerHTML = `
      <div class="graph-node-header ${String(node.nodeType || '').toLowerCase()}" data-drag-handle="true">
        <div class="graph-node-title flex items-center gap-1.5">
          <i data-lucide="${node.icon || 'table'}" class="w-3.5 h-3.5"></i>
          <span>${escapeHtml(node.title)}</span>
        </div>
        <span class="graph-node-badge">${escapeHtml(node.badge || '')}</span>
      </div>
      <div class="graph-node-body">
        ${rowsHtml}
      </div>
      ${footerHtml}
    `;

    container.appendChild(nodeEl);
  });

  applyGraphTransform();
  updateGraphSvgWires();
  setupGraphInteractions();
  refreshIcons();
}

function updateGraphSvgWires() {
  const svg = document.getElementById('graphSvgLayer');
  if (!svg) return;

  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  if (defs) svg.appendChild(defs);

  const edges = graphState.edges || [];
  edges.forEach(edge => {
    const fromPos = graphState.positions[edge.from];
    const toPos = graphState.positions[edge.to];
    if (!fromPos || !toPos) return;

    const fromNodeEl = document.getElementById(`gnode_${edge.from}`);
    const toNodeEl = document.getElementById(`gnode_${edge.to}`);
    const fromW = (fromNodeEl && fromNodeEl.offsetWidth > 0) ? fromNodeEl.offsetWidth : 250;
    const toW = (toNodeEl && toNodeEl.offsetWidth > 0) ? toNodeEl.offsetWidth : 250;

    let x1 = fromPos.x + fromW;
    let y1 = fromPos.y + 36;
    let x2 = toPos.x;
    let y2 = toPos.y + 36;

    let d = '';
    if (edge.isLoop) {
      const loopH = 65;
      d = `M ${x1} ${y1} C ${x1 + 60} ${y1 - loopH}, ${x1 + 60} ${y1 + loopH}, ${x1} ${y1 + 40}`;
    } else {
      const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
      d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `graph-wire ${edge.type || 'relation-folder'}`);
    path.setAttribute('d', d);
    svg.appendChild(path);

    const dot1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot1.setAttribute('class', `graph-port-dot ${edge.type === 'relation-meta' ? 'meta' : 'folder'}`);
    dot1.setAttribute('cx', x1);
    dot1.setAttribute('cy', y1);
    dot1.setAttribute('r', '3.5');
    svg.appendChild(dot1);

    if (!edge.isLoop) {
      const dot2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot2.setAttribute('class', `graph-port-dot ${edge.type === 'relation-meta' ? 'meta' : 'folder'}`);
      dot2.setAttribute('cx', x2);
      dot2.setAttribute('cy', y2);
      dot2.setAttribute('r', '3.5');
      svg.appendChild(dot2);
    }
  });
}

let graphEventsInitialized = false;
function setupGraphInteractions() {
  if (graphEventsInitialized) return;
  graphEventsInitialized = true;

  const viewport = document.getElementById('graphViewport');
  if (!viewport) return;

  // Mouse pan initiation
  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.graph-node')) return;
    graphState.isPanning = true;
    graphState.startX = e.clientX - graphState.panX;
    graphState.startY = e.clientY - graphState.panY;
  });

  // Mouse dragging & panning movement
  window.addEventListener('mousemove', (e) => {
    if (graphState.isPanning) {
      graphState.panX = e.clientX - graphState.startX;
      graphState.panY = e.clientY - graphState.startY;
      applyGraphTransform();
    } else if (graphState.isDraggingNode && graphState.dragNodeId) {
      const dx = (e.clientX - graphState.dragStartX) / graphState.scale;
      const dy = (e.clientY - graphState.dragStartY) / graphState.scale;
      const newX = Math.round(graphState.nodeStartX + dx);
      const newY = Math.round(graphState.nodeStartY + dy);
      graphState.positions[graphState.dragNodeId] = { x: newX, y: newY };

      const nodeEl = document.getElementById(`gnode_${graphState.dragNodeId}`);
      if (nodeEl) {
        nodeEl.style.left = `${newX}px`;
        nodeEl.style.top = `${newY}px`;
      }
      updateGraphSvgWires();
    }
  });

  window.addEventListener('mouseup', () => {
    graphState.isPanning = false;
    graphState.isDraggingNode = false;
    graphState.dragNodeId = null;
  });

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    zoomGraph(delta);
  }, { passive: false });

  // Mouse node drag handle start
  viewport.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('[data-drag-handle="true"], .graph-node-header');
    if (!handle) return;
    const node = handle.closest('.graph-node');
    if (!node) return;

    const nodeId = node.dataset.id;
    graphState.isDraggingNode = true;
    graphState.dragNodeId = nodeId;
    graphState.dragStartX = e.clientX;
    graphState.dragStartY = e.clientY;
    const currentPos = graphState.positions[nodeId] || { x: node.offsetLeft, y: node.offsetTop };
    graphState.nodeStartX = currentPos.x;
    graphState.nodeStartY = currentPos.y;
    e.stopPropagation();
  });

  // ── Touch Events for Mobile / Tablet Support ──
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const handle = e.target.closest('[data-drag-handle="true"], .graph-node-header');
      if (handle) {
        const node = handle.closest('.graph-node');
        if (node) {
          const nodeId = node.dataset.id;
          graphState.isDraggingNode = true;
          graphState.dragNodeId = nodeId;
          graphState.dragStartX = touch.clientX;
          graphState.dragStartY = touch.clientY;
          const currentPos = graphState.positions[nodeId] || { x: node.offsetLeft, y: node.offsetTop };
          graphState.nodeStartX = currentPos.x;
          graphState.nodeStartY = currentPos.y;
          e.stopPropagation();
          return;
        }
      }
      if (!e.target.closest('.graph-node')) {
        graphState.isPanning = true;
        graphState.startX = touch.clientX - graphState.panX;
        graphState.startY = touch.clientY - graphState.panY;
      }
    }
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (graphState.isPanning) {
        e.preventDefault();
        graphState.panX = touch.clientX - graphState.startX;
        graphState.panY = touch.clientY - graphState.startY;
        applyGraphTransform();
      } else if (graphState.isDraggingNode && graphState.dragNodeId) {
        e.preventDefault();
        const dx = (touch.clientX - graphState.dragStartX) / graphState.scale;
        const dy = (touch.clientY - graphState.dragStartY) / graphState.scale;
        const newX = Math.round(graphState.nodeStartX + dx);
        const newY = Math.round(graphState.nodeStartY + dy);
        graphState.positions[graphState.dragNodeId] = { x: newX, y: newY };

        const nodeEl = document.getElementById(`gnode_${graphState.dragNodeId}`);
        if (nodeEl) {
          nodeEl.style.left = `${newX}px`;
          nodeEl.style.top = `${newY}px`;
        }
        updateGraphSvgWires();
      }
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    graphState.isPanning = false;
    graphState.isDraggingNode = false;
    graphState.dragNodeId = null;
  });
}
