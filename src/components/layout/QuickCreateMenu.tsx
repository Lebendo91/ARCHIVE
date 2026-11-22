import { Boxes, FileUp, NotebookPen, Plus } from 'lucide-react';
import { useRef } from 'react';
import { formatCombination, getShortcut, type ShortcutId } from '@/app/shortcuts/shortcuts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { useStartImport } from '@/modules/library/useStartImport';
import { workspaceDialogs } from '@/stores/workspaceDialogs';

/**
 * Quick Create (spec §3.4). Creations whose module is not delivered yet are listed as upcoming and cannot
 * be selected.
 */
export function QuickCreateMenu() {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const startImport = useStartImport();
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
          icon={FileUp}
          shortcut={keys('importDocument')}
          onSelect={() => {
            void startImport('pick');
          }}
        >
          {t('shortcuts.importDocument')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          <span className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('common.comingSoon')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem icon={NotebookPen} shortcut={keys('newNote')} disabled>
          {t('shortcuts.newNote')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
