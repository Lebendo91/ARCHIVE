import type * as PdfJsModule from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PdfExtraction } from '@/types/bindings/PdfExtraction';
import { readDocumentBytes, readDocumentRange } from './documents';

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js and its worker are loaded on first use only. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Files up to this size are read at once; larger ones are read by ranges, on demand. */
const WHOLE_FILE_MAX = 4 * 1024 * 1024;
const RANGE_CHUNK = 1024 * 1024;
/** Extraction stops reading pages beyond this many characters: the core keeps 16 MiB at most. */
const EXTRACTED_CHARS_MAX = 16 * 1024 * 1024;

function assetUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

/**
 * Opens the managed copy of a PDF document. pdf.js reads its resources from the application (`/pdfjs/`,
 * copied by vite.config.ts) and runs without WebAssembly, so that the CSP stays strict.
 */
export async function openPdf(id: string, size: number): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await loadPdfJs();
  const options = {
    useWasm: false,
    wasmUrl: assetUrl('/pdfjs/wasm/'),
    cMapUrl: assetUrl('/pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('/pdfjs/standard_fonts/'),
    enableXfa: false,
    disableAutoFetch: true,
    rangeChunkSize: RANGE_CHUNK,
  };
  if (size <= WHOLE_FILE_MAX) {
    return pdfjs.getDocument({ ...options, data: await readDocumentBytes(id, size) });
  }
  const initial = new Uint8Array(await readDocumentRange(id, 0, RANGE_CHUNK));
  const transport = new pdfjs.PDFDataRangeTransport(size, initial);
  transport.requestDataRange = (begin: number, end: number) => {
    void readDocumentRange(id, begin, end - begin).then((buffer) => {
      transport.onDataRange(begin, new Uint8Array(buffer));
    });
  };
  return pdfjs.getDocument({ ...options, range: transport });
}

function isTextItem(item: object): item is TextItem {
  return 'str' in item;
}

/** Text of a page: pdf.js items in reading order, with their line breaks. */
async function pageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    return content.items
      .filter(isTextItem)
      .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
      .join('')
      .trim();
  } finally {
    page.cleanup();
  }
}

/**
 * Extracts the text of a PDF document, page by page, for the core to store (ARCHITECTURE §8). A damaged or
 * protected file gives a failure the user can understand; any other error is rethrown, so that the
 * document stays pending instead of being wrongly marked as unreadable.
 */
export async function extractPdfText(id: string, size: number): Promise<PdfExtraction> {
  let task: PDFDocumentLoadingTask | null = null;
  try {
    task = await openPdf(id, size);
    const pdf = await task.promise;
    const pages: string[] = [];
    let length = 0;
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages && length < EXTRACTED_CHARS_MAX;
      pageNumber += 1
    ) {
      const text = await pageText(pdf, pageNumber);
      pages.push(text);
      length += text.length;
    }
    return { kind: 'text', text: pages.join('\n\n'), pageCount: pdf.numPages };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      return { kind: 'failed', reason: 'encrypted' };
    }
    if (name === 'InvalidPDFException' || name === 'FormatError') {
      return { kind: 'failed', reason: 'invalid' };
    }
    throw error;
  } finally {
    await task?.destroy();
  }
}
