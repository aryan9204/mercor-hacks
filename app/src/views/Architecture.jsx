// Architecture: how Imaced is built, end to end, with Qwen's behaviour before and after the check.
// Every number comes from src/data/imaced.json (built from the repo's results/ by scripts/build_data.py).
import { motion, useReducedMotion } from "motion/react";
import {
  Database, Filter, Layers, Cpu, Activity, GitMerge, MonitorSmartphone, ArrowRight, ArrowDown,
  ShieldCheck, Shuffle, EyeOff, HelpCircle, Gauge, Code2, Server, LineChart,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow, StatusPill } from "@/components/common";
import { CASES, CHECKER_V2, PIPELINE, SUMMARY, MODEL, CAUGHT_COUNT, f2, pct } from "@/lib/imaced";

const R = CHECKER_V2.rules;
const S1 = PIPELINE.screen1, S2 = PIPELINE.screen2, SPLIT = PIPELINE.v2_split, MS = PIPELINE.v2_mean_signals;
const ACC = SUMMARY.before.no_abstain_option.accuracy;
const demoWrong = CASES.filter((c) => !c.views.evid.correct).length;
const COEF = CHECKER_V2.coefficients;

const STAGES = [
  { icon: Database, title: "Dataset", tag: "ViTAR-16K",
    body: "Medical multiple-choice questions over X-rays, MRI, mammograms, fundus and more. Each question comes with annotated evidence boxes.",
    facts: ["jline/ViTAR-16K · train split", "classification questions only"] },
  { icon: Filter, title: "Screen", tag: "keep what Qwen gets right",
    body: "Seeded shuffle, then keep questions Qwen answers correctly on the full image, with an evidence box under half the image and room for a control box.",
    facts: [`Study 1: ${S1.n} → ${S1.kept} → ${S1.core} core`, `Checker: ${S2.n} → ${S2.kept} questions`, `split by image: ${SPLIT.calib} calibration / ${SPLIT.test} test`] },
  { icon: Layers, title: "Build inputs", tag: "labels for free",
    body: "Each question becomes three images. Paint gray (RGB 124, 116, 104) over an irrelevant same-size region, or over the evidence itself.",
    facts: ["full image → answer", "irrelevant region masked → answer", "evidence masked → abstain"] },
  { icon: Cpu, title: "Ask Qwen", tag: MODEL.replace("Qwen/", ""),
    body: "One forward pass per prompt. Read the next-token log-probabilities of the option letters and renormalize them into a probability per option.",
    facts: ["bfloat16 on a Colab L4 GPU", "no sampling: exact probabilities"] },
  { icon: Activity, title: "Five signals", tag: "no answer key needed",
    body: "Measured on the input alone, so the check can run in deployment: confidence, shuffled-option confidence and consistency, the blind test, and the pull toward “Cannot be determined”.",
    facts: ["4 cyclic option orders per input", "question-only passes shared per question", "+1 pass with the abstain option"] },
  { icon: GitMerge, title: "Combine & decide", tag: "logistic regression",
    body: "Standardize the five signals, combine them with weights fit on the calibration half, and abstain when the score is above the threshold. Each abstention names its main reason.",
    facts: [`threshold ${f2(CHECKER_V2.threshold_combined)}`, "fit on calibration, scored on test", "accept → answer · else → abstain"] },
  { icon: MonitorSmartphone, title: "Show", tag: "this app",
    body: "Results and the 8 demo cases with their real images are compiled into one self-contained page: overview, case walkthrough, results and gallery.",
    facts: ["React · Tailwind · shadcn/ui · three.js", "single-file build, opens from disk"] },
];

const SIGNALS = [
  { key: "consistency", icon: Shuffle, name: "Shuffle consistency", how: "Reorder the options 4 ways. Does Qwen keep picking the same option, or the same letter position?" },
  { key: "p_abstain", icon: HelpCircle, name: "p(“Cannot be determined”)", how: "Append “Cannot be determined from the image” as an extra option and read its probability." },
  { key: "C_orig", icon: Gauge, name: "Confidence", how: "Probability of the top option in the original order." },
  { key: "blind_gain", icon: EyeOff, name: "Blind gain", how: "log p(answer | image) − log p(answer | question alone). How much the image adds." },
  { key: "C_perm", icon: Gauge, name: "Order-averaged confidence", how: "Top-option probability averaged over the 4 orders, removing letter-position bias." },
];

