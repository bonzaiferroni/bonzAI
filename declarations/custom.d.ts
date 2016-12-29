declare var module: any;
declare var global: any;
declare var emp: any;

interface Game {
    cache: {
        structures: { [roomName: string]: {[structureType: string]: Structure[]} },
        hostiles:  { [roomName: string]: Creep[] },
        hostilesAndLairs: { [roomName: string]: RoomObject[] }
        mineralCount: { [mineralType: string]: number }
        labProcesses: { [resourceType: string]: number }
        activeLabCount: number;
        placedRoad: boolean;
    };
}

interface Room {
    basicMatrix: CostMatrix;
    findStructures<T>(structureType: string): T[];
    getAltBattery(roomObject?: RoomObject): StructureContainer | Creep;
    hostiles: Creep[];
    hostilesAndLairs: RoomObject[];
    coords: RoomCoord;
    roomType: number;
    _defaultMatrix: CostMatrix;
    defaultMatrix: CostMatrix;
}

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
    walkablePath(pos: RoomPosition, ignoreRoads?: boolean): RoomPosition[];
    findClosestByLongPath(roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition};
    findClosestByRoomRange(roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition};
    isNearExit(range: number): boolean;
    getPathDistanceTo(pos: RoomPosition, ignoreRoads?: boolean): number;
}

interface RoomObject {
    findMemoStructure<T>(structureType: string, range: number): T;
}

interface Creep {
    recycleSelf(container: StructureContainer);
    seekBoost(boosts: string[], allowUnboosted?: boolean): boolean;
    fleeHostiles(pathFinding?: boolean): boolean;
    fleeByPath(roomObject: RoomObject): number;
    blindMoveTo(target: RoomPosition, ops?: any, dareDevil?: boolean): number;
    blindMoveTo(target: {pos: RoomPosition}, ops?: any, dareDevil?: boolean): number;
    moveItOrLoseIt(position: RoomPosition, name?: string): number;
    idleOffRoad(defaultPoint: RoomObject): number;
    yieldRoad(target: RoomObject, allowSwamps?: boolean): number;
    _withdraw(target: Structure, resourceType: string, amount?: number): number;
    withdraw(target: Structure | Creep, resourceType: string, amount?: number): number;
    withdrawIfFull(target: Creep | Structure, resourceType: string): number;
    transferEverything(target: { store: StoreDefinition, pos: RoomPosition }): number;
    withdrawEverything(target: { store: StoreDefinition, pos: RoomPosition }): number;
    rememberBattery(): Creep | StructureContainer;
    rememberCreep(findCreep: () => Creep, forget: (creep: Creep) => boolean): Creep;
    rememberStructure<T>(findStructure: () => Structure, forget: (structure: Structure) => boolean, propertyName?: string): T;
    isNearExit(range: number): boolean;
    travelByWaypoint(flag: Flag[]): number;
    avoidSK(destination: {pos: RoomPosition}, opts?: any): number;
    partCount(partType: string): number;
    store: StoreDefinition;
    storeCapacity: number;
}

interface CreepMemory {
    boosts: string[];
    inPosition: boolean;
    scavanger: string;
}

interface Memory {
    // we can add any properties we intend to use here, instead of making Memory of type any
    temp: any;
    strangerDanger: {[username: string]: StrangerReport[] };
    stats: any;
    traders: {[username: string]: { [resourceType: string]: number; }};
    resourceOrder: {[time: number]: ResourceOrder};
    playerConfig: {
        terminalNetworkRange: number;
        enableStats: boolean;
        muteSpawn: boolean;
        creditReserveAmount: number;
        powerMinimum: number;
    };
    empire: any;
    profiler: {[identifier: string]: ProfilerData };
    roomAttacks: any;
}

interface ProfilerData {
    startOfPeriod: number;
    lastTickTracked: number;
    total: number;
    count: number;
    costPerCall: number;
    costPerTick: number;
    callsPerTick: number;
    cpu: number;
    consoleReport: boolean;
    period: number;
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

interface StructureController {
    getBattery(structureType?: string): StructureLink | StructureStorage | StructureContainer;
    getUpgraderPositions(): RoomPosition[];
}

interface StructureKeeperLair {
    keeper: Creep;
}

interface StructureObserver {
    observation: { purpose: string, room: Room };
    currentPurpose: string;
    _observeRoom(roomName: string): number;
    observeRoom(roomName: string, purpose?: string, override?: boolean): number;
}

interface StructureTerminal {
    _send(resourceType: string, amount: number, roomName: string, description?: string): number;
    send(resourceType: string, amount: number, roomName: string, description?: string): number;
}

interface StructureTower {
    alreadyFired: boolean;
    _repair(target: Structure | Spawn): number;
}