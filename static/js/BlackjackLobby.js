(() =>
{
const HiddenPollMultiplier = 2.4;

const ParseLobbyState = (Main) =>
{
    const StateNode = Main.querySelector("[data-blackjack-lobby-state]");

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

const FormatRelativeTime = (Timestamp) =>
{
    const NumberValue = Number(Timestamp);

    if (!Number.isFinite(NumberValue) || NumberValue <= 0)
    {
        return "--";
    }

    const Delta = Math.max(0, Math.floor(Date.now() / 1000 - NumberValue));

    if (Delta < 60)
    {
        return `${Delta}s ago`;
    }

    if (Delta < 3600)
    {
        return `${Math.floor(Delta / 60)}m ago`;
    }

    if (Delta < 86400)
    {
        return `${Math.floor(Delta / 3600)}h ago`;
    }

    return `${Math.floor(Delta / 86400)}d ago`;
};

const FormatDuration = (Value) =>
{
    const NumberValue = Number(Value);

    if (!Number.isFinite(NumberValue) || NumberValue <= 0)
    {
        return "0s";
    }

    const Seconds = Math.ceil(NumberValue);

    if (Seconds < 60)
    {
        return `${Seconds}s`;
    }

    if (Seconds < 3600)
    {
        return `${Math.ceil(Seconds / 60)}m`;
    }

    return `${Math.floor(Seconds / 3600)}h ${Math.ceil((Seconds % 3600) / 60)}m`;
};

const FormatSessionSummary = (Summary) =>
{
    if (!Summary)
    {
        return "";
    }

    const Parts = [`${Summary.open || 0} open`];

    if (Summary.live)
    {
        Parts.push(`${Summary.live} live`);
    }

    return Parts.join(" \u00b7 ");
};

const BuildSessionCardMarkup = (BlackjackSession) =>
{
    const StatusToneClasses = BlackjackSession.status === "live"
        ? "bg-emerald-400/12 text-emerald-200"
        : "bg-white/[0.04] text-white/55";
    const WatchingCopy = BlackjackSession.viewer_count
        ? ` &middot; ${EscapeHtml(BlackjackSession.viewer_count)} watching`
        : "";
    const DeleteCopy = BlackjackSession.status === "live"
        ? "Deletion paused while seated"
        : `Deletes in ${FormatDuration(BlackjackSession.delete_remaining)}`;

    return `
        <a
          class="flex flex-col gap-4 rounded-[8px] border border-white/8 bg-white/[0.03] px-4 py-4 transition hover:bg-white/[0.05] md:flex-row md:items-center md:justify-between"
          data-route-card
          href="${EscapeHtml(BlackjackSession.view_url)}"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-lg font-semibold text-white">${EscapeHtml(BlackjackSession.table_name)}</p>
              <span class="inline-flex rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${StatusToneClasses}">
                ${EscapeHtml(BlackjackSession.status)}
              </span>
            </div>
            <p class="mt-1 text-sm text-white/55">
              ${EscapeHtml(BlackjackSession.creator_name)} &middot; ${EscapeHtml(BlackjackSession.seat_count)} seats &middot; Main ${EscapeHtml(BlackjackSession.limits_display)}
            </p>
            <p class="mt-1 text-sm text-white/40">
              ${EscapeHtml(BlackjackSession.occupancy_text)}${WatchingCopy}
            </p>
            <p class="mt-1 text-xs text-white/32">
              Created ${EscapeHtml(FormatRelativeTime(BlackjackSession.created_at))} &middot; ${EscapeHtml(DeleteCopy)}
            </p>
          </div>

          <span class="inline-flex h-11 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10">
            Open session
          </span>
        </a>
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
            <div class="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45" data-route-card>
              No sessions yet. Create the first one.
            </div>
        `;
        return;
    }

    SessionList.innerHTML = Sessions.map((BlackjackSession) => BuildSessionCardMarkup(BlackjackSession)).join("");
};

const RenderStaticTimeNodes = (Main) =>
{
    Main.querySelectorAll("[data-blackjack-created-at]").forEach((Node) =>
    {
        Node.textContent = FormatRelativeTime(Node.dataset.blackjackCreatedAt);
    });
    Main.querySelectorAll("[data-blackjack-delete-remaining]").forEach((Node) =>
    {
        Node.textContent = FormatDuration(Node.dataset.blackjackDeleteRemaining);
    });
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
    else
    {
        RenderStaticTimeNodes(Main);
    }

    if (typeof State.current_balance_display === "string")
    {
        window.GamblingApp?.setGlobalBalanceDisplay?.(State.current_balance_display);
    }
};

const GetPollDelay = (State) =>
{
    const BaseDelay = Math.max(State?.poll_interval_ms || 3200, 1400);
    return document.visibilityState === "hidden"
        ? Math.round(BaseDelay * HiddenPollMultiplier)
        : BaseDelay;
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

const InitializeBlackjackLobbyPage = ({ main }) =>
{
    const LobbyRoot = main.querySelector("[data-blackjack-lobby]");
    const CleanupFunctions = [];
    let State = ParseLobbyState(main);
    let PollHandle = 0;
    let IsDisposed = false;

    if (!LobbyRoot || !State)
    {
        return undefined;
    }

    const SchedulePoll = () =>
    {
        if (IsDisposed)
        {
            return;
        }

        window.clearTimeout(PollHandle);
        PollHandle = window.setTimeout(PollState, GetPollDelay(State));
    };

    const PollState = async () =>
    {
        const Response = await FetchLobbyState(LobbyRoot.dataset.stateUrl || "", State?.version);

        if (IsDisposed)
        {
            return;
        }

        if (!Response)
        {
            SchedulePoll();
            return;
        }

        if (Response.changed && Response.payload)
        {
            State = Response.payload;
            RenderLobbyState(main, State, true);
        }

        SchedulePoll();
    };

    const HandleVisibilityChange = () =>
    {
        if (document.visibilityState !== "visible")
        {
            return;
        }

        window.clearTimeout(PollHandle);
        PollHandle = window.setTimeout(PollState, 160);
    };

    RenderLobbyState(main, State, false);
    document.addEventListener("visibilitychange", HandleVisibilityChange);
    CleanupFunctions.push(() =>
    {
        document.removeEventListener("visibilitychange", HandleVisibilityChange);
    });

    SchedulePoll();

    return () =>
    {
        IsDisposed = true;
        window.clearTimeout(PollHandle);

        for (let Index = CleanupFunctions.length - 1; Index >= 0; Index -= 1)
        {
            CleanupFunctions[Index]();
        }
    };
};

window.GamblingApp?.registerPageInitializer("blackjack-lobby", InitializeBlackjackLobbyPage);
})();
/* github-refresh: 2026-05-02T02:31:53Z */
