// onboarding.jsx — plonky onboarding screens
const { useState: useStateOB, useEffect: useEffectOB, useRef: useRefOB } = React;

const VENUE = 'Mini-Golf Seebach'; // Default-/Fallback-Name

// ── Anlagen (venues) ──────────────────────────────────────
// Phase 1: kuratierte Liste im Code. Neue Anlage = eine Zeile + Push.
// holes = Bahnenzahl · illu = 'seebach' (eigene Grafik) | 'generic' (Fallback) · dev = nur zum Testen.
const VENUES = [
  { slug: 'seebach', name: 'Mini-Golf Seebach', holes: 18, illu: 'seebach' },
  { slug: 'davos',   name: 'Davos Hotel Waldhuus', holes: 9, illu: 'generic' },
  { slug: 'test',    name: 'Test-Platz',        holes: 4,  illu: 'generic', dev: true },
];
const DEFAULT_VENUE = VENUES[0];
const venueBySlug = s => VENUES.find(v => v.slug === String(s || '').toLowerCase()) || null;
const venueByName = n => VENUES.find(v => v.name === n) || null;

// flat plonky-style illustration: Seebach has its own SVG, others get a generic minigolf scene
function VenueIllo({ venue }) {
  if (venue && venue.illu === 'seebach') return <img src="/assets/seebach.svg" alt={venue.name} style={{ display: 'block', width: '100%' }} />;
  return (
    <svg viewBox="0 0 320 150" style={{ display: 'block', width: '100%' }} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={(venue && venue.name) || 'Minigolf'}>
      <rect width="320" height="150" fill="#DDEBD6" />
      <circle cx="58" cy="40" r="26" fill="#C6DEB8" /><circle cx="92" cy="34" r="30" fill="#C6DEB8" /><circle cx="128" cy="42" r="24" fill="#C6DEB8" />
      <rect y="78" width="320" height="72" fill="#A9CE97" />
      <path d="M150 150 L132 88 L188 88 L170 150 Z" fill="#B85C3C" />
      <ellipse cx="160" cy="120" rx="9" ry="3.4" fill="rgba(0,0,0,0.10)" />
      <circle cx="160" cy="113" r="6.5" fill="#fff" />
      <rect x="206" y="58" width="3.4" height="42" rx="1.7" fill="#6f7068" />
      <path d="M209 60 L228 66 L209 74 Z" fill="#15A35A" />
      <circle cx="250" cy="92" r="20" fill="#9CC487" /><circle cx="278" cy="96" r="16" fill="#9CC487" />
    </svg>
  );
}

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
function LandingScreen({ go, openLegal, openFaq, venue = DEFAULT_VENUE }) {
  const { Screen, Btn } = UI;
  return (
    <Screen bg="var(--paper)">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 26px', textAlign: 'center', overflowY: 'auto' }} className="noscroll">
        <div style={{ animation: 'fadeUp .5s both' }}><Wordmark size={28} /></div>
        {/* venue hero — tap to switch venue */}
        <button onClick={() => go('venues')} style={{ width: '100%', maxWidth: 320, marginTop: 20, borderRadius: 22, overflow: 'hidden', border: '1px solid var(--line)', boxShadow: '0 16px 40px -22px rgba(0,0,0,0.45)', background: 'var(--card)', animation: 'fadeUp .6s .1s both', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
          <VenueIllo venue={venue} />
          <div style={{ padding: '11px 15px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{venue.name} · {venue.holes} Bahnen</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>wechseln <Ic.chevR size={15} /></span>
          </div>
        </button>
        <div style={{ marginTop: 22, fontSize: 27, fontWeight: 800, lineHeight: 1.12, letterSpacing: -0.7, animation: 'fadeUp .5s .16s both' }}>Willkommen!</div>
        <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: 300, animation: 'fadeUp .5s .2s both' }}>
          Trag deine Runde digital ein — ganz ohne Zettel. Wir sind im Beta-Test, schön dass du dabei bist!
        </div>
      </div>
      <div style={{ padding: '0 22px 30px', animation: 'fadeUp .5s .25s both' }}>
        <Btn kind="primary" iconR={<Ic.arrowR size={20} />} onClick={() => go('cover')}>Los geht's</Btn>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-3)', textAlign: 'left' }}>
          <span style={{ flexShrink: 0 }}>ℹ️</span>
          <span><b>Beta-Version.</b> Diese App wird gerade getestet — keine Gewähr auf Verfügbarkeit oder Richtigkeit der Resultate. Alles dient nur dem Ausprobieren. Viel Spaß!</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <button onClick={() => (openFaq ? openFaq() : go('faq'))} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', textDecoration: 'underline', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: 4 }}>Häufige Fragen</button>
          <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>·</span>
          <button onClick={() => (openLegal ? openLegal() : go('legal'))} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', textDecoration: 'underline', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: 4 }}>Hinweise &amp; Datenschutz</button>
        </div>
      </div>
    </Screen>
  );
}

