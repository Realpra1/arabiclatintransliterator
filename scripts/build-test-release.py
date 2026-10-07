"""Build an offline application ZIP; the GitHub tag also supplies the full source."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
if not re.fullmatch(r"[0-9A-Za-z.-]+", version):
    raise ValueError("Invalid release version")
name = f"arabiclatintransliterator-{version}"
destination = root / "dist"
destination.mkdir(exist_ok=True)
archive = destination / f"{name}.zip"
files = [
    "ArabicEnglishAlphabetTranslator.html", "ArabicLatinKey.png", "app.css",
    "constants.js", "translator-core-utils.js", "latin-normalizer.js",
    "translator-ar2en.js", "translator-en2ar.js", "translator.js",
    "transliteration-view.js", "app-utils.js", "MCBs-Compact-Laser.ttf",
    "Classical Arabic alphabet", "README.md",
]
html = (root / files[0]).read_text()
for relative in re.findall(r'(?:src|href)="\./([^"]+)"', html):
    if relative not in files:
        raise ValueError(f"Missing runtime asset: {relative}")
instructions = f"""Arabic & Latin — Test release {version}

Extract this entire ZIP, then open ArabicEnglishAlphabetTranslator.html in a browser.
Keep all files together. No installation or network connection is needed.

Standard notation: w/y/j, dotted consonants, and tanwin N rendered as ṇ.
Ordinary ن remains n; custom mode retains N. The á and alif/tanwin vowel encodings
are unchanged. This is a reversible alternate notation with custom conventions.

The key image is above the editor. Green marks protected text, yellow marks
possible missing vowels, and red marks unmapped passthrough. Explanations precede
warning/error messages. Copy output copies plain text without markup.

Known limitation: existing round-trip stability issues remain, including repeated
vowel sequences. This is a prerelease for testing. See the release notes and source
repository for the full regression/stability reports and tests.
"""
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
    for filename in files:
        bundle.write(root / filename, f"{name}/{filename}")
    bundle.writestr(f"{name}/START_HERE.txt", instructions)
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(destination / "SHA256SUMS.txt").write_text(f"{checksum}  {archive.name}\n")
print(archive)
print(f"SHA-256: {checksum}")
