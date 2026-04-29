import { BETTING_COUNTDOWN_SECONDS, DEALER_HITS_SOFT_17, PAYOUT_RULES, ROUND_STATES, STARTING_BALANCE } from "./TableConfig.js";
function CreateId(Prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${Prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${Prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
export function CreateInitialState({
  balance: Balance = STARTING_BALANCE
} = {}) {
  return {
    roundState: ROUND_STATES.WAITING,
    shoe: {
      deckId: "",
      remaining: 0,
      isReady: false
    },
    selectedSeatIds: [],
    activeSeatId: "",
    selectedChipValue: 0,
    balance: Balance,
    pendingBets: {},
    pendingSideBets: {},
    pendingBetChips: [],
    seatSideBets: {},
    insuranceOfferSeatIds: [],
    hands: [],
    dealer: CreateDealerState(),
    countdownSeconds: BETTING_COUNTDOWN_SECONDS,
    countdownDeadline: null,
    turnCountdownSeconds: 0,
    turnCountdownDeadline: null,
    activeHandIndex: 0,
    lockedInputs: false,
    isAnimating: false,
    message: "",
    lastResults: [],
    lastBetSnapshot: null,
    externalSeatClaims: {},
    ruleConfig: {
      dealerHitsSoft17: DEALER_HITS_SOFT_17,
      blackjackBonusMultiplier: PAYOUT_RULES.blackjackBonusMultiplier
    }
  };
}
export function CreateDealerState() {
  return {
    cards: [],
    holeCard: null,
    isHoleRevealed: false
  };
}
export function CreateHand({
  seatId: SeatId,
  bet: Bet,
  cards: Cards = [],
  splitFromPair: SplitFromPair = false,
  seatLayoutIndex: SeatLayoutIndex = 0
}) {
  return {
    id: CreateId("hand"),
    seatId: SeatId,
    cards: [...Cards],
    bet: Bet,
    stood: false,
    bust: false,
    blackjack: false,
    doubled: false,
    splitFromPair: SplitFromPair,
    seatLayoutIndex: SeatLayoutIndex,
    result: "",
    payout: 0
  };
}
