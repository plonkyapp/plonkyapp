// onboarding.jsx — plonky onboarding screens
const { useState: useStateOB, useEffect: useEffectOB, useRef: useRefOB } = React;

const VENUE = 'Mini-Golf Seebach';

// ── Wordmark ──────────────────────────────────────────────
function Wordmark({ size = 34, color = 'var(--ink)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ position: 'relative', width: size * 0.92, height: size * 0.92 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'var(--accent)',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)',
          width: size * 0.34, height: size * 0.34, borderRadius: '50%', background: '#fff',
        }} />
      </div>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -1.2, color }}>plonky</span>
    </div>
  );
}

// ── 0. Landing / Begrüßung ────────────────────────────────
function LandingScreen({ go }) {
  const { Screen, Btn } = UI;
  return (
    <Screen bg="var(--paper)">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 28px', textAlign: 'center' }}>
        <div style={{ animation: 'fadeUp .5s both' }}><Wordmark size={30} /></div>
        <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '7px 14px', animation: 'fadeUp .5s .04s both' }}>
          <Ic.pin size={15} color="var(--accent)" /><span style={{ fontSize: 13.5, fontWeight: 700 }}>{VENUE}</span>
        </div>
        <div style={{ marginTop: 22, fontSize: 31, fontWeight: 800, lineHeight: 1.12, letterSpacing: -0.8, animation: 'fadeUp .5s .08s both' }}>Willkommen! 👋</div>
        <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: 300, animation: 'fadeUp .5s .12s both' }}>
          Schön, dass du da bist. Wir testen gerade unsere neue App, mit der du deine Mini-Golf-Runde digital einträgst — ganz ohne Zettel und Bleistift.
        </div>
        <div style={{ marginTop: 30, display: 'flex', alignItems: 'flex-end', gap: 22, animation: 'fadeIn .7s .2s both' }}>
          <div style={{ color: 'var(--accent)' }}><Ic.flag size={76} sw={2.4} /></div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', boxShadow: '0 6px 14px -6px rgba(0,0,0,0.4), inset -4px -4px 0 rgba(0,0,0,0.04)', marginBottom: 4, animation: 'ballRoll 1.6s ease-in-out infinite alternate' }} />
        </div>
      </div>
      <div style={{ padding: '0 22px 30px', animation: 'fadeUp .5s .25s both' }}>
        <Btn kind="primary" iconR={<Ic.arrowR size={20} />} onClick={() => go('cover')}>Los geht's</Btn>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-3)', textAlign: 'left' }}>
          <span style={{ flexShrink: 0 }}>ℹ️</span>
          <span><b>Beta-Version.</b> Diese App wird gerade getestet — keine Gewähr auf Verfügbarkeit oder Richtigkeit der Resultate. Alles dient nur dem Ausprobieren. Viel Spaß!</span>
        </div>
      </div>
    </Screen>
  );
}