// ── Häufige Fragen (kurze Hilfe-/Q&A-Seite) ───────────────
function FaqScreen({ go, back = 'home', openLegal }) {
  const { Screen, AppHeader, Body } = UI;
  const Q = ({ children }) => <div style={{ fontSize: 15, fontWeight: 700, marginTop: 22, marginBottom: 6 }}>{children}</div>;
  const A = ({ children }) => <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{children}</div>;
  return (
    <Screen>
      <AppHeader title="Häufige Fragen" sub="So funktioniert's" onBack={() => go(back)} />
      <Body>
        <A>Das Wichtigste in Kürze — damit ihr in 30 Sekunden loslegt.</A>

        <Q>Was ist PLONKY?</Q>
        <A>Dein digitaler Mini-Golf-Zettel: Schläge eintragen, Stand sehen, fertig. Kein Download, keine Anmeldung.</A>

        <Q>„Ich tippe für alle" oder „Andere tippen mit"?</Q>
        <A><b>Ich tippe für alle:</b> ein Handy führt das Spiel, du trägst alle Schläge ein — am einfachsten.<br /><b>Andere tippen mit:</b> jeder trägt auf dem eigenen Handy nur sich selbst ein.</A>

        <Q>Wie machen die anderen mit?</Q>
        <A>Sie scannen den <b>QR-Code in deiner App</b> (Schritt „Anderen Code geben") — <b>nicht</b> einen QR-Code an der Bahn. Ohne Kamera: einfach den <b>4-Zeichen-Code</b> eintippen. So sind alle in derselben Runde.</A>

        <Q>Brauche ich ein Konto?</Q>
        <A>Nein — aber es lohnt sich. Dein Konto ist nur ein <b>persönlicher Link</b>, kein Passwort. Per „Link senden" schickst du ihn dir selbst oder speicherst ihn als Lesezeichen. So hast du deine Spiele auf jedem Gerät.</A>

        <Q>Familie & Crew?</Q>
        <A>Leg deine Mitspieler einmal an — beim nächsten Spiel sind sie direkt dabei. Wer mit eigenem Handy mitspielt, bekommt ein eigenes, verknüpftes Mitspieler-Konto.</A>

        <Q>Mitten im Spiel rausgehen?</Q>
        <A>Tippe oben auf <b>Pause</b> — die Runde läuft weiter. Über „▶ Laufende Runde" auf der Startseite tauchst du wieder ein.</A>

        <Q>Wie beende ich ein Spiel?</Q>
        <A>Auf der letzten Bahn auf <b>„Spiel beenden"</b> — dann sehen alle den Endstand und der Sieger steht fest. Fehlt noch etwas, fragt die App kurz nach.</A>

        <Q>Fotos?</Q>
        <A>Gib dir und deiner Crew in den Einstellungen ein Foto — es erscheint überall: im Spiel, im Endstand und im Verlauf.</A>

        <div style={{ marginTop: 24, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Noch eine Frage? Schreib uns über „Feedback geben". Zu Daten &amp; Beta: <button onClick={() => (openLegal ? openLegal() : go('legal'))} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}>Hinweise &amp; Datenschutz</button>.
        </div>
      </Body>
    </Screen>
  );
}

// ── Hinweise & Datenschutz (schlanke Beta-Seite) ──────────
function LegalScreen({ go, back = 'cover' }) {
  const { Screen, AppHeader, Body } = UI;
  const H = ({ children }) => <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 20, marginBottom: 6 }}>{children}</div>;
  const P = ({ children }) => <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{children}</div>;
  return (
    <Screen>
      <AppHeader title="Hinweise & Datenschutz" sub="Beta" onBack={() => go(back)} />
      <Body>
        <P>PLONKY hilft dir, Mini-Golf-Runden digital zu zählen — aktuell in einer offenen Testphase (Beta).</P>
        <H>Beta — keine Gewähr</H>
        <P>Diese App wird gerade getestet. Wir übernehmen keine Garantie für Verfügbarkeit, Fehlerfreiheit oder die Richtigkeit der Resultate. Nutzung zum Vergnügen, auf eigene Verantwortung.</P>
        <H>Welche Daten gespeichert werden</H>
        <P>Dein Name und — wenn du magst — dein Profilfoto, deine Spielergebnisse (Schläge pro Bahn), die Crew-Mitglieder, die du selbst anlegst, sowie optionales Feedback, das du uns schickst. Es gibt kein Passwort: der Zugang läuft allein über deinen persönlichen Link.</P>
        <H>Wo & wie</H>
        <P>Die Daten liegen in einer Datenbank auf den Servern unseres Hosters (render). Wir machen kein Werbe-Tracking. Profilfotos werden klein gespeichert — bitte lade nur Bilder hoch, zu denen du berechtigt bist.</P>
        <H>Löschen & Auskunft</H>
        <P>Du möchtest dein Konto oder deine Daten löschen lassen, oder wissen, was gespeichert ist? Eine kurze Mail genügt.</P>
        <H>Kontakt</H>
        <P>plonky.app@gmail.com</P>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 22, lineHeight: 1.45 }}>Stand: Juni 2026 · Dies ist ein Hinweistext für die Testphase, keine Rechtsberatung.</div>
      </Body>
    </Screen>
  );
}

