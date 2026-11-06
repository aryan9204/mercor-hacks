import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CaseImage, StatusPill } from "@/components/common";
import { VIEW_NAME, VIEW_SUB, gateAbstains, optText, f2 } from "@/lib/imaced";
import { CatchBadge } from "./CatchBadge";

const ABSTAIN_GRAY = "#8d8c84";

/** Outcome pill for one view under the current gate. Neutral wording when nothing is caught. */
export function viewOutcome(v, k, gate) {
  if (gate === "off") {
    if (k === "evid") return v.correct ? { tone: "warn", label: "Answered · evidence masked" } : { tone: "crit", label: "Wrong · evidence masked" };
    return v.correct ? { tone: "good", label: "Correct" } : { tone: "muted", label: "Answered" };
  }
  if (gateAbstains(v, gate)) return { tone: k === "evid" ? "good" : "muted", label: "Abstained" };
  return { tone: k === "evid" ? "muted" : "good", label: "Accepted" };
}

export function ViewCard({ c, k, gate }) {
  const v = c.views[k];
  const abstains = gateAbstains(v, gate);
  const out = viewOutcome(v, k, gate);
  const caught = gate === "imaced" && k === "evid" && c.caught === true;
  const letters = c.options.map(([L]) => L);

  return (
    <Card
      className={cn("min-w-0 gap-3 p-3 py-3 shadow-none", caught && "border-good/60")}
      aria-label={`${VIEW_NAME[k]}: ${out.label}${caught ? ", caught" : ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{VIEW_NAME[k]}</h3>
          <p className="text-xs text-muted-foreground">{VIEW_SUB[k]}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {caught && <CatchBadge />}
          <StatusPill tone={out.tone}>{out.label}</StatusPill>
        </div>
      </header>

      <CaseImage c={c} view={k} stage={1} />

      <div className="flex min-w-0 items-baseline gap-2 text-sm">
        {abstains ? (
          <>
            <span className="grid size-6 shrink-0 place-items-center rounded-md border font-mono text-xs" style={{ borderColor: ABSTAIN_GRAY, color: ABSTAIN_GRAY }}>?</span>
            <span className="truncate">Cannot be determined</span>
          </>
        ) : (
          <>
            <span className="grid size-6 shrink-0 place-items-center rounded-md border border-input font-mono text-xs">{v.pred}</span>
            <span className="min-w-0 truncate" title={v.pred_text}>{v.pred_text}</span>
            <span className="tnum ml-auto shrink-0 font-mono text-xs text-muted-foreground">p {f2(v.conf)}</span>
          </>
        )}
      </div>

      <ul className="space-y-1.5" aria-label={`Option probabilities, ${VIEW_NAME[k]}`}>
        {letters.map((L) => {
          const p = v.probs[L] ?? 0;
          return (
            <li key={L} className="flex items-center gap-2 text-xs" title={`${L}) ${optText(c, L)}: ${f2(p)}`}>
              <span className="w-7 shrink-0 font-mono" aria-label={`Option ${L}${L === c.gt ? ", labelled answer" : ""}`}>
                {L}{L === c.gt && <span className="text-good" aria-hidden> ✓</span>}
              </span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <div className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%`, background: "var(--data)" }} />
              </div>
              <span className="tnum w-9 shrink-0 text-right font-mono text-muted-foreground">{f2(p)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
