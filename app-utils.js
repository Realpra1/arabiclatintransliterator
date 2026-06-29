/* app-utils.js
   Stable UI wiring + utility actions (copy/clear/update).
   Depends on translator.js having set window.MapperTranslator.
*/
(() => {
  const { ar2en, en2ar } = window.MapperTranslator || {};
  if (typeof ar2en !== "function" || typeof en2ar !== "function") {
    throw new Error("translator.js not loaded or missing exports (window.MapperTranslator).");
  }

  // ===== DOM =====
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const dirRadios = document.querySelectorAll('input[name="dir"]');

  function getDir() {
    return document.querySelector('input[name="dir"]:checked')?.value ?? "ar2en";
  }

  function update() {
    const dir = getDir();
    const val = inputEl.value;
    outputEl.value = (dir === "ar2en") ? ar2en(val) : en2ar(val);
  }

  async function copyOutputToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function fallbackCopyFromTextarea(textarea) {
    textarea.focus();
    textarea.select();
    // Deprecated but still useful as fallback in some browsers/contexts:
    document.execCommand("copy");
  }

  // ===== Events =====
  inputEl.addEventListener("input", update);
  dirRadios.forEach(r => r.addEventListener("change", update));

  copyBtn.addEventListener("click", async () => {
    const ok = await copyOutputToClipboard(outputEl.value);
    if (ok) {
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy output"), 900);
    } else {
      fallbackCopyFromTextarea(outputEl);
    }
  });

  clearBtn.addEventListener("click", () => {
    inputEl.value = "";
    outputEl.value = "";
    inputEl.focus();
  });

  // Initial render
  update();
})();
