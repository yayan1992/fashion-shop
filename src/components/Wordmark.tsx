/** The name set in two weights: a hairline STILL, a settled FORM. */
export function Wordmark({ name, className = "" }: { name: string; className?: string }) {
  const split = name.toUpperCase().startsWith("STILL") ? 5 : Math.ceil(name.length / 2);
  return (
    <span className={`type-wide inline-flex tracking-[0.34em] ${className}`}>
      <span className="font-extralight">{name.slice(0, split)}</span>
      <span className="font-medium">{name.slice(split)}</span>
    </span>
  );
}

/** Full-bleed wordmark that always spans its container exactly. */
export function WordmarkBanner({ name, className = "" }: { name: string; className?: string }) {
  const split = name.toUpperCase().startsWith("STILL") ? 5 : Math.ceil(name.length / 2);
  return (
    <svg viewBox="0 0 1000 132" className={`block w-full ${className}`} role="img" aria-label={name}>
      <text x="0" y="118" textLength="1000" lengthAdjust="spacingAndGlyphs" fill="currentColor" style={{ fontSize: 158, fontStretch: "125%", letterSpacing: "-0.01em" }}>
        <tspan fontWeight={200}>{name.slice(0, split)}</tspan>
        <tspan fontWeight={500}>{name.slice(split)}</tspan>
      </text>
    </svg>
  );
}
