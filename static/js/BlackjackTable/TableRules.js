function GetCardBaseValue(Card) {
  if (!Card) {
    return 0;
  }
  if (Card.value === "ACE") {
    return 11;
  }
  if (["KING", "QUEEN", "JACK"].includes(Card.value)) {
    return 10;
  }
  return Number(Card.value) || 0;
}
export function HandValue(Cards) {
  let Total = 0;
  let Aces = 0;
  Cards.forEach(Card => {
    Total += GetCardBaseValue(Card);
    if (Card.value === "ACE") {
      Aces += 1;
    }
  });
  let SoftAces = Aces;
  while (Total > 21 && SoftAces > 0) {
    Total -= 10;
    SoftAces -= 1;
  }
  return {
    total: Total,
    isSoft: SoftAces > 0,
    isBust: Total > 21
  };
}
export function SoftHand(Cards) {
  return HandValue(Cards).isSoft;
}
export function IsBlackjack(Cards, SplitFromPair = false) {
  return !SplitFromPair && Cards.length === 2 && HandValue(Cards).total === 21;
}
export function CanDouble(Hand, Balance) {
  if (!Hand) {
    return false;
  }
  return Hand.cards.length === 2 && !Hand.bust && !Hand.stood && HandValue(Hand.cards).total < 21 && Balance >= Hand.bet;
}
export function CanSplit(Hand, SeatHands, Balance) {
  if (!Hand) {
    return false;
  }
  return Array.isArray(SeatHands) && SeatHands.length === 1 && Hand.cards.length === 2 && Hand.cards[0]?.value === Hand.cards[1]?.value && Balance >= Hand.bet;
}
export function DealerHits(Cards, DealerHitsSoft17 = false) {
  const HandSummary = HandValue(Cards);
  if (HandSummary.total < 17) {
    return true;
  }
  return HandSummary.total === 17 && HandSummary.isSoft && DealerHitsSoft17;
}
export function SettleHand(Hand, DealerCards, RuleConfig) {
  const PlayerValue = HandValue(Hand.cards);
  const DealerValue = HandValue(DealerCards);
  const DealerBlackjack = IsBlackjack(DealerCards, false);
  if (PlayerValue.isBust) {
    return {
      result: "loss",
      payout: 0
    };
  }
  if (Hand.blackjack) {
    if (DealerBlackjack) {
      return {
        result: "push",
        payout: Hand.bet
      };
    }
    const Bonus = RuleConfig.blackjackBonusMultiplier || 0;
    return {
      result: "blackjack",
      payout: Hand.bet * (2 + Bonus)
    };
  }
  if (DealerValue.isBust) {
    return {
      result: "win",
      payout: Hand.bet * 2
    };
  }
  if (DealerBlackjack && !Hand.blackjack) {
    return {
      result: "loss",
      payout: 0
    };
  }
  if (PlayerValue.total > DealerValue.total) {
    return {
      result: "win",
      payout: Hand.bet * 2
    };
  }
  if (PlayerValue.total < DealerValue.total) {
    return {
      result: "loss",
      payout: 0
    };
  }
  return {
    result: "push",
    payout: Hand.bet
  };
}
export function CardLabel(Card) {
  if (!Card) {
    return "";
  }
  const Value = String(Card.value).toLowerCase().replace(/\b\w/g, Letter => Letter.toUpperCase());
  const Suit = String(Card.suit).toLowerCase().replace(/\b\w/g, Letter => Letter.toUpperCase());
  return `${Value} of ${Suit}`;
}
export function Money(Amount) {
  const NumericAmount = Number(Amount) || 0;
  const HasCents = !Number.isInteger(NumericAmount);
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: HasCents ? 2 : 0,
    style: "currency"
  }).format(NumericAmount);
}
