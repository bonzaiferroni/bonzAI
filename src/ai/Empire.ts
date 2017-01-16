import {SpawnGroup} from "./SpawnGroup";
import {
    RESOURCE_VALUE, MINERALS_RAW, RESERVE_AMOUNT, PRODUCT_LIST, PRODUCT_PRICE, TRADE_RESOURCES, NEED_ENERGY_THRESHOLD,
    SUPPLY_ENERGY_THRESHOLD, SWAP_RESERVE, TRADE_ENERGY_AMOUNT, TRADE_MAX_DISTANCE, TICK_FULL_REPORT,
    OBSERVER_PURPOSE_ALLYTRADE, ALLIES, USERNAME
} from "../config/constants";
import {helper} from "../helpers/helper";
import {notifier} from "../notifier";
import {profiler} from "../profiler";
import {TravelToOptions, TravelData, traveler} from "./Traveler";

export class EmpireClass {

    storages: StructureStorage[] = [];
    terminals: StructureTerminal[] = [];
    swapTerminals: StructureTerminal[] = [];
    spawnGroups: {[roomName: string]: SpawnGroup} = {};
    memory: {
        allyRooms: string[];
        hostileRooms: {[roomName: string]: number };
        tradeIndex: number;
        activeNukes: {tick: number, roomName: string }[];
        safe: {[username: string]: boolean};
        danger: {[username: string]: boolean};
        errantConstructionRooms: {};
    };
    tradeResource: string;
    shortages: StructureTerminal[] = [];
    severeShortages: StructureTerminal[] = [];
    surpluses: StructureTerminal[] = [];
    allyTradeStatus: {[roomName: string]: boolean};

    constructor() {
        if (!Memory.empire) Memory.empire = {};
        _.defaults(Memory.empire, {
            allyRooms: [],
            hostileRooms: {},
            tradeIndex: 0,
            activeNukes: [],
            safe: {},
            danger: {},
            errantConstructionRooms: {},
        });
        this.memory = Memory.empire;
    }

    /**
     * Occurs before operation phases
     */

    init() {
        if (this.memory.tradeIndex >= TRADE_RESOURCES.length) {
            this.memory.tradeIndex = 0;
        }
        this.tradeResource = TRADE_RESOURCES[this.memory.tradeIndex++];
    }

    /**
     * Occurs after operation phases
     */

    actions() {
        this.networkTrade();
        this.buyShortages();
        this.sellCompounds();
        this.reportNukes();
        this.reportTransactions();
        this.clearErrantConstruction();
    }

    // should only be accessed after Init()
    _inventory: {[key: string]: number};
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

    register(room: Room) {
        if (!room) return;

        let hasTerminal;
        if (room.terminal && room.terminal.my) {
            hasTerminal = true;
            this.terminals.push(room.terminal);
        }
        let hasStorage;
        if (room.storage && room.storage.my) {
            hasStorage = true;
            this.storages.push(room.storage);
        }

        if (hasTerminal && hasStorage) {
            this.analyzeResources(room);
        }
    }

    registerSwap(room: Room) {
        if (room.terminal) this.swapTerminals.push(room.terminal);
        if (room.controller.level >= 6) {
            this.analyzeResources(room, true);
        }
    }

    /**
     * Used to determine whether there is an abundance of a given resource type among all terminals.
     * Should only be used after init() phase
     * @param resourceType
     * @param amountPerRoom - specify how much per missionRoom you consider an abundance, default value is SURPLUS_AMOUNT
     */
    hasAbundance(resourceType: string, amountPerRoom = RESERVE_AMOUNT * 2) {
        let abundanceAmount = this.terminals.length * amountPerRoom;
        return this.inventory[resourceType] && this.inventory[resourceType] > abundanceAmount;
    }

