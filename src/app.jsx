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
  const [screen, setScreen] = useAS('cover'); // sicherer Start ohne Anlage; hydrate setzt gleich home/landing/cover
  const [role, setRole] = useAS(null);
  const [mode, setMode] = useAS(null);
  const [players, setPlayers] = useAS([]);
  const [me, setMe] = useAS(null);
  const [sessionCode, setSessionCode] = useAS(null);
  // persistent
  const [account, setAccount] = useAS(null);
  const [venue, setVenue] = useAS(null); // aktive Anlage (Name, Bahnenzahl, Illustration) — null = noch keine gewählt (frischer Start zeigt keine Anlage)
  const [entryViaQr, setEntryViaQr] = useAS(false); // kam der Spieler per QR am Platz rein? → Begrüßung "bei Seebach" statt "auf plonky"
  const [directory, setDirectory] = useAS([]); // volle Anlagen-Liste für Kanton-Browsing, async aus /venues.json (aus bahnen.json der Website)
  const [family, setFamily] = useAS([]);
  const [history, setHistory] = useAS([]);
  const [defaultMode, setDefaultMode] = useAS('sequential');
  const [hydrated, setHydrated] = useAS(false);
  const [histId, setHistId] = useAS(null);
  const [histFrom, setHistFrom] = useAS('home');
  const [legalFrom, setLegalFrom] = useAS('cover');
  const [restoreErr, setRestoreErr] = useAS(''); // Meldung, wenn ein /m/-Link ins Leere zeigt
  const [venuesFrom, setVenuesFrom] = useAS(null); // von wo die Anlagen-Auswahl geöffnet wurde (null = Erststart, kein Zurück)
  const [faqFrom, setFaqFrom] = useAS('home');
  const [feedbackFrom, setFeedbackFrom] = useAS('home');
  const [feedbackItems, setFeedbackItems] = useAS(null);
  const [resultsFinal, setResultsFinal] = useAS(true);
  const [autoCrew, setAutoCrew] = useAS(true);
  const [activeSession, setActiveSession] = useAS(null); // bookmark to a live round you can dive back into
  const [avatars, setAvatars] = useAS({}); // account id -> current photo (the one source, fetched in batch)
  const [liveNames, setLiveNames] = useAS({}); // account id -> current name (same batch; Namen lösen wie Fotos live über die ID auf)
  const gameSavedRef = useAR(false);
  const startAfterVenueRef = useAR(false); // "Spiel starten" ohne Anlage → erst Wo-spielst-du, nach der Wahl direkt ins Spiel
  const soloSessionRef = useAR(false); // guards one-time session creation for a solo "ich tippe für alle" game
  const pendingAvatarRef = useAR(new Set()); // account ids whose photo is being saved — a fetch must not overwrite them
  const firstAccountSyncRef = useAR(true); // skip the first server-push after load so stale local doesn't clobber a remote change

  // Doppelte Crew-IDs heilen (Altlast des 'fme'-Bugs): gleiche ID = geteilte Scores
  // im Spiel. Duplikate bekommen beim Laden eine frische ID; Einträge bleiben erhalten.
  const healFam = (fam) => {
    const seen = new Set();
    return (fam || []).map((m, i) => {
      let id = m && m.id;
      if (id == null || seen.has(String(id))) id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i;
      seen.add(String(id));
      return String(id) === String(m.id) ? m : { ...m, id };
    });
  };

  // Eigener Slot in einer geladenen Runde: immer Name/Foto des AKTUELLEN Kontos —
  // der Session-Schnappschuss darf eine Umbenennung (z. B. während Pause) nicht überleben.
  const overlaySelf = (ps, acc) => (acc && acc.id)
    ? ps.map(p => String(p.account_id) === String(acc.id) ? { ...p, name: acc.name || p.name, avatar: acc.avatar || p.avatar } : p)
    : ps;

  // Name wie Fotos live über die user_id (account.id) auflösen; Schnappschuss nur Fallback
  const nameOf = (p) => {
    if (!p) return '';
    const aid = p.account_id || p.accountId || null;
    if (aid && account && String(aid) === String(account.id)) return account.name || p.name;
    if (aid && liveNames[aid]) return liveNames[aid];
    return p.name;
  };

  // For crew members linked to a Mitspieler-Konto, pull that account's current
  // photo AND name so the master always shows the person's up-to-date identity.
  const refreshLinkedCrew = (fam) => {
    (fam || []).forEach(m => {
      if (m && m.accountId) ACC.API.getAccount(m.accountId)
        .then(a => { if (a) setFamily(cur => cur.map(x => x.id === m.id ? { ...x, avatar: a.avatar || x.avatar, name: a.name || x.name } : x)); })
        .catch(() => {});
    });
  };

  // the venue this device last played on, as stored
  const storedVenue = (d) => {
    if (d.venueSlug) return OB.venueBySlug(d.venueSlug);
    if (d.venueCustom && d.venueCustom.name) return { slug: null, illu: 'generic', name: d.venueCustom.name, holes: d.venueCustom.holes || 18 };
    return null;
  };

  // load once
  useAE(() => {
    const d = ACC.STORE.load();
    const linkMatch = typeof location !== 'undefined' && location.pathname.match(/^\/m\/([^\/?#]+)/);
    const joinMatch = typeof location !== 'undefined' && location.pathname.match(/^\/j\/([^\/?#]+)/);
    const fbMatch = typeof location !== 'undefined' && location.pathname.match(/^\/fb\/([^\/?#]+)/);

    // The remembered venue has to be restored on EVERY entry path. The link
    // branches below return early, so without this a device opened via /m/ keeps
    // venue = null and the game start has no venue to show.
    const remembered = storedVenue(d);
    if (remembered) { setVenue(remembered); GAME.setHoles(remembered.holes); }

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
      if (d.family) setFamily(healFam(d.family));
      if (d.defaultMode) setDefaultMode(d.defaultMode);
      if (d.autoCrew != null) setAutoCrew(d.autoCrew);
      ACC.API.getSession(code, true)
        .then(sess => {
          if (!sess) { setScreen(acc ? 'home' : 'cover'); return; } // code expired/unknown
          setSessionCode(sess.code);
          setMode(sess.mode || 'sequential');
          const sv = OB.venueByName(sess.venue); if (sv) { setVenue(sv); GAME.setHoles(sv.holes); } // join the round's venue
          setPlayers(overlaySelf((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })), acc));
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
      // Kontowechsel = Rucksack ausräumen: Crew/Verlauf kommen NUR vom Server des
      // neuen Kontos; das Runden-Lesezeichen nur, wenn es DIESEM Konto gehört.
      if (d.defaultMode) setDefaultMode(d.defaultMode);
      if (d.autoCrew != null) setAutoCrew(d.autoCrew);
      if (d.activeSession && String(d.activeSession.accountId || '') === String(token)) setActiveSession(d.activeSession);
      ACC.API.getAccount(token)
        .then(acc => {
          // A 404 is a definite answer: this account does not exist. Inventing one
          // from the token would show a stranger an empty "logged in" account under
          // an id nobody owns — say so instead, like the paste-a-link flow does.
          if (!acc || !acc.id) { setRestoreErr('Kein Konto gefunden. Prüfe deinen Link und versuch es nochmal.'); setScreen('restore'); return null; }
          setAccount({ id: acc.id, name: acc.name || 'Spieler', color: acc.color || AV[0], kind: acc.kind || 'master', avatar: acc.avatar || '', created: acc.created || Date.now() });
          if (Array.isArray(acc.crew)) { const fam = healFam(acc.crew); setFamily(fam); refreshLinkedCrew(fam); } // server crew wins on a fresh device
          setScreen('home');
          return ACC.API.listGames(acc.id);
        })
        .then(server => { if (server) setHistory(server); })
        .catch(() => {}) // link unreachable: stay on cover, nothing lost
        .finally(() => setHydrated(true));
      return;
    }

    let acc = d.account || null;
    if (acc && !acc.id) acc = { ...acc, id: ACC.newAccountId() }; // backfill id for pre-DB accounts

    // aktive Anlage: aus einem /p/<slug>-QR-Link, sonst die gemerkte
    const pMatch = typeof location !== 'undefined' && location.pathname.match(/^\/p\/([^\/?#]+)/);
    let pickedVenue = null;
    if (pMatch) {
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      pickedVenue = OB.venueBySlug(decodeURIComponent(pMatch[1]));
    }
    if (!pickedVenue) pickedVenue = remembered; // sonst die gemerkte (auch die getippte ohne slug)
    if (pickedVenue) { setVenue(pickedVenue); GAME.setHoles(pickedVenue.holes); }
    setEntryViaQr(!!(pMatch && pickedVenue)); // nur ein frischer QR-Aufruf gilt als "am Platz"

    if (acc) setAccount(acc);
    // QR-Link → Willkommen mit Anlage. Konto → Home. Sonst (frisch/Website) → Cover ohne Anlage;
    // die Anlage wird erst beim "Spiel starten" gewählt (Wo spielst du?).
    if (pMatch && pickedVenue) setScreen('landing');
    else if (acc) setScreen('home');
    else setScreen('cover');

    if (d.family) { const fam = healFam(d.family); setFamily(fam); refreshLinkedCrew(fam); }
    if (d.history) setHistory(d.history);
    if (d.activeSession) setActiveSession(d.activeSession);
    if (d.defaultMode) setDefaultMode(d.defaultMode);
    if (d.autoCrew != null) setAutoCrew(d.autoCrew);
    setHydrated(true);
    if (acc && acc.id) ACC.API.listGames(acc.id)
      .then(server => setHistory(local => ACC.mergeGames(local, server)))
      .catch(() => {}); // offline / old static host: keep localStorage only
    // adopt this account's photo from the server (the shared source), so a change
    // made on another device — e.g. the master setting your crew photo — shows here
    if (acc && acc.id) ACC.API.getAccount(acc.id)
      .then(server => {
        if (!server) return;
        if (server.avatar !== undefined) setAccount(a => (a && String(a.id) === String(acc.id) && a.avatar !== server.avatar) ? { ...a, avatar: server.avatar } : a);
        // Crew: der Server ist die eine Quelle — Löschen/Neuanlegen auf Gerät A
        // kommt so beim nächsten Öffnen auch auf Gerät B an (statt wiederbelebt zu werden)
        if (Array.isArray(server.crew)) { const fam = healFam(server.crew); setFamily(fam); refreshLinkedCrew(fam); }
      })
      .catch(() => {});
  }, []);
  // Anlagen-Verzeichnis laden (Kanton-Browsing im "Wo spielst du?"-Screen). Async & unkritisch:
  // fehlt es (alter Static-Host / offline), bleibt die Auswahl aufs Freitextfeld beschränkt.
  useAE(() => { fetch('/venues.json').then(r => (r.ok ? r.json() : [])).then(d => { if (Array.isArray(d)) setDirectory(d); }).catch(() => {}); }, []);
  // persist
  useAE(() => { if (hydrated) ACC.STORE.save({ account, family, history, defaultMode, autoCrew, activeSession, venueSlug: venue && venue.slug, venueCustom: venue && !venue.slug ? { name: venue.name, holes: venue.holes } : null }); }, [hydrated, account, family, history, defaultMode, autoCrew, activeSession, venue]);
  // keep the server copy of the account (name/color/photo) in sync. Skip the very
  // first run after load: otherwise this device's stale localStorage would clobber
  // a change made elsewhere (e.g. the master set your crew photo) before we adopt it.
  useAE(() => {
    if (!hydrated || !account || !account.id) return;
    if (firstAccountSyncRef.current) { firstAccountSyncRef.current = false; return; }
    ACC.API.saveAccount(account, family).catch(() => {});
  }, [hydrated, account, family]);
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
    if (hydrated && sessionCode) setActiveSession({ code: sessionCode, role, me, mode: mode || 'sequential', venue: (venue && venue.name) || '', accountId: (account && account.id) || null });
  }, [hydrated, sessionCode, role, me, mode, account]);

  // accounts from the start: a fresh host (or a joiner) gets a real account from
  // their name/slot the moment they enter a round — no end-of-game "save your account"
  useAE(() => {
    if (!hydrated || account || screen !== 'game' || !players.length) return;
    const src = me != null ? (players.find(p => String(p.id) === String(me)) || {}) : (players[0] || {});
    const acc = { id: ACC.newAccountId(), name: src.name || 'Spieler', color: src.color || AV[0], avatar: src.avatar || '', kind: me != null ? 'companion' : 'master', created: Date.now() };
    setAccount(acc);
    // den eigenen Spieler-Slot ans neue Konto knüpfen — sonst erkennt der
    // "Host nie in der eigenen Crew"-Filter (der über account_id geht) den Host nicht
    setPlayers(ps => ps.map((p, i) => (me != null ? String(p.id) === String(me) : i === 0) ? { ...p, account_id: acc.id } : p));
    ACC.API.saveAccount(acc, me != null ? undefined : family).catch(() => {});
    if (me != null && sessionCode) ACC.API.sessionClaim(sessionCode, me, acc.avatar, acc.id).catch(() => {});
  }, [hydrated, screen, account, me, players.length, sessionCode]);

  // a host's solo game ("ich tippe für alle") skips the invite step, so it has no
  // session — give it one on entry so it persists as a "Laufende Runde" & survives Pause
  useAE(() => {
    if (!hydrated || sessionCode || screen !== 'game' || me != null || !account || !players.length || soloSessionRef.current) return;
    soloSessionRef.current = true;
    ACC.API.createSession({ mode: mode || 'sequential', venue: (venue && venue.name) || '', players: players.map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, avatar: p.avatar || '', account_id: p.account_id || null })) })
      .then(sess => setSessionCode(sess.code))
      .catch(() => {})
      .finally(() => { soloSessionRef.current = false; });
  }, [hydrated, screen, sessionCode, me, account, players.length]);

  // opening home: re-pull my games from the server so the host's ONE shared
  // record (where I'm a participant) and any later host edit show up.
  useAE(() => {
    if (!hydrated || !account || !account.id) return;
    if (screen === 'home') ACC.API.listGames(account.id).then(server => setHistory(local => ACC.mergeGames(local, server || []))).catch(() => {});
  }, [screen, hydrated]);

  // you are never your own crew member — drop any self-entry (from older auto-adds).
  // keyed by account id, so it also cleans up after a rename (no stale duplicate).
  useAE(() => {
    if (!hydrated || !account || !account.id) return;
    setFamily(fam => fam.some(m => m.accountId === account.id) ? fam.filter(m => m.accountId !== account.id) : fam);
  }, [hydrated, account]);

  // The ONE photo lookup: collect every account id this device shows (crew links +
  // players in saved games) and batch-fetch their CURRENT photo by id. Re-runs on
  // navigation so a changed photo appears without a cold reload. Self is resolved
  // straight from `account`, so it's not fetched here.
  useAE(() => {
    if (!hydrated) return;
    const ids = new Set();
    (family || []).forEach(m => { if (m && m.accountId) ids.add(m.accountId); });
    (history || []).forEach(g => (g.players || []).forEach(p => { if (p && p.account_id) ids.add(p.account_id); }));
    (players || []).forEach(p => { if (p && p.account_id) ids.add(p.account_id); }); // auch Mitspieler der LIVE-Runde
    if (account && account.id) ids.delete(account.id);
    const list = [...ids];
    if (!list.length) return;
    ACC.API.getAccounts(list)
      .then(accs => {
        setAvatars(prev => { const next = { ...prev }; (accs || []).forEach(a => { if (!pendingAvatarRef.current.has(a.id)) next[a.id] = a.avatar || ''; }); return next; });
        setLiveNames(prev => { const next = { ...prev }; (accs || []).forEach(a => { if (a.name) next[a.id] = a.name; }); return next; });
      })
      .catch(() => {});
  }, [hydrated, screen, family.length, history.length, players.length]);

  useAE(() => { document.documentElement.style.setProperty('--accent', t.accent); }, [t.accent]);
  // Bahnenzahl im Spiel folgt der aktiven Anlage (Backstop; Spielstart-Pfade setzen es zusätzlich synchron)
  useAE(() => { if (venue && venue.holes) GAME.setHoles(venue.holes); }, [venue]);
  useAE(() => { window.__fitPhone && window.__fitPhone(); }, []);

  const go = (s) => { setScreen(s); const el = document.querySelector('.noscroll'); if (el) el.scrollTop = 0; };
  // leave the round view and go home — the round stays live & bookmarked; you can dive back in
  const restart = () => { gameSavedRef.current = false; setPlayers([]); setRole(null); setMode(null); setMe(null); setSessionCode(null); go(account ? 'home' : 'cover'); };

  const saveGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    setActiveSession(null); // finished & archived → drop the live bookmark
    const owner = (acc || account) && (acc || account).id;
    // accounts that joined with their own device become participants of this ONE
    // shared record (so they see it — and any later host edit — in their history)
    const participants = [...new Set(pls.map(p => p.account_id).filter(id => id && id !== owner))];
    const game = { id: 'g' + Date.now(), date: Date.now(), venue: (venue && venue.name) || '', mode: mode || 'sequential', code: sessionCode || '', participants,
      players: pls.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', account_id: p.account_id || null, scores: { ...p.scores } })) };
    setHistory(h => [...h, game]);
    setFamily(fam => {
      const names = new Set(fam.map(m => m.name.toLowerCase()));
      // never add the host to their OWN crew (by account id, not name) — otherwise
      // renaming the account leaves a stale, unmatched self-entry → a duplicate
      // frische, garantiert einzigartige Crew-IDs — 'f'+p.id kollidierte, weil jeder
      // unverknüpfte Host-Slot 'me' heißt → alle bekamen 'fme' und teilten Scores
      const add = pls.filter(p => !(owner && p.account_id === owner) && !names.has(p.name.toLowerCase()))
        .map((p, i) => ({ id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i, name: p.name, color: p.color, accountId: p.account_id || undefined }));
      return [...fam, ...add];
    });
    if (owner) ACC.API.saveGame(owner, game).catch(() => {}); // best-effort; local copy already saved
  };

  // A joined guest does NOT own the game — the host saves ONE shared record with
  // her as a participant. So she keeps no separate copy; she pulls that shared
  // game into her history (she appears via participants). This is why a later
  // host edit shows up for her instead of leaving a stale private copy.
  const pullSharedGames = (aid, tries = 0) => {
    if (!aid) return;
    ACC.API.listGames(aid)
      .then(server => { setHistory(local => ACC.mergeGames(local, server || [])); if (tries < 3) setTimeout(() => pullSharedGames(aid, tries + 1), 1600); })
      .catch(() => { if (tries < 3) setTimeout(() => pullSharedGames(aid, tries + 1), 1600); });
  };
  const saveCompanionGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    setActiveSession(null); // round over for me → drop the live bookmark
    pullSharedGames((acc || account) && (acc || account).id); // host's shared game lands in my history (retries ride out the save race)
  };

  const openGame = (id) => { setHistId(id); setHistFrom(screen); go('historyDetail'); };
  // Setting a crew member's photo writes to the ONE source: their account (when
  // linked), so it sticks and shows everywhere via the id lookup. An unlinked
  // member (no own account) just keeps the photo on the local crew entry.
  const setCrewPhoto = (member, src) => {
    setFamily(f => f.map(m => m.id === member.id ? { ...m, avatar: src } : m));
    const aid = member.accountId;
    if (!aid) return; // unlinked member: photo lives on the local crew entry
    pendingAvatarRef.current.add(aid);                 // shield from a stale in-flight fetch
    setAvatars(prev => ({ ...prev, [aid]: src }));     // show immediately
    ACC.API.saveAccount({ id: aid, avatar: src })      // persist to the ONE source: their account
      .catch(() => {})
      .finally(() => { pendingAvatarRef.current.delete(aid); });
  };
  // drop the "Laufende Runde" bookmark. ONLY the host may delete the round for
  // everyone. A Sub-Konto (companion) must NEVER delete it — not her round; a
  // master who merely joined (me != null) only frees her own slot. Hard-guarded
  // so a missing bookmark slot id can't fall through to a destructive delete.
  const discardActiveSession = () => {
    const b = activeSession || {};
    const c = b.code;
    setActiveSession(null);
    if (!c) return;
    const isHost = !(account && account.kind === 'companion') && b.me == null;
    if (isHost) ACC.API.deleteSession(c).catch(() => {});
    else if (b.me != null) ACC.API.sessionLeave(c, b.me).catch(() => {});
  };
  // save edits to a game from the history detail (server upserts by id)
  const saveEditedGame = (g) => {
    setHistory(h => h.map(x => x.id === g.id ? g : x));
    const aid = account && account.id;
    if (aid) ACC.API.saveGame(aid, g).catch(() => {});
  };
  // a joined player leaves the finished round → quietly keep their copy, then home
  const leaveJoined = () => {
    if (me != null && account) saveCompanionGame(players, account);
    restart();
  };
  // dive back into a live round from the "Laufende Runde" card on home
  const resumeSession = (code) => {
    ACC.API.getSession(code, true).then(sess => {
      if (!sess) { setActiveSession(null); return; } // round no longer exists on the server
      gameSavedRef.current = false;
      setSessionCode(sess.code);
      setMode(sess.mode || 'sequential');
      const sv = OB.venueByName(sess.venue) || (sess.venue ? { slug: null, name: sess.venue, holes: 18, illu: 'generic' } : null); if (sv) setVenue(sv); GAME.setHoles((sv || venue || { holes: 18 }).holes); // resume into the round's venue
      setPlayers(overlaySelf((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })), account));
      const b = activeSession || {};
      setRole(b.role || (b.me != null ? 'others' : 'me'));
      setMe(b.me != null ? b.me : null);
      go('game');
    }).catch(() => {});
  };
  const buildInitialPlayers = () => {
    const list = []; const seen = new Set();
    if (account) { list.push({ id: 'me', name: account.name, color: account.color, avatar: account.avatar || '', account_id: account.id, scores: {} }); seen.add(account.name.toLowerCase()); }
    if (account && autoCrew) family.forEach(m => { if (m.accountId === account.id) return; if (!seen.has(m.name.toLowerCase())) { list.push({ id: 'c' + m.id, name: m.name, color: m.color, avatar: m.avatar || '', account_id: m.accountId || null, scores: {} }); seen.add(m.name.toLowerCase()); } });
    return list;
  };
  const firstStep = () => (t.onboardingFlow === 'express' ? 'express' : 'welcome');
  const newGame = (v = venue) => { gameSavedRef.current = false; if (v && v.holes) GAME.setHoles(v.holes); setPlayers(buildInitialPlayers()); setRole(account ? 'me' : null); setMode(defaultMode); setMe(null); setSessionCode(null); go(scanEnabled ? 'scan' : firstStep()); };
  // "Spiel starten": Anlage bekannt (QR / schon gewählt) → direkt ins Spiel; sonst
  // erst Wo-spielst-du. JEDER Spielstart läuft hier durch — ohne das wird die Runde
  // mit leerer Anlage gespeichert und fehlt später in der Auswertung.
  // Nimmt bewusst keine Argumente: hängt teils direkt an onClick (bekäme sonst das Event).
  const startGame = () => { if (venue) { newGame(); return; } startAfterVenueRef.current = true; setVenuesFrom(screen); go('venues'); };
  // pick a venue from the Anlagen screen → remember it + hole count. Kam man über "Spiel starten"
  // (ohne Anlage), geht's direkt ins Spiel; sonst zurück, wo die Auswahl geöffnet wurde.
  // v is a full venue object (kuratiert aus VENUES oder selbst getippt {slug:null,name,holes,illu})
  const pickVenue = (v) => {
    if (v) { setVenue(v); GAME.setHoles(v.holes); setEntryViaQr(false); }
    if (startAfterVenueRef.current) { startAfterVenueRef.current = false; newGame(v); }
    else go(venuesFrom || 'cover');
  };
  // Anlagen-Auswahl von überall öffnen — zurück geht's dorthin, wo man herkam (Muster wie legalFrom)
  const openVenues = () => { startAfterVenueRef.current = false; setVenuesFrom(screen); go('venues'); };
  const openResults = (fin) => {
    setResultsFinal(fin);
    go('results');
    // joiner: ResultsScreen saves the snapshot once the host actually ends the
    // round (srvDone). Saving here would persist a half-done copy AND wipe the
    // "Laufende Runde" bookmark before the round is really over.
    if (!fin || me != null) return;
    // host pressed "Spiel beenden": pull the authoritative final scores, mark the
    // round finished on every device, save the canonical game.
    const finalize = (finalPlayers) => {
      if (sessionCode) ACC.API.sessionFinish(sessionCode).catch(() => {});
      if (account) saveGame(finalPlayers);
    };
    if (sessionCode) {
      ACC.API.getSession(sessionCode).then(sess => {
        let finalPlayers = players;
        if (sess && sess.players) {
          finalPlayers = players.map(p => {
            const sp = sess.players.find(x => String(x.id) === String(p.id));
            return sp ? { ...p, scores: sp.scores || {}, account_id: sp.account_id || p.account_id } : p;
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
    // Anlage der Runde übernehmen — auch wenn's eine getippte ist, die nicht im Verzeichnis steht
    const sv = OB.venueByName(sess.venue) || (sess.venue ? { slug: null, name: sess.venue, holes: 18, illu: 'generic' } : null); if (sv) setVenue(sv); GAME.setHoles((sv || venue || { holes: 18 }).holes); // adopt the round's venue + hole count
    setPlayers(overlaySelf((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })), account));
    setRole('others');
    setMe(null);
    go('join');
  };
  const logout = () => { setAccount(null); go('cover'); };
  // restore an existing account into THIS browser context (e.g. the home-screen
  // app) by pasting its personal link — bridges Safari ↔ installed app, which
  // keep separate storage on iOS. Accepts a full /m/<id> link or just the id.
  const restoreAccount = (raw) => {
    const m = String(raw || '').match(/\/m\/([^\/?#\s]+)/);
    const token = m ? decodeURIComponent(m[1]) : String(raw || '').trim();
    if (!token) return Promise.reject(new Error('empty'));
    return ACC.API.getAccount(token).then(acc => {
      if (!acc || !acc.id) throw new Error('not found');
      setAccount({ id: acc.id, name: acc.name || 'Spieler', color: acc.color || AV[0], kind: acc.kind || 'master', avatar: acc.avatar || '', created: acc.created || Date.now() });
      setFamily(healFam(Array.isArray(acc.crew) ? acc.crew : []));
      setActiveSession(as => (as && String(as.accountId || '') === String(acc.id)) ? as : null); // fremdes Lesezeichen verwerfen
      ACC.API.listGames(acc.id).then(server => setHistory(server || [])).catch(() => {});
      go('home');
      return acc;
    });
  };
  const openLegal = () => { setLegalFrom(screen); go('legal'); };
  const openFaq = () => { setFaqFrom(screen); go('faq'); };
  const openFeedback = () => { setFeedbackFrom(screen); go('feedback'); };

  const jump = (s) => {
    if ((s === 'game' || s === 'results') && players.length === 0) {
      GAME.setHoles(18); // demo data fills up to 18 holes
      setPlayers(demoPlayers(s === 'results'));
      setRole('me'); setMode(m => m || 'sequential');
    }
    if (s === 'results') { setResultsFinal(true); gameSavedRef.current = true; }
    go(s);
  };

  const isCompanion = !!(account && account.kind === 'companion');
  let view;
  switch (screen) {
    case 'landing': view = <OB.LandingScreen go={go} openLegal={openLegal} openFaq={openFaq} venue={venue} onVenues={openVenues} viaQr={entryViaQr} onStart={startGame} />; break;
    case 'venues': view = <OB.VenuesScreen go={go} onPick={pickVenue} active={venue && venue.slug} back={venuesFrom} directory={directory} />; break;
    case 'legal': view = <OB.LegalScreen go={go} back={legalFrom} />; break;
    case 'faq': view = <OB.FaqScreen go={go} back={faqFrom} openLegal={openLegal} />; break;
    case 'restore': view = <OB.RestoreScreen go={go} onRestore={restoreAccount} back={account ? 'home' : 'cover'} initialErr={restoreErr} />; break;
    case 'feedback': view = <ACC.FeedbackScreen go={go} account={account} back={feedbackFrom} />; break;
    case 'feedbackInbox': view = <ACC.FeedbackInbox items={feedbackItems} go={go} />; break;
    case 'cover': view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={startGame} companion={isCompanion} venue={venue} onVenues={openVenues} viaQr={entryViaQr} />; break;
    case 'account': view = <OB.AccountScreen go={go} onCreate={me != null ? createCompanion : createAccount} companion={me != null} presetName={me != null ? ((players.find(p => String(p.id) === String(me)) || {}).name || '') : ''} back={me != null ? 'results' : 'cover'} />; break;
    case 'home': view = <ACC.HomeScreen account={account || { name: 'Gast', color: AV[0] }} family={family} history={history} go={go} openGame={openGame} newGame={startGame} scanEnabled={scanEnabled} companion={isCompanion} activeSession={activeSession} onResume={resumeSession} onDiscard={discardActiveSession} openFeedback={openFeedback} />; break;
    case 'settings': view = <ACC.SettingsScreen account={account || { name: 'Gast', color: AV[0] }} setAccount={setAccount} family={family} setFamily={setFamily} onMemberPhoto={setCrewPhoto} go={go} logout={logout} defaultMode={defaultMode} setDefaultMode={setDefaultMode} autoCrew={autoCrew} setAutoCrew={setAutoCrew} companion={isCompanion} openLegal={openLegal} openFeedback={openFeedback} openFaq={openFaq} />; break;
    case 'joinCode': view = <OB.JoinCodeScreen go={go} onJoined={enterSession} back={account ? 'home' : 'cover'} />; break;
    case 'history': view = <ACC.HistoryScreen history={history} go={go} openGame={openGame} account={account} family={family} />; break;
    case 'historyDetail': view = <ACC.HistoryDetailScreen game={history.find(g => g.id === histId)} go={go} from={histFrom} onSave={isCompanion ? undefined : saveEditedGame} account={account} family={family} nameOf={nameOf} />; break;
    case 'scan': view = <OB.ScanScreen go={go} express={t.onboardingFlow === 'express'} venue={venue} />; break;
    case 'welcome': view = <OB.RoleScreen go={go} role={role} setRole={setRole} back={scanEnabled ? 'scan' : 'cover'} venue={venue} onVenues={openVenues} />; break;
    case 'players': view = <OB.PlayersScreen go={go} players={players} setPlayers={setPlayers} role={role} family={family} />; break;
    case 'invite': view = <OB.InviteScreen go={go} players={players} mode={mode} sessionCode={sessionCode} setSessionCode={setSessionCode} venueName={venue ? venue.name : ''} />; break;
    case 'join': view = <OB.JoinScreen go={go} players={players} setMe={setMe} sessionCode={sessionCode} account={account} />; break;
    case 'express': view = <GAME.ExpressSetup go={go} role={role} setRole={setRole} mode={mode} setMode={setMode} players={players} setPlayers={setPlayers} family={family} />; break;
    case 'game': view = <GAME.GameScreen players={players} setPlayers={setPlayers} go={go} voiceOn={t.voiceInput} showTotals={t.showTotals} openResults={openResults} sessionCode={sessionCode} me={me} onHome={account && sessionCode ? restart : null} account={account} family={family} venueName={venue ? venue.name : ''} nameOf={nameOf} />; break;
    case 'results': view = <GAME.ResultsScreen players={players} go={go} restart={restart} account={account} family={family} onSave={saveGame} onCompanionSave={saveCompanionGame} final={resultsFinal} onFinish={() => openResults(true)} joined={me != null} sessionCode={sessionCode} me={me} onLeaveJoined={leaveJoined} venueName={venue ? venue.name : ''} nameOf={nameOf} />; break;
    default: view = <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={startGame} companion={isCompanion} venue={venue} onVenues={openVenues} viaQr={entryViaQr} />;
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

  // every <Avatar> resolves its photo through this — by account id, one source
  const resolveAvatar = (person) => UI.resolvePhoto(person, account, family, avatars);
  return (
    <UI.AvatarCtx.Provider value={resolveAvatar}>
      <IOSDevice>{view}</IOSDevice>
      {panel}
    </UI.AvatarCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
setTimeout(() => window.__fitPhone && window.__fitPhone(), 80);
