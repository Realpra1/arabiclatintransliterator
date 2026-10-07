// Compare an explicit alif+fatha carrier with the preceding terminal-at trial.
// Production code and saved expectations are never changed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {loadTranslator,translatorFiles,root} from '../tests/helpers/load-translator.mjs';
import {stabilityCases,traceRoundTrip,stabilityComparisons} from '../tests/helpers/roundtrip-stability.mjs';
import {readFixture} from '../tests/corpus.mjs';
const fingerprint=()=>Object.fromEntries(translatorFiles.map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex')]));
const sourceSha256=fingerprint();
const previousReport=JSON.parse(readFileSync(new URL('experiments/terminal-at.json',root)));
assert.deepEqual(sourceSha256,previousReport.sourceSha256,'Re-run terminal-at trial against changed runtime source first');
const previousSource=previousReport.reports.find(r=>r.mode==='latin-diacritics').candidateSource;
let candidateSource=previousSource;
for(const [from,to]of [
 ['if (input.startsWith(tok, pos)) return { tok, ar };','if (input.startsWith(tok, pos)) return { tok, ar, carrier: tok === "a" && input.startsWith("at", pos) && !isTerminalAt(pos) };'],
 ['      const nextPos = i + m1.tok.length;', `      // Consume only a: the following t still participates in th and tt.
      if (m1.carrier) {
        out += "ا" + FATHA;
        i += m1.tok.length;
        continue;
      }

      const nextPos = i + m1.tok.length;`],
 ['if (boundaryLike && m2) {','if (boundaryLike && m2 && !m2.carrier) {'],
]){assert.equal(candidateSource.split(from).length,2,from);candidateSource=candidateSource.replace(from,to);}
function load(source){const context=createContext({window:{}});for(const f of translatorFiles)runInContext(f==='translator-en2ar.js'?source:readFileSync(new URL(f,root),'utf8'),context,{filename:f});return context.window;}
const windows={released:loadTranslator(),split:load(previousSource),carrier:load(candidateSource)};
const core=Object.fromEntries(Object.entries(windows).map(([k,w])=>[k,w.MapperTranslator]));
const cases=stabilityCases();
const compare=()=>{const checks={total:0,beforeFailed:0,afterFailed:0,newlyFailing:[],fixed:[]};return{checks,add(c,before,after){for(const[rule,l,r]of stabilityComparisons(c.direction)){const oldFail=before[l]!==before[r],newFail=after[l]!==after[r];checks.total++;checks.beforeFailed+=oldFail;checks.afterFailed+=newFail;if(!oldFail&&newFail)checks.newlyFailing.push({id:c.id,rule,before,after});if(oldFail&&!newFail)checks.fixed.push({id:c.id,rule});}}};};
const againstRelease=compare(),againstSplit=compare();
for(const c of cases){
 const traces=Object.fromEntries(Object.entries(core).map(([name,t])=>[name,traceRoundTrip(t,c)]));
 againstRelease.add(c,traces.released,traces.carrier);againstSplit.add(c,traces.split,traces.carrier);
 assert.equal(core.carrier.ar2en(c.input),core.released.ar2en(c.input),c.id);
 assert.equal(windows.carrier.MapperLatinNormalizer.normalizeInputForLooseAliases(c.input),windows.released.MapperLatinNormalizer.normalizeInputForLooseAliases(c.input),c.id);
}
const standard=Object.fromEntries(Object.entries(windows).map(([name,w])=>[name,{ar2en:s=>w.MapperView.convert(s,'ar2en',true).text,en2ar:s=>w.MapperView.convert(s,'en2ar',true).text}]));
const standardAgainstRelease=compare(),standardAgainstSplit=compare();
for(const c of cases){
 const arabic=c.direction==='ar2en'?c.input:core.released.en2ar(c.input);
 for(const direction of ['ar2en','en2ar']){
  const input=direction==='ar2en'?arabic:standard.released.ar2en(arabic);
  const traces=Object.fromEntries(Object.entries(standard).map(([name,t])=>[name,traceRoundTrip(t,{direction,input})]));
  const testCase={id:c.id,direction};
  standardAgainstRelease.add(testCase,traces.released,traces.carrier);standardAgainstSplit.add(testCase,traces.split,traces.carrier);
 }
}
const opposite=d=>d==='en2ar'?'ar2en':'en2ar';
const capture=(t,d,s)=>{const output=t[d](s),roundTrip=t[opposite(d)](output);return{output,roundTrip,secondPass:t[d](roundTrip)};};
const counts={cases:0,changedCases:0,output:0,roundTrip:0,secondPass:0},changed=[];
for(const c of JSON.parse(readFixture('regressions.json'))){
 counts.cases++;const after=capture(core.carrier,c.direction,c.input);
 const differences=Object.keys(after).filter(stage=>after[stage]!==c[stage]);
 for(const stage of differences)counts[stage]++;
 if(differences.length)changed.push({id:c.id,direction:c.direction,input:c.input,before:Object.fromEntries(Object.keys(after).map(k=>[k,c[k]])),after});
}
counts.changedCases=changed.length;
const documents=cases.filter(c=>c.group==='complete-document').map(c=>{
 const stages=Object.fromEntries(Object.entries(core).map(([name,t])=>[name,capture(t,c.direction,c.input)]));
 const a=stages.released.output.split(/\s+/),b=stages.split.output.split(/\s+/),d=stages.carrier.output.split(/\s+/);
 assert.equal(a.length,d.length);
 return{id:c.id,direction:c.direction,unchangedFromRelease:Object.fromEntries(Object.keys(stages.released).map(k=>[k,stages.released[k]===stages.carrier[k]])),changedOutputWords:a.flatMap((word,i)=>word===d[i]?[]:[{index:i,released:word,split:b[i],carrier:d[i]}]),...stages};
});
const examples=[...['at','cat','cata','catu','catuN','cats','cater','atlas','satasma-','liqatl',"natā'iJ",'Hatta','kathīr','HaDāratuN',"'atb",'batb','bāatb','cat2','H2O','CO2'].map(input=>({direction:'en2ar',input})),...['شآـةذ','غئىآـةؤموّىسأصظطزئق','مَدْرَسَةٌ','كَتَبَ','قَتْل'].map(input=>({direction:'ar2en',input}))].map(c=>({...c,...Object.fromEntries(Object.entries(core).map(([name,t])=>[name,traceRoundTrip(t,c)]))}));
assert.equal(core.carrier.en2ar('batb'),'باَتب');
assert.equal(core.carrier.en2ar('Hatta'),'حاَتَّ');
assert.equal(core.carrier.en2ar('kathīr'),'كاَثِير');
for(const input of ['cat','cata','catu','catuN','HaDāratuN','H2O','CO2','cat2'])assert.equal(core.carrier.en2ar(input),core.released.en2ar(input),input);
const previousFailures=previousReport.reports.find(r=>r.mode==='latin-diacritics').stability.newlyFailing.map(f=>{
 const c=cases.find(c=>c.id===f.id),trace=traceRoundTrip(core.carrier,c);
 return{id:c.id,trace,latinStable:trace.L2===trace.L3,arabicStable:trace.A2===trace.A3};
});
const seededCoreFailures=standardAgainstRelease.checks.newlyFailing.map(f=>{
 const input=f.before.A1;
 const released=traceRoundTrip(core.released,{direction:'ar2en',input});
 const carrier=traceRoundTrip(core.carrier,{direction:'ar2en',input});
 return{id:f.id,input,released,carrier,alsoFailsInMCB:carrier.A2!==carrier.A3||carrier.L2!==carrier.L3};
});
const reducedYaExamples=['شِيةف','ةِيةِح'].map(input=>({input,released:traceRoundTrip(core.released,{direction:'ar2en',input}),carrier:traceRoundTrip(core.carrier,{direction:'ar2en',input})}));
assert.deepEqual(fingerprint(),sourceSha256);
const report={description:'Internal at emits alif+fatha for a, then handles t normally (preserving th/tt). Terminal at including short-vowel/tanwin suffixes still emits ة. No production edits.',sourceSha256,candidateSource,counts,againstRelease:againstRelease.checks,againstSplit:againstSplit.checks,standardAgainstRelease:standardAgainstRelease.checks,standardAgainstSplit:standardAgainstSplit.checks,previousFailures,seededCoreFailures,reducedYaExamples,documents,examples,changedCaseIds:changed.map(c=>c.id),changedExamples:changed.slice(0,30)};
writeFileSync(new URL('experiments/internal-at-carrier.json',root),JSON.stringify(report,null,2)+'\n');
const summarize=c=>({...c,newlyFailing:c.newlyFailing.length,fixed:c.fixed.length});
console.log(JSON.stringify({counts,againstRelease:summarize(report.againstRelease),againstSplit:summarize(report.againstSplit),standardAgainstRelease:summarize(report.standardAgainstRelease),standardAgainstSplit:summarize(report.standardAgainstSplit),previousFailures,documents:documents.map(d=>({id:d.id,unchangedFromRelease:d.unchangedFromRelease,changedOutputWords:d.changedOutputWords})),examples},null,2));
