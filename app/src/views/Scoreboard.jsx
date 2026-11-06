// Results: a showcase of the Imaced check on the three inputs (full image, irrelevant region
// masked, evidence masked). Every number is read from src/data/imaced.json via lib/imaced.
import { ShieldCheck, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseImage, Eyebrow } from "@/components/common";
import { CASES, CHECKER_V2, VIEW_NAME, VIEW_ORDER, VIEW_SUB, CAUGHT_COUNT, MODEL, f2, pct } from "@/lib/imaced";
import { cn } from "@/lib/utils";

const num = "font-mono tnum";
const R = CHECKER_V2.rules;

const SIGNALS = [
  { key: "C_orig", name: "Confidence", meaning: "Probability of Qwen's top option, options in the original order." },
  { key: "C_perm", name: "Order-averaged confidence", meaning: "Top-option probability averaged over reordered options, removing letter bias." },
  { key: "consistency", name: "Shuffle consistency", meaning: "Share of option orderings where Qwen picks the same answer." },
  { key: "blind_gain", name: "Blind gain", meaning: "How much the image raises the answer's probability over the question alone." },
  { key: "p_abstain", name: "p(cannot be determined)", meaning: "Probability Qwen gives to an added “Cannot be determined from the image” option." },
];

const RULE_ROWS = [
  { id: "never", name: "Qwen alone" },
  { id: "confidence", name: "Confidence threshold" },
  { id: "combined", name: "Imaced", hi: true },
];

function CatchBadge({ className }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-good/45 bg-good/10 px-2.5 text-[11px] font-medium text-[#8ee08e]", className)}>
      <ShieldCheck className="size-3.5" strokeWidth={2.5} aria-hidden />
      Caught
    </span>
  );
}

/* ------------------------------------------------------------------ hero */

function Stat({ value, label, icon: Icon }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/40 p-4">
      <div className={cn(num, "flex items-center gap-2 text-3xl font-semibold leading-none sm:text-4xl")}>
        {Icon && <Icon className="size-7 shrink-0 text-good" strokeWidth={2.25} aria-hidden />}
        <span className="min-w-0">{value}</span>
      </div>
      <div className="mt-2 text-xs leading-snug text-muted-foreground">{label}</div>
    </div>
  );
}

function Hero() {
  const c = R.combined, n = R.never;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={ShieldCheck} value={<>{CAUGHT_COUNT} <span className="text-muted-foreground">of</span> {CASES.length}</>}
        label="demo cases caught: Imaced abstained on the evidence-masked image" />
      <Stat value={<>{c.evid_wrong_caught} <span className="text-muted-foreground">of</span> {c.evid_wrong}</>}
        label="wrong answers on evidence-masked images that the check stopped (held-out test)" />
      <Stat value={<>{pct(n.accepted_accuracy_answerable)} <span className="text-muted-foreground">→</span> <span className="text-good">{pct(c.accepted_accuracy_answerable)}</span></>}
        label="accuracy of answers Imaced accepts, on full and irrelevant-masked images (Qwen alone → Imaced)" />
      <Stat value={pct(c.coverage_answerable)} label="of answerable images still answered (full and irrelevant-masked)" />
    </div>
  );
}

/* ----------------------------------------------------------- case matrix */

function Decision({ v, view }) {
  if (!v) return <span className="text-muted-foreground">–</span>;
  if (v.checker === "abstain") {
    return (
      <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium",
        view === "evid" ? "border-good/45 bg-good/10 text-[#8ee08e]" : "border-border bg-secondary text-muted-foreground")}>
        Abstained
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-xs">Answered</span>
      <span className={cn(num, "text-[11px] text-muted-foreground")}>
        {v.pred} · p {f2(v.conf)}
      </span>
    </span>
  );
}

