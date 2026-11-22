"""Gesamte Testreihe: Angriffe UND normale Abläufe. Aufruf: pruefung.py <Basis-URL>"""
import json, sys, urllib.request, urllib.error, base64

B = sys.argv[1].rstrip('/')
ADMIN = sys.argv[2] if len(sys.argv) > 2 else ''     # Schluessel des Testservers
FBKEY = sys.argv[3] if len(sys.argv) > 3 else ''
class _KeineUmleitung(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
OPENER = urllib.request.build_opener(_KeineUmleitung)
ok = bad = 0
LAST = {}
def call(method, path, body=None, secret=None, headers=None, raw=None):
    global LAST
    h = {'Content-Type': 'application/json'}
    if secret: h['X-Plonky-Secret'] = secret
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with OPENER.open(req, timeout=20) as r:
            t = r.read().decode()
            LAST = dict(r.headers.items()); LAST['_cookies'] = r.headers.get_all('Set-Cookie') or []
            return r.status, (json.loads(t) if t.strip().startswith(('{', '[')) else t)
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        LAST = dict(e.headers.items()); LAST['_cookies'] = e.headers.get_all('Set-Cookie') or []
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

# Teilnehmer wird nur, wer sich in einer Runde des Besitzers SELBST ausgewiesen hat.
HK0 = 'e5' * 16
st, r0 = call('POST', '/api/session', {'venue': 'Minigolf Dolder', 'players': [{'id': 'me', 'name': 'Anna', 'account_id': A}, {'id': 'c1', 'name': 'B'}, {'id': 'c2', 'name': 'C'}]}, SA, headers={'X-Plonky-Host': HK0})
R0 = r0['code'] if st == 200 else 'X'
st1, _ = call('POST', f'/api/session/{R0}/claim', {'player_id': 'c1', 'account_id': Bb}, SB, headers={'X-Plonky-Slot': 'f6' * 16})
st2, _ = call('POST', f'/api/session/{R0}/claim', {'player_id': 'c2', 'account_id': C}, SC, headers={'X-Plonky-Slot': 'a7' * 16})
check('Vorlauf: Live-Runde, B und C treten mit Kontonachweis bei', st == 200 and st1 == 200 and st2 == 200, f'{st} {st1} {st2}')
spiel = {'id': 'g1764000000000-ab12cd34ef56ab12', 'account_id': A, 'date': 1764000000000, 'venue': 'Minigolf Dolder', 'mode': 'sequential', 'code': R0, 'participants': [Bb, C],
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
check('Live-Runde anlegen', st == 200 and len(s_['players']) == 3 and s_['players'][0]['host'] is True, f'{st} {str(s_)[:150]}')
code = s_['code'] if st == 200 else 'X'
st, voll = call('GET', f'/api/session/{code}?full=1'); st2, schlank = call('GET', f'/api/session/{code}')
check('Fotos nur im vollen Abruf, der Abgleich bleibt schlank', st == 200 and voll['players'][1]['avatar'] == FOTO and schlank['players'][1]['avatar'] == '' and len(json.dumps(schlank)) < 1500)
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': 3}); check('Schlag eintragen', st == 200 and s_['players'][0]['scores'] == {'1': 3})
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 1764000000000.25, 'hole': 2, 'strokes': 4}); check('Schlag für Spieler mit Zahlen-Kennung', st == 200 and s_['players'][2]['scores'] == {'2': 4}, str(s_)[:120])
st, s_ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': None}); check('Schlag löschen (null)', st == 200 and s_['players'][0]['scores'] == {})
st, s_ = call('POST', f'/api/session/{code}/claim', {'player_id': 'c17', 'avatar': FOTO}); check('Gast belegt Platz mit Foto', st == 200 and s_['players'][1]['claimed'] is True and call('GET', f'/api/session/{code}?full=1')[1]['players'][1]['avatar'] == FOTO)
st, s_ = call('POST', f'/api/session/{code}/players', {'players': [{'id': 'me', 'name': 'Anna', 'color': '#15A35A', 'account_id': A}, {'id': 'c17', 'name': 'Kind', 'color': '#2F6FE0'}, {'id': 1764000000000.25, 'name': 'Gast', 'color': '#E0792F'}, {'id': 'neu1', 'name': 'Vierte', 'color': '#9B4FD8'}]})
check('Spielerliste ergänzen, Belegung und Schläge bleiben', st == 200 and len(s_['players']) == 4 and s_['players'][1]['claimed'] is True and s_['players'][2]['scores'] == {'2': 4}, str(s_)[:160])
st, s_ = call('POST', f'/api/session/{code}/leave', {'player_id': 'c17'}); check('Platz verlassen', st == 200 and s_['players'][1]['claimed'] is False)
st, s_ = call('POST', f'/api/session/{code}/finish', {}); check('beenden', st == 200 and s_['finished'] is True)
st, _ = call('POST', f'/api/session/{code}/score', {'player_id': 'me', 'hole': 1, 'strokes': 9}); check('danach gesperrt (409)', st == 409, st)
st, _ = call('POST', f'/api/session/{code}/claim', {'player_id': 'c17', 'account_id': C}); check('Gast verknüpft Konto nach Ende', st == 200, st)
st, _ = call('POST', '/api/feedback', {'rating': 3, 'message': 'Super', 'name': 'Anna', 'contact': 'a@b.ch', 'account_id': A}); check('Feedback absenden', st == 200, st)

