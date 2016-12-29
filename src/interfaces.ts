export interface TransportAnalysis {
    load: number;
    distance: number;
    body: string[];
    cartsNeeded: number;
    carryCount: number;
}

export interface IgorCommand {
    origin: string;
    destination: string;
    resourceType: string;
    amount?: number;
    reduceLoad?: boolean;
}

export interface LabProcess {
    targetShortage: Shortage;
    currentShortage: Shortage;
    reagentLoads: {[mineralType: string]: number};
    loadProgress: number;
}

export interface Shortage {
    mineralType: string;
    amount: number;
}

export interface PowerFlagScan {
    alleyRoomNames: string[];
    alleyIndex: number;
    flagIndex: number;
    matrices: {[roomName: string]: CostMatrix};
    avoidRooms: string[];
}

export interface HeadCountOptions {
    prespawn?: number;
    memory?: any;
    blindSpawn?: boolean;
    reservation?: SpawnReservation;
    disableNotify?: boolean;
    skipMoveToRoom?: boolean;
}

export interface SpawnReservation {
    spawns: number;
    currentEnergy: number;
}

export interface BoostRequests {
    [resourceType: string]: {
        flagName: string;
        requesterIds: string[];
    };
}

export interface RaidData {
    raidCreeps: Creep[];
    injuredCreeps: {[creepName: string]: number};
    breachFlags: Flag[];
    breachStructures: Structure[];
    attackRoom: Room;
    fallbackFlag: Flag;
    targetStructures: Structure[];
    fallback: boolean;
    obstacles: RoomObject[];
}

export interface RaidPositions {
    alfa: {
        healer: Flag;
        attacker: Flag;
    };
    bravo: {
        healer: Flag;
        attacker: Flag;
    };
    charlie: {
        healer: Flag;
        attacker: Flag;
    };
    fallback: Flag;
}

export interface SquadConfig {
    type: string;
    boostLevel: BoostLevel;
}

export interface Coord {
    x: number;
    y: number;
}

export enum BoostLevel { Training, Unboosted, Boosted, SuperTough, RCL7 }

export interface SeedSelection {
    seedType: string;
    origin: Coord;
    rotation: number;
    energyPerDistance: number;
}

export interface SeedData {
    sourceData: {pos: RoomPosition, amount: number}[];
    seedScan: {
        [seedType: string]: Coord[]
    };
    seedSelectData: {
        index: number
        rotation: number
        best: SeedSelection
    };
}

export interface TravelData {
    stuck: number;
    destination: RoomPosition;
    lastPos: RoomPosition;
    path: string;
}

export interface TravelToOptions {
    preferHighway?: boolean;
    ignoreRoads?: boolean;
    ignoreCreeps?: boolean;
    ignoreStructures?: boolean;
    range?: number;
}