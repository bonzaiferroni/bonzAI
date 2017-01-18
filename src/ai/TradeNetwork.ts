import {WorldMap} from "./WorldMap";
export class TradeNetwork {

    public storages: StructureStorage[] = [];
    public terminals: StructureTerminal[] = [];

    private shortages: {[resourceType: string]: StructureTerminal[] } = {};
    private surpluses: {[resourceType: string]: StructureTerminal[] } = {};
    private _inventory: {[key: string]: number};
    private map: WorldMap;

    private alreadyTraded: {[roomName: string]: boolean } = {};

    private memory: {
        tradeRoomIndex: number;
    };

    constructor(map: WorldMap) {
        this.map = map;

        if (!Memory.empire) { Memory.empire = {}; }
        this.memory = Memory.empire;
    }

    init() {
        this.registerMyRooms();
        this.registerPartnerRooms();
    }

    public actions() {
        this.observeTradeRoom();
        this.tradeMonkey();
        this.reportTransactions();
    }

    // should only be accessed after Init()
    get inventory(): {[key: string]: number} {
        if (!this._inventory) {
            let inventory: {[key: string]: number } = {};

            for (let terminal of this.terminals) {

                for (let mineralType in terminal.store) {
                    if (!terminal.store.hasOwnProperty(mineralType)) continue;
                    if (inventory[mineralType] === undefined) {
                        inventory[mineralType] = 0;
                    }
                    inventory[mineralType] += terminal.store[mineralType];
                }
            }

            // gather mineral/storage data
            for (let storage of this.storages) {
                for (let mineralType in storage.store) {
                    if (inventory[mineralType] === undefined) {
                        inventory[mineralType] = 0;
                    }
                    inventory[mineralType] += storage.store[mineralType];
                }
            }

            this._inventory = inventory;
        }
        return this._inventory;
    }

    private observeTradeRoom() {
        let tradeRoomNames = Object.keys(this.map.tradeMap);
        if (tradeRoomNames.length === 0) { return; }

        let count = 0;
        while (count < tradeRoomNames.length) {
            if (this.memory.tradeRoomIndex === undefined || this.memory.tradeRoomIndex >= tradeRoomNames.length) {
                this.memory.tradeRoomIndex = 0;
            }
            let roomName = tradeRoomNames[this.memory.tradeRoomIndex++];
            let room = Game.rooms[roomName];
            if (room) {
                count++;
                continue;
            }

            let roomMemory = this.map.tradeMap[roomName];
            if (Game.time < roomMemory.nextTrade) {
                count++;
                continue;
            }

            let observer = this.findObserver(roomName);
            if (!observer) {
                roomMemory.nextTrade = Game.time + 10000;
                count++;
                continue;
            }

            observer.observeRoom(roomName, "tradeNetwork");
            break;
        }
    }

    private findObserver(observedRoomName: string): StructureObserver  {
        for (let observingRoomName in this.map.controlledRooms) {
            if (Game.map.getRoomLinearDistance(observedRoomName, observingRoomName) > 10) { continue; }
            let room = this.map.controlledRooms[observingRoomName];
            if (room.controller.level < 8) { continue; }
            let observer = _(room.find<StructureObserver>(FIND_STRUCTURES))
                .filter(s => s.structureType === STRUCTURE_OBSERVER)
                .head();
            if (observer) { return observer; }
        }
    }

    /**
     * Used to determine whether there is an abundance of a given resource type among all terminals.
     * Should only be used after init() phase
     * @param resourceType
     * @param amountPerRoom - specify how much per missionRoom you consider an abundance, default value is SURPLUS_AMOUNT
     */
    public hasAbundance(resourceType: string, amountPerRoom = RESERVE_AMOUNT * 2) {
        let abundanceAmount = this.terminals.length * amountPerRoom;
        return this.inventory[resourceType] && this.inventory[resourceType] > abundanceAmount;
    }

    private registerMyRooms() {
        for (let roomName in this.map.controlledRooms) {
            let room = this.map.controlledRooms[roomName];
            if (room.terminal && room.terminal.my && room.controller.level >= 6) {
                this.terminals.push(room.terminal);
            }
            if (room.storage && room.storage.my && room.controller.level >= 4) {
                this.storages.push(room.storage);
            }

            if (TradeNetwork.canTrade(room)) {
                this.analyzeResources(room);
            }
        }
    }

