import base64
import hashlib
import json
import math
import os
import re
import secrets
import time
from datetime import timedelta
from difflib import SequenceMatcher
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
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
    has_request_context,
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

STARTING_BALANCE_CENTS = 50000
COINFLIP_COUNTDOWN_SECONDS = 5
DICE_COUNTDOWN_SECONDS = 5
DICE_FIRST_TO_TARGETS = {1, 3, 5}
COINFLIP_CHAT_REVEAL_SECONDS = 3.35
DICE_CHAT_BETWEEN_ROUNDS_SECONDS = 0.76
DICE_CHAT_DOUBLE_BETWEEN_PLAYERS_SECONDS = 0.56
DICE_CHAT_DOUBLE_SCORE_REVEAL_SECONDS = 0.28
DICE_CHAT_INTRO_SECONDS = 0.22
DICE_CHAT_MAX_ROLL_SECONDS = 4.88
DICE_CHAT_RESULT_HOLD_SECONDS = 1.38
DICE_CHAT_SINGLE_BETWEEN_PLAYERS_SECONDS = 0.52
DICE_CHAT_SINGLE_SCORE_REVEAL_SECONDS = 0.26
DICE_CHAT_TIE_HOLD_SECONDS = 1.22
DICE_CHAT_TOP_RESET_SECONDS = 0.28
BOT_PROFILE = {
    "avatar_url": None,
    "avatar_static_url": None,
    "display_name": "House Bot",
    "id": "bot-house",
    "username": "house-bot",
}
ADMIN_PANEL_USER_ID = "1195144155790327898"
ADMIN_PANEL_USERNAME = "lastdanceparty"
CANCELED_SESSION_MARKER_TTL_SECONDS = 45
BLACKJACK_SESSION_MAX_SEATS = 5
BLACKJACK_SHOE_COUNT = 6
BLACKJACK_RESHUFFLE_THRESHOLD = 20
BLACKJACK_SETTLE_HOLD_SECONDS = 4.0
BLACKJACK_CHIP_VALUES_CENTS = (100, 200, 500, 2500, 10000, 100000)
BLACKJACK_ROUND_WAITING = "waiting"
BLACKJACK_ROUND_BETTING = "betting"
BLACKJACK_ROUND_DEALING = "dealing"
BLACKJACK_ROUND_INSURANCE = "insurance"
BLACKJACK_ROUND_PLAYER_TURN = "player_turn"
BLACKJACK_ROUND_DEALER_TURN = "dealer_turn"
BLACKJACK_ROUND_SETTLING = "settling"
BLACKJACK_BET_TYPE_MAIN = "main"
BLACKJACK_BET_TYPE_PERFECT_PAIRS = "perfect_pairs"
BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE = "twenty_one_plus_three"
BLACKJACK_BET_TYPE_INSURANCE = "insurance"
BLACKJACK_PREDEAL_BET_TYPES = (
    BLACKJACK_BET_TYPE_MAIN,
    BLACKJACK_BET_TYPE_PERFECT_PAIRS,
    BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE,
)
BLACKJACK_SIDE_BET_TYPES = (
    BLACKJACK_BET_TYPE_PERFECT_PAIRS,
    BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE,
)
BLACKJACK_BET_TYPE_LABELS = {
    BLACKJACK_BET_TYPE_MAIN: "Main",
    BLACKJACK_BET_TYPE_PERFECT_PAIRS: "Perfect Pairs",
    BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE: "21+3",
    BLACKJACK_BET_TYPE_INSURANCE: "Insurance",
}
BLACKJACK_CARD_VALUES = ("ACE", "2", "3", "4", "5", "6", "7", "8", "9", "10", "JACK", "QUEEN", "KING")
BLACKJACK_CARD_SUITS = ("SPADES", "HEARTS", "DIAMONDS", "CLUBS")
BLACKJACK_CARD_VALUE_CODES = {
    "ACE": "A",
    "10": "0",
    "JACK": "J",
    "QUEEN": "Q",
    "KING": "K",
}
BLACKJACK_CARD_SUIT_CODES = {
    "SPADES": "S",
    "HEARTS": "H",
    "DIAMONDS": "D",
    "CLUBS": "C",
}
BLACKJACK_CARD_COLORS = {
    "SPADES": "black",
    "CLUBS": "black",
    "HEARTS": "red",
    "DIAMONDS": "red",
}
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PERSISTENT_STATE_SCHEMA_VERSION = 1


def env_flag(name, default=False):
    raw_value = os.environ.get(name)

    if raw_value is None:
        return default

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name, default):
    raw_value = os.environ.get(name)

    if raw_value is None:
        return default

    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return default


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def resolve_runtime_path(env_name, default_path):
    raw_path = os.environ.get(env_name)

    if not raw_path:
        return default_path

    path = Path(raw_path).expanduser()
    return path if path.is_absolute() else (BASE_DIR / path)


APP_STATE_PATH = resolve_runtime_path("APP_STATE_PATH", DATA_DIR / "app-state.json")
FLASK_SECRET_KEY_PATH = resolve_runtime_path("FLASK_SECRET_KEY_PATH", DATA_DIR / "flask-secret.key")
SESSION_LIFETIME_DAYS = max(env_int("SESSION_LIFETIME_DAYS", 30), 1)
SESSION_COOKIE_SECURE = env_flag("SESSION_COOKIE_SECURE", default=False)

USER_BALANCES = {}
USER_PROFILES = {
    BOT_PROFILE["id"]: BOT_PROFILE.copy(),
}
COINFLIP_SESSIONS = {}
DICE_SESSIONS = {}
BLACKJACK_SESSIONS = {}
CANCELED_COINFLIP_SESSIONS = {}
CANCELED_DICE_SESSIONS = {}
CANCELED_BLACKJACK_SESSIONS = {}
STATE_LOCK = Lock()
STATE_LOCK = RLock()
USER_STATS = {}
USER_BET_HISTORY = {}
APP_NOTIFICATIONS = []
MAX_APP_NOTIFICATIONS = 250
NOTIFICATION_POLL_INTERVAL_MS = 2600
NEXT_NOTIFICATION_ID = 1
CHAT_MESSAGES = []
MAX_CHAT_MESSAGES = 180
CHAT_INITIAL_MESSAGE_LIMIT = 60
CHAT_MAX_MESSAGE_LENGTH = 280
CHAT_MAX_MENTIONS = 6
CHAT_POLL_INTERVAL_MS = 2200
CHAT_MENTION_NOTIFICATION_COOLDOWN_SECONDS = 30
CHAT_MENTION_RESOLUTION_MIN_LENGTH = 3
CHAT_MENTION_SUGGESTION_LIMIT = 6
CHAT_REPLY_PREVIEW_MAX_LENGTH = 90
CHAT_TYPING_WINDOW_SECONDS = 5
NEXT_CHAT_MESSAGE_ID = 1
CHAT_MENTION_PATTERN = re.compile(r"(?<![\w@])@([A-Za-z0-9_.-]{2,32})")
CHAT_EMOJI_SHORTCODE_PATTERN = re.compile(r":([A-Za-z0-9_+\-]{2,32}):")
CHAT_EMOJI_ALIASES = {
    "+1": "\U0001f44d",
    "100": "\U0001f4af",
    "angry": "\U0001f620",
    "broken_heart": "\U0001f494",
    "clap": "\U0001f44f",
    "cry": "\U0001f622",
    "eyes": "\U0001f440",
    "fire": "\U0001f525",
    "flushed": "\U0001f633",
    "grin": "\U0001f600",
    "heart": "\u2764\ufe0f",
    "joy": "\U0001f602",
    "laughing": "\U0001f606",
    "ok_hand": "\U0001f44c",
    "pleading": "\U0001f97a",
    "pray": "\U0001f64f",
    "rocket": "\U0001f680",
    "skull": "\U0001f480",
    "sleepy": "\U0001f62a",
    "smile": "\U0001f604",
    "sob": "\U0001f62d",
    "sparkles": "\u2728",
    "thinking": "\U0001f914",
    "thumbs_up": "\U0001f44d",
    "thumbsup": "\U0001f44d",
    "wave": "\U0001f44b",
}
CHAT_MENTION_NOTIFICATION_HISTORY = {}
USER_PRESENCE = {}
PRESENCE_ONLINE_WINDOW_SECONDS = 12
USER_REWARDS = {}
USER_AUTH_VERSIONS = {}
RAKEBACK_RATE_BPS = 300
RAKEBACK_CLAIM_COOLDOWN_SECONDS = 5 * 60
SITE_VISIT_REWARD_CENTS = 200
SITE_VISIT_REWARD_INTERVAL_SECONDS = 30 * 60
LEVEL_BONUS_CENTS = {
    1: 500,
    2: 1_000,
    3: 2_000,
    4: 3_500,
    5: 5_000,
    6: 7_500,
    7: 10_000,
    8: 15_000,
    9: 25_000,
    10: 50_000,
}
REWARD_TIERS = [
    {"badge": "Unranked", "level": 0, "threshold_cents": 0},
    {"badge": "Newbie", "level": 1, "threshold_cents": 5_000},
    {"badge": "Beginner", "level": 2, "threshold_cents": 15_000},
    {"badge": "Gambler", "level": 3, "threshold_cents": 35_000},
    {"badge": "Regular", "level": 4, "threshold_cents": 75_000},
    {"badge": "Grinder", "level": 5, "threshold_cents": 150_000},
    {"badge": "Sharp", "level": 6, "threshold_cents": 300_000},
    {"badge": "High Roller", "level": 7, "threshold_cents": 600_000},
    {"badge": "Elite", "level": 8, "threshold_cents": 1_200_000},
    {"badge": "Legend", "level": 9, "threshold_cents": 2_500_000},
    {"badge": "Whale", "level": 10, "threshold_cents": 5_000_000},
]
LAST_PERSISTED_STATE_DIGEST = None


def resolve_flask_secret_key():
    configured_secret = os.environ.get("FLASK_SECRET_KEY")

    if configured_secret:
        return configured_secret

    try:
        if FLASK_SECRET_KEY_PATH.exists():
            persisted_secret = FLASK_SECRET_KEY_PATH.read_text(encoding="utf-8").strip()

            if persisted_secret:
                return persisted_secret

        FLASK_SECRET_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        generated_secret = secrets.token_hex(32)
        FLASK_SECRET_KEY_PATH.write_text(f"{generated_secret}\n", encoding="utf-8")
        return generated_secret
    except OSError:
        return secrets.token_hex(32)


def build_persistent_state_payload():
    return {
        "schema_version": PERSISTENT_STATE_SCHEMA_VERSION,
        "next_chat_message_id": NEXT_CHAT_MESSAGE_ID,
        "next_notification_id": NEXT_NOTIFICATION_ID,
        "user_balances": USER_BALANCES,
        "user_profiles": USER_PROFILES,
        "coinflip_sessions": COINFLIP_SESSIONS,
        "dice_sessions": DICE_SESSIONS,
        "blackjack_sessions": BLACKJACK_SESSIONS,
        "user_stats": USER_STATS,
        "user_bet_history": USER_BET_HISTORY,
        "app_notifications": APP_NOTIFICATIONS,
        "chat_messages": CHAT_MESSAGES,
        "user_rewards": USER_REWARDS,
        "user_auth_versions": USER_AUTH_VERSIONS,
    }


def build_persistent_state_digest(payload_json):
    return hashlib.sha1(payload_json.encode("utf-8")).hexdigest()


def build_persistent_state_json():
    return json.dumps(build_persistent_state_payload(), indent=2, sort_keys=True)


def load_persistent_state():
    global NEXT_CHAT_MESSAGE_ID
    global NEXT_NOTIFICATION_ID
    global LAST_PERSISTED_STATE_DIGEST

    if not APP_STATE_PATH.exists():
        LAST_PERSISTED_STATE_DIGEST = build_persistent_state_digest(build_persistent_state_json())
        return

    try:
        payload = json.loads(APP_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        LAST_PERSISTED_STATE_DIGEST = build_persistent_state_digest(build_persistent_state_json())
        return

    if not isinstance(payload, dict):
        LAST_PERSISTED_STATE_DIGEST = build_persistent_state_digest(build_persistent_state_json())
        return

    user_balances = payload.get("user_balances")
    user_profiles = payload.get("user_profiles")
    coinflip_sessions = payload.get("coinflip_sessions")
    dice_sessions = payload.get("dice_sessions")
    blackjack_sessions = payload.get("blackjack_sessions")
    user_stats = payload.get("user_stats")
    user_bet_history = payload.get("user_bet_history")
    app_notifications = payload.get("app_notifications")
    chat_messages = payload.get("chat_messages")
    user_rewards = payload.get("user_rewards")
    user_auth_versions = payload.get("user_auth_versions")

    with STATE_LOCK:
        USER_BALANCES.clear()
        if isinstance(user_balances, dict):
            USER_BALANCES.update(user_balances)

        USER_PROFILES.clear()
        USER_PROFILES[BOT_PROFILE["id"]] = BOT_PROFILE.copy()
        if isinstance(user_profiles, dict):
            for user_id, user_profile in user_profiles.items():
                if isinstance(user_profile, dict):
                    USER_PROFILES[str(user_id)] = user_profile
        USER_PROFILES[BOT_PROFILE["id"]] = BOT_PROFILE.copy()

        COINFLIP_SESSIONS.clear()
        if isinstance(coinflip_sessions, dict):
            COINFLIP_SESSIONS.update(coinflip_sessions)

        DICE_SESSIONS.clear()
        if isinstance(dice_sessions, dict):
            DICE_SESSIONS.update(dice_sessions)

        BLACKJACK_SESSIONS.clear()
        if isinstance(blackjack_sessions, dict):
            BLACKJACK_SESSIONS.update(blackjack_sessions)

        USER_STATS.clear()
        if isinstance(user_stats, dict):
            USER_STATS.update(user_stats)

        USER_BET_HISTORY.clear()
        if isinstance(user_bet_history, dict):
            USER_BET_HISTORY.update(user_bet_history)

        APP_NOTIFICATIONS[:] = app_notifications[-MAX_APP_NOTIFICATIONS:] if isinstance(app_notifications, list) else []
        CHAT_MESSAGES[:] = chat_messages[-MAX_CHAT_MESSAGES:] if isinstance(chat_messages, list) else []

        USER_REWARDS.clear()
        if isinstance(user_rewards, dict):
            USER_REWARDS.update(user_rewards)

        USER_AUTH_VERSIONS.clear()
        if isinstance(user_auth_versions, dict):
            USER_AUTH_VERSIONS.update(user_auth_versions)

        latest_notification_id = max(
            (safe_int(notification.get("id"), 0) for notification in APP_NOTIFICATIONS if isinstance(notification, dict)),
            default=0,
        )
        latest_chat_message_id = max(
            (safe_int(chat_message.get("id"), 0) for chat_message in CHAT_MESSAGES if isinstance(chat_message, dict)),
            default=0,
        )

        NEXT_NOTIFICATION_ID = max(
            latest_notification_id + 1,
            safe_int(payload.get("next_notification_id"), 1),
        )
        NEXT_CHAT_MESSAGE_ID = max(
            latest_chat_message_id + 1,
            safe_int(payload.get("next_chat_message_id"), 1),
        )

        LAST_PERSISTED_STATE_DIGEST = build_persistent_state_digest(build_persistent_state_json())


def persist_app_state_if_changed():
    global LAST_PERSISTED_STATE_DIGEST

    with STATE_LOCK:
        payload_json = build_persistent_state_json()
        payload_digest = build_persistent_state_digest(payload_json)

        if payload_digest == LAST_PERSISTED_STATE_DIGEST:
            return False

        APP_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = APP_STATE_PATH.parent / f"{APP_STATE_PATH.name}.tmp"
        temp_path.write_text(f"{payload_json}\n", encoding="utf-8")
        temp_path.replace(APP_STATE_PATH)
        LAST_PERSISTED_STATE_DIGEST = payload_digest
        return True


app = Flask(__name__)
app.secret_key = resolve_flask_secret_key()
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=SESSION_LIFETIME_DAYS),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE,
    SESSION_REFRESH_EACH_REQUEST=True,
)
HAND_SLOT_LAYOUT_PATH = DATA_DIR / "hand-slot-layout.json"
BLACKJACK_SIDE_BET_LAYOUT_PATH = DATA_DIR / "blackjack-side-bet-layout.json"
HAND_SLOT_SEAT_IDS = tuple(f"seat-{index}" for index in range(1, BLACKJACK_SESSION_MAX_SEATS + 1))
DEFAULT_STACK_OFFSET_X = 2.85
DEFAULT_STACK_OFFSET_Y = 1.17
BLACKJACK_SIDE_BET_LAYOUT_LABELS = {
    BLACKJACK_BET_TYPE_PERFECT_PAIRS: "Pairs",
    BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE: "21+3",
}
DEFAULT_BLACKJACK_SIDE_BET_LAYOUT = (
    {"seatId": "seat-1", "betType": BLACKJACK_BET_TYPE_PERFECT_PAIRS, "label": "Pairs", "x": 20.8, "y": 50.5},
    {"seatId": "seat-1", "betType": BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE, "label": "21+3", "x": 27.6, "y": 51.4},
    {"seatId": "seat-2", "betType": BLACKJACK_BET_TYPE_PERFECT_PAIRS, "label": "Pairs", "x": 31.8, "y": 58.4},
    {"seatId": "seat-2", "betType": BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE, "label": "21+3", "x": 38.2, "y": 59.6},
    {"seatId": "seat-3", "betType": BLACKJACK_BET_TYPE_PERFECT_PAIRS, "label": "Pairs", "x": 44.4, "y": 63.0},
    {"seatId": "seat-3", "betType": BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE, "label": "21+3", "x": 55.6, "y": 63.0},
    {"seatId": "seat-4", "betType": BLACKJACK_BET_TYPE_PERFECT_PAIRS, "label": "Pairs", "x": 61.8, "y": 59.6},
    {"seatId": "seat-4", "betType": BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE, "label": "21+3", "x": 68.2, "y": 58.4},
    {"seatId": "seat-5", "betType": BLACKJACK_BET_TYPE_PERFECT_PAIRS, "label": "Pairs", "x": 72.4, "y": 51.4},
    {"seatId": "seat-5", "betType": BLACKJACK_BET_TYPE_TWENTY_ONE_PLUS_THREE, "label": "21+3", "x": 79.2, "y": 50.5},
)
load_persistent_state()


def format_money(amount_cents):
    dollars = amount_cents / 100

    if amount_cents % 100 == 0:
        return f"${int(dollars):,}"

    return f"${dollars:,.2f}"


def format_duration(seconds):
    seconds = max(int(math.ceil(seconds)), 0)

    if seconds < 60:
        return f"{seconds}s"

    minutes, remaining_seconds = divmod(seconds, 60)

    if remaining_seconds == 0:
        return f"{minutes}m"

    return f"{minutes}m {remaining_seconds}s"


def read_hand_slot_layout():
    if not HAND_SLOT_LAYOUT_PATH.exists():
        return []

    try:
        with HAND_SLOT_LAYOUT_PATH.open("r", encoding="utf-8") as layout_file:
            payload = json.load(layout_file)
    except (OSError, json.JSONDecodeError):
        return []

    slots = payload.get("slots", payload)
    return slots if isinstance(slots, list) else []


def validate_hand_slot_layout(raw_slots):
    if not isinstance(raw_slots, list):
        raise ValueError("Layout payload must be an array.")

    normalized_slots = []
    seen_seat_ids = set()

    for raw_slot in raw_slots:
        if not isinstance(raw_slot, dict):
            raise ValueError("Each slot must be an object.")

        seat_id = str(raw_slot.get("seatId", "")).strip()
        if seat_id not in HAND_SLOT_SEAT_IDS:
            raise ValueError(f"Unsupported seat id: {seat_id or 'missing'}.")
        if seat_id in seen_seat_ids:
            raise ValueError(f"Duplicate seat id: {seat_id}.")

        normalized_slots.append(
            {
                "seatId": seat_id,
                "label": str(raw_slot.get("label") or seat_id.split("-")[-1]).strip(),
                "x": float(raw_slot.get("x")),
                "y": float(raw_slot.get("y")),
                "width": float(raw_slot.get("width")),
                "height": float(raw_slot.get("height")),
                "rotation": float(raw_slot.get("rotation")),
                "stackOffsetX": float(raw_slot.get("stackOffsetX", DEFAULT_STACK_OFFSET_X)),
                "stackOffsetY": float(raw_slot.get("stackOffsetY", DEFAULT_STACK_OFFSET_Y)),
            }
        )
        seen_seat_ids.add(seat_id)

    if seen_seat_ids != set(HAND_SLOT_SEAT_IDS):
        raise ValueError("Layout must include all five seat slots.")

    normalized_slots.sort(key=lambda slot: HAND_SLOT_SEAT_IDS.index(slot["seatId"]))
    return normalized_slots


def write_hand_slot_layout(slots):
    HAND_SLOT_LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with HAND_SLOT_LAYOUT_PATH.open("w", encoding="utf-8") as layout_file:
        json.dump({"slots": slots}, layout_file, indent=2)
        layout_file.write("\n")


def clone_default_blackjack_side_bet_layout():
    return [dict(entry) for entry in DEFAULT_BLACKJACK_SIDE_BET_LAYOUT]


def read_blackjack_side_bet_layout():
    if not BLACKJACK_SIDE_BET_LAYOUT_PATH.exists():
        return clone_default_blackjack_side_bet_layout()

    try:
        with BLACKJACK_SIDE_BET_LAYOUT_PATH.open("r", encoding="utf-8") as layout_file:
            payload = json.load(layout_file)
    except (OSError, json.JSONDecodeError):
        return clone_default_blackjack_side_bet_layout()

    layout = payload.get("spots", payload)

    try:
        return validate_blackjack_side_bet_layout(layout)
    except (TypeError, ValueError):
        return clone_default_blackjack_side_bet_layout()


def validate_blackjack_side_bet_layout(raw_spots):
    if not isinstance(raw_spots, list):
        raise ValueError("Layout payload must be an array.")

    normalized_spots = []
    seen_keys = set()
    expected_keys = {
        (seat_id, bet_type)
        for seat_id in HAND_SLOT_SEAT_IDS
        for bet_type in BLACKJACK_SIDE_BET_TYPES
    }

    for raw_spot in raw_spots:
        if not isinstance(raw_spot, dict):
            raise ValueError("Each side-bet spot must be an object.")

        seat_id = str(raw_spot.get("seatId", "")).strip()
        bet_type = normalize_blackjack_bet_type(raw_spot.get("betType"))

        if seat_id not in HAND_SLOT_SEAT_IDS:
            raise ValueError(f"Unsupported seat id: {seat_id or 'missing'}.")
        if bet_type not in BLACKJACK_SIDE_BET_TYPES:
            raise ValueError(f"Unsupported bet type: {bet_type or 'missing'}.")

        spot_key = (seat_id, bet_type)

        if spot_key in seen_keys:
            raise ValueError(f"Duplicate side-bet spot: {seat_id} {bet_type}.")

        normalized_spots.append(
            {
                "seatId": seat_id,
                "betType": bet_type,
                "label": str(
                    raw_spot.get("label")
                    or BLACKJACK_SIDE_BET_LAYOUT_LABELS.get(bet_type)
                    or BLACKJACK_BET_TYPE_LABELS.get(bet_type)
                    or "Side Bet"
                ).strip(),
                "x": float(raw_spot.get("x")),
                "y": float(raw_spot.get("y")),
            }
        )
        seen_keys.add(spot_key)

    if seen_keys != expected_keys:
        raise ValueError("Layout must include both side-bet spots for all five seats.")

    normalized_spots.sort(
        key=lambda spot: (
            HAND_SLOT_SEAT_IDS.index(spot["seatId"]),
            BLACKJACK_SIDE_BET_TYPES.index(spot["betType"]),
        )
    )
    return normalized_spots


def write_blackjack_side_bet_layout(spots):
    BLACKJACK_SIDE_BET_LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with BLACKJACK_SIDE_BET_LAYOUT_PATH.open("w", encoding="utf-8") as layout_file:
        json.dump({"spots": spots}, layout_file, indent=2)
        layout_file.write("\n")


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
    current_user = normalize_user_profile(session.get("discord_user"))

    if current_user:
        session.permanent = True
        current_auth_version = USER_AUTH_VERSIONS.setdefault(current_user["id"], 1)
        session_auth_version = session.get("auth_version")

        if session_auth_version is None:
            session["auth_version"] = current_auth_version
        elif session_auth_version != current_auth_version:
            clear_login_session()
            return None

    if current_user != session.get("discord_user"):
        session["discord_user"] = current_user

    return current_user


def get_current_user_id():
    current_user = get_current_user()

    if not current_user:
        return None

    return current_user["id"]


def clear_login_session():
    session.pop("auth_version", None)
    session.pop("discord_oauth_state", None)
    session.pop("discord_user", None)
    session.pop("post_login_redirect", None)


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


def build_discord_avatar_url(user_id, avatar_hash, extension, size=128):
    return f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{extension}?size={size}"


def build_avatar_static_url(avatar_url):
    if not avatar_url:
        return None

    if ".gif?" in avatar_url:
        return avatar_url.replace(".gif?", ".png?", 1)

    return avatar_url


def normalize_user_profile(user_profile):
    if not user_profile:
        return None

    normalized_profile = dict(user_profile)
    avatar_url = normalized_profile.get("avatar_url")
    avatar_static_url = normalized_profile.get("avatar_static_url") or build_avatar_static_url(avatar_url)

    if avatar_static_url:
        normalized_profile["avatar_static_url"] = avatar_static_url
    else:
        normalized_profile.setdefault("avatar_static_url", None)

    if not normalized_profile.get("avatar_url") and avatar_static_url:
        normalized_profile["avatar_url"] = avatar_static_url

    return normalized_profile


