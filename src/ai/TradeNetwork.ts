import {WorldMap} from "./WorldMap";
import {Diplomat} from "./Diplomat";
import {Notifier} from "../notifier";
import {Observationer} from "./Observationer";
export class TradeNetwork {

    public storages: StructureStorage[];
    public terminals: StructureTerminal[];

    private shortages: {[resourceType: string]: StructureTerminal[] };
    private surpluses: {[resourceType: string]: StructureTerminal[] };
    private _inventory: {[key: string]: number};
    private map: WorldMap;
    private diplomat: Diplomat;

    private alreadyTraded: {[roomName: string]: boolean };

    private memory: {
        tradeRoomIndex: number;
    };

    constructor(map: WorldMap, diplomat: Diplomat) {
        this.map = map;
        this.diplomat = diplomat;
        if (!Memory.empire) { Memory.empire = {}; }
    }

    public update() {
        this.memory = Memory.empire;
        this.terminals = [];
        this.storages = [];
        this.shortages = {};
        this.surpluses = {};
        this.alreadyTraded = {};

        this.registerMyRooms();
        this.registerPartnerRooms();
    }

    public actions() {
        this.observeTradeRoom();
        this.tradeMonkey();
        this.reportTransactions();
        this.sendResourceOrder();
    }

    // should only be accessed after Init()
    get inventory(): {[key: string]: number} {
        if (!this._inventory) {
            let inventory: {[key: string]: number } = {};

            for (let terminal of this.terminals) {

                for (let mineralType in terminal.store) {
                    if (!terminal.store.hasOwnProperty(mineralType)) { continue; }
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

            let roomMemory = Memory.rooms[roomName];
            if (Game.time < roomMemory.nextTrade) {
                count++;
                continue;
            }

            Observationer.observeRoom(roomName, 10);
            break;
        }
    }

    /**
     * Used to determine whether there is an abundance of a given resource type among all terminals.
     * Should only be used after baseRefresh() phase
     * @param resourceType
     * @param amountPerRoom - specify how much per missionRoom you consider an abundance, default is SURPLUS_AMOUNT
     */
    public hasAbundance(resourceType: string, amountPerRoom = RESERVE_AMOUNT * 2) {
        let abundanceAmount = this.terminals.length * amountPerRoom;
        return this.inventory[resourceType] && this.inventory[resourceType] > abundanceAmount;
    }

    public sendBoost(boostType: string, roomName: string) {
        let underReserve = [];
        for (let terminal of this.terminals) {
            let amountStored = terminal.store[boostType];
            if (!amountStored || amountStored < 100) { continue; }
            if (amountStored < RESERVE_AMOUNT + 100) {
                underReserve.push(terminal);
                continue;
            }
            let sendAmount = amountStored - RESERVE_AMOUNT;
            let outcome = terminal.send(boostType, sendAmount, roomName);
            console.log(`NETWORK: sent ${sendAmount} of ${boostType} from ${terminal.room.name} to ${
                roomName} status: plenty -- outcome: ${outcome}`);
            if (outcome === OK) { return; }
        }

        let mostToSpare = _(underReserve)
            .filter(x => x.store[boostType] >= 100)
            .max(x => x.store[boostType]);
        if (!mostToSpare || _.isNumber(mostToSpare)) {
            console.log(`NETWORK: no ${boostType} available to send to ${roomName}`);
        }

        let status = "getting low";
        let amountStored = mostToSpare.store[boostType];
        let sendAmount = amountStored - 2000;
        if (sendAmount < 0) {
            sendAmount = amountStored;
            status = "last remaining";
        }
        let outcome = mostToSpare.send(boostType, sendAmount, roomName);
        console.log(`NETWORK: sent ${sendAmount} of ${boostType} from ${mostToSpare.room.name} to ${
            roomName} status: ${status} -- outcome: ${outcome}`);
    }

    public registerRoom(room: Room) {

        if (!room.storage || !room.terminal) { return; }

        this.terminals.push(room.terminal);
        this.storages.push(room.storage);

        if (TradeNetwork.canTrade(room)) {
            this.analyzeResources(room);
        }
    }

    private registerMyRooms() {
        for (let roomName in this.map.controlledRooms) {
            let room = this.map.controlledRooms[roomName];
            if (room.hostiles.length > 0) { continue; }
            if (room.memory.swap) { continue; }
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
            } else {
                delete room.memory.nextTrade;
            }
        }
    }

    public analyzeResources(room: Room) {

        let tradeResourceTypes = TRADE_WITH_SELF;
        if (!room.controller.my) {
            tradeResourceTypes = TRADE_WITH_PARTNERS;
        }

        let terminalFull = _.sum(room.terminal.store) > 270000;
        for (let resourceType of tradeResourceTypes) {
            if (resourceType === RESOURCE_ENERGY) {
                if (room.terminal.store.energy < 50000 && room.storage.store.energy < NEED_ENERGY_THRESHOLD) {
                    this.registerShortage(resourceType, room.terminal);
                } else if (room.storage.store.energy > SUPPLY_ENERGY_THRESHOLD) {
                    this.registerSurplus(resourceType, room.terminal);
                }
            } else {
                let amount = room.terminal.store[resourceType] || 0;
                if (amount < RESERVE_AMOUNT && !terminalFull) {
                    this.registerShortage(resourceType, room.terminal);
                } else if (amount >= RESERVE_AMOUNT + 1000) {
                    this.registerSurplus(resourceType, room.terminal);
                }
            }
        }
    }

    private registerShortage(resourceType: string, terminal: StructureTerminal) {
        if (!this.shortages[resourceType]) { this.shortages[resourceType] = []; }
        this.shortages[resourceType].push(terminal);
    }

    private registerSurplus(resourceType: string, terminal: StructureTerminal) {
        if (!terminal.my) { return; } // we could erase this if we were all running the same code
        if (!this.surpluses[resourceType]) { this.surpluses[resourceType] = []; }
        this.surpluses[resourceType].push(terminal);
    }

    // connects shortages and surpluses
    private tradeMonkey() {

        for (let resourceType in this.shortages) {
            let shortageTerminals = this.shortages[resourceType];
            let surplusTerminals = this.surpluses[resourceType];
            if (!surplusTerminals) { continue; }
            for (let shortage of shortageTerminals) {
                let bestSurplus: StructureTerminal;
                let bestDistance = Number.MAX_VALUE;
                for (let surplus of surplusTerminals) {
                    let distance = Game.map.getRoomLinearDistance(shortage.room.name, surplus.room.name);
                    if (distance > bestDistance) { continue; }
                    if (!shortage.my && distance > this.acceptableDistance(resourceType, surplus)) { continue; }
                    bestDistance = distance;
                    bestSurplus = surplus;
                }
                if (bestSurplus && !this.alreadyTraded[bestSurplus.room.name]) {
                    let requiredEnergy = 10000;
                    if (resourceType === RESOURCE_ENERGY) {
                        requiredEnergy = 30000;
                    }
                    if (bestSurplus.store.energy >= requiredEnergy) {
                        let amount = this.sendAmount(resourceType, shortage, bestSurplus);
                        this.sendResource(bestSurplus, resourceType, amount, shortage);
                    }
                    this.alreadyTraded[bestSurplus.room.name] = true;
                }
            }
        }
    }

    private sendAmount(resourceType: string, shortage: StructureTerminal, surplus: StructureTerminal): number {
        if (resourceType === RESOURCE_ENERGY) { return TRADE_ENERGY_AMOUNT; }
        let amountStored = shortage.store[resourceType] || 0;
        let amountNeeded = RESERVE_AMOUNT - amountStored;
        let amountAvailable = surplus.store[resourceType] - RESERVE_AMOUNT;
        return Math.min(amountNeeded, amountAvailable);
    }

    private acceptableDistance(resourceType: string, surplus: StructureTerminal): number {
        if (IGNORE_TRADE_DISTANCE[resourceType]) {
            return Number.MAX_VALUE;
        } else if (resourceType === RESOURCE_ENERGY) {
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

    private sendResource(localTerminal: StructureTerminal, resourceType: string, amount: number,
                         otherTerminal: StructureTerminal) {

        if (amount < 100) {
            amount = 100;
        }

        let outcome = localTerminal.send(resourceType, amount, otherTerminal.room.name);
        if (outcome !== OK && outcome !== ERR_TIRED) {
            console.log(`NETWORK: error sending resource in ${localTerminal.room.name}, outcome: ${outcome}`);
            console.log(`arguments used: ${resourceType}, ${amount}, ${otherTerminal.room.name}`);
        }
    }

    public static canTrade(room: Room) {
        return room.controller && room.controller.level >= 6 && room.storage && room.terminal
            && (!room.controller.sign || room.controller.sign.text !== "noTrade") &&
            (Memory.playerConfig.partnerTrade || room.controller.my);
    }

    public reportTransactions() {

        const delay = 10;
        if (Game.time % delay !== 0) { return; }

        let kFormatter = (num: number) => {
            return num > 999 ? (num / 1000).toFixed(1) + "k" : num;
        };

        let consoleReport = (item: Transaction) => {
            let distance = Game.map.getRoomLinearDistance(item.from, item.to);
            let cost = Game.market.calcTransactionCost(item.amount, item.from, item.to);
            console.log(
                `TRADE: ${_.padLeft(`${item.from} ${item.sender ? item.sender.username : "npc"}`.substr(0, 12), 12)} ` +
                `→ ${_.pad(`${kFormatter(item.amount)} ${item.resourceType}`.substr(0, 12), 12)} → ` +
                `${_.padRight(`${item.to} ${item.recipient ? item.recipient.username : "npc"}`.substr(0, 12), 12)} ` +
                `(dist: ${distance}, cost: ${kFormatter(cost)})` // ${item.}
            );
        };

        for (let item of Game.market.incomingTransactions) {
            if (!item.sender) { continue; }
            if (item.time >= Game.time - delay) {
                let username = item.sender.username;
                if (!username) { username = "npc"; }
                if (!Memory.traders[username]) { Memory.traders[username] = {}; }
                if (Memory.traders[username][item.resourceType] === undefined) {
                    Memory.traders[username][item.resourceType] = 0;
                }
                Memory.traders[username][item.resourceType] += item.amount;
                consoleReport(item);
                this.processTransaction(item);
            } else {
                break;
            }
        }

        for (let item of Game.market.outgoingTransactions) {
            if (!item.recipient) { continue; }
            if (item.time >= Game.time - delay) {
                let username = item.recipient.username;
                if (!username) { username = "npc"; }
                if (!Memory.traders[username]) { Memory.traders[username] = {}; }
                if (Memory.traders[username][item.resourceType] === undefined) {
                    Memory.traders[username][item.resourceType] = 0;
                }
                Memory.traders[item.recipient.username][item.resourceType] -= item.amount;
                if (!this.terminals[0] || item.recipient.username === this.terminals[0].owner.username) { continue; }
                if (this.diplomat.foes[item.recipient.username]) {
                    console.log(`TRADE: detected enemy room at ${item.to} (${item.recipient.username})`);
                    Memory.rooms[item.to] = { avoid: 1, owner: item.recipient.username } as any;
                }
                consoleReport(item);
            } else {
                break;
            }
        }
    }

    protected sendResourceOrder() {
        if (!Memory.resourceOrder) {
            Memory.resourceOrder = {};
        }
        for (let timeStamp in Memory.resourceOrder) {
            let order = Memory.resourceOrder[timeStamp];
            if (!order.efficiency) { order.efficiency = 1; }
            if (!order || order.roomName === undefined || order.amount === undefined) {
                console.log("problem with order:", JSON.stringify(order));
                return;
            }
            if (!order.amountSent) {
                order.amountSent = 0;
            }

            let sortedTerminals = _.sortBy(this.terminals, (t: StructureTerminal) =>
                Game.map.getRoomLinearDistance(order.roomName, t.room.name)) as StructureTerminal[];

            let count = 0;
            for (let terminal of sortedTerminals) {
                if (terminal.room.name === order.roomName) { continue; }
                if (terminal.store[order.resourceType] >= RESERVE_AMOUNT + 1000) {
                    let amount = Math.min(1000, order.amount - order.amountSent);
                    if (amount <= 0) {
                        break;
                    }
                    let msg = order.resourceType + " delivery: " + (order.amountSent + amount) + "/" + order.amount;
                    let outcome = terminal.send(order.resourceType, amount, order.roomName, msg);
                    if (outcome === OK) {
                        order.amountSent += amount;
                        console.log(msg);
                    }

                    count++;
                    if (count === order.efficiency) { break; }
                }
            }

            if (order.amountSent === order.amount) {
                console.log("finished sending mineral order: " + order.resourceType);
                Memory.resourceOrder[timeStamp] = undefined;
            }
        }
    }

    public emptyTerminal(roomName: string) {
        let room = Game.rooms[roomName];
        if (!room) { return; }
        let terminal = room.terminal;
        if (!terminal || terminal.cooldown) { return; }

        if (_.sum(terminal.store) < 1000) {
            console.log(`NETWORK: all empty in ${roomName}`);
            return;
        }

        let otherTerminal = _(this.terminals)
            .filter(x => x.pos.roomName !== roomName && x.storeCapacity - _.sum(x.store) >= 50000)
            .min(x => Game.map.getRoomLinearDistance(x.pos.roomName, roomName));

        if (!_.isObject(otherTerminal)) {
            console.log(`NETWORK: no room to send out resources from ${roomName}`);
            return;
        }

        // send everything but energy
        for (let resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) { continue; }
            let amount = terminal.store[resourceType];
            if (amount < 100) { continue; }
            let outcome = terminal.send(resourceType, amount, otherTerminal.pos.roomName);
            if (outcome !== OK) {
                console.log(`NETWORK: unable to empty resource from ${roomName} to ${
                    otherTerminal.pos.roomName}, outcome: ${outcome}`);
            }
            return;
        }

        // send energy
        let sendCost = Game.market.calcTransactionCost(terminal.store.energy, roomName, otherTerminal.pos.roomName);
        let amount = terminal.store.energy - sendCost;
        let outcome = terminal.send(RESOURCE_ENERGY, amount, otherTerminal.pos.roomName);
        if (outcome !== OK) {
            console.log(`NETWORK: unable to empty resource from ${roomName} to ${
                otherTerminal.pos.roomName}, outcome: ${outcome}`);
        }
    }

    protected decipher(item: Transaction) {
        if (!item.description) {
            Notifier.log(`EMPIRE: no description on decipher from ${item.sender.username}.`);
            return;
        }
        let description = item.description.toLocaleLowerCase();
        if (description === "safe") {
            this.diplomat.safe[item.sender.username] = true;
            Notifier.log(`EMPIRE: ${item.sender.username} requested to be added to safe list`);
        } else if (description === "removesafe") {
            delete this.diplomat.safe[item.sender.username];
            Notifier.log(`EMPIRE: ${item.sender.username} requested to be removed from safe list`);
        } else if (description === "danger") {
            this.diplomat.danger[item.sender.username] = true;
            Notifier.log(`EMPIRE: ${item.sender.username} requested to be added to danger list`);
        } else if (description === "removedanger") {
            delete this.diplomat.danger[item.sender.username];
            Notifier.log(`EMPIRE: ${item.sender.username} requested to be removed from danger list`);
        } else {
            Notifier.log(`EMPIRE: invalid description on decipher from ${item.sender.username}: ${_.escape(item.description)}`);
        }
    }

    protected processTransaction(item: Transaction) {
        if (item.amount === 111) {
            this.decipher(item);
        }
    }
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
    ["XGH2O"]: true,
    [RESOURCE_POWER]: true,
    [RESOURCE_ENERGY]: true,
};
export const MINERALS_RAW = ["H", "O", "Z", "U", "K", "L", "X"];
export const PRODUCT_LIST = ["XUH2O", "XLHO2", "XLH2O", "XKHO2", "XGHO2", "XZHO2", "XZH2O", "G", "XGH2O"];
export const TRADE_WITH_SELF = [RESOURCE_ENERGY as any].concat(PRODUCT_LIST).concat(MINERALS_RAW).concat(RESOURCE_POWER);
export const TRADE_WITH_PARTNERS = [RESOURCE_ENERGY as any].concat(PRODUCT_LIST).concat(MINERALS_RAW);
export const TRADE_ENERGY_AMOUNT = 10000;
