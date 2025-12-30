import { create } from 'zustand';

interface MainSidebarState {
  isCollapsed: boolean;
  toggle: () => void;
  setCollapsed: (isCollapsed: boolean) => void;
}

export const useMainSidebarStore = create<MainSidebarState>((set) => ({
  isCollapsed: false,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (isCollapsed) => set({ isCollapsed }),
}));
