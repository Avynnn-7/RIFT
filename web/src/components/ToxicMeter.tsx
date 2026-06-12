import { scoreSeverity, SEVERITY_COLOR } from './severity';

interface ToxicMeterProps {
  score: number;
}

export function ToxicMeter({ score }: ToxicMeterProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const severity = scoreSeverity(clamped);
  return (
    <div className="toxic-meter">
      <div className="toxic-meter-header">
        <span className="toxic-meter-title">Toxic Flow</span>
        <span className={`toxic-meter-score sev-${severity}`}>{clamped}</span>
      </div>
      <svg
        className="meter-bar"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        role="img"
        aria-label="Toxic flow level"
      >
        <rect x="0" y="0" width="100" height="10" rx="5" fill="#0f1521" />
        <rect x="0" y="0" width={clamped} height="10" rx="5" fill={SEVERITY_COLOR[severity]} />
      </svg>
    </div>
  );
}
