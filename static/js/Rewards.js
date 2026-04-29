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

    const SetText = (Selector, Value) =>
    {
        document.querySelectorAll(Selector).forEach((Node) =>
        {
            Node.textContent = Value;
        });
    };

    const SetRewardMenuBadge = (CountValue) =>
    {
        if (window.GamblingApp?.setRewardMenuBadge)
        {
            window.GamblingApp.setRewardMenuBadge(CountValue);
            return;
        }

        const Count = Math.max(Number.parseInt(CountValue || "0", 10) || 0, 0);

        document.querySelectorAll("[data-reward-menu-badge]").forEach((Badge) =>
        {
            Badge.textContent = `+${Count}`;
            Badge.hidden = Count <= 0;
        });
    };

    const FormatDuration = (Seconds) =>
    {
        const NormalizedSeconds = Math.max(Math.ceil(Number(Seconds) || 0), 0);
        const Days = Math.floor(NormalizedSeconds / 86400);
        const Hours = Math.floor((NormalizedSeconds % 86400) / 3600);
        const Minutes = Math.floor((NormalizedSeconds % 3600) / 60);
        const RemainingSeconds = NormalizedSeconds % 60;

        if (Days > 0)
        {
            if (Hours > 0)
            {
                return `${Days}d ${Hours}h`;
            }

            return `${Days}d`;
        }

        if (Hours > 0)
        {
            return Minutes > 0 ? `${Hours}h ${Minutes}m` : `${Hours}h`;
        }

        if (Minutes > 0)
        {
            return RemainingSeconds > 0 ? `${Minutes}m ${RemainingSeconds}s` : `${Minutes}m`;
        }

        return `${RemainingSeconds}s`;
    };

    const GetCountdownSeconds = (EndsAt, FallbackSeconds = 0) =>
    {
        const EndsAtNumber = Number(EndsAt || 0);

        if (Number.isFinite(EndsAtNumber) && EndsAtNumber > 0)
        {
            return Math.max(Math.ceil((EndsAtNumber * 1000 - Date.now()) / 1000), 0);
        }

        return Math.max(Number.parseInt(FallbackSeconds || "0", 10), 0);
    };

    const GetClaimButton = (Key) =>
    {
        return document.querySelector(`[data-reward-claim][data-claim-key="${Key}"]`);
    };

    const IsRewardsPageActive = () =>
    {
        return document.querySelector("[data-app-main]")?.dataset.pageKey === "rewards";
    };

    const SetClaimMessage = (Message, Tone = "neutral") =>
    {
        const MessageNode = document.querySelector("[data-reward-claim-message]");

        if (!MessageNode)
        {
            return;
        }

        MessageNode.textContent = Message || "";
        MessageNode.classList.toggle("hidden", !Message);
        MessageNode.classList.toggle("text-red-300", Tone === "error");
        MessageNode.classList.toggle("text-emerald-300", Tone === "success");
        MessageNode.classList.toggle("text-white/46", Tone === "neutral");
    };

    const ShowClaimNotification = (ClaimedReward) =>
    {
        if (ClaimedReward?.kind !== "level_reward" || !IsRewardsPageActive())
        {
            return;
        }

        window.GamblingApp?.showToast?.({
            message: `${ClaimedReward?.amount_display || "$0"} was added to your balance.`,
            title: ClaimedReward?.title || "Reward claimed",
            tone: "success",
        });
    };

    const GetInstantCooldownSeconds = (PageState) =>
    {
        const AvailableAt = Number(PageState?.reward_progress?.rakeback_claim_available_at || 0);

        if (Number.isFinite(AvailableAt) && AvailableAt > 0)
        {
            return Math.max(Math.ceil((AvailableAt * 1000 - Date.now()) / 1000), 0);
        }

        return Math.max(Number.parseInt(PageState?.instant_rakeback?.cooldown_remaining_seconds || "0", 10), 0);
    };

    const RenderLeaderboard = (Selector, Rows, EmptyCopy) =>
    {
        const List = document.querySelector(Selector);

        if (!List)
        {
            return;
        }

        if (!Array.isArray(Rows) || Rows.length === 0)
        {
            List.innerHTML = `
              <div class="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">
                ${EscapeHtml(EmptyCopy || "No wagers yet.")}
              </div>
            `;
            return;
        }

        List.innerHTML = Rows.map((Row) => `
          <div class="flex items-center justify-between gap-4 rounded-[8px] border border-white/8 bg-white/[0.03] px-4 py-4">
            <div class="flex min-w-0 items-center gap-3">
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">#${EscapeHtml(Row.rank)}</span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">${EscapeHtml(Row.display_name)}</p>
                <p class="truncate text-xs text-white/40">${EscapeHtml(Row.id)}</p>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-sm font-semibold text-white">${EscapeHtml(Row.wagered_display)}</p>
              ${Row.prize_display ? `<p class="mt-0.5 text-xs text-white/40">${EscapeHtml(Row.prize_display)}</p>` : ""}
            </div>
          </div>
        `).join("");
    };

    let LastPageState = null;
    let CooldownTimer = 0;

    const ScheduleCooldownRefresh = () =>
    {
        if (CooldownTimer)
        {
            window.clearTimeout(CooldownTimer);
            CooldownTimer = 0;
        }

        if (
            !LastPageState
            || (
                GetInstantCooldownSeconds(LastPageState) <= 0
                && GetCountdownSeconds(LastPageState?.daily_leader_reward?.current_day_ends_at, LastPageState?.daily_leader_reward?.payout_countdown_seconds) <= 0
                && GetCountdownSeconds(LastPageState?.leader_reward?.current_week_ends_at, LastPageState?.leader_reward?.payout_countdown_seconds) <= 0
            )
        )
        {
            return;
        }

        CooldownTimer = window.setTimeout(() =>
        {
            ApplyPageState(LastPageState);
        }, 1000);
    };

    const ApplyButtonState = (Key, CanClaim, Label = "Claim") =>
    {
        const Button = GetClaimButton(Key);

        if (!Button)
        {
            return;
        }

        Button.disabled = !CanClaim;
        Button.textContent = Label;
    };

    const ApplyPageState = (PageState, CurrentBalanceDisplay = null) =>
    {
        if (!PageState)
        {
            return;
        }

        LastPageState = PageState;

        const RewardProgress = PageState.reward_progress || {};
        const DailyLeader = PageState.daily_leader_reward || {};
        const Instant = PageState.instant_rakeback || {};
        const Daily = PageState.daily_rakeback || {};
        const Weekly = PageState.weekly_bonus || {};
        const Leader = PageState.leader_reward || {};
        const DailyLeaderPayoutSeconds = GetCountdownSeconds(DailyLeader.current_day_ends_at, DailyLeader.payout_countdown_seconds);
        const WeeklyLeaderPayoutSeconds = GetCountdownSeconds(Leader.current_week_ends_at, Leader.payout_countdown_seconds);
        const InstantCooldownSeconds = GetInstantCooldownSeconds(PageState);
        const CanClaimInstant = Number(Instant.claimable_cents || 0) > 0 && InstantCooldownSeconds <= 0;
        const RewardBadge = document.querySelector("[data-reward-badge]");
        const PendingLevel = RewardProgress.pending_level_reward;

        SetRewardMenuBadge(RewardProgress.pending_level_reward_count);
        SetText("[data-reward-badge]", RewardProgress.badge || "");

        if (RewardBadge)
        {
            RewardBadge.dataset.tone = RewardProgress.badge_tone || "unranked";
        }

        SetText("[data-reward-level]", `Level ${RewardProgress.level || 0} / ${RewardProgress.max_level || 0}`);
        SetText("[data-reward-points]", RewardProgress.reward_points_display || "$0");
        SetText(
            "[data-reward-next-copy]",
            RewardProgress.next_level
                ? `${RewardProgress.to_next_display} until ${RewardProgress.next_badge}.`
                : "Max level reached.",
        );

        const Progress = document.querySelector("[data-reward-progress]");

        if (Progress)
        {
            Progress.style.width = `${RewardProgress.progress_percent || 0}%`;
        }

        ApplyButtonState(
            "level",
            Boolean(RewardProgress.can_claim_level_reward && PendingLevel),
            PendingLevel ? `Claim level ${PendingLevel.level}` : "Claim reward",
        );

        SetText("[data-instant-rakeback-available]", Instant.claimable_display || "$0");
        SetText("[data-instant-rakeback-earned]", Instant.earned_display || "$0");
        SetText(
            "[data-instant-rakeback-cooldown]",
            InstantCooldownSeconds > 0 ? `Claim again in ${FormatDuration(InstantCooldownSeconds)}.` : "Claim every hour.",
        );
        ApplyButtonState("instant", CanClaimInstant);

        SetText("[data-daily-rakeback-available]", Daily.claimable_display || "$0");
        SetText("[data-daily-rakeback-wagered]", Daily.wagered_display || "$0");
        SetText("[data-daily-rakeback-reset]", FormatDuration(Daily.seconds_until_reset));
        ApplyButtonState("daily", Boolean(Daily.can_claim));

        SetText("[data-weekly-bonus-available]", Weekly.claimable_display || "$0");
        SetText("[data-weekly-bonus-wagered]", Weekly.last_7_days_wagered_display || Weekly.current_week_wagered_display || "$0");
        SetText("[data-weekly-bonus-previous]", Weekly.previous_week_wagered_display || "$0");
        SetText("[data-weekly-bonus-tier]", Weekly.current_week_tier?.label || "Starter");
        ApplyButtonState("weekly", Boolean(Weekly.can_claim));

        SetText("[data-daily-leader-payout-countdown]", FormatDuration(DailyLeaderPayoutSeconds));
        SetText("[data-daily-leader-reward-available]", DailyLeader.claimable_display || "$0");
        SetText("[data-daily-leader-current-rank]", DailyLeader.current_rank ? `#${DailyLeader.current_rank}` : "-");
        SetText("[data-daily-leader-previous-rank]", DailyLeader.previous_rank ? `#${DailyLeader.previous_rank}` : "-");
        ApplyButtonState("daily-leader", Boolean(DailyLeader.can_claim));
        RenderLeaderboard("[data-daily-leaderboard]", DailyLeader.current_day_rows || [], "No daily wagers yet.");

        SetText("[data-weekly-leader-payout-countdown]", FormatDuration(WeeklyLeaderPayoutSeconds));
        SetText("[data-leader-reward-available]", Leader.claimable_display || "$0");
        SetText("[data-leader-current-rank]", Leader.current_rank ? `#${Leader.current_rank}` : "-");
        SetText("[data-leader-previous-rank]", Leader.previous_rank ? `#${Leader.previous_rank}` : "-");
        ApplyButtonState("leader", Boolean(Leader.can_claim));
        RenderLeaderboard("[data-weekly-leaderboard]", Leader.current_week_rows || [], "No weekly wagers yet.");

        if (CurrentBalanceDisplay)
        {
            SetText("[data-balance-display]", CurrentBalanceDisplay);
        }

        ScheduleCooldownRefresh();
    };

    const ClaimReward = async (Button) =>
    {
        const ClaimUrl = Button?.dataset.claimUrl || "";

        if (!ClaimUrl || Button.disabled)
        {
            return;
        }

        const OriginalText = Button.textContent;
        Button.disabled = true;
        Button.textContent = "Claiming...";
        SetClaimMessage("Claiming...");

        try
        {
            const Response = await fetch(ClaimUrl, {
                headers: {
                    Accept: "application/json",
                },
                method: "POST",
            });
            const Payload = await Response.json().catch(() => ({}));

            if (Payload.page)
            {
                ApplyPageState(Payload.page, Payload.current_balance_display);
            }

            if (!Response.ok)
            {
                SetClaimMessage(Payload.error || "Reward could not be claimed.", "error");
                return;
            }

            const ClaimedReward = Payload.claimed_reward || {};
            SetClaimMessage(`Claimed ${ClaimedReward.amount_display || "$0"}.`, "success");
            ShowClaimNotification(ClaimedReward);
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            Button.disabled = false;
            Button.textContent = OriginalText;
            SetClaimMessage("Reward could not be claimed.", "error");
        }
    };

    const ScrollRankCarousel = () =>
    {
        const Carousel = document.querySelector("[data-reward-rank-carousel]");

        if (!(Carousel instanceof HTMLElement))
        {
            return;
        }

        const FirstCard = Carousel.querySelector("article");
        const CardWidth = FirstCard instanceof HTMLElement ? FirstCard.getBoundingClientRect().width : 195;
        const Styles = window.getComputedStyle(Carousel);
        const Gap = Number.parseFloat(Styles.columnGap || Styles.gap || "0") || 12;
        const MaxScrollLeft = Math.max(Carousel.scrollWidth - Carousel.clientWidth, 0);
        const NextScrollLeft = Carousel.scrollLeft + CardWidth + Gap;

        Carousel.scrollTo({
            behavior: "smooth",
            left: NextScrollLeft >= MaxScrollLeft - 2 ? 0 : NextScrollLeft,
        });
    };

    const InitializeRewardsPage = ({ main }) =>
    {
        const StateNode = main.querySelector("[data-rewards-page-state]");

        if (StateNode)
        {
            try
            {
                const Parsed = JSON.parse(StateNode.textContent);
                ApplyPageState(Parsed.page, Parsed.current_balance_display);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        }

        const HandleClaimClick = (EventValue) =>
        {
            const Target = EventValue.target instanceof Element ? EventValue.target : null;

            if (!Target)
            {
                return;
            }

            if (Target.closest("[data-reward-rank-next]"))
            {
                EventValue.preventDefault();
                ScrollRankCarousel();
                return;
            }

            const Button = Target.closest("[data-reward-claim]");

            if (!Button)
            {
                return;
            }

            ClaimReward(Button).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        };

        main.addEventListener("click", HandleClaimClick);

        return () =>
        {
            main.removeEventListener("click", HandleClaimClick);

            if (CooldownTimer)
            {
                window.clearTimeout(CooldownTimer);
                CooldownTimer = 0;
            }

            LastPageState = null;
        };
    };

    window.GamblingApp?.registerPageInitializer("rewards", InitializeRewardsPage);
})();
