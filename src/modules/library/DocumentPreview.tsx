import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton, Spinner } from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import { readDocumentBytes, type Document } from '@/services/documents';
import { openPdf } from '@/services/pdf';
import { cn } from '@/utils/cn';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

type PdfStatus = 'loading' | 'ready' | 'error' | 'encrypted';

/**
 * PDF preview (spec §7.4): one page at a time, with page navigation and zoom. The file is read by ranges
 * through the core; nothing is fetched from the network.
 */
/** `initialPage`: the page to open at (a cited passage), within the pages of the file. */
export function PdfViewer({
  document,
  initialPage = 1,
}: {
  document: Document;
  initialPage?: number;
}) {
  const { t, locale } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<PdfStatus>('loading');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [width, setWidth] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    openPdf(document.id, document.fileSize)
      .then((loading) => {
        task = loading;
        return loading.promise;
      })
      .then((proxy) => {
        if (!cancelled) {
          const first = Math.min(Math.max(Math.trunc(initialPage), 1), proxy.numPages);
          setPdf(proxy);
          setStatus('ready');
          setPageNumber(first);
          setPageInput(String(first));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(
            error instanceof Error && error.name === 'PasswordException' ? 'encrypted' : 'error',
          );
        }
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [document.id, document.fileSize, initialPage]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas || width === 0) {
      return undefined;
    }
    let cancelled = false;
    let render: RenderTask | null = null;
    void pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return undefined;
        }
        const natural = page.getViewport({ scale: 1 });
        const nextScale = zoom === 'fit' ? (width - 2) / natural.width : zoom;
        setScale(nextScale);
        const viewport = page.getViewport({ scale: nextScale });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${String(Math.floor(viewport.width))}px`;
        canvas.style.height = `${String(Math.floor(viewport.height))}px`;
        render = page.render({
          canvas,
          viewport,
          ...(ratio === 1 ? {} : { transform: [ratio, 0, 0, ratio, 0, 0] }),
        });
        return render.promise;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, pageNumber, zoom, width]);

  const pageCount = pdf?.numPages ?? 0;
  const goTo = (page: number) => {
    const bounded = Math.min(Math.max(page, 1), pageCount);
    setPageNumber(bounded);
    setPageInput(String(bounded));
  };
  const zoomBy = (direction: 1 | -1) => {
    const current = zoom === 'fit' ? scale : zoom;
    const next =
      direction === 1
        ? ZOOM_STEPS.find((step) => step > current + 0.01)
        : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01);
    if (next !== undefined) {
      setZoom(next);
    }
  };

  if (status === 'error' || status === 'encrypted') {
    return (
      <p role="alert" className="text-sm text-fg-secondary">
        {status === 'encrypted' ? t('library.pdf.encrypted') : t('library.pdf.error')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="toolbar"
        aria-label={t('library.pdf.toolbar')}
        className="flex flex-wrap items-center gap-2"
      >
        <IconButton
          icon={ChevronLeft}
          label={t('library.pdf.previous')}
          variant="secondary"
          disabled={status !== 'ready' || pageNumber <= 1}
          onClick={() => {
            goTo(pageNumber - 1);
          }}
        />
        <form
          className="flex items-center gap-2 text-sm text-fg-secondary"
          onSubmit={(event) => {
            event.preventDefault();
            const requested = Number.parseInt(pageInput, 10);
            goTo(Number.isNaN(requested) ? pageNumber : requested);
          }}
        >
          <label className="sr-only" htmlFor={`pdf-page-${document.id}`}>
            {t('library.pdf.page')}
          </label>
          <input
            id={`pdf-page-${document.id}`}
            type="number"
            min={1}
            max={Math.max(pageCount, 1)}
            value={pageInput}
            disabled={status !== 'ready'}
            onChange={(event) => {
              setPageInput(event.target.value);
            }}
            onBlur={() => {
              const requested = Number.parseInt(pageInput, 10);
              goTo(Number.isNaN(requested) ? pageNumber : requested);
            }}
            className="h-8 w-16 rounded-control border border-line bg-obsidian px-2 text-center text-sm text-fg focus:border-blue focus:ring-1 focus:ring-blue focus-visible:outline-none"
          />
          <span>{t('library.pdf.pageOf', { total: formatNumber(pageCount, locale) })}</span>
        </form>
        <IconButton
          icon={ChevronRight}
          label={t('library.pdf.next')}
          variant="secondary"
          disabled={status !== 'ready' || pageNumber >= pageCount}
          onClick={() => {
            goTo(pageNumber + 1);
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            icon={ZoomOut}
            label={t('library.pdf.zoomOut')}
            variant="secondary"
            disabled={status !== 'ready'}
            onClick={() => {
              zoomBy(-1);
            }}
          />
          <span className="w-14 text-center text-sm text-fg-secondary tabular-nums">
            {t('library.pdf.zoomValue', { percent: Math.round(scale * 100) })}
          </span>
          <IconButton
            icon={ZoomIn}
            label={t('library.pdf.zoomIn')}
            variant="secondary"
            disabled={status !== 'ready'}
            onClick={() => {
              zoomBy(1);
            }}
          />
          <IconButton
            icon={MoveHorizontal}
            label={t('library.pdf.fitWidth')}
            variant={zoom === 'fit' ? 'secondary' : 'ghost'}
            aria-pressed={zoom === 'fit'}
            disabled={status !== 'ready'}
            onClick={() => {
              setZoom('fit');
            }}
          />
        </div>
      </div>
      <div
        ref={frameRef}
        className="relative min-h-96 overflow-auto rounded-card border border-line-subtle bg-obsidian"
      >
        {status === 'loading' ? (
          <p className="flex items-center gap-2 p-6 text-sm text-fg-secondary">
            <Spinner size={16} />
            {t('library.pdf.loading')}
          </p>
        ) : null}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('library.pdf.canvasLabel', {
            page: pageNumber,
            total: pageCount,
            title: document.title,
          })}
          className={status === 'ready' ? 'mx-auto block' : 'hidden'}
        />
      </div>
    </div>
  );
}

/** Image preview: the managed copy becomes a `blob:` URL, released when the preview goes away. */
export function ImagePreview({ document }: { document: Document }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    readDocumentBytes(document.id, document.fileSize)
      .then((bytes) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: document.mimeType }));
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [document.id, document.fileSize, document.mimeType]);

  if (failed) {
    return <p className="text-sm text-fg-secondary">{t('library.pdf.error')}</p>;
  }
  return (
    <div className="flex min-h-64 items-center justify-center rounded-card border border-line-subtle bg-obsidian p-4">
      {url ? (
        <img
          src={url}
          alt={t('library.detail.imageAlt', { title: document.title })}
          className="max-h-[70vh] max-w-full object-contain"
        />
      ) : (
        <Spinner size={20} />
      )}
    </div>
  );
}

/** Scrollable panel that keyboard users can focus and scroll, named for screen readers. */
export function ScrollPanel({ label, children }: { label: string; children: ReactNode }) {
  // A scrollable region must be focusable, so that the keyboard can scroll it.
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-[70vh] overflow-auto rounded-card border border-line-subtle bg-obsidian"
    >
      {children}
    </div>
  );
}

/**
 * Text kept by the core for search: prose in the reading font (PDF, Word, text, Markdown), data in the code
 * font (CSV, JSON).
 */
export function TextPreview({
  content,
  variant = 'prose',
}: {
  content: string | null;
  variant?: 'prose' | 'code';
}) {
  const { t } = useI18n();
  if (!content) {
    return <p className="text-sm text-fg-secondary">{t('library.detail.noContent')}</p>;
  }
  return (
    <ScrollPanel label={t('library.detail.text')}>
      <pre
        className={cn(
          'p-4 whitespace-pre-wrap text-fg',
          variant === 'code' ? 'font-mono text-xs' : 'font-sans text-sm leading-relaxed',
        )}
      >
        {/* The pages of a PDF are separated by form feeds: shown as blank lines. */}
        {content.replaceAll('\f', '\n\n')}
      </pre>
    </ScrollPanel>
  );
}

/** Most data rows a CSV preview shows; the whole text stays searchable. */
const CSV_PREVIEW_ROWS = 500;

/**
 * Splits CSV text into rows of cells (quoted cells as in RFC 4180), with the separator its first line uses
 * most among comma, semicolon and tab. Stops after `maxRows` rows.
 */
export function parseCsv(text: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const lineEnd = text.indexOf('\n');
  const firstLine = lineEnd === -1 ? text : text.slice(0, lineEnd);
  const occurrences = (separator: string) => firstLine.split(separator).length - 1;
  const separator = [';', '\t'].reduce(
    (best, candidate) => (occurrences(candidate) > occurrences(best) ? candidate : best),
    ',',
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    index += 1;
    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if (text.charAt(index) === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
    } else if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === separator) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text.charAt(index) === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= maxRows) {
        return { rows, truncated: text.slice(index).trim() !== '' };
      }
    } else {
      cell += character;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return { rows, truncated: false };
}

/** CSV preview: a table whose first row gives the column names. */
export function CsvPreview({ content, title }: { content: string | null; title: string }) {
  const { t, locale } = useI18n();
  const parsed = useMemo(
    () => (content ? parseCsv(content, CSV_PREVIEW_ROWS + 1) : null),
    [content],
  );
  const [header, ...body] = parsed?.rows ?? [];
  if (!parsed || !header) {
    return <TextPreview content={content} variant="code" />;
  }
  const columns = Math.max(...parsed.rows.map((row) => row.length));
  const cells = (row: string[]) =>
    Array.from({ length: columns }, (_, column) => row[column] ?? '');
  return (
    <div className="flex flex-col gap-2">
      <ScrollPanel label={t('library.detail.tableLabel', { title })}>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-graphite">
            <tr>
              {cells(header).map((cell, column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap text-fg"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, line) => (
              <tr key={line} className="border-b border-line-subtle last:border-b-0">
                {cells(row).map((cell, column) => (
                  <td key={column} className="px-3 py-2 whitespace-nowrap text-fg-secondary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollPanel>
      {parsed.truncated ? (
        <p className="text-xs text-fg-secondary">
          {t('library.detail.rowsShown', { count: formatNumber(CSV_PREVIEW_ROWS, locale) })}
        </p>
      ) : null}
    </div>
  );
}

/** Largest JSON file the preview reads and formats; beyond it, the extracted text is shown. */
const JSON_PREVIEW_MAX = 2 * 1024 * 1024;

/** Decodes a text file: UTF-8 unless it starts with a UTF-16 byte order mark, like the native extractor. */
function decodeText(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}

type JsonState = { status: 'loading' } | { status: 'ready'; text: string; raw: boolean };

/**
 * JSON preview: the file formatted with indentation, read from the managed copy. An invalid file is shown as
 * it is, so that it can be understood and fixed.
 */
export function JsonPreview({ document, content }: { document: Document; content: string | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<JsonState>({ status: 'loading' });
  const tooLarge = document.fileSize > JSON_PREVIEW_MAX;
  useEffect(() => {
    if (tooLarge) {
      return undefined;
    }
    let cancelled = false;
    readDocumentBytes(document.id, document.fileSize)
      .then((bytes) => {
        const text = decodeText(bytes);
        let next: JsonState;
        try {
          next = { status: 'ready', text: JSON.stringify(JSON.parse(text), null, 2), raw: false };
        } catch {
          next = { status: 'ready', text, raw: true };
        }
        if (!cancelled) {
          setState(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'ready', text: '', raw: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [document.id, document.fileSize, tooLarge]);

  if (tooLarge) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">{t('library.detail.previewTooLarge')}</p>
        <TextPreview content={content} variant="code" />
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }
  if (state.text === '') {
    return <p className="text-sm text-fg-secondary">{t('library.pdf.error')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {state.raw ? (
        <p className="text-sm text-fg-secondary">{t('library.detail.rawContent')}</p>
      ) : null}
      <ScrollPanel label={t('library.detail.preview')}>
        <pre className="p-4 font-mono text-xs whitespace-pre-wrap text-fg">{state.text}</pre>
      </ScrollPanel>
    </div>
  );
}
