export interface ElementRecord {
  atomicNumber: number;
  symbol: string;
  name: string;
  atomicMass: number;
  pubchemCid: number | null;
  smiles: string;
  category: string;
  group: number | null;
  period: number;
  phase: 'Solid' | 'Liquid' | 'Gas';
  electronConfig: string;
  electronegativity: number | null;
  density: number | null;
  meltingPointK: number | null;
  boilingPointK: number | null;
  oxidationStates: string;
}

export interface SolubilityModelResult {
  logS: number;
  mgMl: string;
  molL: string;
  solubilityClass:
    | 'Insoluble'
    | 'Poorly soluble'
    | 'Moderately soluble'
    | 'Soluble'
    | 'Very soluble'
    | 'Highly soluble'
    | 'N/A';
}

export interface BioavailabilityRadarData {
  // Normalized 0..1 coordinates where 0.16..0.60 represents the optimal pink hexagon zone
  lipo: number;
  size: number;
  polar: number;
  insolu: number;
  insatu: number;
  flex: number;
  inOptimalZone: {
    lipo: boolean;
    size: boolean;
    polar: boolean;
    insolu: boolean;
    insatu: boolean;
    flex: boolean;
  };
}

export interface MoleculeCardData {
  id: string;
  cid: number | null;
  name: string;
  iupacName?: string;
  smiles: string;
  isomericSmiles?: string;
  inchiKey?: string;
  svgStructure: string;
  isElement: boolean;
  elementData?: ElementRecord;
  radar: BioavailabilityRadarData;
  physicochemical: {
    formula: string;
    molecularWeight: number;
    numHeavyAtoms: number;
    numAromaticHeavyAtoms: number;
    fractionCsp3: number;
    numRotatableBonds: number;
    numHBondAcceptors: number;
    numHBondDonors: number;
    molarRefractivity: number;
    tpsa: number;
  };
  lipophilicity: {
    iLogP: number;
    xLogP3: number;
    wLogP: number;
    mLogP: number;
    silicosIt: number;
    consensusLogP: number;
  };
  waterSolubility: {
    esol: SolubilityModelResult;
    ali: SolubilityModelResult;
    silicosIt: SolubilityModelResult;
  };
  pharmacokinetics: {
    giAbsorption: 'High' | 'Low' | 'N/A';
    bbbPermeant: 'Yes' | 'No';
    pgpSubstrate: 'Yes' | 'No';
    cyp1a2Inhibitor: 'Yes' | 'No';
    cyp2c19Inhibitor: 'Yes' | 'No';
    cyp2c9Inhibitor: 'Yes' | 'No';
    cyp2d6Inhibitor: 'Yes' | 'No';
    cyp3a4Inhibitor: 'Yes' | 'No';
    logKp: number;
  };
  druglikeness: {
    lipinski: string;
    ghose: string;
    veber: string;
    egan: string;
    muegge: string;
    bioavailabilityScore: number;
  };
  medicinalChemistry: {
    pains: string;
    brenk: string;
    leadlikeness: string;
    syntheticAccessibility: number;
  };
  pubchemSource: {
    url: string;
    cid: number | null;
    sourceType: 'pubchem-live' | 'pubchem-100k-index' | 'pure-element' | 'smiles-computed';
    synonyms: string[];
  };
}

export interface SearchCandidate {
  cid: number | null;
  formula: string;
  title: string;
  mw: string;
  smiles: string;
  source: 'pure-element' | 'pubchem-100k-index' | 'pubchem-live';
  isElement?: boolean;
}

export interface LookupResponse {
  query: string;
  normalizedFormula: string | null;
  matchedBy: 'element' | 'formula' | 'smiles' | 'cid' | 'name';
  primary: MoleculeCardData | null;
  candidates: SearchCandidate[];
  totalPubChemMatches?: number;
  error?: string;
}

export interface IndexStats {
  totalCompounds: number;
  cachedCompounds: number;
  pubchemTotalCompounds: number;
  totalElements: number;
  uniqueFormulas: number;
  pubchemConnected: boolean;
}
