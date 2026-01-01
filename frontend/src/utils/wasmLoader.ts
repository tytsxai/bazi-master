/**
 * WebAssembly Loader for Bazi Core
 */
import logger from './logger';

export interface BaziWasmExports {
  getYearStem(year: number): number;
  getYearBranch(year: number): number;
  add(a: number, b: number): number;
}

let wasmInstance: BaziWasmExports | null = null;

export async function initBaziWasm(): Promise<BaziWasmExports> {
  if (wasmInstance) return wasmInstance;

  try {
    // In a Vite environment, we can fetch the wasm from the public directory.
    const response = await fetch('/wasm/optimized.wasm');
    if (!response.ok) {
      throw new Error(`Failed to load wasm: ${response.status}`);
    }
    const responseClone = response.clone();
    try {
      const { instance } = await WebAssembly.instantiateStreaming(response);
      wasmInstance = instance.exports as unknown as BaziWasmExports;
      return wasmInstance;
    } catch {
      const buffer = await responseClone.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(buffer);
      wasmInstance = instance.exports as unknown as BaziWasmExports;
      return wasmInstance;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load Bazi WebAssembly');
    throw error;
  }
}

export function getBaziWasm(): BaziWasmExports | null {
  return wasmInstance;
}
