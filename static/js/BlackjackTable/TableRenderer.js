import { BETTING_COUNTDOWN_SECONDS, CARD_BACK_IMAGE, CHIP_STYLES, CHIP_VALUES, DEALER_LAYOUT, FindSeat, ROUND_STATES, ROUND_STATE_LABELS, SEAT_POSITIONS, SIDE_BET_LAYOUT_COMPACT_DEFAULTS, TABLE_LAYOUT } from "./TableConfig.js";
import { CloneHandSlots, NormalizeHandSlots } from "./HandSlots.js";
import { SideBetKey, NormalizeSideBets, SideBetMap } from "./SideBets.js";
import { CardLabel, Money, HandTotalLabel } from "./TableRules.js";
const CARD_STACK_STEP_X_RATIO = 0.88;
const BET_TARGET_LABELS = Object.freeze({
  main: "Main",
  perfect_pairs: "Pairs",
  twenty_one_plus_three: "21+3"
});
function Clamp(Value, Min, Max) {
  return Math.min(Math.max(Value, Min), Max);
}
function ParsePercent(Value, Total) {
  return Number.parseFloat(Value) / 100 * Total;
}
function GetDealerStackStep(Metrics) {
  return {
    x: Clamp(Metrics.width * CARD_STACK_STEP_X_RATIO, 36, 44),
    y: -Clamp(Metrics.height * 0.16, 8, 12)
  };
}
function GetRelativeRect(Node, StageRect) {
  const Rect = Node.getBoundingClientRect();
  return {
    left: Rect.left - StageRect.left,
    top: Rect.top - StageRect.top,
    width: Rect.width,
    height: Rect.height
  };
}
function GetDisplayChipValue(Amount) {
  const NormalizedAmount = Math.max(0, Number(Amount) || 0);
  return [...CHIP_VALUES].sort((Left, Right) => Right - Left).find(Value => NormalizedAmount >= Value) || CHIP_VALUES[0];
}
function FormatChipLabel(Value) {
  const NumericValue = Number(Value) || 0;
  if (NumericValue >= 1000) {
    return `$${Number(NumericValue / 1000).toLocaleString("en-US", {
      maximumFractionDigits: NumericValue % 1000 === 0 ? 0 : 1
    })}K`;
  }
  return Money(NumericValue);
}
function CompareSeatHands(Left, Right) {
  return (Left.seatLayoutIndex ?? 0) - (Right.seatLayoutIndex ?? 0);
}
function EscapeHtml(Value) {
  return String(Value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
function GetBetTargetLabel(BetType) {
  return BET_TARGET_LABELS[BetType] || "Main";
}
export function CreateTableRenderer({
  handSlotLayout: HandSlotLayout,
  sideBetLayout: SideBetLayout,
  root: Root = document
} = {}) {
  const Scope = Root && typeof Root.querySelector === "function" ? Root : document;
  const ScopeDocument = Scope.ownerDocument || document;
  const Query = Selector => Scope.querySelector(Selector);
  const Elements = {
    stage: Query("#TableStage"),
    leftPacket: Query("#LeftPacket"),
    shoePacket: Query("#ShoePacket"),
    handSlotLayer: Query("#HandSlotLayer"),
    seatLayer: Query("#SeatLayer"),
    sideBetSpotLayer: Query("#SideBetSpotLayer"),
    seatBetLayer: Query("#SeatBetLayer"),
    dealerHandLayer: Query("#DealerHandLayer"),
    playerHandsLayer: Query("#PlayerHandsLayer"),
    animationLayer: Query("#AnimationLayer"),
    handIndicatorLayer: Query("#HandIndicatorLayer"),
    status: Query("#TableStatus"),
    bettingControls: Query("#BettingControls"),
    decisionPanel: Query("#DecisionPanel"),
    insurancePanel: Query("#InsurancePanel"),
    insuranceCopy: Query("#InsuranceCopy"),
    stateValue: Query("#StateValue"),
    countdownValue: Query("#CountdownValue"),
    balanceValue: Query("#BalanceValue"),
    pendingBetValue: Query("#PendingBetValue"),
    shoeValue: Query("#ShoeValue"),
    messageText: Query("#MessageText"),
    chipTray: Query("#ChipTray"),
    undoChipButton: Query("#UndoChipButton"),
    placeBetButton: Query("#PlaceBetButton"),
    doubleBetButton: Query("#DoubleBetButton"),
    insuranceAccept: Query("#InsuranceAccept"),
    insuranceDecline: Query("#InsuranceDecline"),
    actionHit: Query("#ActionHit"),
    actionStand: Query("#ActionStand"),
    actionDouble: Query("#ActionDouble"),
    actionSplit: Query("#ActionSplit")
  };
  let CurrentHandSlotLayout = NormalizeHandSlots(HandSlotLayout);
  let CurrentSideBetLayout = NormalizeSideBets(SideBetLayout);
  let CurrentSideBetLayoutMap = SideBetMap(CurrentSideBetLayout);
  const CompactSideBetLayoutMap = SideBetMap(SIDE_BET_LAYOUT_COMPACT_DEFAULTS);
  let LastRenderedState = null;
  let LastRenderedView = null;
  ScopeDocument.documentElement.style.setProperty("--CardBackImage", `url("${CARD_BACK_IMAGE}")`);
  function GetCardImageUrl(Card = {}) {
    return Card?.image || Card?.images?.png || Card?.images?.svg || "";
  }
  function GetRenderedDealerCards(State) {
    const DealerCards = [...(State?.dealer?.cards || [])];
    if (State?.dealer?.holeCard && !State.dealer.isHoleRevealed) {
      return [...DealerCards, {
        isFaceDown: true
      }];
    }
    return DealerCards;
  }
  function GetStageRect() {
    return Elements.stage.getBoundingClientRect();
  }
  function GetCardMetrics() {
    const StageRect = GetStageRect();
    const IsCompactTable = StageRect.width <= 760;
    const Width = IsCompactTable ? Clamp(StageRect.width * 0.09, 28, 38) : Clamp(StageRect.width * TABLE_LAYOUT.cardWidthRatio, TABLE_LAYOUT.cardWidthMin, TABLE_LAYOUT.cardWidthMax) * TABLE_LAYOUT.cardScale;
    return {
      width: Width,
      height: Width * TABLE_LAYOUT.cardAspectRatio
    };
  }
  function UsesSharedCardMetrics() {
    return GetStageRect().width <= 760;
  }
  function GetActiveSideBetLayoutMap() {
    return UsesSharedCardMetrics() ? CompactSideBetLayoutMap : CurrentSideBetLayoutMap;
  }
  function GetDealerAnchor() {
    const StageRect = GetStageRect();
    const IsCompactTable = StageRect.width <= 760;
    return {
      x: ParsePercent(DEALER_LAYOUT.x, StageRect.width),
      y: ParsePercent(IsCompactTable ? "31%" : DEALER_LAYOUT.y, StageRect.height)
    };
  }
  function GetPlayerSlot(SeatId) {
    return CurrentHandSlotLayout.find(Slot => Slot.seatId === SeatId) || null;
  }
  function GetPlayerLayout(SeatId, HandIndex = 0, HandCount = 1) {
    const StageRect = GetStageRect();
    const Slot = GetPlayerSlot(SeatId);
    if (Slot) {
      const UseSharedMetrics = UsesSharedCardMetrics();
      const Metrics = UseSharedMetrics ? GetCardMetrics() : {
        width: ParsePercent(Slot.width, StageRect.width) * TABLE_LAYOUT.cardScale,
        height: ParsePercent(Slot.height, StageRect.height) * TABLE_LAYOUT.cardScale
      };
      const CenterOffset = HandCount === 1 ? 0 : HandIndex - (HandCount - 1) / 2;
      const SplitGap = HandCount > 1 ? Math.max(Metrics.width * 1.52, 100) : Math.max(Metrics.width * 0.92, 64);
      const SplitLift = HandCount > 1 ? Math.max(Metrics.height * 0.06, 10) : 0;
      return {
        anchor: {
          x: ParsePercent(Slot.x, StageRect.width) + CenterOffset * SplitGap,
          y: ParsePercent(Slot.y, StageRect.height) - SplitLift
        },
        metrics: Metrics,
        baseRotation: Slot.rotation,
        slot: Slot
      };
    }
    const Seat = FindSeat(SeatId);
    if (!Seat) {
      const FallbackMetrics = GetCardMetrics();
      return {
        anchor: {
          x: StageRect.width / 2,
          y: StageRect.height / 2
        },
        metrics: FallbackMetrics,
        baseRotation: 0,
        slot: null
      };
    }
    const CenterOffset = HandCount === 1 ? 0 : HandIndex - (HandCount - 1) / 2;
    const FallbackMetrics = GetCardMetrics();
    const SplitGap = HandCount > 1 ? Math.max(TABLE_LAYOUT.splitGapPx, FallbackMetrics.width * 1.52, 100) : TABLE_LAYOUT.splitGapPx;
    const SplitLift = HandCount > 1 ? Math.max(FallbackMetrics.height * 0.06, 10) : 0;
    return {
      anchor: {
        x: ParsePercent(Seat.x, StageRect.width) + CenterOffset * SplitGap,
        y: ParsePercent(Seat.y, StageRect.height) - TABLE_LAYOUT.playerHandOffsetPx - SplitLift
      },
      metrics: FallbackMetrics,
      baseRotation: 0,
      slot: null
    };
  }
  function GetPlayerStackStep(Slot, StageRect, Metrics, HandCount = 1) {
    const BaseStep = Slot ? {
      x: ParsePercent(Slot.stackOffsetX, StageRect.width),
      y: ParsePercent(Slot.stackOffsetY, StageRect.height)
    } : {
      x: Clamp(Metrics.width * CARD_STACK_STEP_X_RATIO, 36, 44),
      y: Clamp(Metrics.height * 0.16, 8, 12)
    };
    if (HandCount > 1) {
      return {
        x: Clamp(BaseStep.x * 0.66, 24, 32),
        y: Clamp(BaseStep.y * 0.78, 6, 9)
      };
    }
    return BaseStep;
  }
  function GetSeatAnchor(SeatId) {
    const StageRect = GetStageRect();
    const Seat = FindSeat(SeatId);
    if (!Seat) {
      return null;
    }
    return {
      x: ParsePercent(Seat.x, StageRect.width),
      y: ParsePercent(Seat.y, StageRect.height)
    };
  }
  function GetSeatBetAnchor(SeatId, BetType = "main") {
    const StageRect = GetStageRect();
    const SeatAnchor = GetSeatAnchor(SeatId);
    if (!SeatAnchor) {
      return null;
    }
    if (BetType === "main") {
      return SeatAnchor;
    }
    const LayoutEntry = GetActiveSideBetLayoutMap().get(SideBetKey(SeatId, BetType));
    if (LayoutEntry) {
      return {
        x: Clamp(LayoutEntry.x / 100 * StageRect.width, 18, StageRect.width - 18),
        y: Clamp(LayoutEntry.y / 100 * StageRect.height, 18, StageRect.height - 18)
      };
    }
    return {
      x: SeatAnchor.x,
      y: SeatAnchor.y
    };
  }
  function GetSeatBetPercentPosition(SeatId, BetType = "main") {
    if (BetType === "main") {
      const Seat = FindSeat(SeatId);
      return Seat ? {
        left: Seat.x,
        top: Seat.y
      } : null;
    }
    const LayoutEntry = GetActiveSideBetLayoutMap().get(SideBetKey(SeatId, BetType));
    if (LayoutEntry) {
      return {
        left: `${LayoutEntry.x}%`,
        top: `${LayoutEntry.y}%`
      };
    }
    const Seat = FindSeat(SeatId);
    return Seat ? {
      left: Seat.x,
      top: Seat.y
    } : null;
  }
  function GetCardPlacement({
    owner: Owner,
    seatId: SeatId,
    handIndex: HandIndex,
    handCount: HandCount,
    cardIndex: CardIndex,
    cardCount: CardCount
  }) {
    const StageRect = GetStageRect();
    const PlayerLayout = Owner === "dealer" ? null : GetPlayerLayout(SeatId, HandIndex, HandCount);
    const Metrics = Owner === "dealer" ? GetCardMetrics() : PlayerLayout.metrics;
    const Anchor = Owner === "dealer" ? GetDealerAnchor() : PlayerLayout.anchor;
    const BaseRotation = Owner === "dealer" ? 0 : PlayerLayout.baseRotation;
    const StackStep = Owner === "dealer" ? GetDealerStackStep(Metrics) : GetPlayerStackStep(PlayerLayout.slot, StageRect, Metrics, HandCount);
    let Rotation = BaseRotation;
    let ZIndex = CardIndex + 1;
    const HorizontalOffset = CardIndex * StackStep.x;
    const VerticalOffset = CardIndex * StackStep.y;
    return {
      left: Anchor.x + HorizontalOffset - Metrics.width / 2,
      top: Anchor.y + VerticalOffset - Metrics.height / 2,
      width: Metrics.width,
      height: Metrics.height,
      rotation: Rotation,
      zIndex: ZIndex,
      anchor: Anchor
    };
  }
  function GetHandBounds({
    owner: Owner,
    seatId: SeatId,
    handIndex: HandIndex,
    handCount: HandCount,
    cardCount: CardCount
  }) {
    const Metrics = GetCardMetrics();
    const FirstPlacement = GetCardPlacement({
      owner: Owner,
      seatId: SeatId,
      handIndex: HandIndex,
      handCount: HandCount,
      cardIndex: 0,
      cardCount: CardCount
    });
    const LastPlacement = GetCardPlacement({
      owner: Owner,
      seatId: SeatId,
      handIndex: HandIndex,
      handCount: HandCount,
      cardIndex: Math.max(CardCount - 1, 0),
      cardCount: CardCount
    });
    const Left = Math.min(FirstPlacement.left, LastPlacement.left) - 22;
    const Top = Math.min(FirstPlacement.top, LastPlacement.top) - 34;
    const Right = Math.max(FirstPlacement.left + FirstPlacement.width, LastPlacement.left + LastPlacement.width) + 22;
    const Bottom = Math.max(FirstPlacement.top + FirstPlacement.height, LastPlacement.top + LastPlacement.height) + 28;
    return {
      left: Left,
      top: Top,
      width: Right - Left,
      height: Bottom - Top,
      anchor: FirstPlacement.anchor,
      metrics: Metrics
    };
  }
  function RenderSeats(State, View) {
    const SeatMarkup = SEAT_POSITIONS.map(Seat => {
      const IsClaimed = State.selectedSeatIds.includes(Seat.id);
      const IsActive = Seat.id === State.activeSeatId;
      const ExternalSeatClaim = View.externalSeatClaims?.[Seat.id] || null;
      const IsOccupied = Boolean(ExternalSeatClaim);
      const IsReady = Array.isArray(View.readySeatIds) && View.readySeatIds.includes(Seat.id);
      const Disabled = View.disableSeatSelection || IsOccupied ? "disabled" : "";
      let SeatAction = IsOccupied ? `${ExternalSeatClaim.displayName} already took ${Seat.name}` : `Select ${Seat.name}`;
      if (!IsOccupied) {
        if (State.roundState === ROUND_STATES.INSURANCE && IsClaimed) {
          SeatAction = IsActive ? `Insurance decision for ${Seat.name}` : `Select ${Seat.name} for insurance`;
        } else if ([ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(State.roundState) && !State.lockedInputs && !State.isAnimating && View.selectedChipValue) {
          SeatAction = IsClaimed ? `Add ${Money(View.selectedChipValue)} Main to ${Seat.name}` : `Take ${Seat.name} and add ${Money(View.selectedChipValue)} Main`;
        } else if (!IsClaimed) {
          SeatAction = `Take ${Seat.name}`;
        } else if (IsActive && [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(State.roundState)) {
          SeatAction = `Leave ${Seat.name}`;
        }
      }
      const SeatBadgeMarkup = IsOccupied ? `<span class="SeatOwner">${EscapeHtml(ExternalSeatClaim.displayName)}</span>` : '<span class="SeatYou">You</span>';
      const ReadyBadgeMarkup = IsReady ? '<span class="SeatReady">Ready</span>' : "";
      return `
        <button
          class="Seat${IsClaimed ? " IsClaimed" : ""}${IsActive ? " IsActive" : ""}${IsOccupied ? " IsOccupied" : ""}${IsReady ? " IsReady" : ""}"
          data-seat-id="${Seat.id}"
          style="--SeatX: ${Seat.x}; --SeatY: ${Seat.y};"
          type="button"
          aria-pressed="${String(IsClaimed)}"
          aria-label="${SeatAction}"
          title="${SeatAction}"
          ${Disabled}
        >
          ${ReadyBadgeMarkup}
          ${SeatBadgeMarkup}
          <span class="SeatNumber">${Seat.label}</span>
        </button>
      `;
    }).join("");
    Elements.seatLayer.innerHTML = SeatMarkup;
    RenderSeatBetSpots(State, View);
    RenderSeatBetStacks(View);
  }
  function EnsureSideBetSpotNode(SeatId, BetType) {
    const Key = SideBetKey(SeatId, BetType);
    let Node = Elements.sideBetSpotLayer.querySelector(`[data-side-bet-key="${Key}"]`);
    if (Node) {
      return Node;
    }
    Node = ScopeDocument.createElement("button");
    Node.type = "button";
    Node.className = "SeatBetSpot";
    Node.dataset.sideBetKey = Key;
    Node.dataset.betSpotSeatId = SeatId;
    Node.dataset.betType = BetType;
    Node.innerHTML = `
      <span class="SeatBetSpotPayout" hidden></span>
      <span class="SeatBetSpotLabel"></span>
      <span class="SeatBetSpotValue" hidden></span>
    `;
    Elements.sideBetSpotLayer.append(Node);
    return Node;
  }
  function RenderSeatBetSpots(State, View) {
    if (!Elements.sideBetSpotLayer) {
      return;
    }
    const EditorActive = Boolean(View.sideBetEditor?.active);
    const SelectedEditorKey = View.sideBetEditor?.selectedSpotKey || "";
    const ShouldShowForBetting = [ROUND_STATES.WAITING, ROUND_STATES.BETTING].includes(State.roundState);
    SEAT_POSITIONS.forEach(Seat => {
      const IsClaimed = State.selectedSeatIds.includes(Seat.id);
      const IsActive = Seat.id === State.activeSeatId;
      const ExternalSeatClaim = View.externalSeatClaims?.[Seat.id] || null;
      const IsOccupied = Boolean(ExternalSeatClaim);
      ["perfect_pairs", "twenty_one_plus_three"].forEach(BetType => {
        const Node = EnsureSideBetSpotNode(Seat.id, BetType);
        const Anchor = GetSeatBetAnchor(Seat.id, BetType);
        const PercentPosition = GetSeatBetPercentPosition(Seat.id, BetType);
        const Spot = View.seatSideBetSpots?.[Seat.id]?.[BetType] || {
          amount: 0,
          label: GetBetTargetLabel(BetType),
          payout: 0,
          payoutLabel: "",
          resultLabel: "",
          status: "idle",
          valueLabel: ""
        };
        const HasResolvedSideBet = Number(Spot.payout) > 0 || Boolean(Spot.payoutLabel);
        const IsEditorSelected = SelectedEditorKey === SideBetKey(Seat.id, BetType);
        const ShouldShow = EditorActive || IsClaimed && (ShouldShowForBetting || HasResolvedSideBet);
        let SpotAction = `${Spot.label} spot for ${Seat.name}`;
        if (EditorActive) {
          SpotAction = `Edit ${Spot.label} position for ${Seat.name}`;
        } else if (IsOccupied) {
          SpotAction = `${ExternalSeatClaim.displayName} already took ${Seat.name}`;
        } else if (ShouldShowForBetting && !State.lockedInputs && !State.isAnimating && View.selectedChipValue) {
          SpotAction = IsClaimed ? `Add ${Money(View.selectedChipValue)} ${Spot.label} to ${Seat.name}` : `Take ${Seat.name} and add ${Money(View.selectedChipValue)} ${Spot.label}`;
        } else if (!IsClaimed) {
          SpotAction = `Take ${Seat.name} to bet ${Spot.label}`;
        }
        const Title = Spot.resultLabel ? `${SpotAction} (${Spot.resultLabel})` : SpotAction;
        const PayoutNode = Node.querySelector(".SeatBetSpotPayout");
        const LabelNode = Node.querySelector(".SeatBetSpotLabel");
        const ValueNode = Node.querySelector(".SeatBetSpotValue");
        Node.className = ["SeatBetSpot", IsClaimed ? "IsClaimed" : "", IsActive ? "IsActive" : "", IsOccupied ? "IsOccupied" : "", Number(Spot.amount) > 0 ? "HasBet" : "", ShouldShow ? "IsVisible" : "", EditorActive ? "IsEditor" : "", IsEditorSelected ? "IsEditorSelected" : ""].filter(Boolean).join(" ");
        Node.dataset.status = Spot.status || "idle";
        Node.style.left = PercentPosition?.left || `${Anchor?.x ?? 0}px`;
        Node.style.top = PercentPosition?.top || `${Anchor?.y ?? 0}px`;
        Node.disabled = !EditorActive && IsOccupied;
        Node.tabIndex = ShouldShow ? 0 : -1;
        Node.setAttribute("aria-hidden", String(!ShouldShow));
        Node.setAttribute("aria-label", Title);
        Node.title = Title;
        if (LabelNode) {
          LabelNode.textContent = Spot.label;
        }
        if (ValueNode) {
          ValueNode.textContent = Spot.valueLabel || "";
          ValueNode.hidden = !Spot.valueLabel;
        }
        if (PayoutNode) {
          PayoutNode.textContent = Spot.payoutLabel || "";
          PayoutNode.hidden = !Spot.payoutLabel;
        }
      });
    });
  }
  function RenderHandSlots() {
    Elements.handSlotLayer.innerHTML = "";
  }
  function RenderSeatBetStacks(View) {
    if (!Elements.seatBetLayer) {
      return;
    }
    const PreviousBetNodes = new Map(Array.from(Elements.seatBetLayer.querySelectorAll(".SeatBet:not(.IsExiting)")).map(Node => [Node.dataset.betKey || "", Node]).filter(([Key]) => Key));
    const NextBetKeys = new Set();
    const NextMarkup = SEAT_POSITIONS.map(Seat => {
      return [{
        amount: View.seatBetAmounts[Seat.id],
        betType: "main",
        sideClass: ""
      }, {
        amount: View.seatSideBetSpots?.[Seat.id]?.perfect_pairs?.amount || 0,
        betType: "perfect_pairs",
        sideClass: " SeatBetSide"
      }, {
        amount: View.seatSideBetSpots?.[Seat.id]?.twenty_one_plus_three?.amount || 0,
        betType: "twenty_one_plus_three",
        sideClass: " SeatBetSide"
      }].map(({
        amount: Amount,
        betType: BetType,
        sideClass: SideClass
      }) => {
        if (!Amount) {
          return "";
        }
        const BetKey = `${Seat.id}:${BetType}`;
        const Anchor = GetSeatBetAnchor(Seat.id, BetType);
        if (!Anchor) {
          return "";
        }
        NextBetKeys.add(BetKey);
        const DisplayChipValue = GetDisplayChipValue(Amount);
        const ChipColor = CHIP_STYLES[DisplayChipValue];
        const Chips = `
          <div
            class="SeatBetChip"
            style="
              --ChipIndex: 0;
              --ChipColor: ${ChipColor};
              --ChipShift: 0px;
            "
            aria-label="${FormatChipLabel(Amount)} bet chip using ${FormatChipLabel(DisplayChipValue)} chip color"
          >
            <span class="SeatBetLabel">${FormatChipLabel(Amount)}</span>
          </div>
        `;
        return `
          <div class="SeatBet${SideClass}" data-bet-key="${BetKey}" data-bet-type="${BetType}" data-seat-id="${Seat.id}" style="left: ${Anchor.x}px; top: ${Anchor.y}px;">
            ${Chips}
          </div>
        `;
      }).join("");
    }).join("");
    Elements.seatBetLayer.innerHTML = NextMarkup;
    PreviousBetNodes.forEach((Node, BetKey) => {
      if (NextBetKeys.has(BetKey)) {
        return;
      }
      const ExitNode = Node.cloneNode(true);
      ExitNode.classList.add("IsExiting");
      ExitNode.addEventListener("animationend", () => {
        ExitNode.remove();
      }, {
        once: true
      });
      Elements.seatBetLayer.append(ExitNode);
    });
  }
  function RenderDealerHand(State) {
    const DealerCards = GetRenderedDealerCards(State);
    if (!DealerCards.length) {
      Elements.dealerHandLayer.innerHTML = "";
      return "";
    }
    const Bounds = GetHandBounds({
      owner: "dealer",
      seatId: "",
      handIndex: 0,
      handCount: 1,
      cardCount: DealerCards.length
    });
    const VisibleDealerValueCards = (State.dealer.cards || []).filter(Card => Card && !Card.isFaceDown && Card.value);
    const DealerTotal = VisibleDealerValueCards.length ? HandTotalLabel(VisibleDealerValueCards) : "";
    const DealerResultLabel = DealerTotal || "Dealer";
    const CardsMarkup = DealerCards.map((Card, Index) => {
      const Placement = GetCardPlacement({
        owner: "dealer",
        seatId: "",
        handIndex: 0,
        handCount: 1,
        cardIndex: Index,
        cardCount: DealerCards.length
      });
      const Left = Placement.left - Bounds.left + Placement.width / 2;
      const Top = Placement.top - Bounds.top + Placement.height / 2;
      if (Card.isFaceDown) {
        return `
          <div
            class="PlayingCard PlayingCardBackOnly"
            data-owner="dealer"
            data-card-index="${Index}"
            style="
              --CardLeft: ${Left}px;
              --CardTop: ${Top}px;
              --CardWidth: ${Placement.width}px;
              --CardHeight: ${Placement.height}px;
              --CardRotation: ${Placement.rotation}deg;
              --CardZIndex: ${Placement.zIndex};
            "
          >
            <div class="PlayingCardFace PlayingCardFaceBack" aria-label="Dealer face-down card"></div>
          </div>
        `;
      }
      const CardImageUrl = GetCardImageUrl(Card);
      return `
        <div
          class="PlayingCard"
          data-owner="dealer"
          data-card-index="${Index}"
          style="
            --CardLeft: ${Left}px;
            --CardTop: ${Top}px;
            --CardWidth: ${Placement.width}px;
            --CardHeight: ${Placement.height}px;
            --CardRotation: ${Placement.rotation}deg;
            --CardZIndex: ${Placement.zIndex};
          "
        >
          <div class="PlayingCardFace PlayingCardFaceFront">
            <img class="PlayingCardImage" src="${CardImageUrl}" alt="${CardLabel(Card)}">
          </div>
        </div>
      `;
    }).join("");
    Elements.dealerHandLayer.innerHTML = `
      <section
        class="HandGroup HandGroupDealer"
        style="left: ${Bounds.left}px; top: ${Bounds.top}px; width: ${Bounds.width}px; height: ${Bounds.height}px;"
      >
        <div class="HandGroupCards">${CardsMarkup}</div>
      </section>
    `;
    return `
      <section
        class="HandGroup HandGroupDealer HandGroupIndicatorAnchor"
        style="left: ${Bounds.left}px; top: ${Bounds.top}px; width: ${Bounds.width}px; height: ${Bounds.height}px;"
      >
        <div class="HandGroupIndicators">
          <div class="HandGroupDealerResult">${EscapeHtml(DealerResultLabel)}</div>
        </div>
      </section>
    `;
  }
  function RenderPlayerHands(State) {
    if (!State.hands.length) {
      Elements.playerHandsLayer.innerHTML = "";
      return "";
    }
    const IndicatorMarkup = [];
    const Markup = State.hands.map(Hand => {
      if (!Hand.cards.length) {
        return "";
      }
      const SeatHands = State.hands.filter(Candidate => Candidate.seatId === Hand.seatId).sort(CompareSeatHands);
      const SeatHandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
      const Bounds = GetHandBounds({
        owner: "player",
        seatId: Hand.seatId,
        handIndex: SeatHandIndex,
        handCount: SeatHands.length,
        cardCount: Math.max(Hand.cards.length, 1)
      });
      const IsActiveHand = State.roundState === ROUND_STATES.PLAYER_TURN && State.hands[State.activeHandIndex]?.id === Hand.id;
      const CardEntries = Hand.cards.map((Card, CardIndex) => {
        const Placement = GetCardPlacement({
          owner: "player",
          seatId: Hand.seatId,
          handIndex: SeatHandIndex,
          handCount: SeatHands.length,
          cardIndex: CardIndex,
          cardCount: Hand.cards.length
        });
        return {
          card: Card,
          cardIndex: CardIndex,
          placement: Placement
        };
      });
      const CardsMarkup = CardEntries.map(({
        card: Card,
        cardIndex: CardIndex,
        placement: Placement
      }) => {
        const Left = Placement.left - Bounds.left + Placement.width / 2;
        const Top = Placement.top - Bounds.top + Placement.height / 2;
        const CardImageUrl = GetCardImageUrl(Card);
        return `
          <div
            class="PlayingCard"
            data-owner="player"
            data-hand-id="${Hand.id}"
            data-card-index="${CardIndex}"
            style="
              --CardLeft: ${Left}px;
              --CardTop: ${Top}px;
              --CardWidth: ${Placement.width}px;
              --CardHeight: ${Placement.height}px;
              --CardRotation: ${Placement.rotation}deg;
              --CardZIndex: ${Placement.zIndex};
            "
          >
            <div class="PlayingCardFace PlayingCardFaceFront">
              <img class="PlayingCardImage" src="${CardImageUrl}" alt="${CardLabel(Card)}">
            </div>
          </div>
        `;
      }).join("");
      const ResultMarkup = Hand.result ? `<div class="HandGroupResult" data-result="${Hand.result}">${Hand.result.toUpperCase()}</div>` : "";
      const TurnLabel = Hand.isSelf ? "Your Turn" : `${EscapeHtml(Hand.ownerName || "Player")} Turn`;
      const TurnMarkup = IsActiveHand ? `<div class="HandGroupTurn">${TurnLabel}</div>` : "";
      const TotalMarkup = Hand.cards.length ? `<div class="HandGroupTotal">${HandTotalLabel(Hand.cards)}</div>` : "";
      IndicatorMarkup.push(`
        <section
          class="HandGroup HandGroupIndicatorAnchor${SeatHands.length > 1 ? " HandGroupSplit" : ""}"
          style="left: ${Bounds.left}px; top: ${Bounds.top}px; width: ${Bounds.width}px; height: ${Bounds.height}px;"
        >
          <div class="HandGroupIndicators">
            ${TurnMarkup}
            ${ResultMarkup}
            ${TotalMarkup}
          </div>
        </section>
      `);
      return `
        <section
          class="HandGroup${SeatHands.length > 1 ? " HandGroupSplit" : ""}"
          style="left: ${Bounds.left}px; top: ${Bounds.top}px; width: ${Bounds.width}px; height: ${Bounds.height}px;"
        >
          <div class="HandGroupCards">${CardsMarkup}</div>
        </section>
      `;
    }).join("");
    Elements.playerHandsLayer.innerHTML = Markup;
    return IndicatorMarkup.join("");
  }
  function RenderHandIndicators(Markup = "") {
    if (Elements.handIndicatorLayer) {
      Elements.handIndicatorLayer.innerHTML = Markup;
    }
  }
  function RenderStats(State, View) {
    if (Elements.stateValue) {
      Elements.stateValue.textContent = ROUND_STATE_LABELS[State.roundState] || "";
    }
    if (Elements.countdownValue) {
      Elements.countdownValue.textContent = View.countdownLabel || "";
      Elements.countdownValue.closest(".TableReadout")?.classList.toggle("IsHidden", !View.countdownLabel);
    }
    if (Elements.balanceValue) {
      Elements.balanceValue.textContent = View.balanceLabel;
    }
    if (Elements.pendingBetValue) {
      Elements.pendingBetValue.textContent = View.pendingBetLabel;
    }
    if (Elements.shoeValue) {
      Elements.shoeValue.textContent = View.shoeLabel;
    }
    if (Elements.messageText) {
      const Toolbar = Elements.messageText.closest(".TableToolbar");
      Elements.messageText.textContent = State.message || "";
      Toolbar?.classList.toggle("IsHidden", !State.message);
    }
    if (Elements.status) {
      Elements.status.textContent = State.message || "";
    }
  }
  function RenderControls(View) {
    Elements.bettingControls.classList.toggle("IsHidden", !View.showBettingControls);
    Elements.decisionPanel.classList.toggle("IsHidden", !View.showDecisionPanel);
    Elements.insurancePanel.classList.toggle("IsHidden", !View.showInsurancePanel);
    Elements.undoChipButton.disabled = View.disableUndoChip;
    Elements.doubleBetButton.disabled = View.disableDoubleBet;
    Elements.placeBetButton.disabled = View.primaryBetAction.disabled;
    Elements.placeBetButton.textContent = View.primaryBetAction.label;
    Elements.placeBetButton.dataset.tone = View.primaryBetAction.tone;
    Elements.placeBetButton.setAttribute("aria-label", View.primaryBetAction.ariaLabel);
    CHIP_VALUES.forEach(Value => {
      const ChipButton = Elements.chipTray.querySelector(`[data-chip-value="${Value}"]`);
      if (!ChipButton) {
        return;
      }
      const IsVisible = !View.visibleChips || View.visibleChips[Value] !== false;
      ChipButton.hidden = !IsVisible;
      ChipButton.disabled = !IsVisible || !View.enabledChips[Value];
      ChipButton.classList.toggle("IsSelected", Value === View.selectedChipValue);
      ChipButton.setAttribute("aria-pressed", String(Value === View.selectedChipValue));
    });
    if (Elements.insuranceCopy) {
      Elements.insuranceCopy.textContent = View.insuranceDecision?.copy || "";
    }
    if (Elements.insuranceAccept) {
      Elements.insuranceAccept.disabled = !View.insuranceDecision || View.insuranceDecision.acceptDisabled;
      Elements.insuranceAccept.textContent = View.insuranceDecision?.acceptLabel || "Insure";
    }
    if (Elements.insuranceDecline) {
      Elements.insuranceDecline.disabled = !View.insuranceDecision || View.insuranceDecision.declineDisabled;
    }
    const Actions = [["hit", Elements.actionHit], ["stand", Elements.actionStand], ["double", Elements.actionDouble], ["split", Elements.actionSplit]];
    Actions.forEach(([Name, Button]) => {
      const Config = View.actions[Name];
      Button.disabled = Config.disabled;
      Button.classList.toggle("IsHidden", Config.hidden);
    });
  }
  function RenderPackets(State) {
    Elements.leftPacket.classList.toggle("IsReady", State.shoe.isReady);
    Elements.stage.classList.toggle("IsBusy", State.isAnimating);
  }
  function Render(State, View) {
    LastRenderedState = State;
    LastRenderedView = View;
    RenderPackets(State);
    RenderStats(State, View);
    RenderHandSlots();
    RenderSeats(State, View);
    const DealerIndicatorMarkup = RenderDealerHand(State);
    const PlayerIndicatorMarkup = RenderPlayerHands(State);
    RenderHandIndicators(`${DealerIndicatorMarkup}${PlayerIndicatorMarkup}`);
    RenderControls(View);
  }
  function BuildStaticControls() {
    Elements.chipTray.innerHTML = CHIP_VALUES.map(Value => {
      const ChipColor = CHIP_STYLES[Value];
      return `
        <button
          class="Chip"
          data-chip-value="${Value}"
          type="button"
          style="--ChipColor: ${ChipColor};"
          aria-label="Select ${Money(Value)} chip"
          aria-pressed="false"
        >
          <span class="ChipLabel">${FormatChipLabel(Value)}</span>
        </button>
      `;
    }).join("");
  }
  function GetViewCountdownLabel(State) {
    if (State.roundState !== "waiting" && State.roundState !== "betting") {
      return "--";
    }
    if (!State.countdownDeadline) {
      return `${BETTING_COUNTDOWN_SECONDS}s`;
    }
    return `${State.countdownSeconds}s`;
  }
  BuildStaticControls();
  return {
    elements: Elements,
    Render,
    render: Render,
    GetHandSlotLayout() {
      return CloneHandSlots(CurrentHandSlotLayout);
    },
    SetHandSlotLayout(NextLayout) {
      CurrentHandSlotLayout = NormalizeHandSlots(NextLayout);
      RenderHandSlots();
    },
    GetSideBetLayout() {
      return CurrentSideBetLayout.map(Spot => ({
        ...Spot
      }));
    },
    SetSideBetLayout(NextLayout) {
      CurrentSideBetLayout = NormalizeSideBets(NextLayout);
      CurrentSideBetLayoutMap = SideBetMap(CurrentSideBetLayout);
    },
    GetStageRect,
    GetCardMetrics,
    GetProjectedCardRect({
      owner: Owner,
      seatId: SeatId,
      handIndex: HandIndex = 0,
      handCount: HandCount = 1,
      cardIndex: CardIndex = 0,
      cardCount: CardCount = 1
    }) {
      return GetCardPlacement({
        owner: Owner,
        seatId: SeatId,
        handIndex: HandIndex,
        handCount: HandCount,
        cardIndex: CardIndex,
        cardCount: CardCount
      });
    },
    GetRenderedCardRect(Owner, HandIndex, CardIndex) {
      const Selector = Owner === "dealer" ? `.PlayingCard[data-owner="dealer"][data-card-index="${CardIndex}"]` : `.PlayingCard[data-owner="player"][data-hand-id="${HandIndex}"][data-card-index="${CardIndex}"]`;
      const Node = Elements.stage.querySelector(Selector);
      if (!Node) {
        return null;
      }
      return GetRelativeRect(Node, GetStageRect());
    },
    GetCollectableCards() {
      if (!LastRenderedState) {
        return [];
      }
      const StageRect = GetStageRect();
      const Collected = [];
      const DealerCards = GetRenderedDealerCards(LastRenderedState).map((Card, CardIndex) => Card.isFaceDown ? {
        ...LastRenderedState.dealer.holeCard,
        isFaceDown: true,
        _dealerCardIndex: CardIndex
      } : Card);
      DealerCards.forEach((Card, CardIndex) => {
        const Node = Elements.stage.querySelector(`.PlayingCard[data-owner="dealer"][data-card-index="${CardIndex}"]`);
        if (!Node) {
          return;
        }
        const Placement = GetCardPlacement({
          owner: "dealer",
          seatId: "",
          handIndex: 0,
          handCount: 1,
          cardIndex: CardIndex,
          cardCount: DealerCards.length
        });
        Collected.push({
          node: Node,
          card: Card.isFaceDown ? LastRenderedState.dealer.holeCard : Card,
          faceUp: !Card.isFaceDown,
          sourceRect: GetRelativeRect(Node, StageRect),
          sourceRotation: Placement.rotation
        });
      });
      LastRenderedState.hands.forEach(Hand => {
        const SeatHands = LastRenderedState.hands.filter(Candidate => Candidate.seatId === Hand.seatId).sort(CompareSeatHands);
        const SeatHandIndex = SeatHands.findIndex(Candidate => Candidate.id === Hand.id);
        Hand.cards.forEach((Card, CardIndex) => {
          const Node = Elements.stage.querySelector(`.PlayingCard[data-owner="player"][data-hand-id="${Hand.id}"][data-card-index="${CardIndex}"]`);
          if (!Node) {
            return;
          }
          const Placement = GetCardPlacement({
            owner: "player",
            seatId: Hand.seatId,
            handIndex: SeatHandIndex,
            handCount: SeatHands.length,
            cardIndex: CardIndex,
            cardCount: Hand.cards.length
          });
          Collected.push({
            node: Node,
            card: Card,
            faceUp: true,
            sourceRect: GetRelativeRect(Node, StageRect),
            sourceRotation: Placement.rotation
          });
        });
      });
      return Collected;
    },
    GetLeftPacketRect(StackIndex = 0) {
      const BaseRect = GetRelativeRect(Elements.leftPacket, GetStageRect());
      const Offset = Math.min(StackIndex, 4) * 1.5;
      const Rotations = [-6, -2, 3, 6, 1];
      return {
        left: BaseRect.left + Offset * 0.35,
        top: BaseRect.top - Offset * 0.2,
        width: BaseRect.width,
        height: BaseRect.height,
        rotation: Rotations[StackIndex % Rotations.length]
      };
    },
    GetShoePacketRect() {
      return GetRelativeRect(Elements.shoePacket, GetStageRect());
    },
    GetCountdownLabel: GetViewCountdownLabel
  };
}
