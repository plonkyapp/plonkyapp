import os
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


class Player(db.Model):
    __tablename__ = "player"
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.String, db.ForeignKey("game.id", ondelete="CASCADE"), nullable=False, index=True)
    ext_id = db.Column(db.String, nullable=True)
    name = db.Column(db.String, nullable=False, default="")
    color = db.Column(db.String, nullable=False, default="")
    scores = db.relationship(
        "Score", backref="player", cascade="all, delete-orphan", passive_deletes=True
    )


class Score(db.Model):
    __tablename__ = "score"
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey("player.id", ondelete="CASCADE"), nullable=False, index=True)
    hole = db.Column(db.Integer, nullable=False)
    strokes = db.Column(db.Integer, nullable=True)


def game_to_dict(game):
    return {
        "id": game.id,
        "date": game.date,
        "venue": game.venue,
        "mode": game.mode,
        "players": [
            {
                "id": p.ext_id or p.id,
                "name": p.name,
                "color": p.color,
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
    query = Game.query
    if account_id:
        query = query.filter_by(account_id=account_id)
    games = query.order_by(Game.date.desc().nullslast()).all()
    return jsonify([game_to_dict(g) for g in games])


@app.route("/api/games", methods=["POST"])
def upsert_game():
    data = request.get_json(silent=True) or {}
    game_id = data.get("id")
    if not game_id:
        abort(400, "missing game id")

    game = db.session.get(Game, game_id)
    if game is None:
        game = Game(id=game_id)
        db.session.add(game)

    game.account_id = data.get("account_id")
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
        )
        for hole, strokes in (pdata.get("scores") or {}).items():
            player.scores.append(Score(hole=int(hole), strokes=strokes))
        game.players.append(player)

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


@app.route("/")
def index():
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


with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
