import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as OCL from 'openchemlib';
import { ELEMENT_BY_NAME, PURE_ELEMENTS } from '../src/data/elements.ts';
import type {
  ElementRecord,
  IndexStats,
  LookupResponse,
  MoleculeCardData,
  SearchCandidate,
} from '../src/types/molecule.ts';
import { buildMoleculeCardData, type PubChemCompoundInput } from './chemoinformatics.ts';
import { parseFormulaInput } from './formulaParser.ts';

interface IndexedCompound {
  cid: number;
  formula: string;
  formulaUpper: string;
  title: string;
  mw: string;
  smiles: string;
}

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const PUBCHEM_AUTOCOMPLETE = 'https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound';
const ENTREZ_COUNT_URL =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pccompound&term=all%5Bfilt%5D&retmax=0&retmode=json';
const PROP_FIELDS =
  'Title,IUPACName,MolecularFormula,MolecularWeight,SMILES,ConnectivitySMILES,InChIKey,XLogP,TPSA,HeavyAtomCount,HBondDonorCount,HBondAcceptorCount,RotatableBondCount';

class PubChemService {
  // Compact line storage to minimize V8 heap footprint (~12MB vs ~160MB for 112k objects)
  private tsvLines: string[] = [];
  private byFormula = new Map<string, number | number[]>();
  private extraCompounds: IndexedCompound[] = [];
  private extraByCid = new Map<number, IndexedCompound>();
  private liveCache = new Map<string, { ts: number; data: unknown }>();
  private cachedCidSet = new Set<number>();
  private indexLoaded = false;
  private dataDir = path.resolve(process.cwd(), 'data');
  private cacheDir = path.resolve(process.cwd(), 'data');
  private pubchemTotalCompounds = 124863650;
  private pubchemConnected = true;

  public configure(opts: { dataDir?: string; cacheDir?: string }): void {
    if (opts.dataDir) this.dataDir = opts.dataDir;
    if (opts.cacheDir) this.cacheDir = opts.cacheDir;
    this.indexLoaded = false;
    this.tsvLines = [];
    this.byFormula.clear();
    this.extraCompounds = [];
    this.extraByCid.clear();
    this.cachedCidSet.clear();
    this.loadIndex();
  }

  public ensureLoaded(): void {
    if (!this.indexLoaded) {
      this.loadIndex();
    }
  }

  private parseTsvLine(idx: number): IndexedCompound | null {
    const line = this.tsvLines[idx];
    if (!line) return null;
    const t1 = line.indexOf('\t');
    const t2 = line.indexOf('\t', t1 + 1);
    const t3 = line.indexOf('\t', t2 + 1);
    const t4 = line.indexOf('\t', t3 + 1);
    if (t1 < 0 || t2 < 0 || t3 < 0 || t4 < 0) return null;
    const cid = Number(line.slice(0, t1));
    const formula = line.slice(t1 + 1, t2);
    const title = line.slice(t2 + 1, t3);
    const mw = line.slice(t3 + 1, t4);
    const smiles = line.slice(t4 + 1);
    if (!cid || !formula || !smiles) return null;
    return {
      cid,
      formula,
      formulaUpper: formula.toUpperCase(),
      title,
      mw,
      smiles,
    };
  }

  private addFormulaIdx(formulaUpper: string, idx: number): void {
    const existing = this.byFormula.get(formulaUpper);
    if (existing === undefined) {
      this.byFormula.set(formulaUpper, idx);
    } else if (typeof existing === 'number') {
      this.byFormula.set(formulaUpper, [existing, idx]);
    } else {
      existing.push(idx);
    }
  }

  private addExtraRecord(rec: IndexedCompound, fromUserCache = false): void {
    if (this.extraByCid.has(rec.cid)) return;
    const idx = -(this.extraCompounds.length + 1);
    this.extraCompounds.push(rec);
    this.extraByCid.set(rec.cid, rec);
    if (fromUserCache) this.cachedCidSet.add(rec.cid);
    this.addFormulaIdx(rec.formulaUpper, idx);
  }

  private getByIndex(idx: number): IndexedCompound | null {
    if (idx >= 0) return this.parseTsvLine(idx);
    return this.extraCompounds[-idx - 1] || null;
  }

