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

  // Auto-updates
  checkForUpdates?: () => Promise<any>;
  downloadUpdate?: () => Promise<any>;
  installUpdate?: () => void;
  onUpdateAvailable?: (callback: (info: UpdateInfo) => void) => void;
  onDownloadProgress?: (callback: (progress: DownloadProgress) => void) => void;
  onUpdateDownloaded?: (callback: (info: UpdateInfo) => void) => void;
}

declare global {
  interface Window {
    electronDB?: ElectronAPI;
  }
}

export {};