const EVOLUTION = [
  { v: "v0", title: "Confidence gate", scope: `Study 1 · ${S1.core} core cases`,
    body: "Abstain when Qwen's top-option probability is low; threshold fit on one half of the cases and applied to the other." },
  { v: "v1", title: "Confidence + grounding", scope: `${S2.kept} questions`,
    body: "Added a grounding signal: Qwen points to the region it used, that region is grayed, and the answer is re-scored." },
  { v: "v2", title: "Five signals, one score", scope: `${SPLIT.calib} + ${SPLIT.test} questions`, current: true,
    body: "Replaced pointing with the shuffle and blind tests and the abstain option, combined by logistic regression. This is the checker in the app." },
];

const STACK = [
  { icon: Server, title: "Model runtime", items: ["Qwen2.5-VL-7B-Instruct via Hugging Face transformers", "PyTorch, bfloat16, Colab L4 GPU", "runs in a background thread; progress polled from the CLI"] },
  { icon: LineChart, title: "Evaluation", items: ["pandas + scikit-learn (StandardScaler, LogisticRegression)", "calibration / test split by image (MD5 of pixels)", "95% bootstrap intervals, 2,000 resamples by image"] },
  { icon: Code2, title: "Interface", items: ["React 19 + Vite, Tailwind v4, shadcn/ui (Radix)", "three.js via @react-three/fiber for the 3D view", "vite-plugin-singlefile: data and images inlined"] },
];

const FILES = [
  ["vitar_abstention.py", "screen questions, build masked inputs, score letters", "results/vitar_*.csv"],
  ["vitar_analyze.py", "Study 1 summary on the core cases", "results/vitar_core_summary.json"],
  ["vitar_checker.py · vitar_calibrate.py", "v1 checker: confidence + grounding", "results/checker/"],
  ["vitar_checker_v2.py", "v2 signals for every question × input", "results/checker_v2/checker_v2_rows.csv"],
  ["vitar_calibrate_v2.py", "fit the combiner, evaluate on the test half", "results/checker_v2/ report, table, risk–coverage"],
  ["app/scripts/build_data.py", "collect results + demo images for the UI", "app/src/data/imaced.json"],
];

