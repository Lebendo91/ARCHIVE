import { create } from 'zustand';

interface SearchPaletteState {
  isOpen: boolean;
  /** Text the palette opens with. */
  initialText: string;
  open: (text?: string) => void;
  close: () => void;
}

/** The global search palette (Ctrl+K), opened from the top bar, the shortcut or a page. */
export const useSearchPalette = create<SearchPaletteState>()((set) => ({
  isOpen: false,
  initialText: '',
  open: (text = '') => {
    set({ isOpen: true, initialText: text });
  },
  close: () => {
    set({ isOpen: false });
  },
}));
