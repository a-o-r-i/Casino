(() =>
{
const CountdownAutoplayStorageKey = "gambling.countdownAutoplayOnLoad";

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

const WaitFor = (DelayMs) =>
{
    return new Promise((Resolve) =>
    {
        window.setTimeout(Resolve, DelayMs);
    });
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

const SetRedoVisibility = (Main, State) =>
{
    const RedoForm = Main.querySelector("[data-session-redo-form]");

    if (!RedoForm)
    {
        return;
    }

    if (State?.redo_url)
    {
        RedoForm.action = State.redo_url;
    }

    RedoForm.classList.toggle("hidden", !State?.can_redo);
    RedoForm.classList.toggle("flex", Boolean(State?.can_redo));
};

const ApplyResolvedState = (Main, State) =>
{
    SetPanelResultVisuals(Main, State, {
        revealResolved: true,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
    RevealSessionReturnLink(Main);
    SetRedoVisibility(Main, State);
};

const RenderUnresolvedState = (Main, State) =>
{
    SetPanelResultVisuals(Main, State, {
        revealResolved: false,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
    SetRedoVisibility(Main, State);
};

const PollSessionState = async (StateUrl, OnState) =>
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

    if (InitialState.status === "resolved")
    {
        RevealSessionReturnLink(main);
    }

    const StateUrl = SessionRoot.dataset.stateUrl;
    let LastState = InitialState;
    let PendingRevealState = null;
    let HasShownResult = false;
    let HasAppliedResolvedFace = false;
    let IsDisposed = false;
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

        if (!DiceViewerController || !FinalRound)
        {
            PendingRevealState = null;
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(State);
            ApplyResolvedState(main, State);
            MaybePlayWinSound(State);
            return;
        }

        DiceViewerController.setPlayersVisible(ViewerPlayers);
        SetSceneIndicatorVisibility(main, !State.is_double_roll);
        DiceViewerController.setFaces(
            State.is_double_roll
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

        await WaitFor(State.is_double_roll ? DoublePlaybackDelays.introMs : FirstToPlaybackDelays.introMs);

        const Rounds = Array.isArray(State.rounds) ? State.rounds : [];

        for (let RoundIndex = 0; RoundIndex < Rounds.length; RoundIndex += 1)
        {
            const Round = Rounds[RoundIndex];

            if (IsDisposed || PendingRevealState !== State)
            {
                return;
            }

            const PreviousScore = RoundIndex > 0
                ? Rounds[RoundIndex - 1]
                : {
                    creator_score: 0,
                    opponent_score: 0,
                };

            if (State.is_double_roll)
            {
                SetSessionNarrative(main, {
                    detail: `Score ${PreviousScore.creator_score}-${PreviousScore.opponent_score}. ${State.creator.display_name} throws both dice.`,
                    title: `${State.creator.display_name} is rolling.`,
                });

                await DiceViewerController.playFaces({
                    left: Round.creator_faces?.[0] || 1,
                    right: Round.creator_faces?.[1] || 1,
                });

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                await WaitFor(DoublePlaybackDelays.scoreRevealMs);

                SetDoubleRollResultVisuals(main, State, {
                    creatorText: FormatDoubleRollResult(Round.creator_faces, Round.creator_total),
                    opponentText: "Awaiting roll",
                });
                SetSessionNarrative(main, {
                    detail: `${State.creator.display_name} posts ${Round.creator_total}.`,
                    title: `${Round.creator_total} total`,
                });

                await WaitFor(DoublePlaybackDelays.betweenPlayersMs);

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs more than ${Round.creator_total}.`,
                    title: `${State.opponent.display_name} is rolling.`,
                });

                await DiceViewerController.playFaces({
                    left: Round.opponent_faces?.[0] || 1,
                    right: Round.opponent_faces?.[1] || 1,
                });

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                await WaitFor(DoublePlaybackDelays.scoreRevealMs);

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
                        Round.winner === "tie"
                            ? `Both players landed ${Round.creator_total}. Score stays ${Round.creator_score}-${Round.opponent_score}.`
                            : `Totals ${Round.creator_total}-${Round.opponent_total}. Score ${Round.creator_score}-${Round.opponent_score}.`,
                    title:
                        Round.winner === "tie"
                            ? "Tie round. Both players reroll."
                            : `${Round.winner === "creator" ? State.creator.display_name : State.opponent.display_name} takes the round.`,
                });
            }
            else
            {
                SetSessionNarrative(main, {
                    detail: `Score ${PreviousScore.creator_score}-${PreviousScore.opponent_score}. Creator throw is live.`,
                    title: `${State.creator.display_name} is rolling.`,
                });

                await DiceViewerController.play(Round.creator_face, {
                    player: "creator",
                });

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                await WaitFor(FirstToPlaybackDelays.betweenPlayersMs);

                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs to beat ${Round.creator_face}.`,
                    title: `${State.opponent.display_name} is rolling.`,
                });

                await DiceViewerController.play(Round.opponent_face, {
                    player: "opponent",
                });

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                await WaitFor(FirstToPlaybackDelays.scoreRevealMs);

                SetScoreVisuals(main, {
                    ...State,
                    creator_score: Round.creator_score,
                    opponent_score: Round.opponent_score,
                });

                SetSessionNarrative(main, {
                    detail: `Score ${Round.creator_score}-${Round.opponent_score}.`,
                    title:
                        Round.winner === "tie"
                            ? "Tie round. Both players reroll."
                            : `${Round.winner === "creator" ? State.creator.display_name : State.opponent.display_name} takes the round.`,
                });
            }

            const ResultHoldMs =
                Round.winner === "tie"
                    ? (State.is_double_roll ? DoublePlaybackDelays.tieRoundMs : FirstToPlaybackDelays.tieRoundMs)
                    : (State.is_double_roll ? DoublePlaybackDelays.resultHoldMs : FirstToPlaybackDelays.finalRoundMs);
            const HasNextRound = RoundIndex < (Rounds.length - 1);

            if (HasNextRound)
            {
                await WaitFor(ResultHoldMs);

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                SetSessionNarrative(main, {
                    detail: `Next up: round ${Round.round_number + 1}.`,
                    title: `${Round.creator_score}-${Round.opponent_score}`,
                });

                await DiceViewerController.resetPlayersToTop(ViewerPlayers);

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                SetDoubleRollResultVisuals(main, State, {
                    creatorText: "Awaiting roll",
                    opponentText: "Awaiting roll",
                });
                await WaitFor(State.is_double_roll ? DoublePlaybackDelays.betweenRoundsMs : FirstToPlaybackDelays.betweenRoundsMs);
                continue;
            }

            await WaitFor(ResultHoldMs);
        }

        if (IsDisposed || PendingRevealState !== State)
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
            });
        }
        else
        {
            DiceViewerController.setFaces({
                creator: FinalRound.creator_face,
                opponent: FinalRound.opponent_face,
            });
        }

        SetScoreVisuals(main, State);
        SetDoubleRollResultVisuals(main, State);
        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(State);
        ApplyResolvedState(main, State);
        MaybePlayWinSound(State);
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

        SetOpponentVisuals(main, LastState);
        RenderViewerState(main, LastState);
        SetPanelResultVisuals(main, LastState, {
            revealResolved:
                LastState.status === "resolved" &&
                !PendingRevealState &&
                (
                    (LastState.is_first_to && HasShownResult) ||
                    (!LastState.is_first_to && HasAppliedResolvedFace)
                ),
        });
        SetSceneIndicatorVisuals(main, LastState);

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
                SetScoreVisuals(main, LastState);
                SetDoubleRollResultVisuals(main, LastState);
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
                SetBalance(LastState);
                RenderUnresolvedState(main, LastState);
                return;
            }

            ResetIdleViewerSignature();
            DiceViewerController.setPlayersVisible(VisibleViewerPlayers);
            SetSceneIndicatorVisibility(main, !LastState.is_double_roll);

            if (LastState.status === "resolved" && FinalRound)
            {
                if (PendingRevealState)
                {
                    return;
                }

                if (!HasShownResult)
                {
                    HoldGlobalBalanceDisplay(BalanceContext);
                    PendingRevealState = LastState;
                    HasShownResult = true;

                    PlayFirstToSequence(LastState).catch((ErrorValue) =>
                    {
                        console.error(ErrorValue);

                        if (PendingRevealState === LastState)
                        {
                            PendingRevealState = null;
                            SetScoreVisuals(main, LastState);
                            SetDoubleRollResultVisuals(main, LastState);
                            ReleaseGlobalBalanceDisplay(BalanceContext);
                            SetBalance(LastState);
                            ApplyResolvedState(main, LastState);
                            MaybePlayWinSound(LastState);
                        }
                    });
                    return;
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
                    });
                }
                else
                {
                    DiceViewerController.setFaces({
                        creator: FinalRound.creator_face,
                        opponent: FinalRound.opponent_face,
                    });
                }
                SetScoreVisuals(main, LastState);
                SetDoubleRollResultVisuals(main, LastState);
                ReleaseGlobalBalanceDisplay(BalanceContext);
                SetBalance(LastState);
                ApplyResolvedState(main, LastState);
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
            SetScoreVisuals(main, LastState);
            SetDoubleRollResultVisuals(main, LastState);
            SetBalance(LastState);
            RenderUnresolvedState(main, LastState);
            return;
        }

        SetSceneIndicatorVisibility(main, false);

        if (LastState.status === "resolved" && LastState.result_face)
        {
            ResetIdleViewerSignature();
            if (PendingRevealState)
            {
                return;
            }

            if (!HasShownResult)
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

            if (!HasAppliedResolvedFace)
            {
                DiceViewerController.setFace(LastState.result_face);
                HasAppliedResolvedFace = true;
            }
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(LastState);
            ApplyResolvedState(main, LastState);
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
        SetDoubleRollResultVisuals(main, LastState);
        SetBalance(LastState);
        RenderUnresolvedState(main, LastState);
    };

    const HandleDiceFinished = () =>
    {
        if (IsDisposed || !PendingRevealState || PendingRevealState.is_first_to)
        {
            return;
        }

        const ResolvedState = PendingRevealState;
        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(ResolvedState);
        ApplyResolvedState(main, ResolvedState);
        MaybePlayWinSound(ResolvedState);
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
        });

        if (IsDisposed)
        {
            return;
        }

        if (!CurrentState)
        {
            ScheduleTick(1500);
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
