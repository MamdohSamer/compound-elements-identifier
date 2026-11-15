import { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  X,
  Crosshair,
  Hexagon,
  Pill,
  Sigma,
  UserRound,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import type { MoleculeCardData } from '../types/molecule.ts';
import { BioavailabilityRadar } from './BioavailabilityRadar.tsx';
import { HelpTooltip } from './HelpTooltip.tsx';

interface MoleculeCardProps {
  molecule: MoleculeCardData;
  index: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onDownloadCsv: (mol: MoleculeCardData) => void;
}

function SectionBar({ title }: { title: string }) {
  return (
    <div className="w-full bg-[#D6D6D6] text-[#2F3337] text-[13px] font-medium text-center py-1 px-3 mt-1.5 mb-1">
      {title}
    </div>
  );
}

function PropRow({
  label,
  value,
  helpTopic,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  helpTopic?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(155px,44%)_1fr] items-baseline py-[2.5px] px-1 text-[12.5px] leading-[1.45] hover:bg-slate-50 transition-colors">
      <div className="text-[#4B5563] pr-2">
        <span>{label}</span>
        {helpTopic && <HelpTooltip topic={helpTopic} />}
      </div>
      <div className="text-[#1F2937] font-normal tabular-nums break-words">{value}</div>
    </div>
  );
}

