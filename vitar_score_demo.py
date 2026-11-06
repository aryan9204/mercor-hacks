"""Compute checker-v2 signals for the demo examples (full, random-masked, evidence-masked).

Uses the exact boxes in demo_examples/*/meta.json, so the scored images are the ones in that folder.
Run on Colab after uploading /content/demo_spec.json (list of {ds_index, question, gt, evidence_box_px, random_box_px}):
    (echo RUN_SCREEN=False; echo RUN_V2=False; cat vitar_abstention.py vitar_checker_v2.py vitar_score_demo.py) | colab exec -s vlm
Output: /content/results/demo_signals.csv. Apply the fitted checker with vitar_apply_checker.py.
"""
DEMO_STATE = {"done": 0, "finished": False, "error": None}


def run_demo():
    try:
        rows = []
        for s in json.load(open("/content/demo_spec.json")):
            img = ds[s["ds_index"]]["image"].convert("RGB")
            q, gt = s["question"], s["gt"]
            options = parse_options(q)
            letters = [L for L, _ in options]
            texts = [t for _, t in options]
            stem = stem_of(q)
            ab_q, ab = add_abstain_option(q, options)
            text_avg, _ = option_probs(stem, texts, None)
            inputs = {
                "full": (img, False),
                "rand": (mask_evidence(img, tuple(s["random_box_px"])), False),
                "evid": (mask_evidence(img, tuple(s["evidence_box_px"])), True),
            }
            for cond, (image, should_abstain) in inputs.items():
                row = {"ds_index": s["ds_index"], "question": q, "gt_idx": letters.index(gt),
                       "condition": cond, "should_abstain": should_abstain}
                row.update(signals(stem, texts, ab_q, letters, ab, gt, image, text_avg))
                row["correct"] = row["pred_idx"] == row["gt_idx"]
                rows.append(row)
            DEMO_STATE["done"] += 1
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rows).to_csv(OUT_DIR / "demo_signals.csv", index=False)
    except Exception:
        DEMO_STATE["error"] = traceback.format_exc()
    finally:
        DEMO_STATE["finished"] = True


threading.Thread(target=run_demo, daemon=True).start()
print("started demo scoring thread")
