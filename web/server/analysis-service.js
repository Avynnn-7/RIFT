import { EngineSession } from './engine/index.js';
import { toEngineQuote } from './quote-adapter.js';
import { buildRecommendation } from './recommendation.js';
import { calibrateBarVolume, DEFAULT_BAR_VOLUME } from './config.js';

const states = new Map();

function key(symbol, exchange) {
  return `${symbol}:${exchange}`;
}

export function getState(symbol, exchange) {
  return states.get(key(symbol, exchange)) || null;
}

export function ensureState(symbol, exchange, instrumentKey, barVolume = DEFAULT_BAR_VOLUME) {
  const k = key(symbol, exchange);
  let state = states.get(k);
  if (!state) {
    state = {
      symbol,
      exchange,
      instrumentKey,
      barVolume,
      calibrated: false,
      session: new EngineSession(barVolume),
      subscribers: new Set(),
      lastSnapshot: null,
    };
    states.set(k, state);
  } else if (instrumentKey && !state.instrumentKey) {
    state.instrumentKey = instrumentKey;
  }
  return state;
}

export function forEachState(fn) {
  for (const state of states.values()) fn(state);
}

export function processMarketQuote(state, marketQuote, transport) {
  if (!state.calibrated && marketQuote.volume > 0) {
    const calibrated = calibrateBarVolume(marketQuote.volume);
    if (calibrated !== state.barVolume) {
      state.barVolume = calibrated;
      state.session.reset(calibrated);
    }
    state.calibrated = true;
  }

  const engineQuote = toEngineQuote(marketQuote);
  const result = state.session.process(engineQuote);
  const bars = state.session.bars();
  const recommendation = buildRecommendation(result);

  const snapshot = {
    symbol: state.symbol,
    exchange: state.exchange,
    transport,
    ltp: marketQuote.ltp || 0,
    volume: marketQuote.volume || 0,
    barVolume: state.barVolume,
    result,
    bars,
    recommendation,
    serverTimeMs: Date.now(),
  };

  state.lastSnapshot = snapshot;
  return snapshot;
}

export function removeIfIdle(state) {
  if (state.subscribers.size > 0) return false;
  const k = key(state.symbol, state.exchange);
  state.session.destroy();
  states.delete(k);
  return true;
}