print('── Angriffe ──')
st, a = call('POST', '/api/account', {'id': A, 'avatar': 'https://boese.example/zaehlpixel.png', 'color': 'url(https://boese.example/x)', 'name': 'N' * 5000, 'kind': 'admin'}, SA)
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
umbau = dict(spiel, account_id=C, venue='GEFAELSCHT', date=1, participants=[], players=[{'id': 'me', 'name': 'UMBENANNT', 'scores': {'1': 6}}, {'id': 'neu', 'name': 'Eingeschleust', 'scores': {'1': 1}}])
st, _ = call('POST', '/api/games', umbau, SC, headers={'X-Plonky-Account': A}); st2, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
g0 = l[0] if st2 == 200 and l else {}
check('Mitspieler aendert NUR Schlaege: Anlage, Datum, Namen, Spielerliste, Teilnehmer bleiben', st == 200 and len(l) == 1 and g0.get('venue') == 'Minigolf Dolder' and g0.get('date') == 1764000000000 and len(g0.get('players', [])) == 2 and g0['players'][0]['name'] == 'Anna' and g0['players'][0]['scores'] == {'1': 6} and sorted(g0.get('participants', [])) == [Bb, C], f'{st} {str(g0)[:260]}')
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


print('── Audit 22.11.2026: was neu abgesichert ist ──')
X = 'x7777777777777777777777777777777x'
print('  · Verlauf anderer')
st, _ = call('POST', '/api/games', {'id': 'g-untergeschoben', 'account_id': X, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'participants': [A, Bb], 'players': [{'id': 'me', 'name': 'Fremd', 'account_id': X, 'scores': {'1': 1}}, {'id': 'c1', 'name': 'Anna', 'account_id': A, 'scores': {'1': 9}}]}, fremd)
st2, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
check('Fremder kann Anna keine erfundene Runde in den Verlauf setzen', st == 200 and st2 == 200 and all(g['id'] != 'g-untergeschoben' for g in l), f'{st} {[g["id"] for g in l] if st2 == 200 else st2}')
st, _ = call('POST', '/api/games', {'id': 'g-untergeschoben2', 'account_id': X, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'code': R0, 'participants': [A, Bb, C], 'players': [{'id': 'me', 'name': 'Fremd', 'scores': {'1': 1}}]}, fremd)
st2, l = call('GET', '/api/games', secret=SC, headers={'X-Plonky-Account': C})
check('… auch nicht mit dem Code einer fremden Live-Runde', st == 200 and st2 == 200 and all(g['id'] != 'g-untergeschoben2' for g in l), st)
st, l = call('GET', '/api/games', secret=SB, headers={'X-Plonky-Account': Bb})
check('Verlauf kennzeichnet fremde Runden (mine=false)', st == 200 and len(l) >= 1 and l[0].get('mine') is False, str(l)[:120])
st, _ = call('POST', '/api/games/' + spiel['id'] + '/leave', {}, SB); st2, l = call('GET', '/api/games', secret=SB, headers={'X-Plonky-Account': Bb}); st3, la = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
check('Teilnehmer nimmt eine Runde aus dem eigenen Verlauf, beim Besitzer bleibt sie', st == 200 and l == [] and any(g['id'] == spiel['id'] for g in la), f'{st} {l}')
check('… ohne Zugang geht das nicht', call('POST', '/api/games/' + spiel['id'] + '/leave', {})[0] in (401, 403))
st, l = call('GET', '/api/accounts?ids=' + ','.join(f'k{i:032d}k' for i in range(100))); check('Sammelabfrage mit 100 Nummern: kein Fehler', st == 200, st)