def make_user_snapshot(user_profile):
    normalized_user = normalize_user_profile(user_profile)

    return {
        "avatar_static_url": normalized_user.get("avatar_static_url"),
        "avatar_url": normalized_user.get("avatar_url"),
        "display_name": normalized_user.get("display_name") or normalized_user.get("username"),
        "id": normalized_user["id"],
        "username": normalized_user["username"],
    }


def remember_user_profile(user_profile):
    if not user_profile:
        return None

    existing_profile = USER_PROFILES.get(user_profile["id"], {})
    user_snapshot = make_user_snapshot(user_profile)
    user_snapshot["registered_at"] = (
        existing_profile.get("registered_at")
        or user_profile.get("registered_at")
        or time.time()
    )
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
        previous_level = get_user_reward_level(user_id)
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
        current_level = get_user_reward_level(user_id)
        apply_reward_level_up_rewards(user_id, previous_level, current_level)


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


def get_user_reward_record(user_id):
    reward_record = USER_REWARDS.setdefault(user_id, {
        "bonus_awarded_levels": [],
        "bonus_unlocked_levels": [],
        "last_visit_at": 0,
        "last_rakeback_claimed_at": 0,
        "rakeback_claimed_cents": 0,
        "site_visits": 0,
    })
    reward_record.setdefault("bonus_awarded_levels", [])
    reward_record.setdefault("bonus_unlocked_levels", [])
    reward_record.setdefault("last_visit_at", 0)
    reward_record.setdefault("last_rakeback_claimed_at", 0)
    reward_record.setdefault("rakeback_claimed_cents", 0)
    reward_record.setdefault("site_visits", 0)
    return reward_record


def record_user_site_visit(user_id, now=None):
    if not user_id or user_id == BOT_PROFILE["id"]:
        return None

    reward_record = get_user_reward_record(user_id)
    current_time = now or time.time()
    last_visit_at = reward_record.get("last_visit_at") or 0

    if current_time - last_visit_at >= SITE_VISIT_REWARD_INTERVAL_SECONDS:
        previous_level = get_user_reward_level(user_id)
        reward_record["site_visits"] = reward_record.get("site_visits", 0) + 1
        reward_record["last_visit_at"] = current_time
        current_level = get_user_reward_level(user_id)
        apply_reward_level_up_rewards(user_id, previous_level, current_level)

    return reward_record


def get_reward_tier(reward_points_cents):
    current_tier = REWARD_TIERS[0]
    next_tier = None

    for index, tier in enumerate(REWARD_TIERS):
        if reward_points_cents >= tier["threshold_cents"]:
            current_tier = tier
            next_tier = REWARD_TIERS[index + 1] if index + 1 < len(REWARD_TIERS) else None
            continue

        next_tier = tier
        break

    return current_tier, next_tier


def calculate_reward_points_cents(user_id, stats=None, reward_record=None):
    stats = stats or get_user_stats(user_id)
    reward_record = reward_record or get_user_reward_record(user_id)
    return stats["total_wagered_cents"] + reward_record.get("site_visits", 0) * SITE_VISIT_REWARD_CENTS


def get_user_reward_level(user_id):
    reward_points_cents = calculate_reward_points_cents(user_id)
    current_tier, _ = get_reward_tier(reward_points_cents)
    return current_tier["level"]


def get_rakeback_cooldown_remaining(reward_record, now=None):
    current_time = now or time.time()
    last_claimed_at = reward_record.get("last_rakeback_claimed_at") or 0
    return max((last_claimed_at + RAKEBACK_CLAIM_COOLDOWN_SECONDS) - current_time, 0)


def apply_reward_level_up_rewards(user_id, previous_level, current_level):
    if not user_id or user_id == BOT_PROFILE["id"] or current_level <= previous_level:
        return []

    reward_record = get_user_reward_record(user_id)
    claimed_levels = set(reward_record.get("bonus_awarded_levels") or [])
    unlocked_levels = set(reward_record.get("bonus_unlocked_levels") or [])
    unlocked_notifications = []

    for tier in REWARD_TIERS:
        level = tier["level"]

        if (
            level <= 0
            or level <= previous_level
            or level > current_level
            or level in claimed_levels
            or level in unlocked_levels
        ):
            continue

        bonus_cents = LEVEL_BONUS_CENTS.get(level, 0)
        unlocked_levels.add(level)
        notification = add_app_notification(
            actor_user=USER_PROFILES.get(user_id),
            event_type="reward_level_up",
            message=(
                f"You leveled up to Level {level} - {tier['badge']}. "
                f"Claim {format_money(bonus_cents)} from Rewards."
            ),
            recipient_user_id=user_id,
            title="Level reward unlocked",
            tone="success",
        )
        unlocked_notifications.append(notification)

    reward_record["bonus_awarded_levels"] = sorted(claimed_levels)
    reward_record["bonus_unlocked_levels"] = sorted(unlocked_levels)
    return unlocked_notifications


def build_reward_state(user_id, now=None):
    stats = get_user_stats(user_id)
    reward_record = get_user_reward_record(user_id)
    current_time = now or time.time()
    total_wagered_cents = stats["total_wagered_cents"]
    activity_bonus_cents = reward_record.get("site_visits", 0) * SITE_VISIT_REWARD_CENTS
    reward_points_cents = calculate_reward_points_cents(user_id, stats, reward_record)
    current_tier, next_tier = get_reward_tier(reward_points_cents)
    current_threshold_cents = current_tier["threshold_cents"]
    next_threshold_cents = next_tier["threshold_cents"] if next_tier else current_threshold_cents
    level_span_cents = max(next_threshold_cents - current_threshold_cents, 1)
    progress_cents = min(max(reward_points_cents - current_threshold_cents, 0), level_span_cents)
    tier_progress_percent = 100 if not next_tier else round(progress_cents / level_span_cents * 100, 1)
    progress_percent = 100 if not next_tier else round(
        (current_tier["level"] + (tier_progress_percent / 100)) / REWARD_TIERS[-1]["level"] * 100,
        1,
    )
    earned_rakeback_cents = total_wagered_cents * RAKEBACK_RATE_BPS // 10_000
    claimed_rakeback_cents = min(reward_record.get("rakeback_claimed_cents", 0), earned_rakeback_cents)
    claimable_rakeback_cents = max(earned_rakeback_cents - claimed_rakeback_cents, 0)
    rakeback_cooldown_remaining_seconds = math.ceil(get_rakeback_cooldown_remaining(reward_record, current_time))
    rakeback_claim_available_at = (
        (reward_record.get("last_rakeback_claimed_at") or 0) + RAKEBACK_CLAIM_COOLDOWN_SECONDS
        if reward_record.get("last_rakeback_claimed_at")
        else None
    )
    can_claim_rakeback = claimable_rakeback_cents > 0 and rakeback_cooldown_remaining_seconds <= 0
    claimed_level_rewards = set(reward_record.get("bonus_awarded_levels") or [])
    unlocked_level_rewards = sorted(set(reward_record.get("bonus_unlocked_levels") or []) - claimed_level_rewards)
    pending_level_rewards = []

    for tier in REWARD_TIERS:
        level = tier["level"]

        if level <= 0 or level not in unlocked_level_rewards:
            continue

        pending_level_rewards.append({
            "badge": tier["badge"],
            "bonus_cents": LEVEL_BONUS_CENTS.get(level, 0),
            "bonus_display": format_money(LEVEL_BONUS_CENTS.get(level, 0)),
            "level": level,
        })

    pending_level_reward = pending_level_rewards[0] if pending_level_rewards else None

    return {
        "activity_bonus_cents": activity_bonus_cents,
        "activity_bonus_display": format_money(activity_bonus_cents),
        "badge": current_tier["badge"],
        "can_claim_level_reward": pending_level_reward is not None,
        "can_claim_rakeback": can_claim_rakeback,
        "claimable_rakeback_cents": claimable_rakeback_cents,
        "claimable_rakeback_display": format_money(claimable_rakeback_cents),
        "claimed_rakeback_cents": claimed_rakeback_cents,
        "claimed_rakeback_display": format_money(claimed_rakeback_cents),
        "earned_rakeback_cents": earned_rakeback_cents,
        "earned_rakeback_display": format_money(earned_rakeback_cents),
        "level": current_tier["level"],
        "max_level": REWARD_TIERS[-1]["level"],
        "next_badge": next_tier["badge"] if next_tier else None,
        "next_level": next_tier["level"] if next_tier else None,
        "next_threshold_cents": next_threshold_cents if next_tier else None,
        "next_threshold_display": format_money(next_threshold_cents) if next_tier else None,
        "pending_level_reward": pending_level_reward,
        "pending_level_reward_count": len(pending_level_rewards),
        "pending_level_rewards": pending_level_rewards,
        "progress_percent": progress_percent,
        "rakeback_claim_available_at": rakeback_claim_available_at,
        "rakeback_cooldown_copy": (
            f"Claim again in {format_duration(rakeback_cooldown_remaining_seconds)}."
            if rakeback_cooldown_remaining_seconds > 0
            else "Claim every 5 minutes."
        ),
        "rakeback_cooldown_remaining_display": format_duration(rakeback_cooldown_remaining_seconds),
        "rakeback_cooldown_remaining_seconds": rakeback_cooldown_remaining_seconds,
        "rakeback_rate_percent": RAKEBACK_RATE_BPS / 100,
        "reward_points_cents": reward_points_cents,
        "reward_points_display": format_money(reward_points_cents),
        "site_visits": reward_record.get("site_visits", 0),
        "tier_progress_percent": tier_progress_percent,
        "to_next_cents": max(next_threshold_cents - reward_points_cents, 0) if next_tier else 0,
        "to_next_display": format_money(max(next_threshold_cents - reward_points_cents, 0)) if next_tier else "$0",
        "total_wagered_cents": total_wagered_cents,
        "total_wagered_display": format_money(total_wagered_cents),
    }


def claim_user_rakeback(user_id, now=None):
    current_time = now or time.time()
    reward_state = build_reward_state(user_id, current_time)
    claimable_cents = reward_state["claimable_rakeback_cents"]

    if claimable_cents <= 0:
        return None, "No rakeback available to claim.", 400

    if reward_state["rakeback_cooldown_remaining_seconds"] > 0:
        return (
            None,
            f"Rakeback can be claimed again in {reward_state['rakeback_cooldown_remaining_display']}.",
            429,
        )

    reward_record = get_user_reward_record(user_id)
    reward_record["rakeback_claimed_cents"] = reward_record.get("rakeback_claimed_cents", 0) + claimable_cents
    reward_record["last_rakeback_claimed_at"] = current_time
    set_user_balance(user_id, get_user_balance(user_id) + claimable_cents)
    next_reward_state = build_reward_state(user_id, current_time)
    next_reward_state["claimed_now_cents"] = claimable_cents
    next_reward_state["claimed_now_display"] = format_money(claimable_cents)
    return next_reward_state, None, 200


def claim_user_level_reward(user_id, now=None):
    current_time = now or time.time()
    reward_state = build_reward_state(user_id, current_time)
    pending_level_reward = reward_state.get("pending_level_reward")

    if not pending_level_reward:
        return None, "No level reward available to claim.", 400

    reward_record = get_user_reward_record(user_id)
    claimed_levels = set(reward_record.get("bonus_awarded_levels") or [])
    unlocked_levels = set(reward_record.get("bonus_unlocked_levels") or [])
    level = pending_level_reward["level"]
    bonus_cents = pending_level_reward["bonus_cents"]

    if level not in unlocked_levels or level in claimed_levels:
        return None, "That reward is no longer available to claim.", 409

    claimed_levels.add(level)
    unlocked_levels.discard(level)
    reward_record["bonus_awarded_levels"] = sorted(claimed_levels)
    reward_record["bonus_unlocked_levels"] = sorted(unlocked_levels)

    if bonus_cents > 0:
        set_user_balance(user_id, get_user_balance(user_id) + bonus_cents)

    add_app_notification(
        actor_user=USER_PROFILES.get(user_id),
        event_type="reward_level_claimed",
        message=(
            f"You claimed {format_money(bonus_cents)} from Level {level} - "
            f"{pending_level_reward['badge']}."
        ),
        recipient_user_id=user_id,
        title="Level reward claimed",
        tone="success",
    )

    next_reward_state = build_reward_state(user_id, current_time)
    next_reward_state["claimed_level_reward"] = pending_level_reward
    next_reward_state["claimed_now_cents"] = bonus_cents
    next_reward_state["claimed_now_display"] = format_money(bonus_cents)
    return next_reward_state, None, 200


def build_state_version(payload):
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha1(payload_json.encode("utf-8")).hexdigest()[:16]


def get_game_label(game):
    if game == "coinflip":
        return "Coinflip"

    if game == "dice":
        return "Dice"

    if game == "blackjack":
        return "Blackjack"

    raise ValueError("Choose a valid game.")


def get_game_lobby_url(game):
    if game == "coinflip":
        return url_for("coinflip_game")

    if game == "dice":
        return url_for("dice_game")

    if game == "blackjack":
        return url_for("blackjack_game")

    raise ValueError("Choose a valid game.")


def get_game_session_store(game):
    if game == "coinflip":
        return COINFLIP_SESSIONS

    if game == "dice":
        return DICE_SESSIONS

    if game == "blackjack":
        return BLACKJACK_SESSIONS

    raise ValueError("Choose a valid game.")


def get_canceled_session_store(game):
    if game == "coinflip":
        return CANCELED_COINFLIP_SESSIONS

    if game == "dice":
        return CANCELED_DICE_SESSIONS

    if game == "blackjack":
        return CANCELED_BLACKJACK_SESSIONS

    raise ValueError("Choose a valid game.")


def cleanup_canceled_session_markers(now=None):
    current_time = now or time.time()
    expiration_cutoff = current_time - CANCELED_SESSION_MARKER_TTL_SECONDS

    for store in (
        CANCELED_COINFLIP_SESSIONS,
        CANCELED_DICE_SESSIONS,
        CANCELED_BLACKJACK_SESSIONS,
    ):
        stale_session_ids = [
            session_id
            for session_id, marker in store.items()
            if marker.get("created_at", 0) <= expiration_cutoff
        ]

        for session_id in stale_session_ids:
            store.pop(session_id, None)


def register_canceled_session_marker(game, session_record, refunded_user_ids):
    refunded_user_ids = [user_id for user_id in refunded_user_ids if user_id]
    cleanup_canceled_session_markers()
    get_canceled_session_store(game)[session_record["id"]] = {
        "created_at": time.time(),
        "participant_user_ids": refunded_user_ids,
        "redirect_url": get_game_lobby_url(game),
        "session_id": session_record["id"],
        "title": "Session canceled",
        "participant_message": "Session has been canceled by an admin. You've been refunded.",
        "tone": "info",
        "viewer_message": "Session has been canceled by an admin.",
    }


def build_canceled_session_payload(game, session_id, current_user_id):
    cleanup_canceled_session_markers()
    marker = get_canceled_session_store(game).get(session_id)

    if not marker:
        return None

    participant_user_ids = set(marker.get("participant_user_ids") or [])
    refunded_current_user = bool(current_user_id and current_user_id in participant_user_ids)
    toast_message = (
        marker.get("participant_message")
        if refunded_current_user
        else marker.get("viewer_message")
    ) or "Session has been canceled by an admin."

    return {
        "game": game,
        "id": session_id,
        "is_canceled": True,
        "redirect_url": marker["redirect_url"],
        "status": "canceled",
        "status_text": toast_message,
        "toast": {
            "message": toast_message,
            "title": marker.get("title") or "Session canceled",
            "tone": marker.get("tone") or "info",
        },
    }


def get_latest_notification_id():
    if not APP_NOTIFICATIONS:
        return 0

    return APP_NOTIFICATIONS[-1]["id"]


def add_app_notification(*, actor_user, event_type, title, message, tone="info", action=None, recipient_user_id=None):
    global NEXT_NOTIFICATION_ID

    actor_snapshot = make_user_snapshot(actor_user) if actor_user else None
    notification = {
        "action": dict(action) if action else None,
        "actor_id": actor_snapshot["id"] if actor_snapshot else None,
        "created_at": time.time(),
        "event_type": event_type,
        "id": NEXT_NOTIFICATION_ID,
        "message": message,
        "recipient_id": recipient_user_id,
        "title": title,
        "tone": tone,
    }
    APP_NOTIFICATIONS.append(notification)
    NEXT_NOTIFICATION_ID += 1

    if len(APP_NOTIFICATIONS) > MAX_APP_NOTIFICATIONS:
        del APP_NOTIFICATIONS[:-MAX_APP_NOTIFICATIONS]

    return notification


def build_notification_payload(current_user_id, since_id):
    latest_id = get_latest_notification_id()
    notifications = []
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None

    for notification in APP_NOTIFICATIONS:
        if notification["id"] <= since_id:
            continue

        recipient_id = notification.get("recipient_id")

        if recipient_id:
            if recipient_id != current_user_id:
                continue
        elif notification.get("actor_id") == current_user_id:
            continue

        notifications.append({
            "action": dict(notification["action"]) if notification.get("action") else None,
            "id": notification["id"],
            "message": notification["message"],
            "title": notification["title"],
            "tone": notification["tone"],
        })

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": (
            format_money(current_balance_cents)
            if current_balance_cents is not None
            else None
        ),
        "latest_id": latest_id,
        "notifications": notifications,
        "poll_interval_ms": NOTIFICATION_POLL_INTERVAL_MS,
    }


def build_dice_session_notification_message(creator_name, mode, side, bet_cents, target_wins, double_roll):
    wager_label = format_money(bet_cents)

    if mode == "first_to":
        format_label = f"FT{target_wins} Double" if double_roll else f"FT{target_wins}"
        return f"{creator_name} opened a {format_label} dice session for {wager_label}."

    return f"{creator_name} opened a {side} dice session for {wager_label}."


def build_dice_session_join_copy(creator_name, mode, side, bet_cents, target_wins, double_roll):
    wager_label = format_money(bet_cents)

    if mode == "first_to":
        format_label = f"FT{target_wins} Double" if double_roll else f"FT{target_wins}"
        double_roll_copy = "Two dice per player roll each round. " if double_roll else ""
        return (
            f"{creator_name} created a {format_label} match. "
            f"{double_roll_copy}"
            f"First to {target_wins} round wins for {wager_label}."
        )

    return f"{creator_name} picked {side}. You will join for {wager_label}."


def build_coinflip_session_notification_message(creator_name, choice, bet_cents):
    return f"{creator_name} opened a {choice} coinflip for {format_money(bet_cents)}."


def build_coinflip_session_join_copy(creator_name, choice, bet_cents):
    return f"{creator_name} picked {choice}. You will join for {format_money(bet_cents)}."


def build_session_notification_action(game, session_id, join_copy):
    if game == "coinflip":
        view_url = url_for("coinflip_session", session_id=session_id)
        join_url = url_for("join_coinflip_session", session_id=session_id)
    else:
        view_url = url_for("dice_session", session_id=session_id)
        join_url = url_for("join_dice_session", session_id=session_id)

    return {
        "join_copy": join_copy,
        "join_url": join_url,
        "type": "join_session_prompt",
        "view_url": view_url,
    }


def normalize_chat_mention_name(value):
    return str(value or "").strip().lower()


def normalize_chat_emoji_alias(value):
    return str(value or "").strip().lower().replace("-", "_")


def replace_chat_emoji_shortcodes(value):
    def replace_shortcode(match):
        alias = normalize_chat_emoji_alias(match.group(1))
        return CHAT_EMOJI_ALIASES.get(alias, match.group(0))

    return CHAT_EMOJI_SHORTCODE_PATTERN.sub(replace_shortcode, str(value or ""))


def build_chat_mention_lookup():
    mention_lookup = {}

    for user_profile in USER_PROFILES.values():
        user_id = user_profile.get("id")

        if not user_id:
            continue

        aliases = {
            normalize_chat_mention_name(user_profile.get("username")),
        }
        display_name = str(user_profile.get("display_name") or "").strip()
        normalized_display_name = normalize_chat_mention_name(display_name)

        if normalized_display_name and " " not in display_name:
            aliases.add(normalized_display_name)

        compact_display_name = normalize_chat_mention_name(display_name.replace(" ", ""))

        if compact_display_name:
            aliases.add(compact_display_name)

        for alias in aliases:
            if not alias or alias in mention_lookup:
                continue

            mention_lookup[alias] = user_profile

    return mention_lookup


def build_chat_mention_search_fields(user_profile):
    username = normalize_chat_mention_name(user_profile.get("username"))
    display_name = normalize_chat_mention_name(user_profile.get("display_name"))
    compact_display_name = normalize_chat_mention_name(
        str(user_profile.get("display_name") or "").replace(" ", "")
    )

    return {
        "compact_display_name": compact_display_name,
        "display_name": display_name,
        "username": username,
    }


def score_chat_mention_candidate(query, user_profile):
    normalized_query = normalize_chat_mention_name(query)

    if not normalized_query:
        return 0

    search_fields = build_chat_mention_search_fields(user_profile)
    score = 0

    for field_name, exact_score, prefix_score, contains_score in (
        ("username", 480, 360, 240),
        ("display_name", 450, 340, 220),
        ("compact_display_name", 430, 320, 200),
    ):
        candidate = search_fields[field_name]

        if not candidate:
            continue

        if candidate == normalized_query:
            score = max(score, exact_score)
            continue

        if candidate.startswith(normalized_query):
            score = max(score, prefix_score - min(len(candidate) - len(normalized_query), 24))
            continue

        if normalized_query in candidate:
            score = max(score, contains_score - candidate.index(normalized_query))
            continue

        similarity = SequenceMatcher(None, normalized_query, candidate).ratio()

        if similarity >= 0.74:
            score = max(score, int(similarity * 180))

    if score and user_presence_is_online(USER_PRESENCE.get(user_profile["id"])):
        score += 12

    return score


def rank_chat_mention_candidates(query, current_user_id=None, limit=CHAT_MENTION_SUGGESTION_LIMIT):
    normalized_query = normalize_chat_mention_name(query)
    candidates = []

    for user_profile in USER_PROFILES.values():
        user_id = user_profile.get("id")

        if not user_id or user_id in {BOT_PROFILE["id"], current_user_id}:
            continue

        presence = USER_PRESENCE.get(user_id)
        is_online = user_presence_is_online(presence)
        last_seen = presence.get("last_seen", 0) if presence else 0

        if normalized_query:
            score = score_chat_mention_candidate(normalized_query, user_profile)

            if score <= 0:
                continue
        else:
            score = 120 if is_online else 80

        display_name = str(user_profile.get("display_name") or user_profile.get("username") or "").lower()
        candidates.append((score, is_online, last_seen, display_name, user_profile))

    candidates.sort(key=lambda item: (-item[0], not item[1], -item[2], item[3]))
    return candidates[:limit]


def build_chat_mention_suggestions(query, current_user_id=None, limit=CHAT_MENTION_SUGGESTION_LIMIT):
    suggestions = []

    for score, is_online, _last_seen, _display_name, user_profile in rank_chat_mention_candidates(
        query,
        current_user_id,
        limit,
    ):
        suggestions.append({
            "avatar_static_url": user_profile.get("avatar_static_url"),
            "avatar_url": user_profile.get("avatar_url"),
            "display_name": user_profile.get("display_name") or user_profile.get("username"),
            "id": user_profile["id"],
            "is_online": is_online,
            "score": score,
            "username": user_profile.get("username"),
        })

    return suggestions


def resolve_chat_mention_profile(raw_token, author_user_id, mention_lookup=None):
    mention_lookup = mention_lookup or build_chat_mention_lookup()
    normalized_token = normalize_chat_mention_name(raw_token)

    if not normalized_token:
        return None

    matched_profile = mention_lookup.get(normalized_token)

    if matched_profile and matched_profile["id"] not in {author_user_id, BOT_PROFILE["id"]}:
        return matched_profile

    if len(normalized_token) < CHAT_MENTION_RESOLUTION_MIN_LENGTH:
        return None

    ranked_candidates = rank_chat_mention_candidates(normalized_token, author_user_id, limit=2)

    if not ranked_candidates:
        return None

    top_score = ranked_candidates[0][0]

    if top_score < 220:
        return None

    if len(ranked_candidates) > 1 and top_score - ranked_candidates[1][0] < 24:
        return None

    return ranked_candidates[0][4]


def parse_chat_mentions(body, author_user_id):
    mention_lookup = build_chat_mention_lookup()
    mentions_by_user_id = {}

    for match in CHAT_MENTION_PATTERN.finditer(body):
        raw_token = match.group(1)
        matched_profile = resolve_chat_mention_profile(
            raw_token,
            author_user_id,
            mention_lookup=mention_lookup,
        )

        if (
            not matched_profile
            or matched_profile["id"] in {author_user_id, BOT_PROFILE["id"]}
        ):
            continue

        mention_record = mentions_by_user_id.setdefault(matched_profile["id"], {
            "display_name": matched_profile.get("display_name") or matched_profile.get("username"),
            "id": matched_profile["id"],
            "tokens": [],
            "username": matched_profile.get("username"),
        })
        mention_token = f"@{raw_token}"

        if mention_token not in mention_record["tokens"]:
            mention_record["tokens"].append(mention_token)

        if len(mentions_by_user_id) >= CHAT_MAX_MENTIONS:
            break

    return list(mentions_by_user_id.values())


