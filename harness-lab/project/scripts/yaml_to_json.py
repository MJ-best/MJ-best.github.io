#!/usr/bin/env python3
"""data/procurement/ontology.yaml → ontology.json 동기화 (PyYAML 필요)."""
import json
import os
import yaml

here = os.path.join(os.path.dirname(__file__), "..", "data", "procurement")
data = yaml.safe_load(open(os.path.join(here, "ontology.yaml"), encoding="utf-8"))
with open(os.path.join(here, "ontology.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("ontology.json 갱신 완료")