print('  · Live-Runde')
HK9, K1, K2 = 'aa' * 16, 'bb' * 16, 'cc' * 16
st, r = call('POST', '/api/session', {'players': [{'id': 'me', 'name': 'H'}] + [{'id': f'c{i}', 'name': f'P{i}'} for i in range(40)]}, headers={'X-Plonky-Host': HK9})
check('höchstens 16 Spieler pro Runde', st == 200 and len(r['players']) == 16, len(r['players']) if st == 200 else st)
rc9 = r['code'] if st == 200 else 'X'
check('ein Gerät belegt EINEN Platz', call('POST', f'/api/session/{rc9}/claim', {'player_id': 'c1'}, headers={'X-Plonky-Slot': K1})[0] == 200 and call('POST', f'/api/session/{rc9}/claim', {'player_id': 'c2'}, headers={'X-Plonky-Slot': K1})[0] == 409)
gross = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0' + b'x' * 32000).decode()
st, r = call('POST', f'/api/session/{rc9}/claim', {'player_id': 'c1', 'avatar': gross}, headers={'X-Plonky-Slot': K1})
check('Foto über 40 KB wird übergangen', st == 200 and call('GET', f'/api/session/{rc9}?full=1')[1]['players'][2]['avatar'] == '', st)
falsch = 'data:image/jpeg;base64,' + base64.b64encode(b'<svg onload=alert(1)>' + b'x' * 200).decode()
st, a = call('POST', '/api/account', {'id': A, 'avatar': falsch}, SA); check('„JPEG" ohne JPEG-Inhalt wird übergangen', st == 200 and a['avatar'] == '', st)
for i in range(3, 16): call('POST', f'/api/session/{rc9}/claim', {'player_id': f'c{i-1}', 'avatar': FOTO}, headers={'X-Plonky-Slot': f'{i:02d}' * 16})
st, r = call('GET', f'/api/session/{rc9}?full=1'); check('volle Runde mit Fotos bleibt unter 400 KB', st == 200 and len(json.dumps(r)) < 400000, len(json.dumps(r)) if st == 200 else st)
check('beenden', call('POST', f'/api/session/{rc9}/finish', {}, headers={'X-Plonky-Host': HK9})[0] == 200)
check('nach dem Ende belegt kein Fremder mehr einen Platz (409)', call('POST', f'/api/session/{rc9}/claim', {'player_id': 'c0'}, headers={'X-Plonky-Slot': K2})[0] == 409)
check('… der Inhaber verknüpft seinen eigenen aber noch', call('POST', f'/api/session/{rc9}/claim', {'player_id': 'c1', 'account_id': Bb}, SB, headers={'X-Plonky-Slot': K1})[0] == 200)

print('  · Zugang erneuern, Konto löschen')
SN = sec('neu-fuer-c-')
check('erneuern ohne Zugang → abgelehnt', call('POST', '/api/account/rotate', {'new_secret': SN})[0] in (401, 403))
check('erneuern auf ein vergebenes Geheimnis → 409', call('POST', '/api/account/rotate', {'new_secret': SA}, SC)[0] == 409)
check('erneuern auf ein zu kurzes → 400', call('POST', '/api/account/rotate', {'new_secret': 'kurz'}, SC)[0] == 400)
check('Zugang erneuern', call('POST', '/api/account/rotate', {'new_secret': SN}, SC)[0] == 200)
check('… der alte Link ist tot', call('POST', '/api/account/resolve', {'secret': SC})[0] == 404 and call('GET', '/api/games', secret=SC, headers={'X-Plonky-Account': C})[0] in (401, 403))
st, a = call('POST', '/api/account/resolve', {'secret': SN}); check('… der neue öffnet dasselbe Konto', st == 200 and a['id'] == C)
check('Konto löschen ohne Zugang → abgelehnt', call('DELETE', '/api/account')[0] in (401, 403))
SD = sec('loesch-mich-'); D = 'd8888888888888888888888888888888d'
call('POST', '/api/account', {'id': D, 'name': 'Dora', 'avatar': FOTO, 'crew': [{'id': 1, 'name': 'Kind'}]}, SD)
call('POST', '/api/games', {'id': 'g-dora', 'account_id': D, 'date': 1764000000000, 'venue': 'Dora-Runde', 'players': [{'id': 'me', 'name': 'Dora', 'account_id': D, 'scores': {'1': 2}}]}, SD)
st, _ = call('DELETE', '/api/account', secret=SD); check('Konto löschen', st == 200, st)
check('… Link tot, Profil weg, Runde weg', call('POST', '/api/account/resolve', {'secret': SD})[0] == 404 and call('GET', '/api/account/' + D)[0] == 404 and call('GET', '/api/games', secret=SD, headers={'X-Plonky-Account': D})[0] in (401, 403, 404))
st, _ = call('POST', '/api/games', {'id': 'g-dora', 'account_id': A, 'date': 5, 'venue': 'Neu', 'players': []}, SA); check('… die Kennung der gelöschten Runde ist wieder frei (nichts blieb zurück)', st == 200, st)

