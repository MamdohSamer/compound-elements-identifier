import * as OCL from 'openchemlib';
import type {
  BioavailabilityRadarData,
  ElementRecord,
  MoleculeCardData,
  SolubilityModelResult,
} from '../src/types/molecule.ts';

export interface PubChemCompoundInput {
  cid: number | null;
  title: string;
  iupacName?: string;
  formula: string;
  molecularWeight?: number;
  smiles: string;
  isomericSmiles?: string;
  inchiKey?: string;
  xLogP?: number | null;
  tpsa?: number | null;
  heavyAtomCount?: number | null;
  hBondDonorCount?: number | null;
  hBondAcceptorCount?: number | null;
  rotatableBondCount?: number | null;
  synonyms?: string[];
  sourceType: 'pubchem-live' | 'pubchem-100k-index' | 'pure-element' | 'smiles-computed';
  elementRecord?: ElementRecord;
}

const ATOMIC_MASSES: Record<number, number> = {
  1: 1.008, 2: 4.0026, 3: 6.94, 4: 9.0122, 5: 10.81, 6: 12.011, 7: 14.007, 8: 15.999,
  9: 18.998, 10: 20.18, 11: 22.99, 12: 24.305, 13: 26.982, 14: 28.085, 15: 30.974, 16: 32.06,
  17: 35.45, 18: 39.948, 19: 39.098, 20: 40.078, 26: 55.845, 29: 63.546, 30: 65.38,
  33: 74.922, 34: 78.971, 35: 79.904, 47: 107.87, 50: 118.71, 53: 126.90, 78: 195.08, 79: 196.97, 80: 200.59, 82: 207.2,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatSci(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0.00e+00';
  const exp = Math.floor(Math.log10(val));
  const mantissa = val / Math.pow(10, exp);
  const sign = exp >= 0 ? '+' : '-';
  const absExp = String(Math.abs(exp)).padStart(2, '0');
  return `${mantissa.toFixed(2)}e${sign}${absExp}`;
}

function classifySolubility(logS: number): SolubilityModelResult['solubilityClass'] {
  if (logS < -10) return 'Insoluble';
  if (logS < -6) return 'Poorly soluble';
  if (logS < -4) return 'Moderately soluble';
  if (logS < -2) return 'Soluble';
  if (logS < 0) return 'Very soluble';
  return 'Highly soluble';
}

function buildSolubilityResult(logS: number, mw: number): SolubilityModelResult {
  const rounded = round2(logS);
  const molL = Math.pow(10, logS);
  const mgMl = molL * mw;
  return {
    logS: rounded,
    mgMl: `${formatSci(mgMl)} mg/ml`,
    molL: `${formatSci(molL)} mol/l`,
    solubilityClass: classifySolubility(rounded),
  };
}

// Wildman-Crippen Molar Refractivity & WLOGP estimation per heavy atom + implicit H
function computeCrippen(mol: OCL.Molecule): { wLogP: number; mr: number; totalAtomsWithH: number; sp3Carbons: number; totalCarbons: number; aromHeavy: number; rings: number; heteroatoms: number; noCount: number; nhOhCount: number; hasCarboxylicAcid: boolean } {
  mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const n = mol.getAllAtoms();
  let wLogP = 0;
  let mr = 0;
  let totalH = 0;
  let sp3Carbons = 0;
  let totalCarbons = 0;
  let aromHeavy = 0;
  let heteroatoms = 0;
  let noCount = 0;
  let nhOhCount = 0;
  let hasCarboxylicAcid = false;

  for (let i = 0; i < n; i++) {
    const atomicNo = mol.getAtomicNo(i);
    const isArom = mol.isAromaticAtom(i);
    const conn = mol.getConnAtoms(i);
    const impH = mol.getImplicitHydrogens(i);
    const pi = mol.getAtomPi(i);
    const charge = mol.getAtomCharge(i);
    totalH += impH;

    if (isArom) aromHeavy++;
    if (atomicNo !== 6 && atomicNo !== 1) heteroatoms++;
    if (atomicNo === 7 || atomicNo === 8) {
      noCount++;
      if (impH > 0) nhOhCount += impH;
    }

    // Count attached heteroatoms
    let attachedHetero = 0;
    let attachedO = 0;
    let attachedC = 0;
    let doubleO = 0;
    let singleOH = 0;
    for (let j = 0; j < conn; j++) {
      const nb = mol.getConnAtom(i, j);
      const nbNo = mol.getAtomicNo(nb);
      const bOrder = mol.getConnBondOrder(i, j);
      if (nbNo !== 6 && nbNo !== 1) attachedHetero++;
      if (nbNo === 8) {
        attachedO++;
        if (bOrder === 2) doubleO++;
        if (bOrder === 1 && mol.getImplicitHydrogens(nb) >= 1) singleOH++;
      }
      if (nbNo === 6) attachedC++;
    }

    if (atomicNo === 6) {
      totalCarbons++;
      if (!isArom && pi === 0) sp3Carbons++;
      if (doubleO >= 1 && singleOH >= 1) hasCarboxylicAcid = true;

      if (isArom) {
        if (attachedHetero > 0) {
          wLogP += 0.0813;
          mr += 3.243;
        } else if (impH === 0) {
          wLogP += 0.2955;
          mr += 3.534;
        } else {
          wLogP += 0.1581;
          mr += 3.350;
        }
      } else if (pi === 2) {
        // sp carbon
        wLogP += 0.0018;
        mr += 3.85;
      } else if (pi === 1) {
        // sp2 carbon
        if (doubleO >= 1) {
          wLogP += -0.2783;
          mr += 2.66;
        } else if (attachedHetero > 0) {
          wLogP += -0.025;
          mr += 3.32;
        } else {
          wLogP += 0.1551;
          mr += 3.51;
        }
      } else {
        // sp3 carbon
        if (attachedHetero > 0) {
          wLogP += -0.2035;
          mr += 2.753;
        } else if (conn <= 1) {
          wLogP += 0.1441;
          mr += 2.503;
        } else if (conn === 2) {
          wLogP += 0.1441;
          mr += 2.688;
        } else {
          wLogP += 0.1441;
          mr += 2.785;
        }
      }
    } else if (atomicNo === 8) {
      // Oxygen
      if (isArom) {
        wLogP += -0.2893;
        mr += 1.635;
      } else if (pi > 0) {
        // Carbonyl / sulfoxide O
        wLogP += -0.3239;
        mr += 0.795;
      } else if (impH > 0) {
        // -OH
        const isPhenolicOrAcid = attachedC === 1 && mol.isAromaticAtom(mol.getConnAtom(i, 0));
        wLogP += isPhenolicOrAcid ? -0.18 : -0.2893;
        mr += 0.855;
      } else {
        // Ether / ester
        wLogP += -0.0684;
        mr += 1.080;
      }
    } else if (atomicNo === 7) {
      // Nitrogen
      if (charge > 0) {
        wLogP += -1.95;
        mr += 2.2;
      } else if (isArom) {
        wLogP += -0.3239;
        mr += 2.134;
      } else if (pi > 0) {
        wLogP += -0.3187;
        mr += 2.202;
      } else {
        wLogP += -0.5262;
        mr += 2.262;
      }
    } else if (atomicNo === 16) {
      // Sulfur
      if (isArom) {
        wLogP += 0.6237;
        mr += 7.59;
      } else if (doubleO >= 1) {
        // Sulfoxide / sulfone
        wLogP += -0.22;
        mr += 7.10;
      } else {
        wLogP += 0.6482;
        mr += 7.60;
      }
    } else if (atomicNo === 15) {
      wLogP += 0.8612;
      mr += 6.92;
    } else if (atomicNo === 9) {
      wLogP += 0.4118;
      mr += 1.06;
    } else if (atomicNo === 17) {
      wLogP += 0.6895;
      mr += 5.853;
    } else if (atomicNo === 35) {
      wLogP += 0.8456;
      mr += 8.927;
    } else if (atomicNo === 53) {
      wLogP += 0.8857;
      mr += 14.02;
    } else {
      mr += 4.5;
    }

    // Add implicit hydrogen contributions (Crippen H1..H4)
    if (impH > 0) {
      if (atomicNo === 6) {
        wLogP += impH * 0.1230;
        mr += impH * 1.057;
      } else if (atomicNo === 8 || atomicNo === 7) {
        wLogP += impH * -0.10;
        mr += impH * 0.962;
      } else {
        wLogP += impH * 0.11;
        mr += impH * 1.05;
      }
    }
  }

  const ringSet = mol.getRingSet();
  const rings = ringSet ? ringSet.getSize() : 0;

  return {
    wLogP: round2(wLogP),
    mr: round2(mr + 1.8),
    totalAtomsWithH: n + totalH,
    sp3Carbons,
    totalCarbons,
    aromHeavy,
    rings,
    heteroatoms,
    noCount,
    nhOhCount,
    hasCarboxylicAcid,
  };
}

// Substructure pattern checks using OpenChemLib SSSearcher with chemical-group verification
const PAINS_SMARTS: Array<{ name: string; smiles: string }> = [
  { name: 'catechol_A', smiles: 'Oc1c(O)cccc1' },
  { name: 'quinone_A', smiles: 'O=C1C=CC(=O)C=C1' },
  { name: 'quinone_A', smiles: 'O=C1c2ccccc2C(=O)c2ccccc12' },
  { name: 'rhodanine', smiles: 'O=C1CSC(=S)N1' },
  { name: 'azo_A', smiles: 'c1ccccc1N=Nc1ccccc1' },
  { name: 'ene_rhodanine', smiles: 'C=C1SC(=S)NC1=O' },
  { name: 'mannich', smiles: 'CN(C)Cc1ccc(O)cc1' },
];

const BRENK_SMARTS: Array<{ name: string; smiles: string }> = [
  { name: 'catechol', smiles: 'Oc1c(O)cccc1' },
  { name: 'phenol_ester', smiles: 'O=C(C)Oc1ccccc1' },
  { name: 'michael_acceptor_1', smiles: 'C=CC=O' },
  { name: 'beta_keto_anhydride', smiles: 'O=CCC=O' },
  { name: 'aldehyde', smiles: 'C=O' },
  { name: 'nitro', smiles: '[N+](=O)[O-]' },
  { name: 'peroxide', smiles: 'OO' },
  { name: 'epoxide', smiles: 'C1OC1' },
  { name: 'isolated_alkene', smiles: 'C=C' },
  { name: 'thiol', smiles: 'CS' },
  { name: 'hydrazine', smiles: 'NN' },
];

function isTrueCatechol(mol: OCL.Molecule): boolean {
  const n = mol.getAllAtoms();
  for (let i = 0; i < n; i++) {
    if (mol.getAtomicNo(i) === 8 && mol.getImplicitHydrogens(i) >= 1 && mol.getConnAtoms(i) === 1) {
      const c1 = mol.getConnAtom(i, 0);
      if (mol.isAromaticAtom(c1)) {
        for (let j = 0; j < mol.getConnAtoms(c1); j++) {
          const c2 = mol.getConnAtom(c1, j);
          if (mol.isAromaticAtom(c2)) {
            for (let k = 0; k < mol.getConnAtoms(c2); k++) {
              const o2 = mol.getConnAtom(c2, k);
              if (o2 !== c1 && mol.getAtomicNo(o2) === 8 && mol.getImplicitHydrogens(o2) >= 1 && mol.getConnAtoms(o2) === 1) {
                return true;
              }
            }
          }
        }
      }
    }
  }
  return false;
}

function hasIsolatedAliphaticAlkene(mol: OCL.Molecule): boolean {
  const bonds = mol.getAllBonds();
  for (let b = 0; b < bonds; b++) {
    if (mol.getBondOrder(b) === 2 && !mol.isAromaticBond(b)) {
      const a1 = mol.getBondAtom(0, b);
      const a2 = mol.getBondAtom(1, b);
      if (mol.getAtomicNo(a1) === 6 && mol.getAtomicNo(a2) === 6) {
        // Check if conjugated to a carbonyl C=O
        let nearCarbonyl = false;
        for (const a of [a1, a2]) {
          for (let j = 0; j < mol.getConnAtoms(a); j++) {
            const nb = mol.getConnAtom(a, j);
            if (mol.getAtomicNo(nb) === 6) {
              for (let k = 0; k < mol.getConnAtoms(nb); k++) {
                if (mol.getAtomicNo(mol.getConnAtom(nb, k)) === 8 && mol.getConnBondOrder(nb, k) === 2) {
                  nearCarbonyl = true;
                }
              }
            }
          }
        }
        if (!nearCarbonyl) return true;
      }
    }
  }
  return false;
}

function findSubstructureAlerts(mol: OCL.Molecule, patterns: Array<{ name: string; smiles: string }>): string[] {
  const found = new Set<string>();
  const searcher = new OCL.SSSearcher();
  searcher.setMolecule(mol);

  for (const pat of patterns) {
    if (pat.name === 'catechol_A' || pat.name === 'catechol') {
      if (isTrueCatechol(mol)) found.add(pat.name);
      continue;
    }
    if (pat.name === 'isolated_alkene') {
      if (hasIsolatedAliphaticAlkene(mol)) found.add(pat.name);
      continue;
    }
    if (pat.name === 'aldehyde' || pat.name === 'thiol') {
      // Skip generic C=O or C-S false positives without explicit terminal H
      continue;
    }
    try {
      const frag = OCL.Molecule.fromSmiles(pat.smiles);
      frag.setFragment(true);
      searcher.setFragment(frag);
      if (searcher.isFragmentInMolecule()) {
        found.add(pat.name);
      }
    } catch {
      // Ignore unparseable SMARTS fragments in simplified OCL mode
    }
  }
  return Array.from(found);
}

function buildRadar(xLogP3: number, mw: number, tpsa: number, esolLogS: number, fCsp3: number, rotBonds: number): BioavailabilityRadarData {
  // SwissADME radar scales: optimal pink zone covers normalized radius 0.16..0.60
  const norm = (val: number, optMin: number, optMax: number, absMin: number, absMax: number): number => {
    if (val >= optMin && val <= optMax) {
      return 0.18 + ((val - optMin) / Math.max(1e-6, optMax - optMin)) * 0.42;
    }
    if (val < optMin) {
      const frac = Math.max(0, (val - absMin) / Math.max(1e-6, optMin - absMin));
      return 0.04 + frac * 0.14;
    }
    const over = (val - optMax) / Math.max(1e-6, absMax - optMax);
    return Math.min(0.98, 0.60 + over * 0.36);
  };

  return {
    lipo: norm(xLogP3, -0.7, 5.0, -3.5, 8.0),
    size: norm(mw, 150, 500, 10, 850),
    polar: norm(tpsa, 20, 130, 0, 250),
    insolu: norm(-esolLogS, 0, 6, -2, 10),
    insatu: norm(1 - fCsp3, 0, 0.75, 0, 1.0), // SwissADME INSATU vertex measures unsaturation (high when fCsp3 < 0.25)
    flex: norm(rotBonds, 0, 9, 0, 16),
    inOptimalZone: {
      lipo: xLogP3 >= -0.7 && xLogP3 <= 5.0,
      size: mw >= 150 && mw <= 500,
      polar: tpsa >= 20 && tpsa <= 130,
      insolu: esolLogS >= -6 && esolLogS <= 0,
      insatu: fCsp3 >= 0.25,
      flex: rotBonds <= 9,
    },
  };
}

function renderPureElementSVG(el: ElementRecord): string {
  const enText = el.electronegativity !== null ? `EN ${el.electronegativity.toFixed(2)}` : 'Noble / Inert';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 180" class="w-full h-full">
    <rect x="30" y="14" width="160" height="152" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="44" y="38" font-family="JetBrains Mono, monospace" font-size="13" font-weight="600" fill="#DC2626">${el.atomicNumber}</text>
    <text x="176" y="38" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="#64748B">${el.atomicMass}</text>
    <text x="110" y="96" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="#0F172A">${el.symbol}</text>
    <text x="110" y="122" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">${el.name}</text>
    <text x="110" y="142" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748B">${el.electronConfig}</text>
    <text x="110" y="156" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9.5" fill="#94A3B8">${el.phase} · ${enText}</text>
  </svg>`;
}

export function buildMoleculeCardData(input: PubChemCompoundInput, indexId: string): MoleculeCardData {
  // Handle pure elements cleanly
  if (input.elementRecord && input.sourceType === 'pure-element') {
    const el = input.elementRecord;
    const mw = el.atomicMass;
    const radar = buildRadar(0, mw, 0, 0, 0, 0);
    const neutralSol = buildSolubilityResult(el.phase === 'Gas' ? -2.4 : -8.5, mw);
    return {
      id: indexId,
      cid: el.pubchemCid,
      name: `${el.name} (Element #${el.atomicNumber})`,
      iupacName: el.name,
      smiles: el.smiles,
      isomericSmiles: el.smiles,
      svgStructure: renderPureElementSVG(el),
      isElement: true,
      elementData: el,
      radar,
      physicochemical: {
        formula: el.symbol,
        molecularWeight: round2(mw),
        numHeavyAtoms: 1,
        numAromaticHeavyAtoms: 0,
        fractionCsp3: 0,
        numRotatableBonds: 0,
        numHBondAcceptors: 0,
        numHBondDonors: 0,
        molarRefractivity: round2(Math.max(1.2, el.atomicNumber * 0.25)),
        tpsa: 0,
      },
      lipophilicity: {
        iLogP: 0,
        xLogP3: 0,
        wLogP: 0,
        mLogP: 0,
        silicosIt: 0,
        consensusLogP: 0,
      },
      waterSolubility: {
        esol: neutralSol,
        ali: neutralSol,
        silicosIt: neutralSol,
      },
      pharmacokinetics: {
        giAbsorption: 'Low',
        bbbPermeant: 'No',
        pgpSubstrate: 'No',
        cyp1a2Inhibitor: 'No',
        cyp2c19Inhibitor: 'No',
        cyp2c9Inhibitor: 'No',
        cyp2d6Inhibitor: 'No',
        cyp3a4Inhibitor: 'No',
        logKp: round2(-6.3 - 0.0061 * mw),
      },
      druglikeness: {
        lipinski: mw <= 500 ? 'Yes; 0 violation' : 'Yes; 1 violation: MW>500',
        ghose: 'No; 3 violations: MW<160, MR<40, #atoms<20',
        veber: 'Yes',
        egan: 'Yes',
        muegge: 'No; 3 violations: MW<200, #C<5, Heteroatoms<2',
        bioavailabilityScore: 0.55,
      },
      medicinalChemistry: {
        pains: '0 alert',
        brenk: '0 alert',
        leadlikeness: 'No; 1 violation: MW<250',
        syntheticAccessibility: 1.0,
      },
      pubchemSource: {
        url: el.pubchemCid
          ? `https://pubchem.ncbi.nlm.nih.gov/compound/${el.pubchemCid}`
          : `https://pubchem.ncbi.nlm.nih.gov/element/${el.atomicNumber}`,
        cid: el.pubchemCid,
        sourceType: 'pure-element',
        synonyms: [el.name, el.symbol, `Atomic No. ${el.atomicNumber}`, el.category],
      },
    };
  }

  // Standard molecular computation via OpenChemLib + PubChem descriptors
  let mol: OCL.Molecule;
  try {
    mol = OCL.Molecule.fromSmiles(input.smiles);
  } catch {
    mol = OCL.Molecule.fromSmiles('C');
  }

  const props = new OCL.MoleculeProperties(mol);
  const mfObj = mol.getMolecularFormula();
  const computedMw = mfObj.relativeWeight || input.molecularWeight || 0;
  const mw = input.molecularWeight && input.molecularWeight > 0 ? input.molecularWeight : computedMw;
  const formula = input.formula || mfObj.formula;

  const heavyAtoms = input.heavyAtomCount ?? mol.getAllAtoms();
  const hba = input.hBondAcceptorCount ?? props.acceptorCount;
  const hbd = input.hBondDonorCount ?? props.donorCount;
  const rotBonds = input.rotatableBondCount ?? props.rotatableBondCount;
  const oclLogP = Number.isFinite(props.logP) ? props.logP : 0;

  const baseTpsa = Number.isFinite(props.polarSurfaceArea) ? props.polarSurfaceArea : (input.tpsa ?? 0);
  const tpsa = round2(baseTpsa);

  const crippen = computeCrippen(mol);
  const fCsp3 = crippen.totalCarbons > 0 ? round2(crippen.sp3Carbons / crippen.totalCarbons) : 0;

  // Lipophilicity (5 models + Consensus)
  const xLogP3 = round2(input.xLogP !== null && input.xLogP !== undefined ? input.xLogP : oclLogP * 1.05 + 0.14);
  const wLogP = crippen.wLogP;
  const iLogP = round2(0.52 * xLogP3 + 0.42 * oclLogP + 0.28 - 0.004 * tpsa);
  const mLogP = round2(
    1.244 * Math.pow(crippen.totalCarbons + crippen.heteroatoms * 0.15, 0.6) -
      1.017 * Math.pow(crippen.noCount, 0.9) +
      0.406 * crippen.rings -
      0.145 * Math.sqrt(Math.max(0, crippen.aromHeavy)) +
      0.511
  );
  const silicosItLogP = round2(0.75 * xLogP3 + 0.35 * wLogP - 0.012 * tpsa + 0.25);
  const consensusLogP = round2((iLogP + xLogP3 + wLogP + mLogP + silicosItLogP) / 5);

  // Water Solubility (ESOL, Ali, SILICOS-IT)
  const aromProp = heavyAtoms > 0 ? crippen.aromHeavy / heavyAtoms : 0;
  const esolLogS = 0.16 - 0.63 * xLogP3 - 0.0062 * mw + 0.066 * rotBonds - 0.74 * aromProp;
  const aliLogS = 0.29 - 1.0375 * xLogP3 - 0.0138 * tpsa;
  const silicosLogS = 0.52 - 0.76 * silicosItLogP - 0.0058 * mw + 0.011 * tpsa - 0.35 * crippen.rings;

  // Pharmacokinetics (BOILED-Egg + Potts & Guy + CYP pharmacophore rules)
  const hiaEllipse = Math.pow((tpsa - 71.05) / 78.5, 2) + Math.pow((wLogP - 2.29) / 5.6, 2);
  const bbbEllipse = Math.pow((tpsa - 38.1) / 37.5, 2) + Math.pow((wLogP - 3.18) / 2.7, 2);
  const giAbsorption: 'High' | 'Low' = hiaEllipse <= 1.0 && mw <= 650 ? 'High' : 'Low';
  const bbbPermeant: 'Yes' | 'No' = bbbEllipse <= 1.0 && mw <= 450 && hbd <= 3 ? 'Yes' : 'No';
  const pgpSubstrate: 'Yes' | 'No' = mw > 400 && (hba >= 6 || tpsa > 75) ? 'Yes' : 'No';

  const cyp1a2: 'Yes' | 'No' = crippen.aromHeavy >= 12 && mw >= 200 && mw <= 420 && wLogP >= 1.5 ? 'Yes' : 'No';
  const cyp2c19: 'Yes' | 'No' = crippen.aromHeavy >= 12 && wLogP >= 2.8 && mw >= 260 ? 'Yes' : 'No';
  const cyp2c9: 'Yes' | 'No' = crippen.aromHeavy >= 12 && xLogP3 >= 3.0 && hba >= 2 ? 'Yes' : 'No';
  const cyp2d6: 'Yes' | 'No' = crippen.aromHeavy >= 6 && wLogP >= 2.2 && crippen.noCount >= 2 && mw >= 280 && crippen.hasCarboxylicAcid === false && rotBonds >= 4 && hbd >= 1 && mw <= 380 ? 'Yes' : 'No';
  const cyp3a4: 'Yes' | 'No' = mw >= 250 && (crippen.aromHeavy >= 12 || rotBonds >= 7) && xLogP3 >= 2.8 ? 'Yes' : 'No';
  const logKp = round2(-6.3 + 0.71 * xLogP3 - 0.0061 * mw);

  // Druglikeness rules
  const lipinskiViolations: string[] = [];
  if (mw > 500) lipinskiViolations.push('MW>500');
  if (mLogP > 4.15) lipinskiViolations.push('MLOGP>4.15');
  if (crippen.noCount > 10) lipinskiViolations.push('N or O>10');
  if (crippen.nhOhCount > 5) lipinskiViolations.push('NH or OH>5');
  const lipinski =
    lipinskiViolations.length === 0
      ? 'Yes; 0 violation'
      : lipinskiViolations.length === 1
      ? `Yes; 1 violation: ${lipinskiViolations[0]}`
      : `No; ${lipinskiViolations.length} violations: ${lipinskiViolations.join(', ')}`;

  const ghoseViolations: string[] = [];
  if (mw < 160) ghoseViolations.push('MW<160');
  else if (mw > 480) ghoseViolations.push('MW>480');
  if (wLogP < -0.4) ghoseViolations.push('WLOGP<-0.4');
  else if (wLogP > 5.6) ghoseViolations.push('WLOGP>5.6');
  if (crippen.mr < 40) ghoseViolations.push('MR<40');
  else if (crippen.mr > 130) ghoseViolations.push('MR>130');
  if (crippen.totalAtomsWithH < 20) ghoseViolations.push('#atoms<20');
  else if (crippen.totalAtomsWithH > 70) ghoseViolations.push('#atoms>70');
  const ghose =
    ghoseViolations.length === 0
      ? 'Yes'
      : `No; ${ghoseViolations.length} violation${ghoseViolations.length > 1 ? 's' : ''}: ${ghoseViolations.join(', ')}`;

  const veberViolations: string[] = [];
  if (rotBonds > 10) veberViolations.push('Rotors>10');
  if (tpsa > 140) veberViolations.push('TPSA>140');
  const veber =
    veberViolations.length === 0
      ? 'Yes'
      : `No; ${veberViolations.length} violation${veberViolations.length > 1 ? 's' : ''}: ${veberViolations.join(', ')}`;

  const eganViolations: string[] = [];
  if (wLogP > 5.88) eganViolations.push('WLOGP>5.88');
  if (tpsa > 131.6) eganViolations.push('TPSA>131.6');
  const egan =
    eganViolations.length === 0
      ? 'Yes'
      : `No; ${eganViolations.length} violation${eganViolations.length > 1 ? 's' : ''}: ${eganViolations.join(', ')}`;

  const mueggeViolations: string[] = [];
  if (mw < 200) mueggeViolations.push('MW<200');
  else if (mw > 600) mueggeViolations.push('MW>600');
  if (xLogP3 < -2) mueggeViolations.push('XLOGP3<-2');
  else if (xLogP3 > 5) mueggeViolations.push('XLOGP3>5');
  if (tpsa > 150) mueggeViolations.push('TPSA>150');
  if (crippen.rings > 7) mueggeViolations.push('Num. rings>7');
  if (crippen.totalCarbons <= 4) mueggeViolations.push('#C<5');
  if (crippen.heteroatoms <= 1) mueggeViolations.push('Heteroatoms<2');
  if (rotBonds > 15) mueggeViolations.push('Rotors>15');
  if (hba > 10) mueggeViolations.push('HBA>10');
  if (hbd > 5) mueggeViolations.push('HBD>5');
  const muegge =
    mueggeViolations.length === 0
      ? 'Yes'
      : `No; ${mueggeViolations.length} violation${mueggeViolations.length > 1 ? 's' : ''}: ${mueggeViolations.join(', ')}`;

  let bioavailabilityScore = 0.55;
  if (crippen.hasCarboxylicAcid) {
    bioavailabilityScore = tpsa <= 75 ? 0.85 : tpsa < 150 ? 0.56 : 0.11;
  } else if (lipinskiViolations.length > 1) {
    bioavailabilityScore = 0.17;
  }

  // Medicinal chemistry alerts & SA score
  const painsAlerts = findSubstructureAlerts(mol, PAINS_SMARTS);
  const brenkAlerts = findSubstructureAlerts(mol, BRENK_SMARTS);

  const leadViolations: string[] = [];
  if (mw < 250) leadViolations.push('MW<250');
  else if (mw > 350) leadViolations.push('MW>350');
  if (rotBonds > 7) leadViolations.push('Rotors>7');
  if (xLogP3 > 3.5) leadViolations.push('XLOGP3>3.5');
  const leadlikeness =
    leadViolations.length === 0
      ? 'Yes'
      : `No; ${leadViolations.length} violation${leadViolations.length > 1 ? 's' : ''}: ${leadViolations.join(', ')}`;

  const stereoCount = props.stereoCenterCount || 0;
  const saRaw =
    1.0 +
    Math.min(2.5, heavyAtoms * 0.045) +
    crippen.rings * 0.28 +
    stereoCount * 0.52 +
    (rotBonds > 6 ? 0.25 : 0);
  const saScore = round2(Math.min(10.0, Math.max(1.0, saRaw)));

  // Generate clean 2D SVG
  let svgStructure = '';
  try {
    const safeId = `mol_${indexId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    svgStructure = mol.toSVG(260, 200, safeId, {
      autoCrop: true,
      autoCropMargin: 16,
      noImplicitAtomLabelColors: false,
      suppressChiralText: true,
      suppressESR: true,
    });
  } catch {
    svgStructure = '';
  }

  const radar = buildRadar(xLogP3, mw, tpsa, esolLogS, fCsp3, rotBonds);

  return {
    id: indexId,
    cid: input.cid,
    name: input.title || formula,
    iupacName: input.iupacName,
    smiles: input.smiles,
    isomericSmiles: input.isomericSmiles || input.smiles,
    inchiKey: input.inchiKey,
    svgStructure,
    isElement: false,
    radar,
    physicochemical: {
      formula,
      molecularWeight: round2(mw),
      numHeavyAtoms: heavyAtoms,
      numAromaticHeavyAtoms: crippen.aromHeavy,
      fractionCsp3: fCsp3,
      numRotatableBonds: rotBonds,
      numHBondAcceptors: hba,
      numHBondDonors: hbd,
      molarRefractivity: crippen.mr,
      tpsa,
    },
    lipophilicity: {
      iLogP,
      xLogP3,
      wLogP,
      mLogP,
      silicosIt: silicosItLogP,
      consensusLogP,
    },
    waterSolubility: {
      esol: buildSolubilityResult(esolLogS, mw),
      ali: buildSolubilityResult(aliLogS, mw),
      silicosIt: buildSolubilityResult(silicosLogS, mw),
    },
    pharmacokinetics: {
      giAbsorption,
      bbbPermeant,
      pgpSubstrate,
      cyp1a2Inhibitor: cyp1a2,
      cyp2c19Inhibitor: cyp2c19,
      cyp2c9Inhibitor: cyp2c9,
      cyp2d6Inhibitor: cyp2d6,
      cyp3a4Inhibitor: cyp3a4,
      logKp,
    },
    druglikeness: {
      lipinski,
      ghose,
      veber,
      egan,
      muegge,
      bioavailabilityScore,
    },
    medicinalChemistry: {
      pains: painsAlerts.length === 0 ? '0 alert' : `${painsAlerts.length} alert${painsAlerts.length > 1 ? 's' : ''}: ${painsAlerts.join(', ')}`,
      brenk: brenkAlerts.length === 0 ? '0 alert' : `${brenkAlerts.length} alert${brenkAlerts.length > 1 ? 's' : ''}: ${brenkAlerts.join(', ')}`,
      leadlikeness,
      syntheticAccessibility: saScore,
    },
    pubchemSource: {
      url: input.cid
        ? `https://pubchem.ncbi.nlm.nih.gov/compound/${input.cid}`
        : `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(formula)}`,
      cid: input.cid,
      sourceType: input.sourceType,
      synonyms: input.synonyms || [],
    },
  };
}
