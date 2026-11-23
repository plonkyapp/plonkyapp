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
  // Der Zugang zum Konto. Bewusst NEBEN dem Konto-Objekt: das wird an
  // mehreren Stellen neu aufgebaut, dabei ginge das Geheimnis verloren.
  const [secret, setSecretState] = useAS(null);
  // Immer beides setzen: der Zustand fuer den Speicher, die Modulvariable
  // fuer den naechsten Aufruf — der kommt frueher als der naechste Speichervorgang.
  const useSecret = (v) => { ACC.setSecret(v); setSecretState(v || null); };
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
  const [inviteFrom, setInviteFrom] = useAS('players'); // 'players' = Einrichten, sonst aus laufender Runde
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
  const accountSaveRef = useAR(null);  // laufendes Anlegen des Kontos (die Solo-Runde wartet darauf)
  const pendingAvatarRef = useAR(new Set()); // account ids whose photo is being saved — a fetch must not overwrite them
  // Erst wenn der Stand des Servers uebernommen ist, darf dieses Geraet seinen
  // eigenen hochschieben — sonst ueberschreibt ein altes Geraet beim Oeffnen,
  // was auf einem anderen geaendert wurde (Name, Farbe, Foto, Crew).
  const [synced, setSynced] = useAS(false);
  const [switchAsk, setSwitchAsk] = useAS(null); // { acc, token, bookmark }: fremder persoenlicher Link — erst fragen
  const [soloRetry, setSoloRetry] = useAS(0);
  // Profil oder Crew wurden geaendert, und der Server hat es noch nicht (kein
  // Netz, Fehler). Steht mit im Speicher: beim naechsten Start wird dann NICHT
  // der Stand des Servers uebernommen, sondern erst der eigene hochgeschoben —
  // sonst waere, was im Funkloch eingegeben wurde, nach dem Neuladen weg.
  const [profileDirty, setProfileDirty] = useAS(false);
  const secretRef = useAR(null); secretRef.current = secret || null;
  const accIdRef = useAR(null); accIdRef.current = (account && account.id) || null;
  const accountRef = useAR(null); accountRef.current = account;
  const familyRef = useAR([]); familyRef.current = family;
  // Was beim Laden aus dem Speicher kam — genau diese Objekte. Hat der Nutzer
  // seither etwas geaendert, sind es andere, und der Stand des Servers
  // ueberschreibt seine Aenderung nicht.
  const loadedAccRef = useAR(null);
  const loadedFamRef = useAR(null);
  const dirtyAtLoadRef = useAR(false);
  const profilePushRef = useAR(0);

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
        .then(a => {
          if (!a) return;
          // Dasselbe Array zurueckgeben, wenn nichts anders ist — ein neues
          // stoesst jedes Mal ein Speichern des Kontos an.
          setFamily(cur => {
            let anders = false;
            const neu = cur.map(x => {
              if (x.id !== m.id) return x;
              const av = a.avatar || x.avatar, nm = a.name || x.name;
              if (av === x.avatar && nm === x.name) return x;
              anders = true; return { ...x, avatar: av, name: nm };
            });
            return anders ? neu : cur;
          });
        })
        .catch(() => {});
    });
  };

  // the venue this device last played on, as stored
  const storedVenue = (d) => {
    const known = d.venueSlug && OB.venueBySlug(d.venueSlug);
    if (known) return known;
    // Anlagen aus dem Verzeichnis kennt die eingebaute Liste nicht — Name und
    // Bahnenzahl stehen deshalb immer mit im Speicher.
    if (d.venueCustom && d.venueCustom.name) return { slug: d.venueCustom.slug || null, illu: 'generic', name: d.venueCustom.name, holes: d.venueCustom.holes || 18 };
    return null;
  };

  // Den Stand des Servers fuer ein gespeichertes Konto uebernehmen: Foto, Name,
  // Farbe, Crew. Der Server ist die eine Quelle — sonst macht jedes Geraet die
  // Aenderung eines anderen beim naechsten Oeffnen rueckgaengig.
  const applyServer = (aid, server) => {
    const cur = accountRef.current;
    // Nur wenn seit dem Laden nichts angefasst wurde — sonst gilt, was der
    // Nutzer gerade eingegeben hat, und DAS geht gleich zum Server.
    if (cur && String(cur.id) === String(aid) && (!loadedAccRef.current || cur === loadedAccRef.current)) {
      const n = { ...cur }; let anders = false;
      if (server.avatar !== undefined && cur.avatar !== server.avatar) { n.avatar = server.avatar; anders = true; }
      if (server.name && server.name !== cur.name) { n.name = server.name; anders = true; }
      if (server.color && server.color !== cur.color) { n.color = server.color; anders = true; }
      if (anders) setAccount(n);
    }
    // Crew: der Server ist die eine Quelle — Löschen/Neuanlegen auf Gerät A
    // kommt so beim nächsten Öffnen auch auf Gerät B an (statt wiederbelebt zu werden)
    if (Array.isArray(server.crew) && (!loadedFamRef.current || familyRef.current === loadedFamRef.current)) {
      const fam = healFam(server.crew); setFamily(fam); refreshLinkedCrew(fam);
    } else refreshLinkedCrew(familyRef.current);
    loadedAccRef.current = null; loadedFamRef.current = null;
  };
  const adoptServer = (acc, versuch = 0) => {
    if (!acc || !acc.id) { setSynced(true); return; }
    // Ungesendete eigene Aenderungen von einem frueheren Start: die gehen vor.
    if (dirtyAtLoadRef.current) { loadedAccRef.current = null; loadedFamRef.current = null; refreshLinkedCrew(familyRef.current); setSynced(true); return; }
    ACC.API.getAccount(acc.id)
      .then(server => {
        if (accIdRef.current !== acc.id) return;            // inzwischen abgemeldet oder gewechselt
        if (server) applyServer(acc.id, server);
        setSynced(true);
      })
      .catch(() => {
        // Server nicht erreichbar. Dann wird auch nichts hochgeschoben — der
        // Stand dieses Geraets kann veraltet sein. Spaeter nochmal versuchen.
        setTimeout(() => { if (accIdRef.current === acc.id) adoptServer(acc, versuch + 1); }, Math.min(60000, 5000 * (versuch + 1)));
      });
  };
  // Unterbrochener Link-Tausch (siehe API.rotateSecret): gilt der neue Wert
  // beim Server schon, uebernimmt ihn das Geraet — gezielt gespeichert, dann
  // neu geladen, damit jeder Aufruf ihn traegt. Bis zum Neuladen schreibt
  // dieser Tab nichts mehr (STORE.reload friert ein), sonst kaeme der alte
  // Wert aus dem Arbeitsspeicher zurueck. Ist der neue dem Server unbekannt,
  // bleibt er noch zwei Minuten stehen: die Anfrage kann unterwegs sein.
  const settlePending = (acc, bisher, versuch) => {
    const unterwegs = ACC.PENDING.get();
    if (!unterwegs) return;
    if (!acc || !acc.id) { ACC.PENDING.clear(); return; }
    ACC.API.resolveAccount(unterwegs)
      .then(server => {
        if (server && String(server.id) === String(acc.id)) {
          ACC.STORE.patch({ secret: unterwegs });
          ACC.PENDING.clear();
          if (unterwegs !== bisher) ACC.STORE.reload();
        } else if (ACC.PENDING.age() > 120000) ACC.PENDING.clear();
      })
      // nicht erreichbar: spaeter nochmal (hoechstens ein paar Mal)
      .catch(() => { if ((versuch || 0) < 5) setTimeout(() => settlePending(acc, bisher, (versuch || 0) + 1), 20000); });
  };
  // Die Runde bringt Anlage UND Bahnenzahl mit. Ohne die Zahl rechnete ein Gast
  // mit der eigenen gemerkten Anlage oder mit 18.
  const adoptVenue = (sess) => {
    const known = OB.venueByName(sess.venue);
    const holes = sess.holes || (known && known.holes) || (venue && venue.holes) || 18;
    const v = known ? { ...known, holes } : (sess.venue ? { slug: null, name: sess.venue, holes, illu: 'generic' } : null);
    if (v) setVenue(v);
    GAME.setHoles(holes);
  };
  // Kontowechsel = Rucksack ausräumen: ab hier gelten Zugang, Crew und Verlauf
  // des geholten Kontos; das Runden-Lesezeichen nur, wenn es diesem Konto gehört.
  const switchTo = (acc, token, bookmark) => {
    useSecret(token);
    setAccount({ id: acc.id, name: acc.name || 'Spieler', color: acc.color || AV[0], kind: acc.kind || 'master', avatar: acc.avatar || '', created: acc.created || Date.now() });
    const fam = healFam(Array.isArray(acc.crew) ? acc.crew : []); setFamily(fam); refreshLinkedCrew(fam); // server crew wins on a fresh device
    setActiveSession(bookmark && String(bookmark.accountId || '') === String(acc.id) ? bookmark : null);
    setHistory([]);
    setSwitchAsk(null);
    setProfileDirty(false); dirtyAtLoadRef.current = false; loadedAccRef.current = null; loadedFamRef.current = null;
    setSynced(true);
    setScreen('home');
    return ACC.API.listGames(acc.id).then(server => { if (server) setHistory(server); }).catch(() => {});
  };

  // Ein zweiter Tab dieses Browsers hat Konto oder Zugang geaendert (Link
  // erneuert, abgemeldet, Konto gewechselt oder geloescht). Dieser Tab haelt
  // noch den alten Stand im Speicher und wuerde ihn beim naechsten Speichern
  // zurueckschreiben — samt einem Zugang, den der Server nicht mehr kennt.
  // Also neu laden und den aktuellen Stand uebernehmen.
  useAE(() => {
    const onStore = (e) => {
      if (e.key !== ACC.STORE.KEY) return;
      let d = {};
      try { d = JSON.parse(e.newValue || 'null') || {}; } catch (x) { return; }
      // Ein Tab mit aelterem Stand (noch die Fassung vor dem Update) hat
      // ueberschrieben: nicht dessen Stand uebernehmen, den eigenen behaupten.
      const r = (typeof d.rev === 'number') ? d.rev : -1;
      if (ACC.STORE.rev != null && r < ACC.STORE.rev) { ACC.STORE.reassert(); return; }
      const sec = d.secret || null, aid = (d.account && d.account.id) || null;
      if (sec !== secretRef.current || aid !== accIdRef.current) ACC.STORE.reload();
    };
    window.addEventListener('storage', onStore);
    return () => window.removeEventListener('storage', onStore);
  }, []);

  // load once
  useAE(() => {
    const d = ACC.STORE.open();
    if (d.profileDirty) { dirtyAtLoadRef.current = true; setProfileDirty(true); }
    // Gleich zu Beginn, damit schon der erste Server-Aufruf das Geheimnis traegt.
    if (d.secret) { ACC.setSecret(d.secret); setSecretState(d.secret); }
    // Neuer persoenlicher Link: /m/#<geheimnis>. Alles ab '#' bleibt im
    // Browser und erreicht den Server nie — der Link steht also in keinem
    // Zugriffsprotokoll. Alte Links tragen die Konto-Nummer noch im Pfad;
    // die funktionieren weiter, solange das Konto noch kein Geheimnis hat.
    const onM = typeof location !== 'undefined' && /^\/m(\/|$)/.test(location.pathname);
    // Was hinter dem '#' stand, hat ein kleines Skript in index.html schon beim
    // Laden aus der Adresszeile genommen und hier abgelegt — noch bevor Babel
    // fertig ist. Einmal lesen, dann weg damit.
    let stash = '';
    try { stash = sessionStorage.getItem('plonky.hash') || ''; sessionStorage.removeItem('plonky.hash'); } catch (e) {}
    const safeDecode = (v) => { try { return decodeURIComponent(v); } catch (e) { return ''; } };
    const mHash = stash || (typeof location !== 'undefined' ? (location.hash || '').replace(/^#/, '') : '');

    // Was auf diesem Geraet gespeichert ist, gilt in JEDEM Einstieg. Frueher
    // stellten die Zweige fuer /fb, /j/ und /m/ nur einen Teil wieder her, und
    // der naechste Speichervorgang schrieb den Rest leer zurueck: ein toter
    // persoenlicher Link loeschte so Konto, Crew und Verlauf (Audit 22.11.2026).
    const restoreLocal = () => {
      let a = d.account || null;
      if (a && !a.id) a = { ...a, id: ACC.newAccountId() };
      if (a && !d.secret) { const sc = ACC.newAccountSecret(); ACC.setSecret(sc); setSecretState(sc); }
      if (a) { loadedAccRef.current = a; setAccount(a); }
      if (d.family) { const fam = healFam(d.family); loadedFamRef.current = fam; setFamily(fam); }
      if (d.history) setHistory(d.history);
      settlePending(a, d.secret);
      if (d.activeSession) setActiveSession(d.activeSession);
      if (d.defaultMode) setDefaultMode(d.defaultMode);
      if (d.autoCrew != null) setAutoCrew(d.autoCrew);
      return a;
    };
    const mPath = typeof location !== 'undefined' ? ((location.pathname.match(/^\/m\/([^\/?#]+)/) || [])[1] || '') : '';
    const linkMatch = onM && (mHash || mPath);
    const joinMatch = typeof location !== 'undefined' && location.pathname.match(/^\/j\/([^\/?#]+)/);
    // Nur noch /fb — der Schluessel kommt hinter dem # und wird per POST /fb/login gegen eine
    // Cookie-Sitzung getauscht und erreicht das Frontend nie.
    const fbMatch = typeof location !== 'undefined' && /^\/fb\/?$/.test(location.pathname);

    // The remembered venue has to be restored on EVERY entry path. The link
    // branches below return early, so without this a device opened via /m/ keeps
    // venue = null and the game start has no venue to show.
    const remembered = storedVenue(d);
    if (remembered) { setVenue(remembered); GAME.setHoles(remembered.holes); }

    // opened via the private feedback inbox link (/fb#<key>)
    if (fbMatch) {
      adoptServer(restoreLocal());
      // Anmeldung: /fb#<schluessel>. Der Schluessel steht hinter dem '#', das
      // der Browser nie an den Server schickt; er geht in einer Kopfzeile
      // hinueber und wird gegen eine Sitzung getauscht.
      (stash ? ACC.API.feedbackLogin(safeDecode(stash)).catch(() => {}) : Promise.resolve())
        .then(() => ACC.API.listFeedback())
        .then(items => { setFeedbackItems(items || []); setScreen('feedbackInbox'); })
        .catch(() => { setFeedbackItems(null); setScreen('feedbackInbox'); })
        .finally(() => setHydrated(true));
      return;
    }

    // opened via a live-session link (/j/<code>): join that shared round
    if (joinMatch) {
      const code = safeDecode(joinMatch[1]).toUpperCase();
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      const acc = restoreLocal();
      adoptServer(acc);
      ACC.API.getSession(code, true)
        .then(sess => {
          if (!sess) { setScreen(acc ? 'home' : 'cover'); return; } // code expired/unknown
          setSessionCode(sess.code);
          setMode(sess.mode || 'sequential');
          adoptVenue(sess); // join the round's venue + hole count
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
      const token = safeDecode(mHash || mPath);
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/');
      // ERST den Stand dieses Geraets laden — er bleibt, falls der Link nichts
      // taugt. Ersetzt wird er nur nach einer ERFOLGREICHEN Aufloesung.
      const lokal = restoreLocal();
      const altesLesezeichen = d.activeSession || null;
      // Link taugt nicht (alt, vertippt, kein Netz): mit dem bisherigen Konto
      // weiter, als waere nichts gewesen. Ohne Konto: Wiederherstellen-Dialog.
      const bleibWieDuBist = () => {
        adoptServer(lokal);          // auch hier gilt: erst der Stand des Servers
        if (lokal) { setScreen('home'); return; }
        setRestoreErr('Kein Konto gefunden. Prüfe deinen Link und versuch es nochmal.'); setScreen('restore');
      };
      (token ? ACC.API.resolveAccount(token) : Promise.resolve(null))
        .then(acc => {
          if (!acc || !acc.id) { bleibWieDuBist(); return null; }
          // Der eigene Link auf dem eigenen Geraet: nichts ausraeumen, sonst
          // gingen Runden verloren, die erst lokal gespeichert sind.
          if (lokal && String(lokal.id) === String(acc.id)) {
            useSecret(token);
            // Die Antwort IST der Stand des Servers (mit Crew). Den uebernehmen
            // — sonst schiebt ein altes Geraet beim Oeffnen seines Lesezeichens
            // seinen alten Namen und seine alte Crew ueber den aktuellen Stand.
            dirtyAtLoadRef.current = false; setProfileDirty(false);
            applyServer(acc.id, acc);
            setSynced(true);
            setScreen('home');
            return ACC.API.listGames(acc.id).then(server => setHistory(local => ACC.mergeGames(local, server)));
          }
          // Der Link gehoert zu einem ANDEREN Konto, und auf diesem Geraet ist
          // schon eines. Erst fragen: der Wechsel vergisst den bisherigen
          // Zugang — wer seinen Link nie gespeichert hat, kaeme nie mehr zurueck.
          if (lokal && lokal.id) {
            adoptServer(lokal);
            setSwitchAsk({ acc, token, bookmark: altesLesezeichen });
            setScreen('switch');
            return null;
          }
          return switchTo(acc, token, altesLesezeichen);
        })
        .catch(() => bleibWieDuBist())
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
      pickedVenue = OB.venueBySlug(safeDecode(pMatch[1]));
    }
    if (!pickedVenue) pickedVenue = remembered; // sonst die gemerkte (auch die getippte ohne slug)
    if (pickedVenue) { setVenue(pickedVenue); GAME.setHoles(pickedVenue.holes); }
    setEntryViaQr(!!(pMatch && pickedVenue)); // nur ein frischer QR-Aufruf gilt als "am Platz"

    // Geraet aus der Zeit vor der Trennung: es hat ein Konto, aber kein
    // Geheimnis. Jetzt eines erzeugen — der Server bindet es beim naechsten
    // Speichern an das Konto und schliesst die Tuer hinter uns zu.
    if (acc && !d.secret) { const sc = ACC.newAccountSecret(); ACC.setSecret(sc); setSecretState(sc); }
    if (acc) setAccount(acc);
    // QR-Link → Willkommen mit Anlage. Konto → Home. Sonst (frisch/Website) → Cover ohne Anlage;
    // die Anlage wird erst beim "Spiel starten" gewählt (Wo spielst du?).
    if (pMatch && pickedVenue) setScreen('landing');
    else if (acc) setScreen('home');
    else setScreen('cover');

    if (acc) loadedAccRef.current = acc;
    if (d.family) { const fam = healFam(d.family); loadedFamRef.current = fam; setFamily(fam); if (!acc) refreshLinkedCrew(fam); }
    if (d.history) setHistory(d.history);
    if (d.activeSession) setActiveSession(d.activeSession);
    if (d.defaultMode) setDefaultMode(d.defaultMode);
    if (d.autoCrew != null) setAutoCrew(d.autoCrew);
    setHydrated(true);
    settlePending(acc, d.secret);
    if (acc && acc.id) ACC.API.listGames(acc.id)
      .then(server => setHistory(local => accIdRef.current === acc.id ? ACC.mergeGames(local, server) : local))
      .catch(() => {}); // offline / old static host: keep localStorage only
    // adopt this account's photo, name, colour and crew from the server (the
    // shared source), so a change made on another device shows here
    adoptServer(acc);
  }, []);
  // Anlagen-Verzeichnis laden (Kanton-Browsing im "Wo spielst du?"-Screen). Async & unkritisch:
  // fehlt es (alter Static-Host / offline), bleibt die Auswahl aufs Freitextfeld beschränkt.
  useAE(() => { fetch('/venues.json').then(r => (r.ok ? r.json() : [])).then(d => { if (Array.isArray(d)) setDirectory(d); }).catch(() => {}); }, []);
  // persist
  useAE(() => {
    if (!hydrated) return;
    const fremd = ACC.STORE.save({ account, secret, family, history, defaultMode, autoCrew, activeSession, profileDirty, venueSlug: venue && venue.slug, venueCustom: venue ? { name: venue.name, holes: venue.holes, slug: venue.slug || null } : null });
    if (!fremd) return;
    // Ein anderer Tab hat diese Felder geaendert, dieser nicht: uebernehmen.
    // (Konto und Zugang sind dabei garantiert dieselben — sonst laedt STORE neu.)
    if ('account' in fremd && fremd.account) setAccount(fremd.account);
    if ('family' in fremd) setFamily(Array.isArray(fremd.family) ? fremd.family : []);
    if ('history' in fremd) setHistory(Array.isArray(fremd.history) ? fremd.history : []);
    if ('activeSession' in fremd) setActiveSession(fremd.activeSession || null);
    if ('defaultMode' in fremd && fremd.defaultMode) setDefaultMode(fremd.defaultMode);
    if ('autoCrew' in fremd && fremd.autoCrew != null) setAutoCrew(fremd.autoCrew);
    if ('profileDirty' in fremd) setProfileDirty(!!fremd.profileDirty);
  }, [hydrated, account, secret, family, history, defaultMode, autoCrew, activeSession, venue, profileDirty]);
  // keep the server copy of the account (name/color/photo) in sync. Skip the very
  // first run after load: otherwise this device's stale localStorage would clobber
  // a change made elsewhere (e.g. the master set your crew photo) before we adopt it.
  useAE(() => {
    if (!hydrated || !account || !account.id) return;
    if (!synced) {
      // Noch nicht mit dem Server abgeglichen (kein Netz). Hat der Nutzer
      // trotzdem schon etwas geaendert, wird das vermerkt.
      if ((loadedAccRef.current && account !== loadedAccRef.current) || (loadedFamRef.current && family !== loadedFamRef.current)) setProfileDirty(true);
      return;
    }
    const marke = ++profilePushRef.current;
    ACC.API.saveAccount(account, family)
      .then(() => { if (marke === profilePushRef.current) setProfileDirty(false); })
      .catch(e => {
        // 410: das Konto wurde auf einem anderen Geraet geloescht. Dann vergisst
        // es auch dieses — statt es bei jedem Speichern neu anlegen zu wollen.
        if (/ 410$/.test(String(e && e.message))) { logout(); return; }
        if (marke === profilePushRef.current) setProfileDirty(true);
      });
  }, [hydrated, synced, account, family]);
  // when a crew slot is claimed by someone with their own account, remember the
  // link (crew member ↔ account) so the master shows their current photo later
  useAE(() => {
    if (!account || !players.length) return;
    players.forEach(p => {
      const id = String(p.id);
      if (p.account_id && id.startsWith('c')) {
        const cid = id.slice(1);
        // Nur ein NEUES Array liefern, wenn es wirklich etwas zu aendern gibt.
        // Vorher gab fam.map() bei jedem Abgleich ein neues Array zurueck, auch
        // ohne Treffer — das stiess alle 3 Sekunden ein Speichern des Kontos an.
        setFamily(fam => {
          const i = fam.findIndex(m => String(m.id) === cid);
          if (i < 0 || fam[i].accountId === p.account_id) return fam;
          return fam.map(m => String(m.id) === cid ? { ...m, accountId: p.account_id } : m);
        });
      }
    });
  }, [players, account]);

  // remember the live round you're in, so "Mein plonky" can dive back into it
  // (the bookmark survives going home; it's cleared on finish/save or delete)
  useAE(() => {
    if (!hydrated || !sessionCode) return;
    // Eine Einladung bloss zu oeffnen ist noch kein Mitspielen. Frueher
    // ueberschrieb schon das Ansehen einer zweiten Runde das Lesezeichen der
    // eigenen laufenden — die war danach nicht mehr erreichbar.
    if (me == null && !ACC.ROUNDS.get(sessionCode).host) return;
    setActiveSession({ code: sessionCode, role, me, mode: mode || 'sequential', venue: (venue && venue.name) || '', accountId: (account && account.id) || null });
  }, [hydrated, sessionCode, role, me, mode, account]);

  // accounts from the start: a fresh host (or a joiner) gets a real account from
  // their name/slot the moment they enter a round — no end-of-game "save your account"
  useAE(() => {
    if (!hydrated || account || screen !== 'game' || !players.length) return;
    const src = me != null ? (players.find(p => String(p.id) === String(me)) || {}) : (players[0] || {});
    const acc = { id: ACC.newAccountId(), name: src.name || 'Spieler', color: src.color || AV[0], avatar: src.avatar || '', kind: me != null ? 'companion' : 'master', created: Date.now() };
    useSecret(ACC.newAccountSecret());  // Zugang erzeugen, BEVOR das Konto zum Server geht
    setAccount(acc);
    // den eigenen Spieler-Slot ans neue Konto knüpfen — sonst erkennt der
    // "Host nie in der eigenen Crew"-Filter (der über account_id geht) den Host nicht
    setPlayers(ps => ps.map((p, i) => (me != null ? String(p.id) === String(me) : i === 0) ? { ...p, account_id: acc.id } : p));
    // Erst das Konto, DANN die Verknuepfung des Platzes: der Server verknuepft
    // nur noch ein Konto, dessen Zugang der Aufrufer nachweist — dazu muss es
    // dort schon existieren.
    const gespeichert = ACC.API.saveAccount(acc, me != null ? undefined : family).catch(() => {});
    accountSaveRef.current = gespeichert;
    // Auch der GASTGEBER weist sein frisches Konto in der laufenden Runde nach
    // (mit Gastgeber-Schluessel + Geheimnis). Ohne das kennt der Server ihn dort
    // nie: keine Teilnehmer in der gespeicherten Runde, und Name/Foto der Gaeste
    // waeren fuer ihn spaeter nicht sichtbar.
    const platz = me != null ? me : (players[0] && players[0].id);
    gespeichert
      .then(() => { if (sessionCode && platz != null) return ACC.API.sessionClaim(sessionCode, platz, acc.avatar, acc.id); })
      .catch(() => {});
  }, [hydrated, screen, account, me, players.length, sessionCode]);

  // a host's solo game ("ich tippe für alle") skips the invite step, so it has no
  // session — give it one on entry so it persists as a "Laufende Runde" & survives Pause
  useAE(() => {
    if (!hydrated || sessionCode || screen !== 'game' || me != null || !account || !players.length || soloSessionRef.current) return;
    soloSessionRef.current = true;
    // Erst wenn das eben angelegte Konto auf dem Server ist: sonst kommt die
    // Runde dort vor dem Konto an, und der Gastgeber gilt nicht als ausgewiesen.
    Promise.resolve(accountSaveRef.current).catch(() => {}).then(() => ACC.API.createSession({ mode: mode || 'sequential', venue: (venue && venue.name) || '', holes: (venue && venue.holes) || undefined, players: players.map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, avatar: p.avatar || '', account_id: p.account_id || null })) }))
      .then(sess => setSessionCode(sess.code))
      // Gescheitert (Funkloch): in ein paar Sekunden nochmal. Sonst lebt die
      // Runde nur im Arbeitsspeicher dieses Tabs.
      .catch(() => { setTimeout(() => setSoloRetry(n => n + 1), 5000); })
      .finally(() => { soloSessionRef.current = false; });
  }, [hydrated, screen, sessionCode, me, account, players.length, soloRetry]);

  // opening home: re-pull my games from the server so the host's ONE shared
  // record (where I'm a participant) and any later host edit show up.
  useAE(() => {
    if (!hydrated || !account || !account.id) return;
    if (screen !== 'home') return;
    const aid = account.id;
    history.filter(g => g.unsynced).forEach(g => pushGame(aid, g));   // was im Funkloch haengen blieb
    // (accIdRef: eine Antwort, die erst nach dem Abmelden eintrifft, darf den
    // Verlauf des Vorgaengers nicht wieder auf das Geraet schreiben)
    ACC.API.listGames(aid).then(server => setHistory(local => accIdRef.current === aid ? ACC.mergeGames(local, server || []) : local)).catch(() => {});
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
    ACC.API.getAccounts(list, sessionCode)
      .then(accs => {
        setAvatars(prev => { const next = { ...prev }; (accs || []).forEach(a => { if (!pendingAvatarRef.current.has(a.id)) next[a.id] = a.avatar || ''; }); return next; });
        setLiveNames(prev => { const next = { ...prev }; (accs || []).forEach(a => { if (a.name) next[a.id] = a.name; }); return next; });
      })
      .catch(() => {});
  }, [hydrated, screen, family.length, history.length, players.length, sessionCode]);

  useAE(() => { document.documentElement.style.setProperty('--accent', t.accent); }, [t.accent]);
  // Bahnenzahl im Spiel folgt der aktiven Anlage (Backstop; Spielstart-Pfade setzen es zusätzlich synchron)
  useAE(() => { if (venue && venue.holes) GAME.setHoles(venue.holes); }, [venue]);
  useAE(() => { window.__fitPhone && window.__fitPhone(); }, []);

  const go = (s) => { setScreen(s); const el = document.querySelector('.noscroll'); if (el) el.scrollTop = 0; };
  // leave the round view and go home — the round stays live & bookmarked; you can dive back in
  const restart = () => { gameSavedRef.current = false; setPlayers([]); setRole(null); setMode(null); setMe(null); setSessionCode(null); go(account ? 'home' : 'cover'); };

  // Eine Runde zum Server bringen. Solange das nicht geklappt hat, traegt sie
  // lokal die Marke "unsynced" — dann gewinnt beim Abgleich die lokale Fassung,
  // und die Startseite schickt sie nach. Frueher wurde ein Fehlschlag einfach
  // verschluckt: "Im Verlauf gespeichert" stand da, die Mitspieler bekamen die
  // Runde nie, und eine Korrektur war beim naechsten Abgleich wieder weg.
  const pushGame = (aid, g) => {
    const marke = g.unsynced;
    const { unsynced, mine, dirty, ...rumpf } = g;
    // Als Mitspieler nur die Spieler schicken, deren Schlaege HIER geaendert
    // wurden. Der Server ersetzt die Schlaege jedes mitgeschickten Spielers —
    // eine alte Kopie wuerde sonst die Korrektur des Besitzers ueberschreiben.
    if (mine === false && Array.isArray(dirty)) rumpf.players = (rumpf.players || []).filter(p => dirty.indexOf(String(p.id)) >= 0);
    const erledigt = () => setHistory(h => h.map(x => { if (x.id !== g.id || x.unsynced !== marke) return x; const { unsynced: _weg, dirty: _d, ...rest } = x; return rest; }));
    return ACC.API.saveGame(aid, rumpf).then(erledigt).catch(e => {
      // Vom Server ausdruecklich und endgueltig abgelehnt: Wiederholen hilft
      // nicht. (403 gehoert NICHT dazu — das kann ein veralteter Zugang sein,
      // und mit dem neuen Link klappt es dann.)
      if (/ (400|409|410|413)$/.test(String(e && e.message))) erledigt();
    });
  };
  const saveGame = (pls, acc) => {
    if (gameSavedRef.current) return;
    if (!pls.some(p => GAME.totals(p).played > 0)) return;
    gameSavedRef.current = true;
    setActiveSession(null); // finished & archived → drop the live bookmark
    // Dieselbe Live-Runde ist schon im Verlauf (etwa nach einem Neuladen
    // mitten im Beenden): nicht ein zweites Mal anlegen.
    if (sessionCode && history.some(g => g.code === sessionCode && g.mine !== false)) return;
    const owner = (acc || account) && (acc || account).id;
    // accounts that joined with their own device become participants of this ONE
    // shared record (so they see it — and any later host edit — in their history)
    const participants = [...new Set(pls.map(p => p.account_id).filter(id => id && id !== owner))];
    const game = { id: ACC.newGameId(), date: Date.now(), venue: (venue && venue.name) || '', mode: mode || 'sequential', code: sessionCode || '', participants, unsynced: Date.now(),
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
    if (owner) pushGame(owner, game); // lokal ist sie schon; scheitert das, wird sie auf der Startseite nachgeschickt
  };

  // A joined guest does NOT own the game — the host saves ONE shared record with
  // her as a participant. So she keeps no separate copy; she pulls that shared
  // game into her history (she appears via participants). This is why a later
  // host edit shows up for her instead of leaving a stale private copy.
  const pullSharedGames = (aid, tries = 0) => {
    if (!aid) return;
    ACC.API.listGames(aid)
      .then(server => { setHistory(local => accIdRef.current === aid ? ACC.mergeGames(local, server || []) : local); if (tries < 3) setTimeout(() => pullSharedGames(aid, tries + 1), 1600); })
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
  // Das Foto eines Crew-Mitglieds OHNE eigenes Konto liegt am Crew-Eintrag.
  // Hat das Mitglied ein eigenes Konto, gehoert das Foto dorthin — und nur der
  // Inhaber aendert es. Frueher schrieb diese Funktion von hier aus ins fremde
  // Konto; seit der Trennung von Ausweis und Zugang (22.11.2026) lehnt der
  // Server das ab, und das ist richtig so: sonst koennte jeder, der eine
  // Konto-Nummer kennt, fremde Fotos setzen. Die Einstellungen bieten den
  // Knopf fuer verknuepfte Mitglieder deshalb gar nicht mehr an.
  const setCrewPhoto = (member, src) => {
    if (member.accountId) return;
    setFamily(f => f.map(m => m.id === member.id ? { ...m, avatar: src } : m));
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
  const saveEditedGame = (g0) => {
    const alt = history.find(x => x.id === g0.id) || { players: [] };
    const geaendert = (g0.players || []).filter(p => JSON.stringify(p.scores || {}) !== JSON.stringify(((alt.players || []).find(o => String(o.id) === String(p.id)) || {}).scores || {})).map(p => String(p.id));
    const g = { ...g0, unsynced: Date.now(), dirty: Array.from(new Set([...(alt.dirty || []), ...geaendert])) };
    setHistory(h => h.map(x => x.id === g.id ? g : x));
    const aid = account && account.id;
    if (aid) pushGame(aid, g);
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
      adoptVenue(sess); // resume into the round's venue + hole count
      setPlayers(overlaySelf((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })), account));
      const b = activeSession || {};
      // Weder Gastgeber dieser Runde noch auf einem Platz: dann erst einen
      // Platz waehlen — nicht mit lauter editierbaren Zeilen ins Spiel.
      if (b.me == null && !ACC.ROUNDS.get(sess.code).host) { setRole('others'); setMe(null); go('join'); return; }
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
  const newGame = (v = venue) => { gameSavedRef.current = false; if (v && v.holes) GAME.setHoles(v.holes); setPlayers(buildInitialPlayers()); setRole(account ? 'me' : null); setMode(defaultMode); setMe(null); setSessionCode(null); setInviteFrom('players'); go(scanEnabled ? 'scan' : firstStep()); };
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
    // Erst beenden, DANN den Endstand holen: nach dem Beenden nimmt der Server
    // nichts mehr an, der Abruf danach ist also wirklich der letzte Stand.
    // Umgekehrt fehlte ein Schlag, den ein Gast genau dazwischen eintrug.
    // Hoechstens vier Sekunden warten — das Beenden versucht es im Hintergrund
    // weiter, das Speichern soll daran nicht haengen.
    const sichern = (finalPlayers) => { if (account) saveGame(finalPlayers); };
    if (!sessionCode) { sichern(players); return; }
    const beendet = ACC.API.sessionFinish(sessionCode).catch(() => {});
    Promise.race([beendet, new Promise(res => setTimeout(res, 4000))])
      .then(() => ACC.API.getSession(sessionCode))
      .then(sess => {
        let finalPlayers = players;
        if (sess && sess.players) {
          finalPlayers = players.map(p => {
            const sp = sess.players.find(x => String(x.id) === String(p.id));
            if (!sp) return p;
            // Hat ein Gast den Platz selbst belegt, zaehlt der Stand des
            // Servers (dort tippt er). Fuer alle anderen Plaetze tippt DIESES
            // Geraet — ein Schlag, der den Server nicht erreicht hat, darf
            // beim Speichern nicht fehlen.
            const scores = (sp.claimed && !sp.host) ? (sp.scores || {}) : { ...(sp.scores || {}), ...(p.scores || {}) };
            return { ...p, scores, account_id: sp.account_id || p.account_id };
          });
          setPlayers(finalPlayers);
        }
        sichern(finalPlayers);
      })
      .catch(() => sichern(players));
  };
  const createAccount = (name) => {
    const acc = { id: ACC.newAccountId(), name, color: AV[0], created: Date.now() };
    useSecret(ACC.newAccountSecret());
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
    useSecret(ACC.newAccountSecret());
    setAccount(acc);
    // tell the session this slot now belongs to a real account (host can link it
    // to their crew entry, so my photo stays current for them) — erst NACH dem
    // Anlegen des Kontos, sonst kann der Server die Verknuepfung nicht pruefen
    ACC.API.saveAccount(acc, family).catch(() => {})
      .then(() => { if (sessionCode && me != null) return ACC.API.sessionClaim(sessionCode, me, acc.avatar, acc.id); })
      .catch(() => {});
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
    adoptVenue(sess); // adopt the round's venue + hole count
    setPlayers(overlaySelf((sess.players || []).map(p => ({ id: p.id, name: p.name, color: p.color, scores: p.scores || {}, claimed: !!p.claimed, host: !!p.host, avatar: p.avatar || '', account_id: p.account_id || null })), account));
    setRole('others');
    setMe(null);
    go('join');
  };
  // Abmelden heisst: dieses Geraet vergisst das Konto VOLLSTAENDIG.
  // Vorher wurde nur das aktive Konto zurueckgesetzt — Geheimnis, Crew und
  // Verlauf blieben im Browserspeicher liegen. Seit der Trennung von Ausweis
  // und Zugang waere das der Zugangsschluessel selbst: auf einem geteilten
  // Geraet haette sich das Konto per persoenlichem Link wiederholen lassen.
  // Die Runden sind auf dem Server; mit dem persoenlichen Link kommt alles
  // zurueck.
  const logout = () => {
    ACC.ROUNDS.clear();   // auch die Schluessel laufender Runden
    ACC.PENDING.clear();
    useSecret(null);
    setAccount(null);
    setFamily([]);
    setHistory([]);
    setActiveSession(null);
    // Auch die Runde im Arbeitsspeicher: sonst schreibt der Lesezeichen-Effekt
    // sie gleich nach dem Abmelden wieder in den Speicher zurueck.
    gameSavedRef.current = false;
    setPlayers([]); setRole(null); setMode(null); setMe(null); setSessionCode(null);
    setSwitchAsk(null);
    setProfileDirty(false); dirtyAtLoadRef.current = false; loadedAccRef.current = null; loadedFamRef.current = null;
    setSynced(true);     // ein neues Konto in derselben Sitzung muss gespeichert werden koennen
    go('cover');
  };
  // Zugangslink erneuern: der alte gilt danach nicht mehr. Der neue wird SOFORT
  // fest gespeichert, erst dann die Merkhilfe geraeumt.
  const rotateAccess = () => ACC.API.rotateSecret(account && account.id).then(neu => {
    useSecret(neu);
    ACC.STORE.patch({ secret: neu });
    ACC.PENDING.clear();
  });
  // Konto loeschen: erst auf dem Server, dann vergisst das Geraet alles.
  const deleteAccount = () => ACC.API.deleteAccount().then(() => { logout(); }).catch(e =>
    // Antwort verloren? Kennt der Server den Zugang nicht mehr, ist das Konto
    // weg — dann raeumt auch das Geraet, statt fuer immer "abgelehnt" zu melden.
    // (Gefragt wird nach dem KONTO, nicht nach dem Zugang: ein veralteter
    // Zugang wuerde sonst "geloescht" melden, waehrend das Konto weiterlebt.)
    ACC.API.getAccount(account && account.id).then(acc => { if (acc === null) { logout(); return; } throw e; }));
  // Eine fremde Runde aus dem eigenen Verlauf nehmen.
  const removeFromHistory = (g) => {
    setHistory(h => h.filter(x => x.id !== g.id));
    ACC.API.leaveGame(g.id).catch(() => {});
    go(histFrom || 'history');
  };
  // restore an existing account into THIS browser context (e.g. the home-screen
  // app) by pasting its personal link — bridges Safari ↔ installed app, which
  // keep separate storage on iOS. Accepts a full /m/<id> link or just the id.
  const restoreAccount = (raw) => {
    // Akzeptiert /m/#<geheimnis>, den alten /m/<nummer> und beides blank getippt.
    const m = String(raw || '').match(/\/m\/#?([^\/?#\s]+)/) || String(raw || '').match(/#([^\s]+)$/);
    let token = String(raw || '').trim();
    if (m) { try { token = decodeURIComponent(m[1]); } catch (e) { token = m[1]; } }
    if (!token) return Promise.reject(new Error('empty'));
    return ACC.API.resolveAccount(token).then(acc => {
      if (!acc || !acc.id) throw new Error('not found');
      useSecret(token);
      setAccount({ id: acc.id, name: acc.name || 'Spieler', color: acc.color || AV[0], kind: acc.kind || 'master', avatar: acc.avatar || '', created: acc.created || Date.now() });
      setFamily(healFam(Array.isArray(acc.crew) ? acc.crew : []));
      setActiveSession(as => (as && String(as.accountId || '') === String(acc.id)) ? as : null); // fremdes Lesezeichen verwerfen
      setProfileDirty(false); dirtyAtLoadRef.current = false; loadedAccRef.current = null; loadedFamRef.current = null;
      setSynced(true);
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
    case 'settings': view = <ACC.SettingsScreen account={account || { name: 'Gast', color: AV[0] }} setAccount={setAccount} family={family} setFamily={setFamily} onMemberPhoto={setCrewPhoto} onRotate={rotateAccess} onDeleteAccount={deleteAccount} go={go} logout={logout} defaultMode={defaultMode} setDefaultMode={setDefaultMode} autoCrew={autoCrew} setAutoCrew={setAutoCrew} companion={isCompanion} openLegal={openLegal} openFeedback={openFeedback} openFaq={openFaq} />; break;
    case 'joinCode': view = <OB.JoinCodeScreen go={go} onJoined={enterSession} back={account ? 'home' : 'cover'} />; break;
    case 'history': view = <ACC.HistoryScreen history={history} go={go} openGame={openGame} account={account} family={family} />; break;
    case 'historyDetail': view = <ACC.HistoryDetailScreen game={history.find(g => g.id === histId)} go={go} from={histFrom} onSave={isCompanion ? undefined : saveEditedGame} onRemove={removeFromHistory} account={account} family={family} nameOf={nameOf} />; break;
    case 'scan': view = <OB.ScanScreen go={go} express={t.onboardingFlow === 'express'} venue={venue} />; break;
    case 'welcome': view = <OB.RoleScreen go={go} role={role} setRole={setRole} back={scanEnabled ? 'scan' : 'cover'} venue={venue} onVenues={openVenues} />; break;
    case 'players': view = <OB.PlayersScreen go={go} players={players} setPlayers={setPlayers} role={role} family={family} />; break;
    case 'invite': view = <OB.InviteScreen go={go} players={players} mode={mode} sessionCode={sessionCode} setSessionCode={setSessionCode} venueName={venue ? venue.name : ''} holes={venue ? venue.holes : undefined} back={inviteFrom} resume={inviteFrom !== 'players'} />; break;
    case 'switch': view = switchAsk
      ? <SwitchScreen from={account} to={switchAsk.acc} onSwitch={() => switchTo(switchAsk.acc, switchAsk.token, switchAsk.bookmark)} onStay={() => { setSwitchAsk(null); go(account ? 'home' : 'cover'); }} />
      : <OB.CoverScreen go={go} account={account} scanEnabled={scanEnabled} onStart={startGame} companion={isCompanion} venue={venue} onVenues={openVenues} viaQr={entryViaQr} />; break;
    case 'join': view = <OB.JoinScreen go={go} players={players} setMe={setMe} sessionCode={sessionCode} account={account} />; break;
    case 'express': view = <GAME.ExpressSetup go={go} role={role} setRole={setRole} mode={mode} setMode={setMode} players={players} setPlayers={setPlayers} family={family} />; break;
    case 'game': view = <GAME.GameScreen players={players} setPlayers={setPlayers} go={go} voiceOn={t.voiceInput} showTotals={t.showTotals} openResults={openResults} sessionCode={sessionCode} me={me} onHome={account && sessionCode ? restart : null} onLost={() => { setActiveSession(null); restart(); }} account={account} family={family} venueName={venue ? venue.name : ''} nameOf={nameOf} />; break;
    case 'results': view = <GAME.ResultsScreen players={players} go={go} restart={restart} account={account} family={family} onSave={saveGame} onCompanionSave={saveCompanionGame} final={resultsFinal} onFinish={() => openResults(true)} joined={me != null} sessionCode={sessionCode} me={me} onLeaveJoined={leaveJoined} venueName={venue ? venue.name : ''} nameOf={nameOf}
      /* Einladen nur für den Gastgeber einer geteilten Runde (me == null) und nur im Zwischenstand */
      onInvite={sessionCode && me == null && !resultsFinal ? () => { setInviteFrom('results'); go('invite'); } : null} />; break;
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

// Ein fremder persoenlicher Link auf einem Geraet, das schon ein Konto hat.
function SwitchScreen({ from, to, onSwitch, onStay }) {
  const { Screen, AppHeader, Body, Avatar, Btn } = UI;
  const [copied, setCopied] = useAS(false);
  const [copyErr, setCopyErr] = useAS(false);
  const copy = () => {
    const ja = () => { setCopyErr(false); setCopied(true); setTimeout(() => setCopied(false), 1800); };
    const nein = () => setCopyErr(true);
    try { navigator.clipboard.writeText(ACC.accountLink()).then(ja, nein); } catch (e) { nein(); }
  };
  const wer = (from && from.name) || 'dein Konto';
  return (
    <Screen>
      <AppHeader title="Konto wechseln?" />
      <Body>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px' }}>
          <Avatar name={to.name || 'Spieler'} color={to.color} size={44} src={to.avatar} />
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Der Link gehört zu</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{to.name || 'Spieler'}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', marginTop: 16 }}>
          Auf diesem Gerät bist du als <b>{wer}</b> angemeldet. Wechselst du, vergisst das Gerät dieses Konto — zurück kommst du <b>nur mit seinem Zugangslink</b>.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <Btn kind="primary" onClick={onStay}>Bei {wer} bleiben</Btn>
          <button onClick={copy} style={{ height: 50, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--accent)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{copied ? '✓ Link kopiert' : copyErr ? 'Kopieren hat nicht geklappt' : `Link von ${wer} kopieren`}</button>
          <button onClick={onSwitch} style={{ height: 50, borderRadius: 14, border: '1px solid var(--line)', background: 'transparent', color: 'var(--bad)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Zu {to.name || 'diesem Konto'} wechseln</button>
        </div>
      </Body>
    </Screen>
  );
}

// Fehlergrenze. Ohne sie leert ein einziger Anzeigefehler die ganze App: der
// Bildschirm bleibt weiss, und in einer Live-Runde bei jedem Abgleich erneut.
// Nachgestellt am 22.11.2026 mit einem Namen, der eine Zahl war. Der Server
// prueft Eingaben inzwischen — das hier ist das Netz darunter.
class Fehlergrenze extends React.Component {
  constructor(props) { super(props); this.state = { kaputt: false }; }
  static getDerivedStateFromError() { return { kaputt: true }; }
  componentDidCatch(err) { try { console.error('plonky:', err); } catch (e) {} }
  render() {
    if (!this.state.kaputt) return this.props.children;
    // "Zur Startseite" vergisst das Lesezeichen der laufenden Runde: steckt der
    // Fehler in deren Daten, kaeme man sonst sofort wieder hier an. Konto,
    // Zugang und Verlauf bleiben unberuehrt.
    const heim = () => {
      try {
        const d = JSON.parse(localStorage.getItem('plonky.v1') || '{}');
        d.activeSession = null;
        localStorage.setItem('plonky.v1', JSON.stringify(d));
      } catch (e) {}
      location.href = '/';
    };
    const knopf = { width: '100%', height: 48, borderRadius: 14, fontFamily: 'var(--font)', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: 'var(--ground, #F4F4F1)', fontFamily: 'var(--font)', color: 'var(--ink, #191A15)' }}>
        <div style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Da ist etwas schiefgelaufen.</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink-2, #53605A)', marginBottom: 22 }}>Deine Runden und dein Konto sind nicht betroffen.</div>
          <button onClick={() => location.reload()} style={{ ...knopf, border: 'none', background: 'var(--accent, #15A35A)', color: '#fff', marginBottom: 10 }}>Neu laden</button>
          <button onClick={heim} style={{ ...knopf, border: '1px solid var(--line, #E5EAE5)', background: 'var(--card, #fff)', color: 'var(--ink, #191A15)' }}>Zur Startseite</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<Fehlergrenze><App /></Fehlergrenze>);
setTimeout(() => window.__fitPhone && window.__fitPhone(), 80);