    engageSwap(activeSwapRoom: Room) {
        let coreName = helper.findCore(activeSwapRoom.name);

        let neighbors = _(this.swapTerminals)
            .filter(t => Game.map.getRoomLinearDistance(coreName, t.room.name) <= 4)
            .map(t => t.room)
            .value() as Room[];

        // gather data about swapping options (swaptions)
        let availableSwaps: {[key: string]: Room} = {};
        for (let swapRoom of neighbors) {
            if (swapRoom.memory.swapActive) continue;
            let mineral = swapRoom.find(FIND_MINERALS)[0] as Mineral;
            if (mineral.mineralAmount > 0 || mineral.ticksToRegeneration < 9000) {
                availableSwaps[mineral.mineralType] = swapRoom;
            }
        }

        // check which mineraltype we are lowest in
        let lowestCount = Number.MAX_VALUE; // big number
        let lowestMineral;
        for (let mineralType in availableSwaps) {
            if (!this.inventory[mineralType] || this.inventory[mineralType] < lowestCount) {
                lowestMineral = mineralType;
                lowestCount = this.inventory[mineralType] ? this.inventory[mineralType] : 0;
            }
        }

        if (!lowestMineral) return;

        let newActiveSwapRoom = availableSwaps[lowestMineral];
        console.log("swap in", activeSwapRoom.name, "wants to switch to", newActiveSwapRoom.name, "to mine", lowestMineral);
        activeSwapRoom.controller.unclaim();
        activeSwapRoom.memory.swapActive = false;
        newActiveSwapRoom.memory.swapActive = true;
    }

