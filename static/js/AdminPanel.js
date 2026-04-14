(() =>
{
    const EscapeHtml = (Value) =>
    {
        return String(Value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    };

    const FormatCountdown = (Value) =>
    {
        const NumberValue = Number(Value);

        if (!Number.isFinite(NumberValue) || NumberValue <= 0)
        {
            return "0s";
        }

        return `${Math.max(0, Math.ceil(NumberValue))}s`;
    };

    const FormatPercent = (Value) =>
    {
        const NumberValue = Number(Value);

        if (!Number.isFinite(NumberValue))
        {
            return "0%";
        }

        return `${Number.isInteger(NumberValue) ? NumberValue.toFixed(0) : NumberValue.toFixed(1)}%`;
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

        if (Delta < 2592000)
        {
            return `${Math.floor(Delta / 86400)}d ago`;
        }

        return new Date(NumberValue * 1000).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const ShowToast = (Title, Message, Tone = "info") =>
    {
        window.GamblingApp?.showToast?.({
            message: Message,
            title: Title,
            tone: Tone,
        });
    };

    const CreateNodeFromMarkup = (Markup) =>
    {
        const Template = document.createElement("template");
        Template.innerHTML = String(Markup || "").trim();
        return Template.content.firstElementChild;
    };

    const SetTextContent = (TargetNode, Value) =>
    {
        if (!(TargetNode instanceof Node))
        {
            return;
        }

        TargetNode.textContent = String(Value ?? "");
    };

    const BuildAvatarMarkup = (Row, SizeClass = "h-12 w-12") =>
    {
        const FallbackUrl = Row?.avatar_static_url || Row?.avatar_url || "";
        const AvatarUrl = FallbackUrl || Row?.avatar_url || "";

        if (AvatarUrl)
        {
            return `
                <img
                  alt="${EscapeHtml(Row.display_name)}"
                  class="${SizeClass} rounded-[14px] border border-white/10 object-cover"
                  data-fallback-src="${EscapeHtml(FallbackUrl)}"
                  onerror="if (this.dataset.fallbackSrc && this.currentSrc !== this.dataset.fallbackSrc) { this.src = this.dataset.fallbackSrc; }"
                  src="${EscapeHtml(AvatarUrl)}"
                >
            `;
        }

        return `
            <span class="inline-flex ${SizeClass} items-center justify-center rounded-[14px] border border-white/10 bg-white/10 text-sm font-semibold uppercase text-white">
              ${EscapeHtml((Row?.display_name || Row?.username || "?").slice(0, 1))}
            </span>
        `;
    };

    const BuildSettingsButtonMarkup = (Label) =>
    {
        return `
            <button
              aria-label="Open ${EscapeHtml(Label)} settings"
              class="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-white/54 transition hover:bg-white/[0.08] hover:text-white"
              data-admin-row-settings
              type="button"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" aria-hidden="true">
                <circle cx="12" cy="12" r="6.1"></circle>
                <circle cx="12" cy="12" r="2.9"></circle>
                <path d="M12 2.8v2.35"></path>
                <path d="M12 18.85v2.35"></path>
                <path d="m18.54 5.46-1.66 1.66"></path>
                <path d="m7.12 16.88-1.66 1.66"></path>
                <path d="M21.2 12h-2.35"></path>
                <path d="M5.15 12H2.8"></path>
                <path d="m18.54 18.54-1.66-1.66"></path>
                <path d="m7.12 7.12-1.66-1.66"></path>
              </svg>
            </button>
        `;
    };

    const BuildStatusBadgeMarkup = (Label, Tone = "neutral") =>
    {
        const ToneClass = Tone === "live"
            ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-100"
            : Tone === "resolved"
                ? "border-white/12 bg-white/[0.06] text-white/76"
                : "border-amber-400/16 bg-amber-500/10 text-amber-100";

        return `
            <span class="inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${ToneClass}">
              ${EscapeHtml(Label)}
            </span>
        `;
    };

    const RenderDetailRow = (Key, Label, Value, AdditionalClassName = "") =>
    {
        return `
            <div class="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2.5 ${AdditionalClassName}">
              <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">${EscapeHtml(Label)}</div>
              <div class="mt-1 text-sm font-medium text-white" data-admin-popout-value="${EscapeHtml(Key)}">${EscapeHtml(Value)}</div>
            </div>
        `;
    };

    const RenderEmptyList = (Message) =>
    {
        return `
            <div class="px-4 py-10 text-center text-sm text-white/34">
              ${EscapeHtml(Message)}
            </div>
        `;
    };

    const GetSessionStatusTone = (Row) =>
    {
        if (Row?.status === "countdown")
        {
            return "live";
        }

        if (Row?.status === "resolved")
        {
            return "resolved";
        }

        return "open";
    };

    const GetSessionStatusLabel = (Row) =>
    {
        if (Row?.status === "countdown")
        {
            return `Live ${FormatCountdown(Row?.countdown_remaining)}`;
        }

        if (Row?.status === "resolved")
        {
            return "Resolved";
        }

        return "Open";
    };

    const BuildSessionMatchupCopy = (Row) =>
    {
        if (Row?.game === "coinflip")
        {
            return `${Row?.creator_choice || "Heads"} vs ${Row?.opponent_choice || "Tails"}`;
        }

        if (Row?.creator_label && Row?.opponent_label && Row.creator_label !== Row.mode_label)
        {
            return `${Row.creator_label} vs ${Row.opponent_label}`;
        }

        return Row?.mode_label || "--";
    };

    const BuildSessionResultCopy = (Row) =>
    {
        if (Row?.status !== "resolved")
        {
            return Row?.status === "countdown"
                ? `${FormatCountdown(Row?.countdown_remaining)} remaining`
                : "Waiting for player...";
        }

        if (Row?.game === "coinflip")
        {
            if (Row?.winner_name && Row?.result_side)
            {
                return `${Row.winner_name} wins on ${Row.result_side}.`;
            }

            return Row?.winner_name || "--";
        }

        if (Number.isFinite(Number(Row?.result_face)))
        {
            return `${Row?.winner_name || "Winner"} wins on ${Row.result_face}.`;
        }

        if (Row?.winner_name)
        {
            return `${Row.winner_name} wins ${Number(Row?.creator_score) || 0}-${Number(Row?.opponent_score) || 0}.`;
        }

        return "--";
    };

    const RenderPlayerRow = (Row) =>
    {
        const StatusColor = Row.is_online ? "bg-emerald-400" : "bg-white/28";
        const BalanceCopy = Row.balance_display || "$0";

        return `
            <div
              class="flex items-center gap-4 px-4 py-4 transition hover:bg-white/[0.03]"
              data-admin-player-row
              data-user-id="${EscapeHtml(Row.id)}"
            >
              <span class="shrink-0">
                ${BuildAvatarMarkup(Row)}
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-[1.02rem] font-medium text-white">${EscapeHtml(Row.display_name)}</div>
                <div class="mt-1 truncate text-xs text-white/34">@${EscapeHtml(Row.username)}</div>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <div class="text-right">
                  <div class="text-sm font-medium text-white/52">${EscapeHtml(BalanceCopy)}</div>
                  <div class="mt-1 flex items-center justify-end gap-2 text-[11px] uppercase tracking-[0.12em] text-white/26">
                    <span class="inline-flex h-2.5 w-2.5 rounded-full ${StatusColor}"></span>
                    <span>${Row.is_online ? "Online" : "Offline"}</span>
                  </div>
                </div>
                ${BuildSettingsButtonMarkup("player")}
              </div>
            </div>
        `;
    };

    const RenderSessionRow = (Row) =>
    {
        return `
            <div
              class="flex items-center gap-4 px-4 py-4 transition hover:bg-white/[0.03]"
              data-admin-session-row
              data-game="${EscapeHtml(Row.game)}"
              data-session-id="${EscapeHtml(Row.id)}"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <div class="truncate text-[1rem] font-medium text-white">${EscapeHtml(Row.participants_display)}</div>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/34">
                  <span>#${EscapeHtml(Row.id)}</span>
                  <span>${EscapeHtml(BuildSessionMatchupCopy(Row))}</span>
                  <span>Bet ${EscapeHtml(Row.bet_display || "$0")}</span>
                  <span>Pot ${EscapeHtml(Row.pot_display || "$0")}</span>
                  <span>${EscapeHtml(String(Row.viewer_count || 0))} viewers</span>
                </div>
                <div class="mt-2 text-xs text-white/42">${EscapeHtml(Row.status_text || "--")}</div>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                ${BuildStatusBadgeMarkup(GetSessionStatusLabel(Row), GetSessionStatusTone(Row))}
                ${BuildSettingsButtonMarkup(`${Row.game_label} session`)}
              </div>
            </div>
        `;
    };

    const BuildPlayerPopoutMarkup = (Row) =>
    {
        const LogoutMarkup = Row.can_force_logout
            ? `
                <button
                  class="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-red-400/14 bg-red-500/10 px-3 text-sm font-medium text-red-100 transition hover:bg-red-500/16 disabled:cursor-default disabled:opacity-45"
                  data-admin-force-logout
                  data-url="${EscapeHtml(Row.force_logout_url || "")}"
                  type="button"
                >
                  Logout
                </button>
            `
            : `
                <a
                  class="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  data-admin-logout-href
                  href="/logout"
                >
                  Logout
                </a>
            `;
        const StatusCopy = Row.is_online ? "Active" : "Offline";
        const LevelCopy = `${Row.reward_level || 0} (${Row.reward_badge || "Unranked"})`;
        const ActivityCopy = Row.current_path_label || "--";

        return `
            <div
              class="relative pointer-events-auto"
              data-admin-popout-shell
              data-popout-type="player"
              data-user-id="${EscapeHtml(Row.id)}"
            >
              <span
                class="pointer-events-none absolute h-4 w-4 rotate-45 bg-[#101116]"
                data-admin-popout-arrow
                style="top: var(--admin-popout-arrow-top, 36px);"
              ></span>
              <div class="rounded-[22px] border border-white/10 bg-[rgba(16,17,22,0.88)] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl">
                <div class="flex items-center gap-3">
                  <span class="shrink-0">
                    ${BuildAvatarMarkup(Row, "h-10 w-10")}
                  </span>
                  <div class="min-w-0">
                    <div class="truncate text-[1.05rem] font-semibold text-white">${EscapeHtml(Row.display_name)}</div>
                    <div class="mt-0.5 truncate text-[11px] text-white/38">@${EscapeHtml(Row.username)}</div>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2">
                  ${RenderDetailRow("status", "Status", StatusCopy)}
                  ${RenderDetailRow("balance", "Balance", Row.balance_display || "$0")}
                  ${RenderDetailRow("wagered", "Wagered", Row.total_wagered_display || "$0")}
                  ${RenderDetailRow("level", "Level", LevelCopy)}
                  ${RenderDetailRow("win-rate", "Win rate", FormatPercent(Row.win_rate))}
                  ${RenderDetailRow("registered", "Registered", FormatRelativeTime(Row.registered_at))}
                  ${RenderDetailRow("activity", "Activity", ActivityCopy, "col-span-2")}
                </div>

                <form
                  action="${EscapeHtml(Row.balance_adjust_url || "")}"
                  class="mt-3 flex items-center gap-2"
                  data-admin-popout-balance-form
                  method="post"
                >
                  <input
                    autocomplete="off"
                    class="h-10 min-w-0 flex-1 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition placeholder:text-white/26 focus:border-white/18 focus:bg-white/[0.05]"
                    inputmode="decimal"
                    name="amount"
                    placeholder="+200 / -200"
                    step="0.01"
                    type="number"
                  >
                  <button
                    class="inline-flex h-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-45"
                    type="submit"
                  >
                    Apply
                  </button>
                </form>

                <div class="mt-2 flex">
                  ${LogoutMarkup}
                </div>
              </div>
            </div>
        `;
    };

    const BuildSessionPopoutMarkup = (Row) =>
    {
        const CancelMarkup = Row.can_cancel
            ? `
                <button
                  class="inline-flex h-10 items-center justify-center rounded-[12px] border border-red-400/14 bg-red-500/10 px-3 text-sm font-medium text-red-100 transition hover:bg-red-500/16 disabled:cursor-default disabled:opacity-45"
                  data-admin-cancel-session
                  data-url="${EscapeHtml(Row.cancel_url || "")}"
                  type="button"
                >
                  Cancel session
                </button>
            `
            : "";
        const ActionGridClass = Row.can_cancel ? "grid-cols-2" : "grid-cols-1";
        const ResultCopy = BuildSessionResultCopy(Row);
        const StatusBadgeMarkup = Row?.status === "open"
            ? ""
            : BuildStatusBadgeMarkup(GetSessionStatusLabel(Row), GetSessionStatusTone(Row));
        const TitleClassName = StatusBadgeMarkup ? "mt-3" : "";

        return `
            <div
              class="relative pointer-events-auto"
              data-admin-popout-shell
              data-popout-type="session"
              data-game="${EscapeHtml(Row.game)}"
              data-session-id="${EscapeHtml(Row.id)}"
            >
              <span
                class="pointer-events-none absolute h-4 w-4 rotate-45 bg-[#101116]"
                data-admin-popout-arrow
                style="top: var(--admin-popout-arrow-top, 36px);"
              ></span>
              <div class="rounded-[22px] border border-white/10 bg-[rgba(16,17,22,0.88)] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    ${StatusBadgeMarkup ? `<div class="flex flex-wrap items-center gap-2">${StatusBadgeMarkup}</div>` : ""}
                    <div class="${TitleClassName} truncate text-[1.02rem] font-semibold text-white">${EscapeHtml(Row.participants_display)}</div>
                    <div class="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/34">Session #${EscapeHtml(Row.id)}</div>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2">
                  ${RenderDetailRow("status", "Status", Row.status_text || "--")}
                  ${RenderDetailRow("mode", "Mode", BuildSessionMatchupCopy(Row))}
                  ${RenderDetailRow("bet", "Bet", Row.bet_display || "$0")}
                  ${RenderDetailRow("pot", "Pot", Row.pot_display || "$0")}
                  ${RenderDetailRow("viewers", "Viewers", String(Row.viewer_count || 0))}
                  ${RenderDetailRow("created", "Created", FormatRelativeTime(Row.created_at))}
                  ${RenderDetailRow("result", "Result", ResultCopy, "col-span-2")}
                </div>

                <div class="mt-3 grid gap-2 ${ActionGridClass}">
                  <a
                    class="inline-flex h-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                    data-admin-open-session
                    href="${EscapeHtml(Row.view_url || "#")}"
                  >
                    Open session
                  </a>
                  ${CancelMarkup}
                </div>
              </div>
            </div>
        `;
    };

    const InitializeAdminPanelPage = ({ main }) =>
    {
        const PanelRoot = main.querySelector("[data-admin-panel]");
        const StateScript = main.querySelector("[data-admin-panel-state]");
        const PopoutNode = document.querySelector("[data-admin-popout]");

        if (!PanelRoot || !StateScript || !PopoutNode)
        {
            return null;
        }

        let IsDisposed = false;
        let LastState = null;
        let FilterQuery = "";
        let PollTimeout = 0;
        let PopoutAnimationToken = 0;
        let SelectedPopout = null;
        let ShouldAnimatePopoutOpen = false;
        let RenderedCoinflipSignature = "";
        let RenderedDiceSignature = "";
        let RenderedPlayersSignature = "";
        const PlayerCountNode = PanelRoot.querySelector("[data-admin-player-count]");
        const PlayerFilterInput = PanelRoot.querySelector("[data-admin-player-filter]");
        const PlayersNode = PanelRoot.querySelector("[data-admin-players]");
        const SessionTotalCountNode = PanelRoot.querySelector("[data-admin-session-total-count]");
        const CoinflipCountNode = PanelRoot.querySelector("[data-admin-session-count=\"coinflip\"]");
        const DiceCountNode = PanelRoot.querySelector("[data-admin-session-count=\"dice\"]");
        const CoinflipSessionsNode = PanelRoot.querySelector("[data-admin-coinflip-sessions]");
        const DiceSessionsNode = PanelRoot.querySelector("[data-admin-dice-sessions]");
        const StateUrl = PanelRoot.dataset.stateUrl || "";

        try
        {
            LastState = JSON.parse(StateScript.textContent || "{}");
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return null;
        }

        const ApplyGlobalBalance = (State) =>
        {
            if (State?.current_balance_display)
            {
                window.GamblingApp?.setGlobalBalanceDisplay?.(State.current_balance_display);
            }
        };

        const BuildSelection = (Type, Primary, Secondary = "") =>
        {
            return {
                primary: String(Primary ?? ""),
                secondary: String(Secondary ?? ""),
                type: Type,
            };
        };

        const BuildRenderSignature = (Value) =>
        {
            try
            {
                return JSON.stringify(Value ?? null);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
                return String(Date.now());
            }
        };

        const BuildSelectionKey = (Selection) =>
        {
            if (!Selection)
            {
                return "";
            }

            return [Selection.type, Selection.primary, Selection.secondary].join(":");
        };

        const PopoutHasFocusedField = () =>
        {
            const ActiveElement = document.activeElement;

            return ActiveElement instanceof HTMLElement
                && PopoutNode.contains(ActiveElement)
                && ActiveElement.matches("input, textarea, select");
        };

        const PopoutShellMatchesSelection = (ShellNode, Selection) =>
        {
            return ShellNode instanceof HTMLElement
                && ShellNode.dataset.selectionKey === BuildSelectionKey(Selection);
        };

        const GetPopoutViewportOffset = () =>
        {
            const ScopeNode = PopoutNode.parentElement;

            if (!(ScopeNode instanceof HTMLElement))
            {
                return {
                    left: 0,
                    top: 0,
                };
            }

            const ScopeStyles = window.getComputedStyle(ScopeNode);
            const CreatesFixedContainingBlock = ScopeStyles.transform !== "none"
                || ScopeStyles.filter !== "none"
                || ScopeStyles.perspective !== "none"
                || ScopeStyles.willChange.includes("transform")
                || ScopeStyles.willChange.includes("filter")
                || ScopeStyles.willChange.includes("perspective");

            if (!CreatesFixedContainingBlock)
            {
                return {
                    left: 0,
                    top: 0,
                };
            }

            const ScopeRect = ScopeNode.getBoundingClientRect();

            return {
                left: ScopeRect.left,
                top: ScopeRect.top,
            };
        };

        const GetPlayers = () =>
        {
            return Array.isArray(LastState?.players) ? LastState.players : [];
        };

        const GetSessions = () =>
        {
            return Array.isArray(LastState?.sessions) ? LastState.sessions : [];
        };

        const GetFilteredPlayers = () =>
        {
            const Query = FilterQuery.trim().toLowerCase();

            if (!Query)
            {
                return GetPlayers();
            }

            return GetPlayers().filter((Row) =>
            {
                const SearchBlob = [
                    Row.display_name,
                    Row.username,
                    Row.id,
                    Row.current_path,
                    Row.current_path_label,
                ].join(" ").toLowerCase();

                return SearchBlob.includes(Query);
            });
        };

        const GetSessionsByGame = (Game) =>
        {
            return GetSessions().filter((Row) => Row.game === Game);
        };

        const FindPlayerById = (UserId) =>
        {
            return GetPlayers().find((Row) => String(Row.id) === String(UserId)) || null;
        };

        const FindSessionById = (Game, SessionId) =>
        {
            return GetSessions().find((Row) =>
            {
                return Row.game === Game && String(Row.id) === String(SessionId);
            }) || null;
        };

        const FindSelectionRow = (Selection) =>
        {
            if (!Selection)
            {
                return null;
            }

            if (Selection.type === "player")
            {
                return FindPlayerById(Selection.primary);
            }

            if (Selection.type === "session")
            {
                return FindSessionById(Selection.primary, Selection.secondary);
            }

            return null;
        };

        const GetPlayerRowElement = (UserId) =>
        {
            return PanelRoot.querySelector(`[data-admin-player-row][data-user-id="${CSS.escape(String(UserId))}"]`);
        };

        const GetSessionRowElement = (Game, SessionId) =>
        {
            return PanelRoot.querySelector(
                `[data-admin-session-row][data-game="${CSS.escape(String(Game))}"][data-session-id="${CSS.escape(String(SessionId))}"]`,
            );
        };

        const GetSelectionAnchorElement = (Selection) =>
        {
            if (!Selection)
            {
                return null;
            }

            if (Selection.type === "player")
            {
                return GetPlayerRowElement(Selection.primary);
            }

            if (Selection.type === "session")
            {
                return GetSessionRowElement(Selection.primary, Selection.secondary);
            }

            return null;
        };

        const HidePopoutNow = () =>
        {
            PopoutAnimationToken += 1;
            PopoutNode.replaceChildren();
            PopoutNode.classList.add("pointer-events-none");
            PopoutNode.classList.remove("pointer-events-auto");
            PopoutNode.classList.add("hidden");
            PopoutNode.setAttribute("aria-hidden", "true");
            PopoutNode.style.left = "";
            PopoutNode.style.top = "";
            PopoutNode.style.removeProperty("--admin-popout-arrow-top");
        };

        const AnimatePopoutIn = (ShellNode) =>
        {
            if (!(ShellNode instanceof Element) || typeof ShellNode.animate !== "function")
            {
                return;
            }

            ShellNode.animate(
                [
                    {
                        filter: "blur(12px)",
                        opacity: 0,
                        transform: "translateY(10px) scale(0.92)",
                    },
                    {
                        filter: "blur(2px)",
                        opacity: 1,
                        offset: 0.68,
                        transform: "translateY(0) scale(1.025)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        transform: "translateY(0) scale(1)",
                    },
                ],
                {
                    duration: 340,
                    easing: "cubic-bezier(0.22, 1.18, 0.36, 1)",
                    fill: "both",
                },
            );
        };

        const ClosePopout = (Options = {}) =>
        {
            const {
                animate = false,
            } = Options;
            const LocalToken = ++PopoutAnimationToken;
            const ShellNode = PopoutNode.querySelector("[data-admin-popout-shell]");

            SelectedPopout = null;
            ShouldAnimatePopoutOpen = false;

            if (!animate || !(ShellNode instanceof Element) || typeof ShellNode.animate !== "function")
            {
                HidePopoutNow();
                return;
            }

            ShellNode.animate(
                [
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        transform: "translateY(0) scale(1)",
                    },
                    {
                        filter: "blur(10px)",
                        opacity: 0,
                        transform: "translateY(8px) scale(0.94)",
                    },
                ],
                {
                    duration: 180,
                    easing: "cubic-bezier(0.4, 0, 1, 1)",
                    fill: "both",
                },
            ).finished.catch(() => null).finally(() =>
            {
                if (LocalToken !== PopoutAnimationToken)
                {
                    return;
                }

                HidePopoutNow();
            });
        };

        const SyncPopoutArrowNode = (ArrowNode, Side) =>
        {
            if (!(ArrowNode instanceof HTMLElement))
            {
                return;
            }

            ArrowNode.className = Side === "left"
                ? "pointer-events-none absolute right-0 h-4 w-4 translate-x-1/2 rotate-45 border-r border-t border-white/10 bg-[#101116]"
                : "pointer-events-none absolute left-0 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-b border-white/10 bg-[#101116]";
        };

        const PositionPopout = (Selection, Options = {}) =>
        {
            const {
                animate = false,
                preserveExisting = false,
            } = Options;
            const Row = FindSelectionRow(Selection);
            const AnchorNode = GetSelectionAnchorElement(Selection);

            if (!Row || !(AnchorNode instanceof Element))
            {
                SelectedPopout = null;
                HidePopoutNow();
                return;
            }

            let ShellNode = PopoutNode.querySelector("[data-admin-popout-shell]");
            const ShouldReuseShell = preserveExisting && PopoutShellMatchesSelection(ShellNode, Selection);

            if (!ShouldReuseShell)
            {
                const Markup = Selection.type === "player"
                    ? BuildPlayerPopoutMarkup(Row)
                    : BuildSessionPopoutMarkup(Row);
                ShellNode = CreateNodeFromMarkup(Markup);

                if (!(ShellNode instanceof HTMLElement))
                {
                    SelectedPopout = null;
                    HidePopoutNow();
                    return;
                }

                ShellNode.dataset.selectionKey = BuildSelectionKey(Selection);
                PopoutAnimationToken += 1;
                PopoutNode.replaceChildren(ShellNode);
            }
            else
            {
                ShellNode.dataset.selectionKey = BuildSelectionKey(Selection);
            }

            PopoutNode.classList.remove("pointer-events-none");
            PopoutNode.classList.add("pointer-events-auto");
            PopoutNode.classList.remove("hidden");
            PopoutNode.setAttribute("aria-hidden", "false");
            PopoutNode.style.left = "0px";
            PopoutNode.style.top = "0px";

            const Margin = 12;
            const Gap = 18;
            const AnchorRect = AnchorNode.getBoundingClientRect();
            const PopoutViewportOffset = GetPopoutViewportOffset();
            const Width = PopoutNode.offsetWidth || 320;
            let Side = "right";

            if (AnchorRect.right + Gap + Width > window.innerWidth - Margin)
            {
                Side = "left";
            }

            SyncPopoutArrowNode(ShellNode.querySelector("[data-admin-popout-arrow]"), Side);
            ShellNode.style.transformOrigin = Side === "left" ? "right center" : "left center";

            const Height = PopoutNode.offsetHeight || 360;
            const AnchorFocusY = AnchorRect.top + Math.min(AnchorRect.height / 2, 26);
            const Top = Math.max(
                Margin,
                Math.min(AnchorRect.top - 12, window.innerHeight - Height - Margin),
            );
            let Left = Side === "left"
                ? AnchorRect.left - Width - Gap
                : AnchorRect.right + Gap;

            Left = Math.max(Margin, Math.min(Left, window.innerWidth - Width - Margin));

            const ArrowTop = Math.max(
                18,
                Math.min(AnchorFocusY - Top - 8, Height - 26),
            );

            PopoutNode.style.left = `${Left - PopoutViewportOffset.left}px`;
            PopoutNode.style.top = `${Top - PopoutViewportOffset.top}px`;
            PopoutNode.style.setProperty("--admin-popout-arrow-top", `${ArrowTop}px`);

            if (animate && !ShouldReuseShell)
            {
                AnimatePopoutIn(ShellNode);
            }
        };

        const ReopenSelectedPopout = (Options = {}) =>
        {
            const {
                preserveExisting = false,
            } = Options;

            if (!SelectedPopout)
            {
                HidePopoutNow();
                return;
            }

            PositionPopout(SelectedPopout, {
                animate: ShouldAnimatePopoutOpen,
                preserveExisting,
            });
            ShouldAnimatePopoutOpen = false;
        };

        const SyncList = (ListNode, Rows, BuildMarkup, EmptyMessage) =>
        {
            if (!(ListNode instanceof HTMLElement))
            {
                return;
            }

            if (!Rows.length)
            {
                const EmptyStateNode = CreateNodeFromMarkup(RenderEmptyList(EmptyMessage));
                ListNode.replaceChildren(...(EmptyStateNode ? [EmptyStateNode] : []));
                return;
            }

            const NextNodes = Rows
                .map((Row) => CreateNodeFromMarkup(BuildMarkup(Row)))
                .filter(Boolean);

            ListNode.replaceChildren(...NextNodes);
        };

        const GetSessionCountCopy = (Game) =>
        {
            const Summary = LastState?.summary || {};
            const LiveCount = Number(Summary[`${Game}_live`] || 0);
            const OpenCount = Number(Summary[`${Game}_open`] || 0);
            const ResolvedCount = Number(Summary[`${Game}_resolved`] || 0);
            const TotalCount = LiveCount + OpenCount + ResolvedCount;

            return `${TotalCount} total / ${LiveCount} live / ${OpenCount} open / ${ResolvedCount} resolved`;
        };

        const Render = (Options = {}) =>
        {
            const {
                forcePopoutRefresh = false,
            } = Options;

            if (!LastState)
            {
                return;
            }

            const AllPlayers = GetPlayers();
            const FilteredPlayers = GetFilteredPlayers();
            const CoinflipSessions = GetSessionsByGame("coinflip");
            const DiceSessions = GetSessionsByGame("dice");
            const PlayersSignature = BuildRenderSignature(FilteredPlayers);
            const CoinflipSignature = BuildRenderSignature(CoinflipSessions);
            const DiceSignature = BuildRenderSignature(DiceSessions);

            SetTextContent(PlayerCountNode, `${FilteredPlayers.length} / ${AllPlayers.length}`);
            SetTextContent(SessionTotalCountNode, `${GetSessions().length} total / ${Number(LastState?.summary?.sessions_live || 0)} live`);
            SetTextContent(CoinflipCountNode, GetSessionCountCopy("coinflip"));
            SetTextContent(DiceCountNode, GetSessionCountCopy("dice"));

            if (PlayersSignature !== RenderedPlayersSignature)
            {
                SyncList(PlayersNode, FilteredPlayers, RenderPlayerRow, "No players match the current filter.");
                RenderedPlayersSignature = PlayersSignature;
            }

            if (CoinflipSignature !== RenderedCoinflipSignature)
            {
                SyncList(CoinflipSessionsNode, CoinflipSessions, RenderSessionRow, "No coinflip sessions are active.");
                RenderedCoinflipSignature = CoinflipSignature;
            }

            if (DiceSignature !== RenderedDiceSignature)
            {
                SyncList(DiceSessionsNode, DiceSessions, RenderSessionRow, "No dice sessions are active.");
                RenderedDiceSignature = DiceSignature;
            }

            ApplyGlobalBalance(LastState);
            ReopenSelectedPopout({
                preserveExisting: !forcePopoutRefresh && PopoutHasFocusedField(),
            });
        };

        const SchedulePoll = (DelayMs = LastState?.poll_interval_ms || 2400) =>
        {
            if (IsDisposed)
            {
                return;
            }

            if (PollTimeout)
            {
                window.clearTimeout(PollTimeout);
            }

            PollTimeout = window.setTimeout(PollState, Math.max(Number(DelayMs) || 2400, 1200));
        };

        const HandleUnauthorized = () =>
        {
            window.location.href = "/play";
        };

        const PollState = async () =>
        {
            if (IsDisposed || !StateUrl)
            {
                return;
            }

            try
            {
                const RequestUrl = new URL(StateUrl, window.location.href);

                if (LastState?.version)
                {
                    RequestUrl.searchParams.set("version", LastState.version);
                }

                const Response = await fetch(RequestUrl.href, {
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (Response.status === 204)
                {
                    SchedulePoll();
                    return;
                }

                if (Response.status === 401 || Response.status === 404)
                {
                    HandleUnauthorized();
                    return;
                }

                if (!Response.ok)
                {
                    throw new Error(`Panel state request failed with ${Response.status}.`);
                }

                LastState = await Response.json();
                Render();
                SchedulePoll(LastState.poll_interval_ms);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
                SchedulePoll(3600);
            }
        };

        const SetFormBusy = (Form, IsBusy) =>
        {
            Form.querySelectorAll("button, input").forEach((Node) =>
            {
                Node.disabled = IsBusy;
            });
        };

        const SubmitBalanceAdjustment = async (Form) =>
        {
            const AmountInput = Form.querySelector("input[name='amount']");
            const RawAmount = AmountInput?.value ?? "";

            SetFormBusy(Form, true);

            try
            {
                const Response = await fetch(Form.action, {
                    body: JSON.stringify({
                        amount: RawAmount,
                    }),
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                });
                const Payload = await Response.json().catch(() => ({}));

                if (Response.status === 401 || Response.status === 404)
                {
                    HandleUnauthorized();
                    return;
                }

                if (!Response.ok)
                {
                    throw new Error(Payload?.error || `Request failed with ${Response.status}.`);
                }

                if (Payload.panel)
                {
                    LastState = Payload.panel;
                }

                if (AmountInput)
                {
                    AmountInput.value = "";
                }

                Render({
                    forcePopoutRefresh: true,
                });
                ShowToast("Balance updated", `${Payload.adjustment_display} applied.`, Payload.adjustment_cents > 0 ? "success" : "info");
            }
            catch (ErrorValue)
            {
                ShowToast("Panel error", ErrorValue.message || "Could not update the balance.", "error");
            }
            finally
            {
                SetFormBusy(Form, false);
            }
        };

        const SubmitForceLogout = async (Button) =>
        {
            const RequestUrl = Button.dataset.url || "";

            if (!RequestUrl)
            {
                return;
            }

            Button.disabled = true;

            try
            {
                const Response = await fetch(RequestUrl, {
                    headers: {
                        Accept: "application/json",
                    },
                    method: "POST",
                });
                const Payload = await Response.json().catch(() => ({}));

                if (Response.status === 401 || Response.status === 404)
                {
                    HandleUnauthorized();
                    return;
                }

                if (!Response.ok)
                {
                    throw new Error(Payload?.error || `Request failed with ${Response.status}.`);
                }

                if (Payload.panel)
                {
                    LastState = Payload.panel;
                }

                Render({
                    forcePopoutRefresh: true,
                });
                ShowToast("Player signed out", "The selected account was invalidated.", "success");
            }
            catch (ErrorValue)
            {
                ShowToast("Panel error", ErrorValue.message || "Could not sign the player out.", "error");
            }
            finally
            {
                Button.disabled = false;
            }
        };

        const SubmitSessionCancel = async (Button) =>
        {
            const RequestUrl = Button.dataset.url || "";

            if (!RequestUrl)
            {
                return;
            }

            Button.disabled = true;

            try
            {
                const Response = await fetch(RequestUrl, {
                    headers: {
                        Accept: "application/json",
                    },
                    method: "POST",
                });
                const Payload = await Response.json().catch(() => ({}));

                if (Response.status === 401 || Response.status === 404)
                {
                    HandleUnauthorized();
                    return;
                }

                if (!Response.ok)
                {
                    throw new Error(Payload?.error || `Request failed with ${Response.status}.`);
                }

                if (Payload.panel)
                {
                    LastState = Payload.panel;
                }

                Render({
                    forcePopoutRefresh: true,
                });
                ShowToast("Session canceled", `Eligible players were refunded ${Payload.refund_display || ""}.`.trim(), "success");
            }
            catch (ErrorValue)
            {
                ShowToast("Panel error", ErrorValue.message || "Could not cancel that session.", "error");
            }
            finally
            {
                Button.disabled = false;
            }
        };

        const OpenPlayerPopout = (UserId, Options = {}) =>
        {
            SelectedPopout = BuildSelection("player", UserId);
            ShouldAnimatePopoutOpen = Options.animate !== false;
            Render();
        };

        const OpenSessionPopout = (Game, SessionId, Options = {}) =>
        {
            SelectedPopout = BuildSelection("session", Game, SessionId);
            ShouldAnimatePopoutOpen = Options.animate !== false;
            Render();
        };

        const HandleFilterInput = (EventValue) =>
        {
            const Target = EventValue.target instanceof HTMLInputElement ? EventValue.target : null;

            if (!Target || Target !== PlayerFilterInput)
            {
                return;
            }

            FilterQuery = Target.value || "";
            Render();
        };

        const OpenSelectionFromRow = (RowNode, Options = {}) =>
        {
            if (!(RowNode instanceof Element))
            {
                return;
            }

            if (RowNode.matches("[data-admin-player-row]"))
            {
                OpenPlayerPopout(RowNode.dataset.userId || "", Options);
                return;
            }

            if (RowNode.matches("[data-admin-session-row]"))
            {
                OpenSessionPopout(RowNode.dataset.game || "", RowNode.dataset.sessionId || "", Options);
            }
        };

        const HandlePanelClick = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            const SettingsButton = Target.closest("[data-admin-row-settings]");

            if (SettingsButton)
            {
                EventValue.preventDefault();
                OpenSelectionFromRow(SettingsButton.closest("[data-admin-player-row], [data-admin-session-row]"));
                return;
            }

            if (Target.closest("a, button, input, form"))
            {
                return;
            }

            const RowNode = Target.closest("[data-admin-player-row], [data-admin-session-row]");

            if (RowNode && PanelRoot.contains(RowNode))
            {
                OpenSelectionFromRow(RowNode);
            }
        };

        const HandleRowContextMenu = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;
            const RowNode = Target?.closest("[data-admin-player-row], [data-admin-session-row]");

            if (!RowNode || !PanelRoot.contains(RowNode))
            {
                return;
            }

            EventValue.preventDefault();
            OpenSelectionFromRow(RowNode);
        };

        const HandleDocumentPointerDown = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            if (
                Target.closest("[data-admin-popout]") ||
                Target.closest("[data-admin-player-row]") ||
                Target.closest("[data-admin-session-row]")
            )
            {
                return;
            }

            ClosePopout({
                animate: true,
            });
        };

        const HandleDocumentContextMenu = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            if (
                Target.closest("[data-admin-player-row]") ||
                Target.closest("[data-admin-session-row]") ||
                Target.closest("[data-admin-popout]")
            )
            {
                return;
            }

            ClosePopout({
                animate: true,
            });
        };

        const HandlePopoutSubmit = (EventValue) =>
        {
            const Form = EventValue.target instanceof HTMLFormElement ? EventValue.target : null;

            if (!Form || !Form.matches("[data-admin-popout-balance-form]"))
            {
                return;
            }

            EventValue.preventDefault();
            SubmitBalanceAdjustment(Form).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        };

        const HandlePopoutClick = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            const LogoutButton = Target.closest("[data-admin-force-logout]");

            if (LogoutButton)
            {
                EventValue.preventDefault();
                SubmitForceLogout(LogoutButton).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            const CancelButton = Target.closest("[data-admin-cancel-session]");

            if (CancelButton)
            {
                EventValue.preventDefault();
                SubmitSessionCancel(CancelButton).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }
        };

        const HandleKeyDown = (EventValue) =>
        {
            if (EventValue.key !== "Escape")
            {
                return;
            }

            ClosePopout({
                animate: true,
            });
        };

        const HandleViewportChange = () =>
        {
            if (!SelectedPopout)
            {
                return;
            }

            ReopenSelectedPopout({
                preserveExisting: PopoutHasFocusedField(),
            });
        };

        PlayerFilterInput?.addEventListener("input", HandleFilterInput);
        PanelRoot.addEventListener("click", HandlePanelClick);
        PanelRoot.addEventListener("contextmenu", HandleRowContextMenu);
        PopoutNode.addEventListener("submit", HandlePopoutSubmit);
        PopoutNode.addEventListener("click", HandlePopoutClick);
        document.addEventListener("pointerdown", HandleDocumentPointerDown);
        document.addEventListener("contextmenu", HandleDocumentContextMenu);
        document.addEventListener("keydown", HandleKeyDown);
        window.addEventListener("resize", HandleViewportChange);
        window.addEventListener("scroll", HandleViewportChange, true);

        Render();
        SchedulePoll();

        return () =>
        {
            IsDisposed = true;

            if (PollTimeout)
            {
                window.clearTimeout(PollTimeout);
                PollTimeout = 0;
            }

            HidePopoutNow();
            PlayerFilterInput?.removeEventListener("input", HandleFilterInput);
            PanelRoot.removeEventListener("click", HandlePanelClick);
            PanelRoot.removeEventListener("contextmenu", HandleRowContextMenu);
            PopoutNode.removeEventListener("submit", HandlePopoutSubmit);
            PopoutNode.removeEventListener("click", HandlePopoutClick);
            document.removeEventListener("pointerdown", HandleDocumentPointerDown);
            document.removeEventListener("contextmenu", HandleDocumentContextMenu);
            document.removeEventListener("keydown", HandleKeyDown);
            window.removeEventListener("resize", HandleViewportChange);
            window.removeEventListener("scroll", HandleViewportChange, true);
        };
    };

    window.GamblingApp?.registerPageInitializer("admin-panel", InitializeAdminPanelPage);
})();
