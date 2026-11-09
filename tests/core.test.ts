import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { db,createUser,listProjects,createProject,listTasks,createTasks,requireTask,updateTask,deleteProject,deleteTask,sortTasks,takeRateLimit,acquireAiJob } from "../src/lib/server/store.ts";
import { hashPassword,verifyPassword } from "../src/lib/server/passwords.ts";
import { assistTask,planProject,sortProject } from "../src/lib/server/ai.ts";
import { AppError } from "../src/lib/server/errors.ts";
import { dueDate } from "../src/lib/server/validation.ts";

const directory=mkdtempSync(join(tmpdir(),"smart-unit-"));
process.env.DATABASE_PATH=join(directory,"test.sqlite");
process.env.AI_API_KEY="local-test-provider-only";
let mode="normal",calls=0,onResponse:(()=>void)|undefined;
const provider=createServer(async(req,res)=>{
 let raw="";for await(const part of req)raw+=part;
 const input=JSON.parse(raw);calls++;
 assert.equal(input.response_format.type,"json_object");
 if(mode==="slow"){await new Promise(resolve=>setTimeout(resolve,200));}
 if(mode==="unauthorized"){res.writeHead(401).end("private provider details");return;}
 if(mode==="rate"){res.writeHead(429,{"Retry-After":"15"}).end();return;}
 if(mode==="invalid"){res.writeHead(200,{"Content-Type":"application/json"}).end(JSON.stringify({choices:[{message:{content:'{"estimatedMinutes":-4}'}}]}));return;}
 const instruction=input.messages[0].content as string,context=JSON.parse(input.messages[1].content);
 let result:unknown={description:"Prepare the page content, build the layout, and check the result on mobile.",estimatedMinutes:45,subtasks:[{title:"Draft the content"},{title:"Build and verify the page"}]};
 if(instruction.includes("PLAN_PROJECT"))result={reply:"Start with a small deliverable.",tasks:[{title:"Build the first screen",description:"Create a working first screen.",priority:"high",estimatedMinutes:60,subtasks:[{title:"Sketch the layout"}]}]};
 if(instruction.includes('"order"'))result={order:context.tasks.map((t:{id:string})=>t.id).reverse(),reason:"Put the most important next step first."};
 onResponse?.();
 res.writeHead(200,{"Content-Type":"application/json"}).end(mode==="raw"?JSON.stringify(result):JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
});
before(async()=>{provider.listen(0,"127.0.0.1");await once(provider,"listening");process.env.AI_BASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;});
after(()=>{provider.closeAllConnections();provider.close();db().close();rmSync(directory,{recursive:true,force:true});});
const status=(code:number)=>(e:unknown)=>e instanceof AppError&&e.status===code;
function account(suffix:string){const user=createUser(`${suffix}@example.invalid`,suffix,"not-a-login-hash");db().prepare("INSERT INTO email_confirmations VALUES(?,?)").run(user.id,new Date().toISOString());return {...user,emailVerified:true};}

test("passwords use independent salts and reject incorrect passwords",async()=>{
 const first=await hashPassword("a long test password"),second=await hashPassword("a long test password");assert.notEqual(first,second);assert.ok(!first.includes("a long"));assert.equal(await verifyPassword("a long test password",first),true);assert.equal(await verifyPassword("wrong",first),false);assert.equal(await verifyPassword("wrong","malformed"),false);
});
test("projects, tasks, and subtasks are isolated by account",()=>{
 const alice=account("alice"),bob=account("bob");const a=createProject(alice.id,{name:"Private launch"}),b=createProject(bob.id,{name:"Bob's work"});
 const [ta]=createTasks(alice.id,a.id,[{title:"Private task",subtasks:[{title:"Private step"}]}]);const [tb]=createTasks(bob.id,b.id,[{title:"Other task",subtasks:[{title:"Other step"}]}]);
 assert.equal(listProjects(alice.id).length,2);assert.equal(listTasks(alice.id,a.id).length,1);
 assert.throws(()=>listTasks(bob.id,a.id),status(404));assert.throws(()=>requireTask(bob.id,ta.id),status(404));assert.throws(()=>updateTask(bob.id,ta.id,ta.version,{title:"stolen"}),status(404));assert.throws(()=>createTasks(bob.id,a.id,[{title:"stolen"}]),status(404));assert.throws(()=>deleteProject(bob.id,a.id),status(404));assert.throws(()=>updateTask(alice.id,ta.id,ta.version,{projectId:b.id}),status(404));
 const changed=updateTask(alice.id,ta.id,ta.version,{subtasks:[{id:tb.subtasks[0].id,title:"My own new step",completed:true}]});assert.notEqual(changed.subtasks[0].id,tb.subtasks[0].id);assert.equal(requireTask(bob.id,tb.id).subtasks[0].title,"Other step");
});
test("saved data survives a new database connection and revisions prevent lost edits",()=>{
 const user=account("durable"),project=createProject(user.id,{name:"Durable"});const [task]=createTasks(user.id,project.id,[{title:"Persist me",priority:"high",dueDate:"2027-01-04"}]);
 const saved=updateTask(user.id,task.id,task.version,{description:"An intentional edit",completed:true});assert.equal(saved.version,2);assert.throws(()=>updateTask(user.id,task.id,task.version,{description:"Late answer"}),status(409));
 const second=new DatabaseSync(process.env.DATABASE_PATH!);const row=second.prepare("SELECT description,completed FROM tasks WHERE id=?").get(task.id);assert.equal(row?.description,"An intentional edit");assert.equal(row?.completed,1);second.close();
});
test("moving and deleting tasks/projects preserves other projects and protects Inbox",()=>{
 const user=account("organize"),a=createProject(user.id,{name:"A"}),b=createProject(user.id,{name:"B"});const [task]=createTasks(user.id,a.id,[{title:"Move me",subtasks:[{title:"Step"}]}]);
 const moved=updateTask(user.id,task.id,task.version,{projectId:b.id});assert.equal(moved.projectId,b.id);assert.equal(listTasks(user.id,a.id).length,0);deleteProject(user.id,a.id);assert.equal(requireTask(user.id,task.id).title,"Move me");
 assert.throws(()=>deleteProject(user.id,listProjects(user.id).find(p=>p.isInbox)!.id),status(400));deleteProject(user.id,b.id);assert.throws(()=>requireTask(user.id,task.id),status(404));assert.equal(Number(db().prepare("SELECT COUNT(*) n FROM subtasks WHERE task_id=?").get(task.id)!.n),0);
});
test("sorting rejects foreign/missing IDs and concurrent task changes",()=>{
 const user=account("sorting"),p=createProject(user.id,{name:"Sort"}),tasks=createTasks(user.id,p.id,[{title:"One"},{title:"Two"}]);
 assert.throws(()=>sortTasks(user.id,p.id,[tasks[0].id,randomUUID()]),status(409));assert.throws(()=>sortTasks(user.id,p.id,[tasks[0].id]),status(409));
 const sorted=sortTasks(user.id,p.id,tasks.map(t=>t.id).reverse());assert.equal(sorted[0].title,"Two");assert.throws(()=>sortTasks(user.id,p.id,tasks.map(t=>t.id),tasks),status(409));
});
test("rate limits and AI job locks are bounded and recover after completion",()=>{
 takeRateLimit("test",2,1000);takeRateLimit("test",2,1000);assert.throws(()=>takeRateLimit("test",2,1000),status(429));db().prepare("UPDATE rate_limits SET resets_at=0 WHERE key='test'").run();takeRateLimit("test",2,1000);
 const user=account("locks"),release=acquireAiJob(user.id,"lock-a"),second=acquireAiJob(user.id,"lock-b");assert.throws(()=>acquireAiJob(user.id,"lock-a"),status(409));assert.throws(()=>acquireAiJob(user.id,"lock-c"),status(429));release();second();acquireAiJob(user.id,"lock-a")();
});
test("AI description is a single call that updates only its intended field",async()=>{
 mode="normal";const user=account("describe"),project=createProject(user.id,{name:"Website"}),[task]=createTasks(user.id,project.id,[{title:"Create landing page",estimatedMinutes:90,priority:"high"}]);const start=calls;const result=await assistTask(user.id,task.id,"describe");assert.equal(calls-start,1);assert.ok(result.description.length>10);assert.equal(result.estimatedMinutes,90);assert.equal(result.subtasks.length,0);assert.equal(result.priority,"high");
});
test("enrichment preserves existing user data; split creates saved subtasks",async()=>{
 const user=account("enrich"),p=createProject(user.id,{name:"Website"}),[task]=createTasks(user.id,p.id,[{title:"Ship",description:"Keep my description",estimatedMinutes:12}]);const result=await assistTask(user.id,task.id,"enrich");assert.equal(result.description,"Keep my description");assert.equal(result.estimatedMinutes,12);assert.equal(result.subtasks.length,2);const marked=updateTask(user.id,result.id,result.version,{subtasks:result.subtasks.map(s=>({...s,completed:true}))});assert.ok(marked.subtasks.every(s=>s.completed));
});
test("invalid AI responses and provider errors leave tasks unchanged and unlock retry",async()=>{
 const user=account("errors"),p=createProject(user.id,{name:"Errors"}),[task]=createTasks(user.id,p.id,[{title:"Test response"}]);
 mode="invalid";await assert.rejects(assistTask(user.id,task.id,"estimate"),status(502));assert.equal(requireTask(user.id,task.id).version,1);
 mode="unauthorized";await assert.rejects(assistTask(user.id,task.id,"estimate"),status(503));mode="rate";await assert.rejects(assistTask(user.id,task.id,"estimate"),e=>status(503)(e)&&(e as AppError).retryAfter===15);
 mode="raw";assert.equal((await assistTask(user.id,task.id,"estimate")).estimatedMinutes,45);mode="normal";
});
test("slow requests time out without updating data, and stale AI cannot overwrite an edit",async()=>{
 const user=account("timeouts"),p=createProject(user.id,{name:"Timeout"}),[task]=createTasks(user.id,p.id,[{title:"Test bounded wait"}]);
 process.env.AI_TIMEOUT_MS="25";mode="slow";await assert.rejects(assistTask(user.id,task.id,"describe"),status(504));assert.equal(requireTask(user.id,task.id).version,1);delete process.env.AI_TIMEOUT_MS;mode="normal";
 onResponse=()=>{updateTask(user.id,task.id,task.version,{title:"User's newer title"});};await assert.rejects(assistTask(user.id,task.id,"describe"),status(409));onResponse=undefined;assert.equal(requireTask(user.id,task.id).title,"User's newer title");assert.equal(requireTask(user.id,task.id).description,"");
});
test("AI project planning stays a preview, and sorting stays in the user's project",async()=>{
 const user=account("planning"),p=createProject(user.id,{name:"Launch"});const preview=await planProject(user.id,p.id,"Plan a small website launch");assert.equal(preview.tasks.length,1);assert.equal(listTasks(user.id,p.id).length,0);
 const tasks=createTasks(user.id,p.id,[{title:"First"},{title:"Second"}]);const sorted=await sortProject(user.id,p.id);assert.equal(sorted.tasks[0].id,tasks[1].id);deleteTask(user.id,tasks[0].id);assert.equal(listTasks(user.id,p.id).length,1);
});
test("date validation rejects impossible calendar dates",()=>{assert.equal(dueDate.safeParse("2027-02-30").success,false);assert.equal(dueDate.safeParse("2027-13-01").success,false);assert.equal(dueDate.safeParse("2027-02-28").success,true);});