  private getFormulaMatches(formulaUpper: string): IndexedCompound[] {
    const entry = this.byFormula.get(formulaUpper);
    if (entry === undefined) return [];
    if (typeof entry === 'number') {
      const rec = this.getByIndex(entry);
      return rec ? [rec] : [];
    }
    const list: IndexedCompound[] = [];
    for (const idx of entry) {
      const rec = this.getByIndex(idx);
      if (rec) list.push(rec);
    }
    return list;
  }

  private findByCidInIndex(cid: number): IndexedCompound | null {
    const extra = this.extraByCid.get(cid);
    if (extra) return extra;
    // Binary search on sorted tsvLines
    let lo = 0;
    let hi = this.tsvLines.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const line = this.tsvLines[mid];
      const t1 = line.indexOf('\t');
      const midCid = Number(line.slice(0, t1));
      if (midCid === cid) return this.parseTsvLine(mid);
      if (midCid < cid) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  private loadIndex(): void {
    if (this.indexLoaded) return;
    const gzPath = path.join(this.dataDir, 'pubchem_100k.tsv.gz');
    if (fs.existsSync(gzPath)) {
      const rawGz = fs.readFileSync(gzPath);
      const tsv = zlib.gunzipSync(rawGz).toString('utf8');
      const lines = tsv.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const t1 = line.indexOf('\t');
        const t2 = line.indexOf('\t', t1 + 1);
        if (t1 < 0 || t2 < 0) continue;
        const formulaUpper = line.slice(t1 + 1, t2).toUpperCase();
        const idx = this.tsvLines.length;
        this.tsvLines.push(line);
        this.addFormulaIdx(formulaUpper, idx);
      }
    } else {
      console.warn(`Warning: ${gzPath} not found. Live PubChem mode only.`);
    }

    const cacheFile = path.join(this.cacheDir, 'pubchem_cache.jsonl');
    if (fs.existsSync(cacheFile)) {
      try {
        const lines = fs.readFileSync(cacheFile, 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const rec = JSON.parse(line) as IndexedCompound;
          if (rec && rec.cid && rec.formula && rec.smiles) {
            this.addExtraRecord(
              {
                ...rec,
                formulaUpper: rec.formula.toUpperCase(),
              },
              true
            );
          }
        }
      } catch {
        // Ignore malformed cache line
      }
    }

    this.indexLoaded = true;
    void this.refreshPubChemTotalCount();
    console.log(
      `Loaded ${this.tsvLines.length + this.extraCompounds.length} local compounds (${this.byFormula.size} formulas) + ${PURE_ELEMENTS.length} elements`
    );
  }

