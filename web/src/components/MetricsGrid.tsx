import type { AnalysisResult } from '../types/contracts';

interface MetricsGridProps {
  result: AnalysisResult;
}

interface Metric {
  label: string;
  value: string;
}

export function MetricsGrid({ result }: MetricsGridProps) {
  const metrics: Metric[] = [
    { label: 'VPIN', value: result.vpin.toFixed(4) },
    { label: 'OFI', value: result.ofi.toFixed(4) },
    { label: 'Kyle Lambda', value: result.kyleLambda.toFixed(4) },
    { label: 'Amihud', value: result.amihud.toFixed(4) },
    { label: 'Hawkes', value: result.hawkes.toFixed(4) },
    { label: 'PIN', value: result.pin.toFixed(4) },
    { label: 'Spread (bps)', value: result.spreadBps.toFixed(2) },
    { label: 'Mid Price', value: result.midPrice.toFixed(2) },
    { label: 'Depth Imbalance', value: result.depthImbalance.toFixed(4) },
    { label: 'Bars', value: String(result.barsCompleted) },
    { label: 'Bar Progress', value: `${(result.barProgress * 100).toFixed(0)}%` },
    { label: 'Compute (us)', value: result.computeTimeUs.toFixed(1) },
  ];

  return (
    <div className="metrics-grid">
      {metrics.map((m) => (
        <div className="metric-cell" key={m.label}>
          <span className="metric-label">{m.label}</span>
          <span className="metric-value">{m.value}</span>
        </div>
      ))}
    </div>
  );
}
