import { syncTv } from '../src/lib/tv';
import { getDatabase } from '../src/lib/database';
try {
  let complete=false;
  for(let part=0;part<20 && !complete;part++) ({complete}=await syncTv(10));
  console.log(complete?'YouTube synchronization complete.':'Progress saved; the next run will resume.');
} catch {console.error('YouTube synchronization failed. Previous queue retained; check configuration and quota.');process.exitCode=1;}
finally {await getDatabase()?.end();}
