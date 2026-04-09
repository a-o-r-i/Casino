import base64
import hashlib
import json
import math
import os
import secrets
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from threading import Lock, RLock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from flask import (
    Flask,
    abort,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)


load_dotenv()


DISCORD_API_BASE_URL = "https://discord.com/api/v10"
DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize"
DISCORD_TOKEN_URL = f"{DISCORD_API_BASE_URL}/oauth2/token"
DISCORD_USER_URL = f"{DISCORD_API_BASE_URL}/users/@me"
DISCORD_SCOPE = "identify"
DISCORD_HTTP_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
}

STARTING_BALANCE_CENTS = 10000
COINFLIP_COUNTDOWN_SECONDS = 5
DICE_COUNTDOWN_SECONDS = 5
DICE_FIRST_TO_TARGETS = {1, 3, 5}
BOT_PROFILE = {
    "avatar_url": None,
    "display_name": "House Bot",
    "id": "bot-house",
    "username": "house-bot",
}

USER_BALANCES = {}
USER_PROFILES = {
    BOT_PROFILE["id"]: BOT_PROFILE.copy(),
}
COINFLIP_SESSIONS = {}
DICE_SESSIONS = {}
STATE_LOCK = Lock()
STATE_LOCK = RLock()
USER_STATS = {}
USER_BET_HISTORY = {}


app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)


def format_money(amount_cents):
    dollars = amount_cents / 100

    if amount_cents % 100 == 0:
        return f"${int(dollars):,}"

    return f"${dollars:,.2f}"


@app.template_filter("money")
def money_filter(amount_cents):
    return format_money(amount_cents)


@app.template_filter("relative_time")
def relative_time_filter(timestamp):
    import time as _time

    if not timestamp:
        return "Unknown"

    delta = int(_time.time() - timestamp)

    if delta < 60:
        return f"{delta}s ago"
    if delta < 3_600:
        minutes = delta // 60
        return f"{minutes}m ago"
    if delta < 86_400:
        hours = delta // 3_600
        return f"{hours}h ago"
    if delta < 2_592_000:
        days = delta // 86_400
        return f"{days}d ago"

    from datetime import datetime as _datetime

    return _datetime.fromtimestamp(timestamp).strftime("%b %d, %Y")


def get_current_user():
    return session.get("discord_user")


def get_current_user_id():
    current_user = get_current_user()

    if not current_user:
        return None

    return current_user["id"]


def get_static_asset_version(filename):
    try:
        asset_path = os.path.join(app.static_folder, filename)
        return int(os.path.getmtime(asset_path))
    except (OSError, TypeError, ValueError):
        return 0


def build_static_asset_url(filename):
    return url_for(
        "static",
        filename=filename,
        v=get_static_asset_version(filename),
    )


def make_user_snapshot(user_profile):
    return {
        "avatar_url": user_profile.get("avatar_url"),
        "display_name": user_profile.get("display_name") or user_profile.get("username"),
        "id": user_profile["id"],
        "username": user_profile["username"],
    }


def remember_user_profile(user_profile):
    if not user_profile:
        return None

    user_snapshot = make_user_snapshot(user_profile)
    USER_PROFILES[user_snapshot["id"]] = user_snapshot
    return user_snapshot


def ensure_user_balance(user_profile):
    if not user_profile:
        return

    with STATE_LOCK:
        user_snapshot = remember_user_profile(user_profile)
        if user_snapshot["id"] not in USER_BALANCES:
            USER_BALANCES.setdefault(user_snapshot["id"], STARTING_BALANCE_CENTS)
            stats = USER_STATS.setdefault(user_snapshot["id"], {
                "total_deposited_cents": 0,
                "total_wagered_cents": 0,
                "bets_won": 0,
                "bets_lost": 0,
                "total_bets": 0,
            })


def get_user_balance(user_id):
    return USER_BALANCES.get(user_id, STARTING_BALANCE_CENTS)


def set_user_balance(user_id, amount_cents):
    USER_BALANCES[user_id] = amount_cents


def ensure_user_stats(user_profile):
    if not user_profile:
        return

    with STATE_LOCK:
        user_snapshot = remember_user_profile(user_profile)
        USER_STATS.setdefault(user_snapshot["id"], {
            "total_deposited_cents": 0,
            "total_wagered_cents": 0,
            "bets_won": 0,
            "bets_lost": 0,
            "total_bets": 0,
        })


def increment_stats(user_id, bet_cents, won):
    with STATE_LOCK:
        stats = USER_STATS.setdefault(user_id, {
            "total_deposited_cents": 0,
            "total_wagered_cents": 0,
            "bets_won": 0,
            "bets_lost": 0,
            "total_bets": 0,
        })
        stats["total_wagered_cents"] += bet_cents
        stats["total_bets"] += 1
        if won:
            stats["bets_won"] += 1
        else:
            stats["bets_lost"] += 1


def add_bet_record(user_id, game, bet_cents, choice, result_side, pot_cents, did_win, session_id):
    with STATE_LOCK:
        bets = USER_BET_HISTORY.setdefault(user_id, [])
        bets.append({
            "bets_cents": bet_cents,
            "choice": choice,
            "did_win": did_win,
            "game": game,
            "pot_cents": pot_cents,
            "result_side": result_side,
            "session_id": session_id,
            "timestamp": time.time(),
            "bet_display": format_money(bet_cents),
            "pot_display": format_money(pot_cents),
        })


def get_user_stats(user_id):
    return USER_STATS.setdefault(user_id, {
        "total_deposited_cents": 0,
        "total_wagered_cents": 0,
        "bets_won": 0,
        "bets_lost": 0,
        "total_bets": 0,
    })


def get_user_bet_history(user_id):
    return list(USER_BET_HISTORY.get(user_id, []))


def build_state_version(payload):
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha1(payload_json.encode("utf-8")).hexdigest()[:16]


