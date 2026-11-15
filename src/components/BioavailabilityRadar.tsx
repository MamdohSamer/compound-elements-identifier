import { useState } from 'react';
import type { BioavailabilityRadarData } from '../types/molecule.ts';

interface BioavailabilityRadarProps {
  radar: BioavailabilityRadarData;
  rawMetrics: {
    xLogP3: number;
    mw: number;
    tpsa: number;
    logS: number;
    fCsp3: number;
    rotBonds: number;
  };
}

const AXES: Array<{
  key: keyof Pick<BioavailabilityRadarData, 'lipo' | 'size' | 'polar' | 'insolu' | 'insatu' | 'flex'>;
  label: string;
  angleDeg: number;
  rangeText: string;
}> = [
  { key: 'lipo', label: 'LIPO', angleDeg: -90, rangeText: '-0.7 to +5.0' },
  { key: 'size', label: 'SIZE', angleDeg: -30, rangeText: '150 to 500 g/mol' },
  { key: 'polar', label: 'POLAR', angleDeg: 30, rangeText: '20 to 130 Å²' },
  { key: 'insolu', label: 'INSOLU', angleDeg: 90, rangeText: '0 to 6 (-Log S)' },
  { key: 'insatu', label: 'INSATU', angleDeg: 150, rangeText: 'Fraction Csp3 ≥ 0.25' },
  { key: 'flex', label: 'FLEX', angleDeg: 210, rangeText: '0 to 9 rotors' },
];

export function BioavailabilityRadar({ radar, rawMetrics }: BioavailabilityRadarProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const cx = 130;
  const cy = 112;
  const maxR = 76;

  const pointAt = (rNorm: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + maxR * rNorm * Math.cos(rad),
      y: cy + maxR * rNorm * Math.sin(rad),
    };
  };

  const ringLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  const makeHexPath = (rNorm: number) =>
    AXES.map((ax, idx) => {
      const pt = pointAt(rNorm, ax.angleDeg);
      return `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }).join(' ') + ' Z';

  // Pink optimal zone: outer ring at 0.60, inner ring at 0.16 (matching SwissADME pink band)
  const optOuterPath = makeHexPath(0.6);

  const dataPoints = AXES.map((ax) => {
    const val = radar[ax.key];
    return {
      ...ax,
      pt: pointAt(val, ax.angleDeg),
      normVal: val,
    };
  });

  const dataPolygonPoints = dataPoints.map((d) => `${d.pt.x.toFixed(1)},${d.pt.y.toFixed(1)}`).join(' ');

  const rawByKey: Record<string, string> = {
    lipo: `XLOGP3 = ${rawMetrics.xLogP3.toFixed(2)}`,
    size: `MW = ${rawMetrics.mw.toFixed(2)} g/mol`,
    polar: `TPSA = ${rawMetrics.tpsa.toFixed(2)} Å²`,
    insolu: `Log S = ${rawMetrics.logS.toFixed(2)}`,
    insatu: `Frac. Csp3 = ${rawMetrics.fCsp3.toFixed(2)}`,
    flex: `Rotors = ${rawMetrics.rotBonds}`,
  };

  const activeAxis = hoveredKey ? AXES.find((a) => a.key === hoveredKey) : null;

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        viewBox="0 0 260 225"
        className="w-full max-w-[235px] h-auto"
        role="img"
        aria-label="Bioavailability Radar"
      >
        {/* Outer concentric hexagons */}
        {ringLevels.map((lvl) => (
          <path
            key={lvl}
            d={makeHexPath(lvl)}
            fill="none"
            stroke="#DCDCDC"
            strokeWidth="0.9"
          />
        ))}

        {/* Optimal physicochemical pink zone */}
        <path
          d={optOuterPath}
          fill="#FCE8EC"
          fillOpacity="0.82"
          stroke="#F4B6C2"
          strokeWidth="1"
        />
        <path
          d={makeHexPath(0.16)}
          fill="#FFFFFF"
          fillOpacity="0.92"
          stroke="#F4B6C2"
          strokeWidth="0.8"
        />

        {/* Radial spoke lines */}
        {AXES.map((ax) => {
          const outer = pointAt(1.0, ax.angleDeg);
          return (
            <line
              key={ax.key}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="#DCDCDC"
              strokeWidth="0.9"
            />
          );
        })}

        {/* Molecule red polygon */}
        <polygon
          points={dataPolygonPoints}
          fill="rgba(220, 0, 0, 0.05)"
          stroke="#CC0000"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Vertex dots */}
        {dataPoints.map((d) => (
          <g
            key={d.key}
            onMouseEnter={() => setHoveredKey(d.key)}
            onMouseLeave={() => setHoveredKey(null)}
            className="cursor-pointer"
          >
            <circle cx={d.pt.x} cy={d.pt.y} r="7" fill="transparent" />
            <circle
              cx={d.pt.x}
              cy={d.pt.y}
              r={hoveredKey === d.key ? 3.5 : 2.2}
              fill="#CC0000"
            />
          </g>
        ))}

        {/* Axis labels */}
        {AXES.map((ax) => {
          const lp = pointAt(1.17, ax.angleDeg);
          let anchor: 'middle' | 'start' | 'end' = 'middle';
          if (ax.angleDeg === -30 || ax.angleDeg === 30) anchor = 'start';
          if (ax.angleDeg === 150 || ax.angleDeg === 210) anchor = 'end';
          const dy = ax.angleDeg === -90 ? -2 : ax.angleDeg === 90 ? 8 : 3;

          return (
            <text
              key={ax.key}
              x={lp.x}
              y={lp.y + dy}
              textAnchor={anchor}
              fontSize="9.5"
              fontWeight="500"
              fill={hoveredKey === ax.key ? '#CC0000' : '#4B5563'}
              onMouseEnter={() => setHoveredKey(ax.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="cursor-pointer"
            >
              {ax.label}
            </text>
          );
        })}
      </svg>

      {activeAxis && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-mono px-2 py-1 rounded shadow whitespace-nowrap pointer-events-none">
          {activeAxis.label}: {rawByKey[activeAxis.key]} (Optimal: {activeAxis.rangeText})
        </div>
      )}
    </div>
  );
}
