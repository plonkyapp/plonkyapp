import base64
import collections
import contextlib
import datetime
import hashlib
import hmac
import html
import ipaddress
import json
import os
import re
import secrets
import sys
import threading
import time
import zlib
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, abort, g, jsonify, make_response, redirect, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy

APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Obergrenze für den Rumpf einer Anfrage. Fotos reisen als base64 im JSON mit,
# und ohne Grenze kann jeder beliebig grosse Daten in die Datenbank schieben.
# 2 MB ist grosszügig: ein Foto misst rund 10 KB, eine volle Runde deutlich
# unter 100 KB. Darüber antwortet Flask von selbst mit 413.
MAX_BODY_MB = 2

# Files the static layer is allowed to serve. Everything else (e.g. .py/.sh)
# returns 404 so the backend source is never exposed.
# Alte Entwürfe und Projektdateien liegen im selben Ordner wie index.html und
# haben passende Endungen — sie würden also ausgeliefert. Sie sind keine
# Geheimnisse, aber im Web haben sie nichts verloren: zwei Prototypen vom Mai
# und die Liste der eingesetzten Pakete samt Versionen.
BLOCKED_FILES = {"requirements.txt", "plonky.html", "plonky v1 (mit scan).html"}

# Seit dem Audit vom 22.11.2026 wird nach PFAD ausgeliefert, nicht nach Endung.
# Vorher genuegte eine passende Endung irgendwo im Ordner: lokal lag damit die
# vollstaendige Sicherung der Live-Datenbank (z_backup/…json) abrufbar da,
# ebenso .claude/ und der Inhalt des virtualenv.
STATIC_ROOT_FILES = {"manifest.json", "venues.json", "ios-frame.jsx", "tweaks-panel.jsx"}
STATIC_DIRS = ("src/", "assets/", "vendor/")
ALLOWED_EXT = {
    ".jsx", ".js", ".css", ".json",
    ".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp",
    ".woff", ".woff2",
}


def database_url():
    """Verbindungsadresse — mit AUSDRUECKLICH genanntem Treiber.

    render liefert die Adresse als postgres:// ; SQLAlchemy braucht postgresql://.
    Entscheidend ist aber das Stueck dahinter: ohne Treibernamen sucht sich
    SQLAlchemy selbst einen aus — und diese Wahl hat sich geaendert.

        SQLAlchemy 2.0:  postgresql://  ->  psycopg2
        SQLAlchemy 2.1:  postgresql://  ->  psycopg   (psycopg3!)

    Beim Sprung auf 2.1 startete die App deshalb nicht mehr: "No module named
    'psycopg'". Gegen SQLite faellt das nicht auf, nur gegen PostgreSQL.
    Deshalb steht der Treiber jetzt im Klartext in der Adresse. Ein kuenftiger
    Wechsel auf psycopg3 ist dann eine bewusste Entscheidung an genau dieser
    Stelle und keine stille Nebenwirkung einer Aktualisierung.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        return "sqlite:///" + os.path.join(APP_DIR, "plonky_local.db")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Nur ergaenzen, wenn kein Treiber dasteht — "postgresql+psycopg://" (falls
    # wir spaeter umsteigen) bleibt unangetastet.
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_BODY_MB * 1024 * 1024
app.config["SQLALCHEMY_DATABASE_URI"] = database_url()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "pool_recycle": 300}
if not app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite"):
    # gunicorn laeuft mit 24 Threads (gunicorn.conf.py): genug Verbindungen,
    # und lieber nach 10 s eine Absage als ein Thread, der ewig wartet.
    app.config["SQLALCHEMY_ENGINE_OPTIONS"].update({"pool_size": 10, "max_overflow": 14, "pool_timeout": 10})

db = SQLAlchemy(app)

# SQLite prueft Fremdschluessel nur auf ausdruecklichen Wunsch. Ohne das blieben
# lokal geloeschte Schlaege als Waisen liegen und tauchten bei der naechsten
# Zeile mit derselben Nummer wieder auf — lokale Tests zeigten dann etwas
# anderes als PostgreSQL in der Produktion.
if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite"):
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    @event.listens_for(Engine, "connect")
    def _sqlite_fk(dbapi_conn, _record):
        try:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
        except Exception:
            pass


class Account(db.Model):
    __tablename__ = "account"
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False, default="")
    color = db.Column(db.String, nullable=False, default="")
    crew = db.Column(db.Text, nullable=False, default="[]")  # JSON: [{id,name,color,avatar}]
    kind = db.Column(db.String, nullable=False, default="master")  # "master" | "companion"
    avatar = db.Column(db.Text, nullable=False, default="")  # small base64 photo (data URL) or ""
    # Der Zugang, getrennt vom Ausweis. Bis 22.11.2026 war die Konto-Nummer
    # beides zugleich — und sie wird im Mehrspieler-Betrieb an alle Mitspieler
    # verteilt, damit Fotos live aufgeloest werden koennen. Damit konnte jeder
    # Mitspieler das Profil lesen UND ueberschreiben.
    #
    # Gespeichert wird nur der SHA-256-Abdruck: wer die Datenbank in die Haende
    # bekommt, hat damit noch keine Konten. NULL heisst "Konto aus der Zeit
    # davor" — der erste Schreibzugriff mit einem Geheimnis uebernimmt es.
    secret_hash = db.Column(db.String, nullable=True, index=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))


class Game(db.Model):
    __tablename__ = "game"
    id = db.Column(db.String, primary_key=True)
    account_id = db.Column(db.String, db.ForeignKey("account.id"), nullable=True, index=True)
    date = db.Column(db.BigInteger, nullable=True)
    venue = db.Column(db.String, nullable=False, default="")
    mode = db.Column(db.String, nullable=False, default="")
    code = db.Column(db.String, nullable=False, default="")  # round code, so participants see it too
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))
    players = db.relationship(
        "Player", backref="game", cascade="all, delete-orphan", passive_deletes=True
    )
    # accounts that took part but DON'T own this game (joiners/companions). The
    # host owns ONE shared record; participants reference it so a host edit is
    # seen by everyone instead of diverging per-account copies.
    participants = db.relationship(
        "GameParticipant", backref="game", cascade="all, delete-orphan", passive_deletes=True
    )


class GameParticipant(db.Model):
    __tablename__ = "game_participant"
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.String, db.ForeignKey("game.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = db.Column(db.String, nullable=False, index=True)


class Player(db.Model):
    __tablename__ = "player"
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.String, db.ForeignKey("game.id", ondelete="CASCADE"), nullable=False, index=True)
    ext_id = db.Column(db.String, nullable=True)
    account_id = db.Column(db.String, nullable=True, index=True)  # which account this player IS (resolve photo live by id)
    name = db.Column(db.String, nullable=False, default="")
    color = db.Column(db.String, nullable=False, default="")
    avatar = db.Column(db.Text, nullable=False, default="")  # snapshot photo: only a fallback when the account id is unknown
    scores = db.relationship(
        "Score", backref="player", cascade="all, delete-orphan", passive_deletes=True
    )


class Score(db.Model):
    __tablename__ = "score"
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey("player.id", ondelete="CASCADE"), nullable=False, index=True)
    hole = db.Column(db.Integer, nullable=False)
    strokes = db.Column(db.Integer, nullable=True)


class Session(db.Model):
    """A live, shared round. Devices poll it and patch scores in real time."""
    __tablename__ = "session"
    code = db.Column(db.String, primary_key=True)
    mode = db.Column(db.String, nullable=False, default="sequential")
    venue = db.Column(db.String, nullable=False, default="")
    data = db.Column(db.Text, nullable=False, default="{}")  # {"players":[{id,name,color,scores,claimed}]}
    rev = db.Column(db.Integer, nullable=False, default=0)  # bumped on every change for cheap polling
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))


class Trust(db.Model):
    """member hat mit eigenem Geraet und nachgewiesenem Konto an einer Runde
    von owner teilgenommen. Nur dann darf owner ihn spaeter als Teilnehmer
    einer gespeicherten Runde eintragen.

    Vorher konnte jeder, der eine Konto-Nummer kannte, diesem Konto beliebige
    Runden in den Verlauf setzen (Audit 22.11.2026) — die Teilnehmerliste kam
    ungeprueft aus dem Rumpf. Mit dieser Beziehung bleibt erhalten, was gewollt
    ist: die Runde, die der Vater fuer die Tochter eintraegt, erscheint auch bei
    ihr — aber erst, nachdem sie einmal selbst bei ihm beigetreten ist.
    """
    __tablename__ = "trust"
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.String, nullable=False, index=True)
    member_id = db.Column(db.String, nullable=False, index=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))
    __table_args__ = (db.UniqueConstraint("owner_id", "member_id", name="uq_trust_pair"),)


class Tombstone(db.Model):
    """Ein geloeschtes Konto bleibt geloescht.

    Ohne das legte ein zweites Geraet desselben Kontos — das von der Loeschung
    nichts weiss — das Konto beim naechsten Speichern einfach wieder an, samt
    Name, Foto und Crew. Gemerkt wird nur der Abdruck der Nummer, nichts
    Persoenliches.
    """
    __tablename__ = "tombstone"
    id_hash = db.Column(db.String, primary_key=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))


def _is_deleted(account_id):
    return db.session.get(Tombstone, _hash_secret("konto:" + str(account_id))) is not None


class Feedback(db.Model):
    """Player feedback. Read via the private inbox: /fb#<FEEDBACK_KEY> sets a
    session, then GET /fb/daten. Never a key in the query string."""
    __tablename__ = "feedback"
    id = db.Column(db.Integer, primary_key=True)
    rating = db.Column(db.Integer, nullable=True)  # 1=😞 2=😐 3=😍, or null
    message = db.Column(db.Text, nullable=False, default="")
    contact = db.Column(db.String, nullable=False, default="")  # optional email/handle
    name = db.Column(db.String, nullable=False, default="")
    account_id = db.Column(db.String, nullable=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))


# ══ Eingaben pruefen ═══════════════════════════════════════════════════════
# Bis 22.11.2026 speicherte der Server, was man ihm schickte — ohne Typ, Laenge
# oder Inhalt anzusehen. Nachgestellte Folgen:
#   - ein "Foto", das eine fremde Web-Adresse ist: die Browser der Mitspieler
#     laden sie, der Absender sieht IP und Zeitpunkt jedes Einzelnen
#   - dasselbe ueber eine "Farbe" wie url(https://…)
#   - eine Zahl als Name oder ein Objekt als Schlag in einer Live-Runde: das
#     Frontend rechnet name.trim() und der Bildschirm bleibt bei ALLEN weiss
#   - crew = [5]: das Admin-Dashboard antwortet mit 500
#
# Grundsatz: bereinigen statt abweisen. Ein einzelnes unbrauchbares Feld soll
# nicht die ganze Speicherung kosten — es faellt weg, der Rest kommt an.
# Die Grenzen sind an den echten Daten vom Sommer gemessen (laengster Name 9
# Zeichen, groesstes Foto 23'799, hoechster Schlag 19) und grosszuegig gesetzt.
MAX_NAME = 60
MAX_VENUE = 120
# Das Audit vom 22.11.2026 hat gezeigt, wie teuer grosszuegige Grenzen sind:
# mit 150'000 Zeichen pro "Foto" passten 13 davon in eine Runde von 1,95 MB,
# 40 solche Runden liessen sich in einer Sekunde ablegen, und ein einziger
# Abruf des Verlaufs trieb den Arbeitsspeicher von 107 auf 318 MB.
MAX_AVATAR = 40_000       # Zeichen der data-URL; das groesste echte Foto: 23'799
MAX_PLAYERS = 16          # pro Runde; bisheriges Maximum: 5
MAX_CREW = 30             # pro Konto; bisheriges Maximum: 4
MAX_GAMES = 300           # gespeicherte Runden pro Konto
MAX_GAMES_LISTED = 100    # so viele liefert der Verlauf hoechstens aus (die juengsten)
LIST_PHOTO_BUDGET = 1_500_000   # Zeichen Foto pro Verlaufs-Abruf; danach Initialen
ACCOUNTS_PER_LOOKUP = 25  # Sammelabfrage der Fotos
MAX_SESSION_BYTES = 400_000   # eine Live-Runde samt Fotos; die groesste echte: 47'194
SESSION_DAYS = 14         # danach wird eine Live-Runde geloescht
MAX_HOLE = 54             # die groesste Anlage im Verzeichnis hat 36 Bahnen
MAX_STROKES = 99
# \Z statt $: "$" laesst einen Zeilenumbruch am Ende durch.
_ID_RE = re.compile(r"[A-Za-z0-9_.\-]{1,80}\Z")
_HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\Z")
# Nur ein eingebettetes Bild. Keine http-Adresse, kein SVG (kann Skript tragen).
_AVATAR_RE = re.compile(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})\Z")
# Einsame Ersatzzeichen (halbe UTF-16-Paare) lassen sich nicht als UTF-8
# schreiben: eines davon in einem Crew-Namen hat das Dashboard lahmgelegt.
_SURROGATES = re.compile("[\ud800-\udfff]")
_MAGIC = {"jpeg": (b"\xff\xd8\xff",), "png": (b"\x89PNG\r\n\x1a\n",), "webp": (b"RIFF",)}


def _body():
    """Der Rumpf als Woerterbuch — sonst ein leeres. Eine Liste oder Zahl als
    JSON haette frueher bei .get() einen 500er ausgeloest."""
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


def _text(v, limit):
    """Text, sonst leer. NUL-Zeichen raus — PostgreSQL lehnt sie ab."""
    if not isinstance(v, str):
        return ""
    return _SURROGATES.sub("", v.replace("\x00", ""))[:limit]


def _ident(v):
    """Spieler- oder Crew-Kennung: kurzer Text oder Zahl. Das Frontend benutzt
    beides ('me', 'c17…', Date.now() + Math.random())."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v if v == v and abs(v) < 1e16 else None   # v == v schliesst NaN aus
    if isinstance(v, str) and 0 < len(v) <= 80 and "\x00" not in v and not _SURROGATES.search(v):
        return v
    return None


def _account_ref(v):
    """Konto- oder Spiel-Kennung: nur das enge Alphabet."""
    return v if isinstance(v, str) and _ID_RE.match(v) else None


def _color(v):
    return v if isinstance(v, str) and _HEX_RE.match(v) else ""


def _avatar(v):
    """Ein eingebettetes Bild — und zwar wirklich eines.

    Das Zeichenmuster allein genuegte nicht: 150'000 Buchstaben "A" galten als
    Foto. Jetzt muessen die ersten Bytes die Kennung des angegebenen Formats
    tragen. Das macht aus der Pruefung keinen Bildbetrachter, aber aus dem
    Fotofeld auch keinen freien Datenspeicher mehr.
    """
    if not isinstance(v, str) or not v or len(v) > MAX_AVATAR:
        return ""
    m = _AVATAR_RE.match(v)
    if not m:
        return ""
    try:
        head = base64.b64decode(m.group(2)[:24] + "=" * (-len(m.group(2)[:24]) % 4))
    except Exception:
        return ""
    return v if any(head.startswith(sig) for sig in _MAGIC[m.group(1)]) else ""


def _int(v, lo, hi):
    """Ganze Zahl im Bereich, sonst None. bool ist in Python ein int — raus."""
    if isinstance(v, bool):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    # isascii(): "²" besteht isdigit(), laesst int() aber scheitern.
    if isinstance(v, str) and v.isascii() and v.isdigit() and len(v) <= 4:
        v = int(v)
    if isinstance(v, int) and lo <= v <= hi:
        return v
    return None


def _scores(v):
    """{"1": 3, "2": 2, …} — nur ganze Bahnen, nur ganze Schlaege."""
    out = {}
    if not isinstance(v, dict):
        return out
    for k, strokes in list(v.items())[:MAX_HOLE]:
        hole = _int(k, 1, MAX_HOLE)
        st = _int(strokes, 0, MAX_STROKES)
        if hole is not None and st is not None:
            out[str(hole)] = st
    return out


