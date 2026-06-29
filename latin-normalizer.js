/* latin-normalizer.js
   Shared Latin-side preprocessing for en2ar.

   Purpose:
   - loose alias normalization
   - protected technical-symbol handling
   - vowel-run collapsing
*/

(() => {
  const {
    LATIN_NORMALIZER_POLICY
  } = window.MapperConstants;

  const {
    PROTECTED_MARK,
    PRESERVE_CAPS,
    PROTECT_SINGLE_LATIN_LETTER_NEAR_SYMBOLS
  } = LATIN_NORMALIZER_POLICY;

  const preserveCaps = new Set(PRESERVE_CAPS);
  const protectSymbols = new Set(PROTECT_SINGLE_LATIN_LETTER_NEAR_SYMBOLS);

  function isAsciiLetter(ch) {
    return !!ch && /^[A-Za-z]$/.test(ch);
  }

  function isLooseLatinVowelChar(ch) {
    return ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u" ||
           ch === "ā" || ch === "ī" || ch === "ū";
  }

  function collapseLatinVowelRuns(str) {
    let collapsed = "";
    for (let k = 0; k < str.length; ) {
      const ch = str[k];

      if (ch === PROTECTED_MARK) {
        collapsed += str[k] + str[k + 1];
        k += 2;
        continue;
      }

      if (ch === "a" || ch === "i" || ch === "u") {
        let j = k + 1;
        while (j < str.length && str[j] === ch) j++;

        const runLen = j - k;
        if (runLen >= 2) {
          const longVowel = ch === "a" ? "ā" : (ch === "i" ? "ī" : "ū");
          const longCount = Math.ceil(runLen / 2);
          collapsed += longVowel.repeat(longCount);
          k = j;
          continue;
        }
      }

      collapsed += ch;
      k += 1;
    }
    return collapsed;
  }

  function isProtectedSingleCharAt(pos, source) {
    const ch = source[pos];
    if (!isAsciiLetter(ch)) return false;
    if (source.length === 1) return false;

    const prev = source[pos - 1];
    const next = source[pos + 1];

    const prevBlocks = pos === 0 || /\s/.test(prev) || !isAsciiLetter(prev);
    const nextBlocks = pos === source.length - 1 || /\s/.test(next) || !isAsciiLetter(next);

    const prevProtectedSymbol = protectSymbols.has(prev);
    const nextProtectedSymbol = protectSymbols.has(next);

    return prevBlocks && nextBlocks && (prevProtectedSymbol || nextProtectedSymbol);
  }

  function normalizeInputForLooseAliases(str) {
    // Pass 1: lowercase ordinary capitals unless protected or house-style.
    let normalized = "";
    for (let k = 0; k < str.length; k++) {
      const ch = str[k];
      const isProtected = isProtectedSingleCharAt(k, str);

      if (ch >= "A" && ch <= "Z" && !preserveCaps.has(ch) && !isProtected) {
        normalized += ch.toLowerCase();
      } else {
        normalized += ch;
      }
    }

    let rewritten = "";

    for (let k = 0; k < normalized.length; k++) {
      const ch = normalized[k];
      const next = normalized[k + 1];
      const prev = normalized[k - 1];

      if (isProtectedSingleCharAt(k, normalized)) {
        rewritten += PROTECTED_MARK + ch;
        continue;
      }

      // Collapse raw loose-input vowel runs.
      if (ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u") {
        let j = k + 1;
        while (j < normalized.length && normalized[j] === ch) j++;

        const runLen = j - k;
        if (runLen >= 2) {
          let longVowel = ch;
          if (ch === "a") longVowel = "ā";
          else if (ch === "e" || ch === "i") longVowel = "ī";
          else if (ch === "o" || ch === "u") longVowel = "ū";

          const longCount = Math.ceil(runLen / 2);
          rewritten += longVowel.repeat(longCount);
          k = j - 1;
          continue;
        }
      }

      // Preserve runs of w as consonant material only.
      if (ch === "w") {
        let j = k + 1;
        while (j < normalized.length && normalized[j] === "w") j++;
        const runLen = j - k;
        if (runLen >= 2) {
          rewritten += "w".repeat(runLen);
          k = j - 1;
          continue;
        }
      }

      // Preserve / reinterpret runs of y.
      if (ch === "y") {
        let j = k + 1;
        while (j < normalized.length && normalized[j] === "y") j++;
        const runLen = j - k;

        if (runLen >= 2) {
          if (isAsciiLetter(prev) && !isLooseLatinVowelChar(prev)) {
            let pattern = "";
            for (let n = 0; n < runLen; n++) {
              pattern += (n % 2 === 0) ? "ī" : "y";
            }
            rewritten += pattern;
          } else {
            rewritten += "y".repeat(runLen);
          }
          k = j - 1;
          continue;
        }
      }

      // Preserve "ch" for token-table matching.
      if (ch === "c" && next === "h") {
        rewritten += "ch";
        k += 1;
        continue;
      }

      // x:
      // - standalone x -> iks
      // - word-start/boundary x -> s
      // - otherwise x -> x (later maps to كس)
      if (ch === "x") {
        const prevIsLetter = isAsciiLetter(prev);
        const nextIsLetter = isAsciiLetter(next);

        if (!prevIsLetter && !nextIsLetter) {
          rewritten += "iks";
        } else if (!prevIsLetter) {
          rewritten += "s";
        } else {
          rewritten += "x";
        }
        continue;
      }

      // c:
      // - preserve "ch" above
      // - before e/i/y or whitespace/end -> s
      // - otherwise -> k
      if (ch === "c") {
        if (next === "e" || next === "i" || next === "y" || next == null || /\s/.test(next)) {
          rewritten += "s";
        } else {
          rewritten += "k";
        }
        continue;
      }

      // Loose English short-vowel aliases
      if (ch === "e") {
        rewritten += "i";
        continue;
      }
      if (ch === "o") {
        rewritten += "u";
        continue;
      }

      // Loose English y:
      // after a consonant-like Latin letter, prefer vowel-like ī rather than consonantal j.
      if (ch === "y") {
        if (isAsciiLetter(prev) && !isLooseLatinVowelChar(prev)) {
          rewritten += "ī";
        } else {
          rewritten += "y";
        }
        continue;
      }

      rewritten += ch;
    }

    return collapseLatinVowelRuns(rewritten);
  }

  window.MapperLatinNormalizer = {
    normalizeInputForLooseAliases,
    collapseLatinVowelRuns,
    isAsciiLetter,
    isLooseLatinVowelChar
  };
})();
