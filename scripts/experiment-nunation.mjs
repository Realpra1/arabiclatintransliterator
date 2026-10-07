import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {loadTranslator,translatorFiles,root} from '../tests/helpers/load-translator.mjs';
import {stabilityCases,traceRoundTrip,stabilityComparisons} from '../tests/helpers/roundtrip-stability.mjs';
const dottedTanwin = process.argv.includes('--tanwin-dot');
assert.ok(process.argv.slice(2).every(arg => arg === '--tanwin-dot'));
const experimentName = dottedTanwin ? 'tanwin-underdot' : 'nunation-notation';
const before=loadTranslator();
const context=createContext({window:{}});
let candidateSource=readFileSync(new URL('transliteration-view.js',root),'utf8');
for(const [a,b] of [
 ['Z: "ẓ" };', dottedTanwin ? 'Z: "ẓ", N: "ṇ" };' : 'Z: "ẓ", n: "ṇ", N: "n" };'],
 ['/^[wyj]$/','/^[wyjn]$/'],
]){assert.equal(candidateSource.split(a).length-1,1);candidateSource=candidateSource.replace(a,b);}
for(const file of translatorFiles)runInContext(file==='transliteration-view.js'?candidateSource:readFileSync(new URL(file,root),'utf8'),context,{filename:file});
const after=context.window;
const asTranslator=w=>({ar2en:s=>w.MapperView.convert(s,'ar2en',true).text,en2ar:s=>w.MapperView.convert(s,'en2ar',true).text});
const baseline=asTranslator(before),candidate=asTranslator(after),core=before.MapperTranslator;
const examples=['ن','نَ','نُونٌ','عَيْنٌ','بَنٌ','بَنُن','كِتَابٌ','كِتَابٍ','كِتَابً','كِتَاباً','كِتَابًا','نَارٌ','سَنَةٌ','مِنْ','بِين','بٍ'].map(input=>({input,before:traceRoundTrip(baseline,{direction:'ar2en',input}),after:traceRoundTrip(candidate,{direction:'ar2en',input})}));
const checks={total:0,beforeFailed:0,afterFailed:0,newlyFailing:[],fixed:[]};
const changedArabic=[];
for(const c of stabilityCases()){
 // Defaults must be identical for every input; the trial touches notation only.
 assert.equal(after.MapperView.convert(c.input,c.direction).text,before.MapperView.convert(c.input,c.direction).text,c.id);
 const arabic=c.direction==='ar2en'?c.input:core.en2ar(c.input);
 for(const direction of ['ar2en','en2ar']){
  const a=traceRoundTrip(baseline,{direction,input:direction==='ar2en'?arabic:baseline.ar2en(arabic)});
  const b=traceRoundTrip(candidate,{direction,input:direction==='ar2en'?arabic:candidate.ar2en(arabic)});
  if(a.A2!==b.A2||a.A3!==b.A3)changedArabic.push({id:c.id,direction,before:a,after:b});
  for(const [rule,l,r] of stabilityComparisons(direction)){
   const oldFail=a[l]!==a[r],newFail=b[l]!==b[r];checks.total++;checks.beforeFailed+=oldFail;checks.afterFailed+=newFail;
   if(!oldFail&&newFail)checks.newlyFailing.push({id:c.id,rule,before:a,after:b});
   if(oldFail&&!newFail)checks.fixed.push({id:c.id,rule,before:a,after:b});
  }
 }
}
const focused=dottedTanwin ? [['ن','n'],['نَ','na'],['بٌ','buṇ'],['بٍ','biṇ'],['بً','baṇ'],['باً','bāṇ'],['بَنٌ','banuṇ']] : [['ن','ṇ'],['نَ','ṇa'],['بٌ','bun'],['بٍ','bin'],['بً','ban'],['باً','bān'],['بَنٌ','baṇun']];
for(const [arabic,latin]of focused){assert.equal(candidate.ar2en(arabic),latin);assert.equal(candidate.ar2en(candidate.en2ar(latin)),latin);}
for(const input of ['N2','n2','(n)','(N)','H2O','CO2'])assert.equal(candidate.en2ar(input),baseline.en2ar(input));
const report={description:`Isolated alternate-notation trial: ${dottedTanwin ? 'nun ن → n; tanwin N → ṇ' : 'nun ن → ṇ; tanwin N → n'}. Existing short/long-vowel encodings unchanged. Production code and fixtures untouched.`,sourceSha256:Object.fromEntries(translatorFiles.map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex')])),checks,changedArabic,examples,focusedChecks:focused.length};
writeFileSync(new URL(`experiments/${experimentName}.json`,root),JSON.stringify(report,null,2)+'\n');
writeFileSync(`/tmp/arabiclatin-${experimentName}-view.js`,candidateSource);
console.log(JSON.stringify({checks:{...checks,newlyFailing:checks.newlyFailing.length,fixed:checks.fixed.length},changedArabic:changedArabic.length,examples:examples.map(e=>({arabic:e.input,before:e.before.L1,after:e.after.L1,secondLatin:e.after.L2,thirdLatin:e.after.L3})),failures:checks.newlyFailing.slice(0,3)},null,2));
