import { vpinSeverity, SEVERITY_COLOR } from './severity';

interface VPINGaugeProps {
  value: number;
}

const RADIUS = 70;
const CENTER = 90;

export function VPINGauge({ value }: VPINGaugeProps) {
  const fraction = Math.min(1, Math.max(0, value));
  const pct = fraction * 50;
  const stroke = SEVERITY_COLOR[vpinSeverity(fraction)];

  return (
    <div className="gauge">
      <svg viewBox="0 0 180 110" width="100%" role="img" aria-label="VPIN gauge">
        <path
          d={`M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER + RADIUS} ${CENTER}`}
          fill="none"
          stroke="#1f2937"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d={`M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER + RADIUS} ${CENTER}`}
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
        />
        <text x={CENTER} y={CENTER - 10} textAnchor="middle" className="gauge-value">
          {(fraction * 100).toFixed(1)}%
        </text>
      </svg>
      <div className="gauge-label">VPIN</div>
    </div>
  );
}
