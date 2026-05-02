import { SIDE_BET_LAYOUT_DEFAULTS } from "./TableConfig.js";
const SIDE_BET_LAYOUT_API = "/api/blackjack-side-bet-layout";
function ToFiniteNumber(Value, Fallback) {
  const Parsed = Number(Value);
  return Number.isFinite(Parsed) ? Parsed : Fallback;
}
export function SideBetKey(SeatId, BetType) {
  return `${SeatId}:${BetType}`;
}
export function CloneSideBets(Layout = SIDE_BET_LAYOUT_DEFAULTS) {
  return Layout.map(Spot => ({
    ...Spot
  }));
}
export function NormalizeSideBets(Layout) {
  const InputByKey = new Map(Array.isArray(Layout) ? Layout.map(Spot => [SideBetKey(Spot?.seatId, Spot?.betType), Spot]) : []);
  return SIDE_BET_LAYOUT_DEFAULTS.map(DefaultSpot => {
    const Source = InputByKey.get(SideBetKey(DefaultSpot.seatId, DefaultSpot.betType)) || DefaultSpot;
    return {
      seatId: DefaultSpot.seatId,
      betType: DefaultSpot.betType,
      label: String(Source.label || DefaultSpot.label),
      x: ToFiniteNumber(Source.x, DefaultSpot.x),
      y: ToFiniteNumber(Source.y, DefaultSpot.y)
    };
  });
}
export function SideBetMap(Layout) {
  return new Map(NormalizeSideBets(Layout).map(Spot => [SideBetKey(Spot.seatId, Spot.betType), Spot]));
}
export function SameSideBetLayout(Left, Right) {
  const NormalizedLeft = NormalizeSideBets(Left);
  const NormalizedRight = NormalizeSideBets(Right);
  return NormalizedLeft.every((Spot, Index) => {
    const Candidate = NormalizedRight[Index];
    return Candidate && Candidate.seatId === Spot.seatId && Candidate.betType === Spot.betType && Candidate.label === Spot.label && Math.abs(Candidate.x - Spot.x) < 0.0001 && Math.abs(Candidate.y - Spot.y) < 0.0001;
  });
}
export async function LoadSideBets() {
  try {
    const Response = await fetch(SIDE_BET_LAYOUT_API, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!Response.ok) {
      throw new Error(`Side-bet layout load failed with status ${Response.status}.`);
    }
    const Payload = await Response.json();
    return NormalizeSideBets(Payload.spots);
  } catch (Error) {
    console.error(Error);
    return CloneSideBets();
  }
}
export async function SaveSideBets(Layout) {
  const NormalizedLayout = NormalizeSideBets(Layout);
  const Response = await fetch(SIDE_BET_LAYOUT_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      spots: NormalizedLayout
    })
  });
  const Payload = await Response.json().catch(() => ({}));
  if (!Response.ok || !Payload.ok) {
    throw new Error(Payload.error || `Side-bet layout save failed with status ${Response.status}.`);
  }
  return NormalizeSideBets(Payload.spots);
}
/* github-refresh: 2026-05-02T02:31:53Z */