def can_send_chat_mention_notification(author_user_id, recipient_user_id, now=None):
    if not author_user_id or not recipient_user_id or author_user_id == recipient_user_id:
        return False

    current_time = now or time.time()
    key = (author_user_id, recipient_user_id)
    last_sent_at = CHAT_MENTION_NOTIFICATION_HISTORY.get(key, 0)

    if current_time - last_sent_at < CHAT_MENTION_NOTIFICATION_COOLDOWN_SECONDS:
        return False

    CHAT_MENTION_NOTIFICATION_HISTORY[key] = current_time
    stale_cutoff = current_time - CHAT_MENTION_NOTIFICATION_COOLDOWN_SECONDS * 8

    for pair_key, sent_at in list(CHAT_MENTION_NOTIFICATION_HISTORY.items()):
        if sent_at < stale_cutoff:
            del CHAT_MENTION_NOTIFICATION_HISTORY[pair_key]

    return True


def build_chat_mention_notification_message(author_name, message_body):
    message_preview = str(message_body or "").strip()

    if len(message_preview) > 110:
        message_preview = f"{message_preview[:107].rstrip()}..."

    return f"{author_name} mentioned you: {message_preview}"


def build_chat_reply_notification_message(author_name, chat_message):
    message_preview = str(chat_message.get("body") or "").strip()

    if len(message_preview) > 110:
        message_preview = f"{message_preview[:107].rstrip()}..."

    return f"{author_name} replied to your message: {message_preview}"


def add_chat_mention_notifications(author_user, chat_message):
    mentions = chat_message.get("mentions") or []

    if not mentions:
        return

    author_name = author_user.get("display_name") or author_user.get("username") or "Someone"
    author_user_id = author_user.get("id")

    for mention in mentions:
        recipient_id = mention.get("id")

        if not recipient_id or not can_send_chat_mention_notification(author_user_id, recipient_id):
            continue

        add_app_notification(
            action={
                "target_message_id": chat_message["id"],
                "type": "open_chat",
            },
            actor_user=author_user,
            event_type="chat_mention",
            message=build_chat_mention_notification_message(author_name, chat_message.get("body")),
            recipient_user_id=recipient_id,
            title="You were mentioned",
        )


def add_chat_reply_notifications(author_user, chat_message):
    reply_target = chat_message.get("reply_to") or {}
    reply_author = reply_target.get("author") or {}
    recipient_id = reply_author.get("id")
    author_user_id = author_user.get("id")

    if not recipient_id or recipient_id in {BOT_PROFILE["id"], author_user_id}:
        return

    author_name = author_user.get("display_name") or author_user.get("username") or "Someone"

    add_app_notification(
        action={
            "target_message_id": chat_message["id"],
            "type": "open_chat",
        },
        actor_user=author_user,
        event_type="chat_reply",
        message=build_chat_reply_notification_message(author_name, chat_message),
        recipient_user_id=recipient_id,
        title="New reply",
    )


def user_presence_is_online(presence):
    return bool(
        presence
        and presence.get("is_online", True)
        and time.time() - presence.get("last_seen", 0) <= PRESENCE_ONLINE_WINDOW_SECONDS
    )


def user_presence_is_typing(presence):
    return bool(
        presence
        and user_presence_is_online(presence)
        and presence.get("typing_until", 0) > time.time()
    )


def touch_user_presence(user_profile, current_path=None, is_typing=None):
    if not user_profile:
        return None

    user_snapshot = remember_user_profile(user_profile)
    user_id = user_snapshot["id"]
    previous_presence = USER_PRESENCE.get(user_id)
    now = time.time()

    if previous_presence and user_presence_is_online(previous_presence):
        connected_at = previous_presence.get("connected_at", now)
    else:
        connected_at = now

    existing_typing_until = previous_presence.get("typing_until", 0) if previous_presence else 0

    if is_typing is True:
        typing_until = now + CHAT_TYPING_WINDOW_SECONDS
    elif is_typing is False:
        typing_until = 0
    else:
        typing_until = existing_typing_until if existing_typing_until > now else 0

    presence = {
        "connected_at": connected_at,
        "current_path": current_path or (previous_presence or {}).get("current_path"),
        "is_online": True,
        "last_seen": now,
        "typing_until": typing_until,
    }
    USER_PRESENCE[user_id] = presence
    record_user_site_visit(user_id, now)
    return presence


def mark_user_presence_offline(user_id):
    if not user_id:
        return None

    now = time.time()
    presence = USER_PRESENCE.get(user_id, {})
    presence.update({
        "disconnected_at": now,
        "is_online": False,
        "last_seen": now,
        "typing_until": 0,
    })
    USER_PRESENCE[user_id] = presence
    return presence


def normalize_presence_path(path_value):
    if not isinstance(path_value, str) or not path_value.startswith("/"):
        return ""

    return urlparse(path_value).path or path_value


def build_session_viewers(session_path, current_user_id=None, creator_user_id=None, opponent_user_id=None):
    normalized_session_path = normalize_presence_path(session_path)

    if not normalized_session_path:
        return []

    role_priority = {
        "creator": 0,
        "opponent": 1,
        "viewer": 2,
    }
    viewers = []

    for user_id, presence in USER_PRESENCE.items():
        if user_id in {BOT_PROFILE["id"], current_user_id} or not user_presence_is_online(presence):
            continue

        if normalize_presence_path(presence.get("current_path")) != normalized_session_path:
            continue

        user_profile = USER_PROFILES.get(user_id)

        if not user_profile:
            continue

        role = "viewer"

        if user_id == creator_user_id:
            role = "creator"
        elif user_id == opponent_user_id:
            role = "opponent"

        viewer_snapshot = make_user_snapshot(user_profile)
        viewer_snapshot["role"] = role
        viewer_snapshot["role_label"] = {
            "creator": "Creator",
            "opponent": "Opponent",
            "viewer": "Viewer",
        }[role]
        viewers.append(viewer_snapshot)

    viewers.sort(key=lambda viewer: (
        role_priority.get(viewer["role"], 9),
        str(viewer.get("display_name") or "").lower(),
        str(viewer.get("username") or "").lower(),
    ))
    return viewers


def count_online_users_on_path(session_path):
    normalized_session_path = normalize_presence_path(session_path)

    if not normalized_session_path:
        return 0

    return sum(
        1
        for user_id, presence in USER_PRESENCE.items()
        if (
            user_id != BOT_PROFILE["id"]
            and user_presence_is_online(presence)
            and normalize_presence_path(presence.get("current_path")) == normalized_session_path
        )
    )


def request_should_touch_presence():
    if request.endpoint in {"presence_heartbeat", "presence_offline", "blackjack_frame"}:
        return False

    if request.method != "GET":
        return False

    accepted_content = request.headers.get("Accept", "")
    return "text/html" in accepted_content or "application/xhtml+xml" in accepted_content


def get_online_player_count():
    return sum(
        1
        for user_id, presence in USER_PRESENCE.items()
        if user_id != BOT_PROFILE["id"] and user_presence_is_online(presence)
    )


def build_chat_reply_preview(chat_message):
    body_text = " ".join(str(chat_message.get("body") or "").split())

    if not body_text:
        return "Original message"

    if len(body_text) <= CHAT_REPLY_PREVIEW_MAX_LENGTH:
        return body_text

    return f"{body_text[:CHAT_REPLY_PREVIEW_MAX_LENGTH - 3].rstrip()}..."


def find_chat_message_by_id(message_id):
    for chat_message in reversed(CHAT_MESSAGES):
        if chat_message["id"] == message_id:
            return chat_message

    return None


def build_chat_reply_snapshot(chat_message):
    if not chat_message:
        return None

    author_profile = USER_PROFILES.get(chat_message["author_id"])

    if not author_profile:
        return None

    return {
        "author": make_user_snapshot(author_profile),
        "id": chat_message["id"],
        "preview": build_chat_reply_preview(chat_message),
    }


def build_chat_typing_users(current_user_id=None):
    typing_users = []

    for user_id, presence in USER_PRESENCE.items():
        if user_id in {BOT_PROFILE["id"], current_user_id} or not user_presence_is_typing(presence):
            continue

        user_profile = USER_PROFILES.get(user_id)

        if not user_profile:
            continue

        typing_users.append({
            "display_name": user_profile.get("display_name") or user_profile.get("username") or "Someone",
            "id": user_id,
            "typing_until": presence.get("typing_until", 0),
        })

    typing_users.sort(key=lambda user: (-user["typing_until"], user["display_name"].lower()))

    return [
        {
            "display_name": user["display_name"],
            "id": user["id"],
        }
        for user in typing_users
    ]


def build_chat_message_author_payload(user_profile):
    author_snapshot = make_user_snapshot(user_profile)

    if author_snapshot["id"] == BOT_PROFILE["id"]:
        return author_snapshot

    reward_state = build_reward_state(author_snapshot["id"])
    author_snapshot["reward_badge"] = reward_state["badge"]
    author_snapshot["reward_level"] = reward_state["level"]
    return author_snapshot


def serialize_chat_message(chat_message, current_user_id):
    author_profile = USER_PROFILES.get(chat_message["author_id"])

    if not author_profile:
        return None

    mention_records = chat_message.get("mentions") or []
    mention_tokens = []

    for mention in mention_records:
        for mention_token in mention.get("tokens") or []:
            if mention_token not in mention_tokens:
                mention_tokens.append(mention_token)

    session_share = chat_message.get("session_share")

    return {
        "author": build_chat_message_author_payload(author_profile),
        "body": chat_message["body"],
        "id": chat_message["id"],
        "is_current_user_mentioned": any(
            mention.get("id") == current_user_id
            for mention in mention_records
        ) or (chat_message.get("reply_to") or {}).get("author", {}).get("id") == current_user_id,
        "is_self": chat_message["author_id"] == current_user_id,
        "mention_tokens": mention_tokens,
        "reply_to": chat_message.get("reply_to"),
        "session_share": (
            build_chat_session_share_payload(
                session_share.get("game"),
                session_share.get("session_id"),
                current_user_id,
            )
            if session_share
            else None
        ),
        "timestamp": chat_message["timestamp"],
    }


def add_chat_message(author_user, body, *, shared_game=None, shared_session_id=None, reply_to_message_id=None):
    global NEXT_CHAT_MESSAGE_ID

    author_snapshot = remember_user_profile(author_user)
    normalized_body = replace_chat_emoji_shortcodes(str(body or "").strip())
    reply_snapshot = None
    session_share = None

    if reply_to_message_id is not None:
        reply_target = find_chat_message_by_id(reply_to_message_id)

        if not reply_target:
            raise ValueError("That message can no longer be replied to.")

        reply_snapshot = build_chat_reply_snapshot(reply_target)

        if not reply_snapshot:
            raise ValueError("That message can no longer be replied to.")

    if shared_game or shared_session_id:
        if shared_game not in {"coinflip", "dice"}:
            raise ValueError("Choose a valid session to share.")

        session_share = build_chat_session_share_payload(
            shared_game,
            shared_session_id,
            author_snapshot["id"],
        )

        if not session_share:
            raise ValueError("That session could not be shared.")

        if not normalized_body:
            normalized_body = (
                "Shared a coinflip session."
                if shared_game == "coinflip"
                else "Shared a dice session."
            )

    if not normalized_body:
        raise ValueError("Write a message before sending it.")

    if len(normalized_body) > CHAT_MAX_MESSAGE_LENGTH:
        raise ValueError(f"Messages can be up to {CHAT_MAX_MESSAGE_LENGTH} characters.")

    mentions = parse_chat_mentions(normalized_body, author_snapshot["id"])

    message = {
        "author_id": author_snapshot["id"],
        "body": normalized_body,
        "id": NEXT_CHAT_MESSAGE_ID,
        "mentions": mentions,
        "reply_to": reply_snapshot,
        "session_share": (
            {
                "game": session_share["game"],
                "session_id": session_share["session_id"],
            }
            if session_share
            else None
        ),
        "timestamp": time.time(),
    }
    CHAT_MESSAGES.append(message)
    NEXT_CHAT_MESSAGE_ID += 1

    if len(CHAT_MESSAGES) > MAX_CHAT_MESSAGES:
        del CHAT_MESSAGES[:-MAX_CHAT_MESSAGES]

    add_chat_mention_notifications(author_snapshot, message)
    add_chat_reply_notifications(author_snapshot, message)

    return message


def get_latest_chat_message_id():
    if not CHAT_MESSAGES:
        return 0

    return CHAT_MESSAGES[-1]["id"]


def build_chat_state_payload(current_user_id, since_id):
    latest_message_id = get_latest_chat_message_id()
    oldest_message_id = CHAT_MESSAGES[0]["id"] if CHAT_MESSAGES else 0
    should_reset = bool(since_id and oldest_message_id and since_id < oldest_message_id - 1)

    if since_id <= 0 or should_reset:
        candidate_messages = CHAT_MESSAGES[-CHAT_INITIAL_MESSAGE_LIMIT:]
    else:
        refreshed_share_message_ids = {
            message["id"]
            for message in CHAT_MESSAGES[-CHAT_INITIAL_MESSAGE_LIMIT:]
            if message.get("session_share")
        }
        candidate_messages = [
            message
            for message in CHAT_MESSAGES
            if message["id"] > since_id or message["id"] in refreshed_share_message_ids
        ]

    messages = []

    for message in candidate_messages:
        serialized_message = serialize_chat_message(message, current_user_id)

        if serialized_message:
            messages.append(serialized_message)

    return {
        "latest_message_id": latest_message_id,
        "messages": messages,
        "online_count": get_online_player_count(),
        "poll_interval_ms": CHAT_POLL_INTERVAL_MS,
        "reset": should_reset or since_id <= 0,
        "typing_users": build_chat_typing_users(current_user_id),
    }


def build_chat_user_profile_payload(user_id, current_user_id=None):
    user_profile = USER_PROFILES.get(user_id)

    if not user_profile:
        return None

    stats = get_user_stats(user_id)
    presence = USER_PRESENCE.get(user_id)
    is_online = user_presence_is_online(presence)
    reward_state = build_reward_state(user_id)
    can_tip = bool(current_user_id and current_user_id != user_id and user_id != BOT_PROFILE["id"])

    return {
        "bets_lost": stats["bets_lost"],
        "bets_won": stats["bets_won"],
        "can_tip": can_tip,
        "connected_since": presence.get("connected_at") if presence else None,
        "display_name": user_profile["display_name"],
        "id": user_profile["id"],
        "is_online": is_online,
        "last_seen": presence.get("last_seen") if presence else None,
        "registered_at": user_profile.get("registered_at"),
        "reward_badge": reward_state["badge"],
        "reward_level": reward_state["level"],
        "total_bets": stats["total_bets"],
        "total_deposited_cents": stats["total_deposited_cents"],
        "total_deposited_display": format_money(stats["total_deposited_cents"]),
        "total_wagered_cents": stats["total_wagered_cents"],
        "total_wagered_display": format_money(stats["total_wagered_cents"]),
        "tip_url": url_for("tip_chat_user", user_id=user_id) if can_tip and has_request_context() else None,
        "username": user_profile["username"],
        "avatar_static_url": user_profile.get("avatar_static_url"),
        "avatar_url": user_profile.get("avatar_url"),
        "win_rate": round(stats["bets_won"] / stats["total_bets"] * 100 if stats["total_bets"] else 0, 1),
    }


