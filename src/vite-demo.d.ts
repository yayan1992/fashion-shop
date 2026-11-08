// `__DEMO_DASHBOARD__` is replaced at build time (see vite.config.ts): true only
// in the public showroom build (`vite build --mode demo`), which carries the
// simulated Studio at /demo/admin. Every other build gets `false`, so the demo
// code is never bundled and the real /admin is untouched.
declare global {
  const __DEMO_DASHBOARD__: boolean;
}
export {};
