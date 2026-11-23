import { Lexer, type Token } from 'marked';
import type { SourcePassage } from '@/services/ai';

/**
 * Where a paragraph of an answer comes from (specification §14.5): the knowledge base (it cites a passage
 * that was really sent), the model's general knowledge or its own interpretation (as the model marked it),
 * or nothing that can be checked.
 */
export type BlockLabel = 'archive' | 'general' | 'interpretation' | 'unsourced';

export interface AnswerBlock {
  token: Token;
  /** `null` for blocks that carry no statement (headings, rules, code, blank space). */
  label: BlockLabel | null;
  citations: number[];
}

export interface AnalyzedAnswer {
  blocks: AnswerBlock[];
  /** Citations of passages that were sent with the question. */
  verified: number[];
  /** Citations of numbers that were never sent: shown, never linked. */
  unverified: number[];
}

/** `[S2]`, `[S1, S3]` or `[S1; S3]`. */
const CITATION = /\[S(\d{1,3})((?:\s*[,;]\s*S?\d{1,3})*)\]/g;
/** The tags the instructions ask for, at the start of a paragraph (or of its first list item or quote). */
const MARKER =
  /^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)?\[(general|g[ée]n[ée]ral|interpretation|interpr[ée]tation)\]/i;
/** Every tag, wherever it is: removed from what is shown. */
export const MARKERS = /\s*\[(?:general|g[ée]n[ée]ral|interpretation|interpr[ée]tation)\]\s*/gi;
const LABELLED: ReadonlySet<string> = new Set(['paragraph', 'list', 'blockquote', 'table']);

/** The numbers cited in a text, in order, each once. */
export function citedNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(CITATION)) {
    const all = [match[1] ?? '', ...(match[2] ?? '').split(/[,;]/)]
      .map((part) => Number(part.replace(/[^\d]/g, '')))
      .filter((number) => Number.isInteger(number) && number > 0);
    for (const number of all) {
      if (!numbers.includes(number)) {
        numbers.push(number);
      }
    }
  }
  return numbers;
}

export interface TextPiece {
  kind: 'text' | 'citation';
  text: string;
  numbers: number[];
}

/** A text cut into plain pieces and citations, the tags removed. */
export function splitCitations(text: string): TextPiece[] {
  const clean = text.replace(MARKERS, (marker) => (marker.startsWith(' ') ? ' ' : ''));
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of clean.matchAll(CITATION)) {
    const start = match.index;
    if (start > last) {
      pieces.push({ kind: 'text', text: clean.slice(last, start), numbers: [] });
    }
    pieces.push({ kind: 'citation', text: match[0], numbers: citedNumbers(match[0]) });
    last = start + match[0].length;
  }
  if (last < clean.length) {
    pieces.push({ kind: 'text', text: clean.slice(last), numbers: [] });
  }
  return pieces;
}

/** Cuts an answer into blocks and checks each citation against the passages sent with the question. */
export function analyzeAnswer(text: string, sources: readonly SourcePassage[]): AnalyzedAnswer {
  const sent = new Set(sources.map((source) => source.index));
  const verified: number[] = [];
  const unverified: number[] = [];
  const blocks = new Lexer().lex(text).map((token): AnswerBlock => {
    const citations = citedNumbers(token.raw);
    for (const number of citations) {
      const list = sent.has(number) ? verified : unverified;
      if (!list.includes(number)) {
        list.push(number);
      }
    }
    if (!LABELLED.has(token.type)) {
      return { token, label: null, citations };
    }
    const marker = MARKER.exec(token.raw)?.[1]?.toLowerCase();
    const label: BlockLabel =
      marker === undefined
        ? citations.some((number) => sent.has(number))
          ? 'archive'
          : 'unsourced'
        : marker.startsWith('g')
          ? 'general'
          : 'interpretation';
    return { token, label, citations };
  });
  return { blocks, verified, unverified };
}

/** Text of an answer to copy: the tags removed, the citations kept (they still name the sources). */
export function answerToCopy(text: string): string {
  return text.replace(MARKERS, (marker) => (marker.startsWith(' ') ? ' ' : '')).trim();
}
