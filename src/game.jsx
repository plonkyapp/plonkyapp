// game.jsx — scoring screen, voice input, timeline, results, express setup
const { useState: useS, useEffect: useE, useRef: useR } = React;

const PARS = [2, 3, 2, 3, 2, 4, 2, 3, 3, 2, 3, 2, 4, 2, 3, 2, 3, 3];
const HOLES = 18;
const par = h => PARS[(h - 1) % PARS.length];
const sumPar = (from, to) => { let s = 0; for (let h = from; h <= to; h++) s += par(h); return s; };

function totals(p) {
  let strokes = 0, played = 0, parPlayed = 0;
  for (let h = 1; h <= HOLES; h++) {
    const v = p.scores[h];
    if (v > 0) { strokes += v; played++; parPlayed += par(h); }
  }
  return { strokes, played, toPar: strokes - parPlayed };
}
const fmtPar = n => (n === 0 ? 'Par' : n > 0 ? '+' + n : '' + n);

// ── Bahn header (master) ──────────────────────────────────
function BahnHeader({ hole, mode, onPrev, onNext }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '2px 0 6px' }}>
      <button onClick={onPrev} disabled={hole <= 1} style={navBtn(hole <= 1)}><Ic.chevL size={22} /></button>
      <div style={{ textAlign: 'center', minWidth: 130 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: 1.4, textTransform: 'uppercase' }}>Bahn</div>
        <div style={{ fontFamily: 'var(--num)', fontSize: 62, fontWeight: 600, lineHeight: 1, letterSpacing: -2, marginTop: 2 }}>{hole}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 5 }}>von {HOLES}</div>
      </div>
      <button onClick={onNext} disabled={hole >= HOLES} style={navBtn(hole >= HOLES)}><Ic.chevR size={22} /></button>
    </div>
  );
}
const navBtn = dis => ({
  width: 44, height: 44, borderRadius: 14, border: '1px solid var(--line)',
  background: 'var(--card)', color: dis ? 'var(--ink-3)' : 'var(--ink)',
  opacity: dis ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: dis ? 'default' : 'pointer', flexShrink: 0,
});

