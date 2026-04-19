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
    if (Handlers.IsSideBetEditorActive?.()) {
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
    Handlers.OnAction?.("hit");
  };
  const HandleStandClick = () => {
    Handlers.OnAction?.("stand");
  };
  const HandleDoubleClick = () => {
    Handlers.OnAction?.("double");
  };
  const HandleSplitClick = () => {
    Handlers.OnAction?.("split");
  };
  SeatLayer.addEventListener("click", HandleSeatClick);
  SideBetSpotLayer.addEventListener("click", HandleSideBetSpotClick);
  ChipTray.addEventListener("click", HandleChipClick);
  UndoChipButton.addEventListener("click", HandleUndoChipClick);
  PlaceBetButton.addEventListener("click", HandlePrimaryBetClick);
  DoubleBetButton.addEventListener("click", HandleDoubleBetClick);
  InsuranceAcceptButton.addEventListener("click", HandleInsuranceAcceptClick);
  InsuranceDeclineButton.addEventListener("click", HandleInsuranceDeclineClick);
  HitButton.addEventListener("click", HandleHitClick);
  StandButton.addEventListener("click", HandleStandClick);
  DoubleButton.addEventListener("click", HandleDoubleClick);
  SplitButton.addEventListener("click", HandleSplitClick);
  return () => {
    SeatLayer.removeEventListener("click", HandleSeatClick);
    SideBetSpotLayer.removeEventListener("click", HandleSideBetSpotClick);
    ChipTray.removeEventListener("click", HandleChipClick);
    UndoChipButton.removeEventListener("click", HandleUndoChipClick);
    PlaceBetButton.removeEventListener("click", HandlePrimaryBetClick);
    DoubleBetButton.removeEventListener("click", HandleDoubleBetClick);
    InsuranceAcceptButton.removeEventListener("click", HandleInsuranceAcceptClick);
    InsuranceDeclineButton.removeEventListener("click", HandleInsuranceDeclineClick);
    HitButton.removeEventListener("click", HandleHitClick);
    StandButton.removeEventListener("click", HandleStandClick);
    DoubleButton.removeEventListener("click", HandleDoubleClick);
    SplitButton.removeEventListener("click", HandleSplitClick);
  };
}