  private persistToDiskCache(items: PubChemCompoundInput[]): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const cacheFile = path.join(this.cacheDir, 'pubchem_cache.jsonl');
      const linesToWrite: string[] = [];
      for (const item of items) {
        if (!item.cid || !item.formula || !item.smiles) continue;
        if (this.findByCidInIndex(item.cid)) continue;
        const rec: IndexedCompound = {
          cid: item.cid,
          formula: item.formula,
          formulaUpper: item.formula.toUpperCase(),
          title: item.title || item.formula,
          mw: item.molecularWeight ? item.molecularWeight.toFixed(2) : '',
          smiles: item.smiles,
        };
        this.addExtraRecord(rec, true);
        linesToWrite.push(JSON.stringify(rec));
      }
      if (linesToWrite.length > 0) {
        fs.appendFileSync(cacheFile, linesToWrite.join('\n') + '\n', 'utf8');
      }
    } catch {
      // Non-fatal if cache dir is read-only
    }
  }

  private async refreshPubChemTotalCount(): Promise<void> {
    try {
      const data = await this.fetchPubChemJson<{
        esearchresult?: { count?: string };
      }>(ENTREZ_COUNT_URL, 5000);
      const count = Number(data?.esearchresult?.count);
      if (Number.isFinite(count) && count > 100_000_000) {
        this.pubchemTotalCompounds = count;
        this.pubchemConnected = true;
      }
    } catch {
      // Retain baseline known count
    }
  }

  public getStats(): IndexStats {
    this.ensureLoaded();
    return {
      totalCompounds: this.tsvLines.length + this.extraCompounds.length,
      cachedCompounds: this.cachedCidSet.size,
      pubchemTotalCompounds: this.pubchemTotalCompounds,
      totalElements: PURE_ELEMENTS.length,
      uniqueFormulas: this.byFormula.size,
      pubchemConnected: this.pubchemConnected,
    };
  }

  private async fetchPubChemJson<T>(url: string, timeoutMs = 9000): Promise<T | null> {
    const cached = this.liveCache.get(url);
    if (cached && Date.now() - cached.ts < 1000 * 60 * 30) {
      return cached.data as T;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = (await res.json()) as T;
      this.pubchemConnected = true;
      if (this.liveCache.size > 1500) {
        const firstKey = this.liveCache.keys().next().value;
        if (firstKey) this.liveCache.delete(firstKey);
      }
      this.liveCache.set(url, { ts: Date.now(), data: json });
      return json;
    } catch {
      return null;
    }
  }

  private async fetchPropertiesByCids(cids: number[]): Promise<PubChemCompoundInput[]> {
    if (cids.length === 0) return [];
    const subset = cids.slice(0, 30);
    const url = `${PUBCHEM_BASE}/compound/cid/${subset.join(',')}/property/${PROP_FIELDS}/JSON`;
    const data = await this.fetchPubChemJson<{ PropertyTable?: { Properties?: Array<Record<string, unknown>> } }>(url);
    const propsList = data?.PropertyTable?.Properties;
    if (!propsList || propsList.length === 0) return [];

    const mapped: PubChemCompoundInput[] = propsList.map((p) => ({
      cid: Number(p.CID) || null,
      title: String(p.Title || p.IUPACName || p.MolecularFormula || 'Compound'),
      iupacName: p.IUPACName ? String(p.IUPACName) : undefined,
      formula: String(p.MolecularFormula || ''),
      molecularWeight: p.MolecularWeight ? Number(p.MolecularWeight) : undefined,
      smiles: String(p.ConnectivitySMILES || p.SMILES || ''),
      isomericSmiles: p.SMILES ? String(p.SMILES) : undefined,
      inchiKey: p.InChIKey ? String(p.InChIKey) : undefined,
      xLogP: typeof p.XLogP === 'number' ? p.XLogP : null,
      tpsa: typeof p.TPSA === 'number' ? p.TPSA : null,
      heavyAtomCount: typeof p.HeavyAtomCount === 'number' ? p.HeavyAtomCount : null,
      hBondDonorCount: typeof p.HBondDonorCount === 'number' ? p.HBondDonorCount : null,
      hBondAcceptorCount: typeof p.HBondAcceptorCount === 'number' ? p.HBondAcceptorCount : null,
      rotatableBondCount: typeof p.RotatableBondCount === 'number' ? p.RotatableBondCount : null,
      sourceType: 'pubchem-live',
    }));

    this.persistToDiskCache(mapped);
    return mapped;
  }

  private async fetchSynonyms(cid: number): Promise<string[]> {
    const url = `${PUBCHEM_BASE}/compound/cid/${cid}/synonyms/JSON`;
    const data = await this.fetchPubChemJson<{
      InformationList?: { Information?: Array<{ Synonym?: string[] }> };
    }>(url);
    const list = data?.InformationList?.Information?.[0]?.Synonym || [];
    return list.slice(0, 8);
  }

  public async autocompleteAsync(rawQuery: string): Promise<SearchCandidate[]> {
    this.ensureLoaded();
    const q = rawQuery.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const results: SearchCandidate[] = [];
    const seenKeys = new Set<string>();

    // 1. Pure elements matching symbol or name
    for (const el of PURE_ELEMENTS) {
      if (
        el.symbol.toLowerCase() === lower ||
        el.name.toLowerCase().startsWith(lower) ||
        el.symbol.toLowerCase().startsWith(lower)
      ) {
        results.push({
          cid: el.pubchemCid,
          formula: el.symbol,
          title: `${el.name} (Pure Element #${el.atomicNumber})`,
          mw: String(el.atomicMass),
          smiles: el.smiles,
          source: 'pure-element',
          isElement: true,
        });
        seenKeys.add(`el:${el.symbol}`);
      }
    }

    // 2. Formula parsing match against local 112k+ index & cached 124M lookups
    const parsed = parseFormulaInput(q);
    for (const hill of parsed.hillFormulas) {
      const matches = this.getFormulaMatches(hill.toUpperCase());
      for (const m of matches.slice(0, 10)) {
        if (seenKeys.has(`cid:${m.cid}`)) continue;
        seenKeys.add(`cid:${m.cid}`);
        results.push({
          cid: m.cid,
          formula: m.formula,
          title: m.title,
          mw: m.mw,
          smiles: m.smiles,
          source: 'pubchem-100k-index',
        });
      }
    }

    // 3. Substring / prefix match on formula or compound title in local index
    if (results.length < 14 && q.length >= 2) {
      const upper = q.toUpperCase();
      for (let i = 0; i < this.extraCompounds.length && results.length < 14; i++) {
        const c = this.extraCompounds[i];
        if (seenKeys.has(`cid:${c.cid}`)) continue;
        if (c.formulaUpper.startsWith(upper) || c.title.toLowerCase().includes(lower)) {
          seenKeys.add(`cid:${c.cid}`);
          results.push({
            cid: c.cid,
            formula: c.formula,
            title: c.title,
            mw: c.mw,
            smiles: c.smiles,
            source: 'pubchem-100k-index',
          });
        }
      }
      for (let i = 0; i < this.tsvLines.length && results.length < 14; i++) {
        const line = this.tsvLines[i];
        if (!line.toLowerCase().includes(lower)) continue;
        const c = this.parseTsvLine(i);
        if (!c || seenKeys.has(`cid:${c.cid}`)) continue;
        if (c.formulaUpper.startsWith(upper) || c.title.toLowerCase().includes(lower)) {
          seenKeys.add(`cid:${c.cid}`);
          results.push({
            cid: c.cid,
            formula: c.formula,
            title: c.title,
            mw: c.mw,
            smiles: c.smiles,
            source: 'pubchem-100k-index',
          });
        }
      }
    }

    // 4. Live PubChem Dictionary Autocomplete across the full 124.8M+ PubChem database
    if (q.length >= 3 && results.length < 18) {
      const acUrl = `${PUBCHEM_AUTOCOMPLETE}/${encodeURIComponent(q)}/json?limit=8`;
      const acData = await this.fetchPubChemJson<{
        dictionary_terms?: { compound?: string[] };
      }>(acUrl, 2500);
      const terms = acData?.dictionary_terms?.compound || [];
      for (const term of terms) {
        if (results.length >= 18) break;
        const tLower = term.toLowerCase();
        if (results.some((r) => r.title.toLowerCase() === tLower)) continue;
        results.push({
          cid: null,
          formula: 'PubChem 124M',
          title: term,
          mw: 'Live Lookup',
          smiles: '',
          source: 'pubchem-live',
        });
      }
    }

    return results.slice(0, 18);
  }

  private buildElementInput(el: ElementRecord): PubChemCompoundInput {
    return {
      cid: el.pubchemCid,
      title: el.name,
      formula: el.symbol,
      molecularWeight: el.atomicMass,
      smiles: el.smiles,
      sourceType: 'pure-element',
      elementRecord: el,
    };
  }

  public async lookupByCid(cid: number): Promise<MoleculeCardData | null> {
    this.ensureLoaded();
    const liveList = await this.fetchPropertiesByCids([cid]);
    if (liveList.length > 0) {
      const item = liveList[0];
      const synonyms = item.cid ? await this.fetchSynonyms(item.cid) : [];
      item.synonyms = synonyms;
      return buildMoleculeCardData(item, `cid-${cid}-${Date.now()}`);
    }

    const indexed = this.findByCidInIndex(cid);
    if (indexed) {
      return buildMoleculeCardData(
        {
          cid: indexed.cid,
          title: indexed.title,
          formula: indexed.formula,
          molecularWeight: Number(indexed.mw) || undefined,
          smiles: indexed.smiles,
          sourceType: 'pubchem-100k-index',
        },
        `cid-${cid}-${Date.now()}`
      );
    }
    return null;
  }

  public async fetchMoreIsomers(formula: string, offset = 0, limit = 24): Promise<{ candidates: SearchCandidate[]; total: number }> {
    this.ensureLoaded();
    const parsed = parseFormulaInput(formula);
    const hill = parsed.hillFormulas[0] || formula.trim();
    const liveCidsUrl = `${PUBCHEM_BASE}/compound/fastformula/${encodeURIComponent(hill)}/cids/JSON?MaxRecords=150`;
    const fastFormulaData = await this.fetchPubChemJson<{ IdentifierList?: { CID?: number[] } }>(liveCidsUrl);
    const liveCids = fastFormulaData?.IdentifierList?.CID || [];
    const localList = this.getFormulaMatches(hill.toUpperCase());

    const allCids: number[] = [];
    const seen = new Set<number>();
    for (const c of liveCids) {
      if (!seen.has(c)) {
        seen.add(c);
        allCids.push(c);
      }
    }
    for (const lm of localList) {
      if (!seen.has(lm.cid)) {
        seen.add(lm.cid);
        allCids.push(lm.cid);
      }
    }

    const slice = allCids.slice(offset, offset + limit);
    const props = await this.fetchPropertiesByCids(slice);
    const candidates: SearchCandidate[] = props.map((lp) => ({
      cid: lp.cid,
      formula: lp.formula,
      title: lp.title,
      mw: lp.molecularWeight ? lp.molecularWeight.toFixed(2) : '',
      smiles: lp.smiles,
      source: 'pubchem-live',
    }));

    return { candidates, total: allCids.length };
  }

  public async lookup(rawQuery: string): Promise<LookupResponse> {
    this.ensureLoaded();
    const q = rawQuery.trim();
    if (!q) {
      return {
        query: q,
        normalizedFormula: null,
        matchedBy: 'formula',
        primary: null,
        candidates: [],
        error: 'Please enter a chemical formula, element symbol, compound name, SMILES, or PubChem CID.',
      };
    }

    if (/^\d+$/.test(q)) {
      const cid = Number(q);
      const card = await this.lookupByCid(cid);
      if (card) {
        return {
          query: q,
          normalizedFormula: card.physicochemical.formula,
          matchedBy: 'cid',
          primary: card,
          candidates: [
            {
              cid: card.cid,
              formula: card.physicochemical.formula,
              title: card.name,
              mw: String(card.physicochemical.molecularWeight),
              smiles: card.smiles,
              source: 'pubchem-live',
            },
          ],
        };
      }
    }

    const elByName = ELEMENT_BY_NAME.get(q.toLowerCase());
    if (elByName) {
      const card = buildMoleculeCardData(this.buildElementInput(elByName), `el-${elByName.symbol}`);
      return {
        query: q,
        normalizedFormula: elByName.symbol,
        matchedBy: 'element',
        primary: card,
        candidates: [
          {
            cid: elByName.pubchemCid,
            formula: elByName.symbol,
            title: `${elByName.name} (Element #${elByName.atomicNumber})`,
            mw: String(elByName.atomicMass),
            smiles: elByName.smiles,
            source: 'pure-element',
            isElement: true,
          },
        ],
      };
    }

    const parsed = parseFormulaInput(q);
    const candidates: SearchCandidate[] = [];
    const seenCids = new Set<number>();

    if (parsed.isPureElement && parsed.elementMatch) {
      const el = parsed.elementMatch;
      candidates.push({
        cid: el.pubchemCid,
        formula: el.symbol,
        title: `${el.name} (Pure Element #${el.atomicNumber})`,
        mw: String(el.atomicMass),
        smiles: el.smiles,
        source: 'pure-element',
        isElement: true,
      });
    }

    const looksLikeSmiles = /[=#()[\]@\\/]/.test(q) && !/^[A-Za-z0-9()[\]{}+-]+$/.test(q.replace(/[()]/g, ''));
    const explicitSmilesSyntax = /[=#@\\/]/.test(q) || q.includes('c1');

    if (explicitSmilesSyntax || looksLikeSmiles) {
      try {
        const testMol = OCL.Molecule.fromSmiles(q);
        if (testMol.getAllAtoms() > 0) {
          const enc = encodeURIComponent(q);
          const url = `${PUBCHEM_BASE}/compound/smiles/${enc}/property/${PROP_FIELDS}/JSON`;
          const liveData = await this.fetchPubChemJson<{
            PropertyTable?: { Properties?: Array<Record<string, unknown>> };
          }>(url);
          const p = liveData?.PropertyTable?.Properties?.[0];
          const mf = testMol.getMolecularFormula().formula;

          const inputData: PubChemCompoundInput = p
            ? {
                cid: Number(p.CID) || null,
                title: String(p.Title || p.IUPACName || mf),
                iupacName: p.IUPACName ? String(p.IUPACName) : undefined,
                formula: String(p.MolecularFormula || mf),
                molecularWeight: p.MolecularWeight ? Number(p.MolecularWeight) : undefined,
                smiles: String(p.ConnectivitySMILES || p.SMILES || q),
                isomericSmiles: p.SMILES ? String(p.SMILES) : q,
                inchiKey: p.InChIKey ? String(p.InChIKey) : undefined,
                xLogP: typeof p.XLogP === 'number' ? p.XLogP : null,
                tpsa: typeof p.TPSA === 'number' ? p.TPSA : null,
                heavyAtomCount: typeof p.HeavyAtomCount === 'number' ? p.HeavyAtomCount : null,
                hBondDonorCount: typeof p.HBondDonorCount === 'number' ? p.HBondDonorCount : null,
                hBondAcceptorCount: typeof p.HBondAcceptorCount === 'number' ? p.HBondAcceptorCount : null,
                rotatableBondCount: typeof p.RotatableBondCount === 'number' ? p.RotatableBondCount : null,
                sourceType: 'pubchem-live',
              }
            : {
                cid: null,
                title: mf,
                formula: mf,
                smiles: q,
                sourceType: 'smiles-computed',
              };

          if (inputData.cid) {
            this.persistToDiskCache([inputData]);
            inputData.synonyms = await this.fetchSynonyms(inputData.cid);
          }

          const card = buildMoleculeCardData(inputData, `smiles-${Date.now()}`);
          return {
            query: q,
            normalizedFormula: card.physicochemical.formula,
            matchedBy: 'smiles',
            primary: card,
            candidates: [
              {
                cid: card.cid,
                formula: card.physicochemical.formula,
                title: card.name,
                mw: String(card.physicochemical.molecularWeight),
                smiles: card.smiles,
                source: card.cid ? 'pubchem-live' : 'pubchem-100k-index',
              },
            ],
          };
        }
      } catch {
        // Fall through
      }
    }

    let primaryCard: MoleculeCardData | null = null;
    const primaryFormula = parsed.hillFormulas[0] || null;
    let totalPubChemMatches = 0;

    if (parsed.isPureElement && parsed.elementMatch) {
      const isUppercaseCO = q === 'CO' || q === 'NO';
      if (!isUppercaseCO) {
        primaryCard = buildMoleculeCardData(
          this.buildElementInput(parsed.elementMatch),
          `el-${parsed.elementMatch.symbol}-${Date.now()}`
        );
      }
    }

    if (parsed.hillFormulas.length > 0) {
      const localMatches: IndexedCompound[] = [];
      for (const hill of parsed.hillFormulas) {
        const list = this.getFormulaMatches(hill.toUpperCase());
        for (const item of list) {
          if (!seenCids.has(item.cid)) {
            seenCids.add(item.cid);
            localMatches.push(item);
          }
        }
      }
      localMatches.sort((a, b) => a.cid - b.cid);

      const liveCidsUrl = `${PUBCHEM_BASE}/compound/fastformula/${encodeURIComponent(parsed.hillFormulas[0])}/cids/JSON?MaxRecords=100`;
      const fastFormulaData = await this.fetchPubChemJson<{ IdentifierList?: { CID?: number[] } }>(liveCidsUrl);
      const liveCids = fastFormulaData?.IdentifierList?.CID || [];

      const mergedCids: number[] = [];
      const mergedCidSet = new Set<number>();
      for (const c of liveCids) {
        if (!mergedCidSet.has(c)) {
          mergedCidSet.add(c);
          mergedCids.push(c);
        }
      }
      for (const lm of localMatches) {
        if (!mergedCidSet.has(lm.cid)) {
          mergedCidSet.add(lm.cid);
          mergedCids.push(lm.cid);
        }
      }

      totalPubChemMatches = mergedCids.length;

      if (mergedCids.length > 0) {
        const liveProps = await this.fetchPropertiesByCids(mergedCids.slice(0, 24));
        for (const lp of liveProps) {
          if (lp.cid) {
            candidates.push({
              cid: lp.cid,
              formula: lp.formula,
              title: lp.title,
              mw: lp.molecularWeight ? lp.molecularWeight.toFixed(2) : '',
              smiles: lp.smiles,
              source: 'pubchem-live',
            });
          }
        }

        if (liveProps.length === 0 && localMatches.length > 0) {
          for (const lm of localMatches.slice(0, 24)) {
            candidates.push({
              cid: lm.cid,
              formula: lm.formula,
              title: lm.title,
              mw: lm.mw,
              smiles: lm.smiles,
              source: 'pubchem-100k-index',
            });
          }
        }

        if (!primaryCard) {
          if (liveProps.length > 0) {
            const best = liveProps[0];
            if (best.cid) {
              best.synonyms = await this.fetchSynonyms(best.cid);
            }
            primaryCard = buildMoleculeCardData(best, `cid-${best.cid}-${Date.now()}`);
          } else if (localMatches.length > 0) {
            const bestLocal = localMatches[0];
            primaryCard = buildMoleculeCardData(
              {
                cid: bestLocal.cid,
                title: bestLocal.title,
                formula: bestLocal.formula,
                molecularWeight: Number(bestLocal.mw) || undefined,
                smiles: bestLocal.smiles,
                sourceType: 'pubchem-100k-index',
              },
              `cid-${bestLocal.cid}-${Date.now()}`
            );
          }
        }
      }
    }

    if (primaryCard) {
      return {
        query: q,
        normalizedFormula: primaryFormula || primaryCard.physicochemical.formula,
        matchedBy: primaryCard.isElement ? 'element' : 'formula',
        primary: primaryCard,
        candidates,
        totalPubChemMatches,
      };
    }

    const nameUrl = `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(q)}/property/${PROP_FIELDS}/JSON`;
    const nameData = await this.fetchPubChemJson<{
      PropertyTable?: { Properties?: Array<Record<string, unknown>> };
    }>(nameUrl);
    const p = nameData?.PropertyTable?.Properties?.[0];
    if (p) {
      const cid = Number(p.CID) || null;
      const inputData: PubChemCompoundInput = {
        cid,
        title: String(p.Title || p.IUPACName || q),
        iupacName: p.IUPACName ? String(p.IUPACName) : undefined,
        formula: String(p.MolecularFormula || ''),
        molecularWeight: p.MolecularWeight ? Number(p.MolecularWeight) : undefined,
        smiles: String(p.ConnectivitySMILES || p.SMILES || ''),
        isomericSmiles: p.SMILES ? String(p.SMILES) : undefined,
        inchiKey: p.InChIKey ? String(p.InChIKey) : undefined,
        xLogP: typeof p.XLogP === 'number' ? p.XLogP : null,
        tpsa: typeof p.TPSA === 'number' ? p.TPSA : null,
        heavyAtomCount: typeof p.HeavyAtomCount === 'number' ? p.HeavyAtomCount : null,
        hBondDonorCount: typeof p.HBondDonorCount === 'number' ? p.HBondDonorCount : null,
        hBondAcceptorCount: typeof p.HBondAcceptorCount === 'number' ? p.HBondAcceptorCount : null,
        rotatableBondCount: typeof p.RotatableBondCount === 'number' ? p.RotatableBondCount : null,
        synonyms: cid ? await this.fetchSynonyms(cid) : [],
        sourceType: 'pubchem-live',
      };
      this.persistToDiskCache([inputData]);
      const card = buildMoleculeCardData(inputData, `name-${cid || Date.now()}`);
      return {
        query: q,
        normalizedFormula: card.physicochemical.formula,
        matchedBy: 'name',
        primary: card,
        candidates: [
          {
            cid: card.cid,
            formula: card.physicochemical.formula,
            title: card.name,
            mw: String(card.physicochemical.molecularWeight),
            smiles: card.smiles,
            source: 'pubchem-live',
          },
        ],
        totalPubChemMatches: 1,
      };
    }

    const lowerQ = q.toLowerCase();
    const titleMatches: IndexedCompound[] = [];
    for (let i = 0; i < this.tsvLines.length && titleMatches.length < 18; i++) {
      if (!this.tsvLines[i].toLowerCase().includes(lowerQ)) continue;
      const rec = this.parseTsvLine(i);
      if (rec && rec.title.toLowerCase().includes(lowerQ)) {
        titleMatches.push(rec);
      }
    }
    if (titleMatches.length > 0) {
      const first = titleMatches[0];
      const card = await this.lookupByCid(first.cid);
      return {
        query: q,
        normalizedFormula: card?.physicochemical.formula || first.formula,
        matchedBy: 'name',
        primary: card,
        candidates: titleMatches.map((m) => ({
          cid: m.cid,
          formula: m.formula,
          title: m.title,
          mw: m.mw,
          smiles: m.smiles,
          source: 'pubchem-100k-index',
        })),
        totalPubChemMatches: titleMatches.length,
      };
    }

    return {
      query: q,
      normalizedFormula: primaryFormula,
      matchedBy: 'formula',
      primary: null,
      candidates: [],
      error: `No compound or pure element found for "${q}". Try a molecular formula (e.g., C2H4O2, c10h20o), element symbol (Fe, au), compound name, CID, or SMILES.`,
    };
  }
}

export const pubchemService = new PubChemService();
