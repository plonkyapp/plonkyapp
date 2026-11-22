"""Gesamte Testreihe: Angriffe UND normale Abläufe. Aufruf: pruefung.py <Basis-URL>"""
import json, sys, urllib.request, urllib.error, base64

B = sys.argv[1].rstrip('/')
ok = bad = 0
def call(method, path, body=None, secret=None, headers=None, raw=None):
    h = {'Content-Type': 'application/json'}
    if secret: h['X-Plonky-Secret'] = secret
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t.strip().startswith(('{', '[')) else t)
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        try: return e.code, json.loads(t)
        except Exception: return e.code, t
def check(name, cond, detail=''):
    global ok, bad
    if cond: ok += 1; print(f'  ✓ {name}')
    else: bad += 1; print(f'  ✗ {name}   {detail}')
def sec(x): return (x * 40)[:64]           # 64 Zeichen, wie das Frontend
FOTO = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0' + b'x' * 9000).decode()
SA, SB, SC = sec('geheim-a-'), sec('geheim-b-'), sec('geheim-c-')

print('── Normale Abläufe ──')
st, a = call('POST', '/api/account', {'id': 'a1111111111111111111111111111111a', 'name': 'Anna', 'color': '#15A35A', 'kind': 'master', 'avatar': FOTO,
     'crew': [{'id': 1764000000001, 'name': 'Kind', 'color': '#2F6FE0', 'avatar': FOTO}, {'id': 'fab12', 'name': 'Ben', 'color': '#E0792F', 'accountId': 'b2222222222222222222222222222222b'}]}, SA)
A = 'a1111111111111111111111111111111a'; Bb = 'b2222222222222222222222222222222b'; C = 'c3333333333333333333333333333333c'
check('Konto anlegen', st == 200, f'{st} {a}')
check('Foto gespeichert', isinstance(a, dict) and a.get('avatar') == FOTO)
crew = a.get('crew', []) if isinstance(a, dict) else []
check('Crew: 2 Einträge, Felder erhalten', len(crew) == 2 and crew[0]['id'] == 1764000000001 and crew[0]['name'] == 'Kind' and crew[0].get('avatar') == FOTO, str(crew)[:120])
check('Crew: verknüpftes Mitglied behält accountId, trägt kein Foto', len(crew) == 2 and crew[1].get('accountId') == Bb and not crew[1].get('avatar'))
for i, s_ in ((Bb, SB), (C, SC)):
    st, _ = call('POST', '/api/account', {'id': i, 'name': i[:1].upper(), 'color': '#9B4FD8', 'kind': 'companion'}, s_)
    check(f'Konto {i[:1]} anlegen', st == 200, st)
st, a = call('POST', '/api/account', {'id': A, 'name': 'Anna B.'}, SA); check('Name ändern', st == 200 and a['name'] == 'Anna B.')
st, a = call('GET', '/api/account/' + A, secret=SA); check('eigenes Konto voll lesbar', st == 200 and 'crew' in a and a['avatar'] == FOTO)
st, a = call('POST', '/api/account', {'id': A, 'avatar': ''}, SA); check('Foto entfernen', st == 200 and a['avatar'] == '')
st, a = call('POST', '/api/account/resolve', {'secret': SA}); check('persönlicher Link', st == 200 and a['id'] == A)
st, l = call('GET', '/api/accounts?ids=' + A + ',' + Bb); check('Foto-Sammelabfrage', st == 200 and len(l) == 2)

spiel = {'id': 'g1764000000000-ab12cd34ef56ab12', 'account_id': A, 'date': 1764000000000, 'venue': 'Minigolf Dolder', 'mode': 'sequential', 'code': 'ABCDEFGH23456789', 'participants': [Bb, C],
         'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A, 'scores': {'1': 2, '2': 3, '18': 7}},
                     {'id': 1764000000000.4567, 'name': 'Gast', 'color': '#2F6FE0', 'avatar': FOTO, 'scores': {'1': 1}}]}
