/* constants.js
   All static tables and shared constants.
   No logic here.
*/

(() => {

  // ===== Arabic diacritics =====
  const DIACRITICS = {
    FATHA: "\u064E",       // َ
    KASRA: "\u0650",       // ِ
    DAMMA: "\u064F",       // ُ
    SUKUN: "\u0652",       // ْ
    SHADDA: "\u0651",      // ّ
    TANWIN_FATH: "\u064B", // ً
    TANWIN_KASR: "\u064D", // ٍ
    TANWIN_DAMM: "\u064C", // ٌ
    TATWEEL: "\u0640"
  };

  // ===== Latin normalizer policy =====
  const LATIN_NORMALIZER_POLICY = {
    PROTECTED_MARK: "\uE000",
    PRESERVE_CAPS: ["J", "H", "S", "D", "T", "Z", "N"],
    PROTECT_SINGLE_LATIN_LETTER_NEAR_SYMBOLS: [
      "+", "−", "=", "^", "°", "*", "/", "(", ")", "[", "]", "{", "}", "<", ">", "\"", "“", "”", "«", "»"
    ]
  };

  // ===== Canon / alias policy =====
  const CANON_POLICY = {
    ARTICLE_CANON_LATIN: "al",                  // changed from āl
    DOUBLE_LAM_ARTICLE_CANON_LATIN: "lil",
    MADD_CANON_LATIN: "'ā",
    WASLA_DEFAULT_INITIAL_LATIN: "i",
    WASLA_U_INITIAL_LATIN: "u"
  };

  // ===== Base table (fixed 1:1 letters only) =====
  // Hamza carriers are COLLAPSED to "'"
  const AR_TO_EN_BASE = new Map([
    ["ا","ā"],
    ["ى","á"],
    ["ة","at"],
    ["ٰ","ā"],   // dagger alif
    ["ب","b"],
    ["ت","t"],
    ["ث","th"],
    ["ج","J"],
    ["ح","H"],
    ["خ","kh"],
    ["د","d"],
    ["ذ","dh"],
    ["ر","r"],
    ["ز","z"],
    ["س","s"],
    ["ش","sh"],
    ["ص","S"],
    ["ض","D"],
    ["ط","T"],
    ["ظ","Z"],
    ["ع","-"],
    ["غ","gh"],
    ["ف","f"],
    ["ق","q"],
    ["ك","k"],
    ["ل","l"],
    ["م","m"],
    ["ن","n"],
    ["ه","h"],

    // Arabic punctuation
    ["،",","],
    ["؛",";"],
    ["؟","?"],

    // Hamza (collapse all forms)
    ["ء","'"],
    ["أ","'"],
    ["إ","'"],
    ["ؤ","'"],
    ["ئ","'"],

    // Alif madda
    ["آ", CANON_POLICY.MADD_CANON_LATIN]
  ]);

  // ===== Dual-form letters =====
  const DUAL_LETTERS = {
    WAW: {
      consonant: "v",
      vowel: "ū"
    },
    YA: {
      consonant: "j",
      vowel: "ī"
    }
  };

  // ===== English -> Arabic token table =====
  // Longest first.
  // NOTE: hamza seating handled in translator-en2ar.js when encountering "'".
  const EN_TO_AR_TOKENS = [

    // Tanwin
    ["aN", DIACRITICS.TANWIN_FATH],
    ["iN", DIACRITICS.TANWIN_KASR],
    ["uN", DIACRITICS.TANWIN_DAMM],

    // Tā' marbūṭa
    ["at", "ة"],

    // Long vowels
    ["ī", DIACRITICS.KASRA + "ي"],
    ["ū", DIACRITICS.DAMMA + "و"],
    ["ā", "ا"],
    ["á", "ى"],

    // Digraphs
    ["th","ث"],
    ["dh","ذ"],
    ["sh","ش"],
    ["kh","خ"],
    ["gh","غ"],
    ["ph","ف"],
    ["ch","تج"],

    // Arabic punctuation from Latin input
    ["?","؟"],
    [";","؛"],
    [",","،"],

    // Emphatics / special letters
    ["S","ص"],
    ["ṣ","ص"],

    ["D","ض"],
    ["ḍ","ض"],

    ["T","ط"],
    ["ṭ","ط"],

    ["Z","ظ"],
    ["ẓ","ظ"],

    ["H","ح"],
    ["ḥ","ح"],

    ["-","ع"],
    ["ʿ","ع"],

    // Hamza (seat chosen in translator-en2ar.js)
    ["'","ء"],
    ["ʾ","ء"],

    ["J","ج"],

    // Consonantal stability markers + loose aliases
    ["j", "ي" + DIACRITICS.SUKUN],
    ["y", "ي" + DIACRITICS.SUKUN],

    ["v", "و" + DIACRITICS.SUKUN],
    ["w", "و" + DIACRITICS.SUKUN],

    // Basic consonants + loose aliases
    ["b","ب"],
    ["p","ب"],

    ["t","ت"],
    ["d","د"],
    ["r","ر"],
    ["z","ز"],
    ["s","س"],
    ["f","ف"],
    ["q","ق"],
    ["k","ك"],
    ["g","ج"],
    ["l","ل"],
    ["m","م"],
    ["n","ن"],
    ["h","ه"],
    ["x","كس"],

    // Short vowels + loose aliases
    ["a", DIACRITICS.FATHA],
    ["i", DIACRITICS.KASRA],
    ["e", DIACRITICS.KASRA],
    ["u", DIACRITICS.DAMMA],
    ["o", DIACRITICS.DAMMA]
  ];

  window.MapperConstants = {
    DIACRITICS,
    LATIN_NORMALIZER_POLICY,
    CANON_POLICY,
    AR_TO_EN_BASE,
    EN_TO_AR_TOKENS,
    DUAL_LETTERS
  };

})();
