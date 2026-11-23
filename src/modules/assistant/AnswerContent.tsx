import { Fragment, useMemo, type ReactNode } from 'react';
import type { MarkedToken, Token, Tokens } from 'marked';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n } from '@/i18n';
import type { SourcePassage } from '@/services/ai';
import { cn } from '@/utils/cn';
import { useOpenLink } from '@/modules/notes/useOpenLink';
import { isExternalUrl } from '@/modules/notes/noteContent';
import { analyzeAnswer, splitCitations, type BlockLabel } from './answer';

/** Where a source opens: the document at the page of the passage, or the note. */
export function sourceRoute(source: Pick<SourcePassage, 'kind' | 'id' | 'page'>): string {
  return source.kind === 'document'
    ? `/library/${source.id}${source.page === null ? '' : `?page=${source.page}`}`
    : `/notes/${source.id}`;
}

interface RenderContext {
  sources: ReadonlyMap<number, SourcePassage>;
  openLink: (href: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}

function Citation({ numbers, context }: { numbers: number[]; context: RenderContext }) {
  const { t } = context;
  return (
    <span className="whitespace-nowrap">
      {numbers.map((number) => {
        const source = context.sources.get(number);
        if (!source) {
          return (
            <span
              key={number}
              className="mx-0.5 rounded-sm border border-warning/40 px-1 font-mono text-2xs text-warning"
              title={t('assistant.citation.unverified', { index: number })}
            >
              S{number}
              <span className="sr-only">
                {' '}
                {t('assistant.citation.unverified', { index: number })}
              </span>
            </span>
          );
        }
        const where =
          source.page === null
            ? source.title
            : `${source.title}, ${t('assistant.citation.page', { page: source.page })}`;
        return (
          <Link
            key={number}
            to={sourceRoute(source)}
            className="mx-0.5 rounded-sm border border-cyan/40 bg-cyan/10 px-1 font-mono text-2xs text-cyan no-underline transition-colors duration-150 ease-standard hover:bg-cyan/20 focus-visible:outline-2 focus-visible:outline-blue"
            title={t('assistant.citation.open', { index: number, title: where })}
          >
            {/* The visible « S1 » starts the accessible name, which then says where the source is. */}
            S{number}
            <span className="sr-only">, {where}</span>
          </Link>
        );
      })}
    </span>
  );
}

function inlineText(text: string, context: RenderContext): ReactNode {
  return splitCitations(text).map((piece, index) =>
    piece.kind === 'citation' ? (
      <Citation key={index} numbers={piece.numbers} context={context} />
    ) : (
      <Fragment key={index}>{piece.text}</Fragment>
    ),
  );
}

function inline(tokens: readonly Token[] | undefined, context: RenderContext): ReactNode {
  return (tokens ?? []).map((raw, index) => {
    const token = raw as MarkedToken;
    switch (token.type) {
      case 'text':
        return (
          <Fragment key={index}>
            {token.tokens ? inline(token.tokens, context) : inlineText(token.text, context)}
          </Fragment>
        );
      case 'escape':
        return <Fragment key={index}>{token.text}</Fragment>;
      case 'strong':
        return <strong key={index}>{inline(token.tokens, context)}</strong>;
      case 'em':
        return <em key={index}>{inline(token.tokens, context)}</em>;
      case 'del':
        return <del key={index}>{inline(token.tokens, context)}</del>;
      case 'codespan':
        return (
          <code key={index} className="rounded-sm bg-steel px-1 font-mono text-xs">
            {token.text}
          </code>
        );
      case 'br':
        return <br key={index} />;
      case 'link':
        return isExternalUrl(token.href) ? (
          <button
            key={index}
            type="button"
            title={token.href}
            className="inline-flex items-baseline gap-1 text-blue underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue"
            onClick={() => {
              context.openLink(token.href);
            }}
          >
            {inline(token.tokens, context)}
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        ) : (
          <Fragment key={index}>{inline(token.tokens, context)}</Fragment>
        );
      case 'image':
        // Images of an answer are never loaded: their description stands in for them.
        return <Fragment key={index}>{token.text}</Fragment>;
      default:
        // Raw HTML and anything else is shown as text, never interpreted.
        return <Fragment key={index}>{inlineText(token.raw, context)}</Fragment>;
    }
  });
}

function block(raw: Token, context: RenderContext): ReactNode {
  const token = raw as MarkedToken;
  switch (token.type) {
    case 'paragraph':
      return <p>{inline(token.tokens, context)}</p>;
    case 'text':
      return (
        <p>{token.tokens ? inline(token.tokens, context) : inlineText(token.text, context)}</p>
      );
    case 'heading': {
      const content = inline(token.tokens, context);
      return token.depth <= 2 ? (
        <h3 className="text-base font-semibold text-fg">{content}</h3>
      ) : (
        <h4 className="text-sm font-semibold text-fg">{content}</h4>
      );
    }
    case 'list': {
      const items = token.items.map((item: Tokens.ListItem, index) => (
        <li key={index} className="pl-1">
          {item.tokens.map((child, childIndex) => {
            const typed = child as MarkedToken;
            return (
              <Fragment key={childIndex}>
                {typed.type === 'text'
                  ? typed.tokens
                    ? inline(typed.tokens, context)
                    : inlineText(typed.text, context)
                  : block(typed, context)}
              </Fragment>
            );
          })}
        </li>
      ));
      return token.ordered ? (
        <ol
          start={typeof token.start === 'number' ? token.start : undefined}
          className="flex list-decimal flex-col gap-1 pl-5"
        >
          {items}
        </ol>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5">{items}</ul>
      );
    }
    case 'blockquote':
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-line pl-3 text-fg-secondary">
          {token.tokens.map((child, index) => (
            <Fragment key={index}>{block(child, context)}</Fragment>
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-control bg-steel p-3 font-mono text-xs text-fg">
          <code>{token.text}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {token.header.map((cell, index) => (
                  <th key={index} className="border-b border-line px-2 py-1 font-semibold">
                    {inline(cell.tokens, context)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {token.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className="border-b border-line px-2 py-1">
                      {inline(cell.tokens, context)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="border-line" />;
    case 'space':
    case 'def':
      return null;
    default:
      return <p>{inlineText(token.raw, context)}</p>;
  }
}

const LABEL_STYLES: Record<BlockLabel, { border: string; badge: string }> = {
  archive: { border: 'border-cyan/50', badge: 'text-cyan' },
  general: { border: 'border-fg-disabled', badge: 'text-fg-secondary' },
  interpretation: { border: 'border-purple/50', badge: 'text-purple' },
  unsourced: { border: 'border-transparent', badge: 'text-fg-secondary' },
};

/**
 * An answer in Markdown, rendered without ever interpreting HTML: citations of passages really sent become
 * links to their source, others are marked unverified, and each paragraph says where it comes from.
 */
export function AnswerContent({
  text,
  sources,
  labelled,
}: {
  text: string;
  sources: readonly SourcePassage[];
  /** Labels of the paragraphs: once the answer is complete, and only when passages were sent. */
  labelled: boolean;
}) {
  const { t } = useI18n();
  const openLink = useOpenLink();
  const analyzed = useMemo(() => analyzeAnswer(text, sources), [text, sources]);
  const context: RenderContext = {
    sources: new Map(sources.map((source) => [source.index, source])),
    openLink,
    t,
  };
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg">
      {analyzed.blocks.map((answerBlock, index) => {
        const content = block(answerBlock.token, context);
        if (content === null) {
          return null;
        }
        if (!labelled || answerBlock.label === null) {
          return <Fragment key={index}>{content}</Fragment>;
        }
        const style = LABEL_STYLES[answerBlock.label];
        return (
          <div key={index} className={cn('flex flex-col gap-1 border-l-2 pl-3', style.border)}>
            <span
              className={cn('text-2xs font-semibold tracking-label uppercase', style.badge)}
              data-label={answerBlock.label}
            >
              {t(`assistant.labels.${answerBlock.label}`)}
            </span>
            {content}
          </div>
        );
      })}
    </div>
  );
}