def parse_bet_amount_to_cents(raw_value):
    try:
        parsed_value = Decimal(str(raw_value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Enter a valid bet amount.")

    if parsed_value < Decimal("1.00"):
        raise ValueError("The minimum bet is $1.")

    return int(parsed_value * 100)


def other_coin_side(side_name):
    return "Tails" if side_name == "Heads" else "Heads"


def flip_coin_side():
    return "Heads" if secrets.randbelow(2) == 0 else "Tails"


def build_coinflip_session_id():
    return secrets.token_hex(5)


def build_dice_session_id():
    return secrets.token_hex(5)


def other_dice_side(side_name):
    return "High" if side_name == "Low" else "Low"


def roll_die_face():
    return secrets.randbelow(6) + 1


def dice_side_matches_face(side_name, result_face):
    if side_name == "Low":
        return result_face <= 3

    return result_face >= 4


def get_dice_session_mode(dice_session):
    return dice_session.get("mode") or "classic"


def is_first_to_dice_session(dice_session):
    return get_dice_session_mode(dice_session) in {"first_to", "double"}


def is_double_dice_session(dice_session):
    return bool(dice_session.get("double_roll")) or get_dice_session_mode(dice_session) == "double"


def dice_session_is_resolved(dice_session):
    return bool(dice_session.get("winner_id"))


def get_dice_target_wins(dice_session):
    target_wins = dice_session.get("target_wins")
    return target_wins if target_wins in DICE_FIRST_TO_TARGETS else 1


def get_dice_mode_label(dice_session):
    if is_first_to_dice_session(dice_session):
        base_label = f"FT{get_dice_target_wins(dice_session)}"
        return f"{base_label} Double" if is_double_dice_session(dice_session) else base_label

    return "Classic"


def build_dice_side_hint(side_name):
    return "Wins on 1 to 3" if side_name == "Low" else "Wins on 4 to 6"


def build_first_to_dice_match(target_wins, double_roll=False):
    creator_score = 0
    opponent_score = 0
    rounds = []
    round_guard = 0

    while creator_score < target_wins and opponent_score < target_wins:
        round_guard += 1
        round_data = {
            "creator_score": creator_score,
            "opponent_score": opponent_score,
            "round_number": len(rounds) + 1,
        }

        if double_roll:
            creator_faces = [roll_die_face(), roll_die_face()]
            opponent_faces = [roll_die_face(), roll_die_face()]
            creator_total = sum(creator_faces)
            opponent_total = sum(opponent_faces)

            if creator_total == opponent_total and round_guard > 128:
                opponent_faces[1] = opponent_faces[1] - 1 if opponent_faces[1] > 1 else opponent_faces[1] + 1
                opponent_total = sum(opponent_faces)

            if creator_total > opponent_total:
                round_winner = "creator"
                creator_score += 1
            elif opponent_total > creator_total:
                round_winner = "opponent"
                opponent_score += 1
            else:
                round_winner = "tie"

            round_data.update({
                "creator_faces": creator_faces,
                "creator_total": creator_total,
                "opponent_faces": opponent_faces,
                "opponent_total": opponent_total,
            })
        else:
            creator_face = roll_die_face()
            opponent_face = roll_die_face()

            if creator_face == opponent_face and round_guard > 128:
                opponent_face = 1 if creator_face > 1 else 6

            if creator_face > opponent_face:
                round_winner = "creator"
                creator_score += 1
            elif opponent_face > creator_face:
                round_winner = "opponent"
                opponent_score += 1
            else:
                round_winner = "tie"

            round_data.update({
                "creator_face": creator_face,
                "opponent_face": opponent_face,
            })

        round_data["creator_score"] = creator_score
        round_data["opponent_score"] = opponent_score
        round_data["winner"] = round_winner
        rounds.append(round_data)

    return {
        "creator_score": creator_score,
        "opponent_score": opponent_score,
        "rounds": rounds,
        "winner": "creator" if creator_score >= target_wins else "opponent",
    }


def settle_dice_session(dice_session, winning_user):
    dice_session["winner_id"] = winning_user["id"]
    dice_session["winner_name"] = winning_user["display_name"]
    dice_session["resolved_at"] = time.time()

    if winning_user["id"] != BOT_PROFILE["id"]:
        payout_cents = dice_session["bet_cents"] * 2
        set_user_balance(winning_user["id"], get_user_balance(winning_user["id"]) + payout_cents)

    for player in [dice_session["creator"], dice_session.get("opponent")]:
        if not player or player["id"] == BOT_PROFILE["id"] or not dice_session["winner_id"]:
            continue

        player_won = player["id"] == dice_session["winner_id"]

        if is_first_to_dice_session(dice_session):
            player_choice = get_dice_mode_label(dice_session)
            player_result = f"{dice_session.get('creator_score', 0)}-{dice_session.get('opponent_score', 0)}"
        else:
            player_choice = (
                dice_session["creator_side"]
                if player["id"] == dice_session["creator"]["id"]
                else dice_session.get("opponent_side")
            )
            player_result = str(dice_session["result_face"])

        increment_stats(player["id"], dice_session["bet_cents"], player_won)
        add_bet_record(
            player["id"],
            "Dice",
            dice_session["bet_cents"],
            player_choice,
            player_result,
            dice_session["bet_cents"] * 2,
            player_won,
            dice_session["id"],
        )


def is_discord_oauth_ready():
    return bool(os.environ.get("DISCORD_CLIENT_ID") and os.environ.get("DISCORD_CLIENT_SECRET"))


def get_discord_oauth_config():
    if not is_discord_oauth_ready():
        return None

    redirect_uri = os.environ.get("DISCORD_REDIRECT_URI")

    if not redirect_uri:
        redirect_uri = url_for("discord_callback", _external=True)

    return {
        "client_id": os.environ["DISCORD_CLIENT_ID"],
        "client_secret": os.environ["DISCORD_CLIENT_SECRET"],
        "redirect_uri": redirect_uri,
    }


def is_safe_redirect_target(target):
    if not target:
        return False

    parsed_target = urlparse(target)
    return not parsed_target.scheme and not parsed_target.netloc and target.startswith("/")


def exchange_code_for_token(code, oauth_config):
    payload = urlencode(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": oauth_config["redirect_uri"],
        }
    ).encode("utf-8")
    basic_credentials = base64.b64encode(
        f"{oauth_config['client_id']}:{oauth_config['client_secret']}".encode("utf-8")
    ).decode("utf-8")
    request_headers = {
        **DISCORD_HTTP_HEADERS,
        "Authorization": f"Basic {basic_credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://discord.com",
        "Referer": "https://discord.com/",
    }
    token_request = Request(
        DISCORD_TOKEN_URL,
        data=payload,
        headers=request_headers,
        method="POST",
    )

    try:
        with urlopen(token_request, timeout=10) as response:
            return json.load(response)
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(format_discord_api_error("Discord token exchange failed", error_body, exc)) from exc
    except URLError as exc:
        raise RuntimeError("Discord token exchange failed. Check your network connection.") from exc


def fetch_discord_user(access_token):
    user_request = Request(
        DISCORD_USER_URL,
        headers={
            **DISCORD_HTTP_HEADERS,
            "Authorization": f"Bearer {access_token}",
        },
        method="GET",
    )

    try:
        with urlopen(user_request, timeout=10) as response:
            return json.load(response)
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(format_discord_api_error("Discord user lookup failed", error_body, exc)) from exc
    except URLError as exc:
        raise RuntimeError("Discord user lookup failed. Check your network connection.") from exc


def format_discord_api_error(prefix, error_body, exc):
    try:
        error_payload = json.loads(error_body) if error_body else {}
    except json.JSONDecodeError:
        error_payload = {}

    if error_payload.get("error_code") == 1010 or error_payload.get("cloudflare_error"):
        return (
            f"{prefix}. Discord blocked the server request through Cloudflare "
            f"({error_payload.get('error_name', 'access_denied')}). Restart Flask and try again."
        )

    detail = error_payload.get("message") or error_payload.get("detail") or exc.reason
    return f"{prefix}. {detail}"


def build_discord_user_profile(discord_user):
    avatar_hash = discord_user.get("avatar")
    avatar_url = None

    if avatar_hash:
        avatar_extension = "gif" if avatar_hash.startswith("a_") else "png"
        avatar_url = (
            f"https://cdn.discordapp.com/avatars/{discord_user['id']}/{avatar_hash}."
            f"{avatar_extension}?size=128"
        )

    return {
        "avatar_url": avatar_url,
        "display_name": discord_user.get("global_name") or discord_user.get("username"),
        "id": discord_user["id"],
        "username": discord_user["username"],
    }


def login_required(view_function):
    @wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if "discord_user" in session:
            return view_function(*args, **kwargs)

        session["post_login_redirect"] = request.path
        flash("Sign in with Discord to access that page.", "error")
        return redirect(url_for("play"))

    return wrapped_view


def sync_coinflip_session_state(coinflip_session):
    if coinflip_session["result_side"]:
        return

    countdown_started_at = coinflip_session["countdown_started_at"]
    opponent = coinflip_session["opponent"]

    if not countdown_started_at or not opponent:
        return

    countdown_end = countdown_started_at + COINFLIP_COUNTDOWN_SECONDS

    if time.time() < countdown_end:
        return

    result_side = flip_coin_side()
    winning_user = (
        coinflip_session["creator"]
        if coinflip_session["creator_choice"] == result_side
        else coinflip_session["opponent"]
    )
    coinflip_session["result_side"] = result_side
    coinflip_session["winner_id"] = winning_user["id"]
    coinflip_session["winner_name"] = winning_user["display_name"]
    coinflip_session["resolved_at"] = time.time()

    if winning_user["id"] != BOT_PROFILE["id"]:
        payout_cents = coinflip_session["bet_cents"] * 2
        set_user_balance(winning_user["id"], get_user_balance(winning_user["id"]) + payout_cents)

    for player in [coinflip_session["creator"], coinflip_session.get("opponent")]:
        if player and player["id"] != BOT_PROFILE["id"] and coinflip_session["winner_id"]:
            player_won = player["id"] == coinflip_session["winner_id"]
            increment_stats(player["id"], coinflip_session["bet_cents"], player_won)
            if player["id"] == coinflip_session["creator"]["id"]:
                player_choice = coinflip_session["creator_choice"]
            else:
                player_choice = coinflip_session.get("opponent_choice")

            add_bet_record(
                player["id"],
                "Coinflip",
                coinflip_session["bet_cents"],
                player_choice,
                coinflip_session["result_side"],
                coinflip_session["bet_cents"] * 2,
                player_won,
                coinflip_session["id"],
            )


def sync_all_coinflip_sessions():
    for coinflip_session in COINFLIP_SESSIONS.values():
        sync_coinflip_session_state(coinflip_session)


def sync_dice_session_state(dice_session):
    if dice_session_is_resolved(dice_session):
        return

    countdown_started_at = dice_session["countdown_started_at"]
    opponent = dice_session["opponent"]

    if not countdown_started_at or not opponent:
        return

    countdown_end = countdown_started_at + DICE_COUNTDOWN_SECONDS

    if time.time() < countdown_end:
        return

    if is_first_to_dice_session(dice_session):
        match_result = build_first_to_dice_match(
            get_dice_target_wins(dice_session),
            double_roll=is_double_dice_session(dice_session),
        )
        dice_session["creator_score"] = match_result["creator_score"]
        dice_session["opponent_score"] = match_result["opponent_score"]
        dice_session["rounds"] = match_result["rounds"]
        winning_user = (
            dice_session["creator"]
            if match_result["winner"] == "creator"
            else dice_session["opponent"]
        )
        settle_dice_session(dice_session, winning_user)
        return

    result_face = roll_die_face()
    winning_user = (
        dice_session["creator"]
        if dice_side_matches_face(dice_session["creator_side"], result_face)
        else dice_session["opponent"]
    )
    dice_session["result_face"] = result_face
    settle_dice_session(dice_session, winning_user)


def sync_all_dice_sessions():
    for dice_session in DICE_SESSIONS.values():
        sync_dice_session_state(dice_session)


def sync_all_game_sessions():
    sync_all_coinflip_sessions()
    sync_all_dice_sessions()


def build_coinflip_session_state(coinflip_session, current_user_id):
    sync_coinflip_session_state(coinflip_session)

    opponent = coinflip_session["opponent"]
    is_creator = current_user_id == coinflip_session["creator"]["id"]
    countdown_ends_at = None
    current_user_choice = None

    if current_user_id == coinflip_session["creator"]["id"]:
        current_user_choice = coinflip_session["creator_choice"]
    elif opponent and current_user_id == opponent["id"]:
        current_user_choice = coinflip_session["opponent_choice"]

    if coinflip_session["result_side"]:
        status = "resolved"
        countdown_remaining = 0
        status_text = f"{coinflip_session['winner_name']} wins on {coinflip_session['result_side']}."
    elif opponent:
        status = "countdown"
        countdown_ends_at = coinflip_session["countdown_started_at"] + COINFLIP_COUNTDOWN_SECONDS
        countdown_remaining = max(0, math.ceil(countdown_ends_at - time.time()))
        status_text = f"Starts in {countdown_remaining} seconds."
    else:
        status = "open"
        countdown_remaining = None
        status_text = "Waiting for player..."

    did_win = None

    if coinflip_session["winner_id"]:
        did_win = coinflip_session["winner_id"] == current_user_id

    return {
        "bet_cents": coinflip_session["bet_cents"],
        "bet_display": format_money(coinflip_session["bet_cents"]),
        "can_call_bot": is_creator and not opponent and not coinflip_session["result_side"],
        "countdown_ends_at": countdown_ends_at,
        "countdown_remaining": countdown_remaining,
        "creator": coinflip_session["creator"],
        "creator_choice": coinflip_session["creator_choice"],
        "current_balance_display": format_money(get_user_balance(current_user_id)) if current_user_id else None,
        "current_user_choice": current_user_choice,
        "did_win": did_win,
        "id": coinflip_session["id"],
        "is_creator": is_creator,
        "opponent": opponent,
        "opponent_choice": coinflip_session["opponent_choice"],
        "pot_cents": coinflip_session["bet_cents"] * 2,
        "pot_display": format_money(coinflip_session["bet_cents"] * 2),
        "result_side": coinflip_session["result_side"],
        "status": status,
        "status_text": status_text,
        "winner_id": coinflip_session["winner_id"],
        "winner_name": coinflip_session["winner_name"],
    }


def build_coinflip_lobby_sessions(current_user_id):
    sessions = []
    session_summary = {
        "live": 0,
        "open": 0,
        "resolved": 0,
    }
    status_priority = {
        "countdown": 0,
        "open": 1,
        "resolved": 2,
    }

    for coinflip_session in COINFLIP_SESSIONS.values():
        session_state = build_coinflip_session_state(coinflip_session, current_user_id)
        is_owner = session_state["creator"]["id"] == current_user_id
        is_joinable = session_state["status"] == "open" and not is_owner

        if session_state["status"] == "open":
            session_summary["open"] += 1
        elif session_state["status"] == "countdown":
            session_summary["live"] += 1
        elif session_state["status"] == "resolved":
            session_summary["resolved"] += 1

        sessions.append(
            {
                "bet_display": session_state["bet_display"],
                "countdown_ends_at": session_state["countdown_ends_at"],
                "created_at": coinflip_session["created_at"],
                "creator_choice": session_state["creator_choice"],
                "creator_name": session_state["creator"]["display_name"],
                "id": session_state["id"],
                "is_joinable": is_joinable,
                "is_owner": is_owner,
                "join_url": url_for("join_coinflip_session", session_id=session_state["id"]),
                "opponent_name": session_state["opponent"]["display_name"] if session_state["opponent"] else None,
                "pot_display": session_state["pot_display"],
                "status": session_state["status"],
                "status_text": session_state["status_text"],
                "view_url": url_for("coinflip_session", session_id=session_state["id"]),
            }
        )

    sessions.sort(key=lambda item: (status_priority[item["status"]], -item["created_at"]))
    return sessions, session_summary


def build_coinflip_lobby_payload(current_user_id):
    coinflip_sessions, session_summary = build_coinflip_lobby_sessions(current_user_id)
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None
    version_payload = {
        "current_balance_cents": current_balance_cents,
        "session_summary": session_summary,
        "sessions": [
            {
                "bet_display": coinflip_session["bet_display"],
                "countdown_ends_at": coinflip_session["countdown_ends_at"],
                "created_at": coinflip_session["created_at"],
                "creator_choice": coinflip_session["creator_choice"],
                "creator_name": coinflip_session["creator_name"],
                "id": coinflip_session["id"],
                "is_joinable": coinflip_session["is_joinable"],
                "pot_display": coinflip_session["pot_display"],
                "status": coinflip_session["status"],
                "view_url": coinflip_session["view_url"],
            }
            for coinflip_session in coinflip_sessions
        ],
    }

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents) if current_balance_cents is not None else None,
        "poll_interval_ms": 1400 if session_summary["live"] else 2600,
        "session_summary": session_summary,
        "sessions": coinflip_sessions,
        "version": build_state_version(version_payload),
    }


