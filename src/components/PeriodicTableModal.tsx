import { X } from 'lucide-react';
import { PURE_ELEMENTS } from '../data/elements.ts';
import type { ElementRecord } from '../types/molecule.ts';

interface PeriodicTableModalProps {
  open: boolean;
  onClose: () => void;
  onSelectElement: (symbol: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Alkali metal': 'bg-rose-50 border-rose-200 hover:bg-rose-100 text-rose-900',
  'Alkaline earth metal': 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-900',
  'Transition metal': 'bg-sky-50 border-sky-200 hover:bg-sky-100 text-sky-900',
  'Post-transition metal': 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 text-indigo-900',
  Metalloid: 'bg-teal-50 border-teal-200 hover:bg-teal-100 text-teal-900',
  'Reactive nonmetal': 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-900',
  'Noble gas': 'bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-900',
  Lanthanide: 'bg-orange-50 border-orange-200 hover:bg-orange-100 text-orange-900',
  Actinide: 'bg-red-50 border-red-200 hover:bg-red-100 text-red-900',
  'Unknown properties': 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-800',
};

function getGridPosition(el: ElementRecord): { col: number; row: number } {
  if (el.atomicNumber >= 57 && el.atomicNumber <= 71) {
    return { row: 9, col: el.atomicNumber - 57 + 4 };
  }
  if (el.atomicNumber >= 89 && el.atomicNumber <= 103) {
    return { row: 10, col: el.atomicNumber - 89 + 4 };
  }
  return { row: el.period, col: el.group || 1 };
}

export function PeriodicTableModal({
  open,
  onClose,
  onSelectElement,
}: PeriodicTableModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="118 Pure Elements Periodic Table"
    >
      <div className="bg-white border border-slate-300 shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#E60000] text-white px-4 py-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">IUPAC Periodic Table — All 118 Pure Elements</h2>
            <p className="text-xs text-white/85">
              Select any element to inspect its physicochemical and atomic profile
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close periodic table"
            className="w-7 h-7 rounded-full hover:bg-white/20 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-auto">
          <div
            className="grid gap-1 min-w-[820px]"
            style={{
              gridTemplateColumns: 'repeat(18, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(10, minmax(46px, auto))',
            }}
          >
            {PURE_ELEMENTS.map((el) => {
              const pos = getGridPosition(el);
              const cls =
                CATEGORY_COLORS[el.category] ||
                'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-900';
              return (
                <button
                  key={el.atomicNumber}
                  type="button"
                  onClick={() => {
                    onSelectElement(el.symbol);
                    onClose();
                  }}
                  style={{
                    gridColumnStart: pos.col,
                    gridRowStart: pos.row,
                  }}
                  title={`${el.name} (${el.symbol}) — Z=${el.atomicNumber}, Mass=${el.atomicMass}`}
                  className={`border p-1 text-left transition-colors cursor-pointer flex flex-col justify-between ${cls}`}
                >
                  <span className="text-[9px] font-mono leading-none opacity-75">
                    {el.atomicNumber}
                  </span>
                  <span className="text-[13px] font-bold leading-tight text-center">
                    {el.symbol}
                  </span>
                  <span className="text-[8px] truncate text-center opacity-80">
                    {el.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
