declare function minimatch(
  target: string,
  pattern: string,
  options?: minimatch.MinimatchOptions,
): boolean;

declare namespace minimatch {
  interface MinimatchOptions {
    [key: string]: unknown;
  }

  type IOptions = MinimatchOptions;

  interface IMinimatch {
    options: MinimatchOptions;
    pattern: string;
    set: unknown[][];
    regexp?: RegExp | false;
    negate: boolean;
    comment: boolean;
    empty: boolean;
    makeRe(): RegExp | false;
    match(path: string): boolean;
    matchOne(file: string[], pattern: string[], partial?: boolean): boolean;
    hasMagic?(): boolean;
  }

  class Minimatch implements IMinimatch {
    constructor(pattern: string, options?: MinimatchOptions);
    options: MinimatchOptions;
    pattern: string;
    set: unknown[][];
    regexp?: RegExp | false;
    negate: boolean;
    comment: boolean;
    empty: boolean;
    makeRe(): RegExp | false;
    match(path: string): boolean;
    matchOne(file: string[], pattern: string[], partial?: boolean): boolean;
    hasMagic?(): boolean;
  }

  function match(list: readonly string[], pattern: string, options?: MinimatchOptions): string[];
  function filter(
    pattern: string,
    options?: MinimatchOptions,
  ): (element: string, indexed: number, array: readonly string[]) => boolean;
  function makeRe(pattern: string, options?: MinimatchOptions): RegExp | false;
  function defaults(defaultOptions: MinimatchOptions): typeof minimatch;
  function braceExpand(pattern: string, options?: MinimatchOptions): string[];
}

export = minimatch;
