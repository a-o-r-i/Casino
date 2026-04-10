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

    const RelativeTime = (Timestamp) =>
    {
        const Delta = Math.floor(Date.now() / 1000 - Timestamp);

        if (Delta < 60) return `${Delta}s ago`;
        if (Delta < 3_600) return `${Math.floor(Delta / 60)}m ago`;
        if (Delta < 86_400) return `${Math.floor(Delta / 3_600)}h ago`;
        if (Delta < 2_592_000) return `${Math.floor(Delta / 86_400)}d ago`;

        return new Date(Timestamp * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const RenderBetRow = (Bet) =>
    {
        const ResultClass = Bet.did_win
            ? "rounded-[8px] border border-emerald-400/15 bg-emerald-500/10 p-2 text-emerald-400"
            : "rounded-[8px] border border-red-400/15 bg-red-500/10 p-2 text-red-400";

        const AmountClass = Bet.did_win ? "text-emerald-400" : "text-red-400";
        const AmountText = Bet.did_win ? `+${Bet.pot_display}` : `-${Bet.bet_display}`;

        return `
            <div class="flex items-center justify-between gap-4 rounded-[8px] border border-white/8 bg-white/[0.03] px-5 py-4 transition hover:bg-white/[0.05]">
              <div class="flex min-w-0 items-center gap-4">
                <div class="${ResultClass} shrink-0">
                  ${Bet.did_win
                    ? `<svg class="pointer-events-none h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`
                    : `<svg class="pointer-events-none h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>`}
                </div>
                <div class="min-w-0">
                  <p class="truncate text-[15px] font-semibold text-white">${EscapeHtml(Bet.game)}</p>
                  <p class="mt-0.5 truncate text-xs text-white/45">
                    Picked ${EscapeHtml(Bet.choice)} &middot; Landed ${EscapeHtml(Bet.result_side)}
                    <span class="ml-1 text-white/35">&middot; ${RelativeTime(Bet.timestamp)}</span>
                  </p>
                </div>
              </div>
              <p class="shrink-0 text-right text-[15px] font-semibold ${AmountClass}">${AmountText}</p>
            </div>
        `;
    };

    const RenderBetHistory = (Bets) =>
    {
        const List = document.getElementById("bet-history-rows");

        if (!List)
        {
            return;
        }

        if (!Bets?.length)
        {
            List.innerHTML = `
              <div class="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
                <svg class="mb-3 h-8 w-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3v18h18"/>
                  <path d="m19 9-5 5-4-4-3 3"/>
                </svg>
                No bets yet. Start playing to see your history.
              </div>
            `;
            return;
        }

        List.innerHTML = Bets.map((Bet) => RenderBetRow(Bet)).join("");
    };

    const FetchBetHistory = async () =>
    {
        try
        {
            const Response = await fetch("/profile/bets", {
                headers: { Accept: "application/json" },
            });

            if (!Response.ok) return [];
            const Data = await Response.json();
            return Data.bets ?? [];
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return [];
        }
    };

    const SetText = (Selector, Value) =>
    {
        document.querySelectorAll(Selector).forEach((Node) =>
        {
            Node.textContent = Value;
        });
    };

    const FormatDuration = (Seconds) =>
    {
        const NormalizedSeconds = Math.max(Math.ceil(Number(Seconds) || 0), 0);

        if (NormalizedSeconds < 60)
        {
            return `${NormalizedSeconds}s`;
        }

        const Minutes = Math.floor(NormalizedSeconds / 60);
        const RemainingSeconds = NormalizedSeconds % 60;

        if (!RemainingSeconds)
        {
            return `${Minutes}m`;
        }

        return `${Minutes}m ${RemainingSeconds}s`;
    };

    const GetLevelRewardLabel = (Rewards) =>
    {
        const PendingReward = Rewards?.pending_level_reward;

        if (!PendingReward || !Number.isFinite(Number(PendingReward.level)))
        {
            return "Claim level reward";
        }

        return `Claim level ${PendingReward.level} reward`;
    };

    const GetRakebackCooldownSeconds = (Rewards) =>
    {
        const AvailableAt = Number(Rewards?.rakeback_claim_available_at || 0);

        if (Number.isFinite(AvailableAt) && AvailableAt > 0)
        {
            return Math.max(Math.ceil((AvailableAt * 1000 - Date.now()) / 1000), 0);
        }

        return Math.max(Number.parseInt(Rewards?.rakeback_cooldown_remaining_seconds || "0", 10), 0);
    };

    let LastAppliedRewards = null;
    let RakebackCooldownTimer = 0;

    const ScheduleRakebackCooldownRefresh = (Rewards) =>
    {
        if (RakebackCooldownTimer)
        {
            window.clearTimeout(RakebackCooldownTimer);
            RakebackCooldownTimer = 0;
        }

        if (GetRakebackCooldownSeconds(Rewards) <= 0)
        {
            return;
        }

        RakebackCooldownTimer = window.setTimeout(() =>
        {
            ApplyRewardState(Rewards);
        }, 1000);
    };

    const ApplyRewardState = (Rewards, CurrentBalanceDisplay = null) =>
    {
        if (!Rewards)
        {
            return;
        }

        LastAppliedRewards = Rewards;

        const RakebackCooldownSeconds = GetRakebackCooldownSeconds(Rewards);
        const CanClaimRakeback = Rewards.claimable_rakeback_cents > 0 && RakebackCooldownSeconds <= 0;

        SetText("[data-reward-badge]", Rewards.badge);
        SetText("[data-reward-level]", `Level ${Rewards.level} / ${Rewards.max_level}`);
        SetText("[data-reward-points]", Rewards.reward_points_display);
        SetText("[data-reward-visits]", String(Rewards.site_visits));
        SetText("[data-rakeback-claimable]", Rewards.claimable_rakeback_display);
        SetText("[data-rakeback-modal-claimable]", Rewards.claimable_rakeback_display);
        SetText(
            "[data-rakeback-cooldown]",
            RakebackCooldownSeconds > 0
                ? `Claim again in ${FormatDuration(RakebackCooldownSeconds)}.`
                : "Claim every 5 minutes.",
        );
        SetText("[data-rakeback-earned]", Rewards.earned_rakeback_display);
        SetText("[data-rakeback-claimed]", Rewards.claimed_rakeback_display);

        const NextCopy = Rewards.next_level
            ? `${Rewards.to_next_display} until ${Rewards.next_badge}.`
            : "Max level reached.";
        SetText("[data-reward-next-copy]", NextCopy);

        const Progress = document.querySelector("[data-reward-progress]");

        if (Progress)
        {
            Progress.style.width = `${Rewards.progress_percent}%`;
        }

        const ClaimButton = document.querySelector("[data-rakeback-claim]");

        if (ClaimButton)
        {
            ClaimButton.disabled = !CanClaimRakeback;
        }

        const LevelRewardButton = document.querySelector("[data-level-reward-claim]");

        if (LevelRewardButton)
        {
            const CanClaimLevelReward = Boolean(Rewards.can_claim_level_reward && Rewards.pending_level_reward);
            LevelRewardButton.hidden = !CanClaimLevelReward;
            LevelRewardButton.disabled = !CanClaimLevelReward;
            LevelRewardButton.textContent = GetLevelRewardLabel(Rewards);
            LevelRewardButton.title = CanClaimLevelReward
                ? `${Rewards.pending_level_reward.bonus_display} available`
                : "";
        }

        if (CurrentBalanceDisplay)
        {
            SetText("[data-balance-display]", CurrentBalanceDisplay);
        }

        ScheduleRakebackCooldownRefresh(Rewards);
    };

    const SetRakebackMessage = (Message, Tone = "neutral") =>
    {
        const MessageNode = document.querySelector("[data-rakeback-message]");

        if (!MessageNode)
        {
            return;
        }

        MessageNode.textContent = Message || "";
        MessageNode.classList.toggle("text-red-300", Tone === "error");
        MessageNode.classList.toggle("text-emerald-300", Tone === "success");
        MessageNode.classList.toggle("text-white/46", Tone === "neutral");
    };

    const ClaimRakeback = async (ClaimUrl) =>
    {
        const ClaimButton = document.querySelector("[data-rakeback-claim]");

        if (!ClaimUrl || ClaimButton?.disabled)
        {
            return;
        }

        ClaimButton.disabled = true;
        SetRakebackMessage("Claiming...");

        try
        {
            const Response = await fetch(ClaimUrl, {
                headers: {
                    Accept: "application/json",
                },
                method: "POST",
            });
            const Payload = await Response.json().catch(() => ({}));

            if (!Response.ok)
            {
                ApplyRewardState(Payload.rewards);
                SetRakebackMessage(Payload.error || "Rakeback could not be claimed.", "error");
                return;
            }

            ApplyRewardState(Payload.rewards, Payload.current_balance_display);
            SetRakebackMessage(`Claimed ${Payload.rewards.claimed_now_display}.`, "success");
            window.GamblingApp?.showToast?.({
                message: `${Payload.rewards.claimed_now_display} was added to your balance.`,
                title: "Rakeback claimed",
                tone: "success",
            });
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            SetRakebackMessage("Rakeback could not be claimed.", "error");

            if (ClaimButton)
            {
                ClaimButton.disabled = false;
            }
        }
    };

    const ClaimLevelReward = async (ClaimUrl) =>
    {
        const ClaimButton = document.querySelector("[data-level-reward-claim]");

        if (!ClaimUrl || ClaimButton?.disabled)
        {
            return;
        }

        ClaimButton.disabled = true;
        ClaimButton.textContent = "Claiming...";

        try
        {
            const Response = await fetch(ClaimUrl, {
                headers: {
                    Accept: "application/json",
                },
                method: "POST",
            });
            const Payload = await Response.json().catch(() => ({}));

            if (!Response.ok)
            {
                ApplyRewardState(Payload.rewards || LastAppliedRewards);
                window.GamblingApp?.showToast?.({
                    message: Payload.error || "Level reward could not be claimed.",
                    title: "Claim failed",
                    tone: "error",
                });
                return;
            }

            ApplyRewardState(Payload.rewards, Payload.current_balance_display);
            window.GamblingApp?.showToast?.({
                message: `${Payload.rewards.claimed_now_display} was added to your balance.`,
                title: `Level ${Payload.rewards.claimed_level_reward.level} reward claimed`,
                tone: "success",
            });
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            window.GamblingApp?.showToast?.({
                message: "Level reward could not be claimed.",
                title: "Claim failed",
                tone: "error",
            });

            if (LastAppliedRewards)
            {
                ApplyRewardState(LastAppliedRewards);
            }
        }
    };

    let ModalContainer = null;

    const OpenModal = (Bets) =>
    {
        CloseModal();

        if (ModalContainer?.isConnected)
        {
            return;
        }

        ModalContainer = document.createElement("div");
        ModalContainer.id = "bet-history-modal-container";
        ModalContainer.style.position = "fixed";
        ModalContainer.style.inset = "0";
        ModalContainer.style.zIndex = "60";
        ModalContainer.style.display = "flex";
        ModalContainer.style.alignItems = "center";
        ModalContainer.style.justifyContent = "center";
        ModalContainer.style.padding = "1rem 1rem 2.5rem";
        ModalContainer.style.opacity = "0";
        ModalContainer.style.transition = "opacity 180ms ease-out";
        ModalContainer.style.pointerEvents = "none";

        ModalContainer.innerHTML = `
          <div id="bet-history-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.65);"></div>
          <div id="bet-history-panel" style="position:relative;z-index:10;display:flex;flex-direction:column;width:100%;max-width:52rem;max-height:min(56rem,90vh);border-radius:8px;border:1px solid rgba(255,255,255,0.10);background:#07090e;box-shadow:0 24px 80px rgba(0,0,0,0.52);opacity:0;transform:translateY(20px) scale(0.96);transition:opacity 220ms cubic-bezier(0.22,1,0.36,1),transform 260ms cubic-bezier(0.22,1,0.36,1);">
            <div style="display:flex;align-items:center;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.08);padding:1.5rem 1.75rem 1.25rem;">
              <div>
                <h2 style="margin:0;font-size:1.5rem;font-weight:600;letter-spacing:0;color:#fff;">Bet History</h2>
                <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:rgba(255,255,255,0.45);">Every game you've played, all in one place.</p>
              </div>
              <button id="bet-history-close-btn" type="button" style="flex-shrink:0;margin-left:auto;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);cursor:pointer;transition:background 0.15s,color 0.15s;">
                <svg class="pointer-events-none h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"/>
                  <path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
            <div id="bet-history-rows" style="overflow-y:auto;padding:1.25rem 1.75rem 1.75rem;font-size:0.8125rem;">
              <div class="space-y-3">
                ${Bets.map((Bet) => RenderBetRow(Bet)).join("")}
                ${!Bets.length ? `
                <div class="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
                  <svg class="mb-3 h-8 w-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 3v18h18"/>
                    <path d="m19 9-5 5-4-4-3 3"/>
                  </svg>
                  No bets yet.
                </div>` : ""}
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(ModalContainer);

        const CloseBtn = ModalContainer.querySelector("#bet-history-close-btn");
        CloseBtn?.addEventListener("mouseenter", () =>
        {
            CloseBtn.style.background = "rgba(255,255,255,0.10)";
            CloseBtn.style.color = "rgba(255,255,255,0.85)";
        });
        CloseBtn?.addEventListener("mouseleave", () =>
        {
            CloseBtn.style.background = "rgba(255,255,255,0.04)";
            CloseBtn.style.color = "rgba(255,255,255,0.55)";
        });
        CloseBtn?.addEventListener("click", CloseModal);

        ModalContainer.addEventListener("click", (EventValue) =>
        {
            if (EventValue.target === ModalContainer || EventValue.target.id === "bet-history-backdrop")
            {
                CloseModal();
            }
        });

        document.addEventListener("keydown", HandleEscape);

        window.requestAnimationFrame(() =>
        {
            const Panel = ModalContainer?.querySelector("#bet-history-panel");

            if (!Panel)
            {
                return;
            }

            ModalContainer.style.opacity = "1";
            ModalContainer.style.pointerEvents = "auto";
            Panel.style.opacity = "1";
            Panel.style.transform = "translateY(0) scale(1)";
        });
    };

    const CloseModal = () =>
    {
        if (!ModalContainer?.isConnected)
        {
            return;
        }

        document.removeEventListener("keydown", HandleEscape);

        const Panel = ModalContainer.querySelector("#bet-history-panel");

        ModalContainer.style.opacity = "0";
        ModalContainer.style.pointerEvents = "none";

        if (Panel)
        {
            Panel.style.opacity = "0";
            Panel.style.transform = "translateY(20px) scale(0.96)";
        }

        setTimeout(() =>
        {
            if (ModalContainer)
            {
                ModalContainer.remove();
                ModalContainer = null;
            }
        }, 200);
    };

    const HandleEscape = (EventValue) =>
    {
        if (EventValue.key === "Escape")
        {
            CloseModal();
        }
    };

    const InitializeProfilePage = ({ main }) =>
    {
        const StateNode = main.querySelector("[data-profile-state]");
        let InitialBets = [];
        let ClaimLevelRewardUrl = "";
        let ClaimRakebackUrl = "";

        if (StateNode)
        {
            try
            {
                const Parsed = JSON.parse(StateNode.textContent);
                InitialBets = Parsed?.bet_history ?? [];
                ClaimLevelRewardUrl = Parsed?.claim_level_reward_url || "";
                ClaimRakebackUrl = Parsed?.claim_rakeback_url || "";
                ApplyRewardState(Parsed?.rewards, Parsed?.current_balance_display);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        }

        InitialBets.sort((a, b) => b.timestamp - a.timestamp);

        const Button = main.querySelector("#bet-history-btn");

        if (Button)
        {
            Button.addEventListener("click", () =>
            {
                const CurrentBets = Array.isArray(initializedBets) && initializedBets.length
                    ? initializedBets
                    : InitialBets;
                OpenModal(CurrentBets);

                FetchBetHistory().then((FreshBets) =>
                {
                    FreshBets.sort((a, b) => b.timestamp - a.timestamp);
                    initializedBets = FreshBets;
                    const Rows = document.getElementById("bet-history-rows")?.querySelector(".space-y-3");

                    if (Rows)
                    {
                        Rows.innerHTML = FreshBets.length
                            ? FreshBets.map((Bet) => RenderBetRow(Bet)).join("")
                            : `
                              <div class="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
                                <svg class="mb-3 h-8 w-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                  <path d="M3 3v18h18"/>
                                  <path d="m19 9-5 5-4-4-3 3"/>
                                </svg>
                                No bets yet. Start playing to see your history.
                              </div>
                            `;
                    }
                });
            });
        }

        let initializedBets = InitialBets;

        const ClaimButton = document.querySelector("[data-rakeback-claim]");
        ClaimButton?.addEventListener("click", () =>
        {
            ClaimRakeback(ClaimRakebackUrl).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        const LevelRewardButton = document.querySelector("[data-level-reward-claim]");
        LevelRewardButton?.addEventListener("click", () =>
        {
            ClaimLevelReward(ClaimLevelRewardUrl).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });
    };

    window.GamblingApp?.registerPageInitializer("profile", InitializeProfilePage);
})();
