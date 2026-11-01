You are writing ONE project entry for a Korean developer portfolio (https://mj-best.github.io). The project's source code is in the current directory. Read the actual code — not only the README — before writing.

Project: {{NAME}}
Visibility: {{VISIBILITY}}
GitHub description: {{DESCRIPTION}}
Demo URL (may be empty): {{DEMO}}

Write a single JSON object to the file `.portfolio_entry.json` in the current directory, and nothing else. Create it directly with the Write tool. Do NOT write or run helper scripts, and do not write files anywhere else — only Read/Glob/Grep to study the code and Write/Edit for `.portfolio_entry.json` are allowed. For the snippet, copy the lines exactly as they appear in the file you read. All text in natural, concise Korean, ending sentences consistently with "~합니다", no marketing fluff, no emoji.

Keys:
- "id": short kebab-case id (e.g. "night-sky")
- "slug": same as id
- "title": product name as the project calls itself (Korean or English)
- "cat": one of {{CATEGORIES}}
- "pattern": one of {{PATTERNS}} — how it runs: static = static page only; actions-build = GitHub Actions builds/deploys it; actions-backend = GitHub Actions runs it on a schedule and commits results; external-backend = uses Firebase/Supabase/etc.; local-server = runs on the user's own computer/device
- "platform": short, e.g. "Web", "Android", "Web (PWA)", "macOS · Android"
- "summary": one sentence — what it is and who it is for
- "problem": 1–2 sentences — the problem it solves
- "features": 3–5 short strings
- "stack": array of short tech labels actually used
- "flow": 4–6 steps of the real logic/data flow; each {"title": short, "detail": one sentence, "file": path relative to the repo root}
- "hard_part": 1–2 sentences — the trickiest technical part and how it is handled
- "numbers": 2–3 concrete countable facts you verified yourself from code/data (count them)
- "backend": one sentence — where it runs and what serves as its backend
- "arch": {"nodes": [{"id","label","sub"}] (4–6 nodes, label ≤ 14 chars), "edges": [{"from","to","label"}]}
{{SNIPPET_RULE}}

{{PRIVACY_RULE}}

Validate the file with `python3 -c "import json;json.load(open('.portfolio_entry.json'))"` before finishing.