    private registerPartnerRooms() {
        for (let room of this.map.tradeRooms) {
            if (TradeNetwork.canTrade(room)) {
                this.analyzeResources(room);
            }
            else {
                delete room.memory.nextTrade;
            }
        }
    }

    public analyzeResources(room: Room) {

        let terminalFull = _.sum(room.terminal.store) > 270000;
        for (let resourceType of TRADE_RESOURCES) {
            if (resourceType === RESOURCE_ENERGY) {
                if (room.terminal.store.energy < 50000 && room.storage.store.energy < NEED_ENERGY_THRESHOLD
                    && !terminalFull) {
                    this.registerShortage(resourceType, room.terminal);
                }
                else if (room.storage.store.energy > SUPPLY_ENERGY_THRESHOLD) {
                    this.registerSurplus(resourceType, room.terminal);
                }
            }
            else {
                let amount = room.terminal.store[resourceType] || 0;
                if (amount < RESERVE_AMOUNT && !terminalFull) {
                    this.registerShortage(resourceType, room.terminal);
                }
                else if (amount >= SURPLUS_AMOUNT) {
                    this.registerSurplus(resourceType, room.terminal);
                }
            }
        }
    }

    private registerShortage(resourceType: string, terminal: StructureTerminal) {
        if (!this.shortages[resourceType]) { this.shortages[resourceType] = []}
        this.shortages[resourceType].push(terminal);
    }

    private registerSurplus(resourceType: string, terminal: StructureTerminal) {
        if (!terminal.my) { return; } // we could erase this if we were all running the same code
        if (!this.surpluses[resourceType]) { this.surpluses[resourceType] = []}
        this.surpluses[resourceType].push(terminal);
    }

    // connects shortages and surpluses
    private tradeMonkey() {

        for (let resourceType in this.shortages) {
            let shortageTerminals = this.shortages[resourceType];
            let surplusTerminals = this.surpluses[resourceType];
            if (!surplusTerminals) { continue; }
            for (let shortage of shortageTerminals) {
                let bestSurplus;
                let bestDistance = Number.MAX_VALUE;
                for (let surplus of surplusTerminals) {
                    let distance = Game.map.getRoomLinearDistance(shortage.room.name, surplus.room.name);
                    if (distance > bestDistance) { continue; }
                    if (distance > this.acceptableDistance(resourceType, surplus)) { continue; }
                    bestDistance = distance;
                    bestSurplus = surplus;
                }
                if (bestSurplus && !this.alreadyTraded[bestSurplus.room.name]) {
                    let requiredEnergy = 10000;
                    if (resourceType === RESOURCE_ENERGY) {
                        requiredEnergy = 30000;
                    }
                    if (bestSurplus.store.energy >= requiredEnergy) {
                        let amount = this.sendAmount(resourceType, shortage);
                        this.sendResource(bestSurplus, resourceType, amount, shortage);
                    }
                    this.alreadyTraded[bestSurplus.room.name] = true;
                }
            }
        }
    }

    private sendAmount(resourceType: string, shortage: StructureTerminal): number {
        if (resourceType === RESOURCE_ENERGY) { return TRADE_ENERGY_AMOUNT; }
        let amountStored = shortage.store[resourceType] || 0;
        return RESERVE_AMOUNT - amountStored;
    }

    private acceptableDistance(resourceType: string, surplus: StructureTerminal): number {
        if (IGNORE_TRADE_DISTANCE[resourceType]) { return Number.MAX_VALUE; }
        else if (resourceType === RESOURCE_ENERGY) {
            if (_.sum(surplus.room.storage.store) >= 950000) {
                return Number.MAX_VALUE;
            } else {
                return TRADE_DISTANCE;
            }
        } else {
            if (surplus.room.storage.store[resourceType] > 80000) {
                return Number.MAX_VALUE;
            } else {
                return TRADE_DISTANCE;
            }
        }
    }

