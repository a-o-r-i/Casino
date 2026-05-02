const BLACKJACK_SOUND_CONFIG = Object.freeze({
  bust: {
    datasetKey: "sfxBlackjackBustUrl",
    key: "blackjack-bust",
    options: {
      durationMs: 760,
      volume: 0.72
    }
  },
  dealCard: {
    datasetKey: "sfxBlackjackDealCardUrl",
    key: "blackjack-deal-card",
    options: {
      allowOverlap: true,
      durationMs: 360,
      minReplayGapMs: 30,
      volume: 0.58
    }
  },
  dealerRevealCard: {
    datasetKey: "sfxBlackjackDealerRevealCardUrl",
    key: "blackjack-dealer-reveal-card",
    options: {
      durationMs: 240,
      volume: 0.62
    }
  },
  double: {
    datasetKey: "sfxBlackjackDoubleUrl",
    key: "blackjack-double",
    options: {
      durationMs: 430,
      volume: 0.68
    }
  },
  hit: {
    datasetKey: "sfxBlackjackHitUrl",
    key: "blackjack-hit",
    options: {
      durationMs: 430,
      volume: 0.68
    }
  },
  placeChip: {
    datasetKey: "sfxBlackjackPlaceChipUrl",
    key: "blackjack-place-chip",
    options: {
      allowOverlap: true,
      durationMs: 260,
      minReplayGapMs: 45,
      volume: 0.62
    }
  },
  rebet: {
    datasetKey: "sfxBlackjackRebetUrl",
    key: "blackjack-rebet",
    options: {
      durationMs: 520,
      volume: 0.66
    }
  },
  selectChip: {
    datasetKey: "sfxBlackjackSelectChipUrl",
    key: "blackjack-select-chip",
    options: {
      allowOverlap: true,
      durationMs: 220,
      minReplayGapMs: 50,
      volume: 0.5
    }
  },
  stand: {
    datasetKey: "sfxBlackjackStandUrl",
    key: "blackjack-stand",
    options: {
      durationMs: 260,
      volume: 0.62
    }
  },
  undoChip: {
    datasetKey: "sfxBlackjackUndoChipUrl",
    key: "blackjack-undo-chip",
    options: {
      durationMs: 240,
      volume: 0.6
    }
  },
  win: {
    datasetKey: "sfxBlackjackWinUrl",
    key: "blackjack-win",
    options: {
      durationMs: 820,
      volume: 0.74
    }
  },
  x2Bet: {
    datasetKey: "sfxBlackjackX2BetUrl",
    key: "blackjack-x2-bet",
    options: {
      durationMs: 180,
      volume: 0.62
    }
  }
});

const LocalSoundEntries = new Map();
const LocalSoundPlayers = new Map();
const LocalSoundLastStartedAt = new Map();

function GetDocument(Root = document) {
  if (Root?.nodeType === 9) {
    return Root;
  }

  return Root?.ownerDocument || document;
}

function GetWindow(Root = document) {
  const ScopeDocument = GetDocument(Root);
  return ScopeDocument.defaultView || window;
}

function GetSoundHost(ScopeWindow = window) {
  try {
    if (ScopeWindow.GamblingApp?.playSound || ScopeWindow.GamblingApp?.registerSound) {
      return ScopeWindow.GamblingApp;
    }

    if (ScopeWindow.parent && ScopeWindow.parent !== ScopeWindow && (ScopeWindow.parent.GamblingApp?.playSound || ScopeWindow.parent.GamblingApp?.registerSound)) {
      return ScopeWindow.parent.GamblingApp;
    }
  } catch {
    return ScopeWindow.GamblingApp || null;
  }

  return null;
}

function ClampVolume(Value) {
  return Math.min(Math.max(Number(Value) || 0, 0), 1);
}

function RegisterLocalSound(ScopeWindow, Key, Url, Options) {
  LocalSoundEntries.set(Key, {
    options: {
      ...Options
    },
    scopeWindow: ScopeWindow,
    url: Url
  });
}

function PlayLocalSound(Key, Options = {}) {
  const Entry = LocalSoundEntries.get(Key);

  if (!Entry) {
    return false;
  }

  const ScopeWindow = Entry.scopeWindow || window;
  const AudioConstructor = ScopeWindow.Audio || window.Audio;

  if (typeof AudioConstructor !== "function") {
    return false;
  }

  const SoundOptions = {
    ...Entry.options,
    ...Options
  };
  const Clock = ScopeWindow.performance || performance;
  const Now = Clock.now();
  const MinReplayGapMs = Math.max(Number(SoundOptions.minReplayGapMs) || 0, 0);
  const LastStartedAt = LocalSoundLastStartedAt.get(Key) || 0;

  if (MinReplayGapMs > 0 && Now - LastStartedAt < MinReplayGapMs) {
    return false;
  }

  let Player = LocalSoundPlayers.get(Key);

  if (!Player || SoundOptions.allowOverlap === true) {
    Player = new AudioConstructor(Entry.url);

    if (SoundOptions.allowOverlap !== true) {
      LocalSoundPlayers.set(Key, Player);
    }
  }

  try {
    Player.pause();
    Player.currentTime = Math.max(Number(SoundOptions.startTime) || 0, 0);
  } catch {
    return false;
  }

  Player.loop = Boolean(SoundOptions.loop);
  Player.preload = SoundOptions.preload || "auto";
  Player.volume = ClampVolume(SoundOptions.volume ?? 1);
  Player.playbackRate = Number(SoundOptions.playbackRate) || 1;
  Player.defaultPlaybackRate = Player.playbackRate;

  const PlayPromise = Player.play();
  LocalSoundLastStartedAt.set(Key, Now);

  if (PlayPromise && typeof PlayPromise.catch === "function") {
    PlayPromise.catch(() => false);
  }

  return true;
}

export function RegisterBlackjackSounds({
  root: Root = document
} = {}) {
  const ScopeDocument = GetDocument(Root);
  const ScopeWindow = GetWindow(Root);
  const BodyDataset = ScopeDocument.body?.dataset || document.body?.dataset || {};
  const SoundHost = GetSoundHost(ScopeWindow);

  Object.values(BLACKJACK_SOUND_CONFIG).forEach(SoundConfig => {
    const Url = BodyDataset[SoundConfig.datasetKey];

    if (!Url) {
      return;
    }

    if (typeof SoundHost?.registerSound === "function") {
      SoundHost.registerSound(SoundConfig.key, Url, SoundConfig.options);
    }

    RegisterLocalSound(ScopeWindow, SoundConfig.key, Url, SoundConfig.options);
  });
}

export function PlayBlackjackSound(SoundName, Options = {}) {
  const SoundConfig = BLACKJACK_SOUND_CONFIG[SoundName];

  if (!SoundConfig) {
    return false;
  }

  const SoundHost = GetSoundHost(window);

  if (typeof SoundHost?.playSound === "function" && (typeof SoundHost.hasSound !== "function" || SoundHost.hasSound(SoundConfig.key))) {
    void SoundHost.playSound(SoundConfig.key, Options);
    return true;
  }

  return PlayLocalSound(SoundConfig.key, Options);
}
/* github-refresh: 2026-05-02T02:31:53Z */
