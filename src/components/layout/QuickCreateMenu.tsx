import { Boxes, FileUp, NotebookPen, Plus } from 'lucide-react';
import { useRef } from 'react';
import { formatCombination, getShortcut, type ShortcutId } from '@/app/shortcuts/shortcuts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { useStartImport } from '@/modules/library/useStartImport';
import { useCreateNote } from '@/modules/notes/useCreateNote';
import { workspaceDialogs } from '@/stores/workspaceDialogs';

/** Quick Create (spec §3.4): a workspace, a note or an import, from anywhere. */
export function QuickCreateMenu() {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const startImport = useStartImport();
  const createNote = useCreateNote();
  const keys = (id: ShortcutId) => formatCombination(getShortcut(id).combination, t);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} icon={Plus}>
          {t('quickCreate.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          icon={Boxes}
          shortcut={keys('newWorkspace')}
          onSelect={() => {
            workspaceDialogs.create(triggerRef.current);
          }}
        >
          {t('shortcuts.newWorkspace')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={NotebookPen}
          shortcut={keys('newNote')}
          onSelect={() => {
            void createNote();
          }}
        >
          {t('shortcuts.newNote')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={FileUp}
          shortcut={keys('importDocument')}
          onSelect={() => {
            void startImport('pick');
          }}
        >
          {t('shortcuts.importDocument')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
