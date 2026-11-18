# Deferred transliteration standard work

## Round-trip stability

The user deferred resolving the transliteration standard on 2026-11-18 and
authorized making only its currently passing tests binding. The baseline at
`75787f765219577e91356fb4fed459ec1cfff4bd` has 31,204 passing tests and 575
failing round-trip assertions across 385 inputs. All failures come from
`tests/roundtrip-stability.test.mjs`; the other tests pass.

`tests/fixtures/deferred-stability.json` lists those exact input IDs, input
SHA-256 hashes, and failing comparisons (`L2` or `A2`). Only those comparisons
are marked TODO. They still execute the original assertions and print failures,
but do not fail the normal test command or CI. Passing comparisons on the same
inputs remain binding, as do all other existing and new tests. Nothing is
automatically deferred based on current results. No mappings or saved expected
outputs were changed.

Next: review the ambiguous mappings and multi-pass conversion traces carefully,
agree on the intended standard, then fix and test each case. Remove its entry
or comparison from the TODO list when resolved so that it becomes binding.
Do not regenerate this list to accommodate regressions. Changes to a deferred
input require explicit review; the manifest integrity test rejects stale hashes.

For strict diagnostics, run `node scripts/report-roundtrip-stability.mjs`.
It still exits unsuccessfully for any instability, including TODO cases, and
writes full traces to `experiments/roundtrip-stability.json`. The existing
convergence and failure-kind reports can help investigate the underlying rules.

Reference check: inspected the README's mapping/stability design, the original
round-trip test and helpers, and the reporting and test-sensitivity scripts at
the revision above. The prior repository wiki lookup found no accessible wiki.
Reuse the existing exact comparisons and strict report; use Node's TODO test
status for the explicitly approved backlog rather than changing assertions.
