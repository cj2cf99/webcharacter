import {writeFileSync} from 'node:fs';
export const handlers={
  'mock.unit':{risk:'L1',validate(){},execute(params){
    if(params.marker)writeFileSync(params.marker,'started');
    if(params.mode==='busy'){while(true){Math.sqrt(31);}}
    if(params.mode==='crash')process.exit(7);
    if(params.mode==='fail')throw new Error('mock failure');
    return {value:params.value};
  }},
};
