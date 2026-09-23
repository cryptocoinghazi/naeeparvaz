import { reporterMaintenance } from '../src/lib/reporter-maintenance';
import { getDatabase } from '../src/lib/database';
try {await reporterMaintenance();console.log('Reporter retention and delivery maintenance complete.');}
catch {console.error('Reporter maintenance failed; inspect configuration and retry. No personal data is logged.');process.exitCode=1;}
finally {await getDatabase()?.end();}
