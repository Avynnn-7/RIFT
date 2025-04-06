export const MAX_DEPTH_LEVELS = 5;

export type SignalLevel = 0 | 1 | 2;

export interface DepthLevel {
  price: number;
  quantity: number;
}

export interface Quote {
  ltp: number;
  volume: number;
  bid: DepthLevel[];
  ask: DepthLevel[];
  bidLevels: number;
  askLevels: number;
  timestampMs: number;
}

export interface VolumeBar {
  barIndex: number;
  open: number;
  high: number;
  low: number;
  close: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  vpin: number;
}

export interface OFIPoint {
  normalized: number;
  bidQuantity: number;
  askQuantity: number;
}

export interface Spread {
  spreadBps: number;
  midPrice: number;
  bidDepthValue: number;
  askDepthValue: number;
  depthImbalance: number;
}

export interface AnalysisResult {
  vpin: number;
  ofi: number;
  kyleLambda: number;
  amihud: number;
  hawkes: number;
  pin: number;
  spreadBps: number;
  midPrice: number;
  depthImbalance: number;
  bidDepthValue: number;
  askDepthValue: number;
  toxicScore: number;
  crashRisk: number;
  shouldBuy: SignalLevel;
  stoplossSafe: SignalLevel;
  computeTimeUs: number;
  updateCount: number;
  barsCompleted: number;
  barProgress: number;
}

export interface Recommendation {
  label: string;
  action: string;
  details: string;
  toxicScore: number;
  crashRisk: number;
}

export type Transport = 'websocket' | 'http-poll';

export interface AnalysisSnapshot {
  symbol: string;
  exchange: string;
  transport: Transport;
  ltp: number;
  volume: number;
  barVolume: number;
  result: AnalysisResult;
  bars: VolumeBar[];
  recommendation: Recommendation;
  serverTimeMs: number;
}

export interface InstrumentMatch {
  symbol: string;
  name: string;
  exchange: string;
  instrumentKey: string;
  instrumentType: string;
}

export type ServerMessage =
  | { type: 'connected'; id: number; engine: string; serverTimeMs: number }
  | { type: 'update'; symbol: string; exchange: string; data: AnalysisSnapshot }
  | { type: 'subscribed'; symbols: string[] }
  | { type: 'unsubscribed'; symbols: string[] }
  | { type: 'error'; symbol?: string; message: string };
