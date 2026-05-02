import * as CANNON from "https://esm.sh/cannon-es@0.20.0";
import * as THREE from "https://esm.sh/three@0.164.0";
import * as BufferGeometryUtils from "https://esm.sh/three@0.164.0/examples/jsm/utils/BufferGeometryUtils.js";

const DiceVisualSettings = {
    edgeRadius: 0.08,
    notchDepth: 0.17,
    notchRadius: 0.15,
    segments: 40,
};
const PhysicsSettings = {
    forceJitter: 3,
    forceMin: 6,
    friction: 0.1,
    gravityY: -50,
    impulsePointZ: -0.5,
    maxSearchAttempts: 120,
    maxSimulationSteps: 260,
    restitution: 0.3,
    sleepTimeLimit: 0.02,
    stepTime: 1 / 60,
};
const LiftSettings = {
    durationMs: 420,
};
const TopResetSettings = {
    durationMs: 280,
};
const SpawnSettings = {
    classic: {
        shared: {
            impulseDirection: -1,
            x: 0,
            y: 4.35,
            z: 1.75,
        },
    },
    double: {
        left: {
            impulseDirection: 1,
            x: -0.15,
            y: 4.55,
            z: 1.7,
        },
        right: {
            impulseDirection: -1,
            x: 0.15,
            y: 4.55,
            z: 1.7,
        },
    },
    first_to: {
        creator: {
            impulseDirection: 1,
            x: -0.35,
            y: 4.7,
            z: 1.65,
        },
        opponent: {
            impulseDirection: -1,
            x: 0.35,
            y: 4.7,
            z: 1.65,
        },
    },
};
const LaneBounds = {
    backZ: 3.05,
    frontZ: -3.15,
    halfWidth: 2.7,
};
const LaneCenters = {
    classic: {
        shared: 0,
    },
    double: {
        left: -0.88,
        right: 0.88,
    },
    first_to: {
        creator: -1.55,
        opponent: 1.55,
    },
};
const CameraSettings = {
    classic: {
        fov: 40,
        lookAt: new THREE.Vector3(0, 2.45, 0),
        position: new THREE.Vector3(0, 7.35, 9.35),
    },
    double: {
        fov: 41,
        lookAt: new THREE.Vector3(0, 2.8, 0),
        position: new THREE.Vector3(0, 7.8, 10.2),
    },
    first_to: {
        fov: 42,
        lookAt: new THREE.Vector3(0, 3.2, 0),
        position: new THREE.Vector3(0, 8.1, 11.05),
    },
};
const RestHeight = 0.56;

const AddListener = (CleanupFunctions, Target, EventName, Handler) =>
{
    if (!Target)
    {
        return;
    }

    Target.addEventListener(EventName, Handler);
    CleanupFunctions.push(() =>
    {
        Target.removeEventListener(EventName, Handler);
    });
};

const ClampDieValue = (Value) =>
{
    const ParsedValue = Number.parseInt(Value, 10);

    if (!Number.isFinite(ParsedValue))
    {
        return 1;
    }

    return Math.min(Math.max(ParsedValue, 1), 6);
};

const CreateFaceQuaternion = (FaceValue) =>
{
    const Face = ClampDieValue(FaceValue);
    const EulerValue = new THREE.Euler(0, 0, 0, "XYZ");

    if (Face === 2)
    {
        EulerValue.set(0, 0, 0.5 * Math.PI);
    }
    else if (Face === 3)
    {
        EulerValue.set(-0.5 * Math.PI, 0, 0);
    }
    else if (Face === 4)
    {
        EulerValue.set(0.5 * Math.PI, 0, 0);
    }
    else if (Face === 5)
    {
        EulerValue.set(0, 0, -0.5 * Math.PI);
    }
    else if (Face === 6)
    {
        EulerValue.set(Math.PI, 0, 0);
    }

    return new THREE.Quaternion().setFromEuler(EulerValue);
};

const CreateShadowPlane = (Scene) =>
{
    const ShadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24, 1, 1),
        new THREE.ShadowMaterial({
            opacity: 0.11,
        }),
    );

    ShadowPlane.position.set(0, 0, 0);
    ShadowPlane.quaternion.setFromEuler(new THREE.Euler(-0.5 * Math.PI, 0, 0));
    ShadowPlane.receiveShadow = true;
    Scene.add(ShadowPlane);
    return ShadowPlane;
};

