import { create } from 'zustand';

interface SidebarState {
  isCollapsed: boolean;
  toggle: () => void;
  setCollapsed: (isCollapsed: boolean) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  isCollapsed: false,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (isCollapsed) => set({ isCollapsed }),
}));
