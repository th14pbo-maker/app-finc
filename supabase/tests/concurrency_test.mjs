import {runConcurrencyTest} from '../../verification/concurrency.mjs';
try { await runConcurrencyTest(); }
catch(e) {console.error('FAIL:',e.message);process.exitCode=1;}
