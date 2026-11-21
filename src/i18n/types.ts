import type { fr } from './fr';

/** Turns the literal types of the reference dictionary into plain strings, keeping its exact shape. */
type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : { readonly [K in keyof T]: Widen<T[K]> };

/** Shape every dictionary must follow: a missing or extra key is a compilation error. */
export type Dictionary = Widen<typeof fr>;

type StringPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly string[]
      ? never
      : `${K}.${StringPaths<T[K]>}`;
}[keyof T & string];

type ListPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends readonly string[]
      ? K
      : `${K}.${ListPaths<T[K]>}`;
}[keyof T & string];

/** Dot-separated key of a translated string, for example `nav.library`. */
export type MessageKey = StringPaths<Dictionary>;

/** Dot-separated key of a translated list of strings, for example `modules.library.capabilities`. */
export type ListKey = ListPaths<Dictionary>;

/** Base of a pluralized message: the dictionary holds `<base>.one` and `<base>.other`. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one`
    ? `${Base}.other` extends MessageKey
      ? Base
      : never
    : never;
}[MessageKey];

export type Locale = 'fr' | 'en';

export type MessageParams = Readonly<Record<string, string | number>>;
