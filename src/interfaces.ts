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
    positions: RaidPositions;
    breachStructure: Structure;
    targetStructures: Structure[];
    fallback: boolean;
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
export enum Direction { North = 1, NorthEast = 2, East = 3, SouthEast = 4, South = 5, SouthWest = 6, West = 7, NorthWest = 8 }