declare var module: any;
declare var global: any;

interface Memory {
    rooms: {[roomName: string]: RoomMemory };
    temp: any;
    stats: any;
    roomAttacks: any;
    hostileMemory: any;
    empire: any;
    strangerDanger: {[username: string]: StrangerReport[] };
    traders: {[username: string]: { [resourceType: string]: number; }};
    resourceOrder: {[time: number]: ResourceOrder};
    playerConfig: {
        terminalNetworkRange: number;
        enableStats: boolean;
        muteSpawn: boolean;
        creditReserveAmount: number;
        powerMinimum: number;
        saverMode: boolean;
    };
    profiler: {[identifier: string]: ProfilerData };
    notifier: {
        time: number,
        earthTime: string,
        message: string,
    }[];
    powerObservers: {[scanningRoomName: string]: {[roomName: string]: number}};
    cpu: {
        history: number[];
        average: number;
    };
    nextGC: number;
    gameTimeLastTick: number;
    viz: {[tick: number]: any };
    version: number;
    flagCount: number;
}

interface Room {
    basicMatrix: CostMatrix;
    findStructures<T>(structureType: string): T[];
    hostiles: Creep[];
    hostilesAndLairs: RoomObject[];
    fleeObjects: (Creep|Structure)[];
    coords: RoomCoord;
    roomType: number;
    _defaultMatrix: CostMatrix;
    defaultMatrix: CostMatrix;
    structures: {[structureType: string]: Structure[] };
    memory: RoomMemory;
    serializePosition(position: {x: number, y: number, roomName: string}): number;
    deserializePosition(serializedPosition: number): RoomPosition;
    serializePositionTest(position: {x: number, y: number, roomName: string}): string;
    deserializePositionTest(serializedPosition: string): RoomPosition;
}

interface RoomMemory {
    owner: string;
    avoid: number;
    srcPos: string;
    level: number;
    nextTrade: number;
    nextScan: number;
    nextRadar: number;
    radarData: { x: number, y: number };
    spawnMemory: any;
    boostRequests: {[boostType: string]: {flagName: string, requesterIds: string[]} };
    portal: string;
    portalEnd: number;
    builder: {
        demolish: string,
        nextCheck: number,
    };
    layout: LayoutData;
    finder: LayoutFinderData;
    observation: Observation;
}

interface LayoutFinderData {
    sourcePositions: RoomPosition[];
    controllerPos: RoomPosition;
    mineralPos: RoomPosition;
    obstacleMap?: any;
    progress?: LayoutFinderProgress;
    validLayouts?: {[typeName: string]: ValidLayoutData[] };
}

interface LayoutFinderProgress {
    anchor: Vector2;
    rotation: number;
    typeIndex: number;
    final: boolean;
}

interface ValidLayoutData {
    data: LayoutData;
    energyScore: number;
    structureScore: number;
    foundSpawn: boolean;
}

interface LayoutData {
    type: string;
    anchor: Vector2;
    rotation: number;
    flex?: boolean;
    turtle?: boolean;
}
type Vector2 = {x: number, y: number}

interface RoomCoord {
    x: number;
    y: number;
    xDir: string;
    yDir: string;
}

interface RoomPosition {
    getFleeOptions(roomObject: RoomObject): RoomPosition[];
    bestFleePosition(roomObject: RoomObject): RoomPosition;
    openAdjacentSpots(ignoreCreeps?: boolean): RoomPosition[];
    getPositionAtDirection(direction: number, range?: number): RoomPosition;
    isPassible(ignoreCreeps?: boolean): boolean;
    lookForStructure(structureType: string): Structure;
    isNearExit(range: number): boolean;
    getRangeToClosest(positions: {pos: RoomPosition}[] | RoomPosition[]): number;
    terrainCost(): number;
}

interface RoomObject {
    findMemoStructure<T>(structureType: string, range: number, immediate?: boolean): T;
}

interface Creep {
    partCount(partType: string): number;
    blindMoveTo(destination: {pos: RoomPosition}, ops?: any, dareDevil?: boolean): number;
    travelTo(destination: {pos: RoomPosition}|RoomPosition, ops?: any);
    hitsTemp: number;
}

interface CreepMemory {
    boosts: string[];
    inPosition: boolean;
    scavanger: string;
}

interface ProfilerData {
    total: number;
    count: number;
    costPerCall: number;
    costPerTick: number;
    callsPerTick: number;
    cpu: number;
    consoleReport: boolean;
    period: number;
    highest: number;
    endOfPeriod: number;
    lastTickTracked: number;
    max: number;
}

interface ResourceOrder {
    resourceType: string;
    amountSent: number;
    roomName: string;
    amount: number;
    efficiency: number;
}

interface StrangerReport {
    tickSeen: number;
    roomName: string;
}

interface StructureKeeperLair {
    keeper: Creep;
}

interface StructureObserver {
    observation: Observation;
    _observeRoom(roomName: string): number;
    observeRoom(roomName: string, purpose?: string, override?: boolean): number;
}

interface Observation {
    purpose: string;
    roomName: string;
    room?: Room;
}

interface StructureTerminal extends OwnedStructure {
    _send(resourceType: string, amount: number, roomName: string, description?: string): number;
    send(resourceType: string, amount: number, roomName: string, description?: string): number;
}

interface StructureTower {
    alreadyFired: boolean;
    _repair(target: Structure | Spawn): number;
}
