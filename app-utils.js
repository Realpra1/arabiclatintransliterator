/* Offline UI: safe text rendering, visible diagnostics, and recoverable errors. */
(() => {
  const $ = id => document.getElementById(id);
  const input = $("input");
  const output = $("output");
  let current = "";
  let pending;
  let copiedTimer;
  let composing = false;
  const descriptions = {
    protected: "Protected text: preserved rather than transliterated.",
    warning: "Three or more consonants: short vowels may be missing from the Arabic input.",
    unmapped: "No mapping found: this character was passed through.",
  };
  const direction = () => document.querySelector('input[name="dir"]:checked').value;
  const count = text => `${[...text].length.toLocaleString()} characters`;

  function error(message) {
    $("errorBox").textContent = message;
    $("errorBox").hidden = false;
  }

  function update() {
    clearTimeout(pending);
    clearTimeout(copiedTimer);
    $("copyLabel").textContent = "Copy output";
    $("errorBox").hidden = true;
    const dir = direction();
    const isStandard = $("standardNotation").checked;
    $("inputLabel").textContent = dir === "ar2en" ? "Arabic input" : "Latin input";
    $("outputLabel").textContent = dir === "ar2en" ? "Latin output" : "Arabic output";
    input.placeholder = dir === "ar2en" ? "اكتب أو الصق النص هنا…" : "Type or paste Latin text here…";
    input.setAttribute("lang", dir === "ar2en" ? "ar" : "en");
    output.dir = dir === "ar2en" ? "ltr" : "rtl";
    output.setAttribute("lang", dir === "ar2en" ? "en" : "ar");
    $("notationLabel").textContent = isStandard ? "Standard notation" : "MCB notation";
    $("notationHint").textContent = isStandard ? "Standard: w / y · ḥ / ṣ / ḍ / ṭ / ẓ / j / ʿ · Tanwin: ṇ" : "MCB: v / j · H / S / D / T / Z / J / - · Tanwin: N";
    $("inputCount").textContent = count(input.value);
    try {
      if (!window.MapperView) throw new Error("The transliterator could not load. Keep all application files in the same folder, then reload this page.");
      const result = window.MapperView.convert(input.value, dir, isStandard);
      current = result.text;
      const fragment = document.createDocumentFragment();
      for (const { text, kind } of result.segments) {
        if (kind === "normal") fragment.append(document.createTextNode(text));
        else {
          const mark = document.createElement("mark");
          mark.className = kind;
          mark.title = descriptions[kind];
          mark.textContent = text;
          fragment.append(mark);
        }
      }
      output.replaceChildren(fragment);
      $("outputPlaceholder").hidden = !!current;
      $("outputCount").textContent = count(current);
      $("copyBtn").disabled = !current;
      $("swapBtn").disabled = !current;
      $("vowelWarning").hidden = !result.coverage.sparse;
      $("vowelMessage").textContent = `Only ${result.coverage.marked} of ${result.coverage.letters} Arabic letters carry a vowel or sukūn mark. Short vowels are not guessed, so the transliteration may be ambiguous.`;
      $("unmappedWarning").hidden = result.counts.unmapped === 0;
      $("unmappedWarning").textContent = `${result.counts.unmapped} unmapped ${result.counts.unmapped === 1 ? "section was" : "sections were"} kept unchanged. Check the red highlights before copying.`;
      for (const kind of ["protected", "warning", "unmapped"]) $(`${kind}Count`).textContent = result.counts[kind];
      $("status").textContent = !input.value ? "Ready." : result.counts.unmapped || result.counts.warning || result.coverage.sparse ? "Converted · review the highlighted details" : "Converted · ready to copy";
    } catch (err) {
      current = "";
      output.replaceChildren();
      $("outputPlaceholder").hidden = false;
      $("outputCount").textContent = "0 characters";
      $("copyBtn").disabled = true;
      $("swapBtn").disabled = true;
      $("vowelWarning").hidden = true;
      $("unmappedWarning").hidden = true;
      for (const kind of ["protected", "warning", "unmapped"]) $(`${kind}Count`).textContent = "0";
      $("status").textContent = "Conversion could not finish.";
      error(`Could not transliterate this text. ${err.message || "Please reload the page and try again."} Your input has been kept.`);
    }
    output.setAttribute("aria-busy", "false");
  }

  function queueUpdate() {
    if (composing) return;
    clearTimeout(pending);
    $("copyBtn").disabled = true;
    $("swapBtn").disabled = true;
    output.setAttribute("aria-busy", "true");
    pending = setTimeout(update, 100);
  }

  input.addEventListener("input", queueUpdate);
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; queueUpdate(); });
  document.querySelectorAll('input[name="dir"]').forEach(el => el.addEventListener("change", update));
  $("standardNotation").addEventListener("change", update);
  $("showHighlights").addEventListener("change", () => output.classList.toggle("no-highlights", !$("showHighlights").checked));
  $("clearBtn").addEventListener("click", () => { input.value = ""; update(); input.focus(); });
  $("swapBtn").addEventListener("click", () => {
    input.value = current;
    document.querySelector(`input[name="dir"][value="${direction() === "ar2en" ? "en2ar" : "ar2en"}"]`).checked = true;
    update();
  });
  $("sampleBtn").addEventListener("click", () => {
    input.value = direction() === "ar2en" ? "حُضُورٌ\nجَوٌّ" :
      $("standardNotation").checked ? "ḥuḍūruṇ\njawwuṇ" : "HuDūruN\nJavvuN";
    update();
    input.focus();
  });

  $("copyBtn").addEventListener("click", async () => {
    const text = current;
    if (!text) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch { /* Local-file browsers may require the selection fallback. */ }
    if (!copied) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(helper);
      helper.select();
      try { copied = document.execCommand("copy") === true; } catch { copied = false; }
      finally { helper.remove(); }
    }
    if (copied) {
      $("copyLabel").textContent = "Copied!";
      $("status").textContent = "Plain text copied to clipboard.";
      copiedTimer = setTimeout(() => { $("copyLabel").textContent = "Copy output"; }, 1800);
    } else {
      output.focus();
      const range = document.createRange();
      range.selectNodeContents(output);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      error("Your browser blocked clipboard access. The output is selected; press Ctrl+C (or ⌘C) to copy it manually.");
    }
  });
  update();
})();
