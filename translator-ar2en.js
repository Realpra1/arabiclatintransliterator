/* translator-ar2en.js
   Arabic -> English transliteration only.
*/

(() => {
  const {
    DIACRITICS,
    AR_TO_EN_BASE,
    DUAL_LETTERS,
    CANON_POLICY
  } = window.MapperConstants;

  const {
    isArabicDiacritic,
    isBareConsonantBridge,
    prevArabicBaseChar,
    nextArabicBaseChar,
    isShortVowelMark
  } = window.MapperTranslatorCoreUtils;

  const {
    FATHA, KASRA, DAMMA,
    SUKUN, SHADDA,
    TANWIN_FATH, TANWIN_KASR, TANWIN_DAMM,
    TATWEEL
  } = DIACRITICS;

  function ar2en(input) {
    let out = "";
    let lastToken = "";
    let lastConsonantToken = "";
    let pendingShortVowel = "";

    function isLatinVowelToken(token) {
      return token === "a" || token === "i" || token === "u" ||
             token === "ā" || token === "ī" || token === "ū" ||
             token === "aN" || token === "iN" || token === "uN";
    }

    function emit(token) {
      out += token;
      lastToken = token;
      if (!isLatinVowelToken(token)) {
        lastConsonantToken = token;
      }
    }

    function normalizeLatinVowelRuns(str) {
      let normalized = "";
      for (let k = 0; k < str.length; ) {
        const ch = str[k];

        if (ch === "a" || ch === "i" || ch === "u") {
          let j = k + 1;
          while (j < str.length && str[j] === ch) j++;

          const runLen = j - k;
          if (runLen >= 2) {
            const longVowel = ch === "a" ? "ā" : (ch === "i" ? "ī" : "ū");
            const longCount = Math.ceil(runLen / 2);
            normalized += longVowel.repeat(longCount);
            k = j;
            continue;
          }
        }

        normalized += ch;
        k += 1;
      }
      return normalized;
    }

    function canonicalizeCommonPrefixes(str) {
      return str.replace(
        /(^|[\s([{"«])ll(?=[A-Za-zĀāĪīŪū'"\-])/g,
        `$1${CANON_POLICY.DOUBLE_LAM_ARTICLE_CANON_LATIN}`
      );
    }

    function hasExplicitMarkOnWeakLetter(idx) {
      return isArabicDiacritic(input[idx + 1]);
    }

    function hasShaddaOnWeakLetter(idx) {
      return input[idx + 1] === SHADDA;
    }

    function nextMarkAfterShadda(idx) {
      return input[idx + 2];
    }

    function previousSourceCharIsBoundary(idx) {
      const prev = prevArabicBaseChar(input, idx);
      return !prev || !/[^\s]/.test(prev) || !(/[ء-ۿ]/.test(prev));
    }

    function isAfterBareInitialAl(idx) {
      const chars = [];
      for (let k = idx - 1; k >= 0 && chars.length < 2; k--) {
        const c = input[k];
        if (c === TATWEEL) continue;
        if (isArabicDiacritic(c)) continue;
        chars.unshift(c);
      }
      return chars.length === 2 && chars[0] === "ا" && chars[1] === "ل";
    }

    function isExplicitRepeatedLongWaw(idx) {
      return input[idx + 1] === DAMMA && nextArabicBaseChar(input, idx) === "و";
    }

    function isExplicitRepeatedLongYa(idx) {
      return input[idx + 1] === KASRA && nextArabicBaseChar(input, idx) === "ي";
    }

    function shouldTreatWawAsVowel(idx) {
      const prev = input[idx - 1];
      const nextBase = nextArabicBaseChar(input, idx);

      if (isExplicitRepeatedLongWaw(idx)) return true;

      if (hasExplicitMarkOnWeakLetter(idx) && !hasShaddaOnWeakLetter(idx)) return false;

      if (prev === DAMMA) return true;

      if (nextBase === "ا" || nextBase === "ى") return false;

      if (previousSourceCharIsBoundary(idx)) return false;
      if (isAfterBareInitialAl(idx)) return false;

      if (lastToken === "a" || lastToken === "i" || lastToken === "u" ||
          lastToken === "ā" || lastToken === "ī" || lastToken === "ū") {
        return false;
      }

      if (lastToken) return true;

      if (isBareConsonantBridge(input, idx)) return true;

      return false;
    }

    function shouldTreatYaAsVowel(idx) {
      const next = input[idx + 1];

      if (isExplicitRepeatedLongYa(idx)) return true;

      if (next === "ا") return false;

      if (hasExplicitMarkOnWeakLetter(idx) && !hasShaddaOnWeakLetter(idx)) return false;

      if (previousSourceCharIsBoundary(idx)) return true;

      if (lastToken === "a" || lastToken === "i" || lastToken === "u" ||
          lastToken === "ā" || lastToken === "ī" || lastToken === "ū") {
        return false;
      }

      if (lastToken) return true;

      return true;
    }

    function emitGeminatedWaw(idx) {
      const prev = input[idx - 1];
      const followingMark = nextMarkAfterShadda(idx);

      if (prev === DAMMA && followingMark === DAMMA) {
        emit(DUAL_LETTERS.WAW.vowel);
        emit(DUAL_LETTERS.WAW.consonant);
        return;
      }

      emit(DUAL_LETTERS.WAW.consonant);
      emit(DUAL_LETTERS.WAW.consonant);
    }

    function emitGeminatedYa() {
      emit(DUAL_LETTERS.YA.consonant);
      emit(DUAL_LETTERS.YA.consonant);
    }

    function initialWaslaDecisionVowelIsU(idx) {
      for (let k = idx + 1; k < input.length; k++) {
        const ch = input[k];
        if (/\s/.test(ch)) break;
        if (ch === TATWEEL || ch === SHADDA || ch === SUKUN) continue;

        if (ch === DAMMA || ch === TANWIN_DAMM) return true;
        if (ch === FATHA || ch === KASRA || ch === TANWIN_FATH || ch === TANWIN_KASR) return false;
      }
      return false;
    }

    function isTrueWordStart(idx) {
      const prev = prevArabicBaseChar(input, idx);
      if (!prev) return true;
      if (/\s/.test(prev)) return true;
      return /[.,;:!?،؛؟()[\]{}"“”«»<>]/.test(prev);
    }

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (ch === TATWEEL) continue;

      if (ch === SHADDA) {
        if (lastConsonantToken) emit(lastConsonantToken);
        if (pendingShortVowel) {
          emit(pendingShortVowel);
          pendingShortVowel = "";
        }
        continue;
      }

      if (ch === SUKUN) continue;

      if (ch === "ٱ") {
        const trueWordStart = isTrueWordStart(i);

        if (!trueWordStart) continue;

        const next = input[i + 1];

        // ٱلـ -> al... (emit only the article vowel; following ل contributes l)
        if (next === "ل") {
          emit("a");
          continue;
        }

        emit(initialWaslaDecisionVowelIsU(i) ? "u" : "i");
        continue;
      }

      if (ch === "آ") {
        emit(CANON_POLICY.MADD_CANON_LATIN);
        continue;
      }

      if (ch === "ا") {
        const next = input[i + 1];

        // الـ at true word start -> al... (emit only a; following ل contributes l)
        if (isTrueWordStart(i) && next === "ل") {
          emit("a");
          continue;
        }

        if (next === FATHA) {
          emit("a");
          i += 1;
        } else {
          emit("ā");
        }
        continue;
      }

      if (ch === FATHA) {
        const next = input[i + 1];

        if (next === "ة") continue;

        if (next === SHADDA) {
          pendingShortVowel = "a";
          continue;
        }

        if (next === "ا") {
          emit("ā");
          i += 1;
          continue;
        }

        emit("a");
        continue;
      }

      if (ch === KASRA) {
        const next = input[i + 1];
        const afterY = input[i + 2];

        if (next === SHADDA) {
          pendingShortVowel = "i";
          continue;
        }

        if (next === "ي") {
          if (!isArabicDiacritic(afterY) || afterY === KASRA) {
            continue;
          }
        }

        emit("i");
        continue;
      }

      if (ch === DAMMA) {
        const next = input[i + 1];
        const afterW = input[i + 2];
        const afterShadda = input[i + 3];

        if (next === SHADDA) {
          pendingShortVowel = "u";
          continue;
        }

        if (next === "و") {
          if (!isArabicDiacritic(afterW) || afterW === DAMMA) {
            continue;
          }
          if (afterW === SHADDA && afterShadda === DAMMA) {
            continue;
          }
        }

        emit("u");
        continue;
      }

      if (ch === TANWIN_FATH) { emit("aN"); continue; }
      if (ch === TANWIN_KASR) { emit("iN"); continue; }
      if (ch === TANWIN_DAMM) { emit("uN"); continue; }

      if (ch === "و" && input[i + 1] === SHADDA) {
        emitGeminatedWaw(i);
        i += 1;
        continue;
      }

      if (ch === "ي" && input[i + 1] === SHADDA) {
        emitGeminatedYa();
        i += 1;
        continue;
      }

      if (ch === "و") {
        emit(shouldTreatWawAsVowel(i) ? DUAL_LETTERS.WAW.vowel : DUAL_LETTERS.WAW.consonant);
        continue;
      }

      if (ch === "ي") {
        emit(shouldTreatYaAsVowel(i) ? DUAL_LETTERS.YA.vowel : DUAL_LETTERS.YA.consonant);
        continue;
      }

      if (ch === "أ" || ch === "إ") {
        const next = input[i + 1];
        const prevBase = prevArabicBaseChar(input, i);

        // Only treat as "true initial" if there is no preceding real Arabic base,
        // or only whitespace/punctuation before it.
        const trueBoundaryLike =
          !prevBase ||
          /\s/.test(prevBase) ||
          /[.,;:!?،؛؟()[\]{}"“”«»<>]/.test(prevBase);

        // Suppress short-vowelled hamza carriers only at true word start.
        // Do NOT suppress after article lam, e.g. الْأَمْرُ -> al'amru.
        if (isShortVowelMark(next)) {
          if (trueBoundaryLike) {
            continue;
          }
        }

        // Bare true-initial carriers map to canonical hamzated short-vowel starts.
        if (trueBoundaryLike && !(next && [
          FATHA, KASRA, DAMMA, SUKUN, SHADDA,
          TANWIN_FATH, TANWIN_KASR, TANWIN_DAMM
        ].includes(next))) {
          emit(ch === "إ" ? "'i" : "'a");
          continue;
        }

        // Otherwise keep the hamza itself.
        emit("'");
        continue;
      }

      if (AR_TO_EN_BASE.has(ch)) {
        emit(AR_TO_EN_BASE.get(ch));
        continue;
      }

      emit(ch);
    }

    return canonicalizeCommonPrefixes(normalizeLatinVowelRuns(out));
  }

  window.MapperTranslatorAr2En = { ar2en };
})();
