import type { VolumeBar } from '../types/contracts';

interface VolumeBarChartProps {
  bars: VolumeBar[];
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 6;

export function VolumeBarChart({ bars }: VolumeBarChartProps) {
  const recent = bars.slice(-40);
  const count = recent.length;
  const slot = count > 0 ? (WIDTH - PAD * 2) / count : 0;
  const barWidth = Math.max(1, slot * 0.7);

  return (
    <div className="chart-card">
      <div className="chart-title">Volume Bars</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Volume bars">
        {recent.map((bar, i) => {
          const total = bar.totalVolume || 1;
          const buyHeight = (bar.buyVolume / total) * (HEIGHT - PAD * 2);
          const sellHeight = (bar.sellVolume / total) * (HEIGHT - PAD * 2);
          const x = PAD + i * slot;
          const sellY = HEIGHT - PAD - sellHeight;
          const buyY = sellY - buyHeight;
          return (
            <g key={bar.barIndex}>
              <rect x={x} y={buyY} width={barWidth} height={buyHeight} fill="#22c55e" />
              <rect x={x} y={sellY} width={barWidth} height={sellHeight} fill="#ef4444" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
