/* translator.js
   Final composition layer.

   Load this after:
   - constants.js
   - translator-core-utils.js
   - latin-normalizer.js
   - translator-ar2en.js
   - translator-en2ar.js
*/

(() => {
  const { ar2en } = window.MapperTranslatorAr2En;
  const { en2ar } = window.MapperTranslatorEn2Ar;

  window.MapperTranslator = { ar2en, en2ar };
})();
