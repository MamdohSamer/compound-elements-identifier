import { useState, useRef, useEffect } from 'react';

const METHODOLOGY_NOTES: Record<string, string> = {
  TPSA: 'Topological Polar Surface Area (Å²) computed via Ertl fragment contributions (including N, O, S, and P polar atoms). Optimal oral bioavailability: 20–130 Å².',
  iLOGP: 'In-house physics-based Log Po/w estimate calibrated from solvation free energies in n-octanol and water.',
  XLOGP3: 'Atomistic and knowledge-based Log Po/w method sourced directly from PubChem XLogP3 when available.',
  WLOGP: 'Purely atomistic Wildman & Crippen (1999) Log Po/w classification across 68 atomic environments.',
  MLOGP: 'Moriguchi topological octanol-water partition coefficient used in Lipinski Rule-of-Five filtering (threshold ≤ 4.15).',
  'SILICOS-IT LogP': 'Hybrid fragmental + topological Log Po/w model combining electrotopological and solvation terms.',
  'Consensus Log Po/w': 'Arithmetic mean of all five lipophilicity predictions (iLOGP, XLOGP3, WLOGP, MLOGP, SILICOS-IT).',
  'Log S (ESOL)': 'Delaney (2004) Estimated SOLubility: Log S = 0.16 − 0.63·XLOGP3 − 0.0062·MW + 0.066·Rotors − 0.74·AP.',
  'Log S (Ali)': 'Ali et al. (2012) topological water solubility model incorporating XLOGP3 lipophilicity and TPSA.',
  'Log S (SILICOS-IT)': 'Linear fragment-based aqueous solubility prediction incorporating molecular weight, TPSA, and ring count.',
  Class: 'Water solubility scale: Insoluble (<−10), Poorly (−10 to −6), Moderately (−6 to −4), Soluble (−4 to −2), Very (−2 to 0), Highly (>0).',
  'GI absorption': 'Human Intestinal Absorption predicted via the BOILED-Egg white ellipse (WLOGP vs TPSA).',
  'BBB permeant': 'Blood-Brain Barrier permeation predicted via the BOILED-Egg yolk ellipse (WLOGP vs TPSA).',
  'P-gp substrate': 'P-glycoprotein efflux substrate likelihood estimated from molecular weight, TPSA, and H-bond acceptor count.',
  CYP1A2: 'Cytochrome P450 1A2 inhibition risk predicted from planar aromatic heavy atom density, MW, and WLOGP.',
  CYP2C19: 'Cytochrome P450 2C19 inhibition risk predicted from aromatic count, lipophilicity, and molecular size.',
  CYP2C9: 'Cytochrome P450 2C9 inhibition risk predicted from aromaticity, XLOGP3, and hydrogen-bond acceptors.',
  CYP2D6: 'Cytochrome P450 2D6 inhibition risk predicted from basic/polar nitrogen presence, aromaticity, and rotatable bonds.',
  CYP3A4: 'Cytochrome P450 3A4 inhibition risk predicted from molecular weight, flexibility, and lipophilicity.',
  'Log Kp': 'Skin permeation coefficient (cm/s) via the Potts & Guy (1992) equation: Log Kp = −6.3 + 0.71·XLOGP3 − 0.0061·MW.',
  Lipinski: 'Pfizer Rule of Five: MW ≤ 500, MLOGP ≤ 4.15, N or O ≤ 10, NH or OH ≤ 5 (≤ 1 violation allowed).',
  Ghose: 'Ghose filter: 160 ≤ MW ≤ 480, −0.4 ≤ WLOGP ≤ 5.6, 40 ≤ MR ≤ 130, 20 ≤ total atoms ≤ 70.',
  Veber: 'Veber oral bioavailability filter: Rotatable bonds ≤ 10 and TPSA ≤ 140 Å².',
  Egan: 'Egan egg filter: WLOGP ≤ 5.88 and TPSA ≤ 131.6 Å².',
  Muegge: 'Muegge (Bayer) filter: 200 ≤ MW ≤ 600, −2 ≤ XLOGP3 ≤ 5, TPSA ≤ 150, Rings ≤ 7, #C > 4, Heteroatoms > 1, Rotors ≤ 15, HBA ≤ 10, HBD ≤ 5.',
  'Bioavailability Score': 'Abbott Bioavailability Score: probability of >10% oral bioavailability in rat (0.85 for anionic/carboxylates with TPSA ≤ 75; 0.55 for Lipinski-compliant neutrals).',
  PAINS: 'Pan-Assay Interference Compounds (Baell & Holloway) substructure alerts such as catechols, quinones, and rhodanines.',
  Brenk: 'Brenk structural alerts flagging potentially toxic, reactive, or metabolically unstable functional groups.',
  Leadlikeness: 'Lead-like criteria: 250 ≤ MW ≤ 350, XLOGP3 ≤ 3.5, and Rotatable bonds ≤ 7.',
  'Synthetic accessibility': 'Estimated ease of chemical synthesis from 1.00 (very easy) to 10.00 (very difficult) based on fragment complexity, rings, and stereocenters.',
};

interface HelpTooltipProps {
  topic: string;
}

export function HelpTooltip({ topic }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const text = METHODOLOGY_NOTES[topic] || 'Computed cheminformatics descriptor.';

  return (
    <span ref={ref} className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Explain ${topic}`}
        title={text}
        className="w-3.5 h-3.5 rounded-full bg-[#E68A73] hover:bg-[#D96B52] text-white text-[9px] font-bold leading-none inline-flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-600 cursor-pointer"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={topic}
          className="absolute left-0 bottom-full mb-2 z-50 w-64 p-2.5 bg-slate-900 text-slate-100 text-[11px] leading-relaxed rounded border border-slate-700 shadow-lg"
        >
          <div className="font-semibold text-white mb-0.5">{topic}</div>
          <div className="text-slate-300">{text}</div>
        </div>
      )}
    </span>
  );
}
