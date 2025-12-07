const { app, BrowserWindow, ipcMain, Tray, nativeImage } = require('electron');
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
let tray = null;

// Focus Timer State (runs in main process for reliability)
const focusTimerState = {
  isRunning: false,
  timeRemaining: 1500, // 25 minutes in seconds
  intervalId: null
};

// Update tray title with timer display
function updateTrayTitle(seconds) {
  if (!tray) return;

  if (seconds <= 0 || !focusTimerState.isRunning) {
    tray.setTitle(''); // Clear when not running
  } else {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    tray.setTitle(` ${mins}:${secs.toString().padStart(2, '0')}`);
  }
}

// Start the focus timer
function startFocusTimer() {
  if (focusTimerState.intervalId) {
    clearInterval(focusTimerState.intervalId);
  }

  focusTimerState.isRunning = true;
  updateTrayTitle(focusTimerState.timeRemaining);

  focusTimerState.intervalId = setInterval(() => {
    if (focusTimerState.timeRemaining > 0) {
      focusTimerState.timeRemaining--;
      updateTrayTitle(focusTimerState.timeRemaining);

      // Sync with renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('focus-timer-tick', focusTimerState.timeRemaining);
      }
    } else {
      // Timer complete
      clearInterval(focusTimerState.intervalId);
      focusTimerState.intervalId = null;
      focusTimerState.isRunning = false;
      updateTrayTitle(0);

      // Notify renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('focus-timer-complete');
      }
    }
  }, 1000);
}

