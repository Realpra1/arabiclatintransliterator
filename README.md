To run and use the project simply download ALL the files to one folder and open the file "ArabicEnglishAlphabetTranslator.html".
It will run offline in your browser.

It will not work if you don't get the javascript files too.

See the alphabet file for the mapping definitions.

Alif followed by fathatan (`اً`) maps to `āN` in both directions. Plain fathatan
(`ً`) remains `aN`; tanwin before alif (`ًا`) retains its separate `aNā` encoding.
For example, `shukrāN` converts to `شُكراً` and back.

Loose English vowel-like `y` normalizes to short `i`: `city → سِتِ → siti`.
Consonantal `y` still returns canonical `j`, for example `ya → يَ → ja`.
Technical-symbol protection recognizes `ā`, `ī`, `ū`, and `á` as word letters,
so `/bī` becomes `/بِي` instead of leaving a Latin `b` in the Arabic output.
Letter runs of any length immediately touching ASCII digits are now protected
before case folding or alias normalization: `H2O`, `CO2`, `m1`, and `KU2` stay
intact. This also preserves ordinary words such as `cat2` and `sīzjūm133`.
Spaces or an en dash separate words from the number; a plain `-` still maps to ع.
Parentheses alone do not protect multi-letter words.

The redesigned offline interface includes the original `ArabicLatinKey.png`
reference near the top. Keep that image, `app.css`, and all JavaScript files
beside the HTML file. The output remains selectable and copies as plain text.
Its legend explains green protected text, yellow runs of three or more consonants
in Arabic-to-Latin output, and red unmapped passthrough. Warnings and errors appear
below the legend and its explanation. Sparse Arabic diacritics trigger a warning;
the converter does not infer missing vowels. The warning is a heuristic, not a
grammatical or spelling judgment.

`at` maps to ة only at the end of a word, optionally followed by short vowels
(`a/i/u/e/o`), tanwin (`aN/iN/uN`), or combining diacritic marks. Internal `at`
is read as separate `a` and `t` tokens, with no added alif carrier. The following
`t` can still join `th` or `tt`. Ain and hamza continue the word; punctuation
and whitespace end it.

One notation toggle enables `v/j → w/y` and `H/S/D/T/Z/J → ḥ/ṣ/ḍ/ṭ/ẓ/j` in both
directions. Tanwin `N` becomes `ṇ` in standard mode (`buN ↔ buṇ`), while
ordinary ن remains `n`. Standard mode writes ع as `ʿ`, while MCB mode keeps `-`.
Hamza keeps its existing apostrophe (`'`) mapping in both modes. MCB mode keeps uppercase `N`. The `á` and existing
short/long-vowel encodings remain unchanged,
so this is an alternate spelling mode rather than full compliance with a
particular academic romanization standard. Protected symbols are preserved.
Unprotected English `y` in this mode is read as a consonant; switch back to
MCB mode for loose English aliases such as `city → siti`.

MCBs-Compact-Laser is a custom single stroke font optimized for etching dense text with a laser.
It maximizes readability and compactness.

Regression tests run on Node.js 20 or newer, with no packages to install:

```sh
node --test tests/*.test.mjs
```

If npm is installed, `npm test` runs the same command. GitHub Actions runs the
suite on Node 20, 22, and 24 for pushes and pull requests.

The saved expectations include the accepted `اً ↔ āN` mapping. Known round-trip
stability failures remain enabled for later fixes, so the full suite currently
fails on those checks. Run only the mapping and public API checks with:

```sh
node --test tests/contract.test.mjs tests/regression.test.mjs tests/alif-tanwin.test.mjs tests/y-consonant.test.mjs tests/loose-y-protection.test.mjs tests/digit-protection.test.mjs tests/terminal-at.test.mjs tests/view.test.mjs
```

The tests execute the actual browser JavaScript in an isolated `window`. Saved
input/output mappings cover Arabic, Latin transliteration, ordinary English,
diacritics, hamza, shadda, weak letters, aliases, case, whitespace, Unicode,
punctuation, and formulas. Each transliteration case checks the forward result,
the return trip, and a second forward conversion against fixed expected strings.
The normalizer also has its own saved mappings. Tests never regenerate fixtures.

Additional inputs in `tests/additional-corpus.mjs` include everyday Arabic and
Latin phrases, English, `satasma-` alone and in context, continuous multi-paragraph
text, ambiguous digraphs, malformed/reordered diacritics, Unicode presentation
forms, invisible characters, mixed scripts, and symbol/word boundaries. Random
paragraphs and nonsense strings use a fixed seed, with their exact inputs and
outputs saved in the fixtures. These tests detect behavior changes regardless of
whether the current output is linguistically correct.
Individual English words such as `city`, `xylophone`, `cat`, `cancer`, `school`,
and `cycle` also have saved English → Arabic → Latin → Arabic results, alongside
capitalization, punctuation, and sentence-context variants.

The complete supplied passage is saved in `tests/fixtures/civilization.latin.txt`.
Its originally supplied Arabic is in `tests/fixtures/civilization.supplied-arabic.txt`.
The original program produced this Arabic exactly, including its mixed Latin
characters; both original inputs remain unchanged. Its current return trip is
saved in `tests/fixtures/civilization-latin.roundTrip.txt`. These are behavior
baselines, not a claim that every round trip recovers the original spelling.
Paragraphs, lines, and individual words are covered separately to locate failures.
All passage text files include one final newline, which is tested as part of the input.

