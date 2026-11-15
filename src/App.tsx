import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Atom, Download, Trash2, Loader2, ArrowUpRight } from 'lucide-react';
import type {
  IndexStats,
  LookupResponse,
  MoleculeCardData,
  SearchCandidate,
} from './types/molecule.ts';
import { MoleculeCard } from './components/MoleculeCard.tsx';
import { PeriodicTableModal } from './components/PeriodicTableModal.tsx';

const SAMPLE_QUERIES: Array<{ label: string; query: string; note: string }> = [
  { label: 'c2h4o2', query: 'c2h4o2', note: 'Acetic acid (lowercase)' },
  { label: 'C10H20O', query: 'C10H20O', note: 'Menthol' },
  { label: 'c5h10o5', query: 'c5h10o5', note: 'Ribose' },
  { label: 'C8H14OS2', query: 'CCSC=CS(=O)CC=CC', note: 'Ajoene-type' },
  { label: 'c14h8o5', query: 'c14h8o5', note: 'Purpurin' },
  { label: 'C21H17NO3', query: 'O=C(c1ccccc1)Oc1ccccc1C=CCn1ccccc1=O', note: 'Pyridinone ester' },
  { label: 'C22H22O6', query: 'COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(c(c2)OC)O)ccc1OC', note: 'Curcuminoid' },
  { label: 'C9H8O4', query: 'C9H8O4', note: 'Aspirin' },
  { label: 'fe', query: 'fe', note: 'Iron element' },
  { label: 'Au', query: 'Au', note: 'Gold element' },
];

