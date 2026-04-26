export const API_ROOT = "https://deckofcardsapi.com/api/deck";
export const CARD_BACK_IMAGE = "https://deckofcardsapi.com/static/img/back.png";
export const ROUND_STATES = Object.freeze({
  WAITING: "waiting",
  BETTING: "betting",
  DEALING: "dealing",
  INSURANCE: "insurance",
  PLAYER_TURN: "player_turn",
  DEALER_TURN: "dealer_turn",
  SETTLING: "settling"
});
export const ROUND_STATE_LABELS = Object.freeze({
  [ROUND_STATES.WAITING]: "Waiting",
  [ROUND_STATES.BETTING]: "Betting",
  [ROUND_STATES.DEALING]: "Dealing",
  [ROUND_STATES.INSURANCE]: "Insurance",
  [ROUND_STATES.PLAYER_TURN]: "Player Turn",
  [ROUND_STATES.DEALER_TURN]: "Dealer Turn",
  [ROUND_STATES.SETTLING]: "Settling"
});
export const STARTING_BALANCE = 1000;
export const CHIP_VALUES = [1, 2, 5, 25, 100, 1000, 5000, 10000, 25000, 50000, 100000];
export const CHIP_STYLES = Object.freeze({
  1: "#8b8b8b",
  2: "#ef89d8",
  5: "#eb5428",
  25: "#29b44b",
  100: "#2f2f2f",
  1000: "#6d45a7",
  5000: "#8b1747",
  10000: "#087b50",
  25000: "#c81fa3",
  50000: "#601827",
  100000: "#c39a42"
});
export const SHOE_COUNT = 6;
export const RESHUFFLE_THRESHOLD = 20;
export const BETTING_COUNTDOWN_SECONDS = 30;
export const DEALER_HITS_SOFT_17 = false;
export const SETTLE_DISPLAY_MS = 3200;
export const BETWEEN_DEALS_MS = 140;
export const COLLECT_CARDS_DURATION_MS = 520;
export const COLLECT_CARDS_STAGGER_MS = 36;
export const DEALER_LAYOUT = Object.freeze({
  x: "50%",
  y: "27.5%"
});
export const SEAT_POSITIONS = [{
  id: "seat-1",
  name: "Seat 1",
  label: "1",
  x: "22%",
  y: "58%"
}, {
  id: "seat-2",
  name: "Seat 2",
  label: "2",
  x: "35%",
  y: "67%"
}, {
  id: "seat-3",
  name: "Seat 3",
  label: "3",
  x: "50%",
  y: "71%"
}, {
  id: "seat-4",
  name: "Seat 4",
  label: "4",
  x: "65%",
  y: "67%"
}, {
  id: "seat-5",
  name: "Seat 5",
  label: "5",
  x: "78%",
  y: "58%"
}];
export const SIDE_BET_LAYOUT_DEFAULTS = [{
  seatId: "seat-1",
  betType: "perfect_pairs",
  label: "Pairs",
  x: 20.8,
  y: 50.5
}, {
  seatId: "seat-1",
  betType: "twenty_one_plus_three",
  label: "21+3",
  x: 27.6,
  y: 51.4
}, {
  seatId: "seat-2",
  betType: "perfect_pairs",
  label: "Pairs",
  x: 31.8,
  y: 58.4
}, {
  seatId: "seat-2",
  betType: "twenty_one_plus_three",
  label: "21+3",
  x: 38.2,
  y: 59.6
}, {
  seatId: "seat-3",
  betType: "perfect_pairs",
  label: "Pairs",
  x: 44.4,
  y: 63.0
}, {
  seatId: "seat-3",
  betType: "twenty_one_plus_three",
  label: "21+3",
  x: 55.6,
  y: 63.0
}, {
  seatId: "seat-4",
  betType: "perfect_pairs",
  label: "Pairs",
  x: 61.8,
  y: 59.6
}, {
  seatId: "seat-4",
  betType: "twenty_one_plus_three",
  label: "21+3",
  x: 68.2,
  y: 58.4
}, {
  seatId: "seat-5",
  betType: "perfect_pairs",
  label: "Pairs",
  x: 72.4,
  y: 51.4
}, {
  seatId: "seat-5",
  betType: "twenty_one_plus_three",
  label: "21+3",
  x: 79.2,
  y: 50.5
}];

// Base player hand slots plus the default offset used for card 2 within each seat.
export const PLAYER_HAND_SLOT_BOXES = [{
  seatId: "seat-1",
  label: "1",
  x: 25.94344311447605,
  y: 48.24527685899535,
  width: 5.380498820736148,
  height: 10.899759204237975,
  rotation: -140.5413220962389,
  stackOffsetX: 2.85,
  stackOffsetY: 1.17
}, {
  seatId: "seat-2",
  label: "2",
  x: 36.81503263718026,
  y: 56.01494278125324,
  width: 5.589216610287982,
  height: 10.500191135914497,
  rotation: 16.735909525743295,
  stackOffsetX: 2.85,
  stackOffsetY: 1.17
}, {
  seatId: "seat-3",
  label: "3",
  x: 50.01510538461932,
  y: 58.156460771093684,
  width: 5.4054373244229295,
  height: 10.616242023549866,
  rotation: 0,
  stackOffsetX: 2.85,
  stackOffsetY: 1.17
}, {
  seatId: "seat-4",
  label: "4",
  x: 63.046823110419744,
  y: 55.82111137310383,
  width: 5.740785050172186,
  height: 10.532392201254618,
  rotation: -15.686858537936018,
  stackOffsetX: 2.85,
  stackOffsetY: 1.17
}, {
  seatId: "seat-5",
  label: "5",
  x: 74.12033104176368,
  y: 48.366502570701186,
  width: 5.237758344548092,
  height: 10.440505065145112,
  rotation: -39.38405421786581,
  stackOffsetX: 2.85,
  stackOffsetY: 1.17
}];
export const TABLE_LAYOUT = Object.freeze({
  playerHandOffsetPx: 140,
  splitGapPx: 152,
  cardScale: 0.875,
  cardWidthRatio: 0.058,
  cardWidthMin: 56,
  cardWidthMax: 86,
  cardAspectRatio: 1.4
});
export const PAYOUT_RULES = Object.freeze({
  blackjackBonusMultiplier: 0.5
});
export function FindSeat(SeatId) {
  return SEAT_POSITIONS.find(Seat => Seat.id === SeatId) || null;
}
