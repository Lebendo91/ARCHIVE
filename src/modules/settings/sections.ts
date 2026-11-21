import {
  HardDrive,
  Info,
  Keyboard,
  MessageSquareText,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

export type SettingsSectionId = 'general' | 'appearance' | 'storage' | 'ai' | 'shortcuts' | 'about';

/** Settings sections (specification §15), in display order. */
export const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; icon: LucideIcon }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'appearance', icon: Palette },
  { id: 'storage', icon: HardDrive },
  { id: 'ai', icon: MessageSquareText },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'about', icon: Info },
];
