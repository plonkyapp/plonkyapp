import datetime
import html
import json
import os
import random
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy

APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Files the static layer is allowed to serve. Everything else (e.g. .py/.sh)
# returns 404 so the backend source is never exposed.
ALLOWED_EXT = {
    ".html", ".jsx", ".js", ".css", ".map",
    ".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp",
    ".woff", ".woff2", ".ttf", ".webmanifest", ".json", ".txt",
}


def database_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        return "sqlite:///" + os.path.join(APP_DIR, "plonky_local.db")
    # render hands out postgres:// ; SQLAlchemy 2 needs postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


app = Flask(__name__, static_folder=None)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "pool_recycle": 300}

db = SQLAlchemy(app)


class Account(db.Model):
    __tablename__ = "account"
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False, default="")
    color = db.Column(db.String, nullable=False, default="")
    crew = db.Column(db.Text, nullable=False, default="[]")  # JSON: [{id,name,color,avatar}]
    kind = db.Column(db.String, nullable=False, default="master")  # "master" | "companion"
    avatar = db.Column(db.Text, nullable=False, default="")  # small base64 photo (data URL) or ""
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


class Feedback(db.Model):
    """Player feedback. Read via the private inbox (GET /api/feedback?key=FEEDBACK_KEY)."""
    __tablename__ = "feedback"
    id = db.Column(db.Integer, primary_key=True)
    rating = db.Column(db.Integer, nullable=True)  # 1=😞 2=😐 3=😍, or null
    message = db.Column(db.Text, nullable=False, default="")
    contact = db.Column(db.String, nullable=False, default="")  # optional email/handle
    name = db.Column(db.String, nullable=False, default="")
    account_id = db.Column(db.String, nullable=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=lambda: int(time.time() * 1000))


# unambiguous alphabet (no 0/O/1/I) for human-readable join codes
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_session_code():
    while True:
        code = "".join(random.choice(CODE_ALPHABET) for _ in range(4))
        if db.session.get(Session, code) is None:
            return code


def account_to_dict(acc):
    try:
        crew = json.loads(acc.crew or "[]")
    except (ValueError, TypeError):
        crew = []
    return {"id": acc.id, "name": acc.name, "color": acc.color, "crew": crew, "kind": acc.kind or "master", "avatar": acc.avatar or "", "created": acc.created_at}


def session_to_dict(s):
    try:
        payload = json.loads(s.data or "{}")
    except (ValueError, TypeError):
        payload = {}
    players = payload.get("players", [])
    # Avatars travel with the round so every device shows each player's current
    # photo (a joiner pushes their own on claim). Photos are small (~10 KB).
    return {
        "code": s.code,
        "mode": s.mode,
        "venue": s.venue,
        "rev": s.rev,
        "finished": bool(payload.get("finished", False)),  # host pressed "Spiel beenden"
        "players": players,
    }


def game_to_dict(game):
    return {
        "id": game.id,
        "date": game.date,
        "venue": game.venue,
        "mode": game.mode,
        "code": game.code or "",
        "participants": [gp.account_id for gp in game.participants],
        "players": [
            {
                "id": p.ext_id or p.id,
                "account_id": p.account_id,
                "name": p.name,
                "color": p.color,
                "avatar": p.avatar or "",
                "scores": {str(s.hole): s.strokes for s in p.scores},
            }
            for p in game.players
        ],
    }


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "build": "analytics+tg+konten-log"})


@app.route("/api/games", methods=["GET"])
def list_games():
    account_id = request.args.get("account_id")
    if not account_id:
        games = Game.query.order_by(Game.date.desc().nullslast()).all()
        return jsonify([game_to_dict(g) for g in games])
    # games this account OWNS, plus games it TOOK PART in (one shared record)
    ids = {gid for (gid,) in db.session.query(Game.id).filter_by(account_id=account_id).all()}
    ids |= {gid for (gid,) in db.session.query(GameParticipant.game_id).filter_by(account_id=account_id).all()}
    if not ids:
        return jsonify([])
    games = Game.query.filter(Game.id.in_(ids)).order_by(Game.date.desc().nullslast()).all()
    return jsonify([game_to_dict(g) for g in games])