print('  · Dateien und Kopfzeilen')
for pfad in ('/app.py', '/requirements.txt', '/gunicorn.conf.py', '/Plonky.html', '/tools/sicherheits-pruefung.py', '/.git/config', '/.gitignore', '/z_backup/', '/plonky_local.db', '/src/%2e%2e/app.py', '/src//app.jsx', '/build.sh', '/vendor/../app.py'):
    check(f'{pfad} → 404', call('GET', pfad)[0] == 404, call('GET', pfad)[0])
for pfad in ('/src/app.jsx', '/vendor/react.production.min.js', '/assets/fonts/fonts.css', '/manifest.json', '/venues.json'):
    check(f'{pfad} → 200', call('GET', pfad)[0] == 200, call('GET', pfad)[0])
st, html = call('GET', '/'); csp = LAST.get('Content-Security-Policy', '')
import re as _re
n = _re.search(r"'nonce-([^']+)'", csp)
check('Startseite trägt eine Content Security Policy mit Nonce', st == 200 and bool(n) and "default-src 'none'" in csp and 'unsafe-eval' not in csp and "script-src 'self' 'nonce-" in csp, csp[:120])
check('… jedes Skript trägt genau diese Nonce, kein Platzhalter bleibt', bool(n) and '__NONCE__' not in html and html.count('nonce="' + n.group(1) + '"') == html.count('<script'), html.count('<script'))
check('… nichts wird von fremden Servern geladen', 'https://' not in _re.sub(r'<!--.*?-->', '', html, flags=_re.S).replace('http://www.w3.org', ''))
call('GET', '/'); n2 = _re.search(r"'nonce-([^']+)'", LAST.get('Content-Security-Policy', ''))
check('… die Nonce ist bei jedem Abruf neu', bool(n and n2) and n.group(1) != n2.group(1))
call('GET', '/api/health')
check('API-Antworten: nicht zwischenspeichern, nichts einbettbar', 'no-store' in LAST.get('Cache-Control', '') and "default-src 'none'" in LAST.get('Content-Security-Policy', '') and LAST.get('X-Content-Type-Options') == 'nosniff')

print('  · Fehler statt Absturz')
st, _ = call('POST', '/api/account', raw=b'{"id":"s9999999999999999999999999999999s","name":"\\ud83d"}', secret=sec('surrogat-')); check('halbes Emoji im Namen → kein 500', st in (200, 400), st)
st, _ = call('POST', '/api/session', raw=b'{"players":[{"id":"\\udc00","name":"x"}]}'); check('halbes Emoji als Kennung → kein 500', st in (200, 400), st)
st, _ = call('GET', '/admin', headers={'Cookie': 'plonky_admin=' + '9' * 400 + '.zz'}); check('kaputtes Sitzungs-Cookie → kein 500', st == 403, st)
st, _ = call('GET', '/fb/daten', headers={'Cookie': 'plonky_fb=äö.ü'.encode('utf-8').decode('latin-1')}); check('Sonderzeichen im Cookie → kein 500', st == 403, st)
st, _ = call('POST', '/api/account', raw=b'\xff\xfe\x00kein json', secret=SA); check('Datenmüll als Rumpf → 400', st == 400, st)
st, _ = call('POST', '/api/account', raw=json.dumps({'id': A, 'name': 'x', 'ballast': 'y' * 450000}).encode(), secret=SA); check('Rumpf über 400 KB → 413', st == 413, st)
st, _ = call('POST', '/api/session/GIBTESNICHT/score', {'player_id': 'me', 'hole': 1, 'strokes': 2}); check('Runde, die es nicht gibt → 404', st == 404, st)

