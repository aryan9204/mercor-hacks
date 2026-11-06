// Small shared building blocks used by every screen.
import { Check, X, TriangleAlert, ShieldCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { realImage, VIEW_NAME } from "@/lib/imaced";

const TONE = {
  good: "border-good/45 bg-good/10 text-[#8ee08e]",
  warn: "border-warn/45 bg-warn/10 text-[#ffd77a]",
  crit: "border-crit/50 bg-crit/10 text-[#ff9a9d]",
  muted: "border-border bg-secondary text-muted-foreground",
};
const TONE_ICON = { good: Check, warn: TriangleAlert, crit: X, muted: null };
export const VERDICT_ICON = { good: ShieldCheck, warn: TriangleAlert, crit: CircleX, muted: TriangleAlert };

/** Status pill: colour is never alone, always icon + label. */
export function StatusPill({ tone = "muted", children, className }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium", TONE[tone], className)}>
      {Icon && <Icon className="size-3" strokeWidth={2.75} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Image of one view inside a fixed-ratio stage. The image keeps its own aspect ratio, and the
 * evidence / control boxes are drawn in image-pixel coordinates on top, so they stay aligned.
 * Without a real image (all cases but #12834 until the export runs) a schematic is drawn instead.
 */
export function CaseImage({ c, view, stage = 1, className, showBoxes = true }) {
  const [W, H] = c.img_size;
  const src = realImage(c, view);
  const wide = W / H >= stage;
  const gray = "#7c7468";
  const r = (b, props) => b && <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} {...props} />;
  return (
    <div className={cn("grid place-items-center overflow-hidden rounded-lg bg-black", className)} style={{ aspectRatio: stage }}>
      <div className={cn("relative", wide ? "w-full" : "h-full")} style={{ aspectRatio: `${W} / ${H}` }}>
        {src ? (
          <img src={src} alt={`${VIEW_NAME[view]}, case ${c.ds_index}`} className="absolute inset-0 size-full" loading="lazy" decoding="async" />
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" role="img" aria-label={`Schematic of ${VIEW_NAME[view]}`}>
            {view === "out" ? (<><rect width={W} height={H} fill={gray} />{r(c.box_px, { fill: "#232321" })}</>) : <rect width={W} height={H} fill="#232321" />}
            {view === "evid" && r(c.box_px, { fill: gray })}
            {view === "rand" && r(c.rand_box_px, { fill: gray })}
            <text x={W / 2} y={H - W / 26} fill="#9a998f" fontSize={W / 26} textAnchor="middle" fontFamily="system-ui">schematic · image not exported</text>
          </svg>
        )}
        {showBoxes && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {r(c.box_px, { fill: "none", stroke: "#fab219", strokeWidth: Math.max(2, W / 200), strokeDasharray: `${W / 60} ${W / 90}` })}
            {view === "rand" && r(c.rand_box_px, { fill: "none", stroke: "#c3c2b7", strokeWidth: Math.max(2, W / 220) })}
          </svg>
        )}
      </div>
    </div>
  );
}

export function Eyebrow({ children, className }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</div>;
}
