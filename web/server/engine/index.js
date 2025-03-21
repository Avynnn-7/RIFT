import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(here, '..', '..', '..', 'engine', 'dist', 'rift_engine.js');

const INPUT_SIZE = 25;
const OUTPUT_SIZE = 19;
const BAR_STRIDE = 9;

let moduleInstance = null;

export async function loadEngine() {
  if (moduleInstance) return moduleInstance;
  if (!existsSync(artifactPath)) {
    throw new Error(`Engine artifact not found at ${artifactPath}. Build it with engine/scripts/build_wasm.`);
  }
  const factory = (await import(pathToFileURL(artifactPath).href)).default;
  moduleInstance = await factory();
  return moduleInstance;
}

export function isEngineLoaded() {
  return moduleInstance !== null;
}

export class EngineSession {
  constructor(barVolume = 5000) {
    if (!moduleInstance) throw new Error('Engine not loaded. Call loadEngine() first.');
    this.module = moduleInstance;
    this.barVolume = barVolume;
    this.handle = this.module._rift_create(barVolume);
    if (this.handle < 0) throw new Error('Engine session capacity exhausted.');
  }

  reset(barVolume = this.barVolume) {
    this.barVolume = barVolume;
    this.module._rift_reset(this.handle, barVolume);
  }

  process(quote) {
    const m = this.module;
    const inPtr = m._rift_input(this.handle);
    const heapIn = m.HEAPF64;
    const base = inPtr / 8;

    for (let i = 0; i < INPUT_SIZE; i++) heapIn[base + i] = 0;

    heapIn[base + 0] = quote.ltp || 0;
    heapIn[base + 1] = quote.volume || 0;
    heapIn[base + 2] = quote.timestampMs || Date.now();

    const bid = quote.bid || [];
    const ask = quote.ask || [];
    const bidLevels = Math.min(bid.length, 5);
    const askLevels = Math.min(ask.length, 5);
    heapIn[base + 3] = bidLevels;
    heapIn[base + 4] = askLevels;

    for (let i = 0; i < bidLevels; i++) {
      heapIn[base + 5 + i * 2] = bid[i].price || 0;
      heapIn[base + 6 + i * 2] = bid[i].quantity || 0;
    }
    for (let i = 0; i < askLevels; i++) {
      heapIn[base + 15 + i * 2] = ask[i].price || 0;
      heapIn[base + 16 + i * 2] = ask[i].quantity || 0;
    }

    m._rift_process(this.handle);

    const outPtr = m._rift_output(this.handle);
    const heapOut = m.HEAPF64;
    const o = outPtr / 8;

    return {
      vpin: heapOut[o + 0],
      ofi: heapOut[o + 1],
      kyleLambda: heapOut[o + 2],
      amihud: heapOut[o + 3],
      hawkes: heapOut[o + 4],
      pin: heapOut[o + 5],
      spreadBps: heapOut[o + 6],
      midPrice: heapOut[o + 7],
      depthImbalance: heapOut[o + 8],
      bidDepthValue: heapOut[o + 9],
      askDepthValue: heapOut[o + 10],
      toxicScore: Math.round(heapOut[o + 11]),
      crashRisk: Math.round(heapOut[o + 12]),
      shouldBuy: Math.round(heapOut[o + 13]),
      stoplossSafe: Math.round(heapOut[o + 14]),
      computeTimeUs: heapOut[o + 15],
      updateCount: Math.round(heapOut[o + 16]),
      barsCompleted: Math.round(heapOut[o + 17]),
      barProgress: heapOut[o + 18],
    };
  }

  bars() {
    const m = this.module;
    const count = m._rift_bars_count(this.handle);
    if (count <= 0) return [];
    const ptr = m._rift_bars(this.handle);
    const heap = m.HEAPF64;
    const base = ptr / 8;
    const result = new Array(count);
    for (let i = 0; i < count; i++) {
      const r = base + i * BAR_STRIDE;
      result[i] = {
        barIndex: Math.round(heap[r + 0]),
        open: heap[r + 1],
        high: heap[r + 2],
        low: heap[r + 3],
        close: heap[r + 4],
        buyVolume: Math.round(heap[r + 5]),
        sellVolume: Math.round(heap[r + 6]),
        totalVolume: Math.round(heap[r + 7]),
        vpin: heap[r + 8],
      };
    }
    return result;
  }

  destroy() {
    this.module._rift_destroy(this.handle);
    this.handle = -1;
  }
}