def build_dice_session_state(dice_session, current_user_id):
    sync_dice_session_state(dice_session)

    opponent = dice_session["opponent"]
    is_creator = current_user_id == dice_session["creator"]["id"]
    countdown_ends_at = None
    mode = get_dice_session_mode(dice_session)
    is_first_to = is_first_to_dice_session(dice_session)
    is_double_roll = is_double_dice_session(dice_session)
    target_wins = get_dice_target_wins(dice_session) if is_first_to else None
    if is_first_to:
        creator_label = get_dice_mode_label(dice_session)
        opponent_label = get_dice_mode_label(dice_session)
        if is_double_roll:
            creator_hint = f"First to {target_wins} round wins with two dice per throw"
            opponent_hint = f"First to {target_wins} round wins with two dice per throw"
        else:
            creator_hint = f"First to {target_wins} round wins"
            opponent_hint = f"First to {target_wins} round wins"
    else:
        creator_label = dice_session["creator_side"]
        opponent_label = dice_session["opponent_side"]
        creator_hint = build_dice_side_hint(dice_session["creator_side"])
        opponent_hint = build_dice_side_hint(dice_session["opponent_side"])

    if dice_session_is_resolved(dice_session):
        status = "resolved"
        countdown_remaining = 0
        if is_first_to:
            status_text = (
                f"{dice_session['winner_name']} wins "
                f"{dice_session.get('creator_score', 0)}-{dice_session.get('opponent_score', 0)}."
            )
        else:
            status_text = f"{dice_session['winner_name']} wins on {dice_session['result_face']}."
    elif opponent:
        status = "countdown"
        countdown_ends_at = dice_session["countdown_started_at"] + DICE_COUNTDOWN_SECONDS
        countdown_remaining = max(0, math.ceil(countdown_ends_at - time.time()))
        status_text = f"Rolls in {countdown_remaining} seconds."
    else:
        status = "open"
        countdown_remaining = None
        status_text = "Waiting for player..."

    did_win = None

    if dice_session["winner_id"]:
        did_win = dice_session["winner_id"] == current_user_id

    return {
        "bet_cents": dice_session["bet_cents"],
        "bet_display": format_money(dice_session["bet_cents"]),
        "can_call_bot": is_creator and not opponent and not dice_session_is_resolved(dice_session),
        "countdown_ends_at": countdown_ends_at,
        "countdown_remaining": countdown_remaining,
        "creator": dice_session["creator"],
        "creator_hint": creator_hint,
        "creator_label": creator_label,
        "creator_score": dice_session.get("creator_score", 0),
        "current_balance_display": format_money(get_user_balance(current_user_id)) if current_user_id else None,
        "did_win": did_win,
        "id": dice_session["id"],
        "is_creator": is_creator,
        "is_double_roll": is_double_roll,
        "is_first_to": is_first_to,
        "mode": mode,
        "mode_label": get_dice_mode_label(dice_session),
        "opponent": opponent,
        "opponent_hint": opponent_hint,
        "opponent_label": opponent_label,
        "opponent_score": dice_session.get("opponent_score", 0),
        "pot_cents": dice_session["bet_cents"] * 2,
        "pot_display": format_money(dice_session["bet_cents"] * 2),
        "result_face": dice_session["result_face"],
        "rounds": dice_session.get("rounds", []),
        "status": status,
        "status_text": status_text,
        "target_wins": target_wins,
        "winner_id": dice_session["winner_id"],
        "winner_name": dice_session["winner_name"],
    }


