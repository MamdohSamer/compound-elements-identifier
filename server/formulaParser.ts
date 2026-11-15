import { ELEMENT_BY_SYMBOL, PURE_ELEMENTS } from '../src/data/elements.ts';
import type { ElementRecord } from '../src/types/molecule.ts';

const VALID_SYMBOLS = new Set(PURE_ELEMENTS.map((e) => e.symbol));

// Weighting for disambiguating lowercase/uppercase formulas like c8h14os2 (O+S vs Os) or nacl (Na+Cl vs N+Ac+...)
const COMMON_ELEMENTS = new Set([
  'C', 'H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I',
  'Na', 'K', 'Ca', 'Mg', 'Fe', 'Cu', 'Zn', 'Al', 'Si', 'B',
  'Li', 'Be', 'Mn', 'Cr', 'Ni', 'Co', 'Ag', 'Au', 'Hg', 'Pb', 'Sn', 'Ba', 'Pt', 'Ti',
]);

const ULTRA_COMMON = new Set(['C', 'H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I']);

function scoreElementParse(tokens: Array<{ symbol: string; count: number }>): number {
  let score = 0;
  const hasC = tokens.some((t) => t.symbol === 'C');
  for (const t of tokens) {
    if (ULTRA_COMMON.has(t.symbol)) {
      score += 10;
    } else if (COMMON_ELEMENTS.has(t.symbol)) {
      score += 6;
    } else {
      score -= 8;
    }
    // Single-letter common elements in organic formulas beat rare 2-letter metals (e.g., O+S > Os, C+F > Cf, I+N > In)
    if (hasC && (t.symbol === 'Os' || t.symbol === 'No' || t.symbol === 'In' || t.symbol === 'Ho' || t.symbol === 'Es' || t.symbol === 'Cf' || t.symbol === 'Bk' || t.symbol === 'Am' || t.symbol === 'Cm')) {
      score -= 20;
    }
  }
  // Slightly prefer fewer fragments for inorganic salts like NaCl vs N+Ac+...
  score -= tokens.length * 0.5;
  return score;
}

function parseExactCased(formula: string): Map<string, number> | null {
  const stack: Array<Map<string, number>> = [new Map()];
  let i = 0;
  const n = formula.length;

  while (i < n) {
    const ch = formula[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(new Map());
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.length < 2) return null;
      i++;
      let numStr = '';
      while (i < n && formula[i] >= '0' && formula[i] <= '9') {
        numStr += formula[i++];
      }
      const mult = numStr ? parseInt(numStr, 10) : 1;
      const top = stack.pop()!;
      const parent = stack[stack.length - 1];
      for (const [el, cnt] of top) {
        parent.set(el, (parent.get(el) || 0) + cnt * mult);
      }
    } else if (ch >= 'A' && ch <= 'Z') {
      let sym = ch;
      i++;
      if (i < n && formula[i] >= 'a' && formula[i] <= 'z') {
        const two = sym + formula[i];
        if (VALID_SYMBOLS.has(two)) {
          sym = two;
          i++;
        }
      }
      if (!VALID_SYMBOLS.has(sym)) return null;
      let numStr = '';
      while (i < n && formula[i] >= '0' && formula[i] <= '9') {
        numStr += formula[i++];
      }
      const cnt = numStr ? parseInt(numStr, 10) : 1;
      const cur = stack[stack.length - 1];
      cur.set(sym, (cur.get(sym) || 0) + cnt);
    } else {
      return null;
    }
  }

  if (stack.length !== 1 || stack[0].size === 0) return null;
  return stack[0];
}

