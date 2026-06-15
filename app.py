import json
import os
import random
import time

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
    name = db.Column(db.String, nullable=False, default="")
    color = db.Column(db.String, nullable=False, default="")
    avatar = db.Column(db.Text, nullable=False, default="")  # snapshot photo so saved games show faces too
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
        "participants": [gp.account_id for gp in game.participants],
        "players": [
            {
                "id": p.ext_id or p.id,
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
    return jsonify({"ok": True})


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

    # Replace players/scores wholesale (cascade clears the old ones).
    game.players.clear()
    db.session.flush()

    for pdata in data.get("players", []):
        player = Player(
            ext_id=str(pdata.get("id")) if pdata.get("id") is not None else None,
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


@app.route("/api/account", methods=["POST"])
def upsert_account():
    data = request.get_json(silent=True) or {}
    account_id = data.get("id")
    if not account_id:
        abort(400, "missing account id")
    acc = db.session.get(Account, account_id)
    if acc is None:
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


@app.route("/")
@app.route("/m/<token>")
@app.route("/j/<token>")
@app.route("/fb/<token>")
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


with app.app_context():
    db.create_all()
    ensure_schema()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
