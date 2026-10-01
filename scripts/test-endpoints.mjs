import http from 'node:http';
import { app } from '../server/app.js';
import { getEnv } from '../server/config/env.js';

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[TEST] Ephemeral test server running on ${baseUrl}`);

  let failed = 0;
  let passed = 0;

  async function assert(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ ${desc}: ${err.message}`);
      failed++;
    }
  }

  try {
    let token = null;

    // 1. Auth Config
    await assert('GET /api/auth/config', async () => {
      const res = await fetch(`${baseUrl}/api/auth/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
    });

    // 2. Auth Login
    await assert('POST /api/auth/login', async () => {
      const password = getEnv('ARKA_PASSWORD');
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Dhaifan', password })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || !json.token) throw new Error('No token returned');
      token = json.token;
    });

    const headers = () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });

    // 3. System Status
    await assert('GET /api/status', async () => {
      const res = await fetch(`${baseUrl}/api/status`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || !json.data?.stats) throw new Error('Invalid stats payload');
      if (typeof json.data.stats.trash !== 'number') throw new Error('Trash count missing in stats');
    });

    // 4. Folders List & Hierarchical Creation
    let createdFolderId = null;
    let childFolderId = null;
    await assert('POST /api/folders (nested path)', async () => {
      const res = await fetch(`${baseUrl}/api/folders`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ path_str: 'AutomatedTest/NestedFolder' })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const json = await res.json();
      if (!json.success || !json.data?.id) throw new Error('Failed to create folder');
      childFolderId = json.data.id;
      createdFolderId = json.data.parent_id;
    });

    // 5. Cycle Prevention Test
    await assert('PATCH /api/folders/:id (cycle prevention)', async () => {
      if (!createdFolderId || !childFolderId) throw new Error('Folders not created');
      // Attempt to make parent folder a child of childFolderId
      const res = await fetch(`${baseUrl}/api/folders/${createdFolderId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ parent_id: childFolderId })
      });
      // Should return 400 Bad Request
      if (res.status !== 400) throw new Error(`Expected 400 on cycle move, got ${res.status}`);
      const json = await res.json();
      if (json.success) throw new Error('Cycle move was unexpectedly allowed');
    });

    // 6. Delete created folder (clean up)
    await assert('DELETE /api/folders/:id', async () => {
      if (createdFolderId) {
        const res = await fetch(`${baseUrl}/api/folders/${createdFolderId}`, {
          method: 'DELETE',
          headers: headers()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
    });

    // 7. Files List & Trash Filter
    await assert('GET /api/files & /api/files?trash=true', async () => {
      const resActive = await fetch(`${baseUrl}/api/files`, { headers: headers() });
      if (!resActive.ok) throw new Error(`HTTP ${resActive.status}`);
      const resTrash = await fetch(`${baseUrl}/api/files?trash=true`, { headers: headers() });
      if (!resTrash.ok) throw new Error(`HTTP ${resTrash.status}`);
    });

    // 8. Auto-Organize All
    await assert('POST /api/files/auto-organize-all', async () => {
      const res = await fetch(`${baseUrl}/api/files/auto-organize-all`, {
        method: 'POST',
        headers: headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || typeof json.count !== 'number') throw new Error('Invalid auto-organize response');
    });

    // 8. Prompts CRUD with special search chars
    let promptId = null;
    await assert('POST /api/prompts & Search with special chars', async () => {
      const res = await fetch(`${baseUrl}/api/prompts`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          title: 'Special(Comma, Paren) Test Prompt',
          content: 'This is a test prompt with commas, (parentheses), and tags.',
          category: 'Testing',
          tags: ['test', 'automated']
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      promptId = json.data?.id;

      // Now search with query containing comma and parenthesis:
      const searchRes = await fetch(`${baseUrl}/api/prompts?search=Special(Comma,%20Paren)`, {
        headers: headers()
      });
      if (!searchRes.ok) throw new Error(`Search failed HTTP ${searchRes.status}`);
      const searchJson = await searchRes.json();
      if (!searchJson.success || !Array.isArray(searchJson.data)) {
        throw new Error('Search result format invalid');
      }
    });

    // Clean up prompt
    if (promptId) {
      await assert('DELETE /api/prompts/:id', async () => {
        const res = await fetch(`${baseUrl}/api/prompts/${promptId}`, {
          method: 'DELETE',
          headers: headers()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
    }

    // 9. Links CRUD with special search chars
    let linkId = null;
    await assert('POST /api/links & Search with special chars', async () => {
      const res = await fetch(`${baseUrl}/api/links`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          url: 'https://example.com/test-endpoint',
          title: 'Example (Test, Comma) Link',
          category: 'Tools',
          tags: 'example,test'
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      linkId = json.data?.id;

      const searchRes = await fetch(`${baseUrl}/api/links?search=Example(Test,%20Comma)`, {
        headers: headers()
      });
      if (!searchRes.ok) throw new Error(`Search failed HTTP ${searchRes.status}`);
      const searchJson = await searchRes.json();
      if (!searchJson.success || !Array.isArray(searchJson.data)) {
        throw new Error('Search result format invalid');
      }
    });

    // Clean up link
    if (linkId) {
      await assert('DELETE /api/links/:id', async () => {
        const res = await fetch(`${baseUrl}/api/links/${linkId}`, {
          method: 'DELETE',
          headers: headers()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
    }

    // 10. AI Status
    await assert('GET /api/ai/status', async () => {
      const res = await fetch(`${baseUrl}/api/ai/status`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || !json.data?.providers) throw new Error('AI status format invalid');
      console.log(`    Groq: ${json.data.providers.groq?.available ? 'Available' : json.data.providers.groq?.error}`);
      console.log(`    Gemini: ${json.data.providers.gemini?.available ? 'Available' : json.data.providers.gemini?.error}`);
    });

    // 11. AI Ask Agent
    await assert('POST /api/ai/ask (agent reasoning)', async () => {
      const res = await fetch(`${baseUrl}/api/ai/ask`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ query: 'Apa itu ARKA?', reset: true })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      if (!json.success || !json.data?.answer) throw new Error('AI returned no answer');
      console.log(`    Agent answer snippet: "${json.data.answer.slice(0, 70)}..."`);
    });

  } finally {
    server.close();
  }

  console.log(`\n[TEST SUMMARY] Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
