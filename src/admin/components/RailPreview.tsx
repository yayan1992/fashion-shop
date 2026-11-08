import * as React from "react";
import { ClothingRailHero, type RailGarment } from "@/components/ui/product-rail-gallery";

/**
 * The real rail component, with the piece being edited hanging among its
 * neighbours. Hover to turn, drag, click to open the close-up — exactly as a
 * customer will see it.
 */
export function RailPreview({ pieces, neighbours, height = 300, caption }: { pieces: RailGarment[]; neighbours: RailGarment[]; height?: number; caption?: string }) {
  const half = Math.ceil(neighbours.length / 2);
  const items = React.useMemo(() => [...neighbours.slice(0, half), ...pieces, ...neighbours.slice(half)], [neighbours, pieces, half]);
  // Remount when the set of photos changes, so the rail starts from rest.
  const key = items.map((item) => `${item.id}:${item.image}:${item.backImage}:${item.sideImage}`).join("|");
  if (pieces.length === 0) return null;
  return (
    <div className="overflow-hidden border border-ink/10 bg-plaster">
      <ClothingRailHero
        key={key}
        items={items}
        hanger="none"
        maxHeight={height}
        aria-label="Rail preview"
        className="!bg-transparent"
        caption={caption ?? "Hover to turn a piece; click it to open the close-up."}
      />
    </div>
  );
}
