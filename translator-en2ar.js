/* translator-en2ar.js
   English -> Arabic transliteration only.
*/

(() => {
  const {
    DIACRITICS,
    EN_TO_AR_TOKENS,
    LATIN_NORMALIZER_POLICY
  } = window.MapperConstants;

  const {
    lastNonDiacriticChar,
    lastEmittedVowelDiacritic,
    isArabicDiacritic,
    isArabicBaseLetter,
    isArabicPrefixBoundaryBase,
    isLatinBoundaryChar
  } = window.MapperTranslatorCoreUtils;

  const { normalizeInputForLooseAliases } = window.MapperLatinNormalizer;

  const {
    FATHA, KASRA, DAMMA,
    SUKUN, SHADDA
  } = DIACRITICS;

  const { PROTECTED_MARK } = LATIN_NORMALIZER_POLICY;

  function en2ar(input) {
    let out = "";
    let i = 0;

    input = normalizeInputForLooseAliases(input);

    function matchTokenAt(pos) {
      for (const [tok, ar] of EN_TO_AR_TOKENS) {
        if (input.startsWith(tok, pos)) return { tok, ar };
      }
      return null;
    }

    function isShaddaEligible(tok) {
      if (["a", "i", "e", "u", "o", "ā", "ī", "ū", "aN", "iN", "uN", "at"].includes(tok)) return false;
      return true;
    }

    function dropTrailingSukunIfPresent() {
      if (out.endsWith(SUKUN)) out = out.slice(0, -1);
    }

    function tryEmitSukunEncodedShadda(m1, m2) {
      if (!m2) return false;
      if (m2.tok !== m1.tok) return false;

      const ar = m1.ar;
      if (!ar || ar.length !== 2) return false;
      if (ar[1] !== SUKUN) return false;

      const base = ar[0];
      if (isArabicDiacritic(base)) return false;

      out += base + SHADDA;
      i += m1.tok.length * 2;
      return true;
    }

    function canonicalHamzaVowelClass(tok) {
      if (tok === "a" || tok === "ā" || tok === "aN") return "a";
      if (tok === "i" || tok === "e" || tok === "ī" || tok === "iN") return "i";
      if (tok === "u" || tok === "o" || tok === "ū" || tok === "uN") return "u";
      return null;
    }

    function peekNextVowelToken(pos) {
      const m = matchTokenAt(pos);
      if (!m) return null;
      return canonicalHamzaVowelClass(m.tok);
    }

    function lastVowelTokenBefore(pos) {
      for (let p = pos - 1; p >= 0; p--) {
        const ch = input[p];
        if (isLatinBoundaryChar(ch)) break;

        if (input.startsWith("aN", p)) return "a";
        if (input.startsWith("iN", p)) return "i";
        if (input.startsWith("uN", p)) return "u";

        if (input.startsWith("ā", p)) return "ā";
        if (input.startsWith("ī", p)) return "ī";
        if (input.startsWith("ū", p)) return "ū";

        if (input.startsWith("a", p)) return "a";
        if (input.startsWith("i", p)) return "i";
        if (input.startsWith("e", p)) return "i";
        if (input.startsWith("u", p)) return "u";
        if (input.startsWith("o", p)) return "u";
      }
      return null;
    }

    function chooseHamzaSeat(prevVowel, nextVowel, boundaryLike) {
      if (!prevVowel && !nextVowel) return boundaryLike ? "أ" : "ء";

      const isI = (v) => v === "i" || v === "ī";
      const isU = (v) => v === "u" || v === "ū";
      const isA = (v) => v === "a" || v === "ā";

      if (prevVowel === "ā" && isI(nextVowel)) return "ء";

      if (isI(prevVowel) || isI(nextVowel)) return "ئ";
      if (isU(prevVowel) || isU(nextVowel)) return "ؤ";

      if (isA(prevVowel) || isA(nextVowel)) return nextVowel ? "أ" : "ء";

      return "ء";
    }

    function emitHamzaWithSeat(posAfterHamzaToken) {
      const prevOutBase = lastNonDiacriticChar(out);
      const boundaryLike = isArabicPrefixBoundaryBase(prevOutBase);

      const nextVowel = peekNextVowelToken(posAfterHamzaToken);
      const prevVowel = lastVowelTokenBefore(i);

      if (boundaryLike) {
        if (nextVowel === "i" || nextVowel === "ī") {
          out += "إ";
          return;
        }
        out += "أ";
        return;
      }

      const lastVowelMark = lastEmittedVowelDiacritic(out);
      if (lastVowelMark === KASRA) { out += "ئ"; return; }
      if (lastVowelMark === DAMMA) { out += "ؤ"; return; }
      if (lastVowelMark === FATHA) {
        if (prevVowel === "ā" && (nextVowel === "i" || nextVowel === "ī")) {
          out += "ء";
          return;
        }

        if (nextVowel === "i" || nextVowel === "ī") { out += "ئ"; return; }
        if (nextVowel === "u" || nextVowel === "ū") { out += "ؤ"; return; }
        out += nextVowel ? "ء" : "أ";
        return;
      }

      out += chooseHamzaSeat(prevVowel, nextVowel, boundaryLike);
    }

    function emitShortVowelToken(tok) {
      const prev = lastNonDiacriticChar(out);

      if (isArabicBaseLetter(prev)) {
        dropTrailingSukunIfPresent();
        if (tok === "a") out += FATHA;
        else if (tok === "i" || tok === "e") out += KASRA;
        else out += DAMMA;
        return;
      }

      // bare initial short vowels
      if (tok === "a") out += "ا" + FATHA;
      else if (tok === "i" || tok === "e") out += "إ" + KASRA;
      else out += "أ" + DAMMA;
    }

    function tryEmitMaddah(m1, m2, posAfterSecond) {
      if (!m2) return false;
      if (m1.tok !== "'" && m1.tok !== "ʾ") return false;
      if (m2.tok !== "ā") return false;

      const prevOutBase = lastNonDiacriticChar(out);
      const boundaryLike = isArabicPrefixBoundaryBase(prevOutBase);

      // Conservative rule:
      // collapse 'ā -> آ only at a true boundary/start-like position.
      if (!boundaryLike) return false;

      if (isLatinBoundaryChar(input[posAfterSecond])) {
        out += "آ";
        i += (m1.tok.length + m2.tok.length);
        return true;
      }

      const vowelAfter = peekNextVowelToken(posAfterSecond);
      if (vowelAfter) return false;

      out += "آ";
      i += (m1.tok.length + m2.tok.length);
      return true;
    }

    function nextTokenCountsAsVowelForInitialWaw(nextTok) {
      if (!nextTok) return false;

      if (canonicalHamzaVowelClass(nextTok.tok)) return true;
      if (nextTok.tok === "'" || nextTok.tok === "ʾ") return true;

      // Important: do not change at->ة behavior,
      // just treat "at" as vowel-bearing for the initial/prefix waw cleanup.
      if (nextTok.tok === "at") return true;

      return false;
    }

    function shouldEmitBareInitialWawConsonant(posAfterTok) {
      const prevOutBase = lastNonDiacriticChar(out);
      const boundaryLike = isArabicPrefixBoundaryBase(prevOutBase);
      if (!boundaryLike) return false;

      const next = matchTokenAt(posAfterTok);
      return nextTokenCountsAsVowelForInitialWaw(next);
    }

    while (i < input.length) {
      // Preserve protected raw characters inserted by the Latin normalizer.
      if (input[i] === PROTECTED_MARK) {
        out += input[i + 1] || "";
        i += 2;
        continue;
      }

      const m1 = matchTokenAt(i);

      if (!m1) {
        out += input[i++];
        continue;
      }

      const nextPos = i + m1.tok.length;
      const m2 = matchTokenAt(nextPos);
      const posAfterSecond = nextPos + (m2 ? m2.tok.length : 0);

      if (m2 && tryEmitMaddah(m1, m2, posAfterSecond)) continue;
      if (tryEmitSukunEncodedShadda(m1, m2)) continue;

      if (m2 && m2.tok === m1.tok && isShaddaEligible(m1.tok)) {
        if (m1.ar.length === 1 && !isArabicDiacritic(m1.ar)) {
          out += m1.ar + SHADDA;
          i += m1.tok.length * 2;
          continue;
        }
      }

      if (m1.tok === "'" || m1.tok === "ʾ") {
        const prevOutBase = lastNonDiacriticChar(out);
        const boundaryLike = isArabicPrefixBoundaryBase(prevOutBase);

        if (boundaryLike && m2) {
          if (m2.tok === "a") {
            out += "أ" + FATHA;
            i += m1.tok.length + m2.tok.length;
            continue;
          }
          if (m2.tok === "i" || m2.tok === "e") {
            out += "إ" + KASRA;
            i += m1.tok.length + m2.tok.length;
            continue;
          }
          if (m2.tok === "u" || m2.tok === "o") {
            out += "أ" + DAMMA;
            i += m1.tok.length + m2.tok.length;
            continue;
          }
          if (m2.tok === "ā") {
            out += "آ";
            i += m1.tok.length + m2.tok.length;
            continue;
          }
        }

        emitHamzaWithSeat(nextPos);
        i += m1.tok.length;
        continue;
      }

      if (m1.tok === "a" || m1.tok === "i" || m1.tok === "e" || m1.tok === "u" || m1.tok === "o") {
        emitShortVowelToken(m1.tok);
        i += m1.tok.length;
        continue;
      }

      // Conservative cleanup:
      // emit bare waw instead of وْ only in clearly safe boundary-like consonant cases
      if ((m1.tok === "v" || m1.tok === "w") && m1.ar === "و" + SUKUN) {
        if (shouldEmitBareInitialWawConsonant(nextPos)) {
          out += "و";
          i += m1.tok.length;
          continue;
        }
      }

      out += m1.ar;
      i += m1.tok.length;
    }

    return out;
  }

  window.MapperTranslatorEn2Ar = { en2ar };
})();
