import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const FaceSize = 1024;
const FaceCenter = FaceSize / 2;

const MakeCanvas = () =>
{
    const Canvas = document.createElement("canvas");
    Canvas.width = FaceSize;
    Canvas.height = FaceSize;
    return Canvas;
};

const CreateAlphaTexture = () =>
{
    const Canvas = MakeCanvas();
    const Context = Canvas.getContext("2d");
    if (!Context)
    {
        return null;
    }

    Context.fillStyle = "#000000";
    Context.fillRect(0, 0, FaceSize, FaceSize);
    Context.fillStyle = "#ffffff";
    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 508, 0, Math.PI * 2);
    Context.fill();

    const Texture = new THREE.CanvasTexture(Canvas);
    return Texture;
};

const CreateFaceMap = ({ Label }) =>
{
    const Canvas = MakeCanvas();
    const Context = Canvas.getContext("2d");
    if (!Context)
    {
        return null;
    }

    const Radial = Context.createRadialGradient(FaceCenter, 360, 90, FaceCenter, FaceCenter, 540);
    Radial.addColorStop(0, "#fef9e7");
    Radial.addColorStop(0.45, "#ecd48b");
    Radial.addColorStop(0.78, "#b88934");
    Radial.addColorStop(1, "#4f3616");
    Context.fillStyle = Radial;
    Context.fillRect(0, 0, FaceSize, FaceSize);

    const FaceGradient = Context.createLinearGradient(0, 0, FaceSize, FaceSize);
    FaceGradient.addColorStop(0, "rgba(255, 255, 255, 0.5)");
    FaceGradient.addColorStop(0.42, "rgba(255, 255, 255, 0.06)");
    FaceGradient.addColorStop(1, "rgba(0, 0, 0, 0.22)");

    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 508, 0, Math.PI * 2);
    Context.closePath();
    Context.fillStyle = FaceGradient;
    Context.fill();

    Context.strokeStyle = "rgba(255, 248, 227, 0.72)";
    Context.lineWidth = 18;
    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 500, 0, Math.PI * 2);
    Context.stroke();

    Context.strokeStyle = "rgba(88, 57, 17, 0.45)";
    Context.lineWidth = 8;
    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 438, 0, Math.PI * 2);
    Context.stroke();

    Context.strokeStyle = "rgba(255, 255, 255, 0.16)";
    Context.lineWidth = 3;
    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 354, 0, Math.PI * 2);
    Context.stroke();

    Context.beginPath();
    Context.arc(FaceCenter, FaceCenter, 286, 0, Math.PI * 2);
    Context.closePath();
    Context.fillStyle = "rgba(100, 66, 16, 0.12)";
    Context.fill();

    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.fillStyle = "#5f4314";
    Context.font = "700 210px Geist, Arial, sans-serif";
    Context.fillText(Label, FaceCenter, FaceCenter + 18);

    const Texture = new THREE.CanvasTexture(Canvas);
    Texture.colorSpace = THREE.SRGBColorSpace;
    return Texture;
};

const CreateEdgeTexture = () =>
{
    const Canvas = document.createElement("canvas");
    Canvas.width = 256;
    Canvas.height = 32;

    const Context = Canvas.getContext("2d");
    if (!Context)
    {
        return null;
    }

    const Gradient = Context.createLinearGradient(0, 0, 0, Canvas.height);
    Gradient.addColorStop(0, "#f7df96");
    Gradient.addColorStop(0.35, "#bf8e37");
    Gradient.addColorStop(0.7, "#8b5e22");
    Gradient.addColorStop(1, "#f5d681");
    Context.fillStyle = Gradient;
    Context.fillRect(0, 0, Canvas.width, Canvas.height);

    for (let Index = 0; Index < Canvas.width; Index += 10)
    {
        Context.fillStyle = Index % 20 === 0 ? "rgba(54, 35, 10, 0.26)" : "rgba(255, 248, 214, 0.16)";
        Context.fillRect(Index, 0, 5, Canvas.height);
    }

    const Texture = new THREE.CanvasTexture(Canvas);
    Texture.wrapS = THREE.RepeatWrapping;
    Texture.wrapT = THREE.RepeatWrapping;
    Texture.repeat.set(18, 1);
    Texture.colorSpace = THREE.SRGBColorSpace;
    return Texture;
};

