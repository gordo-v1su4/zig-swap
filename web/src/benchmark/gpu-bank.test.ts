import {test,expect} from 'bun:test';
import {estimatedResidentBytes} from './gpu-bank';
test('full residency exposes the real memory cost of eight 720p clips',()=>{
  expect(8*estimatedResidentBytes({width:1280,height:720,duration:12,fps:24})).toBe(8493465600);
});
