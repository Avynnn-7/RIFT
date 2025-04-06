import type { Recommendation } from '../types/contracts';

interface RecommendationCardProps {
  recommendation: Recommendation;
}

const LABEL_SEVERITY: Record<string, string> = {
  SAFE: 'safe',
  CAUTION: 'caution',
  TOXIC: 'elevated',
  DANGER: 'high',
  'CRASH RISK': 'critical',
};

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const severity = LABEL_SEVERITY[recommendation.label] || 'caution';
  return (
    <div className={`recommendation-card rec-${severity}`}>
      <div className={`recommendation-label sev-${severity}`}>{recommendation.label}</div>
      <div className="recommendation-action">{recommendation.action}</div>
      <div className="recommendation-details">{recommendation.details}</div>
    </div>
  );
}
