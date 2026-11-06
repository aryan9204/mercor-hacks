"""Collect every result the UI shows into app/src/data/imaced.json, and copy the demo images.

    python app/scripts/build_data.py        (run from the repo root, or `npm run data` inside app/)

Sources (all produced by the repo's own scripts; nothing is computed here except the split, which
repeats vitar_calibrate.py exactly):
  site/cases.json                      15 core cases + imaced_summary (imaced_verify.py)
  results/checker/checker_report.json  300-question checker: C + G rules, calib/test (vitar_calibrate.py)
  results/checker/abstention_counts_*.csv  counts per input (vitar_abstention_counts.py)
  results/checker/checker_rows.csv     per-case C, G, predictions
  demo_assets/vitar_12834/*            real images of the demo case
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
out = {}

core = json.loads((ROOT / "site" / "cases.json").read_text(encoding="utf-8"))
out["core"] = core

ck = ROOT / "results" / "checker"
out["checker"] = {
    "report": json.loads((ck / "checker_report.json").read_text()),
    "counts_all": pd.read_csv(ck / "abstention_counts_all.csv").to_dict(orient="records"),
    "counts_test": pd.read_csv(ck / "abstention_counts_test.csv").to_dict(orient="records"),
}

rows = pd.read_csv(ck / "checker_rows.csv")
out["checker"]["screen"] = {"n_candidates": int(len(rows)), "n_kept": int(rows["kept"].sum()),
                            "reject_counts": rows["reject"].fillna("kept").value_counts().to_dict()}
kept = rows[rows["kept"] == True].copy()  # noqa: E712
for c in ("full", "evid", "rand"):
    kept[f"{c}_G"] = kept[f"{c}_G"].fillna(0.0)          # same convention as vitar_calibrate.py
groups = np.array(sorted(kept["image_group"].unique()), dtype=object)
rng = np.random.default_rng(0)
rng.shuffle(groups)
calib = set(groups[: len(groups) // 2])
kept["split"] = np.where(kept["image_group"].isin(calib), "calib", "test")
assert (kept["split"] == "calib").sum() == out["checker"]["report"]["n_examples"]["calib"], "split mismatch"
pts = []
for _, r in kept.iterrows():
    p = {"ds_index": int(r["ds_index"]), "split": r["split"], "gt": r["gt"], "question": r["question"]}
    for c in ("full", "evid", "rand"):
        p[c] = {"pred": r[f"{c}_pred"], "C": round(float(r[f"{c}_C"]), 4), "G": round(float(r[f"{c}_G"]), 4)}
    pts.append(p)
out["checker"]["points"] = pts

demo_src = ROOT / "demo_assets" / "vitar_12834"
demo_dst = APP / "src" / "assets" / "demo"
demo_dst.mkdir(parents=True, exist_ok=True)
for name in ("full", "evidence_masked", "random_masked"):
    im = Image.open(demo_src / f"{name}.png").convert("RGB")
    im.save(demo_dst / f"{name}.jpg", quality=88)   # inlined into the bundle by src/lib/imaced.js
out["demo"] = json.loads((demo_src / "meta.json").read_text())
out["demo"]["images"] = {"full": "demo/12834/full.jpg", "evid": "demo/12834/evidence_masked.jpg",
                         "rand": "demo/12834/random_masked.jpg"}
out["demo"]["size"] = list(Image.open(demo_src / "full.png").size)

# ---------------------------------------------------------------------------------------------
# The 8 demo cases (demo_examples/), real images, and the Imaced checker decision per image.
# ---------------------------------------------------------------------------------------------
# Checker decisions per case and image: supplied by the team from their run of the combined checker
# (v2) on these 8 examples (not yet in the repo's results files). "answer" / "abstain".
CHECKER_DECISIONS = {
    10282: {"full": "answer", "rand": "answer", "evid": "abstain"},
    11695: {"full": "answer", "rand": "answer", "evid": "abstain"},
    13407: {"full": "answer", "rand": "answer", "evid": "abstain"},
    7414:  {"full": "answer", "rand": "abstain", "evid": "abstain"},
    12834: {"full": "answer", "rand": "answer", "evid": "answer"},
    13907: {"full": "abstain", "rand": "abstain", "evid": "answer"},
    14748: {"full": "answer", "rand": "answer", "evid": "answer"},
    5088:  {"full": "answer", "rand": "answer", "evid": "answer"},
}
ORDER = [11695, 10282, 13407, 7414, 12834, 13907, 14748, 5088]   # caught cases first
KEY = {"full": "full", "evid": "evidence_masked", "rand": "random_masked"}
core_by_id = {c["ds_index"]: c for c in core["cases"]}
img_root = APP / "src" / "assets" / "demo8"
demo8 = []
for i in ORDER:
    src = ROOT / "demo_examples" / f"vitar_{i}"
    m = json.loads((src / "meta.json").read_text())
    r = m["results"]
    opts = [(mm.group(1), mm.group(2).strip()) for mm in
            __import__("re").finditer(r"\b([A-F])\)\s*(.*?)(?=\s*\b[A-F]\)|$)", m["question"], __import__("re").S)]
    otext = dict(opts)
    (img_root / str(i)).mkdir(parents=True, exist_ok=True)
    size = list(Image.open(src / "full.png").size)
    for v, name in KEY.items():
        Image.open(src / f"{name}.png").convert("RGB").save(img_root / str(i) / f"{v}.jpg", quality=90)
    full_lp = r["full"]["logp_gt_raw"]
    views = {}
    for v, name in KEY.items():
        a, ab = r[name], r[f"{name}_with_abstain_option"]
        views[v] = {
            "pred": a["pred"], "pred_text": otext.get(a["pred"]), "conf": a["conf"], "correct": a["pred"] == m["gt"],
            "probs": a["letter_probs_renorm"], "ab_probs": ab["letter_probs_renorm"], "ab_pred": ab["pred"],
            "p_abstain": ab["p_abstain"], "d_logp_gt": round(a["logp_gt_raw"] - full_lp, 4),
            "checker": CHECKER_DECISIONS[i][v], "should_abstain": v == "evid",
        }
    q_only = r["question_only"]
    cc = core_by_id.get(i, {})
    demo8.append({
        "ds_index": i, "question": m["question"].split(" A)")[0], "options": opts, "gt": m["gt"], "gt_text": otext.get(m["gt"]),
        "abstain_letter": r["full_with_abstain_option"]["abstain_letter"],
        "box_norm": m["evidence_box_norm"], "box_px": m["evidence_box_px"], "rand_box_px": m["random_box_px"],
        "img_size": size, "views": views,
        "blind": {"pred": q_only["pred"], "pred_text": otext.get(q_only["pred"]), "conf": q_only["conf"],
                  "probs": q_only["letter_probs_renorm"], "logp_gt": q_only["logp_gt_raw"]},
        "full_logp_gt": full_lp,
        "caught": CHECKER_DECISIONS[i]["evid"] == "abstain",
        "grounded": cc.get("grounded"),
    })
out["demo8"] = demo8

# Checker v2, held-out test half, restricted to the three inputs shown in the UI.
dec = pd.read_csv(ROOT / "results" / "checker_v2" / "checker_v2_test_decisions.csv")
dec = dec[dec["condition"].isin(["full", "rand", "evid"])]
rep2 = json.loads((ROOT / "results" / "checker_v2" / "checker_v2_report.json").read_text())
rules = ["never", "option", "confidence", "order-averaged confidence", "combined"]
v2 = {"n_questions_test": int(dec["ds_index"].nunique()), "rules": {}, "coefficients": rep2["logreg_coefficients_standardized"],
      "threshold_combined": rep2["thresholds"]["combined"], "mean_signals": {k: rep2["mean_signals_test"][k] for k in ("full", "rand", "evid")}}
for rule in rules:
    col = f"abstain_{rule}"
    e = dec[dec.condition == "evid"]
    ans = dec[dec.condition.isin(["full", "rand"])]
    acc = ans[~ans[col]]
    v2["rules"][rule] = {
        "abstain": {c: float(dec.loc[dec.condition == c, col].mean()) for c in ("full", "rand", "evid")},
        "ci95": {c: rep2["test"][rule]["ci95"].get(f"abstain[{c}]") for c in ("full", "rand", "evid")},
        "evid_wrong": int((~e["correct"]).sum()), "evid_wrong_caught": int(((~e["correct"]) & e[col]).sum()),
        "accepted_accuracy_answerable": float(acc["correct"].mean()) if len(acc) else None,
        "coverage_answerable": float(len(acc) / len(ans)),
    }
v2["reasons_evid"] = dec[(dec.condition == "evid") & dec["abstain_combined"]]["main_reason"].value_counts().to_dict()
out["checker_v2"] = v2

dst = APP / "src" / "data" / "imaced.json"
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(out, default=float), encoding="utf-8")
print("wrote", dst, "| core cases", len(core["cases"]), "| checker points", len(pts), "| demo size", out["demo"]["size"])
