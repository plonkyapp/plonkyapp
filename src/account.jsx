// account.jsx — persistence, home hub, settings, history
const { useState: useAcS, useEffect: useAcE, useRef: useAcR } = React;

// ── storage ───────────────────────────────────────────────
const STORE = {
  KEY: 'plonky.v1',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null') || {}; } catch (e) { return {}; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} },
};

// stable, shareable account token (basis for link-based accounts later)
const newAccountId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── backend API (same-origin; degrades to localStorage-only if unreachable) ──
const API = {
  async listGames(accountId) {
    const r = await fetch('/api/games?account_id=' + encodeURIComponent(accountId));
    if (!r.ok) throw new Error('list ' + r.status);
    return r.json();
  },
  async saveGame(accountId, game) {
    const r = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ account_id: accountId }, game)),
    });
    if (!r.ok) throw new Error('save ' + r.status);
    return r.json();
  },
  async getAccount(accountId) {
    const r = await fetch('/api/account/' + encodeURIComponent(accountId));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('account ' + r.status);
    return r.json();
  },
  async saveAccount(account, crew) {
    const body = { id: account.id, name: account.name, color: account.color };
    if (account.kind) body.kind = account.kind;
    if (account.avatar !== undefined) body.avatar = account.avatar || '';
    if (crew !== undefined) body.crew = crew;
    const r = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('saveAccount ' + r.status);
    return r.json();
  },
  async createSession(session) {
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (!r.ok) throw new Error('createSession ' + r.status);
    return r.json();
  },
  async getSession(code, full = false) {
    // full=true also returns player photos (used once on join); the score-poll
    // omits them to stay lean.
    const r = await fetch('/api/session/' + encodeURIComponent(code) + (full ? '?full=1' : ''));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('getSession ' + r.status);
    return r.json();
  },
  async sessionScore(code, playerId, hole, strokes) {
    const r = await fetch('/api/session/' + encodeURIComponent(code) + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, hole, strokes }),
    });
    if (!r.ok) throw new Error('sessionScore ' + r.status);
    return r.json();
  },
  async sessionClaim(code, playerId) {
    const r = await fetch('/api/session/' + encodeURIComponent(code) + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId }),
    });
    if (!r.ok) throw new Error('sessionClaim ' + r.status);
    return r.json();
  },
  // host ends the round → all devices show the final winner
  async sessionFinish(code) {
    const r = await fetch('/api/session/' + encodeURIComponent(code) + '/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error('sessionFinish ' + r.status);
    return r.json();
  },
  // replace the session roster (keeps claimed/scores for ids that already exist)
  async sessionPlayers(code, players) {
    const r = await fetch('/api/session/' + encodeURIComponent(code) + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: (players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, avatar: p.avatar || '' })) }),
    });
    if (!r.ok) throw new Error('sessionPlayers ' + r.status);
    return r.json();
  },
  async submitFeedback(payload) {
    const r = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('submitFeedback ' + r.status);
    return r.json();
  },
  async listFeedback(key) {
    const r = await fetch('/api/feedback?key=' + encodeURIComponent(key));
    if (!r.ok) throw new Error('listFeedback ' + r.status);
    return r.json();
  },
};

const appOrigin = () => (typeof location !== 'undefined' ? location.origin : 'https://app.plonky.ch');
// the personal restore link for an account
const accountLink = (id) => appOrigin() + '/m/' + id;
// the live-session join link other devices open / scan
const sessionLink = (code) => appOrigin() + '/j/' + code;

// union of local + server games keyed by id (server wins), kept oldest-first
function mergeGames(local, server) {
  const byId = {};
  (local || []).forEach(g => { byId[g.id] = g; });
  (server || []).forEach(g => { byId[g.id] = g; });
  return Object.values(byId).sort((a, b) => (a.date || 0) - (b.date || 0));
}

const fmtDate = (ts) => {
  const d = new Date(ts);
  return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long' }) + ', ' +
    d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
};
const fmtShort = (ts) => new Date(ts).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });

// ── shared scoring helpers (mirror game.jsx) ──────────────
const aPar = h => GAME.PARS[(h - 1) % GAME.PARS.length];
function aTotals(p) {
  let strokes = 0, played = 0, pp = 0;
  for (let h = 1; h <= 18; h++) { const v = p.scores[h]; if (v > 0) { strokes += v; played++; pp += aPar(h); } }
  return { strokes, played, toPar: strokes - pp };
}
const aFmtPar = n => n === 0 ? 'Par' : n > 0 ? '+' + n : '' + n;
const aRelCol = n => n < 0 ? 'var(--accent)' : n > 0 ? 'var(--bad)' : 'var(--ink-2)';

