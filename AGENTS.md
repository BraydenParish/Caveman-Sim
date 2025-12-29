# AGENTS Instructions
- Follow repository guardrails: tests-first, minimal diffs, no new dependencies without necessity, document citations and invariants.
- Keep changes small, focused, and well-commented where logic is non-obvious.
- Preferred commands: testing via `node tests/run-tests.js` (or similar if introduced), no additional tooling unless added intentionally.
- Avoid reformatting untouched lines; keep single-file HTML solution acceptable when applicable.
- Ensure determinism where relevant (seeded randomness) and include basic sanity checks.