st, g = call('POST', '/api/games', spiel, SA); check('Runde speichern', st == 200, f'{st} {g}')
st, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
check('Verlauf: Schläge, Gast-Foto, Kennungen erhalten', st == 200 and len(l) == 1 and l[0]['players'][0]['scores'] == {'1': 2, '2': 3, '18': 7} and l[0]['players'][1]['avatar'] == FOTO and l[0]['players'][0]['id'] == 'me' and sorted(l[0]['participants']) == [Bb, C], str(l)[:200])
spiel['players'][0]['scores']['1'] = 5
st, g = call('POST', '/api/games', spiel, SA); check('Besitzer korrigiert', st == 200 and g['players'][0]['scores']['1'] == 5)
st, l = call('GET', '/api/games', secret=SC, headers={'X-Plonky-Account': C}); check('Mitspieler C sieht die Runde', st == 200 and len(l) == 1)
mit = dict(spiel, account_id=Bb, participants=[Bb]); mit['players'][0]['scores']['1'] = 4
st, g = call('POST', '/api/games', mit, SB); check('Mitspieler B korrigiert Schläge', st == 200 and g['players'][0]['scores']['1'] == 4, f'{st}')
st, l = call('GET', '/api/games', secret=SC, headers={'X-Plonky-Account': C}); check('… und kann C dabei NICHT hinauswerfen', st == 200 and len(l) == 1, f'C sieht {len(l) if isinstance(l, list) else l}')
st, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A}); check('… und Anna bleibt Besitzerin', st == 200 and len(l) == 1)

