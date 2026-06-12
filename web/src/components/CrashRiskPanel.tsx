import type { SignalLevel } from '../types/contracts';
import { riskSeverity, SEVERITY_COLOR } from './severity';

interface CrashRiskPanelProps {
  risk: number;
  stoplossSafe: SignalLevel;
}

const SIGNAL_TEXT: Record<SignalLevel, string> = {
  0: 'Unsafe',
  1: 'Caution',
  2: 'Safe',
};

export function CrashRiskPanel({ risk, stoplossSafe }: CrashRiskPanelProps) {
  const clamped = Math.min(100, Math.max(0, risk));
  const severity = riskSeverity(clamped);
  return (
    <div className="crash-panel">
      <div className="crash-panel-header">
        <span className="crash-panel-title">Crash Risk</span>
        <span className={`crash-panel-value sev-${severity}`}>{clamped}</span>
      </div>
      <svg
        className="meter-bar"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        role="img"
        aria-label="Crash risk level"
      >
        <rect x="0" y="0" width="100" height="10" rx="5" fill="#0f1521" />
        <rect x="0" y="0" width={clamped} height="10" rx="5" fill={SEVERITY_COLOR[severity]} />
      </svg>
      <div className="crash-panel-signal">
        Stop-loss: <span className={`sev-${severity}`}>{SIGNAL_TEXT[stoplossSafe]}</span>
      </div>
    </div>
  );
}
