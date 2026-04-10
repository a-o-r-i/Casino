(() =>
{
    const ChatShell = document.querySelector("[data-site-chat-shell]");

    if (!ChatShell)
    {
        return;
    }

    const HiddenPollMultiplier = 2.4;
    const PresenceHeartbeatIntervalMs = 4000;
    const ProfileCacheTtlMs = 1500;
    const Body = document.body;
    const CurrentUserId = Body.dataset.chatCurrentUserId || "";
    const PresenceHeartbeatUrl = Body.dataset.presenceHeartbeatUrl || "";
    const PresenceOfflineUrl = Body.dataset.presenceOfflineUrl || "";
    const SendUrl = Body.dataset.chatSendUrl || "";
    const StateUrl = Body.dataset.chatStateUrl || "";
    const UserProfileUrlTemplate = Body.dataset.chatUserProfileUrl || "";
    const ChatMessages = ChatShell.querySelector("[data-chat-messages]");
    const ChatComposer = ChatShell.querySelector("[data-chat-composer]");
    const ChatError = ChatShell.querySelector("[data-chat-error]");
    const ChatInput = ChatShell.querySelector("[data-chat-input]");
    const ChatOnlineCount = ChatShell.querySelector("[data-chat-online-count]");
    const ChatPanel = ChatShell.querySelector("[data-site-chat]");
    const ChatProfileCard = ChatShell.querySelector("[data-chat-profile-card]");
    const ChatCloseButton = ChatShell.querySelector("[data-chat-close]");
    const ChatSendButton = ChatShell.querySelector("[data-chat-send]");
    const ChatToggleButton = ChatShell.querySelector("[data-chat-toggle]");
    const EmptyStateMarkup = `<div data-chat-empty>No messages yet.</div>`;
    const ProfileCache = new Map();
    let CurrentMessages = [];
    let HoveredUserId = "";
    let HoverAnchor = null;
    let HoverHideTimeout = 0;
    let HoverRequestToken = 0;
    let IsSending = false;
    let LastStatePayload = null;
    let LatestMessageId = 0;
    let PresenceHeartbeatInterval = 0;
    let PollTimeout = 0;
    let RelativeTimeInterval = 0;
    let SentOfflinePresence = false;
    let IsSendingTip = false;

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

    const IsMobileViewport = () =>
    {
        return window.matchMedia("(max-width: 640px)").matches;
    };

    const SetChatOpen = (ShouldOpen, Options = {}) =>
    {
        const FocusComposer = Options.FocusComposer ?? true;

        ChatShell.dataset.chatOpen = ShouldOpen ? "true" : "false";

        if (ChatPanel)
        {
            ChatPanel.setAttribute("aria-hidden", ShouldOpen ? "false" : "true");
        }

        if (ChatToggleButton)
        {
            ChatToggleButton.setAttribute("aria-expanded", ShouldOpen ? "true" : "false");
            ChatToggleButton.setAttribute("aria-label", ShouldOpen ? "Close chat" : "Open chat");
        }

        if (!ShouldOpen)
        {
            HideProfileCard();
            return;
        }

        requestAnimationFrame(() =>
        {
            ScrollToBottom();

            if (FocusComposer)
            {
                ChatInput?.focus();
            }
        });
    };

    const BuildAvatarMarkup = (User) =>
    {
        const FallbackUrl = User?.avatar_static_url || User?.avatar_url || "";
        const AvatarUrl = FallbackUrl || User?.avatar_url || "";

        if (AvatarUrl)
        {
            return `
                <img
                  alt="${EscapeHtml(User.display_name)}"
                  data-avatar-fallback-src="${EscapeHtml(FallbackUrl)}"
                  src="${EscapeHtml(AvatarUrl)}"
                >
            `;
        }

        return EscapeHtml((User?.display_name || User?.username || "?").slice(0, 1));
    };

    const HandleAvatarError = (EventValue) =>
    {
        const Image = EventValue.target;

        if (!(Image instanceof HTMLImageElement))
        {
            return;
        }

        const FallbackSrc = Image.dataset.avatarFallbackSrc || "";

        if (!FallbackSrc)
        {
            return;
        }

        const CurrentSrc = Image.currentSrc || Image.src;
        const ResolvedFallbackSrc = new URL(FallbackSrc, window.location.href).href;

        if (CurrentSrc === ResolvedFallbackSrc)
        {
            return;
        }

        Image.src = FallbackSrc;
    };

    const BuildMessageMarkup = (Message) =>
    {
        return `
            <div data-chat-row data-self="${Message.is_self ? "true" : "false"}">
              <article data-chat-message>
                <div data-chat-author data-user-id="${EscapeHtml(Message.author.id)}">
                  <span data-chat-avatar>${BuildAvatarMarkup(Message.author)}</span>
                  <span>
                    <span data-chat-author-name>${EscapeHtml(Message.author.display_name)}</span>
                    <span data-chat-author-time data-chat-message-time data-timestamp="${EscapeHtml(Message.timestamp)}">
                      ${EscapeHtml(FormatRelativeTime(Message.timestamp))}
                    </span>
                  </span>
                </div>
                <div data-chat-bubble>${EscapeHtml(Message.body)}</div>
              </article>
            </div>
        `;
    };

    const ScrollToBottom = () =>
    {
        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    };

    const IsNearBottom = () =>
    {
        return ChatMessages.scrollHeight - ChatMessages.scrollTop - ChatMessages.clientHeight < 48;
    };

    const RenderMessages = ({ forceScroll = false } = {}) =>
    {
        const ShouldStickToBottom = forceScroll || IsNearBottom();

        if (!CurrentMessages.length)
        {
            ChatMessages.innerHTML = EmptyStateMarkup;
            return;
        }

        ChatMessages.innerHTML = CurrentMessages.map((Message) => BuildMessageMarkup(Message)).join("");

        if (ShouldStickToBottom)
        {
            requestAnimationFrame(ScrollToBottom);
        }
    };

    const UpdateComposerState = () =>
    {
        const HasValue = Boolean(ChatInput?.value.trim());

        if (ChatSendButton)
        {
            ChatSendButton.disabled = !HasValue || IsSending;
        }
    };

    const SetChatError = (Message) =>
    {
        if (!ChatError)
        {
            return;
        }

        ChatError.textContent = Message || "";
    };

    const UpdateRelativeTimes = () =>
    {
        ChatShell.querySelectorAll("[data-chat-message-time]").forEach((Node) =>
        {
            const Timestamp = Number.parseInt(Node.dataset.timestamp || "0", 10);
            Node.textContent = FormatRelativeTime(Timestamp);
        });
    };

    const GetPollDelay = () =>
    {
        const BaseDelay = Math.max(LastStatePayload?.poll_interval_ms || 2200, 1400);
        return document.visibilityState === "hidden" ? Math.round(BaseDelay * HiddenPollMultiplier) : BaseDelay;
    };

    const FetchChatState = async () =>
    {
        if (!StateUrl || document.visibilityState === "hidden")
        {
            return null;
        }

        try
        {
            const RequestUrl = new URL(StateUrl, window.location.href);
            RequestUrl.searchParams.set("since", String(LatestMessageId));

            const Response = await fetch(RequestUrl.href, {
                headers: {
                    Accept: "application/json",
                },
            });
            const ContentType = Response.headers.get("content-type") || "";

            if (!Response.ok || !ContentType.includes("application/json"))
            {
                return null;
            }

            return await Response.json();
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return null;
        }
    };

    const ClearPollTimeout = () =>
    {
        if (!PollTimeout)
        {
            return;
        }

        window.clearTimeout(PollTimeout);
        PollTimeout = 0;
    };

    const MergeMessages = (IncomingMessages, Reset) =>
    {
        const NextMessages = Reset ? [] : CurrentMessages.slice();
        const KnownIds = new Set(NextMessages.map((Message) => Message.id));
        let DidChange = Boolean(Reset);

        IncomingMessages.forEach((Message) =>
        {
            if (KnownIds.has(Message.id))
            {
                return;
            }

            NextMessages.push(Message);
            KnownIds.add(Message.id);
            DidChange = true;
        });

        NextMessages.sort((Left, Right) => Left.id - Right.id);
        CurrentMessages = NextMessages.slice(-80);
        return DidChange;
    };

    const ApplyOnlineCount = (OnlineCount) =>
    {
        if (ChatOnlineCount && Number.isFinite(OnlineCount))
        {
            ChatOnlineCount.textContent = String(OnlineCount);
        }
    };

    const ApplyChatState = (Payload) =>
    {
        LastStatePayload = Payload;
        ApplyOnlineCount(Payload.online_count);

        if (Number.isFinite(Payload.latest_message_id))
        {
            LatestMessageId = Math.max(Payload.latest_message_id, LatestMessageId);
        }

        if (!Array.isArray(Payload.messages))
        {
            return;
        }

        const DidMessagesChange = MergeMessages(Payload.messages, Boolean(Payload.reset));

        if (DidMessagesChange)
        {
            RenderMessages({
                forceScroll: Boolean(Payload.reset),
            });
        }

        UpdateRelativeTimes();
    };

    const SchedulePoll = (Delay = GetPollDelay()) =>
    {
        ClearPollTimeout();

        if (document.visibilityState === "hidden")
        {
            return;
        }

        PollTimeout = window.setTimeout(async () =>
        {
            PollTimeout = 0;

            if (document.visibilityState === "hidden")
            {
                return;
            }

            const Payload = await FetchChatState();

            if (!Payload)
            {
                SchedulePoll(Math.max(GetPollDelay(), 3400));
                return;
            }

            ApplyChatState(Payload);
            SchedulePoll();
        }, Delay);
    };

    const StopPresenceHeartbeat = () =>
    {
        if (!PresenceHeartbeatInterval)
        {
            return;
        }

        window.clearInterval(PresenceHeartbeatInterval);
        PresenceHeartbeatInterval = 0;
    };

    const BuildPresencePayload = () =>
    {
        return JSON.stringify({
            path: `${window.location.pathname}${window.location.search}`,
        });
    };

    const SendPresenceHeartbeat = async () =>
    {
        if (!PresenceHeartbeatUrl || document.visibilityState === "hidden")
        {
            return null;
        }

        SentOfflinePresence = false;

        try
        {
            const Response = await fetch(PresenceHeartbeatUrl, {
                body: BuildPresencePayload(),
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                method: "POST",
            });

            if (!Response.ok)
            {
                return null;
            }

            const Payload = await Response.json().catch(() => null);

            if (Payload)
            {
                ApplyOnlineCount(Payload.online_count);
            }

            return Payload;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return null;
        }
    };

    const StartPresenceHeartbeat = () =>
    {
        if (!PresenceHeartbeatUrl || document.visibilityState === "hidden")
        {
            return;
        }

        StopPresenceHeartbeat();
        SendPresenceHeartbeat().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });

        PresenceHeartbeatInterval = window.setInterval(() =>
        {
            SendPresenceHeartbeat().catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        }, PresenceHeartbeatIntervalMs);
    };

    const SendOfflinePresence = () =>
    {
        if (!PresenceOfflineUrl || SentOfflinePresence)
        {
            return;
        }

        SentOfflinePresence = true;
        StopPresenceHeartbeat();
        ProfileCache.clear();

        const Payload = BuildPresencePayload();
        const BlobPayload = new Blob([Payload], {
            type: "application/json",
        });

        if (navigator.sendBeacon?.(PresenceOfflineUrl, BlobPayload))
        {
            return;
        }

        fetch(PresenceOfflineUrl, {
            body: Payload,
            headers: {
                "Content-Type": "application/json",
            },
            keepalive: true,
            method: "POST",
        }).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const BuildProfileUrl = (UserId) =>
    {
        return UserProfileUrlTemplate.replace("__user_id__", encodeURIComponent(UserId));
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

    const BuildProfileMarkup = (Profile) =>
    {
        const RegisteredLabel = Profile.registered_at
            ? FormatRelativeTime(Profile.registered_at)
            : "Unknown";
        const StatusLabel = Profile.is_online ? "Online" : "Offline";
        const AvatarMarkup = BuildAvatarMarkup(Profile);
        const BadgeMarkup = Profile.reward_badge
            ? `<div data-chat-profile-badge>Lvl ${EscapeHtml(Profile.reward_level)} &middot; ${EscapeHtml(Profile.reward_badge)}</div>`
            : "";
        const CanTip = Boolean(Profile.can_tip && Profile.tip_url);
        const TipButtonMarkup = CanTip
            ? `
                <button
                  data-chat-tip-toggle
                  data-open="false"
                  title="Tip ${EscapeHtml(Profile.display_name)}"
                  type="button"
                  aria-label="Tip ${EscapeHtml(Profile.display_name)}"
                >
                  <span>Tip</span>
                  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
                    <path d="M10 2.5v15"></path>
                    <path d="M13.75 5.25H8.4a2.15 2.15 0 0 0 0 4.3h3.2a2.15 2.15 0 0 1 0 4.3H6.25"></path>
                  </svg>
                </button>
            `
            : "";
        const ProfileBadgesMarkup = BadgeMarkup || TipButtonMarkup
            ? `
                <div data-chat-profile-badges>
                  ${BadgeMarkup}
                  ${TipButtonMarkup}
                </div>
            `
            : "";
        const TipFormMarkup = CanTip
            ? `
                <div data-chat-tip-panel data-open="false" aria-hidden="true">
                  <div data-chat-tip-panel-inner>
                    <form data-chat-tip-form data-tip-url="${EscapeHtml(Profile.tip_url)}">
                      <div data-chat-tip-row>
                        <input
                          autocomplete="off"
                          data-chat-tip-input
                          inputmode="decimal"
                          min="0.01"
                          name="amount"
                          placeholder="$5"
                          step="0.01"
                          type="number"
                        >
                        <button data-chat-tip-submit type="submit">Send</button>
                      </div>
                      <div data-chat-tip-message></div>
                    </form>
                  </div>
                </div>
            `
            : "";

        return `
            <div data-chat-profile-head>
              <span data-chat-profile-avatar>${AvatarMarkup}</span>
              <div data-chat-profile-copy>
                <div data-chat-profile-name>${EscapeHtml(Profile.display_name)}</div>
                ${ProfileBadgesMarkup}
                <div data-chat-profile-meta>
                  <span
                    data-chat-profile-status
                    data-online="${Profile.is_online ? "true" : "false"}"
                    aria-label="${EscapeHtml(StatusLabel)}"
                    title="${EscapeHtml(StatusLabel)}"
                  ></span>
                  <div data-chat-profile-username>@${EscapeHtml(Profile.username)}</div>
                </div>
              </div>
            </div>
            <div data-chat-profile-grid>
              <div data-chat-profile-stat>
                <div data-chat-profile-stat-label>Registered</div>
                <div data-chat-profile-stat-value>${EscapeHtml(RegisteredLabel)}</div>
              </div>
              <div data-chat-profile-stat>
                <div data-chat-profile-stat-label>Wagered</div>
                <div data-chat-profile-stat-value>${EscapeHtml(Profile.total_wagered_display || "$0")}</div>
              </div>
            </div>
            ${TipFormMarkup}
        `;
    };

    const SetBalanceDisplay = (Value) =>
    {
        if (!Value)
        {
            return;
        }

        document.querySelectorAll("[data-balance-display]").forEach((Node) =>
        {
            Node.textContent = Value;
        });
    };

    const SetTipMessage = (Message, Tone = "neutral") =>
    {
        const MessageNode = ChatProfileCard.querySelector("[data-chat-tip-message]");

        if (!MessageNode)
        {
            return;
        }

        MessageNode.textContent = Message || "";
        MessageNode.dataset.tone = Tone;
    };

    const ToggleTipForm = () =>
    {
        const TipPanel = ChatProfileCard.querySelector("[data-chat-tip-panel]");
        const TipToggle = ChatProfileCard.querySelector("[data-chat-tip-toggle]");
        const TipInput = ChatProfileCard.querySelector("[data-chat-tip-input]");

        if (!TipPanel || !TipToggle)
        {
            return;
        }

        const ShouldOpen = TipPanel.dataset.open !== "true";

        TipPanel.dataset.open = ShouldOpen ? "true" : "false";
        TipPanel.setAttribute("aria-hidden", ShouldOpen ? "false" : "true");
        TipToggle.dataset.open = ShouldOpen ? "true" : "false";
        SetTipMessage("");
        window.requestAnimationFrame(PositionProfileCard);
        window.setTimeout(PositionProfileCard, 360);

        if (ShouldOpen)
        {
            window.requestAnimationFrame(() =>
            {
                TipInput?.focus();
                TipInput?.select?.();
            });
        }
    };

    const SendTip = async (TipForm) =>
    {
        if (IsSendingTip)
        {
            return;
        }

        const TipInput = TipForm.querySelector("[data-chat-tip-input]");
        const TipSubmit = TipForm.querySelector("[data-chat-tip-submit]");
        const TipUrl = TipForm.dataset.tipUrl || "";
        const Amount = TipInput?.value.trim() || "";

        if (!TipUrl || !Amount)
        {
            SetTipMessage("Enter an amount.", "error");
            return;
        }

        IsSendingTip = true;
        SetTipMessage("Sending...");

        if (TipSubmit)
        {
            TipSubmit.disabled = true;
        }

        try
        {
            const Response = await fetch(TipUrl, {
                body: JSON.stringify({
                    amount: Amount,
                }),
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                method: "POST",
            });
            const Payload = await Response.json().catch(() => ({}));

            if (!Response.ok)
            {
                SetBalanceDisplay(Payload.current_balance_display);
                SetTipMessage(Payload.error || "Tip could not be sent.", "error");
                return;
            }

            SetBalanceDisplay(Payload.current_balance_display);
            SetTipMessage(`Sent ${Payload.amount_display}.`, "success");
            TipInput.value = "";
            window.GamblingApp?.showToast?.({
                message: `You tipped ${Payload.recipient_name} ${Payload.amount_display}.`,
                title: "Tip sent",
                tone: "success",
            });
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            SetTipMessage("Tip could not be sent.", "error");
        }
        finally
        {
            IsSendingTip = false;

            if (TipSubmit)
            {
                TipSubmit.disabled = false;
            }

            PositionProfileCard();
        }
    };

    const HideProfileCard = () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
            HoverHideTimeout = 0;
        }

        HoveredUserId = "";
        HoverAnchor = null;
        ChatProfileCard.dataset.open = "false";
        ChatProfileCard.setAttribute("aria-hidden", "true");
    };

    const ScheduleHideProfileCard = () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
        }

        HoverHideTimeout = window.setTimeout(HideProfileCard, 110);
    };

    const PositionProfileCard = () =>
    {
        if (!HoverAnchor || ChatProfileCard.dataset.open !== "true")
        {
            return;
        }

        const AnchorRect = HoverAnchor.getBoundingClientRect();
        const CardRect = ChatProfileCard.getBoundingClientRect();
        const Gap = 14;
        let Left = AnchorRect.left - CardRect.width - Gap;

        if (Left < 12)
        {
            Left = Math.min(window.innerWidth - CardRect.width - 12, AnchorRect.right + Gap);
        }

        const Top = Clamp(AnchorRect.top - 16, 12, window.innerHeight - CardRect.height - 12);
        ChatProfileCard.style.left = `${Left}px`;
        ChatProfileCard.style.top = `${Top}px`;
    };

    const ShowProfileCard = async (UserId, Anchor) =>
    {
        HoveredUserId = UserId;
        HoverAnchor = Anchor;
        const RequestToken = ++HoverRequestToken;
        const Profile = await FetchProfile(UserId);

        if (!Profile || RequestToken !== HoverRequestToken || HoveredUserId !== UserId)
        {
            return;
        }

        ChatProfileCard.innerHTML = BuildProfileMarkup(Profile);
        ChatProfileCard.dataset.open = "true";
        ChatProfileCard.setAttribute("aria-hidden", "false");
        PositionProfileCard();
    };

    const AppendMessage = (Message) =>
    {
        MergeMessages([Message], false);
        LatestMessageId = Math.max(LatestMessageId, Message.id);
        RenderMessages({
            forceScroll: Message.author?.id === CurrentUserId || IsNearBottom(),
        });
        UpdateRelativeTimes();
    };

    const SendMessage = async () =>
    {
        const MessageBody = ChatInput.value.trim();

        if (!MessageBody || IsSending)
        {
            return;
        }

        IsSending = true;
        SetChatError("");
        UpdateComposerState();

        try
        {
            const Response = await fetch(SendUrl, {
                body: JSON.stringify({
                    body: MessageBody,
                }),
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                method: "POST",
            });
            const Payload = await Response.json().catch(() => ({}));

            if (!Response.ok)
            {
                SetChatError(Payload.error || "Message could not be sent.");
                return;
            }

            ChatInput.value = "";
            ApplyOnlineCount(Payload.online_count);

            if (Payload.message)
            {
                AppendMessage(Payload.message);
            }
            else
            {
                LatestMessageId = Math.max(LatestMessageId, Payload.latest_message_id || 0);
            }
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            SetChatError("Message could not be sent.");
        }
        finally
        {
            IsSending = false;
            UpdateComposerState();
            ChatInput.focus();
        }
    };

    ChatShell.addEventListener("error", HandleAvatarError, true);

    ChatToggleButton?.addEventListener("click", () =>
    {
        SetChatOpen(ChatShell.dataset.chatOpen !== "true");
    });

    ChatCloseButton?.addEventListener("click", () =>
    {
        SetChatOpen(false);
    });

    ChatComposer?.addEventListener("submit", (EventValue) =>
    {
        EventValue.preventDefault();
        SendMessage().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatInput?.addEventListener("input", () =>
    {
        SetChatError("");
        UpdateComposerState();
    });

    ChatMessages?.addEventListener("mouseover", (EventValue) =>
    {
        const Trigger = EventValue.target.closest("[data-chat-author][data-user-id]");

        if (!Trigger || !ChatMessages.contains(Trigger))
        {
            return;
        }

        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
            HoverHideTimeout = 0;
        }

        const UserId = Trigger.dataset.userId || "";

        if (!UserId || (HoveredUserId === UserId && HoverAnchor === Trigger))
        {
            return;
        }

        ShowProfileCard(UserId, Trigger).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatMessages?.addEventListener("mouseout", (EventValue) =>
    {
        const Trigger = EventValue.target.closest("[data-chat-author][data-user-id]");

        if (!Trigger)
        {
            return;
        }

        const RelatedTarget = EventValue.relatedTarget instanceof Element ? EventValue.relatedTarget : null;

        if (RelatedTarget?.closest("[data-chat-profile-card]"))
        {
            return;
        }

        if (RelatedTarget?.closest("[data-chat-author][data-user-id]") === Trigger)
        {
            return;
        }

        ScheduleHideProfileCard();
    });

    ChatProfileCard?.addEventListener("mouseenter", () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
            HoverHideTimeout = 0;
        }
    });

    ChatProfileCard?.addEventListener("click", (EventValue) =>
    {
        const ToggleButton = EventValue.target.closest("[data-chat-tip-toggle]");

        if (!ToggleButton || !ChatProfileCard.contains(ToggleButton))
        {
            return;
        }

        EventValue.preventDefault();
        ToggleTipForm();
    });

    ChatProfileCard?.addEventListener("submit", (EventValue) =>
    {
        const TipForm = EventValue.target.closest("[data-chat-tip-form]");

        if (!TipForm || !ChatProfileCard.contains(TipForm))
        {
            return;
        }

        EventValue.preventDefault();
        SendTip(TipForm).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatProfileCard?.addEventListener("mouseleave", () =>
    {
        ScheduleHideProfileCard();
    });

    window.addEventListener("resize", PositionProfileCard);
    window.addEventListener("scroll", PositionProfileCard, true);
    window.addEventListener("pagehide", SendOfflinePresence);
    window.addEventListener("beforeunload", SendOfflinePresence);
    document.addEventListener("visibilitychange", () =>
    {
        if (document.visibilityState === "hidden")
        {
            ClearPollTimeout();
            HideProfileCard();
            SendOfflinePresence();
            return;
        }

        SentOfflinePresence = false;
        StartPresenceHeartbeat();
        SchedulePoll(120);
    });

    UpdateComposerState();
    SetChatOpen(!IsMobileViewport(), { FocusComposer: false });
    RelativeTimeInterval = window.setInterval(UpdateRelativeTimes, 15000);
    StartPresenceHeartbeat();
    SchedulePoll(120);
})();