def build_dice_lobby_sessions(current_user_id):
    sessions = []
    session_summary = {
        "live": 0,
        "open": 0,
        "resolved": 0,
    }
    status_priority = {
        "countdown": 0,
        "open": 1,
        "resolved": 2,
    }

    for dice_session in DICE_SESSIONS.values():
        session_state = build_dice_session_state(dice_session, current_user_id)
        is_owner = session_state["creator"]["id"] == current_user_id
        is_joinable = session_state["status"] == "open" and not is_owner

        if session_state["status"] == "open":
            session_summary["open"] += 1
        elif session_state["status"] == "countdown":
            session_summary["live"] += 1
        elif session_state["status"] == "resolved":
            session_summary["resolved"] += 1

        sessions.append(
            {
                "bet_display": session_state["bet_display"],
                "countdown_ends_at": session_state["countdown_ends_at"],
                "created_at": dice_session["created_at"],
                "creator_name": session_state["creator"]["display_name"],
                "id": session_state["id"],
                "is_joinable": is_joinable,
                "is_owner": is_owner,
                "join_description": (
                    f"{session_state['creator']['display_name']} picked {session_state['creator_label']}. "
                    f"You will join for {session_state['bet_display']}."
                    if not session_state["is_first_to"]
                    else (
                        f"{session_state['creator']['display_name']} created a {session_state['mode_label']} match. "
                        f"{'Two dice per player roll each round. ' if session_state['is_double_roll'] else ''}"
                        f"First to {session_state['target_wins']} round wins for {session_state['bet_display']}."
                    )
                ),
                "join_url": url_for("join_dice_session", session_id=session_state["id"]),
                "mode": session_state["mode"],
                "mode_label": session_state["mode_label"],
                "opponent_name": session_state["opponent"]["display_name"] if session_state["opponent"] else None,
                "pot_display": session_state["pot_display"],
                "session_label": (
                    session_state["mode_label"]
                    if session_state["is_first_to"]
                    else session_state["creator_label"]
                ),
                "status": session_state["status"],
                "status_text": session_state["status_text"],
                "target_wins": session_state["target_wins"],
                "view_url": url_for("dice_session", session_id=session_state["id"]),
            }
        )

    sessions.sort(key=lambda item: (status_priority[item["status"]], -item["created_at"]))
    return sessions, session_summary


