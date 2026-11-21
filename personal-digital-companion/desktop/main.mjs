import * as electron from 'electron';
import { startDesktop } from './shell.mjs';
import {benchmark} from './benchmark.mjs';
const perf=process.env.FEIYUE_PERF_OUTPUT;
startDesktop(electron,{benchmark:Boolean(perf),htmlMenu:true}).then(shell=>{
  if(perf&&shell)return benchmark(electron,shell,perf);
}).catch(error=>{console.error(error.message);electron.app.quit();});