export function MoleculeCard({
  molecule,
  index,
  canRemove,
  onRemove,
  onDownloadCsv,
}: MoleculeCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [copiedSmiles, setCopiedSmiles] = useState(false);
  const [usePubChemPng, setUsePubChemPng] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);

  const handleCopySmiles = async () => {
    try {
      await navigator.clipboard.writeText(molecule.smiles);
      setCopiedSmiles(true);
      setTimeout(() => setCopiedSmiles(false), 1600);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const p = molecule.physicochemical;
  const lip = molecule.lipophilicity;
  const sol = molecule.waterSolubility;
  const pk = molecule.pharmacokinetics;
  const dl = molecule.druglikeness;
  const mc = molecule.medicinalChemistry;

  const optimalCount = Object.values(molecule.radar.inOptimalZone).filter(Boolean).length;

  return (
    <article className="bg-white border border-slate-300 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Top Crimson Bar */}
      <div className="bg-[#E60000] text-white px-3.5 py-1.5 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight whitespace-nowrap shrink-0">
            Molecule {index}
          </h2>
          <span className="text-[13px] text-white/90 font-medium truncate">
            {molecule.name}
            {molecule.cid ? ` · CID ${molecule.cid}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(molecule.id)}
              aria-label={`Remove Molecule ${index}`}
              title="Remove molecule card"
              className="w-6 h-6 rounded-full hover:bg-white/20 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? `Expand Molecule ${index}` : `Collapse Molecule ${index}`}
            title={collapsed ? 'Expand card' : 'Collapse card'}
            className="w-6 h-6 rounded-full border border-white/80 hover:bg-white/20 inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3.5 pt-2 pb-3.5">
          {/* Action Icon Row + Metadata Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
            <div className="flex items-center gap-1.5 text-[#D90000]">
              <button
                type="button"
                onClick={() =>
                  setActiveNote((n) =>
                    n === 'boiled'
                      ? null
                      : `BOILED-Egg: GI absorption is ${pk.giAbsorption}; BBB permeation is ${pk.bbbPermeant}.`
                  )
                }
                title="BOILED-Egg Pharmacokinetics Summary"
                aria-label="BOILED-Egg Summary"
                className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
              >
                <UserRound className="w-4 h-4 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveNote((n) =>
                    n === 'radar'
                      ? null
                      : `Bioavailability Radar: ${optimalCount} of 6 physicochemical axes inside the optimal pink zone.`
                  )
                }
                title="Bioavailability Radar Status"
                aria-label="Bioavailability Radar Status"
                className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Crosshair className="w-4 h-4 stroke-[2.2]" />
              </button>
              {molecule.cid && !molecule.isElement ? (
                <button
                  type="button"
                  onClick={() => setUsePubChemPng((v) => !v)}
                  title={usePubChemPng ? 'Switch to Vector 2D SVG' : 'Switch to PubChem 2D Depiction'}
                  aria-label="Toggle 2D depiction source"
                  className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Hexagon className="w-4 h-4 stroke-[2.2]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setActiveNote(
                      molecule.isElement
                        ? `Pure Element #${molecule.elementData?.atomicNumber}: ${molecule.elementData?.category}`
                        : `2D Skeletal Formula: ${p.formula}`
                    )
                  }
                  title="2D Chemical Structure"
                  aria-label="2D Chemical Structure"
                  className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Hexagon className="w-4 h-4 stroke-[2.2]" />
                </button>
              )}
              <button
                type="button"
                onClick={handleCopySmiles}
                title="Copy Canonical SMILES"
                aria-label="Copy SMILES"
                className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Pill className="w-4 h-4 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={() => onDownloadCsv(molecule)}
                title="Download Molecule CSV Summary"
                aria-label="Download CSV"
                className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Sigma className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <span>
                Source:{' '}
                {molecule.pubchemSource.sourceType === 'pubchem-live'
                  ? 'PubChem PUG REST'
                  : molecule.pubchemSource.sourceType === 'pubchem-100k-index'
                  ? 'PubChem 100k Index'
                  : molecule.pubchemSource.sourceType === 'pure-element'
                  ? 'IUPAC Pure Element'
                  : 'SMILES Engine'}
              </span>
              <span aria-hidden="true">·</span>
              <a
                href={molecule.pubchemSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 hover:text-[#CC0000] underline decoration-slate-300 underline-offset-2 inline-flex items-center gap-1 whitespace-nowrap"
              >
                PubChem Record
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {activeNote && (
            <div className="mb-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-[12px] text-slate-700 flex items-center justify-between gap-3">
              <span>{activeNote}</span>
              <button
                type="button"
                onClick={() => setActiveNote(null)}
                className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Main 2-Column SwissADME Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2 items-start">
            {/* LEFT COLUMN */}
            <div className="min-w-0">
              {/* Structure + Bioavailability Radar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pb-2">
                <div className="h-[195px] flex items-center justify-center bg-white p-2 overflow-hidden">
                  {usePubChemPng && molecule.cid ? (
                    <img
                      src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${molecule.cid}/PNG?image_size=300x300`}
                      alt={`2D structure of ${molecule.name}`}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                      onError={() => setUsePubChemPng(false)}
                    />
                  ) : molecule.svgStructure ? (
                    <div
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[178px] [&>svg]:w-auto [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: molecule.svgStructure }}
                    />
                  ) : (
                    <div className="text-xs text-slate-400 font-mono">{p.formula}</div>
                  )}
                </div>

                <div className="flex items-center justify-center">
                  <BioavailabilityRadar
                    radar={molecule.radar}
                    rawMetrics={{
                      xLogP3: lip.xLogP3,
                      mw: p.molecularWeight,
                      tpsa: p.tpsa,
                      logS: sol.esol.logS,
                      fCsp3: p.fractionCsp3,
                      rotBonds: p.numRotatableBonds,
                    }}
                  />
                </div>
              </div>

              {/* SMILES Line */}
              <div className="flex items-baseline gap-3 py-1.5 px-1 text-[12px] border-t border-slate-100">
                <span className="text-[#4B5563] shrink-0 font-medium">SMILES</span>
                <span className="font-mono text-[11.5px] text-[#1F2937] break-all flex-1">
                  {molecule.isomericSmiles || molecule.smiles}
                </span>
                <button
                  type="button"
                  onClick={handleCopySmiles}
                  title="Copy SMILES"
                  className="text-slate-400 hover:text-slate-700 shrink-0 inline-flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  {copiedSmiles ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Physicochemical Properties */}
              <SectionBar title="Physicochemical Properties" />
              <div className="divide-y divide-slate-100/80">
                <PropRow label="Formula" value={p.formula} />
                <PropRow
                  label="Molecular weight"
                  value={`${p.molecularWeight.toFixed(2)} g/mol`}
                />
                <PropRow label="Num. heavy atoms" value={p.numHeavyAtoms} />
                <PropRow label="Num. arom. heavy atoms" value={p.numAromaticHeavyAtoms} />
                <PropRow label="Fraction Csp3" value={p.fractionCsp3.toFixed(2)} />
                <PropRow label="Num. rotatable bonds" value={p.numRotatableBonds} />
                <PropRow label="Num. H-bond acceptors" value={p.numHBondAcceptors} />
                <PropRow label="Num. H-bond donors" value={p.numHBondDonors} />
                <PropRow label="Molar Refractivity" value={p.molarRefractivity.toFixed(2)} />
                <PropRow
                  label="TPSA"
                  helpTopic="TPSA"
                  value={`${p.tpsa.toFixed(2)} Å²`}
                />
              </div>

              {/* Lipophilicity */}
              <SectionBar title="Lipophilicity" />
              <div className="divide-y divide-slate-100/80">
                <PropRow
                  label={
                    <>
                      Log <i>P</i>
                      <sub>o/w</sub> (iLOGP)
                    </>
                  }
                  helpTopic="iLOGP"
                  value={lip.iLogP.toFixed(2)}
                />
                <PropRow
                  label={
                    <>
                      Log <i>P</i>
                      <sub>o/w</sub> (XLOGP3)
                    </>
                  }
                  helpTopic="XLOGP3"
                  value={lip.xLogP3.toFixed(2)}
                />
                <PropRow
                  label={
                    <>
                      Log <i>P</i>
                      <sub>o/w</sub> (WLOGP)
                    </>
                  }
                  helpTopic="WLOGP"
                  value={lip.wLogP.toFixed(2)}
                />
                <PropRow
                  label={
                    <>
                      Log <i>P</i>
                      <sub>o/w</sub> (MLOGP)
                    </>
                  }
                  helpTopic="MLOGP"
                  value={lip.mLogP.toFixed(2)}
                />
                <PropRow
                  label={
                    <>
                      Log <i>P</i>
                      <sub>o/w</sub> (SILICOS-IT)
                    </>
                  }
                  helpTopic="SILICOS-IT LogP"
                  value={lip.silicosIt.toFixed(2)}
                />
                <PropRow
                  label={
                    <>
                      Consensus Log <i>P</i>
                      <sub>o/w</sub>
                    </>
                  }
                  helpTopic="Consensus Log Po/w"
                  value={lip.consensusLogP.toFixed(2)}
                />
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="min-w-0">
              {/* Water Solubility */}
              <SectionBar title="Water Solubility" />
              <div className="divide-y divide-slate-100/80">
                <PropRow
                  label={
                    <>
                      Log <i>S</i> (ESOL)
                    </>
                  }
                  helpTopic="Log S (ESOL)"
                  value={sol.esol.logS.toFixed(2)}
                />
                <PropRow
                  label="Solubility"
                  value={`${sol.esol.mgMl} ; ${sol.esol.molL}`}
                />
                <PropRow label="Class" helpTopic="Class" value={sol.esol.solubilityClass} />

                <PropRow
                  label={
                    <>
                      Log <i>S</i> (Ali)
                    </>
                  }
                  helpTopic="Log S (Ali)"
                  value={sol.ali.logS.toFixed(2)}
                />
                <PropRow
                  label="Solubility"
                  value={`${sol.ali.mgMl} ; ${sol.ali.molL}`}
                />
                <PropRow label="Class" helpTopic="Class" value={sol.ali.solubilityClass} />

                <PropRow
                  label={
                    <>
                      Log <i>S</i> (SILICOS-IT)
                    </>
                  }
                  helpTopic="Log S (SILICOS-IT)"
                  value={sol.silicosIt.logS.toFixed(2)}
                />
                <PropRow
                  label="Solubility"
                  value={`${sol.silicosIt.mgMl} ; ${sol.silicosIt.molL}`}
                />
                <PropRow label="Class" helpTopic="Class" value={sol.silicosIt.solubilityClass} />
              </div>

              {/* Pharmacokinetics */}
              <SectionBar title="Pharmacokinetics" />
              <div className="divide-y divide-slate-100/80">
                <PropRow
                  label="GI absorption"
                  helpTopic="GI absorption"
                  value={pk.giAbsorption}
                />
                <PropRow
                  label="BBB permeant"
                  helpTopic="BBB permeant"
                  value={pk.bbbPermeant}
                />
                <PropRow
                  label="P-gp substrate"
                  helpTopic="P-gp substrate"
                  value={pk.pgpSubstrate}
                />
                <PropRow
                  label="CYP1A2 inhibitor"
                  helpTopic="CYP1A2"
                  value={pk.cyp1a2Inhibitor}
                />
                <PropRow
                  label="CYP2C19 inhibitor"
                  helpTopic="CYP2C19"
                  value={pk.cyp2c19Inhibitor}
                />
                <PropRow
                  label="CYP2C9 inhibitor"
                  helpTopic="CYP2C9"
                  value={pk.cyp2c9Inhibitor}
                />
                <PropRow
                  label="CYP2D6 inhibitor"
                  helpTopic="CYP2D6"
                  value={pk.cyp2d6Inhibitor}
                />
                <PropRow
                  label="CYP3A4 inhibitor"
                  helpTopic="CYP3A4"
                  value={pk.cyp3a4Inhibitor}
                />
                <PropRow
                  label={
                    <>
                      Log <i>K</i>
                      <sub>p</sub> (skin permeation)
                    </>
                  }
                  helpTopic="Log Kp"
                  value={`${pk.logKp.toFixed(2)} cm/s`}
                />
              </div>

              {/* Druglikeness */}
              <SectionBar title="Druglikeness" />
              <div className="divide-y divide-slate-100/80">
                <PropRow label="Lipinski" helpTopic="Lipinski" value={dl.lipinski} />
                <PropRow label="Ghose" helpTopic="Ghose" value={dl.ghose} />
                <PropRow label="Veber" helpTopic="Veber" value={dl.veber} />
                <PropRow label="Egan" helpTopic="Egan" value={dl.egan} />
                <PropRow label="Muegge" helpTopic="Muegge" value={dl.muegge} />
                <PropRow
                  label="Bioavailability Score"
                  helpTopic="Bioavailability Score"
                  value={dl.bioavailabilityScore.toFixed(2)}
                />
              </div>

              {/* Medicinal Chemistry */}
              <SectionBar title="Medicinal Chemistry" />
              <div className="divide-y divide-slate-100/80">
                <PropRow label="PAINS" helpTopic="PAINS" value={mc.pains} />
                <PropRow label="Brenk" helpTopic="Brenk" value={mc.brenk} />
                <PropRow
                  label="Leadlikeness"
                  helpTopic="Leadlikeness"
                  value={mc.leadlikeness}
                />
                <PropRow
                  label="Synthetic accessibility"
                  helpTopic="Synthetic accessibility"
                  value={mc.syntheticAccessibility.toFixed(2)}
                />
              </div>
            </div>
          </div>

          {/* Pure Element Atomic & Physical Properties (when inspecting a pure element) */}
          {molecule.isElement && molecule.elementData && (
            <div className="mt-3 pt-2 border-t border-slate-200">
              <SectionBar
                title={`Pure Element Physical Data — ${molecule.elementData.name} (${molecule.elementData.symbol}, Z = ${molecule.elementData.atomicNumber})`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 divide-y md:divide-y-0 divide-slate-100">
                <div className="divide-y divide-slate-100">
                  <PropRow label="Atomic Number (Z)" value={molecule.elementData.atomicNumber} />
                  <PropRow label="Standard Atomic Weight" value={`${molecule.elementData.atomicMass} u`} />
                  <PropRow label="Chemical Category" value={molecule.elementData.category} />
                  <PropRow
                    label="Group / Period"
                    value={`Group ${molecule.elementData.group ?? 'f-block'} · Period ${molecule.elementData.period}`}
                  />
                  <PropRow label="Electron Configuration" value={molecule.elementData.electronConfig} />
                </div>
                <div className="divide-y divide-slate-100">
                  <PropRow label="Standard Phase" value={molecule.elementData.phase} />
                  <PropRow
                    label="Electronegativity (Pauling)"
                    value={molecule.elementData.electronegativity ?? 'N/A'}
                  />
                  <PropRow
                    label="Density"
                    value={
                      molecule.elementData.density !== null
                        ? `${molecule.elementData.density} g/cm³`
                        : 'Unknown'
                    }
                  />
                  <PropRow
                    label="Melting / Boiling Point"
                    value={`${molecule.elementData.meltingPointK ?? '—'} K / ${molecule.elementData.boilingPointK ?? '—'} K`}
                  />
                  <PropRow label="Oxidation States" value={molecule.elementData.oxidationStates} />
                </div>
              </div>
            </div>
          )}

          {/* Synonyms / PubChem Identifier Line */}
          {molecule.pubchemSource.synonyms.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11.5px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-medium text-slate-600">Synonyms:</span>
              <span>{molecule.pubchemSource.synonyms.join(' · ')}</span>
              {molecule.inchiKey && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px]">InChIKey {molecule.inchiKey}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