// ── 1. Cover ──────────────────────────────────────────────
function CoverScreen({ go, account, scanEnabled = true, onStart, companion = false }) {
  const { Screen, Btn, Avatar } = UI;
  return (
    <Screen bg="var(--paper)">
      {account && (
        <div style={{ position: 'absolute', top: 60, right: 20, zIndex: 5 }}>
          <button onClick={() => go('home')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 7px 5px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Mein plonky</span>
            <Avatar name={account.name} color={account.color} size={30} src={account.avatar} />
          </button>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 26px', paddingTop: 96 }}>
        <div style={{ animation: 'fadeUp .5s both' }}><Wordmark size={36} /></div>
        {!scanEnabled && (
          <div style={{ marginTop: 16, display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '7px 14px', animation: 'fadeUp .5s .03s both' }}>
            <Ic.pin size={15} color="var(--accent)" /><span style={{ fontSize: 13.5, fontWeight: 600 }}>{VENUE} · 18 Bahnen</span>
          </div>
        )}
        <div style={{ marginTop: 22, fontSize: 30, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.8, maxWidth: 290, animation: 'fadeUp .5s .05s both' }}>
          Schläge zählen,<br />ohne Zettel.
        </div>
        <div style={{ marginTop: 12, fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: 270, animation: 'fadeUp .5s .1s both' }}>
          {scanEnabled
            ? 'Scan den QR-Code auf der Anlage und leg sofort los. Kein Download, keine Anmeldung.'
            : 'Willkommen auf der Anlage. Trag deine Runde ein — kein Download, keine Anmeldung.'}
        </div>

        {/* hero */}
        <div style={{ flex: 1, position: 'relative', minHeight: 150, animation: 'fadeIn .7s .15s both' }}>
          <div style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', width: 260, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', filter: 'blur(3px)' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: 26, transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: 26 }}>
            <div style={{ color: 'var(--ink)' }}><Ic.flag size={92} sw={2.4} color="var(--accent)" /></div>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', boxShadow: '0 6px 14px -6px rgba(0,0,0,0.4), inset -4px -4px 0 rgba(0,0,0,0.04)', marginBottom: 4, animation: 'ballRoll 1.6s ease-in-out infinite alternate' }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '0 22px 30px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {companion
          ? <Btn kind="primary" icon={<Ic.scan size={21} />} onClick={() => go('joinCode')}>Spiel beitreten</Btn>
          : scanEnabled
            ? <Btn kind="primary" icon={<Ic.scan size={21} />} onClick={() => go('scan')}>QR-Code scannen</Btn>
            : <Btn kind="primary" icon={<Ic.flag size={20} />} onClick={onStart}>Spiel starten</Btn>}
        {account
          ? <Btn kind="secondary" icon={<Ic.home size={19} />} onClick={() => go('home')}>Zu meinem plonky</Btn>
          : <Btn kind="secondary" onClick={() => go('account')}>Konto einrichten</Btn>}
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)' }}>{account ? 'Schön, dass du wieder da bist 🏌️' : 'Konto: jetzt oder gemütlich zuhause · dauert 20 Sek.'}</div>
      </div>
    </Screen>
  );
}

// ── Account (passwordless link) ───────────────────────────
function AccountScreen({ go, onCreate, companion = false, presetName = '', back = 'cover' }) {
  const { Screen, AppHeader, Body, Footer, Btn } = UI;
  const [name, setName] = useStateOB(presetName || '');
  const [saved, setSaved] = useStateOB(false);
  const [created, setCreated] = useStateOB(null);
  const [copied, setCopied] = useStateOB(false);
  const link = created ? ACC.accountLink(created.id) : '';
  const copyLink = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
    else done();
  };
  const benefits = companion ? [
    ['Beim nächsten Mal per QR direkt wieder dabei', Ic.users],
    ['Eigener Link — kein Passwort', Ic.link],
    ['Deine Crew bleibt deine — nichts vom Gastgeber übernommen', Ic.check],
  ] : [
    ['Resultate bleiben gespeichert', Ic.clock],
    ['Familie einmal anlegen, immer dabei', Ic.users],
    ['Kein Passwort — nur ein Link', Ic.link],
  ];
  return (
    <Screen>
      <AppHeader title={companion ? 'Mitspieler-Konto' : 'Konto einrichten'} sub="Optional" onBack={() => go(back)} />
      <Body>
        {!saved ? (
          <>
            <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 18 }}>
              {companion
                ? 'Sichere dich als Mitspieler. So steigst du beim nächsten Mal mit einem Scan direkt wieder ein — ein Name, ein Link, fertig.'
                : 'Wir hassen Registrierungen genauso. Darum: ein Name, ein Link — fertig.'}
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Dein Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Marco"
              style={{ width: '100%', marginTop: 8, height: 54, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 18px', fontSize: 17, fontFamily: 'var(--font)', outline: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              {benefits.map(([t, I], k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ color: 'var(--accent)' }}><I size={21} /></div>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{t}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', paddingTop: 36, animation: 'fadeUp .4s both' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'plonkPop .5s both' }}><Ic.check size={42} sw={2.6} /></div>
            <div style={{ fontSize: 21, fontWeight: 700, marginTop: 18 }}>Konto bereit</div>
            <div style={{ fontSize: 14.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.45, padding: '0 10px' }}>
              Dieser Link führt auf jedem Gerät direkt zu deinem Konto. Speichere ihn als Lesezeichen!
            </div>
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 16px', textAlign: 'left' }}>
              <Ic.link size={18} color="var(--ink-3)" />
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-2)', fontFamily: 'var(--num)', wordBreak: 'break-all' }}>{link.replace(/^https?:\/\//, '')}</span>
            </div>
            <button onClick={copyLink} style={{ marginTop: 12, width: '100%', height: 48, borderRadius: 14, border: '1px solid var(--line)', background: copied ? 'var(--accent)' : 'var(--card)', color: copied ? '#fff' : 'var(--ink)', fontSize: 14.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s' }}>
              {copied ? <><Ic.check size={18} /> Kopiert!</> : <><Ic.link size={17} /> Link kopieren</>}
            </button>
          </div>
        )}
      </Body>
      <Footer>
        {!saved
          ? <Btn kind="primary" disabled={!name.trim()} onClick={() => { const acc = onCreate && onCreate(name.trim()); setCreated(acc); setSaved(true); }} icon={<Ic.link size={19} />}>Link erstellen</Btn>
          : <Btn kind="primary" onClick={() => go('home')} iconR={<Ic.arrowR size={20} />}>Zu meinem plonky</Btn>}
        {!saved && <Btn kind="ghost" onClick={() => go(back)}>Später</Btn>}
      </Footer>
    </Screen>
  );
}

