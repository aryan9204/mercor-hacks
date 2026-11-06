// Landing screen: the #12834 story in one glance, with a three.js hero driven by a 3-way view switch.
import { lazy, Suspense, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, EyeOff, Shuffle, ShieldQuestion, ShieldCheck, LayoutGrid, ChartColumn } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { StatusPill, Eyebrow, CaseImage } from "@/components/common";
import { SceneFallback } from "@/components/three/SceneFallback";
import { DEMO, CHECKER_V2, CASES, CAUGHT_COUNT, MODEL, pct, f2 } from "@/lib/imaced";

const EvidenceScene = lazy(() => import("@/components/three/EvidenceScene"));

const CASE = CASES.find((c) => c.ds_index === DEMO.ds_index);
const CASE_IDX = Math.max(0, CASES.findIndex((c) => c.ds_index === DEMO.ds_index));
const OPTS = Object.fromEntries(CASE?.options || [["A", "Left half"], ["B", "Right half"], ["C", "No mass is present"]]);
const QUESTION = DEMO.question.split(/\s+A\)/)[0];

const VIEWS = [
  { id: "full", label: "Full image", short: "Full", res: DEMO.results.full, tone: "good", pill: "Correct",
    note: "Nothing hidden. The mass is visible on the left." },
  { id: "rand", label: "Irrelevant region masked", short: "Irrelevant", res: DEMO.results.random_masked, tone: "good", pill: "Correct",
    note: "An equal-size region elsewhere is painted gray; the evidence stays visible." },
  { id: "evid", label: "Evidence masked", short: "Evidence", res: DEMO.results.evidence_masked, tone: "crit", pill: "Wrong · evidence hidden",
    note: "The annotated mass is painted gray. There is nothing left to support an answer." },
];

// Headline numbers: the 8 demo cases, and checker v2 on the held-out test half (full, irrelevant-masked
// and evidence-masked images only).
const evidWrong = CASES.filter((c) => !c.views.evid.correct).length;
const R = CHECKER_V2.rules;
const CAUGHT = CASES.map((c, i) => ({ c, i })).filter(({ c }) => c.caught);

const STEPS = [
  { icon: EyeOff, title: "Test it on three images", body: "The full image, the same image with an irrelevant region painted gray, and with the evidence painted gray. Only the last one should make the model stop." },
  { icon: Shuffle, title: "Score five signals", body: "Confidence, confidence with the options shuffled, whether the answer survives the shuffle, how much the image helps over no image, and the pull toward “Cannot be determined”." },
  { icon: ShieldQuestion, title: "Accept or abstain", body: "A combined score, with its threshold fit on a separate calibration half, decides whether Qwen's answer is accepted or Qwen abstains." },
];

