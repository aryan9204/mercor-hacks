import { ShieldCheck, TriangleAlert, CircleX, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { caseStatus, f2 } from "@/lib/imaced";
import { CatchBadge } from "./CatchBadge";

const BAR = { good: "bg-good", warn: "bg-warn", crit: "bg-crit", muted: "bg-border" };
const TILE = {
  good: "border-good/45 bg-good/10 text-[#8ee08e]",
  warn: "border-warn/45 bg-warn/10 text-[#ffd77a]",
  crit: "border-crit/50 bg-crit/10 text-[#ff9a9d]",
  muted: "border-border bg-secondary text-muted-foreground",
};

function verdict(c, gate) {
  const s = caseStatus(c, gate);
  const ev = c.views.evid;
  switch (s.key) {
    case "wrong":
      return { s, Icon: CircleX, title: "WRONG, AND IT LOOKS CONFIDENT",
        body: `Qwen answered “${ev.pred_text}” at p ${f2(ev.conf)} with the evidence masked. The labelled answer is ${c.gt} (${c.gt_text}).` };
    case "answered_noev":
      return { s, Icon: TriangleAlert, title: "ANSWERED WITHOUT THE EVIDENCE",
        body: `Qwen answered “${ev.pred_text}” at p ${f2(ev.conf)} with the evidence masked.` };
    case "caught":
      return { s, Icon: ShieldCheck, title: "CAUGHT",
        body: "With the evidence masked, Imaced stops the answer and Qwen abstains. On the full image the answer is accepted." };
    default:
      return { s, Icon: CircleCheck, title: "ANSWERED",
        body: "Imaced accepted Qwen's answer on the evidence-masked image." };
  }
}

export function VerdictBanner({ c, gate }) {
  const { s, Icon, title, body } = verdict(c, gate);
  const caught = s.key === "caught" && c.caught === true;
  const same = c.blind.pred === c.views.evid.pred;
  return (
    <section aria-live="polite" aria-atomic="true" aria-label="Verdict" className="relative overflow-hidden rounded-xl border bg-card">
      <div className={cn("absolute inset-y-0 left-0 w-1", BAR[s.tone])} aria-hidden />
      <div key={`${c.ds_index}-${gate}`} className="flex flex-col gap-4 p-4 pl-5 duration-300 animate-in fade-in md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg border", TILE[s.tone])}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold tracking-[0.06em]">{title}</h2>
              {caught && <CatchBadge />}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="min-w-0 shrink-0 border-t pt-3 text-sm md:max-w-xs md:border-l md:border-t-0 md:pl-5 md:pt-0 md:text-right">
          <div className="break-words">
            <span className="text-muted-foreground">Blind answer (no image): </span>
            <span className="font-medium">{c.blind.pred}) {c.blind.pred_text}</span>
            <span className="tnum ml-1 font-mono text-xs text-muted-foreground">p {f2(c.blind.conf)}</span>
          </div>
          {same && <div className="mt-0.5 text-xs text-[#ffd77a]">Same as its answer with the evidence masked</div>}
        </div>
      </div>
    </section>
  );
}