// Create tray icon
function createTray() {
  // Create a small icon for the tray (16x16 template image for macOS)
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');

  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    // Make it a template image for macOS (works with dark/light mode)
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
  } else {
    // Create a simple fallback icon if file doesn't exist
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Focus Timer');

  // Click to show/focus main window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

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

  // Create new unified items table (without is_now and parent_id initially for compatibility with migrations)
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      position INTEGER NOT NULL,
      title TEXT,
      details TEXT,
      completed INTEGER DEFAULT 0,
      status TEXT,
      priority TEXT,
      due_date TEXT,
      category TEXT,
      indent INTEGER DEFAULT 0,
      ai_processing_status TEXT,
      text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
    CREATE INDEX IF NOT EXISTS idx_items_completed ON items(completed);
  `);

  // Add parent_id column if it doesn't exist (migration for existing databases)
  try {
    db.run('ALTER TABLE items ADD COLUMN parent_id TEXT');
    console.log('Added parent_id column to items table');
  } catch (e) {
    // Column already exists, ignore
  }

  // Add is_now column if it doesn't exist (migration for existing databases)
  try {
    db.run('ALTER TABLE items ADD COLUMN is_now INTEGER DEFAULT 0');
    console.log('Added is_now column to items table');
  } catch (e) {
    // Column already exists, ignore
  }

  // Create indexes for parent_id and is_now (after columns exist)
  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id)');
  } catch (e) {
    // Index already exists or other error, ignore
  }

  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_items_is_now ON items(is_now)');
  } catch (e) {
    // Index already exists or other error, ignore
  }

  // Migrate data from legacy tables to new items table (if they exist)
  await migrateToItemsTable();

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

// Migrate data from legacy tables (todos, titles, separators) to unified items table
async function migrateToItemsTable() {
  try {
    // Check if items table already has data
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM items');
    countStmt.step();
    const itemsCount = countStmt.getAsObject().count;
    countStmt.free();

    if (itemsCount > 0) {
      console.log('Items table already has data, skipping migration');
      return;
    }

    // Check if legacy tables exist and have data
    let todoCount = 0;
    let titleCount = 0;
    let separatorCount = 0;

    try {
      const todoCountStmt = db.prepare('SELECT COUNT(*) as count FROM todos');
      todoCountStmt.step();
      todoCount = todoCountStmt.getAsObject().count;
      todoCountStmt.free();
    } catch (e) {
      // Table doesn't exist
    }

    try {
      const titleCountStmt = db.prepare('SELECT COUNT(*) as count FROM titles');
      titleCountStmt.step();
      titleCount = titleCountStmt.getAsObject().count;
      titleCountStmt.free();
    } catch (e) {
      // Table doesn't exist
    }

    try {
      const separatorCountStmt = db.prepare('SELECT COUNT(*) as count FROM separators');
      separatorCountStmt.step();
      separatorCount = separatorCountStmt.getAsObject().count;
      separatorCountStmt.free();
    } catch (e) {
      // Table doesn't exist
    }

    const legacyDataExists = todoCount > 0 || titleCount > 0 || separatorCount > 0;

    if (!legacyDataExists) {
      console.log('No legacy data to migrate');
      return;
    }

    console.log(`Migrating legacy data: ${todoCount} todos, ${titleCount} titles, ${separatorCount} separators`);

    // Collect all legacy items with their timestamps for ordering
    const allLegacyItems = [];

    // Get todos
    if (todoCount > 0) {
      const todosStmt = db.prepare('SELECT * FROM todos ORDER BY created_at ASC');
      while (todosStmt.step()) {
        const row = todosStmt.getAsObject();
        allLegacyItems.push({
          id: row.id,
          type: 'todo',
          title: row.title,
          details: row.details || null,
          completed: row.completed,
          status: null,
          priority: row.priority || null,
          due_date: row.due_date || null,
          category: row.category || null,
          indent: row.indent || 0,
          ai_processing_status: row.ai_processing_status || null,
          text: null,
          created_at: row.created_at,
          updated_at: row.updated_at || null,
          _sortTime: new Date(row.created_at).getTime()
        });
      }
      todosStmt.free();
    }

    // Get titles
    if (titleCount > 0) {
      const titlesStmt = db.prepare('SELECT * FROM titles ORDER BY created_at ASC');
      while (titlesStmt.step()) {
        const row = titlesStmt.getAsObject();
        allLegacyItems.push({
          id: row.id,
          type: 'title',
          title: null,
          details: null,
          completed: 0,
          status: null,
          priority: null,
          due_date: null,
          category: null,
          indent: 0,
          ai_processing_status: null,
          text: row.text,
          created_at: row.created_at,
          updated_at: null,
          _sortTime: new Date(row.created_at).getTime()
        });
      }
      titlesStmt.free();
    }

    // Get separators
    if (separatorCount > 0) {
      const separatorsStmt = db.prepare('SELECT * FROM separators ORDER BY created_at ASC');
      while (separatorsStmt.step()) {
        const row = separatorsStmt.getAsObject();
        allLegacyItems.push({
          id: row.id,
          type: 'separator',
          title: null,
          details: null,
          completed: 0,
          status: null,
          priority: null,
          due_date: null,
          category: null,
          indent: 0,
          ai_processing_status: null,
          text: null,
          created_at: row.created_at,
          updated_at: null,
          _sortTime: new Date(row.created_at).getTime()
        });
      }
      separatorsStmt.free();
    }

    // Sort by timestamp to determine position
    allLegacyItems.sort((a, b) => a._sortTime - b._sortTime);

    // Insert into items table with position
    const insertStmt = db.prepare(`
      INSERT INTO items (id, type, position, title, details, completed, status, priority, due_date, category, indent, ai_processing_status, text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    allLegacyItems.forEach((item, index) => {
      insertStmt.run([
        item.id,
        item.type,
        index, // Position based on sorted order
        item.title,
        item.details,
        item.completed,
        item.status,
        item.priority,
        item.due_date,
        item.category,
        item.indent,
        item.ai_processing_status,
        item.text,
        item.created_at,
        item.updated_at
      ]);
    });
    insertStmt.free();

    console.log(`Migration complete: ${allLegacyItems.length} items migrated to items table`);
  } catch (error) {
    console.error('Migration error:', error);
    // Don't throw - allow app to continue even if migration fails
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

  // Add keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12: Toggle DevTools
    if (input.key === 'F12' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
    // Cmd+Option+I or Ctrl+Shift+I: Toggle DevTools (alternative)
    if (((input.meta && input.alt) || (input.control && input.shift)) && input.key === 'i' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
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
  createTray();

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

// ========== IPC Handlers for Items API ==========

// Get all items sorted by position
ipcMain.handle('db:getItems', () => {
  try {
    const stmt = db.prepare('SELECT * FROM items ORDER BY position ASC');
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        type: row.type,
        position: row.position,
        parentId: row.parent_id || undefined,
        title: row.title || undefined,
        details: row.details || undefined,
        completed: Boolean(row.completed),
        status: row.status || undefined,
        priority: row.priority || undefined,
        dueDate: row.due_date || undefined,
        category: row.category || undefined,
        indent: row.indent || 0,
        isNow: Boolean(row.is_now),
        aiProcessingStatus: row.ai_processing_status || undefined,
        text: row.text || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined
      });
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error('Failed to get items:', error);
    return [];
  }
});

// Create a new item
ipcMain.handle('db:createItem', (_, item) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO items (id, type, position, parent_id, title, details, completed, status, priority, due_date, category, indent, is_now, ai_processing_status, text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      item.id,
      item.type,
      item.position,
      item.parentId || null,
      item.title || null,
      item.details || null,
      item.completed ? 1 : 0,
      item.status || null,
      item.priority || null,
      item.dueDate || null,
      item.category || null,
      item.indent || 0,
      item.isNow ? 1 : 0,
      item.aiProcessingStatus || null,
      item.text || null,
      item.createdAt || now,
      now
    ]);
    stmt.free();

    saveDatabase();
    return { ...item, createdAt: item.createdAt || now, updatedAt: now };
  } catch (error) {
    console.error('Failed to create item:', error);
    throw error;
  }
});