def parse_tip_amount_to_cents(raw_value):
    try:
        parsed_value = Decimal(str(raw_value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Enter a valid tip amount.")

    if parsed_value < Decimal("0.01"):
        raise ValueError("The minimum tip is $0.01.")

    return int(parsed_value * 100)


def send_user_tip(sender_user, recipient_user_id, raw_amount):
    sender_snapshot = remember_user_profile(sender_user)
    sender_id = sender_snapshot["id"]
    recipient_profile = USER_PROFILES.get(recipient_user_id)

    if not recipient_profile:
        raise ValueError("That player could not be found.")

    if recipient_user_id == sender_id:
        raise ValueError("You cannot tip yourself.")

    if recipient_user_id == BOT_PROFILE["id"]:
        raise ValueError("You cannot tip the bot.")

    tip_cents = parse_tip_amount_to_cents(raw_amount)
    sender_balance = get_user_balance(sender_id)

    if tip_cents > sender_balance:
        raise ValueError("You do not have enough balance for that tip.")

    set_user_balance(sender_id, sender_balance - tip_cents)
    set_user_balance(recipient_user_id, get_user_balance(recipient_user_id) + tip_cents)

    amount_display = format_money(tip_cents)
    recipient_name = recipient_profile.get("display_name") or recipient_profile.get("username") or "that player"

    add_app_notification(
        actor_user=sender_snapshot,
        event_type="tip_received",
        message=f"{sender_snapshot['display_name']} tipped you {amount_display}.",
        recipient_user_id=recipient_user_id,
        title="Tip received",
        tone="success",
    )

    return {
        "amount_cents": tip_cents,
        "amount_display": amount_display,
        "current_balance_cents": get_user_balance(sender_id),
        "current_balance_display": format_money(get_user_balance(sender_id)),
        "recipient_id": recipient_user_id,
        "recipient_name": recipient_name,
    }


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


def build_blackjack_session_id():
    return secrets.token_hex(5)


def other_dice_side(side_name):
    return "High" if side_name == "Low" else "Low"


def normalize_blackjack_table_name(raw_name, creator_name):
    table_name = " ".join(str(raw_name or "").split())

    if not table_name:
        return f"{creator_name}'s table"

    return table_name[:48]


def build_blackjack_card(value, suit):
    value_code = BLACKJACK_CARD_VALUE_CODES.get(value, value)
    suit_code = BLACKJACK_CARD_SUIT_CODES[suit]
    code = f"{value_code}{suit_code}"
    image_url = f"https://deckofcardsapi.com/static/img/{code}.png"

    return {
        "code": code,
        "image": image_url,
        "images": {
            "png": image_url,
            "svg": f"https://deckofcardsapi.com/static/img/{code}.svg",
        },
        "suit": suit,
        "value": value,
    }


def create_blackjack_shoe():
    cards = [
        build_blackjack_card(value, suit)
        for _ in range(BLACKJACK_SHOE_COUNT)
        for suit in BLACKJACK_CARD_SUITS
        for value in BLACKJACK_CARD_VALUES
    ]
    secrets.SystemRandom().shuffle(cards)

    return {
        "cards": cards,
        "deck_id": secrets.token_hex(8),
        "is_ready": True,
        "remaining": len(cards),
    }


def create_blackjack_dealer_state():
    return {
        "cards": [],
        "hole_card": None,
        "is_hole_revealed": False,
    }


def create_blackjack_table_state():
    return {
        "active_hand_index": 0,
        "dealer": create_blackjack_dealer_state(),
        "hands": [],
        "last_bet_snapshots": {},
        "last_results": [],
        "last_side_bet_wins": {},
        "message": "",
        "pending_bet_action_history": [],
        "pending_bet_chips": [],
        "ready_user_ids": [],
        "recorded_result_ids": [],
        "round_id": None,
        "round_state": BLACKJACK_ROUND_WAITING,
        "seat_side_bets": {},
        "settled_at": None,
        "shoe": create_blackjack_shoe(),
        "updated_at": time.time(),
    }


def ensure_blackjack_table_state(blackjack_session):
    table_state = blackjack_session.get("table_state")

    if not isinstance(table_state, dict):
        table_state = create_blackjack_table_state()
        blackjack_session["table_state"] = table_state

    table_state.setdefault("active_hand_index", 0)
    table_state.setdefault("dealer", create_blackjack_dealer_state())
    table_state.setdefault("hands", [])
    table_state.setdefault("last_bet_snapshots", {})
    table_state.setdefault("last_results", [])
    table_state.setdefault("last_side_bet_wins", {})
    table_state.setdefault("message", "")
    table_state.setdefault("pending_bet_action_history", [])
    table_state.setdefault("pending_bet_chips", [])
    table_state.setdefault("ready_user_ids", [])
    table_state.setdefault("recorded_result_ids", [])
    table_state.setdefault("round_id", None)
    table_state.setdefault("round_state", BLACKJACK_ROUND_WAITING)
    table_state.setdefault("seat_side_bets", {})
    table_state.setdefault("settled_at", None)

    shoe = table_state.get("shoe")

    if not isinstance(shoe, dict):
        shoe = create_blackjack_shoe()
        table_state["shoe"] = shoe

    shoe.setdefault("cards", [])
    shoe.setdefault("deck_id", secrets.token_hex(8))
    shoe.setdefault("is_ready", True)
    shoe.setdefault("remaining", len(shoe.get("cards") or []))

    return table_state


def get_blackjack_last_bet_snapshots(table_state):
    last_bet_snapshots = table_state.setdefault("last_bet_snapshots", {})

    if not isinstance(last_bet_snapshots, dict):
        last_bet_snapshots = {}
        table_state["last_bet_snapshots"] = last_bet_snapshots

    return last_bet_snapshots


def get_blackjack_last_bet_snapshot_for_user(table_state, user_id):
    if not user_id:
        return []

    snapshot = get_blackjack_last_bet_snapshots(table_state).get(user_id)

    if not isinstance(snapshot, list):
        return []

    normalized_snapshot = []

    for chip in snapshot:
        if not isinstance(chip, dict):
            continue

        bet_type = normalize_blackjack_bet_type(chip.get("bet_type"))
        seat_id = str(chip.get("seat_id") or "").strip()
        value_cents = int(chip.get("value_cents") or 0)

        if not bet_type or seat_id not in HAND_SLOT_SEAT_IDS or value_cents <= 0:
            continue

        normalized_snapshot.append(
            {
                "bet_type": bet_type,
                "seat_id": seat_id,
                "user_id": user_id,
                "value_cents": value_cents,
            }
        )

    return normalized_snapshot


def get_blackjack_last_bet_total_for_user(table_state, user_id):
    return sum(
        int(chip.get("value_cents") or 0)
        for chip in get_blackjack_last_bet_snapshot_for_user(table_state, user_id)
    )


def capture_blackjack_last_bet_snapshots(table_state):
    snapshots = {}

    for chip in table_state.get("pending_bet_chips") or []:
        if not isinstance(chip, dict):
            continue

        user_id = str(chip.get("user_id") or "").strip()
        seat_id = str(chip.get("seat_id") or "").strip()
        bet_type = normalize_blackjack_bet_type(chip.get("bet_type"))
        value_cents = int(chip.get("value_cents") or 0)

        if not user_id or seat_id not in HAND_SLOT_SEAT_IDS or not bet_type or value_cents <= 0:
            continue

        snapshots.setdefault(user_id, []).append(
            {
                "bet_type": bet_type,
                "seat_id": seat_id,
                "user_id": user_id,
                "value_cents": value_cents,
            }
        )

    table_state["last_bet_snapshots"] = snapshots


def normalize_blackjack_card(card):
    if not isinstance(card, dict):
        return None

    code = str(card.get("code") or "")
    value = str(card.get("value") or "")
    suit = str(card.get("suit") or "")
    image = card.get("image")

    if not code or not value or not suit:
        return None

    return {
        "code": code,
        "image": image,
        "images": card.get("images") or {"png": image, "svg": image},
        "suit": suit,
        "value": value,
    }


def draw_blackjack_card(table_state):
    shoe = table_state.get("shoe")

    if not isinstance(shoe, dict):
        shoe = create_blackjack_shoe()
        table_state["shoe"] = shoe

    if len(shoe.get("cards") or []) < BLACKJACK_RESHUFFLE_THRESHOLD:
        shoe = create_blackjack_shoe()
        table_state["shoe"] = shoe

    cards = shoe.get("cards") or []

    if not cards:
        shoe = create_blackjack_shoe()
        table_state["shoe"] = shoe
        cards = shoe["cards"]

    card = cards.pop()
    shoe["remaining"] = len(cards)
    shoe["is_ready"] = True
    return dict(card)


def get_blackjack_card_base_value(card):
    if not card:
        return 0

    value = card.get("value")

    if value == "ACE":
        return 11

    if value in {"KING", "QUEEN", "JACK"}:
        return 10

    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def get_blackjack_hand_value(cards):
    total = 0
    aces = 0

    for card in cards or []:
        total += get_blackjack_card_base_value(card)
        if card.get("value") == "ACE":
            aces += 1

    soft_aces = aces
    while total > 21 and soft_aces > 0:
        total -= 10
        soft_aces -= 1

    return {
        "is_bust": total > 21,
        "is_soft": soft_aces > 0,
        "total": total,
    }


def get_blackjack_card_color(card):
    return BLACKJACK_CARD_COLORS.get(str((card or {}).get("suit") or "").upper(), "")


def get_blackjack_card_rank(card):
    value = str((card or {}).get("value") or "").upper()

    if value == "ACE":
        return 14

    if value == "KING":
        return 13

    if value == "QUEEN":
        return 12

    if value == "JACK":
        return 11

    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def blackjack_cards_form_straight(cards):
    ranks = sorted({get_blackjack_card_rank(card) for card in cards or []})

    if len(ranks) != 3:
        return False

    if ranks[0] + 1 == ranks[1] and ranks[1] + 1 == ranks[2]:
        return True

    return ranks in ([2, 3, 14], [12, 13, 14])


def settle_blackjack_perfect_pairs_bet(cards, bet_cents):
    first_cards = list(cards or [])[:2]

    if len(first_cards) != 2 or first_cards[0].get("value") != first_cards[1].get("value"):
        return "loss", "No Pair", 0

    if first_cards[0].get("suit") == first_cards[1].get("suit"):
        return "perfect_pair", "Perfect Pair", bet_cents * 26

    if get_blackjack_card_color(first_cards[0]) == get_blackjack_card_color(first_cards[1]):
        return "colored_pair", "Colored Pair", bet_cents * 11

    return "mixed_pair", "Mixed Pair", bet_cents * 6


def settle_blackjack_twenty_one_plus_three_bet(player_cards, dealer_upcard, bet_cents):
    cards = [*(player_cards or [])[:2]]

    if dealer_upcard:
        cards.append(dealer_upcard)

    if len(cards) != 3:
        return "loss", "No 21+3", 0

    is_flush = len({card.get("suit") for card in cards}) == 1
    is_three_of_a_kind = len({card.get("value") for card in cards}) == 1
    is_straight = blackjack_cards_form_straight(cards)
    is_suited_three_of_a_kind = is_flush and is_three_of_a_kind

    if is_suited_three_of_a_kind:
        return "suited_three_of_a_kind", "Suited Trips", bet_cents * 101

    if is_straight and is_flush:
        return "straight_flush", "Straight Flush", bet_cents * 41

    if is_three_of_a_kind:
        return "three_of_a_kind", "Three of a Kind", bet_cents * 31

    if is_straight:
        return "straight", "Straight", bet_cents * 11

    if is_flush:
        return "flush", "Flush", bet_cents * 6

    return "loss", "No 21+3", 0


def is_blackjack_hand(cards, split_from_pair=False):
    return not split_from_pair and len(cards or []) == 2 and get_blackjack_hand_value(cards)["total"] == 21


def refresh_blackjack_hand_flags(hand):
    hand_value = get_blackjack_hand_value(hand.get("cards") or [])
    hand["bust"] = hand_value["is_bust"]
    hand["blackjack"] = is_blackjack_hand(hand.get("cards") or [], hand.get("split_from_pair", False))


def create_blackjack_hand(seat_id, user_id, bet_cents, cards=None, split_from_pair=False, seat_layout_index=0):
    hand = {
        "bet_cents": bet_cents,
        "blackjack": False,
        "bust": False,
        "cards": list(cards or []),
        "doubled": False,
        "id": f"hand-{secrets.token_hex(8)}",
        "payout_cents": 0,
        "result": "",
        "seat_id": seat_id,
        "seat_layout_index": seat_layout_index,
        "split_from_pair": split_from_pair,
        "stood": False,
        "user_id": user_id,
    }
    refresh_blackjack_hand_flags(hand)
    return hand


def normalize_blackjack_bet_type(raw_bet_type, allow_insurance=False):
    bet_type = str(raw_bet_type or BLACKJACK_BET_TYPE_MAIN).strip().lower()
    valid_bet_types = set(BLACKJACK_PREDEAL_BET_TYPES)

    if allow_insurance:
        valid_bet_types.add(BLACKJACK_BET_TYPE_INSURANCE)

    return bet_type if bet_type in valid_bet_types else None


def create_blackjack_side_bet_state(
    bet_type,
    bet_cents=0,
    *,
    max_bet_cents=0,
    payout_cents=0,
    result="",
    result_label="",
    status="none",
):
    return {
        "bet_cents": int(bet_cents or 0),
        "bet_type": normalize_blackjack_bet_type(bet_type, allow_insurance=True),
        "max_bet_cents": int(max_bet_cents or 0),
        "payout_credited": False,
        "payout_cents": int(payout_cents or 0),
        "result": result or "",
        "result_label": result_label or "",
        "status": status or "none",
    }


def ensure_blackjack_seat_side_bets(table_state):
    seat_side_bets = table_state.setdefault("seat_side_bets", {})

    if not isinstance(seat_side_bets, dict):
        seat_side_bets = {}
        table_state["seat_side_bets"] = seat_side_bets

    return seat_side_bets


def get_blackjack_live_bets_by_seat(table_state):
    bets_by_seat = {}

    for hand in table_state.get("hands") or []:
        seat_id = hand.get("seat_id")
        if not seat_id:
            continue

        bets_by_seat[seat_id] = bets_by_seat.get(seat_id, 0) + int(hand.get("bet_cents") or 0)

    return bets_by_seat


def get_blackjack_pending_bets_by_seat(table_state, bet_type=BLACKJACK_BET_TYPE_MAIN):
    bets_by_seat = {}
    normalized_bet_type = normalize_blackjack_bet_type(bet_type)

    if not normalized_bet_type:
        return bets_by_seat

    for chip in table_state.get("pending_bet_chips") or []:
        seat_id = chip.get("seat_id")
        if not seat_id or normalize_blackjack_bet_type(chip.get("bet_type")) != normalized_bet_type:
            continue

        bets_by_seat[seat_id] = bets_by_seat.get(seat_id, 0) + int(chip.get("value_cents") or 0)

    return bets_by_seat


def get_blackjack_pending_side_bets_by_seat(table_state):
    side_bets_by_seat = {}

    for chip in table_state.get("pending_bet_chips") or []:
        seat_id = chip.get("seat_id")
        bet_type = normalize_blackjack_bet_type(chip.get("bet_type"))

        if not seat_id or bet_type not in BLACKJACK_SIDE_BET_TYPES:
            continue

        seat_side_bets = side_bets_by_seat.setdefault(seat_id, {})
        seat_side_bets[bet_type] = seat_side_bets.get(bet_type, 0) + int(chip.get("value_cents") or 0)

    return side_bets_by_seat


def get_blackjack_pending_total_for_user(table_state, user_id, bet_types=None):
    normalized_bet_types = None

    if bet_types is not None:
        normalized_bet_types = {
            normalize_blackjack_bet_type(bet_type)
            for bet_type in bet_types
        }
        normalized_bet_types.discard(None)

    return sum(
        int(chip.get("value_cents") or 0)
        for chip in table_state.get("pending_bet_chips") or []
        if (
            chip.get("user_id") == user_id
            and (
                normalized_bet_types is None
                or normalize_blackjack_bet_type(chip.get("bet_type")) in normalized_bet_types
            )
        )
    )


def ensure_blackjack_pending_bet_action_history(table_state):
    action_history = table_state.setdefault("pending_bet_action_history", [])

    if not isinstance(action_history, list):
        action_history = []
        table_state["pending_bet_action_history"] = action_history

    return action_history


def clear_blackjack_pending_bet_action_history(table_state):
    table_state["pending_bet_action_history"] = []


def record_blackjack_pending_bet_action(table_state, user_id, action_type, chip_count):
    normalized_user_id = str(user_id or "").strip()
    normalized_action_type = str(action_type or "").strip().lower()
    normalized_chip_count = int(chip_count or 0)

    if not normalized_user_id or not normalized_action_type or normalized_chip_count <= 0:
        return

    ensure_blackjack_pending_bet_action_history(table_state).append(
        {
            "action_type": normalized_action_type,
            "chip_count": normalized_chip_count,
            "user_id": normalized_user_id,
        }
    )


def get_blackjack_ready_user_ids(table_state):
    return set(table_state.get("ready_user_ids") or [])


def set_blackjack_ready_user_ids(table_state, user_ids):
    table_state["ready_user_ids"] = sorted({user_id for user_id in user_ids if user_id})


def remove_blackjack_ready_user(table_state, user_id):
    if not user_id:
        return

    ready_user_ids = get_blackjack_ready_user_ids(table_state)
    ready_user_ids.discard(user_id)
    set_blackjack_ready_user_ids(table_state, ready_user_ids)


def get_blackjack_claimed_user_ids(seat_claims):
    return {user_id for user_id in (seat_claims or {}).values() if user_id and user_id != BOT_PROFILE["id"]}


def blackjack_user_claimed_seat_ids(seat_claims, user_id):
    return [
        seat_id
        for seat_id, owner_user_id in (seat_claims or {}).items()
        if owner_user_id == user_id
    ]


def blackjack_user_has_bets_on_claimed_seats(table_state, seat_claims, user_id):
    user_seat_ids = blackjack_user_claimed_seat_ids(seat_claims, user_id)

    if not user_seat_ids:
        return False

    pending_bets_by_seat = get_blackjack_pending_bets_by_seat(table_state)
    return all(pending_bets_by_seat.get(seat_id, 0) > 0 for seat_id in user_seat_ids)


def blackjack_table_ready_to_start(table_state, seat_claims):
    if not seat_claims:
        return False

    pending_bets_by_seat = get_blackjack_pending_bets_by_seat(table_state)

    if any(pending_bets_by_seat.get(seat_id, 0) <= 0 for seat_id in seat_claims):
        return False

    ready_user_ids = get_blackjack_ready_user_ids(table_state)
    return get_blackjack_claimed_user_ids(seat_claims).issubset(ready_user_ids)


def blackjack_table_has_active_hand_for_seat(table_state, seat_id):
    return any(
        hand.get("seat_id") == seat_id and not hand.get("result")
        for hand in table_state.get("hands") or []
    )


def remove_blackjack_pending_bets_for_seat(table_state, seat_id):
    table_state["pending_bet_chips"] = [
        chip
        for chip in table_state.get("pending_bet_chips") or []
        if chip.get("seat_id") != seat_id
    ]
    clear_blackjack_pending_bet_action_history(table_state)


def cleanup_blackjack_pending_bets_for_claims(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    seat_claims = blackjack_session.setdefault("seat_claims", {})
    existing_pending_chips = list(table_state.get("pending_bet_chips") or [])
    filtered_pending_chips = [
        chip
        for chip in existing_pending_chips
        if seat_claims.get(chip.get("seat_id")) == chip.get("user_id")
    ]
    table_state["pending_bet_chips"] = filtered_pending_chips

    if filtered_pending_chips != existing_pending_chips:
        clear_blackjack_pending_bet_action_history(table_state)

    claimed_user_ids = get_blackjack_claimed_user_ids(seat_claims)
    set_blackjack_ready_user_ids(
        table_state,
        get_blackjack_ready_user_ids(table_state) & claimed_user_ids,
    )

    if (
        table_state.get("round_state") == BLACKJACK_ROUND_BETTING
        and not table_state.get("pending_bet_chips")
        and not seat_claims
    ):
        table_state["round_state"] = BLACKJACK_ROUND_WAITING
        table_state["message"] = ""


def get_blackjack_seat_hand_indexes(table_state, seat_id):
    seat_hands = [
        (index, hand)
        for index, hand in enumerate(table_state.get("hands") or [])
        if hand.get("seat_id") == seat_id
    ]
    seat_hands.sort(key=lambda entry: int(entry[1].get("seat_layout_index") or 0))
    return seat_hands


def find_next_blackjack_playable_hand_index(table_state, start_index=0):
    for index in range(start_index, len(table_state.get("hands") or [])):
        hand = table_state["hands"][index]
        hand_value = get_blackjack_hand_value(hand.get("cards") or [])

        if hand.get("stood") or hand.get("bust") or hand.get("blackjack") or hand_value["total"] >= 21:
            continue

        return index

    return -1


def blackjack_should_dealer_hit(cards):
    hand_value = get_blackjack_hand_value(cards)

    if hand_value["total"] < 17:
        return True

    return False


def settle_blackjack_hand(hand, dealer_cards):
    player_value = get_blackjack_hand_value(hand.get("cards") or [])
    dealer_value = get_blackjack_hand_value(dealer_cards)
    dealer_blackjack = is_blackjack_hand(dealer_cards, False)

    if player_value["is_bust"]:
        return "loss", 0

    if hand.get("blackjack"):
        if dealer_blackjack:
            return "push", hand["bet_cents"]

        return "blackjack", (hand["bet_cents"] * 5) // 2

    if dealer_value["is_bust"]:
        return "win", hand["bet_cents"] * 2

    if dealer_blackjack and not hand.get("blackjack"):
        return "loss", 0

    if player_value["total"] > dealer_value["total"]:
        return "win", hand["bet_cents"] * 2

    if player_value["total"] < dealer_value["total"]:
        return "loss", 0

    return "push", hand["bet_cents"]


def increment_blackjack_stats(user_id, bet_cents, result):
    with STATE_LOCK:
        previous_level = get_user_reward_level(user_id)
        stats = USER_STATS.setdefault(user_id, {
            "total_deposited_cents": 0,
            "total_wagered_cents": 0,
            "bets_won": 0,
            "bets_lost": 0,
            "total_bets": 0,
        })
        stats["total_wagered_cents"] += bet_cents

        if result in {"win", "blackjack", "loss", "push"}:
            stats["total_bets"] += 1

        if result in {"win", "blackjack"}:
            stats["bets_won"] += 1
        elif result == "loss":
            stats["bets_lost"] += 1

        current_level = get_user_reward_level(user_id)
        apply_reward_level_up_rewards(user_id, previous_level, current_level)


def increment_blackjack_side_bet_wagered(user_id, bet_cents):
    if not user_id or user_id == BOT_PROFILE["id"] or bet_cents <= 0:
        return

    with STATE_LOCK:
        previous_level = get_user_reward_level(user_id)
        stats = USER_STATS.setdefault(user_id, {
            "total_deposited_cents": 0,
            "total_wagered_cents": 0,
            "bets_won": 0,
            "bets_lost": 0,
            "total_bets": 0,
        })
        stats["total_wagered_cents"] += bet_cents
        current_level = get_user_reward_level(user_id)
        apply_reward_level_up_rewards(user_id, previous_level, current_level)


def record_blackjack_hand_result(blackjack_session, hand):
    user_id = hand.get("user_id")
    result = hand.get("result")

    if not user_id or user_id == BOT_PROFILE["id"] or not result:
        return

    record_key = f"{blackjack_session['id']}:{blackjack_session.get('table_state', {}).get('round_id')}:{hand.get('id')}"
    table_state = ensure_blackjack_table_state(blackjack_session)
    recorded_result_ids = set(table_state.get("recorded_result_ids") or [])

    if record_key in recorded_result_ids:
        return

    bet_cents = int(hand.get("bet_cents") or 0)
    payout_cents = int(hand.get("payout_cents") or 0)
    increment_blackjack_stats(user_id, bet_cents, result)
    add_bet_record(
        user_id,
        "Blackjack",
        bet_cents,
        f"{hand.get('seat_id', 'seat')}{' double' if hand.get('doubled') else ''}",
        result,
        payout_cents,
        result in {"win", "blackjack"},
        blackjack_session["id"],
    )
    recorded_result_ids.add(record_key)
    table_state["recorded_result_ids"] = sorted(recorded_result_ids)


def build_blackjack_side_bet_record_key(blackjack_session, seat_id, bet_type):
    table_state = ensure_blackjack_table_state(blackjack_session)
    return f"{blackjack_session['id']}:{table_state.get('round_id')}:{seat_id}:{bet_type}"


def record_blackjack_side_bet_result(
    blackjack_session,
    *,
    bet_cents,
    bet_type,
    payout_cents,
    result,
    result_label,
    seat_id,
    user_id,
):
    if not user_id or user_id == BOT_PROFILE["id"] or bet_cents <= 0:
        return

    table_state = ensure_blackjack_table_state(blackjack_session)
    record_key = build_blackjack_side_bet_record_key(blackjack_session, seat_id, bet_type)
    recorded_result_ids = set(table_state.get("recorded_result_ids") or [])

    if record_key in recorded_result_ids:
        return

    increment_blackjack_side_bet_wagered(user_id, bet_cents)
    add_bet_record(
        user_id,
        "Blackjack",
        bet_cents,
        f"{BLACKJACK_BET_TYPE_LABELS.get(bet_type, 'Side Bet')} {seat_id}",
        result_label or result,
        payout_cents,
        payout_cents > 0,
        blackjack_session["id"],
    )
    recorded_result_ids.add(record_key)
    table_state["recorded_result_ids"] = sorted(recorded_result_ids)


def credit_and_record_blackjack_side_bet_results(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)
    recorded_result_ids = set(table_state.get("recorded_result_ids") or [])
    last_side_bet_wins = {}

    for seat_id, seat_bets in seat_side_bets.items():
        hand = next(
            (
                candidate
                for candidate in table_state.get("hands") or []
                if candidate.get("seat_id") == seat_id
            ),
            None,
        )
        user_id = hand.get("user_id") if hand else None

        for bet_type, side_bet in (seat_bets or {}).items():
            if not isinstance(side_bet, dict):
                continue

            bet_cents = int(side_bet.get("bet_cents") or 0)
            payout_cents = int(side_bet.get("payout_cents") or 0)
            status = side_bet.get("status") or "none"
            record_key = build_blackjack_side_bet_record_key(blackjack_session, seat_id, bet_type)

            if bet_cents <= 0 or status not in {"win", "loss"}:
                continue

            if record_key in recorded_result_ids and not side_bet.get("payout_credited"):
                side_bet["payout_credited"] = True

            if (
                user_id
                and user_id != BOT_PROFILE["id"]
                and payout_cents > 0
                and not side_bet.get("payout_credited")
            ):
                set_user_balance(user_id, get_user_balance(user_id) + payout_cents)
                side_bet["payout_credited"] = True

            if payout_cents > 0:
                last_side_bet_wins.setdefault(seat_id, {})[bet_type] = dict(side_bet)

            record_blackjack_side_bet_result(
                blackjack_session,
                bet_cents=bet_cents,
                bet_type=bet_type,
                payout_cents=payout_cents,
                result=side_bet.get("result") or status,
                result_label=side_bet.get("result_label") or status,
                seat_id=seat_id,
                user_id=user_id,
            )

    table_state["last_side_bet_wins"] = last_side_bet_wins


def settle_blackjack_initial_side_bets(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    dealer_upcard = (table_state.get("dealer") or {}).get("cards", [None])[0]
    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)
    result_labels = []

    for hand in table_state.get("hands") or []:
        seat_id = hand.get("seat_id")
        user_id = hand.get("user_id")
        seat_bets = seat_side_bets.get(seat_id) or {}

        for bet_type in BLACKJACK_SIDE_BET_TYPES:
            side_bet = seat_bets.get(bet_type)

            if not side_bet or int(side_bet.get("bet_cents") or 0) <= 0:
                continue

            bet_cents = int(side_bet.get("bet_cents") or 0)

            if bet_type == BLACKJACK_BET_TYPE_PERFECT_PAIRS:
                result, result_label, payout_cents = settle_blackjack_perfect_pairs_bet(hand.get("cards") or [], bet_cents)
            else:
                result, result_label, payout_cents = settle_blackjack_twenty_one_plus_three_bet(
                    hand.get("cards") or [],
                    dealer_upcard,
                    bet_cents,
                )

            side_bet["payout_cents"] = payout_cents
            side_bet["result"] = result
            side_bet["result_label"] = result_label
            side_bet["status"] = "win" if payout_cents > 0 else "loss"

            if user_id and user_id != BOT_PROFILE["id"] and payout_cents > 0:
                result_labels.append(f"{seat_id} {BLACKJACK_BET_TYPE_LABELS[bet_type]}: {result_label}")

    return result_labels


def get_blackjack_insurance_offer_seat_ids(table_state):
    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)

    return [
        seat_id
        for seat_id, seat_bets in seat_side_bets.items()
        if (seat_bets.get(BLACKJACK_BET_TYPE_INSURANCE) or {}).get("status") == "offered"
    ]


def maybe_offer_blackjack_insurance(table_state):
    dealer_upcard = (table_state.get("dealer") or {}).get("cards", [None])[0]

    if not dealer_upcard or dealer_upcard.get("value") != "ACE":
        return False

    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)
    offered_any = False

    for hand in table_state.get("hands") or []:
        seat_id = hand.get("seat_id")
        max_bet_cents = max(0, int(hand.get("bet_cents") or 0) // 2)

        if not seat_id or max_bet_cents <= 0:
            continue

        seat_bets = seat_side_bets.setdefault(seat_id, {})
        seat_bets[BLACKJACK_BET_TYPE_INSURANCE] = create_blackjack_side_bet_state(
            BLACKJACK_BET_TYPE_INSURANCE,
            max_bet_cents=max_bet_cents,
            result_label="Insurance Offered",
            status="offered",
        )
        offered_any = True

    if offered_any:
        table_state["round_state"] = BLACKJACK_ROUND_INSURANCE
        table_state["message"] = "Dealer shows an Ace. Insurance?"
        table_state["updated_at"] = time.time()

    return offered_any


def settle_blackjack_insurance_bets(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    dealer_cards = [
        *((table_state.get("dealer") or {}).get("cards") or []),
    ]
    hole_card = (table_state.get("dealer") or {}).get("hole_card")

    if hole_card:
        dealer_cards.append(hole_card)

    dealer_has_blackjack = is_blackjack_hand(dealer_cards, False)
    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)
    result_labels = []

    for seat_id, seat_bets in seat_side_bets.items():
        insurance_bet = seat_bets.get(BLACKJACK_BET_TYPE_INSURANCE)

        if not insurance_bet:
            continue

        insurance_status = insurance_bet.get("status")

        if insurance_status == "declined":
            insurance_bet["result"] = "declined"
            insurance_bet["result_label"] = "Declined"
            continue

        if insurance_status != "accepted":
            continue

        bet_cents = int(insurance_bet.get("bet_cents") or 0)
        payout_cents = bet_cents * 3 if dealer_has_blackjack else 0
        insurance_bet["payout_cents"] = payout_cents
        insurance_bet["result"] = "dealer_blackjack" if dealer_has_blackjack else "no_dealer_blackjack"
        insurance_bet["result_label"] = "Dealer Blackjack" if dealer_has_blackjack else "No Dealer Blackjack"
        insurance_bet["status"] = "win" if dealer_has_blackjack else "loss"

        hand = next(
            (
                candidate
                for candidate in table_state.get("hands") or []
                if candidate.get("seat_id") == seat_id
            ),
            None,
        )
        user_id = hand.get("user_id") if hand else None

        if user_id and user_id != BOT_PROFILE["id"] and payout_cents > 0:
            result_labels.append(f"{seat_id} Insurance: {insurance_bet['result_label']}")

    table_state["updated_at"] = time.time()
    return dealer_has_blackjack, result_labels


def continue_blackjack_round_after_initial_deal(blackjack_session, allow_insurance_offer=True):
    table_state = ensure_blackjack_table_state(blackjack_session)
    if allow_insurance_offer and maybe_offer_blackjack_insurance(table_state):
        return

    next_index = find_next_blackjack_playable_hand_index(table_state, 0)

    if next_index < 0:
        finish_blackjack_dealer_turn(blackjack_session)
        return

    table_state["active_hand_index"] = next_index
    table_state["round_state"] = BLACKJACK_ROUND_PLAYER_TURN
    table_state["updated_at"] = time.time()


def reveal_blackjack_dealer_hole_card(table_state):
    dealer_state = table_state.setdefault("dealer", create_blackjack_dealer_state())
    hole_card = dealer_state.get("hole_card")

    if hole_card:
        dealer_state.setdefault("cards", []).append(hole_card)
        dealer_state["hole_card"] = None
        dealer_state["is_hole_revealed"] = True


def finish_blackjack_dealer_turn(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    table_state["round_state"] = BLACKJACK_ROUND_DEALER_TURN
    reveal_blackjack_dealer_hole_card(table_state)

    dealer_cards = table_state["dealer"].setdefault("cards", [])

    while blackjack_should_dealer_hit(dealer_cards):
        dealer_cards.append(draw_blackjack_card(table_state))

    table_state["round_state"] = BLACKJACK_ROUND_SETTLING
    table_state["settled_at"] = time.time()
    result_labels = []

    for hand in table_state.get("hands") or []:
        result, payout_cents = settle_blackjack_hand(hand, dealer_cards)
        hand["result"] = result
        hand["payout_cents"] = payout_cents

        hand_user_id = hand.get("user_id")

        if hand_user_id and hand_user_id != BOT_PROFILE["id"] and payout_cents:
            set_user_balance(hand_user_id, get_user_balance(hand_user_id) + payout_cents)

        record_blackjack_hand_result(blackjack_session, hand)
        result_labels.append(f"{hand.get('seat_id', 'Seat')}: {result}")

    credit_and_record_blackjack_side_bet_results(blackjack_session)
    table_state["last_results"] = result_labels
    table_state["message"] = " | ".join(result_labels)
    table_state["updated_at"] = time.time()


def advance_blackjack_after_hand(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    next_index = find_next_blackjack_playable_hand_index(table_state, int(table_state.get("active_hand_index") or 0) + 1)

    if next_index >= 0:
        table_state["active_hand_index"] = next_index
        table_state["round_state"] = BLACKJACK_ROUND_PLAYER_TURN
        table_state["message"] = ""
        table_state["updated_at"] = time.time()
        return

    finish_blackjack_dealer_turn(blackjack_session)


def reset_blackjack_table_for_next_round(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    seat_claims = blackjack_session.setdefault("seat_claims", {})
    table_state["active_hand_index"] = 0
    table_state["dealer"] = create_blackjack_dealer_state()
    table_state["hands"] = []
    table_state["last_results"] = []
    table_state["message"] = ""
    table_state["pending_bet_action_history"] = []
    table_state["pending_bet_chips"] = []
    table_state["ready_user_ids"] = []
    table_state["round_id"] = None
    table_state["round_state"] = BLACKJACK_ROUND_BETTING if seat_claims else BLACKJACK_ROUND_WAITING
    table_state["seat_side_bets"] = {}
    table_state["settled_at"] = None
    table_state["updated_at"] = time.time()


def sync_blackjack_table_lifecycle(blackjack_session):
    table_state = ensure_blackjack_table_state(blackjack_session)
    cleanup_blackjack_pending_bets_for_claims(blackjack_session)

    if (
        table_state.get("round_state") == BLACKJACK_ROUND_SETTLING
        and table_state.get("settled_at")
        and time.time() >= table_state["settled_at"] + BLACKJACK_SETTLE_HOLD_SECONDS
    ):
        reset_blackjack_table_for_next_round(blackjack_session)

    return table_state


def get_blackjack_active_hand(table_state):
    hands = table_state.get("hands") or []
    active_index = int(table_state.get("active_hand_index") or 0)

    if active_index < 0 or active_index >= len(hands):
        return None

    return hands[active_index]


def get_blackjack_available_actions(table_state, current_user_id):
    active_hand = get_blackjack_active_hand(table_state)

    if table_state.get("round_state") != BLACKJACK_ROUND_PLAYER_TURN or not active_hand:
        return {}

    if active_hand.get("user_id") != current_user_id:
        return {}

    hand_value = get_blackjack_hand_value(active_hand.get("cards") or [])

    if active_hand.get("bust") or active_hand.get("stood") or hand_value["total"] >= 21:
        return {}

    balance_cents = get_user_balance(current_user_id)
    seat_hands = [
        hand
        for hand in table_state.get("hands") or []
        if hand.get("seat_id") == active_hand.get("seat_id")
    ]
    can_double = len(active_hand.get("cards") or []) == 2 and balance_cents >= int(active_hand.get("bet_cents") or 0)
    can_split = (
        len(seat_hands) == 1
        and len(active_hand.get("cards") or []) == 2
        and active_hand["cards"][0].get("value") == active_hand["cards"][1].get("value")
        and balance_cents >= int(active_hand.get("bet_cents") or 0)
    )

    return {
        "double": can_double,
        "hit": True,
        "split": can_split,
        "stand": True,
    }


def begin_blackjack_round(blackjack_session, current_user_id):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)

    if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
        raise ValueError("A round is already in progress.")

    seat_claims = blackjack_session.get("seat_claims") or {}

    if current_user_id not in set(seat_claims.values()):
        raise ValueError("Take a seat before starting the round.")

    pending_bets_by_seat = get_blackjack_pending_bets_by_seat(table_state, BLACKJACK_BET_TYPE_MAIN)
    pending_side_bets_by_seat = get_blackjack_pending_side_bets_by_seat(table_state)
    participating_seat_ids = [
        seat_id
        for seat_id in reversed(HAND_SLOT_SEAT_IDS)
        if pending_bets_by_seat.get(seat_id, 0) > 0 and seat_claims.get(seat_id)
    ]

    if not participating_seat_ids:
        raise ValueError("Place a bet before starting the round.")

    user_bet_totals = {}

    for seat_id in participating_seat_ids:
        user_id = seat_claims[seat_id]
        seat_total_cents = pending_bets_by_seat.get(seat_id, 0) + sum(
            int(amount_cents or 0)
            for amount_cents in (pending_side_bets_by_seat.get(seat_id) or {}).values()
        )
        user_bet_totals[user_id] = user_bet_totals.get(user_id, 0) + seat_total_cents

    for user_id, bet_cents in user_bet_totals.items():
        if get_user_balance(user_id) < bet_cents:
            user_profile = USER_PROFILES.get(user_id) or {}
            display_name = user_profile.get("display_name") or user_profile.get("username") or "A player"
            raise ValueError(f"{display_name} no longer has enough balance for that bet.")

    for user_id, bet_cents in user_bet_totals.items():
        set_user_balance(user_id, get_user_balance(user_id) - bet_cents)

    if len(table_state.get("shoe", {}).get("cards") or []) < BLACKJACK_RESHUFFLE_THRESHOLD:
        table_state["shoe"] = create_blackjack_shoe()

    capture_blackjack_last_bet_snapshots(table_state)
    table_state["round_id"] = secrets.token_hex(8)
    table_state["round_state"] = BLACKJACK_ROUND_DEALING
    table_state["active_hand_index"] = 0
    table_state["dealer"] = create_blackjack_dealer_state()
    table_state["hands"] = [
        create_blackjack_hand(seat_id, seat_claims[seat_id], pending_bets_by_seat[seat_id])
        for seat_id in participating_seat_ids
    ]
    table_state["last_results"] = []
    table_state["last_side_bet_wins"] = {}
    table_state["message"] = ""
    table_state["pending_bet_action_history"] = []
    table_state["pending_bet_chips"] = []
    table_state["ready_user_ids"] = []
    table_state["settled_at"] = None
    table_state["seat_side_bets"] = {
        seat_id: {
            bet_type: create_blackjack_side_bet_state(bet_type, bet_cents)
            for bet_type, bet_cents in (pending_side_bets_by_seat.get(seat_id) or {}).items()
            if bet_cents > 0
        }
        for seat_id in participating_seat_ids
        if pending_side_bets_by_seat.get(seat_id)
    }

    for hand in table_state["hands"]:
        hand["cards"].append(draw_blackjack_card(table_state))
        refresh_blackjack_hand_flags(hand)

    table_state["dealer"]["cards"].append(draw_blackjack_card(table_state))

    for hand in table_state["hands"]:
        hand["cards"].append(draw_blackjack_card(table_state))
        refresh_blackjack_hand_flags(hand)

    table_state["dealer"]["hole_card"] = draw_blackjack_card(table_state)
    table_state["dealer"]["is_hole_revealed"] = False

    for hand in table_state["hands"]:
        if hand.get("blackjack"):
            hand["stood"] = True

    side_bet_labels = settle_blackjack_initial_side_bets(blackjack_session)

    if side_bet_labels:
        table_state["message"] = " | ".join(side_bet_labels)

    continue_blackjack_round_after_initial_deal(blackjack_session, allow_insurance_offer=True)


def rebet_blackjack_user(blackjack_session, current_user_id):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)

    if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
        raise ValueError("Wait for the next betting round.")

    seat_claims = blackjack_session.setdefault("seat_claims", {})
    snapshot = get_blackjack_last_bet_snapshot_for_user(table_state, current_user_id)

    if not snapshot:
        raise ValueError("There is no previous bet to rebet.")

    unavailable_seat_ids = sorted(
        {
            chip["seat_id"]
            for chip in snapshot
            if seat_claims.get(chip["seat_id"]) not in {None, current_user_id}
        }
    )

    if unavailable_seat_ids:
        raise ValueError("One of your previous seats is no longer available.")

    snapshot_total_cents = sum(int(chip.get("value_cents") or 0) for chip in snapshot)

    if snapshot_total_cents <= 0:
        raise ValueError("There is no previous bet to rebet.")

    if snapshot_total_cents > get_user_balance(current_user_id):
        raise ValueError("You do not have enough balance to rebet that wager.")

    for chip in snapshot:
        seat_claims[chip["seat_id"]] = current_user_id

    existing_pending_chips = [
        chip
        for chip in table_state.get("pending_bet_chips") or []
        if chip.get("user_id") != current_user_id
    ]

    existing_pending_chips.extend(
        {
            "bet_type": chip["bet_type"],
            "seat_id": chip["seat_id"],
            "user_id": current_user_id,
            "value_cents": int(chip["value_cents"]),
        }
        for chip in snapshot
    )

    table_state["pending_bet_chips"] = existing_pending_chips
    record_blackjack_pending_bet_action(table_state, current_user_id, "rebet", len(snapshot))
    remove_blackjack_ready_user(table_state, current_user_id)
    table_state["round_state"] = BLACKJACK_ROUND_BETTING
    table_state["message"] = ""
    table_state["updated_at"] = time.time()


def ready_blackjack_user(blackjack_session, current_user_id):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)

    if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
        raise ValueError("A round is already in progress.")

    seat_claims = blackjack_session.get("seat_claims") or {}

    if current_user_id not in set(seat_claims.values()):
        raise ValueError("Take a seat before readying up.")

    if not blackjack_user_has_bets_on_claimed_seats(table_state, seat_claims, current_user_id):
        raise ValueError("Place a bet on every seat you took before readying up.")

    pending_total_cents = get_blackjack_pending_total_for_user(table_state, current_user_id)

    if pending_total_cents <= 0:
        raise ValueError("Place a bet before readying up.")

    if pending_total_cents > get_user_balance(current_user_id):
        raise ValueError("You do not have enough balance for that bet.")

    ready_user_ids = get_blackjack_ready_user_ids(table_state)
    ready_user_ids.add(current_user_id)
    set_blackjack_ready_user_ids(table_state, ready_user_ids)
    table_state["round_state"] = BLACKJACK_ROUND_BETTING
    table_state["message"] = ""
    table_state["updated_at"] = time.time()

    if blackjack_table_ready_to_start(table_state, seat_claims):
        begin_blackjack_round(blackjack_session, current_user_id)


def handle_blackjack_insurance_decision(blackjack_session, current_user_id, seat_id, accept_insurance):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)

    if table_state.get("round_state") != BLACKJACK_ROUND_INSURANCE:
        raise ValueError("Insurance is not available right now.")

    seat_claims = blackjack_session.get("seat_claims") or {}

    if seat_id not in HAND_SLOT_SEAT_IDS or seat_claims.get(seat_id) != current_user_id:
        raise ValueError("Choose one of your seats for insurance.")

    seat_side_bets = ensure_blackjack_seat_side_bets(table_state)
    insurance_bet = (seat_side_bets.get(seat_id) or {}).get(BLACKJACK_BET_TYPE_INSURANCE)

    if not insurance_bet or insurance_bet.get("status") != "offered":
        raise ValueError("Insurance was already decided for that seat.")

    max_bet_cents = int(insurance_bet.get("max_bet_cents") or 0)

    if accept_insurance:
        if max_bet_cents <= 0:
            raise ValueError("Insurance is not available for that seat.")

        if get_user_balance(current_user_id) < max_bet_cents:
            raise ValueError("You do not have enough balance for insurance.")

        set_user_balance(current_user_id, get_user_balance(current_user_id) - max_bet_cents)
        insurance_bet["bet_cents"] = max_bet_cents
        insurance_bet["result"] = "accepted"
        insurance_bet["result_label"] = "Insurance Taken"
        insurance_bet["status"] = "accepted"
    else:
        insurance_bet["bet_cents"] = 0
        insurance_bet["result"] = "declined"
        insurance_bet["result_label"] = "Declined"
        insurance_bet["status"] = "declined"

    table_state["updated_at"] = time.time()

    if get_blackjack_insurance_offer_seat_ids(table_state):
        table_state["message"] = "Dealer shows an Ace. Insurance?"
        return

    dealer_has_blackjack, insurance_result_labels = settle_blackjack_insurance_bets(blackjack_session)

    if insurance_result_labels:
        table_state["message"] = " | ".join(insurance_result_labels)

    if dealer_has_blackjack:
        finish_blackjack_dealer_turn(blackjack_session)
        return

    continue_blackjack_round_after_initial_deal(blackjack_session, allow_insurance_offer=False)


def perform_blackjack_player_action(blackjack_session, current_user_id, action):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)
    active_hand = get_blackjack_active_hand(table_state)

    if table_state.get("round_state") != BLACKJACK_ROUND_PLAYER_TURN or not active_hand:
        raise ValueError("No player decision is available right now.")

    if active_hand.get("user_id") != current_user_id:
        raise ValueError("It is another player's turn.")

    hand_value = get_blackjack_hand_value(active_hand.get("cards") or [])

    if active_hand.get("bust") or active_hand.get("stood") or hand_value["total"] >= 21:
        advance_blackjack_after_hand(blackjack_session)
        return

    if action == "hit":
        active_hand["cards"].append(draw_blackjack_card(table_state))
        refresh_blackjack_hand_flags(active_hand)

        if active_hand.get("bust") or get_blackjack_hand_value(active_hand.get("cards") or [])["total"] >= 21:
            active_hand["stood"] = True
            advance_blackjack_after_hand(blackjack_session)
        else:
            table_state["updated_at"] = time.time()
        return

    if action == "stand":
        active_hand["stood"] = True
        advance_blackjack_after_hand(blackjack_session)
        return

    if action == "double":
        bet_cents = int(active_hand.get("bet_cents") or 0)

        if len(active_hand.get("cards") or []) != 2 or get_user_balance(current_user_id) < bet_cents:
            raise ValueError("You cannot double this hand.")

        set_user_balance(current_user_id, get_user_balance(current_user_id) - bet_cents)
        active_hand["bet_cents"] += bet_cents
        active_hand["doubled"] = True
        active_hand["cards"].append(draw_blackjack_card(table_state))
        refresh_blackjack_hand_flags(active_hand)
        active_hand["stood"] = True
        advance_blackjack_after_hand(blackjack_session)
        return

    if action == "split":
        cards = active_hand.get("cards") or []
        bet_cents = int(active_hand.get("bet_cents") or 0)
        seat_hands = [
            hand
            for hand in table_state.get("hands") or []
            if hand.get("seat_id") == active_hand.get("seat_id")
        ]

        if (
            len(seat_hands) != 1
            or len(cards) != 2
            or cards[0].get("value") != cards[1].get("value")
            or get_user_balance(current_user_id) < bet_cents
        ):
            raise ValueError("You cannot split this hand.")

        set_user_balance(current_user_id, get_user_balance(current_user_id) - bet_cents)
        active_index = int(table_state.get("active_hand_index") or 0)
        first_hand = create_blackjack_hand(
            active_hand["seat_id"],
            current_user_id,
            bet_cents,
            cards=[cards[0]],
            split_from_pair=True,
            seat_layout_index=0,
        )
        second_hand = create_blackjack_hand(
            active_hand["seat_id"],
            current_user_id,
            bet_cents,
            cards=[cards[1]],
            split_from_pair=True,
            seat_layout_index=1,
        )
        table_state["hands"][active_index:active_index + 1] = [second_hand, first_hand]

        for hand in [second_hand, first_hand]:
            hand["cards"].append(draw_blackjack_card(table_state))
            refresh_blackjack_hand_flags(hand)

        table_state["active_hand_index"] = active_index
        table_state["updated_at"] = time.time()

        next_index = find_next_blackjack_playable_hand_index(table_state, active_index)

        if next_index < 0:
            finish_blackjack_dealer_turn(blackjack_session)
        else:
            table_state["active_hand_index"] = next_index
        return

    raise ValueError("Choose a valid blackjack action.")


