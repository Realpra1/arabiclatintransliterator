/* Whole-text conversion, optional notation, and non-destructive diagnostics. */
(() => {
  // Keep ordinary n and á; render the distinct tanwin marker N as ṇ.
  // This reversible alternate notation retains the house vowel encodings.
  const standard = { v: "w", j: "y", J: "j", H: "ḥ", S: "ṣ", D: "ḍ", T: "ṭ", Z: "ẓ", N: "ṇ" };
  const custom = Object.fromEntries(Object.entries(standard).map(([a, b]) => [b, a]));

  function fromStandard(input) {
    const tokens = [];
    for (let i = 0; i < input.length; i++) {
      const original = input[i];
      tokens.push({ original, canonical: custom[original] || original });
    }
    const canonical = tokens.map(t => t.canonical).join("");
    // Determine boundaries after decoding dotted letters: ḥy/ is a word, not
    // an isolated y beside punctuation. Literal ASCII formula symbols stay put.
    const protectedPositions = window.MapperLatinNormalizer.protectedPositions(canonical);
    return tokens.map((t, i) => protectedPositions.has(i) && /^[wyj]$/.test(t.original) ? t.original : t.canonical).join("");
  }

  function kindsFromRanges(text, ranges) {
    const kinds = Array(text.length).fill("normal");
    for (const { start, end, kind } of ranges) {
      for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) kinds[i] = kind;
    }
    // Include the digits and degree sign attached to a protected letter in the
    // highlight (H2O, 500°C), without claiming that a whole equation is protected.
    for (const match of text.matchAll(/[A-Za-zāīūá0-9°]+/g)) {
      const start = match.index;
      if (!kinds.slice(start, start + match[0].length).includes("protected")) continue;
      for (let i = start; i < start + match[0].length; i++) {
        if (/[0-9°]/.test(text[i])) kinds[i] = "protected";
      }
    }
    return kinds;
  }

  function markConsonantClusters(text, kinds) {
    // Digraphs represent one consonant. Work on the canonical notation, before
    // display substitutions, so the setting does not change the diagnostics.
    const consonant = /^(?:th|dh|sh|kh|gh|ph|ch|[btJHcdrzsSDTZfqklmnhvj\-'])/;
    let i = 0;
    while (i < text.length) {
      const start = i;
      let count = 0;
      while (i < text.length && kinds[i] === "normal") {
        const token = text.slice(i).match(consonant)?.[0];
        if (!token || kinds.slice(i, i + token.length).some(k => k !== "normal")) break;
        count++;
        i += token.length;
      }
      if (count >= 3) kinds.fill("warning", start, i);
      if (i === start) i++;
    }
  }

  function vowelCoverage(input) {
    const letters = [...input.matchAll(/[ء-غف-يٱ][\u064B-\u0652\u0670]*/g)];
    const marked = letters.filter(m => /[\u064B-\u0650\u0652\u0670]/.test(m[0])).length;
    return { letters: letters.length, marked, sparse: letters.length >= 4 && marked / letters.length < 0.25 };
  }

  function convert(input, direction, useStandard = false) {
    if (typeof input !== "string") throw new TypeError("Input must be text.");
    if (!["ar2en", "en2ar"].includes(direction)) throw new Error("Choose a valid conversion direction.");
    const translator = window.MapperTranslator?.[direction];
    if (typeof translator !== "function") throw new Error("The transliterator could not load. Keep all application files in the same folder, then reload this page.");
    const source = direction === "en2ar" && useStandard ? fromStandard(input) : input;
    const details = {};
    const canonical = translator(source, details);
    if (typeof canonical !== "string" || !Array.isArray(details.ranges)) throw new Error("The transliterator returned an invalid result.");
    const kinds = kindsFromRanges(canonical, details.ranges);
    const notationProtected = window.MapperLatinNormalizer.protectedPositions(canonical);
    if (direction === "ar2en") markConsonantClusters(canonical, kinds);
    const segments = [];
    for (let i = 0; i < canonical.length; i++) {
      const kind = kinds[i];
      let text = canonical[i];
      if (direction === "ar2en" && useStandard && !notationProtected.has(i) && (kind === "normal" || kind === "warning")) text = standard[text] || text;
      const previous = segments[segments.length - 1];
      if (previous?.kind === kind) previous.text += text;
      else segments.push({ kind, text });
    }
    return {
      text: segments.map(s => s.text).join(""), segments,
      coverage: direction === "ar2en" ? vowelCoverage(input) : { letters: 0, marked: 0, sparse: false },
      counts: Object.fromEntries(["protected", "warning", "unmapped"].map(kind => [kind, segments.filter(s => s.kind === kind).length])),
    };
  }

  window.MapperView = { convert, fromStandard, vowelCoverage };
})();
