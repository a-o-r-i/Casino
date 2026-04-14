(() =>
{
const CountdownAutoplayStorageKey = "gambling.countdownAutoplayOnLoad";
const PendingToastStorageKey = "gambling.pendingToast";
const RevealCompletionStorageKeyPrefix = "gambling.coinflip-reveal-complete:";

const BuildRevealCompletionStorageKey = (SessionId) =>
{
    return `${RevealCompletionStorageKeyPrefix}${SessionId || ""}`;
};

const BuildRevealCompletionSignature = (State) =>
{
    return JSON.stringify({
        id: State?.id || "",
        resultSide: State?.result_side || "",
        winnerId: State?.winner_id || "",
    });
};

const PersistRevealCompletion = (State) =>
{
    if (State?.status !== "resolved" || !State?.id || !State?.result_side)
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
    if (State?.status !== "resolved" || !State?.id || !State?.result_side)
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

const SetBalance = (State) =>
{
    const BalanceValue = document.querySelector("[data-balance-display]");

    if (!BalanceValue)
    {
        return;
    }

    BalanceValue.textContent = State.current_balance_display;
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
    SetSessionStatus(Main, State.status_text);
    RevealSessionReturnLink(Main);
    SetShareVisibility(Main, State);
    SetRedoVisibility(Main, State);
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

const GetWinSoundSignature = (State) =>
{
    if (!State || State.status !== "resolved" || State.did_win !== true)
    {
        return "";
    }

    return JSON.stringify({
        id: State.id || "",
        resultSide: State.result_side || "",
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

const RenderUnresolvedState = (Main, State) =>
{
    SetSessionStatus(Main, State.status_text);
    SetShareVisibility(Main, State);
    SetRedoVisibility(Main, State);
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

const InitializeCoinflipSessionPage = ({ main }) =>
{
    const SessionRoot = main.querySelector("[data-coinflip-session]");
    const CoinViewerContainer = GetCoinViewerContainer(main);
    const InitialState = ParseSessionState(main);

    if (!SessionRoot || !CoinViewerContainer || !InitialState)
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
    let IsDisposed = false;
    let IsRedirectingForCancel = false;
    let IsHoldingBalanceDisplay = false;
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

    const RenderLatestState = () =>
    {
        if (IsDisposed)
        {
            return;
        }

        const UiState = BuildUiState(LastState);

        if (LastState.status !== "resolved")
        {
            ClearRevealCompletion(LastState.id);
        }

        SetChoiceVisuals(main, UiState);
        SetOpponentVisuals(main, UiState);
        RenderViewerState(main, UiState);

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
                if (!IsRevealPlaybackPending(LastState))
                {
                    PersistRevealCompletion(LastState);
                    HasShownResult = true;
                }
                else
                {
                    HoldGlobalBalanceDisplay(BalanceContext);
                    PendingRevealState = LastState;
                    HasShownResult = true;
                    SetSessionStatus(main, "Flipping...");
                    CoinViewerController.play(LastState.result_side);
                    return;
                }
            }

            CoinViewerController.setSide(LastState.result_side);
            ReleaseGlobalBalanceDisplay(BalanceContext);
            SetBalance(UiState);
            ApplyResolvedState(main, BuildUiState(LastState));
            return;
        }

        CoinViewerController.setResultState?.("neutral");
        CoinViewerController.setSide("Heads");
        SetBalance(UiState);
        RenderUnresolvedState(main, UiState);
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

        const ResolvedState = PendingRevealState;
        PersistRevealCompletion(ResolvedState);
        ReleaseGlobalBalanceDisplay(BalanceContext);
        SetBalance(BuildUiState(ResolvedState));
        ApplyResolvedState(main, BuildUiState(ResolvedState));
        MaybePlayWinSound(ResolvedState);
        PendingRevealState = null;
    };

    CoinViewerContainer.addEventListener("coinflip:finished", HandleCoinflipFinished);

    RenderLatestState();

    if (ShouldAutoplayInitialCountdown)
    {
        window.GamblingApp?.playSound?.("countdown", {
            restart: true,
        });
    }

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