def create_coinflip_session_record(creator_user, choice, bet_cents, *, opponent=None, countdown_started_at=None):
    creator_snapshot = remember_user_profile(creator_user)
    opponent_snapshot = remember_user_profile(opponent) if opponent else None
    session_id = build_coinflip_session_id()

    return {
        "bet_cents": bet_cents,
        "countdown_started_at": countdown_started_at if opponent_snapshot else None,
        "created_at": time.time(),
        "creator": creator_snapshot,
        "creator_choice": choice,
        "id": session_id,
        "opponent": opponent_snapshot,
        "opponent_choice": other_coin_side(choice),
        "redo_session_id": None,
        "rematch_source_session_id": None,
        "resolved_at": None,
        "result_side": None,
        "winner_id": None,
        "winner_name": None,
    }


def create_dice_session_record(
    creator_user,
    bet_cents,
    mode,
    *,
    side=None,
    target_wins=None,
    double_roll=False,
    opponent=None,
    countdown_started_at=None,
):
    creator_snapshot = remember_user_profile(creator_user)
    opponent_snapshot = remember_user_profile(opponent) if opponent else None
    session_id = build_dice_session_id()

    return {
        "bet_cents": bet_cents,
        "countdown_started_at": countdown_started_at if opponent_snapshot else None,
        "created_at": time.time(),
        "creator": creator_snapshot,
        "creator_score": 0,
        "creator_side": side if mode == "classic" else None,
        "double_roll": bool(double_roll) if mode == "first_to" else False,
        "id": session_id,
        "mode": mode,
        "opponent": opponent_snapshot,
        "opponent_score": 0,
        "opponent_side": other_dice_side(side) if mode == "classic" and side in {"Low", "High"} else None,
        "redo_session_id": None,
        "rematch_source_session_id": None,
        "rounds": [],
        "resolved_at": None,
        "result_face": None,
        "target_wins": target_wins if mode == "first_to" else None,
        "winner_id": None,
        "winner_name": None,
    }


def get_coinflip_choice_for_user(coinflip_session, user_id):
    if not user_id:
        return None

    if coinflip_session["creator"]["id"] == user_id:
        return coinflip_session["creator_choice"]

    if coinflip_session.get("opponent") and coinflip_session["opponent"]["id"] == user_id:
        return coinflip_session.get("opponent_choice")

    return None


def get_coinflip_rematch_opponent(coinflip_session, user_id):
    if not user_id:
        return None

    if coinflip_session["creator"]["id"] == user_id:
        return coinflip_session.get("opponent")

    if coinflip_session.get("opponent") and coinflip_session["opponent"]["id"] == user_id:
        return coinflip_session["creator"]

    return None


def build_session_participant_ids(session_record):
    participant_ids = {
        session_record["creator"]["id"],
    }
    opponent = session_record.get("opponent")

    if opponent:
        participant_ids.add(opponent["id"])

    return participant_ids


def coinflip_session_is_resolved(coinflip_session):
    return bool(coinflip_session.get("winner_id") or coinflip_session.get("result_side"))


def join_coinflip_session_record(coinflip_session_data, joining_user):
    joining_user = remember_user_profile(joining_user)
    joining_user_id = joining_user["id"]
    sync_coinflip_session_state(coinflip_session_data)

    if coinflip_session_is_resolved(coinflip_session_data) or coinflip_session_data["opponent"]:
        raise ValueError("This session is no longer available.")

    if coinflip_session_data["creator"]["id"] == joining_user_id:
        return False

    current_balance = get_user_balance(joining_user_id)
    bet_cents = coinflip_session_data["bet_cents"]

    if bet_cents > current_balance:
        raise ValueError("You do not have enough balance to join that session.")

    set_user_balance(joining_user_id, current_balance - bet_cents)
    coinflip_session_data["opponent"] = joining_user
    coinflip_session_data["countdown_started_at"] = time.time()
    return True


def get_active_coinflip_redo_session(source_session):
    redo_session_id = source_session.get("redo_session_id")

    if not redo_session_id:
        return None

    redo_session = COINFLIP_SESSIONS.get(redo_session_id)

    if not redo_session:
        source_session["redo_session_id"] = None
        return None

    sync_coinflip_session_state(redo_session)

    if (
        redo_session.get("rematch_source_session_id") != source_session["id"]
        or not build_session_participant_ids(redo_session).issubset(build_session_participant_ids(source_session))
        or coinflip_session_is_resolved(redo_session)
    ):
        source_session["redo_session_id"] = None
        return None

    return redo_session


def get_dice_side_for_user(dice_session, user_id):
    if not user_id or get_dice_session_mode(dice_session) != "classic":
        return None

    if dice_session["creator"]["id"] == user_id:
        return dice_session["creator_side"]

    if dice_session.get("opponent") and dice_session["opponent"]["id"] == user_id:
        return dice_session.get("opponent_side")

    return None


def get_dice_rematch_opponent(dice_session, user_id):
    if not user_id:
        return None

    if dice_session["creator"]["id"] == user_id:
        return dice_session.get("opponent")

    if dice_session.get("opponent") and dice_session["opponent"]["id"] == user_id:
        return dice_session["creator"]

    return None


def join_dice_session_record(dice_session_data, joining_user):
    joining_user = remember_user_profile(joining_user)
    joining_user_id = joining_user["id"]
    sync_dice_session_state(dice_session_data)

    if dice_session_is_resolved(dice_session_data) or dice_session_data["opponent"]:
        raise ValueError("This session is no longer available.")

    if dice_session_data["creator"]["id"] == joining_user_id:
        return False

    current_balance = get_user_balance(joining_user_id)
    bet_cents = dice_session_data["bet_cents"]

    if bet_cents > current_balance:
        raise ValueError("You do not have enough balance to join that session.")

    set_user_balance(joining_user_id, current_balance - bet_cents)
    dice_session_data["opponent"] = joining_user
    dice_session_data["countdown_started_at"] = time.time()
    return True


def get_active_dice_redo_session(source_session):
    redo_session_id = source_session.get("redo_session_id")

    if not redo_session_id:
        return None

    redo_session = DICE_SESSIONS.get(redo_session_id)

    if not redo_session:
        source_session["redo_session_id"] = None
        return None

    sync_dice_session_state(redo_session)

    if (
        redo_session.get("rematch_source_session_id") != source_session["id"]
        or not build_session_participant_ids(redo_session).issubset(build_session_participant_ids(source_session))
        or dice_session_is_resolved(redo_session)
    ):
        source_session["redo_session_id"] = None
        return None

    return redo_session


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


def request_prefers_json_response():
    accepted_content = request.headers.get("Accept", "")
    return "application/json" in accepted_content and "text/html" not in accepted_content


def is_admin_user(user_profile):
    normalized_user = normalize_user_profile(user_profile)
    return bool(normalized_user and normalized_user.get("id") == ADMIN_PANEL_USER_ID)


def assign_session_auth_version(user_profile):
    normalized_user = normalize_user_profile(user_profile)

    if not normalized_user:
        session.pop("auth_version", None)
        return

    session["auth_version"] = USER_AUTH_VERSIONS.setdefault(normalized_user["id"], 1)


def revoke_user_auth_sessions(user_id):
    if not user_id or user_id == BOT_PROFILE["id"]:
        return 0

    current_version = USER_AUTH_VERSIONS.setdefault(user_id, 1)
    USER_AUTH_VERSIONS[user_id] = current_version + 1
    return USER_AUTH_VERSIONS[user_id]


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
    avatar_static_url = None

    if avatar_hash:
        avatar_extension = "gif" if avatar_hash.startswith("a_") else "png"
        avatar_url = build_discord_avatar_url(discord_user["id"], avatar_hash, avatar_extension)
        avatar_static_url = build_discord_avatar_url(discord_user["id"], avatar_hash, "png")

    return {
        "avatar_static_url": avatar_static_url,
        "avatar_url": avatar_url,
        "display_name": discord_user.get("global_name") or discord_user.get("username"),
        "id": discord_user["id"],
        "username": discord_user["username"],
    }


def login_required(view_function):
    @wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if get_current_user():
            return view_function(*args, **kwargs)

        if request_prefers_json_response():
            return jsonify({
                "error": "Authentication required.",
                "redirect_url": url_for("play"),
            }), 401

        session["post_login_redirect"] = request.path
        flash("Sign in with Discord to access that page.", "error")
        return redirect(url_for("play"))

    return wrapped_view


def admin_panel_required(view_function):
    @wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if is_admin_user(get_current_user()):
            return view_function(*args, **kwargs)

        return ("", 404)

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


def sync_game_session_state(game, session_record):
    if game == "coinflip":
        sync_coinflip_session_state(session_record)
        return

    if game == "dice":
        sync_dice_session_state(session_record)
        return

    raise ValueError("Choose a valid game.")


def game_session_is_resolved(game, session_record):
    if game == "coinflip":
        return coinflip_session_is_resolved(session_record)

    if game == "dice":
        return dice_session_is_resolved(session_record)

    raise ValueError("Choose a valid game.")


def build_session_refund_participants(session_record):
    participants = []
    seen_user_ids = set()

    for participant in (session_record.get("creator"), session_record.get("opponent")):
        participant_id = participant.get("id") if participant else None

        if not participant_id or participant_id == BOT_PROFILE["id"] or participant_id in seen_user_ids:
            continue

        seen_user_ids.add(participant_id)
        participants.append(participant)

    return participants


def build_coinflip_session_state(coinflip_session, current_user_id):
    sync_coinflip_session_state(coinflip_session)

    creator = make_user_snapshot(coinflip_session["creator"])
    opponent = make_user_snapshot(coinflip_session["opponent"]) if coinflip_session["opponent"] else None
    is_creator = current_user_id == creator["id"]
    is_participant = current_user_id in {
        creator["id"],
        opponent["id"] if opponent else None,
    }
    countdown_ends_at = None
    current_user_choice = None

    if current_user_id == creator["id"]:
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
        participant_ids = {
            creator["id"],
            opponent["id"] if opponent else None,
        }

        if current_user_id in participant_ids:
            did_win = coinflip_session["winner_id"] == current_user_id

    session_path = f"/games/coinflip/sessions/{coinflip_session['id']}"
    viewers = build_session_viewers(
        session_path,
        current_user_id=current_user_id,
        creator_user_id=creator["id"],
        opponent_user_id=opponent["id"] if opponent else None,
    )
    reveal_pending = coinflip_session_reveal_pending(coinflip_session)
    can_redo = status == "resolved" and is_participant and not reveal_pending
    can_share_chat = status != "resolved" or not reveal_pending
    session_state = {
        "bet_cents": coinflip_session["bet_cents"],
        "bet_display": format_money(coinflip_session["bet_cents"]),
        "can_call_bot": is_creator and not opponent and not coinflip_session["result_side"],
        "can_join": status == "open" and not is_participant,
        "can_share_chat": can_share_chat,
        "countdown_ends_at": countdown_ends_at,
        "countdown_remaining": countdown_remaining,
        "creator": creator,
        "creator_choice": coinflip_session["creator_choice"],
        "current_balance_display": format_money(get_user_balance(current_user_id)) if current_user_id else None,
        "current_user_choice": current_user_choice,
        "did_win": did_win,
        "id": coinflip_session["id"],
        "is_creator": is_creator,
        "is_participant": is_participant,
        "join_url": (
            url_for("join_coinflip_session", session_id=coinflip_session["id"])
            if status == "open" and not is_participant and has_request_context()
            else None
        ),
        "opponent": opponent,
        "opponent_choice": coinflip_session["opponent_choice"],
        "pot_cents": coinflip_session["bet_cents"] * 2,
        "pot_display": format_money(coinflip_session["bet_cents"] * 2),
        "can_redo": can_redo,
        "redo_url": (
            url_for("redo_coinflip_session", session_id=coinflip_session["id"])
            if status == "resolved" and is_participant and has_request_context()
            else None
        ),
        "result_side": coinflip_session["result_side"],
        "status": status,
        "status_text": status_text,
        "viewer_count": len(viewers),
        "viewers": viewers,
        "winner_id": coinflip_session["winner_id"],
        "winner_name": coinflip_session["winner_name"],
    }

    session_state["reveal_pending"] = reveal_pending
    session_state["display_status_text"] = (
        "Flipping..."
        if session_state["reveal_pending"]
        else session_state["status_text"]
    )
    return session_state