def build_dice_lobby_payload(current_user_id):
    dice_sessions, session_summary = build_dice_lobby_sessions(current_user_id)
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None
    version_payload = {
        "current_balance_cents": current_balance_cents,
        "session_summary": session_summary,
        "sessions": [
            {
                "bet_display": dice_session["bet_display"],
                "countdown_ends_at": dice_session["countdown_ends_at"],
                "created_at": dice_session["created_at"],
                "creator_name": dice_session["creator_name"],
                "id": dice_session["id"],
                "is_joinable": dice_session["is_joinable"],
                "mode": dice_session["mode"],
                "mode_label": dice_session["mode_label"],
                "pot_display": dice_session["pot_display"],
                "session_label": dice_session["session_label"],
                "status": dice_session["status"],
                "target_wins": dice_session["target_wins"],
                "view_url": dice_session["view_url"],
            }
            for dice_session in dice_sessions
        ],
    }

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents) if current_balance_cents is not None else None,
        "poll_interval_ms": 1400 if session_summary["live"] else 2600,
        "session_summary": session_summary,
        "sessions": dice_sessions,
        "version": build_state_version(version_payload),
    }


def build_leaderboard_rows():
    leaderboard_rows = []

    for user_id, balance_cents in USER_BALANCES.items():
        user_profile = USER_PROFILES.get(user_id) or {}
        leaderboard_rows.append(
            {
                "balance_cents": balance_cents,
                "balance_display": format_money(balance_cents),
                "display_name": user_profile.get("display_name") or "Unknown",
                "id": user_id,
            }
        )

    leaderboard_rows.sort(key=lambda row: row["balance_cents"], reverse=True)
    return leaderboard_rows