print('  · Zweite Gegenprüfung')
HKz, Kg, Kv = 'ab' * 16, 'cd' * 16, 'ef' * 16
SG, G = sec('gast-boese-'), 'g9999999999999999999999999999999g'
SV, V = sec('gast-brav-'), 'v9999999999999999999999999999999v'
call('POST', '/api/account', {'id': G, 'name': 'Gast B'}, SG); call('POST', '/api/account', {'id': V, 'name': 'Gast V'}, SV)
st, rz = call('POST', '/api/session', {'venue': 'Z', 'holes': 36, 'players': [{'id': 'me', 'name': 'Anna', 'account_id': A}, {'id': 'p1', 'name': 'V'}, {'id': 'p2', 'name': 'G'}]}, SA, headers={'X-Plonky-Host': HKz})
RZ = rz['code'] if st == 200 else 'X'
check('die Bahnenzahl reist mit der Runde', st == 200 and rz.get('holes') == 36 and call('GET', f'/api/session/{RZ}')[1].get('holes') == 36, rz.get('holes') if st == 200 else st)
call('POST', f'/api/session/{RZ}/claim', {'player_id': 'p1', 'account_id': V}, SV, headers={'X-Plonky-Slot': Kv})
call('POST', f'/api/session/{RZ}/claim', {'player_id': 'p2', 'account_id': G}, SG, headers={'X-Plonky-Slot': Kg})
st, _ = call('POST', '/api/games', {'id': 'g-vom-gast', 'account_id': G, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'code': RZ, 'participants': [V, A], 'players': [{'id': 'me', 'name': 'G', 'scores': {'1': 1}}]}, SG)
st2, lv = call('GET', '/api/games', secret=SV, headers={'X-Plonky-Account': V}); st3, la = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A})
check('ein MIT-GAST kann den anderen keine Runde unterschieben (nur der Gastgeber trägt Teilnehmer ein)', st == 200 and all(x['id'] != 'g-vom-gast' for x in lv) and all(x['id'] != 'g-vom-gast' for x in la), f'{st} {[x["id"] for x in lv]}')
st, _ = call('POST', '/api/games', {'id': 'g-vom-gast2', 'account_id': G, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'participants': [V, A], 'players': [{'id': 'me', 'name': 'G', 'scores': {'1': 1}}]}, SG)
st2, lv = call('GET', '/api/games', secret=SV, headers={'X-Plonky-Account': V})
check('… auch später nicht, ohne Runden-Code', st == 200 and all(x['id'] != 'g-vom-gast2' for x in lv))
st, _ = call('POST', '/api/games', {'id': 'g-vom-gastgeber', 'account_id': A, 'date': 1764000000000, 'venue': 'Z', 'code': RZ, 'participants': [V, G], 'players': [{'id': 'me', 'name': 'Anna', 'account_id': A, 'scores': {'1': 1}}]}, SA)
st2, lv = call('GET', '/api/games', secret=SV, headers={'X-Plonky-Account': V})
check('der Gastgeber dagegen schon — die Runde erscheint beim Gast', st == 200 and any(x['id'] == 'g-vom-gastgeber' for x in lv), st)
# Runde OHNE Gastgeber-Schluessel: dort darf jeder jede Nummer an jeden Platz schreiben —
# also darf so eine Runde nie als Nachweis taugen.
st, ra = call('POST', '/api/session', {'players': [{'id': 'me', 'name': 'G', 'account_id': G}]}, SG); RA = ra['code'] if st == 200 else 'X'
call('POST', f'/api/session/{RA}/claim', {'player_id': 'me', 'account_id': C}, SG)
st, _ = call('POST', '/api/games', {'id': 'g-altrunde', 'account_id': G, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'code': RA, 'participants': [C], 'players': [{'id': 'me', 'name': 'G', 'scores': {'1': 1}}]}, SG)
st2, lc = call('GET', '/api/games', secret=SN, headers={'X-Plonky-Account': C})
check('Runde ohne Gastgeber-Schlüssel taugt nicht als Nachweis (Konto C bekommt nichts untergeschoben)', st == 200 and st2 == 200 and all(x['id'] != 'g-altrunde' for x in lc), f'{st} {st2} {[x["id"] for x in lc] if st2 == 200 else ""}')
HKq = '9a' * 16
st, rq = call('POST', '/api/session', {'players': [{'id': 'me', 'name': 'G', 'account_id': G}, {'id': 'p1', 'name': 'X', 'account_id': C}]}, SG, headers={'X-Plonky-Host': HKq}); RQ = rq['code'] if st == 200 else 'X'
call('POST', f'/api/session/{RQ}/claim', {'player_id': 'p1', 'account_id': C}, SG, headers={'X-Plonky-Host': HKq})
call('POST', f'/api/session/{RQ}/players', {'players': [{'id': 'me', 'name': 'G', 'account_id': C, 'verified': True}, {'id': 'p1', 'name': 'X', 'account_id': C, 'verified': True}]}, SG, headers={'X-Plonky-Host': HKq})
st, _ = call('POST', '/api/games', {'id': 'g-eigene-runde', 'account_id': G, 'date': 1764000000000, 'venue': 'ERFUNDEN', 'code': RQ, 'participants': [C], 'players': [{'id': 'me', 'name': 'G', 'scores': {'1': 1}}]}, SG)
st2, lc = call('GET', '/api/games', secret=SN, headers={'X-Plonky-Account': C})
check('Gastgeber schreibt eine fremde Nummer in seine eigene Runde: zählt nicht als Nachweis', st == 200 and st2 == 200 and all(x['id'] != 'g-eigene-runde' for x in lc), f'{st} {st2}')
check('Schlag für einen Platz, den es nicht gibt → 404', call('POST', f'/api/session/{RZ}/score', {'player_id': 'gibtsnicht', 'hole': 1, 'strokes': 2}, headers={'X-Plonky-Host': HKz})[0] == 404)
check('Bahn 55 → 400 (höchstens 54)', call('POST', f'/api/session/{RZ}/score', {'player_id': 'me', 'hole': 55, 'strokes': 2}, headers={'X-Plonky-Host': HKz})[0] == 400)
check('Runde ohne Spieler → 400', call('POST', '/api/session', {'players': []})[0] == 400 and call('POST', '/api/session', {})[0] == 400)
check('gelöschtes Konto lässt sich nicht wieder anlegen (410)', call('POST', '/api/account', {'id': D, 'name': 'Dora'}, sec('dora-neu-'))[0] == 410 and call('POST', '/api/games', {'id': 'g-dora2', 'account_id': D, 'players': []}, sec('dora-neu2-'))[0] == 410)
for pfad, m in (('/api/account/%00', 'GET'), ('/api/session/%00', 'GET'), ('/api/session/%00/score', 'POST'), ('/api/session/%00', 'DELETE'), ('/api/games/%00/leave', 'POST'), ('/api/account/a%20b', 'GET')):
    st, _ = call(m, pfad, {} if m == 'POST' else None, SA); check(f'{m} {pfad} → 404, kein 500', st == 404, st)
