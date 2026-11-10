#!/usr/bin/env python3
"""Run on the droplet with database access; remove only this run's test accounts."""
import json
import hashlib
import secrets
import datetime
import sqlite3
import time
import urllib.error
import urllib.request
import uuid

BASE = 'https://smart-todolist.giorgi.app'
emails = []


class Client:
    def __init__(self):
        self.cookie = ''

    def call(self, path, method='GET', body=None, expected=200):
        headers = {'Origin': BASE, 'Content-Type': 'application/json'}
        if self.cookie:
            headers['Cookie'] = self.cookie
        req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            response = urllib.request.urlopen(req, timeout=32)
        except urllib.error.HTTPError as error:
            response = error
        data = json.loads(response.read())
        flags = response.headers.get('Set-Cookie', '')
        if flags:
            self.cookie = flags.split(';')[0]
        assert response.status == expected, (path, response.status, data.get('error'))
        return data, flags

    def register(self):
        email = 'workspace-check-' + uuid.uuid4().hex + '@example.invalid'
        emails.append(email)
        password = uuid.uuid4().hex + '-check'
        # Fixtures avoid sending real verification emails to nonexistent recipients.
        self.user_id = str(uuid.uuid4())
        salt = secrets.token_hex(16)
        derived = hashlib.scrypt(password.encode(),salt=salt.encode(),n=32768,r=8,p=1,maxmem=64*1024*1024,dklen=64).hex()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
            database.execute('PRAGMA foreign_keys=ON')
            database.execute('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',
                             (self.user_id,email,'Workspace check','scrypt$'+salt+'$'+derived,now))
            database.execute('INSERT INTO projects(id,user_id,name,is_inbox,created_at) VALUES(?,?,?,1,?)',
                             (str(uuid.uuid4()),self.user_id,'Inbox',now))
        # A temporary app session tests task routes without emailing fake recipients.
        token = secrets.token_hex(32)
        with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
            database.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),self.user_id,int(time.time()*1000)+3600000))
        self.cookie='__Host-giorgi_workspace='+token
        return email, password


try:
    alice, bob = Client(), Client()
    email, password = alice.register()
    bob.register()
    project = alice.call('/api/projects', 'POST', {'name': 'Temporary live verification'}, 201)[0]['project']
    path = '/api/projects/' + project['id']
    task = alice.call(path + '/tasks', 'POST',
                      {'tasks': [{'title': 'Write and test a small website contact form', 'priority': 'high'}]}, 201)[0]['tasks'][0]
    bob.call(path + '/tasks', expected=404)
    bob.call('/api/tasks/' + task['id'], 'PATCH', {'version': task['version'], 'title': 'Not mine'}, 404)
    for action in ['describe','estimate','split','enrich']:
        alice.call('/api/tasks/'+task['id']+'/assist','POST',{'action':action},403)
    alice.call(path+'/assistant','POST',{'message':'Must not reach AI while unverified'},403)
    alice.call(path+'/sort','POST',{'mode':'ai'},403)
    alice.call('/api/auth/register','POST',{'name':'Bot','email':'honeypot@example.invalid','password':'a-long-test-password','website':'spam.invalid'},400)
    assert alice.call('/api/workspace')[0]['user']['emailVerified'] is False
    token = secrets.token_hex(32)
    with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
        database.execute('PRAGMA foreign_keys=ON')
        database.execute('INSERT INTO email_verifications VALUES(?,?,?,?)',
                         (alice.user_id,hashlib.sha256(token.encode()).hexdigest(),int(time.time()*1000)+3600000,int(time.time()*1000)))
    with urllib.request.urlopen(BASE+'/verify-email',timeout=15) as response:assert response.status==200
    assert alice.call('/api/workspace')[0]['user']['emailVerified'] is False
    bob.call('/api/auth/verify-email','POST',{'token':token})
    alice.call('/api/auth/verify-email','POST',{'token':token},400)
    assert alice.call('/api/workspace')[0]['user']['emailVerified'] is True
    assert bob.call('/api/workspace')[0]['user']['emailVerified'] is False
    print('PASS live unverified AI blocking, explicit single-use verification and correct account binding')
    for action in ['describe', 'estimate', 'split']:
        started = time.monotonic()
        task = alice.call('/api/tasks/' + task['id'] + '/assist', 'POST', {'action': action})[0]['task']
        assert time.monotonic() - started < 30
        if action == 'describe':
            assert task['description']
        elif action == 'estimate':
            assert task['estimatedMinutes'] > 0
        else:
            assert len(task['subtasks']) >= 2
        print('PASS live OpenAI', action, 'in', round(time.monotonic() - started, 1), 'seconds')
    task['subtasks'][0]['completed'] = True
    task = alice.call('/api/tasks/' + task['id'], 'PATCH',
                      {'version': task['version'], 'subtasks': task['subtasks']})[0]['task']
    plan = alice.call(path + '/assistant', 'POST',
                      {'message': 'Plan a tiny personal website launch with a desktop and mobile check. Suggest two tasks.'})[0]['plan']
    assert len(alice.call(path + '/tasks')[0]['tasks']) == 1, 'Plan saved without acceptance'
    assert plan['tasks']
    alice.call(path + '/tasks', 'POST', {'tasks': plan['tasks']}, 201)
    sorted_tasks = alice.call(path + '/sort', 'POST', {'mode': 'ai'})[0]['tasks']
    assert len(sorted_tasks) == 1 + len(plan['tasks'])
    assert next(t for t in sorted_tasks if t['id'] == task['id'])['subtasks'][0]['completed']
    alice.call('/api/auth/logout', 'POST', {})
    alice.call('/api/workspace', expected=401)
    token=secrets.token_hex(32)
    with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
        database.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),alice.user_id,int(time.time()*1000)+3600000))
    alice.cookie='__Host-giorgi_workspace='+token
    assert len(alice.call(path + '/tasks')[0]['tasks']) == len(sorted_tasks)
    print('PASS live ownership isolation, saved subtask progress, plan preview/acceptance, AI sorting and re-login persistence')
finally:
    with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
        database.execute('PRAGMA foreign_keys=ON')
        for email in emails:
            database.execute('DELETE FROM users WHERE email=?', (email,))
    print('Temporary verification accounts removed')