// ── Home hub ──────────────────────────────────────────────
function HomeScreen({ account, family, history, go, openGame, newGame, scanEnabled = true, companion = false }) {
  const { Screen, Body, Btn, Avatar } = UI;
  const recent = [...history].slice(-3).reverse();
  return (
    <Screen>
      <div style={{ paddingTop: 64, padding: '64px 22px 6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{companion ? 'Mitspieler-Konto' : 'Willkommen zurück'}</div>
          <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.6 }}>Hoi {account.name} 👋</div>
        </div>
        <button onClick={() => go('settings')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <Avatar name={account.name} color={account.color} size={48} src={account.avatar} />
        </button>
      </div>
      <Body style={{ paddingTop: 14 }}>
        {companion ? (
          <button onClick={() => go('joinCode')} style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
            background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r-card)',
            padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 14px 30px -14px color-mix(in srgb, var(--accent) 75%, transparent)',
          }}>
            <div style={{ width: 50, height: 50, borderRadius: 15, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.scan size={26} color="#fff" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Spiel beitreten</div>
              <div style={{ fontSize: 13.5, opacity: 0.85 }}>QR des Gastgebers scannen oder Code eingeben</div>
            </div>
            <Ic.arrowR size={22} color="#fff" />
          </button>
        ) : (
          <button onClick={newGame} style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
            background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r-card)',
            padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 14px 30px -14px color-mix(in srgb, var(--accent) 75%, transparent)',
          }}>
            <div style={{ width: 50, height: 50, borderRadius: 15, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.scan size={26} color="#fff" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Neues Spiel</div>
              <div style={{ fontSize: 13.5, opacity: 0.85 }}>{scanEnabled ? 'QR scannen & loslegen' : 'Crew ist dabei · direkt loslegen'}</div>
            </div>
            <Ic.arrowR size={22} color="#fff" />
          </button>
        )}

        {/* recent games */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Letzte Spiele</div>
          {history.length > 0 && <button onClick={() => go('history')} style={ghostLink}>Alle ansehen</button>}
        </div>
        {history.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 18, padding: '22px 18px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            <Ic.clock size={26} color="var(--ink-3)" style={{ marginBottom: 8 }} />
            <div>{companion ? <>Noch keine Spiele.<br />Tritt einer Runde bei — dein Resultat landet hier.</> : <>Noch keine Spiele.<br />Dein erstes Resultat landet automatisch hier.</>}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {recent.map(g => <HistoryCard key={g.id} g={g} onClick={() => openGame(g.id)} />)}
          </div>
        )}

        {/* family — master accounts only */}
        {!companion && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Familie & Crew</div>
              <button onClick={() => go('settings')} style={ghostLink}>Verwalten</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {family.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Spieler:innen aus deinen Spielen erscheinen hier.</div>}
              {family.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 13px 5px 5px' }}>
                  <Avatar name={m.name} color={m.color} size={28} src={m.avatar} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Body>
    </Screen>
  );
}
const ghostLink = { border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 };

function HistoryCard({ g, onClick }) {
  const { Avatar } = UI;
  const ranked = [...g.players].map(p => ({ p, t: aTotals(p) })).sort((a, b) => a.t.strokes - b.t.strokes);
  const win = ranked[0];
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--card)',
      border: '1px solid var(--line)', borderRadius: 18, padding: '13px 15px',
      display: 'flex', alignItems: 'center', gap: 13, fontFamily: 'var(--font)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <Ic.pin size={13} color="var(--accent)" />
          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.venue}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{fmtShort(g.date)} · {g.players.length} Spieler</div>
      </div>
      {win && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🥇</span>
          <Avatar name={win.p.name} color={win.p.color} size={30} />
        </div>
      )}
      <Ic.chevR size={18} color="var(--ink-3)" />
    </button>
  );
}

// ── History list ──────────────────────────────────────────
function HistoryScreen({ history, go, openGame }) {
  const { Screen, AppHeader, Body } = UI;
  const games = [...history].reverse();
  return (
    <Screen>
      <AppHeader title="Verlauf" sub={`${history.length} Spiele`} onBack={() => go('home')} />
      <Body>
        {games.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, padding: '40px 0' }}>Noch keine Spiele gespeichert.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {games.map(g => <HistoryCard key={g.id} g={g} onClick={() => openGame(g.id)} />)}
          </div>
        )}
      </Body>
    </Screen>
  );
}