// ── 2. Scan ───────────────────────────────────────────────
function ScanScreen({ go, express }) {
  const [phase, setPhase] = useStateOB('scanning'); // scanning -> found
  useEffectOB(() => {
    const t = setTimeout(() => setPhase('found'), 1700);
    return () => clearTimeout(t);
  }, []);
  const bracket = (pos) => {
    const c = { position: 'absolute', width: 34, height: 34, borderColor: '#fff', borderStyle: 'solid', borderWidth: 0 };
    const m = { tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
      tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
      bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
      br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 } };
    return <div style={{ ...c, ...m[pos] }} />;
  };
  return (
    <div style={{ height: '100%', background: '#0E0F0C', position: 'relative', overflow: 'hidden' }}>
      {/* faux camera scene */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 60% at 50% 35%, #2b3326 0%, #171a13 60%, #0c0d0a 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'repeating-linear-gradient(115deg, transparent 0 26px, rgba(255,255,255,0.015) 26px 27px)' }} />

      {/* top bar */}
      <div style={{ position: 'absolute', top: 58, left: 0, right: 0, padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
        <button onClick={() => go('cover')} style={{ width: 40, height: 40, borderRadius: 13, border: 'none', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic.x size={20} /></button>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600 }}>QR-Code scannen</div>
        <div style={{ width: 40 }} />
      </div>

      {/* viewfinder */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-58%)', width: 230, height: 230 }}>
        {phase === 'scanning' && <>
          {bracket('tl')}{bracket('tr')}{bracket('bl')}{bracket('br')}
          <div style={{ position: 'absolute', left: '6%', right: '6%', height: 2, background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', boxShadow: '0 0 12px var(--accent)', animation: 'scanline 1.5s ease-in-out infinite alternate' }} />
        </>}
        {phase === 'found' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'plonkPop .45s both' }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 0 var(--accent)' }}>
              <Ic.check size={46} sw={2.6} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', animation: 'pulseRing 1.2s ease-out infinite' }} />
            </div>
          </div>
        )}
      </div>

      {/* bottom sheet */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '26px 22px 34px', background: 'linear-gradient(to top, #0E0F0C 70%, transparent)', textAlign: 'center', color: '#fff' }}>
        {phase === 'scanning' ? (
          <div style={{ animation: 'fadeIn .4s both' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Richte die Kamera auf den Code</div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>Du findest ihn beim Eingang & an jeder Bahn</div>
          </div>
        ) : (
          <div style={{ animation: 'fadeUp .4s both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              <Ic.pin size={15} color="var(--accent)" /> {VENUE}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Willkommen! 👋</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 18 }}>Neue Session bereit · 18 Bahnen</div>
            <UI.Btn kind="primary" onClick={() => go(express ? 'express' : 'welcome')} iconR={<Ic.arrowR size={20} />}>Los geht's</UI.Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3. Welcome / role A vs B ──────────────────────────────
function RoleScreen({ go, role, setRole, back = 'scan' }) {
  const { Screen, AppHeader, Body, Footer, Btn, Steps } = UI;
  return (
    <Screen>
      <AppHeader title="Wer trägt ein?" sub="Session einrichten" onBack={() => go(back)} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 18 }}>
          Spielt ihr zusammen, reicht ein Handy. Oder jede:r tippt selbst — wie ihr wollt.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <UI.ChoiceCard icon={<Ic.user size={26} />} title="Ich tippe für alle" badge="A"
            desc="Ein Handy führt das Spiel. Am einfachsten."
            selected={role === 'me'} onClick={() => setRole('me')} />
          <UI.ChoiceCard icon={<Ic.users size={26} />} title="Andere tippen mit" badge="B"
            desc="Jede:r scannt den Code und trägt selbst ein."
            selected={role === 'others'} onClick={() => setRole('others')} />
        </div>
      </Body>
      <Footer>
        <Steps n={3} i={0} />
        <Btn kind="primary" disabled={!role} onClick={() => go('players')} iconR={<Ic.arrowR size={20} />}>Weiter</Btn>
      </Footer>
    </Screen>
  );
}

// ── 4. Players ────────────────────────────────────────────
function PlayersScreen({ go, players, setPlayers, role, family = [] }) {
  const { Screen, AppHeader, Body, Footer, Btn, Steps, Avatar, AV_COLORS } = UI;
  const [val, setVal] = useStateOB('');
  const inputRef = useRefOB(null);
  const add = () => {
    const name = val.trim();
    if (!name) return;
    setPlayers(p => [...p, { id: Date.now(), name, color: AV_COLORS[p.length % AV_COLORS.length], scores: {} }]);
    setVal('');
    inputRef.current && inputRef.current.focus();
  };
  const remove = id => setPlayers(p => p.filter(x => x.id !== id));
  const next = role === 'others' ? 'invite' : 'game';
  return (
    <Screen>
      <AppHeader title="Wer spielt mit?" sub={role === 'others' ? 'Spieler:innen anlegen' : 'Familie & Freunde'} onBack={() => go('welcome')} />
      <Body>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} placeholder="Name eingeben"
            style={{ flex: 1, height: 52, borderRadius: 15, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 16px', fontSize: 16.5, fontFamily: 'var(--font)', outline: 'none' }} />
          <button onClick={add} style={{ width: 52, height: 52, borderRadius: 15, border: 'none', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Ic.plus size={24} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {players.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, padding: '26px 0' }}>Noch niemand dabei.<br />Tipp oben den ersten Namen ein.</div>
          )}
          {players.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '10px 12px 10px 12px', animation: 'fadeUp .3s both' }}>
              <Avatar name={p.name} color={p.color} size={38} />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{p.name}</div>
              {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', padding: '3px 8px', borderRadius: 7 }}>LEAD</span>}
              <button onClick={() => remove(p.id)} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x size={18} /></button>
            </div>
          ))}
        </div>
        {(players.length > 0 || family.length > 0) && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
            {family.length > 0 && <div style={{ width: '100%', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 2 }}>Aus deiner Crew</div>}
            {(family.length ? family.map(m => m.name) : ['Anna', 'Marco', 'Lena', 'Tim', 'Oma']).filter(n => !players.find(p => p.name === n)).slice(0, 5).map(n => (
              <button key={n} onClick={() => { const fm = family.find(m => m.name === n); setPlayers(p => [...p, { id: Date.now() + Math.random(), name: n, color: (fm && fm.color) || AV_COLORS[p.length % AV_COLORS.length], scores: {} }]); }}
                style={{ border: '1px dashed var(--line)', background: 'transparent', color: 'var(--ink-2)', borderRadius: 999, padding: '7px 13px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Ic.plus size={14} /> {n}
              </button>
            ))}
          </div>
        )}
      </Body>
      <Footer>
        <Steps n={3} i={1} />
        <Btn kind="primary" disabled={players.length === 0} onClick={() => go(next)}
          iconR={<Ic.arrowR size={20} />}>
          {role === 'others' ? 'Andere einladen' : players.length ? `Spiel starten · ${players.length}` : 'Spiel starten'}
        </Btn>
      </Footer>
    </Screen>
  );
}

// ── 6. Invite (role B) — real live session ────────────────
function InviteScreen({ go, players, mode, sessionCode, setSessionCode }) {
  const { Screen, AppHeader, Body, Footer, Btn, Steps, QRCode, Avatar } = UI;
  const [code, setCode] = useStateOB(sessionCode || null);
  const [claimed, setClaimed] = useStateOB({});
  const [copied, setCopied] = useStateOB(false);
  const [err, setErr] = useStateOB(false);
  const creatingRef = useRefOB(false);

  // create the shared session once
  useEffectOB(() => {
    if (code || creatingRef.current) return;
    creatingRef.current = true;
    ACC.API.createSession({
      mode: mode || 'sequential', venue: VENUE,
      players: players.map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {} })),
    }).then(sess => { setCode(sess.code); setSessionCode && setSessionCode(sess.code); })
      .catch(() => setErr(true));
  }, []);

  // keep the server roster in sync while the host edits the line-up
  useEffectOB(() => {
    if (!code) return;
    ACC.API.sessionPlayers(code, players).catch(() => {});
  }, [code, players]);

  // poll for who has claimed a slot
  useEffectOB(() => {
    if (!code) return;
    let alive = true;
    const tick = () => ACC.API.getSession(code).then(sess => {
      if (!alive || !sess) return;
      const m = {}; (sess.players || []).forEach(p => { if (p.claimed) m[p.id] = true; });
      setClaimed(m);
    }).catch(() => {});
    tick();
    const iv = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [code]);

  const link = code ? ACC.sessionLink(code) : '';
  const copy = () => {
    if (!link) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
    else done();
  };
  // the lead (index 0) is this very device — always counts as "in"
  const isIn = (p, i) => i === 0 || claimed[p.id];
  const joinedCount = players.filter((p, i) => isIn(p, i)).length;

  return (
    <Screen>
      <AppHeader title="Anderen Code geben" sub="Mitspielen" onBack={() => go('players')} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 16, textAlign: 'center' }}>
          Lass die anderen <b>diesen QR scannen</b> oder den Code eingeben — dann sind sie in derselben Runde.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ padding: 16, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 24, boxShadow: '0 12px 30px -18px rgba(0,0,0,0.4)' }}>
            {err
              ? <div style={{ width: 186, height: 186, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', padding: 16 }}>Offline — Code konnte nicht erstellt werden. Ihr könnt trotzdem auf einem Handy spielen.</div>
              : code ? <QRCode value={link} size={186} fg="var(--ink)" />
                : <div style={{ width: 186, height: 186, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Code wird erstellt…</div>}
            <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 12, fontFamily: 'var(--num)', letterSpacing: 4 }}>{code || '····'}</div>
          </div>
        </div>
        {code && (
          <button onClick={copy} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'var(--font)', marginBottom: 18 }}>
            <Ic.link size={18} color="var(--accent)" />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--num)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.replace(/^https?:\/\//, '')}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>{copied ? '✓ Kopiert' : 'Kopieren'}</span>
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Dabei</div>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{joinedCount}/{players.length}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {players.map((p, i) => {
            const on = isIn(p, i);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px', opacity: on ? 1 : 0.5, transition: 'opacity .4s' }}>
                <Avatar name={p.name} color={p.color} size={32} dim={!on} />
                <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{p.name}{i === 0 ? ' (du)' : ''}</div>
                {on ? <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Ic.check size={15} /> {i === 0 ? 'Host' : 'verbunden'}</span>
                  : <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>wartet…</span>}
              </div>
            );
          })}
        </div>
      </Body>
      <Footer>
        <Steps n={3} i={2} />
        <Btn kind="primary" onClick={() => go('game')} iconR={<Ic.arrowR size={20} />}>Spiel starten</Btn>
      </Footer>
    </Screen>
  );
}

