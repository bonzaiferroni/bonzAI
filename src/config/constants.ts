export const DESTINATION_REACHED = -1201;
export const CACHE_INVALIDATION_FREQUENCY = 1000;
export const CACHE_INVALIDATION_PERIOD = 10;
export const MAX_HARVEST_DISTANCE = 2;
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
// this is a hacky fix, was getting an error for the calculation of PRODUCTION_AMOUNT because it wasn't defined yet
let RESERVE_AMOUNT = 5000;
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

export const OPERATION_NAMES = [
    "domo", "boca", "lima", "root", "lima", "gato", "fret", "thad", "colo", "pony",
    "moon", "oslo", "pita", "gaol", "snek", "kiev", "bonn", "dili", "cali", "nuuk",
    "suva", "lome", "bern", "mija", "mano", "casa", "flor", "baja", "jefe", "flux",
    "jeux", "cozy", "lupe", "hazy", "jugs", "quip", "jibs", "quay", "zany", "mojo",
    "zarf", "expo", "mump", "huck", "prex", "djin", "hymn", "club", "whap", "nxfo",
];

export const REAGENT_LIST: {[prodctName: string]: string[]} = {};

for (let reagent1 in REACTIONS) {
    let reactionList = REACTIONS[reagent1];
    for (let reagent2 in reactionList) {
        let product = reactionList[reagent2];
        REAGENT_LIST[product] = [reagent1, reagent2];
    }
}