const CreateBoxGeometry = () =>
{
    let BoxGeometry = new THREE.BoxGeometry(
        1,
        1,
        1,
        DiceVisualSettings.segments,
        DiceVisualSettings.segments,
        DiceVisualSettings.segments,
    );
    const PositionAttribute = BoxGeometry.attributes.position;
    const SubCubeHalfSize = 0.5 - DiceVisualSettings.edgeRadius;

    const NotchWave = (Value) =>
    {
        let WaveValue = (1 / DiceVisualSettings.notchRadius) * Value;
        WaveValue = Math.PI * Math.max(-1, Math.min(1, WaveValue));
        return DiceVisualSettings.notchDepth * (Math.cos(WaveValue) + 1);
    };
    const Notch = (PositionValue) => NotchWave(PositionValue[0]) * NotchWave(PositionValue[1]);

    for (let Index = 0; Index < PositionAttribute.count; Index += 1)
    {
        let PositionValue = new THREE.Vector3().fromBufferAttribute(PositionAttribute, Index);
        const SubCube = new THREE.Vector3(
            Math.sign(PositionValue.x),
            Math.sign(PositionValue.y),
            Math.sign(PositionValue.z),
        ).multiplyScalar(SubCubeHalfSize);
        const Addition = new THREE.Vector3().subVectors(PositionValue, SubCube);

        if (
            Math.abs(PositionValue.x) > SubCubeHalfSize &&
            Math.abs(PositionValue.y) > SubCubeHalfSize &&
            Math.abs(PositionValue.z) > SubCubeHalfSize
        )
        {
            Addition.normalize().multiplyScalar(DiceVisualSettings.edgeRadius);
            PositionValue = SubCube.add(Addition);
        }
        else if (Math.abs(PositionValue.x) > SubCubeHalfSize && Math.abs(PositionValue.y) > SubCubeHalfSize)
        {
            Addition.z = 0;
            Addition.normalize().multiplyScalar(DiceVisualSettings.edgeRadius);
            PositionValue.x = SubCube.x + Addition.x;
            PositionValue.y = SubCube.y + Addition.y;
        }
        else if (Math.abs(PositionValue.x) > SubCubeHalfSize && Math.abs(PositionValue.z) > SubCubeHalfSize)
        {
            Addition.y = 0;
            Addition.normalize().multiplyScalar(DiceVisualSettings.edgeRadius);
            PositionValue.x = SubCube.x + Addition.x;
            PositionValue.z = SubCube.z + Addition.z;
        }
        else if (Math.abs(PositionValue.y) > SubCubeHalfSize && Math.abs(PositionValue.z) > SubCubeHalfSize)
        {
            Addition.x = 0;
            Addition.normalize().multiplyScalar(DiceVisualSettings.edgeRadius);
            PositionValue.y = SubCube.y + Addition.y;
            PositionValue.z = SubCube.z + Addition.z;
        }

        const Offset = 0.23;

        if (PositionValue.y === 0.5)
        {
            PositionValue.y -= Notch([PositionValue.x, PositionValue.z]);
        }
        else if (PositionValue.x === 0.5)
        {
            PositionValue.x -= Notch([PositionValue.y + Offset, PositionValue.z + Offset]);
            PositionValue.x -= Notch([PositionValue.y - Offset, PositionValue.z - Offset]);
        }
        else if (PositionValue.z === 0.5)
        {
            PositionValue.z -= Notch([PositionValue.x - Offset, PositionValue.y + Offset]);
            PositionValue.z -= Notch([PositionValue.x, PositionValue.y]);
            PositionValue.z -= Notch([PositionValue.x + Offset, PositionValue.y - Offset]);
        }
        else if (PositionValue.z === -0.5)
        {
            PositionValue.z += Notch([PositionValue.x + Offset, PositionValue.y + Offset]);
            PositionValue.z += Notch([PositionValue.x + Offset, PositionValue.y - Offset]);
            PositionValue.z += Notch([PositionValue.x - Offset, PositionValue.y + Offset]);
            PositionValue.z += Notch([PositionValue.x - Offset, PositionValue.y - Offset]);
        }
        else if (PositionValue.x === -0.5)
        {
            PositionValue.x += Notch([PositionValue.y + Offset, PositionValue.z + Offset]);
            PositionValue.x += Notch([PositionValue.y + Offset, PositionValue.z - Offset]);
            PositionValue.x += Notch([PositionValue.y, PositionValue.z]);
            PositionValue.x += Notch([PositionValue.y - Offset, PositionValue.z + Offset]);
            PositionValue.x += Notch([PositionValue.y - Offset, PositionValue.z - Offset]);
        }
        else if (PositionValue.y === -0.5)
        {
            PositionValue.y += Notch([PositionValue.x + Offset, PositionValue.z + Offset]);
            PositionValue.y += Notch([PositionValue.x + Offset, PositionValue.z]);
            PositionValue.y += Notch([PositionValue.x + Offset, PositionValue.z - Offset]);
            PositionValue.y += Notch([PositionValue.x - Offset, PositionValue.z + Offset]);
            PositionValue.y += Notch([PositionValue.x - Offset, PositionValue.z]);
            PositionValue.y += Notch([PositionValue.x - Offset, PositionValue.z - Offset]);
        }

        PositionAttribute.setXYZ(Index, PositionValue.x, PositionValue.y, PositionValue.z);
    }

    BoxGeometry.deleteAttribute("normal");
    BoxGeometry.deleteAttribute("uv");
    BoxGeometry = BufferGeometryUtils.mergeVertices(BoxGeometry);
    BoxGeometry.computeVertexNormals();
    return BoxGeometry;
};

const CreateDiceMeshTemplate = () =>
{
    const Group = new THREE.Group();
    const InnerSide = 1 - DiceVisualSettings.edgeRadius;
    const OuterMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.22,
    });
    const InnerMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 1,
        roughness: 0,
    });
    const InnerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(InnerSide, InnerSide, InnerSide),
        InnerMaterial,
    );
    const OuterMesh = new THREE.Mesh(CreateBoxGeometry(), OuterMaterial);

    OuterMesh.castShadow = true;
    Group.add(InnerMesh, OuterMesh);
    return Group;
};

