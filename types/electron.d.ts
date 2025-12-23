export interface Todo {
  id: string;
  title: string;
  details?: string;
  completed: boolean;
  priority?: string;
  dueDate?: string;
  category?: string;
  aiProcessingStatus?: string;
  groupTitleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Title {
  id: string;
  text: string;
  createdAt: string;
}

export interface Separator {
  id: string;
  createdAt: string;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface ElectronAPI {
  // Todos
  getTodos: () => Promise<Todo[]>;
  createTodo: (todo: Partial<Todo>) => Promise<Todo>;
  createTodos: (todos: Partial<Todo>[]) => Promise<Todo[]>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<Todo>;
  deleteTodo: (id: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<Todo>;

  // Titles
  getTitles: () => Promise<Title[]>;
  createTitle: (text: string) => Promise<Title>;
  updateTitle: (id: string, text: string) => Promise<Title>;
  updateTitleCreatedAt: (id: string, createdAt: string) => Promise<Title>;
  deleteTitle: (id: string) => Promise<void>;

  // Separators
  getSeparators: () => Promise<Separator[]>;
  createSeparator: () => Promise<Separator>;
  updateSeparatorCreatedAt: (id: string, createdAt: string) => Promise<Separator>;
  deleteSeparator: (id: string) => Promise<void>;

  // Transcription
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ text: string }>;

  // AI Processing
  processTodoText: (input: string, existingTodos: Todo[]) => Promise<{
    newTodos: Todo[];
    updates: Array<{ id: string; updates: Partial<Todo> }>;
  }>;
  processBatchTodos: (inputs: Array<{ index: number; text: string }>) => Promise<Array<{
    index: number;
    title: string;
    details?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    category?: string;
  }>>;
  findSimilarTasks: (todos: Todo[]) => Promise<{
    groups: Array<{
      taskIds: string[];
      primaryTaskId: string;
      similarityReason: string;
      confidenceScore: number;
      suggestedMerge: {
        title: string;
        details?: string;
        priority?: 'low' | 'medium' | 'high';
        dueDate?: string;
        category?: string;
      };
    }>;
  }>;

  // Auto-updates
  checkForUpdates?: () => Promise<any>;
  downloadUpdate?: () => Promise<any>;
  installUpdate?: () => void;
  onUpdateAvailable?: (callback: (info: UpdateInfo) => void) => (() => void);
  onCheckingForUpdate?: (callback: () => void) => (() => void);
  onUpdateNotAvailable?: (callback: (info: UpdateInfo) => void) => (() => void);
  onDownloadProgress?: (callback: (progress: DownloadProgress) => void) => (() => void);
  onUpdateDownloaded?: (callback: (info: UpdateInfo) => void) => (() => void);
  onUpdateError?: (callback: (error: string) => void) => (() => void);

  // Focus Timer
  startFocusTimer: (duration?: number) => Promise<{ success: boolean; timeRemaining: number }>;
  pauseFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>;
  resumeFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>;
  resetFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>;
  getFocusState: () => Promise<{ isRunning: boolean; timeRemaining: number }>;
  onFocusTimerTick: (callback: (timeRemaining: number) => void) => void;
  onFocusTimerComplete: (callback: () => void) => void;
  removeFocusTimerListeners: () => void;
}

declare global {
  interface Window {
    electronDB?: ElectronAPI;
  }
}

export { };
