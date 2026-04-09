(() =>
{
    const ExistingApp = window.GamblingApp || {};
    const PageInitializers = ExistingApp.PageInitializers instanceof Map ? ExistingApp.PageInitializers : new Map();
    const ScriptPromises = ExistingApp.ScriptPromises instanceof Map ? ExistingApp.ScriptPromises : new Map();
    const ModalControllers = ExistingApp.ModalControllers instanceof WeakMap ? ExistingApp.ModalControllers : new WeakMap();
    let ActivePageCleanup = null;
    let IsNavigating = false;

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

    window.GamblingApp = {
        ...ExistingApp,
        ModalControllers,
        getModalController: GetModalController,
        PageInitializers,
        ScriptPromises,
        initializeCurrentPage: InitializeCurrentPage,
        navigateTo: NavigateTo,
        registerPageInitializer: RegisterPageInitializer,
    };

    document.addEventListener("click", HandleModalTriggerClick);
    document.addEventListener("click", HandleDocumentClick);
    document.addEventListener("keydown", HandleDocumentKeyDown);
    document.addEventListener("submit", HandleDocumentSubmit);
    window.addEventListener("popstate", HandlePopState);

    document.addEventListener("DOMContentLoaded", () =>
    {
        window.history.replaceState({ url: window.location.href }, "", window.location.href);
        RememberCurrentPageScripts();
        PrepareScopeModals(GetAppMain());
        PrepareScopeModals(GetAppOverlayShell());
        InitializeAuthShell();
        InitializeCurrentPage();
        AnimateCardsIn(GetAppMain());
    });
})();