// ── Player score row ──────────────────────────────────────
function ScoreRow({ p, hole, focused, onFocus, onSet, showTotals, editable = true, isMe = false }) {
  const v = p.scores[hole] || 0;
  const t = totals(p);
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 18,
      border: isMe ? '2px solid var(--accent)' : focused ? '2px solid var(--accent)' : '1px solid var(--line)',
      padding: (focused && editable) ? '11px 13px' : '12px 14px', transition: 'border .15s',
      opacity: editable ? 1 : 0.92,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <UI.Avatar name={p.name} color={p.color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 7 }}>
            {p.name}
            {isMe && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.3 }}>DU</span>}
          </div>
          {showTotals && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>
              {t.played ? `Gesamt ${t.strokes} · ${t.played} Bahnen` : 'noch nichts'}
            </div>
          )}
        </div>
        {editable ? (
          /* stepper */
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 2 }}>
            <button onClick={() => onSet(p.id, Math.max(0, v - 1))} style={stepBtn(v <= 0)}><Ic.minus size={20} /></button>
            <button onClick={() => onFocus(focused ? null : p.id)} style={{
              width: 46, height: 44, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: v > 0 ? 'var(--ink)' : 'var(--line-2)', color: v > 0 ? '#fff' : 'var(--ink-3)',
              fontFamily: 'var(--num)', fontSize: 22, fontWeight: 600,
            }}>{v > 0 ? v : '–'}</button>
            <button onClick={() => onSet(p.id, Math.min(9, v + 1))} style={stepBtn(false, true)}><Ic.plus size={20} /></button>
          </div>
        ) : (
          /* read-only score (other players, when you joined as a single player) */
          <div style={{
            width: 46, height: 44, borderRadius: 13, marginLeft: 2, flexShrink: 0,
            background: 'var(--line-2)', color: v > 0 ? 'var(--ink)' : 'var(--ink-3)',
            fontFamily: 'var(--num)', fontSize: 22, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{v > 0 ? v : '–'}</div>
        )}
      </div>
      {/* quick digits */}
      {editable && focused && (
        <div style={{ display: 'flex', gap: 6, marginTop: 11, animation: 'fadeUp .2s both' }}>
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <button key={n} onClick={() => { onSet(p.id, n); onFocus(null); }} style={{
              flex: 1, height: 42, borderRadius: 11, cursor: 'pointer', fontFamily: 'var(--num)', fontSize: 18, fontWeight: 600,
              border: '1px solid var(--line)',
              background: v === n ? 'var(--accent)' : 'var(--card)', color: v === n ? '#fff' : 'var(--ink)',
            }}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}
const relColorTotal = n => n < 0 ? 'var(--accent)' : n > 0 ? 'var(--bad)' : 'var(--ink-2)';
const stepBtn = (dis, accent) => ({
  width: 40, height: 44, borderRadius: 13, border: '1px solid var(--line)',
  background: 'var(--card)', color: dis ? 'var(--ink-3)' : (accent ? 'var(--accent)' : 'var(--ink)'),
  opacity: dis ? 0.45 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: dis ? 'default' : 'pointer', flexShrink: 0,
});

// ── Timeline ──────────────────────────────────────────────
function Timeline({ hole, players, mode, onJump }) {
  const playedHole = h => players.length > 0 && players.every(p => (p.scores[h] || 0) > 0);
  return (
    <div style={{ padding: '4px 2px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
        {Array.from({ length: HOLES }).map((_, k) => {
          const h = k + 1, cur = h === hole, done = playedHole(h);
          return (
            <button key={h} onClick={() => onJump(h)}
              style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {cur && <div style={{ fontFamily: 'var(--num)', fontSize: 10.5, fontWeight: 700, color: 'var(--accent)' }}>{h}</div>}
              <div style={{
                width: '100%', height: cur ? 14 : done ? 8 : 6, borderRadius: 3,
                background: cur ? 'var(--accent)' : done ? 'color-mix(in srgb, var(--accent) 55%, var(--line))' : 'var(--line)',
                transition: 'all .2s',
              }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink-3)' }}>
        <span>Bahn 1 · antippen</span><span>{players.filter(p => totals(p).played === HOLES).length === players.length && players.length ? 'fertig' : `${players.length ? totals(players[0]).played : 0}/18`}</span><span>Bahn 18</span>
      </div>
    </div>
  );
}

// ── Voice parsing (German) ────────────────────────────────
const NUMW = { eins: 1, ein: 1, eine: 1, einen: 1, as: 1, ass: 1, einlochen: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, 'fünf': 5, fuenf: 5, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
function wordNum(tok) { if (/^[1-9]$/.test(tok)) return +tok; return NUMW[tok] != null ? NUMW[tok] : null; }
function parseVoice(text, players) {
  const toks = (text || '').toLowerCase().replace(/[.,!?:;]/g, ' ').split(/\s+/).filter(Boolean);
  const nameMap = {}; players.forEach(p => { nameMap[p.name.toLowerCase().split(' ')[0]] = p.id; });
  const found = {}; let cur = null;
  for (const tk of toks) {
    if (nameMap[tk] != null) { cur = nameMap[tk]; continue; }
    const n = wordNum(tk);
    if (n != null && cur != null) { found[cur] = n; cur = null; }
  }
  return found;
}

// ── Voice sheet (Web Speech API + typed fallback) ─────────
function VoiceSheet({ players, hole, onApply, onClose }) {
  const [phase, setPhase] = useS('init');      // init | listening | result | manual
  const [parsed, setParsed] = useS([]);
  const [transcript, setTranscript] = useS('');
  const [manualText, setManualText] = useS('');
  const [denied, setDenied] = useS(false);
  const recRef = useR(null);
  const txtRef = useR('');
  const [partial, setPartial] = useS(false);
  const doneRef = useR(false);

  const finishWith = (text) => {
    if (doneRef.current) return; doneRef.current = true;
    const found = parseVoice(text, players);
    const heardIds = Object.keys(found);
    const list = heardIds.length
      ? players.filter(p => found[p.id] != null).map(p => ({ id: p.id, name: p.name, color: p.color, v: found[p.id], heard: true }))
      : players.map(p => ({ id: p.id, name: p.name, color: p.color, v: p.scores[hole] || 2, heard: false }));
    setParsed(list);
    setPartial(heardIds.length > 0 && heardIds.length < players.length);
    setPhase('result');
  };

  const stop = (parse) => {
    const rec = recRef.current;
    if (rec) { try { rec.onend = null; rec.abort(); } catch (e) {} }
    if (parse) finishWith(txtRef.current);
  };

  const startListening = () => {
    doneRef.current = false; txtRef.current = ''; setTranscript('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setPhase('manual'); return; }
    let rec; try { rec = new SR(); } catch (e) { setPhase('manual'); return; }
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let fin = '', interim = '';
      for (let i = 0; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript + ' '; else interim += r[0].transcript; }
      const full = (fin + interim).trim(); txtRef.current = full; setTranscript(full);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setDenied(true);
      if (!doneRef.current) setPhase('manual');
    };
    rec.onend = () => { if (!doneRef.current) finishWith(txtRef.current); };
    recRef.current = rec;
    setPhase('listening');
    try { rec.start(); } catch (e) { setPhase('manual'); }
  };

  useE(() => {
    startListening();
    return () => { doneRef.current = true; const rec = recRef.current; if (rec) { try { rec.abort(); } catch (e) {} } };
  }, []);

  const setV = (idx, d) => setParsed(ps => ps.map((x, i) => i === idx ? { ...x, v: Math.max(1, Math.min(9, x.v + d)) } : x));

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', animation: 'fadeIn .2s both' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,16,12,0.45)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--paper)', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: '14px 22px 34px', animation: 'fadeUp .3s both', maxHeight: '82%', overflow: 'auto' }} className="noscroll">
        <div style={{ width: 40, height: 5, borderRadius: 5, background: 'var(--line)', margin: '0 auto 18px' }} />

        {(phase === 'listening' || phase === 'init') && (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 18px' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', animation: 'pulseRing 1.4s ease-out infinite' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.mic size={38} /></div>
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center', height: 24, marginBottom: 14 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ width: 4, height: 20, borderRadius: 4, background: 'var(--accent)', animation: `micWave .9s ${i * 0.08}s ease-in-out infinite` }} />
              ))}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>Ich höre zu …</div>
            {transcript
              ? <div style={{ fontSize: 16, color: 'var(--ink)', marginTop: 10, fontWeight: 500, minHeight: 22, padding: '0 6px' }}>„{transcript}"</div>
              : <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6 }}>Sag z.B. „Anna drei, Marco zwei, Lena eins"</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <UI.Btn kind="secondary" onClick={() => { stop(false); setPhase('manual'); }} style={{ flex: 1 }}>Lieber tippen</UI.Btn>
              <UI.Btn kind="primary" onClick={() => stop(true)} style={{ flex: 1.3 }} icon={<Ic.check size={20} />}>Fertig</UI.Btn>
            </div>
          </div>
        )}

        {phase === 'manual' && (
          <div style={{ animation: 'fadeUp .2s both' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Schläge eintippen</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.4 }}>
              {denied ? 'Mikrofon ist nicht freigegeben. ' : ''}Schreib z.B. <b>Anna 3, Marco 2, Lena 1</b> — ich verteile die Zahlen.
            </div>
            <input autoFocus value={manualText} onChange={e => setManualText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (doneRef.current = false, finishWith(manualText))}
              placeholder={players.map(p => p.name.split(' ')[0] + ' …').join(', ')}
              style={{ width: '100%', height: 54, borderRadius: 15, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 16px', fontSize: 16, fontFamily: 'var(--font)', outline: 'none' }} />
            <UI.Btn kind="primary" onClick={() => { doneRef.current = false; finishWith(manualText); }} style={{ marginTop: 14 }} icon={<Ic.sparkle size={18} />}>Auswerten</UI.Btn>
          </div>
        )}

        {phase === 'result' && (
          <div style={{ animation: 'fadeUp .25s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.sparkle size={19} /></div>
              <div><div style={{ fontSize: 17, fontWeight: 700 }}>Bahn {hole} — eintragen</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{partial ? 'Nur Genannte — andere bleiben unverändert' : 'Antippen zum Korrigieren'}</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parsed.map((e, idx) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid ' + (e.heard ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : 'var(--line)'), borderRadius: 14, padding: '9px 12px' }}>
                  <UI.Avatar name={e.name} color={e.color} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{e.name}</div>
                    {!e.heard && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>nicht genannt · anpassen</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setV(idx, -1)} style={stepBtn(e.v <= 1)}><Ic.minus size={18} /></button>
                    <div style={{ width: 42, height: 44, borderRadius: 12, background: 'var(--ink)', color: '#fff', fontFamily: 'var(--num)', fontSize: 21, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{e.v}</div>
                    <button onClick={() => setV(idx, 1)} style={stepBtn(false, true)}><Ic.plus size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <UI.Btn kind="secondary" onClick={startListening} style={{ flex: 1 }} icon={<Ic.mic size={18} />}>Nochmal</UI.Btn>
              <UI.Btn kind="primary" onClick={() => onApply(parsed)} style={{ flex: 1.4 }} icon={<Ic.check size={20} />}>Übernehmen</UI.Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Game screen ───────────────────────────────────────────
function GameScreen({ players, setPlayers, mode, go, voiceOn, showTotals, openResults, sessionCode, me }) {
  const [hole, setHole] = useS(1);
  const [focus, setFocus] = useS(null);
  const [voice, setVoice] = useS(false);
  const pendingRef = useR({}); // "pid:hole" -> value not yet confirmed by the server

  const pushScore = (id, h, val) => {
    if (!sessionCode) return;
    pendingRef.current[id + ':' + h] = val;
    ACC.API.sessionScore(sessionCode, id, h, val).catch(() => {});
  };
  const set = (id, val) => {
    if (me != null && String(id) !== String(me)) return; // joined as one player: only your own score
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, scores: { ...p.scores, [hole]: val } } : p));
    pushScore(id, hole, val);
  };
  const applyVoice = (parsed) => {
    setPlayers(ps => ps.map(p => { const e = parsed.find(x => x.id === p.id); return e ? { ...p, scores: { ...p.scores, [hole]: e.v } } : p; }));
    parsed.forEach(e => pushScore(e.id, hole, e.v));
    setVoice(false);
  };

  // live session: pull others' scores; local pending writes win until the server echoes them back
  useE(() => {
    if (!sessionCode) return;
    let alive = true;
    const tick = () => ACC.API.getSession(sessionCode).then(sess => {
      if (!alive || !sess) return;
      const srv = {}; (sess.players || []).forEach(sp => { srv[sp.id] = sp; });
      const pending = pendingRef.current;
      setPlayers(prev => prev.map(p => {
        const sp = srv[p.id];
        if (!sp) return p;
        const merged = { ...(sp.scores || {}) };
        Object.keys(pending).forEach(k => {
          const sep = k.indexOf(':'); const pid = k.slice(0, sep); const h = k.slice(sep + 1);
          if (pid !== String(p.id)) return;
          if (String(merged[h]) === String(pending[k])) delete pending[k]; // server caught up
          else merged[h] = pending[k];                                     // keep local for now
        });
        return { ...p, scores: merged };
      }));
    }).catch(() => {});
    tick();
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [sessionCode]);
  const canEdit = (pid) => me == null || String(pid) === String(me);
  const ordered = me == null ? players : [...players].sort((a, b) => {
    const am = String(a.id) === String(me), bm = String(b.id) === String(me);
    return am === bm ? 0 : am ? -1 : 1;
  });
  const allEntered = players.length > 0 && players.every(p => (p.scores[hole] || 0) > 0);
  const allDone = players.length > 0 && players.every(p => totals(p).played === HOLES);
  const last = hole >= HOLES;

  return (
    <UI.Screen>
      {/* top chrome */}
      <div style={{ paddingTop: 56, padding: '56px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>
            <Ic.pin size={14} color="var(--accent)" /> {OB.VENUE}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap' }}>
            {mode === 'sequential' ? <><Ic.list size={13} /> Bahn für Bahn</> : <><Ic.shuffle size={13} /> Guerilla</>}
          </div>
        </div>
        <BahnHeader hole={hole} mode={mode} onPrev={() => { setFocus(null); setHole(h => Math.max(1, h - 1)); }} onNext={() => { setFocus(null); setHole(h => Math.min(HOLES, h + 1)); }} />
      </div>

      <UI.Body pad={16} style={{ paddingTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {ordered.map(p => (
            <ScoreRow key={p.id} p={p} hole={hole} focused={focus === p.id} onFocus={setFocus} onSet={set} showTotals={showTotals}
              editable={canEdit(p.id)} isMe={me != null && String(p.id) === String(me)} />
          ))}
        </div>
      </UI.Body>

      {/* bottom: voice + timeline + advance */}
      <div style={{ flexShrink: 0, padding: '10px 16px 26px', background: 'linear-gradient(to top, var(--paper) 70%, rgba(244,244,241,0))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Timeline hole={hole} players={players} mode={mode} onJump={h => { setFocus(null); setHole(h); }} />
        <div style={{ display: 'flex', gap: 10 }}>
          {voiceOn && me == null && (
            <button onClick={() => setVoice(true)} title="Spracheingabe" style={{
              width: 56, height: 56, borderRadius: 18, flexShrink: 0, cursor: 'pointer',
              border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Ic.mic size={24} /></button>
          )}
          <button onClick={() => openResults(false)} title="Zwischenstand" style={{
            width: 56, height: 56, borderRadius: 18, flexShrink: 0, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Ic.list size={23} /></button>
          {mode === 'sequential' ? (
            <UI.Btn kind={allEntered || last ? 'primary' : 'secondary'} onClick={() => { if (last) openResults(true); else { setFocus(null); setHole(h => h + 1); } }} style={{ flex: 1 }}
              iconR={!last && <Ic.arrowR size={20} />} icon={last && <Ic.trophy size={20} />}>
              {last ? 'Spiel beenden' : allEntered ? 'Nächste Bahn' : 'Weiter'}
            </UI.Btn>
          ) : (
            <UI.Btn kind="primary" onClick={() => { if (allDone) openResults(true); else { setFocus(null); setHole(h => Math.min(HOLES, h + 1)); } }} style={{ flex: 1 }}
              iconR={!allDone && <Ic.arrowR size={20} />} icon={allDone && <Ic.trophy size={20} />}>
              {allDone ? 'Endstand ansehen' : 'Nächste Bahn'}
            </UI.Btn>
          )}
        </div>
      </div>

      {voice && <VoiceSheet players={players} hole={hole} onApply={applyVoice} onClose={() => setVoice(false)} />}
    </UI.Screen>
  );
}

// ── Results / standings ───────────────────────────────────
function ResultsScreen({ players, go, restart, account, onSave, final = true, onFinish }) {
  const ranked = [...players].map(p => ({ p, t: totals(p) })).sort((a, b) => a.t.strokes - b.t.strokes);
  const medal = ['🥇', '🥈', '🥉'];
  const leader = ranked.find(r => r.t.played > 0) ? ranked[0] : null;
  return (
    <UI.Screen>
      <div style={{ paddingTop: 64, padding: '64px 24px 8px', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: final ? 'var(--accent)' : 'var(--line-2)', color: final ? '#fff' : 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'plonkPop .5s both' }}>{final ? <Ic.trophy size={36} /> : <Ic.list size={32} />}</div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600, marginTop: 14, letterSpacing: 0.3 }}>{final ? 'ENDSTAND' : 'ZWISCHENSTAND'} · {OB.VENUE}</div>
        {leader && <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginTop: 4 }}>{leader.p.name} {final ? 'gewinnt! 🎉' : 'führt'}</div>}
      </div>
      <UI.Body>
        {final && (account ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 14 }}>
            <Ic.check size={16} /> Im Verlauf gespeichert
          </div>
        ) : (
          <button onClick={() => go('account')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--accent) 8%, var(--card))', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--line))', borderRadius: 16, padding: '13px 15px', marginBottom: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
            <Ic.link size={20} color="var(--accent)" />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 700 }}>Spiel sichern?</div><div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Konto erstellen — dauert 20 Sek.</div></div>
            <Ic.chevR size={18} color="var(--ink-3)" />
          </button>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {ranked.map(({ p, t }, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 18,
              background: i === 0 && t.played > 0 ? 'color-mix(in srgb, var(--accent) 9%, var(--card))' : 'var(--card)',
              border: i === 0 && t.played > 0 ? '2px solid var(--accent)' : '1px solid var(--line)',
            }}>
              <div style={{ width: 26, textAlign: 'center', fontSize: i < 3 ? 22 : 15, fontWeight: 700, color: 'var(--ink-3)', fontFamily: 'var(--num)' }}>{t.played > 0 ? (medal[i] || i + 1) : '·'}</div>
              <UI.Avatar name={p.name} color={p.color} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16.5, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{t.played}/{HOLES} Bahnen</div>
              </div>
              <div style={{ fontFamily: 'var(--num)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{t.strokes || '–'}</div>
            </div>
          ))}
        </div>
      </UI.Body>
      <UI.Footer>
        {final ? (
          <>
            <UI.Btn kind="primary" onClick={restart} icon={<Ic.home size={19} />}>{account ? 'Zur Startseite' : 'Neues Spiel'}</UI.Btn>
            <UI.Btn kind="ghost" onClick={() => go('game')}>Zurück zum Spiel</UI.Btn>
          </>
        ) : (
          <>
            <UI.Btn kind="primary" onClick={() => go('game')} icon={<Ic.flag size={19} />}>Weiter spielen</UI.Btn>
            <UI.Btn kind="ghost" onClick={onFinish}>Spiel beenden</UI.Btn>
          </>
        )}
      </UI.Footer>
    </UI.Screen>
  );
}

// ── Express setup (onboarding variant) ────────────────────
function ExpressSetup({ go, role, setRole, mode, setMode, players, setPlayers, family = [] }) {
  const { Screen, Body, Footer, Btn, Avatar, AV_COLORS } = UI;
  const [val, setVal] = useS('');
  const add = (name) => { const n = (name || '').trim(); if (!n) return; setPlayers(p => [...p, { id: Date.now() + Math.random(), name: n, color: AV_COLORS[p.length % AV_COLORS.length], scores: {} }]); setVal(''); };
  const Seg = ({ opts, value, onPick }) => (
    <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 15, padding: 4, gap: 4 }}>
      {opts.map(([v, label, I]) => (
        <button key={v} onClick={() => onPick(v)} style={{ flex: 1, height: 46, borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: value === v ? 'var(--accent)' : 'transparent', color: value === v ? '#fff' : 'var(--ink-2)', transition: 'all .15s' }}><I size={17} /> {label}</button>
      ))}
    </div>
  );
  return (
    <Screen>
      <div style={{ paddingTop: 62, padding: '62px 22px 4px', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}><Ic.sparkle size={14} /> EXPRESS · 1 SCREEN</div>
        <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.5 }}>Schnell aufgesetzt</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 5 }}>Drei Tipps und ihr spielt.</div>
      </div>
      <Body style={{ paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Wer tippt?</div>
        <Seg opts={[['me', 'Ich für alle', Ic.user], ['others', 'Alle selbst', Ic.users]]} value={role} onPick={setRole} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Modus</div>
        <Seg opts={[['sequential', 'Bahn für Bahn', Ic.list], ['guerilla', 'Guerilla', Ic.shuffle]]} value={mode} onPick={setMode} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Spieler:innen</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add(val)} placeholder="Name + Enter"
            style={{ flex: 1, height: 48, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card)', padding: '0 15px', fontSize: 16, fontFamily: 'var(--font)', outline: 'none' }} />
          <button onClick={() => add(val)} style={{ width: 48, height: 48, borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic.plus size={22} /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {players.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 8px 5px 5px' }}>
              <Avatar name={p.name} color={p.color} size={26} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
              <button onClick={() => setPlayers(ps => ps.filter(x => x.id !== p.id))} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', padding: 2 }}><Ic.x size={15} /></button>
            </div>
          ))}
          {(family.length ? family.map(m => m.name) : ['Anna', 'Marco', 'Lena']).filter(n => !players.find(p => p.name === n)).slice(0, 5).map(n => (
            <button key={n} onClick={() => add(n)} style={{ border: '1px dashed var(--line)', background: 'transparent', color: 'var(--ink-2)', borderRadius: 999, padding: '6px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4 }}><Ic.plus size={13} /> {n}</button>
          ))}
        </div>
      </Body>
      <Footer>
        <Btn kind="primary" disabled={!role || !mode || players.length === 0} onClick={() => go(role === 'others' ? 'invite' : 'game')} iconR={<Ic.arrowR size={20} />}>
          {players.length ? `Los · ${players.length} dabei` : 'Los geht\u2019s'}
        </Btn>
      </Footer>
    </Screen>
  );
}

window.GAME = { GameScreen, ResultsScreen, ExpressSetup, totals, PARS };