def _crew(v):
    """Die Crew eines Kontos: Liste von Eintraegen mit festen Feldern.

    Uebernimmt zugleich die Foto-Regel von strip_crew_avatars(): ein Eintrag
    mit eigenem Konto traegt kein Foto — das gehoert zu jenem Konto.
    """
    out = []
    if not isinstance(v, list):
        return out
    for m in v[:MAX_CREW]:
        if not isinstance(m, dict):
            continue
        mid = _ident(m.get("id"))
        if mid is None:
            continue
        e = {"id": mid, "name": _text(m.get("name"), MAX_NAME), "color": _color(m.get("color"))}
        linked = _account_ref(m.get("accountId") or m.get("account_id"))
        if linked:
            e["accountId"] = linked
        elif _avatar(m.get("avatar")):
            e["avatar"] = _avatar(m.get("avatar"))
        out.append(e)
    return out


def _dicts(v):
    """Aus irgendetwas Gespeichertem die Woerterbuecher einer Liste herausholen.
    Fuer das Dashboard: es soll an einem kaputten Altbestand nicht sterben."""
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def _s(v):
    return v.strip() if isinstance(v, str) else ""


def strip_crew_avatars(crew):
    """A crew entry for someone with their OWN account must not carry a photo.

    Their photo belongs to their account and is resolved from there; a copy in
    someone else's crew list would survive them deleting it on their own device.
    A member without an account has no such home, so their entry keeps the photo —
    that entry IS the one place it lives.
    """
    out = []
    for m in crew or []:
        if isinstance(m, dict) and (m.get("accountId") or m.get("account_id")) and m.get("avatar"):
            m = dict(m, avatar="")
        out.append(m)
    return out


def snapshot_avatar(account_id, avatar):
    """A person's photo lives in ONE place — Account.avatar, resolved by id.

    A copy stored alongside a game or a round would outlive a delete on the
    account, so "Foto entfernen" could never be honest. Only a player WITHOUT an
    account has nowhere else to keep one, so only they get a snapshot.
    """
    return "" if account_id else (avatar or "")


# Alphabet ohne 0/O/1/I — stammt aus der Zeit, als der Code abgetippt wurde.
# Beitritt läuft heute nur noch über QR/Link, deshalb darf er lang sein.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 16  # 32^16 ≈ 80 Bit — Durchprobieren ist damit aussichtslos, nicht bloss mühsam


def new_session_code():
    # secrets statt random: der Code ist der einzige Schutz einer laufenden Runde,
    # und der Mersenne-Twister ist aus ein paar Ausgaben rekonstruierbar.
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        if db.session.get(Session, code) is None:
            return code


# ── Ausweis und Zugang: die Trennung ───────────────────────────────────────
# Konto-Nummer (acc.id)  = AUSWEIS. Darf an Mitspieler gehen; sie loesen damit
#                          Fotos auf. Oeffnet nichts.
# Geheimnis (X-Plonky-Secret) = ZUGANG. Bleibt auf dem Geraet, wandert nur ueber
#                          den persoenlichen Link, und der traegt es im
#                          Adress-Anker (#) — der wird nie an den Server
#                          geschickt und steht deshalb in keinem Protokoll.
SECRET_HEADER = "X-Plonky-Secret"


def _hash_secret(secret):
    return hashlib.sha256(str(secret).encode()).hexdigest() if secret else None


def _given_secret():
    return request.headers.get(SECRET_HEADER) or ""


def _secret_usable(secret):
    """Taugt das als Zugang fuer ein NEUES Konto? Das Frontend schickt 64
    Hex-Zeichen (256 Bit). Ein kurzes Geheimnis waere ratbar — und weil der
    Aufrufer ueber den Abdruck gefunden wird, haette ein erratenes Geheimnis
    das ganze Konto geoeffnet."""
    return isinstance(secret, str) and 32 <= len(secret) <= 200


def _caller():
    """WER ruft hier an? Die Antwort kommt ausschliesslich aus dem Geheimnis.

    Das ist die wichtigste Funktion dieser Datei. Bis 22.11.2026 abends wurde
    an zwei Stellen unterschiedlich gefragt: das Geheimnis gegen das Konto aus
    dem RUMPF geprueft, das Recht aber gegen das Konto aus der KOPFZEILE. Wer
    sein eigenes Geheimnis schickte und dazu eine fremde Konto-Nummer in die
    Kopfzeile schrieb, durfte fremde Runden ueberschreiben. Nachgestellt: aus
    "Echte Anlage" mit 2 Schlaegen wurde "GEFAELSCHT" mit 99.

    Lehre: die Identitaet EINMAL bestimmen, danach nur noch diese benutzen.
    Eine Konto-Nummer aus einer Kopfzeile ist kein Nachweis — sie steht in
    jeder Runde, in der man mitgespielt hat.
    """
    secret = _given_secret()
    if not secret:
        return None
    return Account.query.filter_by(secret_hash=_hash_secret(secret)).first()


def _require_caller(account_id=None):
    """Aufrufer bestimmen; mit account_id zusaetzlich: muss dieses Konto sein."""
    acc = _caller()
    if acc is None:
        abort(403)
    if account_id is not None and str(acc.id) != str(account_id):
        abort(403)
    return acc


def account_public(acc):
    """Was Mitspieler sehen duerfen: genug fuer Name, Farbe und Foto.

    Bewusst OHNE crew — die Liste der eigenen Leute geht niemanden sonst etwas
    an — und ohne alles, was nach Zugang aussieht.
    """
    # Auch beim AUSLIEFERN geprueft, nicht nur beim Speichern: was vor der
    # Pruefschicht in die Datenbank kam, darf trotzdem keinen Browser erreichen.
    return {"id": acc.id, "name": _text(acc.name, MAX_NAME), "color": _color(acc.color),
            "avatar": _avatar(acc.avatar), "kind": acc.kind if acc.kind in ("master", "companion") else "master"}


def account_to_dict(acc):
    try:
        crew = json.loads(acc.crew or "[]")
    except (ValueError, TypeError):
        crew = []
    return dict(account_public(acc), crew=_crew(crew), created=acc.created_at)


