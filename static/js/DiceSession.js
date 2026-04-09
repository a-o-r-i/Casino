(() =>
{
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

    if (!OpponentName || !OpponentSubtitle || !OpponentAvatar || !OpponentFallback || !CallBotWrap)
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
            OpponentAvatar.src = State.opponent.avatar_url;
            OpponentAvatar.classList.remove("hidden");
            OpponentFallback.classList.remove("flex");
            OpponentFallback.classList.add("hidden");
        }
        else
        {
            OpponentFallback.textContent = State.opponent.display_name.charAt(0).toUpperCase();
            OpponentFallback.classList.add("flex");
            OpponentFallback.classList.remove("hidden");
            OpponentAvatar.classList.add("hidden");
        }
    }
    else
    {
        OpponentName.textContent = "Waiting for player...";
        OpponentSubtitle.textContent = "Open slot";
        OpponentFallback.textContent = "?";
        OpponentFallback.classList.add("flex");
        OpponentFallback.classList.remove("hidden");
        OpponentAvatar.classList.add("hidden");
    }

    CallBotWrap.hidden = !State.can_call_bot;
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
        CreatorScore.textContent = String(State.creator_score ?? 0);
    }

    if (CreatorScoreLabel)
    {
        CreatorScoreLabel.textContent = ScoreLabel;
    }

    if (OpponentScore)
    {
        OpponentScore.textContent = String(State.opponent_score ?? 0);
    }

    if (OpponentScoreLabel)
    {
        OpponentScoreLabel.textContent = ScoreLabel;
    }
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
        CreatorResult.textContent = CreatorText;
    }

    if (OpponentResult)
    {
        OpponentResult.textContent = OpponentText;
    }
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

const SetSessionNarrative = (Main, Narrative) =>
{
    const PhaseNode = Main.querySelector("[data-session-phase]");
    const TitleNode = Main.querySelector("[data-session-status]");
    const DetailNode = Main.querySelector("[data-session-detail]");

    if (PhaseNode && typeof Narrative.phase === "string")
    {
        PhaseNode.textContent = Narrative.phase;
    }

    if (TitleNode && typeof Narrative.title === "string")
    {
        TitleNode.textContent = Narrative.title;
    }

    if (DetailNode && typeof Narrative.detail === "string")
    {
        DetailNode.textContent = Narrative.detail;
    }
};

const BuildSessionNarrative = (State) =>
{
    if (State.status === "resolved")
    {
        return {
            detail: State.is_first_to
                ? `Final score ${State.creator_score}-${State.opponent_score}.`
                : `Final face ${State.result_face} decided the winner.`,
            phase: "Complete",
            title: State.status_text,
        };
    }

    if (State.status === "countdown")
    {
        return {
            detail: State.is_first_to
                ? (
                    State.is_double_roll
                        ? `${State.creator.display_name} rolls two dice first each round. Higher total takes the point.`
                        : `${State.creator.display_name} rolls first every round. Higher face takes the point.`
                )
                : "The die will roll as soon as the countdown ends.",
            phase: "Countdown",
            title: State.status_text,
        };
    }

    return {
        detail: State.is_first_to
            ? (
                State.is_double_roll
                    ? `Waiting for an opponent. FT${State.target_wins} starts with two dice per player.`
                    : `Waiting for an opponent. FT${State.target_wins} starts with the creator roll.`
            )
            : "Waiting for an opponent before the die roll begins.",
        phase: "Open Session",
        title: State.status_text,
    };
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
    finalRoundMs: 520,
    introMs: 220,
    scoreRevealMs: 260,
    tieRoundMs: 360,
};
const DoublePlaybackDelays = {
    betweenPlayersMs: 560,
    betweenRoundsMs: 760,
    introMs: 220,
    resultHoldMs: 560,
    scoreRevealMs: 280,
    tieRoundMs: 460,
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

const ApplyResolvedState = (Main, State) =>
{
    SetPanelResultVisuals(Main, State, {
        revealResolved: true,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
    RevealSessionReturnLink(Main);
};

const RenderUnresolvedState = (Main, State) =>
{
    SetPanelResultVisuals(Main, State, {
        revealResolved: false,
    });
    SetSessionNarrative(Main, BuildSessionNarrative(State));
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
    let IdleViewerSignature = "";
    let PollTimeout = 0;
    let ReadyInterval = 0;
    const ReturnLink = main.querySelector("[data-session-return-link]");

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
            SetBalance(State);
            ApplyResolvedState(main, State);
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
            phase: "Match Start",
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
                    phase: `Round ${Round.round_number}`,
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
                    phase: `Round ${Round.round_number} Creator Total`,
                    title: `${Round.creator_total} total`,
                });

                await WaitFor(DoublePlaybackDelays.betweenPlayersMs);

                if (IsDisposed || PendingRevealState !== State)
                {
                    return;
                }

                SetSessionNarrative(main, {
                    detail: `${State.opponent.display_name} needs more than ${Round.creator_total}.`,
                    phase: `Round ${Round.round_number}`,
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
                    phase: Round.winner === "tie" ? `Round ${Round.round_number} Tied` : `Round ${Round.round_number} Result`,
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
                    phase: `Round ${Round.round_number}`,
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
                    phase: `Round ${Round.round_number}`,
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
                    phase: Round.winner === "tie" ? `Round ${Round.round_number} Tied` : `Round ${Round.round_number} Result`,
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
                    phase: "Score Update",
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
        SetBalance(State);
        ApplyResolvedState(main, State);
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
                            SetBalance(LastState);
                            ApplyResolvedState(main, LastState);
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
                PendingRevealState = LastState;
                HasShownResult = true;
                SetSessionNarrative(main, {
                    detail: "The final die is rolling now.",
                    phase: "Result",
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

        SetBalance(PendingRevealState);
        ApplyResolvedState(main, PendingRevealState);
        HasAppliedResolvedFace = true;
        PendingRevealState = null;
    };

    DiceViewerContainer.addEventListener("dice:finished", HandleDiceFinished);

    RenderLatestState();

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
    };
};

window.GamblingApp?.registerPageInitializer("dice-session", InitializeDiceSessionPage);
})();