const CreateGlowTexture = () =>
{
    const Canvas = document.createElement("canvas");
    Canvas.width = 512;
    Canvas.height = 512;

    const Context = Canvas.getContext("2d");
    if (!Context)
    {
        return null;
    }

    const Gradient = Context.createRadialGradient(256, 256, 28, 256, 256, 256);
    Gradient.addColorStop(0, "rgba(193, 255, 135, 0.92)");
    Gradient.addColorStop(0.24, "rgba(145, 255, 106, 0.48)");
    Gradient.addColorStop(0.52, "rgba(84, 255, 92, 0.2)");
    Gradient.addColorStop(1, "rgba(84, 255, 92, 0)");

    Context.fillStyle = Gradient;
    Context.fillRect(0, 0, Canvas.width, Canvas.height);

    const Texture = new THREE.CanvasTexture(Canvas);
    Texture.colorSpace = THREE.SRGBColorSpace;
    return Texture;
};

const ShowFallback = (Container, Message) =>
{
    const State = document.createElement("div");
    State.className = "viewer_empty_state";
    State.textContent = Message;
    Container.replaceChildren(State);
};

const EaseInOutQuint = (Value) =>
{
    if (Value < 0.5)
    {
        return 16 * Value * Value * Value * Value * Value;
    }

    return 1 - Math.pow(-2 * Value + 2, 5) / 2;
};

const SpringSettle = (Amplitude, Progress) =>
{
    return Amplitude * Math.pow(1 - Progress, 2.6) * Math.cos(Progress * Math.PI * 2.7);
};

const CoinRevealLeadMs = 1000;

const ResultGlowColors = {
    loss: {
        light: 0xff4f5f,
        primary: 0xff4257,
        secondary: 0xff9aa3,
    },
    neutral: {
        light: 0xffffff,
        primary: 0xffffff,
        secondary: 0xd4d4d8,
    },
    win: {
        light: 0x79ff57,
        primary: 0x7cff5a,
        secondary: 0xbaff91,
    },
};

const NormalizeAngleNear = (Angle, Reference) =>
{
    const FullTurn = Math.PI * 2;
    return Angle + Math.round((Reference - Angle) / FullTurn) * FullTurn;
};