    sellExcess(room: Room, resourceType: string, dealAmount: number) {
        let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resourceType});

        this.removeOrders(ORDER_BUY, resourceType);

        let bestOrder: Order;
        let highestGain = 0;
        for (let order of orders) {
            if (order.remainingAmount < 100) continue;
            let gain = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            gain -= transferCost * RESOURCE_VALUE[RESOURCE_ENERGY];
            if (gain > highestGain) {
                highestGain = gain;
                bestOrder = order;
                console.log("I could sell it to", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, dealAmount);
            let outcome = Game.market.deal(bestOrder.id, amount, room.name);

            let notYetSelling = this.orderCount(ORDER_SELL, resourceType, bestOrder.price) === 0;
            if (notYetSelling) {
                Game.market.createOrder(ORDER_SELL, resourceType, bestOrder.price, dealAmount * 2, room.name);
                console.log("placed ORDER_SELL for", resourceType, "at", bestOrder.price, "Cr, to be sent from", room.name);
            }

            if (outcome === OK) {
                console.log("sold", amount, resourceType, "to", bestOrder.roomName, "outcome:", outcome);

            }
            else if (outcome === ERR_INVALID_ARGS) {
                console.log("invalid deal args:", bestOrder.id, amount, room.name);
            }
            else {
                console.log("there was a problem trying to deal:", outcome);
            }
        }
    }

    private removeOrders(type: string, resourceType: string) {
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.type === type && order.resourceType === resourceType) {
                Game.market.cancelOrder(orderId);
            }
        }
    }

    private orderCount(type: string, resourceType: string, adjustPrice?: number): number {
        let count = 0;
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.remainingAmount < 10) {
                Game.market.cancelOrder(orderId);
            }
            else if (order.type === type && order.resourceType === resourceType) {
                count++;
                if (adjustPrice && adjustPrice < order.price) {
                    console.log("MARKET: lowering price for", resourceType, type, "from", order.price, "to", adjustPrice);
                    Game.market.changeOrderPrice(order.id, adjustPrice);
                }
            }
        }
        return count;
    }

    getSpawnGroup(roomName: string) {
        if (this.spawnGroups[roomName]) {
            return this.spawnGroups[roomName];
        }
        else {
            let room = Game.rooms[roomName];
            if (room && room.find(FIND_MY_SPAWNS).length > 0) {
                this.spawnGroups[roomName] = new SpawnGroup(room);
                return this.spawnGroups[roomName];
            }
        }
    }

    buyShortages() {
        if (Game.market.credits < Memory.playerConfig.creditReserveAmount) return; // early

        if (Game.time % 100 !== 2) return;

        // you could use a different constant here if you wanted to limit buying
        for (let mineralType of MINERALS_RAW) {

            let abundance = this.hasAbundance(mineralType, RESERVE_AMOUNT);
            if (!abundance) {
                console.log("EMPIRE: theres not enough", mineralType + ", attempting to purchase more");
                let terminal = this.findBestTerminal(mineralType);
                if (terminal)
                this.buyMineral(terminal.room, mineralType);
            }
        }
    }

    findBestTerminal(resourceType: string, searchType = "lowest"): StructureTerminal {
        if (searchType === "lowest") {
            let lowest = Number.MAX_VALUE;
            let lowestTerminal: StructureTerminal;
            for (let terminal of this.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount < lowest) {
                    lowest = amount;
                    lowestTerminal = terminal;
                }
            }
            return lowestTerminal;
        }
        else {
            let highest = 0;
            let highestTerminal: StructureTerminal;
            for (let terminal of this.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount > highest) {
                    highest = amount;
                    highestTerminal = terminal;
                }
            }
            return highestTerminal;
        }
    }

    private buyMineral(room: Room, resourceType: string) {
        if (room.terminal.store[resourceType] > TERMINAL_CAPACITY - RESERVE_AMOUNT) {
            console.log("EMPIRE: wanted to buy mineral but lowest terminal was full, check " + room.name);
            return;
        }

        this.removeOrders(ORDER_SELL, resourceType);
        let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resourceType});

        let bestOrder: Order;
        let lowestExpense = Number.MAX_VALUE;
        for (let order of orders) {
            if (order.remainingAmount < 100) continue;
            let expense = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            expense += transferCost * RESOURCE_VALUE[RESOURCE_ENERGY];
            if (expense < lowestExpense) {
                lowestExpense = expense;
                bestOrder = order;
                console.log("I could buy from", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, RESERVE_AMOUNT);

            if (lowestExpense <= RESOURCE_VALUE[resourceType]) {
                let outcome = Game.market.deal(bestOrder.id, amount, room.name);
                console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
            }
            else {

            }

            let noBuyOrders = this.orderCount(ORDER_BUY, resourceType) === 0;
            if (noBuyOrders) {
                Game.market.createOrder(ORDER_BUY, resourceType, bestOrder.price, RESERVE_AMOUNT * 2, room.name);
                console.log("placed ORDER_BUY for", resourceType, "at", bestOrder.price, "Cr, to be sent to", room.name);
            }

            /*
             if (outcome === OK) {
             console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
             if (!Memory.dealHistory) {
             Memory.dealHistory = [];
             }

             this.addDeal(bestOrder);
             }
             else {
             console.log("there was a problem trying to deal:", outcome);
             }
             */
        }
    }

    addAllyRoom(roomName: string) {
        if (_.contains(this.memory.allyRooms, roomName)) { return; }
        this.memory.allyRooms.push(roomName);
    }

    removeAllyRoom(roomName: string) {
        _.pull(this.memory.allyRooms, roomName);
    }

    addHostileRoom(roomName: string, controllerLevel: number) {
        this.memory.hostileRooms[roomName] = controllerLevel;
    }

    removeHostileRoom(roomName: string) {
        delete this.memory.hostileRooms[roomName];
    }

    observeAllyRoom(observer: StructureObserver, index: number) {
        if (index === undefined) {
            index = 0;
        }

        if (!this.allyTradeStatus) {
            this.allyTradeStatus = {};
            for (let roomname of this.memory.allyRooms) { this.allyTradeStatus[roomname] = false }
        }

        let checkCount = this.memory.allyRooms.length;
        while (checkCount > 0) {
            index++;
            checkCount--;
            if (index >= this.memory.allyRooms.length) { index = 0; }
            let checkRoomName = Object.keys(this.allyTradeStatus)[index];
            if (Game.map.getRoomLinearDistance(observer.room.name, checkRoomName) > OBSERVER_RANGE) continue;
            if (this.allyTradeStatus[checkRoomName]) continue;
            this.allyTradeStatus[checkRoomName] = true;
            observer.observeRoom(checkRoomName, OBSERVER_PURPOSE_ALLYTRADE);
            return index;
        }
    }

    sellCompounds() {
        if (Game.time % 100 !== 2) return;

        for (let compound of PRODUCT_LIST) {
            if (this.orderCount(ORDER_SELL, compound, PRODUCT_PRICE[compound]) > 0) continue;

            let stockedTerminals = _.filter(this.terminals, t => t.store[compound] >= RESERVE_AMOUNT);
            if (stockedTerminals.length === 0) continue;
            console.log("MARKET: no orders for", compound, "found, creating one");
            let competitionRooms = _.map(Game.market.getAllOrders({type: ORDER_SELL, resourceType: compound}), (order: Order) => {
                return order.roomName;
            });

            let distanceToNearest = 0;
            let bestTerminal: StructureTerminal;
            for (let terminal of stockedTerminals) {
                let nearestCompetition = Number.MAX_VALUE;
                for (let roomName of competitionRooms) {
                    let distance = Game.map.getRoomLinearDistance(roomName, terminal.room.name);
                    if (distance < nearestCompetition) { nearestCompetition = distance; }
                }
                if (nearestCompetition > distanceToNearest) {
                    distanceToNearest = nearestCompetition;
                    bestTerminal = terminal;
                    console.log("I could sell from", terminal.room.name + ", nearest competition is", nearestCompetition, "rooms away");
                }
            }

            Game.market.createOrder(ORDER_SELL, compound, PRODUCT_PRICE[compound], RESERVE_AMOUNT, bestTerminal.room.name);
        }
    }

    networkTrade() {
        this.registerAllyRooms();
        this.tradeMonkey();
    }

    private registerAllyRooms() {
        for (let roomName of this.memory.allyRooms) {
            let room = Game.rooms[roomName];
            if (!room) continue;

            this.analyzeResources(room);
        }
    }

    analyzeResources(room: Room, swap = false) {
        if (room.controller.level < 6 || !room.terminal || !room.storage) return;

        if (this.tradeResource === RESOURCE_ENERGY) {
            if (swap) {
                if (room.terminal.store.energy < 50000) {
                    this.shortages.push(room.terminal);
                }
            }
            else {
                if (room.terminal.store.energy < 50000 && room.storage.store.energy < NEED_ENERGY_THRESHOLD
                    && _.sum(room.terminal.store) < 270000 ) {
                    this.severeShortages.push(room.terminal);
                }
                else if (room.controller.my && room.terminal.store.energy >= 30000 &&
                    room.storage.store.energy > SUPPLY_ENERGY_THRESHOLD) {
                    this.surpluses.push(room.terminal);
                }
            }
        }
        else {
            let amount = room.terminal.store[this.tradeResource] || 0;
            if (!swap && amount < RESERVE_AMOUNT && _.sum(room.terminal.store) < 270000 ) {
                this.shortages.push(room.terminal);
            }
            else if (room.controller.my && room.terminal.store.energy >= 10000 && amount >= RESERVE_AMOUNT * 2) {
                this.surpluses.push(room.terminal);
            }
        }
    }

    private tradeMonkey() {

        let pairs = [];

        let shortages = this.shortages;
        let ignoreDistance = false;
        if (this.severeShortages.length > 0) {
            shortages = this.severeShortages;
            // ignoreDistance = true;
        }

        for (let sender of this.surpluses) {
            let closestReciever = _.sortBy(shortages, (t: StructureTerminal) => {
                return Game.map.getRoomLinearDistance(sender.room.name, t.room.name);
            })[0];

            if (!closestReciever) continue;
            let distance = Game.map.getRoomLinearDistance(sender.room.name, closestReciever.room.name);
            if (this.tradeResource === RESOURCE_ENERGY && distance > TRADE_MAX_DISTANCE && _.sum(sender.room.storage.store) < 940000
                && !ignoreDistance) continue;
            pairs.push({
                sender: sender,
                reciever: closestReciever,
                distance: distance,
            });
        }

        pairs = _.sortBy(pairs, p => p.distance);

        while (pairs.length > 0) {
            let sender = pairs[0].sender as StructureTerminal;
            let reciever = pairs[0].reciever as StructureTerminal;

            let amount = RESERVE_AMOUNT - (reciever.store[this.tradeResource] || 0);
            if (this.tradeResource === RESOURCE_ENERGY) {
                amount = TRADE_ENERGY_AMOUNT;
            }
            this.sendResource(sender, this.tradeResource, amount, reciever);
            pairs = _.filter(pairs, p => p.sender !== sender && p.reciever !== reciever);
        }
    }

    private sendResource(localTerminal: StructureTerminal, resourceType: string, amount: number, otherTerminal: StructureTerminal) {

        if (amount < 100) {
            amount = 100;
        }

        let outcome = localTerminal.send(resourceType, amount, otherTerminal.room.name);
        if (outcome === OK) {
            let distance = Game.map.getRoomLinearDistance(otherTerminal.room.name, localTerminal.room.name, true);
            // console.log("NETWORK:", localTerminal.missionRoom.name, "→",
            //    otherTerminal.missionRoom.name + ":", amount, resourceType, "(" + otherTerminal.owner.username.substring(0, 3) + ", dist: " + distance + ")");
        }
        else {
            console.log(`NETWORK: error sending resource in ${localTerminal.room.name}, outcome: ${outcome}`);
            console.log(`arguments used: ${resourceType}, ${amount}, ${otherTerminal.room.name}`);
        }
    }

    addNuke(activeNuke: {tick: number; roomName: string}) {
        this.memory.activeNukes.push(activeNuke);
    }

    private reportNukes() {
        if (Game.time % TICK_FULL_REPORT !== 0) return;

        for (let activeNuke of this.memory.activeNukes) {
            console.log(`EMPIRE: ${Game.time - activeNuke.tick} till our nuke lands in ${activeNuke.roomName}`);
        }
    }

    roomTravelDistance(origin: string, destination: string): number {
        let linearDistance = Game.map.getRoomLinearDistance(origin, destination);
        if (linearDistance >= 20) {
            return linearDistance;
        }

        let allowedRooms = traveler.findAllowedRooms(origin, destination);
        if (allowedRooms) {
            return Object.keys(allowedRooms).length;
        }
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

        let decipher = (item: Transaction) => {
            if (!item.description) {
                notifier.add(`EMPIRE: no description on decipher from ${item.sender.username}.`)
                return;
            }
            let description = item.description.toLocaleLowerCase();
            if (description === "safe") {
                this.memory.safe[item.sender.username] = true;
                console.log(`EMPIRE: ${item.sender.username} requested to be added to safe list`);
            }
            else if (description === "removesafe") {
                delete this.memory.safe[item.sender.username];
                console.log(`EMPIRE: ${item.sender.username} requested to be removed from safe list`);
            }
            else if (description === "danger") {
                this.memory.danger[item.sender.username] = true;
                console.log(`EMPIRE: ${item.sender.username} requested to be added to danger list`);
            }
            else if (description === "removedanger") {
                delete this.memory.danger[item.sender.username];
                console.log(`EMPIRE: ${item.sender.username} requested to be removed from danger list`);
            }
            else {
                notifier.add(`EMPIRE: invalid description on decipher from ${item.sender.username}: ${_.escape(item.description)}`)
            }
        };

        let decipheredMessage = false;
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
                if (item.amount === 111 && !decipheredMessage) {
                    decipheredMessage = true;
                    decipher(item);
                }
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
                if (item.recipient.username === USERNAME) { continue; }
                consoleReport(item);
            }
            else {
                break;
            }
        }
    }

    underCPULimit() {
        return profiler.proportionUsed() < .9;
    }

    private clearErrantConstruction() {
        if (Game.time % 1000 !== 0) { return; }

        let removeErrantStatus = {};
        let addErrantStatus = {};
        for (let siteName in Game.constructionSites) {
            let site = Game.constructionSites[siteName];
            if (site.room) {
                delete this.memory.errantConstructionRooms[site.pos.roomName];
            }
            else {
                if (this.memory.errantConstructionRooms[site.pos.roomName]) {
                    site.remove();
                    removeErrantStatus[site.pos.roomName];
                }
                else {
                    addErrantStatus[site.pos.roomName] = true;
                }
            }
        }

        for (let roomName in addErrantStatus) {
            this.memory.errantConstructionRooms[roomName] = true;
        }

        for (let roomName in removeErrantStatus) {
            notifier.add(`EMPIRE: removed construction sites in ${roomName}`);
            delete this.memory.errantConstructionRooms[roomName];
        }
    }

    private findLocalAllowedRooms(origin: string, destination: string): {[roomName: string]: boolean} {
        let data = { [destination]: true };
        let range = Game.map.getRoomLinearDistance(origin, destination);
        this.findRecursion(origin, destination, data, range);
        return data;
    }

    private findRecursion(testRoom: string, destination: string, data: {[roomName: string]: boolean}, range: number): boolean {
        if (range < 0) { return testRoom === destination; }
        else {
            range--;
            let valid;
            for (let roomName of _.values(Game.map.describeExits(testRoom))) {
                if (!this.findRecursion(roomName as string, destination, data, range)) { continue; }
                valid = true;
            }
            if (valid) { return data[testRoom] = true; }
        }
    }
}

