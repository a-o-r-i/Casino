(() =>
{
    const RuntimeKey = "__playPageRuntime";
    const ProfileCacheTtlMs = 2500;

    const Clamp = (Value, Min, Max) =>
    {
        return Math.min(Math.max(Value, Min), Max);
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

    const BuildFallbackProfileMarkup = (Profile) =>
    {
        const AvatarUrl = Profile?.avatar_static_url || Profile?.avatar_url || "";
        const AvatarMarkup = AvatarUrl
            ? `<img alt="${EscapeHtml(Profile.display_name)}" src="${EscapeHtml(AvatarUrl)}">`
            : EscapeHtml((Profile?.display_name || Profile?.username || "?").slice(0, 1));

        return `
            <div data-chat-profile-head>
              <span data-chat-profile-avatar>${AvatarMarkup}</span>
              <div data-chat-profile-copy>
                <div data-chat-profile-name>${EscapeHtml(Profile.display_name)}</div>
                <div data-chat-profile-meta>
                  <span data-chat-profile-status data-online="${Profile.is_online ? "true" : "false"}"></span>
                  <div data-chat-profile-username>@${EscapeHtml(Profile.username)}</div>
                </div>
              </div>
            </div>
        `;
    };

    const InitializePlayPage = ({ main }) =>
    {
        const App = window.GamblingApp || {};
        const ExistingRuntime = App[RuntimeKey];

        if (ExistingRuntime?.dispose)
        {
            ExistingRuntime.dispose();
        }

        const Root = main.querySelector("[data-play-recent-wins]");
        const ProfileCard = Root?.querySelector("[data-play-profile-card]");
        const ProfileUrlTemplate = document.body.dataset.chatUserProfileUrl || "";
        const ProfileCache = new Map();
        let ActiveAnchor = null;
        let ActiveUserId = "";
        let RequestToken = 0;
        let IsDisposed = false;
        const Runtime = {
            dispose: () => {},
        };

        App[RuntimeKey] = Runtime;

        if (!Root || !ProfileCard || !ProfileUrlTemplate)
        {
            return;
        }

        const BuildProfileUrl = (UserId) =>
        {
            return ProfileUrlTemplate.replace("__user_id__", encodeURIComponent(UserId));
        };

        const FetchProfile = async (UserId) =>
        {
            const Cached = ProfileCache.get(UserId);

            if (Cached && Date.now() - Cached.fetchedAt < ProfileCacheTtlMs)
            {
                return Cached.data;
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
            ActiveAnchor = null;
            ActiveUserId = "";
            ProfileCard.dataset.open = "false";
            ProfileCard.setAttribute("aria-hidden", "true");
        };

        const PositionProfileCard = () =>
        {
            if (!ActiveAnchor || ProfileCard.dataset.open !== "true")
            {
                return;
            }

            const RootRect = Root.getBoundingClientRect();
            const AnchorRect = ActiveAnchor.getBoundingClientRect();
            const CardRect = ProfileCard.getBoundingClientRect();
            const Left = Clamp(
                AnchorRect.left - RootRect.left,
                12,
                Math.max(12, Root.clientWidth - CardRect.width - 12),
            );
            const Top = Math.max(12, AnchorRect.bottom - RootRect.top + 8);

            ProfileCard.style.left = `${Left}px`;
            ProfileCard.style.top = `${Top}px`;
        };

        const ShowProfileCard = async (UserId, Anchor) =>
        {
            if (!UserId)
            {
                return;
            }

            ActiveAnchor = Anchor;
            ActiveUserId = UserId;
            const CurrentRequestToken = ++RequestToken;
            const Profile = await FetchProfile(UserId);

            if (
                IsDisposed ||
                !Profile ||
                CurrentRequestToken !== RequestToken ||
                ActiveUserId !== UserId ||
                ActiveAnchor !== Anchor
            )
            {
                return;
            }

            ProfileCard.innerHTML = App.buildUserProfileCardMarkup?.(Profile, {
                includeTipControls: false,
            }) || BuildFallbackProfileMarkup(Profile);
            ProfileCard.dataset.open = "true";
            ProfileCard.setAttribute("aria-hidden", "false");
            PositionProfileCard();
            window.requestAnimationFrame(PositionProfileCard);
        };

        const HandleRootClick = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;
            const Trigger = Target?.closest("[data-play-profile-trigger][data-user-id]");

            if (!Trigger || !Root.contains(Trigger))
            {
                return;
            }

            EventValue.preventDefault();
            EventValue.stopPropagation();

            ShowProfileCard(Trigger.dataset.userId || "", Trigger).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        };

        const HandleDocumentClick = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (Target?.closest("[data-play-profile-card]"))
            {
                return;
            }

            if (Target?.closest("[data-play-profile-trigger]"))
            {
                return;
            }

            HideProfileCard();
        };

        const HandleKeyDown = (EventValue) =>
        {
            if (EventValue.key === "Escape")
            {
                HideProfileCard();
            }
        };

        Root.addEventListener("click", HandleRootClick);
        document.addEventListener("click", HandleDocumentClick);
        document.addEventListener("keydown", HandleKeyDown);
        window.addEventListener("resize", PositionProfileCard);
        window.addEventListener("scroll", PositionProfileCard, true);

        const Dispose = () =>
        {
            if (IsDisposed)
            {
                return;
            }

            IsDisposed = true;
            HideProfileCard();
            Root.removeEventListener("click", HandleRootClick);
            document.removeEventListener("click", HandleDocumentClick);
            document.removeEventListener("keydown", HandleKeyDown);
            window.removeEventListener("resize", PositionProfileCard);
            window.removeEventListener("scroll", PositionProfileCard, true);

            if (App[RuntimeKey] === Runtime)
            {
                delete App[RuntimeKey];
            }
        };

        Runtime.dispose = Dispose;
    };

    window.GamblingApp?.registerPageInitializer("play-home", InitializePlayPage);
})();
