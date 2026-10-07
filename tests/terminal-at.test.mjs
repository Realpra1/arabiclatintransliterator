import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadTranslator} from './helpers/load-translator.mjs';
const {MapperTranslator:core,MapperView:view}=loadTranslator();

for(const [input,expected]of [
 ['at','ة'],['bat','بة'],['bata','بةَ'],['bati','بةِ'],['batu','بةُ'],
 ['bataN','بةً'],['batiN','بةٍ'],['batuN','بةٌ'],
 ['batَ','بةَ'],['batٌ','بةٌ'],['batْ','بةْ'],['batَُ','بةَُ'],
 ['bat.','بة.'],['(bat)','(بة)'],['bat/','بة/'],
 ['bat\nbat','بة\nبة'],['bat+bat','بة+بة'],
 ['cats','كَتس'],['cater','كَتِر'],['atlas','اَتلَس'],
 ['satasma-','سَتَسمَع'],['liqatl','لِقَتل'],["natā'iJ",'نَتاءِج'],
 ['Hatta','حَتَّ'],['kathīr','كَثِير'],['bat-a','بَتعَ'],
 ['cat2','cat2'],['H2O','H2O'],['CO2','CO2'],
 ['HaDāratuN fī SafHatiN vāHidatiN','حَضارةٌ فِي صَفحةٍ واحِدةٍ'],
])test(`terminal at: ${JSON.stringify(input)}`,()=>assert.equal(core.en2ar(input),expected));

test('terminal at applies in Standard notation with dotted tanwin and ayn',()=>{
 assert.equal(view.convert('ḥaḍāratuṇ fī ṣafḥatiṇ wāḥidatiṇ','en2ar',true).text,'حَضارةٌ فِي صَفحةٍ واحِدةٍ');
 assert.equal(view.convert('satasmaʿ','en2ar',true).text,'سَتَسمَع');
 assert.equal(view.convert('batʿa','en2ar',true).text,'بَتعَ');
});
