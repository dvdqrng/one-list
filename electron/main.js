const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { autoUpdater } = require('electron-updater');
const OpenAI = require('openai');

// Load environment variables from .env.local (for production builds)
function loadEnvFile() {
  // Try multiple locations for .env.local
  const possiblePaths = [
    path.join(__dirname, '..', '.env.local'),  // Development: relative to electron folder
    path.join(app.getAppPath(), '.env.local'),  // Production: app bundle
    path.join(process.resourcesPath || '', '.env.local'),  // Production: resources folder
  ];

  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              let value = valueParts.join('=');
              // Remove quotes if present
              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }
              process.env[key.trim()] = value;
            }
          }
        });
        console.log('Loaded environment from:', envPath);
        return true;
      }
    } catch (error) {
      console.warn('Failed to load env from', envPath, error.message);
    }
  }
  console.warn('No .env.local file found');
  return false;
}

// Load env immediately
loadEnvFile();

// OpenAI client - initialized lazily
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('API')));
      throw new Error('OpenAI API key is not configured. Please add OPENAI_API_KEY to .env.local');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// AI Processing - Process todo text directly with OpenAI
async function processTodoText(input, existingTodos) {
  const todayDate = new Date().toISOString().split('T')[0];
  const truncatedInput = input.length > 4000 ? input.slice(0, 4000) + '...' : input;

  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a smart todo assistant. You must respond with valid JSON only. No markdown, no explanation.

Respond with this exact JSON structure:
{
  "newTodos": [
    {
      "title": "task title",
      "details": "optional details",
      "priority": "low|medium|high",
      "dueDate": "ISO date string or null",
      "category": "optional category"
    }
  ],
  "updates": [
    {
      "matchedTodoId": "existing todo ID",
      "updates": { "completed": true/false, "title": "...", etc },
      "reason": "why matched"
    }
  ]
}`
      },
      {
        role: 'user',
        content: `Analyze the user's input and extract actionable tasks.

USER INPUT:
"${truncatedInput}"

EXISTING TODOS (${existingTodos.length} total):
${existingTodos.length === 0 ? '(No existing tasks)' : existingTodos.map((t, i) => `${i + 1}. [ID: ${t.id}] "${t.title}"${t.completed ? ' ✓ COMPLETED' : ' ○ INCOMPLETE'}${t.priority ? ` (${t.priority})` : ''}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ''}${t.category ? ` [${t.category}]` : ''}${t.details ? ` - Details: ${t.details}` : ''}`).join('\n')}

=== INSTRUCTIONS ===

1. EXTRACT ACTIONABLE TASKS from the input:
   - Meeting transcripts → Extract action items, follow-ups, decisions
   - Conversations → Find "I need to...", "we should...", "TODO:", "action item:"
   - Notes → Extract tasks, reminders, things to do
   - Simple commands → "buy milk", "call dentist"

2. MATCH EXISTING TASKS (check BEFORE creating new):
   - "I bought eggs" → Find "Buy eggs" → mark completed
   - "the car should be red" → Find car task → add to details
   - Semantic matching: "Buy eggs" = "Get eggs" = "Purchase eggs"

3. COMPLETION DETECTION:
   - Past tense: "bought", "finished", "did", "called" → completed: true
   - Explicit: "done", "complete", "mark as done" → completed: true

4. CREATE NEW TASKS only if no similar task exists

DATE PARSING (Today: ${todayDate}):
- "next week" = 7 days, "tomorrow" = +1 day, "Monday" = next Monday

DEFAULTS for new tasks: priority="low", dueDate=today

IMPORTANT: Use EXACT task IDs when updating existing tasks!
Respond with JSON only.`
      }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(response.choices[0].message.content);

  const newTodos = (result.newTodos || []).map((todo) => ({
    id: crypto.randomUUID(),
    title: todo.title,
    details: todo.details,
    completed: false,
    priority: todo.priority || 'low',
    dueDate: todo.dueDate || todayDate,
    category: todo.category,
    createdAt: new Date().toISOString(),
  }));

  const updates = (result.updates || []).map((update) => ({
    id: update.matchedTodoId,
    updates: update.updates,
  }));

  return { newTodos, updates };
}

// AI Processing - Find similar tasks directly with OpenAI
async function findSimilarTasks(todos) {
  if (todos.length < 2) {
    return [];
  }

  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You analyze todo lists to find groups of similar/duplicate tasks that could be merged.
Respond with valid JSON only. Structure:
{
  "groups": [
    {
      "todoIds": ["id1", "id2"],
      "suggestedTitle": "merged task title",
      "reason": "why these are similar",
      "confidence": 0.9
    }
  ]
}`
      },
      {
        role: 'user',
        content: `Find groups of similar or duplicate tasks that could be merged:

${todos.map((t) => `[ID: ${t.id}] "${t.title}"${t.details ? ` - ${t.details}` : ''}`).join('\n')}

Only group tasks with confidence > 0.7. Respond with JSON only.`
      }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(response.choices[0].message.content);
  return (result.groups || []).map(group => ({
    todoIds: group.todoIds,
    suggestedMergedTitle: group.suggestedTitle,
    similarityReason: group.reason,
    confidenceScore: group.confidence
  }));
}

