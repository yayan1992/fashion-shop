import type { AdminCatalog } from "@/admin/api";
import type { Catalog } from "@/catalog/types";
import { adminView, storefrontView } from "./derive";
import { createSeed, DEMO_VERSION, type DemoState } from "./seed";

// The demo's only storage: this browser's localStorage. Nothing leaves the page.

const KEY = "stillform:demo-studio:v1";

let state: DemoState | null = null;
let revision = 0;
let storefront: { revision: number; value: Catalog } | null = null;
let persisted = true;
let watching = false;
const listeners = new Set<() => void>();

function read(): DemoState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    return parsed.version === DEMO_VERSION && parsed.catalog && Array.isArray(parsed.orders) ? parsed : null;
  } catch {
    return null;
  }
}

function write(next: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    persisted = true;
  } catch {
    // Storage is full or blocked: the demo keeps working for this page view only.
    persisted = false;
  }
}

function emit() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function current(): DemoState {
  return (state ??= read() ?? createSeed());
}

export const demoStore = {
  state: current,
  admin: (): AdminCatalog => adminView(current()),
  /** A stable reference until something changes, for useSyncExternalStore. */
  storefront(): Catalog {
    if (!storefront || storefront.revision !== revision) storefront = { revision, value: storefrontView(current()) };
    return storefront.value;
  },
  /** False when the browser refused to store the demo; changes then last until the page closes. */
  persisted: () => persisted,
  commit(next: DemoState) {
    state = next;
    write(next);
    emit();
  },
  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored to remove */
    }
    state = createSeed();
    persisted = true;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (!watching && typeof window !== "undefined") {
      watching = true;
      // Another tab (say the dashboard beside the store) changed or reset the demo.
      window.addEventListener("storage", (event) => {
        if (event.key !== KEY) return;
        state = read() ?? createSeed();
        emit();
      });
    }
    return () => listeners.delete(listener);
  },
};
