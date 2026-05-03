(() =>
{
const CountdownAutoplayStorageKey = "gambling.countdownAutoplayOnLoad";
const FirstToPlaybackStorageKeyPrefix = "gambling.dice-session-playback:";
const PendingToastStorageKey = "gambling.pendingToast";
const RevealCompletionStorageKeyPrefix = "gambling.dice-reveal-complete:";

const BuildRevealCompletionStorageKey = (SessionId) =>
{
    return `${RevealCompletionStorageKeyPrefix}${SessionId || ""}`;
};

const BuildRevealCompletionSignature = (State) =>
{
    return JSON.stringify({
        creatorScore: Number.parseInt(State?.creator_score ?? "0", 10) || 0,
        id: State?.id || "",
        isDoubleRoll: Boolean(State?.is_double_roll),
        isFirstTo: Boolean(State?.is_first_to),
        opponentScore: Number.parseInt(State?.opponent_score ?? "0", 10) || 0,
        resultFace: State?.result_face || "",
        roundsLength: Array.isArray(State?.rounds) ? State.rounds.length : 0,
        winnerId: State?.winner_id || "",
    });
};

const PersistRevealCompletion = (State) =>
{
    if (State?.status !== "resolved" || !State?.id || !State?.winner_id)
    {
        return;
    }

    try
    {
        window.sessionStorage.setItem(
            BuildRevealCompletionStorageKey(State.id),
            BuildRevealCompletionSignature(State),
        );
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const HasRevealCompletion = (State) =>
{
    if (State?.status !== "resolved" || !State?.id || !State?.winner_id)
    {
        return false;
    }

    try
    {
        return window.sessionStorage.getItem(BuildRevealCompletionStorageKey(State.id))
            === BuildRevealCompletionSignature(State);
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return false;
    }
};

const ClearRevealCompletion = (SessionId) =>
{
    if (!SessionId)
    {
        return;
    }

    try
    {
        window.sessionStorage.removeItem(BuildRevealCompletionStorageKey(SessionId));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ParseSessionState = (Main) =>
{
    const StateNode = Main.querySelector("[data-dice-state]");

    if (!StateNode)
    {
        return null;
    }

    try
    {
        return JSON.parse(StateNode.textContent);
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return null;
    }
};

const GetDiceViewerContainer = (Main) =>
{
    return Main.querySelector("[data-dice-viewer]");
};

const GetDiceViewerController = (Main) =>
{
    return GetDiceViewerContainer(Main)?.DiceController || null;
};

const SetOpponentVisuals = (Main, State) =>
{
    const OpponentName = Main.querySelector("[data-opponent-name]");
    const OpponentSubtitle = Main.querySelector("[data-opponent-subtitle]");
    const OpponentAvatar = Main.querySelector("[data-opponent-avatar]");
    const OpponentFallback = Main.querySelector("[data-opponent-fallback]");
    const CallBotWrap = Main.querySelector("[data-call-bot-wrap]");
    const JoinWrap = Main.querySelector("[data-join-wrap]");
    const JoinForm = Main.querySelector("[data-session-join-form]");

    if (
        !OpponentName ||
        !OpponentSubtitle ||
        !OpponentAvatar ||
        !OpponentFallback ||
        !CallBotWrap ||
        !JoinWrap ||
        !JoinForm
    )
    {
        return;
    }

    if (State.opponent)
    {
        OpponentName.textContent = State.opponent.display_name;
        OpponentSubtitle.textContent =
            State.opponent.id === "bot-house" ? "Auto joined" : "Joined session";

        if (State.opponent.avatar_url)
        {
            OpponentAvatar.dataset.fallbackSrc =
                State.opponent.avatar_static_url || State.opponent.avatar_url;
            OpponentAvatar.src = State.opponent.avatar_url;
            OpponentAvatar.classList.remove("hidden");
            OpponentFallback.classList.remove("flex");
            OpponentFallback.classList.add("hidden");
        }
        else
        {
            delete OpponentAvatar.dataset.fallbackSrc;
            OpponentFallback.textContent = State.opponent.display_name.charAt(0).toUpperCase();
            OpponentFallback.classList.add("flex");
            OpponentFallback.classList.remove("hidden");
            OpponentAvatar.classList.add("hidden");
        }
    }
    else
    {
        delete OpponentAvatar.dataset.fallbackSrc;
        OpponentName.textContent = "Waiting for player...";
        OpponentSubtitle.textContent = "Open slot";
        OpponentFallback.textContent = "?";
        OpponentFallback.classList.add("flex");
        OpponentFallback.classList.remove("hidden");
        OpponentAvatar.classList.add("hidden");
    }

    if (State.join_url)
    {
        JoinForm.action = State.join_url;
    }

    CallBotWrap.hidden = !State.can_call_bot;
    JoinWrap.hidden = !State.can_join;
};

const FormatDoubleRollResult = (FacesValue, TotalValue) =>
{
    const Faces = Array.isArray(FacesValue) ? FacesValue : [];
    const FirstFace = Number.parseInt(Faces[0], 10);
    const SecondFace = Number.parseInt(Faces[1], 10);

    if (!Number.isFinite(FirstFace) || !Number.isFinite(SecondFace))
    {
        return "Awaiting roll";
    }

    const TotalNumber = Number.parseInt(TotalValue, 10);
    const DisplayTotal = Number.isFinite(TotalNumber) ? TotalNumber : (FirstFace + SecondFace);
    return String(DisplayTotal);
};

const SetPanelResultVisuals = (Main, State, OptionsValue = {}) =>
{
    const {
        revealResolved = false,
    } = OptionsValue;
    const CreatorPanel = Main.querySelector('[data-dice-panel="creator"]');
    const OpponentPanel = Main.querySelector('[data-dice-panel="opponent"]');

    if (CreatorPanel)
    {
        CreatorPanel.dataset.resultState = "neutral";
    }

    if (OpponentPanel)
    {
        OpponentPanel.dataset.resultState = "neutral";
    }

    if (!revealResolved || State.status !== "resolved" || !State.winner_id)
    {
        return;
    }

    if (CreatorPanel)
    {
        CreatorPanel.dataset.resultState = State.winner_id === State.creator.id ? "win" : "loss";
    }

    if (OpponentPanel)
    {
        if (State.opponent?.id)
        {
            OpponentPanel.dataset.resultState = State.winner_id === State.opponent.id ? "win" : "loss";
        }
        else
        {
            OpponentPanel.dataset.resultState = "neutral";
        }
    }
};

const SetSceneIndicatorVisuals = (Main, State) =>
{
    const CreatorLabel = Main.querySelector('[data-dice-indicator-label="creator"]');
    const OpponentLabel = Main.querySelector('[data-dice-indicator-label="opponent"]');

    if (CreatorLabel)
    {
        CreatorLabel.textContent = State.is_creator ? "You" : State.creator.display_name;
    }

    if (OpponentLabel)
    {
        OpponentLabel.textContent = State.opponent ? State.opponent.display_name : "Opponent";
    }
};

const SetSceneIndicatorVisibility = (Main, VisibleValue) =>
{
    const Indicators = Main.querySelector("[data-dice-indicators]");

    if (!Indicators)
    {
        return;
    }

    Indicators.hidden = !VisibleValue;
};

const RenderViewerState = (Main, State) =>
{
    const CountNode = Main.querySelector("[data-session-viewer-count]");
    const ButtonNode = Main.querySelector("[data-session-viewers-button]");
    const ListNode = Main.querySelector("[data-session-viewers-list]");
    const ViewerCount = Math.max(Number.parseInt(State?.viewer_count || "0", 10), 0);

    if (CountNode)
    {
        CountNode.textContent = String(ViewerCount);
    }

    if (ButtonNode)
    {
        ButtonNode.setAttribute("aria-label", `${ViewerCount} viewer${ViewerCount === 1 ? "" : "s"} watching`);
    }

    if (ListNode)
    {
        ListNode.innerHTML = BuildViewerListMarkup(State?.viewers);
    }
};

const RenderFairnessState = (Main, State) =>
{
    const SeedHashNode = Main.querySelector("[data-fairness-seed-hash]");
    const NonceNode = Main.querySelector("[data-fairness-nonce]");
    const SeedRow = Main.querySelector("[data-fairness-seed-row]");
    const SeedNode = Main.querySelector("[data-fairness-seed]");
    const PendingNode = Main.querySelector("[data-fairness-pending]");
    const Fairness = State?.fairness || {};

    if (SeedHashNode && Fairness.server_seed_hash)
    {
        SeedHashNode.textContent = Fairness.server_seed_hash;
    }

    if (NonceNode && Fairness.nonce !== undefined)
    {
        NonceNode.textContent = Fairness.nonce;
    }

    if (SeedNode)
    {
        SeedNode.textContent = Fairness.server_seed || "";
    }

    SeedRow?.classList.toggle("hidden", !Fairness.server_seed);
    PendingNode?.classList.toggle("hidden", Boolean(Fairness.server_seed));
};

const TextTransition = {
    enterMs: 220,
    exitMs: 110,
    offsetPx: 12,
};

const TransitionTextNode = (Node, NextValue) =>
{
    if (!Node || typeof NextValue !== "string")
    {
        return Promise.resolve();
    }

    const NextText = NextValue.trim();

    if (Node.textContent.trim() === NextText)
    {
        return Promise.resolve();
    }

    if (typeof Node.animate !== "function")
    {
        Node.textContent = NextText;
        return Promise.resolve();
    }

    Node._narrativeTransitionToken = `${Date.now()}-${Math.random()}`;
    const TransitionToken = Node._narrativeTransitionToken;
    Node._narrativeAnimation?.cancel?.();

    const ExitAnimation = Node.animate(
        [
            {
                opacity: 1,
                filter: "blur(0px)",
                transform: "translateY(0px)",
            },
            {
                opacity: 0,
                filter: "blur(4px)",
                transform: `translateY(-${TextTransition.offsetPx}px)`,
            },
        ],
        {
            duration: TextTransition.exitMs,
            easing: "cubic-bezier(0.4, 0, 1, 1)",
            fill: "both",
        },
    );
    Node._narrativeAnimation = ExitAnimation;

    return ExitAnimation.finished
        .catch(() =>
        {
            return null;
        })
        .then(() =>
        {
            if (Node._narrativeTransitionToken !== TransitionToken)
            {
                return null;
            }

            Node.textContent = NextText;

            const EnterAnimation = Node.animate(
                [
                    {
                        opacity: 0,
                        filter: "blur(4px)",
                        transform: `translateY(${TextTransition.offsetPx}px)`,
                    },
                    {
                        opacity: 1,
                        filter: "blur(0px)",
                        transform: "translateY(0px)",
                    },
                ],
                {
                    duration: TextTransition.enterMs,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "both",
                },
            );
            Node._narrativeAnimation = EnterAnimation;

            return EnterAnimation.finished.catch(() =>
            {
                return null;
            });
        })
        .finally(() =>
        {
            if (Node._narrativeTransitionToken === TransitionToken)
            {
                delete Node._narrativeTransitionToken;
                Node._narrativeAnimation = null;
            }
        });
};

const SetScoreVisuals = (Main, State) =>
{
    const ScoreWraps = Main.querySelectorAll("[data-first-to-score-wrap]");
    const CreatorScore = Main.querySelector("[data-creator-score]");
    const CreatorScoreLabel = Main.querySelector("[data-creator-score-label]");
    const OpponentScore = Main.querySelector("[data-opponent-score]");
    const OpponentScoreLabel = Main.querySelector("[data-opponent-score-label]");
    const ShowScores = State.is_first_to;
    const ScoreLabel = "Round wins";

    ScoreWraps.forEach((Wrap) =>
    {
        Wrap.hidden = !ShowScores;
    });

    if (CreatorScore)
    {
        TransitionTextNode(CreatorScore, String(State.creator_score ?? 0));
    }

    if (CreatorScoreLabel)
    {
        CreatorScoreLabel.textContent = ScoreLabel;
    }

    if (OpponentScore)
    {
        TransitionTextNode(OpponentScore, String(State.opponent_score ?? 0));
    }

    if (OpponentScoreLabel)
    {
        OpponentScoreLabel.textContent = ScoreLabel;
    }
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

const BuildViewerAvatarMarkup = (Viewer) =>
{
    const ViewerName = Viewer?.display_name || Viewer?.username || "?";

    if (Viewer?.avatar_url)
    {
        return `
            <span data-session-viewer-avatar>
              <img
                alt="${EscapeHtml(ViewerName)}"
                src="${EscapeHtml(Viewer.avatar_static_url || Viewer.avatar_url)}"
              >
            </span>
        `;
    }

    return `<span data-session-viewer-avatar>${EscapeHtml(ViewerName.slice(0, 1))}</span>`;
};

const BuildViewerListMarkup = (Viewers) =>
{
    if (!Array.isArray(Viewers) || !Viewers.length)
    {
        return `<div data-session-viewers-empty>No viewers</div>`;
    }

    return Viewers.map((Viewer) =>
    {
        const ViewerName = Viewer?.display_name || Viewer?.username || "?";

        return `
            <div data-session-viewer-row>
              ${BuildViewerAvatarMarkup(Viewer)}
              <div data-session-viewer-name>${EscapeHtml(ViewerName)}</div>
            </div>
        `;
    }).join("");
};

const SetDoubleRollResultVisuals = (Main, State, ResultsValue = {}) =>
{
    const CreatorWrap = Main.querySelector('[data-double-roll-result-wrap="creator"]');
    const CreatorResult = Main.querySelector('[data-double-roll-result="creator"]');
    const OpponentWrap = Main.querySelector('[data-double-roll-result-wrap="opponent"]');
    const OpponentResult = Main.querySelector('[data-double-roll-result="opponent"]');
    const ShowResults = State.is_first_to && State.is_double_roll;
    const FinalRound = ShowResults ? GetFinalFirstToRound(State) : null;
    const CreatorText = ResultsValue.creatorText ?? (
        FinalRound
            ? FormatDoubleRollResult(FinalRound.creator_faces, FinalRound.creator_total)
            : "Awaiting roll"
    );
    const OpponentText = ResultsValue.opponentText ?? (
        FinalRound
            ? FormatDoubleRollResult(FinalRound.opponent_faces, FinalRound.opponent_total)
            : "Awaiting roll"
    );

    if (CreatorWrap)
    {
        CreatorWrap.hidden = !ShowResults;
    }

    if (OpponentWrap)
    {
        OpponentWrap.hidden = !ShowResults;
    }

    if (!ShowResults)
    {
        return;
    }

    if (CreatorResult)
    {
        TransitionTextNode(CreatorResult, CreatorText);
    }

    if (OpponentResult)
    {
        TransitionTextNode(OpponentResult, OpponentText);
    }
};

const SetSessionNarrative = (Main, Narrative) =>
{
    const TitleNode = Main.querySelector("[data-session-status]");
    const Updates = [];

    if (TitleNode && typeof Narrative.title === "string")
    {
        Updates.push(TransitionTextNode(TitleNode, Narrative.title));
    }

    return Promise.all(Updates);
};

const BuildSessionNarrative = (State) =>
{
    if (State.status === "resolved")
    {
        return {
            title: State.status_text,
        };
    }

    if (State.status === "countdown")
    {
        return {
            title: State.status_text,
        };
    }

    return {
        title: State.status_text,
    };
};

const GetWinSoundSignature = (State) =>
{
    if (!State || State.status !== "resolved" || State.did_win !== true)
    {
        return "";
    }

    return JSON.stringify({
        creatorScore: State.creator_score ?? "",
        id: State.id || "",
        opponentScore: State.opponent_score ?? "",
        resultFace: State.result_face ?? "",
        rounds: Array.isArray(State.rounds) ? State.rounds.length : 0,
        winnerId: State.winner_id || "",
    });
};

const GetCountdownSoundSignature = (State) =>
{
    if (!State || State.status !== "countdown" || !Number.isFinite(Number(State.countdown_ends_at)))
    {
        return "";
    }

    return `${State.id || ""}:${Number(State.countdown_ends_at)}`;
};

const ShouldAutoplayCountdownFromState = (State) =>
{
    if (!State || State.status !== "countdown")
    {
        return false;
    }

    const RemainingSeconds = Number.parseInt(State.countdown_remaining, 10);
    return Number.isFinite(RemainingSeconds) && RemainingSeconds >= 4;
};

const ConsumeCountdownAutoplayRequest = () =>
{
    try
    {
        const StoredValue = window.sessionStorage.getItem(CountdownAutoplayStorageKey);

        if (!StoredValue)
        {
            return false;
        }

        window.sessionStorage.removeItem(CountdownAutoplayStorageKey);
        return true;
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return false;
    }
};

const BuildFirstToPlaybackStorageKey = (SessionId) =>
{
    return `${FirstToPlaybackStorageKeyPrefix}${SessionId || ""}`;
};

const BuildFirstToPlaybackSignature = (State) =>
{
    const Rounds = Array.isArray(State?.rounds) ? State.rounds : [];

    return JSON.stringify({
        creatorScore: Number.parseInt(State?.creator_score ?? "0", 10) || 0,
        id: State?.id || "",
        isDoubleRoll: Boolean(State?.is_double_roll),
        opponentScore: Number.parseInt(State?.opponent_score ?? "0", 10) || 0,
        roundsLength: Rounds.length,
        winnerId: State?.winner_id || "",
    });
};

const PersistFirstToPlaybackProgress = (State, Progress) =>
{
    if (!State?.id || !State?.is_first_to)
    {
        return;
    }

    try
    {
        window.sessionStorage.setItem(BuildFirstToPlaybackStorageKey(State.id), JSON.stringify({
            phase: String(Progress?.phase || ""),
            phaseStartedAt: Date.now(),
            roundIndex: Math.max(Number.parseInt(Progress?.roundIndex ?? "0", 10) || 0, 0),
            signature: BuildFirstToPlaybackSignature(State),
        }));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ReadFirstToPlaybackProgress = (State) =>
{
    if (!State?.id || !State?.is_first_to)
    {
        return null;
    }

    try
    {
        const RawValue = window.sessionStorage.getItem(BuildFirstToPlaybackStorageKey(State.id));

        if (!RawValue)
        {
            return null;
        }

        const ParsedValue = JSON.parse(RawValue);

        if (ParsedValue?.signature !== BuildFirstToPlaybackSignature(State) || !ParsedValue?.phase)
        {
            return null;
        }

        return {
            phase: String(ParsedValue.phase),
            phaseStartedAt: Number.isFinite(Number(ParsedValue.phaseStartedAt))
                ? Number(ParsedValue.phaseStartedAt)
                : Date.now(),
            roundIndex: Math.max(Number.parseInt(ParsedValue.roundIndex ?? "0", 10) || 0, 0),
        };
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return null;
    }
};

const ClearFirstToPlaybackProgress = (SessionId) =>
{
    if (!SessionId)
    {
        return;
    }

    try
    {
        window.sessionStorage.removeItem(BuildFirstToPlaybackStorageKey(SessionId));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const GetPlaybackPhaseElapsedMs = (Progress) =>
{
    const PhaseStartedAt = Number(Progress?.phaseStartedAt);

    if (!Number.isFinite(PhaseStartedAt))
    {
        return 0;
    }

    return Math.max(0, Date.now() - PhaseStartedAt);
};

const GetRemainingPlaybackDelayMs = (Progress, TotalMs) =>
{
    return Math.max(0, TotalMs - GetPlaybackPhaseElapsedMs(Progress));
};

const WaitFor = (DelayMs) =>
{
    return new Promise((Resolve) =>
    {
        window.setTimeout(Resolve, DelayMs);
    });
};

const PersistPendingToast = (RedirectUrl, ToastValue) =>
{
    if (!RedirectUrl || !ToastValue)
    {
        return;
    }

    try
    {
        const TargetUrl = new URL(RedirectUrl, window.location.href);
        window.sessionStorage.setItem(PendingToastStorageKey, JSON.stringify({
            ...ToastValue,
            match: {
                pathname: TargetUrl.pathname,
            },
        }));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const RedirectCanceledSession = async (State) =>
{
    if (!State?.redirect_url)
    {
        return;
    }

    const ToastValue = State.toast || {
        message: State?.status_text || "Session has been canceled by an admin.",
        title: "Session canceled",
        tone: "info",
    };

    PersistPendingToast(State.redirect_url, ToastValue);
    window.GamblingApp?.showToast?.(ToastValue);
    await WaitFor(160);

    if (window.GamblingApp?.navigateTo)
    {
        await window.GamblingApp.navigateTo(State.redirect_url);
        return;
    }

    window.location.href = State.redirect_url;
};

const FirstToPlaybackDelays = {
    betweenPlayersMs: 520,
    betweenRoundsMs: 760,
    finalRoundMs: 1380,
    introMs: 220,
    scoreRevealMs: 260,
    tieRoundMs: 1220,
};
const DoublePlaybackDelays = {
    betweenPlayersMs: 560,
    betweenRoundsMs: 760,
    introMs: 220,
    resultHoldMs: 1380,
    scoreRevealMs: 280,
    tieRoundMs: 1220,
};

const GetFinalFirstToRound = (State) =>
{
    const Rounds = Array.isArray(State?.rounds) ? State.rounds : [];
    return Rounds.length ? Rounds[Rounds.length - 1] : null;
};

const SetBalance = (State) =>
{
    const BalanceValue = document.querySelector("[data-balance-display]");

    if (!BalanceValue)
    {
        return;
    }

    BalanceValue.textContent = State.current_balance_display;
};

const BuildLiveStatsSignature = (State) =>
{
    if (!State?.id || State?.status !== "resolved" || typeof State.did_win !== "boolean")
    {
        return "";
    }

    return JSON.stringify({
        betCents: State.bet_cents || 0,
        creatorScore: State.creator_score ?? 0,
        game: "dice",
        id: State.id,
        opponentScore: State.opponent_score ?? 0,
        resultFace: State.result_face || "",
        rounds: Array.isArray(State.rounds) ? State.rounds.length : 0,
        winnerId: State.winner_id || "",
    });
};

const RecordLiveStatsResult = (State, RecordedSignatures) =>
{
    const Signature = BuildLiveStatsSignature(State);

    if (!Signature || RecordedSignatures.has(Signature))
    {
        return;
    }

    const BetCents = Math.max(Math.round(Number(State.bet_cents) || 0), 0);

    if (BetCents <= 0)
    {
        return;
    }

    RecordedSignatures.add(Signature);
    window.ShufflingLiveStats?.recordResult?.({
        game: "dice",
        profitCents: State.did_win ? BetCents : -BetCents,
        signature: Signature,
        wageredCents: BetCents,
    });
};

const HoldGlobalBalanceDisplay = (Context) =>
{
    if (Context.isHoldingBalanceDisplay)
    {
        return;
    }

    window.GamblingApp?.holdGlobalBalanceDisplay?.();
    Context.isHoldingBalanceDisplay = true;
};

const ReleaseGlobalBalanceDisplay = (Context) =>
{
    if (!Context.isHoldingBalanceDisplay)
    {
        return;
    }

    window.GamblingApp?.releaseGlobalBalanceDisplay?.();
    Context.isHoldingBalanceDisplay = false;
};

const RevealSessionReturnLink = (Main, Animate = true) =>
{
    const ReturnWrap = Main.querySelector("[data-session-return-wrap]");
    const ReturnLink = Main.querySelector("[data-session-return-link]");

    if (!ReturnWrap || !ReturnLink)
    {
        return;
    }

    ReturnWrap.classList.remove("hidden");
    ReturnWrap.classList.add("flex");

    if (ReturnWrap.dataset.revealed === "true")
    {
        ReturnLink.classList.remove("opacity-0", "scale-[0.92]", "pointer-events-none");
        return;
    }

    ReturnWrap.dataset.revealed = "true";

    if (!Animate || typeof ReturnLink.animate !== "function")
    {
        ReturnLink.classList.remove("opacity-0", "scale-[0.92]", "pointer-events-none");
        return;
    }

    window.requestAnimationFrame(() =>
    {
        ReturnLink.animate(
            [
                {
                    opacity: 0,
                    transform: "translateY(14px) scale(0.88)",
                },
                {
                    opacity: 1,
                    offset: 0.7,
                    transform: "translateY(-4px) scale(1.03)",
                },
                {
                    opacity: 1,
                    transform: "translateY(0px) scale(1)",
                },
            ],
            {
                duration: 520,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "both",
            },
        );

        ReturnLink.classList.remove("opacity-0", "scale-[0.92]", "pointer-events-none");
    });
};

const HideSessionReturnLink = async (ReturnLink) =>
{
    if (!ReturnLink)
    {
        return;
    }

    if (typeof ReturnLink.animate !== "function")
    {
        ReturnLink.classList.add("opacity-0", "scale-[0.92]", "pointer-events-none");
        return;
    }

    await ReturnLink.animate(
        [
            {
                opacity: 1,
                transform: "translateY(0px) scale(1)",
            },
            {
                opacity: 0,
                transform: "translateY(12px) scale(0.9)",
            },
        ],
        {
            duration: 220,
            easing: "cubic-bezier(0.4, 0, 1, 1)",
            fill: "both",
        },
    ).finished.catch(() =>
    {
        return null;
    });

    ReturnLink.classList.add("opacity-0", "scale-[0.92]", "pointer-events-none");
};

const SetShareVisibility = (Main, State, OptionsValue = {}) =>
{
    const {
        forceHidden = false,
    } = OptionsValue;
    const ShareButton = Main.querySelector("[data-share-chat-session]");

    if (!ShareButton)
    {
        return;
    }

    ShareButton.classList.toggle("hidden", forceHidden || !State?.can_share_chat);
    ShareButton.classList.toggle("inline-flex", !forceHidden && Boolean(State?.can_share_chat));
};

const SetRedoVisibility = (Main, State, OptionsValue = {}) =>
{
    const {
        forceHidden = false,
    } = OptionsValue;
    const RedoForm = Main.querySelector("[data-session-redo-form]");

    if (!RedoForm)
    {
        return;
    }

    if (State?.redo_url)
    {
        RedoForm.action = State.redo_url;
    }

    RedoForm.classList.toggle("hidden", forceHidden || !State?.can_redo);
    RedoForm.classList.toggle("flex", !forceHidden && Boolean(State?.can_redo));
};

const ApplyResolvedState = (Main, State) =>
{
    SetPanelResultVisuals(Main, State, {
        revealResolved: true,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
    RevealSessionReturnLink(Main);
    SetShareVisibility(Main, State);
    SetRedoVisibility(Main, State);
};

const RenderUnresolvedState = (Main, State, OptionsValue = {}) =>
{
    const {
        forceHideResolvedActions = false,
    } = OptionsValue;
    SetPanelResultVisuals(Main, State, {
        revealResolved: false,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
    SetShareVisibility(Main, State, {
        forceHidden: forceHideResolvedActions && State?.status === "resolved",
    });
    SetRedoVisibility(Main, State, {
        forceHidden: forceHideResolvedActions,
    });
};

const PollSessionState = async (StateUrl, OnState, OnCanceled) =>
{
    try
    {
        const Response = await fetch(StateUrl, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!Response.ok)
        {
            return null;
        }

        const State = await Response.json();

        if (State?.is_canceled)
        {
            if (typeof OnCanceled === "function")
            {
                await OnCanceled(State);
            }

            return State;
        }

        OnState(State);
        return State;
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return null;
    }
};

const InitializeDiceSessionPage = ({ main }) =>
{
    const SessionRoot = main.querySelector("[data-dice-session]");
    const DiceViewerContainer = GetDiceViewerContainer(main);
    const InitialState = ParseSessionState(main);

    if (!SessionRoot || !DiceViewerContainer || !InitialState)
    {
        return null;
    }

    const BuildUiState = (State) =>
    {
        if (!HasRevealCompletion(State))
        {
            return State;
        }

        return {
            ...State,
            can_redo: Boolean(State?.redo_url),
            can_share_chat: true,
            reveal_pending: false,
        };
    };

    const IsRevealPlaybackPending = (State) =>
    {
        return Boolean(State?.status === "resolved" && State?.reveal_pending && !HasRevealCompletion(State));
    };

    if (InitialState.status === "resolved" && !IsRevealPlaybackPending(InitialState))
    {
        RevealSessionReturnLink(main);
    }

    const StateUrl = SessionRoot.dataset.stateUrl;
    let LastState = InitialState;
    let PendingRevealState = null;
    let HasShownResult = InitialState.status === "resolved" && !IsRevealPlaybackPending(InitialState);
    let HasAppliedResolvedFace = false;
    const RecordedLiveStatsSignatures = new Set();

    if (InitialState.status === "resolved" && !IsRevealPlaybackPending(InitialState))
    {
        const InitialStatsSignature = BuildLiveStatsSignature(InitialState);

        if (InitialStatsSignature)
        {
            RecordedLiveStatsSignatures.add(InitialStatsSignature);
        }
    }
    let IsDisposed = false;
    let IsRedirectingForCancel = false;
    let IsHoldingBalanceDisplay = false;
    let IdleViewerSignature = "";
    let PollTimeout = 0;
    const HasRequestedCountdownAutoplay = ConsumeCountdownAutoplayRequest();
    const ShouldAutoplayInitialCountdown =
        InitialState.status === "countdown" &&
        (HasRequestedCountdownAutoplay || ShouldAutoplayCountdownFromState(InitialState));
    let PlayedCountdownSoundSignature = GetCountdownSoundSignature(InitialState);
    let PlayedWinSoundSignature = "";
    let ReadyInterval = 0;
    const ReturnLink = main.querySelector("[data-session-return-link]");
    const BalanceContext = {
        get isHoldingBalanceDisplay()
        {
            return IsHoldingBalanceDisplay;
        },
        set isHoldingBalanceDisplay(Value)
        {
            IsHoldingBalanceDisplay = Value;
        },
    };

    const HandleCanceledSession = async (State) =>
    {
        if (IsDisposed || IsRedirectingForCancel)
        {
            return;
        }

        IsRedirectingForCancel = true;
        ReleaseGlobalBalanceDisplay(BalanceContext);
        await RedirectCanceledSession(State);
    };

    const ResetIdleViewerSignature = () =>
    {
        IdleViewerSignature = "";
    };

    const ApplyIdleViewerState = (Signature, ApplyValue) =>
    {
        if (IdleViewerSignature === Signature)
        {
            return;
        }

        ApplyValue();
        IdleViewerSignature = Signature;
    };

    const MaybePlayWinSound = (State) =>
    {
        const Signature = GetWinSoundSignature(State);

        if (!Signature || Signature === PlayedWinSoundSignature)
        {
            return;
        }

        PlayedWinSoundSignature = Signature;
        window.GamblingApp?.playSound?.("win", {
            restart: true,
        });
    };

    const MaybePlayCountdownSound = (State) =>
    {
        const Signature = GetCountdownSoundSignature(State);

        if (!Signature)
        {
            PlayedCountdownSoundSignature = "";
            return;
        }

        if (Signature === PlayedCountdownSoundSignature)
        {
            return;
        }

        PlayedCountdownSoundSignature = Signature;
        window.GamblingApp?.playSound?.("countdown", {
            restart: true,
        });
    };

    const PlayFirstToSequence = async (State) =>
    {
        const DiceViewerController = GetDiceViewerController(main);
        const FinalRound = GetFinalFirstToRound(State);
        const ViewerPlayers = State.is_double_roll
            ? {
                left: true,
                right: true,
            }
            : {
                creator: true,
                opponent: true,
            };
        const IdleViewerFaces = State.is_double_roll
            ? {
                left: 1,
                right: 1,
            }
            : {
                creator: 1,
                opponent: 1,
            };
        const Rounds = Array.isArray(State.rounds) ? State.rounds : [];
        const PhaseOrder = ["creator_roll", "between_players", "opponent_roll", "round_result", "between_rounds"];
        const ResumeProgress = ReadFirstToPlaybackProgress(State);
        const ResumePhase = ResumeProgress?.phase || "";
        const ResumeRoundIndex = ResumeProgress
            ? Math.min(ResumeProgress.roundIndex, Math.max(Rounds.length - 1, 0))
            : 0;

        const IsActive = () =>
        {
            return !IsDisposed && PendingRevealState === State;
        };

        const BeginPlaybackPhase = (Phase, RoundIndex) =>
        {
            const Progress = {
                phase: Phase,
                phaseStartedAt: Date.now(),
                roundIndex: RoundIndex,
            };

            PersistFirstToPlaybackProgress(State, Progress);
            return Progress;
        };

        const GetPreviousScore = (RoundIndex) =>
        {
            if (RoundIndex > 0)
            {
                return {
                    creator_score: Rounds[RoundIndex - 1].creator_score,
                    opponent_score: Rounds[RoundIndex - 1].opponent_score,
                };
            }

            return {
                creator_score: 0,
                opponent_score: 0,
            };
        };

        const ApplyBaseScene = () =>
        {
            DiceViewerController.setPlayersVisible(ViewerPlayers);
            SetSceneIndicatorVisibility(main, !State.is_double_roll);
        };

        const SetIntroState = () =>
        {
            ApplyBaseScene();
            DiceViewerController.setFaces(IdleViewerFaces, {
                position: "top",
            });
            SetScoreVisuals(main, {
                ...State,
                creator_score: 0,
                opponent_score: 0,
            });
            SetDoubleRollResultVisuals(main, State, {
                creatorText: "Awaiting roll",
                opponentText: "Awaiting roll",
            });
            SetSessionNarrative(main, {
                detail: State.is_double_roll
                    ? `FT${State.target_wins}. ${State.creator.display_name} and ${State.opponent.display_name} roll two dice each round.`
                    : `FT${State.target_wins}. ${State.creator.display_name} opens the match and ${State.opponent.display_name} answers second.`,
                title: `${State.creator.display_name} rolls first.`,
            });
        };

        const SetCreatorRollState = (RoundIndex) =>
        {
            const PreviousScore = GetPreviousScore(RoundIndex);

            ApplyBaseScene();
            DiceViewerController.setFaces(IdleViewerFaces, {
                position: "top",
            });
            SetScoreVisuals(main, {
                ...State,
                creator_score: PreviousScore.creator_score,
                opponent_score: PreviousScore.opponent_score,
            });
            SetDoubleRollResultVisuals(main, State, {
                creatorText: "Awaiting roll",
                opponentText: "Awaiting roll",
            });
            SetSessionNarrative(main, {
                detail: State.is_double_roll
                    ? `Score ${PreviousScore.creator_score}-${PreviousScore.opponent_score}. ${State.creator.display_name} throws both dice.`
                    : `Score ${PreviousScore.creator_score}-${PreviousScore.opponent_score}. Creator throw is live.`,
                title: `${State.creator.display_name} is rolling.`,
            });
        };

        const SetBetweenPlayersState = (RoundIndex) =>
        {
            const PreviousScore = GetPreviousScore(RoundIndex);
            const Round = Rounds[RoundIndex];

            ApplyBaseScene();

            if (State.is_double_roll)
            {
                DiceViewerController.setFaces({
                    left: Round.creator_faces?.[0] || 1,
                    right: Round.creator_faces?.[1] || 1,
                }, {
                    position: "current",
                });
                SetDoubleRollResultVisuals(main, State, {
                    creatorText: FormatDoubleRollResult(Round.creator_faces, Round.creator_total),
                    opponentText: "Awaiting roll",
                });
                SetSessionNarrative(main, {
                    detail: `${State.creator.display_name} posts ${Round.creator_total}.`,
                    title: `${Round.creator_total} total`,
                });
            }
            else
            {
                DiceViewerController.setFaces({
                    creator: Round.creator_face,
                    opponent: 1,
                }, {
                    position: "current",
                });
                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs to beat ${Round.creator_face}.`,
                    title: `${State.opponent.display_name} is rolling.`,
                });
            }

            SetScoreVisuals(main, {
                ...State,
                creator_score: PreviousScore.creator_score,
                opponent_score: PreviousScore.opponent_score,
            });
        };

        const SetOpponentRollState = (RoundIndex) =>
        {
            const PreviousScore = GetPreviousScore(RoundIndex);
            const Round = Rounds[RoundIndex];

            ApplyBaseScene();

            if (State.is_double_roll)
            {
                DiceViewerController.setFaces({
                    left: Round.creator_faces?.[0] || 1,
                    right: Round.creator_faces?.[1] || 1,
                }, {
                    position: "current",
                });
                SetDoubleRollResultVisuals(main, State, {
                    creatorText: FormatDoubleRollResult(Round.creator_faces, Round.creator_total),
                    opponentText: "Awaiting roll",
                });
                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs more than ${Round.creator_total}.`,
                    title: `${State.opponent.display_name} is rolling.`,
                });
            }
            else
            {
                DiceViewerController.setFaces({
                    creator: Round.creator_face,
                    opponent: 1,
                }, {
                    position: "current",
                });
                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs to beat ${Round.creator_face}.`,
                    title: `${State.opponent.display_name} is rolling.`,
                });
            }

            SetScoreVisuals(main, {
                ...State,
                creator_score: PreviousScore.creator_score,
                opponent_score: PreviousScore.opponent_score,
            });
        };

        const SetRoundResultState = (RoundIndex) =>
        {
            const Round = Rounds[RoundIndex];

            ApplyBaseScene();

            if (State.is_double_roll)
            {
                DiceViewerController.setFaces({
                    left: Round.opponent_faces?.[0] || 1,
                    right: Round.opponent_faces?.[1] || 1,
                }, {
                    position: "current",
                });
            }
            else
            {
                DiceViewerController.setFaces({
                    creator: Round.creator_face,
                    opponent: Round.opponent_face,
                }, {
                    position: "current",
                });
            }

            SetScoreVisuals(main, {
                ...State,
                creator_score: Round.creator_score,
                opponent_score: Round.opponent_score,
            });
            SetDoubleRollResultVisuals(main, State, {
                creatorText: FormatDoubleRollResult(Round.creator_faces, Round.creator_total),
                opponentText: FormatDoubleRollResult(Round.opponent_faces, Round.opponent_total),
            });
            SetSessionNarrative(main, {
                detail:
                    State.is_double_roll
                        ? (
                            Round.winner === "tie"
                                ? `Both players landed ${Round.creator_total}. Score stays ${Round.creator_score}-${Round.opponent_score}.`
                                : `Totals ${Round.creator_total}-${Round.opponent_total}. Score ${Round.creator_score}-${Round.opponent_score}.`
                        )
                        : `Score ${Round.creator_score}-${Round.opponent_score}.`,
                title:
                    Round.winner === "tie"
                        ? "Tie round. Both players reroll."
                        : `${Round.winner === "creator" ? State.creator.display_name : State.opponent.display_name} takes the round.`,
            });
        };

        const SetBetweenRoundsState = (RoundIndex) =>
        {
            const Round = Rounds[RoundIndex];

            ApplyBaseScene();
            DiceViewerController.setFaces(IdleViewerFaces, {
                position: "top",
            });
            SetScoreVisuals(main, {
                ...State,
                creator_score: Round.creator_score,
                opponent_score: Round.opponent_score,
            });
            SetDoubleRollResultVisuals(main, State, {
                creatorText: "Awaiting roll",
                opponentText: "Awaiting roll",
            });
            SetSessionNarrative(main, {
                detail: `Next up: round ${Round.round_number + 1}.`,
                title: `${Round.creator_score}-${Round.opponent_score}`,
            });
        };

        if (!DiceViewerController || !FinalRound)
        {
            ClearFirstToPlaybackProgress(State.id);
            PersistRevealCompletion(State);
            PendingRevealState = null;
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(BuildUiState(State));
            ApplyResolvedState(main, BuildUiState(State));
            MaybePlayWinSound(State);
            RecordLiveStatsResult(State, RecordedLiveStatsSignatures);
            return;
        }

        const IntroDelayMs = State.is_double_roll ? DoublePlaybackDelays.introMs : FirstToPlaybackDelays.introMs;
        const BetweenPlayersDelayMs = State.is_double_roll
            ? DoublePlaybackDelays.betweenPlayersMs
            : FirstToPlaybackDelays.betweenPlayersMs;
        const BetweenRoundsDelayMs =
            280 +
            (State.is_double_roll ? DoublePlaybackDelays.betweenRoundsMs : FirstToPlaybackDelays.betweenRoundsMs);
        const StartRoundIndex = ResumeProgress && ResumePhase && ResumePhase !== "intro"
            ? ResumeRoundIndex
            : 0;

        if (!ResumeProgress || ResumePhase === "intro")
        {
            const IntroProgress = ResumeProgress?.phase === "intro"
                ? ResumeProgress
                : BeginPlaybackPhase("intro", 0);

            SetIntroState();
            await WaitFor(GetRemainingPlaybackDelayMs(IntroProgress, IntroDelayMs));

            if (!IsActive())
            {
                return;
            }
        }

        for (let RoundIndex = StartRoundIndex; RoundIndex < Rounds.length; RoundIndex += 1)
        {
            const Round = Rounds[RoundIndex];
            const HasNextRound = RoundIndex < (Rounds.length - 1);
            const ResultHoldMs =
                Round.winner === "tie"
                    ? (State.is_double_roll ? DoublePlaybackDelays.tieRoundMs : FirstToPlaybackDelays.tieRoundMs)
                    : (State.is_double_roll ? DoublePlaybackDelays.resultHoldMs : FirstToPlaybackDelays.finalRoundMs);
            const ResumeOrder =
                ResumeProgress &&
                ResumePhase &&
                ResumePhase !== "intro" &&
                RoundIndex === ResumeRoundIndex
                    ? PhaseOrder.indexOf(ResumePhase)
                    : -1;

            if (ResumeOrder <= 0)
            {
                BeginPlaybackPhase("creator_roll", RoundIndex);
                SetCreatorRollState(RoundIndex);

                if (State.is_double_roll)
                {
                    await DiceViewerController.playFaces({
                        left: Round.creator_faces?.[0] || 1,
                        right: Round.creator_faces?.[1] || 1,
                    });
                }
                else
                {
                    await DiceViewerController.play(Round.creator_face, {
                        player: "creator",
                    });
                }

                if (!IsActive())
                {
                    return;
                }

                if (State.is_double_roll)
                {
                    await WaitFor(DoublePlaybackDelays.scoreRevealMs);

                    if (!IsActive())
                    {
                        return;
                    }
                }
            }

            if (ResumeOrder <= 1)
            {
                const BetweenPlayersProgress =
                    ResumeOrder === 1
                        ? ResumeProgress
                        : BeginPlaybackPhase("between_players", RoundIndex);

                SetBetweenPlayersState(RoundIndex);
                await WaitFor(GetRemainingPlaybackDelayMs(BetweenPlayersProgress, BetweenPlayersDelayMs));

                if (!IsActive())
                {
                    return;
                }
            }

            if (ResumeOrder <= 2)
            {
                BeginPlaybackPhase("opponent_roll", RoundIndex);
                SetOpponentRollState(RoundIndex);

                if (State.is_double_roll)
                {
                    await DiceViewerController.playFaces({
                        left: Round.opponent_faces?.[0] || 1,
                        right: Round.opponent_faces?.[1] || 1,
                    });
                    await WaitFor(DoublePlaybackDelays.scoreRevealMs);
                }
                else
                {
                    await DiceViewerController.play(Round.opponent_face, {
                        player: "opponent",
                    });
                    await WaitFor(FirstToPlaybackDelays.scoreRevealMs);
                }

                if (!IsActive())
                {
                    return;
                }
            }

            if (ResumeOrder <= 3)
            {
                const RoundResultProgress =
                    ResumeOrder === 3
                        ? ResumeProgress
                        : BeginPlaybackPhase("round_result", RoundIndex);

                SetRoundResultState(RoundIndex);

                if (!HasNextRound)
                {
                    ClearFirstToPlaybackProgress(State.id);
                    PersistRevealCompletion(State);
                    ReleaseGlobalBalanceDisplay(BalanceContext);
                    SetBalance(BuildUiState(State));
                    ApplyResolvedState(main, BuildUiState(State));
                    MaybePlayWinSound(State);
                    RecordLiveStatsResult(State, RecordedLiveStatsSignatures);
                }

                await WaitFor(GetRemainingPlaybackDelayMs(RoundResultProgress, ResultHoldMs));

                if (!IsActive())
                {
                    return;
                }
            }

            if (HasNextRound && ResumeOrder <= 4)
            {
                if (ResumeOrder === 4)
                {
                    SetBetweenRoundsState(RoundIndex);
                    await WaitFor(GetRemainingPlaybackDelayMs(ResumeProgress, BetweenRoundsDelayMs));
                }
                else
                {
                    BeginPlaybackPhase("between_rounds", RoundIndex);
                    SetSessionNarrative(main, {
                        detail: `Next up: round ${Round.round_number + 1}.`,
                        title: `${Round.creator_score}-${Round.opponent_score}`,
                    });
                    await DiceViewerController.resetPlayersToTop(ViewerPlayers);

                    if (!IsActive())
                    {
                        return;
                    }

                    SetBetweenRoundsState(RoundIndex);
                    await WaitFor(State.is_double_roll ? DoublePlaybackDelays.betweenRoundsMs : FirstToPlaybackDelays.betweenRoundsMs);
                }

                if (!IsActive())
                {
                    return;
                }
            }
        }

        if (!IsActive())
        {
            return;
        }

        if (State.is_double_roll)
        {
            const WinningFaces =
                FinalRound.winner === "creator"
                    ? FinalRound.creator_faces
                    : FinalRound.opponent_faces;

            DiceViewerController.setFaces({
                left: WinningFaces?.[0] || 1,
                right: WinningFaces?.[1] || 1,
            }, {
                position: "current",
            });
        }
        else
        {
            DiceViewerController.setFaces({
                creator: FinalRound.creator_face,
                opponent: FinalRound.opponent_face,
            }, {
                position: "current",
            });
        }

        ClearFirstToPlaybackProgress(State.id);
        PersistRevealCompletion(State);
        SetScoreVisuals(main, State);
        SetDoubleRollResultVisuals(main, State);
        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(BuildUiState(State));
        ApplyResolvedState(main, BuildUiState(State));
        MaybePlayWinSound(State);
        RecordLiveStatsResult(State, RecordedLiveStatsSignatures);
        PendingRevealState = null;
    };

    const HandleReturnLinkClick = async (EventValue) =>
    {
        if (!ReturnLink || !window.GamblingApp?.navigateTo || ReturnLink.dataset.isLeaving === "true")
        {
            return;
        }

        EventValue.preventDefault();
        EventValue.stopPropagation();
        ReturnLink.dataset.isLeaving = "true";
        await HideSessionReturnLink(ReturnLink);
        await window.GamblingApp.navigateTo(ReturnLink.href);
    };

    ReturnLink?.addEventListener("click", HandleReturnLinkClick);

    const RenderLatestState = () =>
    {
        if (IsDisposed)
        {
            return;
        }

            const UiState = BuildUiState(LastState);
            const IsRevealUiLocked = Boolean(PendingRevealState && !HasRevealCompletion(LastState));

            RenderFairnessState(main, LastState);

            if (LastState.status !== "resolved")
        {
            ClearRevealCompletion(LastState.id);
        }

        SetOpponentVisuals(main, UiState);
        RenderViewerState(main, UiState);
        SetPanelResultVisuals(main, UiState, {
            revealResolved:
                LastState.status === "resolved" &&
                !IsRevealUiLocked &&
                (
                    (LastState.is_first_to && HasShownResult) ||
                    (!LastState.is_first_to && HasAppliedResolvedFace)
                ),
        });
        SetSceneIndicatorVisuals(main, UiState);

        if (!LastState.is_first_to || LastState.status !== "resolved" || !IsRevealPlaybackPending(LastState))
        {
            ClearFirstToPlaybackProgress(LastState.id);
        }

        const DiceViewerController = GetDiceViewerController(main);

        if (!DiceViewerController)
        {
            return;
        }

        if (LastState.is_first_to)
        {
            const FinalRound = GetFinalFirstToRound(LastState);
            const VisibleViewerPlayers = LastState.is_double_roll
                ? {
                    left: true,
                    right: true,
                }
                : {
                    creator: true,
                    opponent: true,
                };
            const IdleViewerFaces = LastState.is_double_roll
                ? {
                    left: 1,
                    right: 1,
                }
                : {
                    creator: 1,
                    opponent: 1,
                };

            if (LastState.status !== "resolved")
            {
                SetScoreVisuals(main, UiState);
                SetDoubleRollResultVisuals(main, UiState);
                ApplyIdleViewerState(
                    `first-to:${LastState.is_double_roll ? "double" : "single"}:idle`,
                    () =>
                    {
                        DiceViewerController.setPlayersVisible(VisibleViewerPlayers);
                        DiceViewerController.setFaces(IdleViewerFaces, {
                            position: "top",
                        });
                    },
                );
                SetSceneIndicatorVisibility(main, false);
                SetBalance(UiState);
                RenderUnresolvedState(main, UiState);
                return;
            }

            ResetIdleViewerSignature();
            DiceViewerController.setPlayersVisible(VisibleViewerPlayers);
            SetSceneIndicatorVisibility(main, !LastState.is_double_roll);

            if (LastState.status === "resolved" && FinalRound)
            {
                if (IsRevealUiLocked)
                {
                    SetShareVisibility(main, LastState, {
                        forceHidden: true,
                    });
                    SetRedoVisibility(main, LastState, {
                        forceHidden: true,
                    });
                    return;
                }

                if (!HasShownResult)
                {
                    if (IsRevealPlaybackPending(LastState))
                    {
                        HoldGlobalBalanceDisplay(BalanceContext);
                        PendingRevealState = LastState;
                        HasShownResult = true;

                        PlayFirstToSequence(LastState).catch((ErrorValue) =>
                        {
                            console.error(ErrorValue);

                            if (PendingRevealState === LastState)
                            {
                                ClearFirstToPlaybackProgress(LastState.id);
                                PersistRevealCompletion(LastState);
                                PendingRevealState = null;
                                SetScoreVisuals(main, LastState);
                                SetDoubleRollResultVisuals(main, LastState);
                                ReleaseGlobalBalanceDisplay(BalanceContext);
                                SetBalance(BuildUiState(LastState));
                                ApplyResolvedState(main, BuildUiState(LastState));
                                MaybePlayWinSound(LastState);
                                RecordLiveStatsResult(LastState, RecordedLiveStatsSignatures);
                            }
                        });
                        return;
                    }

                    PersistRevealCompletion(LastState);
                    HasShownResult = true;
                }

                if (LastState.is_double_roll)
                {
                    const WinningFaces =
                        FinalRound.winner === "creator"
                            ? FinalRound.creator_faces
                            : FinalRound.opponent_faces;

                    DiceViewerController.setFaces({
                        left: WinningFaces?.[0] || 1,
                        right: WinningFaces?.[1] || 1,
                    }, {
                        position: "current",
                    });
                }
                else
                {
                    DiceViewerController.setFaces({
                        creator: FinalRound.creator_face,
                        opponent: FinalRound.opponent_face,
                    }, {
                        position: "current",
                    });
                }
                SetScoreVisuals(main, UiState);
                SetDoubleRollResultVisuals(main, UiState);
                ReleaseGlobalBalanceDisplay(BalanceContext);
                SetBalance(BuildUiState(LastState));
                ApplyResolvedState(main, BuildUiState(LastState));
                RecordLiveStatsResult(LastState, RecordedLiveStatsSignatures);
                return;
            }

            DiceViewerController.setFaces(
                LastState.is_double_roll
                    ? {
                        left: 1,
                        right: 1,
                    }
                    : {
                        creator: 1,
                        opponent: 1,
                    },
                {
                    position: "top",
                },
            );
            SetScoreVisuals(main, UiState);
            SetDoubleRollResultVisuals(main, UiState);
            SetBalance(UiState);
            RenderUnresolvedState(main, UiState);
            return;
        }

        SetSceneIndicatorVisibility(main, false);

        if (LastState.status === "resolved" && LastState.result_face)
        {
            ResetIdleViewerSignature();
            if (IsRevealUiLocked)
            {
                SetShareVisibility(main, LastState, {
                    forceHidden: true,
                });
                SetRedoVisibility(main, LastState, {
                    forceHidden: true,
                });
                return;
            }

            if (!HasShownResult)
            {
                if (IsRevealPlaybackPending(LastState))
                {
                    HoldGlobalBalanceDisplay(BalanceContext);
                    PendingRevealState = LastState;
                    HasShownResult = true;
                    SetSessionNarrative(main, {
                        detail: "The final die is rolling now.",
                        title: "Rolling...",
                    });
                    DiceViewerController.play(LastState.result_face, {
                        dropPoint: {
                            x: 0,
                            z: 0,
                        },
                    });
                    return;
                }

                PersistRevealCompletion(LastState);
                HasShownResult = true;
            }

            if (!HasAppliedResolvedFace)
            {
                DiceViewerController.setFace(LastState.result_face);
                HasAppliedResolvedFace = true;
            }
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(BuildUiState(LastState));
            ApplyResolvedState(main, BuildUiState(LastState));
            RecordLiveStatsResult(LastState, RecordedLiveStatsSignatures);
            return;
        }

        ApplyIdleViewerState("classic:idle", () =>
        {
            DiceViewerController.setFace(1, {
                position: "top",
            });
            DiceViewerController.setPlayersVisible({
                shared: true,
            });
        });
        SetDoubleRollResultVisuals(main, UiState);
        SetBalance(UiState);
        RenderUnresolvedState(main, UiState);
    };

    const HandleDiceFinished = () =>
    {
        if (IsDisposed || !PendingRevealState || PendingRevealState.is_first_to)
        {
            return;
        }

        const ResolvedState = PendingRevealState;
        PersistRevealCompletion(ResolvedState);
        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(BuildUiState(ResolvedState));
        ApplyResolvedState(main, BuildUiState(ResolvedState));
        MaybePlayWinSound(ResolvedState);
        RecordLiveStatsResult(ResolvedState, RecordedLiveStatsSignatures);
        HasAppliedResolvedFace = true;
        PendingRevealState = null;
    };

    DiceViewerContainer.addEventListener("dice:finished", HandleDiceFinished);

    RenderLatestState();

    if (ShouldAutoplayInitialCountdown)
    {
        window.GamblingApp?.playSound?.("countdown", {
            restart: true,
        });
    }

    ReadyInterval = window.setInterval(() =>
    {
        if (GetDiceViewerController(main))
        {
            RenderLatestState();
            window.clearInterval(ReadyInterval);
            ReadyInterval = 0;
        }
    }, 120);

    const ScheduleTick = (Delay) =>
    {
        if (IsDisposed)
        {
            return;
        }

        PollTimeout = window.setTimeout(Tick, Delay);
    };

    const Tick = async () =>
    {
        if (IsDisposed)
        {
            return;
        }

        const CurrentState = await PollSessionState(StateUrl, (State) =>
        {
            if (IsDisposed)
            {
                return;
            }

            MaybePlayCountdownSound(State);
            LastState = State;
            RenderLatestState();
        }, HandleCanceledSession);

        if (IsDisposed)
        {
            return;
        }

        if (!CurrentState)
        {
            ScheduleTick(1500);
            return;
        }

        if (CurrentState.is_canceled)
        {
            return;
        }

        if (CurrentState.status !== "resolved" || PendingRevealState)
        {
            ScheduleTick(1000);
        }
    };

    if (InitialState.status !== "resolved")
    {
        ScheduleTick(1000);
    }

    return () =>
    {
        IsDisposed = true;
        ReturnLink?.removeEventListener("click", HandleReturnLinkClick);
        DiceViewerContainer.removeEventListener("dice:finished", HandleDiceFinished);

        if (ReadyInterval)
        {
            window.clearInterval(ReadyInterval);
        }

        if (PollTimeout)
        {
            window.clearTimeout(PollTimeout);
        }

        ReleaseGlobalBalanceDisplay(BalanceContext);
    };
};

window.GamblingApp?.registerPageInitializer("dice-session", InitializeDiceSessionPage);
})();
/* github-refresh: 2026-05-02T02:31:53Z */
