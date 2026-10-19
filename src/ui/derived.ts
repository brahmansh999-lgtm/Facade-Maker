import { createContext, useContext } from 'react';
import type { Derived } from '../model/derive.ts';

export const DerivedCtx = createContext<Derived | null>(null);
export function useDerived(): Derived {
  const d = useContext(DerivedCtx);
  if (!d) throw new Error('Derived context missing');
  return d;
}