export default function Architecture({ openCase, go }) {
  const reduce = useReducedMotion();
  const enter = (i = 0) => (reduce ? {} : {
    initial: { opacity: 0, y: 10 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-40px" },
    transition: { duration: 0.35, delay: 0.05 * i, ease: "easeOut" },
  });

  return (
    <div className="space-y-14">
      {/* Header */}
      <header className="max-w-3xl space-y-3">
        <Eyebrow className="text-evidence">Architecture</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">How Imaced is built</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Imaced checks whether a vision-language model's answer to a medical image question actually comes from the image.
          It builds test images where the right behaviour is known, measures {MODEL} on each, and turns five signals that need
          no answer key into one decision: accept the answer, or abstain.
        </p>
      </header>

      {/* Pipeline */}
      <section aria-labelledby="arch-pipeline" className="space-y-5">
        <SectionTitle id="arch-pipeline" n="1" title="The pipeline" sub="From dataset to decision. Each stage is a script in the repository; outputs flow left to right." />
        <ol className="grid gap-3 lg:grid-cols-7">
          {STAGES.map((s, i) => (
            <motion.li key={s.title} {...enter(i)} className="relative min-w-0">
              <Card className="h-full gap-3 p-4 shadow-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="grid size-9 place-items-center rounded-lg border bg-secondary text-evidence"><s.icon className="size-4" aria-hidden /></span>
                  <span className="font-mono text-[11px] text-muted-foreground tnum">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                  <div className="truncate text-[11px] text-evidence/90" title={s.tag}>{s.tag}</div>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
                <ul className="mt-auto space-y-1 border-t pt-2">
                  {s.facts.map((f) => <li key={f} className="font-mono text-[11px] leading-snug text-foreground/85">{f}</li>)}
                </ul>
              </Card>
              {i < STAGES.length - 1 && (
                <>
                  <ArrowRight className="absolute -right-[11px] top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block" aria-hidden />
                  <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground lg:hidden" aria-hidden />
                </>
              )}
            </motion.li>
          ))}
        </ol>

        <Card className="gap-3 p-4 shadow-none md:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">The prompt (stage 04)</div>
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground/85">{`<image>
Answer the multiple-choice question with only the letter of the correct option. Do not explain.

Q: What type of tooth is at image coordinates (0.44, 0.17)? A) Caries B) Filling C) Impacted tooth D) Dental implant
A:`}</pre>
          <p className="text-xs text-muted-foreground">Qwen's chat template wraps this text with the image first. Probabilities are read for the first answer token, over the option letters only.</p>
        </Card>
      </section>

      {/* Before vs after */}
      <section aria-labelledby="arch-qwen" className="space-y-5">
        <SectionTitle id="arch-qwen" n="2" title="Qwen before and after Imaced"
          sub="Full image, irrelevant region masked and evidence masked. Checker numbers are on the held-out test half." />
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div {...enter(0)}>
            <Card className="h-full gap-4 p-5 shadow-none">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Before · Qwen alone</h3>
                <StatusPill tone="crit">Answers everything</StatusPill>
              </div>
              <Metric big={pct(R.never.abstain.evid)} label="abstains when the evidence is masked" />
              <Metric big={`${f2(MS.full.C_orig)} vs ${f2(MS.evid.C_orig)}`} label="mean confidence: full image vs evidence masked. Just as sure with the evidence gone." />
              <Metric big={`${pct(ACC.full)} → ${pct(ACC.evid)}`} label={`accuracy, full image → evidence masked (${S1.core} core cases)`} />
              <Metric big={`${demoWrong} of ${CASES.length}`} label="demo cases answered wrong once the evidence is masked, every one with an answer" />
            </Card>
          </motion.div>
          <motion.div {...enter(1)}>
            <Card className="h-full gap-4 border-good/40 p-5 shadow-none">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Now · Qwen with Imaced</h3>
                <StatusPill tone="good"><ShieldCheck className="size-3" aria-hidden />Checked</StatusPill>
              </div>
              <Metric good big={`${R.combined.evid_wrong_caught} of ${R.combined.evid_wrong}`} label="wrong evidence-masked answers stopped before reaching the user" />
              <Metric good big={`${pct(R.never.accepted_accuracy_answerable)} → ${pct(R.combined.accepted_accuracy_answerable)}`} label="accuracy of the answers that get through (full + irrelevant-masked)" />
              <Metric good big={pct(R.combined.coverage_answerable)} label="of answerable images still answered" />
              <Metric good big={`${CAUGHT_COUNT} of ${CASES.length}`} label="demo cases caught: Qwen abstains instead of answering" />
            </Card>
          </motion.div>
        </div>
        <motion.div {...enter(2)}>
          <Card className="gap-4 p-5 shadow-none">
            <h3 className="text-sm font-semibold">Side by side</h3>
            <Compare label="Wrong evidence-masked answers stopped" before={R.never.evid_wrong_caught / R.never.evid_wrong} after={R.combined.evid_wrong_caught / R.combined.evid_wrong}
              beforeTxt={`${R.never.evid_wrong_caught} / ${R.never.evid_wrong}`} afterTxt={`${R.combined.evid_wrong_caught} / ${R.combined.evid_wrong}`} />
            <Compare label="Accuracy of accepted answers" before={R.never.accepted_accuracy_answerable} after={R.combined.accepted_accuracy_answerable}
              beforeTxt={pct(R.never.accepted_accuracy_answerable)} afterTxt={pct(R.combined.accepted_accuracy_answerable)} />
            <Compare label="Demo cases where Qwen abstains on the evidence-masked image" before={0} after={CAUGHT_COUNT / CASES.length}
              beforeTxt={`0 / ${CASES.length}`} afterTxt={`${CAUGHT_COUNT} / ${CASES.length}`} />
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded-sm bg-[#6f6e67]" aria-hidden />Qwen alone</span>
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded-sm bg-good" aria-hidden />Qwen + Imaced</span>
            </div>
          </Card>
        </motion.div>
      </section>

      {/* The checker */}
      <section aria-labelledby="arch-checker" className="space-y-5">
        <SectionTitle id="arch-checker" n="3" title="The checker"
          sub="Five signals in, one decision out. Weights are standardized logistic-regression coefficients: positive pushes toward abstaining." />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="gap-1 p-2 shadow-none">
            {SIGNALS.map((s, i) => {
              const w = COEF[s.key];
              return (
                <motion.div key={s.key} {...enter(i)} className="grid grid-cols-[auto_minmax(0,1fr)_120px] items-center gap-3 rounded-lg p-3 hover:bg-secondary/60">
                  <span className="grid size-8 place-items-center rounded-md border bg-secondary text-muted-foreground"><s.icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs leading-snug text-muted-foreground">{s.how}</div>
                  </div>
                  <div aria-label={`weight ${f2(w)}`}>
                    <div className="relative h-2 rounded-full bg-secondary">
                      <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-border" aria-hidden />
                      <span className={`absolute top-0 h-2 rounded-full ${w >= 0 ? "bg-data" : "bg-[#d95926]"}`}
                        style={{ left: w >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(w) * 60)}%`, width: `${Math.min(50, Math.abs(w) * 60)}%` }} />
                    </div>
                    <div className="mt-1 text-right font-mono text-xs tnum">{w >= 0 ? "+" : ""}{f2(w)}</div>
                  </div>
                </motion.div>
              );
            })}
          </Card>
          <div className="flex flex-col gap-4">
            <Card className="gap-3 p-5 shadow-none">
              <h3 className="text-sm font-semibold">Decision rule</h3>
              <ol className="space-y-2 text-[13px] text-muted-foreground">
                <li><span className="mr-2 font-mono text-foreground">1</span>Standardize each signal with the calibration half's mean and spread.</li>
                <li><span className="mr-2 font-mono text-foreground">2</span>Weighted sum → logistic → abstain score between 0 and 1.</li>
                <li><span className="mr-2 font-mono text-foreground">3</span>Abstain if the score is above <span className="font-mono text-foreground">{f2(CHECKER_V2.threshold_combined)}</span>, else accept Qwen's answer.</li>
                <li><span className="mr-2 font-mono text-foreground">4</span>Report the signal that contributed most, e.g. “answer changes when options are reordered”.</li>
              </ol>
            </Card>
            <Card className="gap-3 p-5 shadow-none">
              <h3 className="text-sm font-semibold">Why no answer key is needed</h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Every signal is computed from Qwen's own probabilities on the question and image. The evidence boxes and labels are used
                only to build the test images and to grade the checker, never to make a decision.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Evolution */}
      <section aria-labelledby="arch-evo" className="space-y-5">
        <SectionTitle id="arch-evo" n="4" title="How the checker evolved" sub="Three iterations, each tested the same way." />
        <ol className="grid gap-3 md:grid-cols-3">
          {EVOLUTION.map((e, i) => (
            <motion.li key={e.v} {...enter(i)}>
              <Card className={`h-full gap-2 p-5 shadow-none ${e.current ? "border-good/45" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-evidence">{e.v}</span>
                  {e.current ? <StatusPill tone="good">In the app</StatusPill> : <span className="text-[11px] text-muted-foreground">{e.scope}</span>}
                </div>
                <h3 className="text-sm font-semibold">{e.title}</h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{e.body}</p>
                {e.current && <div className="text-[11px] text-muted-foreground">{e.scope}</div>}
              </Card>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* Framework */}
      <section aria-labelledby="arch-stack" className="space-y-5">
        <SectionTitle id="arch-stack" n="5" title="Framework" sub="Where each part runs, and which file produces what." />
        <div className="grid gap-3 md:grid-cols-3">
          {STACK.map((s, i) => (
            <motion.div key={s.title} {...enter(i)}>
              <Card className="h-full gap-3 p-5 shadow-none">
                <div className="flex items-center gap-2"><s.icon className="size-4 text-evidence" aria-hidden /><h3 className="text-sm font-semibold">{s.title}</h3></div>
                <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                  {s.items.map((t) => <li key={t} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />{t}</li>)}
                </ul>
              </Card>
            </motion.div>
          ))}
        </div>
        <Card className="gap-0 overflow-hidden p-0 shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">File</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Writes</th>
              </tr></thead>
              <tbody>
                {FILES.map(([f, r, o]) => (
                  <tr key={f} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-foreground">{f}</td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{r}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{o}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => openCase?.(0)} className="gap-2">See a caught case <ArrowRight className="size-4" aria-hidden /></Button>
          <Button variant="outline" onClick={() => go?.("score")}>Results</Button>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ id, n, title, sub }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border font-mono text-xs text-muted-foreground">{n}</span>
      <div>
        <h2 id={id} className="text-lg font-semibold">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Metric({ big, label, good }) {
  return (
    <div className="flex items-baseline gap-3 border-t pt-3 first-of-type:border-0">
      <span className={`min-w-[7.5rem] font-mono text-2xl font-semibold tnum ${good ? "text-[#8ee08e]" : ""}`}>{big}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{label}</span>
    </div>
  );
}

function Compare({ label, before, after, beforeTxt, afterTxt }) {
  const bar = (v, cls) => <div className="h-2.5 rounded-r bg-secondary"><div className={`h-full rounded-r ${cls} transition-[width] duration-700`} style={{ width: `${Math.max(1, v * 100)}%` }} /></div>;
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="text-[13px]">{label}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1">
        {bar(before, "bg-[#6f6e67]")}<span className="font-mono text-xs text-muted-foreground tnum">{beforeTxt}</span>
        {bar(after, "bg-good")}<span className="font-mono text-xs tnum">{afterTxt}</span>
      </div>
    </div>
  );
}