def create_blackjack_session_record(creator_user, table_name):
    creator_snapshot = remember_user_profile(creator_user)
    session_id = build_blackjack_session_id()
    normalized_table_name = normalize_blackjack_table_name(
        table_name,
        creator_snapshot["display_name"],
    )

    return {
        "created_at": time.time(),
        "creator": creator_snapshot,
        "description": "Live blackjack room with shared seats and dealer cards.",
        "id": session_id,
        "seat_count": BLACKJACK_SESSION_MAX_SEATS,
        "seat_claims": {},
        "table_state": create_blackjack_table_state(),
        "table_name": normalized_table_name,
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
        lobby_status, lobby_status_text = build_coinflip_chat_share_status(session_state, coinflip_session)
        is_owner = session_state["creator"]["id"] == current_user_id
        is_joinable = session_state["status"] == "open" and not is_owner

        if lobby_status == "open":
            session_summary["open"] += 1
        elif lobby_status == "countdown":
            session_summary["live"] += 1
        elif lobby_status == "resolved":
            session_summary["resolved"] += 1

        sessions.append(
            {
                "bet_display": session_state["bet_display"],
                "countdown_ends_at": None if session_state["reveal_pending"] else session_state["countdown_ends_at"],
                "created_at": coinflip_session["created_at"],
                "creator_choice": session_state["creator_choice"],
                "creator_name": session_state["creator"]["display_name"],
                "id": session_state["id"],
                "is_joinable": is_joinable,
                "is_owner": is_owner,
                "join_url": url_for("join_coinflip_session", session_id=session_state["id"]),
                "opponent_name": session_state["opponent"]["display_name"] if session_state["opponent"] else None,
                "pot_display": session_state["pot_display"],
                "status": lobby_status,
                "status_text": lobby_status_text,
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

    creator = make_user_snapshot(dice_session["creator"])
    opponent = make_user_snapshot(dice_session["opponent"]) if dice_session["opponent"] else None
    is_creator = current_user_id == creator["id"]
    is_participant = current_user_id in {
        creator["id"],
        opponent["id"] if opponent else None,
    }
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

    session_path = f"/games/dice/sessions/{dice_session['id']}"
    viewers = build_session_viewers(
        session_path,
        current_user_id=current_user_id,
        creator_user_id=creator["id"],
        opponent_user_id=opponent["id"] if opponent else None,
    )
    reveal_pending = dice_session_reveal_pending({
        "is_double_roll": is_double_roll,
        "is_first_to": is_first_to,
        "rounds": dice_session.get("rounds", []),
        "status": status,
    }, dice_session)
    can_redo = status == "resolved" and is_participant and not reveal_pending
    can_share_chat = status != "resolved" or not reveal_pending
    session_state = {
        "bet_cents": dice_session["bet_cents"],
        "bet_display": format_money(dice_session["bet_cents"]),
        "can_call_bot": is_creator and not opponent and not dice_session_is_resolved(dice_session),
        "can_join": status == "open" and not is_participant,
        "can_share_chat": can_share_chat,
        "countdown_ends_at": countdown_ends_at,
        "countdown_remaining": countdown_remaining,
        "creator": creator,
        "creator_hint": creator_hint,
        "creator_label": creator_label,
        "creator_score": dice_session.get("creator_score", 0),
        "current_balance_display": format_money(get_user_balance(current_user_id)) if current_user_id else None,
        "did_win": did_win,
        "id": dice_session["id"],
        "is_creator": is_creator,
        "is_double_roll": is_double_roll,
        "is_first_to": is_first_to,
        "is_participant": is_participant,
        "join_url": (
            url_for("join_dice_session", session_id=dice_session["id"])
            if status == "open" and not is_participant and has_request_context()
            else None
        ),
        "mode": mode,
        "mode_label": get_dice_mode_label(dice_session),
        "opponent": opponent,
        "opponent_hint": opponent_hint,
        "opponent_label": opponent_label,
        "opponent_score": dice_session.get("opponent_score", 0),
        "pot_cents": dice_session["bet_cents"] * 2,
        "pot_display": format_money(dice_session["bet_cents"] * 2),
        "can_redo": can_redo,
        "redo_url": (
            url_for("redo_dice_session", session_id=dice_session["id"])
            if status == "resolved" and is_participant and has_request_context()
            else None
        ),
        "result_face": dice_session["result_face"],
        "rounds": dice_session.get("rounds", []),
        "status": status,
        "status_text": status_text,
        "target_wins": target_wins,
        "viewer_count": len(viewers),
        "viewers": viewers,
        "winner_id": dice_session["winner_id"],
        "winner_name": dice_session["winner_name"],
    }

    session_state["reveal_pending"] = reveal_pending
    session_state["display_status_text"] = (
        "Rolling..."
        if session_state["reveal_pending"]
        else session_state["status_text"]
    )
    return session_state


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
        lobby_status, lobby_status_text = build_dice_chat_share_status(session_state, dice_session)
        is_owner = session_state["creator"]["id"] == current_user_id
        is_joinable = session_state["status"] == "open" and not is_owner

        if lobby_status == "open":
            session_summary["open"] += 1
        elif lobby_status == "countdown":
            session_summary["live"] += 1
        elif lobby_status == "resolved":
            session_summary["resolved"] += 1

        sessions.append(
            {
                "bet_display": session_state["bet_display"],
                "countdown_ends_at": None if session_state["reveal_pending"] else session_state["countdown_ends_at"],
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
                "status": lobby_status,
                "status_text": lobby_status_text,
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


def build_blackjack_session_state(blackjack_session, current_user_id):
    sync_blackjack_session_seat_claims(blackjack_session)
    creator = make_user_snapshot(blackjack_session["creator"])
    session_path = f"/games/blackjack/sessions/{blackjack_session['id']}"
    viewers = build_session_viewers(
        session_path,
        current_user_id=current_user_id,
        creator_user_id=creator["id"],
    )
    occupancy_count = len(blackjack_session.get("seat_claims") or {})
    is_live = occupancy_count > 0
    status = "live" if is_live else "open"
    occupancy_text = (
        "Nobody is seated right now."
        if occupancy_count <= 0
        else f"{occupancy_count} player{'s' if occupancy_count != 1 else ''} at the table."
    )
    status_text = "Table is live now." if is_live else "Open table."
    session_state = {
        "created_at": blackjack_session["created_at"],
        "creator": creator,
        "description": blackjack_session["description"],
        "frame_url": (
            url_for("blackjack_frame", session_id=blackjack_session["id"])
            if has_request_context()
            else None
        ),
        "id": blackjack_session["id"],
        "is_creator": current_user_id == creator["id"],
        "occupancy_count": occupancy_count,
        "occupancy_text": occupancy_text,
        "seat_count": blackjack_session.get("seat_count", BLACKJACK_SESSION_MAX_SEATS),
        "status": status,
        "status_text": status_text,
        "table_name": blackjack_session["table_name"],
        "viewer_count": len(viewers),
        "viewers": viewers,
    }
    session_state["version"] = build_state_version(
        {
            "created_at": session_state["created_at"],
            "creator_name": session_state["creator"]["display_name"],
            "id": session_state["id"],
            "occupancy_count": session_state["occupancy_count"],
            "status": session_state["status"],
            "table_name": session_state["table_name"],
            "viewer_ids": [viewer["id"] for viewer in viewers],
        }
    )
    return session_state


def get_blackjack_session_path(session_id):
    return f"/games/blackjack/sessions/{session_id}"


def touch_blackjack_session_presence(session_id, user_profile=None):
    profile = user_profile or g.get("discord_user") or get_current_user()

    if not profile:
        return

    touch_user_presence(profile, get_blackjack_session_path(session_id))


def sync_blackjack_session_seat_claims(blackjack_session):
    session_path = normalize_presence_path(get_blackjack_session_path(blackjack_session["id"]))
    seat_claims = blackjack_session.setdefault("seat_claims", {})
    stale_seat_ids = []

    for seat_id, user_id in list(seat_claims.items()):
        if seat_id not in HAND_SLOT_SEAT_IDS or not user_id or user_id == BOT_PROFILE["id"]:
            stale_seat_ids.append(seat_id)
            continue

        presence = USER_PRESENCE.get(user_id)
        if (
            not user_presence_is_online(presence)
            or normalize_presence_path(presence.get("current_path")) != session_path
        ):
            stale_seat_ids.append(seat_id)
            continue

        if user_id not in USER_PROFILES:
            stale_seat_ids.append(seat_id)

    for seat_id in stale_seat_ids:
        seat_claims.pop(seat_id, None)

    cleanup_blackjack_pending_bets_for_claims(blackjack_session)
    return seat_claims


def build_public_blackjack_dealer_state(table_state):
    dealer_state = table_state.get("dealer") or create_blackjack_dealer_state()
    hole_card = dealer_state.get("hole_card")
    is_hole_revealed = bool(dealer_state.get("is_hole_revealed"))

    return {
        "cards": [
            normalize_blackjack_card(card)
            for card in dealer_state.get("cards") or []
            if normalize_blackjack_card(card)
        ],
        "holeCard": normalize_blackjack_card(hole_card) if hole_card and is_hole_revealed else ({"isFaceDown": True} if hole_card else None),
        "isHoleRevealed": is_hole_revealed,
    }


def build_public_blackjack_hand(hand, current_user_id):
    user_profile = USER_PROFILES.get(hand.get("user_id")) or {}
    owner_name = user_profile.get("display_name") or user_profile.get("username") or "Player"

    return {
        "bet": int(hand.get("bet_cents") or 0) / 100,
        "betCents": int(hand.get("bet_cents") or 0),
        "blackjack": bool(hand.get("blackjack")),
        "bust": bool(hand.get("bust")),
        "cards": [
            normalize_blackjack_card(card)
            for card in hand.get("cards") or []
            if normalize_blackjack_card(card)
        ],
        "doubled": bool(hand.get("doubled")),
        "id": hand.get("id"),
        "isSelf": hand.get("user_id") == current_user_id,
        "ownerName": owner_name,
        "payout": int(hand.get("payout_cents") or 0) / 100,
        "payoutCents": int(hand.get("payout_cents") or 0),
        "result": hand.get("result") or "",
        "seatId": hand.get("seat_id"),
        "seatLayoutIndex": int(hand.get("seat_layout_index") or 0),
        "splitFromPair": bool(hand.get("split_from_pair")),
        "stood": bool(hand.get("stood")),
        "userId": hand.get("user_id"),
    }


def build_public_blackjack_pending_chip(chip, current_user_id):
    user_profile = USER_PROFILES.get(chip.get("user_id")) or {}
    bet_type = normalize_blackjack_bet_type(chip.get("bet_type"))

    return {
        "betType": bet_type,
        "isSelf": chip.get("user_id") == current_user_id,
        "ownerName": user_profile.get("display_name") or user_profile.get("username") or "Player",
        "seatId": chip.get("seat_id"),
        "userId": chip.get("user_id"),
        "value": int(chip.get("value_cents") or 0) / 100,
        "valueCents": int(chip.get("value_cents") or 0),
    }


def build_public_blackjack_side_bet(side_bet):
    if not isinstance(side_bet, dict):
        return None

    bet_type = normalize_blackjack_bet_type(side_bet.get("bet_type"), allow_insurance=True)

    if not bet_type:
        return None

    return {
        "bet": int(side_bet.get("bet_cents") or 0) / 100,
        "betCents": int(side_bet.get("bet_cents") or 0),
        "betType": bet_type,
        "label": BLACKJACK_BET_TYPE_LABELS.get(bet_type, "Side Bet"),
        "maxBet": int(side_bet.get("max_bet_cents") or 0) / 100,
        "maxBetCents": int(side_bet.get("max_bet_cents") or 0),
        "payoutCredited": bool(side_bet.get("payout_credited")),
        "payout": int(side_bet.get("payout_cents") or 0) / 100,
        "payoutCents": int(side_bet.get("payout_cents") or 0),
        "result": side_bet.get("result") or "",
        "resultLabel": side_bet.get("result_label") or "",
        "status": side_bet.get("status") or "none",
    }


def build_public_blackjack_table_state(blackjack_session, current_user_id):
    table_state = sync_blackjack_table_lifecycle(blackjack_session)
    seat_claims = blackjack_session.get("seat_claims") or {}
    live_bets_by_seat = get_blackjack_live_bets_by_seat(table_state)
    pending_bets_by_seat = get_blackjack_pending_bets_by_seat(table_state, BLACKJACK_BET_TYPE_MAIN)
    pending_side_bets_by_seat = get_blackjack_pending_side_bets_by_seat(table_state)
    seat_bet_amounts = {}

    for seat_id in HAND_SLOT_SEAT_IDS:
        amount_cents = live_bets_by_seat.get(seat_id, 0) or pending_bets_by_seat.get(seat_id, 0)
        if amount_cents:
            seat_bet_amounts[seat_id] = amount_cents / 100

    active_hand = get_blackjack_active_hand(table_state)
    self_pending_bet_cents = get_blackjack_pending_total_for_user(table_state, current_user_id)
    self_last_bet_cents = get_blackjack_last_bet_total_for_user(table_state, current_user_id)
    self_last_bet_snapshot = get_blackjack_last_bet_snapshot_for_user(table_state, current_user_id)
    self_last_bet_seat_ids = {
        chip.get("seat_id")
        for chip in self_last_bet_snapshot
        if chip.get("seat_id")
    }
    self_last_bet_seats_available = bool(self_last_bet_seat_ids) and all(
        seat_claims.get(seat_id) in {None, current_user_id}
        for seat_id in self_last_bet_seat_ids
    )
    ready_user_ids = get_blackjack_ready_user_ids(table_state) & get_blackjack_claimed_user_ids(seat_claims)
    self_has_required_bets = blackjack_user_has_bets_on_claimed_seats(table_state, seat_claims, current_user_id)
    required_ready_count = len(get_blackjack_claimed_user_ids(seat_claims))
    ready_count = len(ready_user_ids)
    public_seat_side_bets = {}
    self_has_pending_chips = any(
        chip.get("user_id") == current_user_id
        for chip in table_state.get("pending_bet_chips") or []
    )

    for seat_id, seat_side_bets in (ensure_blackjack_seat_side_bets(table_state) or {}).items():
        public_bets = {}

        for bet_type, side_bet in (seat_side_bets or {}).items():
            public_side_bet = build_public_blackjack_side_bet(side_bet)

            if public_side_bet:
                public_bets[bet_type] = public_side_bet

        if public_bets:
            public_seat_side_bets[seat_id] = public_bets

    return {
        "active_hand_id": active_hand.get("id") if active_hand else None,
        "active_hand_index": int(table_state.get("active_hand_index") or 0),
        "active_seat_id": active_hand.get("seat_id") if active_hand else None,
        "active_user_id": active_hand.get("user_id") if active_hand else None,
        "available_actions": get_blackjack_available_actions(table_state, current_user_id),
        "dealer": build_public_blackjack_dealer_state(table_state),
        "hands": [
            build_public_blackjack_hand(hand, current_user_id)
            for hand in table_state.get("hands") or []
        ],
        "insurance_offer_seat_ids": get_blackjack_insurance_offer_seat_ids(table_state),
        "last_results": list(table_state.get("last_results") or []),
        "message": table_state.get("message") or "",
        "pending_bet_chips": [
            build_public_blackjack_pending_chip(chip, current_user_id)
            for chip in table_state.get("pending_bet_chips") or []
        ],
        "pending_bets": {
            seat_id: amount_cents / 100
            for seat_id, amount_cents in pending_bets_by_seat.items()
        },
        "pending_side_bets": {
            seat_id: {
                bet_type: int(amount_cents or 0) / 100
                for bet_type, amount_cents in seat_side_bets.items()
            }
            for seat_id, seat_side_bets in pending_side_bets_by_seat.items()
        },
        "round_id": table_state.get("round_id"),
        "round_state": table_state.get("round_state") or BLACKJACK_ROUND_WAITING,
        "ready_count": ready_count,
        "ready_seat_ids": [
            seat_id
            for seat_id, owner_user_id in seat_claims.items()
            if owner_user_id in ready_user_ids
        ],
        "ready_user_ids": sorted(ready_user_ids),
        "required_ready_count": required_ready_count,
        "seat_bet_amounts": seat_bet_amounts,
        "seat_side_bets": public_seat_side_bets,
        "self_can_ready": bool(
            current_user_id
            and current_user_id in get_blackjack_claimed_user_ids(seat_claims)
            and self_has_required_bets
            and table_state.get("round_state") in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}
        ),
        "self_can_rebet": bool(
            current_user_id
            and self_last_bet_cents > 0
            and not self_has_pending_chips
            and self_last_bet_seats_available
            and self_last_bet_cents <= get_user_balance(current_user_id)
            and table_state.get("round_state") in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}
        ),
        "self_last_bet_amount": self_last_bet_cents / 100,
        "self_last_bet_cents": self_last_bet_cents,
        "self_pending_bet_amount": self_pending_bet_cents / 100,
        "self_pending_bet_cents": self_pending_bet_cents,
        "self_ready": current_user_id in ready_user_ids,
        "settled_at": table_state.get("settled_at"),
        "shoe": {
            "deckId": table_state.get("shoe", {}).get("deck_id") or "",
            "isReady": bool(table_state.get("shoe", {}).get("is_ready", True)),
            "remaining": int(table_state.get("shoe", {}).get("remaining") or 0),
        },
        "updated_at": table_state.get("updated_at"),
    }


def build_blackjack_table_payload(blackjack_session, current_user_id):
    seat_claims = sync_blackjack_session_seat_claims(blackjack_session)
    public_table_state = build_public_blackjack_table_state(blackjack_session, current_user_id)
    claims = []
    self_seat_ids = []

    for seat_id in HAND_SLOT_SEAT_IDS:
        owner_user_id = seat_claims.get(seat_id)

        if not owner_user_id:
            continue

        owner_profile = USER_PROFILES.get(owner_user_id)
        if not owner_profile:
            continue

        owner_snapshot = make_user_snapshot(owner_profile)
        is_self = owner_user_id == current_user_id

        if is_self:
            self_seat_ids.append(seat_id)

        claims.append(
            {
                "is_self": is_self,
                "seat_id": seat_id,
                "user": owner_snapshot,
            }
        )

    current_balance_cents = get_user_balance(current_user_id) if current_user_id else 0
    version_payload = {
        "balance_cents": current_balance_cents,
        "claims": [
            {
                "seat_id": claim["seat_id"],
                "user_id": claim["user"]["id"],
            }
            for claim in claims
        ],
        "session_id": blackjack_session["id"],
        "table": public_table_state,
    }

    return {
        "current_balance_amount": current_balance_cents / 100,
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents),
        "poll_interval_ms": 900 if public_table_state["round_state"] not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING} else (1200 if claims else 2600),
        "seat_claims": claims,
        "self_seat_ids": self_seat_ids,
        "session_id": blackjack_session["id"],
        "table_state": public_table_state,
        "table_name": blackjack_session["table_name"],
        "version": build_state_version(version_payload),
    }


def build_blackjack_lobby_sessions(current_user_id):
    sessions = []
    session_summary = {
        "live": 0,
        "open": 0,
        "resolved": 0,
    }
    status_priority = {
        "live": 0,
        "open": 1,
    }

    for blackjack_session in BLACKJACK_SESSIONS.values():
        session_state = build_blackjack_session_state(blackjack_session, current_user_id)
        session_summary[session_state["status"]] += 1
        sessions.append(
            {
                "created_at": session_state["created_at"],
                "creator_name": session_state["creator"]["display_name"],
                "id": session_state["id"],
                "occupancy_count": session_state["occupancy_count"],
                "occupancy_text": session_state["occupancy_text"],
                "seat_count": session_state["seat_count"],
                "status": session_state["status"],
                "status_text": session_state["status_text"],
                "table_name": session_state["table_name"],
                "view_url": url_for("blackjack_session", session_id=session_state["id"]),
                "viewer_count": session_state["viewer_count"],
            }
        )

    sessions.sort(key=lambda item: (status_priority.get(item["status"], 9), -item["created_at"]))
    return sessions, session_summary


def build_blackjack_lobby_payload(current_user_id):
    blackjack_sessions, session_summary = build_blackjack_lobby_sessions(current_user_id)
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None
    version_payload = {
        "current_balance_cents": current_balance_cents,
        "session_summary": session_summary,
        "sessions": [
            {
                "created_at": blackjack_session["created_at"],
                "id": blackjack_session["id"],
                "occupancy_count": blackjack_session["occupancy_count"],
                "status": blackjack_session["status"],
                "table_name": blackjack_session["table_name"],
                "viewer_count": blackjack_session["viewer_count"],
            }
            for blackjack_session in blackjack_sessions
        ],
    }

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents) if current_balance_cents is not None else None,
        "poll_interval_ms": 1800 if session_summary["live"] else 3200,
        "session_summary": session_summary,
        "sessions": blackjack_sessions,
        "version": build_state_version(version_payload),
    }


def build_coinflip_chat_share_status(session_state, coinflip_session):
    if session_state.get("reveal_pending"):
        return "countdown", "Flipping..."

    return session_state["status"], session_state["status_text"]


def coinflip_session_reveal_pending(coinflip_session):
    resolved_at = coinflip_session.get("resolved_at")

    return bool(
        coinflip_session.get("result_side")
        and coinflip_session.get("opponent")
        and resolved_at
        and time.time() < resolved_at + COINFLIP_CHAT_REVEAL_SECONDS
    )


def get_dice_chat_reveal_seconds(session_state):
    if not session_state.get("is_first_to"):
        return DICE_CHAT_MAX_ROLL_SECONDS

    rounds = session_state.get("rounds") or []

    if not rounds:
        return DICE_CHAT_MAX_ROLL_SECONDS

    total_seconds = DICE_CHAT_INTRO_SECONDS
    is_double_roll = bool(session_state.get("is_double_roll"))

    for round_index, round_data in enumerate(rounds):
        is_last_round = round_index >= len(rounds) - 1
        round_hold_seconds = (
            DICE_CHAT_TIE_HOLD_SECONDS
            if round_data.get("winner") == "tie"
            else DICE_CHAT_RESULT_HOLD_SECONDS
        )

        if is_double_roll:
            total_seconds += DICE_CHAT_MAX_ROLL_SECONDS
            total_seconds += DICE_CHAT_DOUBLE_SCORE_REVEAL_SECONDS
            total_seconds += DICE_CHAT_DOUBLE_BETWEEN_PLAYERS_SECONDS
            total_seconds += DICE_CHAT_MAX_ROLL_SECONDS
            total_seconds += DICE_CHAT_DOUBLE_SCORE_REVEAL_SECONDS
        else:
            total_seconds += DICE_CHAT_MAX_ROLL_SECONDS
            total_seconds += DICE_CHAT_SINGLE_BETWEEN_PLAYERS_SECONDS
            total_seconds += DICE_CHAT_MAX_ROLL_SECONDS
            total_seconds += DICE_CHAT_SINGLE_SCORE_REVEAL_SECONDS

        total_seconds += round_hold_seconds

        if not is_last_round:
            total_seconds += DICE_CHAT_TOP_RESET_SECONDS
            total_seconds += DICE_CHAT_BETWEEN_ROUNDS_SECONDS

    return total_seconds


def build_dice_chat_share_status(session_state, dice_session):
    if session_state.get("reveal_pending"):
        return "countdown", "Rolling..."

    return session_state["status"], session_state["status_text"]


def dice_session_reveal_pending(session_state, dice_session):
    resolved_at = dice_session.get("resolved_at")

    return bool(
        session_state.get("status") == "resolved"
        and dice_session.get("opponent")
        and resolved_at
        and time.time() < resolved_at + get_dice_chat_reveal_seconds(session_state)
    )


def build_chat_session_share_payload(game, session_id, current_user_id):
    if game == "coinflip":
        coinflip_session = COINFLIP_SESSIONS.get(session_id)

        if not coinflip_session:
            return None

        session_state = build_coinflip_session_state(coinflip_session, current_user_id)
        creator = session_state["creator"]
        status, status_text = build_coinflip_chat_share_status(session_state, coinflip_session)

        return {
            "bet_display": session_state["bet_display"],
            "creator_name": creator["display_name"],
            "game": "coinflip",
            "is_joinable": (
                session_state["status"] == "open"
                and current_user_id not in {creator["id"], session_state["opponent"]["id"] if session_state["opponent"] else None}
            ),
            "join_url": url_for("join_coinflip_session", session_id=session_state["id"]) if has_request_context() else None,
            "label": session_state["creator_choice"],
            "pot_display": session_state["pot_display"],
            "session_id": session_state["id"],
            "status": status,
            "status_text": status_text,
            "title": f"{creator['display_name']}'s coinflip",
            "view_url": url_for("coinflip_session", session_id=session_state["id"]) if has_request_context() else None,
        }

    if game == "dice":
        dice_session = DICE_SESSIONS.get(session_id)

        if not dice_session:
            return None

        session_state = build_dice_session_state(dice_session, current_user_id)
        creator = session_state["creator"]
        status, status_text = build_dice_chat_share_status(session_state, dice_session)

        return {
            "bet_display": session_state["bet_display"],
            "creator_name": creator["display_name"],
            "game": "dice",
            "is_joinable": (
                session_state["status"] == "open"
                and current_user_id not in {creator["id"], session_state["opponent"]["id"] if session_state["opponent"] else None}
            ),
            "join_url": url_for("join_dice_session", session_id=session_state["id"]) if has_request_context() else None,
            "label": (
                session_state["mode_label"]
                if session_state["is_first_to"]
                else session_state["creator_label"]
            ),
            "pot_display": session_state["pot_display"],
            "session_id": session_state["id"],
            "status": status,
            "status_text": status_text,
            "title": f"{creator['display_name']}'s dice session",
            "view_url": url_for("dice_session", session_id=session_state["id"]) if has_request_context() else None,
        }

    return None


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