def build_leaderboard_payload(current_user_id):
    leaderboard_rows = build_leaderboard_rows()
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None
    version_payload = {
        "current_balance_cents": current_balance_cents,
        "rows": [
            {
                "balance_cents": row["balance_cents"],
                "display_name": row["display_name"],
                "id": row["id"],
            }
            for row in leaderboard_rows
        ],
    }

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents) if current_balance_cents is not None else None,
        "poll_interval_ms": 5000,
        "rows": leaderboard_rows,
        "version": build_state_version(version_payload),
    }


def get_coinflip_session_or_404(session_id):
    coinflip_session = COINFLIP_SESSIONS.get(session_id)

    if not coinflip_session:
        abort(404)

    return coinflip_session


def get_dice_session_or_404(session_id):
    dice_session = DICE_SESSIONS.get(session_id)

    if not dice_session:
        abort(404)

    return dice_session


@app.before_request
def load_current_user():
    g.discord_user = session.get("discord_user")
    g.current_balance_cents = None

    if g.discord_user:
        ensure_user_balance(g.discord_user)
        g.current_balance_cents = get_user_balance(g.discord_user["id"])


@app.context_processor
def inject_auth_state():
    return {
        "asset_url": build_static_asset_url,
        "current_balance_cents": g.current_balance_cents,
        "current_balance_display": format_money(g.current_balance_cents) if g.current_balance_cents is not None else None,
        "discord_oauth_ready": is_discord_oauth_ready(),
        "discord_user": session.get("discord_user"),
        "is_authenticated": "discord_user" in session,
    }


@app.route("/")
def index():
    return redirect(url_for("play"))


@app.route("/play")
def play():
    return render_template("Index.html", active_page="play")


@app.route("/leaderboard")
def leaderboard():
    with STATE_LOCK:
        sync_all_game_sessions()
        leaderboard_state = build_leaderboard_payload(get_current_user_id())

    return render_template(
        "Leaderboard.html",
        active_page="leaderboard",
        leaderboard_rows=leaderboard_state["rows"],
        leaderboard_state=leaderboard_state,
    )