st, l = call('GET', '/api/accounts?ids=' + ','.join([A, Bb, C, G, V] * 12)); check('Sammelabfrage: höchstens 25 Nummern je Abruf', st == 200 and len(l) <= 25, len(l) if st == 200 else st)
import threading as _th
erg = []
def _gleich(i):
    s_ = sec('wettlauf-%d-' % i); k = 'w%031dw' % i
    r = [None, None]
    t1 = _th.Thread(target=lambda: r.__setitem__(0, call('POST', '/api/account', {'id': k, 'name': 'Wett %d' % i, 'color': '#2F6FE0'}, s_)[0]))
    t2 = _th.Thread(target=lambda: r.__setitem__(1, call('POST', '/api/games', {'id': 'g-wett-%d' % i, 'account_id': k, 'date': 1764000000000, 'venue': 'W', 'players': [{'id': 'me', 'name': 'W', 'account_id': k, 'scores': {'1': 2}}]}, s_)[0]))
    t1.start(); t2.start(); t1.join(); t2.join()
    st, a_ = call('GET', '/api/account/' + k, secret=s_); st2, l_ = call('GET', '/api/games', secret=s_, headers={'X-Plonky-Account': k})
    erg.append((r[0], r[1], isinstance(a_, dict) and a_.get('name') == 'Wett %d' % i, isinstance(l_, list) and len(l_) == 1))