let mainWindow;
let db;
let SQL;
let dbPath;

// Initialize SQLite database
async function initDatabase() {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'notes.db');

  console.log('Database path:', dbPath);

  // Initialize sql.js
  SQL = await initSqlJs();

  // Load existing database or create new one
  let buffer;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      details TEXT,
      completed INTEGER DEFAULT 0,
      priority TEXT,
      due_date TEXT,
      category TEXT,
      ai_processing_status TEXT,
      group_title_id TEXT,
      indent INTEGER DEFAULT 0,
      project TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS titles (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS separators (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
    CREATE INDEX IF NOT EXISTS idx_todos_group_title_id ON todos(group_title_id);
  `);

  // Add indent and project columns if they don't exist (for existing databases)
  try {
    db.run('ALTER TABLE todos ADD COLUMN indent INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists
  }
  try {
    db.run('ALTER TABLE todos ADD COLUMN project TEXT');
  } catch (e) {
    // Column already exists
  }

  // Save database after initialization
  saveDatabase();
}

// Save database to disk
function saveDatabase() {
  if (!db || !dbPath) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Failed to save database:', error);
  }
}

// ========== Auto-Updater Configuration ==========

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('No updates available');
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${progressObj.percent}%`);
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

// IPC handlers for update actions
ipcMain.handle('check-for-updates', async () => {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return null;
  }
});

ipcMain.handle('download-update', async () => {
  try {
    return await autoUpdater.downloadUpdate();
  } catch (error) {
    console.error('Failed to download update:', error);
    throw error;
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Create main window
function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',  // Hide title bar but show traffic lights
    trafficLightPosition: { x: 16, y: 16 },  // Vertically center in 44px header: (44 - 12) / 2 = 16
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
      enableRemoteModule: false,
      webSecurity: false  // Disable web security to allow speech recognition API
    }
  });

  // Set permissions for clipboard and microphone API
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write', 'media'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // DevTools can be opened manually with Cmd+Option+I

  // Add keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Cmd+T or Ctrl+T: Load test page
    if ((input.control || input.meta) && input.key === 't' && input.type === 'keyDown') {
      event.preventDefault();
      const testPath = path.join(__dirname, 'test.html');
      console.log('Loading test page:', testPath);
      mainWindow.loadFile(testPath);
    }
    // Cmd+L or Ctrl+L: Try loading from localhost:3000
    if ((input.control || input.meta) && input.key === 'l' && input.type === 'keyDown') {
      event.preventDefault();
      console.log('Attempting to load localhost:3000...');
      mainWindow.loadURL('http://localhost:3000').catch(err => {
        console.error('Failed to load localhost:3000:', err.message);
      });
    }
  });

  // Log when preload script loads
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded');
    // Check if electronDB was exposed
    mainWindow.webContents.executeJavaScript('typeof window.electronDB')
      .then(result => console.log('window.electronDB type:', result))
      .catch(err => console.error('Failed to check electronDB:', err));
  });

  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorDescription, 'URL:', validatedURL);
  });

  // Load the app
  if (isDev) {
    // Try to connect to Next.js dev server
    const loadDevURL = async () => {
      console.log('Attempting to load http://localhost:3000...');
      console.log('Note: First load with Turbopack may take 30+ seconds to compile');

      try {
        // Set a longer timeout for first Turbopack compilation
        await mainWindow.loadURL('http://localhost:3000', {
          timeout: 60000  // 60 second timeout for Turbopack compilation
        });
        console.log('Successfully loaded dev server');
      } catch (err) {
        console.error('Failed to load dev server:', err.message);
        console.log('\nTroubleshooting:');
        console.log('1. Make sure Next.js dev server is running: npm run dev');
        console.log('2. Check if http://localhost:3000 works in your browser');
        console.log('3. Press Cmd+L to retry loading from localhost:3000');
        console.log('\nLoading test page instead...');
        await mainWindow.loadFile(path.join(__dirname, 'test.html'));
      }
    };
    loadDevURL();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('========================================');
  console.log('  ELECTRON APP STARTING');
  console.log('  Node version:', process.version);
  console.log('  Electron version:', process.versions.electron);
  console.log('  Working directory:', __dirname);
  console.log('========================================');

  await initDatabase();
  createWindow();

  // Check for updates in production
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000); // Check after 3 seconds to let the app fully load
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    saveDatabase();
    if (db) db.close();
    app.quit();
  }
});

