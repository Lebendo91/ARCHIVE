import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Spinner } from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import { readDocumentBytes, type Document } from '@/services/documents';
import { openPdf } from '@/services/pdf';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

type PdfStatus = 'loading' | 'ready' | 'error' | 'encrypted';

/**
 * PDF preview (spec §7.4): one page at a time, with page navigation and zoom. The file is read by ranges
 * through the core; nothing is fetched from the network.
 */
export function PdfViewer({ document }: { document: Document }) {
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
          setPdf(proxy);
          setStatus('ready');
          setPageNumber(1);
          setPageInput('1');
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
  }, [document.id, document.fileSize]);

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

/** Extracted text, as stored by the core. */
export function TextPreview({ content }: { content: string | null }) {
  const { t } = useI18n();
  if (!content) {
    return <p className="text-sm text-fg-secondary">{t('library.detail.noContent')}</p>;
  }
  return (
    <pre className="max-h-[70vh] overflow-auto rounded-card border border-line-subtle bg-obsidian p-4 font-mono text-xs whitespace-pre-wrap text-fg">
      {content}
    </pre>
  );
}