def format_signed_money(amount_cents):
    absolute_display = format_money(abs(amount_cents))

    if amount_cents > 0:
        return f"+{absolute_display}"

    if amount_cents < 0:
        return f"-{absolute_display}"

    return absolute_display


def parse_balance_adjustment_to_cents(raw_value):
    try:
        parsed_value = Decimal(str(raw_value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Enter a valid balance adjustment.")

    if parsed_value == 0:
        raise ValueError("Enter a non-zero balance adjustment.")

    return int(parsed_value * 100)


def build_admin_location_label(path_value):
    normalized_path = normalize_presence_path(path_value)

    if not normalized_path:
        return "Idle"

    static_labels = {
        "/leaderboard": "Leaderboard",
        "/play": "Play",
        "/profile": "Profile",
        "/games/coinflip": "Coinflip lobby",
        "/games/dice": "Dice lobby",
    }

    if normalized_path in static_labels:
        return static_labels[normalized_path]

    coinflip_match = re.match(r"^/games/coinflip/sessions/([^/]+)$", normalized_path)

    if coinflip_match:
        return f"Coinflip {coinflip_match.group(1)[:8]}"

    dice_match = re.match(r"^/games/dice/sessions/([^/]+)$", normalized_path)

    if dice_match:
        return f"Dice {dice_match.group(1)[:8]}"

    return normalized_path


def build_admin_player_rows(current_user_id):
    user_ids = (
        set(USER_PROFILES.keys())
        | set(USER_BALANCES.keys())
        | set(USER_STATS.keys())
        | set(USER_REWARDS.keys())
    ) - {BOT_PROFILE["id"]}
    player_rows = []

    for user_id in user_ids:
        user_profile = normalize_user_profile(USER_PROFILES.get(user_id) or {
            "display_name": user_id,
            "id": user_id,
            "username": user_id,
        })
        stats = get_user_stats(user_id)
        reward_state = build_reward_state(user_id)
        presence = USER_PRESENCE.get(user_id) or {}
        is_online = user_presence_is_online(presence)
        balance_cents = get_user_balance(user_id)
        current_path = normalize_presence_path(presence.get("current_path"))

        player_rows.append(
            {
                "avatar_static_url": user_profile.get("avatar_static_url"),
                "avatar_url": user_profile.get("avatar_url"),
                "balance_adjust_url": (
                    url_for("admin_adjust_user_balance", user_id=user_id)
                    if has_request_context()
                    else None
                ),
                "balance_cents": balance_cents,
                "balance_display": format_money(balance_cents),
                "can_force_logout": user_id != current_user_id,
                "connected_since": presence.get("connected_at"),
                "current_path": current_path,
                "current_path_label": build_admin_location_label(current_path),
                "display_name": user_profile["display_name"],
                "force_logout_url": (
                    url_for("admin_force_logout_user", user_id=user_id)
                    if has_request_context()
                    else None
                ),
                "id": user_id,
                "is_active": is_online,
                "is_admin": user_id == ADMIN_PANEL_USER_ID,
                "is_current_user": user_id == current_user_id,
                "is_online": is_online,
                "last_seen": presence.get("last_seen"),
                "registered_at": user_profile.get("registered_at"),
                "reward_badge": reward_state["badge"],
                "reward_level": reward_state["level"],
                "site_visits": reward_state["site_visits"],
                "total_bets": stats["total_bets"],
                "total_deposited_cents": stats["total_deposited_cents"],
                "total_deposited_display": format_money(stats["total_deposited_cents"]),
                "total_wagered_cents": stats["total_wagered_cents"],
                "total_wagered_display": format_money(stats["total_wagered_cents"]),
                "username": user_profile["username"],
                "win_rate": round(stats["bets_won"] / stats["total_bets"] * 100 if stats["total_bets"] else 0, 1),
                "wins": stats["bets_won"],
                "losses": stats["bets_lost"],
            }
        )

    player_rows.sort(
        key=lambda row: (
            not row["is_online"],
            -row["total_wagered_cents"],
            -row["balance_cents"],
            str(row["display_name"]).lower(),
        )
    )
    return player_rows


def build_admin_session_rows(current_user_id):
    session_rows = []
    session_summary = {
        "coinflip": {
            "countdown": 0,
            "open": 0,
            "resolved": 0,
        },
        "dice": {
            "countdown": 0,
            "open": 0,
            "resolved": 0,
        },
    }
    status_priority = {
        "countdown": 0,
        "open": 1,
        "resolved": 2,
    }

    for coinflip_session in COINFLIP_SESSIONS.values():
        session_state = build_coinflip_session_state(coinflip_session, current_user_id)
        session_summary["coinflip"][session_state["status"]] += 1
        session_rows.append(
            {
                "bet_display": session_state["bet_display"],
                "can_cancel": session_state["status"] != "resolved",
                "cancel_url": url_for("admin_cancel_game_session", game="coinflip", session_id=session_state["id"]),
                "countdown_remaining": session_state["countdown_remaining"],
                "created_at": coinflip_session["created_at"],
                "creator_choice": session_state["creator_choice"],
                "creator_name": session_state["creator"]["display_name"],
                "creator_user_id": session_state["creator"]["id"],
                "game": "coinflip",
                "game_label": "Coinflip",
                "id": session_state["id"],
                "mode_label": "Heads / Tails",
                "opponent_choice": session_state["opponent_choice"],
                "opponent_name": session_state["opponent"]["display_name"] if session_state["opponent"] else None,
                "opponent_user_id": session_state["opponent"]["id"] if session_state["opponent"] else None,
                "participants_display": (
                    f"{session_state['creator']['display_name']} vs "
                    f"{session_state['opponent']['display_name'] if session_state['opponent'] else 'Waiting'}"
                ),
                "pot_display": session_state["pot_display"],
                "result_side": session_state["result_side"],
                "reveal_pending": session_state["reveal_pending"],
                "status": session_state["status"],
                "status_text": session_state["status_text"],
                "view_url": url_for("coinflip_session", session_id=session_state["id"]),
                "viewer_count": session_state["viewer_count"],
                "winner_name": session_state["winner_name"],
            }
        )

    for dice_session in DICE_SESSIONS.values():
        session_state = build_dice_session_state(dice_session, current_user_id)
        session_summary["dice"][session_state["status"]] += 1
        session_rows.append(
            {
                "bet_display": session_state["bet_display"],
                "can_cancel": session_state["status"] != "resolved",
                "cancel_url": url_for("admin_cancel_game_session", game="dice", session_id=session_state["id"]),
                "countdown_remaining": session_state["countdown_remaining"],
                "created_at": dice_session["created_at"],
                "creator_label": session_state["creator_label"],
                "creator_name": session_state["creator"]["display_name"],
                "creator_score": session_state["creator_score"],
                "creator_user_id": session_state["creator"]["id"],
                "game": "dice",
                "game_label": "Dice",
                "id": session_state["id"],
                "mode_label": get_dice_mode_label(dice_session),
                "opponent_label": session_state["opponent_label"],
                "opponent_name": session_state["opponent"]["display_name"] if session_state["opponent"] else None,
                "opponent_score": session_state["opponent_score"],
                "opponent_user_id": session_state["opponent"]["id"] if session_state["opponent"] else None,
                "participants_display": (
                    f"{session_state['creator']['display_name']} vs "
                    f"{session_state['opponent']['display_name'] if session_state['opponent'] else 'Waiting'}"
                ),
                "pot_display": session_state["pot_display"],
                "result_face": session_state["result_face"],
                "reveal_pending": session_state["reveal_pending"],
                "status": session_state["status"],
                "status_text": session_state["status_text"],
                "target_wins": session_state["target_wins"],
                "view_url": url_for("dice_session", session_id=session_state["id"]),
                "viewer_count": session_state["viewer_count"],
                "winner_name": session_state["winner_name"],
            }
        )

    session_rows.sort(
        key=lambda row: (
            status_priority.get(row["status"], 9),
            row["game"] != "coinflip",
            -row["created_at"],
        )
    )
    return session_rows, session_summary


def build_admin_panel_payload(current_user_id):
    player_rows = build_admin_player_rows(current_user_id)
    session_rows, session_summary = build_admin_session_rows(current_user_id)
    current_balance_cents = get_user_balance(current_user_id) if current_user_id else None
    summary = {
        "coinflip_live": session_summary["coinflip"]["countdown"],
        "coinflip_open": session_summary["coinflip"]["open"],
        "coinflip_resolved": session_summary["coinflip"]["resolved"],
        "dice_live": session_summary["dice"]["countdown"],
        "dice_open": session_summary["dice"]["open"],
        "dice_resolved": session_summary["dice"]["resolved"],
        "players_online": sum(1 for row in player_rows if row["is_online"]),
        "players_total": len(player_rows),
        "sessions_live": sum(1 for row in session_rows if row["status"] == "countdown"),
        "sessions_total": len(session_rows),
    }
    version_payload = {
        "players": [
            {
                "balance_cents": row["balance_cents"],
                "current_path": row["current_path"],
                "id": row["id"],
                "is_online": row["is_online"],
                "reward_level": row["reward_level"],
                "total_wagered_cents": row["total_wagered_cents"],
                "win_rate": row["win_rate"],
            }
            for row in player_rows
        ],
        "sessions": [dict(row) for row in session_rows],
        "summary": summary,
    }

    return {
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents) if current_balance_cents is not None else None,
        "players": player_rows,
        "poll_interval_ms": 2400,
        "sessions": session_rows,
        "summary": summary,
        "version": build_state_version(version_payload),
    }


def admin_adjust_balance(actor_user, target_user_id, raw_amount):
    target_profile = USER_PROFILES.get(target_user_id)

    if not target_profile or target_user_id == BOT_PROFILE["id"]:
        raise ValueError("That player could not be found.")

    adjustment_cents = parse_balance_adjustment_to_cents(raw_amount)
    current_balance_cents = get_user_balance(target_user_id)
    next_balance_cents = current_balance_cents + adjustment_cents

    if next_balance_cents < 0:
        raise ValueError("Adjustment would make the balance negative.")

    set_user_balance(target_user_id, next_balance_cents)

    if adjustment_cents > 0:
        get_user_stats(target_user_id)["total_deposited_cents"] += adjustment_cents

    actor_snapshot = make_user_snapshot(actor_user)
    add_app_notification(
        actor_user=actor_snapshot,
        event_type="admin_balance_adjusted",
        message=(
            f"{actor_snapshot['display_name']} adjusted your balance by "
            f"{format_signed_money(adjustment_cents)}."
        ),
        recipient_user_id=target_user_id,
        title="Balance updated",
        tone="success" if adjustment_cents > 0 else "info",
    )

    return {
        "adjustment_cents": adjustment_cents,
        "adjustment_display": format_signed_money(adjustment_cents),
        "balance_cents": next_balance_cents,
        "balance_display": format_money(next_balance_cents),
        "user_id": target_user_id,
    }


def admin_force_logout(actor_user, target_user_id):
    actor_snapshot = make_user_snapshot(actor_user)

    if target_user_id == actor_snapshot["id"]:
        raise ValueError("Use the normal logout action for your own account.")

    target_profile = USER_PROFILES.get(target_user_id)

    if not target_profile or target_user_id == BOT_PROFILE["id"]:
        raise ValueError("That player could not be found.")

    revoke_user_auth_sessions(target_user_id)
    mark_user_presence_offline(target_user_id)
    add_app_notification(
        actor_user=actor_snapshot,
        event_type="admin_forced_logout",
        message=f"{actor_snapshot['display_name']} signed you out.",
        recipient_user_id=target_user_id,
        title="Signed out",
    )

    return {
        "signed_out": True,
        "user_id": target_user_id,
    }


def admin_cancel_session(actor_user, game, session_id):
    actor_snapshot = make_user_snapshot(actor_user)
    session_store = get_game_session_store(game)
    session_record = session_store.get(session_id)

    if not session_record:
        raise ValueError("That session could not be found.")

    sync_game_session_state(game, session_record)

    if game_session_is_resolved(game, session_record):
        raise ValueError("Resolved sessions can no longer be canceled.")

    refund_cents = session_record["bet_cents"]
    refund_display = format_money(refund_cents)
    refunded_user_ids = []

    for participant in build_session_refund_participants(session_record):
        participant_user_id = participant["id"]
        set_user_balance(participant_user_id, get_user_balance(participant_user_id) + refund_cents)
        refunded_user_ids.append(participant_user_id)
        add_app_notification(
            actor_user=actor_snapshot,
            event_type="admin_session_canceled",
            message=f"Session has been canceled by an admin. You've been refunded {refund_display}.",
            recipient_user_id=participant_user_id,
            title="Session canceled",
            tone="info",
        )

    rematch_source_session_id = session_record.get("rematch_source_session_id")

    if rematch_source_session_id:
        source_session = session_store.get(rematch_source_session_id)

        if source_session and source_session.get("redo_session_id") == session_record["id"]:
            source_session["redo_session_id"] = None

    session_store.pop(session_record["id"], None)
    register_canceled_session_marker(game, session_record, refunded_user_ids)

    return {
        "canceled": True,
        "game": game,
        "game_label": get_game_label(game),
        "redirect_url": get_game_lobby_url(game),
        "refund_display": refund_display,
        "refunded_count": len(refunded_user_ids),
        "session_id": session_record["id"],
    }


def admin_reset_runtime_state(actor_user):
    global NEXT_CHAT_MESSAGE_ID
    global NEXT_NOTIFICATION_ID
    global LAST_PERSISTED_STATE_DIGEST

    actor_snapshot = make_user_snapshot(actor_user)
    actor_auth_version = max(safe_int(session.get("auth_version"), 1), 1)
    current_time = time.time()

    USER_BALANCES.clear()
    USER_PROFILES.clear()
    USER_PROFILES[BOT_PROFILE["id"]] = BOT_PROFILE.copy()
    COINFLIP_SESSIONS.clear()
    DICE_SESSIONS.clear()
    BLACKJACK_SESSIONS.clear()
    CANCELED_COINFLIP_SESSIONS.clear()
    CANCELED_DICE_SESSIONS.clear()
    CANCELED_BLACKJACK_SESSIONS.clear()
    USER_STATS.clear()
    USER_BET_HISTORY.clear()
    APP_NOTIFICATIONS.clear()
    CHAT_MESSAGES.clear()
    CHAT_MENTION_NOTIFICATION_HISTORY.clear()
    USER_PRESENCE.clear()
    USER_REWARDS.clear()
    USER_AUTH_VERSIONS.clear()
    NEXT_NOTIFICATION_ID = 1
    NEXT_CHAT_MESSAGE_ID = 1
    LAST_PERSISTED_STATE_DIGEST = None

    ensure_user_balance(actor_snapshot)
    USER_AUTH_VERSIONS[actor_snapshot["id"]] = actor_auth_version
    assign_session_auth_version(actor_snapshot)
    USER_PRESENCE[actor_snapshot["id"]] = {
        "connected_at": current_time,
        "current_path": url_for("admin_panel") if has_request_context() else "/panel",
        "is_online": True,
        "last_seen": current_time,
        "typing_until": 0,
    }
    persist_app_state_if_changed()

    return {
        "reset_at": current_time,
        "reset_by_user_id": actor_snapshot["id"],
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


def get_blackjack_session_or_404(session_id):
    blackjack_session = BLACKJACK_SESSIONS.get(session_id)

    if not blackjack_session:
        abort(404)

    return blackjack_session


@app.before_request
def load_current_user():
    g.discord_user = get_current_user()
    g.is_admin_user = is_admin_user(g.discord_user)
    g.current_balance_cents = None

    if g.discord_user:
        ensure_user_balance(g.discord_user)
        g.current_balance_cents = get_user_balance(g.discord_user["id"])
        if request_should_touch_presence():
            with STATE_LOCK:
                touch_user_presence(g.discord_user, request.path)


@app.after_request
def persist_runtime_state(response):
    if request.endpoint == "static" or response.status_code >= 500:
        return response

    try:
        persist_app_state_if_changed()
    except OSError:
        app.logger.exception("Could not persist app state to %s", APP_STATE_PATH)

    return response


@app.context_processor
def inject_auth_state():
    discord_user = g.get("discord_user") or get_current_user()
    admin_user = is_admin_user(discord_user)
    notification_cursor = 0
    chat_user_profile_url = url_for("chat_user_state", user_id="__user_id__")

    if discord_user:
        with STATE_LOCK:
            notification_cursor = get_latest_notification_id()

    return {
        "asset_url": build_static_asset_url,
        "chat_current_user_id": discord_user["id"] if discord_user else None,
        "chat_send_url": url_for("chat_messages") if discord_user else None,
        "chat_state_url": url_for("chat_state") if discord_user else None,
        "chat_mention_query_url": url_for("chat_mention_suggestions") if discord_user else None,
        "chat_user_profile_url": chat_user_profile_url,
        "client_lockdown_enabled": bool(discord_user and not admin_user),
        "current_balance_cents": g.current_balance_cents,
        "current_balance_display": format_money(g.current_balance_cents) if g.current_balance_cents is not None else None,
        "discord_oauth_ready": is_discord_oauth_ready(),
        "discord_user": discord_user,
        "is_admin_user": admin_user,
        "is_authenticated": discord_user is not None,
        "notification_cursor": notification_cursor,
        "presence_heartbeat_url": url_for("presence_heartbeat") if discord_user else None,
        "presence_offline_url": url_for("presence_offline") if discord_user else None,
    }


@app.route("/")
def index():
    return render_template("Index.html", active_page="play")


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


@app.route("/notifications/state")
@login_required
def notification_state():
    since_raw = request.args.get("since")

    try:
        since_id = max(int(since_raw or 0), 0)
    except (TypeError, ValueError):
        since_id = 0

    with STATE_LOCK:
        payload = build_notification_payload(get_current_user_id(), since_id)

    return jsonify(payload)


@app.route("/chat/state")
@login_required
def chat_state():
    since_raw = request.args.get("since")

    try:
        since_id = max(int(since_raw or 0), 0)
    except (TypeError, ValueError):
        since_id = 0

    with STATE_LOCK:
        payload = build_chat_state_payload(get_current_user_id(), since_id)

    return jsonify(payload)


@app.route("/chat/mentions")
@login_required
def chat_mention_suggestions():
    query = request.args.get("q", "")

    with STATE_LOCK:
        suggestions = build_chat_mention_suggestions(query, get_current_user_id())

    return jsonify({
        "suggestions": suggestions,
    })


@app.route("/chat/messages", methods=["POST"])
@login_required
def chat_messages():
    payload = request.get_json(silent=True) or {}
    raw_body = payload.get("body", "") if isinstance(payload, dict) else ""
    raw_reply_to_message_id = payload.get("reply_to_message_id") if isinstance(payload, dict) else None
    session_share = payload.get("session_share") if isinstance(payload, dict) else None
    current_user = make_user_snapshot(get_current_user())

    try:
        reply_to_message_id = int(raw_reply_to_message_id) if raw_reply_to_message_id is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "That message can no longer be replied to."}), 400

    try:
        with STATE_LOCK:
            message = add_chat_message(
                current_user,
                raw_body,
                reply_to_message_id=reply_to_message_id,
                shared_game=session_share.get("game") if isinstance(session_share, dict) else None,
                shared_session_id=session_share.get("session_id") if isinstance(session_share, dict) else None,
            )
            current_presence_path = (USER_PRESENCE.get(current_user["id"]) or {}).get("current_path")
            touch_user_presence(current_user, current_path=current_presence_path, is_typing=False)
            response_payload = {
                "latest_message_id": get_latest_chat_message_id(),
                "message": serialize_chat_message(message, current_user["id"]),
                "online_count": get_online_player_count(),
            }
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(response_payload), 201


@app.route("/chat/users/<user_id>")
def chat_user_state(user_id):
    with STATE_LOCK:
        payload = build_chat_user_profile_payload(user_id, get_current_user_id())

    if not payload:
        abort(404)

    return jsonify(payload)


@app.route("/chat/users/<user_id>/tip", methods=["POST"])
@login_required
def tip_chat_user(user_id):
    payload = request.get_json(silent=True) or {}
    raw_amount = payload.get("amount") if isinstance(payload, dict) else None
    current_user = make_user_snapshot(get_current_user())

    try:
        with STATE_LOCK:
            tip_payload = send_user_tip(current_user, user_id, raw_amount)
    except ValueError as exc:
        with STATE_LOCK:
            current_balance_cents = get_user_balance(current_user["id"])
        return jsonify({
            "current_balance_cents": current_balance_cents,
            "current_balance_display": format_money(current_balance_cents),
            "error": str(exc),
        }), 400

    return jsonify(tip_payload)


@app.route("/presence/heartbeat", methods=["POST"])
@login_required
def presence_heartbeat():
    payload = request.get_json(silent=True) or {}
    current_path = payload.get("path") if isinstance(payload, dict) else None
    is_typing = payload.get("typing") if isinstance(payload, dict) else None

    if not isinstance(current_path, str) or not current_path.startswith("/"):
        current_path = request.path

    if not isinstance(is_typing, bool):
        is_typing = None

    with STATE_LOCK:
        touch_user_presence(get_current_user(), current_path, is_typing=is_typing)
        online_count = get_online_player_count()

    return jsonify({"online_count": online_count})


@app.route("/presence/offline", methods=["POST"])
@login_required
def presence_offline():
    with STATE_LOCK:
        mark_user_presence_offline(get_current_user_id())
        online_count = get_online_player_count()

    return jsonify({"online_count": online_count})


@app.route("/profile")
@login_required
def profile():
    current_user_id = get_current_user_id()
    stats = get_user_stats(current_user_id)
    bets = get_user_bet_history(current_user_id)
    reward_state = build_reward_state(current_user_id)

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
        reward_state=reward_state,
        user_stats=stats,
        user_stats_formatted=stats_formatted,
        profile_state={
            "bet_history": bets,
            "claim_level_reward_url": url_for("claim_level_reward"),
            "claim_rakeback_url": url_for("claim_rakeback"),
            "current_balance_display": format_money(get_user_balance(current_user_id)),
            "rewards": reward_state,
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


@app.route("/profile/rakeback/claim", methods=["POST"])
@login_required
def claim_rakeback():
    current_user_id = get_current_user_id()

    with STATE_LOCK:
        reward_state, error_message, status_code = claim_user_rakeback(current_user_id)

        if not reward_state:
            return jsonify({
                "error": error_message or "No rakeback available to claim.",
                "rewards": build_reward_state(current_user_id),
            }), status_code

        current_balance_cents = get_user_balance(current_user_id)

    return jsonify({
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents),
        "rewards": reward_state,
    })


@app.route("/profile/rewards/claim", methods=["POST"])
@login_required
def claim_level_reward():
    current_user_id = get_current_user_id()

    with STATE_LOCK:
        reward_state, error_message, status_code = claim_user_level_reward(current_user_id)

        if not reward_state:
            return jsonify({
                "error": error_message or "No level reward available to claim.",
                "rewards": build_reward_state(current_user_id),
            }), status_code

        current_balance_cents = get_user_balance(current_user_id)

    return jsonify({
        "current_balance_cents": current_balance_cents,
        "current_balance_display": format_money(current_balance_cents),
        "rewards": reward_state,
    })


@app.route("/panel")
@admin_panel_required
def admin_panel():
    with STATE_LOCK:
        cleanup_canceled_session_markers()
        sync_all_game_sessions()
        admin_panel_state = build_admin_panel_payload(get_current_user_id())

    return render_template(
        "AdminPanel.html",
        active_page="panel",
        admin_panel_state=admin_panel_state,
    )


@app.route("/panel/state")
@admin_panel_required
def admin_panel_state():
    requested_version = request.args.get("version")

    with STATE_LOCK:
        cleanup_canceled_session_markers()
        sync_all_game_sessions()
        payload = build_admin_panel_payload(get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/panel/reset-state", methods=["POST"])
@admin_panel_required
def admin_reset_state():
    try:
        with STATE_LOCK:
            result = admin_reset_runtime_state(get_current_user())
            panel_payload = build_admin_panel_payload(get_current_user_id())
    except OSError:
        return jsonify({"error": "Could not reset the persisted state."}), 500

    return jsonify({
        **result,
        "panel": panel_payload,
    })


@app.route("/panel/users/<user_id>/balance", methods=["POST"])
@admin_panel_required
def admin_adjust_user_balance(user_id):
    payload = request.get_json(silent=True)
    raw_amount = (
        payload.get("amount")
        if isinstance(payload, dict)
        else request.form.get("amount")
    )

    try:
        with STATE_LOCK:
            result = admin_adjust_balance(get_current_user(), user_id, raw_amount)
            panel_payload = build_admin_panel_payload(get_current_user_id())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        **result,
        "panel": panel_payload,
    })


