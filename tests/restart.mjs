import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const directory=await mkdtemp(join(tmpdir(),'smart-restart-'));
const origin='http://127.0.0.1:3177';
const email=`restart-${randomUUID()}@example.invalid`,password=randomUUID()+'-test';
let child,cookie='';
async function request(path,method='GET',body){
 const response=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.json();
}
async function start(){
 child=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,PORT:'3177',HOSTNAME:'127.0.0.1',APP_URL:origin,DATABASE_PATH:join(directory,'workspace.sqlite'),NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw new Error('Standalone server did not start');
}
async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=undefined;}
try{
 await start();await request('/api/auth/register','POST',{email,password,name:'Restart Test'});
 const {project}=await request('/api/projects','POST',{name:'Persist across restart'});
 const {tasks}=await request(`/api/projects/${project.id}/tasks`,'POST',{tasks:[{title:'Still here after restarting',subtasks:[{title:'A saved step'}]}]});
 await stop();cookie='';await start();await request('/api/auth/login','POST',{email,password});
 const restored=await request(`/api/projects/${project.id}/tasks`);assert.equal(restored.tasks[0].id,tasks[0].id);assert.equal(restored.tasks[0].subtasks[0].title,'A saved step');
 console.log('PASS standalone restart: account, project, task and subtask remain saved after a full process restart');
}finally{await stop();await rm(directory,{recursive:true,force:true});}
