const HiddenLeaderboardPollMultiplier = 2.4;

const ParseLeaderboardState = (Main) =>
{
    const StateNode = Main.querySelector("[data-leaderboard-state]");

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

const EscapeLeaderboardHtml = (Value) =>
{
    return String(Value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
};

const SetLeaderboardBalanceDisplay = (BalanceDisplay) =>
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

const RenderLeaderboardRows = (Rows) =>
{
    if (!Rows?.length)
    {
        return `
            <div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45" data-route-card>
              No balances yet.
            </div>
        `;
    }

    return Rows.map((Row) =>
    {
        return `
            <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4" data-route-card>
              <div>
                <p class="text-lg font-semibold text-white">${EscapeLeaderboardHtml(Row.display_name)}</p>
                <p class="text-sm text-white/40">${EscapeLeaderboardHtml(Row.id)}</p>
              </div>
              <p class="text-lg font-semibold text-white">${EscapeLeaderboardHtml(Row.balance_display)}</p>
            </div>
        `;
    }).join("");
};

const GetLeaderboardPollDelay = (State) =>
{
    const BaseDelay = Math.max(State?.poll_interval_ms || 5000, 2000);
    return document.visibilityState === "hidden" ? Math.round(BaseDelay * HiddenLeaderboardPollMultiplier) : BaseDelay;
};

const FetchLeaderboardState = async (StateUrl, Version) =>
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

const InitializeLeaderboardPage = ({ main }) =>
{
    const LeaderboardRoot = main.querySelector("[data-leaderboard]");
    const LeaderboardList = main.querySelector("[data-leaderboard-list]");
    const InitialState = ParseLeaderboardState(main);
    const StateUrl = LeaderboardRoot?.dataset.stateUrl || "";
    let IsDisposed = false;
    let PollTimeout = 0;
    let LastState = InitialState;

    const RenderState = (State, ReplaceList = false) =>
    {
        if (!State)
        {
            return;
        }

        if (ReplaceList && LeaderboardList)
        {
            LeaderboardList.innerHTML = RenderLeaderboardRows(State.rows);
        }

        SetLeaderboardBalanceDisplay(State.current_balance_display);
    };

    if (LastState)
    {
        RenderState(LastState);
    }

    const ScheduleTick = (Delay = GetLeaderboardPollDelay(LastState)) =>
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

        const Result = await FetchLeaderboardState(StateUrl, LastState?.version || "");

        if (IsDisposed)
        {
            return;
        }

        if (!Result)
        {
            ScheduleTick(Math.max(GetLeaderboardPollDelay(LastState), 3500));
            return;
        }

        if (Result.changed && Result.payload)
        {
            LastState = Result.payload;
            RenderState(LastState, true);
        }

        ScheduleTick();
    };

    if (StateUrl)
    {
        ScheduleTick();
    }

    return () =>
    {
        IsDisposed = true;

        if (PollTimeout)
        {
            window.clearTimeout(PollTimeout);
        }
    };
};

window.GamblingApp?.registerPageInitializer("leaderboard", InitializeLeaderboardPage);
