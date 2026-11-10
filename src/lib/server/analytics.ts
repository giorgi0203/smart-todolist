import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db,transaction,consumeRateLimits } from './store.ts';
import { contactOwnerEmail } from './contact.ts';
import { AppError } from './errors.ts';
import type { User } from '../types.ts';
const targets=['angular-compiler.giorgi.app','example-mcp.giorgi.app','mcp.giorgi.app','api.giorgi.app','hls-player.giorgi.app','smart-todolist.giorgi.app','www.facebook.com','www.linkedin.com','github.com','www.instagram.com'] as const;
export const eventSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('pageview'),label:z.literal('home'),referrer:z.string().max(253).optional()}).strict(),
 z.object({kind:z.literal('outbound'),label:z.enum(targets),referrer:z.string().max(253).optional()}).strict(),
]);
export const analyticsSites=['angular-compiler.giorgi.app','example-mcp.giorgi.app','mcp.giorgi.app','api.giorgi.app','giorgi.app','smart-todolist.giorgi.app','hls-player.giorgi.app','auth.giorgi.app'] as const;
export type AnalyticsSite=typeof analyticsSites[number];
function table(){
 db().exec('CREATE TABLE IF NOT EXISTS site_analytics(day TEXT NOT NULL,site TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,referrer TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,site,kind,label,referrer));CREATE TABLE IF NOT EXISTS analytics_migrations(name TEXT PRIMARY KEY)');
 if(!db().prepare("SELECT 1 FROM analytics_migrations WHERE name='sites-v1'").get()){
  if(db().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='portfolio_analytics'").get())db().exec("INSERT OR IGNORE INTO site_analytics SELECT day,'giorgi.app',kind,label,referrer,count FROM portfolio_analytics");
  db().prepare("INSERT OR IGNORE INTO analytics_migrations VALUES('sites-v1')").run();
 }
}
export function recordEvent(input:z.infer<typeof eventSchema>,ip:string,site:AnalyticsSite='giorgi.app'){
 const day=new Date().toISOString().slice(0,10),fingerprint=createHash('sha256').update(day+':'+ip).digest('hex');
 let referrer=(input.referrer||'').toLowerCase();
 if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(referrer)||(referrer===site||(site==='giorgi.app'&&referrer==='www.giorgi.app')))referrer='Direct';
 transaction(()=>{table();consumeRateLimits([{key:'analytics-minute:'+fingerprint,limit:20,windowMs:60000},{key:'analytics-day:'+fingerprint,limit:200,windowMs:86400000},{key:'analytics-global',limit:10000,windowMs:86400000}]);
 db().prepare('DELETE FROM site_analytics WHERE day<?').run(new Date(Date.now()-90*86400000).toISOString().slice(0,10));
 db().prepare('INSERT INTO site_analytics VALUES(?,?,?,?,?,1) ON CONFLICT(day,site,kind,label,referrer) DO UPDATE SET count=count+1').run(day,site,input.kind,input.label,referrer);
 });
}
export function requireAnalyticsOwner(user:User){if(!user.emailVerified||user.email.toLowerCase()!==contactOwnerEmail())throw new AppError(403,'This private dashboard requires the site owner’s verified account.');}
export function analyticsSummary(selected:AnalyticsSite|'all'='all'){
 table();const since=new Date(Date.now()-29*86400000).toISOString().slice(0,10),args=[since,selected,selected];
 const daily=db().prepare("SELECT day,SUM(CASE WHEN kind='pageview' THEN count ELSE 0 END) views,SUM(CASE WHEN kind='outbound' THEN count ELSE 0 END) clicks FROM site_analytics WHERE day>=? AND (?='all' OR site=?) GROUP BY day ORDER BY day").all(...args) as {day:string;views:number;clicks:number}[];
 const referrers=db().prepare("SELECT referrer,SUM(count) count FROM site_analytics WHERE day>=? AND (?='all' OR site=?) AND kind='pageview' GROUP BY referrer ORDER BY count DESC LIMIT 15").all(...args) as {referrer:string;count:number}[];
 const links=db().prepare("SELECT label,SUM(count) count FROM site_analytics WHERE day>=? AND (?='all' OR site=?) AND kind='outbound' GROUP BY label ORDER BY count DESC").all(...args) as {label:string;count:number}[];
 const sites=db().prepare("SELECT site,SUM(CASE WHEN kind='pageview' THEN count ELSE 0 END) views,SUM(CASE WHEN kind='outbound' THEN count ELSE 0 END) clicks FROM site_analytics WHERE day>=? GROUP BY site ORDER BY views DESC").all(since) as {site:AnalyticsSite;views:number;clicks:number}[];
 const hasContact=db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_messages'").get();
 const enquiries=hasContact&&(selected==='all'||selected==='giorgi.app')?Number(db().prepare("SELECT COUNT(*) n FROM contact_messages WHERE status='sent' AND created_at>=?").get(since)!.n):0;
 return {daily,referrers,links,sites,enquiries,views:daily.reduce((n,r)=>n+Number(r.views),0),clicks:daily.reduce((n,r)=>n+Number(r.clicks),0)};
}
