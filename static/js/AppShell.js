(() =>
{
    const ExistingApp = window.GamblingApp || {};
    const PageInitializers = ExistingApp.PageInitializers instanceof Map ? ExistingApp.PageInitializers : new Map();
    const ScriptPromises = ExistingApp.ScriptPromises instanceof Map ? ExistingApp.ScriptPromises : new Map();
    const ModalControllers = ExistingApp.ModalControllers instanceof WeakMap ? ExistingApp.ModalControllers : new WeakMap();
    const PendingToastStorageKey = "gambling.pendingToast";
    const NotificationHiddenPollMultiplier = 2.4;
    let ActivePageCleanup = null;
    let DeferredBalanceDisplay = "";
    let GlobalBalanceHoldCount = 0;
    let IsNavigating = false;
    let LastNotificationPayload = null;
    let NotificationCursor = null;
    let NotificationPollTimeout = 0;

    const GetAppHeader = () =>
    {
        return document.querySelector("[data-app-header]");
    };

    const GetAppMain = () =>
    {
        return document.querySelector("[data-app-main]");
    };

    const GetAppOverlayShell = () =>
    {
        return document.querySelector("[data-app-overlay-shell]");
    };

    const GetAppAuthShell = () =>
    {
        return document.querySelector("[data-app-auth-shell]");
    };

    const GetAppToastShell = () =>
    {
        return document.querySelector("[data-app-toast-shell]");
    };

    const GetNotificationStateUrl = () =>
    {
        return document.body.dataset.notificationStateUrl || "";
    };

    const IsAuthLocked = (DocumentValue = document) =>
    {
        return DocumentValue?.body?.dataset.authLocked === "true";
    };

    const SyncAuthLockedState = (ShouldLock) =>
    {
        if (ShouldLock)
        {
            document.body.dataset.authLocked = "true";
            return;
        }

        delete document.body.dataset.authLocked;
    };

    const ParseNotificationCursor = (RawValue) =>
    {
        const ParsedValue = Number.parseInt(RawValue || "0", 10);
        return Number.isFinite(ParsedValue) && ParsedValue >= 0 ? ParsedValue : 0;
    };

    const EnsureNotificationCursor = () =>
    {
        if (NotificationCursor === null)
        {
            NotificationCursor = ParseNotificationCursor(document.body.dataset.notificationCursor);
        }

        return NotificationCursor;
    };

    const GetNotificationPollDelay = () =>
    {
        const BaseDelay = Math.max(LastNotificationPayload?.poll_interval_ms || 2600, 1400);
        return document.visibilityState === "hidden"
            ? Math.round(BaseDelay * NotificationHiddenPollMultiplier)
            : BaseDelay;
    };

    const ApplyGlobalBalanceDisplay = (Value) =>
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

    const SetGlobalBalanceDisplay = (Value, Options = {}) =>
    {
        if (!Value)
        {
            return;
        }

        if (!Options.force && GlobalBalanceHoldCount > 0)
        {
            DeferredBalanceDisplay = Value;
            return;
        }

        DeferredBalanceDisplay = "";
        ApplyGlobalBalanceDisplay(Value);
    };

    const HoldGlobalBalanceDisplay = () =>
    {
        GlobalBalanceHoldCount += 1;
    };

    const ReleaseGlobalBalanceDisplay = () =>
    {
        if (GlobalBalanceHoldCount > 0)
        {
            GlobalBalanceHoldCount -= 1;
        }

        if (GlobalBalanceHoldCount > 0 || !DeferredBalanceDisplay)
        {
            return;
        }

        const NextValue = DeferredBalanceDisplay;
        DeferredBalanceDisplay = "";
        ApplyGlobalBalanceDisplay(NextValue);
    };

    const GetToastTone = (ToneValue) =>
    {
        return ["success", "error", "info"].includes(ToneValue) ? ToneValue : "info";
    };

    const BuildToastIconMarkup = (ToneValue) =>
    {
        if (ToneValue === "error")
        {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 8v4"></path>
                  <path d="M12 16h.01"></path>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
                </svg>
            `;
        }

        if (ToneValue === "success")
        {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true">
                  <path d="m5 12 4.2 4.2L19 6.8"></path>
                </svg>
            `;
        }

        return `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">
              <path d="M12 8h.01"></path>
              <path d="M11 12h1v4h1"></path>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"></path>
            </svg>
        `;
    };

    const BuildToastElement = (ToastValue) =>
    {
        const ToneValue = GetToastTone(ToastValue?.tone);
        const Toast = document.createElement("section");
        const Head = document.createElement("div");
        const Copy = document.createElement("div");
        const Title = document.createElement("strong");
        const DismissButton = document.createElement("button");
        const ProgressTrack = document.createElement("div");
        const Progress = document.createElement("div");
        const Message =
            typeof ToastValue?.message === "string" && ToastValue.message.trim()
                ? document.createElement("p")
                : null;

        Toast.dataset.appToast = "";
        Toast.dataset.toastActionable = ToastValue?.action ? "true" : "false";
        Toast.dataset.toastTone = ToneValue;
        Toast.setAttribute("role", "status");
        Toast.tabIndex = ToastValue?.action ? 0 : -1;

        Head.dataset.toastHead = "";
        Copy.dataset.toastCopy = "";
        Title.dataset.toastTitle = "";
        Title.textContent = ToastValue?.title || "Notice";
        DismissButton.dataset.toastDismiss = "";
        DismissButton.setAttribute("aria-label", "Dismiss notification");
        DismissButton.type = "button";
        DismissButton.innerHTML = `
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" aria-hidden="true">
              <path d="m5 5 10 10"></path>
              <path d="M15 5 5 15"></path>
            </svg>
        `;
        ProgressTrack.dataset.toastProgressTrack = "";
        Progress.dataset.toastProgress = "";

        Copy.appendChild(Title);

        if (Message)
        {
            Message.dataset.toastMessage = "";
            Message.textContent = ToastValue.message;
            Copy.appendChild(Message);
        }

        ProgressTrack.appendChild(Progress);
        Head.appendChild(Copy);
        Toast.appendChild(ProgressTrack);
        Toast.appendChild(Head);
        Toast.appendChild(DismissButton);

        return {
            dismissButton: DismissButton,
            progress: Progress,
            toast: Toast,
        };
    };

    const DismissToast = async (Toast, Options = {}) =>
    {
        if (!(Toast instanceof Element))
        {
            return false;
        }

        const Direction = Options.direction === -1 ? -1 : 1;
        const DragDismiss = Options.dragDismiss === true;
        const Immediate = Options.immediate === true;

        if (Toast.dataset.toastState === "closing")
        {
            return false;
        }

        Toast.dataset.toastState = "closing";

        if (Toast.__closeTimer)
        {
            window.clearTimeout(Toast.__closeTimer);
            Toast.__closeTimer = 0;
        }

        if (Toast.__progressAnimation)
        {
            Toast.__progressAnimation.cancel();
            Toast.__progressAnimation = null;
        }

        if (Toast.__entryAnimation)
        {
            Toast.__entryAnimation.cancel();
            Toast.__entryAnimation = null;
        }

        if (Immediate || typeof Toast.animate !== "function")
        {
            Toast.remove();
            return true;
        }

        CancelAnimations(Toast);

        const CurrentOpacity = Number.parseFloat(Toast.style.opacity || "1");
        const StartOpacity = Number.isFinite(CurrentOpacity) ? CurrentOpacity : 1;
        const StartTransform = Toast.style.transform || "translateX(0px)";
        const TargetTransform = DragDismiss
            ? `translateX(${Direction * (window.innerWidth + Toast.getBoundingClientRect().width)}px)`
            : "translateY(-16px) scale(0.92)";
        const Keyframes = DragDismiss
            ? [
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    transform: StartTransform,
                },
                {
                    filter: "blur(12px)",
                    opacity: 0,
                    transform: TargetTransform,
                },
            ]
            : [
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    transform: "translateY(0px) scale(1)",
                },
                {
                    filter: "blur(0px)",
                    opacity: StartOpacity,
                    offset: 0.18,
                    transform: "translateY(-3px) scale(1.012)",
                },
                {
                    filter: "blur(12px)",
                    opacity: 0,
                    transform: TargetTransform,
                },
            ];

        await Toast.animate(Keyframes, {
            duration: DragDismiss ? 220 : 280,
            easing: DragDismiss ? "cubic-bezier(0.2, 0.9, 0.2, 1)" : "cubic-bezier(0.4, 0, 1, 1)",
            fill: "forwards",
        }).finished.catch(() =>
        {
            return null;
        });

        Toast.remove();
        return true;
    };

    const AnimateToastActionPress = async (Toast) =>
    {
        if (!(Toast instanceof Element) || typeof Toast.animate !== "function")
        {
            return false;
        }

        CancelAnimations(Toast);

        await Toast.animate(
            [
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    transform: "translateX(0px) scale(1)",
                },
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    offset: 0.46,
                    transform: "translateX(0px) scale(0.985)",
                },
                {
                    filter: "blur(0px)",
                    opacity: 1,
                    transform: "translateX(0px) scale(1.01)",
                },
            ],
            {
                duration: 180,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "forwards",
            },
        ).finished.catch(() =>
        {
            return null;
        });

        Toast.style.transform = "translateX(0px) scale(1.01)";
        return true;
    };

    const OpenToastAction = async (ToastValue, ToastElement = null) =>
    {
        const Action = ToastValue?.action;

        if (!Action)
        {
            return false;
        }

        if (Action.type === "join_session_prompt")
        {
            const JoinModalController = GetModalController("notification-session-join");
            const JoinForm = document.querySelector("[data-notification-join-form]");
            const JoinCopy = document.querySelector("[data-notification-join-copy]");

            if (!JoinModalController || !JoinForm || !JoinCopy)
            {
                return false;
            }

            if (ToastElement)
            {
                await AnimateToastActionPress(ToastElement);
            }

            JoinForm.action = Action.join_url || Action.view_url || window.location.href;
            JoinCopy.textContent = Action.join_copy || "You can join this session now.";

            if (ToastElement)
            {
                DismissToast(ToastElement, {
                    immediate: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }

            await JoinModalController.open();
            return true;
        }

        if (Action.view_url && window.GamblingApp?.navigateTo)
        {
            if (ToastElement)
            {
                await AnimateToastActionPress(ToastElement);
                DismissToast(ToastElement, {
                    immediate: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }

            await window.GamblingApp.navigateTo(Action.view_url);
            return true;
        }

        return false;
    };

    const ShowToast = (ToastValue) =>
    {
        const ToastShell = GetAppToastShell();

        if (!ToastShell)
        {
            return null;
        }

        const {
            dismissButton: DismissButton,
            progress: Progress,
            toast: Toast,
        } = BuildToastElement(ToastValue);
        const DurationMs = Math.min(Math.max(Number.parseInt(ToastValue?.durationMs, 10) || 4200, 1800), 12000);
        let CloseTimer = 0;
        let DidDrag = false;
        let DragDeltaX = 0;
        let DragPointerId = null;
        let DragStartX = 0;
        let IsDragging = false;
        let IsPaused = false;
        let RemainingMs = DurationMs;
        let SuppressActionUntil = 0;
        let TimerStartedAt = 0;

        ToastShell.appendChild(Toast);

        while (ToastShell.children.length > 4)
        {
            const OldestToast = ToastShell.firstElementChild;

            if (!OldestToast || OldestToast === Toast)
            {
                break;
            }

            DismissToast(OldestToast, {
                immediate: true,
            }).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        }

        const ClearCloseTimer = () =>
        {
            if (!CloseTimer)
            {
                return;
            }

            window.clearTimeout(CloseTimer);
            CloseTimer = 0;
            Toast.__closeTimer = 0;
        };

        const PauseLifetime = () =>
        {
            if (Toast.dataset.toastState === "closing" || IsPaused)
            {
                return;
            }

            IsPaused = true;

            if (CloseTimer)
            {
                RemainingMs = Math.max(0, RemainingMs - (performance.now() - TimerStartedAt));
            }

            ClearCloseTimer();
            Toast.__progressAnimation?.pause?.();
        };

        const ResumeLifetime = () =>
        {
            if (Toast.dataset.toastState === "closing" || !IsPaused || IsDragging)
            {
                return;
            }

            if (RemainingMs <= 0)
            {
                DismissToast(Toast).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            IsPaused = false;
            TimerStartedAt = performance.now();
            CloseTimer = window.setTimeout(() =>
            {
                DismissToast(Toast).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
            }, RemainingMs);
            Toast.__closeTimer = CloseTimer;
            Toast.__progressAnimation?.play?.();
        };

        if (typeof Progress.animate === "function")
        {
            Toast.__progressAnimation = Progress.animate(
                [
                    {
                        transform: "scaleX(1)",
                    },
                    {
                        transform: "scaleX(0)",
                    },
                ],
                {
                    duration: DurationMs,
                    easing: "linear",
                    fill: "forwards",
                },
            );
        }
        else
        {
            Toast.__progressAnimation = null;
        }

        IsPaused = true;
        ResumeLifetime();

        DismissButton.addEventListener("click", (EventValue) =>
        {
            EventValue.stopPropagation();
            DismissToast(Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("click", (EventValue) =>
        {
            if (
                !ToastValue?.action ||
                EventValue.target.closest("[data-toast-dismiss]") ||
                SuppressActionUntil > performance.now()
            )
            {
                return;
            }

            OpenToastAction(ToastValue, Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("keydown", (EventValue) =>
        {
            if (!ToastValue?.action || !["Enter", " "].includes(EventValue.key))
            {
                return;
            }

            EventValue.preventDefault();
            OpenToastAction(ToastValue, Toast).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
        });

        Toast.addEventListener("pointerenter", PauseLifetime);
        Toast.addEventListener("pointerleave", () =>
        {
            if (IsDragging)
            {
                return;
            }

            ResumeLifetime();
        });

        Toast.addEventListener("pointerdown", (EventValue) =>
        {
            if (EventValue.button !== 0 || EventValue.target.closest("[data-toast-dismiss]"))
            {
                return;
            }

            IsDragging = true;
            DidDrag = false;
            DragDeltaX = 0;
            DragPointerId = EventValue.pointerId;
            DragStartX = EventValue.clientX;
            PauseLifetime();
            CancelAnimations(Toast);
            Toast.dataset.toastDragging = "true";
            Toast.setPointerCapture?.(DragPointerId);
        });

        Toast.addEventListener("pointermove", (EventValue) =>
        {
            if (!IsDragging || EventValue.pointerId !== DragPointerId)
            {
                return;
            }

            DragDeltaX = EventValue.clientX - DragStartX;
            if (Math.abs(DragDeltaX) > 8)
            {
                DidDrag = true;
                SuppressActionUntil = performance.now() + 320;
            }
            Toast.style.transform = `translateX(${DragDeltaX}px)`;
            Toast.style.opacity = String(Math.max(0.34, 1 - Math.abs(DragDeltaX) / (Toast.offsetWidth * 1.08)));
        });

        const FinishDrag = (EventValue) =>
        {
            if (!IsDragging || EventValue.pointerId !== DragPointerId)
            {
                return;
            }

            IsDragging = false;
            Toast.removeAttribute("data-toast-dragging");
            Toast.releasePointerCapture?.(DragPointerId);
            DragPointerId = null;

            if (DidDrag)
            {
                SuppressActionUntil = performance.now() + 320;
            }

            const DismissThreshold = Math.max(120, Toast.offsetWidth * 0.32);

            if (Math.abs(DragDeltaX) >= DismissThreshold)
            {
                DismissToast(Toast, {
                    direction: DragDeltaX >= 0 ? 1 : -1,
                    dragDismiss: true,
                }).catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            const CurrentOpacity = Number.parseFloat(Toast.style.opacity || "1");
            const StartOpacity = Number.isFinite(CurrentOpacity) ? CurrentOpacity : 1;
            const StartTransform = Toast.style.transform || "translateX(0px)";
            const OvershootX = DragDeltaX === 0 ? 0 : DragDeltaX * -0.08;

            Toast.animate(
                [
                    {
                        opacity: StartOpacity,
                        transform: StartTransform,
                    },
                    {
                        opacity: 1,
                        offset: 0.72,
                        transform: `translateX(${OvershootX}px)`,
                    },
                    {
                        opacity: 1,
                        transform: "translateX(0px)",
                    },
                ],
                {
                    duration: 420,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "forwards",
                },
            ).finished.finally(() =>
            {
                Toast.style.opacity = "";
                Toast.style.transform = "";
            });

            if (!Toast.matches(":hover"))
            {
                ResumeLifetime();
            }
        };

        Toast.addEventListener("pointerup", FinishDrag);
        Toast.addEventListener("pointercancel", FinishDrag);

        window.requestAnimationFrame(() =>
        {
            if (typeof Toast.animate !== "function")
            {
                return;
            }

            Toast.__entryAnimation = Toast.animate(
                [
                    {
                        filter: "blur(12px)",
                        opacity: 0,
                        transform: "translateX(22px) scale(0.94)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        offset: 0.74,
                        transform: "translateX(-4px) scale(1.012)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: 1,
                        transform: "translateX(0px) scale(1)",
                    },
                ],
                {
                    duration: 620,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "both",
                },
            );
        });

        return Toast;
    };

    const SetPendingToast = (ToastValue) =>
    {
        try
        {
            if (!ToastValue)
            {
                window.sessionStorage.removeItem(PendingToastStorageKey);
                return false;
            }

            window.sessionStorage.setItem(PendingToastStorageKey, JSON.stringify(ToastValue));
            return true;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            return false;
        }
    };

    const MatchesPendingToast = (ToastValue, UrlValue) =>
    {
        const Matcher = ToastValue?.match;

        if (!Matcher)
        {
            return true;
        }

        if (typeof Matcher.pathname === "string")
        {
            return UrlValue.pathname === Matcher.pathname;
        }

        if (typeof Matcher.pathnamePattern === "string")
        {
            try
            {
                return new RegExp(Matcher.pathnamePattern).test(UrlValue.pathname);
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
                return false;
            }
        }

        return true;
    };

    const ConsumePendingToast = (UrlValue = window.location.href) =>
    {
        let ToastValue = null;

        try
        {
            const SerializedToast = window.sessionStorage.getItem(PendingToastStorageKey);

            if (!SerializedToast)
            {
                return false;
            }

            window.sessionStorage.removeItem(PendingToastStorageKey);
            ToastValue = JSON.parse(SerializedToast);
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            window.sessionStorage.removeItem(PendingToastStorageKey);
            return false;
        }

        const TargetUrl = new URL(UrlValue, window.location.href);

        if (!MatchesPendingToast(ToastValue, TargetUrl))
        {
            return false;
        }

        window.setTimeout(() =>
        {
            ShowToast(ToastValue);
        }, 90);

        return true;
    };

    const FetchNotificationState = async (StateUrl, SinceId) =>
    {
        try
        {
            const RequestUrl = new URL(StateUrl, window.location.href);
            RequestUrl.searchParams.set("since", String(SinceId));

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

    const ScheduleNotificationPoll = (Delay = GetNotificationPollDelay()) =>
    {
        if (IsAuthLocked() || !GetNotificationStateUrl())
        {
            NotificationPollTimeout = 0;
            return;
        }

        if (NotificationPollTimeout)
        {
            window.clearTimeout(NotificationPollTimeout);
        }

        NotificationPollTimeout = window.setTimeout(async () =>
        {
            NotificationPollTimeout = 0;

            if (IsAuthLocked() || !GetNotificationStateUrl())
            {
                return;
            }

            const Payload = await FetchNotificationState(GetNotificationStateUrl(), EnsureNotificationCursor());

            if (!Payload)
            {
                ScheduleNotificationPoll(Math.max(GetNotificationPollDelay(), 3600));
                return;
            }

            LastNotificationPayload = Payload;
            SetGlobalBalanceDisplay(Payload.current_balance_display);

            if (Number.isFinite(Payload.latest_id))
            {
                NotificationCursor = Math.max(Payload.latest_id, 0);
            }

            if (Array.isArray(Payload.notifications))
            {
                Payload.notifications.forEach((Notification) =>
                {
                    ShowToast(Notification);
                });
            }

            ScheduleNotificationPoll();
        }, Delay);
    };

    const StartNotificationPolling = () =>
    {
        EnsureNotificationCursor();

        if (IsAuthLocked() || !GetNotificationStateUrl())
        {
            if (NotificationPollTimeout)
            {
                window.clearTimeout(NotificationPollTimeout);
                NotificationPollTimeout = 0;
            }

            return;
        }

        ScheduleNotificationPoll(900);
    };
    const RegisterPageInitializer = (PageKey, Initializer) =>
    {
        if (!PageKey || typeof Initializer !== "function")
        {
            return;
        }

        const Initializers = PageInitializers.get(PageKey) || [];
        Initializers.push(Initializer);
        PageInitializers.set(PageKey, Initializers);
    };

    const DestroyCurrentPage = () =>
    {
        if (typeof ActivePageCleanup !== "function")
        {
            return;
        }

        try
        {
            ActivePageCleanup();
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
        }

        ActivePageCleanup = null;
    };

    const InitializeCurrentPage = () =>
    {
        DestroyCurrentPage();

        const Main = GetAppMain();

        if (!Main)
        {
            return;
        }

        const PageKey = Main.dataset.pageKey || "";
        const Initializers = PageInitializers.get(PageKey) || [];
        const CleanupFunctions = [];

        Initializers.forEach((Initializer) =>
        {
            try
            {
                const Cleanup = Initializer({
                    main: Main,
                });

                if (typeof Cleanup === "function")
                {
                    CleanupFunctions.push(Cleanup);
                }
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        });

        ActivePageCleanup = () =>
        {
            for (let Index = CleanupFunctions.length - 1; Index >= 0; Index -= 1)
            {
                try
                {
                    CleanupFunctions[Index]();
                }
                catch (ErrorValue)
                {
                    console.error(ErrorValue);
                }
            }
        };
    };

    const GetRouteCards = (Scope) =>
    {
        const Cards = Array.from(Scope?.querySelectorAll("[data-route-card]") || []);
        return Cards.length ? Cards : Scope ? [Scope] : [];
    };

    const AnimateCardsOut = async (Scope) =>
    {
        const Cards = GetRouteCards(Scope);

        if (!Cards.length || typeof Cards[0].animate !== "function")
        {
            return;
        }

        await Promise.all(
            Cards.map((Card, Index) =>
            {
                const CurrentOpacity = window.getComputedStyle(Card).opacity || "1";

                return Card.animate(
                    [
                        {
                            filter: "blur(0px)",
                            opacity: CurrentOpacity,
                            transform: "translateY(0px) scale(1)",
                        },
                        {
                            filter: "blur(8px)",
                            opacity: 0,
                            transform: "translateY(18px) scale(0.972)",
                        },
                    ],
                    {
                        delay: Math.min(Index * 16, 112),
                        duration: 220,
                        easing: "cubic-bezier(0.4, 0, 1, 1)",
                        fill: "forwards",
                    },
                ).finished.catch(() =>
                {
                    return null;
                });
            }),
        );
    };

    const AnimateCardsIn = (Scope) =>
    {
        const Cards = GetRouteCards(Scope);

        if (!Cards.length || typeof Cards[0].animate !== "function")
        {
            return;
        }

        Cards.forEach((Card, Index) =>
        {
            const TargetOpacity = window.getComputedStyle(Card).opacity || "1";

            Card.animate(
                [
                    {
                        filter: "blur(12px)",
                        opacity: 0,
                        transform: "translateY(30px) scale(0.92)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: TargetOpacity,
                        offset: 0.72,
                        transform: "translateY(-5px) scale(1.018)",
                    },
                    {
                        filter: "blur(0px)",
                        opacity: TargetOpacity,
                        transform: "translateY(0px) scale(1)",
                    },
                ],
                {
                    delay: Math.min(Index * 34, 170),
                    duration: 640,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                    fill: "both",
                },
            );
        });
    };

    const CancelAnimations = (Element) =>
    {
        Element?.getAnimations?.().forEach((Animation) =>
        {
            Animation.cancel();
        });
    };

    const RunAnimation = async (Element, Keyframes, Options) =>
    {
        if (!Element?.animate)
        {
            return;
        }

        const Animation = Element.animate(Keyframes, Options);
        await Animation.finished.catch(() =>
        {
            return null;
        });
    };

    const EscapeSelectorValue = (Value) =>
    {
        return window.CSS?.escape ? window.CSS.escape(Value) : Value.replaceAll("\"", "\\\"");
    };

    const SetModalPointerState = (Modal, IsOpen) =>
    {
        if (!IsOpen || Modal.dataset.modalPassthrough === "true")
        {
            Modal.classList.add("pointer-events-none");
            return;
        }

        Modal.classList.remove("pointer-events-none");
    };

    const ApplyClosedModalStyles = (Modal, Overlay, Panel) =>
    {
        Modal.classList.add("opacity-0");
        SetModalPointerState(Modal, false);
        Modal.dataset.modalState = "closed";
        Modal.style.opacity = "0";
        Overlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
        Panel.style.opacity = "0";
        Panel.style.filter = "blur(10px)";
        Panel.style.transform = "translateY(20px) scale(0.84)";
    };

    const ApplyOpenModalStyles = (Modal, Overlay, Panel) =>
    {
        Modal.classList.remove("opacity-0");
        SetModalPointerState(Modal, true);
        Modal.dataset.modalState = "open";
        Modal.style.opacity = "1";
        Overlay.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
        Panel.style.opacity = "1";
        Panel.style.filter = "blur(0px)";
        Panel.style.transform = "translateY(0px) scale(1)";
    };

    const BuildModalController = (Modal) =>
    {
        const Overlay = Modal?.querySelector("[data-modal-overlay]");
        const Panel = Modal?.querySelector("[data-modal-panel]");

        if (!Modal || !Overlay || !Panel)
        {
            return null;
        }

        const IsLocked = Modal.dataset.modalLocked === "true";
        let IsAnimating = false;
        let IsOpen = Modal.dataset.modalState === "open" || !Modal.classList.contains("pointer-events-none");

        if (IsOpen)
        {
            ApplyOpenModalStyles(Modal, Overlay, Panel);
        }
        else
        {
            ApplyClosedModalStyles(Modal, Overlay, Panel);
        }

        const Open = async () =>
        {
            if (IsAnimating || IsOpen)
            {
                return false;
            }

            IsAnimating = true;
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            Modal.classList.remove("opacity-0");
            SetModalPointerState(Modal, true);
            Modal.dataset.modalState = "opening";
            Modal.style.opacity = "1";
            Overlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
            Panel.style.opacity = "0";
            Panel.style.filter = "blur(12px)";
            Panel.style.transform = "translateY(20px) scale(0.84)";

            await Promise.all(
                [
                    RunAnimation(
                        Overlay,
                        [
                            { backgroundColor: "rgba(0, 0, 0, 0)" },
                            { backgroundColor: "rgba(0, 0, 0, 0.65)" },
                        ],
                        {
                            duration: 180,
                            easing: "ease-out",
                            fill: "forwards",
                        },
                    ),
                    RunAnimation(
                        Panel,
                        [
                            {
                                filter: "blur(12px)",
                                opacity: 0,
                                transform: "translateY(20px) scale(0.84)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                offset: 0.72,
                                transform: "translateY(-8px) scale(1.035)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                transform: "translateY(0px) scale(1)",
                            },
                        ],
                        {
                            duration: 560,
                            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                            fill: "forwards",
                        },
                    ),
                ],
            );

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyOpenModalStyles(Modal, Overlay, Panel);
            IsOpen = true;
            IsAnimating = false;
            return true;
        };

        const ShowImmediately = () =>
        {
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyOpenModalStyles(Modal, Overlay, Panel);
            IsOpen = true;
            IsAnimating = false;
            return true;
        };

        const HideImmediately = (Options = {}) =>
        {
            const Force = Options.force === true;

            if (IsLocked && !Force)
            {
                return false;
            }

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyClosedModalStyles(Modal, Overlay, Panel);
            IsOpen = false;
            IsAnimating = false;
            return true;
        };

        const Close = async (Options = {}) =>
        {
            const Force = Options.force === true;

            if (IsLocked && !Force)
            {
                return false;
            }

            if (IsAnimating || !IsOpen)
            {
                return false;
            }

            IsAnimating = true;
            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            Modal.classList.remove("opacity-0");
            SetModalPointerState(Modal, true);
            Modal.dataset.modalState = "closing";
            Modal.style.opacity = "1";
            Overlay.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
            Panel.style.opacity = "1";
            Panel.style.filter = "blur(0px)";
            Panel.style.transform = "translateY(0px) scale(1)";

            await Promise.all(
                [
                    RunAnimation(
                        Overlay,
                        [
                            { backgroundColor: "rgba(0, 0, 0, 0.65)" },
                            { backgroundColor: "rgba(0, 0, 0, 0)" },
                        ],
                        {
                            duration: 180,
                            easing: "ease-in",
                            fill: "forwards",
                        },
                    ),
                    RunAnimation(
                        Panel,
                        [
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                transform: "translateY(0px) scale(1)",
                            },
                            {
                                filter: "blur(0px)",
                                opacity: 1,
                                offset: 0.18,
                                transform: "translateY(-3px) scale(1.015)",
                            },
                            {
                                filter: "blur(10px)",
                                opacity: 0,
                                transform: "translateY(18px) scale(0.84)",
                            },
                        ],
                        {
                            duration: 300,
                            easing: "cubic-bezier(0.4, 0, 1, 1)",
                            fill: "forwards",
                        },
                    ),
                ],
            );

            CancelAnimations(Overlay);
            CancelAnimations(Panel);
            ApplyClosedModalStyles(Modal, Overlay, Panel);
            IsOpen = false;
            IsAnimating = false;
            return true;
        };

        return {
            close: Close,
            canClose: () => !IsLocked,
            element: Modal,
            hideImmediately: HideImmediately,
            isOpen: () => IsOpen,
            open: Open,
            showImmediately: ShowImmediately,
        };
    };

    const GetModalController = (Target) =>
    {
        let Modal = null;

        if (typeof Target === "string")
        {
            Modal = document.querySelector(`[data-modal="${EscapeSelectorValue(Target)}"]`);
        }
        else if (Target instanceof Element)
        {
            Modal = Target.matches("[data-modal]") ? Target : Target.closest("[data-modal]");
        }

        if (!Modal)
        {
            return null;
        }

        if (!ModalControllers.has(Modal))
        {
            const Controller = BuildModalController(Modal);

            if (!Controller)
            {
                return null;
            }

            ModalControllers.set(Modal, Controller);
        }

        return ModalControllers.get(Modal) || null;
    };

    const PrepareScopeModals = (Scope) =>
    {
        Array.from(Scope?.querySelectorAll("[data-modal]") || []).forEach((Modal) =>
        {
            GetModalController(Modal);
        });
    };

    const SyncOverlayShell = (Snapshot) =>
    {
        const OverlayShell = GetAppOverlayShell();

        if (!OverlayShell || !Snapshot?.overlayShell)
        {
            return;
        }

        SyncElement(OverlayShell, Snapshot.overlayShell, "data-app-overlay-shell");
        PrepareScopeModals(OverlayShell);
    };

    const SyncAuthShell = (Snapshot, Options = {}) =>
    {
        const AuthShell = GetAppAuthShell();
        const {
            animate = false,
        } = Options;

        SyncAuthLockedState(Boolean(Snapshot?.authLocked));

        if (!AuthShell || !Snapshot?.authShell)
        {
            return;
        }

        SyncElement(AuthShell, Snapshot.authShell, "data-app-auth-shell");
        PrepareScopeModals(AuthShell);

        const AuthController = GetModalController("auth-sign-in");

        if (!AuthController)
        {
            return;
        }

        if (Snapshot.authLocked)
        {
            if (animate)
            {
                AuthController.open().catch((ErrorValue) =>
                {
                    console.error(ErrorValue);
                });
                return;
            }

            AuthController.showImmediately();
            return;
        }

        AuthController.hideImmediately({
            force: true,
        });
    };

    const InitializeAuthShell = () =>
    {
        PrepareScopeModals(GetAppAuthShell());

        if (!IsAuthLocked())
        {
            return;
        }

        const AuthController = GetModalController("auth-sign-in");

        if (!AuthController || AuthController.isOpen())
        {
            return;
        }

        AuthController.open().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const ResolveModalForCloseTrigger = (Trigger) =>
    {
        const ExplicitTarget = Trigger.dataset.closeModal || "";

        if (ExplicitTarget)
        {
            return document.querySelector(`[data-modal="${EscapeSelectorValue(ExplicitTarget)}"]`);
        }

        return Trigger.closest("[data-modal]");
    };

    const SyncElement = (Target, Source, PreservedAttribute) =>
    {
        Target.getAttributeNames().forEach((AttributeName) =>
        {
            if (AttributeName === PreservedAttribute)
            {
                return;
            }

            Target.removeAttribute(AttributeName);
        });

        Source.getAttributeNames().forEach((AttributeName) =>
        {
            if (AttributeName === PreservedAttribute)
            {
                return;
            }

            const AttributeValue = Source.getAttribute(AttributeName);

            if (AttributeValue === null)
            {
                return;
            }

            Target.setAttribute(AttributeName, AttributeValue);
        });

        Target.setAttribute(PreservedAttribute, "");
        Target.innerHTML = Source.innerHTML;
    };

    const LoadScript = async (ScriptNode) =>
    {
        const Source = ScriptNode.getAttribute("src");

        if (!Source)
        {
            return;
        }

        const ScriptUrl = new URL(Source, window.location.href).href;
        const ScriptType = ScriptNode.getAttribute("type");

        if (!ScriptPromises.has(ScriptUrl))
        {
            if (ScriptType === "module")
            {
                ScriptPromises.set(ScriptUrl, import(ScriptUrl));
            }
            else
            {
                ScriptPromises.set(
                    ScriptUrl,
                    new Promise((Resolve, Reject) =>
                    {
                        const ScriptTag = document.createElement("script");
                        ScriptTag.async = false;
                        ScriptTag.src = ScriptUrl;
                        ScriptTag.onload = () => Resolve(null);
                        ScriptTag.onerror = Reject;
                        document.body.appendChild(ScriptTag);
                    }),
                );
            }
        }

        await ScriptPromises.get(ScriptUrl);
    };

    const EnsurePageScripts = async (DocumentValue) =>
    {
        const PageScripts = Array.from(DocumentValue.querySelectorAll("[data-page-scripts] script[src]"));

        for (const ScriptNode of PageScripts)
        {
            await LoadScript(ScriptNode);
        }
    };

    const RememberCurrentPageScripts = () =>
    {
        const PageScripts = Array.from(document.querySelectorAll("[data-page-scripts] script[src]"));

        PageScripts.forEach((ScriptNode) =>
        {
            const Source = ScriptNode.getAttribute("src");

            if (!Source)
            {
                return;
            }

            const ScriptUrl = new URL(Source, window.location.href).href;

            if (!ScriptPromises.has(ScriptUrl))
            {
                ScriptPromises.set(ScriptUrl, Promise.resolve(null));
            }
        });
    };

    const GetPageSnapshot = (DocumentValue) =>
    {
        const OverlayShell = DocumentValue.querySelector("[data-app-overlay-shell]");
        const AuthShell = DocumentValue.querySelector("[data-app-auth-shell]");
        const Header = DocumentValue.querySelector("[data-app-header]");
        const Main = DocumentValue.querySelector("[data-app-main]");

        if (!OverlayShell || !AuthShell || !Header || !Main)
        {
            return null;
        }

        return {
            authLocked: IsAuthLocked(DocumentValue),
            authShell: AuthShell,
            header: Header,
            main: Main,
            overlayShell: OverlayShell,
            title: DocumentValue.title,
        };
    };

    const FetchPageDocument = async (UrlValue, RequestInit = {}) =>
    {
        const RequestHeaders = new Headers(RequestInit.headers || {});
        RequestHeaders.set("Accept", "text/html,application/xhtml+xml");
        RequestHeaders.set("X-Requested-With", "fetch");

        const Response = await fetch(UrlValue, {
            ...RequestInit,
            headers: RequestHeaders,
            redirect: "follow",
        });

        const ContentType = Response.headers.get("content-type") || "";

        if (!ContentType.includes("text/html"))
        {
            throw new Error(`Expected HTML but received ${ContentType || "unknown content"}.`);
        }

        const Html = await Response.text();
        const DocumentValue = new DOMParser().parseFromString(Html, "text/html");
        const Snapshot = GetPageSnapshot(DocumentValue);

        if (!Snapshot)
        {
            throw new Error("The response did not contain the app shell.");
        }

        return {
            document: DocumentValue,
            snapshot: Snapshot,
            url: Response.url || UrlValue,
        };
    };

    const CommitHistory = (HistoryMode, UrlValue) =>
    {
        const CurrentUrl = new URL(window.location.href);
        const NextUrl = new URL(UrlValue, window.location.href);
        const IsSameLocation =
            CurrentUrl.pathname === NextUrl.pathname &&
            CurrentUrl.search === NextUrl.search &&
            CurrentUrl.hash === NextUrl.hash;

        if (HistoryMode === "replace")
        {
            window.history.replaceState({ url: NextUrl.href }, "", NextUrl.href);
            return;
        }

        if (HistoryMode === "push" && !IsSameLocation)
        {
            window.history.pushState({ url: NextUrl.href }, "", NextUrl.href);
        }
    };

    const NavigateTo = async (UrlValue, Options = {}) =>
    {
        if (IsNavigating)
        {
            return false;
        }

        const {
            historyMode = "push",
            requestInit = {},
            scrollToTop = true,
        } = Options;

        IsNavigating = true;
        document.body.dataset.routeBusy = "true";

        try
        {
            const WasAuthLocked = IsAuthLocked();
            const AppHeader = GetAppHeader();
            const AppOverlayShell = GetAppOverlayShell();
            const AppAuthShell = GetAppAuthShell();
            const AppMain = GetAppMain();

            if (!AppOverlayShell || !AppAuthShell || !AppHeader || !AppMain)
            {
                throw new Error("The current app shell is missing required nodes.");
            }

            const { document: NextDocument, snapshot, url: FinalUrl } = await FetchPageDocument(UrlValue, requestInit);
            await EnsurePageScripts(NextDocument);
            await AnimateCardsOut(AppMain);
            DestroyCurrentPage();
            SyncElement(AppHeader, snapshot.header, "data-app-header");
            SyncElement(AppMain, snapshot.main, "data-app-main");
            PrepareScopeModals(AppMain);
            SyncOverlayShell(snapshot);
            SyncAuthShell(snapshot, {
                animate: snapshot.authLocked && !WasAuthLocked,
            });
            document.title = snapshot.title;
            CommitHistory(historyMode, FinalUrl);

            if (scrollToTop)
            {
                window.scrollTo({
                    left: 0,
                    top: 0,
                });
            }

            InitializeCurrentPage();
            window.requestAnimationFrame(() =>
            {
                AnimateCardsIn(AppMain);
                StartNotificationPolling();
            });

            return true;
        }
        catch (ErrorValue)
        {
            console.error(ErrorValue);
            window.location.href = String(UrlValue);
            return false;
        }
        finally
        {
            IsNavigating = false;
            delete document.body.dataset.routeBusy;
        }
    };

    const ShouldHandleUrl = (UrlValue) =>
    {
        if (UrlValue.origin !== window.location.origin)
        {
            return false;
        }

        if (UrlValue.pathname.startsWith("/auth/discord/"))
        {
            return false;
        }

        if (UrlValue.hash && UrlValue.pathname === window.location.pathname && UrlValue.search === window.location.search)
        {
            return false;
        }

        return true;
    };

    const HandleDocumentClick = (EventValue) =>
    {
        if (
            EventValue.defaultPrevented ||
            EventValue.button !== 0 ||
            EventValue.metaKey ||
            EventValue.ctrlKey ||
            EventValue.shiftKey ||
            EventValue.altKey
        )
        {
            return;
        }

        const Anchor = EventValue.target.closest("a[href]");

        if (!Anchor)
        {
            return;
        }

        if (
            Anchor.dataset.fullReload === "true" ||
            Anchor.hasAttribute("download") ||
            Anchor.getAttribute("rel")?.includes("external")
        )
        {
            return;
        }

        const Target = Anchor.getAttribute("target");

        if (Target && Target !== "_self")
        {
            return;
        }

        const UrlValue = new URL(Anchor.href, window.location.href);

        if (!ShouldHandleUrl(UrlValue))
        {
            return;
        }

        const CurrentUrl = new URL(window.location.href);
        const IsSameLocation =
            UrlValue.pathname === CurrentUrl.pathname &&
            UrlValue.search === CurrentUrl.search &&
            UrlValue.hash === CurrentUrl.hash;

        if (IsSameLocation)
        {
            return;
        }

        EventValue.preventDefault();
        NavigateTo(UrlValue.href);
    };

    const HandleModalTriggerClick = (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        const Target = EventValue.target instanceof Element ? EventValue.target : null;

        if (!Target)
        {
            return;
        }

        const CloseTrigger = Target.closest("[data-close-modal]");

        if (CloseTrigger)
        {
            const Controller = GetModalController(ResolveModalForCloseTrigger(CloseTrigger));

            if (!Controller)
            {
                return;
            }

            EventValue.preventDefault();
            Controller.close().catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            });
            return;
        }

        const OpenTrigger = Target.closest("[data-open-modal]");

        if (!OpenTrigger)
        {
            return;
        }

        const Controller = GetModalController(OpenTrigger.dataset.openModal || "");

        if (!Controller)
        {
            return;
        }

        EventValue.preventDefault();
        Controller.open().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const HandleDocumentSubmit = (EventValue) =>
    {
        if (EventValue.defaultPrevented)
        {
            return;
        }

        const Form = EventValue.target instanceof HTMLFormElement ? EventValue.target : null;

        if (!Form || Form.dataset.fullReload === "true")
        {
            return;
        }

        if (Form.matches("[data-notification-join-form]"))
        {
            EventValue.preventDefault();

            const Controller = GetModalController("notification-session-join");
            const ActionUrl = Form.action || window.location.href;
            const FormDataValue = new FormData(Form);

            Promise.resolve(Controller?.close()).catch((ErrorValue) =>
            {
                console.error(ErrorValue);
            }).finally(() =>
            {
                NavigateTo(ActionUrl, {
                    historyMode: "push",
                    requestInit: {
                        body: FormDataValue,
                        method: "POST",
                    },
                });
            });
            return;
        }

        const Submitter = EventValue.submitter;
        const Method = (Submitter?.getAttribute("formmethod") || Form.method || "GET").toUpperCase();
        const Action = Submitter?.getAttribute("formaction") || Form.action || window.location.href;
        const UrlValue = new URL(Action, window.location.href);

        if (!ShouldHandleUrl(UrlValue) || !["GET", "POST"].includes(Method))
        {
            return;
        }

        EventValue.preventDefault();

        if (Method === "GET")
        {
            const Query = new URLSearchParams(new FormData(Form));
            UrlValue.search = Query.toString();
            NavigateTo(UrlValue.href);
            return;
        }

        NavigateTo(UrlValue.href, {
            historyMode: "push",
            requestInit: {
                body: new FormData(Form),
                method: Method,
            },
        });
    };

    const HandlePopState = () =>
    {
        if (IsNavigating)
        {
            return;
        }

        NavigateTo(window.location.href, {
            historyMode: "none",
        });
    };

    const HandleDocumentKeyDown = (EventValue) =>
    {
        if (EventValue.defaultPrevented || EventValue.key !== "Escape")
        {
            return;
        }

        const OpenControllers = Array.from(document.querySelectorAll("[data-modal]"))
            .map((Modal) => GetModalController(Modal))
            .filter((Controller) => Controller?.isOpen() && Controller?.canClose());
        const Controller = OpenControllers.at(-1);

        if (!Controller)
        {
            return;
        }

        EventValue.preventDefault();
        Controller.close().catch((ErrorValue) =>
        {
            console.error(ErrorValue);
        });
    };

    const HandleVisibilityChange = () =>
    {
        if (document.visibilityState !== "visible")
        {
            return;
        }

        StartNotificationPolling();
    };

    window.GamblingApp = {
        ...ExistingApp,
        ModalControllers,
        holdGlobalBalanceDisplay: HoldGlobalBalanceDisplay,
        getModalController: GetModalController,
        PageInitializers,
        releaseGlobalBalanceDisplay: ReleaseGlobalBalanceDisplay,
        ScriptPromises,
        initializeCurrentPage: InitializeCurrentPage,
        navigateTo: NavigateTo,
        registerPageInitializer: RegisterPageInitializer,
        setGlobalBalanceDisplay: SetGlobalBalanceDisplay,
        showToast: ShowToast,
    };

    document.addEventListener("click", HandleModalTriggerClick);
    document.addEventListener("click", HandleDocumentClick);
    document.addEventListener("keydown", HandleDocumentKeyDown);
    document.addEventListener("submit", HandleDocumentSubmit);
    document.addEventListener("visibilitychange", HandleVisibilityChange);
    window.addEventListener("popstate", HandlePopState);

    document.addEventListener("DOMContentLoaded", () =>
    {
        window.history.replaceState({ url: window.location.href }, "", window.location.href);
        window.sessionStorage.removeItem(PendingToastStorageKey);
        RememberCurrentPageScripts();
        PrepareScopeModals(GetAppMain());
        PrepareScopeModals(GetAppOverlayShell());
        InitializeAuthShell();
        InitializeCurrentPage();
        AnimateCardsIn(GetAppMain());
        StartNotificationPolling();
    });
})();
