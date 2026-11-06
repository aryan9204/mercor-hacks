// Hand-built SVG scatter with focusable points and a hover/focus tooltip. No chart library.
import { useState } from "react";

const W = 560, H = 380, M = { l: 52, r: 16, t: 14, b: 46 };
const GRID = "#2c2c2a";

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/**
 * points: [{ key, x, y, color, label (aria), tip (node), onActivate?, shape? }]
 * diagonal: draw y = x, shadeBelow: label for the region y < x.
 * vLines / hLines: [{ v, label }].
 */
export default function ScatterPlot({
  points, xDomain, yDomain, xLabel, yLabel, ariaLabel, diagonal, shadeBelow, vLines = [], hLines = [], fmt = (v) => v,
}) {
  const [hot, setHot] = useState(null);
  const [x0, x1] = xDomain, [y0, y1] = yDomain;
  const sx = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const xt = niceTicks(x0, x1), yt = niceTicks(y0, y1);
  const hp = points.find((p) => p.key === hot);

  // Region below y = x, clipped to the plot box.
  let shade = null;
  if (diagonal && shadeBelow) {
    const lo = Math.max(x0, y0), hi = Math.min(x1, y1);
    shade = `M${sx(x0)},${sy(y0)} L${sx(x1)},${sy(y0)} L${sx(x1)},${sy(Math.min(x1, y1))} L${sx(hi)},${sy(hi)} L${sx(lo)},${sy(lo)} Z`;
  }

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={ariaLabel}>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="none" stroke={GRID} />
        {shade && <path d={shade} fill="#f0efec" fillOpacity={0.045} />}
        {xt.map((t) => (
          <g key={`x${t}`} aria-hidden>
            <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} stroke={GRID} />
            <text x={sx(t)} y={H - M.b + 16} textAnchor="middle" fontSize="11" fill="#9a998f" className="font-mono tnum">{fmt(t)}</text>
          </g>
        ))}
        {yt.map((t) => (
          <g key={`y${t}`} aria-hidden>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke={GRID} />
            <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#9a998f" className="font-mono tnum">{fmt(t)}</text>
          </g>
        ))}
        {diagonal && (() => {
          const lo = Math.max(x0, y0), hi = Math.min(x1, y1);
          return <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="#9a998f" strokeDasharray="5 4" aria-hidden />;
        })()}
        {shade && (
          <text x={W - M.r - 8} y={H - M.b - 10} textAnchor="end" fontSize="11" fill="#c3c2b7" aria-hidden>{shadeBelow}</text>
        )}
        {vLines.map((l) => (
          <g key={`v${l.label}`} aria-hidden>
            <line x1={sx(l.v)} x2={sx(l.v)} y1={M.t} y2={H - M.b} stroke="#c3c2b7" strokeDasharray="3 3" />
            <text x={sx(l.v) + 4} y={M.t + 12} fontSize="11" fill="#c3c2b7" className="font-mono">{l.label}</text>
          </g>
        ))}
        {hLines.map((l) => (
          <g key={`h${l.label}`} aria-hidden>
            <line x1={M.l} x2={W - M.r} y1={sy(l.v)} y2={sy(l.v)} stroke="#c3c2b7" strokeDasharray="3 3" />
            <text x={W - M.r - 4} y={sy(l.v) - 5} textAnchor="end" fontSize="11" fill="#c3c2b7" className="font-mono">{l.label}</text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#c3c2b7" aria-hidden>{xLabel}</text>
        <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="#c3c2b7" aria-hidden>{yLabel}</text>
        {points.map((p) => {
          const cx = sx(p.x), cy = sy(p.y), on = hot === p.key;
          const act = p.onActivate;
          return (
            <g
              key={p.key}
              tabIndex={0}
              role={act ? "button" : "img"}
              aria-label={p.label}
              className="cursor-pointer outline-none [&:focus-visible>circle.ring]:opacity-100"
              onMouseEnter={() => setHot(p.key)}
              onMouseLeave={() => setHot((h) => (h === p.key ? null : h))}
              onFocus={() => setHot(p.key)}
              onBlur={() => setHot((h) => (h === p.key ? null : h))}
              onClick={act}
              onKeyDown={(e) => { if (act && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); act(); } }}
            >
              <circle className="ring" cx={cx} cy={cy} r={10} fill="none" stroke="#7fb2f0" strokeWidth={2} opacity={0} />
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle cx={cx} cy={cy} r={on ? 6.5 : p.r || 5} fill={p.color} fillOpacity={on ? 1 : 0.85} stroke="#0b0b0a" strokeWidth={1.25} />
            </g>
          );
        })}
      </svg>
      {hp && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-[min(18rem,80%)] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{
            left: `${(sx(hp.x) / W) * 100}%`,
            top: `${(sy(hp.y) / H) * 100}%`,
            transform: `translate(${sx(hp.x) > W * 0.6 ? "calc(-100% - 12px)" : "12px"}, ${sy(hp.y) > H * 0.55 ? "calc(-100% - 8px)" : "8px"})`,
          }}
        >
          {hp.tip}
        </div>
      )}
    </div>
  );
}
