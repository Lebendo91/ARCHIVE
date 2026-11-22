import { EditorContent } from '@tiptap/react';
import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { markdownToNote } from '@/modules/notes/markdown';
import { useNoteEditor } from '@/modules/notes/useNoteEditor';
import { useOpenLink } from '@/modules/notes/useOpenLink';
import { ScrollPanel, TextPreview } from './DocumentPreview';

/** Longest Markdown text the preview lays out (in characters); beyond it, the extracted text is shown. */
export const MARKDOWN_PREVIEW_MAX = 1_000_000;

function MarkdownView({ markdown }: { markdown: string }) {
  const { t } = useI18n();
  const openLink = useOpenLink();
  // The schema of the notes keeps headings, lists, tables, code and links; anything else (images, raw HTML)
  // is dropped, so that nothing is loaded from the network and nothing runs.
  const content = useMemo(() => markdownToNote(markdown).content, [markdown]);
  const editor = useNoteEditor({ mode: 'view', content, onOpenLink: openLink });
  return (
    <ScrollPanel label={t('library.detail.preview')}>
      <EditorContent editor={editor} className="px-6 py-5" />
    </ScrollPanel>
  );
}

/**
 * Markdown document laid out like a note (spec §8.5), from the text kept by the core: the managed copy is
 * not read again, and the original file is never touched.
 */
export function MarkdownPreview({ content }: { content: string | null }) {
  const { t } = useI18n();
  if (!content?.trim()) {
    return <TextPreview content={null} />;
  }
  if (content.length > MARKDOWN_PREVIEW_MAX) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">{t('library.detail.previewTooLarge')}</p>
        <TextPreview content={content} variant="code" />
      </div>
    );
  }
  return <MarkdownView markdown={content} />;
}
