import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db,transaction,consumeRateLimits } from './store.ts';
import { AppError } from './errors.ts';
import { learningRole } from './sso.ts';

const lessonId=z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const source=z.string().min(1).max(60*1024).refine(value=>Buffer.byteLength(value,'utf8')<=60*1024,'Source must be 60 KB or smaller.');
export const experimentSchema=z.object({title:z.string().trim().min(1).max(120),source,lessonId:lessonId.optional()}).strict();
export const experimentPatchSchema=experimentSchema.partial().refine(value=>Object.keys(value).length>0,'Choose a field to update.');
export const progressSchema=z.object({completedLessonIds:z.array(lessonId).max(100).refine(value=>new Set(value).size===value.length,'Lesson IDs must be unique.')}).strict();
export type ExperimentInput=z.infer<typeof experimentSchema>;
export type LearningProgress=z.infer<typeof progressSchema>;
export type Experiment={id:string;title:string;source:string;lessonId?:string;createdAt:string;updatedAt:string};
export function requireLearningRole(){if(!learningRole())throw new AppError(404,'Not found.');}

function tables(){db().exec(`
 CREATE TABLE IF NOT EXISTS learning_experiments(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,source TEXT NOT NULL,lesson_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS learning_experiment_owner ON learning_experiments(user_id,updated_at);
 CREATE TABLE IF NOT EXISTS learning_progress(
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,completed_lesson_ids TEXT NOT NULL,updated_at TEXT NOT NULL);
`);}
function fromRow(row:Record<string,unknown>):Experiment{return {id:String(row.id),title:String(row.title),source:String(row.source),...(row.lesson_id?{lessonId:String(row.lesson_id)}:{}),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function reserveWrite(userId:string){consumeRateLimits([{key:'learning-write:'+userId,limit:30,windowMs:60000}]);}
export function listExperiments(userId:string){tables();return db().prepare('SELECT * FROM learning_experiments WHERE user_id=? ORDER BY updated_at DESC,id').all(userId).map(fromRow);}
export function getExperiment(userId:string,id:string):Experiment{
 tables();const row=db().prepare('SELECT * FROM learning_experiments WHERE id=? AND user_id=?').get(id,userId);
 if(!row)throw new AppError(404,'Experiment not found.');return fromRow(row);
}
export function createExperiment(userId:string,input:ExperimentInput):Experiment{
 const data=experimentSchema.parse(input);tables();return transaction(()=>{
  reserveWrite(userId);
  if(Number(db().prepare('SELECT COUNT(*) n FROM learning_experiments WHERE user_id=?').get(userId)!.n)>=100)throw new AppError(400,'You can save up to 100 experiments. Delete an old experiment first.');
  if(Number(db().prepare('SELECT COUNT(*) n FROM learning_experiments').get()!.n)>=5000)throw new AppError(503,'Cloud experiment storage is full. Your browser copy can still be saved.');
  const id=randomUUID(),now=new Date().toISOString();db().prepare('INSERT INTO learning_experiments VALUES(?,?,?,?,?,?,?)').run(id,userId,data.title,data.source,data.lessonId||null,now,now);return getExperiment(userId,id);
 });
}
export function updateExperiment(userId:string,id:string,input:Partial<ExperimentInput>):Experiment{
 const data=experimentPatchSchema.parse(input);tables();return transaction(()=>{
  const old=getExperiment(userId,id);reserveWrite(userId);
  db().prepare('UPDATE learning_experiments SET title=?,source=?,lesson_id=?,updated_at=? WHERE id=? AND user_id=?').run(data.title??old.title,data.source??old.source,data.lessonId??old.lessonId??null,new Date().toISOString(),id,userId);return getExperiment(userId,id);
 });
}
export function deleteExperiment(userId:string,id:string){tables();transaction(()=>{getExperiment(userId,id);reserveWrite(userId);db().prepare('DELETE FROM learning_experiments WHERE id=? AND user_id=?').run(id,userId);});}
export function getLearningProgress(userId:string){tables();const row=db().prepare('SELECT completed_lesson_ids,updated_at FROM learning_progress WHERE user_id=?').get(userId);return {completedLessonIds:row?JSON.parse(String(row.completed_lesson_ids)) as string[]:[],updatedAt:row?String(row.updated_at):null};}
export function saveLearningProgress(userId:string,input:LearningProgress){
 const data=progressSchema.parse(input);tables();return transaction(()=>{reserveWrite(userId);db().prepare('INSERT INTO learning_progress VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET completed_lesson_ids=excluded.completed_lesson_ids,updated_at=excluded.updated_at').run(userId,JSON.stringify(data.completedLessonIds),new Date().toISOString());return getLearningProgress(userId);});
}
