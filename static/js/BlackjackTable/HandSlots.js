import { PLAYER_HAND_SLOT_BOXES } from "./TableConfig.js";
const HAND_SLOT_LAYOUT_API = "/api/hand-slot-layout";
function ToFiniteNumber(Value, Fallback) {
  const Parsed = Number(Value);
  return Number.isFinite(Parsed) ? Parsed : Fallback;
}
export function CloneHandSlots(Layout = PLAYER_HAND_SLOT_BOXES) {
  return Layout.map(Slot => ({
    ...Slot
  }));
}
export function NormalizeHandSlots(Layout) {
  const InputBySeatId = new Map(Array.isArray(Layout) ? Layout.map(Slot => [Slot?.seatId, Slot]) : []);
  return PLAYER_HAND_SLOT_BOXES.map(DefaultSlot => {
    const Source = InputBySeatId.get(DefaultSlot.seatId) || DefaultSlot;
    return {
      seatId: DefaultSlot.seatId,
      label: String(Source.label || DefaultSlot.label),
      x: ToFiniteNumber(Source.x, DefaultSlot.x),
      y: ToFiniteNumber(Source.y, DefaultSlot.y),
      width: ToFiniteNumber(Source.width, DefaultSlot.width),
      height: ToFiniteNumber(Source.height, DefaultSlot.height),
      rotation: ToFiniteNumber(Source.rotation, DefaultSlot.rotation),
      stackOffsetX: ToFiniteNumber(Source.stackOffsetX, DefaultSlot.stackOffsetX),
      stackOffsetY: ToFiniteNumber(Source.stackOffsetY, DefaultSlot.stackOffsetY)
    };
  });
}
export async function LoadHandSlots() {
  try {
    const Response = await fetch(HAND_SLOT_LAYOUT_API, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!Response.ok) {
      throw new Error(`Hand-slot load failed with status ${Response.status}.`);
    }
    const Payload = await Response.json();
    return NormalizeHandSlots(Payload.slots);
  } catch (Error) {
    console.error(Error);
    return CloneHandSlots();
  }
}
export async function SaveHandSlots(Layout) {
  const NormalizedLayout = NormalizeHandSlots(Layout);
  const Response = await fetch(HAND_SLOT_LAYOUT_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      slots: NormalizedLayout
    })
  });
  const Payload = await Response.json().catch(() => ({}));
  if (!Response.ok || !Payload.ok) {
    throw new Error(Payload.error || `Hand-slot save failed with status ${Response.status}.`);
  }
  return NormalizeHandSlots(Payload.slots);
}
/* github-refresh: 2026-05-02T02:31:53Z */
