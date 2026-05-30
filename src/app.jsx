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
  const [screen, setScreen] = useAS('cover');
  const [role, setRole] = useAS(null);
  const [mode, setMode] = useAS(null);
  const [players, setPlayers] = useAS([]);
  const [me, setMe] = useAS(null);
  // persistent
  const [account, setAccount] = useAS(null);
  const [family, setFamily] = useAS([]);
  const [history, setHistory] = useAS([]);
  const [defaultMode, setDefaultMode] = useAS('sequential');
  const [hydrated, setHydrated] = useAS(false);
  const [histId, setHistId] = useAS(null);
  const [histFrom, setHistFrom] = useAS('home');
  const [resultsFinal, setResultsFinal] = useAS(true);
  const [autoCrew, setAutoCrew] = useAS(true);
  const gameSavedRef = useAR(false);

  // load once
  useAE(() => {
    const d = ACC.STORE.load();
    let acc = d.account || null;
    if (acc && !acc.id) acc = { ...acc, id: ACC.newAccountId() }; // backfill id for pre-DB accounts
    if (acc) { setAccount(acc); setScreen('home'); }
    if (d.family) setFamily(d.family);
    if (d.history) setHistory(d.history);
    if (d.defaultMode) setDefaultMode(d.defaultMode);
    if (d.autoCrew != null) setAutoCrew(d.autoCrew);
    setHydrated(true);
    if (acc && acc.id) ACC.API.listGames(acc.id)
      .then(server => setHistory(local => ACC.mergeGames(local, server)))
      .catch(() => {}); // offline / old static host: keep localStorage only
  }, []);
  // persist
  useAE(() => { if (hydrated) ACC.STORE.save({ account, family, history, defaultMode, autoCrew }); }, [hydrated, account, family, history, defaultMode, autoCrew]);

  useAE(() => { document.documentElement.style.setProperty('--accent', t.accent); }, [t.accent]);
  useAE(() => { window.__fitPhone && window.__fitPhone(); }, []);

  const go = (s) => { setScreen(s); const el = document.querySelector('.noscroll'); if (el) el.scrollTop = 0; };
  const restart = () => { gameSavedRef.current = false; setPlayers([]); setRole(null); setMode(null); setMe(null); go(account ? 'home' : 'cover'); };

  const saveGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    const game = { id: 'g' + Date.now(), date: Date.now(), venue: OB.VENUE, mode: mode || 'sequential',
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

  const openGame = (id) => { setHistId(id); setHistFrom(screen); go('historyDetail'); };
  const buildInitialPlayers = () => {
    const list = []; const seen = new Set();
    if (account) { list.push({ id: 'me', name: account.name, color: account.color, scores: {} }); seen.add(account.name.toLowerCase()); }
    if (account && autoCrew) family.forEach(m => { if (!seen.has(m.name.toLowerCase())) { list.push({ id: 'c' + m.id, name: m.name, color: m.color, scores: {} }); seen.add(m.name.toLowerCase()); } });
    return list;
  };
  const firstStep = () => (t.onboardingFlow === 'express' ? 'express' : 'welcome');
  const newGame = () => { gameSavedRef.current = false; setPlayers(buildInitialPlayers()); setRole(account ? 'me' : null); setMode(defaultMode); setMe(null); go(scanEnabled ? 'scan' : firstStep()); };
  const openResults = (fin) => { if (fin && account) saveGame(players); setResultsFinal(fin); go('results'); };
  const createAccount = (name) => { const acc = { id: ACC.newAccountId(), name, color: AV[0], created: Date.now() }; setAccount(acc); saveGame(players, acc); };
  const logout = () => { setAccount(null); go('cover'); };

  const jump = (s) => {
    if ((s === 'game' || s === 'results') && players.length === 0) {
      setPlayers(demoPlayers(s === 'results'));
      setRole('me'); setMode(m => m || 'sequential');
    }
    if (s === 'results') { setResultsFinal(true); gameSavedRef.current = true; }
    go(s);
  };

  let view;
  switch (screen) {
    case 'cover': view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={newGame} />; break;
    case 'account': view = <OB.AccountScreen go={go} onCreate={createAccount} />; break;
    case 'home': view = <ACC.HomeScreen account={account || { name: 'Gast', color: AV[0] }} family={family} history={history} go={go} openGame={openGame} newGame={newGame} scanEnabled={scanEnabled} />; break;
    case 'settings': view = <ACC.SettingsScreen account={account || { name: 'Gast', color: AV[0] }} setAccount={setAccount} family={family} setFamily={setFamily} go={go} logout={logout} defaultMode={defaultMode} setDefaultMode={setDefaultMode} autoCrew={autoCrew} setAutoCrew={setAutoCrew} />; break;
    case 'history': view = <ACC.HistoryScreen history={history} go={go} openGame={openGame} />; break;
    case 'historyDetail': view = <ACC.HistoryDetailScreen game={history.find(g => g.id === histId)} go={go} from={histFrom} />; break;
    case 'scan': view = <OB.ScanScreen go={go} express={t.onboardingFlow === 'express'} />; break;
    case 'welcome': view = <OB.RoleScreen go={go} role={role} setRole={setRole} back={scanEnabled ? 'scan' : 'cover'} />; break;
    case 'mode': view = <OB.ModeScreen go={go} mode={mode} setMode={setMode} role={role} />; break;
    case 'players': view = <OB.PlayersScreen go={go} players={players} setPlayers={setPlayers} role={role} family={family} />; break;
    case 'invite': view = <OB.InviteScreen go={go} players={players} />; break;
    case 'join': view = <OB.JoinScreen go={go} players={players} setMe={setMe} />; break;
    case 'express': view = <GAME.ExpressSetup go={go} role={role} setRole={setRole} mode={mode} setMode={setMode} players={players} setPlayers={setPlayers} family={family} />; break;
    case 'game': view = <GAME.GameScreen players={players} setPlayers={setPlayers} mode={mode || 'sequential'} go={go} voiceOn={t.voiceInput} showTotals={t.showTotals} openResults={openResults} />; break;
    case 'results': view = <GAME.ResultsScreen players={players} go={go} restart={restart} account={account} onSave={saveGame} final={resultsFinal} onFinish={() => openResults(true)} />; break;
    default: view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={newGame} />;
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