@app.route("/api/games", methods=["POST"])
def upsert_game():
    data = request.get_json(silent=True) or {}
    game_id = data.get("id")
    if not game_id:
        abort(400, "missing game id")

    account_id = data.get("account_id")
    if account_id and db.session.get(Account, account_id) is None:
        db.session.add(Account(id=account_id))

    game = db.session.get(Game, game_id)
    if game is None:
        game = Game(id=game_id)
        db.session.add(game)

    game.account_id = account_id
    game.date = data.get("date")
    game.venue = data.get("venue") or ""
    game.mode = data.get("mode") or ""
    game.code = data.get("code") or ""

    # Replace players/scores wholesale (cascade clears the old ones).
    game.players.clear()
    db.session.flush()

    for pdata in data.get("players", []):
        player = Player(
            ext_id=str(pdata.get("id")) if pdata.get("id") is not None else None,
            account_id=pdata.get("account_id"),
            name=pdata.get("name") or "",
            color=pdata.get("color") or "",
            avatar=pdata.get("avatar") or "",
        )
        for hole, strokes in (pdata.get("scores") or {}).items():
            player.scores.append(Score(hole=int(hole), strokes=strokes))
        game.players.append(player)

    # Replace the participant links (accounts that joined but don't own the game).
    # Only set when provided, so an edit that omits them doesn't wipe them.
    if data.get("participants") is not None:
        game.participants.clear()
        db.session.flush()
        for pid in data.get("participants") or []:
            if pid and pid != account_id:
                game.participants.append(GameParticipant(account_id=pid))

    db.session.commit()
    return jsonify(game_to_dict(game))


@app.route("/api/games/<game_id>", methods=["DELETE"])
def delete_game(game_id):
    game = db.session.get(Game, game_id)
    if game is None:
        abort(404)
    db.session.delete(game)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/account/<account_id>", methods=["GET"])
def get_account(account_id):
    acc = db.session.get(Account, account_id)
    if acc is None:
        abort(404)
    return jsonify(account_to_dict(acc))


@app.route("/api/accounts", methods=["GET"])
def get_accounts():
    """Batch photo lookup: ?ids=a,b,c -> [{id,name,color,avatar}]. The one place
    every avatar is resolved from — account id -> current photo."""
    raw = request.args.get("ids") or ""
    ids = [i for i in (s.strip() for s in raw.split(",")) if i][:200]
    if not ids:
        return jsonify([])
    accs = Account.query.filter(Account.id.in_(ids)).all()
    return jsonify([{"id": a.id, "name": a.name, "color": a.color, "avatar": a.avatar or ""} for a in accs])


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
    data = request.get_json(silent=True) or {}
    account_id = data.get("id")
    if not account_id:
        abort(400, "missing account id")
    acc = db.session.get(Account, account_id)
    is_new = acc is None
    if is_new:
        acc = Account(id=account_id)
        db.session.add(acc)
    if data.get("name") is not None:
        acc.name = data.get("name")
    if data.get("color") is not None:
        acc.color = data.get("color")
    if data.get("crew") is not None:
        acc.crew = json.dumps(data.get("crew"))
    if data.get("kind") is not None:
        acc.kind = data.get("kind")
    if data.get("avatar") is not None:
        acc.avatar = data.get("avatar")
    db.session.commit()
    if is_new and (acc.kind or "master") == "master":
        notify("🆕 Neues plonky-Konto: " + (acc.name or "ohne Name"))
    return jsonify(account_to_dict(acc))