app.on('will-quit', () => {
  saveDatabase();
  if (db) db.close();
});

// ========== IPC Handlers for Database Operations ==========

// Todos
ipcMain.handle('db:getTodos', () => {
  try {
    const stmt = db.prepare('SELECT * FROM todos ORDER BY created_at ASC');
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        title: row.title,
        details: row.details || undefined,
        completed: Boolean(row.completed),
        priority: row.priority || undefined,
        dueDate: row.due_date || undefined,
        category: row.category || undefined,
        aiProcessingStatus: row.ai_processing_status || undefined,
        groupTitleId: row.group_title_id || undefined,
        indent: row.indent || 0,
        project: row.project || undefined,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error('Failed to get todos:', error);
    return [];
  }
});

ipcMain.handle('db:createTodo', (event, todo) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO todos (id, title, details, completed, priority, due_date, category, ai_processing_status, group_title_id, indent, project, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      todo.id,
      todo.title,
      todo.details || null,
      todo.completed ? 1 : 0,
      todo.priority || null,
      todo.dueDate || null,
      todo.category || null,
      todo.aiProcessingStatus || null,
      todo.groupTitleId || null,
      todo.indent || 0,
      todo.project || null,
      todo.createdAt || now,
      now
    ]);
    stmt.free();

    saveDatabase();
    return { ...todo, createdAt: todo.createdAt || now, updatedAt: now };
  } catch (error) {
    console.error('Failed to create todo:', error);
    throw error;
  }
});

ipcMain.handle('db:createTodos', (event, todos) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO todos (id, title, details, completed, priority, due_date, category, ai_processing_status, group_title_id, indent, project, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    todos.forEach(todo => {
      stmt.run([
        todo.id,
        todo.title,
        todo.details || null,
        todo.completed ? 1 : 0,
        todo.priority || null,
        todo.dueDate || null,
        todo.category || null,
        todo.aiProcessingStatus || null,
        todo.groupTitleId || null,
        todo.indent || 0,
        todo.project || null,
        todo.createdAt || now,
        now
      ]);
    });

    stmt.free();
    saveDatabase();
    return todos;
  } catch (error) {
    console.error('Failed to create todos:', error);
    throw error;
  }
});

ipcMain.handle('db:updateTodo', (event, id, updates) => {
  try {
    console.log('[updateTodo] id:', id, 'updates:', updates);
    const fields = [];
    const params = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.details !== undefined) {
      fields.push('details = ?');
      params.push(updates.details || null);
    }
    if (updates.completed !== undefined) {
      fields.push('completed = ?');
      params.push(updates.completed ? 1 : 0);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      params.push(updates.priority || null);
    }
    if (updates.dueDate !== undefined) {
      fields.push('due_date = ?');
      params.push(updates.dueDate || null);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      params.push(updates.category || null);
    }
    if (updates.aiProcessingStatus !== undefined) {
      fields.push('ai_processing_status = ?');
      params.push(updates.aiProcessingStatus || null);
    }
    if ('groupTitleId' in updates) {
      fields.push('group_title_id = ?');
      params.push(updates.groupTitleId || null);
    }
    if ('indent' in updates) {
      fields.push('indent = ?');
      params.push(updates.indent || 0);
    }
    if ('project' in updates) {
      fields.push('project = ?');
      params.push(updates.project || null);
    }
    if (updates.createdAt !== undefined) {
      fields.push('created_at = ?');
      params.push(updates.createdAt);
    }

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(params);
    stmt.free();

    saveDatabase();
    console.log('[updateTodo] Successfully updated todo:', id);
    return { id, ...updates };
  } catch (error) {
    console.error('Failed to update todo:', error);
    throw error;
  }
});

ipcMain.handle('db:deleteTodo', (event, id) => {
  try {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
  } catch (error) {
    console.error('Failed to delete todo:', error);
    throw error;
  }
});

