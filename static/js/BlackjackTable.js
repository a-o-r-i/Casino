import { BindControls } from "./BlackjackTable/TableControls.js";
import { Animator } from "./BlackjackTable/Animator.js";
import { CHIP_VALUES, COLLECT_CARDS_DURATION_MS, COLLECT_CARDS_STAGGER_MS, ROUND_STATES, SEAT_POSITIONS } from "./BlackjackTable/TableConfig.js";
import { LoadHandSlots } from "./BlackjackTable/HandSlots.js";
import { CreateTableRenderer } from "./BlackjackTable/TableRenderer.js";
import { Money, HandValue } from "./BlackjackTable/TableRules.js";
import { SameSideBetLayout, SideBetKey, LoadSideBets, NormalizeSideBets, SaveSideBets } from "./BlackjackTable/SideBets.js";
import { PlayBlackjackSound, RegisterBlackjackSounds } from "./BlackjackTable/Sounds.js";
import { CreateInitialState } from "./BlackjackTable/TableState.js";
const BET_TYPES = Object.freeze({
  MAIN: "main",
  PERFECT_PAIRS: "perfect_pairs",
  TWENTY_ONE_PLUS_THREE: "twenty_one_plus_three",
  INSURANCE: "insurance"
});
const BET_TARGET_LABELS = Object.freeze({
  [BET_TYPES.MAIN]: "Main",
  [BET_TYPES.PERFECT_PAIRS]: "Pairs",
  [BET_TYPES.TWENTY_ONE_PLUS_THREE]: "21+3",
  [BET_TYPES.INSURANCE]: "Insurance"
});
function ParseTableConfig(Root = document) {
  const Node = Root.querySelector("[data-blackjack-table-config]");
  if (!Node) {
    return {};
  }
  try {
    return JSON.parse(Node.textContent);
  } catch (Error) {
    console.error(Error);
    return {};
  }
}
function GetPollDelay(State, DocumentValue = document) {
  const BaseDelay = Math.max(Number(State?.poll_interval_ms) || 1200, 700);
  return DocumentValue.visibilityState === "hidden" ? Math.round(BaseDelay * 2.2) : BaseDelay;
}
function ApplyParentBalanceDisplay(BalanceDisplay) {
  if (typeof BalanceDisplay !== "string" || !BalanceDisplay) {
    return;
  }
  window.parent?.GamblingApp?.setGlobalBalanceDisplay?.(BalanceDisplay);
}
function HandleCanceledSessionPayload(Payload, ScopeWindow = window) {
  if (!Payload?.is_canceled || !Payload?.redirect_url) {
    return false;
  }
  const TargetWindow = ScopeWindow.parent && ScopeWindow.parent !== ScopeWindow ? ScopeWindow.parent : ScopeWindow;
  TargetWindow.GamblingApp?.showToast?.(Payload.toast || {
    message: Payload.status_text || "Session has been canceled by an admin.",
    title: "Session canceled",
    tone: "info"
  });
  TargetWindow.location.href = Payload.redirect_url;
  return true;
}
function GetInitialBalanceAmount(InitialState) {
  const ParsedBalance = Number(InitialState?.current_balance_amount);
  return Number.isFinite(ParsedBalance) ? ParsedBalance : 0;
}
function GetCsrfHeaders() {
  const Token = document.body?.dataset?.csrfToken || "";
  return Token ? {
    "X-CSRF-Token": Token
  } : {};
}
function NormalizeDealer(Dealer = {}) {
  return {
    cards: Array.isArray(Dealer.cards) ? Dealer.cards.filter(Boolean) : [],
    holeCard: Dealer.holeCard || null,
    isHoleRevealed: Boolean(Dealer.isHoleRevealed)
  };
}
function NormalizeHand(Hand = {}) {
  return {
    id: Hand.id || "",
    seatId: Hand.seatId || Hand.seat_id || "",
    cards: Array.isArray(Hand.cards) ? Hand.cards.filter(Boolean) : [],
    bet: Number(Hand.bet) || 0,
    stood: Boolean(Hand.stood),
    bust: Boolean(Hand.bust),
    blackjack: Boolean(Hand.blackjack),
    doubled: Boolean(Hand.doubled),
    splitFromPair: Boolean(Hand.splitFromPair),
    seatLayoutIndex: Number(Hand.seatLayoutIndex) || 0,
    result: Hand.result || "",
    payout: Number(Hand.payout) || 0,
    isSelf: Boolean(Hand.isSelf),
    ownerName: Hand.ownerName || "Player",
    userId: Hand.userId || ""
  };
}
function NormalizeSeatAmounts(Amounts = {}) {
  return Object.fromEntries(Object.entries(Amounts).map(([SeatId, Amount]) => [SeatId, Number(Amount) || 0]).filter(([, Amount]) => Amount > 0));
}
function NormalizePendingSideBets(SideBets = {}) {
  return Object.fromEntries(Object.entries(SideBets).map(([SeatId, SeatSideBets]) => [SeatId, Object.fromEntries(Object.entries(SeatSideBets || {}).map(([BetType, Amount]) => [BetType, Number(Amount) || 0]).filter(([, Amount]) => Amount > 0))]).filter(([, SeatSideBets]) => Object.keys(SeatSideBets).length > 0));
}
function NormalizeSideBetRecord(SideBet = {}) {
  return {
    bet: Number(SideBet.bet) || 0,
    betCents: Number(SideBet.betCents) || 0,
    betType: SideBet.betType || "",
    label: SideBet.label || BET_TARGET_LABELS[SideBet.betType] || "Side Bet",
    maxBet: Number(SideBet.maxBet) || 0,
    maxBetCents: Number(SideBet.maxBetCents) || 0,
    payout: Number(SideBet.payout) || 0,
    payoutCredited: Boolean(SideBet.payoutCredited),
    payoutCents: Number(SideBet.payoutCents) || 0,
    result: SideBet.result || "",
    resultLabel: SideBet.resultLabel || "",
    status: SideBet.status || "none"
  };
}
function NormalizeSeatSideBets(SeatSideBets = {}) {
  return Object.fromEntries(Object.entries(SeatSideBets).map(([SeatId, Bets]) => [SeatId, Object.fromEntries(Object.entries(Bets || {}).map(([BetType, SideBet]) => [BetType, NormalizeSideBetRecord(SideBet)]).filter(([, SideBet]) => SideBet.betCents > 0 || SideBet.status !== "none" || SideBet.maxBetCents > 0))]).filter(([, Bets]) => Object.keys(Bets).length > 0));
}
function GetSeatName(SeatId) {
  return SEAT_POSITIONS.find(Seat => Seat.id === SeatId)?.name || SeatId || "Seat";
}
function GetBetTargetLabel(BetType) {
  return BET_TARGET_LABELS[BetType] || BET_TARGET_LABELS[BET_TYPES.MAIN];
}
function GetActiveHand(State) {
  return State.hands[State.activeHandIndex] || null;
}
function ClonePayload(Payload) {
  return typeof structuredClone === "function" ? structuredClone(Payload) : JSON.parse(JSON.stringify(Payload));
}
function GetPayloadUpdatedAt(Payload) {
  return Number(Payload?.table_state?.updated_at) || 0;
}
function ClonePayloadForOpeningAnimation(Payload) {
  const NextPayload = ClonePayload(Payload);
  const Table = NextPayload.table_state || {};
  Table.hands = (Table.hands || []).map(Hand => ({
    ...Hand,
    cards: []
  }));
  Table.dealer = {
    cards: [],
    holeCard: null,
    isHoleRevealed: false
  };
  Table.insurance_offer_seat_ids = [];
  Table.message = "";
  Table.seat_side_bets = {};
  Table.round_state = ROUND_STATES.DEALING;
  return NextPayload;
}
function GetSortedSeatHands(Hands, SeatId) {
  return Hands.filter(Hand => Hand.seatId === SeatId).sort((Left, Right) => (Left.seatLayoutIndex ?? 0) - (Right.seatLayoutIndex ?? 0));
}
function WaitForAnimation(Animation) {
  if (!Animation) {
    return Promise.resolve();
  }
  return Animation.finished.catch(() => {}).finally(() => {
    Animation.cancel();
  });
}
class NetworkBlackjackTable {
  constructor({
    animator,
    renderer: Renderer,
    initialBalance: InitialBalance = 0,
    actionUrl: ActionUrl = "",
    seatActionUrl: SeatActionUrl = "",
    canAdminKickSeats: CanAdminKickSeats = false,
    canEditSideBetLayout: CanEditSideBetLayout = false
  }) {
    this.animator = animator;
    this.renderer = Renderer;
    this.actionUrl = ActionUrl;
    this.seatActionUrl = SeatActionUrl;
    this.canAdminKickSeats = Boolean(CanAdminKickSeats);
    this.canEditSideBetLayout = Boolean(CanEditSideBetLayout);
    this.state = CreateInitialState({
      balance: InitialBalance
    });
    this.tableState = {};
    this.seatClaims = [];
    this.localMessage = "";
    this.animatedRoundIds = new Set();
    this.animatingRoundId = "";
    this.isAnimatingPayload = false;
    this.animatingPayloadUpdatedAt = 0;
    this.queuedAnimationPayload = null;
    this.deferredPollPayload = null;
    this.lastAppliedPayloadUpdatedAt = 0;
    this.pendingOptimisticChipActions = 0;
    this.pendingSeatClaimIds = new Set();
    this.optimisticSeatClaimIds = new Set();
    this.optimisticSeatClaimUpdatedAts = new Map();
    this.hasAppliedPayloadSnapshot = false;
    this.playedBustSoundSignatures = new Set();
    this.playedWinSoundSignatures = new Set();
    this.sideBetEditor = {
      active: false,
      applyDisabled: true,
      isSaving: false,
      selectedSpotKey: "",
      savedLayout: NormalizeSideBets(Renderer.GetSideBetLayout?.() || [])
    };
  }
  ShouldAnimateOpeningDeal(Table) {
    const RoundId = Table?.round_id;
    return Boolean(RoundId && !this.animatedRoundIds.has(RoundId) && Array.isArray(Table.hands) && Table.hands.some(Hand => Array.isArray(Hand.cards) && Hand.cards.length > 0));
  }
  async ApplyPayload(Payload, {
    animate: Animate = true,
    source: Source = "poll"
  } = {}) {
    if (!Payload) {
      return false;
    }
    const Table = Payload.table_state || {};
    const PayloadUpdatedAt = GetPayloadUpdatedAt(Payload);
    if (PayloadUpdatedAt > 0 && PayloadUpdatedAt < this.lastAppliedPayloadUpdatedAt) {
      return false;
    }
    if (Source === "poll" && this.pendingOptimisticChipActions > 0) {
      const DeferredUpdatedAt = GetPayloadUpdatedAt(this.deferredPollPayload);
      if (!this.deferredPollPayload || PayloadUpdatedAt >= DeferredUpdatedAt) {
        this.deferredPollPayload = Payload;
      }
      return false;
    }
    if (Animate && this.isAnimatingPayload) {
      this.QueueAnimationPayload(Payload);
      return false;
    }
    if (Animate && this.ShouldAnimateCollect(Table)) {
      this.isAnimatingPayload = true;
      this.animatingPayloadUpdatedAt = Number(Table.updated_at) || 0;
      try {
        await this.AnimateCollectDealtCards();
      } finally {
        this.isAnimatingPayload = false;
        this.animatingPayloadUpdatedAt = 0;
      }
      this.ApplyPayloadSnapshot(Payload);
      await this.FlushQueuedAnimationPayload(Animate, Source);
      return true;
    }
    if (Animate && this.ShouldAnimateOpeningDeal(Table)) {
      this.isAnimatingPayload = true;
      this.animatingPayloadUpdatedAt = Number(Table.updated_at) || 0;
      this.animatingRoundId = Table.round_id;
      this.animatedRoundIds.add(Table.round_id);
      try {
        await this.AnimateOpeningDeal(Payload);
      } finally {
        this.animatingRoundId = "";
        this.isAnimatingPayload = false;
        this.animatingPayloadUpdatedAt = 0;
      }
      this.ApplyPayloadSnapshot(Payload);
      await this.FlushQueuedAnimationPayload(Animate, Source);
      return true;
    }
    if (Animate && this.ShouldAnimateCardChanges(Table)) {
      this.isAnimatingPayload = true;
      this.animatingPayloadUpdatedAt = Number(Table.updated_at) || 0;
      try {
        await this.AnimateCardChanges(Payload);
      } finally {
        this.isAnimatingPayload = false;
        this.animatingPayloadUpdatedAt = 0;
      }
      this.ApplyPayloadSnapshot(Payload);
      await this.FlushQueuedAnimationPayload(Animate, Source);
      return true;
    }
    this.ApplyPayloadSnapshot(Payload);
    return true;
  }
  QueueAnimationPayload(Payload) {
    const NextUpdatedAt = Number(Payload?.table_state?.updated_at) || 0;
    const ActiveUpdatedAt = Number(this.animatingPayloadUpdatedAt) || 0;
    const QueuedUpdatedAt = Number(this.queuedAnimationPayload?.table_state?.updated_at) || 0;
    if (NextUpdatedAt < ActiveUpdatedAt) {
      return;
    }
    if (!this.queuedAnimationPayload || NextUpdatedAt >= QueuedUpdatedAt) {
      this.queuedAnimationPayload = Payload;
    }
  }
  async FlushQueuedAnimationPayload(Animate = true, Source = "poll") {
    const QueuedPayload = this.queuedAnimationPayload;
    this.queuedAnimationPayload = null;
    if (QueuedPayload) {
      return this.ApplyPayload(QueuedPayload, {
        animate: Animate,
        source: Source
      });
    }
    return false;
  }
  async FlushDeferredPollPayload() {
    if (this.pendingOptimisticChipActions > 0 || !this.deferredPollPayload) {
      return false;
    }
    const DeferredPayload = this.deferredPollPayload;
    this.deferredPollPayload = null;
    return this.ApplyPayload(DeferredPayload, {
      animate: true,
      source: "poll"
    });
  }
  HasRenderedCards() {
    return Boolean(this.state.hands.some(Hand => Hand.cards.length > 0) || this.state.dealer.cards.length > 0 || this.state.dealer.holeCard);
  }
  TableHasCards(Table) {
    return Boolean((Table.hands || []).some(Hand => Array.isArray(Hand.cards) && Hand.cards.length > 0) || (Table.dealer?.cards || []).length > 0 || Table.dealer?.holeCard);
  }
  AnimateRenderedPlayerCardMove(HandId, CardIndex, FromRect, Duration = 420) {
    const Node = this.renderer.elements?.stage?.querySelector(`.PlayingCard[data-owner="player"][data-hand-id="${HandId}"][data-card-index="${CardIndex}"]`);
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
  FindSplitAnimationTransition(NextHands) {
    if (!Array.isArray(NextHands) || NextHands.length !== this.state.hands.length + 1) {
      return null;
    }
    const SeatIds = new Set([...this.state.hands.map(Hand => Hand.seatId), ...NextHands.map(Hand => Hand.seatId)]);
    let Transition = null;
    for (const SeatId of SeatIds) {
      const CurrentSeatHands = GetSortedSeatHands(this.state.hands, SeatId);
      const NextSeatHands = GetSortedSeatHands(NextHands, SeatId);
      if (CurrentSeatHands.length === NextSeatHands.length) {
        continue;
      }
      if (Transition || CurrentSeatHands.length !== 1 || NextSeatHands.length !== 2) {
        return null;
      }
      const OriginalHand = CurrentSeatHands[0];
      if (!OriginalHand || (OriginalHand.cards?.length || 0) !== 2) {
        return null;
      }
      Transition = {
        seatId: SeatId,
        originalHand: OriginalHand,
        nextSeatHands: NextSeatHands,
        nextSeatHandsInOrder: NextHands.filter(Hand => Hand.seatId === SeatId)
      };
    }
    return Transition;
  }
  ShouldAnimateCardChanges(NextTable) {
    if (!NextTable?.round_id || this.tableState?.round_id !== NextTable.round_id) {
      return false;
    }
    const NextHands = Array.isArray(NextTable.hands) ? NextTable.hands.map(NormalizeHand) : [];
    const SplitTransition = this.FindSplitAnimationTransition(NextHands);
    const HasPlayerCardChanges = NextHands.some(NextHand => {
      const CurrentHand = this.state.hands.find(Hand => Hand.id === NextHand.id);
      return CurrentHand && NextHand.cards.length > CurrentHand.cards.length;
    });
    const NextDealer = NormalizeDealer(NextTable.dealer);
    const DealerCardCount = this.state.dealer.cards.length + (this.state.dealer.holeCard ? 1 : 0);
    const NextDealerCardCount = NextDealer.cards.length + (NextDealer.holeCard ? 1 : 0);
    const HasDealerReveal = Boolean(this.state.dealer.holeCard && !this.state.dealer.isHoleRevealed && NextDealer.cards.length > this.state.dealer.cards.length);
    return Boolean(SplitTransition) || HasPlayerCardChanges || HasDealerReveal || NextDealerCardCount > DealerCardCount;
  }
  ShouldAnimateCollect(NextTable) {
    return Boolean(this.state.roundState === ROUND_STATES.SETTLING && this.HasRenderedCards() && !this.TableHasCards(NextTable) && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(NextTable?.round_state));
  }
  PlayPayloadOutcomeSounds(Table, Hands, SeatSideBets, SelfSeatIds) {
    if (!this.hasAppliedPayloadSnapshot) {
      return;
    }
    const RoundId = Table.round_id || "round";
    let ShouldPlayBust = false;
    let ShouldPlayWin = false;
    Hands.forEach(Hand => {
      if (Hand.bust) {
        const BustSignature = `${RoundId}:${Hand.id}:bust`;
        if (!this.playedBustSoundSignatures.has(BustSignature)) {
          this.playedBustSoundSignatures.add(BustSignature);
          ShouldPlayBust = true;
        }
      }
      if (Hand.isSelf && Hand.result === "win") {
        const WinSignature = `${RoundId}:${Hand.id}:${Hand.result}`;
        if (!this.playedWinSoundSignatures.has(WinSignature)) {
          this.playedWinSoundSignatures.add(WinSignature);
          ShouldPlayWin = true;
        }
      }
    });
    if (ShouldPlayBust) {
      PlayBlackjackSound("bust");
    }
    if (ShouldPlayWin) {
      PlayBlackjackSound("win");
    }
  }
  ApplyPayloadSnapshot(Payload) {
    const Table = Payload.table_state || {};
    const PayloadUpdatedAt = GetPayloadUpdatedAt(Payload);
    const ConfirmedSelfSeatIds = Array.isArray(Payload.self_seat_ids) ? Payload.self_seat_ids : [];
    const InsuranceOfferSeatIds = Array.isArray(Table.insurance_offer_seat_ids) ? Table.insurance_offer_seat_ids.filter(SeatId => ConfirmedSelfSeatIds.includes(SeatId)) : [];
    const NextHands = Array.isArray(Table.hands) ? Table.hands.map(NormalizeHand) : [];
    const NextSeatSideBets = NormalizeSeatSideBets(Table.seat_side_bets);
    let ActiveSeatId = Table.active_seat_id || this.state.activeSeatId;
    const ExternalSeatClaims = {};
    (Payload.seat_claims || []).forEach(Claim => {
      const SeatId = Claim?.seat_id || Claim?.seatId;
      if (!SeatId || Claim?.is_self) {
        return;
      }
      ExternalSeatClaims[SeatId] = {
        displayName: Claim?.user?.display_name || Claim?.user?.username || "Player",
        userId: Claim?.user?.id || ""
      };
    });
    ConfirmedSelfSeatIds.forEach(SeatId => {
      if (this.optimisticSeatClaimIds.has(SeatId)) {
        this.optimisticSeatClaimUpdatedAts.set(SeatId, PayloadUpdatedAt || this.lastAppliedPayloadUpdatedAt || 0);
      }
    });
    Object.keys(ExternalSeatClaims).forEach(SeatId => this.ForgetLocalSeatClaim(SeatId, {
      render: false
    }));
    Array.from(this.optimisticSeatClaimIds).forEach(SeatId => {
      if (ConfirmedSelfSeatIds.includes(SeatId) || ExternalSeatClaims[SeatId]) {
        return;
      }
      const ClaimUpdatedAt = this.optimisticSeatClaimUpdatedAts.get(SeatId);
      if (Number.isFinite(ClaimUpdatedAt) && PayloadUpdatedAt > 0 && PayloadUpdatedAt >= ClaimUpdatedAt) {
        this.ForgetLocalSeatClaim(SeatId, {
          render: false
        });
      }
    });
    const SelfSeatIds = Array.from(new Set([
      ...ConfirmedSelfSeatIds,
      ...Array.from(this.optimisticSeatClaimIds).filter(SeatId => !ExternalSeatClaims[SeatId])
    ]));
    this.tableState = Table;
    this.seatClaims = Payload.seat_claims || [];
    this.state.roundState = Table.round_state || ROUND_STATES.WAITING;
    this.state.shoe = Table.shoe || {
      deckId: "",
      isReady: false,
      remaining: 0
    };
    this.state.dealer = NormalizeDealer(Table.dealer);
    this.state.hands = NextHands;
    this.state.activeHandIndex = Number(Table.active_hand_index) || 0;
    this.state.selectedSeatIds = SelfSeatIds;
    if (Table.round_state === ROUND_STATES.INSURANCE && InsuranceOfferSeatIds.length && !InsuranceOfferSeatIds.includes(ActiveSeatId)) {
      ActiveSeatId = InsuranceOfferSeatIds[0];
    }
    this.state.activeSeatId = SelfSeatIds.includes(ActiveSeatId) ? ActiveSeatId : SelfSeatIds[0] || "";
    this.state.externalSeatClaims = ExternalSeatClaims;
    this.state.balance = GetInitialBalanceAmount(Payload);
    this.state.pendingBets = NormalizeSeatAmounts(Table.pending_bets);
    this.state.pendingSideBets = NormalizePendingSideBets(Table.pending_side_bets);
    this.state.pendingBetChips = (Table.pending_bet_chips || []).filter(Chip => Chip.isSelf).map(Chip => ({
      betType: Chip.betType || BET_TYPES.MAIN,
      seatId: Chip.seatId,
      value: Number(Chip.value) || 0
    }));
    this.state.seatSideBets = NextSeatSideBets;
    this.state.insuranceOfferSeatIds = InsuranceOfferSeatIds;
    this.state.lockedInputs = false;
    this.state.isAnimating = false;
    this.SyncCountdownState();
    this.SyncTurnCountdownState();
    this.state.message = this.localMessage || Table.message || "";
    this.PlayPayloadOutcomeSounds(Table, NextHands, NextSeatSideBets, SelfSeatIds);
    this.hasAppliedPayloadSnapshot = true;
    if (PayloadUpdatedAt > 0) {
      this.lastAppliedPayloadUpdatedAt = Math.max(this.lastAppliedPayloadUpdatedAt, PayloadUpdatedAt);
    }
    this.Render();
    this.localMessage = "";
  }
  SyncCountdownState() {
    const EndsAtSeconds = Number(this.tableState?.betting_ends_at) || 0;
    const HasCountdown = [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState) && EndsAtSeconds > 0;
    if (!HasCountdown) {
      this.state.countdownDeadline = null;
      this.state.countdownSeconds = 0;
      return;
    }
    this.state.countdownDeadline = EndsAtSeconds * 1000;
    this.state.countdownSeconds = Math.max(Math.ceil((this.state.countdownDeadline - Date.now()) / 1000), 0);
  }
  SyncTurnCountdownState() {
    const EndsAtSeconds = Number(this.tableState?.turn_ends_at) || 0;
    const ActiveHand = GetActiveHand(this.state);
    const HasCountdown = this.state.roundState === ROUND_STATES.PLAYER_TURN && Boolean(ActiveHand?.isSelf) && EndsAtSeconds > 0;
    if (!HasCountdown) {
      this.state.turnCountdownDeadline = null;
      this.state.turnCountdownSeconds = 0;
      return;
    }
    this.state.turnCountdownDeadline = EndsAtSeconds * 1000;
    this.state.turnCountdownSeconds = Math.max(Math.ceil((this.state.turnCountdownDeadline - Date.now()) / 1000), 0);
  }
  TickCountdown() {
    let Changed = false;
    let Expired = false;

    if (this.state.countdownDeadline && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      const PreviousSeconds = this.state.countdownSeconds;
      const NextSeconds = Math.max(Math.ceil((this.state.countdownDeadline - Date.now()) / 1000), 0);
      Changed = Changed || NextSeconds !== PreviousSeconds;
      Expired = Expired || PreviousSeconds > 0 && NextSeconds === 0;
      this.state.countdownSeconds = NextSeconds;
    }

    if (this.state.turnCountdownDeadline && this.state.roundState === ROUND_STATES.PLAYER_TURN) {
      const PreviousTurnSeconds = this.state.turnCountdownSeconds;
      const NextTurnSeconds = Math.max(Math.ceil((this.state.turnCountdownDeadline - Date.now()) / 1000), 0);
      Changed = Changed || NextTurnSeconds !== PreviousTurnSeconds;
      Expired = Expired || PreviousTurnSeconds > 0 && NextTurnSeconds === 0;
      this.state.turnCountdownSeconds = NextTurnSeconds;
    }

    return {
      changed: Changed,
      expired: Expired
    };
  }
  GetCountdownLabel() {
    if (!this.state.countdownDeadline || ![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      return "";
    }
    return `${Math.max(this.state.countdownSeconds, 0)}s`;
  }
  GetTurnCountdownLabel() {
    const ActiveHand = GetActiveHand(this.state);
    if (!this.state.turnCountdownDeadline || this.state.roundState !== ROUND_STATES.PLAYER_TURN || !ActiveHand?.isSelf) {
      return "";
    }
    return `${Math.max(this.state.turnCountdownSeconds, 0)}s`;
  }
  async AnimateOpeningDeal(Payload) {
    if (!this.animator || !this.renderer?.GetProjectedCardRect) {
      return;
    }
    const WorkingPayload = ClonePayloadForOpeningAnimation(Payload);
    const Table = Payload.table_state || {};
    const WorkingTable = WorkingPayload.table_state || {};
    const Hands = Array.isArray(Table.hands) ? Table.hands.map(NormalizeHand) : [];
    const Dealer = NormalizeDealer(Table.dealer);
    const DealerUpcard = Dealer.cards[0] || null;
    const DealerHoleCard = !Dealer.isHoleRevealed ? Dealer.holeCard : null;
    const DealerExtraVisibleCards = Dealer.cards.slice(1);
    const DealerDisplayCount = Dealer.cards.length + (Dealer.holeCard ? 1 : 0);
    const SourceRect = this.renderer.GetShoePacketRect();
    this.ApplyPayloadSnapshot(WorkingPayload);
    const RevealPlayerCard = (HandId, CardIndex, Card) => {
      const Hand = (WorkingTable.hands || []).find(Candidate => Candidate.id === HandId);
      if (!Hand) {
        return;
      }
      Hand.cards = Array.isArray(Hand.cards) ? Hand.cards : [];
      Hand.cards[CardIndex] = Card;
      this.ApplyPayloadSnapshot(WorkingPayload);
    };
    const SetDealerOpeningPlaceholder = () => {
      WorkingTable.dealer = WorkingTable.dealer || {
        cards: [],
        holeCard: null,
        isHoleRevealed: false
      };
      WorkingTable.dealer.cards = Array.isArray(WorkingTable.dealer.cards) ? WorkingTable.dealer.cards : [];
      WorkingTable.dealer.cards[0] = {
        isFaceDown: true
      };
      WorkingTable.dealer.holeCard = null;
      WorkingTable.dealer.isHoleRevealed = false;
      this.ApplyPayloadSnapshot(WorkingPayload);
    };
    const SetDealerUpcard = Card => {
      WorkingTable.dealer = WorkingTable.dealer || {
        cards: [],
        holeCard: null,
        isHoleRevealed: false
      };
      WorkingTable.dealer.cards = Array.isArray(WorkingTable.dealer.cards) ? WorkingTable.dealer.cards : [];
      WorkingTable.dealer.cards[0] = Card;
      WorkingTable.dealer.holeCard = null;
      WorkingTable.dealer.isHoleRevealed = false;
      this.ApplyPayloadSnapshot(WorkingPayload);
    };
    const SetDealerHoleCard = Card => {
      WorkingTable.dealer = WorkingTable.dealer || {
        cards: [],
        holeCard: null,
        isHoleRevealed: false
      };
      WorkingTable.dealer.cards = Array.isArray(WorkingTable.dealer.cards) ? WorkingTable.dealer.cards : [];
      WorkingTable.dealer.holeCard = Card;
      WorkingTable.dealer.isHoleRevealed = false;
      this.ApplyPayloadSnapshot(WorkingPayload);
    };
    const AppendDealerVisibleCard = Card => {
      WorkingTable.dealer = WorkingTable.dealer || {
        cards: [],
        holeCard: null,
        isHoleRevealed: false
      };
      WorkingTable.dealer.cards = Array.isArray(WorkingTable.dealer.cards) ? WorkingTable.dealer.cards : [];
      WorkingTable.dealer.cards.push(Card);
      WorkingTable.dealer.isHoleRevealed = !WorkingTable.dealer.holeCard;
      this.ApplyPayloadSnapshot(WorkingPayload);
    };
    for (const Hand of Hands) {
      const Card = Hand.cards[0];
      if (!Card) {
        continue;
      }
      const SeatHands = GetSortedSeatHands(Hands, Hand.seatId);
      const HandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "player",
        seatId: Hand.seatId,
        handIndex: Math.max(HandIndex, 0),
        handCount: SeatHands.length,
        cardIndex: 0,
        cardCount: Math.max(Hand.cards.length, 1)
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: Card,
        faceUp: true,
        targetRotation: TargetRect.rotation
      });
      RevealPlayerCard(Hand.id, 0, Card);
    }
    if (DealerUpcard) {
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: 0,
        cardCount: Math.max(DealerDisplayCount, 1)
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: DealerUpcard,
        faceUp: false,
        targetRotation: TargetRect.rotation
      });
      SetDealerOpeningPlaceholder();
    }
    for (const Hand of Hands) {
      const Card = Hand.cards[1];
      if (!Card) {
        continue;
      }
      const SeatHands = GetSortedSeatHands(Hands, Hand.seatId);
      const HandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "player",
        seatId: Hand.seatId,
        handIndex: Math.max(HandIndex, 0),
        handCount: SeatHands.length,
        cardIndex: 1,
        cardCount: Math.max(Hand.cards.length, 2)
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: Card,
        faceUp: true,
        targetRotation: TargetRect.rotation
      });
      RevealPlayerCard(Hand.id, 1, Card);
    }
    if (DealerUpcard) {
      const RevealIndex = 0;
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: RevealIndex,
        cardCount: Math.max(DealerDisplayCount, 1)
      });
      const RevealNode = this.renderer.elements?.stage?.querySelector(`.PlayingCard[data-owner="dealer"][data-card-index="${RevealIndex}"]`);
      let RevealCompleted = false;
      if (RevealNode) {
        RevealNode.style.visibility = "hidden";
      }
      try {
        PlayBlackjackSound("dealerRevealCard");
        await this.animator.AnimateReveal({
          targetRect: TargetRect,
          card: DealerUpcard,
          targetRotation: TargetRect.rotation
        });
        RevealCompleted = true;
      } finally {
        if (!RevealCompleted && RevealNode?.isConnected) {
          RevealNode.style.visibility = "";
        }
      }
      SetDealerUpcard(DealerUpcard);
    }
    if (DealerHoleCard) {
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: 1,
        cardCount: Math.max(DealerDisplayCount, 2)
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: DealerHoleCard,
        faceUp: false,
        targetRotation: TargetRect.rotation
      });
      SetDealerHoleCard(DealerHoleCard);
    }
    for (let Index = 0; Index < DealerExtraVisibleCards.length; Index += 1) {
      const Card = DealerExtraVisibleCards[Index];
      const CardIndex = Index + 1;
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: CardIndex,
        cardCount: Math.max(DealerDisplayCount, CardIndex + 1)
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: Card,
        faceUp: true,
        targetRotation: TargetRect.rotation
      });
      AppendDealerVisibleCard(Card);
    }
  }
  BuildWorkingCardChangePayload(Payload) {
    const WorkingPayload = ClonePayload(Payload);
    const WorkingTable = WorkingPayload.table_state || {};
    WorkingTable.hands = (WorkingTable.hands || []).map(Hand => {
      const CurrentHand = this.state.hands.find(Candidate => Candidate.id === Hand.id);
      if (!CurrentHand) {
        return Hand;
      }
      return {
        ...Hand,
        blackjack: CurrentHand.blackjack,
        bust: CurrentHand.bust,
        cards: [...CurrentHand.cards],
        result: CurrentHand.result,
        stood: CurrentHand.stood
      };
    });
    WorkingTable.dealer = {
      cards: [...this.state.dealer.cards],
      holeCard: this.state.dealer.holeCard,
      isHoleRevealed: this.state.dealer.isHoleRevealed
    };
    WorkingTable.message = "";
    return WorkingPayload;
  }
  async AnimateSplitTransition({
    workingPayload: WorkingPayload,
    workingTable: WorkingTable,
    nextHands: NextHands,
    splitTransition: SplitTransition,
    sourceRect: SourceRect
  }) {
    const {
      originalHand: OriginalHand,
      nextSeatHands: NextSeatHands,
      nextSeatHandsInOrder: NextSeatHandsInOrder
    } = SplitTransition;
    const [LeftHand, RightHand] = NextSeatHands;
    const OriginalCards = [...OriginalHand.cards];
    const FirstRect = this.renderer.GetRenderedCardRect("player", OriginalHand.id, 0);
    const SecondRect = this.renderer.GetRenderedCardRect("player", OriginalHand.id, 1);
    const SeededCardsByHandId = new Map([[LeftHand?.id, OriginalCards[0]], [RightHand?.id, OriginalCards[1]]]);
    WorkingTable.hands = (WorkingTable.hands || []).map(Hand => {
      const SeededCard = SeededCardsByHandId.get(Hand.id);
      if (!SeededCard) {
        return Hand;
      }
      return {
        ...Hand,
        blackjack: false,
        bust: false,
        cards: [SeededCard],
        result: "",
        stood: false
      };
    });
    const InitialActiveHandId = NextSeatHandsInOrder[0]?.id || RightHand?.id || LeftHand?.id || "";
    const InitialActiveIndex = (WorkingTable.hands || []).findIndex(Hand => Hand.id === InitialActiveHandId);
    if (InitialActiveIndex >= 0) {
      WorkingTable.active_hand_index = InitialActiveIndex;
    }
    this.ApplyPayloadSnapshot(WorkingPayload);
    await Promise.all([this.AnimateRenderedPlayerCardMove(LeftHand?.id, 0, FirstRect), this.AnimateRenderedPlayerCardMove(RightHand?.id, 0, SecondRect)]);
    for (const NextHand of NextSeatHandsInOrder) {
      const WorkingHand = (WorkingTable.hands || []).find(Hand => Hand.id === NextHand.id);
      if (!WorkingHand) {
        continue;
      }
      const ActiveIndex = (WorkingTable.hands || []).findIndex(Hand => Hand.id === NextHand.id);
      if (ActiveIndex >= 0) {
        WorkingTable.active_hand_index = ActiveIndex;
        this.ApplyPayloadSnapshot(WorkingPayload);
      }
      const SeatHands = GetSortedSeatHands(NextHands, NextHand.seatId);
      const HandIndex = SeatHands.findIndex(Candidate => Candidate.id === NextHand.id);
      const StartingCardCount = Array.isArray(WorkingHand.cards) ? WorkingHand.cards.length : 0;
      for (let CardIndex = StartingCardCount; CardIndex < NextHand.cards.length; CardIndex += 1) {
        const Card = NextHand.cards[CardIndex];
        const TargetRect = this.renderer.GetProjectedCardRect({
          owner: "player",
          seatId: NextHand.seatId,
          handIndex: Math.max(HandIndex, 0),
          handCount: SeatHands.length,
          cardIndex: CardIndex,
          cardCount: NextHand.cards.length
        });
        PlayBlackjackSound("dealCard");
        await this.animator.AnimateDeal({
          sourceRect: SourceRect,
          targetRect: TargetRect,
          card: Card,
          faceUp: true,
          targetRotation: TargetRect.rotation
        });
        WorkingHand.cards[CardIndex] = Card;
        WorkingHand.blackjack = NextHand.blackjack;
        WorkingHand.bust = NextHand.bust;
        WorkingHand.result = NextHand.result;
        WorkingHand.stood = NextHand.stood;
        this.ApplyPayloadSnapshot(WorkingPayload);
      }
    }
  }
  async AnimateCardChanges(Payload) {
    if (!this.animator || !this.renderer?.GetProjectedCardRect) {
      return;
    }
    const Table = Payload.table_state || {};
    const WorkingPayload = this.BuildWorkingCardChangePayload(Payload);
    const WorkingTable = WorkingPayload.table_state || {};
    const NextHands = Array.isArray(Table.hands) ? Table.hands.map(NormalizeHand) : [];
    const SourceRect = this.renderer.GetShoePacketRect();
    const SplitTransition = this.FindSplitAnimationTransition(NextHands);
    if (SplitTransition) {
      await this.AnimateSplitTransition({
        workingPayload: WorkingPayload,
        workingTable: WorkingTable,
        nextHands: NextHands,
        splitTransition: SplitTransition,
        sourceRect: SourceRect
      });
    }
    for (const NextHand of NextHands) {
      const WorkingHand = (WorkingTable.hands || []).find(Hand => Hand.id === NextHand.id);
      if (!WorkingHand) {
        continue;
      }
      const SeatHands = GetSortedSeatHands(NextHands, NextHand.seatId);
      const HandIndex = SeatHands.findIndex(Candidate => Candidate.id === NextHand.id);
      const StartingCardCount = Array.isArray(WorkingHand.cards) ? WorkingHand.cards.length : 0;
      for (let CardIndex = StartingCardCount; CardIndex < NextHand.cards.length; CardIndex += 1) {
        const Card = NextHand.cards[CardIndex];
        const TargetRect = this.renderer.GetProjectedCardRect({
          owner: "player",
          seatId: NextHand.seatId,
          handIndex: Math.max(HandIndex, 0),
          handCount: SeatHands.length,
          cardIndex: CardIndex,
          cardCount: NextHand.cards.length
        });
        PlayBlackjackSound("dealCard");
        await this.animator.AnimateDeal({
          sourceRect: SourceRect,
          targetRect: TargetRect,
          card: Card,
          faceUp: true,
          targetRotation: TargetRect.rotation
        });
        WorkingHand.cards[CardIndex] = Card;
        this.ApplyPayloadSnapshot(WorkingPayload);
      }
    }
    const NextDealer = NormalizeDealer(Table.dealer);
    const WorkingDealer = WorkingTable.dealer || {
      cards: [],
      holeCard: null,
      isHoleRevealed: false
    };
    if (WorkingDealer.holeCard && !WorkingDealer.isHoleRevealed && NextDealer.cards.length > WorkingDealer.cards.length) {
      const RevealIndex = WorkingDealer.cards.length;
      const RevealCard = NextDealer.cards[RevealIndex];
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: RevealIndex,
        cardCount: NextDealer.cards.length
      });
      const RevealNode = this.renderer.elements?.stage?.querySelector(`.PlayingCard[data-owner="dealer"][data-card-index="${RevealIndex}"]`);
      let RevealCompleted = false;
      if (RevealNode) {
        RevealNode.style.visibility = "hidden";
      }
      try {
        PlayBlackjackSound("dealerRevealCard");
        await this.animator.AnimateReveal({
          targetRect: TargetRect,
          card: RevealCard,
          targetRotation: TargetRect.rotation
        });
        RevealCompleted = true;
      } finally {
        if (!RevealCompleted && RevealNode?.isConnected) {
          RevealNode.style.visibility = "";
        }
      }
      WorkingDealer.cards[RevealIndex] = RevealCard;
      WorkingDealer.holeCard = null;
      WorkingDealer.isHoleRevealed = true;
      this.ApplyPayloadSnapshot(WorkingPayload);
    }
    for (let CardIndex = WorkingDealer.cards.length; CardIndex < NextDealer.cards.length; CardIndex += 1) {
      const Card = NextDealer.cards[CardIndex];
      const TargetRect = this.renderer.GetProjectedCardRect({
        owner: "dealer",
        cardIndex: CardIndex,
        cardCount: NextDealer.cards.length
      });
      PlayBlackjackSound("dealCard");
      await this.animator.AnimateDeal({
        sourceRect: SourceRect,
        targetRect: TargetRect,
        card: Card,
        faceUp: true,
        targetRotation: TargetRect.rotation
      });
      WorkingDealer.cards[CardIndex] = Card;
      WorkingDealer.isHoleRevealed = true;
      this.ApplyPayloadSnapshot(WorkingPayload);
    }
  }
  async AnimateCollectDealtCards() {
    if (!this.animator || !this.renderer?.GetCollectableCards) {
      return;
    }
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
  }
  GetSelfPendingBet() {
    const LocalPendingBet = (this.state.pendingBetChips || []).reduce((Total, Chip) => Total + (Number(Chip.value) || 0), 0);
    return LocalPendingBet || Number(this.tableState?.self_pending_bet_amount) || 0;
  }
  GetSelfRoundBet(SelfPendingBet = this.GetSelfPendingBet()) {
    return Math.max(Number(SelfPendingBet) || 0, Number(this.tableState?.self_round_bet_amount) || 0);
  }
  CanUseBettingControls() {
    return [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState) && this.state.selectedSeatIds.length > 0;
  }
  GetMainBetLimits() {
    const MinAmount = Number(this.tableState?.main_bet_min_amount);
    const MaxAmount = Number(this.tableState?.main_bet_max_amount);
    return {
      max: Number.isFinite(MaxAmount) && MaxAmount > 0 ? MaxAmount : Number.POSITIVE_INFINITY,
      maxLabel: this.tableState?.main_bet_max_display || "",
      min: Number.isFinite(MinAmount) && MinAmount > 0 ? MinAmount : 1,
      minLabel: this.tableState?.main_bet_min_display || "$1"
    };
  }
  GetSeatMainBet(SeatId) {
    return Number(this.state.pendingBets?.[SeatId]) || 0;
  }
  UserHasMainBetsOnSelectedSeats() {
    const Limits = this.GetMainBetLimits();
    return Boolean(this.state.selectedSeatIds.length) && this.state.selectedSeatIds.every(SeatId => {
      const Amount = this.GetSeatMainBet(SeatId);
      return Amount >= Limits.min && Amount <= Limits.max;
    });
  }
  CanAddMainChip(SeatId, ChipValue) {
    const Limits = this.GetMainBetLimits();
    return this.GetSeatMainBet(SeatId) + (Number(ChipValue) || 0) <= Limits.max;
  }
  CanDoublePendingBet() {
    if (!this.CanUseBettingControls() || this.GetSelfPendingBet() <= 0 || this.GetSelfPendingBet() * 2 > this.state.balance) {
      return false;
    }
    const MainAdditionsBySeat = {};
    (this.state.pendingBetChips || []).forEach(Chip => {
      if (Chip.betType !== BET_TYPES.MAIN) {
        return;
      }
      MainAdditionsBySeat[Chip.seatId] = (MainAdditionsBySeat[Chip.seatId] || 0) + (Number(Chip.value) || 0);
    });
    return Object.entries(MainAdditionsBySeat).every(([SeatId, Addition]) => this.CanAddMainChip(SeatId, Addition));
  }
  GetSeatBetAmounts() {
    const SeatBetAmounts = NormalizeSeatAmounts(this.tableState?.seat_bet_amounts);
    Object.entries(this.state.pendingBets || {}).forEach(([SeatId, Amount]) => {
      const NormalizedAmount = Number(Amount) || 0;
      if (NormalizedAmount > 0) {
        SeatBetAmounts[SeatId] = NormalizedAmount;
      }
    });
    return SeatBetAmounts;
  }
  GetSeatPendingSideBet(SeatId, BetType) {
    return Number(this.state.pendingSideBets?.[SeatId]?.[BetType]) || 0;
  }
  GetSeatResolvedSideBet(SeatId, BetType) {
    return this.state.seatSideBets?.[SeatId]?.[BetType] || null;
  }
  BuildSeatSideBetSpots() {
    return Object.fromEntries(SEAT_POSITIONS.map(Seat => [Seat.id, {
      [BET_TYPES.PERFECT_PAIRS]: this.BuildSeatSideBetSpot(Seat.id, BET_TYPES.PERFECT_PAIRS),
      [BET_TYPES.TWENTY_ONE_PLUS_THREE]: this.BuildSeatSideBetSpot(Seat.id, BET_TYPES.TWENTY_ONE_PLUS_THREE)
    }]));
  }
  BuildSeatSideBetSpot(SeatId, BetType) {
    const ResolvedSideBet = this.GetSeatResolvedSideBet(SeatId, BetType);
    const PendingAmount = this.GetSeatPendingSideBet(SeatId, BetType);
    const ResolvedBetAmount = Number(ResolvedSideBet?.bet) || 0;
    const ResolvedPayout = Number(ResolvedSideBet?.payout) || 0;
    const HasWinningResolvedBet = ResolvedPayout > 0;
    const Amount = HasWinningResolvedBet ? ResolvedBetAmount : PendingAmount || 0;
    const Status = ResolvedSideBet?.status || (PendingAmount > 0 ? "pending" : "idle");
    return {
      amount: Amount,
      betType: BetType,
      label: GetBetTargetLabel(BetType),
      payout: ResolvedPayout,
      payoutLabel: HasWinningResolvedBet ? `+ ${Money(ResolvedPayout)}` : "",
      resultLabel: HasWinningResolvedBet ? ResolvedSideBet?.resultLabel || "" : "",
      status: Status,
      valueLabel: Amount > 0 ? Money(Amount) : ""
    };
  }
  BuildInsuranceDecision() {
    if (this.state.roundState !== ROUND_STATES.INSURANCE) {
      return null;
    }
    const SeatId = this.state.insuranceOfferSeatIds.includes(this.state.activeSeatId) ? this.state.activeSeatId : this.state.insuranceOfferSeatIds[0] || this.state.activeSeatId || "";
    const InsuranceBet = this.GetSeatResolvedSideBet(SeatId, BET_TYPES.INSURANCE);
    if (!SeatId || !InsuranceBet) {
      return {
        acceptDisabled: true,
        acceptLabel: "Insure",
        copy: "Waiting for insurance decisions.",
        declineDisabled: true
      };
    }
    if (InsuranceBet.status === "offered") {
      return {
        acceptDisabled: false,
        acceptLabel: `Insure ${Money(InsuranceBet.maxBet)}`,
        copy: `${GetSeatName(SeatId)} can insure for ${Money(InsuranceBet.maxBet)} against dealer blackjack.`,
        declineDisabled: false
      };
    }
    return {
      acceptDisabled: true,
      acceptLabel: InsuranceBet.bet > 0 ? `Insured ${Money(InsuranceBet.bet)}` : "Insure",
      copy: InsuranceBet.resultLabel ? `${GetSeatName(SeatId)}: ${InsuranceBet.resultLabel}.` : `Waiting on the other insurance decisions.`,
      declineDisabled: true
    };
  }
  GetViewModel() {
    const SelfPendingBet = this.GetSelfPendingBet();
    const SelfRoundBet = this.GetSelfRoundBet(SelfPendingBet);
    const BalanceAfterPending = Math.max(0, this.state.balance - SelfPendingBet);
    const ActiveHand = GetActiveHand(this.state);
    const ActiveHandValue = ActiveHand ? HandValue(ActiveHand.cards).total : 0;
    const ActiveActions = this.tableState?.available_actions || {};
    const CanBet = this.CanUseBettingControls();
    const HasSelfPendingBet = SelfPendingBet > 0;
    const SelfReady = Boolean(this.tableState?.self_ready);
    const SelfCanReady = Boolean(this.tableState?.self_can_ready) || this.UserHasMainBetsOnSelectedSeats();
    const CanRebet = Boolean(this.tableState?.self_can_rebet) && !HasSelfPendingBet;
    const LastBetAmount = Number(this.tableState?.self_last_bet_amount) || 0;
    const CanAct = this.state.roundState === ROUND_STATES.PLAYER_TURN && Boolean(ActiveHand?.isSelf);
    const MainBetLimits = this.GetMainBetLimits();
    const VisibleChips = Object.fromEntries(CHIP_VALUES.map(Value => [Value, Value <= MainBetLimits.max]));
    if (this.state.selectedChipValue && VisibleChips[this.state.selectedChipValue] === false) {
      this.state.selectedChipValue = 0;
    }
    this.SyncSideBetEditorState();
    return {
      balanceLabel: Money(BalanceAfterPending),
      countdownLabel: this.GetCountdownLabel(),
      insuranceDecision: this.BuildInsuranceDecision(),
      pendingBetLabel: Money(SelfRoundBet),
      seatBetAmounts: this.GetSeatBetAmounts(),
      seatSideBetSpots: this.BuildSeatSideBetSpots(),
      selectedChipValue: this.state.selectedChipValue,
      shoeLabel: this.state.shoe?.isReady ? `${this.state.shoe.remaining} cards` : "Offline",
      turnCountdownLabel: this.GetTurnCountdownLabel(),
      sideBetEditor: {
        active: this.IsSideBetEditorActive(),
        applyDisabled: this.sideBetEditor.applyDisabled,
        canEdit: this.canEditSideBetLayout,
        selectedSpotKey: this.sideBetEditor.selectedSpotKey
      },
      showBettingControls: [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState),
      showDecisionPanel: CanAct,
      showInsurancePanel: this.state.roundState === ROUND_STATES.INSURANCE,
      canAdminKickSeats: this.canAdminKickSeats,
      disableSeatSelection: false,
      disableUndoChip: !CanBet || !HasSelfPendingBet,
      disableDoubleBet: !this.CanDoublePendingBet(),
      primaryBetAction: CanRebet ? {
        label: "Rebet",
        tone: "rebet",
        disabled: false,
        ariaLabel: `Restore previous bet of ${Money(LastBetAmount)}`
      } : {
        label: "Ready",
        tone: SelfReady ? "ready" : "deal",
        disabled: !CanBet || !SelfCanReady || SelfReady,
        ariaLabel: SelfReady ? "You are ready for the next blackjack round" : "Ready up for the next blackjack round"
      },
      enabledChips: Object.fromEntries(CHIP_VALUES.map(Value => [Value, VisibleChips[Value] && CanBet && (Value === this.state.selectedChipValue || SelfPendingBet + Value <= this.state.balance)])),
      visibleChips: VisibleChips,
      actions: {
        hit: {
          hidden: false,
          disabled: !CanAct || !ActiveActions.hit || ActiveHandValue >= 21
        },
        stand: {
          hidden: false,
          disabled: !CanAct || !ActiveActions.stand
        },
        double: {
          hidden: !CanAct || !ActiveActions.double,
          disabled: !CanAct || !ActiveActions.double
        },
        split: {
          hidden: !CanAct || !ActiveActions.split,
          disabled: !CanAct || !ActiveActions.split
        }
      },
      externalSeatClaims: this.state.externalSeatClaims || {},
      readySeatIds: Array.isArray(this.tableState?.ready_seat_ids) ? this.tableState.ready_seat_ids : []
    };
  }
  Render() {
    this.renderer.Render(this.state, this.GetViewModel());
  }
  GetCurrentSideBetLayout() {
    return NormalizeSideBets(this.renderer.GetSideBetLayout?.() || []);
  }
  SyncSideBetEditorState() {
    const CurrentLayout = this.GetCurrentSideBetLayout();
    this.sideBetEditor.applyDisabled = this.sideBetEditor.isSaving || SameSideBetLayout(CurrentLayout, this.sideBetEditor.savedLayout);
    if (this.sideBetEditor.active && !this.sideBetEditor.selectedSpotKey && CurrentLayout.length) {
      const [FirstSpot] = CurrentLayout;
      this.sideBetEditor.selectedSpotKey = SideBetKey(FirstSpot.seatId, FirstSpot.betType);
    }
  }
  IsSideBetEditorActive() {
    return this.canEditSideBetLayout && this.sideBetEditor.active;
  }
  ToggleSideBetEditor() {
    if (!this.canEditSideBetLayout) {
      return;
    }
    this.sideBetEditor.active = !this.sideBetEditor.active;
    if (!this.sideBetEditor.active) {
      this.sideBetEditor.selectedSpotKey = "";
    }
    this.SyncSideBetEditorState();
    this.Render();
  }
  SelectSideBetEditorSpot(SeatId, BetType) {
    if (!this.canEditSideBetLayout) {
      return;
    }
    this.sideBetEditor.active = true;
    this.sideBetEditor.selectedSpotKey = SideBetKey(SeatId, BetType);
    this.SyncSideBetEditorState();
    this.Render();
  }
  UpdateSideBetEditorSpotPosition(SeatId, BetType, X, Y) {
    if (!this.canEditSideBetLayout) {
      return;
    }
    const ClampedX = Math.max(0, Math.min(100, Number(X) || 0));
    const ClampedY = Math.max(0, Math.min(100, Number(Y) || 0));
    const NextLayout = this.GetCurrentSideBetLayout().map(Spot => Spot.seatId === SeatId && Spot.betType === BetType ? {
      ...Spot,
      x: ClampedX,
      y: ClampedY
    } : Spot);
    this.renderer.SetSideBetLayout(NextLayout);
    this.sideBetEditor.selectedSpotKey = SideBetKey(SeatId, BetType);
    this.SyncSideBetEditorState();
    this.Render();
  }
  async ApplySideBetEditorLayout() {
    if (!this.canEditSideBetLayout || this.sideBetEditor.isSaving || this.sideBetEditor.applyDisabled) {
      return;
    }
    this.sideBetEditor.isSaving = true;
    this.SyncSideBetEditorState();
    this.Render();
    try {
      const SavedLayout = await SaveSideBets(this.GetCurrentSideBetLayout());
      this.renderer.SetSideBetLayout(SavedLayout);
      this.sideBetEditor.savedLayout = NormalizeSideBets(SavedLayout);
      this.sideBetEditor.applyDisabled = true;
      this.SetLocalMessage("Side-bet spot positions updated.");
    } catch (Error) {
      console.error(Error);
      this.SetLocalMessage(Error?.message || "Could not save side-bet spot positions.");
    } finally {
      this.sideBetEditor.isSaving = false;
      this.SyncSideBetEditorState();
      this.Render();
    }
  }
  SetLocalMessage(Message) {
    this.localMessage = Message || "";
    this.state.message = this.localMessage;
    this.Render();
  }
  CreateOptimisticSnapshot() {
    return {
      lastAppliedPayloadUpdatedAt: this.lastAppliedPayloadUpdatedAt,
      localMessage: this.localMessage,
      optimisticSeatClaimIds: Array.from(this.optimisticSeatClaimIds),
      optimisticSeatClaimUpdatedAts: Array.from(this.optimisticSeatClaimUpdatedAts.entries()),
      seatClaims: ClonePayload(this.seatClaims),
      state: ClonePayload(this.state),
      tableState: ClonePayload(this.tableState)
    };
  }
  RestoreOptimisticSnapshot(Snapshot) {
    if (!Snapshot) {
      return false;
    }
    if (this.lastAppliedPayloadUpdatedAt > (Number(Snapshot.lastAppliedPayloadUpdatedAt) || 0)) {
      return false;
    }
    this.localMessage = Snapshot.localMessage || "";
    this.optimisticSeatClaimIds = new Set(Snapshot.optimisticSeatClaimIds || []);
    this.optimisticSeatClaimUpdatedAts = new Map(Snapshot.optimisticSeatClaimUpdatedAts || []);
    this.seatClaims = Snapshot.seatClaims || [];
    this.state = Snapshot.state;
    this.tableState = Snapshot.tableState;
    this.Render();
    return true;
  }
  ApplyLocalSeatClaim(SeatId, { optimistic = true } = {}) {
    if (!SeatId) {
      return false;
    }
    const ExternalSeatClaims = {
      ...(this.state.externalSeatClaims || {})
    };
    delete ExternalSeatClaims[SeatId];
    this.state.externalSeatClaims = ExternalSeatClaims;
    if (optimistic) {
      this.optimisticSeatClaimIds.add(SeatId);
      this.optimisticSeatClaimUpdatedAts.set(SeatId, Number.POSITIVE_INFINITY);
    }
    if (!this.state.selectedSeatIds.includes(SeatId)) {
      this.state.selectedSeatIds = [...this.state.selectedSeatIds, SeatId];
    }
    this.state.activeSeatId = SeatId;
    const LocalClaim = {
      is_self: true,
      seat_id: SeatId,
      user: {
        display_name: "You"
      }
    };
    const ExistingClaimIndex = (this.seatClaims || []).findIndex(Claim => {
      const ClaimSeatId = Claim?.seat_id || Claim?.seatId;
      return ClaimSeatId === SeatId;
    });
    if (ExistingClaimIndex >= 0) {
      this.seatClaims = this.seatClaims.map((Claim, Index) => Index === ExistingClaimIndex ? {
        ...Claim,
        ...LocalClaim
      } : Claim);
    } else {
      this.seatClaims = [...(this.seatClaims || []), LocalClaim];
    }
    this.localMessage = "";
    this.state.message = "";
    this.Render();
    return true;
  }
  ApplySeatClaimsPayload(Payload, { activeSeatId: ActiveSeatId = "" } = {}) {
    if (!Payload) {
      return false;
    }
    const ConfirmedSelfSeatIds = Array.isArray(Payload.self_seat_ids) ? Payload.self_seat_ids : [];
    const ExternalSeatClaims = {};
    (Payload.seat_claims || []).forEach(Claim => {
      const SeatId = Claim?.seat_id || Claim?.seatId;
      if (!SeatId || Claim?.is_self) {
        return;
      }
      ExternalSeatClaims[SeatId] = {
        displayName: Claim?.user?.display_name || Claim?.user?.username || "Player",
        userId: Claim?.user?.id || ""
      };
    });

    const PayloadUpdatedAt = GetPayloadUpdatedAt(Payload) || this.lastAppliedPayloadUpdatedAt || 0;
    ConfirmedSelfSeatIds.forEach(SeatId => {
      if (this.optimisticSeatClaimIds.has(SeatId)) {
        this.optimisticSeatClaimUpdatedAts.set(SeatId, PayloadUpdatedAt);
      }
    });
    Object.keys(ExternalSeatClaims).forEach(SeatId => this.ForgetLocalSeatClaim(SeatId, {
      render: false
    }));

    this.seatClaims = Payload.seat_claims || [];
    this.state.selectedSeatIds = ConfirmedSelfSeatIds;
    if (ActiveSeatId && ConfirmedSelfSeatIds.includes(ActiveSeatId)) {
      this.state.activeSeatId = ActiveSeatId;
    } else if (!ConfirmedSelfSeatIds.includes(this.state.activeSeatId)) {
      this.state.activeSeatId = ConfirmedSelfSeatIds[0] || "";
    }
    this.state.externalSeatClaims = ExternalSeatClaims;
    this.state.balance = GetInitialBalanceAmount(Payload);
    this.localMessage = "";
    this.state.message = "";
    this.Render();
    return true;
  }
  ForgetLocalSeatClaim(SeatId, { render = true } = {}) {
    if (!SeatId) {
      return false;
    }
    this.optimisticSeatClaimIds.delete(SeatId);
    this.optimisticSeatClaimUpdatedAts.delete(SeatId);
    this.state.selectedSeatIds = (this.state.selectedSeatIds || []).filter(SelectedSeatId => SelectedSeatId !== SeatId);
    if (this.state.activeSeatId === SeatId) {
      this.state.activeSeatId = this.state.selectedSeatIds[0] || "";
    }
    this.seatClaims = (this.seatClaims || []).filter(Claim => {
      const ClaimSeatId = Claim?.seat_id || Claim?.seatId;
      return ClaimSeatId !== SeatId || !Claim?.is_self;
    });
    if (render) {
      this.Render();
    }
    return true;
  }
  async ClaimSeat(SeatId) {
    if (!SeatId || this.pendingSeatClaimIds.has(SeatId)) {
      return false;
    }
    const Snapshot = this.CreateOptimisticSnapshot();
    this.ApplyLocalSeatClaim(SeatId);
    this.pendingSeatClaimIds.add(SeatId);
    try {
      const Claimed = await this.PostSeatAction("claim", SeatId, {
        applyPayload: false
      });
      if (!Claimed) {
        const FailureMessage = this.localMessage;
        this.ForgetLocalSeatClaim(SeatId, {
          render: false
        });
        this.RestoreOptimisticSnapshot(Snapshot);
        if (FailureMessage) {
          this.SetLocalMessage(FailureMessage);
        }
        return false;
      }
      this.ApplyLocalSeatClaim(SeatId, {
        optimistic: false
      });
      return true;
    } finally {
      this.pendingSeatClaimIds.delete(SeatId);
    }
  }
  AddChipToLocalState(SeatId, ChipValue, BetType = BET_TYPES.MAIN) {
    const NormalizedChipValue = Number(ChipValue) || 0;
    if (!SeatId || NormalizedChipValue <= 0 || !this.CanUseBettingControls()) {
      return false;
    }
    if (this.GetSelfPendingBet() + NormalizedChipValue > this.state.balance) {
      this.SetLocalMessage(`Not enough balance for another ${Money(NormalizedChipValue)} chip.`);
      return false;
    }
    if (BetType === BET_TYPES.MAIN && !this.CanAddMainChip(SeatId, NormalizedChipValue)) {
      const Limits = this.GetMainBetLimits();
      this.SetLocalMessage(`Main bet cannot be higher than ${Limits.maxLabel || Money(Limits.max)}.`);
      return false;
    }
    this.state.activeSeatId = SeatId;
    this.state.roundState = ROUND_STATES.BETTING;
    this.state.pendingBetChips = [...(this.state.pendingBetChips || []), {
      betType: BetType,
      seatId: SeatId,
      value: NormalizedChipValue
    }];
    if (BetType === BET_TYPES.MAIN) {
      this.state.pendingBets = {
        ...(this.state.pendingBets || {}),
        [SeatId]: (Number(this.state.pendingBets?.[SeatId]) || 0) + NormalizedChipValue
      };
    } else {
      this.state.pendingSideBets = {
        ...(this.state.pendingSideBets || {}),
        [SeatId]: {
          ...(this.state.pendingSideBets?.[SeatId] || {}),
          [BetType]: (Number(this.state.pendingSideBets?.[SeatId]?.[BetType]) || 0) + NormalizedChipValue
        }
      };
    }
    this.tableState = {
      ...(this.tableState || {}),
      round_state: ROUND_STATES.BETTING,
      self_can_ready: this.UserHasMainBetsOnSelectedSeats(),
      self_can_rebet: false,
      self_pending_bet_amount: this.GetSelfPendingBet(),
      self_pending_bet_cents: Math.round(this.GetSelfPendingBet() * 100),
      self_ready: false
    };
    this.localMessage = "";
    this.state.message = "";
    this.Render();
    PlayBlackjackSound("placeChip");
    return true;
  }
  async PostSeatAction(Action, SeatId, Options = {}) {
    if (!this.seatActionUrl) {
      return false;
    }
    try {
      const Response = await fetch(this.seatActionUrl, {
        method: "POST",
        headers: {
          ...GetCsrfHeaders(),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          action: Action,
          seat_id: SeatId
        })
      });
      const Payload = await Response.json().catch(() => ({}));
      if (HandleCanceledSessionPayload(Payload)) {
        return false;
      }
      if (Response.ok && Action === "claim" && !Payload?.self_seat_ids?.includes?.(SeatId)) {
        this.SetLocalMessage(Payload?.error || "Seat update failed.");
        return false;
      }
      if (Response.ok && Action === "claim" && Options.applyPayload === false) {
        this.ApplySeatClaimsPayload(Payload, {
          activeSeatId: SeatId
        });
      } else if (Payload?.table_state) {
        await this.ApplyPayload(Payload, {
          animate: Options.animate !== false,
          source: "action"
        });
      }
      if (!Response.ok) {
        this.SetLocalMessage(Payload?.error || "Seat update failed.");
        return false;
      }
      return true;
    } catch (Error) {
      console.error(Error);
      this.SetLocalMessage("Seat update failed.");
      return false;
    }
  }
  GetSeatClaim(SeatId) {
    return (this.seatClaims || []).find(Claim => {
      const ClaimSeatId = Claim?.seat_id || Claim?.seatId;
      return ClaimSeatId === SeatId;
    }) || null;
  }
  CanAdminKickSeat(SeatId) {
    return Boolean(this.canAdminKickSeats && this.GetSeatClaim(SeatId));
  }
  async KickSeat(SeatId) {
    if (!this.CanAdminKickSeat(SeatId)) {
      return false;
    }
    return this.PostSeatAction("kick", SeatId);
  }
  async PostTableAction(Action, Body = {}, Options = {}) {
    if (!this.actionUrl) {
      return Options.returnDetails ? {
        appliedPayload: false,
        ok: false
      } : false;
    }
    const BuildResult = (Ok, Details = {}) => Options.returnDetails ? {
      appliedPayload: false,
      ...Details,
      ok: Ok
    } : Ok;
    try {
      const Response = await fetch(this.actionUrl, {
        method: "POST",
        headers: {
          ...GetCsrfHeaders(),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          ...Body,
          action: Action
        })
      });
      const Payload = await Response.json().catch(() => ({}));
      if (HandleCanceledSessionPayload(Payload)) {
        return BuildResult(false, {
          appliedPayload: false,
          payload: Payload
        });
      }
      if (Response.ok && typeof Options.beforeApply === "function") {
        try {
          Options.beforeApply(Payload);
        } catch (Error) {
          console.error(Error);
        }
      }
      const Applied = await this.ApplyPayload(Payload, {
        source: "action"
      });
      ApplyParentBalanceDisplay(Payload.current_balance_display);
      if (!Response.ok) {
        this.SetLocalMessage(Payload?.error || "Blackjack action failed.");
        return BuildResult(false, {
          appliedPayload: Applied !== false,
          payload: Payload
        });
      }
      return BuildResult(true, {
        appliedPayload: Applied !== false,
        payload: Payload
      });
    } catch (Error) {
      console.error(Error);
      this.SetLocalMessage("Blackjack action failed.");
      return BuildResult(false, {
        appliedPayload: false,
        error: Error
      });
    }
  }
  async ToggleSeat(SeatId, ClickCount = 1) {
    if (this.pendingSeatClaimIds.has(SeatId)) {
      return;
    }
    const IsSelfSeat = this.state.selectedSeatIds.includes(SeatId);
    const ExternalSeatClaim = this.state.externalSeatClaims?.[SeatId];
    const SelectedChipValue = Number(this.state.selectedChipValue) || 0;
    const IsActiveSeat = this.state.activeSeatId === SeatId;
    if (ExternalSeatClaim) {
      this.SetLocalMessage(`${ExternalSeatClaim.displayName} already took that seat.`);
      return;
    }
    if (!IsSelfSeat) {
      const Claimed = await this.ClaimSeat(SeatId);
      if (Claimed && SelectedChipValue > 0 && this.CanUseBettingControls()) {
        await this.AddChipToSeat(SeatId, SelectedChipValue, BET_TYPES.MAIN);
      }
      return;
    }
    if (SelectedChipValue > 0 && this.CanUseBettingControls()) {
      this.state.activeSeatId = SeatId;
      await this.AddChipToSeat(SeatId, SelectedChipValue, BET_TYPES.MAIN);
      return;
    }
    if (!IsActiveSeat || ClickCount > 1) {
      this.state.activeSeatId = SeatId;
      this.Render();
      return;
    }
    if (![ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      this.Render();
      return;
    }
    const Released = await this.PostSeatAction("release", SeatId);
    if (Released) {
      this.ForgetLocalSeatClaim(SeatId);
    }
  }
  async ToggleSideBetSpot(SeatId, BetType) {
    if (this.pendingSeatClaimIds.has(SeatId)) {
      return;
    }
    if (![BET_TYPES.PERFECT_PAIRS, BET_TYPES.TWENTY_ONE_PLUS_THREE].includes(BetType)) {
      return;
    }
    if (this.IsSideBetEditorActive()) {
      return;
    }
    const IsSelfSeat = this.state.selectedSeatIds.includes(SeatId);
    const ExternalSeatClaim = this.state.externalSeatClaims?.[SeatId];
    const SelectedChipValue = Number(this.state.selectedChipValue) || 0;
    if (ExternalSeatClaim) {
      this.SetLocalMessage(`${ExternalSeatClaim.displayName} already took that seat.`);
      return;
    }
    this.state.activeSeatId = SeatId;
    if (!IsSelfSeat) {
      const Claimed = await this.ClaimSeat(SeatId);
      if (Claimed && SelectedChipValue > 0 && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
        await this.AddChipToSeat(SeatId, SelectedChipValue, BetType);
      }
      return;
    }
    if (SelectedChipValue > 0 && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(this.state.roundState)) {
      await this.AddChipToSeat(SeatId, SelectedChipValue, BetType);
      return;
    }
    this.Render();
  }
  async AddChipToSeat(SeatId, ChipValue, BetType = BET_TYPES.MAIN) {
    if (!this.CanUseBettingControls()) {
      return;
    }
    const Snapshot = this.CreateOptimisticSnapshot();
    if (!this.AddChipToLocalState(SeatId, ChipValue, BetType)) {
      return;
    }
    this.pendingOptimisticChipActions += 1;
    try {
      const Result = await this.PostTableAction("add_chip", {
        bet_type: BetType,
        chip_value_cents: Math.round(ChipValue * 100),
        seat_id: SeatId
      }, {
        returnDetails: true
      });
      if (!Result.ok && !Result.appliedPayload) {
        if (this.RestoreOptimisticSnapshot(Snapshot)) {
          this.SetLocalMessage("Chip was not placed. Try again.");
        }
      }
    } finally {
      this.pendingOptimisticChipActions = Math.max(0, this.pendingOptimisticChipActions - 1);
      if (this.pendingOptimisticChipActions <= 0) {
        await this.FlushDeferredPollPayload();
      }
    }
  }
  SelectChip(Value) {
    const ChipValue = Number(Value) || 0;
    if (ChipValue > this.GetMainBetLimits().max) {
      this.state.selectedChipValue = 0;
      this.Render();
      return;
    }
    this.state.selectedChipValue = this.state.selectedChipValue === ChipValue ? 0 : ChipValue;
    this.Render();
    PlayBlackjackSound("selectChip");
  }
  async UndoChip() {
    await this.PostTableAction("undo_chip", {}, {
      beforeApply: () => PlayBlackjackSound("undoChip")
    });
  }
  async DoublePendingBet() {
    await this.PostTableAction("double_pending", {}, {
      beforeApply: () => PlayBlackjackSound("x2Bet")
    });
  }
  async SubmitInsuranceDecision(AcceptInsurance) {
    if (this.state.roundState !== ROUND_STATES.INSURANCE || !this.state.activeSeatId) {
      return;
    }
    await this.PostTableAction(AcceptInsurance ? "insurance_accept" : "insurance_decline", {
      seat_id: this.state.activeSeatId
    });
  }
  async SubmitPlayerAction(Action) {
    const SoundByAction = {
      double: "double",
      hit: "hit",
      stand: "stand"
    };
    await this.PostTableAction(Action, {}, {
      beforeApply: () => {
        const SoundName = SoundByAction[Action];
        if (SoundName) {
          PlayBlackjackSound(SoundName);
        }
      }
    });
  }
  async OnPrimaryBetAction() {
    if (Boolean(this.tableState?.self_can_rebet) && this.GetSelfPendingBet() <= 0) {
      await this.PostTableAction("rebet", {}, {
        beforeApply: () => PlayBlackjackSound("rebet")
      });
      return;
    }
    await this.PostTableAction("ready");
  }
}
export async function InitializeBlackjackTable({
  root: Root = document
} = {}) {
  const Scope = Root && typeof Root.querySelector === "function" ? Root : document;
  const ScopeDocument = Scope.ownerDocument || document;
  const ScopeWindow = ScopeDocument.defaultView || window;
  if (!Scope.querySelector("[data-blackjack-table-config]") || !Scope.querySelector("#TableStage")) {
    return () => {};
  }
  RegisterBlackjackSounds({
    root: Scope
  });
  const Config = ParseTableConfig(Scope);
  const InitialTableState = Config?.initial_state || {};
  const [InitialHandSlotLayout, InitialSideBetLayout] = await Promise.all([LoadHandSlots(), LoadSideBets()]);
  const Renderer = CreateTableRenderer({
    handSlotLayout: InitialHandSlotLayout,
    sideBetLayout: InitialSideBetLayout,
    root: Scope
  });
  const AnimatorController = new Animator(Renderer.elements.animationLayer);
  const Table = new NetworkBlackjackTable({
    actionUrl: Config?.action_url || "",
    animator: AnimatorController,
    canAdminKickSeats: Boolean(Config?.can_admin_kick_seats),
    canEditSideBetLayout: false,
    initialBalance: GetInitialBalanceAmount(InitialTableState),
    renderer: Renderer,
    seatActionUrl: Config?.seat_action_url || ""
  });
  let LatestTableState = InitialTableState;
  let PollHandle = 0;
  let CountdownHandle = 0;
  let IsDisposed = false;
  let CleanupControls = () => {};
  let ActiveSideBetDrag = null;
  let StageResizeObserver = null;
  let SeatKickMenuSeatId = "";
  let SeatKickMenuCloseHandle = 0;
  const SeatKickMenu = ScopeDocument.createElement("div");
  SeatKickMenu.className = "BlackjackSeatKickMenu IsHidden";
  SeatKickMenu.setAttribute("aria-hidden", "true");
  SeatKickMenu.setAttribute("role", "menu");
  SeatKickMenu.innerHTML = '<button class="BlackjackSeatKickButton" type="button" role="menuitem">Kick</button>';
  ScopeDocument.body.append(SeatKickMenu);
  const SeatKickButton = SeatKickMenu.querySelector(".BlackjackSeatKickButton");
  const CompleteSeatKickMenuClose = () => {
    ScopeWindow.clearTimeout(SeatKickMenuCloseHandle);
    SeatKickMenuCloseHandle = 0;
    SeatKickMenu.classList.remove("IsOpen", "IsClosing");
    SeatKickMenu.classList.add("IsHidden");
  };
  const HideSeatKickMenu = ({ immediate = false } = {}) => {
    SeatKickMenuSeatId = "";
    SeatKickMenu.setAttribute("aria-hidden", "true");
    if (SeatKickMenu.classList.contains("IsHidden")) {
      SeatKickMenu.classList.remove("IsOpen", "IsClosing");
      return;
    }
    SeatKickMenu.classList.remove("IsOpen");
    ScopeWindow.clearTimeout(SeatKickMenuCloseHandle);
    SeatKickMenuCloseHandle = 0;
    if (immediate) {
      CompleteSeatKickMenuClose();
      return;
    }
    SeatKickMenu.classList.add("IsClosing");
    SeatKickMenuCloseHandle = ScopeWindow.setTimeout(CompleteSeatKickMenuClose, 180);
  };
  const ShowSeatKickMenu = (SeatId, Event) => {
    if (!Table.CanAdminKickSeat(SeatId)) {
      return false;
    }
    SeatKickMenuSeatId = SeatId;
    ScopeWindow.clearTimeout(SeatKickMenuCloseHandle);
    SeatKickMenuCloseHandle = 0;
    SeatKickMenu.classList.remove("IsHidden", "IsOpen", "IsClosing");
    SeatKickMenu.setAttribute("aria-hidden", "false");
    const MenuWidth = SeatKickMenu.offsetWidth;
    const MenuHeight = SeatKickMenu.offsetHeight;
    const ViewportWidth = ScopeWindow.innerWidth || ScopeDocument.documentElement.clientWidth || 0;
    const ViewportHeight = ScopeWindow.innerHeight || ScopeDocument.documentElement.clientHeight || 0;
    const Left = Math.min(Math.max(Number(Event?.clientX) || 0, 8), Math.max(ViewportWidth - MenuWidth - 8, 8));
    const Top = Math.min(Math.max(Number(Event?.clientY) || 0, 8), Math.max(ViewportHeight - MenuHeight - 8, 8));
    SeatKickMenu.style.left = `${Left}px`;
    SeatKickMenu.style.top = `${Top}px`;
    SeatKickMenu.classList.add("IsOpen");
    return true;
  };
  SeatKickMenu.addEventListener("animationend", Event => {
    if (Event.target === SeatKickMenu && SeatKickMenu.classList.contains("IsClosing")) {
      CompleteSeatKickMenuClose();
    }
  });
  const HandleDocumentPointerDown = Event => {
    if (SeatKickMenu.classList.contains("IsHidden") || SeatKickMenu.contains(Event.target)) {
      return;
    }
    HideSeatKickMenu();
  };
  const HandleDocumentKeyDown = Event => {
    if (Event.key === "Escape") {
      HideSeatKickMenu();
    }
  };
  SeatKickButton?.addEventListener("click", () => {
    const SeatId = SeatKickMenuSeatId;
    HideSeatKickMenu();
    if (SeatId) {
      void Table.KickSeat(SeatId);
    }
  });
  async function ApplyTableState(Payload, {
    animate: Animate = true,
    source: Source = "poll"
  } = {}) {
    if (!Payload) {
      return false;
    }
    if (HandleCanceledSessionPayload(Payload, ScopeWindow)) {
      return false;
    }
    const Applied = await Table.ApplyPayload(Payload, {
      animate: Animate,
      source: Source
    });
    if (Applied === false) {
      return false;
    }
    LatestTableState = Payload;
    ApplyParentBalanceDisplay(Payload.current_balance_display);
    return true;
  }
  async function FetchTableState(Version = "") {
    if (!Config?.state_url) {
      return null;
    }
    try {
      const RequestUrl = new URL(Config.state_url, ScopeWindow.location.href);
      if (Version) {
        RequestUrl.searchParams.set("version", Version);
      }
      const Response = await fetch(RequestUrl.href, {
        headers: {
          Accept: "application/json"
        }
      });
      if (Response.status === 204) {
        return {
          changed: false
        };
      }
      const Payload = await Response.json().catch(() => ({}));
      if (HandleCanceledSessionPayload(Payload, ScopeWindow)) {
        return {
          changed: false
        };
      }
      if (!Response.ok) {
        return null;
      }
      return {
        changed: true,
        payload: Payload
      };
    } catch (Error) {
      console.error(Error);
      return null;
    }
  }
  function ScheduleStatePoll() {
    if (IsDisposed) {
      return;
    }
    ScopeWindow.clearTimeout(PollHandle);
    PollHandle = ScopeWindow.setTimeout(PollTableState, GetPollDelay(LatestTableState, ScopeDocument));
  }
  async function PollTableState() {
    const Response = await FetchTableState(LatestTableState?.version || "");
    if (IsDisposed) {
      return;
    }
    if (Response?.changed && Response.payload) {
      await ApplyTableState(Response.payload);
    }
    ScheduleStatePoll();
  }
  function HandleCountdownTick() {
    const TickState = Table.TickCountdown();
    if (TickState.changed) {
      Table.Render();
    }
    if (TickState.expired) {
      ScopeWindow.clearTimeout(PollHandle);
      PollHandle = ScopeWindow.setTimeout(PollTableState, 90);
    }
  }
  const HandleVisibilityChange = () => {
    if (ScopeDocument.visibilityState !== "visible") {
      return;
    }
    ScopeWindow.clearTimeout(PollHandle);
    PollHandle = ScopeWindow.setTimeout(PollTableState, 150);
  };
  const Dispose = () => {
    if (IsDisposed) {
      return;
    }
    IsDisposed = true;
    ActiveSideBetDrag = null;
    ScopeWindow.clearTimeout(PollHandle);
    ScopeWindow.clearInterval(CountdownHandle);
    ScopeDocument.removeEventListener("visibilitychange", HandleVisibilityChange);
    ScopeWindow.removeEventListener("pagehide", Dispose);
    ScopeWindow.removeEventListener("resize", HandleStageLayoutChange);
    ScopeWindow.removeEventListener("pointermove", HandleSideBetPointerMove);
    ScopeWindow.removeEventListener("pointerup", HandleSideBetPointerEnd);
    ScopeWindow.removeEventListener("pointercancel", HandleSideBetPointerEnd);
    ScopeDocument.removeEventListener("pointerdown", HandleDocumentPointerDown);
    ScopeDocument.removeEventListener("keydown", HandleDocumentKeyDown);
    Renderer.elements.sideBetSpotLayer?.removeEventListener("pointerdown", HandleSideBetPointerDown);
    Renderer.elements.stage?.removeEventListener("load", HandleStageLayoutChange, true);
    StageResizeObserver?.disconnect();
    StageResizeObserver = null;
    CleanupControls();
    HideSeatKickMenu({
      immediate: true
    });
    SeatKickMenu.remove();
  };
  const HandleStageLayoutChange = () => {
    if (IsDisposed) {
      return;
    }
    Table.Render();
  };
  const HandleSideBetPointerDown = Event => {
    if (!Table.IsSideBetEditorActive() || Event.button !== 0) {
      return;
    }
    const SpotButton = Event.target.closest("[data-bet-spot-seat-id]");
    if (!SpotButton) {
      return;
    }
    const SeatId = SpotButton.dataset.betSpotSeatId || "";
    const BetType = SpotButton.dataset.betType || BET_TYPES.MAIN;
    if (!SeatId) {
      return;
    }
    ActiveSideBetDrag = {
      betType: BetType,
      pointerId: Event.pointerId,
      seatId: SeatId
    };
    Table.SelectSideBetEditorSpot(SeatId, BetType);
    SpotButton.setPointerCapture?.(Event.pointerId);
    Event.preventDefault();
  };
  const HandleSideBetPointerMove = Event => {
    if (!ActiveSideBetDrag || Event.pointerId !== ActiveSideBetDrag.pointerId) {
      return;
    }
    const StageRect = Renderer.GetStageRect();
    if (!StageRect.width || !StageRect.height) {
      return;
    }
    const X = (Event.clientX - StageRect.left) / StageRect.width * 100;
    const Y = (Event.clientY - StageRect.top) / StageRect.height * 100;
    Table.UpdateSideBetEditorSpotPosition(ActiveSideBetDrag.seatId, ActiveSideBetDrag.betType, X, Y);
  };
  const HandleSideBetPointerEnd = Event => {
    if (!ActiveSideBetDrag || Event.pointerId !== ActiveSideBetDrag.pointerId) {
      return;
    }
    ActiveSideBetDrag = null;
  };
  await ApplyTableState(InitialTableState, {
    animate: false
  });
  CleanupControls = BindControls({
    root: Scope,
    isSideBetEditorActive: () => Table.IsSideBetEditorActive(),
    onSeatToggle: (SeatId, ClickCount) => {
      void Table.ToggleSeat(SeatId, ClickCount);
    },
    onSeatContextMenu: (SeatId, Event) => ShowSeatKickMenu(SeatId, Event),
    onSideBetEditorSpot: (SeatId, BetType) => {
      Table.SelectSideBetEditorSpot(SeatId, BetType);
    },
    onSideBetSpot: (SeatId, BetType) => {
      void Table.ToggleSideBetSpot(SeatId, BetType);
    },
    onChipClick: Value => Table.SelectChip(Value),
    onUndoChip: () => {
      void Table.UndoChip();
    },
    onPrimaryBet: () => {
      void Table.OnPrimaryBetAction();
    },
    onDoubleBet: () => {
      void Table.DoublePendingBet();
    },
    onToggleSideBetEditor: () => {
      Table.ToggleSideBetEditor();
    },
    onApplySideBetEditor: () => {
      void Table.ApplySideBetEditorLayout();
    },
    onInsuranceDecision: AcceptInsurance => {
      void Table.SubmitInsuranceDecision(AcceptInsurance);
    },
    onAction: Action => {
      void Table.SubmitPlayerAction(Action);
    }
  });
  Renderer.elements.sideBetSpotLayer?.addEventListener("pointerdown", HandleSideBetPointerDown);
  Renderer.elements.stage?.addEventListener("load", HandleStageLayoutChange, true);
  ScopeWindow.addEventListener("resize", HandleStageLayoutChange);
  if (typeof ScopeWindow.ResizeObserver === "function" && Renderer.elements.stage) {
    StageResizeObserver = new ScopeWindow.ResizeObserver(() => {
      HandleStageLayoutChange();
    });
    StageResizeObserver.observe(Renderer.elements.stage);
  }
  ScopeWindow.addEventListener("pointermove", HandleSideBetPointerMove);
  ScopeWindow.addEventListener("pointerup", HandleSideBetPointerEnd);
  ScopeWindow.addEventListener("pointercancel", HandleSideBetPointerEnd);
  ScopeDocument.addEventListener("pointerdown", HandleDocumentPointerDown);
  ScopeDocument.addEventListener("keydown", HandleDocumentKeyDown);
  ScopeDocument.addEventListener("visibilitychange", HandleVisibilityChange);
  ScopeWindow.addEventListener("pagehide", Dispose);
  CountdownHandle = ScopeWindow.setInterval(HandleCountdownTick, 250);
  ScheduleStatePoll();
  return Dispose;
}
if (!window.GamblingApp?.registerPageInitializer && document.querySelector("[data-blackjack-table-config]")) {
  void InitializeBlackjackTable();
}
/* github-refresh: 2026-05-02T02:31:53Z */