const CreatePhysicsWorld = () =>
{
    const World = new CANNON.World({
        allowSleep: true,
        gravity: new CANNON.Vec3(0, PhysicsSettings.gravityY, 0),
    });

    World.defaultContactMaterial.restitution = PhysicsSettings.restitution;
    World.defaultContactMaterial.friction = PhysicsSettings.friction;
    return World;
};

const AddWorldPlane = (World, PositionValue, EulerValue) =>
{
    const Body = new CANNON.Body({
        shape: new CANNON.Plane(),
        type: CANNON.Body.STATIC,
    });

    Body.position.set(PositionValue.x, PositionValue.y, PositionValue.z);
    Body.quaternion.setFromEuler(EulerValue.x, EulerValue.y, EulerValue.z);
    World.addBody(Body);
    return Body;
};

const CreateLaneBounds = (World) =>
{
    AddWorldPlane(
        World,
        {
            x: 0,
            y: 0,
            z: 0,
        },
        {
            x: -0.5 * Math.PI,
            y: 0,
            z: 0,
        },
    );
    AddWorldPlane(
        World,
        {
            x: -LaneBounds.halfWidth,
            y: 0,
            z: 0,
        },
        {
            x: 0,
            y: 0.5 * Math.PI,
            z: 0,
        },
    );
    AddWorldPlane(
        World,
        {
            x: LaneBounds.halfWidth,
            y: 0,
            z: 0,
        },
        {
            x: 0,
            y: -0.5 * Math.PI,
            z: 0,
        },
    );
    AddWorldPlane(
        World,
        {
            x: 0,
            y: 0,
            z: LaneBounds.backZ,
        },
        {
            x: 0,
            y: Math.PI,
            z: 0,
        },
    );
    AddWorldPlane(
        World,
        {
            x: 0,
            y: 0,
            z: LaneBounds.frontZ,
        },
        {
            x: 0,
            y: 0,
            z: 0,
        },
    );
};

const CreateBody = (World) =>
{
    const Body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
        sleepTimeLimit: PhysicsSettings.sleepTimeLimit,
    });

    World.addBody(Body);
    return Body;
};

const SetBodyTransform = (Body, PositionValue, QuaternionValue) =>
{
    Body.position.set(PositionValue.x, PositionValue.y, PositionValue.z);
    Body.quaternion.set(
        QuaternionValue.x,
        QuaternionValue.y,
        QuaternionValue.z,
        QuaternionValue.w,
    );

    if (Body.previousPosition)
    {
        Body.previousPosition.copy(Body.position);
    }

    if (Body.interpolatedPosition)
    {
        Body.interpolatedPosition.copy(Body.position);
    }

    if (Body.initPosition)
    {
        Body.initPosition.copy(Body.position);
    }

    if (Body.previousQuaternion)
    {
        Body.previousQuaternion.copy(Body.quaternion);
    }

    if (Body.interpolatedQuaternion)
    {
        Body.interpolatedQuaternion.copy(Body.quaternion);
    }

    if (Body.initQuaternion)
    {
        Body.initQuaternion.copy(Body.quaternion);
    }
};

const ResetBody = (Body, PositionValue, QuaternionValue) =>
{
    Body.velocity.setZero();
    Body.angularVelocity.setZero();
    Body.force.setZero();
    Body.torque.setZero();
    Body.allowSleep = true;
    SetBodyTransform(Body, PositionValue, QuaternionValue);
    Body.wakeUp();
};

const SyncActorMeshFromBody = (Actor, Body) =>
{
    Actor.mesh.position.set(Body.position.x, Body.position.y, Body.position.z);
    Actor.mesh.quaternion.set(
        Body.quaternion.x,
        Body.quaternion.y,
        Body.quaternion.z,
        Body.quaternion.w,
    );
};

const GetActorFacePosition = (Actor, PositionMode = "rest") =>
{
    if (PositionMode === "current")
    {
        const CurrentPosition = Actor.renderBody?.position || Actor.mesh.position;

        return {
            x: CurrentPosition.x,
            y: CurrentPosition.y,
            z: CurrentPosition.z,
        };
    }

    if (PositionMode === "top")
    {
        return {
            x: Actor.spawnPosition.x,
            y: Actor.spawnPosition.y,
            z: Actor.spawnPosition.z,
        };
    }

    return {
        x: 0,
        y: RestHeight,
        z: 0,
    };
};

const SetActorFace = (Actor, FaceValue, OptionsValue = {}) =>
{
    const PositionValue = GetActorFacePosition(Actor, OptionsValue.position);

    Actor.mesh.visible = true;
    Actor.mesh.position.set(PositionValue.x, PositionValue.y, PositionValue.z);
    Actor.mesh.quaternion.copy(CreateFaceQuaternion(FaceValue));
    Actor.currentFace = ClampDieValue(FaceValue);

    const CannonQuaternion = new CANNON.Quaternion(
        Actor.mesh.quaternion.x,
        Actor.mesh.quaternion.y,
        Actor.mesh.quaternion.z,
        Actor.mesh.quaternion.w,
    );
    const RestPosition = new CANNON.Vec3(PositionValue.x, PositionValue.y, PositionValue.z);

    ResetBody(Actor.renderBody, RestPosition, CannonQuaternion);
    ResetBody(Actor.simulationBody, RestPosition, CannonQuaternion);
    Actor.renderBody.sleep();
    Actor.simulationBody.sleep();
};