// ── 1. Cover ──────────────────────────────────────────────
function CoverScreen({ go, account, scanEnabled = true, onStart, companion = false, venue = DEFAULT_VENUE }) {
  const { Screen, Btn, Avatar } = UI;
  return (
    <Screen bg="var(--paper)">
      {account && (
        <div style={{ position: 'absolute', top: 60, right: 20, zIndex: 5 }}>
          <button onClick={() => go('home')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 7px 5px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Mein plonky</span>
            <Avatar name={account.name} color={account.color} size={30} accountId={account.id} src={account.avatar} />
          </button>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 26px', paddingTop: 96 }}>
        <div style={{ animation: 'fadeUp .5s both' }}><Wordmark size={36} /></div>
        {!scanEnabled && (
          <button onClick={() => go('venues')} style={{ marginTop: 16, display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '7px 12px 7px 14px', animation: 'fadeUp .5s .03s both', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <Ic.pin size={15} color="var(--accent)" /><span style={{ fontSize: 13.5, fontWeight: 600 }}>{venue.name} · {venue.holes} Bahnen</span><Ic.chevR size={15} color="var(--ink-3)" />
          </button>
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
        {!account && <button onClick={() => go('restore')} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '8px 6px' }}><Ic.link size={17} /> Schon ein Konto? Link einfügen</button>}
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

// ── Konto wiederherstellen (Link einfügen → Konto in diese „Schublade" holen) ──
function RestoreScreen({ go, onRestore, back = 'cover' }) {
  const { Screen, AppHeader, Body, Footer, Btn } = UI;
  const [val, setVal] = useStateOB('');
  const [busy, setBusy] = useStateOB(false);
  const [err, setErr] = useStateOB('');
  const submit = () => {
    const v = val.trim();
    if (!v || busy || !onRestore) return;
    setBusy(true); setErr('');
    onRestore(v).catch(() => { setErr('Konto nicht gefunden. Prüfe deinen Link und versuch es nochmal.'); setBusy(false); });
  };
  return (
    <Screen>
      <AppHeader title="Konto wiederherstellen" onBack={() => go(back)} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 16 }}>
          Du hast dein Konto schon auf einem anderen Gerät oder im Browser? Füge hier deinen <b>persönlichen Link</b> ein — dann hast du dasselbe Konto auch hier.
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Dein Zugangslink</label>
        <input autoFocus value={val} onChange={e => { setVal(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="app.plonky.ch/m/…"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          style={{ width: '100%', marginTop: 8, height: 54, borderRadius: 16, border: err ? '1px solid var(--bad)' : '1px solid var(--line)', background: 'var(--card)', padding: '0 16px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }} />
        {err && <div style={{ fontSize: 13, color: 'var(--bad)', marginTop: 9, fontWeight: 600 }}>{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', marginTop: 20 }}>
          <div style={{ color: 'var(--accent)' }}><Ic.link size={20} /></div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>Den Link findest du auf dem anderen Gerät in den <b>Einstellungen</b> unter „Dein Zugangslink" (Kopieren oder „Link senden").</div>
        </div>
      </Body>
      <Footer>
        <Btn kind={val.trim() ? 'primary' : 'secondary'} disabled={!val.trim() || busy} onClick={submit} icon={<Ic.link size={19} />}>{busy ? 'Suche dein Konto …' : 'Konto wiederherstellen'}</Btn>
      </Footer>
    </Screen>
  );
}

// ── 2. Scan ───────────────────────────────────────────────
function ScanScreen({ go, express, venue = DEFAULT_VENUE }) {
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
              <Ic.pin size={15} color="var(--accent)" /> {venue.name}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Willkommen!</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 18 }}>Neue Session bereit · {venue.holes} Bahnen</div>
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
          Spielt ihr zusammen, reicht ein Handy. Oder jeder tippt selbst — wie ihr wollt.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <UI.ChoiceCard icon={<Ic.user size={26} />} title="Ich tippe für alle" badge="A"
            desc="Ein Handy führt das Spiel. Am einfachsten."
            selected={role === 'me'} onClick={() => setRole('me')} />
          <UI.ChoiceCard icon={<Ic.users size={26} />} title="Andere tippen mit" badge="B"
            desc="Jeder scannt den Code und trägt selbst ein."
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
      <AppHeader title="Wer spielt mit?" sub={role === 'others' ? 'Spieler anlegen' : 'Familie & Freunde'} onBack={() => go('welcome')} />
      <Body>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} placeholder="Name eingeben"
            style={{ flex: 1, height: 52, borderRadius: 15, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 16px', fontSize: 16.5, fontFamily: 'var(--font)', outline: 'none' }} />
          <button onClick={add} style={{ width: 52, height: 52, borderRadius: 15, border: 'none', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Ic.plus size={24} /></button>
        </div>
        {!(players[0] && players[0].id === 'me') && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'color-mix(in srgb, var(--accent) 7%, var(--card))', border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--line))', borderRadius: 14, padding: '11px 13px', marginBottom: 14 }}>
            <span style={{ flexShrink: 0, fontSize: 15 }}>👑</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>Der <b>erste Name</b> ist der Haupt-Spieler (Gastgeber) — trag am besten <b>dich selbst zuerst</b> ein.</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {players.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, padding: '26px 0' }}>Noch niemand dabei.<br />Tipp oben den ersten Namen ein.</div>
          )}
          {players.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '10px 12px 10px 12px', animation: 'fadeUp .3s both' }}>
              <Avatar name={p.name} color={p.color} size={38} accountId={p.account_id} src={p.avatar} />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{p.name}</div>
              {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}>GASTGEBER</span>}
              <button onClick={() => remove(p.id)} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x size={18} /></button>
            </div>
          ))}
        </div>
        {(players.length > 0 || family.length > 0) && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
            {family.length > 0 && <div style={{ width: '100%', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 2 }}>Aus deiner Crew</div>}
            {family.map(m => m.name).filter(n => !players.find(p => p.name === n)).slice(0, 6).map(n => (
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
function InviteScreen({ go, players, mode, sessionCode, setSessionCode, venueName = VENUE }) {
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
      mode: mode || 'sequential', venue: venueName,
      players: players.map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, avatar: p.avatar || '' })),
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
                <Avatar name={p.name} color={p.color} size={32} dim={!on} accountId={p.account_id} src={p.avatar} />
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
  const myAccId = account && account.id ? String(account.id) : null;
  // Ein Slot, den ich selbst (mit meinem Konto) belegt habe, darf ich wieder
  // betreten — auch wenn er noch als „belegt" gilt (z. B. App war kurz zu).
  const isReclaimable = (p) => !p.host && p.claimed && myAccId && p.account_id && String(p.account_id) === myAccId;
  // Wiedereinstieg: hat dieses Gerät ein Konto, wird der passende Slot automatisch
  // vorausgewählt — der eigene (auch schon belegte) Slot, sonst der freie Namens-Slot.
  useEffectOB(() => {
    if (sel != null) return;
    const reclaim = players.find(isReclaimable);
    if (reclaim) { setSel(reclaim.id); return; }
    if (!myName) return;
    const mine = players.find(p => !p.host && !p.claimed && p.name && p.name.toLowerCase() === myName);
    if (mine) setSel(mine.id);
  }, [myName, myAccId, players]);
  const enter = () => {
    if (sel == null) return;
    if (sessionCode) ACC.API.sessionClaim(sessionCode, sel, account && account.avatar, account && account.id).catch(() => {});
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
            const reclaimable = isReclaimable(p);         // my own claimed slot — re-enterable
            const taken = (!!p.host || !!p.claimed) && !reclaimable; // host & others' claimed slots aren't pickable
            const isMine = !taken && ((myName && p.name && p.name.toLowerCase() === myName) || reclaimable);
            const note = p.host ? 'Gastgeber' : reclaimable ? 'wieder eintreten' : p.claimed ? 'schon dabei' : isMine ? 'du' : null;
            return (
              <button key={p.id} disabled={taken} onClick={() => !taken && setSel(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: taken ? 'default' : 'pointer',
                background: 'var(--card)', borderRadius: 18, padding: '12px 16px', opacity: taken ? 0.5 : 1,
                border: sel === p.id ? '2px solid var(--accent)' : '1px solid var(--line)', fontFamily: 'var(--font)',
              }}>
                <Avatar name={p.name} color={p.color} size={42} dim={taken} accountId={p.account_id} src={p.avatar} />
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

// Pull a 4-char join code out of a scanned QR payload (usually a /j/<code> URL).
function extractJoinCode(data) {
  if (!data) return null;
  const m = String(data).match(/\/j\/([A-Za-z0-9]{4})(?:[\/?#]|$)/);
  if (m) return m[1].toUpperCase();
  const raw = String(data).trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(raw) ? raw : null;
}

// ── Live camera QR scanner (getUserMedia + jsQR) ──────────
function QrScanner({ onCode, onClose }) {
  const videoRef = useRefOB(null);
  const [err, setErr] = useStateOB('');
  useEffectOB(() => {
    let stream = null, raf = null, alive = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } };
    const scan = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth && window.jsQR) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          const c = res && extractJoinCode(res.data);
          if (c) { alive = false; stop(); onCode(c); return; }
        } catch (e) {}
      }
      raf = requestAnimationFrame(scan);
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr('Kamera wird hier nicht unterstützt. Gib den Code unten ein.');
    } else {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then(s => {
          if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
          stream = s;
          const v = videoRef.current;
          if (v) { v.srcObject = s; v.play().catch(() => {}); }
          raf = requestAnimationFrame(scan);
        })
        .catch(() => setErr('Kein Kamerazugriff. Erlaube die Kamera — oder gib den Code unten ein.'));
    }
    return () => { alive = false; stop(); };
  }, []);
  const bracket = (pos) => {
    const base = { position: 'absolute', width: 34, height: 34, borderColor: '#fff', borderStyle: 'solid', borderWidth: 0 };
    const m = { tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 }, tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 }, bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 }, br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 } };
    return <div style={{ ...base, ...m[pos] }} />;
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0E0F0C' }}>
      <video ref={videoRef} muted autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 20px 0' }}>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 13, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic.x size={20} /></button>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 600 }}>QR-Code scannen</div>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-54%)', width: 230, height: 230 }}>
        {bracket('tl')}{bracket('tr')}{bracket('bl')}{bracket('br')}
        <div style={{ position: 'absolute', left: '6%', right: '6%', height: 2, background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', boxShadow: '0 0 12px var(--accent)', animation: 'scanline 1.5s ease-in-out infinite alternate' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 22px 40px', textAlign: 'center' }}>
        {err
          ? <div style={{ fontSize: 14, color: '#fff', background: 'rgba(216,83,59,0.92)', borderRadius: 14, padding: '12px 16px', lineHeight: 1.4 }}>{err}</div>
          : <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.85)' }}>Richte die Kamera auf den QR-Code des Gastgebers</div>}
        <button onClick={onClose} style={{ marginTop: 16, width: '100%', height: 50, borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Code stattdessen eingeben</button>
      </div>
    </div>
  );
}

// ── Join by code / scan (companion: join the host's session) ──
function JoinCodeScreen({ go, onJoined, back = 'home' }) {
  const { Screen, AppHeader, Body, Footer, Btn } = UI;
  const [code, setCode] = useStateOB('');
  const [busy, setBusy] = useStateOB(false);
  const [err, setErr] = useStateOB('');
  const [scanning, setScanning] = useStateOB(false);
  const clean = code.trim().toUpperCase();
  const join = (codeArg) => {
    const cc = ((codeArg || clean) + '').trim().toUpperCase();
    if (cc.length < 4 || busy) return;
    setBusy(true); setErr('');
    ACC.API.getSession(cc, true)
      .then(sess => {
        if (!sess) { setErr('Diesen Code gibt es nicht (mehr). Prüfe die 4 Zeichen.'); setBusy(false); return; }
        onJoined && onJoined(sess);
      })
      .catch(() => { setErr('Verbindung fehlgeschlagen. Nochmal versuchen.'); setBusy(false); });
  };
  if (scanning) return <QrScanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setCode(c); join(c); }} />;
  return (
    <Screen>
      <AppHeader title="Spiel beitreten" onBack={() => go(back)} />
      <Body>
        <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 16 }}>
          Scanne den QR-Code des Gastgebers — oder gib den 4-stelligen Code ein, den er dir zeigt.
        </div>
        <Btn kind="primary" icon={<Ic.camera size={20} />} onClick={() => { setErr(''); setScanning(true); }}>QR-Code scannen</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>oder Code eingeben</span>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.slice(0, 4)); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && join()}
          placeholder="z.B. H432"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{ width: '100%', height: 60, borderRadius: 16, border: err ? '1px solid var(--bad)' : '1px solid var(--line)', background: 'var(--card)', padding: '0 18px', fontSize: 26, fontWeight: 700, letterSpacing: 8, textTransform: 'uppercase', fontFamily: 'var(--num)', outline: 'none' }} />
        {err && <div style={{ fontSize: 13, color: 'var(--bad)', marginTop: 9, fontWeight: 600 }}>{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', marginTop: 22 }}>
          <div style={{ color: 'var(--accent)' }}><Ic.users size={21} /></div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>Du steigst als Mitspieler ein und trägst nur deine eigenen Schläge ein.</div>
        </div>
      </Body>
      <Footer>
        <Btn kind={clean.length >= 4 ? 'primary' : 'secondary'} disabled={clean.length < 4 || busy} onClick={() => join()} iconR={<Ic.arrowR size={20} />}>{busy ? 'Suche Runde …' : 'Mit Code beitreten'}</Btn>
      </Footer>
    </Screen>
  );
}

