import { createServer } from 'node:http';
const attempts=new Map();
createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;
 const input=JSON.parse(raw),context=JSON.parse(input.messages[1].content),instruction=input.messages[0].content,title=context.task?.title || context.brief || 'Task';
 const count=(attempts.get(title)||0)+1;attempts.set(title,count);
 if(title.includes('[fail-once]')&&count===1){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'test provider unavailable'}));return;}
 await new Promise(resolve=>setTimeout(resolve,title.includes('[timeout]')?3000:900));
 let result={description:`Complete “${title}” with a small working result and verify it.`,estimatedMinutes:45,subtasks:[{title:'Prepare the materials'},{title:'Implement and verify the result'}]};
 if(instruction.includes('PLAN_PROJECT'))result={reply:'Start with a small, verifiable release.',tasks:[{title:'Draft the first screen',description:'Create a simple first screen.',priority:'high',estimatedMinutes:30,subtasks:[{title:'Sketch layout'},{title:'Implement layout'}]},{title:'Check the result',description:'Test the main flow.',priority:'medium',estimatedMinutes:20,subtasks:[{title:'Test desktop'},{title:'Test mobile'}]}]};
 if(instruction.includes('"order"'))result={order:context.tasks.map(t=>t.id).reverse(),reason:'Prioritized the next useful step.'};
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
}).listen(Number(process.env.MOCK_PORT||4110),'127.0.0.1',()=>console.log('Local test provider ready'));
