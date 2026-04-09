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
            ? "rounded-xl border border-emerald-400/15 bg-emerald-500/10 p-2 text-emerald-400"
            : "rounded-xl border border-red-400/15 bg-red-500/10 p-2 text-red-400";

        const AmountClass = Bet.did_win ? "text-emerald-400" : "text-red-400";
        const AmountText = Bet.did_win ? `+${Bet.pot_display}` : `-${Bet.bet_display}`;

        return `
            <div class="flex items-center justify-between gap-4 rounded-[20px] border border-white/8 bg-white/[0.03] px-5 py-4 transition hover:bg-white/[0.05]">
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
              <div class="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
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
          <div id="bet-history-panel" style="position:relative;z-index:10;display:flex;flex-direction:column;width:100%;max-width:52rem;max-height:min(56rem,90vh);border-radius:32px;border:1px solid rgba(255,255,255,0.10);background:linear-gradient(180deg,rgba(11,12,16,0.98) 0%,rgba(5,6,9,0.97) 100%);box-shadow:0 32px 100px rgba(0,0,0,0.58);opacity:0;transform:translateY(20px) scale(0.84);filter:blur(10px);transition:opacity 300ms cubic-bezier(0.22,1,0.36,1),transform 360ms cubic-bezier(0.22,1,0.36,1),filter 300ms ease;">
            <div style="display:flex;align-items:center;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.08);padding:1.5rem 1.75rem 1.25rem;">
              <div>
                <h2 style="margin:0;font-size:1.5rem;font-weight:600;letter-spacing:-0.04em;color:#fff;">Bet History</h2>
                <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:rgba(255,255,255,0.45);">Every game you've played, all in one place.</p>
              </div>
              <button id="bet-history-close-btn" type="button" style="flex-shrink:0;margin-left:auto;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,0.10);background:transparent;color:rgba(255,255,255,0.55);cursor:pointer;transition:background 0.15s,color 0.15s;">
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
                <div class="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
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
            CloseBtn.style.background = "transparent";
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
            Panel.style.filter = "blur(0)";
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
            Panel.style.transform = "translateY(20px) scale(0.84)";
            Panel.style.filter = "blur(10px)";
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

        if (StateNode)
        {
            try
            {
                const Parsed = JSON.parse(StateNode.textContent);
                InitialBets = Parsed?.bet_history ?? [];
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
                              <div class="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-16 text-center text-sm text-white/45">
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
    };

    window.GamblingApp?.registerPageInitializer("profile", InitializeProfilePage);
})();
