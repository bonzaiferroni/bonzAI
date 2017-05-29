import {RESERVE_AMOUNT} from "../ai/TradeNetwork";
export const DESTINATION_REACHED = -1201;
export const CACHE_INVALIDATION_FREQUENCY = 1000;
export const CACHE_INVALIDATION_PERIOD = 10;
export const MAX_HARVEST_DISTANCE = 2;
export const RAID_CREEP_MATRIX_COST = 40;
export const MAX_HARVEST_PATH = 165;

export const PRIORITY_BUILD: string[] = [
    STRUCTURE_SPAWN,
    STRUCTURE_TOWER,
    STRUCTURE_ROAD,
    STRUCTURE_RAMPART,
    STRUCTURE_EXTENSION,
    STRUCTURE_CONTAINER,
    STRUCTURE_LINK,
    STRUCTURE_STORAGE,
];
export const LOADAMOUNT_MINERAL = Math.ceil(33 / 6);

export const USERNAME = _.first(_.toArray(Game.structures)).owner.username;

export enum OperationPriority { Emergency, OwnedRoom, VeryHigh, High, Medium, Low, VeryLow }

export enum Direction {
    North = 1,
    NorthEast = 2,
    East = 3,
    SouthEast = 4,
    South = 5,
    SouthWest = 6,
    West = 7,
    NorthWest = 8
}
export const IGOR_CAPACITY = 1000;
// terminals with more than this will try to trade a mineral in the network
export const PRODUCTION_AMOUNT = Math.ceil((RESERVE_AMOUNT * 2) / IGOR_CAPACITY) * IGOR_CAPACITY;

export const MINERAL_STORAGE_TARGET = {
    H: 150000,
    O: 150000,
    K: 100000,
    Z: 100000,
    U: 100000,
    L: 100000,
    X: 140000,
};

export const REAGENT_LIST = {
    KO: ["K", "O"],
    UH: ["U", "H"],
    UO: ["U", "O"],
    OH: ["O", "H"],
    LO: ["L", "O"],
    LH: ["L", "H"],
    ZO: ["Z", "O"],
    ZH: ["Z", "H"],
    ZK: ["Z", "K"],
    UL: ["U", "L"],
    G: ["ZK", "UL"],
    GH: ["G", "H"],
    GO: ["G", "O"],
    UH2O: ["UH", "OH"],
    UHO2: ["UO", "OH"],
    GH2O: ["GH", "OH"],
    GHO2: ["GO", "OH"],
    LHO2: ["LO", "OH"],
    LH2O: ["LH", "OH"],
    ZHO2: ["ZO", "OH"],
    ZH2O: ["ZH", "OH"],
    KHO2: ["KO", "OH"],
    XUH2O: ["X", "UH2O"],
    XUHO2: ["X", "UHO2"],
    XGH2O: ["X", "GH2O"],
    XGHO2: ["X", "GHO2"],
    XLHO2: ["X", "LHO2"],
    XLH2O: ["X", "LH2O"],
    XZHO2: ["ZHO2", "X"],
    XZH2O: ["ZH2O", "X"],
    XKHO2: ["KHO2", "X"],
};

export const OPERATION_NAMES = [
    "domo", "boca", "lima", "root", "lima", "gato", "fret", "thad", "colo", "pony",
    "moon", "oslo", "pita", "gaol", "snek", "kiev", "bonn", "dili", "cali", "nuuk",
    "suva", "lome", "bern", "mija", "mano", "casa", "flor", "baja", "jefe", "flux",
    "jeux", "cozy", "lupe", "hazy", "jugs", "quip", "jibs", "quay", "zany", "mojo",
    "zarf", "expo", "mump", "huck", "prex", "djin", "hymn", "club", "whap", "nxfo",
];
