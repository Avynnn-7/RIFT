interface OFIChartProps {
  history: number[];
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 6;

export function OFIChart({ history }: OFIChartProps) {
  const points = history.slice(-120);
  const mid = HEIGHT / 2;

  let path = '';
  if (points.length > 1) {
    const step = (WIDTH - PAD * 2) / (points.length - 1);
    path = points
      .map((value, i) => {
        const clamped = Math.min(1, Math.max(-1, value));
        const x = PAD + i * step;
        const y = mid - clamped * (mid - PAD);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }

  const latest = points.length > 0 ? points[points.length - 1] : 0;

  return (
    <div className="chart-card">
      <div className="chart-title">
        Order Flow Imbalance
        <span className={`chart-latest ${latest >= 0 ? 'sev-safe' : 'sev-high'}`}>
          {latest.toFixed(3)}
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="OFI chart">
        <line x1={PAD} y1={mid} x2={WIDTH - PAD} y2={mid} stroke="#374151" strokeDasharray="3 3" />
        {path && <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2" />}
      </svg>
    </div>
  );
}