def session_to_dict(s, full=False):
    """full=False laesst die Fotos weg. Der Abgleich laeuft alle drei Sekunden
    auf jedem Geraet; mit Fotos waren das bei fuenf Spielern rund 60 KB pro
    Abruf, also ueber 70 MB mobile Daten in einer Stunde. Das Frontend holt die
    Fotos beim Beitreten und danach nur noch gelegentlich (?full=1)."""
    try:
        payload = json.loads(s.data or "{}")
    except (ValueError, TypeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    # Jeder Spieler geht nur in fester, gepruefter Form hinaus. Eine Zahl als
    # Name oder ein Objekt als Schlag hat frueher bei allen Mitspielern die
    # Anzeige geworfen — egal, wie es in die Runde gekommen ist.
    players = []
    for p in _dicts(payload.get("players")):
        pid = _ident(p.get("id"))
        if pid is None:
            continue
        players.append({
            "id": pid,
            "name": _text(p.get("name"), MAX_NAME),
            "color": _color(p.get("color")),
            "scores": _scores(p.get("scores")),
            "claimed": bool(p.get("claimed")),
            "host": bool(p.get("host")),
            # Avatars travel with the round so every device shows each player's
            # current photo (a joiner pushes their own on claim). ~10 KB each.
            "avatar": _avatar(p.get("avatar")) if full else "",
            "account_id": _account_ref(p.get("account_id")),
        })
    return {
        "code": s.code,
        "mode": s.mode,
        "venue": s.venue,
        "rev": s.rev,
        "finished": bool(payload.get("finished", False)),  # host pressed "Spiel beenden"
        "holes": _int(payload.get("holes"), 1, MAX_HOLE),
        "players": players,
    }


def game_to_dict(game, viewer=None):
    """Eine einzelne Runde (nach dem Speichern). Der Verlauf baut seine Liste
    in list_games() selbst — schlank, ohne ORM-Objekte fuer jeden Schlag."""
    return {
        "id": game.id,
        # Gehoert die Runde dem, der sie gerade ansieht? Ein Teilnehmer darf
        # Schlaege korrigieren und sich austragen, mehr nicht.
        "mine": viewer is None or str(game.account_id) == str(viewer),
        "date": game.date,
        "venue": game.venue,
        "mode": game.mode,
        "code": game.code or "",
        "participants": [gp.account_id for gp in game.participants],
        "players": [
            {
                "id": p.ext_id or p.id,
                "account_id": p.account_id,
                "name": _text(p.name, MAX_NAME),
                "color": _color(p.color),
                "avatar": _avatar(p.avatar),
                "scores": {str(s.hole): s.strokes for s in p.scores},
            }
            for p in game.players
        ],
    }


# ══ Flutbremse ════════════════════════════════════════════════════════════
# Runden, Konten und Feedback lassen sich ohne Anmeldung anlegen — das ist
# gewollt, die App hat kein Login. Bis 22.11.2026 bremste aber nichts: 40
# Runden in Folge, 40 angenommen, jede Anfrage bis 2 MB.
#
# Das ist eine SCHWELLE, keine Mauer: sie haelt ein einfaches Skript von einer
# Adresse auf, nicht einen verteilten Angriff. Die Grenzen sind bewusst weit —
# an einer Anlage teilen sich viele Handys dieselbe Adresse (WLAN, Mobilfunk).
#
# Woher die Adresse des Absenders kommt, ist heikel. Vor der App sitzt das
# Cloudflare von render (nicht Michaels — die Nameserver liegen bei tophost);
# verlaesslich ist nur dessen Kopfzeile CF-Connecting-IP. X-Forwarded-For kann
# der Absender selbst vorbelegen. Fehlt die verlaessliche Angabe, wird NICHT
# gebremst: lieber keine Bremse als eine, die alle Nutzer fuer einen einzigen
# haelt und die App fuer alle sperrt.
#
# Im Arbeitsspeicher, also pro Prozess. gunicorn laeuft hier mit einem Worker.
# Abschalten ohne Deploy: Umgebungsvariable RATE_LIMIT=off.
RATE_OFF = (os.environ.get("RATE_LIMIT") or "").strip().lower() in ("off", "0", "false", "aus")

# ── Wie die Bremse denkt ──────────────────────────────────────────────────
# Die erste Fassung zaehlte nur nach ADRESSE. Das zweite Audit hat gezeigt, was
# das auf einer Minigolf-Anlage heisst: dort teilen sich alle ein WLAN, also
# eine Adresse — und ein einziges Geraet, das Unfug treibt, sperrte alle
# anderen fuer zehn Minuten aus.
#
# Jetzt in zwei Stufen:
#   1. Jede Adresse hat ein grosszuegiges Kontingent. Solange es reicht, wird
#      nicht weiter gefragt.
#   2. Ist es aufgebraucht, zaehlt ein NACHWEIS: wer den Gastgeber- oder
#      Platz-Schluessel der Runde oder den Zugang zu einem Konto vorlegt,
#      bekommt ein eigenes Kontingent. Wer nichts vorlegt, wartet.
# Wer in seiner Runde sitzt, spielt also weiter, egal was nebenan passiert.
#
# Was das NICHT ist: ein Schutz gegen einen verteilten Angriff aus vielen
# Netzen. Den faengt Cloudflare vor dem Server ab — oder niemand.
RULES = {                              # Eimer: (hoechstens, in Sekunden)
    "write_ip": (4000, 600),           # Schreibzugriffe je Adresse
    "write_key": (1500, 600),          # ... je Nachweis, wenn die Adresse voll ist
    "read_ip": (15000, 600),           # Lesezugriffe auf /api/ je Adresse (25/s)
    "session_ip": (30, 600),           # neue Live-Runden je Adresse
    "session_ip_day": (300, 86400),
    "session_key": (10, 600),          # ... je Konto, wenn die Adresse voll ist
    "account_ip": (40, 600),           # NEUE Konten je Adresse (Aendern zaehlt nicht)
    "feedback_ip": (10, 600),
    "list_key": (60, 600),             # Verlauf je Konto
    # Bytes statt Anfragen — nur fuer Anfragen ueber BIG_BODY. Schlaege und
    # anderes Kleines bremst das nie.
    "bytes_ip": (25 * 1024 * 1024, 600),
    "bytes_ip_day": (100 * 1024 * 1024, 86400),
    "bytes_key": (10 * 1024 * 1024, 600),
    "bytes_key_day": (30 * 1024 * 1024, 86400),
    "bytes_all": (400 * 1024 * 1024, 3600),   # alle zusammen
}
BIG_BODY = 4096
WIDE_FACTOR = 5        # ein IPv6-/48 (ein Anschluss mit vielen /64) bekommt das Fuenffache
_BUCKETS = {}
_RATE_LOCK = threading.Lock()   # gunicorn laeuft mit Threads


def _ip_keys():
    """Die Eimer-Schluessel dieses Absenders: [(schluessel, faktor)].

    IPv6 wird als Zahl gelesen, nicht als Text zerlegt: '2001:db8::5:1' und
    '2001:db8:0:0:5::1' sind dieselbe Adresse, und ein Anschluss hat ein ganzes
    /64 (oft ein /56 oder /48) — sonst waere jede der Adressen darin ein
    eigener Eimer.
    """
    raw = (request.headers.get("CF-Connecting-IP") or "").strip()
    if not raw:
        if request.headers.get("X-Forwarded-For"):
            return []          # hinter einem Proxy, aber ohne verlaessliche Angabe
        raw = request.remote_addr or ""   # direkt angesprochen (lokale Entwicklung)
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return []
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return [(str(ip.ipv4_mapped), 1)]
        n = int(ip)
        return [("6:%x" % (n >> 64), 1), ("6w:%x" % (n >> 80), WIDE_FACTOR)]
    return [(str(ip), 1)]


def _client_ip():
    k = _ip_keys()
    return k[0][0] if k else None


def _prune(now):
    """Nie unbegrenzt wachsen. Erst Abgelaufenes raus; reicht das nicht, alles —
    lieber kurz gar nicht bremsen als den Speicher volllaufen lassen."""
    if len(_BUCKETS) <= 20000:
        return
    for k in [k for k, v in _BUCKETS.items() if not v or v[-1][0] <= now - 86400]:
        _BUCKETS.pop(k, None)
    if len(_BUCKETS) > 50000:
        _BUCKETS.clear()


def _room(key, limit, window, amount, now):
    q = _BUCKETS.get(key)
    if q is None:
        return amount <= limit
    while q and q[0][0] <= now - window:
        q.popleft()
    return sum(a for _, a in q) + amount <= limit


def _book(key, amount, now):
    q = _BUCKETS.get(key)
    if q is None:
        _prune(now)
        q = _BUCKETS[key] = collections.deque()
    # Viele kleine Buchungen derselben Sekunde zusammenfassen — sonst waechst
    # die Schlange eines Tages-Eimers mit jeder Anfrage.
    if q and now - q[-1][0] < 1.0:
        q[-1] = (q[-1][0], q[-1][1] + amount)
    else:
        q.append((now, amount))


def _take_all(keys, amount=1):
    """keys: [(schluessel, limit, fenster)]. Passt 'amount' in ALLE? Dann in
    allen verbuchen — sonst in keinem."""
    now = time.time()
    with _RATE_LOCK:
        for key, limit, window in keys:
            if not _room(key, limit, window, amount, now):
                return False
        for key, _limit, _window in keys:
            _book(key, amount, now)
        return True


def _take_ip(*rules, amount=1):
    """Kontingent der Adresse. Ohne erkennbare Adresse wird nicht gebremst."""
    if RATE_OFF:
        return True
    keys = []
    for ipk, factor in _ip_keys():
        for rule in rules:
            limit, window = RULES[rule]
            keys.append(((rule, ipk), limit * factor, window))
    return _take_all(keys, amount) if keys else True


def _take_key(*rules, amount=1):
    """Kontingent eines Nachweises. Letztes Argument der rules ist der Nachweis."""
    *names, proof = rules
    if RATE_OFF:
        return True
    return _take_all([((r, proof), RULES[r][0], RULES[r][1]) for r in names], amount)


def _proof():
    """Was weist diese Anfrage nach? Ein kurzer Abdruck — oder ''.

    Wird nur gefragt, wenn das Kontingent der Adresse aufgebraucht ist; dann
    kostet es einen Blick in die Datenbank. Gilt:
      - der Gastgeber- oder ein Platz-Schluessel genau DIESER Runde
      - der Zugang zu einem Konto
    """
    if hasattr(g, "plonky_proof"):
        return g.plonky_proof
    proof = ""
    try:
        parts = request.path.split("/")
        if request.path.startswith("/api/session/") and len(parts) > 3:
            sess = db.session.get(Session, parts[3].upper())
            if sess is not None:
                roh = json.loads(sess.data or "{}")
                if isinstance(roh, dict):
                    hk, sk = _round_key(HOST_HEADER), _round_key(SLOT_HEADER)
                    if hk and roh.get("host_hash") and hmac.compare_digest(str(roh.get("host_hash")), _hash_secret(hk)):
                        proof = "h:" + _hash_secret(hk)[:24]
                    elif sk:
                        kh = _hash_secret(sk)
                        if any(isinstance(x, dict) and x.get("key_hash") == kh for x in (roh.get("players") or [])):
                            proof = "s:" + kh[:24]
        if not proof:
            acc = _caller()
            if acc is not None:
                proof = "a:" + str(acc.id)
    except Exception:
        proof = ""
    finally:
        db.session.rollback()      # nichts festhalten; die Route liest selbst neu
    g.plonky_proof = proof
    return proof


# ── Notbremse fuer die Datenbank ──────────────────────────────────────────
# Alles oben bremst, wie SCHNELL jemand etwas ablegen kann. Das hier begrenzt,
# wie VIEL insgesamt liegen darf: ist die Datenbank groesser als die Schwelle,
# nimmt die App keine grossen Anfragen (Fotos, ganze Runden) mehr an. Schlaege
# gehen weiter. Schwelle ueber die Umgebungsvariable DB_SOFT_LIMIT_MB.
DB_SOFT_LIMIT_MB = int(os.environ.get("DB_SOFT_LIMIT_MB") or 600)
_DB_SIZE = {"t": 0.0, "mb": 0.0, "warned": 0.0}


def _db_mb():
    now = time.time()
    if now - _DB_SIZE["t"] > 120:
        _DB_SIZE["t"] = now
        try:
            if db.engine.dialect.name == "postgresql":
                from sqlalchemy import text
                n = db.session.execute(text("select pg_database_size(current_database())")).scalar()
                _DB_SIZE["mb"] = float(n or 0) / 1048576.0
        except Exception:
            pass
        finally:
            db.session.rollback()
        if _DB_SIZE["mb"] > DB_SOFT_LIMIT_MB * 0.6 and now - _DB_SIZE["warned"] > 6 * 3600:
            _DB_SIZE["warned"] = now
            notify("⚠️ plonky-Datenbank: %d MB von %d MB" % (_DB_SIZE["mb"], DB_SOFT_LIMIT_MB))
    return _DB_SIZE["mb"]


# ── Eins nach dem anderen ─────────────────────────────────────────────────
# "Gibt es das schon? Nein — dann anlegen" ist mit Threads ein Wettlauf: zwei
# gleichzeitige Anfragen sehen beide "nein". Ein Satz Sperren, nach Schluessel
# verteilt; immer in derselben Reihenfolge genommen, damit sich nie zwei
# gegenseitig blockieren. Reicht, solange EIN Prozess laeuft (gunicorn.conf.py:
# workers = 1). Dahinter faengt die Datenbank selbst den Rest ab (eindeutige
# Schluessel, siehe _db_conflict).
_STRIPES = [threading.Lock() for _ in range(64)]


@contextlib.contextmanager
def _serial(*keys):
    idx = sorted({zlib.crc32(str(k).encode()) % len(_STRIPES) for k in keys if k})
    for i in idx:
        _STRIPES[i].acquire()
    try:
        yield
    finally:
        for i in reversed(idx):
            _STRIPES[i].release()


# Groessengrenze je Route. Gemessen an den echten Daten vom Sommer: die groesste
# Runde hatte 47 KB, ein Schlag ist ein paar Bytes. Die allgemeine Grenze (2 MB)
# gilt nur noch dort, wo keine engere steht.
_SMALL = 8 * 1024
BODY_CAPS = (
    ("/api/feedback", 20 * 1024),
    ("/api/account/resolve", _SMALL),
    ("/api/account/rotate", _SMALL),
    ("/api/account", 400 * 1024),   # Profil samt Crew mit Fotos
    ("/api/games", 400 * 1024),     # eine gespeicherte Runde
    ("/api/session", 400 * 1024),   # Anlegen und Spielerliste
    ("/admin", _SMALL),
    ("/fb", _SMALL),
)
# Was im Pfad als Kennung stehen darf. Ein NUL-Zeichen dort endete auf
# PostgreSQL in einem 500.
_PATH_ID_RE = re.compile(r"[A-Za-z0-9_.~\-]{1,200}\Z")


def _too_many(text="zu viele Anfragen"):
    resp = jsonify({"error": text})
    resp.status_code = 429
    resp.headers["Retry-After"] = "600"
    return resp


def _body_cap(path):
    if path.startswith("/api/session/") and path.rsplit("/", 1)[-1] in ("score", "leave", "finish"):
        return _SMALL
    if path.startswith("/api/session/") and path.endswith("/claim"):
        return 60 * 1024            # traegt hoechstens ein Foto
    if path.startswith("/api/games/"):
        return _SMALL
    for prefix, c in BODY_CAPS:
        if path.startswith(prefix):
            return c
    return app.config["MAX_CONTENT_LENGTH"]


@app.before_request
def guard_requests():
    # Nur was eine echte Route trifft, zaehlt. Im Audit reichten 1500 Anfragen
    # an eine Adresse, die es gar nicht gibt, um einem ganzen WLAN das
    # Eintragen von Schlaegen zu sperren.
    if request.url_rule is None:
        return None
    path = request.path
    # Kennungen im Pfad (Konto, Runde, Spiel): nur harmlose Zeichen. Die
    # App-Seite selbst und die Dateien haben eigene Regeln.
    if request.endpoint not in ("index", "static_files"):
        for v in (request.view_args or {}).values():
            if not _PATH_ID_RE.match(str(v)):
                abort(404)
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        if path.startswith("/api/") and not _take_ip("read_ip"):
            return _too_many()
        return None

    cap = _body_cap(path)
    try:
        request.max_content_length = cap   # pro Anfrage setzbar seit Flask 3.1
    except AttributeError:
        pass
    # Eine ANGEKUENDIGTE Laenge ueber der Grenze: sofort ablehnen, nichts
    # verbuchen. Im Audit reichten 113 Anfragen, die 25 MB bloss ankuendigten
    # und nichts schickten, um allen das Schreiben fuer eine Stunde zu sperren.
    if (request.content_length or 0) > cap:
        abort(413)
    # Gezaehlt wird, was wirklich ANKAM. (Wirft selbst 413, wenn ein Rumpf ohne
    # Laengenangabe die Grenze ueberschreitet.)
    n = len(request.get_data(cache=True))
    if RATE_OFF:
        return None

    # Stufe 1: die Adresse. Stufe 2: der Nachweis.
    if not _take_ip("write_ip"):
        if not _proof() or not _take_key("write_key", _proof()):
            return _too_many()
    if n > BIG_BODY:
        if not _take_ip("bytes_ip", "bytes_ip_day", amount=n):
            if not _proof() or not _take_key("bytes_key", "bytes_key_day", _proof(), amount=n):
                return _too_many()
        if not _take_key("bytes_all", "*", amount=n):
            return _too_many()
        if _db_mb() > DB_SOFT_LIMIT_MB:
            return _too_many("Speicher voll")
    return None


def _db_conflict(e):
    """Zwei Anfragen wollten gleichzeitig dasselbe anlegen und die Datenbank
    hat die zweite abgewiesen: das ist ein Konflikt (409), kein Serverfehler."""
    db.session.rollback()
    resp = jsonify({"error": "conflict"})
    resp.status_code = 409
    return resp


def _db_bad_value(e):
    db.session.rollback()
    resp = jsonify({"error": "bad request"})
    resp.status_code = 400
    return resp


def _register_db_errors():
    from sqlalchemy.exc import DataError, IntegrityError
    app.register_error_handler(IntegrityError, _db_conflict)
    app.register_error_handler(DataError, _db_bad_value)


_register_db_errors()


# ── Sicherheits-Header für jede Antwort ──────────────────────────────────────
# Die Website plonky.ch hat solche Header seit Langem in ihrer .htaccess, die App
# hatte bis 22.11.2026 keinen einzigen. Nachgezogen.
@app.after_request
def security_headers(resp):
    # setdefault: eine Route, die es bewusst anders will, behält ihren Wert.
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    # no-referrer: verlässt die Seite nie als Referer. Heute hat die
    # Admin-Seite keinen einzigen externen Link — kommt je einer dazu, würde
    # sonst der Schlüssel in der Adresszeile mitgeschickt.
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    # Alles ausser der App-Seite selbst (die setzt ihre eigene, mit Nonce):
    # nichts laden, nichts ausfuehren. Greift, wenn jemand eine JSON-Antwort
    # oder ein SVG direkt als Seite oeffnet.
    resp.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")

    # HSTS: der Browser merkt sich, dass es diese Adresse NUR verschluesselt
    # gibt — und ruft sie kuenftig gar nicht erst unverschluesselt auf. Das
    # schliesst die Luecke beim allerersten Klick, bevor die Weiterleitung
    # greift.
    #
    # Das ist eine EINBAHNSTRASSE: Browser merken sich das ein Jahr lang.
    # Faellt das Zertifikat je aus, ist die App fuer jeden, der sie in diesem
    # Jahr schon besucht hat, nicht mehr erreichbar — ohne Klickmoeglichkeit
    # vorbei. Zuruecknehmen geht nur, indem man max-age=0 ausliefert und so
    # lange wartet, bis alle Besucher einmal vorbeigekommen sind.
    #
    # Bewusst OHNE includeSubDomains: unter plonky.ch haengen mail, webmail,
    # cpanel und ftp. ftp.plonky.ch spricht kein HTTPS — eine solche Regel
    # wuerde sie im Browser unerreichbar machen. Auch ohne preload: in die
    # Browser-Liste aufgenommen zu werden ist praktisch endgueltig.
    #
    # Nur auf verschluesselten Antworten. Ueber HTTP waere der Header
    # wirkungslos und eine Einladung fuer einen Angreifer in der Mitte.
    if request.headers.get("X-Forwarded-Proto", request.scheme) == "https":
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")

    path = request.path
    if path.startswith("/admin") or path == "/fb" or path.startswith("/fb/"):
        # Nur hier, nicht für die ganze App: über das Indexieren von
        # app.plonky.ch soll diese Zeile nicht nebenbei mitentscheiden.
        resp.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        # Personendaten gehören nicht in den Platten-Cache des Browsers.
        resp.headers["Cache-Control"] = "no-store, max-age=0"
    return resp


# ── Sitzungs-Tickets für die privaten Bereiche ──────────────────────────────
# Ein Ticket ist "Ablaufzeit.HMAC(Geheimnis, Ablaufzeit)". Kein zusätzliches
# Geheimnis nötig, nichts zu speichern, übersteht einen Neustart — und wird das
# Geheimnis auf render gewechselt, sind alle Tickets sofort ungültig.
# Das Geheimnis selbst steht NIE im Cookie, nur eine Signatur damit.
def _env_secret(name):
    return (os.environ.get(name) or "").encode()


def _sign(secret, exp):
    return hmac.new(secret, str(exp).encode(), hashlib.sha256).hexdigest()


def _ticket(secret, hours):
    exp = int(time.time()) + hours * 3600
    return "%d.%s" % (exp, _sign(secret, exp))


def _ticket_ok(secret, ticket):
    if not secret or not ticket or "." not in ticket:
        return False
    exp_s, _, sig = ticket.partition(".")
    # Streng lesen: ein Umlaut in der Signatur oder 5000 Ziffern als Ablaufzeit
    # haben frueher einen Absturz (500) ausgeloest statt einer Abweisung.
    if not re.fullmatch(r"[0-9]{1,12}", exp_s) or not re.fullmatch(r"[0-9a-f]{64}", sig):
        return False
    if int(exp_s) < time.time():
        return False
    # compare_digest, damit die Antwortzeit nicht verrät, wie weit eine
    # gefälschte Signatur gestimmt hat.
    return hmac.compare_digest(sig, _sign(secret, int(exp_s)))


def _secret_matches(given, secret):
    """Rohes Geheimnis vergleichen — für den Einstiegslink und den Header."""
    if not secret or not given:
        return False
    return hmac.compare_digest(str(given).encode(), secret)


def _set_ticket_cookie(resp, name, secret, hours, path):
    # Hinter dem render-Proxy steht das echte Schema nur im Header. Lokal über
    # http würde ein secure-Cookie gar nicht erst gesendet.
    https = request.headers.get("X-Forwarded-Proto", request.scheme) == "https"
    resp.set_cookie(
        name, _ticket(secret, hours),
        max_age=hours * 3600,
        httponly=True,      # kein Zugriff aus JavaScript
        secure=https,       # nur über HTTPS mitsenden
        samesite="Lax",     # nicht an fremde Seiten mitschicken
        path=path,          # nur an den Bereich, der es braucht
    )


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "build": "analytics+konten-anlage-layout"})


