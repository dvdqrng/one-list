const { contextBridge, ipcRenderer } = require('electron');

console.log('=== PRELOAD SCRIPT STARTING ===');
console.log('Process type:', process.type);
console.log('contextBridge available:', !!contextBridge);
console.log('ipcRenderer available:', !!ipcRenderer);

// Define the API
const electronAPI = {
  // ========== Unified Items API ==========
  getItems: () => {
    console.log('getItems called');
    return ipcRenderer.invoke('db:getItems');
  },
  createItem: (item) => {
    console.log('createItem called', item);
    return ipcRenderer.invoke('db:createItem', item);
  },
  createItems: (items) => {
    console.log('createItems called', items.length, 'items');
    return ipcRenderer.invoke('db:createItems', items);
  },
  updateItem: (id, updates) => {
    console.log('updateItem called', id, updates);
    return ipcRenderer.invoke('db:updateItem', id, updates);
  },
  updateItemPositions: (positionUpdates) => {
    console.log('updateItemPositions called', positionUpdates.length, 'updates');
    return ipcRenderer.invoke('db:updateItemPositions', positionUpdates);
  },
  deleteItem: (id) => {
    console.log('deleteItem called', id);
    return ipcRenderer.invoke('db:deleteItem', id);
  },
  toggleItem: (id) => {
    console.log('toggleItem called', id);
    return ipcRenderer.invoke('db:toggleItem', id);
  },
  getMaxPosition: () => {
    console.log('getMaxPosition called');
    return ipcRenderer.invoke('db:getMaxPosition');
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
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },

  // Focus Timer
  startFocusTimer: (duration) => {
    console.log('startFocusTimer called', duration);
    return ipcRenderer.invoke('focus:start', duration);
  },
  pauseFocusTimer: () => {
    console.log('pauseFocusTimer called');
    return ipcRenderer.invoke('focus:pause');
  },
  resumeFocusTimer: () => {
    console.log('resumeFocusTimer called');
    return ipcRenderer.invoke('focus:resume');
  },
  resetFocusTimer: () => {
    console.log('resetFocusTimer called');
    return ipcRenderer.invoke('focus:reset');
  },
  getFocusState: () => {
    console.log('getFocusState called');
    return ipcRenderer.invoke('focus:getState');
  },
  onFocusTimerTick: (callback) => {
    ipcRenderer.on('focus-timer-tick', (_, timeRemaining) => callback(timeRemaining));
  },
  onFocusTimerComplete: (callback) => {
    ipcRenderer.on('focus-timer-complete', () => callback());
  },
  removeFocusTimerListeners: () => {
    ipcRenderer.removeAllListeners('focus-timer-tick');
    ipcRenderer.removeAllListeners('focus-timer-complete');
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