// ── Anlagen-Auswahl ───────────────────────────────────────
function VenuesScreen({ go, onPick, active = null, back = null }) {
  const { Screen, Body } = UI;
  return (
    <Screen bg="var(--paper)">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 22px', paddingTop: 64, overflowY: 'auto' }} className="noscroll">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Wordmark size={26} /></div>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, textAlign: 'center' }}>Wo spielst du?</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', textAlign: 'center', marginTop: 6, marginBottom: 22, lineHeight: 1.45 }}>Wähle deine Anlage — oder scanne den QR-Code am Platz.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {VENUES.map(v => (
            <button key={v.slug} onClick={() => onPick(v.slug)} style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
              background: 'var(--card)', border: (active === v.slug ? '2px solid var(--accent)' : v.dev ? '1px dashed var(--line)' : '1px solid var(--line)'),
              borderRadius: 18, padding: '12px 13px', cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 13, overflow: 'hidden', flexShrink: 0, background: 'var(--line-2)' }}><VenueIllo venue={v} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: v.dev ? 'var(--ink-2)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                  {v.holes} Bahnen{v.dev ? ' · nur zum Ausprobieren' : ''}
                </div>
              </div>
              <Ic.chevR size={19} color="var(--ink-3)" />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, fontSize: 12.5, color: 'var(--ink-3)' }}>
          <Ic.scan size={16} color="var(--ink-3)" /> Am Platz kommst du per QR-Code direkt rein.
        </div>
      </div>
      {back && (
        <div style={{ padding: '0 22px 26px' }}>
          <UI.Btn kind="secondary" onClick={() => go(back)}>Zurück</UI.Btn>
        </div>
      )}
    </Screen>
  );
}

window.OB = { Wordmark, LandingScreen, LegalScreen, FaqScreen, CoverScreen, AccountScreen, RestoreScreen, ScanScreen, RoleScreen, PlayersScreen, InviteScreen, JoinScreen, JoinCodeScreen, VenuesScreen, VENUE, VENUES, DEFAULT_VENUE, venueBySlug, venueByName };
