import { readJsonArtifact, writeJsonArtifact } from './lib/json-artifacts.mjs';
// Classify failure inputs by their corpus provenance, not an Arabic-validity heuristic.
import assert from 'node:assert/strict';
const report=readJsonArtifact(new URL('../experiments/roundtrip-stability.json',import.meta.url));
const naturalWords=new Map([
 ['أمر',{latin:'amr',meaning:'matter / command'}],
 ['هَٰذَا',{latin:'hādhā',meaning:'this'}],
 ['الرَّحْمَٰن',{latin:'al-Raḥmān',meaning:'the Most Merciful'}],
]);
function category(c){
 if(c.direction==='en2ar')return 'Latin-start inputs';
 if(naturalWords.has(c.input)||['expanded-everyday','expanded-continuous-text'].includes(c.group))return 'Curated natural Arabic';
 if(c.group==='expanded-seeded-paragraphs')return 'Random arrangements of real Arabic words';
 if(c.group==='expanded-seeded-fragments')return 'Random Arabic characters and marks';
 if(c.group==='expanded-seeded-mixed')return 'Random mixed Arabic/Latin text';
 return 'Synthetic letter, mark, boundary, and spelling probes';
}
const categories={};
for(const c of report.failures){
 const name=category(c),entry=categories[name]??={inputCases:0,failedAssertions:0,latinComparisons:0,arabicComparisons:0};
 entry.inputCases++;entry.failedAssertions+=c.failedRules.length;
 for(const rule of c.failedRules)entry[rule.includes('Latin L2')?'latinComparisons':'arabicComparisons']++;
}
const natural=report.failures.filter(c=>category(c)==='Curated natural Arabic');
const naturalTypes={standaloneWords:0,everydayPhrases:0,continuousTexts:0};
for(const c of natural)naturalTypes[naturalWords.has(c.input)?'standaloneWords':c.group==='expanded-everyday'?'everydayPhrases':'continuousTexts']++;
assert.equal(Object.values(categories).reduce((n,c)=>n+c.inputCases,0),report.summary.failingInputCases);
assert.equal(Object.values(categories).reduce((n,c)=>n+c.failedAssertions,0),report.summary.failed);
const result={
 description:'Counts concern existing failing input cases, not unique dictionary words. Curated natural Arabic is manually identified from the word list and everyday/continuous-text groups. Random real-word arrangements are counted separately from sentences. Synthetic probes may coincidentally contain real words; they are not dictionary-validated. Continuous texts include three concatenations of the everyday phrase list, so those four failures are not four independent language defects.',
 summary:report.summary,categories,naturalTypes,
 naturalCases:natural.map(c=>({id:c.id,kind:naturalWords.has(c.input)?'word':c.group==='expanded-everyday'?'phrase':'continuous text',input:c.input,explanation:naturalWords.get(c.input),failedRules:c.failedRules,L1:c.trace.L1,L2:c.trace.L2,L3:c.trace.L3})),
};
writeJsonArtifact(new URL('../experiments/failure-kinds.json',import.meta.url), result);
console.log(JSON.stringify({categories,naturalTypes},null,2));
