(() =>
{
    const ChatShell = document.querySelector("[data-site-chat-shell]");

    if (!ChatShell)
    {
        return;
    }

    const HiddenPollMultiplier = 2.4;
    const ChatDragStorageKey = "gambling.chat.drag-position";
    const ChatDragViewportMargin = 16;
    const ChatResizeStorageKey = "gambling.chat.panel-size";
    const ChatDefaultDesktopHeight = 500;
    const ChatDefaultDesktopWidth = 360;
    const ChatMinHeightPx = 390;
    const ChatMinWidthPx = 320;
    const ChatMaxHeightPx = 640;
    const ChatMaxWidthPx = 520;
    const FocusedMessageHighlightMs = 2600;
    const LocalTypingWindowMs = 3200;
    const PresenceHeartbeatIntervalMs = 4000;
    const ProfileCacheTtlMs = 1500;
    const ProfileHideDelayMs = 110;
    const ProfileSwitchDelayMs = 180;
    const Body = document.body;
    const CurrentUserId = Body.dataset.chatCurrentUserId || "";
    const MentionSuggestionsUrl = Body.dataset.chatMentionQueryUrl || "";
    const PresenceHeartbeatUrl = Body.dataset.presenceHeartbeatUrl || "";
    const PresenceOfflineUrl = Body.dataset.presenceOfflineUrl || "";
    const SendUrl = Body.dataset.chatSendUrl || "";
    const StateUrl = Body.dataset.chatStateUrl || "";
    const UserProfileUrlTemplate = Body.dataset.chatUserProfileUrl || "";
    const ChatMessages = ChatShell.querySelector("[data-chat-messages]");
    const ChatComposer = ChatShell.querySelector("[data-chat-composer]");
    const ChatError = ChatShell.querySelector("[data-chat-error]");
    const ChatHeader = ChatShell.querySelector("[data-chat-header]");
    const ChatInput = ChatShell.querySelector("[data-chat-input]");
    const ChatOnlineCount = ChatShell.querySelector("[data-chat-online-count]");
    const ChatPanel = ChatShell.querySelector("[data-site-chat]");
    const ChatProfileCard = ChatShell.querySelector("[data-chat-profile-card]");
    const ChatReplyBanner = ChatShell.querySelector("[data-chat-reply]");
    const ChatReplyName = ChatShell.querySelector("[data-chat-reply-name]");
    const ChatReplyPreview = ChatShell.querySelector("[data-chat-reply-preview]");
    const ChatResizeHandle = ChatShell.querySelector("[data-chat-resize-handle]");
    const ChatCloseButton = ChatShell.querySelector("[data-chat-close]");
    const ChatSubtitle = ChatShell.querySelector("[data-chat-subtitle]");
    const ChatSendButton = ChatShell.querySelector("[data-chat-send]");
    const ChatSuggestionShell = ChatShell.querySelector("[data-chat-suggestions]");
    const ChatToggleButton = ChatShell.querySelector("[data-chat-toggle]");
    const EmptyStateMarkup = `<div data-chat-empty>No messages yet.</div>`;
    const EmojiShortcodeSuggestions = [
        { alias: "joy", emoji: "\u{1F602}" },
        { alias: "sob", emoji: "\u{1F62D}" },
        { alias: "skull", emoji: "\u{1F480}" },
        { alias: "fire", emoji: "\u{1F525}" },
        { alias: "heart", emoji: "\u2764\uFE0F" },
        { alias: "cry", emoji: "\u{1F622}" },
        { alias: "laughing", emoji: "\u{1F606}" },
        { alias: "grin", emoji: "\u{1F600}" },
        { alias: "smile", emoji: "\u{1F604}" },
        { alias: "pleading", emoji: "\u{1F97A}" },
        { alias: "angry", emoji: "\u{1F620}" },
        { alias: "clap", emoji: "\u{1F44F}" },
        { alias: "wave", emoji: "\u{1F44B}" },
        { alias: "thumbs_up", emoji: "\u{1F44D}" },
        { alias: "thumbsup", emoji: "\u{1F44D}" },
        { alias: "+1", emoji: "\u{1F44D}" },
        { alias: "thinking", emoji: "\u{1F914}" },
        { alias: "eyes", emoji: "\u{1F440}" },
        { alias: "rocket", emoji: "\u{1F680}" },
        { alias: "sparkles", emoji: "\u2728" },
        { alias: "pray", emoji: "\u{1F64F}" },
        { alias: "flushed", emoji: "\u{1F633}" },
        { alias: "sleepy", emoji: "\u{1F62A}" },
        { alias: "100", emoji: "\u{1F4AF}" },
    ];
    const ProfileCache = new Map();
    let CurrentMessages = [];
    let ComposerSuggestionActiveIndex = 0;
    let ComposerSuggestionRange = null;
    let ComposerSuggestionRequestToken = 0;
    let ComposerSuggestions = [];
    let ComposerSuggestionType = "";
    let ActiveReplyMessage = null;
    let HoveredUserId = "";
    let HoverAnchor = null;
    let HoverHideTimeout = 0;
    let HoverRequestToken = 0;
    let IsTyping = false;
    let IsSending = false;
    let LastStatePayload = null;
    let LastTypingInputAt = 0;
    let LatestMessageId = 0;
    let PendingFocusMessageId = 0;
    let PresenceHeartbeatInterval = 0;
    let PollTimeout = 0;
    let RelativeTimeInterval = 0;
    let RenderedProfileUserId = "";
    let SentOfflinePresence = false;
    let FocusedMessageElement = null;
    let TypingResetTimeout = 0;
    let IsSendingTip = false;
    let ChatDragPosition = {
        x: 0,
        y: 0,
    };
    let ChatPanelSize = {
        height: ChatDefaultDesktopHeight,
        width: ChatDefaultDesktopWidth,
    };
    let ChatDragState = null;
    let ChatResizeState = null;

    const EscapeHtml = (Value) =>
    {
        return String(Value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    };

    const EscapeRegExp = (Value) =>
    {
        return String(Value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const NormalizeSearchValue = (Value) =>
    {
        return String(Value ?? "").trim().toLowerCase().replaceAll("-", "_");
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

    const TruncateText = (Value, MaxLength = 90) =>
    {
        const NormalizedValue = String(Value ?? "").replace(/\s+/g, " ").trim();

        if (NormalizedValue.length <= MaxLength)
        {
            return NormalizedValue;
        }

        return `${NormalizedValue.slice(0, MaxLength - 3).trimEnd()}...`;
    };

    const BuildReplyPreviewText = (Value) =>
    {
        if (typeof Value?.preview === "string" && Value.preview.trim())
        {
            return TruncateText(Value.preview);
        }

        if (typeof Value?.body === "string" && Value.body.trim())
        {
            return TruncateText(Value.body);
        }

        if (typeof Value?.session_share?.title === "string" && Value.session_share.title.trim())
        {
            return TruncateText(Value.session_share.title);
        }

        return "Original message";
    };

    const FormatTypingSummary = (TypingUsers) =>
    {
        const Names = Array.isArray(TypingUsers)
            ? TypingUsers
                .map((User) => String(User?.display_name || "").trim())
                .filter(Boolean)
            : [];

        if (!Names.length)
        {
            return "";
        }

        if (Names.length === 1)
        {
            return `${Names[0]} is typing...`;
        }

        if (Names.length === 2)
        {
            return `${Names[0]} and ${Names[1]} are typing...`;
        }

        const RemainingCount = Names.length - 2;
        const OthersLabel = RemainingCount === 1 ? "1 other" : `${RemainingCount} others`;
        return `${Names[0]}, ${Names[1]}, and ${OthersLabel} are typing...`;
    };

    const Wait = (Delay) =>
    {
        return new Promise((Resolve) =>
        {
            window.setTimeout(Resolve, Delay);
        });
    };

    const IsMobileViewport = () =>
    {
        return window.matchMedia("(max-width: 640px)").matches;
    };

    const NormalizeChatDragPosition = (Position) =>
    {
        const X = Number(Position?.x);
        const Y = Number(Position?.y);

        return {
            x: Number.isFinite(X) ? X : 0,
            y: Number.isFinite(Y) ? Y : 0,
        };
    };

    const GetChatSizeLimits = () =>
    {
        return {
            maxHeight: Math.max(
                ChatMinHeightPx,
                Math.min(ChatMaxHeightPx, window.innerHeight - 108),
            ),
            maxWidth: Math.max(
                ChatMinWidthPx,
                Math.min(ChatMaxWidthPx, window.innerWidth - (ChatDragViewportMargin * 2)),
            ),
            minHeight: ChatMinHeightPx,
            minWidth: ChatMinWidthPx,
        };
    };

    const ClampChatSize = (Size) =>
    {
        const Limits = GetChatSizeLimits();
        const Width = Number(Size?.width);
        const Height = Number(Size?.height);

        return {
            height: Clamp(
                Number.isFinite(Height) ? Height : ChatDefaultDesktopHeight,
                Limits.minHeight,
                Limits.maxHeight,
            ),
            width: Clamp(
                Number.isFinite(Width) ? Width : ChatDefaultDesktopWidth,
                Limits.minWidth,
                Limits.maxWidth,
            ),
        };
    };

    const ReadStoredChatPanelSize = () =>
    {
        try
        {
            const RawValue = window.localStorage.getItem(ChatResizeStorageKey);

            if (!RawValue)
            {
                return {
                    height: ChatDefaultDesktopHeight,
                    width: ChatDefaultDesktopWidth,
                };
            }

            return ClampChatSize(JSON.parse(RawValue));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return {
                height: ChatDefaultDesktopHeight,
                width: ChatDefaultDesktopWidth,
            };
        }
    };

    const PersistChatPanelSize = (Size) =>
    {
        try
        {
            window.localStorage.setItem(ChatResizeStorageKey, JSON.stringify(ClampChatSize(Size)));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }
    };

    const ReadStoredChatDragPosition = () =>
    {
        try
        {
            const RawValue = window.localStorage.getItem(ChatDragStorageKey);

            if (!RawValue)
            {
                return {
                    x: 0,
                    y: 0,
                };
            }

            return NormalizeChatDragPosition(JSON.parse(RawValue));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return {
                x: 0,
                y: 0,
            };
        }
    };

    const PersistChatDragPosition = (Position) =>
    {
        try
        {
            window.localStorage.setItem(ChatDragStorageKey, JSON.stringify(NormalizeChatDragPosition(Position)));
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }
    };

    const ClampToViewportRange = (Value, Min, Max) =>
    {
        if (Min > Max)
        {
            return (Min + Max) / 2;
        }

        return Clamp(Value, Min, Max);
    };

    const GetChatNaturalBounds = (AppliedPosition = ChatDragPosition) =>
    {
        const Rects = [ChatPanel]
            .filter(Boolean)
            .map((ElementValue) => ElementValue.getBoundingClientRect());

        if (!Rects.length)
        {
            return null;
        }

        // Remove the active translate offset so clamping stays stable while dragging.
        return {
            bottom: Math.max(...Rects.map((RectValue) => RectValue.bottom)) - AppliedPosition.y,
            left: Math.min(...Rects.map((RectValue) => RectValue.left)) - AppliedPosition.x,
            right: Math.max(...Rects.map((RectValue) => RectValue.right)) - AppliedPosition.x,
            top: Math.min(...Rects.map((RectValue) => RectValue.top)) - AppliedPosition.y,
        };
    };

    const ClampChatDragPosition = (Position, AppliedPosition = ChatDragPosition) =>
    {
        const NextPosition = NormalizeChatDragPosition(Position);

        if (IsMobileViewport())
        {
            return {
                x: 0,
                y: 0,
            };
        }

        const Bounds = GetChatNaturalBounds(AppliedPosition);

        if (!Bounds)
        {
            return NextPosition;
        }

        return {
            x: ClampToViewportRange(
                NextPosition.x,
                ChatDragViewportMargin - Bounds.left,
                window.innerWidth - ChatDragViewportMargin - Bounds.right,
            ),
            y: ClampToViewportRange(
                NextPosition.y,
                ChatDragViewportMargin - Bounds.top,
                window.innerHeight - ChatDragViewportMargin - Bounds.bottom,
            ),
        };
    };

    const ApplyChatDragPosition = (Position, { persist = false } = {}) =>
    {
        ChatDragPosition = NormalizeChatDragPosition(Position);

        if (!ChatPanel)
        {
            return;
        }

        if (Math.abs(ChatDragPosition.x) < 0.5 && Math.abs(ChatDragPosition.y) < 0.5)
        {
            ChatPanel.style.transform = "";
        }
        else
        {
            ChatPanel.style.transform = `translate3d(${ChatDragPosition.x}px, ${ChatDragPosition.y}px, 0)`;
        }

        if (persist)
        {
            PersistChatDragPosition(ChatDragPosition);
        }

        if (ChatProfileCard?.dataset.open === "true")
        {
            PositionProfileCard();
        }
    };

    const SyncChatPositionWithinViewport = ({ persist = false } = {}) =>
    {
        const ClampedPosition = ClampChatDragPosition(ChatDragPosition, ChatDragPosition);
        ApplyChatDragPosition(ClampedPosition, {
            persist,
        });
    };

    const ApplyChatPanelSize = (Size, { persist = false } = {}) =>
    {
        ChatPanelSize = ClampChatSize(Size);

        if (!ChatPanel)
        {
            return;
        }

        if (IsMobileViewport())
        {
            ChatPanel.style.width = "";
            ChatPanel.style.height = "";
            return;
        }

        ChatPanel.style.width = `${ChatPanelSize.width}px`;
        ChatPanel.style.height = `${ChatPanelSize.height}px`;

        if (persist)
        {
            PersistChatPanelSize(ChatPanelSize);
        }

        SyncChatPositionWithinViewport({
            persist,
        });

        if (ChatProfileCard?.dataset.open === "true")
        {
            PositionProfileCard();
        }
    };

    const SyncChatPanelSize = ({ useStoredSize = false } = {}) =>
    {
        if (IsMobileViewport())
        {
            ChatPanelSize = {
                height: ChatDefaultDesktopHeight,
                width: ChatDefaultDesktopWidth,
            };
            ChatShell.dataset.chatResizing = "false";
            ChatResizeState = null;

            if (ChatPanel)
            {
                ChatPanel.style.width = "";
                ChatPanel.style.height = "";
            }

            return;
        }

        const DesiredSize = useStoredSize ? ReadStoredChatPanelSize() : ChatPanelSize;

        ApplyChatPanelSize(DesiredSize, {
            persist: true,
        });
    };

    const SyncChatDragPosition = ({ useStoredPosition = false } = {}) =>
    {
        if (IsMobileViewport())
        {
            ChatDragPosition = {
                x: 0,
                y: 0,
            };
            if (ChatPanel)
            {
                ChatPanel.style.transform = "";
            }
            ChatShell.dataset.chatDragging = "false";
            ChatDragState = null;
            return;
        }

        const DesiredPosition = useStoredPosition ? ReadStoredChatDragPosition() : ChatDragPosition;
        const AppliedPosition = useStoredPosition
            ? {
                x: 0,
                y: 0,
            }
            : ChatDragPosition;
        const ClampedPosition = ClampChatDragPosition(DesiredPosition, AppliedPosition);

        ApplyChatDragPosition(ClampedPosition, {
            persist: true,
        });
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
            HideComposerSuggestions();
            HideProfileCard();
            ResetTypingState();
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

    const SetTypingSummary = (TypingUsers) =>
    {
        if (!ChatSubtitle)
        {
            return;
        }

        const Summary = FormatTypingSummary(TypingUsers);
        ChatSubtitle.textContent = Summary;
        ChatSubtitle.dataset.active = Summary ? "true" : "false";
        ChatSubtitle.setAttribute("aria-hidden", Summary ? "false" : "true");
    };

    const SetActiveReplyMessage = (Message) =>
    {
        ActiveReplyMessage = Message
            ? {
                author: Message.author,
                id: Number(Message.id),
                preview: BuildReplyPreviewText(Message),
            }
            : null;

        if (!ChatReplyBanner || !ChatReplyName || !ChatReplyPreview)
        {
            return;
        }

        if (!ActiveReplyMessage)
        {
            ChatReplyBanner.dataset.open = "false";
            ChatReplyBanner.setAttribute("aria-hidden", "true");
            ChatReplyName.textContent = "";
            ChatReplyPreview.textContent = "";
            return;
        }

        ChatReplyBanner.dataset.open = "true";
        ChatReplyBanner.setAttribute("aria-hidden", "false");
        ChatReplyName.textContent = ActiveReplyMessage.author?.display_name || "Unknown";
        ChatReplyPreview.textContent = ActiveReplyMessage.preview;
    };

    const ClearActiveReplyMessage = ({ focusComposer = false } = {}) =>
    {
        SetActiveReplyMessage(null);

        if (focusComposer)
        {
            ChatInput?.focus();
        }
    };

    const FindMessageById = (MessageId) =>
    {
        return CurrentMessages.find((Message) => Message.id === MessageId) || null;
    };

    const FindMessageElementById = (MessageId) =>
    {
        return ChatMessages?.querySelector(`[data-chat-message][data-message-id="${CSS.escape(String(MessageId))}"]`) || null;
    };

    const ClearFocusedMessageHighlight = () =>
    {
        if (!FocusedMessageElement)
        {
            return;
        }

        window.clearTimeout(FocusedMessageElement.__chatFocusTimeout || 0);
        FocusedMessageElement.dataset.focused = "false";
        FocusedMessageElement = null;
    };

    const FocusChatMessage = (MessageId) =>
    {
        const MessageElement = FindMessageElementById(MessageId);

        if (!MessageElement)
        {
            return false;
        }

        ClearFocusedMessageHighlight();
        MessageElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        MessageElement.dataset.focused = "true";
        FocusedMessageElement = MessageElement;
        MessageElement.__chatFocusTimeout = window.setTimeout(() =>
        {
            if (FocusedMessageElement !== MessageElement)
            {
                return;
            }

            MessageElement.dataset.focused = "false";
            FocusedMessageElement = null;
        }, FocusedMessageHighlightMs);
        PendingFocusMessageId = 0;
        return true;
    };

    const StartChatDrag = (EventValue) =>
    {
        if (
            !ChatHeader ||
            EventValue.button !== 0 ||
            IsMobileViewport() ||
            EventValue.target.closest("button, a, input, textarea, select, label")
        )
        {
            return;
        }

        EventValue.preventDefault();
        HideProfileCard();
        ChatDragState = {
            pointerId: EventValue.pointerId,
            startClientX: EventValue.clientX,
            startClientY: EventValue.clientY,
            startPosition: {
                ...ChatDragPosition,
            },
        };
        ChatShell.dataset.chatDragging = "true";
        ChatHeader.setPointerCapture?.(EventValue.pointerId);
    };

    const StartChatResize = (EventValue) =>
    {
        if (
            !ChatResizeHandle ||
            EventValue.button !== 0 ||
            IsMobileViewport()
        )
        {
            return;
        }

        EventValue.preventDefault();
        EventValue.stopPropagation();
        HideProfileCard();
        ChatResizeState = {
            pointerId: EventValue.pointerId,
            startClientX: EventValue.clientX,
            startClientY: EventValue.clientY,
            startSize: {
                ...ChatPanelSize,
            },
        };
        ChatShell.dataset.chatResizing = "true";
        ChatResizeHandle.setPointerCapture?.(EventValue.pointerId);
    };

    const UpdateChatDrag = (EventValue) =>
    {
        if (ChatResizeState || !ChatDragState || EventValue.pointerId !== ChatDragState.pointerId)
        {
            return;
        }

        const DesiredPosition = {
            x: ChatDragState.startPosition.x + (EventValue.clientX - ChatDragState.startClientX),
            y: ChatDragState.startPosition.y + (EventValue.clientY - ChatDragState.startClientY),
        };
        const ClampedPosition = ClampChatDragPosition(DesiredPosition, ChatDragPosition);

        ApplyChatDragPosition(ClampedPosition);
    };

    const UpdateChatResize = (EventValue) =>
    {
        if (!ChatResizeState || EventValue.pointerId !== ChatResizeState.pointerId)
        {
            return;
        }

        const DesiredSize = {
            height: ChatResizeState.startSize.height + (ChatResizeState.startClientY - EventValue.clientY),
            width: ChatResizeState.startSize.width + (ChatResizeState.startClientX - EventValue.clientX),
        };

        ApplyChatPanelSize(DesiredSize);
    };

    const EndChatDrag = (EventValue) =>
    {
        if (!ChatDragState)
        {
            return;
        }

        if (EventValue && EventValue.pointerId !== ChatDragState.pointerId)
        {
            return;
        }

        ChatHeader?.releasePointerCapture?.(ChatDragState.pointerId);
        ChatDragState = null;
        ChatShell.dataset.chatDragging = "false";
        PersistChatDragPosition(ChatDragPosition);
    };

    const EndChatResize = (EventValue) =>
    {
        if (!ChatResizeState)
        {
            return;
        }

        if (EventValue && EventValue.pointerId !== ChatResizeState.pointerId)
        {
            return;
        }

        ChatResizeHandle?.releasePointerCapture?.(ChatResizeState.pointerId);
        ChatResizeState = null;
        ChatShell.dataset.chatResizing = "false";
        PersistChatPanelSize(ChatPanelSize);
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

    const BuildHighlightedBodyMarkup = (Message) =>
    {
        const BodyValue = String(Message?.body ?? "");
        const MentionTokens = Array.from(new Set(
            (Array.isArray(Message?.mention_tokens) ? Message.mention_tokens : [])
                .filter((Token) => typeof Token === "string" && Token.trim()),
        )).sort((Left, Right) => Right.length - Left.length);

        if (!MentionTokens.length)
        {
            return EscapeHtml(BodyValue);
        }

        const MentionPattern = new RegExp(`(${MentionTokens.map(EscapeRegExp).join("|")})`, "g");

        return BodyValue.split(MentionPattern).map((Segment) =>
        {
            if (!Segment)
            {
                return "";
            }

            if (MentionTokens.includes(Segment))
            {
                return `<mark data-chat-mention>${EscapeHtml(Segment)}</mark>`;
            }

            return EscapeHtml(Segment);
        }).join("");
    };

    const BuildReplyContextMarkup = (Reply) =>
    {
        if (!Reply?.author)
        {
            return "";
        }

        return `<div data-chat-reply-context><div data-chat-reply-context-author>${EscapeHtml(Reply.author.display_name || "Unknown")}</div><div data-chat-reply-context-preview>${EscapeHtml(BuildReplyPreviewText(Reply))}</div></div>`;
    };

    const BuildSessionShareMarkup = (Share) =>
    {
        if (!Share)
        {
            return "";
        }

        const StatusLabel = Share.status === "countdown" ? "live" : (Share.status || "session");

        const JoinActionMarkup = Share.is_joinable && Share.join_url
            ? `
                <form action="${EscapeHtml(Share.join_url)}" method="post">
                  <button type="submit">Join session</button>
                </form>
            `
            : "";

        return `
            <div data-chat-session-share>
              <div data-chat-session-share-head>
                <div>
                  <div data-chat-session-share-title>${EscapeHtml(Share.title)}</div>
                  <div data-chat-session-share-copy>
                    ${EscapeHtml(Share.label)} · Bet ${EscapeHtml(Share.bet_display)} · Pot ${EscapeHtml(Share.pot_display)}
                  </div>
                </div>
                <span data-chat-session-share-status>${EscapeHtml(StatusLabel)}</span>
              </div>
              <div data-chat-session-share-copy>${EscapeHtml(Share.status_text)}</div>
              <div data-chat-session-share-actions>
                <a href="${EscapeHtml(Share.view_url || "#")}">View session</a>
                ${JoinActionMarkup}
              </div>
            </div>
        `;
    };

    const RenderSessionShareMarkup = (Share) =>
    {
        if (!Share)
        {
            return "";
        }

        const StatusLabel = Share.status === "countdown" ? "live" : (Share.status || "session");

        const JoinActionMarkup = Share.is_joinable && Share.join_url
            ? `
                <form action="${EscapeHtml(Share.join_url)}" method="post">
                  <button type="submit">Join session</button>
                </form>
            `
            : "";

        return `
            <div data-chat-session-share>
              <div data-chat-session-share-head>
                <div>
                  <div data-chat-session-share-title>${EscapeHtml(Share.title)}</div>
                  <div data-chat-session-share-copy>
                    ${EscapeHtml(Share.label)} &middot; Bet ${EscapeHtml(Share.bet_display)} &middot; Pot ${EscapeHtml(Share.pot_display)}
                  </div>
                </div>
                <span data-chat-session-share-status>${EscapeHtml(StatusLabel)}</span>
              </div>
              <div data-chat-session-share-copy>${EscapeHtml(Share.status_text)}</div>
              <div data-chat-session-share-actions>
                <a href="${EscapeHtml(Share.view_url || "#")}">View session</a>
                ${JoinActionMarkup}
              </div>
            </div>
        `;
    };

    const BuildMessageMarkup = (Message, PreviousMessage = null) =>
    {
        const IsGrouped = Boolean(
            PreviousMessage &&
            PreviousMessage.author?.id &&
            PreviousMessage.author.id === Message.author?.id,
        );
        const IsReplyToCurrentUser = Message.reply_to?.author?.id === CurrentUserId;
        const BubbleContentMarkup = `${BuildReplyContextMarkup(Message.reply_to)}${BuildHighlightedBodyMarkup(Message)}`;
        const AuthorMarkup = IsGrouped
            ? ""
            : `
                <div data-chat-author data-user-id="${EscapeHtml(Message.author.id)}">
                  <span data-chat-avatar>${BuildAvatarMarkup(Message.author)}</span>
                  <span>
                    <span data-chat-author-name>${EscapeHtml(Message.author.display_name)}</span>
                    <span data-chat-author-time data-chat-message-time data-timestamp="${EscapeHtml(Message.timestamp)}">
                      ${EscapeHtml(FormatRelativeTime(Message.timestamp))}
                    </span>
                  </span>
                </div>
            `;

        return `
            <div data-chat-row data-grouped="${IsGrouped ? "true" : "false"}" data-self="${Message.is_self ? "true" : "false"}">
              <article
                data-chat-message
                data-focused="false"
                data-message-id="${EscapeHtml(Message.id)}"
                data-mentioned="${Message.is_current_user_mentioned ? "true" : "false"}"
                data-replying-to-current-user="${IsReplyToCurrentUser ? "true" : "false"}"
                data-user-id="${EscapeHtml(Message.author.id)}"
              >
                <button
                  aria-label="Reply to ${EscapeHtml(Message.author.display_name)}"
                  data-chat-reply-trigger
                  data-message-id="${EscapeHtml(Message.id)}"
                  title="Reply"
                  type="button"
                >
                  <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
                    <path d="M7.25 6 3.5 10l3.75 4"></path>
                    <path d="M4 10h7.25c2.62 0 4.75 2.13 4.75 4.75"></path>
                  </svg>
                </button>
                ${AuthorMarkup}
                <div data-chat-bubble>${BubbleContentMarkup}</div>
                ${RenderSessionShareMarkup(Message.session_share)}
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
            ChatMessages.dataset.empty = "true";
            ChatMessages.innerHTML = EmptyStateMarkup;
            return;
        }

        delete ChatMessages.dataset.empty;
        ChatMessages.innerHTML = CurrentMessages.map((Message, Index) =>
        {
            return BuildMessageMarkup(Message, CurrentMessages[Index - 1] || null);
        }).join("");

        if (HoverAnchor && !ChatMessages.contains(HoverAnchor))
        {
            HideProfileCard();
        }

        if (PendingFocusMessageId)
        {
            window.requestAnimationFrame(() =>
            {
                FocusChatMessage(PendingFocusMessageId);
            });
        }

        if (ShouldStickToBottom && !PendingFocusMessageId)
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

    const BuildMessageSignature = (Message) =>
    {
        return JSON.stringify({
            author: Message.author,
            body: Message.body,
            id: Message.id,
            is_current_user_mentioned: Message.is_current_user_mentioned,
            is_self: Message.is_self,
            mention_tokens: Message.mention_tokens,
            reply_to: Message.reply_to,
            session_share: Message.session_share,
            timestamp: Message.timestamp,
        });
    };

    const MergeMessages = (IncomingMessages, Reset) =>
    {
        const NextMessages = Reset ? [] : CurrentMessages.slice();
        const KnownIndexes = new Map(NextMessages.map((Message, Index) => [Message.id, Index]));
        let DidChange = Boolean(Reset);

        IncomingMessages.forEach((Message) =>
        {
            const ExistingIndex = KnownIndexes.get(Message.id);

            if (ExistingIndex !== undefined)
            {
                if (BuildMessageSignature(NextMessages[ExistingIndex]) !== BuildMessageSignature(Message))
                {
                    NextMessages[ExistingIndex] = Message;
                    DidChange = true;
                }

                return;
            }

            KnownIndexes.set(Message.id, NextMessages.push(Message) - 1);
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
        SetTypingSummary(Payload.typing_users);

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

    const ClearTypingResetTimeout = () =>
    {
        if (!TypingResetTimeout)
        {
            return;
        }

        window.clearTimeout(TypingResetTimeout);
        TypingResetTimeout = 0;
    };

    const ShouldBroadcastTyping = () =>
    {
        return Boolean(
            ChatInput?.value.trim() &&
            ChatShell.dataset.chatOpen === "true" &&
            document.visibilityState !== "hidden" &&
            Date.now() - LastTypingInputAt <= LocalTypingWindowMs,
        );
    };

    const SyncTypingState = ({ forceHeartbeat = false } = {}) =>
    {
        const NextTypingState = ShouldBroadcastTyping();
        const DidChange = NextTypingState !== IsTyping;

        IsTyping = NextTypingState;

        if ((!DidChange && !forceHeartbeat) || !PresenceHeartbeatUrl || document.visibilityState === "hidden")
        {
            return;
        }

        SendPresenceHeartbeat().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const ScheduleTypingReset = () =>
    {
        ClearTypingResetTimeout();

        if (!ChatInput?.value.trim())
        {
            return;
        }

        TypingResetTimeout = window.setTimeout(() =>
        {
            SyncTypingState();
        }, LocalTypingWindowMs + 120);
    };

    const ResetTypingState = ({ notify = true } = {}) =>
    {
        LastTypingInputAt = 0;
        ClearTypingResetTimeout();

        if (!notify)
        {
            IsTyping = false;
            return;
        }

        SyncTypingState();
    };

    const BuildPresencePayload = () =>
    {
        return JSON.stringify({
            path: `${window.location.pathname}${window.location.search}`,
            typing: IsTyping,
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
        ResetTypingState({
            notify: false,
        });
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
        return window.GamblingApp?.buildUserProfileCardMarkup?.(Profile, {
            includeTipControls: true,
        }) || "";
    };

    const HideComposerSuggestions = () =>
    {
        ComposerSuggestions = [];
        ComposerSuggestionActiveIndex = 0;
        ComposerSuggestionRange = null;
        ComposerSuggestionType = "";

        if (!ChatSuggestionShell)
        {
            return;
        }

        ChatSuggestionShell.innerHTML = "";
        ChatSuggestionShell.dataset.open = "false";
        ChatSuggestionShell.setAttribute("aria-hidden", "true");
    };

    const RenderComposerSuggestions = () =>
    {
        if (!ChatSuggestionShell || !ComposerSuggestions.length)
        {
            HideComposerSuggestions();
            return;
        }

        ChatSuggestionShell.innerHTML = ComposerSuggestions.map((Suggestion, Index) =>
        {
            if (ComposerSuggestionType === "emoji")
            {
                return `
                    <button
                      data-chat-suggestion-item
                      data-active="${Index === ComposerSuggestionActiveIndex ? "true" : "false"}"
                      data-index="${Index}"
                      type="button"
                    >
                      <span data-chat-suggestion-emoji>${Suggestion.emoji}</span>
                      <span data-chat-suggestion-copy>
                        <span data-chat-suggestion-title>:${EscapeHtml(Suggestion.alias)}:</span>
                      </span>
                    </button>
                `;
            }

            return `
                <button
                  data-chat-suggestion-item
                  data-active="${Index === ComposerSuggestionActiveIndex ? "true" : "false"}"
                  data-index="${Index}"
                  type="button"
                >
                  <span data-chat-suggestion-avatar>${BuildAvatarMarkup(Suggestion)}</span>
                  <span data-chat-suggestion-copy>
                    <span data-chat-suggestion-title>${EscapeHtml(Suggestion.display_name)}</span>
                    <span data-chat-suggestion-subtitle>@${EscapeHtml(Suggestion.username)}</span>
                  </span>
                </button>
            `;
        }).join("");
        ChatSuggestionShell.dataset.open = "true";
        ChatSuggestionShell.setAttribute("aria-hidden", "false");
    };

    const SetComposerSuggestions = (Suggestions, Range) =>
    {
        if (!Range || !Suggestions.length)
        {
            HideComposerSuggestions();
            return;
        }

        ComposerSuggestions = Suggestions.slice(0, 6);
        ComposerSuggestionActiveIndex = 0;
        ComposerSuggestionRange = Range;
        ComposerSuggestionType = Range.type;
        RenderComposerSuggestions();
    };

    const GetComposerTokenRange = () =>
    {
        if (!ChatInput)
        {
            return null;
        }

        const InputValue = ChatInput.value;
        const CaretPosition = ChatInput.selectionStart ?? InputValue.length;

        if ((ChatInput.selectionEnd ?? CaretPosition) !== CaretPosition)
        {
            return null;
        }

        const BeforeCursor = InputValue.slice(0, CaretPosition);
        const Match = BeforeCursor.match(/(?:^|\s)([@:])([A-Za-z0-9_.+\-]*)$/);

        if (!Match)
        {
            return null;
        }

        const LeadingOffset = Match[0].startsWith(" ") ? 1 : 0;

        return {
            end: CaretPosition,
            query: Match[2] || "",
            start: CaretPosition - Match[0].length + LeadingOffset,
            type: Match[1] === "@" ? "mention" : "emoji",
        };
    };

    const BuildEmojiSuggestions = (Query) =>
    {
        const NormalizedQuery = NormalizeSearchValue(Query);

        return EmojiShortcodeSuggestions
            .map((Suggestion) =>
            {
                const Alias = NormalizeSearchValue(Suggestion.alias);
                let Score = 0;

                if (!NormalizedQuery)
                {
                    Score = 100;
                }
                else if (Alias === NormalizedQuery)
                {
                    Score = 320;
                }
                else if (Alias.startsWith(NormalizedQuery))
                {
                    Score = 240 - Math.min(Alias.length - NormalizedQuery.length, 20);
                }
                else if (Alias.includes(NormalizedQuery))
                {
                    Score = 160 - Alias.indexOf(NormalizedQuery);
                }

                return {
                    ...Suggestion,
                    score: Score,
                };
            })
            .filter((Suggestion) => Suggestion.score > 0)
            .sort((Left, Right) =>
            {
                if (Right.score !== Left.score)
                {
                    return Right.score - Left.score;
                }

                return Left.alias.localeCompare(Right.alias);
            })
            .slice(0, 6);
    };

    const FetchMentionSuggestions = async (Query) =>
    {
        if (!MentionSuggestionsUrl)
        {
            return [];
        }

        const RequestUrl = new URL(MentionSuggestionsUrl, window.location.href);

        if (Query)
        {
            RequestUrl.searchParams.set("q", Query);
        }

        const Response = await fetch(RequestUrl.href, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!Response.ok)
        {
            return [];
        }

        const Payload = await Response.json().catch(() => ({}));
        return Array.isArray(Payload?.suggestions) ? Payload.suggestions.slice(0, 6) : [];
    };

    const UpdateComposerSuggestions = async () =>
    {
        const Range = GetComposerTokenRange();

        if (!Range)
        {
            HideComposerSuggestions();
            return;
        }

        if (Range.type === "emoji")
        {
            SetComposerSuggestions(BuildEmojiSuggestions(Range.query), Range);
            return;
        }

        const RequestToken = ++ComposerSuggestionRequestToken;

        try
        {
            const Suggestions = await FetchMentionSuggestions(Range.query);

            if (RequestToken !== ComposerSuggestionRequestToken)
            {
                return;
            }

            SetComposerSuggestions(Suggestions, Range);
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);

            if (RequestToken === ComposerSuggestionRequestToken)
            {
                HideComposerSuggestions();
            }
        }
    };

    const ApplyComposerSuggestion = (SuggestionIndex = ComposerSuggestionActiveIndex) =>
    {
        const Suggestion = ComposerSuggestions[SuggestionIndex];

        if (!Suggestion || !ComposerSuggestionRange || !ChatInput)
        {
            return false;
        }

        const Before = ChatInput.value.slice(0, ComposerSuggestionRange.start);
        const After = ChatInput.value.slice(ComposerSuggestionRange.end);
        const Replacement = ComposerSuggestionType === "emoji"
            ? Suggestion.emoji
            : `@${Suggestion.username}`;
        const NeedsSpacer = !After || !/^[\s.,!?]/.test(After);
        const Spacer = NeedsSpacer ? " " : "";
        const CaretPosition = (Before + Replacement + Spacer).length;

        ChatInput.value = `${Before}${Replacement}${Spacer}${After}`;
        ChatInput.focus();
        ChatInput.setSelectionRange(CaretPosition, CaretPosition);
        HideComposerSuggestions();
        UpdateComposerState();
        return true;
    };

    const MoveComposerSuggestionSelection = (Direction) =>
    {
        if (!ComposerSuggestions.length)
        {
            return;
        }

        const LastIndex = ComposerSuggestions.length - 1;
        const NextIndex = ComposerSuggestionActiveIndex + Direction;

        if (NextIndex < 0)
        {
            ComposerSuggestionActiveIndex = LastIndex;
        }
        else if (NextIndex > LastIndex)
        {
            ComposerSuggestionActiveIndex = 0;
        }
        else
        {
            ComposerSuggestionActiveIndex = NextIndex;
        }

        RenderComposerSuggestions();
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
        RenderedProfileUserId = "";
        ChatProfileCard.dataset.open = "false";
        ChatProfileCard.setAttribute("aria-hidden", "true");
    };

    const ScheduleHideProfileCard = () =>
    {
        if (HoverHideTimeout)
        {
            window.clearTimeout(HoverHideTimeout);
        }

        HoverHideTimeout = window.setTimeout(HideProfileCard, ProfileHideDelayMs);
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
        const ShouldAnimateSwitch = ChatProfileCard.dataset.open === "true"
            && RenderedProfileUserId
            && RenderedProfileUserId !== UserId;
        const ProfilePromise = FetchProfile(UserId);

        if (ShouldAnimateSwitch)
        {
            ChatProfileCard.dataset.open = "false";
            ChatProfileCard.setAttribute("aria-hidden", "true");
            await Wait(ProfileSwitchDelayMs);
        }

        const Profile = await ProfilePromise;

        if (!Profile || RequestToken !== HoverRequestToken || HoveredUserId !== UserId || HoverAnchor !== Anchor)
        {
            return;
        }

        ChatProfileCard.innerHTML = BuildProfileMarkup(Profile);
        RenderedProfileUserId = UserId;
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

    const SendSessionShare = async (ShareButton) =>
    {
        if (!ShareButton || IsSending)
        {
            return;
        }

        const Game = ShareButton.dataset.shareGame || "";
        const SessionId = ShareButton.dataset.shareSessionId || "";
        const OriginalLabel = ShareButton.dataset.shareIdleLabel || ShareButton.textContent.trim() || "Share in chat";

        if (!Game || !SessionId)
        {
            return;
        }

        ShareButton.dataset.shareIdleLabel = OriginalLabel;
        ShareButton.disabled = true;
        ShareButton.textContent = "Sharing...";
        SetChatError("");

        try
        {
            const Response = await fetch(SendUrl, {
                body: JSON.stringify({
                    session_share: {
                        game: Game,
                        session_id: SessionId,
                    },
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
                SetChatError(Payload.error || "Session could not be shared.");
                ShareButton.textContent = OriginalLabel;
                return;
            }

            ApplyOnlineCount(Payload.online_count);

            if (Payload.message)
            {
                AppendMessage(Payload.message);
            }

            ShareButton.textContent = "Shared";
            SetChatOpen(true, {
                FocusComposer: false,
            });
            window.setTimeout(() =>
            {
                if (!ShareButton.isConnected)
                {
                    return;
                }

                ShareButton.textContent = OriginalLabel;
            }, 1200);
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            SetChatError("Session could not be shared.");
            ShareButton.textContent = OriginalLabel;
        }
        finally
        {
            if (ShareButton.isConnected)
            {
                ShareButton.disabled = false;
            }
        }
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
                    reply_to_message_id: ActiveReplyMessage?.id || null,
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
                if (Payload.error === "That message can no longer be replied to.")
                {
                    ClearActiveReplyMessage();
                }

                SetChatError(Payload.error || "Message could not be sent.");
                return;
            }

            ChatInput.value = "";
            HideComposerSuggestions();
            ClearActiveReplyMessage();
            ResetTypingState();
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
    ChatHeader?.addEventListener("pointerdown", StartChatDrag);
    ChatResizeHandle?.addEventListener("pointerdown", StartChatResize);

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

    ChatComposer?.addEventListener("click", (EventValue) =>
    {
        const ClearButton = EventValue.target.closest("[data-chat-reply-clear]");

        if (!ClearButton || !ChatComposer.contains(ClearButton))
        {
            return;
        }

        EventValue.preventDefault();
        ClearActiveReplyMessage({
            focusComposer: true,
        });
    });

    ChatComposer?.addEventListener("keydown", (EventValue) =>
    {
        if (!ComposerSuggestions.length)
        {
            return;
        }

        if (EventValue.key === "ArrowDown")
        {
            EventValue.preventDefault();
            MoveComposerSuggestionSelection(1);
            return;
        }

        if (EventValue.key === "ArrowUp")
        {
            EventValue.preventDefault();
            MoveComposerSuggestionSelection(-1);
            return;
        }

        if (["Enter", "Tab"].includes(EventValue.key))
        {
            EventValue.preventDefault();
            ApplyComposerSuggestion();
            return;
        }

        if (EventValue.key === "Escape")
        {
            EventValue.preventDefault();
            HideComposerSuggestions();
        }
    });

    document.addEventListener("click", (EventValue) =>
    {
        const ShareButton = EventValue.target.closest("[data-share-chat-session]");

        if (!ShareButton)
        {
            return;
        }

        EventValue.preventDefault();
        SendSessionShare(ShareButton).catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatInput?.addEventListener("input", () =>
    {
        SetChatError("");
        UpdateComposerState();

        if (ChatInput.value.trim())
        {
            LastTypingInputAt = Date.now();
            ScheduleTypingReset();
            SyncTypingState();
        }
        else
        {
            ResetTypingState();
        }

        UpdateComposerSuggestions().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatInput?.addEventListener("click", () =>
    {
        UpdateComposerSuggestions().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatInput?.addEventListener("focus", () =>
    {
        UpdateComposerSuggestions().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatInput?.addEventListener("blur", () =>
    {
        ResetTypingState();
    });

    ChatInput?.addEventListener("keyup", (EventValue) =>
    {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(EventValue.key))
        {
            return;
        }

        UpdateComposerSuggestions().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    });

    ChatSuggestionShell?.addEventListener("mousedown", (EventValue) =>
    {
        EventValue.preventDefault();
    });

    ChatSuggestionShell?.addEventListener("click", (EventValue) =>
    {
        const SuggestionButton = EventValue.target.closest("[data-chat-suggestion-item]");

        if (!SuggestionButton || !ChatSuggestionShell.contains(SuggestionButton))
        {
            return;
        }

        EventValue.preventDefault();
        ApplyComposerSuggestion(Number.parseInt(SuggestionButton.dataset.index || "0", 10));
    });

    document.addEventListener("click", (EventValue) =>
    {
        if (!ChatComposer?.contains(EventValue.target))
        {
            HideComposerSuggestions();
        }
    });

    ChatMessages?.addEventListener("click", (EventValue) =>
    {
        const ReplyTrigger = EventValue.target.closest("[data-chat-reply-trigger]");

        if (!ReplyTrigger || !ChatMessages.contains(ReplyTrigger))
        {
            return;
        }

        EventValue.preventDefault();
        const MessageId = Number.parseInt(ReplyTrigger.dataset.messageId || "0", 10);
        const Message = FindMessageById(MessageId);

        if (!Message)
        {
            return;
        }

        SetActiveReplyMessage(Message);
        ChatInput?.focus();
        HideComposerSuggestions();
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

        if (UserId === CurrentUserId)
        {
            HideProfileCard();
            return;
        }

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

    window.addEventListener("pointermove", UpdateChatResize);
    window.addEventListener("pointermove", UpdateChatDrag);
    window.addEventListener("pointerup", EndChatResize);
    window.addEventListener("pointerup", EndChatDrag);
    window.addEventListener("pointercancel", EndChatResize);
    window.addEventListener("pointercancel", EndChatDrag);
    window.addEventListener("resize", () =>
    {
        SyncChatPanelSize();
        SyncChatDragPosition();
        PositionProfileCard();
    });
    window.addEventListener("scroll", PositionProfileCard, true);
    window.addEventListener("pagehide", SendOfflinePresence);
    window.addEventListener("beforeunload", SendOfflinePresence);
    document.addEventListener("visibilitychange", () =>
    {
        if (document.visibilityState === "hidden")
        {
            ClearPollTimeout();
            HideProfileCard();
            SetTypingSummary([]);
            SendOfflinePresence();
            return;
        }

        SentOfflinePresence = false;
        StartPresenceHeartbeat();
        SchedulePoll(120);
    });
    window.addEventListener("site-chat:open", (EventValue) =>
    {
        const TargetMessageId = Number.parseInt(EventValue?.detail?.targetMessageId || "0", 10);

        if (TargetMessageId > 0)
        {
            PendingFocusMessageId = TargetMessageId;
        }

        SetChatOpen(true, {
            FocusComposer: false,
        });

        if (PendingFocusMessageId && !FocusChatMessage(PendingFocusMessageId))
        {
            FetchChatState().then((Payload) =>
            {
                if (!Payload)
                {
                    return;
                }

                ApplyChatState(Payload);
            }).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        }

        SchedulePoll(120);
    });

    UpdateComposerState();
    SetTypingSummary([]);
    SetChatOpen(!IsMobileViewport(), { FocusComposer: false });
    SyncChatPanelSize({
        useStoredSize: true,
    });
    SyncChatDragPosition({
        useStoredPosition: true,
    });
    RelativeTimeInterval = window.setInterval(UpdateRelativeTimes, 15000);
    StartPresenceHeartbeat();
    SchedulePoll(120);
})();