@app.route("/api/session", methods=["POST"])
def create_session():
    data = request.get_json(silent=True) or {}
    players = [
        {
            "id": p.get("id"),
            "name": p.get("name") or "",
            "color": p.get("color") or "",
            "scores": p.get("scores") or {},
            "claimed": bool(p.get("claimed")),
            "host": (i == 0),  # the lead device that created the round
            "avatar": p.get("avatar") or "",
            # identity travels with the round: names/photos resolve live by account id
            "account_id": p.get("account_id"),
        }
        for i, p in enumerate(data.get("players") or [])
    ]
    s = Session(
        code=new_session_code(),
        mode=data.get("mode") or "sequential",
        venue=data.get("venue") or "",
        data=json.dumps({"players": players}),
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
    return jsonify(session_to_dict(s))


def _mutate_session(code):
    """Load a session for update, returning (session, payload, players) or aborting 404."""
    s = db.session.get(Session, (code or "").upper())
    if s is None:
        abort(404)
    try:
        payload = json.loads(s.data or "{}")
    except (ValueError, TypeError):
        payload = {}
    players = payload.get("players", [])
    return s, payload, players


@app.route("/api/session/<code>/score", methods=["POST"])
def session_score(code):
    body = request.get_json(silent=True) or {}
    pid, hole, strokes = body.get("player_id"), body.get("hole"), body.get("strokes")
    s, payload, players = _mutate_session(code)
    for p in players:
        if str(p.get("id")) == str(pid):
            scores = p.get("scores") or {}
            scores[str(hole)] = strokes
            p["scores"] = scores
            break
    payload["players"] = players
    s.data = json.dumps(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/players", methods=["POST"])
def session_players(code):
    """Replace the roster (host adding/removing players during setup),
    preserving claimed/scores for ids that already exist."""
    body = request.get_json(silent=True) or {}
    incoming = body.get("players") or []
    s, payload, existing = _mutate_session(code)
    by_id = {str(p.get("id")): p for p in existing}
    merged = []
    for i, p in enumerate(incoming):
        old = by_id.get(str(p.get("id"))) or {}
        # A claimed slot keeps the photo the joiner brought; otherwise take the
        # host's roster photo (falling back to whatever was there).
        avatar = old.get("avatar") if old.get("claimed") else (p.get("avatar") or old.get("avatar") or "")
        merged.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "color": p.get("color"),
            "scores": old.get("scores") or p.get("scores") or {},
            "claimed": bool(old.get("claimed")),
            "host": (i == 0),
            "avatar": avatar or "",
        })
        if old.get("account_id"):  # keep the slot↔account link across roster syncs
            merged[-1]["account_id"] = old.get("account_id")
        elif p.get("account_id"):  # host roster carries identities too (e.g. the host's own slot)
            merged[-1]["account_id"] = p.get("account_id")
    payload["players"] = merged
    s.data = json.dumps(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/claim", methods=["POST"])
def session_claim(code):
    body = request.get_json(silent=True) or {}
    pid = body.get("player_id")
    avatar = body.get("avatar")
    account_id = body.get("account_id")
    s, payload, players = _mutate_session(code)
    for p in players:
        if str(p.get("id")) == str(pid):
            p["claimed"] = True
            if avatar:  # the joining device brings its own photo into the round
                p["avatar"] = avatar
            if account_id:  # link this slot to the joiner's account (crew photo sync)
                p["account_id"] = account_id
            break
    payload["players"] = players
    s.data = json.dumps(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/leave", methods=["POST"])
def session_leave(code):
    """A joiner leaves before/without saving: free their slot so they (or anyone)
    can pick it again. Without this a left slot stays 'claimed' and locks them out."""
    body = request.get_json(silent=True) or {}
    pid = body.get("player_id")
    s, payload, players = _mutate_session(code)
    for p in players:
        if str(p.get("id")) == str(pid):
            p["claimed"] = False
            p.pop("account_id", None)  # slot is free again; next claimer relinks
            break
    payload["players"] = players
    s.data = json.dumps(payload)
    s.rev = (s.rev or 0) + 1
    db.session.commit()
    return jsonify(session_to_dict(s))


@app.route("/api/session/<code>/finish", methods=["POST"])
def session_finish(code):
    """Host ends the round. Every device sees finished=true and only then shows the winner."""
    s, payload, players = _mutate_session(code)
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
        db.session.delete(s)
        db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    data = request.get_json(silent=True) or {}
    msg = (data.get("message") or "").strip()
    rating = data.get("rating")
    if not msg and not rating:
        abort(400, "empty feedback")
    fb = Feedback(
        rating=rating if isinstance(rating, int) else None,
        message=msg[:4000],
        contact=(data.get("contact") or "")[:200],
        name=(data.get("name") or "")[:120],
        account_id=data.get("account_id"),
    )
    db.session.add(fb)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/feedback", methods=["GET"])
def list_feedback():
    """Private inbox. Requires ?key=<FEEDBACK_KEY env>. 403 if unset/mismatch."""
    admin = os.environ.get("FEEDBACK_KEY")
    if not admin or request.args.get("key") != admin:
        abort(403)
    items = Feedback.query.order_by(Feedback.created_at.desc()).limit(500).all()
    return jsonify([
        {"id": f.id, "rating": f.rating, "message": f.message, "contact": f.contact, "name": f.name, "created": f.created_at}
        for f in items
    ])


# ── Analytics-Dashboard (privat, nur mit ADMIN_KEY) ──────────────────────────
# Server-gerenderte Seite unter /admin/<ADMIN_KEY>. Alle Kennzahlen aus den
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
  footer{margin-top:26px;font-size:12px;color:var(--ink-3);text-align:center;}
  @media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr);}.col7,.col5{grid-column:span 12;}}
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
    accounts = Account.query.all()
    games = Game.query.all()
    now = int(time.time() * 1000)

    masters = [a for a in accounts if (a.kind or "master") == "master"]
    n_master = len(masters)
    n_comp = sum(1 for a in accounts if a.kind == "companion")
    total = len(accounts)

    def crew_len(a):
        try:
            return len(json.loads(a.crew or "[]"))
        except Exception:
            return 0

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
            crew = json.loads(a.crew or "[]")
        except Exception:
            crew = []
        for c in crew:
            nm = (c.get("name") or "").strip()
            if nm and nm.lower() not in seen:
                seen.add(nm.lower())
                names.append((nm, _col(c.get("color"), "#8A968F")))

    # Neue Konten (Haupt-Konten, neueste zuerst) mit Crew-Namen
    new_accounts = []
    for a in sorted(masters, key=lambda x: -(x.created_at or 0))[:30]:
        try:
            crew = json.loads(a.crew or "[]")
        except Exception:
            crew = []
        crew_names = [(c.get("name") or "").strip() for c in crew if (c.get("name") or "").strip()]
        new_accounts.append((a.name or "ohne Name", _fmt_dt(a.created_at, tz), _col(a.color), crew_names))

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
        names_html = "".join(f'<span class="nchip"><span class="avatar" style="background:{col}">{_initial(nm)}</span>{E(nm)}</span>' for nm, col in s["names"][:60])
        if len(s["names"]) > 60:
            names_html += f'<span class="nchip">…und {len(s["names"])-60} weitere</span>'
    else:
        names_html = '<div class="empty">Noch keine Namen.</div>'

    # Neue Konten (Log, neueste zuerst)
    if s["new_accounts"]:
        def _acct(nm, dt, col, cns):
            crew = ('<div class="crew">' + "".join('<span class="cchip">%s</span>' % E(cn) for cn in cns) + "</div>") if cns \
                else '<div class="nocrew">keine Crew</div>'
            return ('<div class="acct"><div class="ahead"><span class="avatar" style="background:%s">%s</span>'
                    '<span class="nm">%s</span><span class="dt">%s</span></div>%s</div>') % (col, _initial(nm), E(nm), E(dt), crew)
        acct_rows = "".join(_acct(nm, dt, col, cns) for nm, dt, col, cns in s["new_accounts"])
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
<div class="grid">
  <section class="card col7"><h2>Anlagen nach Häufigkeit <span class="tag">gespielte Runden</span></h2>
    <table><thead><tr><th>Anlage</th><th style="width:40%">&nbsp;</th><th class="r">Runden</th></tr></thead><tbody>{vrows}</tbody></table></section>
  <section class="card col5"><h2>Anmeldungen <span class="tag">letzte 8 Wochen</span></h2>
    <div class="chart">{bars}</div><div class="xaxis">{xaxis}</div></section>
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
  <section class="card col7"><h2>Namensliste <span class="tag">Konten &amp; Crew</span></h2><div class="names">{names_html}</div>
    <p class="caption">Geschlecht wird bewusst nicht erfasst — bei Interesse m/w am Namen ablesen.</p></section>
  <section class="card col5"><h2>Neue Konten <span class="tag">neueste zuerst</span></h2><div class="acct-log">{acct_rows}</div></section>
