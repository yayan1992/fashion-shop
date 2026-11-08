import * as React from "react";
import { BackendError } from "@/lib/supabase";

// Cloudflare Turnstile, the free bot check in front of checkout. It stays
// invisible unless Cloudflare needs the shopper to tick a box. The token it
// produces is checked by the place-order Edge Function, never trusted here.

// Cloudflare's published test site keys pass everyone. A production build
// treats them as missing, so a test setup can't go live by mistake.
const CONFIGURED = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SITE_KEY = import.meta.env.PROD && CONFIGURED && /^[0-9]x0{20}[A-F]{2}$/.test(CONFIGURED) ? undefined : CONFIGURED;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const WAIT_MS = 20_000;

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_unavailable")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile_unavailable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface TurnstileHandle {
  /** A fresh single-use token, waiting briefly if the check is still running. */
  token(): Promise<string>;
  /** Discards the used token and starts a new check. */
  reset(): void;
}

export function Turnstile({ ref }: { ref: React.Ref<TurnstileHandle> }) {
  const container = React.useRef<HTMLDivElement>(null);
  const widget = React.useRef<{ api: TurnstileApi; id: string } | null>(null);
  const current = React.useRef("");
  const waiting = React.useRef<((token: string) => void)[]>([]);

  React.useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    const settle = (token: string) => {
      current.current = token;
      for (const resolve of waiting.current.splice(0)) resolve(token);
    };
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        const id = api.render(container.current, {
          sitekey: SITE_KEY,
          action: "checkout",
          appearance: "interaction-only",
          theme: "light",
          size: "flexible",
          callback: settle,
          "expired-callback": () => (current.current = ""),
          "error-callback": () => settle(""),
        });
        widget.current = { api, id };
      })
      .catch(() => settle(""));
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, []);

  React.useImperativeHandle(ref, () => ({
    token() {
      if (!SITE_KEY) return Promise.reject(new BackendError({ message: "checkout_protection_not_configured" }));
      if (current.current) return Promise.resolve(current.current);
      return new Promise<string>((resolve) => {
        waiting.current.push(resolve);
        setTimeout(() => resolve(current.current), WAIT_MS);
      });
    },
    reset() {
      current.current = "";
      if (widget.current) widget.current.api.reset(widget.current.id);
    },
  }), []);

  return SITE_KEY ? <div ref={container} className="empty:hidden" /> : null;
}
