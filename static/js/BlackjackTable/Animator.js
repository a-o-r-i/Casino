function EaseOutCubic(Value) {
  return 1 - (1 - Value) ** 3;
}
function EaseInOutSine(Value) {
  return -(Math.cos(Math.PI * Value) - 1) / 2;
}
function Lerp(Start, End, Amount) {
  return Start + (End - Start) * Amount;
}
function Clamp(Value, Min, Max) {
  return Math.min(Math.max(Value, Min), Max);
}
function EscapeAttribute(Value) {
  return String(Value).replace(/"/g, "&quot;");
}
function GetCardImageUrl(Card = {}) {
  return Card?.image || Card?.images?.png || Card?.images?.svg || "";
}
export class Animator {
  constructor(AnimationLayer) {
    this.animationLayer = AnimationLayer;
    this.queue = Promise.resolve();
  }
  AnimateDeal(Options) {
    return this.#enqueue(() => this.#runMove({
      ...Options,
      initialFaceUp: false,
      finalFaceUp: Options.faceUp,
      duration: Options.duration ?? 560
    }));
  }
  AnimateTransfer(Options) {
    return this.#enqueue(() => this.#runMove({
      ...Options,
      initialFaceUp: true,
      finalFaceUp: true,
      duration: Options.duration ?? 420
    }));
  }
  AnimateReveal(Options) {
    return this.#enqueue(() => this.#runMove({
      ...Options,
      sourceRect: Options.targetRect,
      initialFaceUp: false,
      finalFaceUp: true,
      duration: Options.duration ?? 420
    }));
  }
  AnimateCollect(Options) {
    return this.#runMove({
      ...Options,
      initialFaceUp: Options.faceUp ?? true,
      finalFaceUp: false,
      duration: Options.duration ?? 520,
      delay: Options.delay ?? 0,
      flipWindowStart: Options.flipWindowStart ?? 0.68,
      flipWindowEnd: Options.flipWindowEnd ?? 0.98,
      holdEndMs: Options.holdEndMs ?? 60,
      scaleFrom: Options.scaleFrom ?? 1,
      scaleTo: Options.scaleTo ?? 0.9
    });
  }
  #enqueue(Task) {
    this.queue = this.queue.then(() => Task());
    return this.queue;
  }
  #setFace(Face, Card, FaceUp) {
    if (FaceUp) {
      Face.className = "AnimatedCardFace AnimatedCardFaceFront";
      const CardImageUrl = GetCardImageUrl(Card);
      Face.innerHTML = CardImageUrl ? `<img class="AnimatedCardImage" src="${CardImageUrl}" alt="${EscapeAttribute(Card.value)}">` : "";
      return;
    }
    Face.className = "AnimatedCardFace AnimatedCardFaceBack";
    Face.innerHTML = "";
  }
  #runMove({
    sourceRect: SourceRect,
    targetRect: TargetRect,
    card: Card,
    initialFaceUp: InitialFaceUp = false,
    finalFaceUp: FinalFaceUp = InitialFaceUp,
    duration: Duration,
    delay: Delay = 0,
    sourceRotation: SourceRotation = 0,
    targetRotation: TargetRotation = 0,
    flipWindowStart: FlipWindowStart = 0,
    flipWindowEnd: FlipWindowEnd = 1,
    holdEndMs: HoldEndMs = 0,
    scaleFrom: ScaleFrom = 0.94,
    scaleTo: ScaleTo = 1
  }) {
    const Node = document.createElement("div");
    const Face = document.createElement("div");
    const ShouldFlip = InitialFaceUp !== FinalFaceUp;
    const NormalizedFlipWindowStart = Clamp(FlipWindowStart, 0, 1);
    const NormalizedFlipWindowEnd = Clamp(Math.max(FlipWindowEnd, NormalizedFlipWindowStart), 0, 1);
    Node.className = "AnimatedCard";
    Node.append(Face);
    this.animationLayer.append(Node);
    this.#setFace(Face, Card, InitialFaceUp);
    const FromX = SourceRect.left + SourceRect.width / 2;
    const FromY = SourceRect.top + SourceRect.height / 2;
    const ToX = TargetRect.left + TargetRect.width / 2;
    const ToY = TargetRect.top + TargetRect.height / 2;
    Node.style.left = `${FromX}px`;
    Node.style.top = `${FromY}px`;
    Node.style.width = `${SourceRect.width}px`;
    Node.style.height = `${SourceRect.height}px`;
    Node.style.transform = `translate(-50%, -50%) rotate(${SourceRotation}deg) scale(${ScaleFrom})`;
    Face.style.transform = "scaleX(1)";
    return new Promise(Resolve => {
      let LaunchTime = null;
      let VisibleFaceUp = InitialFaceUp;
      let HoldStartTime = null;
      const Step = Timestamp => {
        if (LaunchTime === null) {
          LaunchTime = Timestamp + Delay;
        }
        const Progress = Timestamp < LaunchTime ? 0 : Math.min((Timestamp - LaunchTime) / Duration, 1);
        const Eased = EaseOutCubic(Progress);
        const RawFlipProgress = ShouldFlip ? Clamp((Progress - NormalizedFlipWindowStart) / Math.max(NormalizedFlipWindowEnd - NormalizedFlipWindowStart, Number.EPSILON), 0, 1) : 0;
        const FlipProgress = EaseInOutSine(RawFlipProgress);
        const RotationY = ShouldFlip ? FlipProgress * Math.PI : 0;
        const ScaleX = ShouldFlip ? Math.max(Math.abs(Math.cos(RotationY)), 0.05) : 1;
        const X = Lerp(FromX, ToX, Eased);
        const Y = Lerp(FromY, ToY, Eased);
        const Width = Lerp(SourceRect.width, TargetRect.width, Eased);
        const Height = Lerp(SourceRect.height, TargetRect.height, Eased);
        const ZRotation = Lerp(SourceRotation, TargetRotation, Eased);
        const Scale = Lerp(ScaleFrom, ScaleTo, Eased);
        const NextFaceUp = ShouldFlip && RawFlipProgress >= 0.5 ? FinalFaceUp : InitialFaceUp;
        if (NextFaceUp !== VisibleFaceUp) {
          VisibleFaceUp = NextFaceUp;
          this.#setFace(Face, Card, VisibleFaceUp);
        }
        Node.style.left = `${X}px`;
        Node.style.top = `${Y}px`;
        Node.style.width = `${Width}px`;
        Node.style.height = `${Height}px`;
        Node.style.transform = `translate(-50%, -50%) rotate(${ZRotation}deg) scale(${Scale})`;
        Face.style.transform = `scaleX(${ScaleX})`;
        if (LaunchTime === null || Timestamp < LaunchTime + Duration) {
          requestAnimationFrame(Step);
          return;
        }
        if (HoldEndMs > 0) {
          if (HoldStartTime === null) {
            HoldStartTime = Timestamp;
          }
          if (Timestamp < HoldStartTime + HoldEndMs) {
            requestAnimationFrame(Step);
            return;
          }
        }
        Node.remove();
        Resolve();
      };
      requestAnimationFrame(Step);
    });
  }
}