for i in range(12): _gleich(i)
check('frisches Gerät: Konto und erste Runde gleichzeitig — 12 von 12 ohne Fehler, Name und Runde da', all(e == (200, 200, True, True) for e in erg), str([e for e in erg if e != (200, 200, True, True)][:3]))
erg2 = []
ts = [_th.Thread(target=lambda: erg2.append(call('POST', '/api/account', {'id': 'q1111111111111111111111111111111q', 'name': 'Q'}, sec('q-gleich-'))[0])) for _ in range(8)]
[t.start() for t in ts]; [t.join() for t in ts]
check('achtmal dasselbe neue Konto gleichzeitig: kein 500', all(x in (200, 409) for x in erg2) and 200 in erg2, str(erg2))
erg3 = []
gq = {'id': 'g-gleich', 'account_id': A, 'date': 1764000000000, 'venue': 'Q', 'players': [{'id': 'me', 'name': 'Anna', 'scores': {'1': 2}}, {'id': 'c1', 'name': 'B', 'scores': {'1': 3}}]}
ts = [_th.Thread(target=lambda: erg3.append(call('POST', '/api/games', gq, SA)[0])) for _ in range(8)]
[t.start() for t in ts]; [t.join() for t in ts]
st, l = call('GET', '/api/games', secret=SA, headers={'X-Plonky-Account': A}); gg = [x for x in l if x['id'] == 'g-gleich']
check('achtmal dieselbe Runde gleichzeitig: kein 500, genau 2 Spieler gespeichert', all(x == 200 for x in erg3) and len(gg) == 1 and len(gg[0]['players']) == 2, f'{erg3} {len(gg[0]["players"]) if gg else None}')
erg4 = []
ts = [_th.Thread(target=lambda i=i: erg4.append(call('POST', '/api/account', {'id': 'z%031dz' % i, 'name': 'Z'}, sec('ein-geheimnis-'))[0])) for i in range(6)]
[t.start() for t in ts]; [t.join() for t in ts]
check('ein Geheimnis, sechs Konten gleichzeitig: genau eines entsteht', erg4.count(200) == 1 and all(x in (200, 409) for x in erg4), str(erg4))

if ADMIN and FBKEY:
    print('  · Private Bereiche')
    st, _ = call('GET', '/admin/' + ADMIN); check('alter Link /admin/<Schlüssel> ist abgeschaltet (410), setzt kein Cookie', st == 410 and not LAST.get('_cookies'), st)
    st, _ = call('GET', '/fb/' + FBKEY); check('alter Link /fb/<Schlüssel> ist abgeschaltet (410)', st == 410 and not LAST.get('_cookies'), st)
    st, t = call('GET', '/admin'); check('ohne Sitzung: 403, Seite verrät nichts', st == 403 and 'Konten' not in t, st)
    check('Anmeldung mit falschem Schlüssel → 403', call('POST', '/admin/login', headers={'X-Plonky-Key': 'falsch' * 6})[0] == 403)
    check('Anmeldung mit dem Posteingangs-Schlüssel → 403', call('POST', '/admin/login', headers={'X-Plonky-Key': FBKEY})[0] == 403)
    st, _ = call('POST', '/admin/login', headers={'X-Plonky-Key': ADMIN}); ck = (LAST.get('_cookies') or [''])[0]
    check('Anmeldung über die Kopfzeile: Cookie HttpOnly, SameSite, enger Pfad', st == 200 and 'HttpOnly' in ck and 'SameSite=Lax' in ck and 'Path=/admin' in ck, ck[:90])
    st, t = call('GET', '/admin', headers={'Cookie': ck.split(';')[0]}); check('Dashboard mit Sitzung', st == 200 and '<html' in t.lower(), st)
    check('… das Admin-Cookie öffnet den Posteingang nicht', call('GET', '/fb/daten', headers={'Cookie': ck.split(';')[0].replace('plonky_admin', 'plonky_fb')})[0] == 403)
    st, _ = call('POST', '/fb/login', headers={'X-Plonky-Key': FBKEY}); ck2 = (LAST.get('_cookies') or [''])[0]
    st2, l = call('GET', '/fb/daten', headers={'Cookie': ck2.split(';')[0]}); check('Posteingang mit Sitzung', st == 200 and st2 == 200 and isinstance(l, list), f'{st} {st2}')
    check('… das Feedback trägt keine Konto-Nummer', st2 == 200 and all('account_id' not in f for f in l))
    check('Posteingang ohne Sitzung → 403', call('GET', '/fb/daten')[0] == 403)

print(f'\n  {ok} bestanden, {bad} fehlgeschlagen')
sys.exit(1 if bad else 0)
