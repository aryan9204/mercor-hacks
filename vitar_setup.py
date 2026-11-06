# Step 1 of the ViTAR-16K baseline: load the dataset and Qwen2.5-VL-7B on the Colab VM.
# Kernel state persists across `colab exec` calls, so vitar_baseline.py reuses `model`, `processor`, `subset`.
import random

import torch
import transformers
from datasets import load_dataset
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

print("transformers", transformers.__version__, "| GPU:", torch.cuda.get_device_name(0))

MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
N_EXAMPLES = 20

# ViTAR-16K: medical multiple-choice VQA. Fields: image (PIL), question (options inline), answer (letter), bbox.
ds = load_dataset("jline/ViTAR-16K", split="train")
print(ds)

# Same sampling approach as the GQA notebook: fixed seed, random subset.
random.seed(0)
idx = random.sample(range(len(ds)), N_EXAMPLES)
subset = ds.select(idx)

model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto"
)
model.eval()
processor = AutoProcessor.from_pretrained(MODEL_ID)
print("model loaded")
