#!/usr/bin/env python3
"""Production SSO smoke test; creates and removes only its own fixture account."""
import datetime,hashlib,http.cookiejar,json,secrets,sqlite3,urllib.request,urllib.error,uuid
identity='https://auth.giorgi.app';app='https://smart-todolist.giorgi.app'
identifier=str(uuid.uuid4());email='sso-check-'+uuid.uuid4().hex+'@example.invalid';password=secrets.token_hex(24);salt=secrets.token_hex(16);now=datetime.datetime.now(datetime.timezone.utc).isoformat()
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(url,body=None,origin=identity):
 req=urllib.request.Request(url,headers={'Content-Type':'application/json','Origin':origin},data=None if body is None else json.dumps(body).encode())
 try:response=opener.open(req,timeout=25)
 except urllib.error.HTTPError as error:response=error
 return response.status,response.read(),response.headers
try:
 with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as db:
  db.execute('PRAGMA foreign_keys=ON');db.execute('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',(identifier,email,'Shared auth check','scrypt$'+salt+'$'+hashlib.scrypt(password.encode(),salt=salt.encode(),n=32768,r=8,p=1,maxmem=64*1024*1024,dklen=64).hex(),now));db.execute('INSERT INTO projects(id,user_id,name,is_inbox,created_at) VALUES(?,?,?,1,?)',(str(uuid.uuid4()),identifier,'Inbox',now));db.execute('INSERT INTO email_confirmations VALUES(?,?)',(identifier,now))
 status,_,headers=call(identity+'/api/auth/login',{'email':email,'password':password});assert status==200,status
 assert '__Host-giorgi_identity=' in headers.get('Set-Cookie','') and 'Domain=' not in headers.get('Set-Cookie','')
 assert call(app+'/api/workspace')[0]==401
 assert call(app+'/api/auth/login',{'email':email,'password':password},origin=app)[0]==410
 assert call(app+'/api/auth/sso/start')[0]==200
 status,body,_=call(app+'/api/workspace');assert status==200 and json.loads(body)['user']['id']==identifier
 workspace_cookie=next(c for c in jar if c.name=='__Host-giorgi_workspace' and c.domain=='smart-todolist.giorgi.app')
 wrong=urllib.request.Request(identity+'/api/auth/session',headers={'Cookie':'__Host-giorgi_identity='+workspace_cookie.value})
 with urllib.request.urlopen(wrong,timeout=20) as response:assert json.load(response)['user'] is None
 status,body,_=call(identity+'/analytics');assert status==200 and b'Daily page views' not in body and b'Private analytics' in body
 assert call(identity+'/api/projects')[0]==404
 assert call(identity+'/api/auth/logout',{})[0]==200
 assert call(app+'/api/workspace')[0]==401
 print('PASS live HTTPS shared sign-in, host-only cookies, PKCE app exchange, private analytics, service isolation and global logout')
finally:
 with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as db:
  db.execute('PRAGMA foreign_keys=ON');db.execute('DELETE FROM users WHERE id=? AND email=?',(identifier,email))
 print('Shared-auth fixture removed')
