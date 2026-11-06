"""Calibrate and evaluate the abstention checker on the rows from vitar_checker.py.

    python vitar_calibrate.py [checker_rows.csv] [out_dir]

Labels come for free from the masking setup:
  full image (evidence present)       -> should answer
  evidence removed (lesion grayed)    -> should abstain
  random region removed (control)     -> should answer

Rules compared:
  confidence only      abstain if C < tau_C
  confidence+grounding abstain if C < tau_C or G < tau_G
  abstain option       abstain if the model picks "Cannot be determined from the image"
  never abstain        what the model does today

Thresholds are grid-searched on a calibration split (split by image, so the same image never lands in
both halves) to maximize abstention on evidence-removed inputs subject to <= MAX_FALSE_ABSTAIN on full
images. Everything is reported on the held-out test split. A missing G (pointing failed to parse)
counts as G = 0: no evidence the answer was grounded.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

MAX_FALSE_ABSTAIN = 0.10
SEED = 0

rows_path = Path(sys.argv[1] if len(sys.argv) > 1 else "results/checker/checker_rows.csv")
out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else rows_path.parent)

df = pd.read_csv(rows_path)
df = df[df["kept"] == True].copy()  # noqa: E712  (correct on the full image, valid boxes)
for c in ("full", "evid", "rand"):
    df[f"{c}_G"] = df[f"{c}_G"].fillna(0.0)

# Split by image so near-duplicate questions about one image can't leak across the split.
groups = np.array(sorted(df["image_group"].unique()), dtype=object)
rng = np.random.default_rng(SEED)
rng.shuffle(groups)
calib_groups = set(groups[: len(groups) // 2])
df["split"] = np.where(df["image_group"].isin(calib_groups), "calib", "test")


def abstains(d, cond, tau_c, tau_g):
    return (d[f"{cond}_C"] < tau_c) | (d[f"{cond}_G"] < tau_g)


def rates(d, rule):
    """rule(d, cond) -> boolean Series of abstentions."""
    return {
        "abstain_on_evidence_removed": float(rule(d, "evid").mean()),
        "false_abstain_full": float(rule(d, "full").mean()),
        "false_abstain_random_masked": float(rule(d, "rand").mean()),
        "answered_wrong_on_evidence_removed": float(((~rule(d, "evid")) & (d["evid_pred"] != d["gt"])).mean()),
    }


def calibrate(d, use_g):
    """Best (tau_C, tau_G) on d: max abstention on evid with false abstention on full <= MAX_FALSE_ABSTAIN."""
    c_grid = np.unique(np.r_[0.0, d[["full_C", "evid_C"]].values.ravel()])
    g_grid = np.unique(np.r_[-np.inf, d[["full_G", "evid_G"]].values.ravel()]) if use_g else np.array([-np.inf])
    best = None
    for tc in c_grid:
        for tg in g_grid:
            fa = abstains(d, "full", tc, tg).mean()
            if fa > MAX_FALSE_ABSTAIN:
                continue
            key = (abstains(d, "evid", tc, tg).mean(), -fa)  # ties: fewer false abstentions
            if best is None or key > best[0]:
                best = (key, tc, tg)
    return float(best[1]), float(best[2])


calib, test = df[df["split"] == "calib"], df[df["split"] == "test"]
tc_only, _ = calibrate(calib, use_g=False)
tc_both, tg_both = calibrate(calib, use_g=True)

rules = {
    "never_abstain (model today)": lambda d, c: pd.Series(False, index=d.index),
    "abstain_option": lambda d, c: d[f"{c}_ab_pred"] == d["abstain_letter"],
    f"confidence_only (tau_C={tc_only:.3f})": lambda d, c: abstains(d, c, tc_only, -np.inf),
    f"confidence+grounding (tau_C={tc_both:.3f}, tau_G={tg_both:.3f})": lambda d, c: abstains(d, c, tc_both, tg_both),
}
report = {
    "n_examples": {"calib": int(len(calib)), "test": int(len(test)),
                   "images_calib": int(calib["image_group"].nunique()), "images_test": int(test["image_group"].nunique())},
    "max_false_abstain_constraint": MAX_FALSE_ABSTAIN,
    "pointing": {
        "parse_failure_rate": float(pd.read_csv(rows_path).query("kept == True")["full_pointed_box"].isin(["null"]).mean()),
        "median_pointed_area_frac_full": float(df["full_pointed_frac"].median()),
        "median_iou_with_annotated_box": float(df["full_point_iou_gt"].median()),
    },
    "mean_signals": {c: {"C": float(df[f"{c}_C"].mean()), "G": float(df[f"{c}_G"].mean())} for c in ("full", "evid", "rand")},
    "test": {name: rates(test, rule) for name, rule in rules.items()},
    "calib": {name: rates(calib, rule) for name, rule in rules.items()},
}
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / "checker_report.json").write_text(json.dumps(report, indent=2))

print(json.dumps({k: report[k] for k in ("n_examples", "pointing", "mean_signals")}, indent=1))
table = pd.DataFrame(report["test"]).T.round(3)
print("\nTEST SPLIT\n" + table.to_string())
table.to_csv(out_dir / "checker_test_table.csv")