// ── History detail (scorecard) ────────────────────────────
function HistoryDetailScreen({ game, go, from }) {
  const { Screen, AppHeader, Body, Avatar } = UI;
  if (!game) return <Screen><AppHeader title="Spiel" onBack={() => go(from)} /></Screen>;
  const ranked = [...game.players].map(p => ({ p, t: aTotals(p) })).sort((a, b) => a.t.strokes - b.t.strokes);
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const half = Math.ceil(holes.length / 2); // 18 → two rows of 9 so it fits a phone without scrolling
  return (
    <Screen>
      <AppHeader title={game.venue} sub={fmtDate(game.date)} onBack={() => go(from)} />
      <Body>
        {/* winner */}
        {ranked[0] && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--accent) 9%, var(--card))', border: '1px solid var(--accent)', borderRadius: 16, padding: '12px 16px', marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>🏆</span>
            <Avatar name={ranked[0].p.name} color={ranked[0].p.color} size={36} src={ranked[0].p.avatar} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{ranked[0].p.name} gewinnt</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{ranked[0].t.strokes} Schläge · {ranked[0].t.played} Bahnen</div>
            </div>
          </div>
        )}
        {/* scorecard — one card per player, two rows of 9 holes so it fits a phone */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Scorecard</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ranked.map(({ p, t }, i) => (
            <div key={p.id} style={{ background: 'var(--card)', border: i === 0 ? '1.5px solid var(--accent)' : '1px solid var(--line)', borderRadius: 16, padding: '12px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 16, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--ink-3)', fontFamily: 'var(--num)' }}>{i + 1}</div>
                <Avatar name={p.name} color={p.color} size={26} src={p.avatar} />
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--num)', fontSize: 21, fontWeight: 800 }}>{t.strokes}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}> · {t.played}/{holes.length}</span>
                </div>
              </div>
              {[[0, half], [half, holes.length]].map(([a, b], ri) => (
                <div key={ri} style={{ display: 'flex', gap: 3, marginTop: 5 }}>
                  {holes.slice(a, b).map(h => {
                    const v = p.scores[h] || 0;
                    return (
                      <div key={h} style={{ flex: 1, textAlign: 'center', background: 'var(--line-2)', borderRadius: 7, padding: '4px 0' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', lineHeight: 1 }}>{h}</div>
                        <div style={{ fontFamily: 'var(--num)', fontSize: 14.5, fontWeight: 600, color: v ? 'var(--ink)' : 'var(--ink-3)', lineHeight: 1.3 }}>{v || '·'}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Body>
    </Screen>
  );
}

// ── Settings ──────────────────────────────────────────────
function SettingsScreen({ account, setAccount, family, setFamily, go, logout, defaultMode, setDefaultMode, autoCrew, setAutoCrew, companion = false, openLegal, openFeedback }) {
  const { Screen, AppHeader, Body, Avatar, AV_COLORS } = UI;
  const [editId, setEditId] = useAcS(null);
  const [newName, setNewName] = useAcS('');
  const [copied, setCopied] = useAcS(false);
  const fullLink = account.id ? accountLink(account.id) : '';
  const link = fullLink.replace(/^https?:\/\//, '');

  const copy = () => { if (!fullLink) return; try { navigator.clipboard.writeText(fullLink); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const addMember = () => { const n = newName.trim(); if (!n) return; setFamily(f => [...f, { id: Date.now(), name: n, color: AV_COLORS[f.length % AV_COLORS.length] }]); setNewName(''); };
  const recolor = (id) => setFamily(f => f.map(m => m.id === id ? { ...m, color: AV_COLORS[(AV_COLORS.indexOf(m.color) + 1) % AV_COLORS.length] } : m));
  const rename = (id, name) => setFamily(f => f.map(m => m.id === id ? { ...m, name } : m));
  const removeM = (id) => setFamily(f => f.filter(m => m.id !== id));
  const setMemberPhoto = (id, src) => setFamily(f => f.map(m => m.id === id ? { ...m, avatar: src } : m));

  return (
    <Screen>
      <AppHeader title={companion ? 'Mein Mitspieler-Konto' : 'Mein Konto'} onBack={() => go('home')} />
      <Body>
        {/* profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setAccount(a => ({ ...a, color: AV_COLORS[(AV_COLORS.indexOf(a.color) + 1) % AV_COLORS.length] }))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'block' }}>
              <Avatar name={account.name} color={account.color} size={56} src={account.avatar} />
            </button>
            <button onClick={() => UI.pickPhoto(src => setAccount(a => ({ ...a, avatar: src })))} title="Foto wählen" style={{ position: 'absolute', right: -3, bottom: -3, width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', border: '2px solid var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic.camera size={13} /></button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={account.name} onChange={e => setAccount(a => ({ ...a, name: e.target.value }))}
              style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 19, fontWeight: 700, outline: 'none', padding: 0, color: 'var(--ink)' }} />
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              {account.avatar
                ? <>Foto gesetzt · <button onClick={() => setAccount(a => ({ ...a, avatar: '' }))} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}>entfernen</button></>
                : 'Kamera-Symbol für ein Foto · Avatar antippen für eine Farbe'}
            </div>
          </div>
        </div>

        {/* magic link */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '22px 0 8px' }}>Dein Zugangslink</div>
        <button onClick={copy} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font)' }}>
          <Ic.link size={19} color="var(--accent)" />
          <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-2)', fontFamily: 'var(--num)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>{copied ? '✓ Kopiert' : 'Kopieren'}</span>
        </button>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 7, lineHeight: 1.4 }}>Als Lesezeichen speichern — dieser Link öffnet immer dein Konto. Kein Passwort nötig.</div>

        {!companion && (<>
        {/* family management */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '24px 0 8px' }}>Familie & Crew</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {family.map(m => (
            <div key={m.id} style={{ background: 'var(--card)', border: editId === m.id ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: 14, padding: editId === m.id ? '9px 11px' : '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <button onClick={() => recolor(m.id)} title="Farbe" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}><Avatar name={m.name} color={m.color} size={34} src={m.avatar} /></button>
                {editId === m.id
                  ? <input autoFocus value={m.name} onChange={e => rename(m.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && setEditId(null)}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 600, outline: 'none', color: 'var(--ink)' }} />
                  : <div style={{ flex: 1, fontSize: 15.5, fontWeight: 600 }}>{m.name}</div>}
                <button onClick={() => UI.pickPhoto(src => setMemberPhoto(m.id, src))} title="Foto" style={iconBtn}><Ic.camera size={17} color={m.avatar ? 'var(--accent)' : 'var(--ink-3)'} /></button>
                <button onClick={() => setEditId(editId === m.id ? null : m.id)} style={iconBtn}>{editId === m.id ? <Ic.check size={18} color="var(--accent)" /> : <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)' }}>Bearb.</span>}</button>
                <button onClick={() => removeM(m.id)} style={iconBtn}><Ic.x size={17} color="var(--ink-3)" /></button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 9 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} placeholder="Mitglied hinzufügen"
              style={{ flex: 1, height: 46, borderRadius: 13, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 14px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }} />
            <button onClick={addMember} style={{ width: 46, height: 46, borderRadius: 13, border: 'none', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Ic.plus size={22} /></button>
          </div>
        </div>

        {/* auto crew */}
        <button onClick={() => setAutoCrew(!autoCrew)} style={{ width: '100%', marginTop: 18, display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '13px 15px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: autoCrew ? 'var(--accent)' : 'var(--line-2)', color: autoCrew ? '#fff' : 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.users size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Crew automatisch dazu</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Neues Spiel startet direkt mit dir &amp; deiner Crew</div>
          </div>
          <div style={{ width: 46, height: 28, borderRadius: 999, background: autoCrew ? 'var(--accent)' : 'var(--line)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
            <div style={{ position: 'absolute', top: 3, left: autoCrew ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
        </button>
        </>)}

        {companion && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 22, lineHeight: 1.45 }}>Als Mitspieler siehst du nur die Spiele, bei denen du dabei warst. Spiele eröffnet der Gastgeber.</div>}

        <button onClick={() => (openFeedback ? openFeedback() : go('feedback'))} style={{ width: '100%', marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
          <div style={{ color: 'var(--accent)' }}><Ic.sparkle size={20} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Feedback geben</div><div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Sag uns, wie's läuft — Beta-Test</div></div>
          <Ic.chevR size={18} color="var(--ink-3)" />
        </button>

        <button onClick={logout} style={{ width: '100%', marginTop: 16, height: 50, borderRadius: 14, border: '1px solid var(--line)', background: 'transparent', color: 'var(--bad)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Konto abmelden</button>
        <button onClick={() => (openLegal ? openLegal() : go('legal'))} style={{ width: '100%', marginTop: 10, marginBottom: 10, height: 44, borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--ink-3)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Hinweise &amp; Datenschutz</button>
      </Body>
    </Screen>
  );
}
const iconBtn = { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

const FB_FACES = [[1, '😞'], [2, '😐'], [3, '😍']];

// ── Feedback form ─────────────────────────────────────────
function FeedbackScreen({ go, account, back = 'home' }) {
  const { Screen, AppHeader, Body, Footer, Btn } = UI;
  const [rating, setRating] = useAcS(0);
  const [msg, setMsg] = useAcS('');
  const [contact, setContact] = useAcS('');
  const [busy, setBusy] = useAcS(false);
  const [sent, setSent] = useAcS(false);
  const canSend = (msg.trim() || rating) && !busy;
  const send = () => {
    if (!canSend) return;
    setBusy(true);
    ACC.API.submitFeedback({
      rating: rating || null,
      message: msg.trim(),
      contact: contact.trim(),
      name: (account && account.name) || '',
      account_id: (account && account.id) || null,
    }).then(() => setSent(true)).catch(() => setSent(true)); // best-effort; thank either way
  };
  if (sent) return (
    <Screen>
      <AppHeader title="Feedback" onBack={() => go(back)} />
      <Body>
        <div style={{ textAlign: 'center', paddingTop: 40, animation: 'fadeUp .4s both' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'plonkPop .5s both' }}><Ic.check size={42} sw={2.6} /></div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 18 }}>Danke dir! 🙌</div>
          <div style={{ fontSize: 14.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.45, padding: '0 12px' }}>Deine Rückmeldung ist angekommen und hilft uns, PLONKY besser zu machen.</div>
        </div>
      </Body>
      <Footer><Btn kind="primary" onClick={() => go(back)} iconR={<Ic.arrowR size={20} />}>Zurück</Btn></Footer>
    </Screen>
  );
  return (
    <Screen>
      <AppHeader title="Feedback" sub="Beta" onBack={() => go(back)} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 18 }}>
          Wie war's? Deine Rückmeldung hilft uns, PLONKY besser zu machen.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          {FB_FACES.map(([v, e]) => (
            <button key={v} onClick={() => setRating(rating === v ? 0 : v)} style={{
              flex: 1, height: 64, borderRadius: 16, cursor: 'pointer', fontSize: 30, fontFamily: 'var(--font)',
              background: rating === v ? 'color-mix(in srgb, var(--accent) 12%, var(--card))' : 'var(--card)',
              border: rating === v ? '2px solid var(--accent)' : '1px solid var(--line)', transition: 'all .12s',
            }}>{e}</button>
          ))}
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Deine Nachricht</label>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Was gefällt dir, was fehlt, was nervt?"
          style={{ width: '100%', marginTop: 8, minHeight: 120, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--card)', padding: '13px 15px', fontSize: 15.5, fontFamily: 'var(--font)', outline: 'none', resize: 'vertical', lineHeight: 1.45 }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginTop: 16 }}>Kontakt (optional)</label>
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="E-Mail, falls wir antworten dürfen"
          style={{ width: '100%', marginTop: 8, height: 50, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 15px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }} />
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.4 }}>Ohne Kontakt ist dein Feedback anonym. Siehe <b>Hinweise &amp; Datenschutz</b>.</div>
      </Body>
      <Footer><Btn kind="primary" disabled={!canSend} onClick={send} iconR={<Ic.arrowR size={20} />}>{busy ? 'Senden …' : 'Absenden'}</Btn></Footer>
    </Screen>
  );
}

// ── Feedback inbox (private, opened via /fb/<key>) ────────
function FeedbackInbox({ items, go }) {
  const { Screen, AppHeader, Body } = UI;
  return (
    <Screen>
      <AppHeader title="Feedback-Posteingang" sub={items ? items.length + ' Einträge' : 'Kein Zugriff'} onBack={() => go('cover')} />
      <Body>
        {!items ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 18, padding: '24px 18px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.5 }}>
            Kein Zugriff. Der Link/Schlüssel stimmt nicht — oder der <b>FEEDBACK_KEY</b> ist auf dem Server noch nicht gesetzt.
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, padding: '34px 0' }}>Noch kein Feedback.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(f => (
              <div key={f.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{(FB_FACES.find(x => x[0] === f.rating) || [0, '·'])[1]}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{f.name || 'Anonym'}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{fmtShort(f.created)}</span>
                </div>
                {f.message && <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{f.message}</div>}
                {f.contact && <div style={{ fontSize: 12.5, color: 'var(--accent)', marginTop: 7, fontWeight: 600 }}>{f.contact}</div>}
              </div>
            ))}
          </div>
        )}
      </Body>
    </Screen>
  );
}

window.ACC = { STORE, API, newAccountId, accountLink, sessionLink, mergeGames, HomeScreen, HistoryScreen, HistoryDetailScreen, SettingsScreen, FeedbackScreen, FeedbackInbox, aTotals, fmtDate, fmtShort };