// Create multiple items
ipcMain.handle('db:createItems', (_, items) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO items (id, type, position, parent_id, title, details, completed, status, priority, due_date, category, indent, is_now, ai_processing_status, text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    items.forEach(item => {
      stmt.run([
        item.id,
        item.type,
        item.position,
        item.parentId || null,
        item.title || null,
        item.details || null,
        item.completed ? 1 : 0,
        item.status || null,
        item.priority || null,
        item.dueDate || null,
        item.category || null,
        item.indent || 0,
        item.isNow ? 1 : 0,
        item.aiProcessingStatus || null,
        item.text || null,
        item.createdAt || now,
        now
      ]);
    });

    stmt.free();
    saveDatabase();
    return items;
  } catch (error) {
    console.error('Failed to create items:', error);
    throw error;
  }
});

// Update an item
ipcMain.handle('db:updateItem', (_, id, updates) => {
  try {
    const fields = [];
    const params = [];

    if ('type' in updates) {
      fields.push('type = ?');
      params.push(updates.type);
    }
    if ('position' in updates) {
      fields.push('position = ?');
      params.push(updates.position);
    }
    if ('title' in updates) {
      fields.push('title = ?');
      params.push(updates.title || null);
    }
    if ('details' in updates) {
      fields.push('details = ?');
      params.push(updates.details || null);
    }
    if ('completed' in updates) {
      fields.push('completed = ?');
      params.push(updates.completed ? 1 : 0);
    }
    if ('status' in updates) {
      fields.push('status = ?');
      params.push(updates.status || null);
    }
    if ('priority' in updates) {
      fields.push('priority = ?');
      params.push(updates.priority || null);
    }
    if ('dueDate' in updates) {
      fields.push('due_date = ?');
      params.push(updates.dueDate || null);
    }
    if ('category' in updates) {
      fields.push('category = ?');
      params.push(updates.category || null);
    }
    if ('indent' in updates) {
      fields.push('indent = ?');
      params.push(updates.indent || 0);
    }
    if ('isNow' in updates) {
      fields.push('is_now = ?');
      params.push(updates.isNow ? 1 : 0);
    }
    if ('aiProcessingStatus' in updates) {
      fields.push('ai_processing_status = ?');
      params.push(updates.aiProcessingStatus || null);
    }
    if ('text' in updates) {
      fields.push('text = ?');
      params.push(updates.text || null);
    }
    if ('parentId' in updates) {
      fields.push('parent_id = ?');
      params.push(updates.parentId || null);
    }

    if (fields.length === 0) {
      return { id };
    }

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(params);
    stmt.free();

    saveDatabase();
    return { id, ...updates, updatedAt: now };
  } catch (error) {
    console.error('Failed to update item:', error);
    throw error;
  }
});

