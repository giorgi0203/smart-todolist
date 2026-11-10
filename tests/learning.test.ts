import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { db,createUser } from '../src/lib/server/store.ts';
import { issueCode,redeemCode,pkce,registeredCallback } from '../src/lib/server/sso.ts';
import { roleAllowsPath } from '../src/lib/server/roles.ts';
import { experimentSchema,progressSchema,createExperiment,listExperiments,getExperiment,updateExperiment,deleteExperiment,getLearningProgress,saveLearningProgress } from '../src/lib/server/learning.ts';

const dir=mkdtempSync(join(tmpdir(),'learning-'));process.env.DATABASE_PATH=join(dir,'db.sqlite');
after(()=>{db().close();rmSync(dir,{recursive:true,force:true});});
const one=createUser('learner-one@example.invalid','One','test-hash');
const two=createUser('learner-two@example.invalid','Two','test-hash');

test('the compiler and task clients cannot exchange each other’s codes or change callbacks',()=>{
 const verifier=randomBytes(32).toString('base64url'),callback=registeredCallback('angular-compiler')!;
 const code=issueCode(one.id,'angular-compiler',callback,pkce(verifier));
 assert.throws(()=>redeemCode(code,'smart-todolist',registeredCallback('smart-todolist')!,verifier));
 assert.throws(()=>redeemCode(code,'angular-compiler','https://angular-compiler.giorgi.app/api/auth/sso/callback?evil=1',verifier));
 assert.equal(redeemCode(code,'angular-compiler',callback,verifier).id,one.id);
 assert.throws(()=>redeemCode(code,'angular-compiler',callback,verifier));
 assert.throws(()=>issueCode(one.id,'__proto__',callback,pkce(verifier)));
});
test('saved experiments and progress are scoped to the owner and survive reads/updates',()=>{
 const saved=createExperiment(one.id,{title:'Counter',source:'count = 1;',lessonId:'signals'});
 assert.equal(listExperiments(one.id)[0].id,saved.id);assert.deepEqual(listExperiments(two.id),[]);
 assert.throws(()=>getExperiment(two.id,saved.id),error=>(error as {status:number}).status===404);
 assert.throws(()=>updateExperiment(two.id,saved.id,{source:'stolen'}),error=>(error as {status:number}).status===404);
 assert.throws(()=>deleteExperiment(two.id,saved.id),error=>(error as {status:number}).status===404);
 assert.equal(updateExperiment(one.id,saved.id,{source:'count = 2;'}).source,'count = 2;');
 assert.deepEqual(saveLearningProgress(one.id,{completedLessonIds:['signals','forms']}).completedLessonIds,['signals','forms']);
 assert.deepEqual(getLearningProgress(two.id).completedLessonIds,[]);
 deleteExperiment(one.id,saved.id);assert.equal(listExperiments(one.id).length,0);
});
test('learning inputs bound UTF-8 size, unknown fields and progress growth',()=>{
 assert.equal(experimentSchema.safeParse({title:'ok',source:'😀'.repeat(20*1024)}).success,false);
 assert.equal(experimentSchema.safeParse({title:'ok',source:'source',userId:two.id}).success,false);
 assert.equal(experimentSchema.safeParse({title:'x'.repeat(121),source:'source'}).success,false);
 assert.equal(progressSchema.safeParse({completedLessonIds:['signals','signals']}).success,false);
 assert.equal(progressSchema.safeParse({completedLessonIds:Array.from({length:101},(_,i)=>'lesson-'+i)}).success,false);
 assert.equal(progressSchema.safeParse({completedLessonIds:['../../private']}).success,false);
});
test('each application exposes only its own API surface',()=>{
 for(const path of ['/api/projects','/api/tasks/abc','/api/ai','/api/sso/token','/api/auth/register','/analytics','/account'])assert.equal(roleAllowsPath('learning',path),false,path);
 for(const path of ['/api/health','/api/auth/session','/api/auth/sso/start','/api/auth/sso/callback','/api/auth/logout','/api/learning/experiments','/api/learning/experiments/id','/api/learning/progress'])assert.equal(roleAllowsPath('learning',path),true,path);
 assert.equal(roleAllowsPath('identity','/api/learning/experiments'),false);
 assert.equal(roleAllowsPath(undefined,'/api/learning/experiments'),false);
 assert.equal(roleAllowsPath(undefined,'/api/projects'),true);
});