ipcMain.handle('db:toggleTodo', (event, id) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE todos SET completed = NOT completed, updated_at = ? WHERE id = ?');
    stmt.run([now, id]);
    stmt.free();

    const getTodo = db.prepare('SELECT * FROM todos WHERE id = ?');
    getTodo.bind([id]);
    getTodo.step();
    const row = getTodo.getAsObject();
    getTodo.free();

    saveDatabase();
    return { ...row, completed: Boolean(row.completed) };
  } catch (error) {
    console.error('Failed to toggle todo:', error);
    throw error;
  }
});

// Titles
ipcMain.handle('db:getTitles', () => {
  try {
    const stmt = db.prepare('SELECT * FROM titles ORDER BY created_at ASC');
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        text: row.text,
        createdAt: row.created_at
      });
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error('Failed to get titles:', error);
    return [];
  }
});

ipcMain.handle('db:createTitle', (event, text) => {
  try {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = db.prepare('INSERT INTO titles (id, text, created_at) VALUES (?, ?, ?)');
    stmt.run([id, text, createdAt]);
    stmt.free();

    saveDatabase();
    return { id, text, createdAt };
  } catch (error) {
    console.error('Failed to create title:', error);
    throw error;
  }
});

ipcMain.handle('db:updateTitle', (event, id, text) => {
  try {
    const stmt = db.prepare('UPDATE titles SET text = ? WHERE id = ?');
    stmt.run([text, id]);
    stmt.free();

    saveDatabase();
    return { id, text };
  } catch (error) {
    console.error('Failed to update title:', error);
    throw error;
  }
});

ipcMain.handle('db:updateTitleCreatedAt', (event, id, createdAt) => {
  try {
    const stmt = db.prepare('UPDATE titles SET created_at = ? WHERE id = ?');
    stmt.run([createdAt, id]);
    stmt.free();

    saveDatabase();
    return { id, createdAt };
  } catch (error) {
    console.error('Failed to update title createdAt:', error);
    throw error;
  }
});

ipcMain.handle('db:deleteTitle', (event, id) => {
  try {
    const stmt = db.prepare('DELETE FROM titles WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
  } catch (error) {
    console.error('Failed to delete title:', error);
    throw error;
  }
});

// Separators
ipcMain.handle('db:getSeparators', () => {
  try {
    const stmt = db.prepare('SELECT * FROM separators ORDER BY created_at ASC');
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        createdAt: row.created_at
      });
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error('Failed to get separators:', error);
    return [];
  }
});

ipcMain.handle('db:createSeparator', () => {
  try {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = db.prepare('INSERT INTO separators (id, created_at) VALUES (?, ?)');
    stmt.run([id, createdAt]);
    stmt.free();

    saveDatabase();
    return { id, createdAt };
  } catch (error) {
    console.error('Failed to create separator:', error);
    throw error;
  }
});

ipcMain.handle('db:updateSeparatorCreatedAt', (event, id, createdAt) => {
  try {
    const stmt = db.prepare('UPDATE separators SET created_at = ? WHERE id = ?');
    stmt.run([createdAt, id]);
    stmt.free();

    saveDatabase();
    return { id, createdAt };
  } catch (error) {
    console.error('Failed to update separator createdAt:', error);
    throw error;
  }
});

ipcMain.handle('db:deleteSeparator', (event, id) => {
  try {
    const stmt = db.prepare('DELETE FROM separators WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
  } catch (error) {
    console.error('Failed to delete separator:', error);
    throw error;
  }
});

// Whisper transcription
ipcMain.handle('transcribe:audio', async (event, audioBuffer) => {
  try {
    // Import dynamically to avoid conflicts with Electron
    const fetch = require('node-fetch');
    const FormData = require('form-data');

    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', Buffer.from(audioBuffer), {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    formData.append('model', 'whisper-1');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { text: data.text };
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
});

// AI Processing - Process todo text
ipcMain.handle('ai:process-todo-text', async (event, input, existingTodos) => {
  try {
    return await processTodoText(input, existingTodos);
  } catch (error) {
    console.error('Failed to process todo text:', error);
    throw error;
  }
});

// AI Processing - Find similar tasks
ipcMain.handle('ai:find-similar-tasks', async (event, todos) => {
  try {
    return await findSimilarTasks(todos);
  } catch (error) {
    console.error('Failed to find similar tasks:', error);
    throw error;
  }
});