@app.route("/panel/users/<user_id>/logout", methods=["POST"])
@admin_panel_required
def admin_force_logout_user(user_id):
    try:
        with STATE_LOCK:
            result = admin_force_logout(get_current_user(), user_id)
            panel_payload = build_admin_panel_payload(get_current_user_id())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        **result,
        "panel": panel_payload,
    })


@app.route("/panel/sessions/<game>/<session_id>/cancel", methods=["POST"])
@admin_panel_required
def admin_cancel_game_session(game, session_id):
    try:
        with STATE_LOCK:
            result = admin_cancel_session(get_current_user(), game, session_id)
            panel_payload = build_admin_panel_payload(get_current_user_id())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        **result,
        "panel": panel_payload,
    })


@app.get("/api/hand-slot-layout")
def hand_slot_layout_state():
    return jsonify({"slots": read_hand_slot_layout()})


@app.post("/api/hand-slot-layout")
@admin_panel_required
def save_hand_slot_layout_state():
    payload = request.get_json(silent=True) or {}

    try:
        slots = validate_hand_slot_layout(payload.get("slots"))
        write_hand_slot_layout(slots)
    except (TypeError, ValueError) as error:
        return jsonify({"ok": False, "error": str(error)}), 400
    except OSError:
        return jsonify({"ok": False, "error": "Could not write hand-slot layout."}), 500

    return jsonify({"ok": True, "slots": slots})


@app.get("/api/blackjack-side-bet-layout")
def blackjack_side_bet_layout_state():
    return jsonify({"spots": read_blackjack_side_bet_layout()})


@app.post("/api/blackjack-side-bet-layout")
@admin_panel_required
def save_blackjack_side_bet_layout_state():
    payload = request.get_json(silent=True) or {}

    try:
        spots = validate_blackjack_side_bet_layout(payload.get("spots"))
        write_blackjack_side_bet_layout(spots)
    except (TypeError, ValueError) as error:
        return jsonify({"ok": False, "error": str(error)}), 400
    except OSError:
        return jsonify({"ok": False, "error": "Could not write side-bet layout."}), 500

    return jsonify({"ok": True, "spots": spots})


@app.route("/games/blackjack")
@login_required
def blackjack_game():
    with STATE_LOCK:
        blackjack_lobby_state = build_blackjack_lobby_payload(get_current_user_id())

    return render_template(
        "Games/Blackjack.html",
        active_page="play",
        blackjack_lobby_state=blackjack_lobby_state,
        blackjack_sessions=blackjack_lobby_state["sessions"],
        session_summary=blackjack_lobby_state["session_summary"],
    )


@app.route("/games/blackjack/state")
@login_required
def blackjack_lobby_state():
    requested_version = request.args.get("version")

    with STATE_LOCK:
        payload = build_blackjack_lobby_payload(get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/games/blackjack/sessions", methods=["POST"])
@login_required
def create_blackjack_session():
    current_user = make_user_snapshot(get_current_user())
    table_name = request.form.get("table_name")

    with STATE_LOCK:
        blackjack_session = create_blackjack_session_record(current_user, table_name)
        BLACKJACK_SESSIONS[blackjack_session["id"]] = blackjack_session

    return redirect(url_for("blackjack_session", session_id=blackjack_session["id"]))


@app.route("/games/blackjack/sessions/<session_id>")
@login_required
def blackjack_session(session_id):
    with STATE_LOCK:
        blackjack_session_data = get_blackjack_session_or_404(session_id)
        current_user = get_current_user()
        current_user_id = get_current_user_id()
        touch_blackjack_session_presence(session_id, current_user)
        session_state = build_blackjack_session_state(blackjack_session_data, current_user_id)
        blackjack_table_config = {
            "action_url": url_for("blackjack_table_actions", session_id=blackjack_session_data["id"]),
            "balance_sync_url": url_for("blackjack_table_balance", session_id=blackjack_session_data["id"]),
            "can_edit_side_bet_layout": bool(is_admin_user(current_user)),
            "initial_state": build_blackjack_table_payload(blackjack_session_data, current_user_id),
            "seat_action_url": url_for("blackjack_table_seats", session_id=blackjack_session_data["id"]),
            "state_url": url_for("blackjack_table_state", session_id=blackjack_session_data["id"]),
        }

    return render_template(
        "Games/BlackjackSession.html",
        active_page="play",
        blackjack_table_config=blackjack_table_config,
        session_state=session_state,
    )


@app.route("/games/blackjack/sessions/<session_id>/state")
@login_required
def blackjack_session_state(session_id):
    requested_version = request.args.get("version")

    with STATE_LOCK:
        blackjack_session_data = get_blackjack_session_or_404(session_id)
        touch_blackjack_session_presence(session_id)
        payload = build_blackjack_session_state(blackjack_session_data, get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/games/blackjack/sessions/<session_id>/table/state")
@login_required
def blackjack_table_state(session_id):
    requested_version = request.args.get("version")

    with STATE_LOCK:
        blackjack_session_data = get_blackjack_session_or_404(session_id)
        touch_blackjack_session_presence(session_id)
        payload = build_blackjack_table_payload(blackjack_session_data, get_current_user_id())

    if requested_version and requested_version == payload["version"]:
        return ("", 204)

    return jsonify(payload)


@app.route("/games/blackjack/sessions/<session_id>/table/seats", methods=["POST"])
@login_required
def blackjack_table_seats(session_id):
    payload = request.get_json(silent=True) or {}
    seat_action = str(payload.get("action") or "").strip().lower()
    seat_id = str(payload.get("seat_id") or "").strip()
    current_user_id = get_current_user_id()

    if seat_action not in {"claim", "release"}:
        return jsonify({"error": "Choose a valid seat action."}), 400

    if seat_id not in HAND_SLOT_SEAT_IDS:
        return jsonify({"error": "Choose a valid seat."}), 400

    with STATE_LOCK:
        blackjack_session_data = get_blackjack_session_or_404(session_id)
        touch_blackjack_session_presence(session_id)
        seat_claims = sync_blackjack_session_seat_claims(blackjack_session_data)
        table_state = ensure_blackjack_table_state(blackjack_session_data)
        current_owner_id = seat_claims.get(seat_id)

        if seat_action == "claim":
            if current_owner_id and current_owner_id != current_user_id:
                owner_profile = USER_PROFILES.get(current_owner_id) or {}
                owner_name = owner_profile.get("display_name") or owner_profile.get("username") or "Another player"
                return jsonify({"error": f"{owner_name} already took that seat."}), 409

            seat_claims[seat_id] = current_user_id
            remove_blackjack_ready_user(table_state, current_user_id)
            if table_state.get("round_state") == BLACKJACK_ROUND_WAITING:
                table_state["round_state"] = BLACKJACK_ROUND_BETTING
                table_state["updated_at"] = time.time()
        elif current_owner_id == current_user_id:
            if blackjack_table_has_active_hand_for_seat(table_state, seat_id):
                return jsonify({"error": "Finish the current hand before leaving that seat."}), 409

            remove_blackjack_pending_bets_for_seat(table_state, seat_id)
            remove_blackjack_ready_user(table_state, current_user_id)
            seat_claims.pop(seat_id, None)
            if table_state.get("round_state") == BLACKJACK_ROUND_BETTING and not seat_claims:
                table_state["round_state"] = BLACKJACK_ROUND_WAITING
                table_state["message"] = ""
                table_state["updated_at"] = time.time()

        table_payload = build_blackjack_table_payload(blackjack_session_data, current_user_id)

    return jsonify(table_payload)


@app.route("/games/blackjack/sessions/<session_id>/table/actions", methods=["POST"])
@login_required
def blackjack_table_actions(session_id):
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action") or "").strip().lower()
    current_user_id = get_current_user_id()

    try:
        with STATE_LOCK:
            blackjack_session_data = get_blackjack_session_or_404(session_id)
            touch_blackjack_session_presence(session_id)
            seat_claims = sync_blackjack_session_seat_claims(blackjack_session_data)
            table_state = sync_blackjack_table_lifecycle(blackjack_session_data)

            if action == "add_chip":
                seat_id = str(payload.get("seat_id") or "").strip()
                bet_type = normalize_blackjack_bet_type(payload.get("bet_type"))

                try:
                    chip_value_cents = int(payload.get("chip_value_cents") or payload.get("value_cents") or 0)
                except (TypeError, ValueError):
                    chip_value_cents = 0

                if seat_id not in HAND_SLOT_SEAT_IDS:
                    raise ValueError("Choose a valid seat.")

                if seat_claims.get(seat_id) != current_user_id:
                    raise ValueError("Take that seat before placing chips.")

                if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
                    raise ValueError("Wait for the next betting round.")

                if chip_value_cents not in BLACKJACK_CHIP_VALUES_CENTS:
                    raise ValueError("Choose a valid chip.")

                if not bet_type:
                    raise ValueError("Choose a valid bet type.")

                next_pending_total = get_blackjack_pending_total_for_user(table_state, current_user_id) + chip_value_cents

                if next_pending_total > get_user_balance(current_user_id):
                    raise ValueError("You do not have enough balance for that chip.")

                table_state.setdefault("pending_bet_chips", []).append({
                    "bet_type": bet_type,
                    "seat_id": seat_id,
                    "user_id": current_user_id,
                    "value_cents": chip_value_cents,
                })
                record_blackjack_pending_bet_action(table_state, current_user_id, "add_chip", 1)
                remove_blackjack_ready_user(table_state, current_user_id)
                table_state["round_state"] = BLACKJACK_ROUND_BETTING
                table_state["message"] = ""
                table_state["updated_at"] = time.time()
            elif action == "undo_chip":
                if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
                    raise ValueError("Wait for the next betting round.")

                pending_chips = table_state.get("pending_bet_chips") or []
                pending_bet_action_history = ensure_blackjack_pending_bet_action_history(table_state)
                removed_chip_count = 0
                action_record_index = -1

                for history_index in range(len(pending_bet_action_history) - 1, -1, -1):
                    action_record = pending_bet_action_history[history_index]
                    if action_record.get("user_id") != current_user_id:
                        continue

                    chip_count = int(action_record.get("chip_count") or 0)
                    if chip_count <= 0:
                        continue

                    action_record_index = history_index
                    break

                if action_record_index >= 0:
                    chip_count = int(pending_bet_action_history[action_record_index].get("chip_count") or 0)
                    del pending_bet_action_history[action_record_index]

                    for chip_index in range(len(pending_chips) - 1, -1, -1):
                        if pending_chips[chip_index].get("user_id") != current_user_id:
                            continue

                        pending_chips.pop(chip_index)
                        removed_chip_count += 1

                        if removed_chip_count >= chip_count:
                            break

                if not removed_chip_count:
                    for chip_index in range(len(pending_chips) - 1, -1, -1):
                        if pending_chips[chip_index].get("user_id") == current_user_id:
                            pending_chips.pop(chip_index)
                            removed_chip_count = 1
                            break

                table_state["pending_bet_chips"] = pending_chips
                table_state["pending_bet_action_history"] = pending_bet_action_history
                remove_blackjack_ready_user(table_state, current_user_id)
                table_state["updated_at"] = time.time()
            elif action == "double_pending":
                if table_state.get("round_state") not in {BLACKJACK_ROUND_WAITING, BLACKJACK_ROUND_BETTING}:
                    raise ValueError("Wait for the next betting round.")

                own_chips = [
                    dict(chip)
                    for chip in table_state.get("pending_bet_chips") or []
                    if chip.get("user_id") == current_user_id
                ]

                if not own_chips:
                    raise ValueError("Place chips before doubling your bet.")

                current_pending_total = sum(int(chip.get("value_cents") or 0) for chip in own_chips)

                if current_pending_total * 2 > get_user_balance(current_user_id):
                    raise ValueError("You do not have enough balance to double that bet.")

                table_state.setdefault("pending_bet_chips", []).extend(own_chips)
                record_blackjack_pending_bet_action(table_state, current_user_id, "double_pending", len(own_chips))
                remove_blackjack_ready_user(table_state, current_user_id)
                table_state["updated_at"] = time.time()
            elif action == "rebet":
                rebet_blackjack_user(blackjack_session_data, current_user_id)
            elif action == "insurance_accept":
                seat_id = str(payload.get("seat_id") or "").strip()
                handle_blackjack_insurance_decision(blackjack_session_data, current_user_id, seat_id, True)
            elif action == "insurance_decline":
                seat_id = str(payload.get("seat_id") or "").strip()
                handle_blackjack_insurance_decision(blackjack_session_data, current_user_id, seat_id, False)
            elif action in {"ready", "deal"}:
                ready_blackjack_user(blackjack_session_data, current_user_id)
            elif action in {"hit", "stand", "double", "split"}:
                perform_blackjack_player_action(blackjack_session_data, current_user_id, action)
            else:
                raise ValueError("Choose a valid blackjack action.")

            table_payload = build_blackjack_table_payload(blackjack_session_data, current_user_id)
    except ValueError as exc:
        with STATE_LOCK:
            blackjack_session_data = get_blackjack_session_or_404(session_id)
            touch_blackjack_session_presence(session_id)
            table_payload = build_blackjack_table_payload(blackjack_session_data, current_user_id)

        return jsonify({
            **table_payload,
            "error": str(exc),
        }), 400

    return jsonify(table_payload)


@app.route("/games/blackjack/sessions/<session_id>/table/balance", methods=["POST"])
@login_required
def blackjack_table_balance(session_id):
    current_user_id = get_current_user_id()

    with STATE_LOCK:
        get_blackjack_session_or_404(session_id)
        current_balance_cents = get_user_balance(current_user_id)

    return jsonify(
        {
            "current_balance_amount": current_balance_cents / 100,
            "current_balance_cents": current_balance_cents,
            "current_balance_display": format_money(current_balance_cents),
        }
    )


@app.route("/games/blackjack/sessions/<session_id>/table")
@login_required
def blackjack_frame(session_id):
    with STATE_LOCK:
        blackjack_session_data = get_blackjack_session_or_404(session_id)
        touch_blackjack_session_presence(session_id)
        current_user_id = get_current_user_id()
        blackjack_table_state = build_blackjack_table_payload(
            blackjack_session_data,
            current_user_id,
        )

    return render_template(
        "Games/BlackjackFrame.html",
        blackjack_table_config={
            "action_url": url_for("blackjack_table_actions", session_id=blackjack_session_data["id"]),
            "balance_sync_url": url_for("blackjack_table_balance", session_id=blackjack_session_data["id"]),
            "initial_state": blackjack_table_state,
            "seat_action_url": url_for("blackjack_table_seats", session_id=blackjack_session_data["id"]),
            "state_url": url_for("blackjack_table_state", session_id=blackjack_session_data["id"]),
        },
        session_id=blackjack_session_data["id"],
        table_name=blackjack_session_data["table_name"],
    )


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
        coinflip_session = create_coinflip_session_record(current_user, choice, bet_cents)
        session_id = coinflip_session["id"]
        COINFLIP_SESSIONS[session_id] = coinflip_session
        add_app_notification(
            action=build_session_notification_action(
                "coinflip",
                session_id,
                build_coinflip_session_join_copy(current_user["display_name"], choice, bet_cents),
            ),
            actor_user=current_user,
            event_type="coinflip_session_created",
            message=build_coinflip_session_notification_message(
                current_user["display_name"],
                choice,
                bet_cents,
            ),
            title="New coinflip session",
        )

    return redirect(url_for("coinflip_session", session_id=session_id))


@app.route("/games/coinflip/sessions/<session_id>")
@login_required
def coinflip_session(session_id):
    with STATE_LOCK:
        cleanup_canceled_session_markers()
        coinflip_session_data = COINFLIP_SESSIONS.get(session_id)

        if not coinflip_session_data:
            canceled_payload = build_canceled_session_payload("coinflip", session_id, get_current_user_id())

            if canceled_payload:
                return redirect(canceled_payload["redirect_url"])

            abort(404)

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
        if coinflip_session_data["creator"]["id"] == current_user_id:
            return redirect(url_for("coinflip_session", session_id=session_id))

        try:
            join_coinflip_session_record(coinflip_session_data, current_user)
        except ValueError as exc:
            flash(str(exc), "error")
            return redirect(url_for("coinflip_game"))

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
        cleanup_canceled_session_markers()
        coinflip_session_data = COINFLIP_SESSIONS.get(session_id)

        if not coinflip_session_data:
            canceled_payload = build_canceled_session_payload("coinflip", session_id, get_current_user_id())

            if canceled_payload:
                return jsonify(canceled_payload)

            abort(404)

        session_state = build_coinflip_session_state(coinflip_session_data, get_current_user_id())

    return jsonify(session_state)


@app.route("/games/coinflip/sessions/<session_id>/redo", methods=["POST"])
@login_required
def redo_coinflip_session(session_id):
    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        coinflip_session_data = get_coinflip_session_or_404(session_id)
        sync_coinflip_session_state(coinflip_session_data)

        if not coinflip_session_data["winner_id"]:
            flash("That match is not finished yet.", "error")
            return redirect(url_for("coinflip_session", session_id=session_id))

        current_user_choice = get_coinflip_choice_for_user(coinflip_session_data, current_user_id)
        opponent_user = get_coinflip_rematch_opponent(coinflip_session_data, current_user_id)

        if current_user_choice not in {"Heads", "Tails"} or not opponent_user:
            flash("Only players from that match can create a redo.", "error")
            return redirect(url_for("coinflip_session", session_id=session_id))

        bet_cents = coinflip_session_data["bet_cents"]
        existing_redo_session = get_active_coinflip_redo_session(coinflip_session_data)

        if existing_redo_session:
            if current_user_id == existing_redo_session["creator"]["id"]:
                return redirect(url_for("coinflip_session", session_id=existing_redo_session["id"]))

            existing_opponent = existing_redo_session.get("opponent")

            if existing_opponent and existing_opponent["id"] == current_user_id:
                return redirect(url_for("coinflip_session", session_id=existing_redo_session["id"]))

            try:
                joined_existing_session = join_coinflip_session_record(existing_redo_session, current_user)
            except ValueError as exc:
                flash(str(exc), "error")
                return redirect(url_for("coinflip_session", session_id=session_id))

            if joined_existing_session:
                return redirect(url_for("coinflip_session", session_id=existing_redo_session["id"]))

        current_balance = get_user_balance(current_user_id)

        if bet_cents > current_balance:
            flash("You do not have enough balance for that rematch.", "error")
            return redirect(url_for("coinflip_session", session_id=session_id))

        set_user_balance(current_user_id, current_balance - bet_cents)

        if opponent_user["id"] == BOT_PROFILE["id"]:
            next_session = create_coinflip_session_record(
                current_user,
                current_user_choice,
                bet_cents,
                opponent=BOT_PROFILE.copy(),
                countdown_started_at=time.time(),
            )
        else:
            next_session = create_coinflip_session_record(current_user, current_user_choice, bet_cents)

        next_session["rematch_source_session_id"] = coinflip_session_data["id"]
        coinflip_session_data["redo_session_id"] = next_session["id"]
        COINFLIP_SESSIONS[next_session["id"]] = next_session

        if opponent_user["id"] != BOT_PROFILE["id"]:
            add_app_notification(
                action=build_session_notification_action(
                    "coinflip",
                    next_session["id"],
                    build_coinflip_session_join_copy(
                        current_user["display_name"],
                        current_user_choice,
                        bet_cents,
                    ),
                ),
                actor_user=current_user,
                event_type="coinflip_session_redo",
                message=f"{current_user['display_name']} wants a coinflip rematch for {format_money(bet_cents)}.",
                recipient_user_id=opponent_user["id"],
                title="Coinflip rematch ready",
            )

    return redirect(url_for("coinflip_session", session_id=next_session["id"]))


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
        dice_session = create_dice_session_record(
            current_user,
            bet_cents,
            mode,
            side=side,
            target_wins=target_wins,
            double_roll=double_roll,
        )
        session_id = dice_session["id"]
        DICE_SESSIONS[session_id] = dice_session
        add_app_notification(
            action=build_session_notification_action(
                "dice",
                session_id,
                build_dice_session_join_copy(
                    current_user["display_name"],
                    mode,
                    side,
                    bet_cents,
                    target_wins,
                    double_roll,
                ),
            ),
            actor_user=current_user,
            event_type="dice_session_created",
            message=build_dice_session_notification_message(
                current_user["display_name"],
                mode,
                side,
                bet_cents,
                target_wins,
                double_roll,
            ),
            title="New dice session",
        )

    return redirect(url_for("dice_session", session_id=session_id))


@app.route("/games/dice/sessions/<session_id>")
@login_required
def dice_session(session_id):
    with STATE_LOCK:
        cleanup_canceled_session_markers()
        dice_session_data = DICE_SESSIONS.get(session_id)

        if not dice_session_data:
            canceled_payload = build_canceled_session_payload("dice", session_id, get_current_user_id())

            if canceled_payload:
                return redirect(canceled_payload["redirect_url"])

            abort(404)

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
        if dice_session_data["creator"]["id"] == current_user_id:
            return redirect(url_for("dice_session", session_id=session_id))

        try:
            join_dice_session_record(dice_session_data, current_user)
        except ValueError as exc:
            flash(str(exc), "error")
            return redirect(url_for("dice_game"))

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
        cleanup_canceled_session_markers()
        dice_session_data = DICE_SESSIONS.get(session_id)

        if not dice_session_data:
            canceled_payload = build_canceled_session_payload("dice", session_id, get_current_user_id())

            if canceled_payload:
                return jsonify(canceled_payload)

            abort(404)

        session_state = build_dice_session_state(dice_session_data, get_current_user_id())

    return jsonify(session_state)


@app.route("/games/dice/sessions/<session_id>/redo", methods=["POST"])
@login_required
def redo_dice_session(session_id):
    current_user = make_user_snapshot(get_current_user())
    current_user_id = current_user["id"]

    with STATE_LOCK:
        dice_session_data = get_dice_session_or_404(session_id)
        sync_dice_session_state(dice_session_data)

        if not dice_session_data["winner_id"]:
            flash("That match is not finished yet.", "error")
            return redirect(url_for("dice_session", session_id=session_id))

        opponent_user = get_dice_rematch_opponent(dice_session_data, current_user_id)

        if not opponent_user:
            flash("Only players from that match can create a redo.", "error")
            return redirect(url_for("dice_session", session_id=session_id))

        mode = get_dice_session_mode(dice_session_data)
        side = get_dice_side_for_user(dice_session_data, current_user_id)
        target_wins = get_dice_target_wins(dice_session_data) if mode == "first_to" else None
        double_roll = is_double_dice_session(dice_session_data) if mode == "first_to" else False
        bet_cents = dice_session_data["bet_cents"]
        existing_redo_session = get_active_dice_redo_session(dice_session_data)

        if existing_redo_session:
            if current_user_id == existing_redo_session["creator"]["id"]:
                return redirect(url_for("dice_session", session_id=existing_redo_session["id"]))

            existing_opponent = existing_redo_session.get("opponent")

            if existing_opponent and existing_opponent["id"] == current_user_id:
                return redirect(url_for("dice_session", session_id=existing_redo_session["id"]))

            try:
                joined_existing_session = join_dice_session_record(existing_redo_session, current_user)
            except ValueError as exc:
                flash(str(exc), "error")
                return redirect(url_for("dice_session", session_id=session_id))

            if joined_existing_session:
                return redirect(url_for("dice_session", session_id=existing_redo_session["id"]))

        current_balance = get_user_balance(current_user_id)

        if bet_cents > current_balance:
            flash("You do not have enough balance for that rematch.", "error")
            return redirect(url_for("dice_session", session_id=session_id))

        set_user_balance(current_user_id, current_balance - bet_cents)

        if opponent_user["id"] == BOT_PROFILE["id"]:
            next_session = create_dice_session_record(
                current_user,
                bet_cents,
                mode,
                side=side,
                target_wins=target_wins,
                double_roll=double_roll,
                opponent=BOT_PROFILE.copy(),
                countdown_started_at=time.time(),
            )
        else:
            next_session = create_dice_session_record(
                current_user,
                bet_cents,
                mode,
                side=side,
                target_wins=target_wins,
                double_roll=double_roll,
            )

        next_session["rematch_source_session_id"] = dice_session_data["id"]
        dice_session_data["redo_session_id"] = next_session["id"]
        DICE_SESSIONS[next_session["id"]] = next_session

        if opponent_user["id"] != BOT_PROFILE["id"]:
            add_app_notification(
                action=build_session_notification_action(
                    "dice",
                    next_session["id"],
                    build_dice_session_join_copy(
                        current_user["display_name"],
                        mode,
                        side,
                        bet_cents,
                        target_wins,
                        double_roll,
                    ),
                ),
                actor_user=current_user,
                event_type="dice_session_redo",
                message=(
                    f"{current_user['display_name']} wants a {get_dice_mode_label(next_session)} dice rematch "
                    f"for {format_money(bet_cents)}."
                ),
                recipient_user_id=opponent_user["id"],
                title="Dice rematch ready",
            )

    return redirect(url_for("dice_session", session_id=next_session["id"]))


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
    session.permanent = True
    assign_session_auth_version(session["discord_user"])
    ensure_user_balance(session["discord_user"])

    redirect_target = session.pop("post_login_redirect", None)

    if not is_safe_redirect_target(redirect_target):
        redirect_target = url_for("play")

    return redirect(redirect_target)


@app.route("/logout")
def logout():
    current_user = get_current_user()

    if current_user:
        with STATE_LOCK:
            mark_user_presence_offline(current_user["id"])

    clear_login_session()
    flash("Signed out.", "success")
    return redirect(url_for("play"))


if __name__ == "__main__":
    app.run(debug=True)