function CaseMatrix({ openCase }) {
  return (
    <Card>
      <CardHeader>
        <Eyebrow>Demo cases</Eyebrow>
        <CardTitle className="text-base">The 8 demo cases</CardTitle>
        <CardDescription>
          What Imaced decided for each image. Full and irrelevant-masked images should be answered; evidence-masked images should
          be abstained on. Select a row to open the case.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-[44%] text-xs">Case</TableHead>
                {VIEW_ORDER.map((v) => (
                  <TableHead key={v} scope="col" className="whitespace-normal align-bottom text-xs">
                    {VIEW_NAME[v]}
                    <div className="text-[10px] font-normal text-muted-foreground">{VIEW_SUB[v]}</div>
                  </TableHead>
                ))}
                <TableHead scope="col" className="text-xs">Caught</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CASES.map((c, i) => (
                <TableRow key={c.ds_index} className="cursor-pointer" onClick={() => openCase(i)}>
                  <TableHead scope="row" className="whitespace-normal py-2 font-normal">
                    <button type="button" onClick={(e) => { e.stopPropagation(); openCase(i); }}
                      aria-label={`Open case ${c.ds_index}: ${c.question}`}
                      className="group flex w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <CaseImage c={c} view="evid" stage={1} showBoxes={false} className="w-14 shrink-0" />
                      <span className="min-w-0">
                        <span className={cn(num, "text-xs text-muted-foreground")}>#{c.ds_index}</span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-foreground">{c.question}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                    </button>
                  </TableHead>
                  {VIEW_ORDER.map((v) => (
                    <TableCell key={v}><Decision v={c.views[v]} view={v} /></TableCell>
                  ))}
                  <TableCell>{c.caught && <CatchBadge />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------- how it decides */

function CoefBar({ value, max }) {
  const w = (Math.abs(value) / max) * 50;
  const pos = value >= 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-secondary" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/60" />
      <div className={cn("absolute inset-y-0 rounded-full", pos ? "bg-data" : "bg-muted-foreground")}
        style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
    </div>
  );
}

function HowItDecides() {
  const co = CHECKER_V2.coefficients;
  const max = Math.max(...SIGNALS.map((s) => Math.abs(co[s.key] ?? 0))) || 1;
  const reasons = Object.entries(CHECKER_V2.reasons_evid || {}).sort((a, b) => b[1] - a[1]);
  const rTotal = reasons.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <Card>
      <CardHeader>
        <Eyebrow>Method</Eyebrow>
        <CardTitle className="text-base">How the check decides</CardTitle>
        <CardDescription>
          Imaced reads five signals from Qwen, none of which needs the true answer or the evidence location. A logistic regression
          on the calibration half combines them into one abstain score. Coefficients are standardized: positive pushes toward
          abstaining, negative toward answering.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SIGNALS.map((s) => (
            <div key={s.key} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background/40 p-3">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="flex-1 text-[11px] leading-snug text-muted-foreground">{s.meaning}</div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Coefficient</span>
                <span className={cn(num, "text-sm")}>{co[s.key] >= 0 ? "+" : ""}{f2(co[s.key])}</span>
              </div>
              <CoefBar value={co[s.key] ?? 0} max={max} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="rounded-lg border bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Decision threshold on the combined score</div>
            <div className={cn(num, "mt-1 text-3xl font-semibold")}>{f2(CHECKER_V2.threshold_combined)}</div>
            <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Abstain when the score is above it. Picked on the calibration half.
            </div>
          </div>
          <div className="rounded-lg border bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Why it abstained on evidence-masked images (held-out test)</div>
            <ul className="mt-3 space-y-2.5">
              {reasons.map(([why, n]) => (
                <li key={why} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0">{why}</span>
                    <span className={cn(num, "shrink-0")}>{n}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary" aria-hidden>
                    <div className="h-full rounded-full bg-data" style={{ width: `${(100 * n) / rTotal}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-muted-foreground">Main contributing signal per abstention.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- rules table */

function RulesTable() {
  const ci = (r, v) => {
    const c = R[r].ci95?.[v];
    return c ? `${pct(c[0])}–${pct(c[1])}` : null;
  };
  return (
    <Card>
      <CardHeader>
        <Eyebrow>Held-out test</Eyebrow>
        <CardTitle className="text-base">Rules compared on the held-out test half ({CHECKER_V2.n_questions_test} questions)</CardTitle>
        <CardDescription>Abstain rate per input, with 95% bootstrap interval resampled by image.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="text-xs">Rule</TableHead>
                {VIEW_ORDER.map((v) => (
                  <TableHead key={v} scope="col" className="whitespace-normal align-bottom text-xs">
                    {v === "rand" ? "Irrelevant masked" : VIEW_NAME[v]}
                    <div className="text-[10px] font-normal text-muted-foreground">abstain · {VIEW_SUB[v]}</div>
                  </TableHead>
                ))}
                <TableHead scope="col" className="whitespace-normal align-bottom text-xs">Wrong evidence-masked answers stopped</TableHead>
                <TableHead scope="col" className="whitespace-normal align-bottom text-xs">Accuracy of accepted answers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RULE_ROWS.map(({ id, name, hi }) => {
                const r = R[id];
                if (!r) return null;
                return (
                  <TableRow key={id} className={cn(hi && "bg-data/10 hover:bg-data/15")}>
                    <TableHead scope="row" className={cn("text-sm", hi ? "font-semibold text-foreground" : "font-normal")}>
                      <span className="inline-flex items-center gap-1.5">
                        {hi && <ShieldCheck className="size-4 text-good" aria-hidden />}
                        {name}
                      </span>
                    </TableHead>
                    {VIEW_ORDER.map((v) => (
                      <TableCell key={v}>
                        <div className={num}>{pct(r.abstain[v])}</div>
                        {ci(id, v) && <div className={cn(num, "text-[10px] text-muted-foreground")}>{ci(id, v)}</div>}
                      </TableCell>
                    ))}
                    <TableCell className={num}>
                      {r.evid_wrong_caught} <span className="text-muted-foreground">of</span> {r.evid_wrong}
                    </TableCell>
                    <TableCell className={num}>{pct(r.accepted_accuracy_answerable)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 px-6 text-[11px] text-muted-foreground sm:px-0">
          Accuracy of accepted answers is measured on full and irrelevant-masked images.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- page */

export default function Scoreboard({ openCase = () => {} }) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
      <div className="space-y-2">
        <Eyebrow>Results</Eyebrow>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">The check, working</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Imaced lets Qwen answer when the image supports the answer, and abstains when the evidence has been masked out.
        </p>
      </div>
      <Hero />
      <CaseMatrix openCase={openCase} />
      <HowItDecides />
      <RulesTable />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Model <span className="font-mono">{MODEL}</span>, dataset ViTAR-16K. Held-out test half = {CHECKER_V2.n_questions_test} questions,
        split by image; thresholds and the combined model were fit on the calibration half. Demo cases are the 8 examples in
        demo_examples/.
      </p>
    </div>
  );
}
