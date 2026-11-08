import type * as React from "react";
import { useInView } from "@/lib/hooks";

/** Rises gently into place the first time it scrolls into view. */
export function Reveal({ as: Tag = "div", delay = 0, className = "", children }: { as?: "div" | "li" | "section" | "figure"; delay?: number; className?: string; children: React.ReactNode }) {
  const [ref, shown] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`transition-[opacity,translate] duration-[1100ms] ease-(--ease-settle) motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