// Update positions for multiple items (for drag-and-drop reordering)
ipcMain.handle('db:updateItemPositions', (event, positionUpdates) => {
  try {
    const stmt = db.prepare('UPDATE items SET position = ?, updated_at = ? WHERE id = ?');
    const now = new Date().toISOString();

    positionUpdates.forEach(({ id, position }) => {
      stmt.run([position, now, id]);
    });

    stmt.free();
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Failed to update item positions:', error);
    throw error;
  }
});

// Delete an item
ipcMain.handle('db:deleteItem', (event, id) => {
  try {
    const stmt = db.prepare('DELETE FROM items WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Failed to delete item:', error);
    throw error;
  }
});

// Toggle completion for a todo item
ipcMain.handle('db:toggleItem', (event, id) => {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE items SET completed = NOT completed, updated_at = ? WHERE id = ?');
    stmt.run([now, id]);
    stmt.free();

    const getItem = db.prepare('SELECT * FROM items WHERE id = ?');
    getItem.bind([id]);
    getItem.step();
    const row = getItem.getAsObject();
    getItem.free();

    saveDatabase();
    return {
      id: row.id,
      type: row.type,
      position: row.position,
      completed: Boolean(row.completed),
      updatedAt: now
    };
  } catch (error) {
    console.error('Failed to toggle item:', error);
    throw error;
  }
});

// Get the max position (for adding new items at the end)
ipcMain.handle('db:getMaxPosition', () => {
  try {
    const stmt = db.prepare('SELECT MAX(position) as maxPos FROM items');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.maxPos ?? -1;
  } catch (error) {
    console.error('Failed to get max position:', error);
    return -1;
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
ipcMain.handle('ai:process-todo-text', async (_, input, existingTodos) => {
  try {
    return await processTodoText(input, existingTodos);
  } catch (error) {
    console.error('Failed to process todo text:', error);
    throw error;
  }
});

// AI Processing - Find similar tasks
ipcMain.handle('ai:find-similar-tasks', async (_, todos) => {
  try {
    return await findSimilarTasks(todos);
  } catch (error) {
    console.error('Failed to find similar tasks:', error);
    throw error;
  }
});

// ========== Focus Timer IPC Handlers ==========

// Start focus timer with optional duration
ipcMain.handle('focus:start', (_, duration = 1500) => {
  focusTimerState.timeRemaining = duration;
  startFocusTimer();
  return { success: true, timeRemaining: focusTimerState.timeRemaining };
});

// Pause focus timer
ipcMain.handle('focus:pause', () => {
  if (focusTimerState.intervalId) {
    clearInterval(focusTimerState.intervalId);
    focusTimerState.intervalId = null;
  }
  focusTimerState.isRunning = false;
  updateTrayTitle(focusTimerState.timeRemaining); // Shows paused time
  return { success: true, timeRemaining: focusTimerState.timeRemaining };
});

// Resume focus timer
ipcMain.handle('focus:resume', () => {
  if (!focusTimerState.isRunning && focusTimerState.timeRemaining > 0) {
    startFocusTimer();
  }
  return { success: true, timeRemaining: focusTimerState.timeRemaining };
});

// Reset focus timer
ipcMain.handle('focus:reset', () => {
  if (focusTimerState.intervalId) {
    clearInterval(focusTimerState.intervalId);
    focusTimerState.intervalId = null;
  }
  focusTimerState.isRunning = false;
  focusTimerState.timeRemaining = 1500; // Reset to 25 minutes
  updateTrayTitle(0);
  return { success: true, timeRemaining: focusTimerState.timeRemaining };
});

// Get current focus timer state
ipcMain.handle('focus:getState', () => {
  return {
    isRunning: focusTimerState.isRunning,
    timeRemaining: focusTimerState.timeRemaining
  };
});
