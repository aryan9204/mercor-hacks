// Before / after chart for the Results screen: Qwen alone vs Qwen + Imaced on the held-out test half
// (60 questions x 3 image types). Counts come from CHECKER_V2.outcomes (built from
// results/checker_v2/checker_v2_test_decisions.csv by scripts/build_data.py).
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CHECKER_V2, VIEW_NAME } from "@/lib/imaced";

const O = CHECKER_V2.outcomes;
const VIEWS = ["full", "rand", "evid"];
const BEFORE = "#6f6e67";               // Qwen alone (neutral gray)
const AFTER = "var(--color-good)";      // Qwen + Imaced
const totalWrong = (rule) => VIEWS.reduce((s, v) => s + O[v][rule].answered_wrong, 0);
const totalN = VIEWS.reduce((s, v) => s + O[v].never.n, 0);
const MAXW = Math.max(...VIEWS.map((v) => O[v].never.answered_wrong));

/** A bar segment that grows to its width when scrolled into view (static when reduced motion is on). */
function Grow({ color, width, delay, reduce, className, title }) {
  if (reduce) return <div className={className} title={title} style={{ background: color, width }} />;
  return (
    <motion.div className={className} title={title} style={{ background: color }} initial={{ width: 0 }}
      whileInView={{ width }} viewport={{ once: true }} transition={{ duration: 0.7, delay, ease: "easeOut" }} />
  );
}

function Bar({ value, max, color, label, delay, reduce }) {
  const w = `${(100 * value) / max}%`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-3" aria-label={label}>
      <div className="h-4 rounded-r bg-secondary/70">
        <Grow className="h-full rounded-r" color={color} width={w} delay={delay} reduce={reduce} />
      </div>
      <span className="font-mono text-sm tnum">{value}<span className="text-muted-foreground">/{O.evid.never.n}</span></span>
    </div>
  );
}

function Stack({ title, d, reduce, delay }) {
  const parts = [
    { k: "abstained", v: d.abstained, color: AFTER, label: "abstained (correct here)" },
    { k: "answered_right", v: d.answered_right, color: "#3a3a37", label: "answered, matches the label" },
    { k: "answered_wrong", v: d.answered_wrong, color: "var(--color-crit)", label: "answered wrong" },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span>{title}</span>
        <span className="font-mono text-xs text-muted-foreground tnum">{d.abstained} abstained · {d.answered_wrong} wrong</span>
      </div>
      <div className="flex h-5 overflow-hidden rounded-md bg-secondary" role="img"
        aria-label={`${title}: ${parts.map((p) => `${p.v} ${p.label}`).join(", ")} of ${d.n}`}>
        {parts.map((p, i) => p.v > 0 && (
          <Grow key={p.k} title={`${p.v} ${p.label}`} className="h-full border-r-2 border-card last:border-r-0" color={p.color}
            width={`${(100 * p.v) / d.n}%`} delay={delay + 0.08 * i} reduce={reduce} />
        ))}
      </div>
    </div>
  );
}

export default function BeforeAfterChart() {
  const reduce = useReducedMotion();
  const before = totalWrong("never"), after = totalWrong("combined");
  return (
    <Card className="gap-5 p-5 shadow-none md:p-6" aria-labelledby="ba-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Before and after</div>
          <h2 id="ba-title" className="text-lg font-semibold">Wrong answers that reach the user</h2>
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">
            Held-out test half, {O.evid.never.n} questions per image type. Qwen's weights are unchanged: Imaced is a check added after the model.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
          <ShieldCheck className="size-5 text-good" aria-hidden />
          <div>
            <div className="font-mono text-2xl font-semibold tnum">{before} → <span className="text-[#8ee08e]">{after}</span></div>
            <div className="text-xs text-muted-foreground">of {totalN} answers, {Math.round(100 * (1 - after / before))}% fewer wrong</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Grouped bars: wrong answers delivered per image type */}
        <div className="space-y-4" role="group" aria-label="Wrong answers delivered per image type, Qwen alone vs Qwen with Imaced">
          {VIEWS.map((v, i) => (
            <div key={v} className="space-y-1.5">
              <div className="text-[13px] font-medium">{VIEW_NAME[v]}</div>
              <Bar value={O[v].never.answered_wrong} max={MAXW} color={BEFORE} reduce={reduce} delay={0.1 * i}
                label={`${VIEW_NAME[v]}, Qwen alone: ${O[v].never.answered_wrong} wrong of ${O[v].never.n}`} />
              <Bar value={O[v].combined.answered_wrong} max={MAXW} color={AFTER} reduce={reduce} delay={0.1 * i + 0.15}
                label={`${VIEW_NAME[v]}, Qwen with Imaced: ${O[v].combined.answered_wrong} wrong of ${O[v].combined.n}`} />
            </div>
          ))}
          <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: BEFORE }} aria-hidden />Qwen alone</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-good" aria-hidden />Qwen + Imaced</span>
          </div>
        </div>

        {/* Stacked composition on evidence-masked images */}
        <div className="space-y-4 rounded-xl border bg-background/60 p-4">
          <div>
            <div className="text-[13px] font-medium">Evidence-masked images: what happens</div>
            <p className="text-xs text-muted-foreground">With the evidence gone, abstaining is the right move.</p>
          </div>
          <Stack title="Qwen alone" d={O.evid.never} reduce={reduce} delay={0.1} />
          <Stack title="Qwen + Imaced" d={O.evid.combined} reduce={reduce} delay={0.3} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-good" aria-hidden />abstained</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-[#3a3a37]" aria-hidden />answered, matches label</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-crit" aria-hidden />answered wrong</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
