import { reporterMaintenance } from '../src/lib/reporter-maintenance';
import { getDatabase } from '../src/lib/database';
try {const result=await reporterMaintenance();console.log(`Reporter maintenance: ${result}`);if(['failed','unconfigured'].includes(result))process.exitCode=1;}
catch {console.error('Reporter maintenance failed; inspect configuration and retry. No personal data is logged.');process.exitCode=1;}
finally {await getDatabase()?.end();}
