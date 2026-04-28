export function BindControls({
  root: Root = document,
  ...Handlers
} = {}) {
  const Scope = Root && typeof Root.querySelector === "function" ? Root : document;
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
  const HandleSeatClick = Event => {
    const SeatButton = Event.target.closest("[data-seat-id]");
    if (!SeatButton) {
      return;
    }
    Handlers.onSeatToggle?.(SeatButton.dataset.seatId, Number(Event.detail) || 1);
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
  AddListener(SeatLayer, "click", HandleSeatClick);
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
