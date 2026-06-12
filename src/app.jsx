// app.jsx — router, state, persistence, tweaks, mount
const { useState: useAS, useEffect: useAE, useRef: useAR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#15A35A",
  "onboardingFlow": "guided",
  "voiceInput": true,
  "showTotals": true
}/*EDITMODE-END*/;

const AV = UI.AV_COLORS;
function demoPlayers(full) {
  const base = [['Anna', 0], ['Marco', 1], ['Lena', 2], ['Tim', 3]];
  return base.map(([name, i]) => {
    const scores = {};
    const upTo = full ? 18 : 7;
    for (let h = 1; h <= upTo; h++) {
      const p = GAME.PARS[(h - 1) % GAME.PARS.length];
      scores[h] = Math.max(1, p + [(-1), 0, 0, 1, 0, -1, 1][(h + i) % 7]);
    }
    return { id: 100 + i, name, color: AV[i % AV.length], scores };
  });
}

function App() {
  const scanEnabled = window.PLONKY_SCAN !== false;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useAS('landing');
  const [role, setRole] = useAS(null);
  const [mode, setMode] = useAS(null);
  const [players, setPlayers] = useAS([]);
  const [me, setMe] = useAS(null);
  const [sessionCode, setSessionCode] = useAS(null);
  // persistent
  const [account, setAccount] = useAS(null);
  const [family, setFamily] = useAS([]);
  const [history, setHistory] = useAS([]);
  const [defaultMode, setDefaultMode] = useAS('sequential');
  const [hydrated, setHydrated] = useAS(false);
  const [histId, setHistId] = useAS(null);
  const [histFrom, setHistFrom] = useAS('home');
  const [legalFrom, setLegalFrom] = useAS('cover');
  const [feedbackFrom, setFeedbackFrom] = useAS('home');
  const [feedbackItems, setFeedbackItems] = useAS(null);
  const [resultsFinal, setResultsFinal] = useAS(true);
  const [autoCrew, setAutoCrew] = useAS(true);
  const [activeSession, setActiveSession] = useAS(null); // bookmark to a live round you can dive back into
  const gameSavedRef = useAR(false);
  const soloSessionRef = useAR(false); // guards one-time session creation for a solo "ich tippe für alle" game

  // For crew members linked to a Mitspieler-Konto, pull that account's current
  // photo so the master always shows the person's up-to-date picture.
  const refreshLinkedCrew = (fam) => {
    (fam || []).forEach(m => {
      if (m && m.accountId) ACC.API.getAccount(m.accountId)
        .then(a => { if (a) setFamily(cur => cur.map(x => x.id === m.id ? { ...x, avatar: a.avatar || x.avatar } : x)); })
        .catch(() => {});
    });
  };

  // load once
  useAE(() => {
    const d = ACC.STORE.load();
    const linkMatch = typeof location !== 'undefined' && location.pathname.match(/^\/m\/([^\/?#]+)/);
    const joinMatch = typeof location !== 'undefined' && location.pathname.match(/^\/j\/([^\/?#]+)/);
    const fbMatch = typeof location !== 'undefined' && location.pathname.match(/^\/fb\/([^\/?#]+)/);

    // opened via the private feedback inbox link (/fb/<key>)
    if (fbMatch) {
      const key = decodeURIComponent(fbMatch[1]);
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      if (d.account) setAccount(d.account.id ? d.account : { ...d.account, id: ACC.newAccountId() });
      ACC.API.listFeedback(key)
        .then(items => { setFeedbackItems(items || []); setScreen('feedbackInbox'); })
        .catch(() => { setFeedbackItems(null); setScreen('feedbackInbox'); })
        .finally(() => setHydrated(true));
      return;
    }

    // opened via a live-session link (/j/<code>): join that shared round
    if (joinMatch) {
      const code = decodeURIComponent(joinMatch[1]).toUpperCase();
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      let acc = d.account || null;
      if (acc && !acc.id) acc = { ...acc, id: ACC.newAccountId() };
      if (acc) setAccount(acc);
      if (d.family) setFamily(d.family);
      if (d.defaultMode) setDefaultMode(d.defaultMode);
      if (d.autoCrew != null) setAutoCrew(d.autoCrew);
      ACC.API.getSession(code, true)
        .then(sess => {
          if (!sess) { setScreen(acc ? 'home' : 'cover'); return; } // code expired/unknown
          setSessionCode(sess.code);
          setMode(sess.mode || 'sequential');
          setPlayers((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })));
          setRole('others');
          setScreen('join');
        })
        .catch(() => setScreen(acc ? 'home' : 'cover'))
        .finally(() => setHydrated(true));
      return;
    }

    // opened via a personal link (/m/<code>): adopt that account on this device
    if (linkMatch) {
      const token = decodeURIComponent(linkMatch[1]);
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      if (d.family) setFamily(d.family);
      if (d.defaultMode) setDefaultMode(d.defaultMode);
      if (d.autoCrew != null) setAutoCrew(d.autoCrew);
      if (d.activeSession) setActiveSession(d.activeSession);
      ACC.API.getAccount(token)
        .then(acc => {
          setAccount(acc && acc.id
            ? { id: acc.id, name: acc.name || 'Spieler', color: acc.color || AV[0], kind: acc.kind || 'master', avatar: acc.avatar || '', created: acc.created || Date.now() }
            : { id: token, name: 'Spieler', color: AV[0], kind: 'master', avatar: '', created: Date.now() });
          if (acc && Array.isArray(acc.crew)) { setFamily(acc.crew); refreshLinkedCrew(acc.crew); } // server crew wins on a fresh device
          setScreen('home');
          return ACC.API.listGames(token);
        })
        .then(server => setHistory(server || []))
        .catch(() => {}) // link unreachable: stay on cover, nothing lost
        .finally(() => setHydrated(true));
      return;
    }

    let acc = d.account || null;
    if (acc && !acc.id) acc = { ...acc, id: ACC.newAccountId() }; // backfill id for pre-DB accounts
    if (acc) { setAccount(acc); setScreen('home'); }
    if (d.family) { setFamily(d.family); refreshLinkedCrew(d.family); }
    if (d.history) setHistory(d.history);
    if (d.activeSession) setActiveSession(d.activeSession);
    if (d.defaultMode) setDefaultMode(d.defaultMode);
    if (d.autoCrew != null) setAutoCrew(d.autoCrew);
    setHydrated(true);
    if (acc && acc.id) ACC.API.listGames(acc.id)
      .then(server => setHistory(local => ACC.mergeGames(local, server)))
      .catch(() => {}); // offline / old static host: keep localStorage only
  }, []);
  // persist
  useAE(() => { if (hydrated) ACC.STORE.save({ account, family, history, defaultMode, autoCrew, activeSession }); }, [hydrated, account, family, history, defaultMode, autoCrew, activeSession]);
  // keep the server copy of the account (name/color) in sync
  useAE(() => { if (hydrated && account && account.id) ACC.API.saveAccount(account, family).catch(() => {}); }, [hydrated, account, family]);
  // when a crew slot is claimed by someone with their own account, remember the
  // link (crew member ↔ account) so the master shows their current photo later
  useAE(() => {
    if (!account || !players.length) return;
    players.forEach(p => {
      const id = String(p.id);
      if (p.account_id && id.startsWith('c')) {
        const cid = id.slice(1);
        setFamily(fam => fam.some(m => String(m.id) === cid && m.accountId === p.account_id)
          ? fam
          : fam.map(m => String(m.id) === cid ? { ...m, accountId: p.account_id } : m));
      }
    });
  }, [players, account]);

  // remember the live round you're in, so "Mein plonky" can dive back into it
  // (the bookmark survives going home; it's cleared on finish/save or delete)
  useAE(() => {
    if (hydrated && sessionCode) setActiveSession({ code: sessionCode, role, me, mode: mode || 'sequential', venue: OB.VENUE });
  }, [hydrated, sessionCode, role, me, mode]);

  // a host's solo game ("ich tippe für alle") skips the invite step, so it has no
  // session — give it one on entry so it persists as a "Laufende Runde" & survives Pause
  useAE(() => {
    if (!hydrated || sessionCode || screen !== 'game' || me != null || !account || !players.length || soloSessionRef.current) return;
    soloSessionRef.current = true;
    ACC.API.createSession({ mode: mode || 'sequential', venue: OB.VENUE, players: players.map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, avatar: p.avatar || '' })) })
      .then(sess => setSessionCode(sess.code))
      .catch(() => {})
      .finally(() => { soloSessionRef.current = false; });
  }, [hydrated, screen, sessionCode, me, account, players.length]);

  useAE(() => { document.documentElement.style.setProperty('--accent', t.accent); }, [t.accent]);
  useAE(() => { window.__fitPhone && window.__fitPhone(); }, []);

  const go = (s) => { setScreen(s); const el = document.querySelector('.noscroll'); if (el) el.scrollTop = 0; };
  // leave the round view and go home — the round stays live & bookmarked; you can dive back in
  const restart = () => { gameSavedRef.current = false; setPlayers([]); setRole(null); setMode(null); setMe(null); setSessionCode(null); go(account ? 'home' : 'cover'); };

  const saveGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    setActiveSession(null); // finished & archived → drop the live bookmark
    const game = { id: 'g' + Date.now(), date: Date.now(), venue: OB.VENUE, mode: mode || 'sequential', code: sessionCode || '',
      players: pls.map(p => ({ id: p.id, name: p.name, color: p.color, scores: { ...p.scores } })) };
    setHistory(h => [...h, game]);
    setFamily(fam => {
      const names = new Set(fam.map(m => m.name.toLowerCase()));
      const add = pls.filter(p => !names.has(p.name.toLowerCase())).map(p => ({ id: 'f' + p.id, name: p.name, color: p.color }));
      return [...fam, ...add];
    });
    const aid = (acc || account) && (acc || account).id;
    if (aid) ACC.API.saveGame(aid, game).catch(() => {}); // best-effort; local copy already saved
  };

  // A joined guest with a Mitspieler-Konto keeps a READ-ONLY copy of the round in
  // her own history. Unlike saveGame this never imports anyone into her crew.
  const saveCompanionGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    setActiveSession(null); // her copy is saved → drop the live bookmark
    const game = { id: 'g' + Date.now(), date: Date.now(), venue: OB.VENUE, mode: mode || 'sequential', code: sessionCode || '',
      players: pls.map(p => ({ id: p.id, name: p.name, color: p.color, scores: { ...p.scores } })) };
    setHistory(h => [...h, game]);
    const aid = (acc || account) && (acc || account).id;
    if (aid) ACC.API.saveGame(aid, game).catch(() => {});
  };

  const openGame = (id) => { setHistId(id); setHistFrom(screen); go('historyDetail'); };
  // discard a running round: drop the bookmark and delete the live session
  const discardActiveSession = () => {
    const c = activeSession && activeSession.code;
    setActiveSession(null);
    if (c) ACC.API.deleteSession(c).catch(() => {});
  };
  // dive back into a live round from the "Laufende Runde" card on home
  const resumeSession = (code) => {
    ACC.API.getSession(code, true).then(sess => {
      if (!sess) { setActiveSession(null); return; } // round no longer exists on the server
      gameSavedRef.current = false;
      setSessionCode(sess.code);
      setMode(sess.mode || 'sequential');
      setPlayers((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })));
      const b = activeSession || {};
      setRole(b.role || (b.me != null ? 'others' : 'me'));
      setMe(b.me != null ? b.me : null);
      go('game');
    }).catch(() => {});
  };
  const buildInitialPlayers = () => {
    const list = []; const seen = new Set();
    if (account) { list.push({ id: 'me', name: account.name, color: account.color, avatar: account.avatar || '', scores: {} }); seen.add(account.name.toLowerCase()); }
    if (account && autoCrew) family.forEach(m => { if (!seen.has(m.name.toLowerCase())) { list.push({ id: 'c' + m.id, name: m.name, color: m.color, avatar: m.avatar || '', scores: {} }); seen.add(m.name.toLowerCase()); } });
    return list;
  };
  const firstStep = () => (t.onboardingFlow === 'express' ? 'express' : 'welcome');
  const newGame = () => { gameSavedRef.current = false; setPlayers(buildInitialPlayers()); setRole(account ? 'me' : null); setMode(defaultMode); setMe(null); setSessionCode(null); go(scanEnabled ? 'scan' : firstStep()); };
  const openResults = (fin) => {
    setResultsFinal(fin);
    go('results');
    if (!fin) return;
    // Host owns & saves the authoritative game. A joined guest with her own
    // Mitspieler-Konto keeps a read-only copy in her history; a joined guest
    // without an account saves nothing here (she can still create one on this screen).
    const finalize = (finalPlayers) => {
      if (me != null) {
        // joined guest: host owns the game; keep my own read-only copy if I have an account
        if (account) saveCompanionGame(finalPlayers, account);
        return;
      }
      // host pressed "Spiel beenden": tell every device the round is over
      if (sessionCode) ACC.API.sessionFinish(sessionCode).catch(() => {});
      if (account) saveGame(finalPlayers);
    };
    if (sessionCode) {
      // pull the authoritative final scores from the server so every device agrees
      ACC.API.getSession(sessionCode).then(sess => {
        let finalPlayers = players;
        if (sess && sess.players) {
          finalPlayers = players.map(p => {
            const sp = sess.players.find(x => String(x.id) === String(p.id));
            if (!sp) return p;
            // my own latest taps may not have reached the server yet → keep them
            const mine = me != null && String(p.id) === String(me);
            return { ...p, scores: mine ? { ...(sp.scores || {}), ...(p.scores || {}) } : (sp.scores || {}) };
          });
          setPlayers(finalPlayers);
        }
        finalize(finalPlayers);
      }).catch(() => finalize(players));
    } else {
      finalize(players);
    }
  };
  const createAccount = (name) => {
    const acc = { id: ACC.newAccountId(), name, color: AV[0], created: Date.now() };
    setAccount(acc);
    ACC.API.saveAccount(acc).catch(() => {});
    saveGame(players, acc);
    return acc;
  };
  // Mitspieler-Konto: ein per QR beigetretener Gast sichert nur seine eigene
  // Identität (Name/Farbe + persönlicher Link, kind="companion"). Er übernimmt
  // NICHT die Crew des Hosts und kann KEINE Spiele eröffnen — der Gastgeber
  // besitzt das Spiel. Die gerade gespielte Runde wird als read-only Kopie in
  // seinen Verlauf gelegt, damit "Letzte Spiele" gefüllt ist.
  const createCompanion = (name) => {
    const meP = players.find(p => String(p.id) === String(me));
    const acc = {
      id: ACC.newAccountId(),
      name: (name || '').trim() || (meP && meP.name) || 'Spieler',
      color: (meP && meP.color) || AV[0],
      avatar: (meP && meP.avatar) || '', // adopt the photo the host set for this player
      kind: 'companion',
      created: Date.now(),
    };
    setAccount(acc);
    ACC.API.saveAccount(acc, family).catch(() => {});
    // tell the session this slot now belongs to a real account (host can link it
    // to their crew entry, so my photo stays current for them)
    if (sessionCode && me != null) ACC.API.sessionClaim(sessionCode, me, acc.avatar, acc.id).catch(() => {});
    // keep a copy of the round she just finished (pull final scores from the server)
    if (resultsFinal) {
      if (sessionCode) {
        ACC.API.getSession(sessionCode).then(sess => {
          const fp = (sess && sess.players)
            ? players.map(p => {
                const sp = sess.players.find(x => String(x.id) === String(p.id));
                if (!sp) return p;
                const mine = me != null && String(p.id) === String(me);
                return { ...p, scores: mine ? { ...(sp.scores || {}), ...(p.scores || {}) } : (sp.scores || {}) };
              })
            : players;
          saveCompanionGame(fp, acc);
        }).catch(() => saveCompanionGame(players, acc));
      } else {
        saveCompanionGame(players, acc);
      }
    }
    return acc;
  };
  // Companion joins a host's round by code (or via the scanned QR deep-link).
  const enterSession = (sess) => {
    gameSavedRef.current = false;
    setSessionCode(sess.code);
    setMode(sess.mode || 'sequential');
    setPlayers((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })));
    setRole('others');
    setMe(null);
    go('join');
  };
  const logout = () => { setAccount(null); go('cover'); };
  const openLegal = () => { setLegalFrom(screen); go('legal'); };
  const openFeedback = () => { setFeedbackFrom(screen); go('feedback'); };

  const jump = (s) => {
    if ((s === 'game' || s === 'results') && players.length === 0) {
      setPlayers(demoPlayers(s === 'results'));
      setRole('me'); setMode(m => m || 'sequential');
    }
    if (s === 'results') { setResultsFinal(true); gameSavedRef.current = true; }
    go(s);
  };

  const isCompanion = !!(account && account.kind === 'companion');
  let view;
  switch (screen) {
    case 'landing': view = <OB.LandingScreen go={go} openLegal={openLegal} />; break;
    case 'legal': view = <OB.LegalScreen go={go} back={legalFrom} />; break;
    case 'feedback': view = <ACC.FeedbackScreen go={go} account={account} back={feedbackFrom} />; break;
    case 'feedbackInbox': view = <ACC.FeedbackInbox items={feedbackItems} go={go} />; break;
    case 'cover': view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={newGame} companion={isCompanion} />; break;
    case 'account': view = <OB.AccountScreen go={go} onCreate={me != null ? createCompanion : createAccount} companion={me != null} presetName={me != null ? ((players.find(p => String(p.id) === String(me)) || {}).name || '') : ''} back={me != null ? 'results' : 'cover'} />; break;
    case 'home': view = <ACC.HomeScreen account={account || { name: 'Gast', color: AV[0] }} family={family} history={history} go={go} openGame={openGame} newGame={newGame} scanEnabled={scanEnabled} companion={isCompanion} activeSession={activeSession} onResume={resumeSession} onDiscard={discardActiveSession} />; break;
    case 'settings': view = <ACC.SettingsScreen account={account || { name: 'Gast', color: AV[0] }} setAccount={setAccount} family={family} setFamily={setFamily} go={go} logout={logout} defaultMode={defaultMode} setDefaultMode={setDefaultMode} autoCrew={autoCrew} setAutoCrew={setAutoCrew} companion={isCompanion} openLegal={openLegal} openFeedback={openFeedback} />; break;
    case 'joinCode': view = <OB.JoinCodeScreen go={go} onJoined={enterSession} back={account ? 'home' : 'cover'} />; break;
    case 'history': view = <ACC.HistoryScreen history={history} go={go} openGame={openGame} />; break;
    case 'historyDetail': view = <ACC.HistoryDetailScreen game={history.find(g => g.id === histId)} go={go} from={histFrom} />; break;
    case 'scan': view = <OB.ScanScreen go={go} express={t.onboardingFlow === 'express'} />; break;
    case 'welcome': view = <OB.RoleScreen go={go} role={role} setRole={setRole} back={scanEnabled ? 'scan' : 'cover'} />; break;
    case 'players': view = <OB.PlayersScreen go={go} players={players} setPlayers={setPlayers} role={role} family={family} />; break;
    case 'invite': view = <OB.InviteScreen go={go} players={players} mode={mode} sessionCode={sessionCode} setSessionCode={setSessionCode} />; break;
    case 'join': view = <OB.JoinScreen go={go} players={players} setMe={setMe} sessionCode={sessionCode} account={account} />; break;
    case 'express': view = <GAME.ExpressSetup go={go} role={role} setRole={setRole} mode={mode} setMode={setMode} players={players} setPlayers={setPlayers} family={family} />; break;
    case 'game': view = <GAME.GameScreen players={players} setPlayers={setPlayers} go={go} voiceOn={t.voiceInput} showTotals={t.showTotals} openResults={openResults} sessionCode={sessionCode} me={me} onHome={account && sessionCode ? restart : null} />; break;
    case 'results': view = <GAME.ResultsScreen players={players} go={go} restart={restart} account={account} onSave={saveGame} final={resultsFinal} onFinish={() => openResults(true)} joined={me != null} sessionCode={sessionCode} me={me} />; break;
    default: view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={newGame} companion={isCompanion} />;
  }

  const panel = ReactDOM.createPortal(
    <TweaksPanel title="Tweaks">
      <TweakSection label="Marke" />
      <TweakColor label="Akzentfarbe" value={t.accent}
        options={['#15A35A', '#0E9E96', '#2F6FE0', '#E0792F', '#7A5AE0']}
        onChange={v => setTweak('accent', v)} />
      <TweakSection label="Onboarding" />
      <TweakRadio label="Flow-Variante" value={t.onboardingFlow}
        options={[{ value: 'guided', label: 'Geführt' }, { value: 'express', label: 'Express' }]}
        onChange={v => setTweak('onboardingFlow', v)} />
      <div style={{ fontSize: 10.5, color: 'rgba(41,38,27,.5)', lineHeight: 1.4, marginTop: -2 }}>
        Geführt = Schritt für Schritt · Express = alles auf einem Screen
      </div>
      <TweakSection label="Spiel" />
      <TweakToggle label="Spracheingabe" value={t.voiceInput} onChange={v => setTweak('voiceInput', v)} />
      <TweakToggle label="Gesamtstand in Zeilen" value={t.showTotals} onChange={v => setTweak('showTotals', v)} />
      <TweakSection label="Sprung zu" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <TweakButton label="Start" onClick={() => go('cover')} secondary />
        <TweakButton label="Mein plonky" onClick={() => account ? go('home') : go('account')} secondary />
        <TweakButton label="Scan" onClick={() => go('scan')} secondary />
        <TweakButton label="Spiel" onClick={() => jump('game')} secondary />
        <TweakButton label="Endstand" onClick={() => jump('results')} secondary />
        {history.length > 0 && <TweakButton label="Verlauf" onClick={() => go('history')} secondary />}
      </div>
    </TweaksPanel>, document.body);

  return (
    <>
      <IOSDevice>{view}</IOSDevice>
      {panel}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
setTimeout(() => window.__fitPhone && window.__fitPhone(), 80);