</div>
<footer>plonky Analytics · nur über den geheimen /admin-Schlüssel erreichbar</footer>
</div></body></html>"""


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


@app.route("/admin/<key>")
def admin_dashboard(key):
    admin = os.environ.get("ADMIN_KEY")
    if not admin or key != admin:
        abort(403)
    global now_ms
    now_ms = int(time.time() * 1000)
    return _admin_html(_admin_stats())


@app.route("/")
@app.route("/m/<token>")
@app.route("/j/<token>")
@app.route("/fb/<token>")
@app.route("/p/<token>")  # per-venue QR link: /p/<venue-slug> — frontend reads it, sets the active venue
def index(token=None):
    return send_from_directory(APP_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in ALLOWED_EXT:
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

    player_cols = {c["name"] for c in inspector.get_columns("player")}
    if "avatar" not in player_cols:
        db.session.execute(text("ALTER TABLE player ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"))
        db.session.commit()
    if "account_id" not in player_cols:
        db.session.execute(text("ALTER TABLE player ADD COLUMN account_id VARCHAR"))
        db.session.commit()

    game_cols = {c["name"] for c in inspector.get_columns("game")}
    if "code" not in game_cols:
        db.session.execute(text("ALTER TABLE game ADD COLUMN code VARCHAR NOT NULL DEFAULT ''"))
        db.session.commit()


with app.app_context():
    db.create_all()
    ensure_schema()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
