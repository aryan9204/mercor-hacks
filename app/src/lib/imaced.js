// Shared data + logic for every screen. Numbers come only from src/data/imaced.json
// (built by scripts/build_data.py from the repo's result files and demo_examples/).
import DATA from "@/data/imaced.json";

// Real images of the 8 demo cases, inlined as data URLs so the single-file build works from disk
// and WebGL can use them (browsers refuse file:// images as WebGL textures).
const IMGS = import.meta.glob("@/assets/demo8/*/*.jpg", { query: "?inline", import: "default", eager: true });
const imgFor = (id, view) => IMGS[Object.keys(IMGS).find((k) => k.endsWith(`/demo8/${id}/${view}.jpg`))] || null;

export { DATA };
export const CASES = DATA.demo8;                 // the 8 demo cases (demo_examples/), caught ones first
export const CHECKER_V2 = DATA.checker_v2;       // held-out test half, full / irrelevant / evidence inputs only
export const SUMMARY = DATA.core.summary;
export const MODEL = DATA.core.model;            // "Qwen/Qwen2.5-VL-7B-Instruct"
export const DATASET = DATA.core.dataset;

for (const c of CASES) for (const v of Object.keys(c.views)) c.views[v].img = imgFor(c.ds_index, v);

/** Demo case shown on the Overview (the breast-mass case), kept for the three.js hero. */
const d = CASES.find((c) => c.ds_index === 12834);
export const DEMO = {
  ...DATA.demo, size: d.img_size,
  images: { full: d.views.full.img, evid: d.views.evid.img, rand: d.views.rand.img },
};

export const VIEW_ORDER = ["full", "rand", "evid"];
export const VIEW_NAME = { full: "Full image", rand: "Irrelevant region masked", evid: "Evidence masked" };
export const VIEW_SUB = { full: "should answer", rand: "should answer", evid: "should abstain" };
export const GATES = [
  { id: "off", label: "Before", hint: "What Qwen does on its own: it always answers." },
  { id: "imaced", label: "Imaced check", hint: "The combined checker decides, per image, whether Qwen's answer is accepted or Qwen abstains." },
];

export const f2 = (x) => (x == null || Number.isNaN(+x) ? "–" : (+x).toFixed(2));
export const pct = (x) => (x == null || Number.isNaN(+x) ? "–" : `${Math.round(100 * x)}%`);
export const signed = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${f2(x)}`);
export const optText = (c, L) => (c.options.find(([l]) => l === L) || [])[1];

/** Does the Imaced check abstain on this image? */
export function gateAbstains(v, gate) {
  return gate === "imaced" && v?.checker === "abstain";
}

/**
 * Case verdict. caught = the check abstained on the evidence-masked image (shown with the catch symbol).
 * Before the check: "wrong" if Qwen's evidence-masked answer is wrong, else "answered".
 */
export function caseStatus(c, gate) {
  const ev = c.views.evid;
  if (gate === "imaced") return c.caught ? { tone: "good", key: "caught" } : { tone: "muted", key: "answered" };
  return ev.correct ? { tone: "warn", key: "answered_noev" } : { tone: "crit", key: "wrong" };
}

/** Case number, question, or any option text. */
export const matchesText = (c, q) => {
  q = (q || "").trim().toLowerCase();
  return !q || String(c.ds_index).includes(q) || c.question.toLowerCase().includes(q) ||
    c.options.some(([, t]) => t.toLowerCase().includes(q));
};

export const realImage = (c, view) => c.views[view]?.img || null;
export const CAUGHT_COUNT = CASES.filter((c) => c.caught).length;