@app.route("/leaderboard/state")
def leaderboard_state():
    requested_version = request.args.get("version")

    with STATE_LOCK:
        sync_all_game_sessions()
        payload = build_leaderboard_payload(get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/profile")
@login_required
def profile():
    current_user_id = get_current_user_id()
    stats = get_user_stats(current_user_id)
    bets = get_user_bet_history(current_user_id)

    stats_formatted = {
        "total_wagered": format_money(stats["total_wagered_cents"]),
        "total_bets": stats["total_bets"],
        "bets_won": stats["bets_won"],
        "bets_lost": stats["bets_lost"],
        "win_rate": round(stats["bets_won"] / stats["total_bets"] * 100 if stats["total_bets"] else 0, 1),
    }

    return render_template(
        "Profile.html",
        active_page="profile",
        user_stats=stats,
        user_stats_formatted=stats_formatted,
        profile_state={
            "bet_history": bets,
            "stats": stats_formatted,
        },
    )


@app.route("/profile/bets")
@login_required
def profile_bets():
    current_user_id = get_current_user_id()
    bets = get_user_bet_history(current_user_id)
    bets.sort(key=lambda b: b["timestamp"], reverse=True)
    return jsonify({"bets": bets})


@app.route("/games/coinflip")
@login_required
def coinflip_game():
    with STATE_LOCK:
        sync_all_game_sessions()
        coinflip_lobby_state = build_coinflip_lobby_payload(get_current_user_id())

    return render_template(
        "Games/Coinflip.html",
        active_page="play",
        coinflip_lobby_state=coinflip_lobby_state,
        coinflip_sessions=coinflip_lobby_state["sessions"],
        session_summary=coinflip_lobby_state["session_summary"],
    )


@app.route("/games/coinflip/state")
@login_required
def coinflip_lobby_state():
    requested_version = request.args.get("version")

    with STATE_LOCK:
        sync_all_game_sessions()
        payload = build_coinflip_lobby_payload(get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/games/coinflip/sessions", methods=["POST"])
@login_required
def create_coinflip_session():
    choice = request.form.get("choice")
    bet_amount = request.form.get("bet_amount")

    if choice not in {"Heads", "Tails"}:
        flash("Choose Heads or Tails before creating a session.", "error")
        return redirect(url_for("coinflip_game"))

    try:
        bet_cents = parse_bet_amount_to_cents(bet_amount)
    except ValueError as exc:
        flash(str(exc), "error")
        return redirect(url_for("coinflip_game"))

    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        current_balance = get_user_balance(current_user_id)

        if bet_cents > current_balance:
            flash("You do not have enough balance for that bet.", "error")
            return redirect(url_for("coinflip_game"))

        set_user_balance(current_user_id, current_balance - bet_cents)

        session_id = build_coinflip_session_id()
        COINFLIP_SESSIONS[session_id] = {
            "bet_cents": bet_cents,
            "countdown_started_at": None,
            "created_at": time.time(),
            "creator": current_user,
            "creator_choice": choice,
            "id": session_id,
            "opponent": None,
            "opponent_choice": other_coin_side(choice),
            "resolved_at": None,
            "result_side": None,
            "winner_id": None,
            "winner_name": None,
        }

    return redirect(url_for("coinflip_session", session_id=session_id))


@app.route("/games/coinflip/sessions/<session_id>")
@login_required
def coinflip_session(session_id):
    with STATE_LOCK:
        coinflip_session_data = get_coinflip_session_or_404(session_id)
        session_state = build_coinflip_session_state(coinflip_session_data, get_current_user_id())

    return render_template(
        "Games/CoinflipSession.html",
        active_page="play",
        session_state=session_state,
    )


@app.route("/games/coinflip/sessions/<session_id>/join", methods=["POST"])
@login_required
def join_coinflip_session(session_id):
    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        coinflip_session_data = get_coinflip_session_or_404(session_id)
        sync_coinflip_session_state(coinflip_session_data)

        if coinflip_session_data["result_side"] or coinflip_session_data["opponent"]:
            flash("This session is no longer available.", "error")
            return redirect(url_for("coinflip_game"))

        if coinflip_session_data["creator"]["id"] == current_user_id:
            return redirect(url_for("coinflip_session", session_id=session_id))

        current_balance = get_user_balance(current_user_id)
        bet_cents = coinflip_session_data["bet_cents"]

        if bet_cents > current_balance:
            flash("You do not have enough balance to join that session.", "error")
            return redirect(url_for("coinflip_game"))

        set_user_balance(current_user_id, current_balance - bet_cents)
        coinflip_session_data["opponent"] = current_user
        coinflip_session_data["countdown_started_at"] = time.time()

    return redirect(url_for("coinflip_session", session_id=session_id))


@app.route("/games/coinflip/sessions/<session_id>/bot", methods=["POST"])
@login_required
def call_coinflip_bot(session_id):
    current_user_id = get_current_user_id()

    with STATE_LOCK:
        coinflip_session_data = get_coinflip_session_or_404(session_id)
        sync_coinflip_session_state(coinflip_session_data)

        if coinflip_session_data["creator"]["id"] != current_user_id:
            flash("Only the session creator can call the bot.", "error")
            return redirect(url_for("coinflip_session", session_id=session_id))

        if coinflip_session_data["result_side"] or coinflip_session_data["opponent"]:
            flash("That session already has an opponent.", "error")
            return redirect(url_for("coinflip_session", session_id=session_id))

        coinflip_session_data["opponent"] = BOT_PROFILE.copy()
        coinflip_session_data["countdown_started_at"] = time.time()

    return redirect(url_for("coinflip_session", session_id=session_id))


@app.route("/games/coinflip/sessions/<session_id>/state")
@login_required
def coinflip_session_state(session_id):
    with STATE_LOCK:
        coinflip_session_data = get_coinflip_session_or_404(session_id)
        session_state = build_coinflip_session_state(coinflip_session_data, get_current_user_id())

    return jsonify(session_state)


@app.route("/games/dice")
@login_required
def dice_game():
    with STATE_LOCK:
        sync_all_game_sessions()
        dice_lobby_state = build_dice_lobby_payload(get_current_user_id())

    return render_template(
        "Games/Dice.html",
        active_page="play",
        dice_lobby_state=dice_lobby_state,
        dice_sessions=dice_lobby_state["sessions"],
        session_summary=dice_lobby_state["session_summary"],
    )


@app.route("/games/dice/state")
@login_required
def dice_lobby_state():
    requested_version = request.args.get("version")

    with STATE_LOCK:
        sync_all_game_sessions()
        payload = build_dice_lobby_payload(get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/games/dice/sessions", methods=["POST"])
@login_required
def create_dice_session():
    mode = request.form.get("mode") or "classic"
    side = request.form.get("side")
    double_roll = request.form.get("double_roll") in {"1", "on", "true"}
    target_wins_raw = request.form.get("target_wins")
    bet_amount = request.form.get("bet_amount")

    if mode not in {"classic", "first_to"}:
        flash("Choose a valid dice mode before creating a session.", "error")
        return redirect(url_for("dice_game"))

    if mode == "classic" and side not in {"Low", "High"}:
        flash("Choose Low or High before creating a session.", "error")
        return redirect(url_for("dice_game"))

    if mode == "first_to":
        try:
            target_wins = int(target_wins_raw)
        except (TypeError, ValueError):
            target_wins = 0

        if target_wins not in DICE_FIRST_TO_TARGETS:
            flash("Choose FT1, FT3, or FT5 before creating a session.", "error")
            return redirect(url_for("dice_game"))
    else:
        double_roll = False
        target_wins = None

    try:
        bet_cents = parse_bet_amount_to_cents(bet_amount)
    except ValueError as exc:
        flash(str(exc), "error")
        return redirect(url_for("dice_game"))

    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        current_balance = get_user_balance(current_user_id)

        if bet_cents > current_balance:
            flash("You do not have enough balance for that bet.", "error")
            return redirect(url_for("dice_game"))

        set_user_balance(current_user_id, current_balance - bet_cents)

        session_id = build_dice_session_id()
        DICE_SESSIONS[session_id] = {
            "bet_cents": bet_cents,
            "countdown_started_at": None,
            "created_at": time.time(),
            "creator": current_user,
            "creator_score": 0,
            "creator_side": side if mode == "classic" else None,
            "double_roll": double_roll,
            "id": session_id,
            "mode": mode,
            "opponent": None,
            "opponent_score": 0,
            "opponent_side": other_dice_side(side) if mode == "classic" else None,
            "rounds": [],
            "resolved_at": None,
            "result_face": None,
            "target_wins": target_wins,
            "winner_id": None,
            "winner_name": None,
        }

    return redirect(url_for("dice_session", session_id=session_id))


@app.route("/games/dice/sessions/<session_id>")
@login_required
def dice_session(session_id):
    with STATE_LOCK:
        dice_session_data = get_dice_session_or_404(session_id)
        session_state = build_dice_session_state(dice_session_data, get_current_user_id())

    return render_template(
        "Games/DiceSession.html",
        active_page="play",
        session_state=session_state,
    )


@app.route("/games/dice/sessions/<session_id>/join", methods=["POST"])
@login_required
def join_dice_session(session_id):
    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        dice_session_data = get_dice_session_or_404(session_id)
        sync_dice_session_state(dice_session_data)

        if dice_session_is_resolved(dice_session_data) or dice_session_data["opponent"]:
            flash("This session is no longer available.", "error")
            return redirect(url_for("dice_game"))

        if dice_session_data["creator"]["id"] == current_user_id:
            return redirect(url_for("dice_session", session_id=session_id))

        current_balance = get_user_balance(current_user_id)
        bet_cents = dice_session_data["bet_cents"]

        if bet_cents > current_balance:
            flash("You do not have enough balance to join that session.", "error")
            return redirect(url_for("dice_game"))

        set_user_balance(current_user_id, current_balance - bet_cents)
        dice_session_data["opponent"] = current_user
        dice_session_data["countdown_started_at"] = time.time()

    return redirect(url_for("dice_session", session_id=session_id))


@app.route("/games/dice/sessions/<session_id>/bot", methods=["POST"])
@login_required
def call_dice_bot(session_id):
    current_user_id = get_current_user_id()

    with STATE_LOCK:
        dice_session_data = get_dice_session_or_404(session_id)
        sync_dice_session_state(dice_session_data)

        if dice_session_data["creator"]["id"] != current_user_id:
            flash("Only the session creator can call the bot.", "error")
            return redirect(url_for("dice_session", session_id=session_id))

        if dice_session_is_resolved(dice_session_data) or dice_session_data["opponent"]:
            flash("That session already has an opponent.", "error")
            return redirect(url_for("dice_session", session_id=session_id))

        dice_session_data["opponent"] = BOT_PROFILE.copy()
        dice_session_data["countdown_started_at"] = time.time()

    return redirect(url_for("dice_session", session_id=session_id))


@app.route("/games/dice/sessions/<session_id>/state")
@login_required
def dice_session_state(session_id):
    with STATE_LOCK:
        dice_session_data = get_dice_session_or_404(session_id)
        session_state = build_dice_session_state(dice_session_data, get_current_user_id())

    return jsonify(session_state)


@app.route("/auth/discord/login")
def discord_login():
    oauth_config = get_discord_oauth_config()

    if not oauth_config:
        flash(
            "Discord OAuth is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.",
            "error",
        )
        return redirect(url_for("play"))

    next_url = request.args.get("next")

    if is_safe_redirect_target(next_url):
        session["post_login_redirect"] = next_url

    oauth_state = secrets.token_urlsafe(32)
    session["discord_oauth_state"] = oauth_state

    authorization_url = (
        f"{DISCORD_AUTHORIZE_URL}?"
        f"{urlencode({'response_type': 'code', 'client_id': oauth_config['client_id'], 'scope': DISCORD_SCOPE, 'state': oauth_state, 'redirect_uri': oauth_config['redirect_uri'], 'prompt': 'consent'})}"
    )
    return redirect(authorization_url)


@app.route("/auth/discord/callback")
def discord_callback():
    oauth_config = get_discord_oauth_config()

    if not oauth_config:
        flash(
            "Discord OAuth is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.",
            "error",
        )
        return redirect(url_for("play"))

    if request.args.get("error"):
        flash("Discord sign-in was cancelled or denied.", "error")
        return redirect(url_for("play"))

    returned_state = request.args.get("state")
    expected_state = session.pop("discord_oauth_state", None)

    if not returned_state or returned_state != expected_state:
        flash("Discord sign-in failed state validation. Please try again.", "error")
        return redirect(url_for("play"))

    authorization_code = request.args.get("code")

    if not authorization_code:
        flash("Discord did not return an authorization code.", "error")
        return redirect(url_for("play"))

    try:
        token_response = exchange_code_for_token(authorization_code, oauth_config)
        discord_user = fetch_discord_user(token_response["access_token"])
    except RuntimeError as exc:
        flash(str(exc), "error")
        return redirect(url_for("play"))

    session["discord_user"] = build_discord_user_profile(discord_user)
    ensure_user_balance(session["discord_user"])

    redirect_target = session.pop("post_login_redirect", None)

    if not is_safe_redirect_target(redirect_target):
        redirect_target = url_for("play")

    return redirect(redirect_target)


@app.route("/logout")
def logout():
    session.pop("discord_oauth_state", None)
    session.pop("discord_user", None)
    session.pop("post_login_redirect", None)
    flash("Signed out.", "success")
    return redirect(url_for("play"))


if __name__ == "__main__":
    app.run(debug=True)
