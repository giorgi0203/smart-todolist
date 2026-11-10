/** Real HTTP verification. Run locally with --local; production uses normal HTTPS trust. */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const local=process.argv.includes('--local'),children=[];
const dir=local?mkdtempSync(join(tmpdir(),'learning-http-')):null;
const dbPath=local?join(dir,'workspace.sqlite'):process.env.DATABASE_PATH||'/var/lib/smart-todolist/workspace.sqlite';
const origins={identity:'https://auth.giorgi.app',learning:'https://angular-compiler.giorgi.app',workspace:'https://smart-todolist.giorgi.app'};
const ports={identity:3491,learning:3492,workspace:3493};
const cookieJar=new Map();let database,log;
const id=randomUUID(),otherId=randomUUID(),password=randomUUID()+'A1',email='learning-'+id+'@example.invalid';
const digest=value=>createHash('sha256').update(value).digest('hex');
async function request(url,options={}){
 const parsed=new URL(url),origin=parsed.origin;
 const role=Object.keys(origins).find(key=>origins[key]===origin);assert.ok(role,'Only registered first-party hosts may be contacted');
 const target=local?'http://127.0.0.1:'+ports[role]+parsed.pathname+parsed.search:url;
 const headers={...(cookieJar.get(origin)?{Cookie:cookieJar.get(origin)}:{}),...options.headers};
 const response=await fetch(target,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
 for(const cookie of response.headers.getSetCookie()){
  if(cookie.includes('Max-Age=0')){cookieJar.delete(origin);continue;}
  assert.ok(/; Secure(?:;|$)/i.test(cookie));assert.ok(/; HttpOnly(?:;|$)/i.test(cookie));assert.ok(!/; Domain=/i.test(cookie));
  cookieJar.set(origin,cookie.split(';')[0]);
 }
 return response;
}
function write(role,path,body,method='POST',headers={}){return request(origins[role]+path,{method,headers:{Origin:origins[role],'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
async function authorizeLearning(){
 let response=await request(origins.learning+'/api/auth/sso/start'),callback;
 assert.equal(response.status,307);assert.match(response.headers.get('location'),/client_id=angular-compiler/);
 for(let i=0;i<4&&response.status>=300&&response.status<400;i++){
  const url=response.headers.get('location');assert.ok(url);
  if(url.startsWith(origins.learning+'/api/auth/sso/callback'))callback=url;
  if(url===origins.learning+'/')break;
  response=await request(url);
 }
 assert.ok(callback);assert.equal(response.status,307);assert.equal(response.headers.get('location'),origins.learning+'/');
 assert.equal(cookieJar.get(origins.learning)?.split('=')[0],'__Host-giorgi_learning');
 assert.equal((await request(callback)).status,400,'SSO callbacks cannot be replayed');
}
(async()=>{
 if(local){
  log=openSync('/tmp/learning-account-http.log','w');
  for(const role of ['identity','learning','workspace']){
   const env={...process.env,APP_URL:origins[role],APP_ROLE:role==='workspace'?'':role,PORT:String(ports[role]),HOSTNAME:'127.0.0.1',AUTH_PUBLIC_URL:origins.identity,AUTH_INTERNAL_URL:'http://127.0.0.1:'+ports.identity,DATABASE_PATH:dbPath,NEXT_TELEMETRY_DISABLED:'1'};
   children.push(spawn(process.execPath,[resolve('.next/standalone/server.js')],{env,stdio:['ignore',log,log]}));
  }
  for(const role of Object.keys(ports)){
   let ready=false;
   for(let i=0;i<50;i++){try{ready=(await request(origins[role]+'/api/health')).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
   assert.ok(ready,role+' failed to start');
  }
 }
 assert.equal((await request(origins.learning+'/api/auth/session')).status,200);
 assert.equal((await request(origins.learning+'/api/learning/experiments')).status,401);
 assert.equal((await request(origins.learning+'/api/projects')).status,404);
 assert.equal((await request(origins.learning+'/api/sso/token')).status,404);
 assert.equal((await request(origins.identity+'/api/learning/experiments')).status,404);
 assert.equal((await request(origins.workspace+'/api/learning/experiments')).status,404);
 database=new DatabaseSync(dbPath);database.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
 const salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
 for(const user of [{id,email},{id:otherId,email:'learning-other-'+otherId+'@example.invalid'}])database.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').run(user.id,user.email,'Learning fixture',hash,new Date().toISOString());
 const login=await write('identity','/api/auth/login',{email,password});assert.equal(login.status,200);
 assert.equal(cookieJar.get(origins.identity)?.split('=')[0],'__Host-giorgi_identity');
 await authorizeLearning();
 assert.equal((await (await request(origins.learning+'/api/auth/session')).json()).user.id,id);
 const source='import { Component } from "@angular/core"; @Component({selector:"demo",template:"Learning fixture"}) export class DemoComponent {}';
 const created=await write('learning','/api/learning/experiments',{title:'Learning fixture',source,lessonId:'signals'});assert.equal(created.status,201);
 const saved=(await created.json()).experiment;
 assert.equal((await (await request(origins.learning+'/api/learning/experiments')).json()).experiments[0].source,source);
 const updated=await write('learning','/api/learning/experiments/'+saved.id,{title:'Renamed'},'PATCH');assert.equal((await updated.json()).experiment.title,'Renamed');
 assert.equal((await write('learning','/api/learning/experiments',{title:'bad origin',source},'POST',{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await write('learning','/api/learning/experiments',{title:'too long',source:'x'.repeat(61*1024)})).status,400);
 const progress=await write('learning','/api/learning/progress',{completedLessonIds:['signals','forms']},'PUT');assert.deepEqual((await progress.json()).progress.completedLessonIds,['signals','forms']);
 const ownCookie=cookieJar.get(origins.learning),otherToken=randomBytes(32).toString('hex');
 database.prepare('INSERT INTO learning_sessions VALUES(?,?,?)').run(digest(otherToken),otherId,Date.now()+60000);
 cookieJar.set(origins.learning,'__Host-giorgi_learning='+otherToken);
 assert.deepEqual((await (await request(origins.learning+'/api/learning/experiments')).json()).experiments,[]);
 assert.equal((await write('learning','/api/learning/experiments/'+saved.id,{title:'stolen'},'PATCH')).status,404);
 assert.equal((await write('learning','/api/learning/experiments/'+saved.id,{},'DELETE')).status,404);
 assert.deepEqual((await (await request(origins.learning+'/api/learning/progress')).json()).progress.completedLessonIds,[]);
 cookieJar.set(origins.learning,ownCookie);
 const workspaceToken=randomBytes(32).toString('hex');database.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(workspaceToken),id,Date.now()+60000);
 cookieJar.set(origins.learning,'__Host-giorgi_learning='+workspaceToken);
 assert.equal((await request(origins.learning+'/api/auth/session')).status,200);
 assert.equal((await (await request(origins.learning+'/api/auth/session')).json()).user,null,'A workspace token cannot become a learning token');
 cookieJar.set(origins.learning,ownCookie);
 assert.equal((await write('identity','/api/auth/logout',{})).status,200);
 assert.equal((await request(origins.learning+'/api/learning/experiments')).status,401);
 for(const table of ['sessions','learning_sessions','identity_sessions'])assert.equal(database.prepare('SELECT COUNT(*) n FROM '+table+' WHERE user_id=?').get(id).n,0);
 console.log('PASS real shared learning SSO, distinct cookies/tokens, route isolation, saved experiments, progress, ownership, CSRF, bounds and global logout');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 if(database){for(const userId of [id,otherId]){database.prepare('DELETE FROM users WHERE id=?').run(userId);database.prepare('DELETE FROM rate_limits WHERE key=?').run('learning-write:'+userId);}database.close();}
 for(const child of children)child.kill('SIGTERM');
 if(log!==undefined)closeSync(log);
 // Children still hold SQLite handles briefly; Unix unlink of this fixture is safe.
 if(dir)rmSync(dir,{recursive:true,force:true});
});
