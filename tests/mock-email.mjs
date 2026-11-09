import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
const messages=[];
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Content-Type','application/json');
 if(req.method==='POST'&&url.pathname==='/emails'){
  let raw='';for await(const part of req)raw+=part;
  const data=JSON.parse(raw);messages.push(data);
  res.end(JSON.stringify({id:randomUUID()}));return;
 }
 if(req.method==='GET'&&url.pathname==='/messages'){
  res.end(JSON.stringify(messages.filter(m=>m.to.includes(url.searchParams.get('email')))));return;
 }
 res.writeHead(404).end('{}');
}).listen(Number(process.env.MOCK_EMAIL_PORT||4111),'127.0.0.1',()=>console.log('Local email test provider ready'));