const MountCoinViewer = (Container) =>
{
    const FlipButton = document.querySelector("[data-coin-flip]");
    const ResultLabel = document.querySelector("[data-coin-result]");
    const Scene = new THREE.Scene();
    Scene.fog = new THREE.Fog(0x090b10, 7, 12);

    const Renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    Renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    Renderer.outputColorSpace = THREE.SRGBColorSpace;
    Renderer.domElement.className = "viewer_canvas";
    Renderer.domElement.style.display = "block";
    Renderer.domElement.style.width = "100%";
    Renderer.domElement.style.height = "100%";
    Container.appendChild(Renderer.domElement);

    const Camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    Camera.position.set(0, 0, 6.8);
    Camera.lookAt(0, 0, 0);

    const AmbientLight = new THREE.AmbientLight(0xf4f8ff, 1.7);
    Scene.add(AmbientLight);

    const KeyLight = new THREE.DirectionalLight(0xfaf1ce, 3.1);
    KeyLight.position.set(2.6, 3.5, 4.4);
    Scene.add(KeyLight);

    const RimLight = new THREE.DirectionalLight(0x7ccfff, 1.45);
    RimLight.position.set(-3.4, -1.6, 2.2);
    Scene.add(RimLight);

    const BackLight = new THREE.PointLight(0x8fd8ff, 16, 18, 2);
    BackLight.position.set(0, 0, -3.4);
    Scene.add(BackLight);

    const FaceAlphaTexture = CreateAlphaTexture();
    const HeadTexture = CreateFaceMap({
        Label: "Head",
    });
    const TailsTexture = CreateFaceMap({
        Label: "Tails",
    });
    TailsTexture.wrapS = THREE.RepeatWrapping;
    TailsTexture.repeat.x = -1;
    TailsTexture.offset.x = 1;
    const EdgeTexture = CreateEdgeTexture();
    const GlowTexture = CreateGlowTexture();

    const EdgeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xc89a42,
        metalness: 0.92,
        roughness: 0.32,
        clearcoat: 0.2,
        map: EdgeTexture,
    });
    const CoinEdgeGeometry = new THREE.CylinderGeometry(1.56, 1.56, 0.24, 128, 1, true);
    CoinEdgeGeometry.rotateX(Math.PI / 2);
    const CoinEdge = new THREE.Mesh(CoinEdgeGeometry, EdgeMaterial);

    const FaceGeometry = new THREE.PlaneGeometry(3.12, 3.12, 280, 280);
    const CreateFaceMaterial = (Map) =>
    {
        return new THREE.MeshPhysicalMaterial({
            color: 0xe6be67,
            metalness: 0.68,
            roughness: 0.38,
            map: Map,
            alphaMap: FaceAlphaTexture,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.FrontSide,
        });
    };

    const FrontFace = new THREE.Mesh(FaceGeometry, CreateFaceMaterial(HeadTexture));
    FrontFace.position.z = 0.122;

    const BackFaceGeometry = FaceGeometry.clone();
    const BackFaceUvs = BackFaceGeometry.getAttribute("uv");
    for (let Index = 0; Index < BackFaceUvs.count; Index += 1)
    {
        BackFaceUvs.setX(Index, 1 - BackFaceUvs.getX(Index));
    }
    BackFaceUvs.needsUpdate = true;

    const BackFace = new THREE.Mesh(BackFaceGeometry, CreateFaceMaterial(TailsTexture));
    BackFace.rotation.y = Math.PI;
    BackFace.rotation.z = Math.PI;
    BackFace.position.z = -0.122;

    const FrontRim = new THREE.Mesh(
        new THREE.TorusGeometry(1.508, 0.052, 18, 160),
        new THREE.MeshStandardMaterial({
            color: 0xf6de98,
            metalness: 0.72,
            roughness: 0.28,
        }),
    );
    FrontRim.position.z = 0.122;

    const BackRim = new THREE.Mesh(FrontRim.geometry.clone(), FrontRim.material.clone());
    BackRim.position.z = -0.122;

    const GlowMaterial = new THREE.SpriteMaterial({
        map: GlowTexture,
        color: 0x7cff5a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const GlowSprite = new THREE.Sprite(GlowMaterial);
    GlowSprite.scale.set(5.3, 5.3, 1);
    GlowSprite.position.z = -0.42;
    GlowSprite.renderOrder = 0;

    const GlowSecondaryMaterial = new THREE.SpriteMaterial({
        map: GlowTexture,
        color: 0xbaff91,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const GlowSecondary = new THREE.Sprite(GlowSecondaryMaterial);
    GlowSecondary.scale.set(4.5, 4.5, 1);
    GlowSecondary.position.z = -0.32;
    GlowSecondary.renderOrder = 0;

    const WinLight = new THREE.PointLight(0x79ff57, 0, 9, 2);
    WinLight.position.set(0, 0, -0.7);

    const GlowGroup = new THREE.Group();
    GlowGroup.position.set(0, 0, -0.55);
    GlowGroup.add(GlowSprite);
    GlowGroup.add(GlowSecondary);
    GlowGroup.add(WinLight);
    Scene.add(GlowGroup);

    const CoinGroup = new THREE.Group();
    CoinGroup.add(CoinEdge);
    CoinGroup.add(FrontFace);
    CoinGroup.add(BackFace);
    CoinGroup.add(FrontRim);
    CoinGroup.add(BackRim);
    CoinGroup.rotation.set(0, 0, 0);
    Scene.add(CoinGroup);

    const RestingRotation = new THREE.Euler(0, 0, 0);
    let ActiveFlip = null;
    let ActiveGlow = null;
    let CurrentSide = "Heads";
    let IdleFloatStartedAt = performance.now();

    const SetResultState = (StateName) =>
    {
        const Palette = ResultGlowColors[StateName] || ResultGlowColors.neutral;

        GlowMaterial.color.setHex(Palette.primary);
        GlowSecondaryMaterial.color.setHex(Palette.secondary);
        WinLight.color.setHex(Palette.light);
    };

    const SetResultText = (Value) =>
    {
        if (!ResultLabel)
        {
            return;
        }

        ResultLabel.textContent = `Result: ${Value}`;
    };

    const SetCoinSide = (Side) =>
    {
        if (ActiveFlip || Side === CurrentSide)
        {
            return;
        }

        const SideOffsetX = Side === "Tails" ? Math.PI : 0;
        CoinGroup.rotation.x = SideOffsetX;
        CoinGroup.rotation.y = RestingRotation.y;
        CoinGroup.rotation.z = RestingRotation.z;
        CoinGroup.position.y = 0;
        CurrentSide = Side;
        IdleFloatStartedAt = performance.now();
    };

    const StopFlipAudio = () =>
    {
        window.GamblingApp?.stopSound?.("coinflip-spin");
        window.GamblingApp?.stopSound?.("coinflip-full");
    };

    const StartFlipAudio = (TargetDurationMs) =>
    {
        StopFlipAudio();

        if (!window.GamblingApp?.playSound)
        {
            return;
        }

        const SoundKey = window.GamblingApp?.hasSound?.("coinflip-spin")
            ? "coinflip-spin"
            : "coinflip-full";

        window.GamblingApp.playSound(SoundKey, {
            restart: false,
            targetDurationMs: TargetDurationMs,
            volume: 0.7,
        });
    };

    const StartFlip = (ForcedSide) =>
    {
        if (ActiveFlip)
        {
            return null;
        }

        const LandedSide = ForcedSide || (Math.random() < 0.5 ? "Heads" : "Tails");
        const ExtraSpins = 5 + Math.floor(Math.random() * 3);
        const FullTurns = ExtraSpins * Math.PI * 2;
        const SideOffsetX = LandedSide === "Heads" ? 0 : Math.PI;
        const TargetX = NormalizeAngleNear(SideOffsetX, CoinGroup.rotation.x + FullTurns);
        const OvershootX = 0.15;
        const MainTargetX = TargetX + OvershootX;
        const TargetZ = RestingRotation.z;
        let ResolveFinished = null;
        const FinishedPromise = new Promise((Resolve) =>
        {
            ResolveFinished = Resolve;
        });

        ActiveFlip = {
            FinishedPromise,
            ResolveFinished,
            StartedAt: performance.now(),
            Duration: 2150,
            SettleDuration: 1200,
            StartX: CoinGroup.rotation.x,
            StartY: CoinGroup.rotation.y,
            StartZ: CoinGroup.rotation.z,
            MainTargetX,
            TargetX,
            TargetY: RestingRotation.y,
            TargetZ,
            OvershootX,
            LandedSide,
            RevealSoundPlayed: false,
        };

        ActiveGlow = null;
        GlowMaterial.opacity = 0;
        GlowSecondaryMaterial.opacity = 0;
        WinLight.intensity = 0;
        if (FlipButton)
        {
            FlipButton.disabled = true;
        }
        SetResultText("Flipping...");
        StartFlipAudio(
            ActiveFlip.Duration + Math.max(ActiveFlip.SettleDuration - CoinRevealLeadMs, 0),
        );

        Container.dispatchEvent(
            new CustomEvent("coinflip:started", {
                detail: {
                    side: LandedSide,
                },
            }),
        );
        return FinishedPromise;
    };

    const HandleManualFlip = () =>
    {
        StartFlip();
    };

    const HandleExternalFlip = (EventValue) =>
    {
        StartFlip(EventValue.detail?.side);
    };

    const HandleExternalSetSide = (EventValue) =>
    {
        SetCoinSide(EventValue.detail?.side || "Heads");
    };

    FlipButton?.addEventListener("click", HandleManualFlip);
    Container.addEventListener("coinflip:play", HandleExternalFlip);
    Container.addEventListener("coinflip:set-side", HandleExternalSetSide);
    Container.CoinflipController = {
        play: StartFlip,
        setResultState: SetResultState,
        setSide: SetCoinSide,
    };

    const Resize = () =>
    {
        const { clientWidth: ClientWidth, clientHeight: ClientHeight } = Container;
        if (!ClientWidth || !ClientHeight)
        {
            return;
        }

        Camera.aspect = ClientWidth / ClientHeight;
        Camera.updateProjectionMatrix();
        Renderer.setSize(ClientWidth, ClientHeight, false);
    };

    const ResizeObserverInstance = new ResizeObserver(Resize);
    ResizeObserverInstance.observe(Container);
    Resize();

    let AnimationFrame = 0;
    const Render = () =>
    {
        AnimationFrame = window.requestAnimationFrame(Render);

        if (ActiveFlip)
        {
            const Elapsed = performance.now() - ActiveFlip.StartedAt;
            const MainProgress = Math.min(Elapsed / ActiveFlip.Duration, 1);

            if (Elapsed < ActiveFlip.Duration)
            {
                const Lift = Math.sin(MainProgress * Math.PI) * 0.205;
                const MainEased = EaseInOutQuint(MainProgress);

                CoinGroup.rotation.x =
                    ActiveFlip.StartX + (ActiveFlip.MainTargetX - ActiveFlip.StartX) * MainEased;
                CoinGroup.rotation.y =
                    ActiveFlip.StartY + (ActiveFlip.TargetY - ActiveFlip.StartY) * MainEased;
                CoinGroup.rotation.z =
                    ActiveFlip.StartZ + (ActiveFlip.TargetZ - ActiveFlip.StartZ) * MainEased;
                CoinGroup.position.y = Lift;
            }
            else
            {
                const SettleElapsed = Elapsed - ActiveFlip.Duration;
                const SettleProgress = Math.min(SettleElapsed / ActiveFlip.SettleDuration, 1);
                const SettleOffsetX = SpringSettle(ActiveFlip.OvershootX, SettleProgress);
                const SettleLift =
                    0.036 * Math.pow(1 - SettleProgress, 2.5) * Math.sin(SettleProgress * Math.PI * 2.35);

                CoinGroup.rotation.x = ActiveFlip.TargetX + SettleOffsetX;
                CoinGroup.rotation.y = ActiveFlip.TargetY;
                CoinGroup.rotation.z = ActiveFlip.TargetZ;
                CoinGroup.position.y = SettleLift;

                if (
                    !ActiveFlip.RevealSoundPlayed &&
                    SettleElapsed >= Math.max(ActiveFlip.SettleDuration - CoinRevealLeadMs, 0)
                )
                {
                    ActiveFlip.RevealSoundPlayed = true;
                    StopFlipAudio();
                    window.GamblingApp?.playSound?.("coinflip-reveal", {
                        restart: true,
                    });
                }

                if (SettleProgress >= 1)
                {
                    const FinishedSide = ActiveFlip.LandedSide;
                    const ResolveFinished = ActiveFlip.ResolveFinished;
                    CoinGroup.rotation.x = ActiveFlip.TargetX;
                    CoinGroup.rotation.y = ActiveFlip.TargetY;
                    CoinGroup.rotation.z = ActiveFlip.TargetZ;
                    CoinGroup.position.y = 0;
                    CurrentSide = FinishedSide;
                    ActiveGlow = {
                        StartedAt: performance.now(),
                        Delay: 0,
                        Duration: 1800,
                    };
                    if (FlipButton)
                    {
                        FlipButton.disabled = false;
                    }
                    SetResultText(FinishedSide);
                    if (!ActiveFlip.RevealSoundPlayed)
                    {
                        StopFlipAudio();
                        window.GamblingApp?.playSound?.("coinflip-reveal", {
                            restart: true,
                        });
                    }
                    IdleFloatStartedAt = performance.now();
                    ActiveFlip = null;
                    ResolveFinished?.(FinishedSide);
                    Container.dispatchEvent(
                        new CustomEvent("coinflip:finished", {
                            detail: {
                                side: FinishedSide,
                            },
                        }),
                    );
                }
            }
        }

        if (ActiveGlow)
        {
            const GlowElapsed = performance.now() - ActiveGlow.StartedAt;
            const DelayedElapsed = GlowElapsed - ActiveGlow.Delay;

            if (DelayedElapsed <= 0)
            {
                GlowMaterial.opacity = 0;
                GlowSecondaryMaterial.opacity = 0;
                WinLight.intensity = 0;
            }
            else
            {
                const GlowProgress = Math.min(DelayedElapsed / ActiveGlow.Duration, 1);
                const GlowPulse = Math.sin(GlowProgress * Math.PI);
                const GlowFade = Math.pow(1 - GlowProgress, 0.45);
                const GlowStrength = GlowPulse * GlowFade;

                GlowMaterial.opacity = 0.38 * GlowStrength;
                GlowSecondaryMaterial.opacity = 0.22 * GlowStrength;
                GlowSprite.scale.setScalar(5.2 + GlowPulse * 0.34);
                GlowSecondary.scale.setScalar(4.4 + GlowPulse * 0.2);
                WinLight.intensity = 2.1 * GlowStrength;

                if (GlowProgress >= 1)
                {
                    GlowMaterial.opacity = 0;
                    GlowSecondaryMaterial.opacity = 0;
                    GlowSprite.scale.setScalar(5.3);
                    GlowSecondary.scale.setScalar(4.5);
                    WinLight.intensity = 0;
                    ActiveGlow = null;
                }
            }
        }

        if (!ActiveFlip)
        {
            const IdleElapsed = performance.now() - IdleFloatStartedAt;
            const IdleFloat = Math.sin(IdleElapsed * 0.0017) * 0.045;
            CoinGroup.position.y = IdleFloat;
        }

        GlowGroup.position.x = CoinGroup.position.x;
        GlowGroup.position.y = CoinGroup.position.y;
        GlowGroup.position.z = CoinGroup.position.z - 0.55;

        Renderer.render(Scene, Camera);
    };
    Render();

    return () =>
    {
        window.cancelAnimationFrame(AnimationFrame);
        ResizeObserverInstance.disconnect();
        FlipButton?.removeEventListener("click", HandleManualFlip);
        Container.removeEventListener("coinflip:play", HandleExternalFlip);
        Container.removeEventListener("coinflip:set-side", HandleExternalSetSide);
        delete Container.CoinflipController;
        StopFlipAudio();
        window.GamblingApp?.stopSound?.("coinflip-reveal");
        Renderer.dispose();
        CoinEdgeGeometry.dispose();
        EdgeMaterial.dispose();
        FrontFace.geometry.dispose();
        BackFace.geometry.dispose();
        FrontFace.material.dispose();
        BackFace.material.dispose();
        FrontRim.geometry.dispose();
        FrontRim.material.dispose();
        BackRim.geometry.dispose();
        BackRim.material.dispose();
        GlowMaterial.dispose();
        GlowSecondaryMaterial.dispose();
        FaceAlphaTexture?.dispose();
        HeadTexture?.dispose();
        TailsTexture?.dispose();
        EdgeTexture?.dispose();
        GlowTexture?.dispose();
    };
};

const InitializeCoinViewerPage = ({ main }) =>
{
    const Container = main.querySelector("[data-coin-viewer]");

    if (!Container)
    {
        return null;
    }

    try
    {
        return MountCoinViewer(Container);
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        ShowFallback(Container, "The 3D viewer could not be initialized in this browser.");
        return null;
    }
};

window.GamblingApp?.registerPageInitializer("coinflip-session", InitializeCoinViewerPage);
