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

    const FormatPercent = (Value) =>
    {
        const NumberValue = Number(Value);

        if (!Number.isFinite(NumberValue))
        {
            return "0%";
        }

        return `${Number.isInteger(NumberValue) ? NumberValue.toFixed(0) : NumberValue.toFixed(1)}%`;
    };

    const ShowToast = (Title, Message, Tone = "info") =>
    {
        window.GamblingApp?.showToast?.({
            message: Message,
            title: Title,
            tone: Tone,
        });
    };

    const BuildAvatarMarkup = (Row, SizeClass = "h-12 w-12") =>
    {
        const FallbackUrl = Row?.avatar_static_url || Row?.avatar_url || "";
        const AvatarUrl = Row?.avatar_url || FallbackUrl;

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

    const RenderPlayerRow = (Row) =>
    {
        const StatusColor = Row.is_online ? "bg-emerald-400" : "bg-white/28";
        const BalanceCopy = Row.balance_display || "$0";

        return `
            <button
              class="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-white/[0.03]"
              data-admin-player-row
              data-user-id="${EscapeHtml(Row.id)}"
              type="button"
            >
              <span class="shrink-0">
                ${BuildAvatarMarkup(Row)}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[1.02rem] font-medium text-white">${EscapeHtml(Row.display_name)}</span>
                <span class="mt-1 block truncate text-xs text-white/34">@${EscapeHtml(Row.username)}</span>
              </span>
              <span class="flex shrink-0 items-center gap-3">
                <span class="text-sm font-medium text-white/48">${EscapeHtml(BalanceCopy)}</span>
                <span class="inline-flex h-2.5 w-2.5 rounded-full ${StatusColor}"></span>
              </span>
            </button>
        `;
    };

    const RenderEmptyPlayerList = (Message) =>
    {
        return `
            <div class="px-4 py-10 text-center text-sm text-white/34">
              ${EscapeHtml(Message)}
            </div>
        `;
    };

    const RenderDetailRow = (Label, Value) =>
    {
        return `
            <div class="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">${EscapeHtml(Label)}</div>
              <div class="mt-1 text-sm font-medium text-white">${EscapeHtml(Value)}</div>
            </div>
        `;
    };

    const BuildPopoutMarkup = (Row, Side = "right") =>
    {
        const ArrowMarkup = Side === "left"
            ? `<span class="pointer-events-none absolute right-0 h-4 w-4 translate-x-1/2 rotate-45 border-r border-t border-white/10 bg-[#101116]" style="top: var(--admin-popout-arrow-top, 48px);"></span>`
            : `<span class="pointer-events-none absolute left-0 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-b border-white/10 bg-[#101116]" style="top: var(--admin-popout-arrow-top, 48px);"></span>`;
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
              style="transform-origin: ${Side === "left" ? "right center" : "left center"};"
            >
              ${ArrowMarkup}
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
                  ${RenderDetailRow("Status", StatusCopy)}
                  ${RenderDetailRow("Balance", Row.balance_display || "$0")}
                  ${RenderDetailRow("Wagered", Row.total_wagered_display || "$0")}
                  ${RenderDetailRow("Level", LevelCopy)}
                  ${RenderDetailRow("Win rate", FormatPercent(Row.win_rate))}
                  ${RenderDetailRow("Registered", FormatRelativeTime(Row.registered_at))}
                  <div class="col-span-2">
                    ${RenderDetailRow("Activity", ActivityCopy)}
                  </div>
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

    const InitializeAdminPanelPage = ({ main }) =>
    {
        const PanelRoot = main.querySelector("[data-admin-panel]");
        const StateScript = main.querySelector("[data-admin-panel-state]");
        const PopoutNode = document.querySelector("[data-admin-player-popout]");

        if (!PanelRoot || !StateScript || !PopoutNode)
        {
            return null;
        }

        let IsDisposed = false;
        let LastState = null;
        let FilterQuery = "";
        let PollTimeout = 0;
        let SelectedUserId = "";
        let PopoutAnimationToken = 0;
        let ShouldAnimatePopoutOpen = false;
        const PlayerCountNode = PanelRoot.querySelector("[data-admin-player-count]");
        const PlayerFilterInput = PanelRoot.querySelector("[data-admin-player-filter]");
        const PlayersNode = PanelRoot.querySelector("[data-admin-players]");
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

        const FindPlayerById = (UserId) =>
        {
            const Players = Array.isArray(LastState?.players) ? LastState.players : [];
            return Players.find((Row) => String(Row.id) === String(UserId)) || null;
        };

        const GetFilteredPlayers = () =>
        {
            const Players = Array.isArray(LastState?.players) ? LastState.players : [];
            const Query = FilterQuery.trim().toLowerCase();

            if (!Query)
            {
                return Players;
            }

            return Players.filter((Row) =>
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

        const GetPlayerRowElement = (UserId) =>
        {
            return Array.from(PanelRoot.querySelectorAll("[data-admin-player-row]")).find((Node) =>
            {
                return Node.dataset.userId === String(UserId);
            }) || null;
        };

        const HidePopoutNow = () =>
        {
            PopoutAnimationToken += 1;
            PopoutNode.innerHTML = "";
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

            SelectedUserId = "";
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

        const PositionPopout = (Row, AnchorNode, Options = {}) =>
        {
            const {
                animate = false,
            } = Options;

            if (!Row || !(AnchorNode instanceof Element))
            {
                HidePopoutNow();
                return;
            }

            const Margin = 12;
            const Gap = 18;
            const AnchorRect = AnchorNode.getBoundingClientRect();
            PopoutAnimationToken += 1;
            PopoutNode.classList.remove("pointer-events-none");
            PopoutNode.classList.add("pointer-events-auto");
            PopoutNode.classList.remove("hidden");
            PopoutNode.setAttribute("aria-hidden", "false");
            PopoutNode.style.left = "0px";
            PopoutNode.style.top = "0px";
            PopoutNode.innerHTML = BuildPopoutMarkup(Row, "right");

            const Width = PopoutNode.offsetWidth || 290;
            let Side = "right";

            if (AnchorRect.right + Gap + Width > window.innerWidth - Margin)
            {
                Side = "left";
            }

            PopoutNode.innerHTML = BuildPopoutMarkup(Row, Side);

            const Height = PopoutNode.offsetHeight || 320;
            const PreferredTop = AnchorRect.top - 14;
            const Top = Math.max(
                Margin,
                Math.min(
                    PreferredTop,
                    window.innerHeight - Height - Margin,
                ),
            );
            let Left = Side === "left"
                ? AnchorRect.left - Width - Gap
                : AnchorRect.right + Gap;

            Left = Math.max(Margin, Math.min(Left, window.innerWidth - Width - Margin));

            const ArrowTop = Math.max(
                22,
                Math.min(
                    AnchorRect.top + AnchorRect.height / 2 - Top - 8,
                    Height - 30,
                ),
            );

            PopoutNode.style.left = `${Left}px`;
            PopoutNode.style.top = `${Top}px`;
            PopoutNode.style.setProperty("--admin-popout-arrow-top", `${ArrowTop}px`);

            if (animate)
            {
                AnimatePopoutIn(PopoutNode.querySelector("[data-admin-popout-shell]"));
            }
        };

        const ReopenSelectedPopout = () =>
        {
            if (!SelectedUserId)
            {
                HidePopoutNow();
                return;
            }

            const SelectedRow = FindPlayerById(SelectedUserId);
            const AnchorNode = GetPlayerRowElement(SelectedUserId);

            if (!SelectedRow || !AnchorNode)
            {
                HidePopoutNow();
                return;
            }

            PositionPopout(SelectedRow, AnchorNode, {
                animate: ShouldAnimatePopoutOpen,
            });
            ShouldAnimatePopoutOpen = false;
        };

        const Render = () =>
        {
            if (!LastState)
            {
                return;
            }

            const AllPlayers = Array.isArray(LastState.players) ? LastState.players : [];
            const FilteredPlayers = GetFilteredPlayers();

            PlayerCountNode.textContent = `${FilteredPlayers.length} / ${AllPlayers.length}`;
            PlayersNode.innerHTML = FilteredPlayers.length
                ? FilteredPlayers.map((Row) => RenderPlayerRow(Row)).join("")
                : RenderEmptyPlayerList("No players match the current filter.");

            ApplyGlobalBalance(LastState);
            ReopenSelectedPopout();
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

                Render();
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

                Render();
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

        const HandlePlayerContextMenu = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;
            const RowButton = Target?.closest("[data-admin-player-row]");

            if (!RowButton || !PanelRoot.contains(RowButton))
            {
                return;
            }

            EventValue.preventDefault();
            SelectedUserId = RowButton.dataset.userId || "";
            ShouldAnimatePopoutOpen = true;
            Render();
        };

        const HandleDocumentPointerDown = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            if (Target.closest("[data-admin-player-popout]") || Target.closest("[data-admin-player-row]"))
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

            if (Target.closest("[data-admin-player-row]") || Target.closest("[data-admin-player-popout]"))
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

            const LogoutLink = Target.closest("[data-admin-logout-href]");

            if (!LogoutLink)
            {
                return;
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
            if (!SelectedUserId)
            {
                return;
            }

            ReopenSelectedPopout();
        };

        PlayerFilterInput?.addEventListener("input", HandleFilterInput);
        PanelRoot.addEventListener("contextmenu", HandlePlayerContextMenu);
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
            PanelRoot.removeEventListener("contextmenu", HandlePlayerContextMenu);
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