function exportCardsToCsv(cards: MoleculeCardData[], filename: string) {
  const headers = [
    'Molecule',
    'Name',
    'PubChem CID',
    'Formula',
    'SMILES',
    'MW (g/mol)',
    'Heavy atoms',
    'Arom. heavy atoms',
    'Fraction Csp3',
    'Rotatable bonds',
    'H-bond acceptors',
    'H-bond donors',
    'Molar Refractivity',
    'TPSA (A^2)',
    'iLOGP',
    'XLOGP3',
    'WLOGP',
    'MLOGP',
    'SILICOS-IT LogP',
    'Consensus LogP',
    'ESOL Log S',
    'ESOL Class',
    'Ali Log S',
    'Ali Class',
    'SILICOS-IT Log S',
    'SILICOS-IT Class',
    'GI absorption',
    'BBB permeant',
    'P-gp substrate',
    'CYP1A2 inhibitor',
    'CYP2C19 inhibitor',
    'CYP2C9 inhibitor',
    'CYP2D6 inhibitor',
    'CYP3A4 inhibitor',
    'Log Kp (cm/s)',
    'Lipinski',
    'Ghose',
    'Veber',
    'Egan',
    'Muegge',
    'Bioavailability Score',
    'PAINS',
    'Brenk',
    'Leadlikeness',
    'Synthetic accessibility',
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = cards.map((m, idx) => [
    `Molecule ${idx + 1}`,
    m.name,
    m.cid ?? '',
    m.physicochemical.formula,
    m.smiles,
    m.physicochemical.molecularWeight.toFixed(2),
    m.physicochemical.numHeavyAtoms,
    m.physicochemical.numAromaticHeavyAtoms,
    m.physicochemical.fractionCsp3.toFixed(2),
    m.physicochemical.numRotatableBonds,
    m.physicochemical.numHBondAcceptors,
    m.physicochemical.numHBondDonors,
    m.physicochemical.molarRefractivity.toFixed(2),
    m.physicochemical.tpsa.toFixed(2),
    m.lipophilicity.iLogP.toFixed(2),
    m.lipophilicity.xLogP3.toFixed(2),
    m.lipophilicity.wLogP.toFixed(2),
    m.lipophilicity.mLogP.toFixed(2),
    m.lipophilicity.silicosIt.toFixed(2),
    m.lipophilicity.consensusLogP.toFixed(2),
    m.waterSolubility.esol.logS.toFixed(2),
    m.waterSolubility.esol.solubilityClass,
    m.waterSolubility.ali.logS.toFixed(2),
    m.waterSolubility.ali.solubilityClass,
    m.waterSolubility.silicosIt.logS.toFixed(2),
    m.waterSolubility.silicosIt.solubilityClass,
    m.pharmacokinetics.giAbsorption,
    m.pharmacokinetics.bbbPermeant,
    m.pharmacokinetics.pgpSubstrate,
    m.pharmacokinetics.cyp1a2Inhibitor,
    m.pharmacokinetics.cyp2c19Inhibitor,
    m.pharmacokinetics.cyp2c9Inhibitor,
    m.pharmacokinetics.cyp2d6Inhibitor,
    m.pharmacokinetics.cyp3a4Inhibitor,
    m.pharmacokinetics.logKp.toFixed(2),
    m.druglikeness.lipinski,
    m.druglikeness.ghose,
    m.druglikeness.veber,
    m.druglikeness.egan,
    m.druglikeness.muegge,
    m.druglikeness.bioavailabilityScore.toFixed(2),
    m.medicinalChemistry.pains,
    m.medicinalChemistry.brenk,
    m.medicinalChemistry.leadlikeness,
    m.medicinalChemistry.syntheticAccessibility.toFixed(2),
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [query, setQuery] = useState('c2h4o2');
  const [appendMode, setAppendMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<MoleculeCardData[]>([]);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [normalizedFormula, setNormalizedFormula] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchCandidate[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [periodicOpen, setPeriodicOpen] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loadingMoreIsomers, setLoadingMoreIsomers] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: IndexStats) => setStats(d))
      .catch(() => {});

    // Load default initial molecule (Acetic acid C2H4O2) so workspace is immediately populated
    runLookup('c2h4o2', false);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((data: { results?: SearchCandidate[] }) => {
          setSuggestions(data.results || []);
        })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  function refreshStats() {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: IndexStats) => setStats(d))
      .catch(() => {});
  }

  async function runLookup(inputQuery: string, shouldAppend: boolean) {
    const q = inputQuery.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`);
      const data: LookupResponse = await res.json();
      setNormalizedFormula(data.normalizedFormula);
      setCandidates(data.candidates || []);
      setTotalMatches(data.totalPubChemMatches ?? (data.candidates?.length || 0));

      if (data.primary) {
        setCards((prev) => (shouldAppend ? [data.primary!, ...prev] : [data.primary!]));
        refreshStats();
      } else {
        setError(data.error || `No compound found for "${q}".`);
      }
    } catch {
      setError('Failed to reach PubChem analysis service.');
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidate(cand: SearchCandidate, shouldAppend: boolean) {
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      if (cand.isElement) {
        await runLookup(cand.formula, shouldAppend);
        return;
      }
      if (cand.cid) {
        const res = await fetch(`/api/cid/${cand.cid}`);
        const data: { card?: MoleculeCardData; error?: string } = await res.json();
        if (data.card) {
          setCards((prev) => (shouldAppend ? [data.card!, ...prev] : [data.card!]));
          refreshStats();
        } else {
          setError(data.error || 'Could not load compound.');
        }
      } else if (cand.smiles) {
        await runLookup(cand.smiles, shouldAppend);
      } else if (cand.title) {
        await runLookup(cand.title, shouldAppend);
      }
    } catch {
      setError('Failed to fetch PubChem compound details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMoreIsomers() {
    if (!normalizedFormula || loadingMoreIsomers) return;
    setLoadingMoreIsomers(true);
    try {
      const res = await fetch(
        `/api/isomers?formula=${encodeURIComponent(normalizedFormula)}&offset=${candidates.length}&limit=24`
      );
      const data: { candidates?: SearchCandidate[]; total?: number } = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        setCandidates((prev) => {
          const seen = new Set(prev.map((p) => p.cid));
          const extra = data.candidates!.filter((c) => !seen.has(c.cid));
          return [...prev, ...extra];
        });
      }
      if (typeof data.total === 'number') {
        setTotalMatches(data.total);
      }
    } catch {
      // Ignore transient isomer pagination failure
    } finally {
      setLoadingMoreIsomers(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(query, appendMode);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-slate-900 flex flex-col">
      {/* Top Bar Contract: Brand wordmark — 4 concise single-line links — 1 primary CTA */}
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-[1220px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#analyzer"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            MolSpec ADME
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#analyzer"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Formula Lookup
            </a>
            <a
              href="#isomers"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              PubChem Isomers
            </a>
            <button
              type="button"
              onClick={() => setPeriodicOpen(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              118 Elements
            </button>
            <a
              href="https://pubchem.ncbi.nlm.nih.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1"
            >
              PubChem DB
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={cards.length === 0}
              onClick={() => exportCardsToCsv(cards, 'molspec_adme_export.csv')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#CC0000] hover:bg-[#B30000] disabled:opacity-45 rounded transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1220px] mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Search & Formula Entry Panel */}
        <section
          id="analyzer"
          className="bg-white border border-slate-300 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Chemical Formula &amp; PubChem Property Analyzer
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter any formula in any case (e.g. <span className="font-mono text-slate-700">c2h4o2</span>,{' '}
                <span className="font-mono text-slate-700">C10H20O</span>,{' '}
                <span className="font-mono text-slate-700">fe</span>,{' '}
                <span className="font-mono text-slate-700">ch3cooh</span>), SMILES, compound name, or PubChem CID.
              </p>
            </div>

            {stats && (
              <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                <span>{(stats.pubchemTotalCompounds / 1_000_000).toFixed(1)}M+ PubChem Compounds</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
                <span>{stats.totalCompounds.toLocaleString()} Offline Indexed</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
                <span>{stats.totalElements} Pure Elements</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div ref={searchContainerRef} className="relative flex-1">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="Enter formula (c2h4o2, C22H22O6, fe, nacl), SMILES, name, or CID..."
                  aria-label="Chemical formula or compound search"
                  className="w-full pl-9 pr-3 py-2.5 text-sm font-mono bg-white border border-slate-300 focus:border-[#CC0000] focus:outline-none text-slate-900"
                />
              </div>

              {/* Autocomplete Dropdown across 100k+ Compounds & 118 Elements */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-300 shadow-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {suggestions.map((s, idx) => (
                    <button
                      key={`${s.source}-${s.cid ?? s.title}-${idx}`}
                      type="button"
                      onClick={() => {
                        setQuery(s.cid ? s.formula : s.title);
                        loadCandidate(s, appendMode);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-4 text-xs cursor-pointer"
                    >
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <span className="font-mono font-semibold text-[#CC0000] shrink-0">
                          {s.formula}
                        </span>
                        <span className="text-slate-800 truncate">{s.title}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                        {s.isElement
                          ? `Element · ${s.mw} u`
                          : s.cid
                          ? `CID ${s.cid} · ${s.mw} g/mol`
                          : 'PubChem Live Search'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-[#E60000] hover:bg-[#CC0000] disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing
                  </>
                ) : appendMode ? (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Molecule
                  </>
                ) : (
                  'Analyze Formula'
                )}
              </button>

              <button
                type="button"
                onClick={() => setAppendMode((v) => !v)}
                aria-pressed={appendMode}
                title="Toggle between replacing active card or adding comparison cards"
                className={`px-3 py-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  appendMode
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {appendMode ? 'Mode: Compare Stack' : 'Mode: Single View'}
              </button>

              <button
                type="button"
                onClick={() => setPeriodicOpen(true)}
                className="px-3 py-2.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Atom className="w-3.5 h-3.5 text-[#CC0000]" />
                Elements
              </button>
            </div>
          </form>

          {/* Quick Formula Samples */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="text-slate-500 font-medium">Examples:</span>
            {SAMPLE_QUERIES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setQuery(sample.query);
                  runLookup(sample.query, appendMode);
                }}
                title={`${sample.note} (${sample.query})`}
                className="font-mono text-slate-700 hover:text-[#CC0000] underline decoration-slate-300 underline-offset-2 transition-colors cursor-pointer"
              >
                {sample.label}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs"
            >
              {error}
            </div>
          )}
        </section>

        {/* PubChem Isomer / Candidate Selector Strip */}
        {candidates.length > 1 && (
          <section
            id="isomers"
            className="bg-white border border-slate-300 px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-700 font-medium">
                PubChem Matches for{' '}
                <span className="font-mono font-bold text-[#CC0000]">
                  {normalizedFormula || query}
                </span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-slate-500">
                  {candidates.length} compounds/elements available (click to inspect or add to stack)
                </span>
              </div>
              {cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCards((prev) => prev.slice(0, 1))}
                  className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Keep Only Molecule 1
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {candidates.slice(0, 24).map((cand, idx) => {
                const isActive = cards.some(
                  (c) =>
                    (cand.cid && c.cid === cand.cid) ||
                    (cand.isElement && c.isElement && c.physicochemical.formula === cand.formula)
                );
                return (
                  <button
                    key={`${cand.cid ?? cand.formula}-${idx}`}
                    type="button"
                    onClick={() => loadCandidate(cand, appendMode)}
                    className={`px-2.5 py-1 text-xs border transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-red-50 border-[#CC0000] text-[#990000] font-medium'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-400 text-slate-700'
                    }`}
                  >
                    <span className="truncate max-w-[200px] inline-block align-bottom">
                      {cand.title}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 ml-1.5">
                      {cand.isElement ? cand.formula : `CID ${cand.cid}`}
                    </span>
                  </button>
                );
              })}

              {totalMatches > candidates.length && (
                <button
                  type="button"
                  disabled={loadingMoreIsomers}
                  onClick={handleLoadMoreIsomers}
                  className="px-2.5 py-1 text-xs border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium cursor-pointer"
                >
                  {loadingMoreIsomers
                    ? 'Loading...'
                    : `Load more (${totalMatches - candidates.length} remaining)`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Molecule Results Stack (Molecule 1, Molecule 2, ...) */}
        <section className="space-y-5">
          {loading && cards.length === 0 && (
            <div className="bg-white border border-slate-300 p-10 flex items-center justify-center gap-3 text-sm text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin text-[#CC0000]" />
              Querying PubChem database and computing ADME descriptors...
            </div>
          )}

          {cards.map((mol, idx) => (
            <MoleculeCard
              key={mol.id}
              molecule={mol}
              index={idx + 1}
              canRemove={cards.length > 1}
              onRemove={(id) => setCards((prev) => prev.filter((item) => item.id !== id))}
              onDownloadCsv={(m) =>
                exportCardsToCsv(
                  [m],
                  `${m.physicochemical.formula.toLowerCase()}_molecule_${idx + 1}.csv`
                )
              }
            />
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 mt-8">
        <div className="max-w-[1220px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            PubChem Live Catalog:{' '}
            {stats ? stats.pubchemTotalCompounds.toLocaleString() : '124,863,650'} compounds ·
            Offline Index: {stats ? stats.totalCompounds.toLocaleString() : '112,048+'} compounds
            &amp; 118 IUPAC elements
          </span>
          <span>Cheminformatics descriptors computed via OpenChemLib &amp; Wildman-Crippen / ESOL / Potts-Guy models</span>
        </div>
      </footer>

      <PeriodicTableModal
        open={periodicOpen}
        onClose={() => setPeriodicOpen(false)}
        onSelectElement={(sym) => {
          setQuery(sym);
          runLookup(sym, appendMode);
        }}
      />
    </div>
  );
}