// ── Join (joiner picks who they are in the live session) ──
function JoinScreen({ go, players, setMe, sessionCode, account = null }) {
  const { Screen, Body, Footer, Btn, Avatar } = UI;
  const [sel, setSel] = useStateOB(null);
  const myName = account && account.name ? account.name.toLowerCase() : null;
  // Wiedereinstieg: hat dieses Gerät ein Konto, wird der passende (freie) Slot
  // automatisch vorausgewählt — Lena scannt Tommys QR und ist sofort als Lena dabei.
  useEffectOB(() => {
    if (!myName || sel != null) return;
    const mine = players.find(p => !p.host && !p.claimed && p.name && p.name.toLowerCase() === myName);
    if (mine) setSel(mine.id);
  }, [myName, players]);
  const enter = () => {
    if (sel == null) return;
    if (sessionCode) ACC.API.sessionClaim(sessionCode, sel).catch(() => {});
    setMe && setMe(sel);
    go('game');
  };
  return (
    <Screen>
      <div style={{ paddingTop: 70, padding: '70px 24px 4px', flexShrink: 0 }}>
        <Wordmark size={26} />
        {sessionCode && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', fontFamily: 'var(--num)', letterSpacing: 1 }}><Ic.users size={14} color="var(--accent)" /> SESSION {sessionCode}</div>}
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, marginTop: 18 }}>Wer bist du?</div>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', marginTop: 6 }}>Tippe deinen Namen an — dann trägst du deine Schläge ein.</div>
      </div>
      <Body style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {players.map(p => {
            const taken = !!p.host || !!p.claimed;       // host slot & already-joined slots aren't pickable
            const isMine = !taken && myName && p.name && p.name.toLowerCase() === myName;
            const note = p.host ? 'Gastgeber' : p.claimed ? 'schon dabei' : isMine ? 'du' : null;
            return (
              <button key={p.id} disabled={taken} onClick={() => !taken && setSel(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: taken ? 'default' : 'pointer',
                background: 'var(--card)', borderRadius: 18, padding: '12px 16px', opacity: taken ? 0.5 : 1,
                border: sel === p.id ? '2px solid var(--accent)' : '1px solid var(--line)', fontFamily: 'var(--font)',
              }}>
                <Avatar name={p.name} color={p.color} size={42} dim={taken} />
                <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{p.name}</div>
                {note && <div style={{ fontSize: 12.5, fontWeight: 700, color: isMine ? 'var(--accent)' : 'var(--ink-3)' }}>{note}</div>}
                {sel === p.id && <div style={{ color: 'var(--accent)' }}><Ic.check size={22} /></div>}
              </button>
            );
          })}
          {players.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, padding: '30px 0' }}>Diese Runde ist nicht mehr aktiv.</div>}
        </div>
      </Body>
      <Footer>
        <Btn kind="primary" disabled={sel == null} onClick={enter} iconR={<Ic.arrowR size={20} />}>Eintreten</Btn>
      </Footer>
    </Screen>
  );
}

