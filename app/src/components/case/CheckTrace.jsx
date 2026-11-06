import { Gauge, EyeOff, SquareDashed, CircleHelp, Scale, ChevronRight, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/common";
import { cn } from "@/lib/utils";
import { f2, signed } from "@/lib/imaced";
import { CatchBadge } from "./CatchBadge";

/** Labelled horizontal bars comparing a value on the evidence-masked image with a reference. */
function Pair({ rows, max = 1 }) {
  return (
    <div className="space-y-1.5">
      {rows.map(({ label, value, shown, hi }) => (
        <div key={label} className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className={cn("min-w-0 truncate", hi ? "text-foreground" : "text-muted-foreground")} title={label}>{label}</span>
            <span className="tnum shrink-0 font-mono text-foreground">{shown ?? f2(value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(1, Math.abs(value) / (max || 1)) * 100}%`, background: hi ? "var(--evidence)" : "#8d8c84" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ n, Icon, title, children, note, hi, last }) {
  return (
    <li className="relative min-w-0 duration-500 animate-in fade-in slide-in-from-bottom-1 fill-mode-both" style={{ animationDelay: `${(n - 1) * 70}ms` }}>
      <div className={cn("flex h-full flex-col gap-2.5 rounded-lg border bg-background/40 p-3", hi && "border-evidence/50")}>
        <div className="flex items-center gap-2">
          <span className="tnum grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] text-muted-foreground">{n}</span>
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <h3 className="min-w-0 text-xs font-semibold">{title}</h3>
        </div>
        <div className="flex-1">{children}</div>
        {note && <p className={cn("text-[11px] leading-snug", hi ? "text-[#ffd77a]" : "text-muted-foreground")}>{note}</p>}
      </div>
      {!last && <ChevronRight className="absolute -right-[13px] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block" aria-hidden />}
    </li>
  );
}

/** "How the check decided": the real signals on the evidence-masked image, step by step. */
export function CheckTrace({ c }) {
  const { full, rand, evid } = c.views;
  const blindSame = c.blind.pred === evid.pred;
  const hurtsMore = evid.d_logp_gt < rand.d_logp_gt;
  const dMax = Math.max(Math.abs(evid.d_logp_gt), Math.abs(rand.d_logp_gt), 1e-6);
  const abHigher = evid.p_abstain > full.p_abstain;
  const abstains = evid.checker === "abstain";
  const caught = abstains && c.caught === true;

  return (
    <Card className="gap-3 p-4 py-4 shadow-none" aria-labelledby="trace-h">
      <div>
        <Eyebrow>Check trace · evidence-masked image</Eyebrow>
        <h2 id="trace-h" className="mt-1 text-base font-semibold">How the check decided</h2>
      </div>
      <ol key={c.ds_index} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        <Step n={1} Icon={Gauge} title="Confidence" note="p(top option), evidence masked vs full image.">
          <Pair rows={[
            { label: `Evidence masked · ${evid.pred}`, value: evid.conf, hi: true },
            { label: `Full image · ${full.pred}`, value: full.conf },
          ]} />
        </Step>

        <Step n={2} Icon={EyeOff} title="Blind test" hi={blindSame}
          note={blindSame ? "Evidence-masked answer matches the blind answer." : "Evidence-masked answer differs from the blind answer."}>
          <div className="space-y-1 text-xs">
            <div className="text-[11px] text-muted-foreground">Answer with no image</div>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono">{c.blind.pred})</span>
              <span className="min-w-0 truncate" title={c.blind.pred_text}>{c.blind.pred_text}</span>
              <span className="tnum ml-auto shrink-0 font-mono text-muted-foreground">p {f2(c.blind.conf)}</span>
            </div>
            <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={evid.pred_text}>
              Evidence masked: <span className="font-mono text-foreground">{evid.pred})</span> {evid.pred_text}
            </div>
          </div>
        </Step>

        <Step n={3} Icon={SquareDashed} title="Masking test" hi={hurtsMore}
          note={hurtsMore ? "Masking the evidence lowers p(correct) more than masking an irrelevant region." : "Δ log p(correct) vs the full image."}>
          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowDown className={cn("size-3", hurtsMore && "text-evidence")} aria-hidden />Δ log p(correct)
          </div>
          <Pair max={dMax} rows={[
            { label: "Evidence masked", value: evid.d_logp_gt, shown: signed(evid.d_logp_gt), hi: hurtsMore },
            { label: "Irrelevant masked", value: rand.d_logp_gt, shown: signed(rand.d_logp_gt) },
          ]} />
        </Step>

        <Step n={4} Icon={CircleHelp} title="Abstain option" hi={abHigher}
          note="p(“Cannot be determined”) when it is offered.">
          <Pair rows={[
            { label: "Evidence masked", value: evid.p_abstain, hi: abHigher },
            { label: "Full image", value: full.p_abstain },
          ]} />
        </Step>

        <Step n={5} Icon={Scale} title="Decision" last>
          <div className={cn("flex flex-col items-start gap-2 rounded-md border p-2.5",
            caught ? "border-good/50 bg-good/10" : "border-border bg-secondary/40")}>
            {caught ? (
              <>
                <CatchBadge />
                <span className="text-sm font-semibold text-[#8ee08e]">Abstain ✓ (caught)</span>
              </>
            ) : (
              <span className="text-sm font-semibold">{abstains ? "Abstain" : "Answer"}</span>
            )}
            <span className="font-mono text-[11px] text-muted-foreground">checker: {evid.checker}</span>
          </div>
        </Step>
      </ol>
    </Card>
  );
}
