import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Project, Todo, Subtask, Priority, PlanTask } from "../types.ts";
import { AppError } from "./errors.ts";

let connection: DatabaseSync | undefined;
export function db() {
  if (connection) return connection;
  const file = resolve(process.env.DATABASE_PATH || ".data/workspace.sqlite");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(file);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'indigo',
      is_inbox INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      UNIQUE(id, user_id)
    );
    CREATE INDEX IF NOT EXISTS project_user ON projects(user_id);
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER, priority TEXT NOT NULL DEFAULT 'medium', due_date TEXT,
      position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id,user_id) REFERENCES projects(id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS task_project ON tasks(user_id,project_id,position);
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS subtask_parent ON subtasks(task_id);
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_jobs (
      resource TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  connection = database;
  return database;
}
export function transaction<T>(fn: () => T): T {
  const database = db(); database.exec("BEGIN IMMEDIATE");
  try { const value = fn(); database.exec("COMMIT"); return value; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}
export type UserRow = { id: string; email: string; name: string; password_hash: string };
export function userByEmail(email: string) {
  return db().prepare("SELECT * FROM users WHERE email=?").get(email) as UserRow | undefined;
}
export function createUser(email: string, name: string, passwordHash: string) {
  return transaction(() => {
    if (userByEmail(email)) throw new AppError(409, "An account with this email already exists. Please sign in.");
    const id = randomUUID(), now = new Date().toISOString();
    db().prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id, email, name, passwordHash, now);
    db().prepare("INSERT INTO projects(id,user_id,name,is_inbox,created_at) VALUES(?,?,?,1,?)").run(randomUUID(), id, "Inbox", now);
    return { id, email, name };
  });
}
export function listProjects(userId: string): Project[] {
  const rows = db().prepare(`SELECT p.*,COUNT(t.id) task_count,COALESCE(SUM(t.completed),0) completed_count
    FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.user_id=p.user_id
    WHERE p.user_id=? GROUP BY p.id ORDER BY p.is_inbox DESC,p.created_at,p.id`).all(userId);
  return rows.map(row => ({ id: String(row.id), name: String(row.name), description: String(row.description),
    color: String(row.color), isInbox: !!row.is_inbox, taskCount: Number(row.task_count),
    completedCount: Number(row.completed_count), createdAt: String(row.created_at) }));
}
export function requireProject(userId: string, id: string) {
  const project = db().prepare("SELECT * FROM projects WHERE id=? AND user_id=?").get(id, userId);
  if (!project) throw new AppError(404, "Project not found.");
  return project;
}
export function createProject(userId: string, input: { name: string; description?: string; color?: string }) {
  const id = randomUUID();
  db().prepare("INSERT INTO projects(id,user_id,name,description,color,created_at) VALUES(?,?,?,?,?,?)")
    .run(id,userId,input.name,input.description || "",input.color || "indigo",new Date().toISOString());
  return listProjects(userId).find(project => project.id === id)!;
}
export function updateProject(userId: string,id: string,input: {name?: string;description?: string;color?: string}) {
  const old = requireProject(userId,id);
  db().prepare("UPDATE projects SET name=?,description=?,color=? WHERE id=? AND user_id=?")
    .run(input.name ?? old.name,input.description ?? old.description,input.color ?? old.color,id,userId);
  return listProjects(userId).find(project => project.id===id)!;
}
export function deleteProject(userId: string,id: string) {
  const project=requireProject(userId,id);
  if (project.is_inbox) throw new AppError(400,"Your Inbox cannot be deleted.");
  db().prepare("DELETE FROM projects WHERE id=? AND user_id=?").run(id,userId);
}
function taskFromRow(row: Record<string,unknown>): Todo {
  const subtasks=db().prepare("SELECT * FROM subtasks WHERE task_id=? ORDER BY position,id").all(String(row.id));
  return { id:String(row.id),projectId:String(row.project_id),title:String(row.title),description:String(row.description),
    completed:!!row.completed,estimatedMinutes:row.estimated_minutes===null?null:Number(row.estimated_minutes),
    priority:row.priority as Priority,dueDate:row.due_date===null?null:String(row.due_date),position:Number(row.position),
    version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
    subtasks:subtasks.map(s=>({id:String(s.id),title:String(s.title),completed:!!s.completed})) };
}
export function listTasks(userId: string,projectId: string): Todo[] {
  requireProject(userId,projectId);
  return db().prepare("SELECT * FROM tasks WHERE user_id=? AND project_id=? ORDER BY position,created_at,id")
    .all(userId,projectId).map(taskFromRow);
}
export function requireTask(userId: string,id: string): Todo {
  const row=db().prepare("SELECT * FROM tasks WHERE id=? AND user_id=?").get(id,userId);
  if (!row) throw new AppError(404,"Task not found.");
  return taskFromRow(row);
}
export type NewTask = {title:string; description?:string; estimatedMinutes?:number|null; priority?:Priority;dueDate?:string|null;subtasks?:{title:string}[]};
export function createTasks(userId: string,projectId: string,inputs: NewTask[]): Todo[] {
  return transaction(()=>{
    requireProject(userId,projectId);
    const count=Number(db().prepare("SELECT COUNT(*) n FROM tasks WHERE user_id=?").get(userId)!.n);
    if (count+inputs.length>2000) throw new AppError(400,"Your workspace has reached 2,000 tasks. Delete old tasks before adding more.");
    let position=Number(db().prepare("SELECT COALESCE(MAX(position),-1) n FROM tasks WHERE project_id=? AND user_id=?").get(projectId,userId)!.n)+1;
    return inputs.map(input=>{
      const id=randomUUID(),now=new Date().toISOString();
      db().prepare(`INSERT INTO tasks(id,user_id,project_id,title,description,estimated_minutes,priority,due_date,position,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,userId,projectId,input.title,input.description || "",input.estimatedMinutes ?? null,input.priority || "medium",input.dueDate ?? null,position++,now,now);
      for (const [index,sub] of (input.subtasks || []).entries()) {
        db().prepare("INSERT INTO subtasks VALUES(?,?,?,0,?)").run(randomUUID(),id,sub.title,index);
      }
      return requireTask(userId,id);
    });
  });
}
export type TaskPatch = Partial<Pick<Todo,"title"|"description"|"completed"|"estimatedMinutes"|"priority"|"dueDate"|"projectId">> & {subtasks?:Subtask[]};
export function updateTask(userId: string,id: string,version: number,patch: TaskPatch): Todo {
  return transaction(()=>{
    const old=requireTask(userId,id);
    if (old.version!==version) throw new AppError(409,"This task changed while you were working. Your latest changes are safe; reload it and try again.");
    const projectId=patch.projectId ?? old.projectId;requireProject(userId,projectId);
    const task={...old,...patch};
    const position=projectId===old.projectId?old.position:Number(db().prepare("SELECT COALESCE(MAX(position),-1) n FROM tasks WHERE user_id=? AND project_id=?").get(userId,projectId)!.n)+1;
    db().prepare(`UPDATE tasks SET title=?,description=?,completed=?,estimated_minutes=?,priority=?,due_date=?,project_id=?,position=?,version=version+1,updated_at=? WHERE id=? AND user_id=?`)
      .run(task.title,task.description,Number(task.completed),task.estimatedMinutes,task.priority,task.dueDate,projectId,position,new Date().toISOString(),id,userId);
    if (patch.subtasks) {
      // Never accept another task's subtask IDs from a client.
      const own=new Set(old.subtasks.map(s=>s.id));
      db().prepare("DELETE FROM subtasks WHERE task_id=?").run(id);
      for (const [index,sub] of patch.subtasks.entries()) {
        db().prepare("INSERT INTO subtasks VALUES(?,?,?,?,?)").run(own.has(sub.id)?sub.id:randomUUID(),id,sub.title,Number(sub.completed),index);
      }
    }
    return requireTask(userId,id);
  });
}
export function deleteTask(userId: string,id: string) {
  requireTask(userId,id);db().prepare("DELETE FROM tasks WHERE id=? AND user_id=?").run(id,userId);
}
export function sortTasks(userId: string,projectId: string,order:string[],snapshot?:Todo[]) {
  return transaction(()=>{
    const tasks=listTasks(userId,projectId),ids=new Set(tasks.map(t=>t.id));
    if (order.length!==ids.size || new Set(order).size!==ids.size || order.some(id=>!ids.has(id))) throw new AppError(409,"The task list changed. Reload and sort again.");
    if (snapshot && tasks.some(t=>snapshot.find(s=>s.id===t.id)?.version!==t.version)) throw new AppError(409,"Tasks changed while AI was sorting. Please try again.");
    const update=db().prepare("UPDATE tasks SET position=?,version=version+1,updated_at=? WHERE id=? AND user_id=?");
    order.forEach((id,index)=>update.run(index,new Date().toISOString(),id,userId));
    return listTasks(userId,projectId);
  });
}
export function takeRateLimit(key:string,limit:number,windowMs:number) {
  return transaction(()=>{
    const now=Date.now();
    db().prepare("DELETE FROM rate_limits WHERE resets_at<?").run(now);
    const row=db().prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
    if (row && Number(row.count)>=limit) throw new AppError(429,"Too many requests. Please try again shortly.",Math.max(1,Math.ceil((Number(row.resets_at)-now)/1000)));
    db().prepare(`INSERT INTO rate_limits(key,count,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1`).run(key,now+windowMs);
  });
}
export function acquireAiJob(userId:string,resource:string) {
  const token=randomUUID();
  transaction(()=>{
    db().prepare("DELETE FROM ai_jobs WHERE expires_at<?").run(Date.now());
    if(db().prepare("SELECT 1 FROM ai_jobs WHERE resource=?").get(resource))throw new AppError(409,"AI is already working on this item. Please wait for it to finish.");
    const userCount=Number(db().prepare("SELECT COUNT(*) n FROM ai_jobs WHERE user_id=?").get(userId)!.n);
    const total=Number(db().prepare("SELECT COUNT(*) n FROM ai_jobs").get()!.n);
    if(userCount>=2 || total>=8)throw new AppError(429,"AI is busy with other requests. Try again when a running action finishes.",5);
    db().prepare("INSERT INTO ai_jobs VALUES(?,?,?,?)").run(resource,userId,token,Date.now()+35000);
  });
  return ()=>{db().prepare("DELETE FROM ai_jobs WHERE resource=? AND token=?").run(resource,token);};
}
export function applyPlan(userId:string,projectId:string,tasks:PlanTask[]) {
  return createTasks(userId,projectId,tasks);
}