@app.route("/api/games", methods=["GET"])
def list_games():
    # Header statt Query: Query-Parameter landen in den Zugriffsprotokollen.
    # ?account_id= bleibt fuer Tabs auf einem aelteren Frontend-Stand.
    account_id = request.headers.get("X-Plonky-Account") or request.args.get("account_id")
    if not account_id:
        # Ohne Nummer gibt es nichts herauszugeben. Niemals auf "alle Spiele"
        # zurueckfallen.
        abort(400, "missing account_id")
    # Die Nummer allein genuegt NICHT: sie steht in jeder Runde, in der man
    # mitgespielt hat. Den Verlauf oeffnet nur das Geheimnis — und es muss zu
    # genau diesem Konto gehoeren.
    _require_caller(account_id)
    if not RATE_OFF and not _take_key("list_key", "a:" + str(account_id)):
        return _too_many()
    # games this account OWNS, plus games it TOOK PART in (one shared record)
    ids = {gid for (gid,) in db.session.query(Game.id).filter_by(account_id=account_id).all()}
    ids |= {gid for (gid,) in db.session.query(GameParticipant.game_id).filter_by(account_id=account_id).all()}
    if not ids:
        return jsonify([])
    # Der Verlauf ist der teuerste Abruf der App. Im ersten Audit lieferte er
    # 78 MB; im zweiten trieben 300 Runden mit je 16 Spielern und 99 Bahnen den
    # Arbeitsspeicher auf 1,4 GB — jeder Schlag war ein eigenes ORM-Objekt.
    # Deshalb: nur die 100 juengsten Runden, Schlaege als blanke Zeilen, Fotos
    # nur bis zu einem Budget, und hoechstens drei solche Abrufe gleichzeitig.
    if not _LIST_SLOTS.acquire(timeout=8):
        return _too_many()
    try:
        games = (db.session.query(Game.id, Game.account_id, Game.date, Game.venue, Game.mode, Game.code)
                 .filter(Game.id.in_(ids)).order_by(Game.date.desc().nullslast()).limit(MAX_GAMES_LISTED).all())
        gids = [g_.id for g_ in games]
        players = (db.session.query(Player.id, Player.game_id, Player.ext_id, Player.account_id, Player.name,
                                    Player.color, db.func.length(Player.avatar))
                   .filter(Player.game_id.in_(gids)).order_by(Player.id).all())
        pids = [p_[0] for p_ in players]
        scores = {}
        for i in range(0, len(pids), 500):
            for pid, hole, strokes in (db.session.query(Score.player_id, Score.hole, Score.strokes)
                                       .filter(Score.player_id.in_(pids[i:i + 500])).all()):
                scores.setdefault(pid, {})[str(hole)] = strokes
        parts = {}
        for gid, aid in db.session.query(GameParticipant.game_id, GameParticipant.account_id).filter(GameParticipant.game_id.in_(gids)).all():
            parts.setdefault(gid, []).append(aid)
        # Fotos: juengste Runden zuerst, bis das Budget aufgebraucht ist.
        rang = {gid: i for i, gid in enumerate(gids)}
        budget = LIST_PHOTO_BUDGET
        mit_foto = []
        for p_ in sorted(players, key=lambda x: rang.get(x[1], 0)):
            n = p_[6] or 0
            if 0 < n <= MAX_AVATAR and n <= budget:
                budget -= n
                mit_foto.append(p_[0])
        fotos = {}
        for i in range(0, len(mit_foto), 200):
            for pid, av in db.session.query(Player.id, Player.avatar).filter(Player.id.in_(mit_foto[i:i + 200])).all():
                fotos[pid] = _avatar(av)
        by_game = {}
        for pid, gid, ext_id, pacc, name, color, _n in players:
            by_game.setdefault(gid, []).append({
                "id": ext_id or pid, "account_id": pacc, "name": _text(name, MAX_NAME),
                "color": _color(color), "avatar": fotos.get(pid, ""), "scores": scores.get(pid, {}),
            })
        return jsonify([{
            "id": g_.id, "mine": str(g_.account_id) == str(account_id), "date": g_.date, "venue": g_.venue,
            "mode": g_.mode, "code": g_.code or "", "participants": parts.get(g_.id, []),
            "players": by_game.get(g_.id, []),
        } for g_ in games])
    finally:
        _LIST_SLOTS.release()


_LIST_SLOTS = threading.BoundedSemaphore(3)


@app.route("/api/games", methods=["POST"])
def upsert_game():
    # Eins nach dem anderen je Zugang und je Runde. Das Frontend schickt fuer ein
    # frisches Geraet Konto und erste Runde fast gleichzeitig; ohne diese Sperre
    # legten beide das Konto an, einer scheiterte mit 500, und die erste Runde
    # oder der Name fehlten danach (Audit: in 29 von 30 Versuchen).
    data = _body()
    with _serial("s:" + str(_hash_secret(_given_secret())), "g:" + str(_account_ref(data.get("id")))):
        return _upsert_game(data)


def _upsert_game(data):
    game_id = _account_ref(data.get("id"))
    if not game_id:
        abort(400, "missing game id")

    # Identitaet EINMAL bestimmen, aus dem Geheimnis. Danach wird nur noch
    # diese benutzt — nie eine Nummer aus Rumpf oder Kopfzeile.
    secret = _given_secret()
    if not secret:
        abort(403)
    rufer = _caller()
    account_id = _account_ref(data.get("account_id"))

    if rufer is None:
        # Erstes Spiel eines frischen Geraets. Das Frontend legt das Konto an
        # und speichert die Runde, OHNE auf die Antwort zu warten — kommt die
        # Runde zuerst an, gibt es das Konto noch nicht. Frueher legte diese
        # Route es dann ohne Geheimnis an, und es blieb fuer immer offen.
        #
        # Jetzt wird es MIT dem mitgeschickten Geheimnis angelegt. Damit ist
        # es von Anfang an gebunden, und die erste Runde geht nicht verloren.
        if not account_id or db.session.get(Account, account_id) is not None:
            abort(403)
        if _is_deleted(account_id):
            abort(410)
        if not _secret_usable(secret):
            abort(400, "secret too short")
        if not _take_ip("account_ip"):
            abort(429)
        rufer = Account(id=account_id)
        rufer.secret_hash = _hash_secret(secret)
        db.session.add(rufer)
        db.session.flush()
    elif account_id and str(account_id) != str(rufer.id):
        # Man speichert nur unter dem eigenen Konto.
        abort(403)
    account_id = rufer.id

    game = db.session.get(Game, game_id)
    ist_besitzer = True
    bisherige = set()
    if game is None:
        # Obergrenze je Konto — ohne sie liess sich die Datenbank ueber ein
        # einziges Konto fuellen.
        if Game.query.filter_by(account_id=account_id).count() >= MAX_GAMES:
            abort(409)
        game = Game(id=game_id)
        db.session.add(game)
    else:
        bisherige = {gp.account_id for gp in game.participants}
        # Die Runde gibt es schon. Bis 22.11.2026 durfte sie JEDER überschreiben,
        # der die ID kannte — samt Besitzerwechsel. Die IDs waren zudem blosse
        # Zeitstempel, und die Detailansicht zeigt die Uhrzeit auf die Minute.
        # Jetzt darf nur ändern, wer dabei war: der Besitzer oder ein
        # eingetragener Mitspieler.
        erlaubt = {gp.account_id for gp in game.participants}
        erlaubt.add(game.account_id)
        erlaubt.discard(None)
        # Gegen den oben bestimmten Aufrufer, NICHT gegen eine mitgeschickte
        # Nummer. Genau diese Verwechslung war die Luecke.
        if erlaubt and str(rufer.id) not in {str(x) for x in erlaubt}:
            abort(403)
        # Der Besitzer bleibt der Besitzer. Sonst könnte ein Mitspieler die
        # Runde beim Speichern seiner Korrektur auf sich selbst umschreiben.
        if game.account_id:
            ist_besitzer = str(game.account_id) == str(rufer.id)
            account_id = game.account_id

    if not ist_besitzer:
        # Ein Mitspieler korrigiert SCHLAEGE — sonst nichts. Im Audit schrieb
        # ein Teilnehmer die ganze Runde um: Anlage, Datum, Spielerliste, alles.
        neu = {str(_ident(pd.get("id"))): _scores(pd.get("scores"))
               for pd in _dicts(data.get("players"))[:MAX_PLAYERS] if _ident(pd.get("id")) is not None}
        for pl in game.players:
            if pl.ext_id in neu:
                pl.scores.clear()
                db.session.flush()
                for hole, strokes in neu[pl.ext_id].items():
                    pl.scores.append(Score(hole=int(hole), strokes=strokes))
        db.session.commit()
        return jsonify(game_to_dict(game, viewer=rufer.id))

    game.account_id = account_id
    game.date = _int(data.get("date"), 0, 10**14)
    game.venue = _text(data.get("venue"), MAX_VENUE)
    game.mode = _text(data.get("mode"), 20)
    game.code = _text(data.get("code"), 32)

    # Replace players/scores wholesale (cascade clears the old ones).
    game.players.clear()
    db.session.flush()

    for pdata in _dicts(data.get("players"))[:MAX_PLAYERS]:
        pid = _ident(pdata.get("id"))
        pacc = _account_ref(pdata.get("account_id"))
        player = Player(
            ext_id=str(pid) if pid is not None else None,
            account_id=pacc,
            name=_text(pdata.get("name"), MAX_NAME),
            color=_color(pdata.get("color")),
            avatar=snapshot_avatar(pacc, _avatar(pdata.get("avatar"))),
        )
        for hole, strokes in _scores(pdata.get("scores")).items():
            player.scores.append(Score(hole=int(hole), strokes=strokes))
        game.players.append(player)

    # Replace the participant links (accounts that joined but don't own the game).
    # Only set when provided, so an edit that omits them doesn't wipe them.
    #
    # NUR der Besitzer. Bis 22.11.2026 durfte jeder Beteiligte die Liste
    # ersetzen — nachgestellt: B speicherte die geteilte Runde mit gekuerzter
    # Liste, und C sah sie danach nicht mehr. Ein Mitspieler korrigiert
    # Schlaege; wer dabei war, entscheidet er nicht.
    #
    # Und nur Konten, die sich SELBST ausgewiesen haben: im Audit setzte ein
    # Fremder einem Konto, dessen Nummer er kannte, erfundene Runden in den
    # Verlauf. Als Teilnehmer gilt jetzt, wer
    #   - in dieser Live-Runde einen Platz mit Kontonachweis belegt hat, oder
    #   - frueher schon einmal selbst bei diesem Besitzer beigetreten ist, oder
    #   - an dieser gespeicherten Runde bereits beteiligt war.
    if isinstance(data.get("participants"), list):
        erwiesen = set()
        if game.code:
            live = db.session.get(Session, game.code.upper())
            if live is not None:
                try:
                    roh = json.loads(live.data or "{}")
                except (ValueError, TypeError):
                    roh = {}
                dort = set()
                for sp in _dicts(roh.get("players") if isinstance(roh, dict) else None):
                    if sp.get("verified") and _account_ref(sp.get("account_id")):
                        dort.add(sp.get("account_id"))
                # Nur wer in dieser Runde SELBST nachweislich dabei war, darf
                # sich auf sie berufen. Sonst genuegte ein fremder Runden-Code,
                # um deren Teilnehmern eine erfundene Runde unterzuschieben.
                # ... und zwar als GASTGEBER. Im zweiten Audit trat ein Fremder
                # als Gast bei, speicherte eine erfundene Runde mit allen
                # Mitspielern als Teilnehmer — und durfte das danach fuer immer.
                # Und nur eine Runde MIT Gastgeber-Schluessel zaehlt: in einer
                # ohne kann jeder jede Nummer an jeden Platz schreiben.
                if isinstance(roh, dict) and roh.get("host_hash") and roh.get("host_account") == account_id:
                    erwiesen = dort
        for m in erwiesen:
            _remember_trust(account_id, m)
        vertraut = {t.member_id for t in Trust.query.filter_by(owner_id=account_id).all()}
        erlaubte = erwiesen | vertraut | bisherige
        game.participants.clear()
        db.session.flush()
        gesehen = set()
        for raw in data.get("participants")[:MAX_PLAYERS]:
            pid = _account_ref(raw)
            if pid and pid != account_id and pid not in gesehen and pid in erlaubte:
                gesehen.add(pid)
                game.participants.append(GameParticipant(account_id=pid))

    db.session.commit()
    return jsonify(game_to_dict(game, viewer=rufer.id))


@app.route("/api/games/<game_id>/leave", methods=["POST"])
def leave_game(game_id):
    """Ein Teilnehmer nimmt eine Runde aus dem EIGENEN Verlauf. Die Runde selbst
    bleibt beim Besitzer und den uebrigen Teilnehmern."""
    rufer = _require_caller()
    GameParticipant.query.filter_by(game_id=game_id, account_id=rufer.id).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True})


# Hier stand bis 22.11.2026 DELETE /api/games/<id> — ohne jede Prüfung: wer die
# ID kannte, löschte die Runde. Die App rief die Route nie auf, es gibt im
# Bedienkonzept gar kein "Runde löschen". Eine Route, die niemand braucht und
# jeder benutzen kann, gehört weg statt abgesichert.


@app.route("/api/account/<account_id>", methods=["GET"])
def get_account(account_id):
    """Mit gueltigem Geheimnis das ganze Konto, sonst nur das Oeffentliche.

    Die Nummer steht in jeder Runde, in der man mitgespielt hat. Sie darf
    deshalb Name, Farbe und Foto hergeben — aber nicht die Crew.
    """
    acc = db.session.get(Account, account_id)
    if acc is None:
        abort(404)
    eigen = _caller()
    if eigen is not None and str(eigen.id) == str(acc.id):
        return jsonify(account_to_dict(acc))
    return jsonify(account_public(acc))


@app.route("/api/account/resolve", methods=["POST"])
def resolve_account():
    """Persoenlicher Link: Geheimnis -> Konto. POST, damit das Geheimnis im
    Rumpf reist und nicht im Pfad — Pfade landen in den Zugriffsprotokollen."""
    data = _body()
    token = _text(data.get("secret"), 200).strip()
    if not token:
        abort(400, "missing secret")

    # Nur ueber das Geheimnis. Der frueher erlaubte Altweg "Nummer statt
    # Geheimnis" ist weg: die Nummer kennt jeder Mitspieler, sie haette ein
    # fremdes Konto geoeffnet.
    acc = Account.query.filter_by(secret_hash=_hash_secret(token)).first()
    if acc is None:
        abort(404)
    return jsonify(account_to_dict(acc))


@app.route("/api/accounts", methods=["GET"])
def get_accounts():
    """Batch photo lookup: ?ids=a,b,c -> [{id,name,color,avatar}]. The one place
    every avatar is resolved from — account id -> current photo."""
    raw = request.args.get("ids") or ""
    # 25 statt 200: ohne Anmeldung abrufbar, und jede Antwort traegt Fotos.
    ids = [i for i in (s.strip() for s in raw.split(",")) if _account_ref(i)][:ACCOUNTS_PER_LOOKUP]
    if not ids:
        return jsonify([])
    accs = Account.query.filter(Account.id.in_(ids)).all()
    return jsonify([{"id": a.id, "name": _text(a.name, MAX_NAME), "color": _color(a.color), "avatar": _avatar(a.avatar)} for a in accs])


