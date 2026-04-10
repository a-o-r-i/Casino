const HiddenLeaderboardPollMultiplier = 2.4;
const LeaderboardProfileCacheTtlMs = 2500;
const LeaderboardProfileHideDelayMs = 110;
const LeaderboardProfileSwitchDelayMs = 180;
const LeaderboardRuntimeKey = "__leaderboardPageRuntime";

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

const FormatRelativeTime = (Timestamp) =>
{
    if (!Timestamp)
    {
        return "Unknown";
    }

    const Delta = Math.max(0, Math.floor(Date.now() / 1000 - Timestamp));

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

const Clamp = (Value, Min, Max) =>
{
    return Math.min(Math.max(Value, Min), Max);
};

const Wait = (Delay) =>
{
    return new Promise((Resolve) =>
    {
        window.setTimeout(Resolve, Delay);
    });
};

const BuildAvatarMarkup = (Profile) =>
{
    const AvatarUrl = Profile?.avatar_static_url || Profile?.avatar_url || "";

    if (AvatarUrl)
    {
        return `
            <img
              alt="${EscapeLeaderboardHtml(Profile.display_name)}"
              src="${EscapeLeaderboardHtml(AvatarUrl)}"
            >
        `;
    }

    return EscapeLeaderboardHtml((Profile?.display_name || Profile?.username || "?").slice(0, 1));
};

const BuildProfileMarkup = (Profile) =>
{
    const BadgeMarkup = Profile.reward_badge
        ? `<div data-chat-profile-badge>Lvl ${EscapeLeaderboardHtml(Profile.reward_level)} · ${EscapeLeaderboardHtml(Profile.reward_badge)}</div>`
        : "";
    const StatusLabel = Profile.is_online ? "Online" : "Offline";

    return `
        <div data-chat-profile-head>
          <span data-chat-profile-avatar>${BuildAvatarMarkup(Profile)}</span>
          <div data-chat-profile-copy>
            <div data-chat-profile-name>${EscapeLeaderboardHtml(Profile.display_name)}</div>
            ${BadgeMarkup ? `<div data-chat-profile-badges>${BadgeMarkup}</div>` : ""}
            <div data-chat-profile-meta>
              <span
                data-chat-profile-status
                data-online="${Profile.is_online ? "true" : "false"}"
                aria-label="${EscapeLeaderboardHtml(StatusLabel)}"
                title="${EscapeLeaderboardHtml(StatusLabel)}"
              ></span>
              <div data-chat-profile-username>@${EscapeLeaderboardHtml(Profile.username)}</div>
            </div>
          </div>
        </div>
        <div data-chat-profile-grid>
          <div data-chat-profile-stat>
            <div data-chat-profile-stat-label>Registered</div>
            <div data-chat-profile-stat-value>${EscapeLeaderboardHtml(FormatRelativeTime(Profile.registered_at))}</div>
          </div>
          <div data-chat-profile-stat>
            <div data-chat-profile-stat-label>Wagered</div>
            <div data-chat-profile-stat-value>${EscapeLeaderboardHtml(Profile.total_wagered_display || "$0")}</div>
          </div>
        </div>
    `;
};

const RenderProfileMarkup = (Profile) =>
{
    return window.GamblingApp?.buildUserProfileCardMarkup?.(Profile) || "";
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
            <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 transition hover:border-white/14 hover:bg-white/[0.05]" data-leaderboard-user-id="${EscapeLeaderboardHtml(Row.id)}" data-route-card>
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
    const App = window.GamblingApp || {};
    const ExistingRuntime = App[LeaderboardRuntimeKey];

    if (ExistingRuntime?.dispose)
    {
        ExistingRuntime.dispose();
    }

    const LeaderboardRoot = main.querySelector("[data-leaderboard]");
    const LeaderboardList = main.querySelector("[data-leaderboard-list]");
    const ProfileCard = document.querySelector("[data-leaderboard-profile-card]");
    const ProfileUrlTemplate = document.body.dataset.chatUserProfileUrl || "";
    const ProfileCache = new Map();
    const InitialState = ParseLeaderboardState(main);
    const StateUrl = LeaderboardRoot?.dataset.stateUrl || "";
    let HoveredUserId = "";
    let HoverAnchor = null;
    let HoverHideTimeout = 0;
    let HoverRequestToken = 0;
    let IsDisposed = false;
    let PollTimeout = 0;
    let RenderedProfileUserId = "";
    let LastState = InitialState;
    const Runtime = {
        dispose: () => {},
    };

    App[LeaderboardRuntimeKey] = Runtime;

    if (LeaderboardRoot && window.getComputedStyle(LeaderboardRoot).position === "static")
    {
        LeaderboardRoot.style.position = "relative";
    }

    if (ProfileCard && LeaderboardRoot && ProfileCard.parentElement !== LeaderboardRoot)
    {
        LeaderboardRoot.appendChild(ProfileCard);
    }

    const BuildProfileUrl = (UserId) =>
    {
        return ProfileUrlTemplate.replace("__user_id__", encodeURIComponent(UserId));
    };

    const FetchProfile = async (UserId) =>
    {
        const Cached = ProfileCache.get(UserId);

        if (Cached && Date.now() - Cached.fetchedAt < LeaderboardProfileCacheTtlMs)
        {
            return Cached.data;
        }

        if (!ProfileUrlTemplate)
        {
            return null;
        }

        try
        {
            const Response = await fetch(BuildProfileUrl(UserId), {
                headers: {
                    Accept: "application/json",
                },
            });

            if (!Response.ok)
            {
                return null;
            }

            const Data = await Response.json();
            ProfileCache.set(UserId, {
                data: Data,
                fetchedAt: Date.now(),
            });
            return Data;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return null;
        }
    };

    const HideProfileCard = () =>
    {
        HoveredUserId = "";
        HoverAnchor = null;
        RenderedProfileUserId = "";

        if (!ProfileCard)
        {
            return;
        }

        ProfileCard.dataset.open = "false";
        ProfileCard.setAttribute("aria-hidden", "true");
    };

    const PositionProfileCard = () =>
    {
        if (!ProfileCard || !HoverAnchor || !ProfileCard.innerHTML.trim())
        {
            return;
        }

        const AnchorRect = HoverAnchor.getBoundingClientRect();
        const RootRect = LeaderboardRoot?.getBoundingClientRect();
        const CardRect = ProfileCard.getBoundingClientRect();
        const VerticalGap = 4;

        if (!RootRect)
        {
            return;
        }

        const Left = Clamp(
            AnchorRect.left - RootRect.left,
            12,
            Math.max(12, LeaderboardRoot.clientWidth - CardRect.width - 12),
        );
        const Top = Math.max(
            12,
            AnchorRect.bottom - RootRect.top + VerticalGap,
        );
        ProfileCard.style.left = `${Left}px`;
        ProfileCard.style.top = `${Top}px`;
    };

    const ScheduleHideProfileCard = () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
        }

        HoverHideTimeout = window.setTimeout(HideProfileCard, LeaderboardProfileHideDelayMs);
    };

    const ShowProfileCard = async (UserId, Anchor) =>
    {
        if (!ProfileCard || !UserId)
        {
            return;
        }

        HoveredUserId = UserId;
        HoverAnchor = Anchor;
        const RequestToken = ++HoverRequestToken;
        const ShouldAnimateSwitch = ProfileCard.dataset.open === "true"
            && RenderedProfileUserId
            && RenderedProfileUserId !== UserId;
        const ProfilePromise = FetchProfile(UserId);

        if (ShouldAnimateSwitch)
        {
            ProfileCard.dataset.open = "false";
            ProfileCard.setAttribute("aria-hidden", "true");
            await Wait(LeaderboardProfileSwitchDelayMs);
        }

        const Profile = await ProfilePromise;

        if (!Profile || RequestToken !== HoverRequestToken || HoveredUserId !== UserId || HoverAnchor !== Anchor)
        {
            return;
        }

        ProfileCard.innerHTML = RenderProfileMarkup(Profile);
        RenderedProfileUserId = UserId;
        PositionProfileCard();
        ProfileCard.dataset.open = "true";
        ProfileCard.setAttribute("aria-hidden", "false");

        window.requestAnimationFrame(() =>
        {
            if (IsDisposed || HoveredUserId !== UserId || HoverAnchor !== Anchor)
            {
                return;
            }

            PositionProfileCard();
        });
    };

    const RenderState = (State, ReplaceList = false) =>
    {
        if (!State)
        {
            return;
        }

        if (ReplaceList && LeaderboardList)
        {
            LeaderboardList.innerHTML = RenderLeaderboardRows(State.rows);

            if (HoverAnchor && !LeaderboardList.contains(HoverAnchor))
            {
                HideProfileCard();
            }
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

    const HandleListMouseOver = (EventValue) =>
    {
        const Trigger = EventValue.target.closest("[data-leaderboard-user-id]");

        if (!Trigger || !LeaderboardList.contains(Trigger))
        {
            return;
        }

        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
            HoverHideTimeout = 0;
        }

        const UserId = Trigger.dataset.leaderboardUserId || "";

        if (!UserId || (HoveredUserId === UserId && HoverAnchor === Trigger))
        {
            return;
        }

        ShowProfileCard(UserId, Trigger).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const HandleListMouseOut = (EventValue) =>
    {
        const Trigger = EventValue.target.closest("[data-leaderboard-user-id]");

        if (!Trigger)
        {
            return;
        }

        const RelatedTarget = EventValue.relatedTarget instanceof Element ? EventValue.relatedTarget : null;

        if (RelatedTarget?.closest("[data-leaderboard-profile-card]"))
        {
            return;
        }

        if (RelatedTarget?.closest("[data-leaderboard-user-id]") === Trigger)
        {
            return;
        }

        ScheduleHideProfileCard();
    };

    const HandleCardMouseEnter = () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
            HoverHideTimeout = 0;
        }
    };

    const HandleCardMouseLeave = () =>
    {
        ScheduleHideProfileCard();
    };

    LeaderboardList?.addEventListener("mouseover", HandleListMouseOver);
    LeaderboardList?.addEventListener("mouseout", HandleListMouseOut);
    ProfileCard?.addEventListener("mouseenter", HandleCardMouseEnter);
    ProfileCard?.addEventListener("mouseleave", HandleCardMouseLeave);
    window.addEventListener("resize", PositionProfileCard);

    if (StateUrl)
    {
        ScheduleTick();
    }

    const Dispose = () =>
    {
        if (IsDisposed)
        {
            return;
        }

        IsDisposed = true;
        HideProfileCard();

        if (PollTimeout)
        {
            window.clearTimeout(PollTimeout);
        }

        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
        }

        LeaderboardList?.removeEventListener("mouseover", HandleListMouseOver);
        LeaderboardList?.removeEventListener("mouseout", HandleListMouseOut);
        ProfileCard?.removeEventListener("mouseenter", HandleCardMouseEnter);
        ProfileCard?.removeEventListener("mouseleave", HandleCardMouseLeave);
        window.removeEventListener("resize", PositionProfileCard);

        if (App[LeaderboardRuntimeKey] === Runtime)
        {
            delete App[LeaderboardRuntimeKey];
        }
    };

    Runtime.dispose = Dispose;
    return Dispose;
};

window.GamblingApp?.registerPageInitializer("leaderboard", InitializeLeaderboardPage);
