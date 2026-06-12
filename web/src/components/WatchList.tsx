import { scoreSeverity } from './severity';

export interface WatchListEntry {
  symbol: string;
  exchange: string;
  ltp: number;
  toxicScore: number;
}

interface WatchListProps {
  entries: WatchListEntry[];
  activeSymbol: string | null;
  onSelect: (symbol: string, exchange: string) => void;
  onRemove: (symbol: string, exchange: string) => void;
}

export function WatchList({ entries, activeSymbol, onSelect, onRemove }: WatchListProps) {
  if (entries.length === 0) {
    return <div className="watchlist-empty">No instruments tracked.</div>;
  }
  return (
    <ul className="watchlist">
      {entries.map((entry) => (
        <li
          key={`${entry.symbol}:${entry.exchange}`}
          className={entry.symbol === activeSymbol ? 'watchlist-item active' : 'watchlist-item'}
        >
          <button
            type="button"
            className="watchlist-select"
            onClick={() => onSelect(entry.symbol, entry.exchange)}
          >
            <span className="watchlist-symbol">{entry.symbol}</span>
            <span className="watchlist-ltp">{entry.ltp.toFixed(2)}</span>
            <span className={`watchlist-score sev-${scoreSeverity(entry.toxicScore)}`}>
              {entry.toxicScore}
            </span>
          </button>
          <button
            type="button"
            className="watchlist-remove"
            aria-label={`Remove ${entry.symbol}`}
            onClick={() => onRemove(entry.symbol, entry.exchange)}
          >
            x
          </button>
        </li>
      ))}
    </ul>
  );
}