const ReadFaceFromQuaternion = (QuaternionValue) =>
{
    const EulerValue = new CANNON.Vec3();
    QuaternionValue.toEuler(EulerValue);

    const Epsilon = 0.1;
    const IsZero = (AngleValue) => Math.abs(AngleValue) < Epsilon;
    const IsHalfPi = (AngleValue) => Math.abs(AngleValue - (0.5 * Math.PI)) < Epsilon;
    const IsMinusHalfPi = (AngleValue) => Math.abs((0.5 * Math.PI) + AngleValue) < Epsilon;
    const IsPiOrMinusPi = (AngleValue) =>
    {
        return Math.abs(Math.PI - AngleValue) < Epsilon || Math.abs(Math.PI + AngleValue) < Epsilon;
    };

    if (IsZero(EulerValue.z))
    {
        if (IsZero(EulerValue.x))
        {
            return 1;
        }

        if (IsHalfPi(EulerValue.x))
        {
            return 4;
        }

        if (IsMinusHalfPi(EulerValue.x))
        {
            return 3;
        }

        if (IsPiOrMinusPi(EulerValue.x))
        {
            return 6;
        }

        return null;
    }

    if (IsHalfPi(EulerValue.z))
    {
        return 2;
    }

    if (IsMinusHalfPi(EulerValue.z))
    {
        return 5;
    }

    return null;
};

const BuildRollSeed = () =>
{
    return {
        force: PhysicsSettings.forceMin + (PhysicsSettings.forceJitter * Math.random()),
        rotationX: Math.random(),
        rotationZ: Math.random(),
    };
};

const CreateSpawnVector = (SpawnValue) =>
{
    return new THREE.Vector3(
        SpawnValue.x,
        SpawnValue.y,
        SpawnValue.z,
    );
};

const CreateCannonQuaternion = (QuaternionValue) =>
{
    return new CANNON.Quaternion(
        QuaternionValue.x,
        QuaternionValue.y,
        QuaternionValue.z,
        QuaternionValue.w,
    );
};

const CreateLaunchQuaternion = (SeedValue) =>
{
    return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
            2 * Math.PI * SeedValue.rotationX,
            0,
            2 * Math.PI * SeedValue.rotationZ,
            "XYZ",
        ),
    );
};

const ApplyRollSeed = (Body, SeedValue, Actor) =>
{
    const LaunchQuaternion = new CANNON.Quaternion();
    LaunchQuaternion.setFromEuler(
        2 * Math.PI * SeedValue.rotationX,
        0,
        2 * Math.PI * SeedValue.rotationZ,
    );

    ResetBody(
        Body,
        new CANNON.Vec3(
            Actor.spawnPosition.x,
            Actor.spawnPosition.y,
            Actor.spawnPosition.z,
        ),
        LaunchQuaternion,
    );
    Body.applyImpulse(
        new CANNON.Vec3(Actor.impulseDirection * SeedValue.force, SeedValue.force, 0),
        new CANNON.Vec3(0, 0, PhysicsSettings.impulsePointZ),
    );
};

const MeasureRollSeedDurationMs = (Actor, SeedValue) =>
{
    ApplyRollSeed(Actor.simulationBody, SeedValue, Actor);

    for (let StepIndex = 0; StepIndex < PhysicsSettings.maxSimulationSteps; StepIndex += 1)
    {
        Actor.simulationWorld.step(PhysicsSettings.stepTime);

        if (Actor.simulationBody.sleepState === CANNON.Body.SLEEPING)
        {
            return Math.round((StepIndex + 1) * PhysicsSettings.stepTime * 1000);
        }
    }

    return Math.round(PhysicsSettings.maxSimulationSteps * PhysicsSettings.stepTime * 1000);
};

const FindRollPlan = (Actor, TargetFace) =>
{
    const Face = ClampDieValue(TargetFace);

    for (let Attempt = 0; Attempt < PhysicsSettings.maxSearchAttempts; Attempt += 1)
    {
        const SeedValue = BuildRollSeed();

        ApplyRollSeed(Actor.simulationBody, SeedValue, Actor);

        for (let StepIndex = 0; StepIndex < PhysicsSettings.maxSimulationSteps; StepIndex += 1)
        {
            Actor.simulationWorld.step(PhysicsSettings.stepTime);

            if (Actor.simulationBody.sleepState !== CANNON.Body.SLEEPING)
            {
                continue;
            }

            if (ReadFaceFromQuaternion(Actor.simulationBody.quaternion) === Face)
            {
                return {
                    durationMs: Math.round((StepIndex + 1) * PhysicsSettings.stepTime * 1000),
                    seed: SeedValue,
                };
            }

            break;
        }
    }

    const FallbackSeed = BuildRollSeed();

    return {
        durationMs: MeasureRollSeedDurationMs(Actor, FallbackSeed),
        seed: FallbackSeed,
    };
};

