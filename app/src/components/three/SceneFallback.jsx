// Static image fallback for the EvidenceScene (no three.js import, so it can render before the 3D chunk loads).
import { DEMO } from "@/lib/imaced";
import { cn } from "@/lib/utils";

const [IW, IH] = DEMO.size;
const AMBER = "#fab219";

/** Static fallback: the real image for the chosen view, with the evidence box outlined. */
export function SceneFallback({ view, className }) {
  const src = DEMO.images[view] || DEMO.images.full;
  const r = (b, props) => <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} {...props} />;
  return (
    <div className={cn("grid size-full place-items-center", className)}>
      <div className="relative h-full max-h-full" style={{ aspectRatio: `${IW} / ${IH}` }}>
        <img src={src} alt="" className="absolute inset-0 size-full rounded-md" decoding="async" />
        <svg viewBox={`0 0 ${IW} ${IH}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {r(DEMO.evidence_box_px, { fill: "none", stroke: AMBER, strokeWidth: 5, strokeDasharray: "14 9" })}
          {view === "rand" && r(DEMO.random_box_px, { fill: "none", stroke: "#c3c2b7", strokeWidth: 4 })}
        </svg>
      </div>
    </div>
  );
}