function parseCaseInsensitiveDP(raw: string): Map<string, number>[] {
  const clean = raw.replace(/\s+/g, '');
  if (!clean) return [];

  // Handle parentheses recursively if present
  // Tokenize via DP on letters+digits segments
  type ParseOption = { counts: Map<string, number>; score: number; tokens: Array<{ symbol: string; count: number }> };

  function solve(str: string): ParseOption[] {
    if (!str) return [{ counts: new Map(), score: 0, tokens: [] }];

    // Recursive parentheses handling
    const openIdx = str.search(/[([{]/);
    if (openIdx !== -1) {
      const closeMap: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
      const targetClose = closeMap[str[openIdx]];
      let depth = 0;
      let closeIdx = -1;
      for (let i = openIdx; i < str.length; i++) {
        if (str[i] === str[openIdx]) depth++;
        else if (str[i] === targetClose) {
          depth--;
          if (depth === 0) {
            closeIdx = i;
            break;
          }
        }
      }
      if (closeIdx === -1) return [];
      let numEnd = closeIdx + 1;
      while (numEnd < str.length && str[numEnd] >= '0' && str[numEnd] <= '9') numEnd++;
      const mult = numEnd > closeIdx + 1 ? parseInt(str.slice(closeIdx + 1, numEnd), 10) : 1;

      const leftOpts = solve(str.slice(0, openIdx));
      const innerOpts = solve(str.slice(openIdx + 1, closeIdx));
      const rightOpts = solve(str.slice(numEnd));
      if (!leftOpts.length || !innerOpts.length || !rightOpts.length) return [];

      const bestLeft = leftOpts[0];
      const bestInner = innerOpts[0];
      const bestRight = rightOpts[0];
      const merged = new Map(bestLeft.counts);
      for (const [el, cnt] of bestInner.counts) {
        merged.set(el, (merged.get(el) || 0) + cnt * mult);
      }
      for (const [el, cnt] of bestRight.counts) {
        merged.set(el, (merged.get(el) || 0) + cnt);
      }
      return [{
        counts: merged,
        score: bestLeft.score + bestInner.score + bestRight.score,
        tokens: [...bestLeft.tokens, ...bestInner.tokens, ...bestRight.tokens],
      }];
    }

    const lower = str.toLowerCase();
    const memo = new Map<number, Array<{ symbol: string; count: number }[]>>();

    function dfs(pos: number): Array<{ symbol: string; count: number }[]> {
      if (pos === lower.length) return [[]];
      if (memo.has(pos)) return memo.get(pos)!;

      const results: Array<{ symbol: string; count: number }[]> = [];
      for (const len of [2, 1]) {
        if (pos + len > lower.length) continue;
        const cand = lower.slice(pos, pos + len);
        if (!/^[a-z]+$/.test(cand)) continue;
        const el = ELEMENT_BY_SYMBOL.get(cand);
        if (!el) continue;

        let numEnd = pos + len;
        while (numEnd < lower.length && lower[numEnd] >= '0' && lower[numEnd] <= '9') {
          numEnd++;
        }
        const count = numEnd > pos + len ? parseInt(lower.slice(pos + len, numEnd), 10) : 1;
        if (count <= 0) continue;

        const tails = dfs(numEnd);
        for (const tail of tails) {
          if (results.length >= 12) break;
          results.push([{ symbol: el.symbol, count }, ...tail]);
        }
      }
      memo.set(pos, results);
      return results;
    }

    const allTokenLists = dfs(0);
    const options: ParseOption[] = allTokenLists.map((tokens) => {
      const counts = new Map<string, number>();
      for (const t of tokens) {
        counts.set(t.symbol, (counts.get(t.symbol) || 0) + t.count);
      }
      return { counts, score: scoreElementParse(tokens), tokens };
    });

    options.sort((a, b) => b.score - a.score);
    return options;
  }

  const solved = solve(clean);
  // Deduplicate by Hill formula
  const seen = new Set<string>();
  const unique: Map<string, number>[] = [];
  for (const opt of solved) {
    const hill = toHillFormula(opt.counts);
    if (!seen.has(hill)) {
      seen.add(hill);
      unique.push(opt.counts);
    }
  }
  return unique;
}

export function toHillFormula(counts: Map<string, number>): string {
  const parts: string[] = [];
  const hasC = counts.has('C');
  if (hasC) {
    const cCount = counts.get('C')!;
    parts.push(cCount === 1 ? 'C' : `C${cCount}`);
    if (counts.has('H')) {
      const hCount = counts.get('H')!;
      parts.push(hCount === 1 ? 'H' : `H${hCount}`);
    }
    const rest = Array.from(counts.keys())
      .filter((k) => k !== 'C' && k !== 'H')
      .sort();
    for (const el of rest) {
      const cnt = counts.get(el)!;
      parts.push(cnt === 1 ? el : `${el}${cnt}`);
    }
  } else {
    const all = Array.from(counts.keys()).sort();
    for (const el of all) {
      const cnt = counts.get(el)!;
      parts.push(cnt === 1 ? el : `${el}${cnt}`);
    }
  }
  return parts.join('');
}

export interface FormulaParseResult {
  isPureElement: boolean;
  elementMatch: ElementRecord | null;
  hillFormulas: string[];
  rawCleaned: string;
}

export function parseFormulaInput(input: string): FormulaParseResult {
  const cleaned = input.trim().replace(/\s+/g, '');
  if (!cleaned) {
    return { isPureElement: false, elementMatch: null, hillFormulas: [], rawCleaned: '' };
  }

  // Strip optional charge suffix like + or - or 2+ at the end for formula matching
  const noCharge = cleaned.replace(/[+-]\d*$/, '');

  // Check if pure element symbol (any case)
  const lower = noCharge.toLowerCase();
  const elementBySym = ELEMENT_BY_SYMBOL.get(lower) || null;

  // Check if the input has mixed uppercase & lowercase (intentional case like "Co" vs "CO" or "NaCl")
  const hasUpper = /[A-Z]/.test(noCharge);
  const hasLower = /[a-z]/.test(noCharge);

  const hillFormulas: string[] = [];

  if (hasUpper && hasLower) {
    const exact = parseExactCased(noCharge);
    if (exact) {
      hillFormulas.push(toHillFormula(exact));
    }
  }

  // Always also run case-insensitive DP for ALL-lowercase, ALL-uppercase, or fallback
  if (hillFormulas.length === 0) {
    const dpResults = parseCaseInsensitiveDP(noCharge);
    for (const map of dpResults.slice(0, 4)) {
      hillFormulas.push(toHillFormula(map));
    }
  }

  // If user typed "co" (all lowercase) or "Co" (exact Cobalt), handle pure element + compound possibilities
  const isSingleElementQuery =
    elementBySym !== null &&
    ((hasUpper && hasLower && noCharge === elementBySym.symbol) ||
      (!hasUpper && noCharge.length <= 2) ||
      (!hasLower && noCharge.length === 1));

  return {
    isPureElement: isSingleElementQuery,
    elementMatch: elementBySym,
    hillFormulas,
    rawCleaned: cleaned,
  };
}
