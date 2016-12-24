export const TICK_TRANSPORT_ANALYSIS = 1;
export const TICK_FULL_REPORT = 0;

export const DESTINATION_REACHED = -1201;
export const ROOMTYPE_SOURCEKEEPER = -1301;
export const ROOMTYPE_CORE = -1302;
export const ROOMTYPE_CONTROLLER = -1303;
export const ROOMTYPE_ALLEY = -1304;

export const OBSERVER_PURPOSE_ALLYTRADE = "allyTrade";

export const CACHE_INVALIDATION_FREQUENCY = 1000;
export const CACHE_INVALIDATION_PERIOD = 10;

export const PRIORITY_BUILD: string[] = [
    STRUCTURE_SPAWN,
    STRUCTURE_TOWER,
    STRUCTURE_EXTENSION,
    STRUCTURE_ROAD,
    STRUCTURE_CONTAINER,
    STRUCTURE_LINK,
    STRUCTURE_STORAGE
];
export const LOADAMOUNT_MINERAL = Math.ceil(33 / 6);
export const ALLIES = {
    "taiga": true,
    "Reini": true,
    "bonzaiferroni": true,
    "SteeleR": true,
    "Vervorris": true,
    "Jeb": true,
    "danny": true,
    "Atavus": true,
    "Ashburnie": true,
    "ricane": true,
    "trebbettes": true,
};

export const TRADE_PARTNERS = {
    "bonzaiferroni": true,
    "taiga": true,
    "Reini": true,
    "Vervorris": true,
    "Jeb": true,
    "trebbettes": true,
    "ricane": true,
};

export const USERNAME = _.first(_.toArray(Game.structures)).owner.username;

export enum OperationPriority { Emergency, OwnedRoom, VeryHigh, High, Medium, Low, VeryLow }

// these are the constants that govern your energy balance
// rooms below this will try to pull energy...
export const NEED_ENERGY_THRESHOLD = 200000;
// ...from rooms above this.
export const SUPPLY_ENERGY_THRESHOLD = 250000;
// rooms that are above this will try to push energy to any room accepting energy (like swap operations)
export const SUPPLY_SWAP_THRESHOLD = 300000;
// rooms above this will start processing power
export const POWER_PROCESS_THRESHOLD = 350000;
// rooms above this will spawn a more powerful wall-builder to try to sink energy that way
export const ENERGYSINK_THRESHOLD = 450000;
export const SWAP_RESERVE = 950000;

export const MINERALS_RAW = ["H", "O", "Z", "U", "K", "L", "X"];
export const PRODUCT_LIST = ["XUH2O", "XLHO2", "XKHO2", "XGHO2", "XZHO2", "XZH2O", "G", "XLH2O", "XGH2O"];
export const TRADE_RESOURCES = PRODUCT_LIST.concat(MINERALS_RAW).concat([RESOURCE_POWER, RESOURCE_ENERGY]);
export const TRADE_MAX_DISTANCE = 6;
export const TRADE_ENERGY_AMOUNT = 10000;
export const IGOR_CAPACITY = 1000;
export const RESERVE_AMOUNT = 5000;
// terminals with more than this will try to trade a mineral in the network
export const PRODUCTION_AMOUNT = Math.ceil((RESERVE_AMOUNT * 2) / IGOR_CAPACITY) * IGOR_CAPACITY;

export const RESOURCE_VALUE = {
    energy: .05,
    H: 1,
    O: 1,
    Z: 1,
    K: 1,
    U: 1,
    L: 1,
    X: 1,
};

export const PRODUCT_PRICE = {
    XUH2O: 6,
    XLHO2: 6,
    XKHO2: 6,
    XZHO2: 6,
    XZH2O: 6,
    XLH2O: 6,
    XGH2O: 8,
    XGHO2: 8,
    G: 3,
};

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
    XKHO2: ["KHO2", "X"]
};