// ── Join by code (companion: enter the host's session code) ──
function JoinCodeScreen({ go, onJoined, back = 'home' }) {
  const { Screen, AppHeader, Body, Footer, Btn } = UI;
  const [code, setCode] = useStateOB('');
  const [busy, setBusy] = useStateOB(false);
  const [err, setErr] = useStateOB('');
  const clean = code.trim().toUpperCase();
  const join = () => {
    if (clean.length < 4 || busy) return;
    setBusy(true); setErr('');
    ACC.API.getSession(clean)
      .then(sess => {
        if (!sess) { setErr('Diesen Code gibt es nicht (mehr). Prüfe die 4 Zeichen.'); setBusy(false); return; }
        onJoined && onJoined(sess);
      })
      .catch(() => { setErr('Verbindung fehlgeschlagen. Nochmal versuchen.'); setBusy(false); });
  };
  return (
    <Screen>
      <AppHeader title="Spiel beitreten" onBack={() => go(back)} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 18 }}>
          Richte deine <b>Handy-Kamera</b> auf den QR-Code des Gastgebers — oder gib hier den 4-stelligen Code ein, den er dir zeigt.
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Session-Code</label>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.slice(0, 4)); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && join()}
          placeholder="z.B. H432"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{ width: '100%', marginTop: 8, height: 60, borderRadius: 16, border: err ? '1px solid var(--bad)' : '1px solid var(--line)', background: 'var(--card)', padding: '0 18px', fontSize: 26, fontWeight: 700, letterSpacing: 8, textTransform: 'uppercase', fontFamily: 'var(--num)', outline: 'none' }} />
        {err && <div style={{ fontSize: 13, color: 'var(--bad)', marginTop: 9, fontWeight: 600 }}>{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', marginTop: 22 }}>
          <div style={{ color: 'var(--accent)' }}><Ic.users size={21} /></div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>Du steigst als Mitspieler ein und trägst nur deine eigenen Schläge ein.</div>
        </div>
      </Body>
      <Footer>
        <Btn kind="primary" disabled={clean.length < 4 || busy} onClick={join} iconR={<Ic.arrowR size={20} />}>{busy ? 'Suche Runde …' : 'Beitreten'}</Btn>
      </Footer>
    </Screen>
  );
}

window.OB = { Wordmark, LandingScreen, CoverScreen, AccountScreen, ScanScreen, RoleScreen, PlayersScreen, InviteScreen, JoinScreen, JoinCodeScreen, VENUE };