export default function Overview({ openCase, go }) {
  const [view, setView] = useState("full");
  const reduce = useReducedMotion();
  const v = VIEWS.find((x) => x.id === view);
  const enter = (i = 0) => (reduce ? {} : {
    initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: 0.06 * i, ease: "easeOut" },
  });

  return (
    <div className="space-y-10 overflow-x-hidden md:space-y-14">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0 space-y-6">
          <motion.div {...enter(0)} className="space-y-3">
            <Eyebrow className="text-evidence">Medical VQA · evidence verification</Eyebrow>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl xl:text-5xl">
              Is the answer coming from the evidence?
            </h1>
            <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
              Vision models answer medical-image questions with high confidence. Imaced checks whether that answer actually
              depends on the part of the image that matters. We hide the evidence and ask again. If <span className="text-foreground">{MODEL}</span> still
              answers just as confidently, the answer wasn't coming from the evidence, and the model should have said it couldn't tell.
            </p>
          </motion.div>

          <motion.div {...enter(1)} className="space-y-4 rounded-xl border bg-card/60 p-4 sm:p-5">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">ViTAR-16K case #{DEMO.ds_index} · correct answer {DEMO.gt}) {OPTS[DEMO.gt]}</div>
              <div className="text-[15px] font-medium">{QUESTION}</div>
            </div>

            <div>
              <span id="ov-view-label" className="sr-only">Image shown to Qwen</span>
              <ToggleGroup type="single" value={view} onValueChange={(x) => x && setView(x)} aria-labelledby="ov-view-label"
                variant="outline" className="grid w-full grid-cols-3">
                {VIEWS.map((x, i) => (
                  <ToggleGroupItem key={x.id} value={x.id} aria-label={`${i + 1}. ${x.label}`}
                    className="h-9 min-w-0 px-2 text-[13px] data-[state=on]:bg-accent data-[state=on]:text-foreground">
                    <span className="mr-1 text-muted-foreground tnum">{i + 1}</span>
                    <span className="truncate sm:hidden">{x.short}</span>
                    <span className="hidden truncate sm:inline">{x.label}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div aria-live="polite" className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">What Qwen said</div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-2xl font-semibold ${v.tone === "crit" ? "text-[#ff9a9d]" : "text-foreground"}`}>
                    {v.res.pred}) {OPTS[v.res.pred]}
                  </span>
                  <span className="text-sm text-muted-foreground tnum">p = {v.res.conf.toFixed(3)}</span>
                </div>
                <p className="text-[13px] text-muted-foreground">{v.note}</p>
                {view === "evid" && (
                  <p className="text-[13px] text-foreground/90">
                    Offered “{DEMO.results.evidence_masked_with_abstain_option.abstain_letter}) Cannot be determined”: still answered{" "}
                    {DEMO.results.evidence_masked_with_abstain_option.pred}.
                  </p>
                )}
              </div>
              <StatusPill tone={v.tone}>{v.pill}</StatusPill>
            </div>
          </motion.div>
        </div>

        <motion.div {...enter(2)} className="relative h-[360px] min-w-0 rounded-2xl border bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),transparent_70%)] sm:h-[460px] lg:h-[560px]">
          <Suspense fallback={<SceneFallback view={view} className="p-6" />}>
            <EvidenceScene view={view} />
          </Suspense>
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-evidence" aria-hidden />annotated evidence</span>
            {view !== "full" && <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-[#7c7468]" aria-hidden />masked (gray)</span>}
          </div>
        </motion.div>
      </section>

      {/* Numbers */}
      <section aria-labelledby="ov-numbers" className="space-y-4">
        <h2 id="ov-numbers" className="text-lg font-semibold">What the check does</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat i={0} enter={enter} big={`${CAUGHT_COUNT} of ${CASES.length}`} label="Demo cases caught by Imaced" icon
            sub="With the evidence masked, Imaced stops the answer and Qwen abstains." />
          <Stat i={1} enter={enter} big={`${R.combined.evid_wrong_caught} of ${R.combined.evid_wrong}`} label="Wrong evidence-masked answers stopped"
            sub={`Held-out test half, ${CHECKER_V2.n_questions_test} questions.`} />
          <Stat i={2} enter={enter} big={`${pct(R.never.accepted_accuracy_answerable)} → ${pct(R.combined.accepted_accuracy_answerable)}`}
            label="Accuracy of the answers that get through" sub="Full and irrelevant-masked images, held-out test half." />
          <Stat i={3} enter={enter} big={`${evidWrong} of ${CASES.length}`} label="Demo cases Qwen gets wrong once the evidence is masked"
            sub="Without a check, Qwen answers every one of them." />
        </div>
      </section>

      {/* Imaced in action */}
      <section aria-labelledby="ov-caught" className="space-y-4">
        <h2 id="ov-caught" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-good" aria-hidden />Imaced in action</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CAUGHT.map(({ c, i }, k) => (
            <motion.button key={c.ds_index} {...enter(k)} onClick={() => openCase?.(i)} aria-label={`Open caught case ${c.ds_index}`}
              className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card/60 p-3 text-left transition-colors hover:border-input hover:bg-secondary">
              <CaseImage c={c} view="evid" stage={4 / 3} />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">#{c.ds_index}</span>
                <StatusPill tone="good"><ShieldCheck className="size-3" aria-hidden />Caught</StatusPill>
              </div>
              <span className="line-clamp-2 text-[13px]">{c.question}</span>
              <span className="text-xs text-muted-foreground">
                Without the check: “{c.views.evid.pred_text}” at p {f2(c.views.evid.conf)}. With Imaced: abstains.
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="ov-how" className="space-y-4">
        <h2 id="ov-how" className="text-lg font-semibold">How Imaced checks</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <motion.li key={title} {...enter(i)} className="flex gap-3 rounded-xl border bg-card/40 p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-secondary text-evidence"><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium"><span className="mr-1.5 text-muted-foreground tnum">{i + 1}</span>{title}</div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => openCase?.(CASE_IDX)} className="gap-2">Open the case <ArrowRight className="size-4" aria-hidden /></Button>
          <Button variant="outline" onClick={() => go?.("score")} className="gap-2"><ChartColumn className="size-4" aria-hidden />See results</Button>
          <Button variant="outline" onClick={() => go?.("gallery")} className="gap-2"><LayoutGrid className="size-4" aria-hidden />Browse cases</Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ i, enter, big, label, sub, icon }) {
  return (
    <motion.div {...enter(i)} className="flex flex-col gap-1.5 rounded-xl border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-2xl font-semibold tnum">{icon && <ShieldCheck className="size-5 text-good" aria-hidden />}{big}</div>
      <div className="text-[13px] font-medium">{label}</div>
      <p className="text-xs leading-relaxed text-muted-foreground">{sub}</p>
    </motion.div>
  );
}
