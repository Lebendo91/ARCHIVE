import { useNavigate } from 'react-router';
import { useI18n } from '@/i18n';
import { openExternalUrl } from '@/services/notes';
import { toast } from '@/stores/toasts';
import { isExternalUrl, parseArchiveHref } from './noteContent';

/**
 * Opens a link of a note when it is clicked: a note or a document of ARCHIVE in the application, a web or
 * e-mail address with the system (after the core checks it). Any other address is ignored.
 */
export function useOpenLink(): (href: string) => void {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (href) => {
    const target = parseArchiveHref(href);
    if (target) {
      void navigate(target.kind === 'note' ? `/notes/${target.id}` : `/library/${target.id}`);
    } else if (isExternalUrl(href)) {
      openExternalUrl(href).catch(() => {
        toast.error(t('notes.links.openFailed'));
      });
    }
  };
}