st, s_ = call('POST', '/api/session', {'mode': 'sequential', 'venue': 'Dolder', 'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A, 'scores': {}}, {'id': 'c17', 'name': 'Kind', 'color': '#2F6FE0', 'avatar': FOTO}, {'id': 1764000000000.25, 'name': 'Gast', 'color': '#E0792F'}]})
check('Live-Runde anlegen', st == 200 and len(s_['players']) == 3 and s_['players'][0]['host'] is True and s_['players'][1]['avatar'] == FOTO, f'{st} {str(s_)[:150]}')
code = s_['code'] if st == 200 else 'X'
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': 3}); check('Schlag eintragen', st == 200 and s_['players'][0]['scores'] == {'1': 3})
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 1764000000000.25, 'hole': 2, 'strokes': 4}); check('Schlag für Spieler mit Zahlen-Kennung', st == 200 and s_['players'][2]['scores'] == {'2': 4}, str(s_)[:120])
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': None}); check('Schlag löschen (null)', st == 200 and s_['players'][0]['scores'] == {})
st, s_ = call('POST', f'/api/session/{code}/claim', {'player_id': 'c17', 'avatar': FOTO}); check('Gast belegt Platz mit Foto', st == 200 and s_['players'][1]['claimed'] is True and s_['players'][1]['avatar'] == FOTO)
st, s_ = call('POST', f'/api/session/{code}/players', {'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A}, {'id': 'c17', 'name': 'Kind', 'color': '#2F6FE0'}, {'id': 1764000000000.25, 'name': 'Gast', 'color': '#E0792F'}, {'id': 'neu1', 'name': 'Vierte', 'color': '#9B4FD8'}]})
check('Spielerliste ergänzen, Belegung und Schläge bleiben', st == 200 and len(s_['players']) == 4 and s_['players'][1]['claimed'] is True and s_['players'][2]['scores'] == {'2': 4}, str(s_)[:160])
st, s_ = call('POST', f'/api/session/{code}/leave', {'player_id': 'c17'}); check('Platz verlassen', st == 200 and s_['players'][1]['claimed'] is False)
st, s_ = call('POST', f'/api/session/{code}/finish', {}); check('beenden', st == 200 and s_['finished'] is True)
st, _ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': 9}); check('danach gesperrt (409)', st == 409, st)
st, _ = call('POST', f'/api/session/{code}/claim', {'player_id': 'c17', 'account_id': C}); check('Gast verknüpft Konto nach Ende', st == 200, st)
st, _ = call('POST', '/api/feedback', {'rating': 3, 'message': 'Super', 'name': 'Anna', 'contact': 'a@b.ch', 'account_id': A}); check('Feedback absenden', st == 200, st)

print('── Angriffe ──')
st, a = call('POST', '/api/account', {'id': A, 'avatar': 'https://boese.example/zaehlpixel.png', 'color': 'url(https://boese.example/x)', 'name': 'N' * 500000, 'kind': 'admin'}, SA)
check('fremde Bildadresse als Foto wird übergangen', st == 200 and a['avatar'] == '', str(a.get('avatar'))[:40] if isinstance(a, dict) else st)
check('CSS-Adresse als Farbe wird übergangen', st == 200 and a['color'] == '#15A35A')
check('Name auf 60 Zeichen gekürzt', st == 200 and len(a['name']) == 60)
check('erfundene Kontoart wird übergangen', st == 200 and a['kind'] == 'master')
st, a = call('POST', '/api/account', {'id': A, 'avatar': 'data:image/svg+xml;base64,PHN2Zz4='}, SA); check('SVG als Foto wird übergangen', st == 200 and a['avatar'] == '')
st, a = call('POST', '/api/account', {'id': A, 'crew': [5, 'x', None, {'name': {'a': 1}}, {'id': {'x': 1}, 'name': 'Y'}, {'id': 7, 'name': 12345, 'color': 'rot', 'avatar': 'https://x', 'boese': {'tief': [1, 2]}}]}, SA)
check('Crew: Unbrauchbares fällt weg, Rest wird bereinigt', st == 200 and a['crew'] == [{'id': 7, 'name': '', 'color': ''}], str(a.get('crew'))[:140] if isinstance(a, dict) else st)
st, _ = call('POST', '/api/account', raw=b'[1,2,3]', secret=SA); check('Liste statt Objekt als Rumpf → 400, kein 500', st == 400, st)
st, _ = call('POST', '/api/account', {'id': '../../etc/passwd', 'name': 'x'}, sec('zz')); check('Konto-Kennung mit Sonderzeichen → 400', st == 400, st)
st, _ = call('POST', '/api/account', {'id': 'd4444444444444444444444444444444d', 'name': 'x'}, 'kurz'); check('zu kurzes Geheimnis → 400', st == 400, st)
st, _ = call('POST', '/api/account', {'id': 'e5555555555555555555555555555555e', 'name': 'x'}, SA); check('zweites Konto mit demselben Geheimnis → 409', st == 409, st)
st, _ = call('POST', '/api/account', {'id': 'f6666666666666666666666666666666f', 'name': 'x'}); check('Konto ohne Geheimnis → 400', st == 400, st)
st, _ = call('POST', '/api/account', {'id': Bb, 'name': 'GEKAPERT'}, SA); check('fremdes Profil überschreiben → 403', st == 403, st)
st, _ = call('GET', '/api/games', secret=SB, headers={'X-Plonky-Account': A}); check('fremden Verlauf lesen → 403', st == 403, st)
st, _ = call('POST', '/api/games', dict(spiel, account_id=C, venue='GEFAELSCHT'), SC, headers={'X-Plonky-Account': A}); st2, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
check('Mitspieler darf korrigieren, aber Besitzer und Anlage bleiben nachvollziehbar', st == 200 and len(l) == 1)
fremd = sec('fremd-x-'); call('POST', '/api/account', {'id': 'x7777777777777777777777777777777x', 'name': 'Fremd'}, fremd)
st, _ = call('POST', '/api/games', dict(spiel, account_id='x7777777777777777777777777777777x', venue='GEFAELSCHT'), fremd, headers={'X-Plonky-Account': A}); check('Unbeteiligter mit Kopfzeilen-Trick → 403', st == 403, st)
st, g = call('POST', '/api/games', {'id': 'g-typen', 'account_id': A, 'date': 'gestern', 'venue': {'a': 1}, 'players': [5, {'id': 1, 'name': 99, 'color': 'url(x)', 'avatar': 'https://x', 'scores': {'1': {'k': 1}, 'abc': 3, '2': 2.0, '3': '4', '4': True, '500': 2}}]}, SA)
check('Runde mit falschen Typen: bereinigt statt 500', st == 200 and g['venue'] == '' and len(g['players']) == 1 and g['players'][0]['name'] == '' and g['players'][0]['color'] == '' and g['players'][0]['avatar'] == '' and g['players'][0]['scores'] == {'2': 2, '3': 4}, f'{st} {str(g)[:200]}')
st, s2 = call('POST', '/api/session', {'players': [{'id': 1, 'name': 12345, 'color': ['x'], 'scores': {'1': {'kaputt': True}}}, 'kein-objekt', {'name': 'ohne Kennung'}]})
check('Live-Runde mit falschen Typen: bereinigt', st == 200 and len(s2['players']) == 1 and s2['players'][0]['name'] == '' and s2['players'][0]['scores'] == {}, f'{st} {str(s2)[:160]}')
c2 = s2['code'] if st == 200 else 'X'
st, _ = call('POST', f'/api/session/{c2}/score', {'player_id': 1, 'hole': 1, 'strokes': {'kaputt': True}}); check('Objekt als Schlag → 400', st == 400, st)
st, _ = call('POST', f'/api/session/{c2}/score', {'player_id': 1, 'hole': 'abc', 'strokes': 2}); check('Text als Bahn → 400', st == 400, st)
st, _ = call('POST', f'/api/session/{c2}/score', {'player_id': 1, 'hole': 1, 'strokes': 5000}); check('5000 Schläge → 400', st == 400, st)
st, s3 = call('POST', f'/api/session/{c2}/players', {'players': [{'id': 1, 'name': 777, 'avatar': 'https://x'}]}); check('Spielerliste mit falschen Typen: bereinigt', st == 200 and s3['players'][0]['name'] == '' and s3['players'][0]['avatar'] == '', str(s3)[:120])
st, _ = call('POST', '/api/feedback', raw=json.dumps({'rating': 3, 'message': 'x' * 30000}).encode()); check('Feedback über 20 KB → 413', st == 413, st)
st, _ = call('POST', f'/api/session/{c2}/score', raw=json.dumps({'player_id': 1, 'hole': 1, 'strokes': 2, 'ballast': 'x' * 20000}).encode()); check('aufgeblähter Schlag (20 KB) → 413', st == 413, st)
st, _ = call('POST', '/api/feedback', {'rating': 'drei', 'message': {'a': 1}}); check('Feedback mit falschen Typen → 400, kein 500', st == 400, st)

print('── Rollen in der Live-Runde ──')
HK, SK, SK2, SK3 = 'a1' * 16, 'b2' * 16, 'c3' * 16, 'd4' * 16
H = {'X-Plonky-Host': HK}
st, r = call('POST', '/api/session', {'venue': 'Dolder', 'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A}, {'id': 'c1', 'name': 'Kind', 'color': '#2F6FE0'}, {'id': 'c2', 'name': 'Ben', 'color': '#E0792F'}]}, headers=H)
check('Runde mit Gastgeber-Schlüssel anlegen', st == 200, st); rc = r['code'] if st == 200 else 'X'
check('Antwort verrät keinen Schlüssel oder Abdruck', 'hash' not in json.dumps(r) and HK not in json.dumps(r))
sc = lambda pid, strokes, h=None: call('POST', f'/api/session/{rc}/score', {'player_id': pid, 'hole': 1, 'strokes': strokes}, headers=h)[0]
print('  · Fremder, der nur den Code hat')
check('Schlag eintragen → 403', sc('c1', 9) == 403)
check('Spielerliste ersetzen → 403', call('POST', f'/api/session/{rc}/players', {'players': []})[0] == 403)
check('beenden → 403', call('POST', f'/api/session/{rc}/finish', {})[0] == 403)
check('verwerfen → 403', call('DELETE', f'/api/session/{rc}')[0] == 403)
check('Platz ohne Platz-Schlüssel belegen → 400', call('POST', f'/api/session/{rc}/claim', {'player_id': 'c1'})[0] == 400)
check('Platz des Gastgebers belegen → 403', call('POST', f'/api/session/{rc}/claim', {'player_id': 'me'}, headers={'X-Plonky-Slot': SK3})[0] == 403)
check('lesen bleibt möglich (das ist die Einladung)', call('GET', f'/api/session/{rc}')[0] == 200)
print('  · Gast, der Platz c1 belegt')
S1 = {'X-Plonky-Slot': SK}
st, r = call('POST', f'/api/session/{rc}/claim', {'player_id': 'c1', 'avatar': FOTO, 'account_id': Bb}, headers=S1)
check('Platz belegen', st == 200 and r['players'][1]['claimed'] is True, st)
check('fremde Konto-Nummer OHNE deren Zugang wird nicht verknüpft', st == 200 and r['players'][1]['account_id'] is None, str(r['players'][1].get('account_id')) if st == 200 else st)
check('zweiter Versuch mit demselben Schlüssel gelingt (Funkloch)', call('POST', f'/api/session/{rc}/claim', {'player_id': 'c1'}, headers=S1)[0] == 200)
check('eigener Schlag → 200', sc('c1', 3, S1) == 200)
check('fremder Schlag → 403', sc('c2', 9, S1) == 403)
check('Schlag des Gastgebers → 403', sc('me', 9, S1) == 403)
check('beenden → 403', call('POST', f'/api/session/{rc}/finish', {}, headers=S1)[0] == 403)
check('verwerfen → 403', call('DELETE', f'/api/session/{rc}', headers=S1)[0] == 403)
check('Spielerliste ersetzen → 403', call('POST', f'/api/session/{rc}/players', {'players': []}, headers=S1)[0] == 403)
check('fremden Platz räumen → 403', call('POST', f'/api/session/{rc}/leave', {'player_id': 'c2'}, headers=S1)[0] == 403)
print('  · zweiter Gast')
check('belegten Platz übernehmen → 409', call('POST', f'/api/session/{rc}/claim', {'player_id': 'c1'}, headers={'X-Plonky-Slot': SK2})[0] == 409)
st, r = call('POST', f'/api/session/{rc}/claim', {'player_id': 'c2', 'account_id': Bb}, secret=SB, headers={'X-Plonky-Slot': SK2})
check('freien Platz belegen, MIT Zugang zum Konto → verknüpft', st == 200 and r['players'][2]['account_id'] == Bb, st)
st, r = call('POST', f'/api/session/{rc}/claim', {'player_id': 'c2', 'account_id': Bb}, secret=SB, headers={'X-Plonky-Slot': SK3})
check('Wiedereinstieg mit dem Konto und NEUEM Schlüssel (anderes Gerät)', st == 200, st)
check('… der alte Schlüssel gilt danach nicht mehr', sc('c2', 4, {'X-Plonky-Slot': SK2}) == 403)
check('… der neue schon', sc('c2', 4, {'X-Plonky-Slot': SK3}) == 200)
print('  · Gastgeber')
check('tippt für jeden Platz', sc('c1', 5, H) == 200 and sc('me', 2, H) == 200)
st, r = call('POST', f'/api/session/{rc}/players', {'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A}, {'id': 'c1', 'name': 'Kind', 'color': '#2F6FE0'}, {'id': 'c2', 'name': 'Ben', 'color': '#E0792F'}, {'id': 'c3', 'name': 'Neu', 'color': '#9B4FD8'}]}, headers=H)
check('ändert die Spielerliste', st == 200 and len(r['players']) == 4, st)
check('… der Gast behält dabei seinen Platz', sc('c1', 6, S1) == 200)
check('räumt einen fremden Platz', call('POST', f'/api/session/{rc}/leave', {'player_id': 'c2'}, headers=H)[0] == 200)
check('… der dann neu belegt werden kann', call('POST', f'/api/session/{rc}/claim', {'player_id': 'c2'}, headers={'X-Plonky-Slot': SK2})[0] == 200)
st, r = call('GET', f'/api/session/{rc}')
check('Stand stimmt, kein Abdruck in der Ausgabe', st == 200 and r['players'][1]['scores'] == {'1': 6} and 'hash' not in json.dumps(r), str(r)[:160])
check('beendet', call('POST', f'/api/session/{rc}/finish', {}, headers=H)[0] == 200)
check('danach nimmt die Runde nichts mehr an (409)', sc('c1', 7, S1) == 409 and sc('c1', 7, H) == 409)
st, r2 = call('POST', '/api/session', {'players': [{'id': 'me', 'name': 'A'}]}, headers=H)
check('Gastgeber verwirft eine laufende Runde', st == 200 and call('DELETE', f"/api/session/{r2['code']}", headers=H)[0] == 200)

print(f'\n  {ok} bestanden, {bad} fehlgeschlagen')
sys.exit(1 if bad else 0)
