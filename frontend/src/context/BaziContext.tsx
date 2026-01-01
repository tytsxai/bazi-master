/* eslint-disable react-refresh/only-export-components */
import { ReactNode, createContext, useContext, useMemo, useState } from 'react';

export interface BaziResult {
  chart?: Record<string, unknown>;
  analysis?: string;
  lunar?: Record<string, unknown>;
  record?: Record<string, unknown>;
}

interface BaziContextType {
  baziResult: BaziResult | null;
  setBaziResult: (data: BaziResult | null) => void;
  clearBaziResult: () => void;
}

const BaziContext = createContext<BaziContextType | undefined>(undefined);

export function BaziProvider({ children }: { children: ReactNode }) {
  const [baziResult, setBaziResult] = useState<BaziResult | null>(null);

  const clearBaziResult = () => setBaziResult(null);

  const value = useMemo(
    () => ({
      baziResult,
      setBaziResult,
      clearBaziResult,
    }),
    [baziResult]
  );

  return <BaziContext.Provider value={value}>{children}</BaziContext.Provider>;
}

export function useBaziContext() {
  const context = useContext(BaziContext);
  if (context === undefined) {
    throw new Error('useBaziContext must be used within a BaziProvider');
  }
  return context;
}
