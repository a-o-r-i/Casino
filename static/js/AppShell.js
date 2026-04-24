(() =>
{
    const ExistingApp = window.GamblingApp || {};
    const PageInitializers = ExistingApp.PageInitializers instanceof Map ? ExistingApp.PageInitializers : new Map();
    const ScriptPromises = ExistingApp.ScriptPromises instanceof Map ? ExistingApp.ScriptPromises : new Map();
    const ModalControllers = ExistingApp.ModalControllers instanceof WeakMap ? ExistingApp.ModalControllers : new WeakMap();
    const SoundCatalog = ExistingApp.SoundCatalog instanceof Map ? ExistingApp.SoundCatalog : new Map();
    const SoundLastStartedAt = ExistingApp.SoundLastStartedAt instanceof Map ? ExistingApp.SoundLastStartedAt : new Map();
    const SoundPlayers = ExistingApp.SoundPlayers instanceof Map ? ExistingApp.SoundPlayers : new Map();
    const ActiveSoundClones = ExistingApp.ActiveSoundClones instanceof Map ? ExistingApp.ActiveSoundClones : new Map();
    const MasterSoundVolumeStorageKey = "gambling.soundVolume";
    const CountdownAutoplayStorageKey = "gambling.countdownAutoplayOnLoad";
    const PendingToastStorageKey = "gambling.pendingToast";
    const NotificationBurstSpacingMs = 110;
    const NotificationHiddenPollMultiplier = 2.4;
    const MaxNotificationToastsPerBurst = 3;
    const SyncedBodyDatasetKeys = [
        "chatCurrentUserId",
        "chatMentionQueryUrl",
        "chatSendUrl",
        "chatStateUrl",
        "chatUserProfileUrl",
        "notificationCursor",
        "notificationStateUrl",
        "presenceHeartbeatUrl",
        "presenceOfflineUrl",
    ];
    let ActivePageCleanup = null;
    let DeferredBalanceDisplay = "";
    let GlobalBalanceHoldCount = 0;
    let IsNavigating = false;
    let MasterSoundVolume = Number.isFinite(Number(ExistingApp.MasterSoundVolume))
        ? Math.min(Math.max(Number(ExistingApp.MasterSoundVolume), 0), 1)
        : 0;
    let IsSoundUnlocked = ExistingApp.IsSoundUnlocked === true;
    let LastNotificationPayload = null;
    let NotificationCursor = null;
    let NotificationPollTimeout = 0;
    let SoundUnlockListenersAttached = false;

    const GetAppHeader = () =>
    {
        return document.querySelector("[data-app-header]");
    };

    const GetAppMain = () =>
    {
        return document.querySelector("[data-app-main]");
    };

    const GetAppOverlayShell = () =>
    {
        return document.querySelector("[data-app-overlay-shell]");
    };

    const GetAppAuthShell = () =>
    {
        return document.querySelector("[data-app-auth-shell]");
    };

    const GetAppToastShell = () =>
    {
        return document.querySelector("[data-app-toast-shell]");
    };

    const GetNotificationStateUrl = () =>
    {
        return document.body.dataset.notificationStateUrl || "";
    };

    const IsAuthLocked = (DocumentValue = document) =>
    {
        return DocumentValue?.body?.dataset.authLocked === "true";
    };

    const SyncAuthLockedState = (ShouldLock) =>
    {
        if (ShouldLock)
        {
            document.body.dataset.authLocked = "true";
            return;
        }

        delete document.body.dataset.authLocked;
    };

    const ParseNotificationCursor = (RawValue) =>
    {
        const ParsedValue = Number.parseInt(RawValue || "0", 10);
        return Number.isFinite(ParsedValue) && ParsedValue >= 0 ? ParsedValue : 0;
    };

    const EnsureNotificationCursor = () =>
    {
        if (NotificationCursor === null)
        {
            NotificationCursor = ParseNotificationCursor(document.body.dataset.notificationCursor);
        }

        return NotificationCursor;
    };

    const GetNotificationPollDelay = () =>
    {
        const BaseDelay = Math.max(LastNotificationPayload?.poll_interval_ms || 2600, 1400);
        return document.visibilityState === "hidden"
            ? Math.round(BaseDelay * NotificationHiddenPollMultiplier)
            : BaseDelay;
    };

    const EscapeHtml = (Value) =>
    {
        return String(Value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    };

    const FormatRelativeTime = (Timestamp) =>
    {
        if (!Timestamp)
        {
            return "Unknown";
        }

        const Delta = Math.max(0, Math.floor(Date.now() / 1000 - Number(Timestamp)));

        if (Delta < 60)
        {
            return `${Delta} ${Delta === 1 ? "second" : "seconds"} ago`;
        }

        if (Delta < 3600)
        {
            const Minutes = Math.floor(Delta / 60);
            return `${Minutes} ${Minutes === 1 ? "min" : "mins"} ago`;
        }

        if (Delta < 86400)
        {
            const Hours = Math.floor(Delta / 3600);
            return `${Hours} ${Hours === 1 ? "hour" : "hours"} ago`;
        }

        const Days = Math.floor(Delta / 86400);
        return `${Days} ${Days === 1 ? "day" : "days"} ago`;
    };

    const BuildUserProfileAvatarMarkup = (Profile) =>
    {
        const FallbackUrl = Profile?.avatar_static_url || Profile?.avatar_url || "";
        const AvatarUrl = Profile?.avatar_url || FallbackUrl;

        if (AvatarUrl)
        {
            return `
                <img
                  alt="${EscapeHtml(Profile.display_name)}"
                  data-fallback-src="${EscapeHtml(FallbackUrl)}"
                  onerror="if (this.dataset.fallbackSrc && this.currentSrc !== this.dataset.fallbackSrc) { this.src = this.dataset.fallbackSrc; }"
                  src="${EscapeHtml(AvatarUrl)}"
                >
            `;
        }

        return EscapeHtml((Profile?.display_name || Profile?.username || "?").slice(0, 1));
    };

    const FormatPercent = (Value) =>
    {
        const NumberValue = Number(Value);

        if (!Number.isFinite(NumberValue))
        {
            return "0%";
        }

        return `${Number.isInteger(NumberValue) ? NumberValue.toFixed(0) : NumberValue.toFixed(1)}%`;
    };

    const GetRewardBadgeTone = (Profile) =>
    {
        const ExplicitTone = String(Profile?.reward_badge_tone || "").trim().toLowerCase();

        if (ExplicitTone)
        {
            return ExplicitTone;
        }

        const RewardLevel = Number.parseInt(Profile?.reward_level || "0", 10);

        if (RewardLevel >= 21)
        {
            return "diamond";
        }

        if (RewardLevel >= 16)
        {
            return "platinum";
        }

        if (RewardLevel >= 11)
        {
            return "gold";
        }

        if (RewardLevel >= 6)
        {
            return "silver";
        }

        if (RewardLevel >= 1)
        {
            return "bronze";
        }

        return "unranked";
    };

    const BuildUserProfileCardMarkup = (Profile, Options = {}) =>
    {
        const IncludeTipControls = Options.includeTipControls === true;
        const BadgeMarkup = Profile.reward_badge
            ? `<div data-chat-profile-badge data-tone="${EscapeHtml(GetRewardBadgeTone(Profile))}">Lvl ${EscapeHtml(Profile.reward_level)} &middot; ${EscapeHtml(Profile.reward_badge)}</div>`
            : "";
        const StatusLabel = Profile.is_online ? "Online" : "Offline";
        const ActivityLabel = Profile.is_online
            ? (
                Profile.connected_since
                    ? `Here since ${FormatRelativeTime(Profile.connected_since)}`
                    : "Active right now"
            )
            : (
                Profile.last_seen
                    ? `Last seen ${FormatRelativeTime(Profile.last_seen)}`
                    : "Last seen unknown"
            );
        const CanTip = Boolean(IncludeTipControls && Profile.can_tip && Profile.tip_url);
        const TipButtonMarkup = CanTip
            ? `
                <button
                  data-chat-tip-toggle
                  data-open="false"
                  title="Tip ${EscapeHtml(Profile.display_name)}"
                  type="button"
                  aria-label="Tip ${EscapeHtml(Profile.display_name)}"
                >
                  <span>Tip</span>
                  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
                    <path d="M10 2.5v15"></path>
                    <path d="M13.75 5.25H8.4a2.15 2.15 0 0 0 0 4.3h3.2a2.15 2.15 0 0 1 0 4.3H6.25"></path>
                  </svg>
                </button>
            `
            : "";
        const ProfileBadgesMarkup = BadgeMarkup || TipButtonMarkup
            ? `
                <div data-chat-profile-badges>
                  ${BadgeMarkup}
                  ${TipButtonMarkup}
                </div>
            `
            : "";
        const TipFormMarkup = CanTip
            ? `
                <div data-chat-tip-panel data-open="false" aria-hidden="true">
                  <div data-chat-tip-panel-inner>
                    <form data-chat-tip-form data-tip-url="${EscapeHtml(Profile.tip_url)}">
                      <div data-chat-tip-row>
                        <input
                          autocomplete="off"
                          data-chat-tip-input
                          inputmode="decimal"
                          min="0.01"
                          name="amount"
                          placeholder="$5"
                          step="0.01"
                          type="number"
                        >
                        <button data-chat-tip-submit type="submit">Send</button>
                      </div>
                      <div data-chat-tip-message></div>
                    </form>
                  </div>
                </div>
            `
            : "";

        return `
            <div data-chat-profile-head>
              <span data-chat-profile-avatar>${BuildUserProfileAvatarMarkup(Profile)}</span>
              <div data-chat-profile-copy>
                <div data-chat-profile-name>${EscapeHtml(Profile.display_name)}</div>
                <div data-chat-profile-meta>
                  <span
                    data-chat-profile-status
                    data-online="${Profile.is_online ? "true" : "false"}"
                    aria-label="${EscapeHtml(StatusLabel)}"
                    title="${EscapeHtml(StatusLabel)}"
                  ></span>
                  <span data-chat-profile-status-copy>${EscapeHtml(StatusLabel)}</span>
                  <div data-chat-profile-username>@${EscapeHtml(Profile.username)}</div>
                </div>
                <div data-chat-profile-subline>${EscapeHtml(ActivityLabel)}</div>
              </div>
            </div>
            ${ProfileBadgesMarkup}
            <div data-chat-profile-grid>
              <div data-chat-profile-stat>
                <div data-chat-profile-stat-label>Registered</div>
                <div data-chat-profile-stat-value>${EscapeHtml(FormatRelativeTime(Profile.registered_at))}</div>
              </div>
              <div data-chat-profile-stat>
                <div data-chat-profile-stat-label>Wagered</div>
                <div data-chat-profile-stat-value>${EscapeHtml(Profile.total_wagered_display || "$0")}</div>
              </div>
            </div>
            ${TipFormMarkup}
        `;
    };

    const ApplyGlobalBalanceDisplay = (Value) =>
    {
        if (!Value)
        {
            return;
        }

        document.querySelectorAll("[data-balance-display]").forEach((Node) =>
        {
            Node.textContent = Value;
        });
    };

    const SetGlobalBalanceDisplay = (Value, Options = {}) =>
    {
        if (!Value)
        {
            return;
        }

        if (!Options.force && GlobalBalanceHoldCount > 0)
        {
            DeferredBalanceDisplay = Value;
            return;
        }

        DeferredBalanceDisplay = "";
        ApplyGlobalBalanceDisplay(Value);
    };

    const SetRewardMenuBadge = (CountValue) =>
    {
        const Count = Math.max(Number.parseInt(CountValue || "0", 10) || 0, 0);

        document.querySelectorAll("[data-reward-menu-badge]").forEach((Badge) =>
        {
            Badge.textContent = `+${Count}`;
            Badge.hidden = Count <= 0;
        });
    };

    const HoldGlobalBalanceDisplay = () =>
    {
        GlobalBalanceHoldCount += 1;
    };

    const ReleaseGlobalBalanceDisplay = () =>
    {
        if (GlobalBalanceHoldCount > 0)
        {
            GlobalBalanceHoldCount -= 1;
        }

        if (GlobalBalanceHoldCount > 0 || !DeferredBalanceDisplay)
        {
            return;
        }

        const NextValue = DeferredBalanceDisplay;
        DeferredBalanceDisplay = "";
        ApplyGlobalBalanceDisplay(NextValue);
    };

    const HandleSoundUnlock = () =>
    {
        IsSoundUnlocked = true;
        if (window.GamblingApp)
        {
            window.GamblingApp.IsSoundUnlocked = true;
        }

        if (!SoundUnlockListenersAttached)
        {
            return;
        }

        window.removeEventListener("pointerdown", HandleSoundUnlock);
        window.removeEventListener("keydown", HandleSoundUnlock);
        window.removeEventListener("touchstart", HandleSoundUnlock);
        SoundUnlockListenersAttached = false;
    };

    const EnsureSoundUnlockListeners = () =>
    {
        if (IsSoundUnlocked || SoundUnlockListenersAttached)
        {
            return;
        }

        window.addEventListener("pointerdown", HandleSoundUnlock, {
            passive: true,
        });
        window.addEventListener("keydown", HandleSoundUnlock);
        window.addEventListener("touchstart", HandleSoundUnlock, {
            passive: true,
        });
        SoundUnlockListenersAttached = true;
    };

    const NormalizeSoundVolume = (Value) =>
    {
        const VolumeValue = Number(Value);

        if (!Number.isFinite(VolumeValue))
        {
            return 1;
        }

        return Math.min(Math.max(VolumeValue, 0), 1);
    };

    const NormalizePlaybackRate = (Value) =>
    {
        const PlaybackRateValue = Number(Value);

        if (!Number.isFinite(PlaybackRateValue) || PlaybackRateValue <= 0)
        {
            return 1;
        }

        return Math.min(Math.max(PlaybackRateValue, 0.1), 4);
    };

    const ReadStoredMasterSoundVolume = () =>
    {
        try
        {
            const RawValue = window.localStorage.getItem(MasterSoundVolumeStorageKey);
            const ParsedValue = Number(RawValue);
            return Number.isFinite(ParsedValue) ? Math.min(Math.max(ParsedValue, 0), 1) : 0;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return 0;
        }
    };

    const PersistMasterSoundVolume = () =>
    {
        try
        {
            window.localStorage.setItem(MasterSoundVolumeStorageKey, String(MasterSoundVolume));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }
    };

    const GetMasterSoundVolume = () =>
    {
        return MasterSoundVolume;
    };

    const ApplyEffectiveSoundVolume = (Player, BaseVolume) =>
    {
        if (!Player)
        {
            return;
        }

        const VolumeValue = NormalizeSoundVolume(BaseVolume);
        Player.__soundBaseVolume = VolumeValue;
        Player.volume = NormalizeSoundVolume(VolumeValue * MasterSoundVolume);
    };

    const HasSound = (Key) =>
    {
        return SoundCatalog.has(String(Key ?? ""));
    };

    const GetSoundEntry = (Key) =>
    {
        return SoundCatalog.get(String(Key ?? "")) || null;
    };

    const GetSoundDuration = (Key) =>
    {
        const DurationMs = Number(GetSoundEntry(Key)?.options?.durationMs);
        return Number.isFinite(DurationMs) && DurationMs > 0 ? DurationMs : null;
    };

    const CreateSoundPlayer = (Entry) =>
    {
        if (!Entry || typeof window.Audio !== "function")
        {
            return null;
        }

        const Player = new window.Audio(Entry.url);
        Player.preload = Entry.options?.preload || "auto";
        ApplyEffectiveSoundVolume(Player, Entry.options?.volume);
        return Player;
    };

    const EnsureSoundPlayer = (Key) =>
    {
        const SoundKey = String(Key ?? "");

        if (!SoundKey)
        {
            return null;
        }

        const ExistingPlayer = SoundPlayers.get(SoundKey);

        if (ExistingPlayer)
        {
            return ExistingPlayer;
        }

        const Entry = GetSoundEntry(SoundKey);

        if (!Entry)
        {
            return null;
        }

        const Player = CreateSoundPlayer(Entry);

        if (!Player)
        {
            return null;
        }

        SoundPlayers.set(SoundKey, Player);
        return Player;
    };

    const ResetSoundPlayer = (Player) =>
    {
        if (!Player)
        {
            return;
        }

        try
        {
            Player.pause();
            Player.currentTime = 0;
            Player.loop = false;
            Player.playbackRate = 1;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }
    };

    const RemoveSoundClone = (Key, Player) =>
    {
        const CloneSet = ActiveSoundClones.get(Key);

        if (!CloneSet)
        {
            return;
        }

        CloneSet.delete(Player);

        if (!CloneSet.size)
        {
            ActiveSoundClones.delete(Key);
        }
    };

    const StopSound = (Key) =>
    {
        const SoundKey = String(Key ?? "");

        if (!SoundKey)
        {
            return;
        }

        ResetSoundPlayer(SoundPlayers.get(SoundKey));

        const CloneSet = ActiveSoundClones.get(SoundKey);

        if (!CloneSet)
        {
            return;
        }

        CloneSet.forEach((Player) =>
        {
            ResetSoundPlayer(Player);
        });
        ActiveSoundClones.delete(SoundKey);
    };

    const RegisterSound = (Key, Url, Options = {}) =>
    {
        const SoundKey = String(Key ?? "");

        if (!SoundKey || !Url)
        {
            return false;
        }

        const ExistingEntry = GetSoundEntry(SoundKey);
        const Entry = {
            options: {
                allowOverlap: false,
                preload: "auto",
                restart: true,
                ...ExistingEntry?.options,
                ...Options,
            },
            url: String(Url),
        };

        SoundCatalog.set(SoundKey, Entry);

        const ExistingPlayer = SoundPlayers.get(SoundKey);

        if (ExistingPlayer)
        {
            if (ExistingEntry?.url !== Entry.url)
            {
                StopSound(SoundKey);
                SoundPlayers.delete(SoundKey);
            }
            else
            {
                ExistingPlayer.preload = Entry.options.preload || "auto";
                ApplyEffectiveSoundVolume(ExistingPlayer, Entry.options.volume);
            }
        }

        EnsureSoundUnlockListeners();
        EnsureSoundPlayer(SoundKey);
        return true;
    };

    const ResolveSoundOptions = (Key, Options = {}) =>
    {
        return {
            allowOverlap: false,
            durationMs: GetSoundDuration(Key),
            loop: false,
            minReplayGapMs: 0,
            playbackRate: 1,
            preload: "auto",
            preservePitch: true,
            restart: true,
            startTime: 0,
            targetDurationMs: null,
            volume: 1,
            ...GetSoundEntry(Key)?.options,
            ...Options,
        };
    };

    const ResolveSoundPlaybackRate = (SoundOptions) =>
    {
        const TargetDurationMs = Number(SoundOptions.targetDurationMs);
        const SoundDurationMs = Number(SoundOptions.durationMs);

        if (
            Number.isFinite(TargetDurationMs) &&
            TargetDurationMs > 0 &&
            Number.isFinite(SoundDurationMs) &&
            SoundDurationMs > 0
        )
        {
            return NormalizePlaybackRate(SoundDurationMs / TargetDurationMs);
        }

        return NormalizePlaybackRate(SoundOptions.playbackRate);
    };

    const SyncSoundControls = () =>
    {
        const Controls = Array.from(document.querySelectorAll("[data-sound-control]"));
        const VolumePercent = Math.round(MasterSoundVolume * 100);

        Controls.forEach((Control) =>
        {
            const InputNode = Control.querySelector("[data-sound-volume-input]");
            const LabelNode = Control.querySelector("[data-sound-volume-value]");

            if (InputNode)
            {
                InputNode.value = String(VolumePercent);
            }

            if (LabelNode)
            {
                LabelNode.textContent = `${VolumePercent}%`;
            }
        });
    };

    const RefreshAllSoundVolumes = () =>
    {
        SoundPlayers.forEach((Player, Key) =>
        {
            ApplyEffectiveSoundVolume(Player, GetSoundEntry(Key)?.options?.volume ?? Player.__soundBaseVolume ?? 1);
        });

        ActiveSoundClones.forEach((CloneSet) =>
        {
            CloneSet.forEach((Player) =>
            {
                ApplyEffectiveSoundVolume(Player, Player.__soundBaseVolume ?? 1);
            });
        });
    };

    const SetMasterSoundVolume = (Value, Options = {}) =>
    {
        const {
            persist = true,
        } = Options;

        MasterSoundVolume = Math.min(Math.max(Number(Value) || 0, 0), 1);
        RefreshAllSoundVolumes();
        SyncSoundControls();

        if (window.GamblingApp)
        {
            window.GamblingApp.MasterSoundVolume = MasterSoundVolume;
        }

        if (persist)
        {
            PersistMasterSoundVolume();
        }
    };

    const TrackSoundClone = (Key, Player) =>
    {
        const CloneSet = ActiveSoundClones.get(Key) || new Set();
        CloneSet.add(Player);
        ActiveSoundClones.set(Key, CloneSet);

        const Cleanup = () =>
        {
            RemoveSoundClone(Key, Player);
        };

        Player.addEventListener("ended", Cleanup, {
            once: true,
        });
        Player.addEventListener("error", Cleanup, {
            once: true,
        });
    };

    const PlaySound = (Key, Options = {}) =>
    {
        const SoundKey = String(Key ?? "");

        if (!SoundKey)
        {
            return Promise.resolve(false);
        }

        const BasePlayer = EnsureSoundPlayer(SoundKey);

        if (!BasePlayer)
        {
            return Promise.resolve(false);
        }

        EnsureSoundUnlockListeners();

        const SoundOptions = ResolveSoundOptions(SoundKey, Options);
        const StartTime = Math.max(Number(SoundOptions.startTime) || 0, 0);
        const PlaybackRate = ResolveSoundPlaybackRate(SoundOptions);
        const MinReplayGapMs = Math.max(Number(SoundOptions.minReplayGapMs) || 0, 0);
        const LastStartedAt = SoundLastStartedAt.get(SoundKey) || 0;
        const Now = performance.now();

        if (MinReplayGapMs > 0 && (Now - LastStartedAt) < MinReplayGapMs)
        {
            return Promise.resolve(false);
        }

        let PlaybackPlayer = BasePlayer;

        if (
            SoundOptions.allowOverlap === true &&
            !BasePlayer.paused &&
            !BasePlayer.ended &&
            BasePlayer.currentTime > 0
        )
        {
            PlaybackPlayer = BasePlayer.cloneNode(true);
            TrackSoundClone(SoundKey, PlaybackPlayer);
        }
        else if (SoundOptions.restart !== false || BasePlayer.paused || BasePlayer.ended)
        {
            try
            {
                BasePlayer.pause();
                BasePlayer.currentTime = StartTime;
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        }
        else
        {
            return Promise.resolve(false);
        }

        PlaybackPlayer.loop = Boolean(SoundOptions.loop);
        PlaybackPlayer.preload = SoundOptions.preload || "auto";
        ApplyEffectiveSoundVolume(PlaybackPlayer, SoundOptions.volume);
        PlaybackPlayer.playbackRate = PlaybackRate;
        PlaybackPlayer.defaultPlaybackRate = PlaybackRate;

        if ("preservesPitch" in PlaybackPlayer)
        {
            PlaybackPlayer.preservesPitch = SoundOptions.preservePitch !== false;
        }

        if ("mozPreservesPitch" in PlaybackPlayer)
        {
            PlaybackPlayer.mozPreservesPitch = SoundOptions.preservePitch !== false;
        }

        if ("webkitPreservesPitch" in PlaybackPlayer)
        {
            PlaybackPlayer.webkitPreservesPitch = SoundOptions.preservePitch !== false;
        }

        if (PlaybackPlayer !== BasePlayer)
        {
            try
            {
                PlaybackPlayer.currentTime = StartTime;
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        }

        const PlayPromise = PlaybackPlayer.play();

        if (!PlayPromise || typeof PlayPromise.then !== "function")
        {
            SoundLastStartedAt.set(SoundKey, Now);
            return Promise.resolve(true);
        }

        return PlayPromise
            .then(() =>
            {
                SoundLastStartedAt.set(SoundKey, Now);
                return true;
            })
            .catch(() =>
            {
                if (PlaybackPlayer !== BasePlayer)
                {
                    RemoveSoundClone(SoundKey, PlaybackPlayer);
                }

                return false;
            });
    };

    const RegisterBuiltInSounds = () =>
    {
        const BodyDataset = document.body?.dataset;

        if (!BodyDataset)
        {
            return;
        }

        RegisterSound("win", BodyDataset.sfxWinUrl, {
            durationMs: 3527,
            volume: 0.76,
        });
        RegisterSound("dice-roll", BodyDataset.sfxDiceRollUrl, {
            durationMs: 1567,
            minReplayGapMs: 180,
            volume: 0.82,
        });
        RegisterSound("countdown", BodyDataset.sfxCountdownUrl, {
            durationMs: 5000,
            volume: 0.82,
        });
        RegisterSound("coinflip-full", BodyDataset.sfxCoinflipFullUrl, {
            durationMs: 1464,
            volume: 0.78,
        });
        RegisterSound("coinflip-spin", BodyDataset.sfxCoinflipSpinUrl, {
            durationMs: 1080,
            volume: 0.76,
        });
        RegisterSound("coinflip-reveal", BodyDataset.sfxCoinflipRevealUrl, {
            durationMs: 504,
            volume: 0.82,
        });
    };

    const GetToastTone = (ToneValue) =>
    {
        return ["success", "error", "info"].includes(ToneValue) ? ToneValue : "info";
    };

    const BuildToastIconMarkup = (ToneValue) =>
    {
        if (ToneValue === "error")
        {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 8v4"></path>
                  <path d="M12 16h.01"></path>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
                </svg>
            `;
        }

        if (ToneValue === "success")
        {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true">
                  <path d="m5 12 4.2 4.2L19 6.8"></path>
                </svg>
            `;
        }

        return `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
              <path d="M12 8h.01"></path>
              <path d="M11 12h1v4h1"></path>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"></path>
            </svg>
        `;
    };

    const BuildToastElement = (ToastValue) =>
    {
        const ToneValue = GetToastTone(ToastValue?.tone);
        const Toast = document.createElement("section");
        const Head = document.createElement("div");
        const Copy = document.createElement("div");
        const Title = document.createElement("strong");
        const DismissButton = document.createElement("button");
        const ProgressTrack = document.createElement("div");
        const Progress = document.createElement("div");
        const Message =
            typeof ToastValue?.message === "string" && ToastValue.message.trim()
                ? document.createElement("p")
                : null;

        Toast.dataset.appToast = "";
        Toast.dataset.toastActionable = ToastValue?.action ? "true" : "false";
        Toast.dataset.toastTone = ToneValue;
        Toast.setAttribute("role", "status");
        Toast.tabIndex = ToastValue?.action ? 0 : -1;

        Head.dataset.toastHead = "";
        Copy.dataset.toastCopy = "";
        Title.dataset.toastTitle = "";
        Title.textContent = ToastValue?.title || "Notice";
        DismissButton.dataset.toastDismiss = "";
        DismissButton.setAttribute("aria-label", "Dismiss notification");
        DismissButton.type = "button";
        DismissButton.innerHTML = `
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" aria-hidden="true">
              <path d="m5 5 10 10"></path>
              <path d="M15 5 5 15"></path>
            </svg>
        `;
        ProgressTrack.dataset.toastProgressTrack = "";
        Progress.dataset.toastProgress = "";

        Copy.appendChild(Title);

        if (Message)
        {
            Message.dataset.toastMessage = "";
            Message.textContent = ToastValue.message;
            Copy.appendChild(Message);
        }

        ProgressTrack.appendChild(Progress);
        Head.appendChild(Copy);
        Toast.appendChild(ProgressTrack);
        Toast.appendChild(Head);
        Toast.appendChild(DismissButton);

        return {
            dismissButton: DismissButton,
            progress: Progress,
            toast: Toast,
        };
    };

    const DismissToast = async (Toast, Options = {}) =>
    {
        if (!(Toast instanceof Element))
        {
            return false;
        }

        const Direction = Options.direction === -1 ? -1 : 1;
        const DragDismiss = Options.dragDismiss === true;
        const Immediate = Options.immediate === true;

        if (Toast.dataset.toastState === "closing")
        {
            return false;
        }

        Toast.dataset.toastState = "closing";

        if (Toast.__closeTimer)
        {
            window.clearTimeout(Toast.__closeTimer);
            Toast.__closeTimer = 0;
        }

        if (Toast.__progressAnimation)
        {
            Toast.__progressAnimation.cancel();
            Toast.__progressAnimation = null;
        }

        if (Toast.__entryAnimation)
        {
            Toast.__entryAnimation.cancel();
            Toast.__entryAnimation = null;
        }

        if (Immediate || typeof Toast.animate !== "function")
        {
            Toast.remove();
            return true;
        }

        CancelAnimations(Toast);

        const CurrentOpacity = Number.parseFloat(Toast.style.opacity || "1");
        const StartOpacity = Number.isFinite(CurrentOpacity) ? CurrentOpacity : 1;
        const StartTransform = Toast.style.transform || "translateX(0px)";
        const TargetTransform = DragDismiss
            ? `translateX(${Direction * (window.innerWidth + Toast.getBoundingClientRect().width)}px)`
            : "translateY(-16px) scale(0.92)";
        const Keyframes = DragDismiss
            ? [
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    transform: StartTransform,
                },
                {
                    filter: "blur(12px)",
                    opacity: 0,
                    transform: TargetTransform,
                },
            ]
            : [
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    transform: "translateY(0px) scale(1)",
                },
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    offset: 0.18,
                    transform: "translateY(-3px) scale(1.012)",
                },
                {
                    filter: "blur(12px)",
                    opacity: 0,
                    transform: TargetTransform,
                },
            ];

        await Toast.animate(Keyframes, {
            duration: DragDismiss ? 220 : 280,
            easing: DragDismiss ? "cubic-bezier(0.2, 0.9, 0.2, 1)" : "cubic-bezier(0.4, 0, 1, 1)",
            fill: "forwards",
        }).finished.catch(() =>
        {
            return null;
        });

        Toast.remove();
        return true;
    };

    const AnimateToastActionPress = async (Toast) =>
    {
        if (!(Toast instanceof Element) || typeof Toast.animate !== "function")
        {
            return false;
        }

        CancelAnimations(Toast);

        await Toast.animate(
            [
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    transform: "translateX(0px) scale(1)",
                },
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    offset: 0.46,
                    transform: "translateX(0px) scale(0.985)",
                },
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    transform: "translateX(0px) scale(1.01)",
                },
            ],
            {
                duration: 180,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "forwards",
            },
        ).finished.catch(() =>
        {
            return null;
        });

        Toast.style.transform = "translateX(0px) scale(1.01)";
        return true;
    };

    const OpenToastAction = async (ToastValue, ToastElement = null) =>
    {
        const Action = ToastValue?.action;

        if (!Action)
        {
            return false;
        }

        if (Action.type === "join_session_prompt")
        {
            const JoinModalController = GetModalController("notification-session-join");
            const JoinForm = document.querySelector("[data-notification-join-form]");
            const JoinCopy = document.querySelector("[data-notification-join-copy]");
            const JoinViewLink = document.querySelector("[data-notification-view-link]");

            if (!JoinModalController || !JoinForm || !JoinCopy || !JoinViewLink)
            {
                return false;
            }

            if (ToastElement)
            {
                await AnimateToastActionPress(ToastElement);
            }

            JoinForm.action = Action.join_url || Action.view_url || window.location.href;
            JoinCopy.textContent = Action.join_copy || "You can join this session now.";
            JoinViewLink.href = Action.view_url || window.location.href;

            if (ToastElement)
            {
                DismissToast(ToastElement, {
                    immediate: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }

            await JoinModalController.open();
            return true;
        }

        if (Action.type === "open_chat")
        {
            window.dispatchEvent(new CustomEvent("site-chat:open", {
                detail: {
                    targetMessageId: Number.parseInt(Action.target_message_id, 10) || 0,
                },
            }));

            if (ToastElement)
            {
                DismissToast(ToastElement, {
                    immediate: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }

            return true;
        }

        if (Action.view_url && window.GamblingApp?.navigateTo)
        {
            if (ToastElement)
            {
                await AnimateToastActionPress(ToastElement);
                DismissToast(ToastElement, {
                    immediate: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }

            await window.GamblingApp.navigateTo(Action.view_url);
            return true;
        }

        return false;
    };

    const ShowToast = (ToastValue) =>
    {
        const ToastShell = GetAppToastShell();

        if (!ToastShell)
        {
            return null;
        }

        const {
            dismissButton: DismissButton,
            progress: Progress,
            toast: Toast,
        } = BuildToastElement(ToastValue);
        const DurationMs = Math.min(Math.max(Number.parseInt(ToastValue?.durationMs, 10) || 4200, 1800), 12000);
        let CloseTimer = 0;
        let DidDrag = false;
        let DragDeltaX = 0;
        let DragPointerId = null;
        let DragStartX = 0;
        let IsDragging = false;
        let IsPaused = false;
        let RemainingMs = DurationMs;
        let SuppressActionUntil = 0;
        let TimerStartedAt = 0;

        ToastShell.appendChild(Toast);

        while (ToastShell.children.length > 4)
        {
            const OldestToast = ToastShell.firstElementChild;

            if (!OldestToast || OldestToast === Toast)
            {
                break;
            }

            DismissToast(OldestToast, {
                immediate: true,
            }).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        }

        const ClearCloseTimer = () =>
        {
            if (!CloseTimer)
            {
                return;
            }

            window.clearTimeout(CloseTimer);
            CloseTimer = 0;
            Toast.__closeTimer = 0;
        };

        const PauseLifetime = () =>
        {
            if (Toast.dataset.toastState === "closing" || IsPaused)
            {
                return;
            }

            IsPaused = true;

            if (CloseTimer)
            {
                RemainingMs = Math.max(0, RemainingMs - (performance.now() - TimerStartedAt));
            }

            ClearCloseTimer();
            Toast.__progressAnimation?.pause?.();
        };

        const ResumeLifetime = () =>
        {
            if (Toast.dataset.toastState === "closing" || !IsPaused || IsDragging)
            {
                return;
            }

            if (RemainingMs <= 0)
            {
                DismissToast(Toast).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            IsPaused = false;
            TimerStartedAt = performance.now();
            CloseTimer = window.setTimeout(() =>
            {
                DismissToast(Toast).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }, RemainingMs);
            Toast.__closeTimer = CloseTimer;
            Toast.__progressAnimation?.play?.();
        };

        if (typeof Progress.animate === "function")
        {
            Toast.__progressAnimation = Progress.animate(
                [
                    {
                        transform: "scaleX(1)",
                    },
                    {
                        transform: "scaleX(0)",
                    },
                ],
                {
                    duration: DurationMs,
                    easing: "linear",
                    fill: "forwards",
                },
            );
        }
        else
        {
            Toast.__progressAnimation = null;
        }

        IsPaused = true;
        ResumeLifetime();

        DismissButton.addEventListener("click", (EventValue) =>
        {
            EventValue.stopPropagation();
            DismissToast(Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("click", (EventValue) =>
        {
            if (
                !ToastValue?.action ||
                EventValue.target.closest("[data-toast-dismiss]") ||
                SuppressActionUntil > performance.now()
            )
            {
                return;
            }

            OpenToastAction(ToastValue, Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("keydown", (EventValue) =>
        {
            if (!ToastValue?.action || !["Enter", " "].includes(EventValue.key))
            {
                return;
            }

            EventValue.preventDefault();
            OpenToastAction(ToastValue, Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("pointerenter", PauseLifetime);
        Toast.addEventListener("pointerleave", () =>
        {
            if (IsDragging)
            {
                return;
            }

            ResumeLifetime();
        });

        Toast.addEventListener("pointerdown", (EventValue) =>
        {
            if (EventValue.button !== 0 || EventValue.target.closest("[data-toast-dismiss]"))
            {
                return;
            }

            IsDragging = true;
            DidDrag = false;
            DragDeltaX = 0;
            DragPointerId = EventValue.pointerId;
            DragStartX = EventValue.clientX;
            PauseLifetime();
            CancelAnimations(Toast);
            Toast.dataset.toastDragging = "true";
            Toast.setPointerCapture?.(DragPointerId);
        });

        Toast.addEventListener("pointermove", (EventValue) =>
        {
            if (!IsDragging || EventValue.pointerId !== DragPointerId)
            {
                return;
            }

            DragDeltaX = EventValue.clientX - DragStartX;
            if (Math.abs(DragDeltaX) > 8)
            {
                DidDrag = true;
                SuppressActionUntil = performance.now() + 320;
            }
            Toast.style.transform = `translateX(${DragDeltaX}px)`;
            Toast.style.opacity = String(Math.max(0.34, 1 - Math.abs(DragDeltaX) / (Toast.offsetWidth * 1.08)));
        });

        const FinishDrag = (EventValue) =>
        {
            if (!IsDragging || EventValue.pointerId !== DragPointerId)
            {
                return;
            }

            IsDragging = false;
            Toast.removeAttribute("data-toast-dragging");
            Toast.releasePointerCapture?.(DragPointerId);
            DragPointerId = null;

            if (DidDrag)
            {
                SuppressActionUntil = performance.now() + 320;
            }

            const DismissThreshold = Math.max(120, Toast.offsetWidth * 0.32);

            if (Math.abs(DragDeltaX) >= DismissThreshold)
            {
                DismissToast(Toast, {
                    direction: DragDeltaX >= 0 ? 1 : -1,
                    dragDismiss: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            const CurrentOpacity = Number.parseFloat(Toast.style.opacity || "1");
            const StartOpacity = Number.isFinite(CurrentOpacity) ? CurrentOpacity : 1;
            const StartTransform = Toast.style.transform || "translateX(0px)";
            const OvershootX = DragDeltaX === 0 ? 0 : DragDeltaX * -0.08;

            Toast.animate(
                [
                    {
                        opacity: StartOpacity,
                        transform: StartTransform,
                    },
                    {
                        opacity: 1,
                        offset: 0.72,
                        transform: `translateX(${OvershootX}px)`,
                    },
                    {
                        opacity: 1,
                        transform: "translateX(0px)",
                    },
                ],
                {
                    duration: 420,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "forwards",
                },
            ).finished.finally(() =>
            {
                Toast.style.opacity = "";
                Toast.style.transform = "";
            });

            if (!Toast.matches(":hover"))
            {
                ResumeLifetime();
            }
        };

        Toast.addEventListener("pointerup", FinishDrag);
        Toast.addEventListener("pointercancel", FinishDrag);

        window.requestAnimationFrame(() =>
        {
            if (typeof Toast.animate !== "function")
            {
                return;
            }

            Toast.__entryAnimation = Toast.animate(
                [
                    {
                        filter: "blur(12px)",
                        opacity: 0,
                        transform: "translateX(22px) scale(0.94)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        offset: 0.74,
                        transform: "translateX(-4px) scale(1.012)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        transform: "translateX(0px) scale(1)",
                    },
                ],
                {
                    duration: 620,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "both",
                },
            );
        });

        return Toast;
    };

    const ShowNotificationBurst = (Payload) =>
    {
        const Notifications = Array.isArray(Payload?.notifications) ? Payload.notifications : [];
        const SkippedCount = Math.max(Number.parseInt(Payload?.skipped_count || "0", 10) || 0, 0);
        const VisibleNotifications = Notifications.slice(-MaxNotificationToastsPerBurst);
        const CondensedCount = SkippedCount + Math.max(Notifications.length - VisibleNotifications.length, 0);
        let DelayMs = 0;

        if (CondensedCount > 0)
        {
            const NotificationLabel = CondensedCount === 1 ? "notification was" : "notifications were";

            ShowToast({
                durationMs: 5200,
                message: `${CondensedCount} older ${NotificationLabel} condensed to keep the page responsive.`,
                title: "Notifications condensed",
                tone: "info",
            });
            DelayMs += NotificationBurstSpacingMs;
        }

        VisibleNotifications.forEach((Notification, Index) =>
        {
            window.setTimeout(() =>
            {
                ShowToast(Notification);
            }, DelayMs + (Index * NotificationBurstSpacingMs));
        });
    };

    const SetPendingToast = (ToastValue) =>
    {
        try
        {
            if (!ToastValue)
            {
                window.sessionStorage.removeItem(PendingToastStorageKey);
                return false;
            }

            window.sessionStorage.setItem(PendingToastStorageKey, JSON.stringify(ToastValue));
            return true;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return false;
        }
    };

    const MatchesPendingToast = (ToastValue, UrlValue) =>
    {
        const Matcher = ToastValue?.match;

        if (!Matcher)
        {
            return true;
        }

        if (typeof Matcher.pathname === "string")
        {
            return UrlValue.pathname === Matcher.pathname;
        }

        if (typeof Matcher.pathnamePattern === "string")
        {
            try
            {
                return new RegExp(Matcher.pathnamePattern).test(UrlValue.pathname);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
                return false;
            }
        }

        return true;
    };

    const ConsumePendingToast = (UrlValue = window.location.href) =>
    {
        let ToastValue = null;

        try
        {
            const SerializedToast = window.sessionStorage.getItem(PendingToastStorageKey);

            if (!SerializedToast)
            {
                return false;
            }

            window.sessionStorage.removeItem(PendingToastStorageKey);
            ToastValue = JSON.parse(SerializedToast);
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            window.sessionStorage.removeItem(PendingToastStorageKey);
            return false;
        }

        const TargetUrl = new URL(UrlValue, window.location.href);

        if (!MatchesPendingToast(ToastValue, TargetUrl))
        {
            return false;
        }

        window.setTimeout(() =>
        {
            ShowToast(ToastValue);
        }, 90);

        return true;
    };

    const FetchNotificationState = async (StateUrl, SinceId) =>
    {
        try
        {
            const RequestUrl = new URL(StateUrl, window.location.href);
            RequestUrl.searchParams.set("since", String(SinceId));

            const Response = await fetch(RequestUrl.href, {
                headers: {
                    Accept: "application/json",
                },
            });
            const ContentType = Response.headers.get("content-type") || "";

            if (!Response.ok || !ContentType.includes("application/json"))
            {
                return null;
            }

            return await Response.json();
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return null;
        }
    };

    const ScheduleNotificationPoll = (Delay = GetNotificationPollDelay()) =>
    {
        if (IsAuthLocked() || !GetNotificationStateUrl())
        {
            NotificationPollTimeout = 0;
            return;
        }

        if (NotificationPollTimeout)
        {
            window.clearTimeout(NotificationPollTimeout);
        }

        NotificationPollTimeout = window.setTimeout(async () =>
        {
            NotificationPollTimeout = 0;

            if (IsAuthLocked() || !GetNotificationStateUrl())
            {
                return;
            }

            const Payload = await FetchNotificationState(GetNotificationStateUrl(), EnsureNotificationCursor());

            if (!Payload)
            {
                ScheduleNotificationPoll(Math.max(GetNotificationPollDelay(), 3600));
                return;
            }

            LastNotificationPayload = Payload;
            SetGlobalBalanceDisplay(Payload.current_balance_display);
            SetRewardMenuBadge(Payload.pending_level_reward_count);

            if (Number.isFinite(Payload.latest_id))
            {
                NotificationCursor = Math.max(Payload.latest_id, 0);
                document.body.dataset.notificationCursor = String(NotificationCursor);
            }

            if (Array.isArray(Payload.notifications))
            {
                ShowNotificationBurst(Payload);
            }

            ScheduleNotificationPoll();
        }, Delay);
    };

    const StartNotificationPolling = () =>
    {
        EnsureNotificationCursor();

        if (IsAuthLocked() || !GetNotificationStateUrl())
        {
            if (NotificationPollTimeout)
            {
                window.clearTimeout(NotificationPollTimeout);
                NotificationPollTimeout = 0;
            }

            return;
        }

        ScheduleNotificationPoll(900);
    };
    const RegisterPageInitializer = (PageKey, Initializer) =>
    {
        if (!PageKey || typeof Initializer !== "function")
        {
            return;
        }

        const Initializers = PageInitializers.get(PageKey) || [];
        Initializers.push(Initializer);
        PageInitializers.set(PageKey, Initializers);
    };

    const DestroyCurrentPage = () =>
    {
        if (typeof ActivePageCleanup !== "function")
        {
            return;
        }

        try
        {
            ActivePageCleanup();
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }

        ActivePageCleanup = null;
    };

    const InitializeCurrentPage = () =>
    {
        DestroyCurrentPage();

        const Main = GetAppMain();

        if (!Main)
        {
            return;
        }

        const PageKey = Main.dataset.pageKey || "";
        const Initializers = PageInitializers.get(PageKey) || [];
        const CleanupFunctions = [];

        Initializers.forEach((Initializer) =>
        {
            try
            {
                const Cleanup = Initializer({
                    main: Main,
                });

                if (typeof Cleanup === "function")
                {
                    CleanupFunctions.push(Cleanup);
                }
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        });

        ActivePageCleanup = () =>
        {
            for (let Index = CleanupFunctions.length - 1; Index >= 0; Index -= 1)
            {
                try
                {
                    CleanupFunctions[Index]();
                }
                catch (ErrorValue)
                {
                    console.error(ErrorValue);
                }
            }
        };
    };

    const GetRouteCards = (Scope) =>
    {
        const Cards = Array.from(Scope?.querySelectorAll("[data-route-card]") || []);
        return Cards.length ? Cards : Scope ? [Scope] : [];
    };

    const AnimateCardsOut = async (Scope) =>
    {
        const Cards = GetRouteCards(Scope);

        if (!Cards.length || typeof Cards[0].animate !== "function")
        {
            return;
        }

        await Promise.all(
            Cards.map((Card, Index) =>
            {
                const CurrentOpacity = window.getComputedStyle(Card).opacity || "1";

                return Card.animate(
                    [
                        {
                            filter: "blur(0px)",
                            opacity: CurrentOpacity,
                            transform: "translateY(0px) scale(1)",
                        },
                        {
                            filter: "blur(8px)",
                            opacity: 0,
                            transform: "translateY(18px) scale(0.972)",
                        },
                    ],
                    {
                        delay: Math.min(Index * 16, 112),
                        duration: 220,
                        easing: "cubic-bezier(0.4, 0, 1, 1)",
                        fill: "forwards",
                    },
                ).finished.catch(() =>
                {
                    return null;
                });
            }),
        );
    };

    const AnimateCardsIn = (Scope) =>
    {
        const Cards = GetRouteCards(Scope);

        if (!Cards.length || typeof Cards[0].animate !== "function")
        {
            return;
        }

        Cards.forEach((Card, Index) =>
        {
            const TargetOpacity = window.getComputedStyle(Card).opacity || "1";

            Card.animate(
                [
                    {
                        filter: "blur(12px)",
                        opacity: 0,
                        transform: "translateY(30px) scale(0.92)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: TargetOpacity,
                        offset: 0.72,
                        transform: "translateY(-5px) scale(1.018)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: TargetOpacity,
                        transform: "translateY(0px) scale(1)",
                    },
                ],
                {
                    delay: Math.min(Index * 34, 170),
                    duration: 640,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "both",
                },
            );
        });
    };

    const CancelAnimations = (Element) =>
    {
        Element?.getAnimations?.().forEach((Animation) =>
        {
            Animation.cancel();
        });
    };

    const RunAnimation = async (Element, Keyframes, Options) =>
    {
        if (!Element?.animate)
        {
            return;
        }

        const Animation = Element.animate(Keyframes, Options);
        await Animation.finished.catch(() =>
        {
            return null;
        });
    };

    const EscapeSelectorValue = (Value) =>
    {
        return window.CSS?.escape ? window.CSS.escape(Value) : Value.replaceAll("\"", "\\\"");
    };

    const SetModalPointerState = (Modal, IsOpen) =>
    {
        if (!IsOpen || Modal.dataset.modalPassthrough === "true")
        {
            Modal.classList.add("pointer-events-none");
            return;
        }

        Modal.classList.remove("pointer-events-none");
    };

    const SyncModalScrollLock = () =>
    {
        const HasBlockingModal = Array.from(document.querySelectorAll("[data-modal]")).some((Modal) =>
        {
            if (!(Modal instanceof HTMLElement) || Modal.dataset.modalPassthrough === "true")
            {
                return false;
            }

            return !Modal.classList.contains("pointer-events-none");
        });

        document.documentElement.style.overflow = HasBlockingModal ? "hidden" : "";
        document.body.style.overflow = HasBlockingModal ? "hidden" : "";
    };

    const ApplyClosedModalStyles = (Modal, Overlay, Panel) =>
    {
        Modal.classList.add("opacity-0");
        SetModalPointerState(Modal, false);
        Modal.dataset.modalState = "closed";
        Modal.style.opacity = "0";
        Overlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
        Panel.style.opacity = "0";
        Panel.style.filter = "blur(10px)";
        Panel.style.transform = "translateY(20px) scale(0.84)";
        SyncModalScrollLock();
    };

    const ApplyOpenModalStyles = (Modal, Overlay, Panel) =>
    {
        Modal.classList.remove("opacity-0");
        SetModalPointerState(Modal, true);
        Modal.dataset.modalState = "open";
        Modal.style.opacity = "1";
        Overlay.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
        Panel.style.opacity = "1";
        Panel.style.filter = "blur(0px)";
        Panel.style.transform = "translateY(0px) scale(1)";
        SyncModalScrollLock();
    };

    const BuildModalController = (Modal) =>
    {
        const Overlay = Modal?.querySelector("[data-modal-overlay]");
        const Panel = Modal?.querySelector("[data-modal-panel]");

        if (!Modal || !Overlay || !Panel)
        {
            return null;
        }

        const IsLocked = Modal.dataset.modalLocked === "true";
        let IsAnimating = false;
        let IsOpen = Modal.dataset.modalState === "open" || !Modal.classList.contains("pointer-events-none");

        if (IsOpen)
        {
            ApplyOpenModalStyles(Modal, Overlay, Panel);
        }
        else
        {
            ApplyClosedModalStyles(Modal, Overlay, Panel);
        }

        const Open = async () =>
        {
            if (IsAnimating || IsOpen)
            {
                return false;
            }

            IsAnimating = true;
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            Modal.classList.remove("opacity-0");
            SetModalPointerState(Modal, true);
            SyncModalScrollLock();
            Modal.dataset.modalState = "opening";
            Modal.style.opacity = "1";
            Overlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
            Panel.style.opacity = "0";
            Panel.style.filter = "blur(12px)";
            Panel.style.transform = "translateY(20px) scale(0.84)";

            await Promise.all(
                [
                    RunAnimation(
                        Overlay,
                        [
                            { backgroundColor: "rgba(0, 0, 0, 0)" },
                            { backgroundColor: "rgba(0, 0, 0, 0.65)" },
                        ],
                        {
                            duration: 180,
                            easing: "ease-out",
                            fill: "forwards",
                        },
                    ),
                    RunAnimation(
                        Panel,
                        [
                            {
                                filter: "blur(12px)",
                                opacity: 0,
                                transform: "translateY(20px) scale(0.84)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                offset: 0.72,
                                transform: "translateY(-8px) scale(1.035)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                transform: "translateY(0px) scale(1)",
                            },
                        ],
                        {
                            duration: 560,
                            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                            fill: "forwards",
                        },
                    ),
                ],
            );

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyOpenModalStyles(Modal, Overlay, Panel);
            IsOpen = true;
            IsAnimating = false;
            return true;
        };

        const ShowImmediately = () =>
        {
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyOpenModalStyles(Modal, Overlay, Panel);
            IsOpen = true;
            IsAnimating = false;
            return true;
        };

        const HideImmediately = (Options = {}) =>
        {
            const Force = Options.force === true;

            if (IsLocked && !Force)
            {
                return false;
            }

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyClosedModalStyles(Modal, Overlay, Panel);
            IsOpen = false;
            IsAnimating = false;
            return true;
        };

        const Close = async (Options = {}) =>
        {
            const Force = Options.force === true;

            if (IsLocked && !Force)
            {
                return false;
            }

            if (IsAnimating || !IsOpen)
            {
                return false;
            }

            IsAnimating = true;
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            Modal.classList.remove("opacity-0");
            SetModalPointerState(Modal, true);
            SyncModalScrollLock();
            Modal.dataset.modalState = "closing";
            Modal.style.opacity = "1";
            Overlay.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
            Panel.style.opacity = "1";
            Panel.style.filter = "blur(0px)";
            Panel.style.transform = "translateY(0px) scale(1)";

            await Promise.all(
                [
                    RunAnimation(
                        Overlay,
                        [
                            { backgroundColor: "rgba(0, 0, 0, 0.65)" },
                            { backgroundColor: "rgba(0, 0, 0, 0)" },
                        ],
                        {
                            duration: 180,
                            easing: "ease-in",
                            fill: "forwards",
                        },
                    ),
                    RunAnimation(
                        Panel,
                        [
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                transform: "translateY(0px) scale(1)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                offset: 0.18,
                                transform: "translateY(-3px) scale(1.015)",
                            },
                            {
                                filter: "blur(10px)",
                                opacity: 0,
                                transform: "translateY(18px) scale(0.84)",
                            },
                        ],
                        {
                            duration: 300,
                            easing: "cubic-bezier(0.4, 0, 1, 1)",
                            fill: "forwards",
                        },
                    ),
                ],
            );

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyClosedModalStyles(Modal, Overlay, Panel);
            IsOpen = false;
            IsAnimating = false;
            return true;
        };

        return {
            close: Close,
            canClose: () => !IsLocked,
            element: Modal,
            hideImmediately: HideImmediately,
            isOpen: () => IsOpen,
            open: Open,
            showImmediately: ShowImmediately,
        };
    };

    const GetModalController = (Target) =>
    {
        let Modal = null;

        if (typeof Target === "string")
        {
            Modal = document.querySelector(`[data-modal="${EscapeSelectorValue(Target)}"]`);
        }
        else if (Target instanceof Element)
        {
            Modal = Target.matches("[data-modal]") ? Target : Target.closest("[data-modal]");
        }

        if (!Modal)
        {
            return null;
        }

        if (!ModalControllers.has(Modal))
        {
            const Controller = BuildModalController(Modal);

            if (!Controller)
            {
                return null;
            }

            ModalControllers.set(Modal, Controller);
        }

        return ModalControllers.get(Modal) || null;
    };

    const PrepareScopeModals = (Scope) =>
    {
        Array.from(Scope?.querySelectorAll("[data-modal]") || []).forEach((Modal) =>
        {
            GetModalController(Modal);
        });
    };

    const SyncBodyDataset = (Snapshot) =>
    {
        const BodyDataset = Snapshot?.bodyDataset || {};

        SyncedBodyDatasetKeys.forEach((DatasetKey) =>
        {
            if (Object.prototype.hasOwnProperty.call(BodyDataset, DatasetKey))
            {
                document.body.dataset[DatasetKey] = BodyDataset[DatasetKey];
                return;
            }

            delete document.body.dataset[DatasetKey];
        });

        const SnapshotCursor = ParseNotificationCursor(document.body.dataset.notificationCursor);
        NotificationCursor = NotificationCursor === null
            ? SnapshotCursor
            : Math.max(NotificationCursor, SnapshotCursor);
        document.body.dataset.notificationCursor = String(NotificationCursor);
    };

    const SyncOverlayShell = (Snapshot) =>
    {
        const OverlayShell = GetAppOverlayShell();

        if (!OverlayShell || !Snapshot?.overlayShell)
        {
            return;
        }

        SyncElement(OverlayShell, Snapshot.overlayShell, "data-app-overlay-shell");
        PrepareScopeModals(OverlayShell);
    };

    const SyncAuthShell = (Snapshot, Options = {}) =>
    {
        const AuthShell = GetAppAuthShell();
        const {
            animate = false,
        } = Options;

        SyncAuthLockedState(Boolean(Snapshot?.authLocked));

        if (!AuthShell || !Snapshot?.authShell)
        {
            return;
        }

        SyncElement(AuthShell, Snapshot.authShell, "data-app-auth-shell");
        PrepareScopeModals(AuthShell);

        const AuthController = GetModalController("auth-sign-in");

        if (!AuthController)
        {
            return;
        }

        if (Snapshot.authLocked)
        {
            if (animate)
            {
                AuthController.open().catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            AuthController.showImmediately();
            return;
        }

        AuthController.hideImmediately({
            force: true,
        });
    };

    const InitializeAuthShell = () =>
    {
        PrepareScopeModals(GetAppAuthShell());

        if (!IsAuthLocked())
        {
            return;
        }

        const AuthController = GetModalController("auth-sign-in");

        if (!AuthController || AuthController.isOpen())
        {
            return;
        }

        AuthController.open().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const ResolveModalForCloseTrigger = (Trigger) =>
    {
        const ExplicitTarget = Trigger.dataset.closeModal || "";

        if (ExplicitTarget)
        {
            return document.querySelector(`[data-modal="${EscapeSelectorValue(ExplicitTarget)}"]`);
        }

        return Trigger.closest("[data-modal]");
    };

    const SyncElement = (Target, Source, PreservedAttribute) =>
    {
        Target.getAttributeNames().forEach((AttributeName) =>
        {
            if (AttributeName === PreservedAttribute)
            {
                return;
            }

            Target.removeAttribute(AttributeName);
        });

        Source.getAttributeNames().forEach((AttributeName) =>
        {
            if (AttributeName === PreservedAttribute)
            {
                return;
            }

            const AttributeValue = Source.getAttribute(AttributeName);

            if (AttributeValue === null)
            {
                return;
            }

            Target.setAttribute(AttributeName, AttributeValue);
        });

        Target.setAttribute(PreservedAttribute, "");
        Target.innerHTML = Source.innerHTML;
    };

    const LoadScript = async (ScriptNode) =>
    {
        const Source = ScriptNode.getAttribute("src");

        if (!Source)
        {
            return;
        }

        const ScriptUrl = new URL(Source, window.location.href).href;
        const ScriptType = ScriptNode.getAttribute("type");

        if (!ScriptPromises.has(ScriptUrl))
        {
            if (ScriptType === "module")
            {
                ScriptPromises.set(ScriptUrl, import(ScriptUrl));
            }
            else
            {
                ScriptPromises.set(
                    ScriptUrl,
                    new Promise((Resolve, Reject) =>
                    {
                        const ScriptTag = document.createElement("script");
                        ScriptTag.async = false;
                        ScriptTag.src = ScriptUrl;
                        ScriptTag.onload = () => Resolve(null);
                        ScriptTag.onerror = Reject;
                        document.body.appendChild(ScriptTag);
                    }),
                );
            }
        }

        await ScriptPromises.get(ScriptUrl);
    };

    const EnsurePageScripts = async (DocumentValue) =>
    {
        const PageScripts = Array.from(DocumentValue.querySelectorAll("[data-page-scripts] script[src]"));

        for (const ScriptNode of PageScripts)
        {
            await LoadScript(ScriptNode);
        }
    };

    const RememberCurrentPageScripts = () =>
    {
        const PageScripts = Array.from(document.querySelectorAll("[data-page-scripts] script[src]"));

        PageScripts.forEach((ScriptNode) =>
        {
            const Source = ScriptNode.getAttribute("src");

            if (!Source)
            {
                return;
            }

            const ScriptUrl = new URL(Source, window.location.href).href;

            if (!ScriptPromises.has(ScriptUrl))
            {
                ScriptPromises.set(ScriptUrl, Promise.resolve(null));
            }
        });
    };

    const GetPageSnapshot = (DocumentValue) =>
    {
        const OverlayShell = DocumentValue.querySelector("[data-app-overlay-shell]");
        const AuthShell = DocumentValue.querySelector("[data-app-auth-shell]");
        const Header = DocumentValue.querySelector("[data-app-header]");
        const Main = DocumentValue.querySelector("[data-app-main]");

        if (!OverlayShell || !AuthShell || !Header || !Main)
        {
            return null;
        }

        return {
            authLocked: IsAuthLocked(DocumentValue),
            authShell: AuthShell,
            bodyDataset: { ...DocumentValue.body.dataset },
            header: Header,
            main: Main,
            overlayShell: OverlayShell,
            title: DocumentValue.title,
        };
    };

    const FetchPageDocument = async (UrlValue, RequestInit = {}) =>
    {
        const RequestHeaders = new Headers(RequestInit.headers || {});
        RequestHeaders.set("Accept", "text/html,application/xhtml+xml");
        RequestHeaders.set("X-Requested-With", "fetch");

        const Response = await fetch(UrlValue, {
            ...RequestInit,
            headers: RequestHeaders,
            redirect: "follow",
        });

        const ContentType = Response.headers.get("content-type") || "";

        if (!ContentType.includes("text/html"))
        {
            throw new Error(`Expected HTML but received ${ContentType || "unknown content"}.`);
        }

        const Html = await Response.text();
        const DocumentValue = new DOMParser().parseFromString(Html, "text/html");
        const Snapshot = GetPageSnapshot(DocumentValue);

        if (!Snapshot)
        {
            throw new Error("The response did not contain the app shell.");
        }

        return {
            document: DocumentValue,
            snapshot: Snapshot,
            url: Response.url || UrlValue,
        };
    };

    const CommitHistory = (HistoryMode, UrlValue) =>
    {
        const CurrentUrl = new URL(window.location.href);
        const NextUrl = new URL(UrlValue, window.location.href);
        const IsSameLocation =
            CurrentUrl.pathname === NextUrl.pathname &&
            CurrentUrl.search === NextUrl.search &&
            CurrentUrl.hash === NextUrl.hash;

        if (HistoryMode === "replace")
        {
            window.history.replaceState({ url: NextUrl.href }, "", NextUrl.href);
            return;
        }

        if (HistoryMode === "push" && !IsSameLocation)
        {
            window.history.pushState({ url: NextUrl.href }, "", NextUrl.href);
        }
    };

    const NavigateTo = async (UrlValue, Options = {}) =>
    {
        if (IsNavigating)
        {
            return false;
        }

        const {
            historyMode = "push",
            requestInit = {},
            scrollToTop = true,
        } = Options;

        IsNavigating = true;
        document.body.dataset.routeBusy = "true";

        try
        {
            const WasAuthLocked = IsAuthLocked();
            const AppHeader = GetAppHeader();
            const AppOverlayShell = GetAppOverlayShell();
            const AppAuthShell = GetAppAuthShell();
            const AppMain = GetAppMain();

            if (!AppOverlayShell || !AppAuthShell || !AppHeader || !AppMain)
            {
                throw new Error("The current app shell is missing required nodes.");
            }

            const { document: NextDocument, snapshot, url: FinalUrl } = await FetchPageDocument(UrlValue, requestInit);
            await EnsurePageScripts(NextDocument);
            await AnimateCardsOut(AppMain);
            DestroyCurrentPage();
            SyncElement(AppHeader, snapshot.header, "data-app-header");
            SyncElement(AppMain, snapshot.main, "data-app-main");
            PrepareScopeModals(AppMain);
            SyncOverlayShell(snapshot);
            SyncAuthShell(snapshot, {
                animate: snapshot.authLocked && !WasAuthLocked,
            });
            SyncBodyDataset(snapshot);
            document.title = snapshot.title;
            CommitHistory(historyMode, FinalUrl);

            if (scrollToTop)
            {
                window.scrollTo({
                    left: 0,
                    top: 0,
                });
            }

            SyncSoundControls();
            InitializeCurrentPage();
            window.requestAnimationFrame(() =>
            {
                AnimateCardsIn(AppMain);
                StartNotificationPolling();
            });

            return true;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            window.location.href = String(UrlValue);
            return false;
        }
        finally
        {
            IsNavigating = false;
            delete document.body.dataset.routeBusy;
        }
    };

    const ShouldHandleUrl = (UrlValue) =>
    {
        if (UrlValue.origin !== window.location.origin)
        {
            return false;
        }

        if (UrlValue.pathname.startsWith("/auth/discord/"))
        {
            return false;
        }

        if (UrlValue.hash && UrlValue.pathname === window.location.pathname && UrlValue.search === window.location.search)
        {
            return false;
        }

        return true;
    };

    const HandleDocumentClick = (EventValue) =>
    {
        if (
            EventValue.defaultPrevented ||
            EventValue.button !== 0 ||
            EventValue.metaKey ||
            EventValue.ctrlKey ||
            EventValue.shiftKey ||
            EventValue.altKey
        )
        {
            return;
        }

        const Anchor = EventValue.target.closest("a[href]");

        if (!Anchor)
        {
            return;
        }

        if (
            Anchor.dataset.fullReload === "true" ||
            Anchor.hasAttribute("download") ||
            Anchor.getAttribute("rel")?.includes("external")
        )
        {
            return;
        }

        const Target = Anchor.getAttribute("target");

        if (Target && Target !== "_self")
        {
            return;
        }

        const UrlValue = new URL(Anchor.href, window.location.href);

        if (!ShouldHandleUrl(UrlValue))
        {
            return;
        }

        const CurrentUrl = new URL(window.location.href);
        const IsSameLocation =
            UrlValue.pathname === CurrentUrl.pathname &&
            UrlValue.search === CurrentUrl.search &&
            UrlValue.hash === CurrentUrl.hash;

        if (IsSameLocation)
        {
            return;
        }

        EventValue.preventDefault();
        NavigateTo(UrlValue.href);
    };

    const HandleModalTriggerClick = (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        const Target = EventValue.target instanceof Element ? EventValue.target : null;

        if (!Target)
        {
            return;
        }

        const CloseTrigger = Target.closest("[data-close-modal]");

        if (CloseTrigger)
        {
            const Controller = GetModalController(ResolveModalForCloseTrigger(CloseTrigger));

            if (!Controller)
            {
                return;
            }

            EventValue.preventDefault();
            Controller.close().catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
            return;
        }

        const OpenTrigger = Target.closest("[data-open-modal]");

        if (!OpenTrigger)
        {
            return;
        }

        const Controller = GetModalController(OpenTrigger.dataset.openModal || "");

        if (!Controller)
        {
            return;
        }

        EventValue.preventDefault();
        Controller.open().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const HandleSoundControlInput = (EventValue) =>
    {
        const InputNode = EventValue.target instanceof HTMLInputElement && EventValue.target.matches("[data-sound-volume-input]")
            ? EventValue.target
            : null;

        if (!InputNode)
        {
            return;
        }

        SetMasterSoundVolume((Number(InputNode.value) || 0) / 100, {
            persist: EventValue.type !== "input",
        });
    };

    const MarkCountdownAutoplayOnNextLoad = () =>
    {
        try
        {
            window.sessionStorage.setItem(CountdownAutoplayStorageKey, String(Date.now()));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }
    };

    const HandleDocumentSubmit = (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        const Form = EventValue.target instanceof HTMLFormElement ? EventValue.target : null;

        if (!Form || Form.dataset.fullReload === "true")
        {
            return;
        }

        if (Form.matches("[data-notification-join-form]"))
        {
            EventValue.preventDefault();

            const Controller = GetModalController("notification-session-join");
            const ActionUrl = Form.action || window.location.href;
            const FormDataValue = new FormData(Form);

            Promise.resolve(Controller?.close()).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            }).finally(() =>
            {
                NavigateTo(ActionUrl, {
                    historyMode: "push",
                    requestInit: {
                        body: FormDataValue,
                        method: "POST",
                    },
                });
            });
            return;
        }

        const Submitter = EventValue.submitter;
        const Method = (Submitter?.getAttribute("formmethod") || Form.method || "GET").toUpperCase();
        const Action = Submitter?.getAttribute("formaction") || Form.action || window.location.href;
        const UrlValue = new URL(Action, window.location.href);

        if (!ShouldHandleUrl(UrlValue) || !["GET", "POST"].includes(Method))
        {
            return;
        }

        EventValue.preventDefault();

        if (Method === "GET")
        {
            const Query = new URLSearchParams(new FormData(Form));
            UrlValue.search = Query.toString();
            NavigateTo(UrlValue.href);
            return;
        }

        if (Form.matches("[data-session-redo-form]"))
        {
            MarkCountdownAutoplayOnNextLoad();
        }

        NavigateTo(UrlValue.href, {
            historyMode: "push",
            requestInit: {
                body: new FormData(Form),
                method: Method,
            },
        });
    };

    const HandlePopState = () =>
    {
        if (IsNavigating)
        {
            return;
        }

        NavigateTo(window.location.href, {
            historyMode: "none",
        });
    };

    const HandleDocumentKeyDown = (EventValue) =>
    {
        if (EventValue.defaultPrevented || EventValue.key !== "Escape")
        {
            return;
        }

        const OpenControllers = Array.from(document.querySelectorAll("[data-modal]"))
            .map((Modal) => GetModalController(Modal))
            .filter((Controller) => Controller?.isOpen() && Controller?.canClose());
        const Controller = OpenControllers.at(-1);

        if (!Controller)
        {
            return;
        }

        EventValue.preventDefault();
        Controller.close().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const HandleVisibilityChange = () =>
    {
        if (document.visibilityState !== "visible")
        {
            return;
        }

        StartNotificationPolling();
    };

    const CloseProfileMenus = () =>
    {
        document.querySelectorAll("[data-profile-menu]").forEach((Menu) =>
        {
            delete Menu.dataset.profileMenuOpen;
        });
    };

    const OpenProfileMenu = (Menu) =>
    {
        if (!Menu)
        {
            return;
        }

        document.querySelectorAll("[data-profile-menu]").forEach((OtherMenu) =>
        {
            if (OtherMenu !== Menu)
            {
                delete OtherMenu.dataset.profileMenuOpen;
            }
        });
        Menu.dataset.profileMenuOpen = "true";
    };

    const HandleProfileMenuPointerOver = (EventValue) =>
    {
        const Target = EventValue.target instanceof Element ? EventValue.target : null;
        const Menu = Target?.closest("[data-profile-menu]");

        if (!Menu)
        {
            return;
        }

        OpenProfileMenu(Menu);
    };

    const HandleProfileMenuFocusIn = (EventValue) =>
    {
        const Target = EventValue.target instanceof Element ? EventValue.target : null;
        const Menu = Target?.closest("[data-profile-menu]");

        if (Menu)
        {
            OpenProfileMenu(Menu);
        }
    };

    const HandleProfileMenuDocumentClick = (EventValue) =>
    {
        const Target = EventValue.target instanceof Element ? EventValue.target : null;
        const Trigger = Target?.closest("[data-profile-menu-trigger]");

        if (Trigger)
        {
            const Menu = Trigger.closest("[data-profile-menu]");

            if (Menu)
            {
                EventValue.preventDefault();
                EventValue.stopPropagation();
                OpenProfileMenu(Menu);
            }

            return;
        }

        if (Target?.closest("[data-profile-menu]"))
        {
            return;
        }

        CloseProfileMenus();
    };

    MasterSoundVolume = ReadStoredMasterSoundVolume();
    RegisterBuiltInSounds();

    window.GamblingApp = {
        ...ExistingApp,
        ActiveSoundClones,
        MasterSoundVolume,
        ModalControllers,
        SoundCatalog,
        SoundLastStartedAt,
        SoundPlayers,
        buildUserProfileCardMarkup: BuildUserProfileCardMarkup,
        formatRelativeTime: FormatRelativeTime,
        getSoundDuration: GetSoundDuration,
        getMasterSoundVolume: GetMasterSoundVolume,
        hasSound: HasSound,
        holdGlobalBalanceDisplay: HoldGlobalBalanceDisplay,
        getModalController: GetModalController,
        IsSoundUnlocked,
        PageInitializers,
        playSound: PlaySound,
        registerSound: RegisterSound,
        releaseGlobalBalanceDisplay: ReleaseGlobalBalanceDisplay,
        ScriptPromises,
        initializeCurrentPage: InitializeCurrentPage,
        navigateTo: NavigateTo,
        registerPageInitializer: RegisterPageInitializer,
        setMasterSoundVolume: SetMasterSoundVolume,
        setGlobalBalanceDisplay: SetGlobalBalanceDisplay,
        setRewardMenuBadge: SetRewardMenuBadge,
        showToast: ShowToast,
        stopSound: StopSound,
    };

    document.addEventListener("click", HandleModalTriggerClick);
    document.addEventListener("click", HandleDocumentClick);
    document.addEventListener("click", HandleProfileMenuDocumentClick);
    document.addEventListener("focusin", HandleProfileMenuFocusIn);
    document.addEventListener("input", HandleSoundControlInput);
    document.addEventListener("change", HandleSoundControlInput);
    document.addEventListener("keydown", HandleDocumentKeyDown);
    document.addEventListener("pointerover", HandleProfileMenuPointerOver);
    document.addEventListener("submit", HandleDocumentSubmit);
    document.addEventListener("visibilitychange", HandleVisibilityChange);
    window.addEventListener("popstate", HandlePopState);

    document.addEventListener("DOMContentLoaded", () =>
    {
        window.history.replaceState({ url: window.location.href }, "", window.location.href);
        window.sessionStorage.removeItem(PendingToastStorageKey);
        RememberCurrentPageScripts();
        PrepareScopeModals(GetAppMain());
        PrepareScopeModals(GetAppOverlayShell());
        InitializeAuthShell();
        SyncSoundControls();
        InitializeCurrentPage();
        AnimateCardsIn(GetAppMain());
        StartNotificationPolling();
    });
})();