    private sendResource(localTerminal: StructureTerminal, resourceType: string, amount: number, otherTerminal: StructureTerminal) {

        if (amount < 100) {
            amount = 100;
        }

        let outcome = localTerminal.send(resourceType, amount, otherTerminal.room.name);
        if (outcome !== OK) {
            console.log(`NETWORK: error sending resource in ${localTerminal.room.name}, outcome: ${outcome}`);
            console.log(`arguments used: ${resourceType}, ${amount}, ${otherTerminal.room.name}`);
        }
    }

    public static canTrade(room: Room) {
        return room.controller && room.controller.level >= 6 && room.storage && room.terminal
            && (!room.controller.sign || room.controller.sign.text !== "noTrade");
    }

    reportTransactions() {

        if (Game.time % 10 !== 0) return;

        let kFormatter = (num: number) => {
            return num > 999 ? (num/1000).toFixed(1) + 'k' : num
        };

        let consoleReport = (item: Transaction) => {
            let distance = Game.map.getRoomLinearDistance(item.from, item.to);
            let cost = Game.market.calcTransactionCost(item.amount, item.from, item.to);
            console.log(
                `TRADE: ${_.padLeft(`${item.from} ${item.sender ? item.sender.username : "npc"}`.substr(0, 12), 12)} ` +
                `→ ${_.pad(`${kFormatter(item.amount)} ${item.resourceType}`.substr(0, 12), 12)} → ` +
                `${_.padRight(`${item.to} ${item.recipient ? item.recipient.username : "npc"}`.substr(0, 12), 12)} ` +
                `(dist: ${distance}, cost: ${kFormatter(cost)})`
            );
        };

        for (let item of Game.market.incomingTransactions) {
            if (!item.sender) continue;
            if (item.time >= Game.time - 10) {
                let username = item.sender.username;
                if (!username) { username = "npc"; }
                if (!Memory.traders[username]) { Memory.traders[username] = {}; }
                if (Memory.traders[username][item.resourceType] === undefined) {
                    Memory.traders[username][item.resourceType] = 0;
                }
                Memory.traders[username][item.resourceType] += item.amount;
                consoleReport(item);
                this.processTransaction(item);
            }
            else {
                break;
            }
        }

        for (let item of Game.market.outgoingTransactions) {
            if (!item.recipient) continue;
            if (item.time >= Game.time - 10) {
                let username = item.recipient.username;
                if (!username) { username = "npc"; }
                if (!Memory.traders[username]) { Memory.traders[username] = {}; }
                if (Memory.traders[username][item.resourceType] === undefined) {
                    Memory.traders[username][item.resourceType] = 0;
                }
                Memory.traders[item.recipient.username][item.resourceType] -= item.amount;
                if (item.recipient.username === this.terminals[0].owner.username) { continue; }
                consoleReport(item);
            }
            else {
                break;
            }
        }
    }

    protected processTransaction(item: Transaction) { } // overridden in BonzaiNetwork
}

// these are the constants that govern your energy balance
// rooms below this will try to pull energy...
export const NEED_ENERGY_THRESHOLD = 200000;
// ...from rooms above this.
export const SUPPLY_ENERGY_THRESHOLD = 250000;
// rooms above this will start processing power
export const POWER_PROCESS_THRESHOLD = 350000;
// rooms above this will spawn a more powerful wall-builder to try to sink energy that way
export const ENERGYSINK_THRESHOLD = 450000;
export const RESERVE_AMOUNT = 5000;
export const SURPLUS_AMOUNT = 10000;
export const TRADE_DISTANCE = 6;
export const IGNORE_TRADE_DISTANCE = {
    ["XUH2O"]: true,
    ["XLHO2"]: true,
};
export const MINERALS_RAW = ["H", "O", "Z", "U", "K", "L", "X"];
export const PRODUCT_LIST = ["XUH2O", "XLHO2", "XLH2O", "XKHO2", "XGHO2", "XZHO2", "XZH2O", "G", "XGH2O"];
export const TRADE_RESOURCES = [RESOURCE_ENERGY].concat(PRODUCT_LIST).concat(MINERALS_RAW).concat([RESOURCE_POWER]);
export const TRADE_ENERGY_AMOUNT = 10000;