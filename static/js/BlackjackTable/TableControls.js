export function BindControls({
  root: Root = document,
  ...Handlers
} = {}) {
  const Scope = Root && typeof Root.querySelector === "function" ? Root : document;
  const TableStage = Scope.querySelector("#TableStage");
  const SeatLayer = Scope.querySelector("#SeatLayer");
  const SideBetSpotLayer = Scope.querySelector("#SideBetSpotLayer");
  const ChipTray = Scope.querySelector("#ChipTray");
  const UndoChipButton = Scope.querySelector("#UndoChipButton");
  const PlaceBetButton = Scope.querySelector("#PlaceBetButton");
  const DoubleBetButton = Scope.querySelector("#DoubleBetButton");
  const InsuranceAcceptButton = Scope.querySelector("#InsuranceAccept");
  const InsuranceDeclineButton = Scope.querySelector("#InsuranceDecline");
  const HitButton = Scope.querySelector("#ActionHit");
  const StandButton = Scope.querySelector("#ActionStand");
  const DoubleButton = Scope.querySelector("#ActionDouble");
  const SplitButton = Scope.querySelector("#ActionSplit");
  if (!SeatLayer || !SideBetSpotLayer || !ChipTray || !UndoChipButton || !PlaceBetButton || !DoubleBetButton || !InsuranceAcceptButton || !InsuranceDeclineButton || !HitButton || !StandButton || !DoubleButton || !SplitButton) {
    return () => {};
  }
  const CleanupCallbacks = [];
  const FastTapClickGuardMs = 700;
  const IsSideBetEditorActive = Handlers.isSideBetEditorActive || Handlers.IsSideBetEditorActive;
  const OnAction = Handlers.onAction || Handlers.OnAction;
  const IsControlBlocked = Button => {
    return Boolean(
      Button.disabled ||
      Button.classList.contains("IsHidden") ||
      Button.closest(".IsHidden")
    );
  };
  const AddListener = (Element, EventName, Handler, Options) => {
    Element.addEventListener(EventName, Handler, Options);
    CleanupCallbacks.push(() => Element.removeEventListener(EventName, Handler, Options));
  };
  const BindButton = (Button, Handler, { fastTap = false } = {}) => {
    let LastPointerActionAt = 0;
    const RunHandler = Event => {
      if (IsControlBlocked(Button)) {
        Event?.preventDefault?.();
        return;
      }
      Handler();
    };
    const HandlePointerUp = Event => {
      if (Event.pointerType === "mouse" && Event.button !== 0) {
        return;
      }
      LastPointerActionAt = Date.now();
      Event.preventDefault();
      Event.stopPropagation();
      RunHandler(Event);
    };
    const HandleClick = Event => {
      if (Date.now() - LastPointerActionAt < FastTapClickGuardMs) {
        Event.preventDefault();
        Event.stopPropagation();
        return;
      }
      RunHandler(Event);
    };

    if (fastTap && "PointerEvent" in window) {
      AddListener(Button, "pointerup", HandlePointerUp, { passive: false });
    }

    AddListener(Button, "click", HandleClick);
  };
  let LastSeatPointerActionAt = 0;
  const RunSeatToggle = (SeatButton, Event, ClickCount = 1) => {
    if (!SeatButton || IsControlBlocked(SeatButton)) {
      Event?.preventDefault?.();
      return;
    }
    Event.__blackjackSeatHandled = true;
    Handlers.onSeatToggle?.(SeatButton.dataset.seatId, ClickCount);
  };
  const HandleSeatPointerUp = Event => {
    if (Event.pointerType === "mouse" && Event.button !== 0) {
      return;
    }
    const SeatButton = Event.target.closest("[data-seat-id]") || FindSeatButtonAtPoint(Event);
    if (!SeatButton) {
      return;
    }
    LastSeatPointerActionAt = Date.now();
    Event.preventDefault();
    Event.stopPropagation();
    RunSeatToggle(SeatButton, Event);
  };
  const HandleSeatClick = Event => {
    const SeatButton = Event.target.closest("[data-seat-id]");
    if (!SeatButton) {
      return;
    }
    if (Date.now() - LastSeatPointerActionAt < FastTapClickGuardMs) {
      Event.preventDefault();
      Event.stopPropagation();
      return;
    }
    RunSeatToggle(SeatButton, Event, Number(Event.detail) || 1);
  };
  const FindSeatButtonAtPoint = Event => {
    if (!SeatLayer || typeof Event.clientX !== "number" || typeof Event.clientY !== "number") {
      return null;
    }
    return Array.from(SeatLayer.querySelectorAll("[data-seat-id]")).find(SeatButton => {
      const Rect = SeatButton.getBoundingClientRect();
      return (
        Event.clientX >= Rect.left &&
        Event.clientX <= Rect.right &&
        Event.clientY >= Rect.top &&
        Event.clientY <= Rect.bottom
      );
    }) || null;
  };
  const IsNonSeatControlTarget = Event => {
    const Target = Event.target;
    return Boolean(
      Target.closest("[data-bet-spot-seat-id], [data-chip-value], a, input, select, textarea") ||
      (Target.closest("button") && !Target.closest("[data-seat-id]"))
    );
  };
  const HandleStageSeatFallbackClick = Event => {
    if (
      Event.__blackjackSeatHandled ||
      Date.now() - LastSeatPointerActionAt < FastTapClickGuardMs ||
      IsNonSeatControlTarget(Event)
    ) {
      return;
    }

    const SeatButton = FindSeatButtonAtPoint(Event);

    if (!SeatButton || IsControlBlocked(SeatButton)) {
      return;
    }

    Event.__blackjackSeatHandled = true;
    RunSeatToggle(SeatButton, Event, Number(Event.detail) || 1);
  };
  const HandleStageSeatFallbackPointerUp = Event => {
    if (
      Event.__blackjackSeatHandled ||
      (Event.pointerType === "mouse" && Event.button !== 0) ||
      IsNonSeatControlTarget(Event)
    ) {
      return;
    }

    const SeatButton = FindSeatButtonAtPoint(Event);

    if (!SeatButton || IsControlBlocked(SeatButton)) {
      return;
    }

    LastSeatPointerActionAt = Date.now();
    Event.preventDefault();
    Event.stopPropagation();
    RunSeatToggle(SeatButton, Event);
  };
  const HandleSeatContextMenu = Event => {
    const SeatButton = Event.target.closest("[data-seat-id]");
    if (!SeatButton) {
      return;
    }
    const DidHandle = Handlers.onSeatContextMenu?.(SeatButton.dataset.seatId, Event);
    if (!DidHandle) {
      return;
    }
    Event.preventDefault();
    Event.stopPropagation();
  };
  const HandleSideBetSpotClick = Event => {
    const SideBetSpot = Event.target.closest("[data-bet-spot-seat-id]");
    if (!SideBetSpot) {
      return;
    }
    if (IsSideBetEditorActive?.()) {
      Handlers.onSideBetEditorSpot?.(SideBetSpot.dataset.betSpotSeatId, SideBetSpot.dataset.betType || "main");
      return;
    }
    Handlers.onSideBetSpot?.(SideBetSpot.dataset.betSpotSeatId, SideBetSpot.dataset.betType || "main");
  };
  const HandleChipClick = Event => {
    const ChipButton = Event.target.closest("[data-chip-value]");
    if (!ChipButton) {
      return;
    }
    Handlers.onChipClick?.(Number(ChipButton.dataset.chipValue));
  };
  const HandleUndoChipClick = () => {
    Handlers.onUndoChip?.();
  };
  const HandlePrimaryBetClick = () => {
    Handlers.onPrimaryBet?.();
  };
  const HandleDoubleBetClick = () => {
    Handlers.onDoubleBet?.();
  };
  const HandleInsuranceAcceptClick = () => {
    Handlers.onInsuranceDecision?.(true);
  };
  const HandleInsuranceDeclineClick = () => {
    Handlers.onInsuranceDecision?.(false);
  };
  const HandleHitClick = () => {
    OnAction?.("hit");
  };
  const HandleStandClick = () => {
    OnAction?.("stand");
  };
  const HandleDoubleClick = () => {
    OnAction?.("double");
  };
  const HandleSplitClick = () => {
    OnAction?.("split");
  };
  if ("PointerEvent" in window) {
    AddListener(SeatLayer, "pointerup", HandleSeatPointerUp, { passive: false });
  }
  AddListener(SeatLayer, "click", HandleSeatClick);
  AddListener(SeatLayer, "contextmenu", HandleSeatContextMenu);
  if (TableStage) {
    if ("PointerEvent" in window) {
      AddListener(TableStage, "pointerup", HandleStageSeatFallbackPointerUp, { passive: false });
    }
    AddListener(TableStage, "click", HandleStageSeatFallbackClick);
  }
  AddListener(SideBetSpotLayer, "click", HandleSideBetSpotClick);
  AddListener(ChipTray, "click", HandleChipClick);
  BindButton(UndoChipButton, HandleUndoChipClick, { fastTap: true });
  BindButton(PlaceBetButton, HandlePrimaryBetClick, { fastTap: true });
  BindButton(DoubleBetButton, HandleDoubleBetClick, { fastTap: true });
  BindButton(InsuranceAcceptButton, HandleInsuranceAcceptClick, { fastTap: true });
  BindButton(InsuranceDeclineButton, HandleInsuranceDeclineClick, { fastTap: true });
  BindButton(HitButton, HandleHitClick, { fastTap: true });
  BindButton(StandButton, HandleStandClick, { fastTap: true });
  BindButton(DoubleButton, HandleDoubleClick, { fastTap: true });
  BindButton(SplitButton, HandleSplitClick, { fastTap: true });
  return () => {
    CleanupCallbacks.splice(0).forEach(Cleanup => Cleanup());
  };
}
/* github-refresh: 2026-05-02T02:31:53Z */
