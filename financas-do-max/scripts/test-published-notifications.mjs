import assert from 'node:assert/strict';
import {createInterface} from 'node:readline/promises';
import {createHash} from 'node:crypto';
process.stdin.setRawMode?.(true);
const reader=createInterface({input:process.stdin,terminal:false});
console.log('Ready for deployment verification JSON on stdin (hidden).');
const input=JSON.parse(await new Promise(resolve=>reader.once('line',resolve)));reader.close();
const {base,secret,assets}=input;
for(const {path,sha} of assets){const res=await fetch(base+path);assert.equal(res.status,200,path);const data=Buffer.from(await res.arrayBuffer());assert.equal(createHash('sha1').update(data).digest('hex'),sha,path);}
assert.equal((await fetch(base+'/api/notifications/status')).status,401);
assert.equal((await fetch(base+'/api/notifications/cron')).status,401);
const cron=await fetch(base+'/api/notifications/cron',{headers:{Authorization:'Bearer '+secret}});
assert.equal(cron.status,200);const result=await cron.json();assert.equal(result.failed,0);
console.log(JSON.stringify({assetsVerified:assets.length,unauthenticatedAccess:'blocked',cron:result}));
