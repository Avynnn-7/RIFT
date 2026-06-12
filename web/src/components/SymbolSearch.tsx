import { useEffect, useRef, useState } from 'react';
import type { InstrumentMatch } from '../types/contracts';

interface SymbolSearchProps {
  onSelect: (match: InstrumentMatch) => void;
}

const DEBOUNCE_MS = 250;

export function SymbolSearch({ onSelect }: SymbolSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstrumentMatch[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(async () => {
      if (trimmed.length < 1) {
        setResults([]);
        setOpen(false);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.success) {
          setResults(json.results as InstrumentMatch[]);
          setOpen(true);
        }
      } catch {
        setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (match: InstrumentMatch) => {
    onSelect(match);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="symbol-search">
      <input
        className="symbol-search-input"
        value={query}
        placeholder="Search symbol"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="symbol-search-results">
          {results.map((match) => (
            <li key={match.instrumentKey}>
              <button type="button" onClick={() => choose(match)}>
                <span className="result-symbol">{match.symbol}</span>
                <span className="result-name">{match.name}</span>
                <span className="result-exchange">{match.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
