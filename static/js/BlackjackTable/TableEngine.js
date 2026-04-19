import { BETTING_COUNTDOWN_SECONDS, BETWEEN_DEALS_MS, CHIP_VALUES, COLLECT_CARDS_DURATION_MS, COLLECT_CARDS_STAGGER_MS, RESHUFFLE_THRESHOLD, ROUND_STATES, SEAT_POSITIONS, SETTLE_DISPLAY_MS, FindSeat } from "./TableConfig.js";
import { DrawCards, CreateShoe } from "./DeckApi.js";
import { CreateDealerState, CreateHand } from "./TableState.js";
import { CanDouble, CanSplit, Money, HandValue, IsBlackjack, SettleHand, DealerHits } from "./TableRules.js";
const ALLOWED_TRANSITIONS = Object.freeze({
  [ROUND_STATES.WAITING]: [ROUND_STATES.BETTING],
  [ROUND_STATES.BETTING]: [ROUND_STATES.WAITING, ROUND_STATES.DEALING],
  [ROUND_STATES.DEALING]: [ROUND_STATES.PLAYER_TURN, ROUND_STATES.DEALER_TURN, ROUND_STATES.BETTING],
  [ROUND_STATES.PLAYER_TURN]: [ROUND_STATES.DEALER_TURN],
  [ROUND_STATES.DEALER_TURN]: [ROUND_STATES.SETTLING],
  [ROUND_STATES.SETTLING]: [ROUND_STATES.WAITING, ROUND_STATES.BETTING]
});
function Delay(Ms) {
  return new Promise(Resolve => {
    window.setTimeout(Resolve, Ms);
  });
}
function WaitForAnimation(Animation) {
  if (!Animation) {
    return Promise.resolve();
  }
  return Animation.finished.catch(() => {}).finally(() => {
    Animation.cancel();
  });
}
function CompareSeatHands(Left, Right) {
  return (Left.seatLayoutIndex ?? 0) - (Right.seatLayoutIndex ?? 0);
}
export class BlackjackEngine {
  constructor({
    state: State,
    renderer: Renderer,
    animator: Animator,
    onBalanceChange: OnBalanceChange = null,
    seatController: SeatController = null
  }) {
    this.state = State;
    this.renderer = Renderer;
    this.animator = Animator;
    this.onBalanceChange = typeof OnBalanceChange === "function" ? OnBalanceChange : null;
    this.seatController = SeatController;
    this.currentTask = null;
    this.tickHandle = null;
  }
  async Init() {
    this.Render();
    await this.PrepareShoe(true);
    this.SyncSeatDrivenState();
    this.StartCountdownCycle();
    this.StartTicker();
    this.Render();
  }
  StartTicker() {
    if (this.tickHandle) {
      return;
    }
    this.tickHandle = window.setInterval(() => {
      this.OnTimerTick();
    }, 250);
  }
  TransitionTo(NextState, Message = this.state.message) {
    const CurrentState = this.state.roundState;
    if (CurrentState === NextState) {
      this.state.message = Message;
      return;
    }
    const Allowed = ALLOWED_TRANSITIONS[CurrentState] || [];
    if (!Allowed.includes(NextState)) {
      throw new Error(`Invalid state transition from ${CurrentState} to ${NextState}.`);
    }
    this.state.roundState = NextState;
    this.state.message = Message;
  }
  ForceState(NextState, Message) {
    this.state.roundState = NextState;
    this.state.message = Message;
  }
  Render() {
    this.renderer.Render(this.state, this.GetViewModel());
  }
  SetBalance(NextBalance, {
    sync: Sync = false
  } = {}) {
    const ParsedBalance = Number(NextBalance);
    const NormalizedBalance = Number.isFinite(ParsedBalance) ? Math.max(0, Math.round(ParsedBalance * 100) / 100) : 0;
    if (Math.abs(NormalizedBalance - this.state.balance) < 0.00001) {
      return;
    }
    this.state.balance = NormalizedBalance;
    if (Sync && this.onBalanceChange) {
      void this.onBalanceChange(NormalizedBalance);
    }
  }
  AdjustBalance(Delta, {
    sync: Sync = false
  } = {}) {
    this.SetBalance(this.state.balance + Number(Delta || 0), {
      sync: Sync
    });
  }
  SetSeatClaims({
    seatClaims: SeatClaims = [],
    selfSeatIds: SelfSeatIds = null
  } = {}) {
    const NextExternalSeatClaims = {};
    SeatClaims.forEach(Claim => {
      const SeatId = Claim?.seat_id || Claim?.seatId;
      if (!SeatId || Claim?.is_self) {
        return;
      }
      NextExternalSeatClaims[SeatId] = {
        displayName: Claim?.user?.display_name || Claim?.user?.username || "Player",
        userId: Claim?.user?.id || ""
      };
    });
    this.state.externalSeatClaims = NextExternalSeatClaims;
    if (Array.isArray(SelfSeatIds) && !this.state.hands.length && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      const NormalizedSeatIds = SelfSeatIds.filter(SeatId => Boolean(FindSeat(SeatId)));
      const SelectedSeatSet = new Set(NormalizedSeatIds);
      this.state.selectedSeatIds = NormalizedSeatIds;
      this.state.pendingBetChips = this.state.pendingBetChips.filter(Chip => SelectedSeatSet.has(Chip.seatId));
      this.state.pendingBets = this.BuildPendingBetsFromChips(this.state.pendingBetChips);
      if (!NormalizedSeatIds.includes(this.state.activeSeatId)) {
        this.state.activeSeatId = NormalizedSeatIds[NormalizedSeatIds.length - 1] || "";
      }
      this.SyncSeatDrivenState();
    }
    this.Render();
  }
  AnimateRenderedPlayerCardMove(HandId, CardIndex, FromRect, Duration = 420) {
    const Node = this.renderer.elements.stage.querySelector(`.PlayingCard[data-owner="player"][data-hand-id="${HandId}"][data-card-index="${CardIndex}"]`);
    const TargetRect = this.renderer.GetRenderedCardRect("player", HandId, CardIndex);
    if (!Node || !FromRect || !TargetRect) {
      return Promise.resolve();
    }
    const Dx = FromRect.left - TargetRect.left;
    const Dy = FromRect.top - TargetRect.top;
    const Rotation = Node.style.getPropertyValue("--CardRotation").trim() || "0deg";
    const Animation = Node.animate([{
      transform: `translate(calc(-50% + ${Dx}px), calc(-50% + ${Dy}px)) rotate(${Rotation})`
    }, {
      transform: `translate(-50%, -50%) rotate(${Rotation})`
    }], {
      duration: Duration,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both"
    });
    return WaitForAnimation(Animation);
  }
  StartCountdownCycle() {
    this.state.countdownDeadline = Date.now() + BETTING_COUNTDOWN_SECONDS * 1000;
    this.state.countdownSeconds = BETTING_COUNTDOWN_SECONDS;
  }
  GetSeatName(SeatId) {
    return FindSeat(SeatId)?.name ?? "Seat";
  }
  GetTotalPendingBet() {
    return Object.values(this.state.pendingBets).reduce((Total, Amount) => Total + Amount, 0);
  }
  GetLastBetTotal() {
    return (this.state.lastBetSnapshot?.chips || []).reduce((Total, Chip) => Total + Chip.value, 0);
  }
  CloneChipPlacements(Chips = []) {
    return Chips.map(({
      seatId: SeatId,
      value: Value
    }) => ({
      seatId: SeatId,
      value: Value
    }));
  }
  BuildPendingBetsFromChips(Chips = []) {
    return Chips.reduce((BetsBySeat, Chip) => {
      BetsBySeat[Chip.seatId] = (BetsBySeat[Chip.seatId] || 0) + Chip.value;
      return BetsBySeat;
    }, {});
  }
  SetPendingBetsFromChips(Chips = []) {
    const ClonedChips = this.CloneChipPlacements(Chips);
    this.state.pendingBetChips = ClonedChips;
    this.state.pendingBets = this.BuildPendingBetsFromChips(ClonedChips);
  }
  RememberLastBetSnapshot(Chips = this.state.pendingBetChips) {
    const ClonedChips = this.CloneChipPlacements(Chips);
    if (!ClonedChips.length) {
      return;
    }
    this.state.lastBetSnapshot = {
      chips: ClonedChips,
      seatIds: [...new Set(ClonedChips.map(Chip => Chip.seatId))]
    };
  }
  ClearPendingBetState() {
    this.state.pendingBets = {};
    this.state.pendingBetChips = [];
  }
  DropPendingBetsForSeat(SeatId) {
    if (!SeatId) {
      return;
    }
    this.state.pendingBetChips = this.state.pendingBetChips.filter(Chip => Chip.seatId !== SeatId);
    delete this.state.pendingBets[SeatId];
  }
  CanEditBettingControls() {
    return [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState) && !this.state.lockedInputs && !this.state.isAnimating;
  }
  CanRebet() {
    return this.CanEditBettingControls() && this.state.pendingBetChips.length === 0 && Boolean(this.state.lastBetSnapshot?.chips?.length) && this.GetLastBetTotal() <= this.state.balance;
  }
  GetLiveBetsBySeat() {
    return this.state.hands.reduce((BetsBySeat, Hand) => {
      BetsBySeat[Hand.seatId] = (BetsBySeat[Hand.seatId] || 0) + Hand.bet;
      return BetsBySeat;
    }, {});
  }
  GetParticipatingSeatIds() {
    return [...SEAT_POSITIONS].reverse().map(Seat => Seat.id).filter(SeatId => this.state.selectedSeatIds.includes(SeatId) && (this.state.pendingBets[SeatId] || 0) > 0);
  }
  GetSeatHands(SeatId) {
    return this.state.hands.filter(Hand => Hand.seatId === SeatId).sort(CompareSeatHands);
  }
  GetActiveHand() {
    return this.state.hands[this.state.activeHandIndex] || null;
  }
  GetHandMeta(HandIndex) {
    const Hand = this.state.hands[HandIndex];
    if (!Hand) {
      return null;
    }
    const SeatHands = this.GetSeatHands(Hand.seatId);
    const SeatHandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
    return {
      hand: Hand,
      handIndex: HandIndex,
      seatHands: SeatHands,
      seatHandIndex: SeatHandIndex,
      seatHandCount: SeatHands.length
    };
  }
  GetActiveHandMeta() {
    return this.GetHandMeta(this.state.activeHandIndex);
  }
  GetDealerAllCards() {
    return this.state.dealer.holeCard ? [...this.state.dealer.cards, this.state.dealer.holeCard] : [...this.state.dealer.cards];
  }
  GetBettingMessage() {
    if (!this.state.selectedSeatIds.length) {
      return this.state.lastBetSnapshot?.chips?.length ? "Press rebet to restore the previous wager." : "";
    }
    if (!this.state.selectedChipValue) {
      return this.state.lastBetSnapshot?.chips?.length ? "Select a chip, then click a seat to add it, or press rebet." : "Select a chip, then click a seat to add it.";
    }
    return "";
  }
  GetTurnMessage(HandIndex = this.state.activeHandIndex) {
    const Meta = this.GetHandMeta(HandIndex);
    if (!Meta) {
      return "Choose your next move.";
    }
    const SeatName = this.GetSeatName(Meta.hand.seatId);
    if (Meta.seatHandCount > 1) {
      return `${SeatName} hand ${Meta.seatHandIndex + 1} turn.`;
    }
    return `${SeatName} turn.`;
  }
  GetViewModel() {
    const TotalPendingBet = this.GetTotalPendingBet();
    const AvailableBalance = Math.max(0, this.state.balance - TotalPendingBet);
    const ParticipatingSeatIds = this.GetParticipatingSeatIds();
    const BettingEditable = this.CanEditBettingControls();
    const BettingOpen = this.state.roundState === ROUND_STATES.BETTING && this.state.selectedSeatIds.length > 0 && BettingEditable;
    const HasPendingBet = this.state.pendingBetChips.length > 0;
    const CanRebet = this.CanRebet();
    const PrimaryBetAction = CanRebet ? {
      label: "Rebet",
      tone: "rebet",
      disabled: false,
      ariaLabel: `Restore previous bet of ${Money(this.GetLastBetTotal())}`
    } : {
      label: "Ready",
      tone: "deal",
      disabled: !BettingOpen || ParticipatingSeatIds.length === 0,
      ariaLabel: "Ready up for the next blackjack round"
    };
    const ActiveHand = this.GetActiveHand();
    const CanAct = this.state.roundState === ROUND_STATES.PLAYER_TURN && !this.state.lockedInputs && !this.state.isAnimating && Boolean(ActiveHand) && !ActiveHand.bust && !ActiveHand.stood;
    const ActiveHandValue = ActiveHand ? HandValue(ActiveHand.cards).total : 0;
    const AllowDouble = CanAct && CanDouble(ActiveHand, this.state.balance);
    const AllowSplit = CanAct && CanSplit(ActiveHand, this.GetSeatHands(ActiveHand.seatId), this.state.balance);
    const LiveBetsBySeat = this.GetLiveBetsBySeat();
    const SeatBetAmounts = {};
    this.state.selectedSeatIds.forEach(SeatId => {
      const Pending = this.state.pendingBets[SeatId] || 0;
      const Live = LiveBetsBySeat[SeatId] || 0;
      if (Pending || Live) {
        SeatBetAmounts[SeatId] = Pending || Live;
      }
    });
    return {
      balanceLabel: Money(AvailableBalance),
      countdownLabel: this.GetCountdownLabel(),
      pendingBetLabel: Money(TotalPendingBet),
      seatBetAmounts: SeatBetAmounts,
      selectedChipValue: this.state.selectedChipValue,
      shoeLabel: this.state.shoe.isReady ? `${this.state.shoe.remaining} cards` : "Offline",
      showBettingControls: [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState),
      showDecisionPanel: this.state.roundState === ROUND_STATES.PLAYER_TURN,
      disableSeatSelection: this.state.lockedInputs || this.state.isAnimating || ![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState),
      disableUndoChip: !BettingEditable || !HasPendingBet,
      disableDoubleBet: !BettingEditable || !HasPendingBet || TotalPendingBet * 2 > this.state.balance,
      primaryBetAction: PrimaryBetAction,
      enabledChips: Object.fromEntries(CHIP_VALUES.map(Value => [Value, BettingOpen && (Value === this.state.selectedChipValue || TotalPendingBet + Value <= this.state.balance)])),
      actions: {
        hit: {
          hidden: false,
          disabled: !CanAct || ActiveHandValue >= 21
        },
        stand: {
          hidden: false,
          disabled: !CanAct
        },
        double: {
          hidden: !CanAct || !AllowDouble,
          disabled: !AllowDouble
        },
        split: {
          hidden: !CanAct || !AllowSplit,
          disabled: !AllowSplit
        }
      },
      externalSeatClaims: this.state.externalSeatClaims || {}
    };
  }
  GetCountdownLabel() {
    if (![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      return "--";
    }
    if (!this.state.countdownDeadline) {
      return `${BETTING_COUNTDOWN_SECONDS}s`;
    }
    return `${this.state.countdownSeconds}s`;
  }
  SyncSeatDrivenState() {
    if (!this.state.selectedSeatIds.length) {
      this.ClearPendingBetState();
      this.state.hands = [];
      this.state.dealer = CreateDealerState();
      this.state.activeSeatId = "";
      this.state.selectedChipValue = 0;
      this.state.activeHandIndex = 0;
      this.state.lockedInputs = false;
      this.state.isAnimating = false;
      this.TransitionTo(ROUND_STATES.WAITING, "");
      if (!this.state.countdownDeadline) {
        this.StartCountdownCycle();
      }
      return;
    }
    if (!this.state.activeSeatId || !this.state.selectedSeatIds.includes(this.state.activeSeatId)) {
      this.state.activeSeatId = this.state.selectedSeatIds[this.state.selectedSeatIds.length - 1];
    }
    if (this.state.roundState === ROUND_STATES.WAITING) {
      this.TransitionTo(ROUND_STATES.BETTING, this.GetBettingMessage());
      if (!this.state.countdownDeadline) {
        this.StartCountdownCycle();
      }
      return;
    }
    this.state.message = this.GetBettingMessage();
    if (!this.state.countdownDeadline) {
      this.StartCountdownCycle();
    }
  }
  ApplySelectedChipToSeat(SeatId) {
    const ChipValue = this.state.selectedChipValue;
    if (this.state.roundState !== ROUND_STATES.BETTING || !ChipValue || !this.state.selectedSeatIds.includes(SeatId)) {
      return false;
    }
    if (this.GetTotalPendingBet() + ChipValue > this.state.balance) {
      this.state.message = `Not enough balance for another ${Money(ChipValue)} chip.`;
      return false;
    }
    this.state.activeSeatId = SeatId;
    this.state.pendingBets[SeatId] = (this.state.pendingBets[SeatId] || 0) + ChipValue;
    this.state.pendingBetChips.push({
      seatId: SeatId,
      value: ChipValue
    });
    this.state.message = `${Money(this.state.pendingBets[SeatId])} on ${this.GetSeatName(SeatId)}.`;
    return true;
  }
  async ToggleSeat(SeatId) {
    if (this.state.lockedInputs || this.state.isAnimating) {
      return;
    }
    if (![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      return;
    }
    const ExternalSeatClaim = this.state.externalSeatClaims?.[SeatId];
    if (ExternalSeatClaim) {
      this.state.message = `${ExternalSeatClaim.displayName} already took ${this.GetSeatName(SeatId)}.`;
      this.Render();
      return;
    }
    const IsClaimed = this.state.selectedSeatIds.includes(SeatId);
    const ShouldApplySelectedChip = this.state.roundState === ROUND_STATES.BETTING && Number.isFinite(this.state.selectedChipValue) && this.state.selectedChipValue > 0;
    if (!IsClaimed) {
      if (this.seatController?.claimSeat) {
        const ClaimResult = await this.seatController.claimSeat(SeatId);
        if (!ClaimResult?.ok) {
          this.state.message = ClaimResult?.error || "That seat is no longer available.";
          this.Render();
          return;
        }
      }
      this.state.selectedSeatIds = [...new Set([...this.state.selectedSeatIds, SeatId])];
      this.state.activeSeatId = SeatId;
      this.SyncSeatDrivenState();
      if (ShouldApplySelectedChip) {
        this.ApplySelectedChipToSeat(SeatId);
      }
      this.Render();
      return;
    }
    if (ShouldApplySelectedChip) {
      this.state.activeSeatId = SeatId;
      this.ApplySelectedChipToSeat(SeatId);
      this.Render();
      return;
    }
    if (this.state.activeSeatId !== SeatId) {
      this.state.activeSeatId = SeatId;
    } else {
      if (this.seatController?.releaseSeat) {
        const ReleaseResult = await this.seatController.releaseSeat(SeatId);
        if (!ReleaseResult?.ok) {
          this.state.message = ReleaseResult?.error || "That seat could not be released.";
          this.Render();
          return;
        }
      }
      this.state.selectedSeatIds = this.state.selectedSeatIds.filter(Candidate => Candidate !== SeatId);
      this.DropPendingBetsForSeat(SeatId);
      this.state.activeSeatId = this.state.selectedSeatIds[this.state.selectedSeatIds.length - 1] || "";
    }
    this.SyncSeatDrivenState();
    this.Render();
  }
  AddChip(Value) {
    if (this.state.lockedInputs || this.state.isAnimating || this.state.roundState !== ROUND_STATES.BETTING) {
      return;
    }
    const SelectingNewChip = this.state.selectedChipValue !== Value;
    if (!this.state.selectedSeatIds.length || SelectingNewChip && this.GetTotalPendingBet() + Value > this.state.balance) {
      return;
    }
    this.state.selectedChipValue = SelectingNewChip ? Value : 0;
    this.state.message = this.GetBettingMessage();
    this.Render();
  }
  UndoLastChip() {
    if (!this.CanEditBettingControls() || !this.state.pendingBetChips.length) {
      return;
    }
    const RemovedChip = this.state.pendingBetChips.pop();
    if (!RemovedChip) {
      return;
    }
    const NextAmount = (this.state.pendingBets[RemovedChip.seatId] || 0) - RemovedChip.value;
    if (NextAmount > 0) {
      this.state.pendingBets[RemovedChip.seatId] = NextAmount;
    } else {
      delete this.state.pendingBets[RemovedChip.seatId];
    }
    this.state.activeSeatId = RemovedChip.seatId;
    this.state.message = `Removed ${Money(RemovedChip.value)} from ${this.GetSeatName(RemovedChip.seatId)}.`;
    this.Render();
  }
  DoublePendingBet() {
    if (!this.CanEditBettingControls() || !this.state.pendingBetChips.length) {
      return;
    }
    const TotalPendingBet = this.GetTotalPendingBet();
    if (TotalPendingBet * 2 > this.state.balance) {
      this.state.message = "Not enough balance to double the current bet.";
      this.Render();
      return;
    }
    const ChipsToDuplicate = this.CloneChipPlacements(this.state.pendingBetChips);
    ChipsToDuplicate.forEach(Chip => {
      this.state.pendingBetChips.push(Chip);
      this.state.pendingBets[Chip.seatId] = (this.state.pendingBets[Chip.seatId] || 0) + Chip.value;
    });
    this.state.activeSeatId = ChipsToDuplicate[ChipsToDuplicate.length - 1]?.seatId || this.state.activeSeatId;
    this.state.message = `Bet doubled to ${Money(this.GetTotalPendingBet())}.`;
    this.Render();
  }
  RebetLastWager() {
    if (!this.CanRebet()) {
      return;
    }
    const Snapshot = this.state.lastBetSnapshot;
    if (!Snapshot?.chips?.length) {
      return;
    }
    this.state.selectedSeatIds = [...new Set([...this.state.selectedSeatIds, ...Snapshot.seatIds])];
    this.state.activeSeatId = Snapshot.seatIds[Snapshot.seatIds.length - 1] || this.state.activeSeatId;
    this.SetPendingBetsFromChips(Snapshot.chips);
    this.SyncSeatDrivenState();
    this.state.message = `Rebet ready: ${Money(this.GetTotalPendingBet())}.`;
    this.Render();
  }
  ClearBet() {
    if (this.state.lockedInputs || this.state.isAnimating || this.state.roundState !== ROUND_STATES.BETTING) {
      return;
    }
    if (!this.state.activeSeatId) {
      return;
    }
    this.DropPendingBetsForSeat(this.state.activeSeatId);
    this.state.message = `${this.GetSeatName(this.state.activeSeatId)} bet cleared.`;
    this.Render();
  }
  OnPrimaryBetAction() {
    if (this.CanRebet()) {
      this.RebetLastWager();
      return;
    }
    void this.PlaceBet();
  }
  async PlaceBet() {
    if (this.state.lockedInputs || this.state.isAnimating || this.currentTask || this.state.roundState !== ROUND_STATES.BETTING || this.GetParticipatingSeatIds().length === 0) {
      return;
    }
    this.state.countdownDeadline = null;
    this.state.countdownSeconds = BETTING_COUNTDOWN_SECONDS;
    await this.RunTask(() => this.BeginRound());
  }
  OnTimerTick() {
    if (![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState) || this.state.lockedInputs || this.currentTask) {
      return;
    }
    if (!this.state.countdownDeadline) {
      this.StartCountdownCycle();
      this.Render();
      return;
    }
    const RemainingMs = Math.max(this.state.countdownDeadline - Date.now(), 0);
    const NextSeconds = Math.ceil(RemainingMs / 1000);
    if (NextSeconds !== this.state.countdownSeconds) {
      this.state.countdownSeconds = NextSeconds;
      this.Render();
    }
    if (RemainingMs === 0) {
      if (this.state.roundState === ROUND_STATES.BETTING && this.GetParticipatingSeatIds().length > 0) {
        this.state.countdownDeadline = null;
        this.RunTask(() => this.BeginRound());
        return;
      }
      this.StartCountdownCycle();
      this.Render();
    }
  }
  RunTask(Task) {
    if (this.currentTask) {
      return this.currentTask;
    }
    this.currentTask = Task().catch(Error => {
      console.error(Error);
      this.RecoverRoundFromError("Round cancelled because cards could not be drawn. Bets returned.");
    }).finally(() => {
      this.currentTask = null;
      this.Render();
    });
    return this.currentTask;
  }
  async PrepareShoe(ForceNew = false) {
    if (!ForceNew && this.state.shoe.isReady && this.state.shoe.remaining >= RESHUFFLE_THRESHOLD) {
      return true;
    }
    const PreviousAnimating = this.state.isAnimating;
    const PreviousLock = this.state.lockedInputs;
    this.state.isAnimating = true;
    this.state.lockedInputs = true;
    this.state.message = ForceNew ? "" : "Refreshing the shoe.";
    this.Render();
    try {
      const Shoe = await CreateShoe();
      this.state.shoe = {
        deckId: Shoe.deckId,
        remaining: Shoe.remaining,
        isReady: true
      };
      this.state.message = "Shoe ready.";
      return true;
    } catch (Error) {
      console.error(Error);
      this.state.shoe = {
        deckId: "",
        remaining: 0,
        isReady: false
      };
      this.state.message = "Deck service unavailable. Retrying when the round starts.";
      return false;
    } finally {
      this.state.isAnimating = PreviousAnimating;
      this.state.lockedInputs = PreviousLock;
      this.Render();
    }
  }
  async DrawOneCard() {
    if (!this.state.shoe.isReady || !this.state.shoe.deckId) {
      const Ready = await this.PrepareShoe(true);
      if (!Ready) {
        throw new Error("Deck service unavailable.");
      }
    }
    const Payload = await DrawCards(this.state.shoe.deckId, 1);
    const [Card] = Payload.cards;
    if (!Card) {
      throw new Error("Deck API returned no card.");
    }
    this.state.shoe.remaining = Payload.remaining;
    return Card;
  }
  async WithAnimation(Animation) {
    const PreviousAnimating = this.state.isAnimating;
    const PreviousLock = this.state.lockedInputs;
    this.state.isAnimating = true;
    this.state.lockedInputs = true;
    this.Render();
    try {
      await Animation();
    } finally {
      this.state.isAnimating = PreviousAnimating;
      this.state.lockedInputs = PreviousLock;
      this.Render();
    }
  }
  RefreshHandFlags(Hand) {
    const Value = HandValue(Hand.cards);
    Hand.bust = Value.isBust;
    Hand.blackjack = IsBlackjack(Hand.cards, Hand.splitFromPair);
  }
  FindNextPlayableHandIndex(StartIndex = 0) {
    for (let Index = StartIndex; Index < this.state.hands.length; Index += 1) {
      const Hand = this.state.hands[Index];
      if (!Hand || Hand.stood || Hand.bust || Hand.blackjack) {
        continue;
      }
      if (HandValue(Hand.cards).total >= 21) {
        continue;
      }
      return Index;
    }
    return -1;
  }
  async BeginRound() {
    if (!this.state.selectedSeatIds.length) {
      this.SyncSeatDrivenState();
      return;
    }
    const ParticipatingSeatIds = this.GetParticipatingSeatIds();
    if (!ParticipatingSeatIds.length) {
      this.TransitionTo(ROUND_STATES.BETTING, "Place a bet to begin the round.");
      return;
    }
    const ShoeReady = await this.PrepareShoe(this.state.shoe.remaining < RESHUFFLE_THRESHOLD);
    if (!ShoeReady) {
      this.TransitionTo(ROUND_STATES.BETTING, "Deck service unavailable. Place a bet and try again.");
      this.state.lockedInputs = false;
      return;
    }
    this.TransitionTo(ROUND_STATES.DEALING, "Dealing cards.");
    this.state.lockedInputs = true;
    this.state.countdownSeconds = BETTING_COUNTDOWN_SECONDS;
    this.state.countdownDeadline = null;
    const OpeningBetTotal = ParticipatingSeatIds.reduce((Total, SeatId) => Total + (this.state.pendingBets[SeatId] || 0), 0);
    this.RememberLastBetSnapshot();
    this.AdjustBalance(-OpeningBetTotal, {
      sync: true
    });
    this.state.hands = ParticipatingSeatIds.map(SeatId => CreateHand({
      seatId: SeatId,
      bet: this.state.pendingBets[SeatId] || 0
    }));
    this.ClearPendingBetState();
    this.state.dealer = CreateDealerState();
    this.state.activeHandIndex = 0;
    this.state.lastResults = [];
    this.Render();
    for (let Index = 0; Index < this.state.hands.length; Index += 1) {
      await this.DealCardToPlayer(Index);
      await Delay(BETWEEN_DEALS_MS);
    }
    const OpeningDealerUpcard = await this.DealOpeningDealerUpcardHidden();
    await Delay(BETWEEN_DEALS_MS);
    for (let Index = 0; Index < this.state.hands.length; Index += 1) {
      await this.DealCardToPlayer(Index);
      await Delay(BETWEEN_DEALS_MS);
    }
    await this.RevealOpeningDealerUpcard(OpeningDealerUpcard);
    await Delay(BETWEEN_DEALS_MS);
    await this.DealCardToDealer(false);
    this.state.hands.forEach(Hand => {
      if (Hand.blackjack) {
        Hand.stood = true;
      }
    });
    const NextPlayableIndex = this.FindNextPlayableHandIndex(0);
    if (NextPlayableIndex === -1) {
      await this.BeginDealerTurn();
      return;
    }
    this.state.activeHandIndex = NextPlayableIndex;
    this.TransitionTo(ROUND_STATES.PLAYER_TURN, this.GetTurnMessage(NextPlayableIndex));
    this.state.lockedInputs = false;
    this.Render();
  }
  async DealCardToPlayer(HandIndex) {
    const Meta = this.GetHandMeta(HandIndex);
    if (!Meta) {
      return null;
    }
    const {
      hand: Hand,
      seatHandIndex: SeatHandIndex,
      seatHandCount: SeatHandCount
    } = Meta;
    const TargetRect = this.renderer.GetProjectedCardRect({
      owner: "player",
      seatId: Hand.seatId,
      handIndex: SeatHandIndex,
      handCount: SeatHandCount,
      cardIndex: Hand.cards.length,
      cardCount: Hand.cards.length + 1
    });
    const SourceRect = this.renderer.GetShoePacketRect();
    const Card = await this.DrawOneCard();
    await this.WithAnimation(() => this.animator.AnimateDeal({
      sourceRect: SourceRect,
      targetRect: TargetRect,
      card: Card,
      faceUp: true,
      targetRotation: TargetRect.rotation
    }));
    Hand.cards.push(Card);
    this.RefreshHandFlags(Hand);
    this.Render();
    return Card;
  }
  async DealCardToDealer(FaceUp) {
    const VisibleCount = this.state.dealer.cards.length;
    const HiddenCount = this.state.dealer.holeCard ? 1 : 0;
    const CardIndex = VisibleCount + HiddenCount;
    const TargetRect = this.renderer.GetProjectedCardRect({
      owner: "dealer",
      seatId: "",
      handIndex: 0,
      handCount: 1,
      cardIndex: CardIndex,
      cardCount: CardIndex + 1
    });
    const SourceRect = this.renderer.GetShoePacketRect();
    const Card = await this.DrawOneCard();
    await this.WithAnimation(() => this.animator.AnimateDeal({
      sourceRect: SourceRect,
      targetRect: TargetRect,
      card: Card,
      faceUp: FaceUp,
      targetRotation: TargetRect.rotation
    }));
    if (FaceUp) {
      this.state.dealer.cards.push(Card);
    } else {
      this.state.dealer.holeCard = Card;
      this.state.dealer.isHoleRevealed = false;
    }
    this.Render();
    return Card;
  }
  async DealOpeningDealerUpcardHidden() {
    const TargetRect = this.renderer.GetProjectedCardRect({
      owner: "dealer",
      seatId: "",
      handIndex: 0,
      handCount: 1,
      cardIndex: 0,
      cardCount: 1
    });
    const SourceRect = this.renderer.GetShoePacketRect();
    const Card = await this.DrawOneCard();
    await this.WithAnimation(() => this.animator.AnimateDeal({
      sourceRect: SourceRect,
      targetRect: TargetRect,
      card: Card,
      faceUp: false,
      targetRotation: TargetRect.rotation
    }));
    this.state.dealer.cards = [{
      isFaceDown: true
    }];
    this.state.dealer.holeCard = null;
    this.state.dealer.isHoleRevealed = false;
    this.Render();
    return Card;
  }
  async RevealOpeningDealerUpcard(Card) {
    const TargetRect = this.renderer.GetProjectedCardRect({
      owner: "dealer",
      seatId: "",
      handIndex: 0,
      handCount: 1,
      cardIndex: 0,
      cardCount: 1
    });
    const RevealNode = this.renderer.elements?.stage?.querySelector('.PlayingCard[data-owner="dealer"][data-card-index="0"]');
    let RevealCompleted = false;
    if (RevealNode) {
      RevealNode.style.visibility = "hidden";
    }
    try {
      await this.WithAnimation(() => this.animator.AnimateReveal({
        targetRect: TargetRect,
        card: Card,
        targetRotation: TargetRect.rotation
      }));
      RevealCompleted = true;
    } finally {
      if (!RevealCompleted && RevealNode?.isConnected) {
        RevealNode.style.visibility = "";
      }
    }
    this.state.dealer.cards = [Card];
    this.state.dealer.holeCard = null;
    this.state.dealer.isHoleRevealed = false;
    this.Render();
  }
  async OnAction(Action) {
    if (this.state.lockedInputs || this.state.isAnimating) {
      return;
    }
    const ActiveHand = this.GetActiveHand();
    if (!ActiveHand || this.state.roundState !== ROUND_STATES.PLAYER_TURN) {
      return;
    }
    const HandTotal = HandValue(ActiveHand.cards).total;
    const AllowDouble = CanDouble(ActiveHand, this.state.balance);
    const AllowSplit = CanSplit(ActiveHand, this.GetSeatHands(ActiveHand.seatId), this.state.balance);
    const Handlers = {
      hit: () => HandTotal < 21 && this.PerformHit(),
      stand: () => this.PerformStand(),
      double: () => AllowDouble && this.PerformDouble(),
      split: () => AllowSplit && this.PerformSplit()
    };
    const Run = Handlers[Action];
    if (!Run) {
      return;
    }
    this.RunTask(async () => {
      await Run();
    });
  }
  async PerformHit() {
    this.state.lockedInputs = true;
    this.state.message = "Dealing one card.";
    this.Render();
    const Hand = this.GetActiveHand();
    await this.DealCardToPlayer(this.state.activeHandIndex);
    if (Hand.bust) {
      Hand.stood = true;
      this.state.message = `${this.GetSeatName(Hand.seatId)} busted.`;
      await this.AdvanceAfterHand();
      return;
    }
    this.state.lockedInputs = false;
    this.state.message = "Choose your next move.";
    this.Render();
  }
  async PerformStand() {
    const Hand = this.GetActiveHand();
    Hand.stood = true;
    this.state.lockedInputs = true;
    this.state.message = `Standing on ${this.GetSeatName(Hand.seatId)}.`;
    this.Render();
    await this.AdvanceAfterHand();
  }
  async PerformDouble() {
    const Hand = this.GetActiveHand();
    this.AdjustBalance(-Hand.bet, {
      sync: true
    });
    Hand.bet *= 2;
    Hand.doubled = true;
    this.state.lockedInputs = true;
    this.state.message = `Doubling down on ${this.GetSeatName(Hand.seatId)}.`;
    this.Render();
    await this.DealCardToPlayer(this.state.activeHandIndex);
    Hand.stood = true;
    await this.AdvanceAfterHand();
  }
  async PerformSplit() {
    const Meta = this.GetActiveHandMeta();
    if (!Meta) {
      return;
    }
    const OriginalHand = Meta.hand;
    const OriginalCards = [...OriginalHand.cards];
    const CurrentIndex = Meta.handIndex;
    const FirstRect = this.renderer.GetRenderedCardRect("player", OriginalHand.id, 0);
    const SecondRect = this.renderer.GetRenderedCardRect("player", OriginalHand.id, 1);
    this.state.lockedInputs = true;
    this.state.message = `Splitting ${this.GetSeatName(OriginalHand.seatId)}.`;
    this.AdjustBalance(-OriginalHand.bet, {
      sync: true
    });
    const SplitHands = [CreateHand({
      seatId: OriginalHand.seatId,
      bet: OriginalHand.bet,
      cards: [OriginalCards[1]],
      splitFromPair: true,
      seatLayoutIndex: 1
    }), CreateHand({
      seatId: OriginalHand.seatId,
      bet: OriginalHand.bet,
      cards: [OriginalCards[0]],
      splitFromPair: true,
      seatLayoutIndex: 0
    })];
    this.state.hands.splice(CurrentIndex, 1, ...SplitHands);
    this.state.activeHandIndex = CurrentIndex;
    if (FirstRect && SecondRect) {
      await this.WithAnimation(() => Promise.all([this.AnimateRenderedPlayerCardMove(SplitHands[0].id, 0, SecondRect), this.AnimateRenderedPlayerCardMove(SplitHands[1].id, 0, FirstRect)]));
    } else {
      this.Render();
    }
    await this.DealCardToPlayer(CurrentIndex);
    await Delay(BETWEEN_DEALS_MS);
    await this.DealCardToPlayer(CurrentIndex + 1);
    this.state.lockedInputs = false;
    this.state.message = this.GetTurnMessage(CurrentIndex);
    this.Render();
  }
  async AdvanceAfterHand() {
    const NextIndex = this.FindNextPlayableHandIndex(this.state.activeHandIndex + 1);
    if (NextIndex !== -1) {
      this.state.activeHandIndex = NextIndex;
      this.state.lockedInputs = false;
      this.state.message = this.GetTurnMessage(NextIndex);
      this.Render();
      return;
    }
    await this.BeginDealerTurn();
  }
  async BeginDealerTurn() {
    this.TransitionTo(ROUND_STATES.DEALER_TURN, "Dealer turn.");
    this.state.lockedInputs = true;
    this.Render();
    if (this.state.dealer.holeCard && !this.state.dealer.isHoleRevealed) {
      const RevealRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        seatId: "",
        handIndex: 0,
        handCount: 1,
        cardIndex: this.state.dealer.cards.length,
        cardCount: this.state.dealer.cards.length + 1
      });
      await this.WithAnimation(() => this.animator.AnimateReveal({
        targetRect: RevealRect,
        card: this.state.dealer.holeCard,
        targetRotation: RevealRect.rotation
      }));
      this.state.dealer.cards.push(this.state.dealer.holeCard);
      this.state.dealer.holeCard = null;
      this.state.dealer.isHoleRevealed = true;
      this.Render();
      await Delay(BETWEEN_DEALS_MS);
    }
    while (DealerHits(this.state.dealer.cards, this.state.ruleConfig.dealerHitsSoft17)) {
      await this.DealCardToDealer(true);
      await Delay(BETWEEN_DEALS_MS);
    }
    await this.SettleRound();
  }
  async SettleRound() {
    this.TransitionTo(ROUND_STATES.SETTLING, "Settling bets.");
    this.state.lockedInputs = true;
    const DealerCards = this.state.dealer.cards;
    const ResultLabels = [];
    this.state.hands.forEach(Hand => {
      const Settlement = SettleHand(Hand, DealerCards, this.state.ruleConfig);
      const SeatHands = this.GetSeatHands(Hand.seatId);
      const SeatHandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
      const SeatLabel = SeatHands.length > 1 ? `${this.GetSeatName(Hand.seatId)} hand ${SeatHandIndex + 1}` : this.GetSeatName(Hand.seatId);
      Hand.result = Settlement.result;
      Hand.payout = Settlement.payout;
      this.AdjustBalance(Settlement.payout, {
        sync: true
      });
      ResultLabels.push(`${SeatLabel}: ${Settlement.result}`);
    });
    this.state.message = ResultLabels.join(" | ");
    this.Render();
    await Delay(SETTLE_DISPLAY_MS);
    await this.CollectDealtCards();
    this.FinishRound();
  }
  async CollectDealtCards() {
    await this.WithAnimation(async () => {
      const CollectableCards = this.renderer.GetCollectableCards().sort((Left, Right) => Right.sourceRect.left - Left.sourceRect.left || Right.sourceRect.top - Left.sourceRect.top);
      const HandLayers = [this.renderer?.elements?.dealerHandLayer, this.renderer?.elements?.playerHandsLayer].filter(Boolean);
      const PreviousLayerVisibilities = HandLayers.map(Layer => Layer.style.visibility);
      let AnimationCompleted = false;
      if (!CollectableCards.length) {
        return;
      }
      HandLayers.forEach(Layer => {
        Layer.style.visibility = "hidden";
      });
      try {
        await Promise.all(CollectableCards.map((Entry, Index) => {
          const TargetRect = this.renderer.GetLeftPacketRect(Index);
          return this.animator.AnimateCollect({
            sourceRect: Entry.sourceRect,
            targetRect: TargetRect,
            card: Entry.card,
            faceUp: Entry.faceUp,
            sourceRotation: Entry.sourceRotation,
            targetRotation: TargetRect.rotation,
            duration: COLLECT_CARDS_DURATION_MS,
            delay: Index * COLLECT_CARDS_STAGGER_MS
          });
        }));
        AnimationCompleted = true;
      } finally {
        HandLayers.forEach((Layer, Index) => {
          if (AnimationCompleted) {
            Layer.innerHTML = "";
          }
          Layer.style.visibility = PreviousLayerVisibilities[Index] || "";
        });
      }
    });
  }
  FinishRound() {
    this.state.hands = [];
    this.state.dealer = CreateDealerState();
    this.ClearPendingBetState();
    this.state.activeHandIndex = 0;
    this.StartCountdownCycle();
    this.state.lockedInputs = false;
    this.state.isAnimating = false;
    if (this.state.selectedSeatIds.length) {
      if (!this.state.activeSeatId || !this.state.selectedSeatIds.includes(this.state.activeSeatId)) {
        this.state.activeSeatId = this.state.selectedSeatIds[this.state.selectedSeatIds.length - 1];
      }
      this.TransitionTo(ROUND_STATES.BETTING, this.GetBettingMessage());
      return;
    }
    this.TransitionTo(ROUND_STATES.WAITING, "");
  }
  RecoverRoundFromError(Message) {
    const ActiveBetTotal = this.state.hands.reduce((Total, Hand) => Total + Hand.bet, 0);
    this.AdjustBalance(ActiveBetTotal, {
      sync: true
    });
    this.ClearPendingBetState();
    this.state.hands = [];
    this.state.dealer = CreateDealerState();
    this.state.activeHandIndex = 0;
    this.StartCountdownCycle();
    this.state.lockedInputs = false;
    this.state.isAnimating = false;
    if (this.state.selectedSeatIds.length) {
      if (!this.state.activeSeatId || !this.state.selectedSeatIds.includes(this.state.activeSeatId)) {
        this.state.activeSeatId = this.state.selectedSeatIds[this.state.selectedSeatIds.length - 1];
      }
      this.ForceState(ROUND_STATES.BETTING, Message);
      return;
    }
    this.ForceState(ROUND_STATES.WAITING, Message);
  }
}