`tests/fixtures/civilization.canonical-latin.txt` contains the corrected passage:
`yuSab` becomes `juSab` and `alyāf` becomes `aljāf`. The originally pasted versions
remain as historical regression inputs. The corrected text is also tested as one
complete document, with separately saved outputs. Consonantal loose-input `y`
must return canonical `j`; dedicated tests protect that behavior.
An independent whole-document contract compares this corrected Latin passage
with `tests/fixtures/civilization.accepted-arabic.txt`. That reviewed expectation
includes the corrected `aljāf` spelling and 17 word-fragment repairs where the
protector previously leaked Latin consonants. It is never regenerated by the
baseline capture script.
The accepted reference also includes the digit-protection changes: `CO2`,
`sīzjūm133`, and `m1`/`m2` are preserved in the full passage.

`experiments/y-protector.json` records the comparison before and after the short
`y` and protector changes, separately and together. Of the same 11,022 stability
checks, failures change from 572 to 573: five checks improve and six newly fail.
The protector exposes existing waw ambiguity in two random inputs; for example,
`+wvat` now returns `+vūat`, then `+ūūat`, instead of preserving a raw Latin `v`.
Repeated `y` input accounts for the other two newly failing checks. These failures
remain enabled. All three complete document inputs still pass stability checks.

The digit-protection comparison is in `experiments/digit-single-protection.json`:
31 regression cases change, with no new stability failures. The applied behavior
has dedicated fixed tests in `tests/digit-protection.test.mjs`.

The view tests verify that diagnostics never alter default conversion output
for the whole corpus. Notation stability is tested in both directions from
the same Arabic seeds, including Arabic generated from every Latin case. This
isolates notation from English alias interpretation. Existing stability failures
remain visible; the test rejects additional failures from changing notation.
Run `node scripts/report-notation-stability.mjs` for the separate report.

Optional browser checks use `playwright-core` and a local Chromium executable:

```sh
node scripts/check-browser.cjs
```

Set `PLAYWRIGHT_CORE_PATH` and `CHROMIUM_PATH` if those are installed elsewhere.
These checks cover desktop/mobile layout, loading the key, full-passage output,
notation reversal, highlighting, HTML-safe rendering, and copy/conversion errors.

Round-trip stability checks run for every corpus input, all complete passages,
and additional normalizer/tanwin inputs. They compare exact strings independently
of saved mappings:

- Latin input: `L1 → A1 → L2 → A2 → L3 → A3`, requiring `L2 === L3` and `A2 === A3`.
- Arabic input: `A1 → L1 → A2 → L2 → A3 → L3`, requiring `L2 === L3` and `A2 === A3`. The original Latin conversion `L1` need not equal `L2`.

Both Latin and Arabic stability comparisons remain enabled: 575 failing assertions
across 385 inputs out of 11,022 checks. The terminal `at`
change adds two Arabic-start `A2 === A3` failures to the previous 573; the Latin
`L2 === L3` comparisons still pass in those two cases. See
`experiments/terminal-at-accepted.json` for the current counts and comparison.

Run just these checks with `node --test tests/roundtrip-stability.test.mjs`.
Run `node scripts/report-roundtrip-stability.mjs` to write every failure's full
conversion sequence to `experiments/roundtrip-stability.json`. Both commands
exit unsuccessfully when stability violations exist. These are requirements,
so baseline updates cannot make them pass while the conversion remains unstable.

To measure eventual convergence, run `node scripts/report-convergence.mjs`.
It follows every input until it repeats in the same script, distinguishing a
stable result from a longer repeating cycle. The default limit is 200 round
trips, configurable with a numeric argument. The report in
`experiments/convergence.json` includes the longest traces and separate probes
with longer vowel runs. Results apply to the tested inputs; hitting a limit is
reported as inconclusive.

`tests/fixtures/baseline.json` records the checkout's base commit, actual source
hashes, and whether those sources match the commit. The original pre-`āN`
metadata is retained in `experiments/alif-tanwin.original-baseline.json`.
Existing quirks are intentionally preserved. When
changing behavior, review failing mappings before changing their expectations.
For an intentional baseline replacement, run:

```sh
node scripts/capture-baseline.mjs --accept-current-behavior
```

This overwrites generated expectations, so review every fixture diff before
accepting it. It does not overwrite either user-supplied passage or the independent
alphabet contracts. Do not use it just to silence test failures.

To collect coverage:

```sh
node --test --experimental-test-coverage tests/*.test.mjs
```

To verify that the tests catch deliberately broken mappings in both directions
and in English normalization, run `node scripts/check-test-sensitivity.mjs`.
It runs each mutation in a temporary copy and requires assertion failures; it
never changes the working project's code or fixtures.


Large JSON fixtures and experiment reports use a small JSON index plus sibling
`*.parts/` directories. Modules keep corpus groups together where available and
are capped at 500 lines (the writer targets 450). To read the original logical
JSON value, use `readJsonArtifact(path)` from `scripts/lib/json-artifacts.mjs`;
`writeJsonArtifact(path, value)` writes the same structure and removes stale
modules. Module paths resolve relative to the index directory. Text fixtures,
including the complete supplied passages, are kept byte-for-byte.

`node scripts/split-json-data.mjs` splits oversized JSON artifacts without changing
their values. All baseline/report writers use the shared writer. Run
`node scripts/check-file-length.mjs` to audit every non-ignored text file; CI also
checks the 500-line limit. The browser app does not load these data modules.

`node scripts/report-failure-kinds.mjs` classifies current failing inputs by corpus
origin. The current failures include 21 curated natural-Arabic cases (three
standalone words, 14 everyday phrases, and four continuous-text inputs), all
failing only the Arabic `A2 === A3` comparison. Another 99 failing cases are
random arrangements of real Arabic words. These are input-case counts, not
unique dictionary words or independent linguistic defects. See
`experiments/failure-kinds.json` for the examples and full category breakdown.
