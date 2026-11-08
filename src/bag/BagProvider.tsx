import * as React from "react";
import { useCatalog } from "@/catalog/CatalogProvider";
import { bagCount, bagReducer, reconcile, type BagAction, type BagLine } from "./bag";

const STORAGE_KEY = "stillform.bag.v1";

interface BagContextValue {
  lines: BagLine[];
  count: number;
  dispatch: (action: BagAction) => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const BagContext = React.createContext<BagContextValue | null>(null);

function readStored(): unknown {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function BagProvider({ children }: { children: React.ReactNode }) {
  const catalog = useCatalog();
  const [lines, setLines] = React.useState<BagLine[]>(() => reconcile(catalog, readStored()));
  const [isOpen, setOpen] = React.useState(false);

  const dispatch = React.useCallback((action: BagAction) => setLines((current) => bagReducer(catalog, current, action)), [catalog]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage can be unavailable (private mode, quota). The bag still works for this visit.
    }
  }, [lines]);

  const value = React.useMemo(() => ({ lines, count: bagCount(lines), dispatch, isOpen, setOpen }), [lines, dispatch, isOpen]);
  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagContextValue {
  const bag = React.useContext(BagContext);
  if (!bag) throw new Error("useBag must be used inside <BagProvider>");
  return bag;
}
