#!/usr/bin/env python3
"""Run on the droplet with database access; remove only this run's test accounts."""
import json
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
        _, flags = self.call('/api/auth/register', 'POST',
                             {'name': 'Workspace check', 'email': email, 'password': password}, 201)
        assert all(x in flags.lower() for x in ['secure', 'httponly', 'samesite=lax'])
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
    alice.call('/api/auth/login', 'POST', {'email': email, 'password': password})
    assert len(alice.call(path + '/tasks')[0]['tasks']) == len(sorted_tasks)
    print('PASS live ownership isolation, saved subtask progress, plan preview/acceptance, AI sorting and re-login persistence')
finally:
    with sqlite3.connect('/var/lib/smart-todolist/workspace.sqlite') as database:
        database.execute('PRAGMA foreign_keys=ON')
        for email in emails:
            database.execute('DELETE FROM users WHERE email=?', (email,))
    print('Temporary verification accounts removed')
