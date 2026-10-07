// Characterization inputs: spelling mistakes, malformed marks and mixed scripts
// are intentional. Expected outputs are captured once in fixtures, never inferred
// from linguistic rules. Keep the seed and input ordering stable for useful diffs.
export function buildAdditionalCorpus() {
  const cases = [];
  const counts = new Map();
  function add(group, direction, inputs) {
    const key = `expanded-${group}/${direction}`;
    for (const input of inputs) {
      const index = (counts.get(key) ?? 0) + 1;
      counts.set(key, index);
      cases.push({ id: `${key}/${String(index).padStart(4, '0')}`, group: `expanded-${group}`, direction, input });
    }
  }

  add('requested-satasma', 'en2ar', [
    'satasma-', 'satasma-?', 'satasma-.', 'satasma-!', 'satasma-\n',
    'satasma- alSawt', 'hal satasma- alSawt?', 'ghadaN satasma- alSawt.',
    'satasma- satasma-', 'satasma-a', 'satasma-u', 'satasma-i', 'satasma-ū',
    "satasma-'", 'satasma- al-', '-satasma-', 'satasma--', 'satasmaʿ',
    'satasma−', 'satasma–', 'satasma—', 'satasma‐', 'satasma‑',
    'Satasma-', 'SATASMA-', 'satasma-  ',
  ]);
  add('requested-satasma', 'ar2en', [
    'ستسمع', 'سَتَسْمَع', 'سَتَسمَع', 'سَتَسْمَعُ', 'ستسمع؟',
    'هل ستسمع الصوت؟', 'غدًا ستسمع صوت المطر.', 'ستسمع ستسمع',
    'سَتَسْمَعْ!', 'سَتَسْمَعُ أَصْوَاتًا جَدِيدَةً.',
  ]);

  const arabicEveryday = [
    'مرحبا', 'أهلاً وسهلاً', 'السلام عليكم ورحمة الله', 'وعليكم السلام',
    'صباح الخير', 'مساء الخير', 'تصبح على خير', 'شكرًا جزيلًا', 'عفوًا', 'من فضلك',
    'كيف حالك؟', 'أنا بخير، وأنت؟', 'ما اسمك؟', 'اسمي ليلى.', 'أين تسكن؟',
    'لا أفهم.', 'هل تتكلم العربية؟', 'أعد الكلام ببطء، من فضلك.', 'كم الساعة الآن؟',
    'أريد كوبًا من الماء.', 'القهوة بدون سكر، والشاي مع الحليب.', 'بكم هذا الكتاب؟',
    'أين محطة القطار؟', 'سأعود بعد خمس دقائق.', 'اليوم الاثنين وغدًا الثلاثاء.',
    'هذا بيتي وهذه مدرستي.', 'اشتريت خبزًا وجبنًا وتفاحًا من السوق.',
    'ذهبت أمي إلى المستشفى صباحًا.', 'الطقس جميل، ولكن الرياح قوية.',
    'أحب القراءة والموسيقى والسفر.', 'رجاءً أغلق الباب وافتح النافذة.',
    'رقم الهاتف: +20 123 456 7890', 'العنوان: شارع النور، مبنى ١٢، الطابق ٣.',
    'السعر ١٢٫٥٠ ريالًا، والخصم ٢٠٪.', 'موعدنا يوم 2026-10-07 الساعة 08:30.',
    'عبد الله بن محمد', 'أحمد وإبراهيم وإسماعيل', 'فاطمة، خديجة، عائشة، ومريم',
    'القاهرة، بيروت، دمشق، بغداد، الرباط، صنعاء', 'مكة المكرمة والمدينة المنورة',
    'شمس وقمر، ليل ونهار، ماء وهواء.', 'مدرسة جميلة، مكتبة كبيرة، شجرة عالية.',
    'مَرْحَبًا! كَيْفَ حَالُكَ الْيَوْمَ؟', 'أَنَا أَتَعَلَّمُ الْعَرَبِيَّةَ.',
    'هَذَا كِتَابٌ جَدِيدٌ، وَتِلْكَ مَدْرَسَةٌ قَدِيمَةٌ.',
    'إِنَّ الطَّالِبَ يَقْرَأُ بِهُدُوءٍ.', 'وَصَلَ الْقِطَارُ إِلَى الْمَحَطَّةِ.',
    'لا، لم أقرأه بعد؛ سأقرأه غدًا إن شاء الله.', 'أمس، اليوم، غدًا، وبعد غد.',
  ];
  const latinEveryday = [
    'marHaba', 'ahlan va sahlan', 'alssalāmu -alajkum', 'va -alajkum alssalām',
    'SabāH alkhajr', 'masā\' alkhajr', 'shukraN JazīlaN', 'min faDlik',
    'kajfa Hāluk?', 'anā bikhajr, va anta?', 'mā ismuk?', 'ismī lajlá.',
    'ajna taskun?', 'lā afham.', 'hal tatakallam al-arabijja?',
    'urid kuubaN min almaa\'.', 'urīdu qahva bilā sukkar.', 'kam alssā-a alān?',
    'ajna maHaTTat alqiTār?', 'satasma- Sawt almaTar ghadaN.',
    'hādhā kitābuN JadīduN, va tilka madrasatuN qadīmatuN.',
    'ashshams valqamar', 'alshshams va alqamar', 'allāh', "in shā' allāh", "mā shā' allāh",
    '-abd allāh', "aHmad va 'ibrāhīm", "fāTimat, -ā'ishat, va marjam",
    'alQāhira, bajrūt, dimashq, baghdād', 'makka almukarrama',
    "mā', havā', shaj', su'āl, mas'ala", 'Hello! How are you today?',
    'Good morning. Good evening. Good night.', 'Please, thank you, and sorry.',
    "I'm fine. What's your name? Where's the station?", 'One coffee without sugar, please.',
    'The meeting is at 08:30 on Wednesday.', 'Call +44 20 1234 5678, extension 42.',
    'My address is 12 Church Street, apartment 3B.', 'Bread, milk, eggs, cheese, apples, and tea.',
    'I paid $12.50, €8.99, and £3.00.', 'She said, “Yes”; he replied, “Why?”',
    "O'Connor, D'Angelo, Anne-Marie, and Jean-Luc", 'queue rhythm yacht choir thorough though tough',
    'a an the and or but if in on at to of for with', 'Monday Tuesday Wednesday Thursday Friday',
    'January February March April May June July', '0 zero 1 one 2 two 10 ten 100 hundred',
    'Email user+tag@example.com; open https://example.com/a?x=1&y=2#section.',
    'file_name.txt /usr/local/bin C:\\Users\\Ali\\notes.txt',
    'naïve façade coöperate piñata Straße Łódź déjà vu',
  ];
  add('everyday', 'ar2en', arabicEveryday);
  add('everyday', 'en2ar', latinEveryday);

  // Each block is one input, so context can carry across words and line breaks.
  add('continuous-text', 'ar2en', [
    'استيقظت ليلى مبكرًا وفتحت النافذة. كان المطر خفيفًا، والشارع هادئًا.\nقالت لأخيها: «هل ستسمع صوت العصافير إذا سكتنا قليلًا؟»\n\nبعد الإفطار، أخذت كتابًا وقلمًا وذهبت إلى المكتبة. عند الباب وجدت ورقةً كُتب عليها: نفتح الساعة ٩:٣٠؛ أهلًا بالجميع!',
    arabicEveryday.join(' '), arabicEveryday.join('\n'), arabicEveryday.join('\n\n'),
  ]);
  add('continuous-text', 'en2ar', [
    "fī alSSabāH, fataHat lajla alnnāfidha. kāna almaTar khafīfaN.\nqālat: «hal satasma- Sawt al-ajSāfīr?»\n\nakhadhat kitābaN va qalamaN, thumma dhahabat ila almaktaba. sā-at alfatH: 09:30; ahlaN bi alJamī-.\nC=6.242×10^18; mā' + havā' = ?",
    "At 8:30, I left my keys by the café door. 'Did you hear that?' asked May.\nA quiet yellow taxi passed the old school; three children waved.\n\nShopping: coffee, cheese, bread, apples. Total: €12.50.\nSend the receipt to ali@example.com, then write: shukraN!",
    latinEveryday.join(' '), latinEveryday.join('\n'), latinEveryday.join('\n\n'),
  ]);

  const wrappers = [
    ['', ''], [' ', ' '], ['ba', 'a'], ['va', ''], ['fa', ''], ['li', ''], ['al', ''],
    ['(', ')'], ['[', ']'], ['«', '»'], ['"', '"'], ['a ', ' i'], ['a\n', '\nu'],
    ['a\t', '\tb'], ['a\r\n', '\r\nb'], ['a\u00a0', '\u00a0b'],
    ['a/', '/b'], ['a+', '+b'], ['a-', '-b'], ['a−', '−b'], ['a،', '؛b'],
    ['a\u200d', '\u200db'], ['a\u200c', '\u200cb'], ['a\u2067', '\u2069b'],
    ['ب', 'ت'], ['🙂', '🙂'],
  ];
  for (const token of ['satasma-', "'i", "'ā", "mā'i", 'j', 'v', 'y', 'w', 'at', 'aN', 'N', 'I', 'x', 'ch', 'llkitāb']) {
    add('latin-context-boundaries', 'en2ar', wrappers.map(([before, after]) => before + token + after));
  }
  const arabicWrappers = [
    ['', ''], [' ', ' '], ['ب', 'ت'], ['بَ', 'ا'], ['بِ', 'ي'], ['بُ', 'و'],
    ['وَ', ''], ['فَ', ''], ['لِ', ''], ['ال', ''], ['(', ')'], ['«', '»'],
    ['قال ', ' نعم'], ['قال\n', '\nنعم'], ['قال\t', '\tنعم'], ['ب،', '؛ت'],
    ['ب/', '/ت'], ['ب\u00a0', '\u00a0ت'], ['ب\u200d', '\u200dت'],
    ['ب\u200c', '\u200cت'], ['ب\u2067', '\u2069ت'], ['x', 'y'], ['🙂', '🙂'],
  ];
  for (const token of ['سَتَسْمَع', 'أ', 'إِ', 'آ', 'ء', 'ؤ', 'ئ', 'ٱ', 'ٱل', 'و', 'ي', 'ة', 'ى', 'ً', 'ّ', 'ـ']) {
    add('arabic-context-boundaries', 'ar2en', arabicWrappers.map(([before, after]) => before + token + after));
  }

  add('ambiguous-tokenization', 'en2ar', [
    's h sh s-h s h', 't h th t-h t h', 'd h dh d-h d h', 'k h kh k-h k h',
    'g h gh g-h g h', 'p h ph p-h p h', 'c h ch c-h c h',
    'at a t a-t aat aaat aatat', 'an aN AN a n a N anN aNN',
    'shsh shh ssh shshsh', 'thth tth thh dhdh ddh dhh',
    'khkh kkh khh ghgh ggh ghh chch cch chh phph pph phh',
    "' '' ''' '''' ʾ ʾʾ ’ ’’ ʻ ʻʻ", "'ā 'āā 'āa 'āi 'āu 'āN 'aN 'iN 'uN",
    'j jj jjj jjjj y yy yyy yyyy v vv vvv vvvv w ww www wwww',
    'bya byya byyya byyyya byaN ayya iyya uyya', 'āa aā īi iī ūu uū',
    'aNaN iNiN uNuN aNiNuN atat atatat', 'HH SS DD TT ZZ JJ NN hh ss dd tt zz jj nn',
    'llll lllil alll lilal valll falll', 'P p V v Y y G g J j X x C c',
  ]);
  add('arabic-spelling-and-marks', 'ar2en', [
    'مسؤول مسئول مسؤولية مسئولية', 'رؤية رؤيا رأي آراء', 'قراءة قارئ قرأ يقرأ',
    'شيء شيئ شيئا شيئًا شيءٌ', 'ماء ماءً ماءٌ مياه', 'مئة مائة مائتان مئتان',
    'هدى هدي هديّ هُدًى', 'رحمة رحمت رحمه', 'على علي عليّ عَلِيّ عَلَى',
    'وعد وُعد وْعد ووعد وّعد', 'يعد يَعِد يْعد ييعد يّعد',
    'بَّ بِّ بُّ بًّ بًّ بٍّ بٍّ بٌّ بٌّ بّْ بّْ',
    'َّب َُِب بَُِ بّّ بْْ بًٌٍ', 'َ ِ ُ ّ ْ ً ٍ ٌ ٰ',
    'بَـّ بّـَ بُـو بِـي بَـا', 'وُو وُوُ وُوّ وُوُّ يِي يِيِ يِيّ يِيِّ',
    'أ إ آ أ إ آ ؤ ؤ ئ ئ', 'ﷲ الله اللّٰه اللَّه ٱللَّه',
    'ﻻ ﻷ ﻹ ﻵ لا لأ لإ لآ', 'ﻣﺮﺣﺒﺎ مرحبا', 'پ چ ژ گ ڤ ک ی ے ہ ھ ں',
    '۞ بِسْمِ ٱللَّهِ ۝ ۩', 'ب\u0610ت\u0611ث\u0656ج\u06d6ح',
  ]);

  const unicodeCases = [
    '\ufeffسلام hello', 'a\u200bb\u2060c\u200dd\u200ce',
    '\u2067Arabic العربية (a+b)\u2069', '\u202bب abc\u202c',
    'ā ī ū á ṣ ḍ ṭ ẓ ḥ', 'a\u0304 i\u0304 u\u0304 a\u0301 s\u0323 d\u0323 t\u0323 z\u0323 h\u0323',
    '\u064e\u0651ب ب\u0651\u064e ب\u064e\u0651',
    '🙂بَ👩🏽‍💻sh🇪🇬', '\ud800a\udc00ب', '\udc00\ud800',
    '\uE000a \uE000ب \uE000\uE000 \uE000', 'a\bب\fsh\vم\rtest',
    'a\n\nb\r\n\r\nب\r\rت', 'x\u2028y\u2029ب',
    'ASCII 12,345.67; عربي ١٢٬٣٤٥٫٦٧; فارسی ۱۲۳۴۵',
    '− - ‐ ‑ – — ـ ʿ ع', "' ’ ‘ ʼ ʾ ʻ ء ` ´", 'ＡＢＣ ａｂｃ １２３',
  ];
  for (const direction of ['en2ar', 'ar2en']) {
    add('unicode-adversarial', direction, unicodeCases);
    add('mixed-script', direction, [
      'Hello يا صديقي! satasma- الصوت الآن؟', 'مَرْحَبًا world, وَhello again.',
      'اكتب E=mc^2 ثم قل: alssalāmu -alajkum.', 'ArabicعربيLatinلاتيني123١٢٣',
      'email: علي@example.com / https://مثال.اختبار/path?q=ماء',
      'قالت: "satasma-", then added: «سَتَسْمَعُ».\n\nNext: mā\' + ماء.',
      'x=س; y=ص; H=ح; J=ج; N=ن; 500°C; ٣ kg; 25٪',
    ]);
  }

  // Deterministic pseudo-random input, not freshly randomized on each test run.
  // Natural-word paragraphs and nonsense token streams exercise different kinds
  // of context; all complete generated strings and outputs are stored in JSON.
  let state = 0x5a7a5a;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  const choose = values => values[next() % values.length];
  const arabicWords = 'اليوم غدًا أمس أنا أنت نحن هو هي كتاب مدرسة نافذة ماء هواء قهوة شاي صوت ستسمع مساءً صباحًا محمد ليلى أحمد عائشة إلى على في من لا نعم ربما لأن لكن الذي هذه هؤلاء شيء مسؤول قارئ حَيّ قُوَّة ٱلْبَيْتُ شَمْسٌ'.split(' ');
  const latinWords = "satasma- marHaba anā anta naHnu kitāb madrasat mā' havā' qahva shāj alSawt ghadaN alSSabāH lajla aHmad ilá -alá fī min lā na-am rubbamā shaj' su'āl quvva Hajj aN iN uN hello world coffee queue rhythm city school yellow with by my book".split(' ');
  const separators = [' ', ' ', ' ', ', ', '؛ ', '? ', '\n', '\n\n', '\t', '/', '+', ' — '];
  for (const [direction, words] of [['ar2en', arabicWords], ['en2ar', latinWords]]) {
    for (let i = 0; i < 120; i++) {
      const length = 5 + next() % 46;
      let paragraph = choose(words);
      for (let j = 1; j < length; j++) paragraph += choose(separators) + choose(words);
      add('seeded-paragraphs', direction, [paragraph + choose(['.', '؟', '!', '\n', ''])]);
    }
  }
  const latinFragments = ['a', 'at', 'aN', 'iN', 'uN', 'ā', 'ī', 'ū', 'á', 'sh', 'th', 'kh', 'gh', 'ch', 'ph', "'", 'ʾ', '-', 'ʿ', 'j', 'y', 'w', 'v', 'H', 'S', 'D', 'T', 'Z', 'J', 'N', 'x', 'c', 'b', 'e', 'o', '(', ')', '/', '+', ' ', '\n', '\u0304'];
  const arabicFragments = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهويىةأإؤئءآٱًٌٍَُِّْٰـ', ' ', '\n', '،', '؛', '؟', '/', '+', '(', ')'];
  for (const [direction, fragments] of [['ar2en', arabicFragments], ['en2ar', latinFragments]]) {
    for (let i = 0; i < 180; i++) {
      const length = 3 + next() % 78;
      let input = '';
      for (let j = 0; j < length; j++) input += choose(fragments);
      add('seeded-fragments', direction, [input]);
    }
  }
  for (let i = 0; i < 60; i++) {
    const fragments = [...arabicWords, ...latinWords, '🙂', '42', '١٢', 'E=mc^2', 'á', 'ā', '\u200d'];
    let text = '';
    for (let j = 0; j < 20; j++) text += choose(fragments) + choose(separators);
    for (const direction of ['en2ar', 'ar2en']) add('seeded-mixed', direction, [text]);
  }
  const englishWords = [
    'city', 'xylophone', 'cat', 'cancer', 'school', 'cycle',
    'ceiling', 'cell', 'cent', 'center', 'centre', 'century', 'cereal', 'certain',
    'circle', 'circuit', 'circus', 'citizen', 'civil', 'civilization', 'civic',
    'cylinder', 'cypress', 'cyan', 'cyber', 'bicycle', 'recycle', 'icy', 'mercy',
    'car', 'cap', 'cake', 'can', 'candle', 'camera', 'coconut', 'coffee', 'cut', 'cup',
    'cucumber', 'clay', 'clock', 'crab', 'scarf', 'scarce', 'science', 'scene',
    'scissors', 'scent', 'accept', 'accent', 'accident', 'success', 'account',
    'chess', 'cheese', 'chair', 'child', 'church', 'chocolate', 'chicken',
    'chorus', 'choir', 'chemical', 'chemistry', 'character', 'chronic',
    'chef', 'machine', 'schedule', 'stomach', 'ache', 'echo', 'technical',
    'x', 'xenon', 'xylem', 'xylitol', 'xenophobia', 'xerox', 'Xerxes', 'x-ray',
    'box', 'fox', 'extra', 'exit', 'exam', 'example', 'exact', 'exist', 'six', 'text',
    'taxi', 'oxygen', 'pixel', 'complex', 'next', 'suffix', 'fix', 'mixture',
    'yes', 'yellow', 'young', 'yacht', 'year', 'yield', 'yesterday', 'yet',
    'my', 'by', 'sky', 'try', 'cry', 'dry', 'fly', 'why', 'shy', 'rhythm',
    'happy', 'baby', 'family', 'story', 'mystery', 'symbol', 'system',
    'boy', 'toy', 'day', 'say', 'way', 'key', 'buy', 'eye', 'layer', 'player',
    'phone', 'photo', 'photograph', 'philosophy', 'physics', 'graph', 'elephant',
    'ship', 'sheep', 'fish', 'dish', 'fashion', 'cashier', 'shy', 'wish',
    'thin', 'thing', 'thick', 'this', 'that', 'the', 'other', 'mother', 'clothes',
    'ghost', 'night', 'light', 'daughter', 'laugh', 'cough', 'rough', 'through',
    'though', 'thought', 'thorough', 'bough', 'knight', 'knife', 'write', 'wrong',
    'queue', 'queen', 'quick', 'quay', 'quite', 'quiet', 'quit', 'question',
    'book', 'boot', 'food', 'good', 'blood', 'flood', 'moon', 'room', 'wood',
    'see', 'seed', 'green', 'meet', 'feet', 'tree', 'free', 'bee', 'be',
  ];
  add('english-word-roundtrips', 'en2ar', [...new Set(englishWords)]);
  for (const word of ['city', 'xylophone', 'cat', 'cancer', 'school', 'cycle']) {
    add('english-word-context', 'en2ar', [
      word[0].toUpperCase() + word.slice(1), word.toUpperCase(),
      `${word}.`, `${word}?`, `(${word})`, `a ${word}`, `the ${word}`, `${word}\n${word}`,
    ]);
  }
  add('english-word-context', 'en2ar', [
    'city xylophone cat cancer school cycle',
    'The city school has a xylophone. A cat watches me cycle past the cancer clinic.',
    'city\nxylophone\ncat\ncancer\nschool\ncycle',
  ]);
  return cases;
}
