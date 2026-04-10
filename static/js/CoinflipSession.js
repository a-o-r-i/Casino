(() =>
{
const ParseSessionState = (Main) =>
{
    const StateNode = Main.querySelector("[data-coinflip-state]");

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

const GetCoinViewerContainer = (Main) =>
{
    return Main.querySelector("[data-coin-viewer]");
};

const GetCoinViewerController = (Main) =>
{
    return GetCoinViewerContainer(Main)?.CoinflipController || null;
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

    Node._textTransitionToken = `${Date.now()}-${Math.random()}`;
    const TransitionToken = Node._textTransitionToken;
    Node._textAnimation?.cancel?.();

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
    Node._textAnimation = ExitAnimation;

    return ExitAnimation.finished
        .catch(() =>
        {
            return null;
        })
        .then(() =>
        {
            if (Node._textTransitionToken !== TransitionToken)
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
            Node._textAnimation = EnterAnimation;

            return EnterAnimation.finished.catch(() =>
            {
                return null;
            });
        })
        .finally(() =>
        {
            if (Node._textTransitionToken === TransitionToken)
            {
                delete Node._textTransitionToken;
                Node._textAnimation = null;
            }
        });
};

const SetChoiceVisuals = (Main, State) =>
{
    const CreatorChoice = Main.querySelector("[data-creator-choice]");
    const OpponentChoice = Main.querySelector("[data-opponent-choice]");

    if (CreatorChoice)
    {
        TransitionTextNode(CreatorChoice, String(State.creator_choice ?? ""));
    }

    if (OpponentChoice)
    {
        TransitionTextNode(OpponentChoice, String(State.opponent_choice ?? ""));
    }
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

    CallBotWrap.hidden = !State.can_call_bot;
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

const SetSessionStatus = (Main, NextValue) =>
{
    const SessionStatus = Main.querySelector("[data-session-status]");

    if (!SessionStatus || typeof NextValue !== "string")
    {
        return Promise.resolve();
    }

    const NextText = NextValue.trim();

    if (SessionStatus.textContent.trim() === NextText)
    {
        return Promise.resolve();
    }

    if (typeof SessionStatus.animate !== "function")
    {
        SessionStatus.textContent = NextText;
        return Promise.resolve();
    }

    SessionStatus._statusTransitionToken = `${Date.now()}-${Math.random()}`;
    const TransitionToken = SessionStatus._statusTransitionToken;
    SessionStatus._statusAnimation?.cancel?.();

    const ExitAnimation = SessionStatus.animate(
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
    SessionStatus._statusAnimation = ExitAnimation;

    return ExitAnimation.finished
        .catch(() =>
        {
            return null;
        })
        .then(() =>
        {
            if (SessionStatus._statusTransitionToken !== TransitionToken)
            {
                return null;
            }

            SessionStatus.textContent = NextText;

            const EnterAnimation = SessionStatus.animate(
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
            SessionStatus._statusAnimation = EnterAnimation;

            return EnterAnimation.finished.catch(() =>
            {
                return null;
            });
        })
        .finally(() =>
        {
            if (SessionStatus._statusTransitionToken === TransitionToken)
            {
                delete SessionStatus._statusTransitionToken;
                SessionStatus._statusAnimation = null;
            }
        });
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
    SetSessionStatus(Main, State.status_text);
    RevealSessionReturnLink(Main);
};

const GetResultStateName = (State) =>
{
    if (State.did_win === true)
    {
        return "win";
    }

    if (State.did_win === false)
    {
        return "loss";
    }

    return "neutral";
};

const RenderUnresolvedState = (Main, State) =>
{
    SetSessionStatus(Main, State.status_text);
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

const InitializeCoinflipSessionPage = ({ main }) =>
{
    const SessionRoot = main.querySelector("[data-coinflip-session]");
    const CoinViewerContainer = GetCoinViewerContainer(main);
    const InitialState = ParseSessionState(main);

    if (!SessionRoot || !CoinViewerContainer || !InitialState)
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
    let HasShownResult = InitialState.status === "resolved";
    let IsDisposed = false;
    let IsHoldingBalanceDisplay = false;
    let PollTimeout = 0;
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

        SetChoiceVisuals(main, LastState);
        SetOpponentVisuals(main, LastState);

        const CoinViewerController = GetCoinViewerController(main);

        if (!CoinViewerController)
        {
            return;
        }

        if (LastState.status === "resolved" && LastState.result_side)
        {
            CoinViewerController.setResultState?.(GetResultStateName(LastState));

            if (PendingRevealState)
            {
                SetSessionStatus(main, "Flipping...");
                return;
            }

            if (!HasShownResult)
            {
                HoldGlobalBalanceDisplay(BalanceContext);
                PendingRevealState = LastState;
                HasShownResult = true;
                SetSessionStatus(main, "Flipping...");
                CoinViewerController.play(LastState.result_side);
                return;
            }

            CoinViewerController.setSide(LastState.result_side);
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(LastState);
            ApplyResolvedState(main, LastState);
            return;
        }

        CoinViewerController.setResultState?.("neutral");
        CoinViewerController.setSide("Heads");
        SetBalance(LastState);
        RenderUnresolvedState(main, LastState);
    };

    const HandleCoinflipFinished = () =>
    {
        if (IsDisposed)
        {
            return;
        }

        if (!PendingRevealState)
        {
            return;
        }

        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(PendingRevealState);
        ApplyResolvedState(main, PendingRevealState);
        PendingRevealState = null;
    };

    CoinViewerContainer.addEventListener("coinflip:finished", HandleCoinflipFinished);

    RenderLatestState();

    ReadyInterval = window.setInterval(() =>
    {
        if (GetCoinViewerController(main))
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
        CoinViewerContainer.removeEventListener("coinflip:finished", HandleCoinflipFinished);

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

window.GamblingApp?.registerPageInitializer("coinflip-session", InitializeCoinflipSessionPage);
})();
