/**
 * A minimal parser for *ground* Prolog terms as emitted by write_canonical/1.
 *
 * Why parse text rather than use swipl-wasm's native bindings: the native form
 * ({"$t":"t", functor:[[args]]}) is an undocumented internal representation,
 * whereas write_canonical output is a stable, specified surface. It also makes
 * golden tests trivial — the browser's string can be compared byte-for-byte
 * against the `swipl` CLI's. Terms here are tiny, so parsing cost is noise
 * against a ~1ms query.
 */

export type Term =
  | { t: 'atom'; name: string }
  | { t: 'int'; value: number }
  | { t: 'compound'; name: string; args: Term[] }
  | { t: 'list'; items: Term[] };

export class TermParseError extends Error {}

const UNQUOTED_ATOM = /^[a-z][a-zA-Z0-9_]*/;

class Reader {
  constructor(private readonly src: string, private pos = 0) {}

  private error(msg: string): never {
    throw new TermParseError(`${msg} at offset ${this.pos} in ${JSON.stringify(this.src)}`);
  }
  private peek(): string | undefined { return this.src[this.pos]; }
  private expect(ch: string): void {
    if (this.src[this.pos] !== ch) this.error(`expected ${JSON.stringify(ch)}`);
    this.pos++;
  }
  /** write_canonical emits no spaces, but tolerate them so hand-written input parses. */
  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++;
  }

  /** Quoted atom body, handling '' escapes and the usual backslash escapes. */
  private readQuoted(): string {
    this.expect("'");
    let out = '';
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === undefined) this.error('unterminated quoted atom');
      if (ch === "'") {
        if (this.src[this.pos + 1] === "'") { out += "'"; this.pos += 2; continue; }
        this.pos++; return out;
      }
      if (ch === '\\') {
        const esc = this.src[this.pos + 1];
        if (esc === undefined) this.error('dangling escape');
        const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
        out += simple[esc] ?? esc;
        this.pos += 2;
        continue;
      }
      out += ch; this.pos++;
    }
  }

  private readArgs(): Term[] {
    this.expect('(');
    const args: Term[] = [];
    for (;;) {
      args.push(this.parse());
      this.skipWs();
      if (this.peek() === ',') { this.pos++; continue; }
      this.expect(')');
      return args;
    }
  }

  parse(): Term {
    this.skipWs();
    const ch = this.peek();
    if (ch === undefined) this.error('unexpected end of input');

    if (ch === '[') {
      this.pos++;
      this.skipWs();
      if (this.peek() === ']') { this.pos++; return { t: 'list', items: [] }; }
      const items: Term[] = [];
      for (;;) {
        items.push(this.parse());
        this.skipWs();
        if (this.peek() === ',') { this.pos++; continue; }
        this.expect(']');
        return { t: 'list', items };
      }
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const m = /^-?\d+/.exec(this.src.slice(this.pos));
      if (!m) this.error('malformed integer');
      this.pos += m[0].length;
      return { t: 'int', value: Number(m[0]) };
    }

    let name: string;
    if (ch === "'") {
      name = this.readQuoted();
    } else {
      const m = UNQUOTED_ATOM.exec(this.src.slice(this.pos));
      if (!m) this.error('expected an atom');
      name = m[0];
      this.pos += name.length;
    }

    // No whitespace skip here: `foo (a)` is not a compound term in Prolog.
    if (this.peek() === '(') return { t: 'compound', name, args: this.readArgs() };
    return { t: 'atom', name };
  }

  parseAll(): Term {
    const term = this.parse();
    this.skipWs();
    // write_canonical/1 does not emit a trailing '.', but tolerate one.
    if (this.peek() === '.') this.pos++;
    this.skipWs();
    if (this.pos !== this.src.length) this.error('trailing input');
    return term;
  }
}

export function parseTerm(src: string): Term {
  return new Reader(src).parseAll();
}

// --- small accessors, so callers don't hand-roll shape checks ---

export function asCompound(term: Term, name: string, arity: number): Term[] {
  if (term.t !== 'compound' || term.name !== name || term.args.length !== arity) {
    throw new TermParseError(`expected ${name}/${arity}, got ${describe(term)}`);
  }
  return term.args;
}

export function asInt(term: Term): number {
  if (term.t !== 'int') throw new TermParseError(`expected an integer, got ${describe(term)}`);
  return term.value;
}

export function asAtom(term: Term): string {
  if (term.t !== 'atom') throw new TermParseError(`expected an atom, got ${describe(term)}`);
  return term.name;
}

export function asList(term: Term): Term[] {
  if (term.t !== 'list') throw new TermParseError(`expected a list, got ${describe(term)}`);
  return term.items;
}

export function describe(term: Term): string {
  switch (term.t) {
    case 'atom': return `atom ${term.name}`;
    case 'int': return `integer ${term.value}`;
    case 'list': return `list/${term.items.length}`;
    case 'compound': return `${term.name}/${term.args.length}`;
  }
}
