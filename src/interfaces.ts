import {Operation} from "./ai/operations/Operation";
import {Empire} from "./ai/Empire";
import {Agent} from "./ai/agents/Agent";
import {SpawnGroup} from "./ai/SpawnGroup";
import {HostileAgent} from "./ai/agents/HostileAgent";

// noinspection TsLint
export interface bonzAI {
    cache: {
        structures: { [roomName: string]: {[structureType: string]: Structure[]} },
        hostiles: { [roomName: string]: Creep[] },
        hostilesAndLairs: { [roomName: string]: RoomObject[] }
        lairThreats: { [roomName: string]: StructureKeeperLair[] }
        fleeObjects: { [roomName: string]: RoomObject[] }
        mineralCount: { [mineralType: string]: number }
        labProcesses: { [resourceType: string]: number }
        activeLabCount: number;
        placedRoad: boolean;
    };
    operations: {[opName: string]: Operation }
    empire: Empire;
}

export interface TransportAnalysis {
    load: number;
    distance: number;
    cartsNeeded: number;
    carryCount: number;
    moveCount: number;
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
    boosts?: string[];
    allowUnboosted?: boolean;
    altSpawnGroup?: SpawnGroup;
}

export interface SpawnReservation {
    spawns: number;
    currentEnergy: number;
}

export interface BoostRequests {
    [resourceType: string]: {
        requesterIds: string[];
    };
}

export interface RaidData {
    raidAgents: Agent[];
    injuredCreeps: {[creepName: string]: number};
    fallback: boolean;
    attackFlag: Flag;
    attackRoom: Room;
    fallbackFlag: Flag;
    obstacles: {pos: RoomPosition}[];
    targetFlags: Flag[];
    targetStructures: Structure[];
    raidMatrix: CostMatrix;
    nextNuke: number;
}

export interface FleeAnalysis {
    fleeType: FleeType;
    closestToHealer: number;
    closestToAttacker: number;
    rangeToClosest: number;
    singleMover?: Agent;
    singleMoveDirection?: number;
    attackerLeads?: boolean;
}

export enum FleeType {
    SingleMove,
    SafeToTravel,
    KeepAtRange,
    Flee
}

export enum FleeDanger {
    VeryHigh,
    High,
    Medium,
    Low,
    None,
}

export interface RaidMissionState {
    bothInRoom: boolean;
    neitherInRoom: boolean;
    atLeastOneInRoom: boolean;
    bothOnExit: boolean;
    neitherOnExit: boolean;
    bothNearExit: boolean;
    fatigued: boolean;
    together: boolean;
    inSameRoom: boolean;
    oneInRoom: boolean;
    agentInDanger: boolean;
}

export interface RaidAction {
    type: RaidActionType;
    endAtTick?: number;
    position?: {x: number, y: number, roomName: string};
    id?: string;
}

export enum RaidActionType {
    Retreat,
    Headhunter,
    EdgeScoot,
    Wallflower,
    LurkOutside,
}

export interface RaidCache {
    breachPositions: RoomPosition[];
    breachStructures: string[];
    attackRoom: string;
    fallbackRoom: string;
    fallbackPos: RoomPosition;
    targetStructures: string[];
    matrix: number[];
    expectedDamage: number;
    avgWallHits: number;
    bestExit: RoomPosition;
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

export interface BankData {
    pos: RoomPosition;
    hits: number;
    power: number;
    assisting?: boolean;
    finishing?: boolean;
    distance: number;
    timeout: number;
    posCount: number;
    wavesLeft: number;
}

export interface FleeData {
    path: string;
    nextPos: RoomPosition;
    delay: number;
}

export interface BuildingPlannerData {
    name: string;
    pivot: {x: number, y: number };
    radius: number;
    taper: number;
    buildings: {[structureType: string]: {
        pos: {
            x: number,
            y: number
        }[]
    }}
}
