(() =>
{
const PreviousBetStorageKey = "coinflip.previousBetAmount";
const HiddenPollMultiplier = 2.4;

const ParseAmount = (RawValue) =>
{
    const ParsedValue = Number.parseFloat(RawValue);

    if (!Number.isFinite(ParsedValue))
    {
        return null;
    }

    return ParsedValue;
};

const FormatAmount = (Amount) =>
{
    return Amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
};

const ParseLobbyState = (Main) =>
{
    const StateNode = Main.querySelector("[data-coinflip-lobby-state]");

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

const EscapeHtml = (Value) =>
{
    return String(Value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
};

const AddListener = (CleanupFunctions, Target, EventName, Handler) =>
{
    if (!Target)
    {
        return;
    }

    Target.addEventListener(EventName, Handler);
    CleanupFunctions.push(() =>
    {
        Target.removeEventListener(EventName, Handler);
    });
};

const SetBalanceDisplay = (BalanceDisplay) =>
{
    if (typeof BalanceDisplay !== "string")
    {
        return;
    }

    const BalanceValue = document.querySelector("[data-balance-display]");

    if (!BalanceValue)
    {
        return;
    }

    BalanceValue.textContent = BalanceDisplay;
};

const FormatSessionSummary = (Summary) =>
{
    if (!Summary)
    {
        return "";
    }

    const Parts = [`${Summary.open} open`];

    if (Summary.live)
    {
        Parts.push(`${Summary.live} live`);
    }

    if (Summary.resolved)
    {
        Parts.push(`${Summary.resolved} finished`);
    }

    return Parts.join(" \u00b7 ");
};

const FormatLobbyStatusText = (CoinflipSession) =>
{
    if (!CoinflipSession)
    {
        return "";
    }

    if (CoinflipSession.status !== "countdown" || !CoinflipSession.countdown_ends_at)
    {
        return CoinflipSession.status_text;
    }

    const RemainingSeconds = Math.max(0, Math.ceil(CoinflipSession.countdown_ends_at - Date.now() / 1000));

    if (RemainingSeconds <= 0)
    {
        return "Starting...";
    }

    return `Starts in ${RemainingSeconds} second${RemainingSeconds === 1 ? "" : "s"}.`;
};

const BuildSessionActionMarkup = (CoinflipSession) =>
{
    if (CoinflipSession.is_joinable)
    {
        return `
            <button
              class="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10"
              data-join-action="${EscapeHtml(CoinflipSession.join_url)}"
              data-join-bet="${EscapeHtml(CoinflipSession.bet_display)}"
              data-join-choice="${EscapeHtml(CoinflipSession.creator_choice)}"
              data-join-creator="${EscapeHtml(CoinflipSession.creator_name)}"
              data-join-view-url="${EscapeHtml(CoinflipSession.view_url)}"
              data-open-join-modal
              type="button"
            >
              Join session
            </button>
        `;
    }

    return `
        <a
          class="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10"
          href="${EscapeHtml(CoinflipSession.view_url)}"
        >
          View session
        </a>
    `;
};

const BuildSessionCardMarkup = (CoinflipSession) =>
{
    return `
        <div class="flex flex-col gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 transition-opacity ${CoinflipSession.status === "resolved" ? "opacity-40" : "opacity-100"} md:flex-row md:items-center md:justify-between" data-route-card>
          <div>
            <p class="text-lg font-semibold text-white">${EscapeHtml(CoinflipSession.creator_name)}</p>
            <p class="mt-1 text-sm text-white/55">
              ${EscapeHtml(CoinflipSession.creator_choice)} &middot; Bet ${EscapeHtml(CoinflipSession.bet_display)} &middot; Pot ${EscapeHtml(CoinflipSession.pot_display)}
            </p>
            <p class="mt-1 text-sm text-white/40" data-session-card-status="${EscapeHtml(CoinflipSession.id)}">${EscapeHtml(FormatLobbyStatusText(CoinflipSession))}</p>
          </div>

          ${BuildSessionActionMarkup(CoinflipSession)}
        </div>
    `;
};

const RenderSessionList = (SessionList, Sessions) =>
{
    if (!SessionList)
    {
        return;
    }

    if (!Sessions?.length)
    {
        SessionList.innerHTML = `
            <div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45" data-route-card>
              No sessions yet. Create the first one.
            </div>
        `;
        return;
    }

    SessionList.innerHTML = Sessions.map((CoinflipSession) => BuildSessionCardMarkup(CoinflipSession)).join("");
};

const UpdateLobbyCountdowns = (Main, State) =>
{
    if (!State?.sessions?.length)
    {
        return;
    }

    const SessionMap = new Map(
        State.sessions.map((CoinflipSession) =>
        {
            return [CoinflipSession.id, CoinflipSession];
        }),
    );

    Main.querySelectorAll("[data-session-card-status]").forEach((StatusNode) =>
    {
        const CoinflipSession = SessionMap.get(StatusNode.dataset.sessionCardStatus || "");

        if (!CoinflipSession)
        {
            return;
        }

        StatusNode.textContent = FormatLobbyStatusText(CoinflipSession);
    });
};

const GetCountdownSoundSignature = (CoinflipSession) =>
{
    if (
        !CoinflipSession ||
        CoinflipSession.status !== "countdown" ||
        !Number.isFinite(Number(CoinflipSession.countdown_ends_at))
    )
    {
        return "";
    }

    return `${CoinflipSession.id || ""}:${Number(CoinflipSession.countdown_ends_at)}`;
};

const CollectCountdownSoundSignatures = (State) =>
{
    const Signatures = new Set();

    if (!State?.sessions?.length)
    {
        return Signatures;
    }

    State.sessions.forEach((CoinflipSession) =>
    {
        const Signature = GetCountdownSoundSignature(CoinflipSession);

        if (Signature)
        {
            Signatures.add(Signature);
        }
    });

    return Signatures;
};

const UpdateCreateBalanceLabel = (BalanceDisplay) =>
{
    if (typeof BalanceDisplay !== "string")
    {
        return;
    }

    const Label = document.querySelector("[data-create-balance-max]");

    if (!Label)
    {
        return;
    }

    Label.textContent = `Max ${BalanceDisplay}`;
};

const RenderLobbyState = (Main, State, ReplaceList = false) =>
{
    if (!State)
    {
        return;
    }

    const SummaryNode = Main.querySelector("[data-session-summary]");
    const SessionList = Main.querySelector("[data-session-list]");

    if (SummaryNode)
    {
        SummaryNode.textContent = FormatSessionSummary(State.session_summary);
    }

    if (ReplaceList)
    {
        RenderSessionList(SessionList, State.sessions);
    }

    SetBalanceDisplay(State.current_balance_display);
    UpdateCreateBalanceLabel(State.current_balance_display);
    UpdateLobbyCountdowns(Main, State);
};

const GetPollDelay = (State) =>
{
    const BaseDelay = Math.max(State?.poll_interval_ms || 2600, 1200);
    return document.visibilityState === "hidden" ? Math.round(BaseDelay * HiddenPollMultiplier) : BaseDelay;
};

const FetchLobbyState = async (StateUrl, Version) =>
{
    try
    {
        const RequestUrl = new URL(StateUrl, window.location.href);

        if (Version)
        {
            RequestUrl.searchParams.set("version", Version);
        }

        const Response = await fetch(RequestUrl.href, {
            headers: {
                Accept: "application/json",
            },
        });

        if (Response.status === 204)
        {
            return {
                changed: false,
            };
        }

        if (!Response.ok)
        {
            return null;
        }

        return {
            changed: true,
            payload: await Response.json(),
        };
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return null;
    }
};

const InitializeCoinflipLobbyPage = ({ main }) =>
{
    const CleanupFunctions = [];
    const InitialState = ParseLobbyState(main);
    const LobbyRoot = main.querySelector("[data-coinflip-lobby]");
    const OverlayRoot = document.querySelector("[data-app-overlay-shell]") || document;
    const CreateModal = OverlayRoot.querySelector("[data-modal=\"coinflip-create\"]");
    const CreateModalController = window.GamblingApp?.getModalController(CreateModal);
    const JoinModal = OverlayRoot.querySelector("[data-modal=\"coinflip-join\"]");
    const JoinModalController = window.GamblingApp?.getModalController(JoinModal);
    const JoinModalCopy = OverlayRoot.querySelector("[data-join-modal-copy]");
    const JoinModalForm = OverlayRoot.querySelector("[data-join-modal-form]");
    const JoinModalViewLink = OverlayRoot.querySelector("[data-join-view-link]");
    const CreateForm = OverlayRoot.querySelector("[data-create-session-form]");
    const BetAmountInput = OverlayRoot.querySelector("[data-bet-amount-input]");
    const UsePreviousBetButton = OverlayRoot.querySelector("[data-use-previous-bet]");
    const AdjustBetButtons = OverlayRoot.querySelectorAll("[data-adjust-bet]");
    const StateUrl = LobbyRoot?.dataset.stateUrl || "";
    let IsDisposed = false;
    let PollTimeout = 0;
    let CountdownInterval = 0;
    let LastState = InitialState;
    let PlayedCountdownSoundSignatures = CollectCountdownSoundSignatures(InitialState);
    let MaxAmount = Math.max(Number.parseInt(CreateForm?.dataset.balanceCents || "0", 10) / 100, 0);

    const HandleSubmitNavigation = async (Form, Controller) =>
    {
        if (!Form || !Controller || !window.GamblingApp?.navigateTo)
        {
            return;
        }

        const ActionUrl = Form.action || window.location.href;
        const FormDataValue = new FormData(Form);

        await Controller.close();
        await window.GamblingApp.navigateTo(ActionUrl, {
            requestInit: {
                body: FormDataValue,
                method: "POST",
            },
        });
    };

    const ApplyBalanceState = (State) =>
    {
        if (!CreateForm || !State || !Number.isFinite(State.current_balance_cents))
        {
            return;
        }

        CreateForm.dataset.balanceCents = String(State.current_balance_cents);
        MaxAmount = Math.max(State.current_balance_cents / 100, 0);
    };

    if (LastState)
    {
        RenderLobbyState(main, LastState);
        ApplyBalanceState(LastState);
    }

    const MaybePlayCountdownSound = (State) =>
    {
        const NextSignatures = CollectCountdownSoundSignatures(State);
        const ShouldPlay = Array.from(NextSignatures).some((Signature) =>
        {
            return !PlayedCountdownSoundSignatures.has(Signature);
        });

        PlayedCountdownSoundSignatures = NextSignatures;

        if (!ShouldPlay)
        {
            return;
        }

        window.GamblingApp?.playSound?.("countdown", {
            restart: true,
        });
    };

    const ClampAmount = (Amount) =>
    {
        if (!Number.isFinite(Amount))
        {
            return null;
        }

        const RoundedAmount = Math.round(Amount * 100) / 100;
        return Math.min(MaxAmount, Math.max(0, RoundedAmount));
    };

    const SetAmount = (Amount) =>
    {
        if (!BetAmountInput)
        {
            return;
        }

        const ClampedAmount = ClampAmount(Amount);

        if (!ClampedAmount)
        {
            BetAmountInput.value = "";
            return;
        }

        BetAmountInput.value = FormatAmount(ClampedAmount);
    };

    const GetCurrentAmount = () =>
    {
        if (!BetAmountInput)
        {
            return null;
        }

        return ParseAmount(BetAmountInput.value);
    };

    AddListener(CleanupFunctions, main, "click", (EventValue) =>
    {
        const Button = EventValue.target.closest("[data-open-join-modal]");

        if (!Button || !main.contains(Button))
        {
            return;
        }

        if (!JoinModalController || !JoinModalForm || !JoinModalCopy || !JoinModalViewLink)
        {
            return;
        }

        JoinModalForm.action = Button.dataset.joinAction || "";
        JoinModalViewLink.href = Button.dataset.joinViewUrl || Button.dataset.joinAction || window.location.href;
        JoinModalCopy.textContent =
            `${Button.dataset.joinCreator} picked ${Button.dataset.joinChoice}. ` +
            `You will join for ${Button.dataset.joinBet}.`;
        JoinModalController.open().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    if (BetAmountInput)
    {
        AddListener(CleanupFunctions, BetAmountInput, "input", () =>
        {
            const CurrentAmount = GetCurrentAmount();

            if (CurrentAmount === null)
            {
                return;
            }

            if (CurrentAmount > MaxAmount)
            {
                SetAmount(MaxAmount);
            }
        });

        AddListener(CleanupFunctions, BetAmountInput, "blur", () =>
        {
            const CurrentAmount = GetCurrentAmount();

            if (CurrentAmount === null)
            {
                return;
            }

            SetAmount(CurrentAmount);
        });
    }

    AddListener(CleanupFunctions, UsePreviousBetButton, "click", () =>
    {
        const PreviousAmount = ParseAmount(window.localStorage.getItem(PreviousBetStorageKey));

        if (PreviousAmount === null)
        {
            return;
        }

        SetAmount(PreviousAmount);
    });

    AdjustBetButtons.forEach((Button) =>
    {
        AddListener(CleanupFunctions, Button, "click", () =>
        {
            const CurrentAmount = GetCurrentAmount() ?? ParseAmount(window.localStorage.getItem(PreviousBetStorageKey)) ?? 0;
            const NextAmount = Button.dataset.adjustBet === "double" ? CurrentAmount * 2 : CurrentAmount / 2;
            SetAmount(NextAmount);
        });
    });

    AddListener(CleanupFunctions, CreateForm, "submit", () =>
    {
        if (!BetAmountInput)
        {
            return;
        }

        const CurrentAmount = GetCurrentAmount();

        if (CurrentAmount === null)
        {
            return;
        }

        const ClampedAmount = ClampAmount(CurrentAmount);

        if (!ClampedAmount)
        {
            return;
        }

        const FormattedAmount = FormatAmount(ClampedAmount);
        BetAmountInput.value = FormattedAmount;
        window.localStorage.setItem(PreviousBetStorageKey, FormattedAmount);
    });

    AddListener(CleanupFunctions, CreateForm, "submit", (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        EventValue.preventDefault();
        EventValue.stopPropagation();

        HandleSubmitNavigation(CreateForm, CreateModalController).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    AddListener(CleanupFunctions, JoinModalForm, "submit", (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        EventValue.preventDefault();
        EventValue.stopPropagation();

        HandleSubmitNavigation(JoinModalForm, JoinModalController).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    const ScheduleTick = (Delay = GetPollDelay(LastState)) =>
    {
        if (IsDisposed || !StateUrl)
        {
            return;
        }

        PollTimeout = window.setTimeout(Tick, Delay);
    };

    const Tick = async () =>
    {
        if (IsDisposed || !StateUrl)
        {
            return;
        }

        const Result = await FetchLobbyState(StateUrl, LastState?.version || "");

        if (IsDisposed)
        {
            return;
        }

        if (!Result)
        {
            ScheduleTick(Math.max(GetPollDelay(LastState), 2400));
            return;
        }

        if (Result.changed && Result.payload)
        {
            MaybePlayCountdownSound(Result.payload);
            LastState = Result.payload;
            RenderLobbyState(main, LastState, true);
            ApplyBalanceState(LastState);
        }
        else if (LastState)
        {
            UpdateLobbyCountdowns(main, LastState);
        }

        ScheduleTick();
    };

    if (StateUrl)
    {
        ScheduleTick();
    }

    CountdownInterval = window.setInterval(() =>
    {
        if (IsDisposed || !LastState)
        {
            return;
        }

        UpdateLobbyCountdowns(main, LastState);
    }, 1000);

    return () =>
    {
        IsDisposed = true;

        if (CountdownInterval)
        {
            window.clearInterval(CountdownInterval);
        }

        if (PollTimeout)
        {
            window.clearTimeout(PollTimeout);
        }

        CleanupFunctions.forEach((Cleanup) => Cleanup());
    };
};

window.GamblingApp?.registerPageInitializer("coinflip-lobby", InitializeCoinflipLobbyPage);
})();
