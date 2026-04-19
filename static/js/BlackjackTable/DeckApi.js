import { API_ROOT, SHOE_COUNT } from "./TableConfig.js";
async function RequestJson(Path) {
  const Response = await fetch(`${API_ROOT}/${Path}`);
  if (!Response.ok) {
    throw new Error(`Deck request failed with status ${Response.status}.`);
  }
  const Payload = await Response.json();
  if (!Payload.success) {
    throw new Error(Payload.error || "Deck request failed.");
  }
  return Payload;
}
export async function CreateShoe() {
  const Payload = await RequestJson(`new/shuffle/?deck_count=${SHOE_COUNT}`);
  return {
    deckId: Payload.deck_id,
    remaining: Payload.remaining
  };
}
export async function DrawCards(DeckId, Count = 1) {
  const Payload = await RequestJson(`${DeckId}/draw/?count=${Count}`);
  return {
    cards: Payload.cards || [],
    remaining: Payload.remaining
  };
}
