import {loadTranslator} from '../tests/helpers/load-translator.mjs';
import {stabilityCases,traceRoundTrip,stabilityComparisons} from '../tests/helpers/roundtrip-stability.mjs';
import {writeFileSync} from 'node:fs';
const {MapperView:v,MapperTranslator:c}=loadTranslator();
const std={en2ar:s=>v.convert(s,'en2ar',true).text,ar2en:s=>v.convert(s,'ar2en',true).text};
let failures=[],checks=0,beforeFailed=0,afterFailed=0;
for(const x of stabilityCases()){
 const arabic=x.direction==='ar2en'?x.input:c.en2ar(x.input);
 for(const d of ['ar2en','en2ar']){
  const a=traceRoundTrip(c,{direction:d,input:d==='ar2en'?arabic:c.ar2en(arabic)});
  const b=traceRoundTrip(std,{direction:d,input:d==='ar2en'?arabic:std.ar2en(arabic)});
  for(const [rule,i,j]of stabilityComparisons(d)) {checks++;beforeFailed+=a[i]!==a[j];afterFailed+=b[i]!==b[j];if(a[i]===a[j]&&b[i]!==b[j])failures.push({id:x.id,rule,a,b});}
 }
}
writeFileSync(new URL('../experiments/notation-stability.json', import.meta.url),JSON.stringify({description:'Both starting directions, seeded from identical Arabic for custom and standard notation. All corpus inputs contribute, including Arabic generated from Latin inputs.',checks,beforeFailed,afterFailed,newFailures:failures},null,2)+'\n');
console.log(JSON.stringify({checks,beforeFailed,afterFailed,newFailures:failures.length,examples:failures.slice(0,3)},null,2));

if (failures.length) process.exitCode = 1;