def notify(text):
    """Fire-and-forget Telegram-Nachricht (z. B. neues Konto). Blockiert NIE den
    Request und wirft NIE: läuft im Daemon-Thread, alle Fehler werden geschluckt.
    No-op, solange TELEGRAM_TOKEN + TELEGRAM_CHAT_ID nicht gesetzt sind."""
    token = os.environ.get("TELEGRAM_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return

    def _send():
        try:
            body = urlencode({"chat_id": chat, "text": text}).encode()
            urlopen(Request("https://api.telegram.org/bot%s/sendMessage" % token, data=body), timeout=8)
        except Exception:
            pass

    threading.Thread(target=_send, daemon=True).start()


@app.route("/api/account", methods=["POST"])
def upsert_account():
    with _serial("s:" + str(_hash_secret(_given_secret()))):
        return _upsert_account()


def _upsert_account():
    data = _body()
    account_id = _account_ref(data.get("id"))
    if not account_id:
        abort(400, "missing account id")
    secret = _given_secret()
    # OHNE Geheimnis entsteht hier nichts mehr. Bis 22.11.2026 abends war das
    # erlaubt — und ein so angelegtes Konto blieb fuer immer offen: wer die
    # Nummer kannte, las den Verlauf, aenderte das Profil UND konnte den Zugang
    # an ein eigenes Geheimnis binden, womit der echte Besitzer ausgesperrt war.
    if not secret:
        abort(400, "missing secret")

    acc = db.session.get(Account, account_id)
    is_new = acc is None
    if is_new:
        if _is_deleted(account_id):
            abort(410)                       # geloescht bleibt geloescht
        if not _secret_usable(secret):
            abort(400, "secret too short")
        # Ein Geheimnis gehoert zu genau EINEM Konto — der Aufrufer wird ja
        # ueber dessen Abdruck gefunden. Zwei Konten mit demselben Geheimnis
        # waeren nicht mehr auseinanderzuhalten.
        if _caller() is not None:
            abort(409)
        if not _take_ip("account_ip"):
            abort(429)
        acc = Account(id=account_id)
        acc.secret_hash = _hash_secret(secret)
        db.session.add(acc)
    else:
        # Kein Uebernehmen mehr. Ein Konto ohne Abdruck stammt aus der Zeit vor
        # der Trennung und laesst sich nicht mehr beschreiben — "die Nummer
        # kennen" war nie ein Besitznachweis, sie wird ja an Mitspieler
        # verteilt. Betroffen waren nur Michaels eigene Testgeraete.
        if not acc.secret_hash or not hmac.compare_digest(acc.secret_hash, _hash_secret(secret)):
            abort(403)
    # Jedes Feld einzeln geprueft. Was nicht passt, wird uebergangen — der
    # alte Wert bleibt stehen, statt durch Unbrauchbares ersetzt zu werden.
    if isinstance(data.get("name"), str):
        acc.name = _text(data.get("name"), MAX_NAME)
    if _color(data.get("color")):
        acc.color = _color(data.get("color"))
    if isinstance(data.get("crew"), list):
        acc.crew = json.dumps(_crew(data.get("crew")))
    if data.get("kind") in ("master", "companion"):
        acc.kind = data.get("kind")
    if data.get("avatar") == "":
        acc.avatar = ""                                   # ausdruecklich entfernt
    elif _avatar(data.get("avatar")):
        acc.avatar = _avatar(data.get("avatar"))          # nur ein echtes Bild
    db.session.commit()
    if is_new and (acc.kind or "master") == "master":
        notify("🆕 Neues plonky-Konto")   # ohne Namen: der ginge sonst an einen Dritten
    return jsonify(account_to_dict(acc))


@app.route("/api/account/rotate", methods=["POST"])
def rotate_account_secret():
    with _serial("s:" + str(_hash_secret(_given_secret()))):
        return _rotate_account_secret()


def _rotate_account_secret():
    """Den Zugang erneuern: neues Geheimnis, das alte gilt sofort nicht mehr.

    Der persoenliche Link IST der Zugang. Wer ihn einmal weitergegeben oder
    fotografiert hat, konnte ihn bisher nie wieder entwerten.
    """
    acc = _require_caller()
    neu = _text(_body().get("new_secret"), 200)
    if not _secret_usable(neu):
        abort(400, "secret too short")
    if Account.query.filter_by(secret_hash=_hash_secret(neu)).first() is not None:
        abort(409)
    acc.secret_hash = _hash_secret(neu)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/account", methods=["DELETE"])
def delete_account():
    with _serial("s:" + str(_hash_secret(_given_secret()))):
        return _delete_account()


def _delete_account():
    """Das eigene Konto loeschen — mit allem, was daran haengt.

    Bisher ging das nur per Mail und von Hand. Geloescht werden das Konto samt
    Foto und Crew, alle Runden, die ihm gehoeren (mit Spielern und Schlaegen),
    seine Eintraege als Teilnehmer fremder Runden und die Vertrauens-
    Beziehungen. In Runden ANDERER bleibt die Zeile mit dem Namen stehen —
    das ist deren Spielstand —, aber ohne Verweis auf dieses Konto.
    """
    acc = _require_caller()
    aid = acc.id
    for g in Game.query.filter_by(account_id=aid).all():
        db.session.delete(g)                 # nimmt Spieler, Schlaege, Teilnehmer mit
    GameParticipant.query.filter_by(account_id=aid).delete(synchronize_session=False)
    Player.query.filter_by(account_id=aid).update({"account_id": None, "avatar": ""}, synchronize_session=False)
    Trust.query.filter((Trust.owner_id == aid) | (Trust.member_id == aid)).delete(synchronize_session=False)
    Feedback.query.filter_by(account_id=aid).update({"account_id": None, "name": "", "contact": ""}, synchronize_session=False)
    db.session.delete(acc)
    db.session.add(Tombstone(id_hash=_hash_secret("konto:" + str(aid))))
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/session", methods=["POST"])
def create_session():
    _cleanup_sessions()
    data = _body()
    rufer = _caller()
    players = []
    for p in _dicts(data.get("players"))[:MAX_PLAYERS]:
        pid = _ident(p.get("id"))
        if pid is None:
            continue
        pacc = _account_ref(p.get("account_id"))
        players.append({
            "id": pid,
            "name": _text(p.get("name"), MAX_NAME),
            "color": _color(p.get("color")),
            "scores": _scores(p.get("scores")),
            "claimed": p.get("claimed") is True,
            "host": (len(players) == 0),  # the lead device that created the round
            "avatar": snapshot_avatar(pacc, _avatar(p.get("avatar"))),
            # identity travels with the round: names/photos resolve live by account id
            "account_id": pacc,
        })
    if not players:
        abort(400)                 # eine Runde ohne Spieler ist keine
    # Erst jetzt zaehlen: eine abgewiesene Anfrage soll niemandem das
    # Kontingent wegnehmen. Ist das der Adresse aufgebraucht (jemand im selben
    # WLAN flutet), darf ein nachgewiesenes Konto trotzdem weiterspielen.
    if not RATE_OFF and not _take_ip("session_ip", "session_ip_day"):
        if rufer is None or not _take_key("session_key", "a:" + str(rufer.id)):
            abort(429)
    payload = {"players": players}
    # Die Bahnenzahl reist mit: ein Gast kennt die Anlage des Gastgebers nicht
    # unbedingt und rechnete sonst mit 18 — auf einer Anlage mit 36 Bahnen
    # liessen sich die uebrigen gar nicht eintragen.
    holes = _int(data.get("holes"), 1, MAX_HOLE)
    if holes:
        payload["holes"] = holes
    host_key = _round_key(HOST_HEADER)
    if host_key:
        payload["host_hash"] = _hash_secret(host_key)
    # Eine Konto-Nummer an einem Platz ist erst einmal nur eine Behauptung des
    # Gastgebers. "verified" bekommt ein Platz, wenn der Inhaber des Kontos sich
    # selbst ausgewiesen hat — hier: der Gastgeber fuer seinen eigenen Platz.
    # NUR in einer Runde mit Gastgeber-Schluessel. Eine Runde ohne ihn laesst
    # jeden alles aendern (Altbestand) — auch die Konto-Nummer an einem Platz.
    # In der Gegenpruefung legte ein Angreifer so eine Runde an, wies sich als
    # Gastgeber aus, schrieb danach eine FREMDE Nummer auf den Platz und hatte
    # damit einen "nachgewiesenen" Mitspieler erfunden.
    if host_key and players and rufer is not None and str(players[0].get("account_id")) == str(rufer.id):
        players[0]["verified"] = True
        payload["host_account"] = rufer.id
    s = Session(
        code=new_session_code(),
        mode=_text(data.get("mode"), 20) or "sequential",
        venue=_text(data.get("venue"), MAX_VENUE),
        data=_session_blob(payload),
        rev=1,
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>", methods=["GET"])
def get_session(code):
    s = db.session.get(Session, (code or "").upper())
    if s is None:
        abort(404)
    return jsonify(session_to_dict(s, full=request.args.get("full") == "1"))


_LAST_CLEANUP = [0.0]


def _cleanup_sessions(force=False):
    """Live-Runden, die aelter sind als SESSION_DAYS, loeschen.

    Vorher blieb jede Runde fuer immer liegen — mit Namen, bei Gaesten ohne
    Konto auch mit Fotos, und mit einem Code, der nie ablief. Hoechstens einmal
    pro Stunde, damit es das Anlegen einer Runde nicht bremst.
    """
    now = time.time()
    if not force and now - _LAST_CLEANUP[0] < 3600:
        return
    _LAST_CLEANUP[0] = now
    try:
        cutoff = int((now - SESSION_DAYS * 86400) * 1000)
        Session.query.filter(Session.created_at < cutoff).delete(synchronize_session=False)
        db.session.commit()
    except Exception:
        db.session.rollback()


def _session_blob(payload, strict=True):
    """Als JSON — und nie groesser als MAX_SESSION_BYTES. Jeder Schlag schreibt
    die ganze Runde neu und jeder Abgleich liest sie; im Audit wuchs eine Runde
    mit 40 Fotos auf 6 MB.

    strict=False fuer Schlaege: die wachsen nur um ein paar Bytes (begrenzt
    durch Spieler x Bahnen) und duerfen nie an der Groesse scheitern — sonst
    legt, wer die Runde mit Fotos bis an die Grenze fuellt, das Eintragen lahm.
    """
    blob = json.dumps(payload)
    if strict and len(blob) > MAX_SESSION_BYTES:
        abort(413)
    return blob


def _mutate_session(code):
    """Load a session for update, returning (session, payload, players) or aborting 404.

    Mit Zeilensperre (SELECT … FOR UPDATE): die Runde ist EIN JSON-Feld, das
    gelesen, geaendert und zurueckgeschrieben wird. Seit gunicorn mit Threads
    laeuft, koennten sich zwei gleichzeitige Schlaege sonst gegenseitig
    ueberschreiben. SQLite kennt die Sperre nicht und ignoriert sie.
    """
    s = db.session.get(Session, (code or "").upper(), with_for_update=True)
    if s is None:
        abort(404)
    try:
        payload = json.loads(s.data or "{}")
    except (ValueError, TypeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    players = _dicts(payload.get("players"))
    return s, payload, players


# ══ Rollen in der Live-Runde ══════════════════════════════════════════════
# Bis 22.11.2026 war der Runden-Code Einladung und Generalvollmacht in einem:
# wer ihn hatte, konnte beenden, verwerfen, die Spielerliste ersetzen und
# fremde Schlaege aendern. Das Frontend bot das einem Beigetretenen nie an —
# der Server haette es aber angenommen.
#
# Jetzt ist der Code nur noch die Einladung. Dazu kommen zwei unsichtbare
# Schluessel, die das jeweilige Handy SELBST erzeugt und mitschickt:
#
#   Gastgeber-Schluessel  X-Plonky-Host   beim Anlegen der Runde
#   Platz-Schluessel      X-Plonky-Slot   beim Belegen eines Platzes
#
# Selbst erzeugt statt vom Server vergeben, weil das Netz auf einer Anlage
# wackelt: ginge die Antwort mit einem vergebenen Schluessel verloren, waere
# der Gast ausgesperrt. So gelingt ein zweiter Versuch mit demselben Schluessel
# einfach. Gespeichert wird nur der Abdruck, und keiner der beiden verlaesst je
# den Server — session_to_dict() gibt nur feste, gepruefte Felder heraus.
#
# Eine Runde OHNE Gastgeber-Abdruck stammt aus der Zeit davor (oder von einem
# noch offenen alten Tab) und verhaelt sich wie bisher.
HOST_HEADER = "X-Plonky-Host"
SLOT_HEADER = "X-Plonky-Slot"


def _round_key(header):
    """Schluessel aus der Kopfzeile, wenn er als solcher taugt (128 Bit = 32 Hex)."""
    v = request.headers.get(header) or ""
    return v if 20 <= len(v) <= 200 else ""


def _enforced(payload):
    return bool(payload.get("host_hash"))


def _is_host(payload):
    h = payload.get("host_hash")
    if not h:
        return True                    # Runde aus der Zeit davor: wie bisher
    given = _round_key(HOST_HEADER)
    return bool(given) and hmac.compare_digest(str(h), _hash_secret(given))


def _owns_slot(p):
    h = p.get("key_hash")
    given = _round_key(SLOT_HEADER)
    return bool(h) and bool(given) and hmac.compare_digest(str(h), _hash_secret(given))


def _remember_trust(owner_id, member_id):
    """member hat sich in einer Runde von owner selbst ausgewiesen."""
    if not owner_id or not member_id or str(owner_id) == str(member_id):
        return
    if Trust.query.filter_by(owner_id=owner_id, member_id=member_id).first() is None:
        db.session.add(Trust(owner_id=owner_id, member_id=member_id))


def _require_host(payload):
    if not _is_host(payload):
        abort(403)


def _require_open(payload):
    """Eine beendete Runde nimmt nichts mehr an.

    Bis 22.11.2026 wurde "finished" gesetzt, aber nirgends geprueft: wer den
    Runden-Code hatte, konnte Schlaege einer laengst abgeschlossenen Runde
    aendern, die Spielerliste ersetzen oder die Runde loeschen — fuer immer,
    denn der Code laeuft nie ab. Das Frontend hielt sich selbst schon daran
    ("if (srvFinished) return"), der Server erzwang es nur nicht.

    409 statt 403: der Aufrufer ist nicht unberechtigt, die Runde ist vorbei.

    Offen bleibt bewusst NUR /claim: ein Gast, der auf dem Ergebnis-Bildschirm
    sein Konto anlegt, verknuepft danach noch seinen Platz damit.
    Nachkorrigieren laeuft nicht hierueber, sondern ueber die gespeicherte
    Runde (POST /api/games) — die gehoert einem Konto.
    """
    if payload.get("finished"):
        abort(409)


@app.route("/api/session/<code>/score", methods=["POST"])
def session_score(code):
    body = _body()
    pid = _ident(body.get("player_id"))
    hole = _int(body.get("hole"), 1, MAX_HOLE)
    raw = body.get("strokes")
    strokes = None if raw is None else _int(raw, 0, MAX_STROKES)
    # Eine Bahn ist eine ganze Zahl, ein Schlag auch. Alles andere — ein Text,
    # ein Objekt — wuerde bei jedem Mitspieler beim Anzeigen einen Fehler werfen.
    if pid is None or hole is None or (raw is not None and strokes is None):
        abort(400)
    s, payload, players = _mutate_session(code)
    _require_open(payload)
    for p in players:
        if str(p.get("id")) == str(pid):
            # Der Gastgeber tippt fuer jeden; wer beigetreten ist, nur fuer den
            # eigenen Platz. Das Frontend hielt sich schon daran ("joined as
            # one player: only your own score") — jetzt erzwingt es der Server.
            if not (_is_host(payload) or _owns_slot(p)):
                abort(403)
            scores = _scores(p.get("scores"))
            if strokes is None:
                scores.pop(str(hole), None)     # kein Wert = Eintrag weg
            else:
                scores[str(hole)] = strokes
            p["scores"] = scores
            break
    else:
        # Den Platz gibt es nicht (mehr) — etwa weil der Gastgeber ihn aus der
        # Aufstellung genommen hat. Frueher kam hier 200 zurueck, und der Gast
        # spielte die ganze Runde ins Leere.
        abort(404)
    payload["players"] = players
    s.data = _session_blob(payload, strict=False)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/players", methods=["POST"])
def session_players(code):
    """Replace the roster (host adding/removing players during setup),
    preserving claimed/scores for ids that already exist."""
    body = _body()
    incoming = _dicts(body.get("players"))[:MAX_PLAYERS]
    s, payload, existing = _mutate_session(code)
    _require_open(payload)
    _require_host(payload)
    by_id = {str(p.get("id")): p for p in existing}
    merged = []
    for p in incoming:
        pid = _ident(p.get("id"))
        if pid is None:
            continue
        old = by_id.get(str(pid)) or {}
        # A claimed slot keeps the photo the joiner brought; otherwise take the
        # host's roster photo (falling back to whatever was there).
        avatar = old.get("avatar") if old.get("claimed") else (_avatar(p.get("avatar")) or old.get("avatar") or "")
        # keep the slot↔account link across roster syncs; the host roster carries
        # identities too (e.g. the host's own slot)
        pacc = _account_ref(old.get("account_id")) or _account_ref(p.get("account_id"))
        merged.append({
            "id": pid,
            "name": _text(p.get("name"), MAX_NAME),
            "color": _color(p.get("color")),
            "scores": _scores(old.get("scores")) or _scores(p.get("scores")),
            "claimed": bool(old.get("claimed")),
            "host": (len(merged) == 0),
            "avatar": snapshot_avatar(pacc, _avatar(avatar)),
        })
        if pacc:
            merged[-1]["account_id"] = pacc
        if old.get("key_hash"):
            merged[-1]["key_hash"] = old.get("key_hash")   # der Platz bleibt seinem Inhaber
        if old.get("verified") and str(old.get("account_id")) == str(pacc):
            merged[-1]["verified"] = True
    rufer = _caller()
    if (merged and rufer is not None and _enforced(payload)
            and str(merged[0].get("account_id")) == str(rufer.id)):
        merged[0]["verified"] = True
        payload["host_account"] = rufer.id
    payload["players"] = merged
    s.data = _session_blob(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/claim", methods=["POST"])
def session_claim(code):
    body = _body()
    pid = _ident(body.get("player_id"))
    avatar = _avatar(body.get("avatar"))
    account_id = _account_ref(body.get("account_id"))
    if pid is None:
        abort(400)
    s, payload, players = _mutate_session(code)
    rufer = _caller()
    # Eine Konto-Verknuepfung gilt nur, wenn der Aufrufer dieses Konto IST.
    # Frueher genuegte die blosse Nummer — und die kennt jeder Mitspieler.
    belegt_konto = account_id if (account_id and rufer is not None and str(rufer.id) == str(account_id)) else None
    if not _enforced(payload):
        belegt_konto = account_id      # Runde aus der Zeit davor: wie bisher
    for p in players:
        if str(p.get("id")) == str(pid):
            if _enforced(payload):
                slot_key = _round_key(SLOT_HEADER)
                host = _is_host(payload)
                eigen = _owns_slot(p)
                # Wiedereinstieg mit dem eigenen Konto: der Platz ist mit
                # einem Konto verknuepft, und der Aufrufer weist es nach.
                konto = rufer is not None and p.get("account_id") and str(rufer.id) == str(p.get("account_id"))
                if p.get("host") and not host:
                    abort(403)                         # der Platz des Gastgebers
                if p.get("claimed") and not (eigen or konto or host):
                    abort(409)                         # schon vergeben
                # Nach dem Ende aendert nur noch der Inhaber seinen eigenen
                # Platz (ein Gast verknuepft dort sein eben angelegtes Konto).
                if payload.get("finished") and not (eigen or konto):
                    abort(409)
                if not host:
                    if not slot_key:
                        abort(400)                     # ohne Platz-Schluessel kein Platz
                    neu = _hash_secret(slot_key)
                    # EIN Platz pro Geraet: im Audit belegte ein einziger
                    # Schluessel alle freien Plaetze und tippte fuer sie.
                    if any(o is not p and o.get("key_hash") == neu for o in players):
                        abort(409)
                    p["key_hash"] = neu
                    if not belegt_konto:
                        p.pop("verified", None)        # wer hier sitzt, hat sich nicht ausgewiesen
            p["claimed"] = True
            # "verified" heisst: der Inhaber DIESES Kontos hat sich hier selbst
            # ausgewiesen. Alles andere nimmt die Marke wieder weg — nie bleibt
            # sie an einem Platz haengen, dessen Konto sich gerade aendert.
            ausgewiesen = bool(_enforced(payload) and belegt_konto and rufer is not None and str(rufer.id) == str(belegt_konto))
            if not ausgewiesen and not (p.get("verified") and rufer is not None and str(rufer.id) == str(p.get("account_id"))):
                p.pop("verified", None)
            if belegt_konto:  # link this slot to the joiner's account (crew photo sync)
                p["account_id"] = belegt_konto
                if ausgewiesen:
                    p["verified"] = True
                    # Der Gastgeber weist sich oft erst NACH dem Eroeffnen aus:
                    # ein frisches Geraet bekommt sein Konto beim ersten Schlag.
                    if p.get("host") and host:
                        payload["host_account"] = belegt_konto
                    _remember_trust(payload.get("host_account"), belegt_konto)
            # an account-less joiner has nowhere but the round to keep a photo
            p["avatar"] = snapshot_avatar(belegt_konto or p.get("account_id"), avatar or _avatar(p.get("avatar")))
            # Passt die Runde mit diesem Foto nicht mehr unter die Grenze,
            # bleibt der Platz — nur ohne Foto.
            if len(json.dumps(payload)) > MAX_SESSION_BYTES - 20_000:
                p["avatar"] = ""
            break
    payload["players"] = players
    s.data = _session_blob(payload, strict=False)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/leave", methods=["POST"])
def session_leave(code):
    """A joiner leaves before/without saving: free their slot so they (or anyone)
    can pick it again. Without this a left slot stays 'claimed' and locks them out."""
    body = _body()
    pid = _ident(body.get("player_id"))
    if pid is None:
        abort(400)
    s, payload, players = _mutate_session(code)
    _require_open(payload)
    for p in players:
        if str(p.get("id")) == str(pid):
            if not (_is_host(payload) or _owns_slot(p)):
                abort(403)                 # nur den eigenen Platz raeumen
            p["claimed"] = False
            p.pop("account_id", None)  # slot is free again; next claimer relinks
            p.pop("key_hash", None)
            p.pop("verified", None)
            break
    payload["players"] = players
    s.data = _session_blob(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/finish", methods=["POST"])
def session_finish(code):
    """Host ends the round. Every device sees finished=true and only then shows the winner."""
    s, payload, players = _mutate_session(code)
    _require_host(payload)
    payload["finished"] = True
    s.data = json.dumps(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>", methods=["DELETE"])
def session_delete(code):
    """Host discards a round — remove the live session entirely."""
    s = db.session.get(Session, (code or "").upper())
    if s is not None:
        try:
            payload = json.loads(s.data or "{}")
        except (ValueError, TypeError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        # Verwerfen geht nur, solange gespielt wird. Danach brauchen die
        # Mitspieler die Runde noch, um ihre Kopie mit dem Endstand zu sichern.
        _require_open(payload)
        _require_host(payload)
        db.session.delete(s)
        db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    data = _body()
    msg = _text(data.get("message"), 4000).strip()
    rating = _int(data.get("rating"), 1, 3)
    if not msg and not rating:
        abort(400, "empty feedback")
    if not _take_ip("feedback_ip"):
        abort(429)
    fb = Feedback(
        rating=rating,
        message=msg,
        contact=_text(data.get("contact"), 200),
        name=_text(data.get("name"), 120),
        account_id=_account_ref(data.get("account_id")),
    )
    db.session.add(fb)
    db.session.commit()
    return jsonify({"ok": True})


# ── Privater Feedback-Posteingang ──────────────────────────────────────────
# Bis 22.11.2026 lief das über GET /api/feedback?key=<FEEDBACK_KEY> — der
# Schlüssel reiste als Query-Parameter, und der Einstiegslink /fb/<key> trug ihn
# zusätzlich im Pfad. Beides landet im Klartext in den Zugriffsprotokollen von
# render. Genau davor warnt der Kommentar oben bei /api/games:
# "query params end up in access logs".
#
# Seit dem Audit: /fb#<key> — die Seite schickt ihn per POST /fb/login als Kopfzeile,
# der Server prüft ihn einmal,
# setzt eine Cookie-Sitzung und leitet auf /fb weiter. Die Datenabfrage trägt
# danach ÜBERHAUPT keinen Schlüssel mehr — weder im Pfad noch im Query.
FB_COOKIE = "plonky_fb"
FB_HOURS = 12


# Anmeldung: der Schluessel steht hinter einem '#' (/fb#<schluessel>). Den Teil
# ab '#' schickt der Browser nie an den Server; die Seite liest ihn aus und
# sendet ihn in einer Kopfzeile hierher. Vorher stand er beim ersten Aufruf im
# Pfad — und damit in den Zugriffsprotokollen.
KEY_HEADER = "X-Plonky-Key"


@app.route("/fb/login", methods=["POST"])
def feedback_login():
    secret = _env_secret("FEEDBACK_KEY")
    if not _secret_matches(request.headers.get(KEY_HEADER), secret):
        abort(403)
    resp = jsonify({"ok": True})
    # Pfad /fb, nicht / : das Cookie geht nur an den Posteingang. Deshalb liegt
    # die Datenabfrage unten auch unter /fb/daten und nicht unter /api/.
    _set_ticket_cookie(resp, FB_COOKIE, secret, FB_HOURS, "/fb")
    return resp


@app.route("/fb/<path:rest>")
def feedback_old_link(rest):
    """Der alte Einstieg /fb/<schluessel> — bewusst abgeschaltet: wer ihn noch
    benutzt, schriebe den Schluessel bei jedem Aufruf wieder ins Protokoll."""
    return _admin_gate("Dieser Link gilt nicht mehr.", "Neu: /fb#&lt;Schlüssel&gt; — der Schlüssel steht hinter dem #.", 410)


@app.route("/fb/daten")
def feedback_items():
    """Die Einträge. Cookie-Sitzung ODER Header — niemals ein Query-Parameter.

    Werkzeug bevorzugt eine Regel ohne Platzhalter, deshalb gewinnt /fb/daten
    gegen /fb/<key> und wird nicht als Schlüssel missverstanden.
    """
    secret = _env_secret("FEEDBACK_KEY")
    # Cookie für den Browser; Header für Werkzeuge wie curl, damit auch dort
    # nichts in der Adresszeile oder im Protokoll landet.
    ok = (_ticket_ok(secret, request.cookies.get(FB_COOKIE))
          or _secret_matches(request.headers.get("X-Plonky-Feedback"), secret))
    if not ok:
        abort(403)
    items = Feedback.query.order_by(Feedback.created_at.desc()).limit(500).all()
    return jsonify([
        {"id": f.id, "rating": f.rating, "message": f.message, "contact": f.contact, "name": f.name, "created": f.created_at}
        for f in items
    ])


@app.route("/fb/abmelden")
def feedback_logout():
    resp = redirect("/", code=302)
    resp.delete_cookie(FB_COOKIE, path="/fb")
    return resp


# ── Analytics-Dashboard (privat, nur mit ADMIN_KEY) ──────────────────────────
# Server-gerenderte Seite unter /admin (Anmeldung: /admin#<ADMIN_KEY>). Alle Kennzahlen aus den
# vorhandenen Tabellen; Berechnung in Python (portabel: SQLite lokal wie PG live).

ADMIN_CSS = """
  :root{--accent:#15A35A;--accent-deep:#0E7C43;--accent-soft:#E4F3EA;--ground:#F5F8F4;--card:#FFF;--ink:#152019;--ink-2:#53605A;--ink-3:#8A968F;--line:#E5EAE5;--line-2:#EEF2ED;--r:18px;--r-sm:11px;--font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:var(--font);color:var(--ink);background:var(--ground);-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1120px;margin:0 auto;padding:22px 20px 40px;}
  .num{font-variant-numeric:tabular-nums;}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px;}
  .brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:20px;letter-spacing:-.5px;}
  .brand .dot{width:16px;height:16px;border-radius:50%;background:var(--accent);position:relative;flex:none;}
  .brand .dot::after{content:"";position:absolute;inset:0;margin:auto;width:5px;height:5px;border-radius:50%;background:#fff;}
  .brand span{color:var(--ink-3);font-weight:700;}
  .live{background:var(--accent-soft);color:var(--accent-deep);font-weight:700;font-size:12px;letter-spacing:.3px;padding:5px 11px;border-radius:100px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px;}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 17px;}
  .kpi .lbl{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink-3);font-weight:700;}
  .kpi .big{font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.05;margin-top:6px;}
  .kpi .sub{font-size:12.5px;color:var(--ink-2);margin-top:5px;}
  .stack{display:flex;height:8px;border-radius:100px;overflow:hidden;margin-top:11px;background:var(--line-2);}
  .stack i{display:block;height:100%;}
  .legend{display:flex;gap:14px;margin-top:9px;font-size:12px;color:var(--ink-2);}
  .swatch{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:middle;}
  .ratings{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap;}
  .rchip{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;padding:4px 9px;border-radius:100px;background:var(--line-2);}
  .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-top:14px;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 18px 18px;}
  .col7{grid-column:span 7;}.col5{grid-column:span 5;}.col12{grid-column:span 12;}
  .card h2{font-size:14px;font-weight:800;letter-spacing:-.2px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
  .card h2 .tag{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px;}
  table{width:100%;border-collapse:collapse;font-size:14px;}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);font-weight:700;padding:10px 8px 8px;border-bottom:1px solid var(--line);}
  td{padding:11px 8px;border-bottom:1px solid var(--line-2);}
  tr:last-child td{border-bottom:0;}
  tbody tr:hover{background:var(--accent-soft);}
  .r{text-align:right;}
  .rankbar{position:relative;min-width:52px;height:7px;border-radius:100px;background:var(--line-2);overflow:hidden;display:block;}
  .rankbar i{position:absolute;inset:0;background:var(--accent);border-radius:100px;}
  .selfmade{font-size:10.5px;font-weight:700;color:#C9922A;background:#F7EFDD;padding:2px 7px;border-radius:100px;white-space:nowrap;}
  .cnt{font-weight:800;font-variant-numeric:tabular-nums;}
  .avatar{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex:none;}
  .venue{display:flex;align-items:center;gap:9px;}
  .chart{display:flex;align-items:flex-end;gap:8px;height:150px;padding:14px 4px 0;border-bottom:1px solid var(--line);}
  .chart .bar{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;}
  .chart .bar i{width:100%;max-width:34px;background:var(--accent-soft);border-radius:6px 6px 0 0;}
  .chart .bar.last i{background:var(--accent);}
  .chart .bar .v{font-size:11px;color:var(--ink-2);font-weight:700;margin-bottom:5px;font-variant-numeric:tabular-nums;}
  .xaxis{display:flex;gap:8px;padding:7px 4px 4px;}
  .xaxis span{flex:1;text-align:center;font-size:10.5px;color:var(--ink-3);}
  .dist{display:flex;flex-direction:column;gap:9px;padding-top:2px;}
  .dist .row{display:grid;grid-template-columns:74px 1fr 30px;align-items:center;gap:11px;}
  .dist .rl{font-size:12.5px;color:var(--ink-2);font-weight:600;}
  .dist .rb{height:15px;border-radius:5px;background:var(--line-2);overflow:hidden;}
  .dist .rb i{display:block;height:100%;background:var(--accent);border-radius:5px;}
  .dist .row.fam .rb i{background:var(--accent-deep);}
  .dist .rc{font-size:13px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;}
  .pill-note{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}
  .pnote{font-size:12px;font-weight:700;padding:5px 11px;border-radius:100px;background:var(--accent-soft);color:var(--accent-deep);}
  .pnote.b{background:#EEF3EF;color:var(--ink-2);}
  .heat{display:grid;grid-template-columns:52px repeat(7,1fr);gap:5px;padding-top:2px;}
  .heat .hhead{font-size:11px;color:var(--ink-3);text-align:center;font-weight:700;}
  .heat .hlabel{font-size:11px;color:var(--ink-3);display:flex;align-items:center;font-weight:600;}
  .heat .hcell{height:26px;border-radius:5px;background:var(--line-2);}
  .heatfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;font-size:12px;color:var(--ink-2);flex-wrap:wrap;}
  .heatfoot .peak{font-weight:700;color:var(--ink);}
  .heatscale{display:inline-flex;align-items:center;gap:5px;color:var(--ink-3);font-size:11px;}
  .heatscale i{width:15px;height:11px;border-radius:2px;}
  .fb{display:flex;flex-direction:column;}
  .fbitem{display:flex;gap:11px;padding:12px 2px;border-bottom:1px solid var(--line-2);}
  .fbitem:last-child{border-bottom:0;}
  .fbitem .face{font-size:19px;flex:none;}
  .fbitem .msg{font-size:13.5px;line-height:1.45;}
  .fbitem .fmeta{font-size:11.5px;color:var(--ink-3);margin-top:3px;}
  .names{display:flex;flex-wrap:wrap;gap:7px;}
  .nchip{display:inline-flex;align-items:center;gap:7px;background:var(--ground);border:1px solid var(--line);border-radius:100px;padding:4px 11px 4px 4px;font-size:13px;font-weight:600;}
  .caption{font-size:12px;color:var(--ink-3);margin-top:12px;}
  .empty{color:var(--ink-3);font-size:13px;padding:14px 2px;}
  .acct-log{display:flex;flex-direction:column;max-height:430px;overflow-y:auto;}
  .acct{padding:10px 2px;border-bottom:1px solid var(--line-2);}
  .acct:last-child{border-bottom:0;}
  .acct .ahead{display:flex;align-items:center;gap:9px;}
  .acct .nm{font-weight:700;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .acct .dt{font-size:11px;color:var(--ink-3);white-space:nowrap;flex:none;}
  .acct .crew{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 0 33px;}
  .acct .cchip{font-size:11.5px;color:var(--ink-2);background:var(--ground);border:1px solid var(--line);border-radius:100px;padding:2px 8px;}
  .acct .nocrew{font-size:11.5px;color:var(--ink-3);font-style:italic;margin:6px 0 0 33px;}
  .acct .aloc{margin:5px 0 0 33px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11.5px;color:var(--accent-deep);font-weight:600;}
  .acct .vtag{white-space:nowrap;}
  .toprow{display:flex;gap:14px;margin-top:14px;align-items:flex-start;}
  .toprow-left{flex:7;min-width:0;display:flex;flex-direction:column;gap:14px;}
  .toprow-right{flex:5;min-width:0;}
  .nchip2{display:inline-flex;background:var(--ground);border:1px solid var(--line);border-radius:100px;padding:3px 10px;font-size:12.5px;color:var(--ink-2);}
  .nchip2.more{color:var(--ink-3);}
  footer{margin-top:26px;font-size:12px;color:var(--ink-3);text-align:center;}
  @media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr);}.col7,.col5{grid-column:span 12;}.toprow{flex-direction:column;}}
  @media(max-width:460px){.kpis{grid-template-columns:1fr;}}
"""

_HEX = set("0123456789abcdefABCDEF")


def _col(c, fb="#15A35A"):
    c = (c or "").strip()
    if len(c) in (4, 7) and c[0] == "#" and all(ch in _HEX for ch in c[1:]):
        return c
    return fb


def _initial(name):
    name = (name or "").strip()
    return html.escape(name[0].upper()) if name else "?"


def _tz():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Europe/Zurich")
    except Exception:
        return None


_MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
           "Juli", "August", "September", "Oktober", "November", "Dezember"]


def _fmt_dt(ms, tz):
    if not ms:
        return "—"
    dt = datetime.datetime.fromtimestamp(ms / 1000, tz) if tz else datetime.datetime.utcfromtimestamp(ms / 1000)
    return "%d. %s %d, %02d:%02d" % (dt.day, _MONTHS[dt.month - 1], dt.year, dt.hour, dt.minute)


def _admin_stats():
    # Ohne die schweren Spalten. Crew und Live-Runden tragen Fotos; alles auf
    # einmal zu laden, hat im Audit bei 500 Runden 250 MB gekostet. Sie werden
    # in kleinen Portionen gelesen und sofort auf das Noetige eingedampft.
    accounts = Account.query.options(db.defer(Account.avatar), db.defer(Account.crew)).all()
    crew_slim = {}
    for aid, raw in db.session.query(Account.id, Account.crew).yield_per(20):
        try:
            crew_slim[aid] = [{"name": _text(m.get("name"), MAX_NAME), "color": _color(m.get("color")), "accountId": _account_ref(m.get("accountId"))}
                              for m in _dicts(json.loads(raw or "[]"))]
        except Exception:
            crew_slim[aid] = []
    games = Game.query.all()
    now = int(time.time() * 1000)

    masters = [a for a in accounts if (a.kind or "master") == "master"]
    n_master = len(masters)
    n_comp = sum(1 for a in accounts if a.kind == "companion")
    total = len(accounts)

    def crew_len(a):
        return len(crew_slim.get(a.id, []))

    total_crew = sum(crew_len(a) for a in accounts)

    # Haushaltsgröße = 1 (Konto-Inhaber) + Crew, nur über Haupt-Konten
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    for a in masters:
        s = 1 + crew_len(a)
        dist[6 if s >= 6 else max(s, 1)] += 1

    # Anmeldungen letzte 8 Wochen
    week = 7 * 24 * 3600 * 1000
    signups = [0] * 8
    for a in accounts:
        if not a.created_at:
            continue
        wk = int((now - a.created_at) // week)
        if 0 <= wk <= 7:
            signups[7 - wk] += 1

    # Anlagen nach Häufigkeit + Konten mit >1 Anlage
    venue_counts = {}
    acc_venues = {}
    for g in games:
        v = (g.venue or "").strip()
        if not v:
            continue
        venue_counts[v] = venue_counts.get(v, 0) + 1
        if g.account_id:
            acc_venues.setdefault(g.account_id, set()).add(v)
    venues = sorted(venue_counts.items(), key=lambda x: -x[1])
    name_by_id = {a.id: (a.name or "—") for a in accounts}
    multi = sorted(
        ((name_by_id.get(aid, aid), len(vs), color_by(accounts, aid)) for aid, vs in acc_venues.items() if len(vs) > 1),
        key=lambda x: -x[1],
    )

    # Heatmap: Wochentag × Tageszeit (lokale Zeit CH, sonst UTC)
    tz = _tz()
    heat = [[0] * 7 for _ in range(4)]
    for g in games:
        if not g.created_at:
            continue
        ts = g.created_at / 1000
        dt = datetime.datetime.fromtimestamp(ts, tz) if tz else datetime.datetime.utcfromtimestamp(ts)
        dp = 0 if dt.hour < 11 else 1 if dt.hour < 14 else 2 if dt.hour < 18 else 3
        heat[dp][dt.weekday()] += 1
    heat_max = max((max(r) for r in heat), default=0)
    peak = None
    if heat_max > 0:
        for dp in range(4):
            for wd in range(7):
                if heat[dp][wd] == heat_max:
                    peak = (dp, wd)

    # Feedback
    fbs = Feedback.query.order_by(Feedback.created_at.desc()).all()
    rate = {1: 0, 2: 0, 3: 0}
    for f in fbs:
        if f.rating in rate:
            rate[f.rating] += 1

    # Namensliste (Konten + Crew, dedupliziert)
    names, seen = [], set()
    for a in accounts:
        nm = (a.name or "").strip()
        if nm and nm.lower() not in seen:
            seen.add(nm.lower())
            names.append((nm, _col(a.color)))
    for a in accounts:
        try:
            crew = crew_slim.get(a.id, [])
        except Exception:
            crew = []
        for c in _dicts(crew):
            nm = _s(c.get("name"))
            if nm and nm.lower() not in seen:
                seen.add(nm.lower())
                names.append((nm, _col(c.get("color"), "#8A968F")))

    # Mitspieler pro Konto: aus gespeicherten Spielen (Player) UND Live-Runden
    # (Session), nicht nur aus dem gespeicherten Crew-Feld — so tauchen auch die
    # Leute auf, mit denen man gerade spielt (z. B. TELE-FRAU bei TELE-MAN).
    coplayers = {}
    account_venues = {}
    host_by_game = {g.id: g.account_id for g in games}
    for g in games:
        v = (g.venue or "").strip()
        if g.account_id and v:
            account_venues.setdefault(g.account_id, set()).add(v)
    for p in Player.query.options(db.defer(Player.avatar)).all():
        host = host_by_game.get(p.game_id)
        if not host or p.account_id == host:
            continue
        nm = (p.name or "").strip()
        if nm and nm.lower() != (name_by_id.get(host) or "").strip().lower():
            coplayers.setdefault(host, set()).add(nm)
    for sess in db.session.query(Session.venue, Session.data).order_by(Session.created_at.desc()).limit(3000).yield_per(20):
        try:
            roh = json.loads(sess.data or "{}")
            pl = _dicts(roh.get("players")) if isinstance(roh, dict) else []
        except Exception:
            pl = []
        if not pl:
            continue
        host_p = next((x for x in pl if x.get("host")), pl[0])
        host = _account_ref(host_p.get("account_id"))
        if not host:
            continue
        v = (sess.venue or "").strip()
        if v:
            account_venues.setdefault(host, set()).add(v)
        for x in pl:
            if x is host_p:
                continue
            nm = _s(x.get("name"))
            if nm:
                coplayers.setdefault(host, set()).add(nm)

    # Neue Konten (Haupt-Konten, neueste zuerst) mit Crew/Mitspieler-Namen
    new_accounts = []
    for a in sorted(masters, key=lambda x: -(x.created_at or 0))[:30]:
        try:
            crew = crew_slim.get(a.id, [])
        except Exception:
            crew = []
        saved = {_s(c.get("name")) for c in _dicts(crew) if _s(c.get("name"))}
        allnames = sorted(saved | coplayers.get(a.id, set()), key=str.lower)
        venues_here = sorted(account_venues.get(a.id, set()), key=str.lower)
        new_accounts.append((a.name or "ohne Name", _fmt_dt(a.created_at, tz), _col(a.color), allnames, venues_here))

    return dict(total=total, n_master=n_master, n_comp=n_comp, total_crew=total_crew,
                dist=dist, signups=signups, venues=venues, multi=multi, heat=heat,
                heat_max=heat_max, peak=peak, n_games=len(games), n_fb=len(fbs),
                rate=rate, recent_fb=fbs[:8], names=names, new_accounts=new_accounts)


def color_by(accounts, aid):
    for a in accounts:
        if a.id == aid:
            return _col(a.color)
    return "#15A35A"


def _admin_html(s):
    E = html.escape
    DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    PARTS = ["Morgen", "Mittag", "Nachm.", "Abend"]
    FACE = {1: "😞", 2: "😐", 3: "😍"}

    def pct(a, b):
        return f"{round(100 * a / b)}%" if b else "0%"

    # KPIs
    mw = pct(s["n_master"], s["total"])
    cw = pct(s["n_comp"], s["total"])
    kpi_konten = (f'<div class="stack"><i style="width:{mw};background:var(--accent-deep)"></i>'
                  f'<i style="width:{cw};background:var(--accent)"></i></div>'
                  f'<div class="legend"><span><span class="swatch" style="background:var(--accent-deep)"></span>{s["n_master"]} Haupt</span>'
                  f'<span><span class="swatch" style="background:var(--accent)"></span>{s["n_comp"]} Mitspieler</span></div>')
    avg_crew = f'{s["total_crew"]/s["total"]:.1f}'.replace(".", ",") if s["total"] else "0"
    rating_chips = "".join(f'<span class="rchip">{FACE[k]} <span class="num">{s["rate"][k]}</span></span>' for k in (3, 2, 1))

    # Anlagen
    vmax = s["venues"][0][1] if s["venues"] else 1
    if s["venues"]:
        vrows = "".join(
            f'<tr><td>{E(v)}</td><td style="width:40%"><span class="rankbar"><i style="width:{round(100*c/vmax)}%"></i></span></td><td class="r cnt">{c}</td></tr>'
            for v, c in s["venues"][:10])
    else:
        vrows = '<tr><td colspan="3" class="empty">Noch keine Runden gespielt.</td></tr>'

    # Anmeldungen
    smax = max(s["signups"]) or 1
    labels = ["–7", "–6", "–5", "–4", "–3", "–2", "–1", "jetzt"]
    bars = "".join(
        f'<div class="bar{" last" if i==7 else ""}"><span class="v num">{v}</span><i style="height:{max(round(90*v/smax),2) if v else 0}%"></i></div>'
        for i, v in enumerate(s["signups"]))
    xaxis = "".join(f"<span>{l}</span>" for l in labels)

    # Spieler pro Konto
    d = s["dist"]
    dmax = max(d.values()) or 1
    dlabels = {1: "1 Spieler", 2: "2 Spieler", 3: "3 Spieler", 4: "4 Spieler", 5: "5 Spieler", 6: "6+ Spieler"}
    drows = "".join(
        f'<div class="row{" fam" if k>=4 else ""}"><span class="rl num">{dlabels[k]}</span>'
        f'<span class="rb"><i style="width:{round(100*d[k]/dmax)}%"></i></span><span class="rc">{d[k]}</span></div>'
        for k in (1, 2, 3, 4, 5, 6))
    couples = pct(d[2], s["n_master"])
    families = pct(d[4] + d[5] + d[6], s["n_master"])

    # Heatmap
    def cell(v):
        if s["heat_max"] <= 0 or v <= 0:
            return "background:var(--line-2)"
        return f"background:rgba(21,163,90,{0.08 + 0.92 * v / s['heat_max']:.2f})"
    heat_html = "<span></span>" + "".join(f'<span class="hhead">{d}</span>' for d in DAYS)
    for dp in range(4):
        heat_html += f'<span class="hlabel">{PARTS[dp]}</span>'
        heat_html += "".join(f'<span class="hcell" style="{cell(s["heat"][dp][wd])}"></span>' for wd in range(7))
    peak_txt = f'{PARTS[s["peak"][0]]} · {DAYS[s["peak"][1]]}' if s["peak"] else "—"

    # Konten >1 Anlage
    if s["multi"]:
        mrows = "".join(
            f'<tr><td><span class="venue"><span class="avatar" style="background:{col}">{_initial(nm)}</span>{E(nm)}</span></td><td class="r cnt">{n}</td></tr>'
            for nm, n, col in s["multi"][:12])
    else:
        mrows = '<tr><td colspan="2" class="empty">Noch niemand auf mehreren Anlagen.</td></tr>'

    # Feedback
    if s["recent_fb"]:
        fb_html = "".join(
            f'<div class="fbitem"><span class="face">{FACE.get(f.rating,"·")}</span><div>'
            f'<div class="msg">{E(f.message) or "<i>(nur Bewertung)</i>"}</div>'
            f'<div class="fmeta num">{_ago(now_ms - f.created_at)}{" · "+E(f.contact) if f.contact else " · kein Kontakt"}{" · Konto: "+E(f.name) if f.name else ""}</div>'
            f"</div></div>"
            for f in s["recent_fb"])
    else:
        fb_html = '<div class="empty">Noch kein Feedback.</div>'

    # Namen
    if s["names"]:
        names_html = "".join(f'<span class="nchip2">{E(nm)}</span>' for nm, col in s["names"][:120])
        if len(s["names"]) > 120:
            names_html += f'<span class="nchip2 more">…und {len(s["names"])-120} weitere</span>'
    else:
        names_html = '<div class="empty">Noch keine Namen.</div>'

    # Neue Konten (Log, neueste zuerst)
    if s["new_accounts"]:
        def _acct(nm, dt, col, cns, vns):
            loc = ('<div class="aloc">📍 ' + " · ".join('<span class="vtag">%s</span>' % E(v) for v in vns) + "</div>") if vns else ""
            crew = ('<div class="crew">' + "".join('<span class="cchip">%s</span>' % E(cn) for cn in cns) + "</div>") if cns \
                else '<div class="nocrew">keine Mitspieler</div>'
            return ('<div class="acct"><div class="ahead"><span class="avatar" style="background:%s">%s</span>'
                    '<span class="nm">%s</span><span class="dt">%s</span></div>%s%s</div>') % (col, _initial(nm), E(nm), E(dt), loc, crew)
        acct_rows = "".join(_acct(nm, dt, col, cns, vns) for nm, dt, col, cns, vns in s["new_accounts"])
    else:
        acct_rows = '<div class="empty">Noch keine Konten.</div>'

    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>plonky · Analytics</title>
<style>{ADMIN_CSS}</style></head><body><div class="wrap">
<header class="topbar"><div class="brand"><span class="dot"></span>plonky <span>Analytics</span></div>
<span class="live">LIVE · {s["n_games"]} Runden</span></header>
<section class="kpis">
  <div class="kpi"><div class="lbl">Konten</div><div class="big num">{s["total"]}</div>{kpi_konten}</div>
  <div class="kpi"><div class="lbl">Sub-Account-Nutzung</div><div class="big num">{cw}</div><div class="sub">{s["n_comp"]} von {s["total"]} Konten sind Mitspieler-Konten.</div></div>
  <div class="kpi"><div class="lbl">Crew-Mitglieder</div><div class="big num">{s["total_crew"]}</div><div class="sub">gespeicherte Spieler über alle Konten (Ø {avg_crew} pro Konto).</div></div>
  <div class="kpi"><div class="lbl">Feedback</div><div class="big num">{s["n_fb"]}</div><div class="ratings">{rating_chips}</div></div>
</section>
<div class="toprow">
  <div class="toprow-left">
    <section class="card"><h2>Anlagen nach Häufigkeit <span class="tag">gespielte Runden</span></h2>
      <table><thead><tr><th>Anlage</th><th style="width:40%">&nbsp;</th><th class="r">Runden</th></tr></thead><tbody>{vrows}</tbody></table></section>
    <section class="card"><h2>Anmeldungen <span class="tag">letzte 8 Wochen</span></h2>
      <div class="chart">{bars}</div><div class="xaxis">{xaxis}</div></section>
  </div>
  <section class="card toprow-right"><h2>Neue Konten <span class="tag">Konto + Mitspieler</span></h2><div class="acct-log">{acct_rows}</div></section>
</div>
<div class="grid">
  <section class="card col5"><h2>Spieler pro Konto <span class="tag">Paar oder Familie?</span></h2>
    <div class="dist">{drows}</div>
    <div class="pill-note"><span class="pnote">Paare (2): {couples}</span><span class="pnote b">Familien (4+): {families}</span></div></section>
  <section class="card col7"><h2>Wann gespielt wird <span class="tag">Wochentag × Tageszeit</span></h2>
    <div class="heat">{heat_html}</div>
    <div class="heatfoot"><span>Peak: <span class="peak">{peak_txt}</span></span>
    <span class="heatscale">weniger <i style="background:rgba(21,163,90,.12)"></i><i style="background:rgba(21,163,90,.4)"></i><i style="background:rgba(21,163,90,.7)"></i><i style="background:rgba(21,163,90,1)"></i> mehr</span></div></section>
  <section class="card col7"><h2>Feedback <span class="tag">neueste zuerst</span></h2><div class="fb">{fb_html}</div></section>
  <section class="card col5"><h2>Konten mit &gt;1 Anlage <span class="tag">Reisende</span></h2>
    <table><thead><tr><th>Konto</th><th class="r">Anlagen</th></tr></thead><tbody>{mrows}</tbody></table></section>
  <section class="card col12"><h2>Namensliste <span class="tag">Konten &amp; Crew</span></h2><div class="names">{names_html}</div>
    <p class="caption">Geschlecht wird bewusst nicht erfasst — bei Interesse m/w am Namen ablesen.</p></section>
</div>
<footer>plonky Analytics · angemeldete Sitzung, läuft nach {ADMIN_HOURS} Std ab · <a href="/admin?abmelden=1" style="color:inherit;text-decoration:underline">abmelden</a><br><span style="opacity:.65">{_runtime_info()}</span></footer>
</div></body></html>"""


def _runtime_info():
    """Welche Fassungen laufen hier gerade? Steht nur im privaten Dashboard.

    Oeffentlich waere das eine Einladung: wer die Versionen kennt, kennt die
    passenden Luecken. Hier drin ist es das Gegenteil — ohne diese Zeile faellt
    ein veraltetes Paket erst auf, wenn jemand gezielt danach sucht.
    """
    teile = ["Python %d.%d.%d" % sys.version_info[:3]]
    try:
        from importlib.metadata import version as _v
        for name in ("flask", "sqlalchemy", "gunicorn", "psycopg2-binary"):
            try:
                teile.append("%s %s" % (name, _v(name)))
            except Exception:
                pass
    except Exception:
        pass
    # Greift die Flutbremse? Sie braucht CF-Connecting-IP; fehlt die Kopfzeile,
    # bremst sie nicht. Von aussen ist das nicht zu sehen — hier schon.
    if RATE_OFF:
        teile.append("Flutbremse: aus (RATE_LIMIT)")
    elif request.headers.get("CF-Connecting-IP"):
        teile.append("Flutbremse: aktiv")
    elif request.headers.get("X-Forwarded-For"):
        teile.append("Flutbremse: INAKTIV (kein CF-Connecting-IP)")
    else:
        teile.append("Flutbremse: aktiv (lokal)")
    teile.append("Datenbank: %d MB von %d MB" % (_db_mb(), DB_SOFT_LIMIT_MB))
    return " \u00b7 ".join(teile)


now_ms = 0  # gesetzt pro Request in admin_dashboard()


def _ago(ms):
    m = ms // 60000
    if m < 1:
        return "gerade eben"
    if m < 60:
        return f"vor {m} Min"
    h = m // 60
    if h < 24:
        return f"vor {h} Std"
    return f"vor {h//24} Tg"


# ── Anmeldung am Dashboard: Schlüssel EINMAL, danach eine Sitzung ───────────
# Vorher stand der ADMIN_KEY bei jedem Aufruf in der Adresszeile — und damit im
# Browser-Verlauf, in den Lesezeichen, im Geräte-Abgleich und in den
# Request-Logs von render. Geraten wird so ein Schlüssel nie (32 Zeichen,
# ~190 Bit); er geht verloren, weil er herumgetragen wird.
#
# Seit dem Audit: /admin#<key> — per POST /admin/login als Kopfzeile; der Server
# prüft, setzt eine Cookie-Sitzung, die Seite lädt /admin
# weiter. Der Schlüssel steht danach ein einziges Mal im Verlauf, die
# Adresszeile des Dashboards selbst ist sauber.
#
# Der Sitzungsnachweis ist "Ablaufzeit.HMAC(ADMIN_KEY, Ablaufzeit)" — kein
# zusätzliches Geheimnis nötig, nichts zu speichern, übersteht einen Neustart.
# Schöner Nebeneffekt: wird der ADMIN_KEY auf render gewechselt, sind alle
# Sitzungen sofort ungültig.
ADMIN_COOKIE = "plonky_admin"
ADMIN_HOURS = 12

ADMIN_GATE_HTML = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>plonky</title>
<style>body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#F5F8F4;color:#152019;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;
text-align:center;padding:30px}}
.b{{max-width:380px}}.d{{width:54px;height:54px;border-radius:50%;background:#15A35A;
margin:0 auto 22px;position:relative}}.d i{{position:absolute;left:50%;top:50%;
transform:translate(-50%,-50%);width:19px;height:19px;border-radius:50%;background:#F5F8F4}}
h1{{font-size:20px;margin:0 0 10px}}p{{margin:0;color:#53605A;font-size:15px}}</style>
</head><body><div class="b"><div class="d"><i></i></div>
<h1 id="t">{title}</h1><p id="x">{text}</p></div>{script}</body></html>"""

# Liest den Schluessel hinter dem '#', nimmt ihn SOFORT aus der Adresszeile und
# tauscht ihn ueber eine Kopfzeile gegen die Sitzung.
ADMIN_LOGIN_JS = """<script nonce="{nonce}">(function(){{
  var k = (location.hash || '').replace(/^#/, '');
  if (!k) return;
  try {{ history.replaceState(null, '', '/admin'); }} catch (e) {{}}
  document.getElementById('t').textContent = 'Anmelden …';
  document.getElementById('x').textContent = '';
  fetch('/admin/login', {{ method: 'POST', headers: {{ 'X-Plonky-Key': k }} }}).then(function (r) {{
    if (r.ok) {{ location.replace('/admin'); return; }}
    document.getElementById('t').textContent = 'Schlüssel stimmt nicht.';
    document.getElementById('x').textContent = 'Zum Anmelden /admin#<Schlüssel> öffnen.';
  }}).catch(function () {{
    document.getElementById('t').textContent = 'Keine Verbindung.';
  }});
}})();</script>"""
CSP_ADMIN = ("default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{n}'; connect-src 'self'; "
             "img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def _admin_gate(title, text, status, login=False):
    nonce = secrets.token_urlsafe(18)
    script = ADMIN_LOGIN_JS.format(nonce=nonce) if login else ""
    resp = make_response(ADMIN_GATE_HTML.format(title=title, text=text, script=script), status)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["Content-Security-Policy"] = CSP_ADMIN.format(n=nonce)
    return resp


@app.route("/admin/login", methods=["POST"])
def admin_login():
    secret = _env_secret("ADMIN_KEY")
    if not _secret_matches(request.headers.get(KEY_HEADER), secret):
        abort(403)
    resp = jsonify({"ok": True})
    _set_ticket_cookie(resp, ADMIN_COOKIE, secret, ADMIN_HOURS, "/admin")
    return resp


@app.route("/admin/<path:rest>")
def admin_old_link(rest):
    """Der alte Einstieg /admin/<schluessel> — bewusst abgeschaltet, siehe /fb."""
    return _admin_gate("Dieser Link gilt nicht mehr.", "Neu: /admin#&lt;Schlüssel&gt; — der Schlüssel steht hinter dem #.", 410)


# strict_slashes=False: auch /admin/ (von Hand getippt, mit Schrägstrich am
# Ende) landet hier statt auf einer 404-Seite.
@app.route("/admin", strict_slashes=False)
def admin_dashboard():
    if request.args.get("abmelden"):
        resp = _admin_gate("Abgemeldet.", "Die Sitzung ist beendet.", 200)
        resp.delete_cookie(ADMIN_COOKIE, path="/admin")
        return resp
    if not _ticket_ok(_env_secret("ADMIN_KEY"), request.cookies.get(ADMIN_COOKIE)):
        return _admin_gate("Keine Sitzung.", "Zum Anmelden /admin#&lt;Schlüssel&gt; öffnen.", 403, login=True)
    global now_ms
    now_ms = int(time.time() * 1000)
    resp = make_response(_admin_html(_admin_stats()))
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["Content-Security-Policy"] = CSP_ADMIN.format(n=secrets.token_urlsafe(18))
    return resp


@app.route("/")
@app.route("/m", strict_slashes=False)  # neuer persoenlicher Link: /m/#<geheimnis>
@app.route("/m/<token>")                # alter Link, Nummer im Pfad
@app.route("/j/<token>")
@app.route("/fb", strict_slashes=False)  # Posteingang, auch /fb/ ; Anmeldung über /fb#<key>
@app.route("/p/<token>")  # per-venue QR link: /p/<venue-slug> — frontend reads it, sets the active venue
def index(token=None):
    """Die App-Seite — mit einer Content Security Policy.

    Lange hiess es, das gehe nicht, weil JSX im Browser uebersetzt wird. Es
    geht: Babel reicht die Nonce des text/babel-Tags an das erzeugte Skript
    weiter und braucht kein eval. Jede Antwort bekommt eine frische Nonce; was
    sie nicht traegt, laeuft nicht. Dazu: Verbindungen und Bilder nur von der
    eigenen Adresse — ein eingeschleustes Skript koennte den Zugang im
    Browserspeicher also weder ausfuehren noch irgendwohin schicken.
    """
    nonce = secrets.token_urlsafe(18)
    resp = make_response(_index_html().replace("__NONCE__", nonce))
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["Content-Security-Policy"] = CSP_APP.format(n=nonce)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


CSP_APP = ("default-src 'none'; script-src 'self' 'nonce-{n}'; style-src 'self' 'unsafe-inline'; "
           "font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; "
           "media-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; "
           "object-src 'none'")
_INDEX = {"mtime": None, "html": ""}


def _index_html():
    path = os.path.join(APP_DIR, "index.html")
    mtime = os.path.getmtime(path)
    if _INDEX["mtime"] != mtime:
        with open(path, encoding="utf-8") as fh:
            _INDEX["html"] = fh.read()
        _INDEX["mtime"] = mtime
    return _INDEX["html"]


@app.route("/<path:path>")
def static_files(path):
    if path == "index.html":
        return index()
    parts = path.split("/")
    # kein Punkt-Ordner, kein Leersegment, kein Weg nach oben
    if any(p == "" or p.startswith(".") for p in parts):
        abort(404)
    if os.path.splitext(path)[1].lower() not in ALLOWED_EXT:
        abort(404)
    if not (path in STATIC_ROOT_FILES or path.startswith(STATIC_DIRS)):
        abort(404)
    full = os.path.join(APP_DIR, path)
    if not os.path.isfile(full):
        abort(404)
    return send_from_directory(APP_DIR, path)


def ensure_schema():
    """Add columns introduced after the table was first created. db.create_all()
    only makes missing tables, never alters existing ones."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    cols = {c["name"] for c in inspector.get_columns("account")}
    if "crew" not in cols:
        db.session.execute(text("ALTER TABLE account ADD COLUMN crew TEXT NOT NULL DEFAULT '[]'"))
        db.session.commit()
    if "kind" not in cols:
        db.session.execute(text("ALTER TABLE account ADD COLUMN kind TEXT NOT NULL DEFAULT 'master'"))
        db.session.commit()
    if "avatar" not in cols:
        db.session.execute(text("ALTER TABLE account ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"))
        db.session.commit()
    if "secret_hash" not in cols:
        db.session.execute(text("ALTER TABLE account ADD COLUMN secret_hash VARCHAR"))
        db.session.commit()

    player_cols = {c["name"] for c in inspector.get_columns("player")}
    if "avatar" not in player_cols:
        db.session.execute(text("ALTER TABLE player ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"))
        db.session.commit()
    if "account_id" not in player_cols:
        db.session.execute(text("ALTER TABLE player ADD COLUMN account_id VARCHAR"))
        db.session.commit()

    # Ein Zugang gehoert zu genau EINEM Konto — das erzwingt jetzt auch die
    # Datenbank (bisher nur der Code, und der verlor einen Wettlauf).
    try:
        db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_account_secret ON account (secret_hash) WHERE secret_hash IS NOT NULL"))
        db.session.commit()
    except Exception:
        db.session.rollback()      # Altbestand mit Doppelten: nicht am Start scheitern

    game_cols = {c["name"] for c in inspector.get_columns("game")}
    if "code" not in game_cols:
        db.session.execute(text("ALTER TABLE game ADD COLUMN code VARCHAR NOT NULL DEFAULT ''"))
        db.session.commit()


def purge_photo_copies():
    """Clear photo copies left by earlier builds for players who HAVE an account.

    Those rows are already invisible (the id lookup wins), but they would survive
    a delete on the account — so "Foto entfernen" would leave the face in the
    database. See snapshot_avatar().
    """
    from sqlalchemy import text

    res = db.session.execute(
        text("UPDATE player SET avatar='' WHERE avatar<>'' AND account_id IS NOT NULL")
    )
    cleared_crew = 0
    for a in Account.query.all():
        try:
            crew = json.loads(a.crew or "[]")
        except (ValueError, TypeError):
            continue
        stripped = strip_crew_avatars(crew)
        if stripped != crew:
            a.crew = json.dumps(stripped)
            cleared_crew += 1

    cleared_rounds = 0
    for s in Session.query.all():
        try:
            payload = json.loads(s.data or "{}")
        except (ValueError, TypeError):
            continue
        players = payload.get("players") or []
        touched = False
        for p in players:
            if p.get("account_id") and p.get("avatar"):
                p["avatar"] = ""
                touched = True
        if touched:
            payload["players"] = players
            s.data = json.dumps(payload)
            cleared_rounds += 1
    db.session.commit()
    if res.rowcount or cleared_rounds or cleared_crew:
        app.logger.info(
            "purged photo copies: %s players, %s rounds, %s crew lists",
            res.rowcount, cleared_rounds, cleared_crew,
        )


with app.app_context():
    db.create_all()
    ensure_schema()
    # purge_photo_copies() lief frueher bei JEDEM Start und lud dafuer alle
    # Konten und Runden in den Speicher. Es war ein einmaliger Umzug vom
    # 07.08.2026 und ist laengst erledigt; die Pruefschicht haelt den Zustand.
    # War die Datenbank gross genug, kam die App deshalb nicht mehr hoch.
    _cleanup_sessions(force=True)


if __name__ == "__main__":
    # Nur dieser Rechner, kein Debugger: vorher hing der Server mitsamt
    # Werkzeug-Debugger am ganzen WLAN (0.0.0.0, debug=True).
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)),
            debug=os.environ.get("PLONKY_DEBUG") == "1")
