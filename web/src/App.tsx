import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisSnapshot, InstrumentMatch } from './types/contracts';
import { useWebSocket } from './hooks/useWebSocket';
import { SymbolSearch } from './components/SymbolSearch';
import { WatchList } from './components/WatchList';
import type { WatchListEntry } from './components/WatchList';
import { ToxicMeter } from './components/ToxicMeter';
import { VPINGauge } from './components/VPINGauge';
import { CrashRiskPanel } from './components/CrashRiskPanel';
import { OFIChart } from './components/OFIChart';
import { VolumeBarChart } from './components/VolumeBarChart';
import { MetricsGrid } from './components/MetricsGrid';
import { RecommendationCard } from './components/RecommendationCard';

const OFI_HISTORY_LIMIT = 240;

interface Tracked {
  symbol: string;
  exchange: string;
}

export default function App() {
  const [snapshots, setSnapshots] = useState<Record<string, AnalysisSnapshot>>({});
  const [ofiHistory, setOfiHistory] = useState<Record<string, number[]>>({});
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const trackedRef = useRef<Tracked[]>([]);

  useEffect(() => {
    trackedRef.current = tracked;
  });

  const handleSnapshot = useCallback((symbol: string, snapshot: AnalysisSnapshot) => {
    setSnapshots((prev) => ({ ...prev, [symbol]: snapshot }));
    setOfiHistory((prev) => {
      const next = [...(prev[symbol] || []), snapshot.result.ofi];
      if (next.length > OFI_HISTORY_LIMIT) next.splice(0, next.length - OFI_HISTORY_LIMIT);
      return { ...prev, [symbol]: next };
    });
  }, []);

  const { state, subscribe, unsubscribe } = useWebSocket(handleSnapshot);

  const addSymbol = useCallback(
    (match: InstrumentMatch) => {
      const exchange = match.exchange || 'NSE_EQ';
      if (trackedRef.current.some((t) => t.symbol === match.symbol && t.exchange === exchange)) {
        setActiveSymbol(match.symbol);
        return;
      }
      setTracked((prev) => [...prev, { symbol: match.symbol, exchange }]);
      setActiveSymbol(match.symbol);
      subscribe(match.symbol, exchange);
    },
    [subscribe]
  );

  const removeSymbol = useCallback(
    (symbol: string, exchange: string) => {
      setTracked((prev) => prev.filter((t) => !(t.symbol === symbol && t.exchange === exchange)));
      unsubscribe(symbol, exchange);
      setActiveSymbol((current) => (current === symbol ? null : current));
    },
    [unsubscribe]
  );

  const entries: WatchListEntry[] = useMemo(
    () =>
      tracked.map((t) => {
        const snap = snapshots[t.symbol];
        return {
          symbol: t.symbol,
          exchange: t.exchange,
          ltp: snap?.ltp ?? 0,
          toxicScore: snap?.result.toxicScore ?? 0,
        };
      }),
    [tracked, snapshots]
  );

  const active = activeSymbol ? snapshots[activeSymbol] : null;
  const activeOfi = activeSymbol ? ofiHistory[activeSymbol] || [] : [];

  return (
    <div className="app">
      <header className="app-header">
        <h1>RIFT</h1>
        <span className="app-subtitle">Real Time Informed Flow Tracker</span>
        <span className={`status ${state.connected ? 'online' : 'offline'}`}>
          {state.transport} · {state.engine}
        </span>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <SymbolSearch onSelect={addSymbol} />
          <WatchList
            entries={entries}
            activeSymbol={activeSymbol}
            onSelect={(symbol) => setActiveSymbol(symbol)}
            onRemove={removeSymbol}
          />
        </aside>

        <main className="dashboard">
          {!active && <div className="placeholder">Search and select an instrument to begin.</div>}
          {active && (
            <>
              <section className="instrument-head">
                <div className="instrument-name">{active.symbol}</div>
                <div className="instrument-price">{active.ltp.toFixed(2)}</div>
              </section>

              <section className="top-row">
                <ToxicMeter score={active.result.toxicScore} />
                <VPINGauge value={active.result.vpin} />
                <CrashRiskPanel
                  risk={active.result.crashRisk}
                  stoplossSafe={active.result.stoplossSafe}
                />
              </section>

              <RecommendationCard recommendation={active.recommendation} />

              <section className="charts-row">
                <OFIChart history={activeOfi} />
                <VolumeBarChart bars={active.bars} />
              </section>

              <MetricsGrid result={active.result} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
