const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

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

// Create main window
function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  // Always open DevTools to debug
  mainWindow.webContents.openDevTools();

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
        ...row,
        completed: Boolean(row.completed)
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
      INSERT INTO todos (id, title, details, completed, priority, due_date, category, ai_processing_status, group_title_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      INSERT INTO todos (id, title, details, completed, priority, due_date, category, ai_processing_status, group_title_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    if (updates.groupTitleId !== undefined) {
      fields.push('group_title_id = ?');
      params.push(updates.groupTitleId || null);
    }

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(params);
    stmt.free();

    saveDatabase();
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
