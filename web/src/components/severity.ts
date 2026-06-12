export type Severity = 'safe' | 'caution' | 'elevated' | 'high' | 'critical';

export function scoreSeverity(score: number): Severity {
  if (score <= 25) return 'safe';
  if (score <= 50) return 'caution';
  if (score <= 70) return 'elevated';
  if (score <= 85) return 'high';
  return 'critical';
}

export function vpinSeverity(value: number): Severity {
  if (value < 0.2) return 'safe';
  if (value < 0.4) return 'caution';
  if (value < 0.6) return 'elevated';
  return 'high';
}

export function riskSeverity(risk: number): Severity {
  if (risk < 30) return 'safe';
  if (risk < 60) return 'caution';
  return 'high';
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  safe: '#22c55e',
  caution: '#eab308',
  elevated: '#f97316',
  high: '#ef4444',
  critical: '#dc2626',
};
