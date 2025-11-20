const { contextBridge, ipcRenderer } = require('electron');

console.log('=== PRELOAD SCRIPT STARTING ===');
console.log('Process type:', process.type);
console.log('contextBridge available:', !!contextBridge);
console.log('ipcRenderer available:', !!ipcRenderer);

// Define the API
const electronAPI = {
  // Todos
  getTodos: () => {
    console.log('getTodos called');
    return ipcRenderer.invoke('db:getTodos');
  },
  createTodo: (todo) => {
    console.log('createTodo called', todo);
    return ipcRenderer.invoke('db:createTodo', todo);
  },
  createTodos: (todos) => {
    console.log('createTodos called', todos);
    return ipcRenderer.invoke('db:createTodos', todos);
  },
  updateTodo: (id, updates) => {
    console.log('updateTodo called', id, updates);
    return ipcRenderer.invoke('db:updateTodo', id, updates);
  },
  deleteTodo: (id) => {
    console.log('deleteTodo called', id);
    return ipcRenderer.invoke('db:deleteTodo', id);
  },
  toggleTodo: (id) => {
    console.log('toggleTodo called', id);
    return ipcRenderer.invoke('db:toggleTodo', id);
  },

  // Titles
  getTitles: () => {
    console.log('getTitles called');
    return ipcRenderer.invoke('db:getTitles');
  },
  createTitle: (text) => {
    console.log('createTitle called', text);
    return ipcRenderer.invoke('db:createTitle', text);
  },
  updateTitle: (id, text) => {
    console.log('updateTitle called', id, text);
    return ipcRenderer.invoke('db:updateTitle', id, text);
  },
  updateTitleCreatedAt: (id, createdAt) => {
    console.log('updateTitleCreatedAt called', id, createdAt);
    return ipcRenderer.invoke('db:updateTitleCreatedAt', id, createdAt);
  },
  deleteTitle: (id) => {
    console.log('deleteTitle called', id);
    return ipcRenderer.invoke('db:deleteTitle', id);
  },

  // Separators
  getSeparators: () => {
    console.log('getSeparators called');
    return ipcRenderer.invoke('db:getSeparators');
  },
  createSeparator: () => {
    console.log('createSeparator called');
    return ipcRenderer.invoke('db:createSeparator');
  },
  updateSeparatorCreatedAt: (id, createdAt) => {
    console.log('updateSeparatorCreatedAt called', id, createdAt);
    return ipcRenderer.invoke('db:updateSeparatorCreatedAt', id, createdAt);
  },
  deleteSeparator: (id) => {
    console.log('deleteSeparator called', id);
    return ipcRenderer.invoke('db:deleteSeparator', id);
  },

  // Transcription
  transcribeAudio: (audioBuffer) => {
    console.log('transcribeAudio called, buffer size:', audioBuffer.byteLength);
    return ipcRenderer.invoke('transcribe:audio', audioBuffer);
  },

  // AI Processing
  processTodoText: (input, existingTodos) => {
    console.log('processTodoText called');
    return ipcRenderer.invoke('ai:process-todo-text', input, existingTodos);
  },
  processBatchTodos: (inputs) => {
    console.log('processBatchTodos called', inputs.length, 'inputs');
    return ipcRenderer.invoke('ai:process-batch-todos', inputs);
  },
  findSimilarTasks: (todos) => {
    console.log('findSimilarTasks called', todos.length, 'todos');
    return ipcRenderer.invoke('ai:find-similar-tasks', todos);
  },

  // Auto-updates
  checkForUpdates: () => {
    console.log('checkForUpdates called');
    return ipcRenderer.invoke('check-for-updates');
  },
  downloadUpdate: () => {
    console.log('downloadUpdate called');
    return ipcRenderer.invoke('download-update');
  },
  installUpdate: () => {
    console.log('installUpdate called');
    return ipcRenderer.invoke('install-update');
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
};

try {
  // Expose database API to renderer process
  contextBridge.exposeInMainWorld('electronDB', electronAPI);
  console.log('=== electronDB successfully exposed to window ===');
  console.log('API keys:', Object.keys(electronAPI));
} catch (error) {
  console.error('=== FAILED TO EXPOSE electronDB ===', error);
  console.error('Error stack:', error.stack);
}
