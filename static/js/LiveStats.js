(() =>
{
const PageKeys = ["coinflip-session", "dice-session", "blackjack-session", "play-home"];
const StoragePrefix = "shuffling.liveStats.v2:";
const SharedStatsKey = "all-games";
const OpenStorageKey = "shuffling.liveStats.open.v2";
const PositionStorageKey = "shuffling.liveStats.position.v2";
const SizeStorageKey = "shuffling.liveStats.size.v2";
const ResultEventName = "shuffling:live-stats-result";
const PanelMotionDurationMs = 700;
const PanelMotionOutDurationMs = 340;

const DefaultPanelSize = Object.freeze({
    height: 188,
    width: 320,
});
const ChartPanelSize = Object.freeze({
    height: 382,
    width: 340,
});
const MinChartHeight = 126;

const SeenSignatures = new Set();
let Instance = null;
let ClosePanelTimer = 0;

const FormatMoney = (CentsValue) =>
{
    const Cents = Number.isFinite(Number(CentsValue)) ? Number(CentsValue) : 0;
    const Sign = Cents < 0 ? "-" : "";
    const Dollars = Math.abs(Cents) / 100;
    return `${Sign}$${Dollars.toLocaleString("en-US", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
    })}`;
};

const FormatChartMoney = (Value) =>
{
    return FormatMoney(Math.round((Number(Value) || 0) * 100));
};

const GetStorageScope = () =>
{
    return document.body?.dataset?.chatCurrentUserId || "anonymous";
};

const BuildStateStorageKey = () =>
{
    return `${StoragePrefix}${GetStorageScope()}:${SharedStatsKey}`;
};

const ReadOpenState = () =>
{
    try
    {
        return window.localStorage.getItem(OpenStorageKey) === "true";
    }
    catch
    {
        return false;
    }
};

const SaveOpenState = (IsOpen) =>
{
    try
    {
        window.localStorage.setItem(OpenStorageKey, IsOpen ? "true" : "false");
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ParseStoredState = () =>
{
    try
    {
        const StoredValue = window.localStorage.getItem(BuildStateStorageKey());
        const ParsedValue = StoredValue ? JSON.parse(StoredValue) : null;

        if (!ParsedValue || typeof ParsedValue !== "object")
        {
            throw new Error("Missing live stats state.");
        }

        return {
            losses: Math.max(Number.parseInt(ParsedValue.losses ?? "0", 10) || 0, 0),
            profitCents: Math.round(Number(ParsedValue.profitCents) || 0),
            wageredCents: Math.max(Math.round(Number(ParsedValue.wageredCents) || 0), 0),
            wins: Math.max(Number.parseInt(ParsedValue.wins ?? "0", 10) || 0, 0),
            history: Array.isArray(ParsedValue.history)
                ? ParsedValue.history.map((Entry) => Math.round(Number(Entry) || 0)).slice(-80)
                : [],
        };
    }
    catch
    {
        return {
            losses: 0,
            profitCents: 0,
            wageredCents: 0,
            wins: 0,
            history: [],
        };
    }
};

const SaveState = (State) =>
{
    try
    {
        window.localStorage.setItem(BuildStateStorageKey(), JSON.stringify(State));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ReadPanelPosition = () =>
{
    try
    {
        const ParsedValue = JSON.parse(window.localStorage.getItem(PositionStorageKey) || "null");
        const Left = Number(ParsedValue?.left);
        const Top = Number(ParsedValue?.top);
        return Number.isFinite(Left) && Number.isFinite(Top) ? { left: Left, top: Top } : null;
    }
    catch
    {
        return null;
    }
};

const SavePanelPosition = (Panel) =>
{
    try
    {
        const Rect = Panel.getBoundingClientRect();
        window.localStorage.setItem(PositionStorageKey, JSON.stringify({
            left: Math.round(Rect.left),
            top: Math.round(Rect.top),
        }));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ReadPanelSize = () =>
{
    try
    {
        const ParsedValue = JSON.parse(window.localStorage.getItem(SizeStorageKey) || "null");
        const Width = Number(ParsedValue?.width);
        const Height = Number(ParsedValue?.height);
        return Number.isFinite(Width) && Number.isFinite(Height) ? { width: Width, height: Height } : null;
    }
    catch
    {
        return null;
    }
};

const SavePanelSize = (Panel) =>
{
    try
    {
        const Rect = Panel.getBoundingClientRect();
        const HasChart = Boolean(Instance?.state?.history?.length);
        window.localStorage.setItem(SizeStorageKey, JSON.stringify({
            height: HasChart ? Math.round(Rect.height) : DefaultPanelSize.height,
            width: Math.round(Rect.width),
        }));
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
    }
};

const ClampPanelSize = (Width, Height) =>
{
    const HasChart = Boolean(Instance?.state?.history?.length);
    const MinHeight = HasChart ? 330 : DefaultPanelSize.height;

    return {
        height: HasChart
            ? Math.min(Math.max(MinHeight, Math.round(Number(Height) || ChartPanelSize.height)), Math.max(MinHeight, window.innerHeight - 20))
            : DefaultPanelSize.height,
        width: Math.min(Math.max(288, Math.round(Number(Width) || DefaultPanelSize.width)), Math.max(288, window.innerWidth - 20)),
    };
};

const ClampPanelPosition = (Panel, Left, Top) =>
{
    const Rect = Panel.getBoundingClientRect();
    const MaxLeft = Math.max(10, window.innerWidth - Rect.width - 10);
    const MaxTop = Math.max(10, window.innerHeight - Rect.height - 10);
    return {
        left: Math.min(Math.max(10, Left), MaxLeft),
        top: Math.min(Math.max(10, Top), MaxTop),
    };
};

const BuildMarkup = () =>
{
    return `
        <section class="LiveStatsPanel" data-live-stats-panel data-open="false" data-motion="idle" hidden>
          <header class="LiveStatsHeader" data-live-stats-drag-handle>
            <div class="LiveStatsTitle">
              <span>Live Stats</span>
            </div>
            <div class="LiveStatsActions">
              <button type="button" data-live-stats-reset aria-label="Reset live stats">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M19.146 4.854l-1.489 1.489A8 8 0 1 0 12 20a8.094 8.094 0 0 0 7.371-4.886 1 1 0 1 0-1.842-.779A6.071 6.071 0 0 1 12 18a6 6 0 1 1 4.243-10.243l-1.39 1.39a.5.5 0 0 0 .354.854H19.5A.5.5 0 0 0 20 9.5V5.207a.5.5 0 0 0-.854-.353z"></path>
                </svg>
              </button>
              <button type="button" data-live-stats-close aria-label="Close live stats">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M13.414 12l4.95-4.95a1 1 0 0 0-1.414-1.414L12 10.586l-4.95-4.95A1 1 0 0 0 5.636 7.05l4.95 4.95-4.95 4.95a1 1 0 0 0 1.414 1.414l4.95-4.95 4.95 4.95a1 1 0 0 0 1.414-1.414z"></path>
                </svg>
              </button>
            </div>
          </header>
          <div class="LiveStatsBody">
            <div class="LiveStatsGrid">
              <div class="LiveStatsCard"><span>Wins</span><strong data-live-stat="wins">0</strong></div>
              <div class="LiveStatsCard"><span>Losses</span><strong data-live-stat="losses">0</strong></div>
              <div class="LiveStatsCard"><span>Wagered</span><strong data-live-stat="wagered">$0.00</strong></div>
              <div class="LiveStatsCard"><span>Profit</span><strong data-live-stat="profit">$0.00</strong></div>
            </div>
            <div class="LiveStatsChartShell" data-live-stats-chart-shell hidden>
              <div class="LiveStatsChart" data-live-stats-chart></div>
            </div>
          </div>
          <button class="LiveStatsResizeGrip" data-live-stats-resize-grip type="button" aria-label="Resize live stats">
          </button>
        </section>
    `;
};

const BuildChartData = (State) =>
{
    const Values = [0, ...State.history].map((ProfitCents) => Math.round(Number(ProfitCents) || 0) / 100);
    const Points = [];

    Values.forEach((Value, Index) =>
    {
        if (Index > 0)
        {
            const PreviousValue = Values[Index - 1];
            const CrossesZero = (PreviousValue > 0 && Value < 0) || (PreviousValue < 0 && Value > 0);

            if (CrossesZero)
            {
                const Ratio = Math.abs(PreviousValue) / (Math.abs(PreviousValue) + Math.abs(Value));
                Points.push({
                    index: Index - 1 + Ratio,
                    profit: 0,
                });
            }
        }

        Points.push({
            index: Index,
            profit: Value,
        });
    });

    return Points.map((Point) =>
    {
        const IsPositive = Point.profit >= 0;
        const IsNegative = Point.profit <= 0;
        return {
            ...Point,
            negative: IsNegative ? Point.profit : null,
            positive: IsPositive ? Point.profit : null,
        };
    });
};

const GetChartDomain = (Data) =>
{
    const LastIndex = Math.max(0, Data.length ? Number(Data[Data.length - 1].index) || 0 : 0);
    const FullDomain = {
        end: LastIndex,
        start: 0,
    };
    const Zoom = Instance?.chartZoom;

    if (!Zoom)
    {
        return FullDomain;
    }

    const Start = Math.max(0, Number(Zoom.start) || 0);
    const End = Math.min(LastIndex, Number(Zoom.end) || LastIndex);

    if (End - Start < 1 || End <= Start)
    {
        return FullDomain;
    }

    return {
        end: End,
        start: Start,
    };
};

const ClampChartZoom = (Start, End, Data) =>
{
    const LastIndex = Math.max(1, Data.length ? Number(Data[Data.length - 1].index) || 1 : 1);
    const MinSpan = Math.min(Math.max(2, LastIndex * 0.12), LastIndex);
    let NextStart = Number(Start) || 0;
    let NextEnd = Number(End) || LastIndex;

    if (NextEnd - NextStart < MinSpan)
    {
        const Center = (NextStart + NextEnd) / 2;
        NextStart = Center - MinSpan / 2;
        NextEnd = Center + MinSpan / 2;
    }

    if (NextStart < 0)
    {
        NextEnd -= NextStart;
        NextStart = 0;
    }

    if (NextEnd > LastIndex)
    {
        NextStart -= NextEnd - LastIndex;
        NextEnd = LastIndex;
    }

    return {
        end: Math.min(Math.max(NextEnd, MinSpan), LastIndex),
        start: Math.max(0, NextStart),
    };
};

const HandleChartWheel = (Event) =>
{
    if (!Instance?.chartShell || !Instance.state.history.length)
    {
        return;
    }

    const Data = BuildChartData(Instance.state);
    const FullEnd = Math.max(1, Number(Data[Data.length - 1]?.index) || 1);
    const Current = GetChartDomain(Data);
    const CurrentSpan = Math.max(Current.end - Current.start, 1);
    const Rect = Instance.chartShell.getBoundingClientRect();
    const PointerRatio = Rect.width > 0 ? Math.min(Math.max((Event.clientX - Rect.left) / Rect.width, 0), 1) : 0.5;

    Event.preventDefault();

    if (Event.ctrlKey || Event.metaKey || Math.abs(Event.deltaY) >= Math.abs(Event.deltaX))
    {
        const ZoomFactor = Event.deltaY > 0 ? 1.18 : 0.82;
        const NextSpan = Math.min(Math.max(CurrentSpan * ZoomFactor, Math.min(Math.max(2, FullEnd * 0.12), FullEnd)), FullEnd);
        const Anchor = Current.start + CurrentSpan * PointerRatio;
        const NextStart = Anchor - NextSpan * PointerRatio;
        Instance.chartZoom = ClampChartZoom(NextStart, NextStart + NextSpan, Data);
    }
    else
    {
        const DeltaRatio = Event.deltaX / Math.max(Rect.width, 1);
        const Delta = CurrentSpan * DeltaRatio;
        Instance.chartZoom = ClampChartZoom(Current.start + Delta, Current.end + Delta, Data);
    }

    RenderChart();
};

const HandleChartPointerDown = (Event) =>
{
    if (
        Event.button !== 0 ||
        !Instance?.chartShell ||
        !Instance?.chartZoom ||
        !Instance.state.history.length
    )
    {
        return;
    }

    const Data = BuildChartData(Instance.state);
    const Domain = GetChartDomain(Data);
    const FullEnd = Math.max(1, Number(Data[Data.length - 1]?.index) || 1);

    if (Domain.end - Domain.start >= FullEnd)
    {
        return;
    }

    Instance.activeChartPan = {
        clientX: Event.clientX,
        domain: Domain,
        width: Math.max(Instance.chartShell.getBoundingClientRect().width, 1),
    };
    Instance.chartShell.dataset.panning = "true";
    Event.preventDefault();
    Event.stopPropagation();
    window.addEventListener("pointermove", HandleChartPointerMove);
    window.addEventListener("pointerup", StopChartPan);
    window.addEventListener("pointercancel", StopChartPan);
};

const HandleChartPointerMove = (Event) =>
{
    if (!Instance?.activeChartPan)
    {
        return;
    }

    const Data = BuildChartData(Instance.state);
    const Span = Math.max(Instance.activeChartPan.domain.end - Instance.activeChartPan.domain.start, 1);
    const DeltaRatio = (Event.clientX - Instance.activeChartPan.clientX) / Instance.activeChartPan.width;
    const Delta = -Span * DeltaRatio;
    Instance.chartZoom = ClampChartZoom(
        Instance.activeChartPan.domain.start + Delta,
        Instance.activeChartPan.domain.end + Delta,
        Data,
    );
    RenderChart();
};

const StopChartPan = () =>
{
    if (!Instance?.activeChartPan)
    {
        return;
    }

    Instance.activeChartPan = null;
    if (Instance.chartShell)
    {
        Instance.chartShell.dataset.panning = "false";
    }
    window.removeEventListener("pointermove", HandleChartPointerMove);
    window.removeEventListener("pointerup", StopChartPan);
    window.removeEventListener("pointercancel", StopChartPan);
};

const RenderChart = () =>
{
    if (
        !Instance?.chartNode ||
        !Instance.state.history.length ||
        !window.React ||
        !window.ReactDOM ||
        !window.Recharts
    )
    {
        return;
    }

    const { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } = window.Recharts;
    const Data = BuildChartData(Instance.state);
    const Domain = GetChartDomain(Data);

    const TooltipContent = ({ active, payload }) =>
    {
        const Payload = payload?.find((Entry) => Entry?.payload);

        if (!active || !Payload)
        {
            return null;
        }

        const IndexValue = Number(Payload.payload.index) || 0;
        return window.React.createElement(
            "div",
            { className: "LiveStatsTooltip" },
            window.React.createElement("span", null, IndexValue <= 0 ? "Start" : `Bet ${Math.round(IndexValue)}`),
            window.React.createElement("strong", null, FormatChartMoney(Payload.payload.profit)),
        );
    };

    window.ReactDOM.render(
        window.React.createElement(ResponsiveContainer, { height: "100%", width: "100%" },
            window.React.createElement(AreaChart, {
                data: Data,
                margin: { bottom: 12, left: 10, right: 10, top: 12 },
            },
                window.React.createElement("defs", null,
                    window.React.createElement("linearGradient", {
                        id: "LiveStatsPositiveGradient",
                        x1: "0",
                        x2: "0",
                        y1: "0",
                        y2: "1",
                    },
                        window.React.createElement("stop", { offset: "0%", stopColor: "#34d399", stopOpacity: 0.28 }),
                        window.React.createElement("stop", { offset: "100%", stopColor: "#34d399", stopOpacity: 0 }),
                    ),
                    window.React.createElement("linearGradient", {
                        id: "LiveStatsNegativeGradient",
                        x1: "0",
                        x2: "0",
                        y1: "0",
                        y2: "1",
                    },
                        window.React.createElement("stop", { offset: "0%", stopColor: "#f87171", stopOpacity: 0 }),
                        window.React.createElement("stop", { offset: "100%", stopColor: "#f87171", stopOpacity: 0.28 }),
                    ),
                ),
                window.React.createElement(XAxis, {
                    allowDataOverflow: true,
                    axisLine: false,
                    dataKey: "index",
                    domain: [Domain.start, Domain.end],
                    hide: true,
                    tickLine: false,
                    type: "number",
                }),
                window.React.createElement(YAxis, {
                    axisLine: false,
                    domain: [
                        (DataMin) =>
                        {
                            const Min = Math.min(Number(DataMin) || 0, 0);
                            const Max = Math.max(...Data.map((Entry) => Number(Entry.profit) || 0), 0);
                            const Padding = Math.max((Max - Min) * 0.08, 1);
                            return Min - Padding;
                        },
                        (DataMax) =>
                        {
                            const Max = Math.max(Number(DataMax) || 0, 0);
                            const Min = Math.min(...Data.map((Entry) => Number(Entry.profit) || 0), 0);
                            const Padding = Math.max((Max - Min) * 0.08, 1);
                            return Max + Padding;
                        },
                    ],
                    hide: true,
                    tickLine: false,
                    width: 0,
                }),
                window.React.createElement(ReferenceLine, {
                    ifOverflow: "extendDomain",
                    stroke: "rgba(255,255,255,0.18)",
                    strokeWidth: 1,
                    y: 0,
                }),
                window.React.createElement(Tooltip, {
                    content: TooltipContent,
                    cursor: {
                        stroke: "rgba(255,255,255,0.28)",
                        strokeDasharray: "4 4",
                        strokeWidth: 1,
                    },
                }),
                window.React.createElement(Area, {
                    baseValue: 0,
                    connectNulls: false,
                    dataKey: "positive",
                    dot: false,
                    fill: "url(#LiveStatsPositiveGradient)",
                    fillOpacity: 1,
                    isAnimationActive: false,
                    stroke: "#34d399",
                    strokeWidth: 2.2,
                    type: "monotone",
                }),
                window.React.createElement(Area, {
                    baseValue: 0,
                    connectNulls: false,
                    dataKey: "negative",
                    dot: false,
                    fill: "url(#LiveStatsNegativeGradient)",
                    fillOpacity: 1,
                    isAnimationActive: false,
                    stroke: "#f87171",
                    strokeWidth: 2.2,
                    type: "monotone",
                }),
            ),
        ),
        Instance.chartNode,
    );
};

const AnimatePanelHeight = (TargetHeight) =>
{
    if (!Instance?.panel || typeof Instance.panel.animate !== "function")
    {
        if (Instance?.panel)
        {
            Instance.panel.style.height = `${Math.round(TargetHeight)}px`;
            SavePanelSize(Instance.panel);
        }
        return Promise.resolve();
    }

    const CurrentHeight = Instance.panel.getBoundingClientRect().height;
    const NextHeight = Math.round(TargetHeight);

    if (Math.abs(CurrentHeight - NextHeight) < 2)
    {
        Instance.panel.style.height = `${NextHeight}px`;
        SavePanelSize(Instance.panel);
        return Promise.resolve();
    }

    const Overshoot = CurrentHeight < NextHeight ? NextHeight + 10 : NextHeight - 6;
    const Animation = Instance.panel.animate(
        [
            { height: `${CurrentHeight}px` },
            { height: `${Overshoot}px`, offset: 0.72 },
            { height: `${NextHeight}px` },
        ],
        {
            duration: 520,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
        },
    );

    Instance.panel.style.height = `${NextHeight}px`;
    return Animation.finished
        .catch(() => null)
        .finally(() =>
        {
            Animation.cancel();
            Instance.panel.style.height = `${NextHeight}px`;
            SavePanelSize(Instance.panel);
        });
};

const AnimateChartIn = () =>
{
    const Shell = Instance?.chartShell;

    if (!Shell)
    {
        return;
    }

    Shell.hidden = false;
    RenderChart();
    Shell.style.height = "0px";
    Shell.style.opacity = "0";
    Shell.style.filter = "blur(10px)";
    Shell.style.transform = "translateY(14px) scale(0.96)";

    window.requestAnimationFrame(() =>
    {
        const TargetHeight = Math.max(MinChartHeight, Math.round((Instance.panel?.getBoundingClientRect().height || ChartPanelSize.height) * 0.42));
        const Animation = Shell.animate(
            [
                {
                    filter: "blur(10px)",
                    height: "0px",
                    opacity: 0,
                    transform: "translateY(14px) scale(0.96)",
                },
                {
                    filter: "blur(2px)",
                    height: `${TargetHeight + 12}px`,
                    opacity: 1,
                    transform: "translateY(-2px) scale(1.025)",
                    offset: 0.76,
                },
                {
                    filter: "blur(0px)",
                    height: `${TargetHeight}px`,
                    opacity: 1,
                    transform: "translateY(0) scale(1)",
                },
            ],
            {
                duration: 620,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                fill: "both",
            },
        );

        Shell.style.height = "";
        Shell.style.opacity = "";
        Shell.style.filter = "";
        Shell.style.transform = "";
        Animation.finished
            .catch(() => null)
            .finally(() =>
            {
                Animation.cancel();
                Shell.style.height = "";
                Shell.style.opacity = "";
                Shell.style.filter = "";
                Shell.style.transform = "";
                RenderChart();
            });
    });
};

const AnimateChartOut = () =>
{
    const Shell = Instance?.chartShell;

    if (!Shell || Shell.hidden)
    {
        return;
    }

    const CurrentHeight = Shell.getBoundingClientRect().height || 148;

    if (typeof Shell.animate !== "function")
    {
        Shell.hidden = true;
        window.ReactDOM?.unmountComponentAtNode?.(Instance.chartNode);
        return;
    }

    const Animation = Shell.animate(
        [
            {
                filter: "blur(0px)",
                height: `${CurrentHeight}px`,
                opacity: 1,
                transform: "translateY(0) scale(1)",
            },
            {
                filter: "blur(8px)",
                height: "0px",
                opacity: 0,
                transform: "translateY(10px) scale(0.97)",
            },
        ],
        {
            duration: 260,
            easing: "cubic-bezier(0.4, 0, 1, 1)",
            fill: "both",
        },
    );

    Animation.finished
        .catch(() => null)
        .finally(() =>
        {
            Animation.cancel();
            Shell.hidden = true;
            window.ReactDOM?.unmountComponentAtNode?.(Instance.chartNode);
        });
};

const SyncChartVisibility = ({ animate = false, forceResize = false } = {}) =>
{
    if (!Instance?.chartShell || !Instance?.panel)
    {
        return;
    }

    const HasChart = Instance.state.history.length > 0;
    const WasVisible = !Instance.chartShell.hidden;
    Instance.panel.dataset.hasChart = HasChart ? "true" : "false";

    if (HasChart)
    {
        if (!WasVisible)
        {
            Instance.chartShell.hidden = false;

            if (animate)
            {
                const Rect = Instance.panel.getBoundingClientRect();
                const TargetSize = ClampPanelSize(
                    Math.max(Rect.width, ChartPanelSize.width),
                    Math.max(Rect.height + MinChartHeight, ChartPanelSize.height),
                );
                Instance.panel.style.width = `${TargetSize.width}px`;
                void AnimatePanelHeight(TargetSize.height);
                AnimateChartIn();
                return;
            }
        }

        if (forceResize)
        {
            const TargetSize = ClampPanelSize(ChartPanelSize.width, ChartPanelSize.height);
            Instance.panel.style.width = `${TargetSize.width}px`;
            Instance.panel.style.height = `${TargetSize.height}px`;
        }

        RenderChart();
        return;
    }

    if (!animate)
    {
        Instance.panel.style.height = `${DefaultPanelSize.height}px`;
        SavePanelSize(Instance.panel);
    }

    if (WasVisible)
    {
        if (animate)
        {
            AnimateChartOut();
            void AnimatePanelHeight(DefaultPanelSize.height);
        }
        else
        {
            Instance.chartShell.hidden = true;
            window.ReactDOM?.unmountComponentAtNode?.(Instance.chartNode);
        }
    }
};

const SyncInlineToggleButtons = () =>
{
    const IsOpen = Instance?.panel?.dataset.open === "true";
    document.querySelectorAll("[data-live-stats-inline-toggle]").forEach((Button) =>
    {
        Button.setAttribute("aria-expanded", IsOpen ? "true" : "false");
    });
};

const UpdateNumbers = () =>
{
    if (!Instance?.root)
    {
        return;
    }

    const SetText = (Key, Value) =>
    {
        const Node = Instance.root.querySelector(`[data-live-stat="${Key}"]`);
        if (Node)
        {
            Node.textContent = Value;
        }
    };

    SetText("wins", Instance.state.wins.toLocaleString());
    SetText("losses", Instance.state.losses.toLocaleString());
    SetText("wagered", FormatMoney(Instance.state.wageredCents));
    SetText("profit", FormatMoney(Instance.state.profitCents));

    const ProfitNode = Instance.root.querySelector('[data-live-stat="profit"]');
    if (ProfitNode)
    {
        ProfitNode.dataset.tone =
            Instance.state.profitCents > 0
                ? "positive"
                : (Instance.state.profitCents < 0 ? "negative" : "neutral");
    }
};

const OpenPanel = () =>
{
    if (!Instance?.panel)
    {
        return;
    }

    const WasOpen = Instance.panel.dataset.open === "true" && !Instance.panel.hidden;
    window.clearTimeout(ClosePanelTimer);

    if (!WasOpen)
    {
        Instance.panel.dataset.open = "false";
        Instance.panel.dataset.motion = "opening";
    }
    else
    {
        Instance.panel.dataset.motion = "idle";
    }

    Instance.panel.hidden = false;
    SaveOpenState(true);
    window.requestAnimationFrame(() =>
    {
        const HasChart = Instance.state.history.length > 0;
        const StoredSize = ReadPanelSize();
        const BaseSize = HasChart ? ChartPanelSize : DefaultPanelSize;
        const PanelSize = ClampPanelSize(
            StoredSize?.width || BaseSize.width,
            HasChart ? (StoredSize?.height || BaseSize.height) : BaseSize.height,
        );
        Instance.panel.style.width = `${PanelSize.width}px`;
        Instance.panel.style.height = `${PanelSize.height}px`;

        const StoredPosition = ReadPanelPosition();
        const Position = StoredPosition || ClampPanelPosition(Instance.panel, window.innerWidth - PanelSize.width - 10, window.innerHeight - PanelSize.height - 10);
        const ClampedPosition = ClampPanelPosition(Instance.panel, Position.left, Position.top);
        Instance.panel.style.left = `${ClampedPosition.left}px`;
        Instance.panel.style.top = `${ClampedPosition.top}px`;
        Instance.panel.style.right = "auto";
        Instance.panel.style.bottom = "auto";
        SyncChartVisibility();

        if (WasOpen)
        {
            Instance.panel.dataset.open = "true";
            SyncInlineToggleButtons();
            return;
        }

        window.requestAnimationFrame(() =>
        {
            if (!Instance?.panel)
            {
                return;
            }

            Instance.panel.dataset.open = "true";
            SyncInlineToggleButtons();

            ClosePanelTimer = window.setTimeout(() =>
            {
                if (Instance?.panel?.dataset.open === "true")
                {
                    Instance.panel.dataset.motion = "idle";
                }
            }, PanelMotionDurationMs);
        });
    });
};

const ClosePanel = () =>
{
    if (!Instance?.panel)
    {
        return;
    }

    window.clearTimeout(ClosePanelTimer);
    const WasOpen = Instance.panel.dataset.open === "true" && !Instance.panel.hidden;
    Instance.panel.dataset.open = "false";
    Instance.panel.dataset.motion = WasOpen ? "closing" : "idle";
    SaveOpenState(false);
    SyncInlineToggleButtons();

    ClosePanelTimer = window.setTimeout(() =>
    {
        if (!Instance?.panel || Instance.panel.dataset.open === "true")
        {
            return;
        }

        Instance.panel.hidden = true;
        Instance.panel.dataset.motion = "idle";
    }, PanelMotionOutDurationMs);
};

const ResetCurrentStats = () =>
{
    if (!Instance?.game)
    {
        return;
    }

    Instance.state.losses = 0;
    Instance.state.profitCents = 0;
    Instance.state.wageredCents = 0;
    Instance.state.wins = 0;
    Instance.state.history = [];
    Instance.chartZoom = null;
    SaveState(Instance.state);
    UpdateNumbers();
    SyncChartVisibility({
        animate: true,
    });
};

const BindDrag = (Panel, Handle) =>
{
    let ActiveDrag = null;

    const RenderDragFrame = () =>
    {
        if (!ActiveDrag)
        {
            return;
        }

        const Ease = 0.34;
        ActiveDrag.currentLeft += (ActiveDrag.targetLeft - ActiveDrag.currentLeft) * Ease;
        ActiveDrag.currentTop += (ActiveDrag.targetTop - ActiveDrag.currentTop) * Ease;

        if (
            Math.abs(ActiveDrag.currentLeft - ActiveDrag.targetLeft) < 0.35 &&
            Math.abs(ActiveDrag.currentTop - ActiveDrag.targetTop) < 0.35
        )
        {
            ActiveDrag.currentLeft = ActiveDrag.targetLeft;
            ActiveDrag.currentTop = ActiveDrag.targetTop;
        }

        Panel.style.transform = `translate3d(${ActiveDrag.currentLeft - ActiveDrag.originLeft}px, ${ActiveDrag.currentTop - ActiveDrag.originTop}px, 0)`;

        ActiveDrag.frame = window.requestAnimationFrame(RenderDragFrame);
    };

    const MovePanel = (ClientX, ClientY) =>
    {
        if (!ActiveDrag)
        {
            return;
        }

        const Position = ClampPanelPosition(
            Panel,
            ClientX - ActiveDrag.offsetX,
            ClientY - ActiveDrag.offsetY,
        );
        ActiveDrag.targetLeft = Position.left;
        ActiveDrag.targetTop = Position.top;
    };

    const StopDrag = () =>
    {
        if (!ActiveDrag)
        {
            return;
        }

        const PreviousDrag = ActiveDrag;
        ActiveDrag = null;
        window.cancelAnimationFrame(PreviousDrag.frame);
        Panel.style.left = `${PreviousDrag.targetLeft}px`;
        Panel.style.top = `${PreviousDrag.targetTop}px`;
        Panel.style.right = "auto";
        Panel.style.bottom = "auto";
        Panel.style.transform = "";
        Panel.style.willChange = "";
        Panel.dataset.dragging = "false";
        SavePanelPosition(Panel);
        window.removeEventListener("pointermove", HandleMove);
        window.removeEventListener("pointerup", StopDrag);
        window.removeEventListener("pointercancel", StopDrag);
    };

    const HandleMove = (Event) =>
    {
        MovePanel(Event.clientX, Event.clientY);
    };

    Handle.addEventListener("pointerdown", (Event) =>
    {
        if (Event.button !== 0 || Event.target.closest("button"))
        {
            return;
        }

        const Rect = Panel.getBoundingClientRect();
        ActiveDrag = {
            currentLeft: Rect.left,
            currentTop: Rect.top,
            offsetX: Event.clientX - Rect.left,
            offsetY: Event.clientY - Rect.top,
            originLeft: Rect.left,
            originTop: Rect.top,
            targetLeft: Rect.left,
            targetTop: Rect.top,
            frame: 0,
        };
        Panel.dataset.dragging = "true";
        Panel.style.left = `${Rect.left}px`;
        Panel.style.top = `${Rect.top}px`;
        Panel.style.right = "auto";
        Panel.style.bottom = "auto";
        Panel.style.transform = "translate3d(0, 0, 0)";
        Panel.style.willChange = "transform";
        Event.preventDefault();
        ActiveDrag.frame = window.requestAnimationFrame(RenderDragFrame);
        window.addEventListener("pointermove", HandleMove);
        window.addEventListener("pointerup", StopDrag);
        window.addEventListener("pointercancel", StopDrag);
    });
};

const BindResize = (Panel, Handle) =>
{
    let ActiveResize = null;

    const ApplyResize = (ClientX, ClientY) =>
    {
        if (!ActiveResize)
        {
            return;
        }

        const HasChart = Boolean(Instance?.state?.history?.length);
        const Size = ClampPanelSize(
            ActiveResize.width + ClientX - ActiveResize.clientX,
            HasChart ? ActiveResize.height + ClientY - ActiveResize.clientY : DefaultPanelSize.height,
        );
        Panel.style.width = `${Size.width}px`;
        Panel.style.height = `${Size.height}px`;
        RenderChart();
    };

    const StopResize = () =>
    {
        if (!ActiveResize)
        {
            return;
        }

        ActiveResize = null;
        Panel.dataset.resizing = "false";
        SavePanelSize(Panel);
        window.removeEventListener("pointermove", HandleMove);
        window.removeEventListener("pointerup", StopResize);
        window.removeEventListener("pointercancel", StopResize);
    };

    const HandleMove = (Event) =>
    {
        ApplyResize(Event.clientX, Event.clientY);
    };

    Handle.addEventListener("pointerdown", (Event) =>
    {
        if (Event.button !== 0)
        {
            return;
        }

        const Rect = Panel.getBoundingClientRect();
        ActiveResize = {
            clientX: Event.clientX,
            clientY: Event.clientY,
            height: Rect.height,
            width: Rect.width,
        };
        Panel.dataset.resizing = "true";
        Event.preventDefault();
        Event.stopPropagation();
        window.addEventListener("pointermove", HandleMove);
        window.addEventListener("pointerup", StopResize);
        window.addEventListener("pointercancel", StopResize);
    });
};

const EnsureInstance = (Game) =>
{
    if (!Game)
    {
        return null;
    }

    if (!Instance)
    {
        const Root = document.createElement("div");
        Root.className = "LiveStatsRoot";
        Root.innerHTML = BuildMarkup();
        document.body.appendChild(Root);

        Instance = {
            chartNode: Root.querySelector("[data-live-stats-chart]"),
            chartShell: Root.querySelector("[data-live-stats-chart-shell]"),
            chartZoom: null,
            activeChartPan: null,
            game: "",
            panel: Root.querySelector("[data-live-stats-panel]"),
            resizeObserver: null,
            root: Root,
            state: ParseStoredState(),
        };

        Root.querySelector("[data-live-stats-close]")?.addEventListener("click", ClosePanel);
        Root.querySelector("[data-live-stats-reset]")?.addEventListener("click", ResetCurrentStats);
        BindDrag(Instance.panel, Root.querySelector("[data-live-stats-drag-handle]"));
        BindResize(Instance.panel, Root.querySelector("[data-live-stats-resize-grip]"));
        Instance.chartShell?.addEventListener("wheel", HandleChartWheel, {
            passive: false,
        });
        Instance.chartShell?.addEventListener("pointerdown", HandleChartPointerDown);

        if ("ResizeObserver" in window)
        {
            Instance.resizeObserver = new ResizeObserver(() =>
            {
                if (!Instance?.panel || Instance.panel.hidden)
                {
                    return;
                }

                if (!Instance.state.history.length && Instance.panel.style.height !== `${DefaultPanelSize.height}px`)
                {
                    Instance.panel.style.height = `${DefaultPanelSize.height}px`;
                }

                SavePanelSize(Instance.panel);
                RenderChart();
            });
            Instance.resizeObserver.observe(Instance.panel);
        }
    }

    if (Instance.game !== SharedStatsKey)
    {
        Instance.game = SharedStatsKey;
        Instance.state = ParseStoredState();
        Instance.chartZoom = null;
        UpdateNumbers();
        SyncChartVisibility({
            forceResize: false,
        });
    }

    return Instance;
};

const BindInlineToggleButtons = (Main) =>
{
    Main.querySelectorAll("[data-live-stats-inline-toggle]").forEach((Button) =>
    {
        if (Button.dataset.liveStatsBound === "true")
        {
            return;
        }

        Button.dataset.liveStatsBound = "true";
        Button.addEventListener("click", () =>
        {
            EnsureInstance(SharedStatsKey);

            if (!Instance?.panel)
            {
                return;
            }

            if (Instance.panel.dataset.open !== "true")
            {
                OpenPanel();
            }
            else
            {
                ClosePanel();
            }
        });
    });

    SyncInlineToggleButtons();
};

const ConfigureFromPage = (Context) =>
{
    const Main = Context?.main || Context || document;
    const ConfigNode = Main.querySelector("[data-live-stats-game]");
    const Game = (ConfigNode || ReadOpenState()) ? SharedStatsKey : "";

    if (Game)
    {
        EnsureInstance(Game);
    }

    BindInlineToggleButtons(Main);

    if (ReadOpenState() && Game)
    {
        OpenPanel();
    }

    return null;
};

const ApplyResult = (Detail) =>
{
    const Signature = `${Detail?.game || "game"}:${Detail.signature || ""}`;
    if (!Detail.signature || SeenSignatures.has(Signature))
    {
        return;
    }

    SeenSignatures.add(Signature);

    const State = Instance ? Instance.state : ParseStoredState();
    const HadChart = State.history.length > 0;
    const WageredCents = Math.max(Math.round(Number(Detail.wageredCents) || 0), 0);
    const ProfitCents = Math.round(Number(Detail.profitCents) || 0);

    if (WageredCents <= 0)
    {
        return;
    }

    State.wageredCents += WageredCents;
    State.profitCents += ProfitCents;

    if (ProfitCents > 0)
    {
        State.wins += 1;
    }
    else if (ProfitCents < 0)
    {
        State.losses += 1;
    }

    State.history = [...State.history, State.profitCents].slice(-80);

    SaveState(State);

    if (Instance)
    {
        Instance.chartZoom = null;
        UpdateNumbers();
        SyncChartVisibility({
            animate: !HadChart,
        });
    }
};

window.addEventListener(ResultEventName, (Event) =>
{
    ApplyResult(Event.detail || {});
});

window.ShufflingLiveStats = {
    recordResult(Detail)
    {
        window.dispatchEvent(new CustomEvent(ResultEventName, {
            detail: Detail || {},
        }));
    },
};

PageKeys.forEach((Key) =>
{
    window.GamblingApp?.registerPageInitializer(Key, ConfigureFromPage);
});
})();
