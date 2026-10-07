/* translator-core-utils.js
   Shared low-level helpers for the transliterator.
*/

(() => {
  const { DIACRITICS } = window.MapperConstants;

  const {
    FATHA, KASRA, DAMMA,
    SUKUN, SHADDA,
    TANWIN_FATH, TANWIN_KASR, TANWIN_DAMM,
    TATWEEL
  } = DIACRITICS;

  function isArabicDiacritic(ch) {
    return Object.values(DIACRITICS).includes(ch);
  }

  function lastNonDiacriticChar(str) {
    for (let k = str.length - 1; k >= 0; k--) {
      const c = str[k];
      if (!isArabicDiacritic(c) && c !== TATWEEL) return c;
    }
    return "";
  }

  function lastEmittedVowelDiacritic(str) {
    for (let k = str.length - 1; k >= 0; k--) {
      const c = str[k];
      if (c === TATWEEL) continue;
      if (!isArabicDiacritic(c)) break;
      if (c === FATHA || c === KASRA || c === DAMMA) return c;
    }
    return "";
  }

  function isArabicBaseLetter(ch) {
    if (!ch) return false;
    const code = ch.charCodeAt(0);
    return code >= 0x0600 && code <= 0x06FF && !isArabicDiacritic(ch) && ch !== TATWEEL;
  }

  function isArabicPrefixBoundaryBase(ch) {
    return !isArabicBaseLetter(ch) || ch === "و" || ch === "ف" || ch === "ل";
  }

  function isLatinBoundaryChar(ch) {
    return !ch || /\s|[()[\]{}"“”«»<>,.;:!?/\\|+=*^~`-]/.test(ch);
  }

  function isShortVowelMark(ch) {
    return ch === FATHA || ch === KASRA || ch === DAMMA;
  }

  function prevArabicBaseChar(input, idx) {
    for (let k = idx - 1; k >= 0; k--) {
      const c = input[k];
      if (c === TATWEEL) continue;
      if (isArabicDiacritic(c)) continue;
      return c;
    }
    return "";
  }

  function prevArabicBaseIndex(input, idx) {
    for (let k = idx - 1; k >= 0; k--) {
      const c = input[k];
      if (c === TATWEEL) continue;
      if (isArabicDiacritic(c)) continue;
      return isArabicBaseLetter(c) ? k : -1;
    }
    return -1;
  }

  function nextArabicBaseIndex(input, idx) {
    for (let k = idx + 1; k < input.length; k++) {
      const c = input[k];
      if (c === TATWEEL) continue;
      if (isArabicDiacritic(c)) continue;
      return isArabicBaseLetter(c) ? k : -1;
    }
    return -1;
  }

  function nextArabicBaseChar(input, idx) {
    const nextIdx = nextArabicBaseIndex(input, idx);
    return nextIdx >= 0 ? input[nextIdx] : "";
  }

  function hasShortVowelAfterBaseAt(input, idx) {
    const next = input[idx + 1];
    return isShortVowelMark(next);
  }

  function isBareConsonantBridge(input, idx) {
    const prevIdx = prevArabicBaseIndex(input, idx);
    const nextIdx = nextArabicBaseIndex(input, idx);

    if (prevIdx < 0 || nextIdx < 0) return false;

    return !hasShortVowelAfterBaseAt(input, prevIdx) && !hasShortVowelAfterBaseAt(input, nextIdx);
  }

  // ===== New shared helpers moved out of translators =====

  // Keep optional diagnostic ranges aligned when a final canonicalization changes
  // string length. The plain-string API uses the exact same replacement path.
  function replaceWithRanges(str, pattern, replacement, details) {
    let shift = 0;
    return str.replace(pattern, (...args) => {
      const match = args[0];
      const offset = args[args.length - 2];
      const value = replacement(...args);
      if (details) {
        const start = offset + shift;
        const end = start + match.length;
        const delta = value.length - match.length;
        for (const range of details.ranges) {
          if (range.end <= start) continue;
          if (range.start >= end) {
            range.start += delta;
            range.end += delta;
          } else {
            range.start = Math.min(range.start, start);
            range.end = range.end >= end ? range.end + delta : start + value.length;
          }
        }
        shift += delta;
      }
      return value;
    });
  }

  function isNeutralPassthrough(ch) {
    return /^[\s\p{N}.,;:!?،؛؟()[\]{}"“”«»<>/\\|+=*^~`−–—°%×÷≈Ω_\-$€£&]$/u.test(ch);
  }

  function hasExplicitMarkOnWeakLetter(input, idx) {
    return isArabicDiacritic(input[idx + 1]);
  }

  function hasShaddaOnWeakLetter(input, idx) {
    return input[idx + 1] === SHADDA;
  }

  function nextMarkAfterShadda(input, idx) {
    return input[idx + 2];
  }

  function isAfterBareInitialAl(input, idx) {
    const chars = [];
    for (let k = idx - 1; k >= 0 && chars.length < 2; k--) {
      const c = input[k];
      if (c === TATWEEL) continue;
      if (isArabicDiacritic(c)) continue;
      chars.unshift(c);
    }
    return chars.length === 2 && chars[0] === "ا" && chars[1] === "ل";
  }

  function isArabicSourceBoundaryChar(ch) {
    if (!ch) return true;
    if (/\s/.test(ch)) return true;
    return /[.,;:!?،؛؟()[\]{}"“”«»<>]/.test(ch);
  }

  function isArabicTrueWordStart(input, idx) {
    const prev = prevArabicBaseChar(input, idx);
    return isArabicSourceBoundaryChar(prev);
  }

  function scanFirstShortVowelInArabicWord(input, idxStart) {
    for (let k = idxStart; k < input.length; k++) {
      const ch = input[k];
      if (isArabicSourceBoundaryChar(ch)) break;
      if (ch === TATWEEL || ch === SHADDA || ch === SUKUN) continue;

      if (
        ch === FATHA || ch === KASRA || ch === DAMMA ||
        ch === TANWIN_FATH || ch === TANWIN_KASR || ch === TANWIN_DAMM
      ) {
        return ch;
      }
    }
    return "";
  }

  window.MapperTranslatorCoreUtils = {
    isArabicDiacritic,
    lastNonDiacriticChar,
    lastEmittedVowelDiacritic,
    isArabicBaseLetter,
    isArabicPrefixBoundaryBase,
    isLatinBoundaryChar,
    isShortVowelMark,
    prevArabicBaseChar,
    prevArabicBaseIndex,
    nextArabicBaseIndex,
    nextArabicBaseChar,
    hasShortVowelAfterBaseAt,
    isBareConsonantBridge,
    replaceWithRanges,
    isNeutralPassthrough,

    hasExplicitMarkOnWeakLetter,
    hasShaddaOnWeakLetter,
    nextMarkAfterShadda,
    isAfterBareInitialAl,
    isArabicSourceBoundaryChar,
    isArabicTrueWordStart,
    scanFirstShortVowelInArabicWord
  };
})();