const CreateActor = (Scene, DiceMeshTemplate, Key, CenterX, SpawnValue) =>
{
    const Group = new THREE.Group();
    const Mesh = DiceMeshTemplate.clone();
    const RenderWorld = CreatePhysicsWorld();
    const SimulationWorld = CreatePhysicsWorld();

    CreateLaneBounds(RenderWorld);
    CreateLaneBounds(SimulationWorld);

    Group.position.set(CenterX, 0, 0);
    Group.add(Mesh);
    Scene.add(Group);

    const Actor = {
        currentFace: 1,
        group: Group,
        impulseDirection: SpawnValue.impulseDirection,
        key: Key,
        mesh: Mesh,
        renderBody: CreateBody(RenderWorld),
        renderWorld: RenderWorld,
        simulationBody: CreateBody(SimulationWorld),
        simulationWorld: SimulationWorld,
        spawnPosition: CreateSpawnVector(SpawnValue),
    };

    SetActorFace(Actor, 1);
    return Actor;
};

const MountDiceViewer = (Root, Options = {}) =>
{
    const {
        mode = "classic",
    } = Options;
    const SceneElement = Root.matches("[data-dice-scene]") ? Root : Root.querySelector("[data-dice-scene]");
    const CanvasElement = Root.querySelector("[data-dice-canvas]");
    const IsFirstToMode = mode === "first_to";
    const IsDoubleMode = mode === "double";
    const IsMultiDieMode = IsFirstToMode || IsDoubleMode;

    if (!SceneElement || !CanvasElement)
    {
        return null;
    }

    const CleanupFunctions = [];
    const Renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: CanvasElement,
    });
    const Scene = new THREE.Scene();
    const CameraPreset = IsFirstToMode
        ? CameraSettings.first_to
        : (IsDoubleMode ? CameraSettings.double : CameraSettings.classic);
    const Camera = new THREE.PerspectiveCamera(CameraPreset.fov, 1, 0.1, 100);
    const DiceMeshTemplate = CreateDiceMeshTemplate();
    const ShadowPlane = CreateShadowPlane(Scene);
    const Actors = new Map();
    const IndicatorWraps = IsFirstToMode
        ? new Map([
            [
                "creator",
                Root.querySelector('[data-dice-indicator-wrap="creator"]'),
            ],
            [
                "opponent",
                Root.querySelector('[data-dice-indicator-wrap="opponent"]'),
            ],
        ])
        : new Map();
    const RollQueue = [];
    const ProjectionVector = new THREE.Vector3();
    let ActiveRoll = null;
    let ActiveTopReset = null;
    let IsDestroyed = false;
    let LastFrameTime = performance.now();
    let PhysicsAccumulator = 0;

    Renderer.shadowMap.enabled = true;
    Renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    Camera.position.copy(CameraPreset.position);
    Camera.lookAt(CameraPreset.lookAt);

    Scene.add(new THREE.AmbientLight(0xffffff, 1));

    const MainLight = new THREE.PointLight(0xffffff, 1000);
    MainLight.position.set(10, 20, 5);
    MainLight.castShadow = true;
    MainLight.shadow.mapSize.width = 2048;
    MainLight.shadow.mapSize.height = 2048;
    Scene.add(MainLight);

    if (IsFirstToMode)
    {
        Actors.set(
            "creator",
            CreateActor(
                Scene,
                DiceMeshTemplate,
                "creator",
                LaneCenters.first_to.creator,
                SpawnSettings.first_to.creator,
            ),
        );
        Actors.set(
            "opponent",
            CreateActor(
                Scene,
                DiceMeshTemplate,
                "opponent",
                LaneCenters.first_to.opponent,
                SpawnSettings.first_to.opponent,
            ),
        );
    }
    else if (IsDoubleMode)
    {
        Actors.set(
            "left",
            CreateActor(
                Scene,
                DiceMeshTemplate,
                "left",
                LaneCenters.double.left,
                SpawnSettings.double.left,
            ),
        );
        Actors.set(
            "right",
            CreateActor(
                Scene,
                DiceMeshTemplate,
                "right",
                LaneCenters.double.right,
                SpawnSettings.double.right,
            ),
        );
    }
    else
    {
        Actors.set(
            "shared",
            CreateActor(
                Scene,
                DiceMeshTemplate,
                "shared",
                LaneCenters.classic.shared,
                SpawnSettings.classic.shared,
            ),
        );
    }

    const ResolveActorKey = (PlayerKey) =>
    {
        if (Actors.has(PlayerKey))
        {
            return PlayerKey;
        }

        if (IsFirstToMode)
        {
            return PlayerKey === "opponent" ? "opponent" : "creator";
        }

        return "shared";
    };

    const GetActor = (PlayerKey) =>
    {
        return Actors.get(ResolveActorKey(PlayerKey));
    };

    const UpdateIndicators = () =>
    {
        if (!IsFirstToMode || !IndicatorWraps.size)
        {
            return;
        }

        const Width = Math.max(SceneElement.clientWidth, 1);
        const Height = Math.max(SceneElement.clientHeight, 1);

        IndicatorWraps.forEach((Wrap, PlayerKey) =>
        {
            const Actor = GetActor(PlayerKey);

            if (!Wrap || !Actor || !Actor.mesh.visible)
            {
                if (Wrap)
                {
                    Wrap.dataset.visible = "false";
                }
                return;
            }

            ProjectionVector.set(
                Actor.mesh.position.x,
                Actor.mesh.position.y + 1.24,
                Actor.mesh.position.z,
            );
            Actor.group.localToWorld(ProjectionVector);
            ProjectionVector.project(Camera);

            if (
                !Number.isFinite(ProjectionVector.x) ||
                !Number.isFinite(ProjectionVector.y) ||
                ProjectionVector.z < -1 ||
                ProjectionVector.z > 1
            )
            {
                Wrap.dataset.visible = "false";
                return;
            }

            const Left = (ProjectionVector.x * 0.5 + 0.5) * Width;
            const Top = Math.max(((-ProjectionVector.y * 0.5) + 0.5) * Height - 10, 22);

            Wrap.dataset.visible = "true";
            Wrap.style.transform = `translate(${Left}px, ${Top}px) translate(-50%, -100%)`;
        });
    };

    const UpdateSceneSize = () =>
    {
        const Width = Math.max(SceneElement.clientWidth, 1);
        const Height = Math.max(SceneElement.clientHeight, 1);

        Camera.aspect = Width / Height;
        Camera.updateProjectionMatrix();
        Renderer.setSize(Width, Height, false);
        ShadowPlane.scale.set(IsMultiDieMode ? 0.92 : 0.82, 0.72, 1);
        UpdateIndicators();
        Renderer.render(Scene, Camera);
    };

    const CancelRoll = (RollValue, ResolveValue = null) =>
    {
        if (!RollValue)
        {
            return;
        }

        RollValue.resolve?.(ResolveValue);
    };

    const CancelTopReset = (ResolveValue = null) =>
    {
        if (!ActiveTopReset)
        {
            return;
        }

        ActiveTopReset.resolve?.(ResolveValue);
        ActiveTopReset = null;
    };

    const StartNextRoll = () =>
    {
        if (ActiveRoll || !RollQueue.length || IsDestroyed)
        {
            return;
        }

        const NextRoll = RollQueue.shift();
        const PreparedRolls = (NextRoll.rolls || [])
            .map((RollItem) =>
            {
                const Actor = GetActor(RollItem.player);

                if (!Actor)
                {
                    return null;
                }

                const RollPlan = FindRollPlan(Actor, RollItem.face);

                Actor.mesh.visible = true;

                return {
                    actor: Actor,
                    durationMs: RollPlan?.durationMs || 0,
                    face: RollItem.face,
                    finished: false,
                    launchQuaternion: CreateLaunchQuaternion(RollPlan.seed),
                    seed: RollPlan.seed,
                    spawnPosition: new THREE.Vector3(
                        Actor.spawnPosition.x,
                        Actor.spawnPosition.y,
                        Actor.spawnPosition.z,
                    ),
                    startPosition: Actor.mesh.position.clone(),
                    startQuaternion: Actor.mesh.quaternion.clone(),
                };
            })
            .filter((RollItem) => Boolean(RollItem));

        if (!PreparedRolls.length)
        {
            NextRoll.resolve?.(null);
            StartNextRoll();
            return;
        }

        const TargetDurationMs = LiftSettings.durationMs + Math.max(
            ...PreparedRolls.map((RollValue) =>
            {
                return Number(RollValue.durationMs) || 0;
            }),
            0,
        ) + 120;

        window.GamblingApp?.playSound?.("dice-roll", {
            restart: false,
            targetDurationMs: TargetDurationMs,
        });

        Root.dispatchEvent(
            new CustomEvent("dice:started", {
                detail:
                    PreparedRolls.length === 1
                        ? {
                            face: PreparedRolls[0].face,
                            player: PreparedRolls[0].actor.key,
                        }
                        : {
                            players: PreparedRolls.map((RollItem) =>
                            {
                                return {
                                    face: RollItem.face,
                                    player: RollItem.actor.key,
                                };
                            }),
                        },
            }),
        );

        ActiveRoll = {
            phase: "lifting",
            startedAt: performance.now(),
            resolve: NextRoll.resolve,
            rolls: PreparedRolls,
        };
    };

    const BeginPhysicsRoll = (RollValue) =>
    {
        ApplyRollSeed(RollValue.actor.renderBody, RollValue.seed, RollValue.actor);
        SyncActorMeshFromBody(RollValue.actor, RollValue.actor.renderBody);
    };

    const FinalizeRoll = (RollValue) =>
    {
        const LandedFace = ReadFaceFromQuaternion(RollValue.actor.renderBody.quaternion);

        if (LandedFace !== RollValue.face)
        {
            // Keep the landed spot and only correct the orientation if the physics roll settles on the wrong face.
            SetActorFace(RollValue.actor, RollValue.face, {
                position: "current",
            });
        }
        else
        {
            SyncActorMeshFromBody(RollValue.actor, RollValue.actor.renderBody);
            RollValue.actor.currentFace = RollValue.face;
        }

        RollValue.finished = true;
        Root.dispatchEvent(
            new CustomEvent("dice:finished", {
                detail: {
                    face: RollValue.face,
                    player: RollValue.actor.key,
                },
            }),
        );
    };

    const FinishActiveRoll = () =>
    {
        if (!ActiveRoll)
        {
            return;
        }

        const CompletedRoll = ActiveRoll;
        const ResultValue = CompletedRoll.rolls.length === 1
            ? CompletedRoll.rolls[0].face
            : CompletedRoll.rolls.reduce((Results, RollValue) =>
            {
                Results[RollValue.actor.key] = RollValue.face;
                return Results;
            }, {});

        ActiveRoll = null;
        window.GamblingApp?.stopSound?.("dice-roll");
        CompletedRoll.resolve?.(ResultValue);
        StartNextRoll();
    };

    const StopAllRolls = (ResolveValue = null) =>
    {
        while (RollQueue.length)
        {
            CancelRoll(RollQueue.shift(), ResolveValue);
        }

        window.GamblingApp?.stopSound?.("dice-roll");

        if (!ActiveRoll)
        {
            return;
        }

        CancelRoll(ActiveRoll, ResolveValue);
        ActiveRoll = null;
    };

    const ResetPlayersToTop = (PlayersByKey = {}) =>
    {
        if (IsDestroyed)
        {
            return Promise.resolve(null);
        }

        const PlayerKeys = Array.isArray(PlayersByKey)
            ? PlayersByKey
            : Object.entries(PlayersByKey)
                .filter(([, VisibleValue]) => Boolean(VisibleValue))
                .map(([PlayerKey]) => PlayerKey);
        const ResetTargets = PlayerKeys
            .map((PlayerKey) => GetActor(PlayerKey))
            .filter((Actor) => Boolean(Actor) && Actor.mesh.visible)
            .map((Actor) =>
            {
                return {
                    actor: Actor,
                    endPosition: Actor.spawnPosition.clone(),
                    endQuaternion: CreateFaceQuaternion(1),
                    startPosition: Actor.mesh.position.clone(),
                    startQuaternion: Actor.mesh.quaternion.clone(),
                };
            });

        if (!ResetTargets.length)
        {
            return Promise.resolve(null);
        }

        StopAllRolls(null);
        CancelTopReset(null);

        return new Promise((Resolve) =>
        {
            ActiveTopReset = {
                resolve: Resolve,
                startedAt: performance.now(),
                targets: ResetTargets,
            };
        });
    };

    const SetPlayersVisible = (PlayersByKey = {}) =>
    {
        CancelTopReset(null);
        Object.entries(PlayersByKey).forEach(([PlayerKey, VisibleValue]) =>
        {
            const Actor = GetActor(PlayerKey);

            if (!Actor)
            {
                return;
            }

            Actor.mesh.visible = Boolean(VisibleValue);
        });

        UpdateIndicators();
        Renderer.render(Scene, Camera);
    };

    const SetFace = (FaceValue, OptionsValue = {}) =>
    {
        if (IsDestroyed)
        {
            return;
        }

        const Actor = GetActor(OptionsValue.player);

        if (!Actor)
        {
            return;
        }

        StopAllRolls(null);
        CancelTopReset(null);
        SetActorFace(Actor, FaceValue, OptionsValue);
        UpdateIndicators();
        Renderer.render(Scene, Camera);
    };

    const SetFaces = (FacesByPlayer = {}, OptionsValue = {}) =>
    {
        if (IsDestroyed)
        {
            return;
        }

        StopAllRolls(null);
        CancelTopReset(null);

        Object.entries(FacesByPlayer).forEach(([PlayerKey, FaceValue]) =>
        {
            const Actor = GetActor(PlayerKey);

            if (!Actor)
            {
                return;
            }

            SetActorFace(Actor, FaceValue, OptionsValue);
        });

        UpdateIndicators();
        Renderer.render(Scene, Camera);
    };

    const QueueRollSet = (Rolls, Resolve) =>
    {
        RollQueue.push({
            resolve: Resolve,
            rolls: Rolls,
        });
        StartNextRoll();
    };

    const Play = (FaceValue, OptionsValue = {}) =>
    {
        if (IsDestroyed)
        {
            return Promise.resolve(null);
        }

        const Actor = GetActor(OptionsValue.player);

        if (!Actor)
        {
            return Promise.resolve(null);
        }

        return new Promise((Resolve) =>
        {
            QueueRollSet([
                {
                    face: ClampDieValue(FaceValue),
                    player: Actor.key,
                },
            ], Resolve);
        });
    };

    const PlayFaces = (FacesByPlayer = {}) =>
    {
        if (IsDestroyed)
        {
            return Promise.resolve(null);
        }

        const RollEntries = Object.entries(FacesByPlayer)
            .map(([PlayerKey, FaceValue]) =>
            {
                const Actor = GetActor(PlayerKey);

                if (!Actor)
                {
                    return null;
                }

                return {
                    face: ClampDieValue(FaceValue),
                    player: Actor.key,
                };
            })
            .filter((RollEntry) => Boolean(RollEntry));

        if (!RollEntries.length)
        {
            return Promise.resolve(null);
        }

        return new Promise((Resolve) =>
        {
            QueueRollSet(RollEntries, Resolve);
        });
    };

    UpdateSceneSize();

    AddListener(CleanupFunctions, window, "resize", UpdateSceneSize);

    if (typeof ResizeObserver === "function")
    {
        const SceneResizeObserver = new ResizeObserver(() =>
        {
            UpdateSceneSize();
        });
        SceneResizeObserver.observe(SceneElement);
        CleanupFunctions.push(() =>
        {
            SceneResizeObserver.disconnect();
        });
    }

    window.requestAnimationFrame(() =>
    {
        UpdateSceneSize();
        window.requestAnimationFrame(UpdateSceneSize);
    });

    Renderer.setAnimationLoop(() =>
    {
        const CurrentTime = performance.now();
        const DeltaTimeSeconds = Math.min((CurrentTime - LastFrameTime) / 1000, 0.1);
        LastFrameTime = CurrentTime;

        if (ActiveTopReset)
        {
            const ResetProgress = Math.min(
                (CurrentTime - ActiveTopReset.startedAt) / TopResetSettings.durationMs,
                1,
            );
            const EasedResetProgress = THREE.MathUtils.smootherstep(ResetProgress, 0, 1);

            ActiveTopReset.targets.forEach((Target) =>
            {
                Target.actor.mesh.position.lerpVectors(
                    Target.startPosition,
                    Target.endPosition,
                    EasedResetProgress,
                );
                Target.actor.mesh.quaternion.slerpQuaternions(
                    Target.startQuaternion,
                    Target.endQuaternion,
                    EasedResetProgress,
                );
            });

            if (ResetProgress >= 1)
            {
                const CompletedReset = ActiveTopReset;

                CompletedReset.targets.forEach((Target) =>
                {
                    Target.actor.mesh.position.copy(Target.endPosition);
                    Target.actor.mesh.quaternion.copy(Target.endQuaternion);
                    Target.actor.currentFace = 1;
                    ResetBody(
                        Target.actor.renderBody,
                        new CANNON.Vec3(Target.endPosition.x, Target.endPosition.y, Target.endPosition.z),
                        CreateCannonQuaternion(Target.endQuaternion),
                    );
                    ResetBody(
                        Target.actor.simulationBody,
                        new CANNON.Vec3(Target.endPosition.x, Target.endPosition.y, Target.endPosition.z),
                        CreateCannonQuaternion(Target.endQuaternion),
                    );
                    Target.actor.renderBody.sleep();
                    Target.actor.simulationBody.sleep();
                });

                ActiveTopReset = null;
                CompletedReset.resolve?.(true);
            }
        }
        else if (ActiveRoll)
        {
            if (ActiveRoll.phase === "lifting")
            {
                const LiftElapsed = CurrentTime - ActiveRoll.startedAt;
                const LiftProgress = Math.min(LiftElapsed / LiftSettings.durationMs, 1);
                const EasedProgress = THREE.MathUtils.smootherstep(LiftProgress, 0, 1);

                ActiveRoll.rolls.forEach((RollValue) =>
                {
                    RollValue.actor.mesh.position.lerpVectors(
                        RollValue.startPosition,
                        RollValue.spawnPosition,
                        EasedProgress,
                    );
                    RollValue.actor.mesh.quaternion.slerpQuaternions(
                        RollValue.startQuaternion,
                        RollValue.launchQuaternion,
                        EasedProgress,
                    );
                });

                if (LiftProgress >= 1)
                {
                    ActiveRoll.rolls.forEach((RollValue) =>
                    {
                        BeginPhysicsRoll(RollValue);
                    });
                    ActiveRoll.phase = "rolling";
                    PhysicsAccumulator = 0;
                }
            }
            else
            {
                PhysicsAccumulator += DeltaTimeSeconds;

                while (PhysicsAccumulator >= PhysicsSettings.stepTime)
                {
                    ActiveRoll.rolls.forEach((RollValue) =>
                    {
                        if (RollValue.finished)
                        {
                            return;
                        }

                        RollValue.actor.renderWorld.step(PhysicsSettings.stepTime);
                        SyncActorMeshFromBody(RollValue.actor, RollValue.actor.renderBody);

                        if (RollValue.actor.renderBody.sleepState === CANNON.Body.SLEEPING)
                        {
                            FinalizeRoll(RollValue);
                        }
                    });
                    PhysicsAccumulator -= PhysicsSettings.stepTime;

                    if (ActiveRoll.rolls.every((RollValue) => RollValue.finished))
                    {
                        FinishActiveRoll();
                        break;
                    }
                }
            }
        }
        else
        {
            PhysicsAccumulator = 0;
        }

        UpdateIndicators();
        Renderer.render(Scene, Camera);
    });

    Root.DiceController = {
        play: Play,
        playFaces: PlayFaces,
        resetPlayersToTop: ResetPlayersToTop,
        setFace: SetFace,
        setFaces: SetFaces,
        setPlayersVisible: SetPlayersVisible,
    };

    return () =>
    {
        IsDestroyed = true;
        StopAllRolls(null);
        CancelTopReset(null);
        Renderer.setAnimationLoop(null);
        delete Root.DiceController;
        window.GamblingApp?.stopSound?.("dice-roll");

        for (let Index = CleanupFunctions.length - 1; Index >= 0; Index -= 1)
        {
            try
            {
                CleanupFunctions[Index]();
            }
            catch (ErrorValue)
            {
                console.error(ErrorValue);
            }
        }

        Actors.forEach((Actor) =>
        {
            Scene.remove(Actor.group);
        });
        Scene.remove(ShadowPlane);
        Renderer.dispose();
    };
};

const InitializeDiceViewerPage = ({ main }) =>
{
    const Root = main.querySelector("[data-dice-viewer]");
    const SessionRoot = main.querySelector("[data-dice-session]");

    if (!Root)
    {
        return null;
    }

    try
    {
        return MountDiceViewer(Root, {
            mode:
                SessionRoot?.dataset.diceDoubleRoll === "true"
                    ? "double"
                    : (SessionRoot?.dataset.diceMode || "classic"),
        });
    }
    catch (ErrorValue)
    {
        console.error(ErrorValue);
        return null;
    }
};

window.GamblingApp?.registerPageInitializer("dice-session", InitializeDiceViewerPage);
/* github-refresh: 2026-05-02T02:31:53Z */
