module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/*!*********************!*\
  !*** ./src/main.ts ***!
  \*********************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const loopHelper_1 = __webpack_require__(/*! ./helpers/loopHelper */ 1);
	const initPrototypes_1 = __webpack_require__(/*! ./prototypes/initPrototypes */ 45);
	const sandbox_1 = __webpack_require__(/*! ./sandbox */ 49);
	const profiler_1 = __webpack_require__(/*! ./profiler */ 50);
	loopHelper_1.loopHelper.initMemory();
	initPrototypes_1.initPrototypes();
	module.exports.loop = function () {
	    Game.cache = { structures: {}, hostiles: {}, hostilesAndLairs: {}, mineralCount: {}, labProcesses: {},
	        activeLabCount: 0, placedRoad: false };
	    // Init phase - Information is gathered about the game state and game objects instantiated
	    profiler_1.profiler.start("init");
	    let empire = loopHelper_1.loopHelper.initEmpire();
	    let operations = loopHelper_1.loopHelper.getOperations(empire);
	    for (let operation of operations)
	        operation.init();
	    profiler_1.profiler.end("init");
	    // RoleCall phase - Find creeps belonging to missions and spawn any additional needed.
	    profiler_1.profiler.start("roleCall");
	    for (let operation of operations)
	        operation.roleCall();
	    profiler_1.profiler.end("roleCall");
	    // Actions phase - Actions that change the game state are executed in this phase.
	    profiler_1.profiler.start("actions");
	    for (let operation of operations)
	        operation.actions();
	    profiler_1.profiler.end("actions");
	    // Finalize phase - Code that needs to run post-actions phase
	    for (let operation of operations)
	        operation.invalidateCache();
	    profiler_1.profiler.start("finalize");
	    for (let operation of operations)
	        operation.finalize();
	    profiler_1.profiler.end("finalize");
	    // post-operation actions and utilities
	    profiler_1.profiler.start("postOperations");
	    try {
	        empire.actions();
	    }
	    catch (e) {
	        console.log("error with empire actions\n", e.stack);
	    }
	    try {
	        loopHelper_1.loopHelper.scavangeResources();
	    }
	    catch (e) {
	        console.log("error scavanging:\n", e.stack);
	    }
	    try {
	        loopHelper_1.loopHelper.sendResourceOrder(empire);
	    }
	    catch (e) {
	        console.log("error reporting transactions:\n", e.stack);
	    }
	    try {
	        loopHelper_1.loopHelper.reportTransactions();
	    }
	    catch (e) {
	        console.log("error reporting transactions:\n", e.stack);
	    }
	    try {
	        loopHelper_1.loopHelper.initConsoleCommands();
	    }
	    catch (e) {
	        console.log("error loading console commands:\n", e.stack);
	    }
	    try {
	        sandbox_1.sandBox.run();
	    }
	    catch (e) {
	        console.log("error loading sandbox:\n", e.stack);
	    }
	    profiler_1.profiler.end("postOperations");
	    try {
	        loopHelper_1.loopHelper.grafanaStats(empire);
	    }
	    catch (e) {
	        console.log("error reporting stats:\n", e.stack);
	    }
	    try {
	        loopHelper_1.loopHelper.profilerCheck();
	    }
	    catch (e) {
	        console.log("error checking profiler:\n", e.stack);
	    }
	};


/***/ },
/* 1 */
/*!***********************************!*\
  !*** ./src/helpers/loopHelper.ts ***!
  \***********************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Empire_1 = __webpack_require__(/*! ../ai/Empire */ 2);
	const FortOperation_1 = __webpack_require__(/*! ../ai/operations/FortOperation */ 6);
	const MiningOperation_1 = __webpack_require__(/*! ../ai/operations/MiningOperation */ 21);
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	const KeeperOperation_1 = __webpack_require__(/*! ../ai/operations/KeeperOperation */ 29);
	const ConquestOperation_1 = __webpack_require__(/*! ../ai/operations/ConquestOperation */ 31);
	const consoleCommands_1 = __webpack_require__(/*! ./consoleCommands */ 33);
	const DemolishOperation_1 = __webpack_require__(/*! ../ai/operations/DemolishOperation */ 34);
	const TransportOperation_1 = __webpack_require__(/*! ../ai/operations/TransportOperation */ 36);
	const RaidOperation_1 = __webpack_require__(/*! ../ai/operations/RaidOperation */ 37);
	const QuadOperation_1 = __webpack_require__(/*! ../ai/operations/QuadOperation */ 38);
	const AutoOperation_1 = __webpack_require__(/*! ../ai/operations/AutoOperation */ 42);
	const FlexOperation_1 = __webpack_require__(/*! ../ai/operations/FlexOperation */ 43);
	const OPERATION_CLASSES = {
	    conquest: ConquestOperation_1.ConquestOperation,
	    fort: FortOperation_1.FortOperation,
	    mining: MiningOperation_1.MiningOperation,
	    tran: TransportOperation_1.TransportOperation,
	    keeper: KeeperOperation_1.KeeperOperation,
	    demolish: DemolishOperation_1.DemolishOperation,
	    raid: RaidOperation_1.RaidOperation,
	    quad: QuadOperation_1.QuadOperation,
	    auto: AutoOperation_1.AutoOperation,
	    flex: FlexOperation_1.FlexOperation,
	};
	exports.loopHelper = {
	    initEmpire: function () {
	        // gather flag data, instantiate operations
	        let empire = new Empire_1.Empire();
	        empire.init();
	        global.emp = empire;
	        return empire;
	    },
	    /// <summary>loop through flags and construct operation objects, return operation array sorted by priority</summary>
	    getOperations: function (empire) {
	        // gather flag data, instantiate operations
	        let operationList = {};
	        for (let flagName in Game.flags) {
	            for (let typeName in OPERATION_CLASSES) {
	                if (!OPERATION_CLASSES.hasOwnProperty(typeName))
	                    continue;
	                if (flagName.substring(0, typeName.length) === typeName) {
	                    let operationClass = OPERATION_CLASSES[typeName];
	                    let flag = Game.flags[flagName];
	                    let name = flagName.substring(flagName.indexOf("_") + 1);
	                    if (operationList.hasOwnProperty(name)) {
	                        console.log(`operation with name ${name} already exists (type: ${operationList[name].type}), please use a different name`);
	                        continue;
	                    }
	                    let operation;
	                    try {
	                        operation = new operationClass(flag, name, typeName, empire);
	                    }
	                    catch (e) {
	                        console.log("error parsing flag name and bootstrapping operation");
	                        console.log(e);
	                    }
	                    operationList[name] = operation;
	                    global[name] = operation;
	                }
	            }
	        }
	        return _.sortBy(operationList, (operation) => operation.priority);
	    },
	    initMemory: function () {
	        _.defaultsDeep(Memory, {
	            stats: {},
	            temp: {},
	            playerConfig: {
	                terminalNetworkRange: 6,
	                muteSpawn: false,
	                enableStats: false,
	                creditReserveAmount: Number.MAX_VALUE,
	                powerMinimum: 9000,
	            },
	            profiler: {},
	        });
	    },
	    scavangeResources: function () {
	        for (let v in Game.rooms) {
	            let room = Game.rooms[v];
	            let resources = room.find(FIND_DROPPED_ENERGY);
	            for (let resource of resources) {
	                if (resource.amount > 10) {
	                    let creep = resource.pos.lookFor(LOOK_CREEPS)[0];
	                    if (creep && creep.my && creep.memory.scavanger === resource.resourceType
	                        && (!creep.carry[resource.resourceType] || creep.carry[resource.resourceType] < creep.carryCapacity)) {
	                        let outcome = creep.pickup(resource);
	                    }
	                }
	            }
	        }
	    },
	    invalidateCache: Game.time % constants_1.CACHE_INVALIDATION_FREQUENCY < constants_1.CACHE_INVALIDATION_PERIOD,
	    grafanaStats: function (empire) {
	        if (!Memory.playerConfig.enableStats)
	            return;
	        if (!Memory.stats)
	            Memory.stats = {};
	        // STATS START HERE
	        _.forEach(Game.rooms, function (room) {
	            if (room.controller && room.controller.my) {
	                Memory.stats["rooms." + room.name + ".controller.level"] = room.controller.level;
	                Memory.stats["rooms." + room.name + ".controller.progress"] = room.controller.progress;
	                Memory.stats["rooms." + room.name + ".controller.progressTotal"] = room.controller.progressTotal;
	                Memory.stats["rooms." + room.name + ".energyAvailable"] = room.energyAvailable;
	            }
	        });
	        for (let resourceType of constants_1.MINERALS_RAW) {
	            Memory.stats["empire.rawMinerals." + resourceType] = empire.inventory[resourceType];
	            Memory.stats["empire.mineralCount." + resourceType] = Game.cache[resourceType] || 0;
	        }
	        for (let resourceType of constants_1.PRODUCT_LIST) {
	            Memory.stats["empire.compounds." + resourceType] = empire.inventory[resourceType];
	            Memory.stats["empire.processCount." + resourceType] = Game.cache.labProcesses[resourceType] || 0;
	        }
	        Memory.stats["empire.activeLabCount"] = Game.cache.activeLabCount;
	        Memory.stats["empire.energy"] = empire.inventory[RESOURCE_ENERGY];
	        for (let storage of empire.storages) {
	            Memory.stats["empire.power." + storage.room.name] = storage.store.power ? storage.store.power : 0;
	        }
	        // profiler check
	        for (let identifier in Memory.profiler) {
	            let profile = Memory.profiler[identifier];
	            Memory.stats["game.profiler." + identifier + ".costPerTick"] = profile.costPerTick;
	            Memory.stats["game.profiler." + identifier + ".costPerCall"] = profile.costPerCall;
	            Memory.stats["game.profiler." + identifier + ".callsPerTick"] = profile.callsPerTick;
	        }
	        Memory.stats["game.time"] = Game.time;
	        Memory.stats["game.gcl.level"] = Game.gcl.level;
	        Memory.stats["game.gcl.progress"] = Game.gcl.progress;
	        Memory.stats["game.gcl.progressTotal"] = Game.gcl.progressTotal;
	        Memory.stats["game.cpu.limit"] = Game.cpu.limit;
	        Memory.stats["game.cpu.tickLimit"] = Game.cpu.tickLimit;
	        Memory.stats["game.cpu.bucket"] = Game.cpu.bucket;
	        Memory.stats["game.cpu.used"] = Game.cpu.getUsed();
	    },
	    reportTransactions: function () {
	        for (let item of Game.market.incomingTransactions) {
	            if (item.time === Game.time - 1) {
	                if (item.sender.username !== constants_1.USERNAME) {
	                    if (!Memory.traders)
	                        Memory.traders = {};
	                    if (!Memory.traders[item.sender.username]) {
	                        Memory.traders[item.sender.username] = { recieved: {}, sent: {} };
	                    }
	                    if (!Memory.traders[item.sender.username].recieved[item.resourceType]) {
	                        Memory.traders[item.sender.username].recieved[item.resourceType] = 0;
	                    }
	                    Memory.traders[item.sender.username].recieved[item.resourceType] += item.amount;
	                    console.log("MARKET: received", item.amount, "of", item.resourceType, "from", item.sender.username);
	                }
	                else if (item.recipient.username !== constants_1.USERNAME) {
	                    if (!Memory.traders)
	                        Memory.traders = {};
	                    if (!Memory.traders[item.recipient.username]) {
	                        Memory.traders[item.recipient.username] = { recieved: {}, sent: {} };
	                    }
	                    if (!Memory.traders[item.recipient.username].sent[item.resourceType]) {
	                        Memory.traders[item.recipient.username].sent[item.resourceType] = 0;
	                    }
	                    Memory.traders[item.recipient.username].sent[item.resourceType] += item.amount;
	                    console.log("MARKET: sent", item.amount, "of", item.resourceType, "to", item.recipient.username);
	                }
	            }
	            else {
	                break;
	            }
	        }
	    },
	    sendResourceOrder: function (empire) {
	        if (!Memory.resourceOrder) {
	            Memory.resourceOrder = {};
	        }
	        for (let timeStamp in Memory.resourceOrder) {
	            let order = Memory.resourceOrder[timeStamp];
	            if (!order || order.roomName === undefined || order.amount === undefined) {
	                console.log("problem with order:", JSON.stringify(order));
	                return;
	            }
	            if (!order.amountSent) {
	                order.amountSent = 0;
	            }
	            let sortedTerminals = _.sortBy(empire.terminals, (t) => Game.map.getRoomLinearDistance(order.roomName, t.room.name));
	            let count = 0;
	            for (let terminal of sortedTerminals) {
	                if (terminal.room.name === order.roomName)
	                    continue;
	                if (terminal.store[order.resourceType] >= constants_1.RESERVE_AMOUNT) {
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
	                    if (count === order.efficiency)
	                        break;
	                }
	            }
	            if (order.amountSent === order.amount) {
	                console.log("finished sending mineral order: " + order.resourceType);
	                Memory.resourceOrder[timeStamp] = undefined;
	            }
	        }
	    },
	    initConsoleCommands: function () {
	        // command functions found in consoleCommands.ts can be executed from the game console
	        // example: cc.minv()
	        global.cc = consoleCommands_1.consoleCommands;
	    },
	    profilerCheck: function () {
	        for (let identifier in Memory.profiler) {
	            let profile = Memory.profiler[identifier];
	            if (Game.time - profile.lastTickTracked > 1) {
	                delete Memory.profiler[identifier];
	            }
	        }
	    }
	};


/***/ },
/* 2 */
/*!**************************!*\
  !*** ./src/ai/Empire.ts ***!
  \**************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const SpawnGroup_1 = __webpack_require__(/*! ./SpawnGroup */ 3);
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	class Empire {
	    constructor() {
	        this.storages = [];
	        this.terminals = [];
	        this.swapTerminals = [];
	        this.spawnGroups = {};
	        this.shortages = [];
	        this.severeShortages = [];
	        this.surpluses = [];
	        if (!Memory.empire)
	            Memory.empire = {};
	        _.defaults(Memory.empire, { allyForts: [], allySwaps: [], tradeIndex: 0, activeNukes: [] });
	        this.memory = Memory.empire;
	    }
	    /**
	     * Occurs before operation phases
	     */
	    init() {
	        if (this.memory.tradeIndex >= constants_1.TRADE_RESOURCES.length) {
	            this.memory.tradeIndex = 0;
	        }
	        this.tradeResource = constants_1.TRADE_RESOURCES[this.memory.tradeIndex++];
	    }
	    /**
	     * Occurs after operation phases
	     */
	    actions() {
	        this.networkTrade();
	        this.buyShortages();
	        this.sellCompounds();
	        this.reportNukes();
	    }
	    get inventory() {
	        if (!this._inventory) {
	            let inventory = {};
	            for (let terminal of this.terminals) {
	                for (let mineralType in terminal.store) {
	                    if (!terminal.store.hasOwnProperty(mineralType))
	                        continue;
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
	    register(room) {
	        if (!room)
	            return;
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
	    registerSwap(room) {
	        if (room.terminal)
	            this.swapTerminals.push(room.terminal);
	        if (room.controller.level >= 6) {
	            this.analyzeResources(room, true);
	        }
	    }
	    /**
	     * Used to determine whether there is an abundance of a given resource type among all terminals.
	     * Should only be used after init() phase
	     * @param resourceType
	     * @param amountPerRoom - specify how much per room you consider an abundance, default value is SURPLUS_AMOUNT
	     */
	    hasAbundance(resourceType, amountPerRoom = constants_1.RESERVE_AMOUNT * 2) {
	        let abundanceAmount = this.terminals.length * amountPerRoom;
	        return this.inventory[resourceType] && this.inventory[resourceType] > abundanceAmount;
	    }
	    engageSwap(activeSwapRoom) {
	        let coreName = helper_1.helper.findCore(activeSwapRoom.name);
	        let neighbors = _(this.swapTerminals)
	            .filter(t => Game.map.getRoomLinearDistance(coreName, t.room.name) <= 4)
	            .map(t => t.room)
	            .value();
	        // gather data about swapping options (swaptions)
	        let availableSwaps = {};
	        for (let swapRoom of neighbors) {
	            if (swapRoom.memory.swapActive)
	                continue;
	            let mineral = swapRoom.find(FIND_MINERALS)[0];
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
	        if (!lowestMineral)
	            return;
	        let newActiveSwapRoom = availableSwaps[lowestMineral];
	        console.log("swap in", activeSwapRoom.name, "wants to switch to", newActiveSwapRoom.name, "to mine", lowestMineral);
	        activeSwapRoom.controller.unclaim();
	        activeSwapRoom.memory.swapActive = false;
	        newActiveSwapRoom.memory.swapActive = true;
	    }
	    sellExcess(room, resourceType, dealAmount) {
	        let orders = Game.market.getAllOrders({ type: ORDER_BUY, resourceType: resourceType });
	        this.removeOrders(ORDER_BUY, resourceType);
	        let bestOrder;
	        let highestGain = 0;
	        for (let order of orders) {
	            if (order.remainingAmount < 100)
	                continue;
	            let gain = order.price;
	            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
	            gain -= transferCost * constants_1.RESOURCE_VALUE[RESOURCE_ENERGY];
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
	    removeOrders(type, resourceType) {
	        for (let orderId in Game.market.orders) {
	            let order = Game.market.orders[orderId];
	            if (order.type === type && order.resourceType === resourceType) {
	                Game.market.cancelOrder(orderId);
	            }
	        }
	    }
	    orderCount(type, resourceType, adjustPrice) {
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
	    getSpawnGroup(roomName) {
	        if (this.spawnGroups[roomName]) {
	            return this.spawnGroups[roomName];
	        }
	        else {
	            let room = Game.rooms[roomName];
	            if (room && room.find(FIND_MY_SPAWNS).length > 0) {
	                this.spawnGroups[roomName] = new SpawnGroup_1.SpawnGroup(room);
	                return this.spawnGroups[roomName];
	            }
	        }
	    }
	    buyShortages() {
	        if (Game.market.credits < Memory.playerConfig.creditReserveAmount)
	            return; // early
	        if (Game.time % 100 !== 2)
	            return;
	        // you could use a different constant here if you wanted to limit buying
	        for (let mineralType of constants_1.MINERALS_RAW) {
	            let abundance = this.hasAbundance(mineralType, constants_1.RESERVE_AMOUNT);
	            if (!abundance) {
	                console.log("EMPIRE: theres not enough", mineralType + ", attempting to purchase more");
	                let terminal = this.findBestTerminal(mineralType);
	                if (terminal)
	                    this.buyMineral(terminal.room, mineralType);
	            }
	        }
	    }
	    findBestTerminal(resourceType, searchType = "lowest") {
	        if (searchType === "lowest") {
	            let lowest = Number.MAX_VALUE;
	            let lowestTerminal;
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
	            let highestTerminal;
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
	    buyMineral(room, resourceType) {
	        if (room.terminal.store[resourceType] > TERMINAL_CAPACITY - constants_1.RESERVE_AMOUNT) {
	            console.log("EMPIRE: wanted to buy mineral but lowest terminal was full, check " + room.name);
	            return;
	        }
	        this.removeOrders(ORDER_SELL, resourceType);
	        let orders = Game.market.getAllOrders({ type: ORDER_SELL, resourceType: resourceType });
	        let bestOrder;
	        let lowestExpense = Number.MAX_VALUE;
	        for (let order of orders) {
	            if (order.remainingAmount < 100)
	                continue;
	            let expense = order.price;
	            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
	            expense += transferCost * constants_1.RESOURCE_VALUE[RESOURCE_ENERGY];
	            if (expense < lowestExpense) {
	                lowestExpense = expense;
	                bestOrder = order;
	                console.log("I could buy from", order.roomName, "for", order.price, "(+" + transferCost + ")");
	            }
	        }
	        if (bestOrder) {
	            let amount = Math.min(bestOrder.remainingAmount, constants_1.RESERVE_AMOUNT);
	            if (lowestExpense <= constants_1.RESOURCE_VALUE[resourceType]) {
	                let outcome = Game.market.deal(bestOrder.id, amount, room.name);
	                console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
	            }
	            else {
	            }
	            let noBuyOrders = this.orderCount(ORDER_BUY, resourceType) === 0;
	            if (noBuyOrders) {
	                Game.market.createOrder(ORDER_BUY, resourceType, bestOrder.price, constants_1.RESERVE_AMOUNT * 2, room.name);
	                console.log("placed ORDER_BUY for", resourceType, "at", bestOrder.price, "Cr, to be sent to", room.name);
	            }
	        }
	    }
	    addAllyForts(roomNames) {
	        this.memory.allyForts = _.union(this.memory.allyForts, roomNames);
	    }
	    addAllySwaps(roomNames) {
	        this.memory.allySwaps = _.union(this.memory.allySwaps, roomNames);
	    }
	    sellCompounds() {
	        if (Game.time % 100 !== 2)
	            return;
	        for (let compound of constants_1.PRODUCT_LIST) {
	            if (this.orderCount(ORDER_SELL, compound, constants_1.PRODUCT_PRICE[compound]) > 0)
	                continue;
	            let stockedTerminals = _.filter(this.terminals, t => t.store[compound] >= constants_1.RESERVE_AMOUNT);
	            if (stockedTerminals.length === 0)
	                continue;
	            console.log("MARKET: no orders for", compound, "found, creating one");
	            let competitionRooms = _.map(Game.market.getAllOrders({ type: ORDER_SELL, resourceType: compound }), (order) => {
	                return order.roomName;
	            });
	            let distanceToNearest = 0;
	            let bestTerminal;
	            for (let terminal of stockedTerminals) {
	                let nearestCompetition = Number.MAX_VALUE;
	                for (let roomName of competitionRooms) {
	                    let distance = Game.map.getRoomLinearDistance(roomName, terminal.room.name);
	                    if (distance < nearestCompetition) {
	                        nearestCompetition = distance;
	                    }
	                }
	                if (nearestCompetition > distanceToNearest) {
	                    distanceToNearest = nearestCompetition;
	                    bestTerminal = terminal;
	                    console.log("I could sell from", terminal.room.name + ", nearest competition is", nearestCompetition, "rooms away");
	                }
	            }
	            Game.market.createOrder(ORDER_SELL, compound, constants_1.PRODUCT_PRICE[compound], constants_1.RESERVE_AMOUNT, bestTerminal.room.name);
	        }
	    }
	    networkTrade() {
	        this.registerAllyRooms();
	        this.tradeMonkey();
	    }
	    registerAllyRooms() {
	        for (let roomName of this.memory.allyForts) {
	            let room = Game.rooms[roomName];
	            if (!room)
	                continue;
	            this.analyzeResources(room);
	        }
	        for (let roomName of this.memory.allySwaps) {
	            let room = Game.rooms[roomName];
	            if (!room)
	                continue;
	            this.analyzeResources(room, true);
	        }
	    }
	    analyzeResources(room, swap = false) {
	        if (room.controller.level < 6 || !room.terminal || !room.storage)
	            return;
	        if (this.tradeResource === RESOURCE_ENERGY) {
	            if (swap) {
	                if (room.terminal.store.energy < 50000) {
	                    this.shortages.push(room.terminal);
	                }
	            }
	            else {
	                if (room.terminal.store.energy < 50000 && room.storage.store.energy < constants_1.NEED_ENERGY_THRESHOLD
	                    && _.sum(room.terminal.store) < 270000) {
	                    this.severeShortages.push(room.terminal);
	                }
	                else if (room.controller.my && room.terminal.store.energy >= 30000 &&
	                    room.storage.store.energy > constants_1.SUPPLY_ENERGY_THRESHOLD) {
	                    this.surpluses.push(room.terminal);
	                }
	            }
	        }
	        else {
	            let amount = room.terminal.store[this.tradeResource] || 0;
	            if (!swap && amount < constants_1.RESERVE_AMOUNT && _.sum(room.terminal.store) < 270000) {
	                this.shortages.push(room.terminal);
	            }
	            else if (room.controller.my && room.terminal.store.energy >= 10000 && amount >= constants_1.RESERVE_AMOUNT * 2) {
	                this.surpluses.push(room.terminal);
	            }
	        }
	    }
	    tradeMonkey() {
	        let pairs = [];
	        let shortages = this.shortages;
	        let ignoreDistance = false;
	        if (this.severeShortages.length > 0) {
	            shortages = this.severeShortages;
	        }
	        for (let sender of this.surpluses) {
	            let closestReciever = _.sortBy(shortages, (t) => {
	                return Game.map.getRoomLinearDistance(sender.room.name, t.room.name);
	            })[0];
	            if (!closestReciever)
	                continue;
	            let distance = Game.map.getRoomLinearDistance(sender.room.name, closestReciever.room.name);
	            if (this.tradeResource === RESOURCE_ENERGY && distance > constants_1.TRADE_MAX_DISTANCE && _.sum(sender.room.storage.store) < 940000
	                && !ignoreDistance)
	                continue;
	            pairs.push({
	                sender: sender,
	                reciever: closestReciever,
	                distance: distance,
	            });
	        }
	        pairs = _.sortBy(pairs, p => p.distance);
	        while (pairs.length > 0) {
	            let sender = pairs[0].sender;
	            let reciever = pairs[0].reciever;
	            let amount = constants_1.RESERVE_AMOUNT - (reciever.store[this.tradeResource] || 0);
	            if (this.tradeResource === RESOURCE_ENERGY) {
	                amount = constants_1.TRADE_ENERGY_AMOUNT;
	            }
	            this.sendResource(sender, this.tradeResource, amount, reciever);
	            pairs = _.filter(pairs, p => p.sender !== sender && p.reciever !== reciever);
	        }
	    }
	    sendResource(localTerminal, resourceType, amount, otherTerminal) {
	        if (amount < 100) {
	            amount = 100;
	        }
	        let outcome = localTerminal.send(resourceType, amount, otherTerminal.room.name);
	        if (outcome === OK) {
	            let distance = Game.map.getRoomLinearDistance(otherTerminal.room.name, localTerminal.room.name, true);
	            console.log("NETWORK:", localTerminal.room.name, "→", otherTerminal.room.name + ":", amount, resourceType, "(" + otherTerminal.owner.username.substring(0, 3) + ", dist: " + distance + ")");
	        }
	        else {
	            console.log(`NETWORK: error sending resource in ${localTerminal.room.name}, outcome: ${outcome}`);
	            console.log(`arguments used: ${resourceType}, ${amount}, ${otherTerminal.room.name}`);
	        }
	    }
	    addNuke(activeNuke) {
	        this.memory.activeNukes.push(activeNuke);
	    }
	    reportNukes() {
	        if (Game.time % constants_1.TICK_FULL_REPORT !== 0)
	            return;
	        for (let activeNuke of this.memory.activeNukes) {
	            console.log(`EMPIRE: ${Game.time - activeNuke.tick} till our nuke lands in ${activeNuke.roomName}`);
	        }
	    }
	}
	exports.Empire = Empire;


/***/ },
/* 3 */
/*!******************************!*\
  !*** ./src/ai/SpawnGroup.ts ***!
  \******************************/
/***/ function(module, exports) {

	"use strict";
	class SpawnGroup {
	    constructor(room) {
	        this.room = room;
	        this.spawns = room.find(FIND_MY_SPAWNS);
	        if (!this.room.memory.spawnMemory)
	            this.room.memory.spawnMemory = {};
	        this.memory = this.room.memory.spawnMemory;
	        this.extensions = room.findStructures(STRUCTURE_EXTENSION);
	        this.manageSpawnLog();
	        this.availableSpawnCount = this.getSpawnAvailability();
	        this.isAvailable = this.availableSpawnCount > 0;
	        this.currentSpawnEnergy = this.room.energyAvailable;
	        this.maxSpawnEnergy = this.room.energyCapacityAvailable;
	        this.pos = _.head(this.spawns).pos;
	    }
	    spawn(build, name, memory, reservation) {
	        let outcome;
	        this.isAvailable = false;
	        if (reservation) {
	            if (this.availableSpawnCount < reservation.spawns)
	                return ERR_BUSY;
	            if (this.currentSpawnEnergy < reservation.currentEnergy)
	                return ERR_NOT_ENOUGH_RESOURCES;
	        }
	        for (let spawn of this.spawns) {
	            if (spawn.spawning == null) {
	                outcome = spawn.createCreep(build, name, memory);
	                if (Memory.playerConfig.muteSpawn)
	                    break; // early
	                if (outcome === ERR_INVALID_ARGS) {
	                    console.log("SPAWN: invalid args for creep\nbuild:", build, "\nname:", name, "\ncount:", build.length);
	                }
	                if (_.isString(outcome)) {
	                    console.log("SPAWN: building " + name);
	                }
	                else if (outcome === ERR_NOT_ENOUGH_RESOURCES) {
	                    if (Game.time % 10 === 0) {
	                        console.log("SPAWN:", this.room.name, "not enough energy for", name, "cost:", SpawnGroup.calculateBodyCost(build), "current:", this.currentSpawnEnergy, "max", this.maxSpawnEnergy);
	                    }
	                }
	                else if (outcome !== ERR_NAME_EXISTS) {
	                    console.log("SPAWN:", this.room.name, "had error spawning " + name + ", outcome: " + outcome);
	                }
	                break;
	            }
	        }
	        return outcome;
	    }
	    getSpawnAvailability() {
	        let count = 0;
	        for (let spawn of this.spawns) {
	            if (spawn.spawning === null) {
	                count++;
	            }
	        }
	        this.memory.log.availability += count;
	        Memory.stats["spawnGroups." + this.room.name + ".idleCount"] = count;
	        return count;
	    }
	    getCurrentSpawnEnergy() {
	        let sum = 0;
	        for (let ext of this.extensions) {
	            sum += ext.energy;
	        }
	        for (let spawn of this.spawns) {
	            sum += spawn.energy;
	        }
	        return sum;
	    }
	    getMaxSpawnEnergy() {
	        let contollerLevel = this.room.controller.level;
	        let extensionCount = this.extensions.length;
	        let spawnCount = this.spawns.length;
	        return spawnCount * SPAWN_ENERGY_CAPACITY + extensionCount * EXTENSION_ENERGY_CAPACITY[contollerLevel];
	    }
	    static calculateBodyCost(body) {
	        let sum = 0;
	        for (let part of body) {
	            sum += BODYPART_COST[part];
	        }
	        return sum;
	    }
	    canCreateCreep(body) {
	        let cost = SpawnGroup.calculateBodyCost(body);
	        return cost <= this.currentSpawnEnergy;
	    }
	    // proportion allows you to scale down the body size if you don't want to use all of your spawning energy
	    // for example, proportion of .5 would return the max units per cost if only want to use half of your spawning capacity
	    maxUnitsPerCost(unitCost, proportion = 1) {
	        return Math.floor((this.maxSpawnEnergy * proportion) / unitCost);
	    }
	    maxUnits(body, proportion) {
	        let cost = SpawnGroup.calculateBodyCost(body);
	        return Math.min(this.maxUnitsPerCost(cost, proportion), Math.floor(50 / body.length));
	    }
	    manageSpawnLog() {
	        if (!this.memory.log)
	            this.memory.log = { availability: 0, history: [], longHistory: [] };
	        if (Game.time % 100 !== 0)
	            return; // early
	        let log = this.memory.log;
	        let average = log.availability / 100;
	        log.availability = 0;
	        /*
	        if (average > 1) console.log("SPAWNING:", this.room, "not very busy (avg", average, "idle out of",
	            this.spawns.length, "), perhaps add more harvesting");
	        if (average < .1) console.log("SPAWNING:", this.room, "very busy (avg", average, "idle out of",
	            this.spawns.length, "), might want to reduce harvesting");
	            */
	        log.history.push(average);
	        while (log.history.length > 5)
	            log.history.shift();
	        if (Game.time % 500 !== 0)
	            return; // early
	        let longAverage = _.sum(log.history) / 5;
	        log.longHistory.push(longAverage);
	        while (log.history.length > 5)
	            log.history.shift();
	    }
	    showHistory() {
	        console.log("Average availability in", this.room.name, "the last 5 creep generations (1500 ticks):");
	        console.log(this.memory.log.history);
	        console.log("Average availability over the last 75000 ticks (each represents a period of 15000 ticks)");
	        console.log(this.memory.log.longHistory);
	    }
	    averageAvailability() {
	        return _.last(this.memory.log.history);
	    }
	}
	exports.SpawnGroup = SpawnGroup;


/***/ },
/* 4 */
/*!*********************************!*\
  !*** ./src/config/constants.ts ***!
  \*********************************/
/***/ function(module, exports) {

	"use strict";
	exports.TICK_TRANSPORT_ANALYSIS = 1;
	exports.TICK_FULL_REPORT = 0;
	exports.DESTINATION_REACHED = -1201;
	exports.ROOMTYPE_SOURCEKEEPER = -1301;
	exports.ROOMTYPE_CORE = -1302;
	exports.ROOMTYPE_CONTROLLER = -1303;
	exports.ROOMTYPE_ALLEY = -1304;
	exports.CACHE_INVALIDATION_FREQUENCY = 1000;
	exports.CACHE_INVALIDATION_PERIOD = 10;
	exports.PRIORITY_BUILD = [
	    STRUCTURE_SPAWN,
	    STRUCTURE_TOWER,
	    STRUCTURE_EXTENSION,
	    STRUCTURE_ROAD,
	    STRUCTURE_CONTAINER,
	    STRUCTURE_LINK,
	    STRUCTURE_STORAGE
	];
	exports.LOADAMOUNT_MINERAL = Math.ceil(33 / 6);
	exports.ALLIES = {
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
	exports.KCLUBBERS = ["bonzaiferroni", "taiga", "Reini", "Vervorris", "Jeb"];
	exports.USERNAME = _.first(_.toArray(Game.structures)).owner.username;
	var OperationPriority;
	(function (OperationPriority) {
	    OperationPriority[OperationPriority["Emergency"] = 0] = "Emergency";
	    OperationPriority[OperationPriority["OwnedRoom"] = 1] = "OwnedRoom";
	    OperationPriority[OperationPriority["VeryHigh"] = 2] = "VeryHigh";
	    OperationPriority[OperationPriority["High"] = 3] = "High";
	    OperationPriority[OperationPriority["Medium"] = 4] = "Medium";
	    OperationPriority[OperationPriority["Low"] = 5] = "Low";
	    OperationPriority[OperationPriority["VeryLow"] = 6] = "VeryLow";
	})(OperationPriority = exports.OperationPriority || (exports.OperationPriority = {}));
	// these are the constants that govern your energy balance
	// rooms below this will try to pull energy...
	exports.NEED_ENERGY_THRESHOLD = 200000;
	// ...from rooms above this.
	exports.SUPPLY_ENERGY_THRESHOLD = 250000;
	// rooms that are above this will try to push energy to any room accepting energy (like swap operations)
	exports.SUPPLY_SWAP_THRESHOLD = 300000;
	// rooms above this will start processing power
	exports.POWER_PROCESS_THRESHOLD = 350000;
	// rooms above this will spawn a more powerful wall-builder to try to sink energy that way
	exports.ENERGYSINK_THRESHOLD = 450000;
	exports.SWAP_RESERVE = 950000;
	exports.MINERALS_RAW = ["H", "O", "Z", "U", "K", "L", "X"];
	exports.PRODUCT_LIST = ["XUH2O", "XLHO2", "XKHO2", "XGHO2", "XZHO2", "XZH2O", "G", "XLH2O", "XGH2O"];
	exports.TRADE_RESOURCES = exports.PRODUCT_LIST.concat(exports.MINERALS_RAW).concat([RESOURCE_POWER, RESOURCE_ENERGY]);
	exports.TRADE_MAX_DISTANCE = 6;
	exports.TRADE_ENERGY_AMOUNT = 10000;
	exports.IGOR_CAPACITY = 1000;
	exports.RESERVE_AMOUNT = 5000;
	// terminals with more than this will try to trade a mineral in the network
	exports.PRODUCTION_AMOUNT = Math.ceil((exports.RESERVE_AMOUNT * 2) / exports.IGOR_CAPACITY) * exports.IGOR_CAPACITY;
	exports.RESOURCE_VALUE = {
	    energy: .05,
	    H: 1,
	    O: 1,
	    Z: 1,
	    K: 1,
	    U: 1,
	    L: 1,
	    X: 1,
	};
	exports.PRODUCT_PRICE = {
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
	exports.MINERAL_STORAGE_TARGET = {
	    H: 150000,
	    O: 150000,
	    K: 100000,
	    Z: 100000,
	    U: 100000,
	    L: 100000,
	    X: 140000,
	};
	exports.REAGENT_LIST = {
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


/***/ },
/* 5 */
/*!*******************************!*\
  !*** ./src/helpers/helper.ts ***!
  \*******************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	exports.helper = {
	    getStoredAmount(target, resourceType) {
	        if (target instanceof Creep) {
	            return target.carry[resourceType];
	        }
	        else if (target.hasOwnProperty("store")) {
	            return target.store[resourceType];
	        }
	        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
	            return target.energy;
	        }
	    },
	    getCapacity(target) {
	        if (target instanceof Creep) {
	            return target.carryCapacity;
	        }
	        else if (target.hasOwnProperty("store")) {
	            return target.storeCapacity;
	        }
	        else if (target.hasOwnProperty("energyCapacity")) {
	            return target.energyCapacity;
	        }
	    },
	    isFull(target, resourceType) {
	        if (target instanceof Creep) {
	            return target.carry[resourceType] === target.carryCapacity;
	        }
	        else if (target.hasOwnProperty("store")) {
	            return target.store[resourceType] === target.storeCapacity;
	        }
	        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
	            return target.energy === target.energyCapacity;
	        }
	    },
	    clampDirection(direction) {
	        while (direction < 1)
	            direction += 8;
	        while (direction > 8)
	            direction -= 8;
	        return direction;
	    },
	    deserializeRoomPosition(roomPosition) {
	        return new RoomPosition(roomPosition.x, roomPosition.y, roomPosition.roomName);
	    },
	    checkEnemy(username, roomName) {
	        if (constants_1.ALLIES[username]) {
	            return false;
	        }
	        // make note of non-ally, non-npc creeps
	        if (username !== "Invader" && username !== "Source Keeper") {
	            this.strangerDanger(username, roomName);
	        }
	        return true;
	    },
	    strangerDanger(username, roomName) {
	        if (!Memory.strangerDanger) {
	            Memory.strangerDanger = {};
	        }
	        if (!Memory.strangerDanger[username]) {
	            Memory.strangerDanger[username] = [];
	        }
	        let lastReport = _.last(Memory.strangerDanger[username]);
	        if (!lastReport || lastReport.tickSeen < Game.time - 2000) {
	            let report = { tickSeen: Game.time, roomName: roomName };
	            console.log("STRANGER DANGER: one of", username, "\'s creeps seen in", roomName);
	            Memory.strangerDanger[username].push(report);
	            while (Memory.strangerDanger[username].length > 10)
	                Memory.strangerDanger[username].shift();
	        }
	    },
	    findCore(roomName) {
	        let coreName = "";
	        let digit;
	        for (let i of roomName) {
	            let parse = parseInt(i);
	            if (isNaN(parse)) {
	                if (digit !== undefined) {
	                    coreName += Math.floor(digit / 10) * 10 + 5;
	                    digit = undefined;
	                }
	                coreName += i;
	            }
	            else {
	                if (digit === undefined) {
	                    digit = 0;
	                }
	                else {
	                    digit *= 10;
	                }
	                digit += parse;
	            }
	        }
	        coreName += Math.floor(digit / 10) * 10 + 5;
	        return coreName;
	    },
	    /**
	     * Return room coordinates for a given Room, authored by tedivm
	     * @param roomName
	     * @returns {{x: (string|any), y: (string|any), x_dir: (string|any), y_dir: (string|any)}}
	     */
	    getRoomCoordinates(roomName) {
	        let coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
	        let match = coordinateRegex.exec(roomName);
	        if (!match)
	            return;
	        let xDir = match[1];
	        let x = match[2];
	        let yDir = match[3];
	        let y = match[4];
	        return {
	            x: Number(x),
	            y: Number(y),
	            xDir: xDir,
	            yDir: yDir,
	        };
	    },
	    findSightedPath(start, goal, goalRange, observer, cache) {
	        if (Game.cpu.bucket < 8000) {
	            console.log("PATH: waiting for full bucket");
	            return;
	        }
	        let invalid = false;
	        let ret = PathFinder.search(start, [{ pos: goal, range: goalRange }], {
	            maxOps: 10000,
	            maxRooms: 16,
	            roomCallback: (roomName) => {
	                if (invalid) {
	                    return false;
	                }
	                if (cache.matrices[roomName]) {
	                    return cache.matrices[roomName];
	                }
	                if (_.includes(cache.avoidRooms, roomName)) {
	                    return false;
	                }
	                let room = Game.rooms[roomName];
	                if (!room) {
	                    console.log("PATH: can't see", roomName + ", aiming observer at it");
	                    observer.observeRoom(roomName);
	                    invalid = true;
	                    return false;
	                }
	                if (room.controller && room.controller.level > 0) {
	                    if (room.controller.my) {
	                        return;
	                    }
	                    else {
	                        cache.avoidRooms.push(roomName);
	                        return false;
	                    }
	                }
	                let costs = new PathFinder.CostMatrix();
	                room.find(FIND_STRUCTURES).forEach((s) => {
	                    if (s.structureType !== STRUCTURE_ROAD)
	                        costs.set(s.pos.x, s.pos.y, 0xff);
	                });
	                cache.matrices[roomName] = costs;
	                return costs;
	            }
	        });
	        if (!invalid) {
	            console.log("PATH: successfully found sighted path");
	            return ret;
	        }
	    },
	    negaDirection(dir) {
	        switch (dir) {
	            case "W":
	                return "E";
	            case "E":
	                return "W";
	            case "N":
	                return "S";
	            case "S":
	                return "N";
	        }
	    },
	    blockOffMatrix(costs, roomObject, range, cost = 30) {
	        for (let xDelta = -range; xDelta <= range; xDelta++) {
	            for (let yDelta = -range; yDelta <= range; yDelta++) {
	                if (Game.map.getTerrainAt(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, roomObject.room.name) === "wall")
	                    continue;
	                costs.set(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, cost);
	            }
	        }
	    },
	    addStructuresToMatrix(costs, room, roadCost = 1) {
	        room.find(FIND_STRUCTURES).forEach(function (structure) {
	            if (structure instanceof StructureRampart) {
	                if (!structure.my) {
	                    costs.set(structure.pos.x, structure.pos.y, 0xff);
	                }
	            }
	            else if (structure instanceof StructureRoad) {
	                // Favor roads over plain tiles
	                costs.set(structure.pos.x, structure.pos.y, roadCost);
	            }
	            else if (structure.structureType !== STRUCTURE_CONTAINER) {
	                // Can't walk through non-walkable buildings
	                costs.set(structure.pos.x, structure.pos.y, 0xff);
	            }
	        });
	        return costs;
	    },
	    addTerrainToMatrix(matrix, roomName) {
	        for (let x = 0; x < 50; x++) {
	            for (let y = 0; y < 50; y++) {
	                let terrain = Game.map.getTerrainAt(x, y, roomName);
	                if (terrain === "wall") {
	                    matrix.set(x, y, 0xff);
	                }
	                else if (terrain === "swamp") {
	                    matrix.set(x, y, 5);
	                }
	                else {
	                    matrix.set(x, y, 1);
	                }
	            }
	        }
	        return;
	    },
	    findRelativeRoomName(room, xDelta, yDelta) {
	        if (!room)
	            return;
	        let xDir = room.coords.xDir;
	        let yDir = room.coords.yDir;
	        let x = room.coords.x + xDelta;
	        let y = room.coords.y + yDelta;
	        if (x < 0) {
	            x = Math.abs(x) - 1;
	            xDir = this.negaDirection(xDir);
	        }
	        if (y < 0) {
	            y = Math.abs(y) - 1;
	            yDir = this.negaDirection(yDir);
	        }
	        return xDir + x + yDir + y;
	    },
	    blockOffExits(matrix, cost = 0xff) {
	        for (let i = 0; i < 50; i += 49) {
	            for (let j = 0; j < 50; j++) {
	                matrix.set(i, j, cost);
	            }
	        }
	        for (let i = 0; i < 50; i++) {
	            for (let j = 0; j < 50; j += 49) {
	                matrix.set(i, j, cost);
	            }
	        }
	        return matrix;
	    },
	    showMatrix(matrix) {
	        // showMatrix
	        for (let y = 0; y < 50; y++) {
	            let line = "";
	            for (let x = 0; x < 50; x++) {
	                let value = matrix.get(x, y);
	                if (value === 0xff)
	                    line += "f";
	                else
	                    line += value % 10;
	            }
	            console.log(line);
	        }
	    },
	    coordToPosition(coord, centerPosition, rotation = 0) {
	        if (!(centerPosition instanceof RoomPosition)) {
	            centerPosition = this.deserializeRoomPosition(centerPosition);
	        }
	        let xCoord = coord.x;
	        let yCoord = coord.y;
	        if (rotation === 1) {
	            xCoord = -coord.y;
	            yCoord = coord.x;
	        }
	        else if (rotation === 2) {
	            xCoord = -coord.x;
	            yCoord = -coord.y;
	        }
	        else if (rotation === 3) {
	            xCoord = coord.y;
	            yCoord = -coord.x;
	        }
	        return new RoomPosition(centerPosition.x + xCoord, centerPosition.y + yCoord, centerPosition.roomName);
	    },
	    positionToCoord(pos, centerPoint, rotation = 0) {
	        let xCoord = pos.x - centerPoint.x;
	        let yCoord = pos.y - centerPoint.y;
	        if (rotation === 0) {
	            return { x: xCoord, y: yCoord };
	        }
	        else if (rotation === 1) {
	            return { x: yCoord, y: -xCoord };
	        }
	        else if (rotation === 2) {
	            return { x: -xCoord, y: -yCoord };
	        }
	        else if (rotation === 3) {
	            return { x: -yCoord, y: xCoord };
	        }
	    }
	};


/***/ },
/* 6 */
/*!********************************************!*\
  !*** ./src/ai/operations/FortOperation.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const EmergencyMission_1 = __webpack_require__(/*! ../missions/EmergencyMission */ 8);
	const RefillMission_1 = __webpack_require__(/*! ../missions/RefillMission */ 10);
	const DefenseMission_1 = __webpack_require__(/*! ../missions/DefenseMission */ 11);
	const PowerMission_1 = __webpack_require__(/*! ../missions/PowerMission */ 12);
	const TerminalNetworkMission_1 = __webpack_require__(/*! ../missions/TerminalNetworkMission */ 13);
	const IgorMission_1 = __webpack_require__(/*! ../missions/IgorMission */ 14);
	const LinkMiningMission_1 = __webpack_require__(/*! ../missions/LinkMiningMission */ 15);
	const MiningMission_1 = __webpack_require__(/*! ../missions/MiningMission */ 16);
	const BuildMission_1 = __webpack_require__(/*! ../missions/BuildMission */ 17);
	const LinkNetworkMission_1 = __webpack_require__(/*! ../missions/LinkNetworkMission */ 18);
	const UpgradeMission_1 = __webpack_require__(/*! ../missions/UpgradeMission */ 19);
	const GeologyMission_1 = __webpack_require__(/*! ../missions/GeologyMission */ 20);
	class FortOperation extends Operation_1.Operation {
	    /**
	     * Manages the activities of an owned room, assumes bonzaiferroni's build spec
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.OwnedRoom;
	    }
	    initOperation() {
	        if (this.flag.room) {
	            // initOperation FortOperation variables
	            this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
	            this.empire.register(this.flag.room);
	            // spawn emergency miner if needed
	            this.addMission(new EmergencyMission_1.EmergencyMinerMission(this));
	            // refill spawning energy - will spawn small spawnCart if needed
	            let structures = this.flag.room.findStructures(STRUCTURE_EXTENSION)
	                .concat(this.flag.room.find(FIND_MY_SPAWNS));
	            let maxCarts = this.flag.room.storage ? 1 : 2;
	            this.addMission(new RefillMission_1.RefillMission(this));
	            this.addMission(new DefenseMission_1.DefenseMission(this));
	            if (this.memory.powerMining) {
	                this.addMission(new PowerMission_1.PowerMission(this));
	            }
	            // energy network
	            if (this.flag.room.terminal && this.flag.room.storage) {
	                this.addMission(new TerminalNetworkMission_1.TerminalNetworkMission(this));
	                this.addMission(new IgorMission_1.IgorMission(this));
	            }
	            // harvest energy
	            for (let i = 0; i < this.sources.length; i++) {
	                if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0)
	                    continue;
	                let source = this.sources[i];
	                if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
	                    let link = source.findMemoStructure(STRUCTURE_LINK, 2);
	                    if (link) {
	                        this.addMission(new LinkMiningMission_1.LinkMiningMission(this, "linkMiner" + i, source, link));
	                        continue;
	                    }
	                }
	                this.addMission(new MiningMission_1.MiningMission(this, "miner" + i, source));
	            }
	            // build construction
	            this.addMission(new BuildMission_1.BuildMission(this));
	            // build walls
	            // TODO: make MasonMission
	            // use link array near storage to fire energy at controller link (pre-rcl8)
	            if (this.flag.room.storage) {
	                this.addMission(new LinkNetworkMission_1.LinkNetworkMission(this));
	                let extractor = this.mineral.pos.lookFor(LOOK_STRUCTURES)[0];
	                if (this.flag.room.energyCapacityAvailable > 5000 && extractor && extractor.my) {
	                    this.addMission(new GeologyMission_1.GeologyMission(this));
	                }
	            }
	            // upgrader controller
	            let boostUpgraders = this.flag.room.controller.level < 8;
	            this.addMission(new UpgradeMission_1.UpgradeMission(this, boostUpgraders));
	        }
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	        this.memory.masonPotency = undefined;
	        this.memory.builderPotency = undefined;
	    }
	    calcMasonPotency() {
	        if (!this.memory.masonPotency) {
	            let surplusMode = this.flag.room.storage && this.flag.room.storage.store.energy > constants_1.NEED_ENERGY_THRESHOLD;
	            let megaSurplusMode = this.flag.room.storage && this.flag.room.storage.store.energy > constants_1.ENERGYSINK_THRESHOLD;
	            let potencyBasedOnStorage = megaSurplusMode ? 10 : surplusMode ? 5 : 1;
	            if (this.memory.wallBoost) {
	                potencyBasedOnStorage = 20;
	            }
	            // would happen to be the same as the potency used for builders
	            let potencyBasedOnSpawn = this.calcBuilderPotency();
	            if (this.memory.wallBoost) {
	                this.memory.mason.activateBoost = true;
	            }
	            this.memory.masonPotency = Math.min(potencyBasedOnSpawn, potencyBasedOnStorage);
	        }
	        return this.memory.masonPotency;
	    }
	    calcBuilderPotency() {
	        if (!this.memory.builderPotency) {
	            this.memory.builderPotency = Math.min(Math.floor(this.spawnGroup.maxSpawnEnergy / 175), 20);
	        }
	        return this.memory.builderPotency;
	    }
	    nuke(x, y, roomName) {
	        let nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_NUKER } }));
	        let outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
	        if (outcome === OK) {
	            this.empire.addNuke({ tick: Game.time, roomName: roomName });
	            return "NUKER: Bombs away! \\o/";
	        }
	        else {
	            return `NUKER: error: ${outcome}`;
	        }
	    }
	    addAllyRoom(roomName) {
	        if (_.includes(this.memory.network.scanData.roomNames, roomName)) {
	            return "NETWORK: " + roomName + " is already being scanned by " + this.name;
	        }
	        this.memory.network.scanData.roomNames.push(roomName);
	        this.empire.addAllyForts([roomName]);
	        return "NETWORK: added " + roomName + " to rooms scanned by " + this.name;
	    }
	}
	exports.FortOperation = FortOperation;


/***/ },
/* 7 */
/*!****************************************!*\
  !*** ./src/ai/operations/Operation.ts ***!
  \****************************************/
/***/ function(module, exports) {

	"use strict";
	class Operation {
	    /**
	     *
	     * @param flag - missions will operate relative to this flag, use the following naming convention: "operationType_operationName"
	     * @param name - second part of flag.name, should be unique amont all other operation names (I use city names)
	     * @param type - first part of flag.name, used to determine which operation class to instantiate
	     * @param empire - object used for empire-scoped behavior (terminal transmission, etc.)
	     */
	    constructor(flag, name, type, empire) {
	        this.flag = flag;
	        this.name = name;
	        this.type = type;
	        Object.defineProperty(this, "empire", { enumerable: false, value: empire });
	        Object.defineProperty(this, "memory", { enumerable: false, value: flag.memory });
	        if (!this.missions) {
	            this.missions = {};
	        }
	        // variables that require vision (null check where appropriate)
	        if (this.flag.room) {
	            this.hasVision = true;
	            this.sources = this.flag.room.find(FIND_SOURCES);
	            this.mineral = _.head(this.flag.room.find(FIND_MINERALS));
	        }
	    }
	    /**
	     * Init Phase - initialize operation variables and instantiate missions
	     */
	    init() {
	        try {
	            this.initOperation();
	        }
	        catch (e) {
	            console.log("error caught in initOperation phase, operation:", this.name);
	            console.log(e.stack);
	        }
	        for (let missionName in this.missions) {
	            try {
	                this.missions[missionName].initMission();
	            }
	            catch (e) {
	                console.log("error caught in initMission phase, operation:", this.name, "mission:", missionName);
	                console.log(e.stack);
	            }
	        }
	    }
	    /**
	     * RoleCall Phase - Iterate through missions and call mission.roleCall()
	     */
	    roleCall() {
	        // mission roleCall
	        for (let missionName in this.missions) {
	            try {
	                this.missions[missionName].roleCall();
	            }
	            catch (e) {
	                console.log("error caught in roleCall phase, operation:", this.name, "mission:", missionName);
	                console.log(e.stack);
	            }
	        }
	    }
	    /**
	     * Action Phase - Iterate through missions and call mission.missionActions()
	     */
	    actions() {
	        // mission actions
	        for (let missionName in this.missions) {
	            try {
	                this.missions[missionName].missionActions();
	            }
	            catch (e) {
	                console.log("error caught in missionActions phase, operation:", this.name, "mission:", missionName, "in room ", this.flag.pos.roomName);
	                console.log(e.stack);
	            }
	        }
	    }
	    /**
	     * Finalization Phase - Iterate through missions and call mission.finalizeMission(), also call operation.finalizeOperation()
	     */
	    finalize() {
	        // mission actions
	        for (let missionName in this.missions) {
	            try {
	                this.missions[missionName].finalizeMission();
	            }
	            catch (e) {
	                console.log("error caught in finalizeMission phase, operation:", this.name, "mission:", missionName);
	                console.log(e.stack);
	            }
	        }
	        try {
	            this.finalizeOperation();
	        }
	        catch (e) {
	            console.log("error caught in finalizeOperation phase, operation:", this.name);
	            console.log(e.stack);
	        }
	    }
	    /**
	     * Invalidate Cache Phase - Occurs every-so-often (see constants.ts) to give you an efficient means of invalidating operation and
	     * mission cache
	     */
	    invalidateCache() {
	        // base rate of 1 proc out of 100 ticks
	        if (Math.random() < .01)
	            for (let missionName in this.missions) {
	                try {
	                    this.missions[missionName].invalidateMissionCache();
	                }
	                catch (e) {
	                    console.log("error caught in invalidateMissionCache phase, operation:", this.name, "mission:", missionName);
	                    console.log(e.stack);
	                }
	            }
	        try {
	            this.invalidateOperationCache();
	        }
	        catch (e) {
	            console.log("error caught in invalidateOperationCache phase, operation:", this.name);
	            console.log(e.stack);
	        }
	    }
	    /**
	     * Add mission to operation.missions hash
	     * @param mission
	     */
	    addMission(mission) {
	        // it is important for every mission belonging to an operation to have
	        // a unique name or they will be overwritten here
	        this.missions[mission.name] = mission;
	    }
	    getRemoteSpawnGroup() {
	        if (!this.memory.spawnRoom) {
	            let spawnGroup = this.flag.pos.findClosestByLongPath(_.values(this.empire.spawnGroups));
	            if (spawnGroup) {
	                this.memory.spawnRoom = spawnGroup.pos.roomName;
	            }
	            else {
	                return;
	            }
	        }
	        return this.empire.getSpawnGroup(this.memory.spawnRoom);
	    }
	    manualControllerBattery(id) {
	        let object = Game.getObjectById(id);
	        if (!object) {
	            return "that is not a valid game object or not in vision";
	        }
	        this.flag.room.memory.controllerBatteryId = id;
	        this.flag.room.memory.upgraderPositions = undefined;
	        return "controller battery assigned to" + object;
	    }
	    findOperationWaypoints() {
	        this.waypoints = [];
	        for (let i = 0; i < 100; i++) {
	            let flag = Game.flags[this.name + "_waypoints_" + i];
	            if (flag) {
	                this.waypoints.push(flag);
	            }
	            else {
	                break;
	            }
	        }
	    }
	    setSpawnRoom(roomName, portalTravel = false) {
	        if (roomName instanceof Operation) {
	            roomName = roomName.flag.room.name;
	        }
	        if (!this.empire.getSpawnGroup(roomName)) {
	            return "SPAWN: that room doesn't appear to host a valid spawnGroup";
	        }
	        if (!this.waypoints || !this.waypoints[0]) {
	            if (portalTravel) {
	                return "SPAWN: please set up waypoints before setting spawn room with portal travel";
	            }
	        }
	        else {
	            this.waypoints[0].memory.portalTravel = portalTravel;
	        }
	        this.memory.spawnRoom = roomName;
	        _.each(this.missions, (mission) => mission.invalidateSpawnDistance());
	        return "SPAWN: spawnRoom for " + this.name + " set to " + roomName + " (map range: " +
	            Game.map.getRoomLinearDistance(this.flag.pos.roomName, roomName) + ")";
	    }
	    setMax(missionName, max) {
	        if (!this.memory[missionName])
	            return "SPAWN: no " + missionName + " mission in " + this.name;
	        let oldValue = this.memory[missionName].max;
	        this.memory[missionName].max = max;
	        return "SPAWN: " + missionName + " max spawn value changed from " + oldValue + " to " + max;
	    }
	    setBoost(missionName, activateBoost) {
	        if (!this.memory[missionName])
	            return "SPAWN: no " + missionName + " mission in " + this.name;
	        let oldValue = this.memory[missionName].activateBoost;
	        this.memory[missionName].activateBoost = activateBoost;
	        return "SPAWN: " + missionName + " boost value changed from " + oldValue + " to " + activateBoost;
	    }
	    repair(id, hits) {
	        if (!id || !hits)
	            return "usage: opName.repair(id, hits)";
	        if (!this.memory.mason)
	            return "no mason available for repair instructions";
	        let object = Game.getObjectById(id);
	        if (!object)
	            return "that object doesn't seem to exist";
	        if (!(object instanceof Structure))
	            return "that isn't a structure";
	        if (hits > object.hitsMax)
	            return object.structureType + " cannot have more than " + object.hitsMax + " hits";
	        this.memory.mason.manualTargetId = id;
	        this.memory.mason.manualTargetHits = hits;
	        return "MASON: repairing " + object.structureType + " to " + hits + " hits";
	    }
	}
	exports.Operation = Operation;


/***/ },
/* 8 */
/*!*********************************************!*\
  !*** ./src/ai/missions/EmergencyMission.ts ***!
  \*********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class EmergencyMinerMission extends Mission_1.Mission {
	    /**
	     * Checks every 100 ticks if storage is full or a miner is present, if not spawns an emergency miner. Should come
	     * first in FortOperation
	     * @param operation
	     */
	    constructor(operation) {
	        super(operation, "emergencyMiner");
	    }
	    initMission() {
	    }
	    roleCall() {
	        let energyAvailable = this.spawnGroup.currentSpawnEnergy >= 1300 ||
	            (this.room.storage && this.room.storage.store.energy > 1300) || this.findMinersBySources();
	        let body = () => this.workerBody(2, 1, 1);
	        if (energyAvailable) {
	            this.memory.lastTick = Game.time;
	        }
	        let maxEmergencyMiners = 0;
	        if (!this.memory.lastTick || Game.time - this.memory.lastTick > 100) {
	            if (Game.time % 10 === 0) {
	                console.log("ATTN: Backup miner being spawned in", this.opName);
	            }
	            maxEmergencyMiners = 2;
	        }
	        this.emergencyMiners = this.headCount("emergencyMiner", body, maxEmergencyMiners);
	    }
	    missionActions() {
	        for (let miner of this.emergencyMiners) {
	            this.minerActions(miner);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    minerActions(miner) {
	        let closest = miner.pos.findClosestByRange(FIND_SOURCES);
	        if (!miner.pos.isNearTo(closest)) {
	            miner.blindMoveTo(closest);
	            return;
	        }
	        miner.memory.donatesEnergy = true;
	        miner.memory.scavanger = RESOURCE_ENERGY;
	        miner.harvest(closest);
	    }
	    findMinersBySources() {
	        for (let source of this.room.find(FIND_SOURCES)) {
	            if (source.pos.findInRange(FIND_MY_CREEPS, 1, (c) => c.partCount(WORK) > 0).length > 0) {
	                return true;
	            }
	        }
	        return false;
	    }
	}
	exports.EmergencyMinerMission = EmergencyMinerMission;


/***/ },
/* 9 */
/*!************************************!*\
  !*** ./src/ai/missions/Mission.ts ***!
  \************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class Mission {
	    constructor(operation, name, allowSpawn = true) {
	        this.partnerPairing = {};
	        this.name = name;
	        this.opName = operation.name;
	        this.opType = operation.type;
	        Object.defineProperty(this, "flag", { enumerable: false, value: operation.flag });
	        Object.defineProperty(this, "room", { enumerable: false, value: operation.flag.room });
	        Object.defineProperty(this, "empire", { enumerable: false, value: operation.empire });
	        Object.defineProperty(this, "spawnGroup", { enumerable: false, value: operation.spawnGroup, writable: true });
	        Object.defineProperty(this, "sources", { enumerable: false, value: operation.sources });
	        if (!operation.flag.memory[this.name])
	            operation.flag.memory[this.name] = {};
	        this.memory = operation.flag.memory[this.name];
	        this.allowSpawn = allowSpawn;
	        if (this.room)
	            this.hasVision = true;
	        // initialize memory to be used by this mission
	        if (!this.memory.spawn)
	            this.memory.spawn = {};
	        if (operation.waypoints && operation.waypoints.length > 0) {
	            this.waypoints = operation.waypoints;
	        }
	    }
	    setBoost(activateBoost) {
	        let oldValue = this.memory.activateBoost;
	        this.memory.activateBoost = activateBoost;
	        return `changing boost activation for ${this.name} in ${this.opName} from ${oldValue} to ${activateBoost}`;
	    }
	    setMax(max) {
	        let oldValue = this.memory.max;
	        this.memory.max = max;
	        return `changing max creeps for ${this.name} in ${this.opName} from ${oldValue} to ${max}`;
	    }
	    setSpawnGroup(spawnGroup) {
	        this.spawnGroup = spawnGroup;
	    }
	    invalidateSpawnDistance() {
	        if (this.memory.distanceToSpawn) {
	            console.log(`SPAWN: resetting distance for ${this.name} in ${this.opName}`);
	            this.memory.distanceToSpawn = undefined;
	        }
	    }
	    /**
	     * General purpose function for spawning creeps
	     * @param roleName - Used to find creeps belonging to this role, examples: miner, energyCart
	     * @param getBody - function that returns the body to be used if a new creep needs to be spawned
	     * @param max - how many creeps are currently desired, pass 0 to halt spawning
	     * @param options - Optional parameters like prespawn interval, whether to disable attack notifications, etc.
	     * @returns {Creep[]}
	     */
	    headCount(roleName, getBody, max, options) {
	        if (!options) {
	            options = {};
	        }
	        let roleArray = [];
	        if (!this.memory.spawn[roleName]) {
	            this.memory.spawn[roleName] = this.findOrphans(roleName);
	        }
	        let count = 0;
	        for (let i = 0; i < this.memory.spawn[roleName].length; i++) {
	            let creepName = this.memory.spawn[roleName][i];
	            let creep = Game.creeps[creepName];
	            if (creep) {
	                // newer code to implement waypoints/boosts
	                let prepared = this.prepCreep(creep, options);
	                if (prepared) {
	                    roleArray.push(creep);
	                }
	                let ticksNeeded = 0;
	                if (options.prespawn !== undefined) {
	                    ticksNeeded += creep.body.length * 3;
	                    ticksNeeded += options.prespawn;
	                }
	                if (!creep.ticksToLive || creep.ticksToLive > ticksNeeded) {
	                    count++;
	                }
	            }
	            else {
	                this.memory.spawn[roleName].splice(i, 1);
	                Memory.creeps[creepName] = undefined;
	                i--;
	            }
	        }
	        if (this.allowSpawn && this.spawnGroup.isAvailable && (count < max) && (this.hasVision || options.blindSpawn)) {
	            // if (this.opName === "dingus5" && this.name === "igor") console.log("spawn", count);
	            let creepName = this.opName + "_" + roleName + "_" + Math.floor(Math.random() * 100);
	            let outcome = this.spawnGroup.spawn(getBody(), creepName, options.memory, options.reservation);
	            if (_.isString(outcome))
	                this.memory.spawn[roleName].push(creepName);
	        }
	        return roleArray;
	    }
	    spawnSharedCreep(roleName, getBody) {
	        let spawnMemory = this.spawnGroup.spawns[0].memory;
	        if (!spawnMemory.communityRoles)
	            spawnMemory.communityRoles = {};
	        let employerName = this.opName + this.name;
	        let creep;
	        if (spawnMemory.communityRoles[roleName]) {
	            creep = Game.creeps[spawnMemory.communityRoles[roleName]];
	            if (creep) {
	                if (creep.memory.employer === employerName || (!creep.memory.lastTickEmployed || Game.time - creep.memory.lastTickEmployed > 1)) {
	                    creep.memory.employer = employerName;
	                    creep.memory.lastTickEmployed = Game.time;
	                    return creep;
	                }
	            }
	        }
	        if (!creep && this.spawnGroup.isAvailable) {
	            let outcome = this.spawnGroup.spawn(getBody(), "community_" + roleName + "_" + Math.floor(Math.random() * 100), undefined, undefined);
	            if (_.isString(outcome)) {
	                spawnMemory.communityRoles[roleName] = outcome;
	            }
	            else if (Game.time % 10 !== 0 && outcome !== ERR_NOT_ENOUGH_RESOURCES) {
	                console.log(`error spawning community ${roleName} in ${this.opName} outcome: ${outcome}`);
	            }
	        }
	    }
	    /**
	     * Returns creep body array with desired number of parts in this order: WORK → CARRY → MOVE
	     * @param workCount
	     * @param carryCount
	     * @param movecount
	     * @returns {string[]}
	     */
	    workerBody(workCount, carryCount, movecount) {
	        let body = [];
	        for (let i = 0; i < workCount; i++) {
	            body.push(WORK);
	        }
	        for (let i = 0; i < carryCount; i++) {
	            body.push(CARRY);
	        }
	        for (let i = 0; i < movecount; i++) {
	            body.push(MOVE);
	        }
	        return body;
	    }
	    configBody(config) {
	        let body = [];
	        for (let partType in config) {
	            let amount = config[partType];
	            for (let i = 0; i < amount; i++) {
	                body.push(partType);
	            }
	        }
	        return body;
	    }
	    /**
	     * Returns creep body array with the desired ratio of parts, governed by how much spawn energy is possible
	     * @param workRatio
	     * @param carryRatio
	     * @param moveRatio
	     * @param spawnFraction - proportion of spawn energy to be used up to 50 body parts, .5 would use half, 1 would use all
	     * @param limit - set a limit to the number of units (useful if you know the exact limit, like with miners)
	     * @returns {string[]}
	     */
	    bodyRatio(workRatio, carryRatio, moveRatio, spawnFraction, limit) {
	        let sum = workRatio * 100 + carryRatio * 50 + moveRatio * 50;
	        let partsPerUnit = workRatio + carryRatio + moveRatio;
	        if (!limit)
	            limit = Math.floor(50 / partsPerUnit);
	        let maxUnits = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy * spawnFraction) / sum), limit);
	        return this.workerBody(workRatio * maxUnits, carryRatio * maxUnits, moveRatio * maxUnits);
	    }
	    /**
	     * General purpose checking for creep load
	     * @param creep
	     * @returns {boolean}
	     */
	    hasLoad(creep) {
	        if (creep.memory.hasLoad && _.sum(creep.carry) === 0) {
	            creep.memory.hasLoad = false;
	        }
	        else if (!creep.memory.hasLoad && _.sum(creep.carry) === creep.carryCapacity) {
	            creep.memory.hasLoad = true;
	        }
	        return creep.memory.hasLoad;
	    }
	    /**
	     * Used to determine cart count/size based on transport distance and the bandwidth needed
	     * @param distance - distance (or average distance) from point A to point B
	     * @param load - how many resource units need to be transported per tick (example: 10 for an energy source)
	     * @returns {{body: string[], cartsNeeded: number}}
	     */
	    analyzeTransport(distance, load) {
	        if (!this.memory.transportAnalysis || load !== this.memory.transportAnalysis.load) {
	            // this value is multiplied by 2.1 to account for travel both ways and a small amount of error for traffic/delays
	            let bandwidthNeeded = distance * load * 2.1;
	            // cargo units are just 2 CARRY, 1 MOVE, which has a capacity of 100
	            let cargoUnitsNeeded = Math.ceil(bandwidthNeeded / 100);
	            let maxUnitsPossible = this.spawnGroup.maxUnits([CARRY, CARRY, MOVE]);
	            let cartsNeeded = Math.ceil(cargoUnitsNeeded / maxUnitsPossible);
	            let cargoUnitsPerCart = Math.ceil(cargoUnitsNeeded / cartsNeeded);
	            let body = this.workerBody(0, cargoUnitsPerCart * 2, cargoUnitsPerCart);
	            this.memory.transportAnalysis = {
	                load: load,
	                distance: distance,
	                body: body,
	                cartsNeeded: cartsNeeded,
	                carryCount: cargoUnitsPerCart * 2
	            };
	        }
	        return this.memory.transportAnalysis;
	    }
	    /**
	     * General-purpose energy getting, will look for an energy source in the same room as the operation flag (not creep)
	     * @param creep
	     * @param nextDestination
	     * @param highPriority - allows you to withdraw energy before a battery reaches an optimal amount of energy, jumping
	     * ahead of any other creeps trying to get energy
	     * @param getFromSource
	     */
	    procureEnergy(creep, nextDestination, highPriority = false, getFromSource = false) {
	        let battery = this.getBattery(creep);
	        if (battery) {
	            if (creep.pos.isNearTo(battery)) {
	                let outcome;
	                if (highPriority) {
	                    if (battery.store.energy >= 50) {
	                        outcome = creep.withdraw(battery, RESOURCE_ENERGY);
	                    }
	                }
	                else {
	                    outcome = creep.withdrawIfFull(battery, RESOURCE_ENERGY);
	                }
	                if (outcome === OK) {
	                    creep.memory.batteryId = undefined;
	                    if (nextDestination) {
	                        creep.blindMoveTo(nextDestination, { maxRooms: 1 });
	                    }
	                }
	            }
	            else {
	                creep.blindMoveTo(battery, { maxRooms: 1 });
	            }
	        }
	        else {
	            if (getFromSource) {
	                let closest = creep.pos.findClosestByRange(this.sources);
	                if (closest) {
	                    if (creep.pos.isNearTo(closest)) {
	                        creep.harvest(closest);
	                    }
	                    else {
	                        creep.blindMoveTo(closest);
	                    }
	                }
	                else if (!creep.pos.isNearTo(this.flag)) {
	                    creep.blindMoveTo(this.flag);
	                }
	            }
	            else if (!creep.pos.isNearTo(this.flag)) {
	                creep.blindMoveTo(this.flag);
	            }
	        }
	    }
	    /**
	     * Will return storage if it is available, otherwise will look for an alternative battery and cache it
	     * @param creep - return a battery relative to the room that the creep is currently in
	     * @returns {any}
	     */
	    getBattery(creep) {
	        let minEnergy = creep.carryCapacity - creep.carry.energy;
	        if (creep.room.storage && creep.room.storage.store.energy > minEnergy) {
	            return creep.room.storage;
	        }
	        return creep.rememberBattery();
	    }
	    getFlagSet(identifier, max = 10) {
	        let flags = [];
	        for (let i = 0; i < max; i++) {
	            let flag = Game.flags[this.opName + identifier + i];
	            if (flag) {
	                flags.push(flag);
	            }
	        }
	        return flags;
	    }
	    flagLook(lookConstant, identifier, max = 10) {
	        let objects = [];
	        let flags = this.getFlagSet(identifier, max);
	        for (let flag of flags) {
	            if (flag.room) {
	                let object = _.head(flag.pos.lookFor(lookConstant));
	                if (object) {
	                    objects.push(object);
	                }
	                else {
	                    flag.remove();
	                }
	            }
	        }
	        return objects;
	    }
	    getStorage(pos) {
	        if (this.memory.tempStorageId) {
	            let storage = Game.getObjectById(this.memory.tempStorageId);
	            if (storage) {
	                return storage;
	            }
	            else {
	                console.log("ATTN: Clearing temporary storage id due to not finding object in", this.opName);
	                this.memory.tempStorageId = undefined;
	            }
	        }
	        if (this.memory.storageId) {
	            let storage = Game.getObjectById(this.memory.storageId);
	            if (storage && storage.room.controller.level >= 4) {
	                return storage;
	            }
	            else {
	                console.log("ATTN: attempting to find better storage for", this.name, "in", this.opName);
	                this.memory.storageId = undefined;
	                return this.getStorage(pos);
	            }
	        }
	        else {
	            let storages = _.filter(this.empire.storages, (s) => s.room.controller.level >= 4);
	            let storage = pos.findClosestByLongPath(storages);
	            if (!storage) {
	                storage = pos.findClosestByRoomRange(storages);
	                console.log("couldn't find storage via path, fell back to find closest by room range for", this.opName);
	            }
	            if (storage) {
	                console.log("ATTN: attempting to find better storage for", this.name, "in", this.opName);
	                this.memory.storageId = storage.id;
	                return storage;
	            }
	        }
	    }
	    moveToFlag(creep) {
	        if (!creep.pos.isNearTo(this.flag)) {
	            creep.blindMoveTo(this.flag);
	        }
	    }
	    findOrphans(roleName) {
	        let creepNames = [];
	        for (let creepName in Game.creeps) {
	            if (creepName.indexOf(this.opName + "_" + roleName + "_") > -1) {
	                creepNames.push(creepName);
	            }
	        }
	        return creepNames;
	    }
	    recycleCreep(creep) {
	        let spawn = this.spawnGroup.spawns[0];
	        if (creep.pos.isNearTo(spawn)) {
	            spawn.recycleCreep(creep);
	        }
	        else {
	            creep.blindMoveTo(spawn);
	        }
	    }
	    prepCreep(creep, options) {
	        if (!creep.memory.prep) {
	            this.disableNotify(creep);
	            let boosted = creep.seekBoost(creep.memory.boosts, creep.memory.allowUnboosted);
	            if (!boosted)
	                return false;
	            let outcome = creep.travelByWaypoint(this.waypoints);
	            if (outcome !== constants_1.DESTINATION_REACHED)
	                return false;
	            if (!options.skipMoveToRoom && (creep.room.name !== this.flag.pos.roomName || creep.isNearExit(1))) {
	                creep.avoidSK(this.flag);
	                return false;
	            }
	            creep.memory.prep = true;
	        }
	        return true;
	    }
	    findPartnerships(creeps, role) {
	        for (let creep of creeps) {
	            if (!creep.memory.partner) {
	                if (!this.partnerPairing[role])
	                    this.partnerPairing[role] = [];
	                this.partnerPairing[role].push(creep);
	                for (let otherRole in this.partnerPairing) {
	                    if (role === otherRole)
	                        continue;
	                    let otherCreeps = this.partnerPairing[otherRole];
	                    let closestCreep;
	                    let smallestAgeDifference = Number.MAX_VALUE;
	                    for (let otherCreep of otherCreeps) {
	                        let ageDifference = Math.abs(creep.ticksToLive - otherCreep.ticksToLive);
	                        if (ageDifference < smallestAgeDifference) {
	                            smallestAgeDifference = ageDifference;
	                            closestCreep = otherCreep;
	                        }
	                    }
	                    if (closestCreep) {
	                        closestCreep.memory.partner = creep.name;
	                        creep.memory.partner = closestCreep.name;
	                    }
	                }
	            }
	        }
	    }
	    findDistanceToSpawn(destination) {
	        if (!this.memory.distanceToSpawn) {
	            if (this.waypoints && this.waypoints.length > 0 && this.waypoints[0].memory.portalTravel) {
	                console.log("SPAWN: using portal travel in", this.name + ", distanceToSpawn is set to:", 200);
	                this.memory.distanceToSpawn = 200;
	            }
	            else {
	                let distance = 0;
	                let lastPos = this.spawnGroup.pos;
	                if (this.waypoints) {
	                    for (let waypoint of this.waypoints) {
	                        distance += lastPos.getPathDistanceTo(waypoint.pos);
	                        lastPos = waypoint.pos;
	                    }
	                }
	                distance += lastPos.getPathDistanceTo(destination);
	                if (distance > 500) {
	                    console.log("WARNING: spawn distance (" + distance +
	                        ") much higher than would usually be expected, setting to max of 500");
	                    distance = 500;
	                }
	                console.log("SPAWN: found new distance for", this.name + ":", distance);
	                this.memory.distanceToSpawn = distance;
	            }
	        }
	        return this.memory.distanceToSpawn;
	    }
	    disableNotify(creep) {
	        if (!creep.memory.notifyDisabled) {
	            creep.notifyWhenAttacked(false);
	            creep.memory.notifyDisabled = true;
	        }
	    }
	    pavePath(start, finish, rangeAllowance, ignoreLimit = false) {
	        if (Game.time - this.memory.paveTick < 1000)
	            return;
	        let path = this.findPavedPath(start.pos, finish.pos, rangeAllowance);
	        if (!path) {
	            console.log(`incomplete pavePath, please investigate (${this.opName}), start: ${start.pos}, finish: ${finish.pos}, mission: ${this.name}`);
	            return;
	        }
	        let newConstructionPos = this.examinePavedPath(path);
	        if (newConstructionPos && (ignoreLimit || Object.keys(Game.constructionSites).length < 60)) {
	            if (!Game.cache.placedRoad) {
	                Game.cache.placedRoad = true;
	                console.log(`PAVER: placed road ${newConstructionPos} in ${this.opName}`);
	                newConstructionPos.createConstructionSite(STRUCTURE_ROAD);
	            }
	        }
	        else {
	            this.memory.paveTick = Game.time;
	            if (_.last(path).inRangeTo(finish.pos, rangeAllowance)) {
	                return path.length;
	            }
	        }
	    }
	    findPavedPath(start, finish, rangeAllowance) {
	        const ROAD_COST = 3;
	        const PLAIN_COST = 4;
	        const SWAMP_COST = 5;
	        const AVOID_COST = 7;
	        let ret = PathFinder.search(start, [{ pos: finish, range: rangeAllowance }], {
	            plainCost: PLAIN_COST,
	            swampCost: SWAMP_COST,
	            maxOps: 8000,
	            roomCallback: (roomName) => {
	                let roomCoords = helper_1.helper.getRoomCoordinates(roomName);
	                if (roomCoords && (roomCoords.x % 10 === 0 || roomCoords.y % 10 === 0)) {
	                    let matrix = new PathFinder.CostMatrix();
	                    helper_1.helper.blockOffExits(matrix, AVOID_COST);
	                    return matrix;
	                }
	                let room = Game.rooms[roomName];
	                if (!room)
	                    return;
	                let matrix = new PathFinder.CostMatrix();
	                helper_1.helper.addStructuresToMatrix(matrix, room, ROAD_COST);
	                // avoid controller
	                if (room.controller) {
	                    helper_1.helper.blockOffMatrix(matrix, room.controller, 3, AVOID_COST);
	                }
	                // avoid container adjacency
	                let sources = room.find(FIND_SOURCES);
	                for (let source of sources) {
	                    let container = source.findMemoStructure(STRUCTURE_CONTAINER, 1);
	                    if (container) {
	                        helper_1.helper.blockOffMatrix(matrix, container, 1, AVOID_COST);
	                    }
	                }
	                // add construction sites too
	                let constructionSites = room.find(FIND_CONSTRUCTION_SITES);
	                for (let site of constructionSites) {
	                    if (site.structureType === STRUCTURE_ROAD) {
	                        matrix.set(site.pos.x, site.pos.y, ROAD_COST);
	                    }
	                }
	                return matrix;
	            },
	        });
	        if (!ret.incomplete)
	            return ret.path;
	    }
	    examinePavedPath(path) {
	        let repairIds = [];
	        let hitsToRepair = 0;
	        for (let i = 0; i < path.length; i++) {
	            let position = path[i];
	            if (!Game.rooms[position.roomName])
	                return;
	            if (position.isNearExit(0))
	                continue;
	            let road = position.lookForStructure(STRUCTURE_ROAD);
	            if (road) {
	                repairIds.push(road.id);
	                hitsToRepair += road.hitsMax - road.hits;
	                // TODO: calculate how much "a whole lot" should be based on paver repair rate
	                const A_WHOLE_LOT = 1000000;
	                if (!this.memory.roadRepairIds && (hitsToRepair > A_WHOLE_LOT || road.hits < road.hitsMax * .20)) {
	                    console.log(`PAVER: I'm being summoned in ${this.opName}`);
	                    this.memory.roadRepairIds = repairIds;
	                }
	                continue;
	            }
	            let construction = position.lookFor(LOOK_CONSTRUCTION_SITES)[0];
	            if (construction && construction.structureType === STRUCTURE_ROAD)
	                continue;
	            return position;
	        }
	    }
	    paverActions(paver) {
	        let hasLoad = this.hasLoad(paver);
	        if (!hasLoad) {
	            this.procureEnergy(paver, this.findRoadToRepair());
	            return;
	        }
	        let road = this.findRoadToRepair();
	        if (!road) {
	            console.log(`this is ${this.opName} paver, checking out with ${paver.ticksToLive} ticks to live`);
	            paver.idleOffRoad(this.room.controller);
	            return;
	        }
	        let paving = false;
	        if (paver.pos.inRangeTo(road, 3) && !paver.pos.isNearExit(0)) {
	            paving = paver.repair(road) === OK;
	            let hitsLeftToRepair = road.hitsMax - road.hits;
	            if (hitsLeftToRepair > 10000) {
	                paver.yieldRoad(road, true);
	            }
	            else if (hitsLeftToRepair > 1500) {
	                paver.yieldRoad(road, false);
	            }
	        }
	        else {
	            paver.blindMoveTo(road);
	        }
	        if (!paving) {
	            road = paver.pos.lookForStructure(STRUCTURE_ROAD);
	            if (road && road.hits < road.hitsMax)
	                paver.repair(road);
	        }
	        let creepsInRange = _.filter(paver.pos.findInRange(FIND_MY_CREEPS, 1), (c) => {
	            return c.carry.energy > 0 && c.partCount(WORK) === 0;
	        });
	        if (creepsInRange.length > 0) {
	            creepsInRange[0].transfer(paver, RESOURCE_ENERGY);
	        }
	    }
	    findRoadToRepair() {
	        if (!this.memory.roadRepairIds)
	            return;
	        let road = Game.getObjectById(this.memory.roadRepairIds[0]);
	        if (road && road.hits < road.hitsMax) {
	            return road;
	        }
	        else {
	            this.memory.roadRepairIds.shift();
	            if (this.memory.roadRepairIds.length > 0) {
	                return this.findRoadToRepair();
	            }
	            else {
	                this.memory.roadRepairIds = undefined;
	            }
	        }
	    }
	    spawnPaver() {
	        if (this.room.controller && this.room.controller.level < 2)
	            return;
	        let paverBody = () => { return this.bodyRatio(1, 3, 2, 1, 5); };
	        return this.spawnSharedCreep("paver", paverBody);
	    }
	}
	exports.Mission = Mission;


/***/ },
/* 10 */
/*!******************************************!*\
  !*** ./src/ai/missions/RefillMission.ts ***!
  \******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class RefillMission extends Mission_1.Mission {
	    /**
	     * General-purpose structure refilling. Can be used to refill spawning energy, towers, links, labs, etc.
	     *  Will default to drawing energy from storage, and use altBattery if there is no storage with energy
	     * @param operation
	     */
	    constructor(operation) {
	        super(operation, "refill");
	    }
	    initMission() {
	        this.emergencyMode = this.memory.cartsLastTick === 0;
	    }
	    roleCall() {
	        let max = 2;
	        if (this.room.storage) {
	            max = 1;
	        }
	        let emergencyMax = 0;
	        if (this.emergencyMode) {
	            emergencyMax = 1;
	        }
	        let emergencyBody = () => { return this.workerBody(0, 4, 2); };
	        this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyMax);
	        let cartBody = () => {
	            return this.bodyRatio(0, 2, 1, 1, 10);
	        };
	        let memory = { scavanger: RESOURCE_ENERGY };
	        this.carts = this.headCount("spawnCart", cartBody, max, { prespawn: 50, memory: memory });
	        this.memory.cartsLastTick = this.carts.length;
	    }
	    missionActions() {
	        for (let cart of this.emergencyCarts) {
	            this.spawnCartActions(cart);
	        }
	        for (let cart of this.carts) {
	            this.spawnCartActions(cart);
	        }
	    }
	    spawnCartActions(cart) {
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            this.procureEnergy(cart, this.findNearestEmpty(cart), true);
	            return;
	        }
	        let target = this.findNearestEmpty(cart);
	        if (!target) {
	            if (cart.carry.energy === cart.carryCapacity) {
	                if (cart.pos.inRangeTo(this.flag, 12)) {
	                    cart.idleOffRoad(this.flag);
	                }
	                else {
	                    cart.blindMoveTo(this.flag, { maxRooms: 1 });
	                }
	            }
	            else {
	                cart.memory.hasLoad = false;
	            }
	            return;
	        }
	        // has target
	        if (!cart.pos.isNearTo(target)) {
	            cart.blindMoveTo(target, { maxRooms: 1 });
	            return;
	        }
	        // is near to target
	        let outcome = cart.transfer(target, RESOURCE_ENERGY);
	        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
	            target = this.findNearestEmpty(cart, target);
	            if (target && !cart.pos.isNearTo(target)) {
	                cart.blindMoveTo(target, { maxRooms: 1 });
	            }
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    findNearestEmpty(cart, pullTarget) {
	        if (!this.empties) {
	            this.empties = _.filter(this.room.findStructures(STRUCTURE_SPAWN)
	                .concat(this.room.findStructures(STRUCTURE_EXTENSION)), (s) => {
	                return s.energy < s.energyCapacity;
	            });
	            this.empties = this.empties.concat(_.filter(this.room.findStructures(STRUCTURE_TOWER), (s) => {
	                return s.energy < s.energyCapacity * .5;
	            }));
	        }
	        if (pullTarget) {
	            _.pull(this.empties, pullTarget);
	        }
	        return cart.pos.findClosestByRange(this.empties);
	    }
	}
	exports.RefillMission = RefillMission;


/***/ },
/* 11 */
/*!*******************************************!*\
  !*** ./src/ai/missions/DefenseMission.ts ***!
  \*******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class DefenseMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "defense");
	        this.healers = [];
	        this.attackers = [];
	        this.enemySquads = [];
	        this.preferRamparts = (roomName, matrix) => {
	            if (roomName === this.room.name) {
	                // block off hostiles and adjacent squares
	                for (let hostile of this.room.hostiles) {
	                    matrix.set(hostile.pos.x, hostile.pos.y, 0xff);
	                    for (let i = 1; i <= 8; i++) {
	                        let position = hostile.pos.getPositionAtDirection(i);
	                        matrix.set(position.x, position.y, 0xff);
	                    }
	                }
	                // set rampart costs to same as road
	                for (let rampart of this.wallRamparts) {
	                    matrix.set(rampart.pos.x, rampart.pos.y, 1);
	                }
	                return matrix;
	            }
	        };
	    }
	    initMission() {
	        this.towers = this.room.findStructures(STRUCTURE_TOWER);
	        this.analyzePlayerThreat();
	        // nuke detection
	        if (Game.time % 1000 === 1) {
	            let nukes = this.room.find(FIND_NUKES);
	            for (let nuke of nukes) {
	                console.log(`DEFENSE: nuke landing at ${this.opName} in ${nuke.timeToLand}`);
	            }
	        }
	        // only gets triggered if a wall is breached
	        this.triggerSafeMode();
	    }
	    roleCall() {
	        let maxDefenders = 0;
	        let maxRefillers = 0;
	        if (this.playerThreat) {
	            maxDefenders = Math.max(this.enemySquads.length, 1);
	            maxRefillers = 1;
	        }
	        this.refillCarts = this.headCount("towerCart", () => this.bodyRatio(0, 2, 1, 1, 4), maxRefillers);
	        let memory = { boosts: [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
	                RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: !this.enhancedBoost };
	        if (this.enhancedBoost) {
	            memory.boosts.push(RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
	        }
	        let defenderBody = () => {
	            if (this.enhancedBoost) {
	                let bodyUnit = this.configBody({ [TOUGH]: 1, [ATTACK]: 3, [MOVE]: 1 });
	                let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 8);
	                return this.configBody({ [TOUGH]: maxUnits, [ATTACK]: maxUnits * 3, [RANGED_ATTACK]: 1, [MOVE]: maxUnits + 1 });
	            }
	            else {
	                let bodyUnit = this.configBody({ [TOUGH]: 1, [ATTACK]: 5, [MOVE]: 6 });
	                let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 4);
	                return this.configBody({ [TOUGH]: maxUnits, [ATTACK]: maxUnits * 5, [MOVE]: maxUnits * 6 });
	            }
	        };
	        this.defenders = this.headCount("defender", defenderBody, maxDefenders, { prespawn: 1, memory: memory });
	    }
	    missionActions() {
	        let order = 0;
	        for (let defender of this.defenders) {
	            this.defenderActions(defender, order);
	            order++;
	        }
	        this.towerTargeting(this.towers);
	        for (let cart of this.refillCarts) {
	            this.towerCartActions(cart);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    towerCartActions(cart) {
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            this.procureEnergy(cart, this.findLowestEmpty(cart), true);
	            return;
	        }
	        let target = this.findLowestEmpty(cart);
	        if (!target) {
	            cart.memory.hasLoad = cart.carry.energy === cart.carryCapacity;
	            cart.yieldRoad(this.flag);
	            return;
	        }
	        // has target
	        if (!cart.pos.isNearTo(target)) {
	            cart.blindMoveTo(target, { maxRooms: 1 });
	            return;
	        }
	        // is near to target
	        let outcome = cart.transfer(target, RESOURCE_ENERGY);
	        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
	            target = this.findLowestEmpty(cart, target);
	            if (target && !cart.pos.isNearTo(target)) {
	                cart.blindMoveTo(target, { maxRooms: 1 });
	            }
	        }
	    }
	    findLowestEmpty(cart, pullTarget) {
	        if (!this.empties) {
	            this.empties = _(this.towers)
	                .filter((s) => s.energy < s.energyCapacity)
	                .sortBy("energy")
	                .value();
	        }
	        if (pullTarget) {
	            _.pull(this.empties, pullTarget);
	        }
	        return this.empties[0];
	    }
	    defenderActions(defender, order) {
	        if (this.enemySquads.length === 0) {
	            this.moveToFlag(defender);
	            defender.say("none :(");
	            return; // early
	        }
	        // movement
	        let dangerZone = false;
	        if (this.memory.unleash) {
	            let closest = defender.pos.findClosestByRange(this.room.hostiles);
	            if (defender.pos.isNearTo(closest)) {
	                if (defender.attack(closest) === OK) {
	                    this.attackedCreep = closest;
	                }
	            }
	            else {
	                let outcome = defender.blindMoveTo(closest);
	            }
	        }
	        else {
	            let target = defender.pos.findClosestByRange(this.enemySquads[order % this.enemySquads.length]);
	            if (!target) {
	                console.log("no target");
	                return;
	            }
	            let closestRampart = target.pos.findClosestByRange(this.jonRamparts);
	            if (closestRampart) {
	                let currentRampart = defender.pos.lookForStructure(STRUCTURE_RAMPART);
	                if (currentRampart && currentRampart.pos.getRangeTo(target) <= closestRampart.pos.getRangeTo(target)) {
	                    closestRampart = currentRampart;
	                }
	                _.pull(this.jonRamparts, closestRampart);
	                defender.blindMoveTo(closestRampart, { costCallback: this.preferRamparts });
	            }
	            else {
	                defender.idleOffRoad(this.flag);
	            }
	            // attack
	            if (defender.pos.isNearTo(target)) {
	                if (defender.attack(target) === OK) {
	                    if (!this.attackedCreep || target.hits < this.attackedCreep.hits) {
	                        this.attackedCreep = this.closestHostile;
	                    }
	                }
	            }
	            else {
	                let closeCreep = defender.pos.findInRange(this.room.hostiles, 1)[0];
	                if (closeCreep) {
	                    if (defender.attack(closeCreep) === OK) {
	                        this.attackedCreep = closeCreep;
	                    }
	                }
	            }
	        }
	        // heal
	        if (defender.hits < defender.hitsMax && (!this.healedDefender || defender.hits < this.healedDefender.hits)) {
	            this.healedDefender = defender;
	        }
	    }
	    towerTargeting(towers) {
	        if (!towers || towers.length === 0)
	            return;
	        for (let tower of this.towers) {
	            let target = this.closestHostile;
	            // kill jon snows target
	            if (this.attackedCreep) {
	                target = this.attackedCreep;
	            }
	            // healing as needed
	            if (this.healedDefender) {
	                tower.heal(this.healedDefender);
	            }
	            // the rest attack
	            tower.attack(target);
	        }
	    }
	    triggerSafeMode() {
	        if (this.playerThreat && !this.memory.disableSafeMode) {
	            let wallCount = this.room.findStructures(STRUCTURE_WALL).concat(this.room.findStructures(STRUCTURE_RAMPART)).length;
	            if (this.memory.wallCount && wallCount < this.memory.wallCount) {
	                this.room.controller.activateSafeMode();
	                this.memory.unleash = true;
	            }
	            this.memory.wallCount = wallCount;
	        }
	        else {
	            this.memory.wallCount = undefined;
	        }
	    }
	    closeToWall(creep) {
	        let wall = Game.getObjectById(this.memory.closestWallId);
	        if (wall && creep.pos.isNearTo(wall)) {
	            return true;
	        }
	        else {
	            let walls = this.room.findStructures(STRUCTURE_RAMPART);
	            for (let wall of walls) {
	                if (creep.pos.isNearTo(wall)) {
	                    this.memory.closestWallId = wall.id;
	                    return true;
	                }
	            }
	        }
	    }
	    analyzePlayerThreat() {
	        if (this.towers.length > 0 && this.room.hostiles.length > 0) {
	            this.closestHostile = this.towers[0].pos.findClosestByRange(this.room.hostiles);
	        }
	        let playerCreeps = _.filter(this.room.hostiles, (c) => {
	            return c.owner.username !== "Invader" && c.body.length >= 40 && _.filter(c.body, part => part.boost).length > 0;
	        });
	        this.playerThreat = playerCreeps.length > 1 || this.memory.preSpawn;
	        if (this.playerThreat) {
	            if (!Memory.roomAttacks)
	                Memory.roomAttacks = {};
	            Memory.roomAttacks[playerCreeps[0].owner.username] = Game.time;
	            if (Game.time % 10 === 5) {
	                console.log("DEFENSE: " + playerCreeps.length + " non-ally hostile creep in owned room: " + this.flag.pos.roomName);
	            }
	            for (let creep of this.room.hostiles) {
	                if (creep.partCount(HEAL) > 12) {
	                    this.healers.push(creep);
	                }
	                else {
	                    this.attackers.push(creep);
	                }
	            }
	            this.likelyTowerDrainAttempt = this.attackers.length === 0;
	            this.wallRamparts = _.filter(this.room.findStructures(STRUCTURE_RAMPART), (r) => {
	                return _.filter(r.pos.lookFor(LOOK_STRUCTURES), (s) => {
	                    return s.structureType !== STRUCTURE_ROAD;
	                }).length === 1;
	            });
	            this.jonRamparts = this.wallRamparts.slice(0);
	            // find squads
	            let attackers = _.sortBy(this.attackers, (c) => { this.towers[0].pos.getRangeTo(c); });
	            while (attackers.length > 0) {
	                let squad = attackers[0].pos.findInRange(attackers, 5);
	                let nearbyRamparts = attackers[0].pos.findInRange(this.wallRamparts, 10);
	                if (this.enemySquads.length === 0 || nearbyRamparts.length > 0) {
	                    this.enemySquads.push(squad);
	                }
	                attackers = _.difference(attackers, squad);
	            }
	            this.enhancedBoost = this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] > 1000;
	        }
	    }
	}
	exports.DefenseMission = DefenseMission;


/***/ },
/* 12 */
/*!*****************************************!*\
  !*** ./src/ai/missions/PowerMission.ts ***!
  \*****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	class PowerMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "power");
	        this.powerMoveOps = {
	            costCallback: (roomName, matrix) => {
	                if (_.includes(this.memory.avoidRooms, roomName)) {
	                    return helper_1.helper.blockOffExits(matrix);
	                }
	            }
	        };
	    }
	    initMission() {
	        this.observer = this.room.findStructures(STRUCTURE_OBSERVER)[0];
	        if (this.memory.flagScan) {
	            this.continueScan();
	        }
	        else {
	            this.scanFlags = this.getFlagSet("_scan_", 30);
	        }
	        if (!this.memory.currentBank)
	            return; // early
	        this.currentFlag = Game.flags[this.memory.currentBank.flagName];
	        if (!this.currentFlag.room)
	            return; // early
	        this.bank = this.currentFlag.room.findStructures(STRUCTURE_POWER_BANK)[0];
	    }
	    roleCall() {
	        if (!this.memory.currentBank)
	            return; // early
	        let max = this.memory.currentBank.finishing || this.memory.currentBank.assisting ? 0 : 1;
	        this.bonnies = this.headCount("bonnie", () => this.configBody({ move: 25, heal: 25 }), max, {
	            prespawn: this.memory.currentBank.distance,
	            reservation: { spawns: 2, currentEnergy: 8000 }
	        });
	        this.clydes = this.headCount("clyde", () => this.configBody({ move: 20, attack: 20 }), this.bonnies.length);
	        if (!this.memory.currentBank.finishing || this.memory.currentBank.assisting)
	            return; // early
	        let unitsPerCart = 1;
	        let maxCarts = 0;
	        if (this.bank) {
	            let unitsNeeded = Math.ceil(this.bank.power / 100);
	            maxCarts = Math.ceil(unitsNeeded / 16);
	            unitsPerCart = Math.ceil(unitsNeeded / maxCarts);
	        }
	        this.carts = this.headCount("powerCart", () => this.workerBody(0, unitsPerCart * 2, unitsPerCart), maxCarts);
	    }
	    missionActions() {
	        if (this.memory.currentBank) {
	            this.observer.observeRoom(this.memory.currentBank.roomName);
	            for (let i = 0; i < 2; i++) {
	                let clyde = this.clydes[i];
	                if (clyde) {
	                    if (!clyde.memory.myBonnieName) {
	                        if (this.clydes.length === this.bonnies.length) {
	                            clyde.memory.myBonnieName = this.bonnies[i].name;
	                        }
	                    }
	                    else {
	                        this.clydeActions(clyde);
	                        this.checkForAlly(clyde);
	                    }
	                }
	                let bonnie = this.bonnies[i];
	                if (bonnie) {
	                    if (!bonnie.memory.myClydeName) {
	                        if (this.clydes.length === this.bonnies.length) {
	                            bonnie.memory.myClydeName = this.clydes[i].name;
	                        }
	                    }
	                    else {
	                        this.bonnieActions(bonnie);
	                    }
	                }
	            }
	            if (this.carts) {
	                let order = 0;
	                for (let cart of this.carts) {
	                    this.powerCartActions(cart, order);
	                    order++;
	                }
	            }
	        }
	        else {
	            this.scanForBanks();
	        }
	    }
	    finalizeMission() {
	        if (!this.memory.currentBank)
	            return;
	        this.checkFinishingPhase();
	        this.checkCompletion();
	    }
	    invalidateMissionCache() {
	    }
	    placeScanFlags() {
	        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0];
	        if (!observer)
	            return "ERROR: Can't scan for flags without an observer";
	        this.scanFlags.forEach(f => f.remove());
	        this.memory.removeFlags = true;
	        this.memory.flagPlacement = undefined;
	        let allyRoomNames = this.getAlleysInRange(5);
	        this.memory.flagScan = {
	            alleyRoomNames: allyRoomNames,
	            alleyIndex: 0,
	            flagIndex: 0,
	            avoidRooms: [],
	            matrices: {}
	        };
	    }
	    getAlleysInRange(range) {
	        let roomNames = [];
	        for (let i = this.room.coords.x - range; i <= this.room.coords.x + range; i++) {
	            for (let j = this.room.coords.y - range; j <= this.room.coords.y + range; j++) {
	                let x = i;
	                let xDir = this.room.coords.xDir;
	                let y = j;
	                let yDir = this.room.coords.yDir;
	                if (x < 0) {
	                    x = Math.abs(x) - 1;
	                    xDir = helper_1.helper.negaDirection(xDir);
	                }
	                if (y < 0) {
	                    y = Math.abs(y) - 1;
	                    yDir = helper_1.helper.negaDirection(yDir);
	                }
	                if (x % 10 === 0 || y % 10 === 0) {
	                    roomNames.push(xDir + x + yDir + y);
	                }
	            }
	        }
	        return roomNames;
	    }
	    continueScan() {
	        let scanCache = this.memory.flagScan;
	        // remove all existing scanFlags before starting the process
	        if (this.memory.removeFlags) {
	            let flags = this.getFlagSet("_scan_", 30);
	            if (flags.length === 0) {
	                console.log("POWER: all current flags removed, initating scan");
	                this.memory.removeFlags = undefined;
	            }
	            else {
	                console.log("POWER: removing", flags.length, "flags");
	                return; // early
	            }
	        }
	        // place new flags
	        if (this.memory.flagPlacement) {
	            let remotePos = helper_1.helper.deserializeRoomPosition(this.memory.flagPlacement.pos);
	            let distance = this.memory.flagPlacement.distance;
	            let room = Game.rooms[remotePos.roomName];
	            if (!room) {
	                console.log("POWER: cannot detect room for some reason, retrying");
	                this.observer.observeRoom(remotePos.roomName);
	                return; // early
	            }
	            let existingFlag = _.filter(room.find(FIND_FLAGS), (flag) => flag.name.indexOf("_scan_") >= 0)[0];
	            let placeNewFlag = true;
	            if (existingFlag) {
	                if (existingFlag.memory.distance > distance) {
	                    console.log("POWER: removing flag with greater distance (" + distance + "):", existingFlag.name);
	                    existingFlag.remove();
	                }
	                else {
	                    placeNewFlag = false;
	                    this.memory.flagPlacement = undefined;
	                }
	            }
	            if (placeNewFlag) {
	                let outcome = remotePos.createFlag(this.opName + "_scan_" + scanCache.flagIndex);
	                if (_.isString(outcome)) {
	                    Memory.flags[outcome] = { distance: this.memory.flagPlacement.distance };
	                    console.log("POWER: flag placement successful:", outcome);
	                    this.memory.flagPlacement = undefined;
	                    scanCache.flagIndex++;
	                }
	            }
	            scanCache.alleyIndex++;
	        }
	        if (scanCache.alleyIndex === scanCache.alleyRoomNames.length) {
	            console.log("POWER: Scan proces complete, cleaning up memory and assigning rooms to avoid");
	            this.memory.avoidRooms = scanCache.avoidRooms;
	            this.memory.flagScan = undefined;
	            return; // conclude process
	        }
	        let alleyName = scanCache.alleyRoomNames[scanCache.alleyIndex];
	        if (_.includes(scanCache.avoidRooms, alleyName)) {
	            scanCache.alleyIndex++;
	            return; // avoidRooms pathing to rooms you've indicated as off limits in memory.avoidRooms
	        }
	        // engage pathfinding
	        let remotePos = new RoomPosition(25, 25, alleyName);
	        let ret = helper_1.helper.findSightedPath(this.spawnGroup.pos, remotePos, 20, this.observer, scanCache);
	        if (!ret)
	            return; // pathfinding still in progress
	        console.log("POWER: Pathing complete for", alleyName);
	        if (ret.incomplete) {
	            console.log("POWER: No valid path was found");
	            scanCache.alleyIndex++;
	            return; // early
	        }
	        if (ret.path.length > 250) {
	            console.log("POWER: Path found but distance exceeded 250");
	            scanCache.alleyIndex++;
	            return; // early
	        }
	        console.log("POWER: Valid path found, initiating placement scan");
	        this.memory.flagPlacement = {
	            distance: ret.path.length,
	            pos: remotePos,
	        };
	        this.observer.observeRoom(remotePos.roomName);
	    }
	    scanForBanks() {
	        if (!this.scanFlags || this.scanFlags.length === 0)
	            return;
	        if (this.memory.observedRoom) {
	            let room = Game.rooms[this.memory.observedRoom];
	            if (room) {
	                let walls = room.findStructures(STRUCTURE_WALL);
	                if (walls.length > 0)
	                    return;
	                let powerBank = room.findStructures(STRUCTURE_POWER_BANK)[0];
	                if (powerBank && powerBank.ticksToDecay > 4500 && powerBank.power > Memory.playerConfig.powerMinimum) {
	                    console.log("\\o/ \\o/ \\o/", powerBank.power, "power found at", room, "\\o/ \\o/ \\o/");
	                    this.memory.currentBank = {
	                        flagName: this.scanFlags[this.memory.scanFlagIndex].name,
	                        roomName: this.memory.observedRoom,
	                        distance: this.scanFlags[this.memory.scanFlagIndex].memory.distance,
	                        finishing: false,
	                        assisting: undefined,
	                    };
	                    this.observer.observeRoom(room.name);
	                    return;
	                }
	            }
	        }
	        if (Math.random() < .5) {
	            this.memory.scanFlagIndex++;
	            if (this.memory.scanFlagIndex >= this.scanFlags.length)
	                this.memory.scanFlagIndex = 0;
	            let flag = this.scanFlags[this.memory.scanFlagIndex];
	            if (flag) {
	                this.memory.observedRoom = flag.pos.roomName;
	                this.observer.observeRoom(this.memory.observedRoom);
	            }
	            else {
	                console.log("POWER: didn't find a flag in", this.opName, "(might be flag lag)");
	            }
	        }
	        else {
	            this.memory.observedRoom = undefined;
	        }
	    }
	    clydeActions(clyde) {
	        let myBonnie = Game.creeps[clyde.memory.myBonnieName];
	        if (!myBonnie || (!clyde.pos.isNearTo(myBonnie) && !clyde.isNearExit(1))) {
	            clyde.idleOffRoad(this.flag);
	            return;
	        }
	        if (!this.bank) {
	            if (clyde.room.name === this.currentFlag.pos.roomName) {
	                clyde.suicide();
	                myBonnie.suicide();
	            }
	            else {
	                clyde.blindMoveTo(this.currentFlag);
	            }
	            return;
	        }
	        if (clyde.pos.isNearTo(this.bank)) {
	            clyde.memory.inPosition = true;
	            if (this.bank.hits > 600 || clyde.ticksToLive < 5) {
	                clyde.attack(this.bank);
	            }
	            else {
	                for (let cart of this.carts) {
	                    if (cart.room !== this.bank.room) {
	                        return;
	                    }
	                }
	                clyde.attack(this.bank);
	            }
	        }
	        else if (myBonnie.fatigue === 0) {
	            if (this.memory.currentBank.assisting === undefined) {
	                // traveling from spawn
	                clyde.blindMoveTo(this.bank, this.powerMoveOps);
	            }
	            else {
	                clyde.moveTo(this.bank, { reusePath: 0 });
	            }
	        }
	    }
	    bonnieActions(bonnie) {
	        let myClyde = Game.creeps[bonnie.memory.myClydeName];
	        if (!myClyde) {
	            return;
	        }
	        if (myClyde.ticksToLive === 1) {
	            bonnie.suicide();
	            return;
	        }
	        if (bonnie.pos.isNearTo(myClyde)) {
	            if (myClyde.memory.inPosition) {
	                bonnie.heal(myClyde);
	            }
	            else {
	                bonnie.move(bonnie.pos.getDirectionTo(myClyde));
	            }
	        }
	        else {
	            bonnie.blindMoveTo(myClyde);
	        }
	    }
	    powerCartActions(cart, order) {
	        if (!cart.carry.power) {
	            if (cart.room.name !== this.currentFlag.pos.roomName) {
	                if (this.bank) {
	                    // traveling from spawn
	                    cart.blindMoveTo(this.currentFlag, this.powerMoveOps);
	                }
	                else {
	                    this.recycleCreep(cart);
	                }
	                return;
	            }
	            let power = cart.room.find(FIND_DROPPED_RESOURCES, { filter: (r) => r.resourceType === RESOURCE_POWER })[0];
	            if (power) {
	                if (cart.pos.isNearTo(power)) {
	                    cart.pickup(power);
	                    cart.blindMoveTo(this.room.storage);
	                }
	                else {
	                    cart.blindMoveTo(power);
	                }
	                return; //  early;
	            }
	            if (!this.bank) {
	                this.recycleCreep(cart);
	                return;
	            }
	            if (!cart.memory.inPosition) {
	                if (this.bank.pos.openAdjacentSpots().length > 0) {
	                    if (cart.pos.isNearTo(this.bank)) {
	                        cart.memory.inPosition = true;
	                    }
	                    else {
	                        cart.blindMoveTo(this.bank);
	                    }
	                }
	                else if (order > 0) {
	                    if (cart.pos.isNearTo(this.carts[order - 1])) {
	                        cart.memory.inPosition = true;
	                    }
	                    else {
	                        cart.blindMoveTo(this.carts[order - 1]);
	                    }
	                }
	                else {
	                    if (cart.pos.isNearTo(this.clydes[0])) {
	                        cart.memory.inPosition = true;
	                    }
	                    else {
	                        cart.blindMoveTo(this.clydes[0]);
	                    }
	                }
	            }
	            return; // early
	        }
	        if (cart.pos.isNearTo(this.room.storage)) {
	            cart.transfer(this.room.storage, RESOURCE_POWER);
	        }
	        else {
	            // traveling to storage
	            cart.blindMoveTo(this.room.storage, this.powerMoveOps);
	        }
	    }
	    checkFinishingPhase() {
	        if (!this.bank || this.clydes.length === 0 || this.memory.currentBank.finishing)
	            return;
	        let attackTicksNeeded = Math.ceil(this.bank.hits / 600);
	        let clyde = _.last(this.clydes);
	        let ttlEstimate = clyde.memory.inPosition ? clyde.ticksToLive : 1000;
	        if (ttlEstimate > attackTicksNeeded) {
	            this.memory.currentBank.finishing = true;
	        }
	    }
	    checkCompletion() {
	        if (this.memory.currentBank && Game.rooms[this.memory.currentBank.roomName] &&
	            ((this.memory.currentBank.finishing && !this.bank && this.carts && this.carts.length === 0) ||
	                (this.memory.currentBank.assisting && this.clydes && this.clydes.length === 0))) {
	            this.memory.currentBank = undefined;
	        }
	    }
	    checkForAlly(clyde) {
	        if (!this.bank || clyde.pos.roomName !== this.bank.pos.roomName || clyde.isNearExit(1) ||
	            this.memory.currentBank.assisting !== undefined)
	            return;
	        let allyClyde = this.bank.room.find(FIND_HOSTILE_CREEPS, {
	            filter: (c) => c.partCount(ATTACK) === 20 && constants_1.ALLIES[c.owner.username] && !c.isNearExit(1)
	        })[0];
	        if (!allyClyde) {
	            return;
	        }
	        Memory["playEvent"] = { time: Game.time, roomName: this.bank.room.name };
	        if (clyde.memory.play) {
	            let myPlay = clyde.memory.play;
	            let allyPlay = allyClyde.saying;
	            if (!allyPlay || allyPlay === myPlay) {
	                console.log("POWER: we had a tie!");
	                clyde.say("tie!", true);
	                clyde.memory.play = undefined;
	            }
	            else if ((allyPlay === "rock" && myPlay === "scissors") || (allyPlay === "scissors" && myPlay === "paper") ||
	                (allyPlay === "paper" && myPlay === "rock")) {
	                if (this.bank.pos.openAdjacentSpots(true).length === 1) {
	                    let bonnie = Game.creeps[clyde.memory.myBonnieName];
	                    bonnie.suicide();
	                    clyde.suicide();
	                }
	                console.log("POWER: ally gets the power!");
	                this.memory.currentBank.assisting = true;
	                clyde.say("damn", true);
	            }
	            else {
	                console.log("POWER: I get the power!");
	                this.memory.currentBank.assisting = false;
	                clyde.say("yay!", true);
	            }
	        }
	        else {
	            console.log("POWER: ally found in", clyde.room.name, "playing a game to find out who gets power");
	            let random = Math.floor(Math.random() * 3);
	            let play;
	            if (random === 0) {
	                play = "rock";
	            }
	            else if (random === 1) {
	                play = "paper";
	            }
	            else if (random === 2) {
	                play = "scissors";
	            }
	            clyde.memory.play = play;
	            clyde.say(play, true);
	        }
	    }
	}
	exports.PowerMission = PowerMission;


/***/ },
/* 13 */
/*!***************************************************!*\
  !*** ./src/ai/missions/TerminalNetworkMission.ts ***!
  \***************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class TerminalNetworkMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "network");
	    }
	    initMission() {
	        this.terminal = this.room.terminal;
	        this.storage = this.room.storage;
	    }
	    roleCall() {
	    }
	    missionActions() {
	        this.allyTrade();
	        this.sellOverstock();
	        this.checkOverstock();
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        this.memory.fortRoomNames = undefined;
	        this.memory.swapRoomNames = undefined;
	    }
	    energyNetworkActions() {
	        if (this.terminal.store.energy < 30000 || Math.random() < .9)
	            return;
	        if (this.traded)
	            return;
	        this.supplyEnergyToForts();
	        this.supplyEnergyToSwaps();
	    }
	    mineralNetworkActions() {
	        if (this.terminal.store.energy < 10000 || Math.random() < .9)
	            return;
	        if (!this.memory.fortRoomNames)
	            return;
	        if (this.traded)
	            return;
	        for (let resourceType of constants_1.TRADE_RESOURCES) {
	            if (this.empire.mineralTraded)
	                break;
	            let localAbundance = this.terminal.store[resourceType] >= constants_1.RESERVE_AMOUNT * 2;
	            if (!localAbundance)
	                continue;
	            let shortageFound = this.tradeResource(resourceType, this.memory.fortRoomNames);
	            if (shortageFound) {
	                return;
	            }
	        }
	    }
	    tradeResource(resourceType, roomNames) {
	        let tradeWithAllies = this.empire.hasAbundance(resourceType, constants_1.RESERVE_AMOUNT);
	        for (let roomName of roomNames) {
	            if (roomName === this.terminal.room.name)
	                continue;
	            let threshold = Math.max(constants_1.RESERVE_AMOUNT - Game.map.getRoomLinearDistance(this.room.name, roomName, true) * 100, 1000);
	            let otherRoom = Game.rooms[roomName];
	            if (!otherRoom || !otherRoom.terminal || otherRoom.controller.level < 6
	                || (!otherRoom.terminal.my && !tradeWithAllies)
	                || otherRoom.terminal.store[resourceType] >= threshold)
	                continue;
	            let otherRoomAmount = otherRoom.terminal.store[resourceType] ? otherRoom.terminal.store[resourceType] : 0;
	            let amount = Math.max(Math.min(threshold - otherRoomAmount, constants_1.RESERVE_AMOUNT), 100);
	            this.sendResource(resourceType, amount, otherRoom.terminal);
	            return true;
	        }
	        return false;
	    }
	    sellOverstock() {
	        if (Game.time % 100 !== 1)
	            return;
	        for (let mineralType of constants_1.MINERALS_RAW) {
	            if (this.storage.store[mineralType] >= constants_1.MINERAL_STORAGE_TARGET[mineralType]
	                && this.storage.room.terminal.store[mineralType] >= constants_1.RESERVE_AMOUNT) {
	                console.log("TRADE: have too much", mineralType, "in", this.storage.room, this.storage.store[mineralType]);
	                this.empire.sellExcess(this.room, mineralType, constants_1.RESERVE_AMOUNT);
	            }
	        }
	        if (_.sum(this.storage.store) >= 940000) {
	            console.log("TRADE: have too much energy in", this.storage.room, this.storage.store.energy);
	            this.empire.sellExcess(this.room, RESOURCE_ENERGY, constants_1.RESERVE_AMOUNT);
	        }
	    }
	    allyTrade() {
	        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0];
	        if (!observer) {
	            if (this.room.controller.level === 8 && Game.time % 100 === 0) {
	                console.log("NETWORK: please add an observer to", this.opName, "to participate in network");
	            }
	            return;
	        }
	        if (!this.memory.scanData) {
	            this.initScan(observer);
	            return;
	        }
	        let scanData = this.memory.scanData;
	        // no ally rooms in range
	        if (scanData.roomNames.length === 0)
	            return;
	        // gather information for next tick
	        if (scanData.index >= scanData.roomNames.length)
	            scanData.index = 0;
	        observer.observeRoom(scanData.roomNames[scanData.index++], "allyScan");
	    }
	    initScan(observer) {
	        if (!this.memory.searchData) {
	            console.log("NETWORK: Beginning ally scan for", this.opName);
	            this.memory.searchData = {
	                x: -10,
	                y: -10,
	                forts: [],
	                swaps: [],
	            };
	        }
	        let scanData = this.memory.searchData;
	        if (observer.observation && observer.observation.purpose === "allySearch") {
	            let room = observer.observation.room;
	            if (room.storage && room.terminal && !room.terminal.my && _.includes(constants_1.KCLUBBERS, room.terminal.owner.username)) {
	                // check for swap mining
	                let swapPosition = this.findSwapPosition(room);
	                if (swapPosition) {
	                    console.log("NETWORK: ally scan found", room.terminal.owner.username + "'s swap mine at", room.name);
	                    scanData.swaps.push(room.name);
	                }
	                else if (room.controller.level >= 6) {
	                    console.log("NETWORK: ally scan found", room.terminal.owner.username + "'s owned room at", room.name);
	                    scanData.forts.push(room.name);
	                }
	            }
	            // increment
	            scanData.x++;
	            if (scanData.x > 10) {
	                scanData.x = -10;
	                scanData.y++;
	                if (scanData.y > 10) {
	                    this.empire.addAllyForts(scanData.forts);
	                    this.empire.addAllySwaps(scanData.swaps);
	                    this.memory.scanData = {
	                        roomNames: scanData.forts.concat(scanData.swaps),
	                        index: 0,
	                    };
	                    this.memory.searchData = undefined;
	                    console.log("NETWORK: Scan of ally rooms complete at", this.opName, "found", scanData.forts.length, "forts and", scanData.swaps.length, "swaps");
	                    return;
	                }
	            }
	        }
	        if (observer.currentPurpose === undefined) {
	            let roomName = helper_1.helper.findRelativeRoomName(this.room, scanData.x, scanData.y);
	            observer.observeRoom(roomName, "allySearch");
	        }
	    }
	    findSwapPosition(room) {
	        if (!room.storage || !room.terminal)
	            return;
	        // check for spawns
	        if (room.find(FIND_HOSTILE_SPAWNS).length > 0)
	            return;
	        // check for layout match
	        if (room.terminal.pos.getRangeTo(room.storage) !== 2)
	            return;
	        let position = room.terminal.pos.getPositionAtDirection(room.terminal.pos.getDirectionTo(room.storage));
	        if (position.isNearTo(room.terminal) && position.isNearTo(room.storage)
	            && position.getDirectionTo(room.storage) % 2 === 0 && position.getDirectionTo(room.terminal) % 2 === 0)
	            return position;
	    }
	    sendResource(resourceType, amount, otherTerminal) {
	        if (otherTerminal.room.controller.level === 0) {
	            console.log("NETWORK: error,", this.opName, "tried to send to abandoned room:", otherTerminal.room.name);
	            return;
	        }
	        let spaceAvailable = otherTerminal.storeCapacity - _.sum(otherTerminal.store);
	        let overstocked = false;
	        if (resourceType === RESOURCE_ENERGY) {
	            overstocked = spaceAvailable < amount;
	        }
	        else {
	            overstocked = spaceAvailable < 30000;
	        }
	        if (overstocked) {
	            console.log("NETWORK: error,", this.opName, "tried to send to full terminal:", otherTerminal.room.name);
	            if (otherTerminal.my && otherTerminal.store.energy >= 20000) {
	                this.balanceCapacity(otherTerminal);
	            }
	            return;
	        }
	        let outcome = this.terminal.send(resourceType, amount, otherTerminal.room.name);
	        if (outcome === OK) {
	            let distance = Game.map.getRoomLinearDistance(otherTerminal.room.name, this.room.name, true);
	            console.log("NETWORK:", this.room.name, "→", otherTerminal.room.name + ":", amount, resourceType, "(" + otherTerminal.owner.username.substring(0, 3) + ", dist: " + distance + ")");
	            if (resourceType === RESOURCE_ENERGY) {
	                this.empire.energyTraded = true;
	            }
	            else {
	                this.empire.mineralTraded = true;
	            }
	            this.traded = true;
	        }
	        else {
	            console.log("NETWORK: error sending resource in", this.opName + ", outcome:", outcome);
	            console.log("arguments used:", resourceType, amount, otherTerminal.room.name);
	        }
	    }
	    supplyEnergyToForts() {
	        if (this.empire.energyTraded || this.storage.store.energy < constants_1.SUPPLY_ENERGY_THRESHOLD || !this.memory.fortRoomNames)
	            return;
	        let overloaded = _.sum(this.storage.store) > 940000;
	        for (let roomName of this.memory.fortRoomNames) {
	            let distance = Game.map.getRoomLinearDistance(roomName, this.room.name, true);
	            if (!overloaded && distance > constants_1.TRADE_MAX_DISTANCE) {
	                break;
	            }
	            let otherRoom = Game.rooms[roomName];
	            if (!otherRoom)
	                continue;
	            if (otherRoom.controller.level < 6)
	                continue;
	            if (!otherRoom.storage || otherRoom.storage.store.energy > constants_1.NEED_ENERGY_THRESHOLD)
	                continue;
	            if (!otherRoom.terminal || otherRoom.terminal.store.energy > 50000)
	                continue;
	            this.sendResource(RESOURCE_ENERGY, constants_1.TRADE_ENERGY_AMOUNT, otherRoom.terminal);
	            break;
	        }
	    }
	    supplyEnergyToSwaps() {
	        if (this.empire.energyTraded || this.storage.store.energy < constants_1.SUPPLY_SWAP_THRESHOLD || !this.memory.swapRoomNames)
	            return;
	        let overloaded = _.sum(this.storage.store) > 940000;
	        for (let roomName of this.memory.swapRoomNames) {
	            let distance = Game.map.getRoomLinearDistance(roomName, this.room.name, true);
	            if (!overloaded && distance > constants_1.TRADE_MAX_DISTANCE) {
	                break;
	            }
	            let otherRoom = Game.rooms[roomName];
	            if (!otherRoom)
	                continue;
	            if (otherRoom.controller.level < 6 || !otherRoom.storage || !otherRoom.terminal)
	                continue;
	            if (otherRoom.terminal.store.energy > 50000)
	                continue;
	            this.sendResource(RESOURCE_ENERGY, constants_1.TRADE_ENERGY_AMOUNT, otherRoom.terminal);
	            break;
	        }
	    }
	    balanceCapacity(otherTerminal) {
	        let mostStockedAmount = 0;
	        let mostStockedResource;
	        for (let resourceType in otherTerminal.store) {
	            if (resourceType === RESOURCE_ENERGY)
	                continue;
	            if (otherTerminal.store[resourceType] < mostStockedAmount)
	                continue;
	            mostStockedAmount = otherTerminal.store[resourceType];
	            mostStockedResource = resourceType;
	        }
	        let leastStockedTerminal = _.sortBy(this.empire.terminals, (t) => _.sum(t.store))[0];
	        otherTerminal.send(mostStockedResource, constants_1.RESERVE_AMOUNT, leastStockedTerminal.room.name);
	        console.log("NETWORK: balancing terminal capacity, sending", constants_1.RESERVE_AMOUNT, mostStockedResource, "from", otherTerminal.room.name, "to", leastStockedTerminal.room.name);
	    }
	    checkOverstock() {
	        if (Game.time % 100 !== 0 || _.sum(this.terminal.store) < 250000)
	            return;
	        this.balanceCapacity(this.terminal);
	    }
	}
	exports.TerminalNetworkMission = TerminalNetworkMission;


/***/ },
/* 14 */
/*!****************************************!*\
  !*** ./src/ai/missions/IgorMission.ts ***!
  \****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class IgorMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "igor");
	    }
	    initMission() {
	        this.labs = this.room.findStructures(STRUCTURE_LAB);
	        this.terminal = this.room.terminal;
	        this.storage = this.room.storage;
	        this.reagentLabs = this.findReagentLabs();
	        this.productLabs = this.findProductLabs();
	        this.labProcess = this.findLabProcess();
	        if (this.labProcess) {
	            let target = this.labProcess.targetShortage.mineralType;
	            if (!Game.cache.labProcesses[target])
	                Game.cache.labProcesses[target] = 0;
	            Game.cache.labProcesses[target]++;
	        }
	        this.powerSpawn = this.room.findStructures(STRUCTURE_POWER_SPAWN)[0];
	        this.findIgorIdlePosition();
	    }
	    roleCall() {
	        this.igors = this.headCount("igor", () => this.workerBody(0, 20, 10), 1, {
	            prespawn: 50,
	            memory: { idlePosition: this.memory.idlePosition }
	        });
	        if (this.igors.length === 0) {
	            this.memory.command = undefined;
	        }
	    }
	    missionActions() {
	        for (let i = 0; i < this.igors.length; i++) {
	            let igor = this.igors[i];
	            this.igorActions(igor, i);
	        }
	        if (this.labProcess) {
	            this.doSynthesis();
	        }
	        if (this.powerSpawn && this.powerSpawn.energy > 50 && this.powerSpawn.power > 0) {
	            this.powerSpawn.processPower();
	        }
	        this.checkBoostRequests();
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        if (!this.memory.labCount)
	            this.memory.labCount = this.labs.length;
	        if (this.memory.labCount !== this.labs.length) {
	            this.memory.labCount = this.labs.length;
	            this.memory.reagentLabIds = undefined;
	            this.memory.productLabIds = undefined;
	        }
	        if (this.memory.idlePosition) {
	            let position = helper_1.helper.deserializeRoomPosition(this.memory.idlePosition);
	            if (position.lookFor(LOOK_STRUCTURES).length > 0) {
	                this.memory.idlePosition = undefined;
	            }
	        }
	    }
	    igorActions(igor, order) {
	        if (order > 0) {
	            igor.blindMoveTo(this.flag);
	            return;
	        }
	        let command = this.accessCommand(igor);
	        if (!command) {
	            if (_.sum(igor.carry) > 0) {
	                console.log("igor in", this.opName, "is holding resources without a command, putting them in terminal");
	                if (igor.pos.isNearTo(this.terminal)) {
	                    igor.transferEverything(this.terminal);
	                }
	                else {
	                    igor.blindMoveTo(this.terminal);
	                }
	                return;
	            }
	            igor.idleOffRoad(this.flag);
	            return;
	        }
	        if (_.sum(igor.carry) === 0) {
	            let origin = Game.getObjectById(command.origin);
	            if (igor.pos.isNearTo(origin)) {
	                igor.withdraw(origin, command.resourceType, command.amount);
	                let destination = Game.getObjectById(command.destination);
	                if (!igor.pos.isNearTo(destination)) {
	                    igor.blindMoveTo(destination);
	                }
	            }
	            else {
	                igor.blindMoveTo(origin);
	            }
	            return; // early
	        }
	        let destination = Game.getObjectById(command.destination);
	        if (igor.pos.isNearTo(destination)) {
	            let outcome = igor.transfer(destination, command.resourceType, command.amount);
	            if (outcome === OK && command.reduceLoad && this.labProcess) {
	                this.labProcess.reagentLoads[command.resourceType] -= command.amount;
	            }
	            this.memory.command = undefined;
	        }
	        else {
	            igor.blindMoveTo(destination);
	        }
	    }
	    findCommand() {
	        let terminal = this.room.terminal;
	        let storage = this.room.storage;
	        let energyInStorage = storage.store.energy;
	        let energyInTerminal = terminal.store.energy;
	        let command = this.checkPullFlags();
	        if (command)
	            return command;
	        command = this.checkReagentLabs();
	        if (command)
	            return command;
	        command = this.checkProductLabs();
	        if (command)
	            return command;
	        // take energy out of terminal
	        if (energyInTerminal > 30000 + constants_1.IGOR_CAPACITY) {
	            return { origin: terminal.id, destination: storage.id, resourceType: RESOURCE_ENERGY };
	        }
	        // load terminal
	        if (energyInStorage > 50000 && energyInTerminal < 30000) {
	            return { origin: storage.id, destination: terminal.id, resourceType: RESOURCE_ENERGY };
	        }
	        // TODO: make individual check-functions for each of these commands like i've done with labs
	        // load powerSpawn
	        let powerSpawn = this.room.findStructures(STRUCTURE_POWER_SPAWN)[0];
	        if (powerSpawn) {
	            // load energy
	            if (powerSpawn.energy < powerSpawn.energyCapacity - constants_1.IGOR_CAPACITY) {
	                return { origin: storage.id, destination: powerSpawn.id, resourceType: RESOURCE_ENERGY };
	            }
	            else if (_.sum(this.storage.store) > 900000 && powerSpawn.power === 0 && terminal.store[RESOURCE_POWER] >= 100) {
	                return { origin: terminal.id, destination: powerSpawn.id, resourceType: RESOURCE_POWER, amount: 100 };
	            }
	        }
	        // push local minerals
	        for (let mineralType in storage.store) {
	            if (mineralType !== RESOURCE_ENERGY) {
	                if (!terminal.store[mineralType] || terminal.store[mineralType] < constants_1.RESERVE_AMOUNT * 2) {
	                    return { origin: storage.id, destination: terminal.id, resourceType: mineralType };
	                }
	            }
	        }
	        // load nukers
	        let nuker = this.room.findStructures(STRUCTURE_NUKER)[0];
	        if (nuker) {
	            if (nuker.energy < nuker.energyCapacity && storage.store.energy > 100000) {
	                return { origin: storage.id, destination: nuker.id, resourceType: RESOURCE_ENERGY };
	            }
	            else if (nuker.ghodium < nuker.ghodiumCapacity && terminal.store[RESOURCE_GHODIUM]) {
	                return { origin: terminal.id, destination: nuker.id, resourceType: RESOURCE_GHODIUM };
	            }
	        }
	    }
	    accessCommand(igor) {
	        if (!this.memory.command && igor.ticksToLive < 40) {
	            igor.suicide();
	            return;
	        }
	        if (!this.memory.lastCommandTick)
	            this.memory.lastCommandTick = Game.time - 10;
	        if (!this.memory.command && Game.time > this.memory.lastCommandTick + 10) {
	            if (_.sum(igor.carry) === 0) {
	                this.memory.command = this.findCommand();
	            }
	            else {
	                console.log("IGOR: can't take new command in:", this.opName, "because I'm holding something");
	            }
	            if (!this.memory.command) {
	                this.memory.lastCommandTick = Game.time;
	            }
	        }
	        return this.memory.command;
	    }
	    checkPullFlags() {
	        if (!this.productLabs)
	            return;
	        for (let lab of this.productLabs) {
	            if (this.terminal.store.energy >= constants_1.IGOR_CAPACITY && lab.energy < constants_1.IGOR_CAPACITY) {
	                // restore boosting energy to lab
	                return { origin: this.terminal.id, destination: lab.id, resourceType: RESOURCE_ENERGY };
	            }
	            let flag = lab.pos.lookFor(LOOK_FLAGS)[0];
	            if (!flag)
	                continue;
	            let mineralType = flag.name.substring(flag.name.indexOf("_") + 1);
	            if (!_.includes(constants_1.PRODUCT_LIST, mineralType)) {
	                console.log("ERROR: invalid lab request:", flag.name);
	                return; // early
	            }
	            if (lab.mineralType && lab.mineralType !== mineralType) {
	                // empty wrong mineral type
	                return { origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType };
	            }
	            else if (LAB_MINERAL_CAPACITY - lab.mineralAmount >= constants_1.IGOR_CAPACITY && this.terminal.store[mineralType] >= constants_1.IGOR_CAPACITY) {
	                // bring mineral to lab when amount is below igor capacity
	                return { origin: this.terminal.id, destination: lab.id, resourceType: mineralType };
	            }
	        }
	    }
	    checkReagentLabs() {
	        if (!this.reagentLabs || this.reagentLabs.length < 2)
	            return; // early
	        for (let i = 0; i < 2; i++) {
	            let lab = this.reagentLabs[i];
	            let mineralType = this.labProcess ? Object.keys(this.labProcess.reagentLoads)[i] : undefined;
	            if (!mineralType && lab.mineralAmount > 0) {
	                // clear labs when there is no current process
	                return { origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType };
	            }
	            else if (mineralType && lab.mineralType && lab.mineralType !== mineralType) {
	                // clear labs when there is mismatch with current process
	                return { origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType };
	            }
	            else if (mineralType) {
	                let amountNeeded = Math.min(this.labProcess.reagentLoads[mineralType], constants_1.IGOR_CAPACITY);
	                if (amountNeeded > 0 && this.terminal.store[mineralType] >= amountNeeded
	                    && lab.mineralAmount <= LAB_MINERAL_CAPACITY - constants_1.IGOR_CAPACITY) {
	                    // bring mineral to lab when amount drops below amountNeeded
	                    return { origin: this.terminal.id, destination: lab.id, resourceType: mineralType, amount: amountNeeded, reduceLoad: true };
	                }
	            }
	        }
	    }
	    checkProductLabs() {
	        if (!this.productLabs)
	            return; // early
	        for (let lab of this.productLabs) {
	            if (this.terminal.store.energy >= constants_1.IGOR_CAPACITY && lab.energy < constants_1.IGOR_CAPACITY) {
	                // restore boosting energy to lab
	                return { origin: this.terminal.id, destination: lab.id, resourceType: RESOURCE_ENERGY };
	            }
	            let flag = lab.pos.lookFor(LOOK_FLAGS)[0];
	            if (flag)
	                continue;
	            if (lab.mineralAmount > 0 && (!this.labProcess || lab.mineralType !== this.labProcess.currentShortage.mineralType)) {
	                // empty wrong mineral type or clear lab when no process
	                return { origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType };
	            }
	            else if (this.labProcess && lab.mineralAmount >= constants_1.IGOR_CAPACITY) {
	                // store product in terminal
	                return { origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType };
	            }
	        }
	    }
	    findReagentLabs() {
	        if (this.memory.reagentLabIds) {
	            let labs = _.map(this.memory.reagentLabIds, (id) => {
	                let lab = Game.getObjectById(id);
	                if (lab) {
	                    return lab;
	                }
	                else {
	                    this.memory.reagentLabIds = undefined;
	                }
	            });
	            if (labs.length === 2) {
	                return labs;
	            }
	            else {
	                this.memory.reagentLabIds = undefined;
	            }
	        }
	        if (Game.time % 1000 !== 2)
	            return; // early
	        let labs = this.room.findStructures(STRUCTURE_LAB);
	        if (labs.length < 3)
	            return; // early
	        let reagentLabs = [];
	        for (let lab of labs) {
	            if (reagentLabs.length === 2)
	                break;
	            let outOfRange = false;
	            for (let otherLab of labs) {
	                if (lab.pos.inRangeTo(otherLab, 2))
	                    continue;
	                outOfRange = true;
	                break;
	            }
	            if (!outOfRange)
	                reagentLabs.push(lab);
	        }
	        if (reagentLabs.length === 2) {
	            this.memory.reagentLabIds = _.map(reagentLabs, (lab) => lab.id);
	            this.memory.productLabIds = undefined;
	            return reagentLabs;
	        }
	    }
	    findProductLabs() {
	        if (this.memory.productLabIds) {
	            let labs = _.map(this.memory.productLabIds, (id) => {
	                let lab = Game.getObjectById(id);
	                if (lab) {
	                    return lab;
	                }
	                else {
	                    this.memory.productLabIds = undefined;
	                }
	            });
	            if (labs.length > 0) {
	                return labs;
	            }
	            else {
	                this.memory.productLabIds = undefined;
	            }
	        }
	        let labs = this.room.findStructures(STRUCTURE_LAB);
	        if (labs.length === 0)
	            return; // early
	        if (this.reagentLabs) {
	            for (let reagentLab of this.reagentLabs) {
	                labs = _.pull(labs, reagentLab);
	            }
	        }
	        this.memory.productLabIds = _.map(labs, (lab) => lab.id);
	        return labs;
	    }
	    doSynthesis() {
	        for (let i = 0; i < this.productLabs.length; i++) {
	            // so that they don't all activate on the same tick and make bucket sad
	            if (Game.time % 10 !== i)
	                continue;
	            let lab = this.productLabs[i];
	            if (lab.pos.lookFor(LOOK_FLAGS).length > 0)
	                continue;
	            if (!lab.mineralType || lab.mineralType === this.labProcess.currentShortage.mineralType) {
	                let outcome = lab.runReaction(this.reagentLabs[0], this.reagentLabs[1]);
	                if (outcome === OK) {
	                    Game.cache.activeLabCount++;
	                }
	            }
	        }
	    }
	    findLabProcess() {
	        if (!this.reagentLabs)
	            return;
	        if (this.memory.labProcess) {
	            let process = this.memory.labProcess;
	            let processFinished = this.checkProcessFinished(process);
	            if (processFinished) {
	                console.log("IGOR:", this.opName, "has finished with", process.currentShortage.mineralType);
	                this.memory.labProcess = undefined;
	                return this.findLabProcess();
	            }
	            let progress = this.checkProgress(process);
	            if (!progress) {
	                console.log("IGOR:", this.opName, "made no progress with", process.currentShortage.mineralType);
	                this.memory.labProcess = undefined;
	                return this.findLabProcess();
	            }
	            return process;
	        }
	        // avoid checking for new process every tick
	        if (!this.memory.checkProcessTick)
	            this.memory.checkProcessTick = Game.time - 100;
	        if (Game.time < this.memory.checkProcessTick + 100)
	            return; // early
	        this.memory.labProcess = this.findNewProcess();
	    }
	    checkProcessFinished(process) {
	        for (let i = 0; i < 2; i++) {
	            let amountInLab = this.reagentLabs[i].mineralAmount;
	            let load = process.reagentLoads[Object.keys(process.reagentLoads)[i]];
	            if (amountInLab === 0 && load === 0) {
	                return true;
	            }
	        }
	        return false;
	    }
	    checkProgress(process) {
	        if (Game.time % 1000 !== 2)
	            return true;
	        let loadStatus = 0;
	        for (let resourcetype in process.reagentLoads) {
	            loadStatus += process.reagentLoads[resourcetype];
	        }
	        if (loadStatus !== process.loadProgress) {
	            process.loadProgress = loadStatus;
	            return true;
	        }
	        else {
	            return false;
	        }
	    }
	    findNewProcess() {
	        let store = this.gatherInventory();
	        for (let compound of constants_1.PRODUCT_LIST) {
	            if (store[compound] >= constants_1.PRODUCTION_AMOUNT)
	                continue;
	            return this.generateProcess({ mineralType: compound, amount: constants_1.PRODUCTION_AMOUNT + constants_1.IGOR_CAPACITY - (this.terminal.store[compound] || 0) });
	        }
	        if (store[RESOURCE_CATALYZED_GHODIUM_ACID] < constants_1.PRODUCTION_AMOUNT + 5000) {
	            return this.generateProcess({ mineralType: RESOURCE_CATALYZED_GHODIUM_ACID, amount: 5000 });
	        }
	    }
	    recursiveShortageCheck(shortage, fullAmount = false) {
	        // gather amounts of compounds in terminal and labs
	        let store = this.gatherInventory();
	        if (store[shortage.mineralType] === undefined)
	            store[shortage.mineralType] = 0;
	        let amountNeeded = shortage.amount - Math.floor(store[shortage.mineralType] / 10) * 10;
	        if (fullAmount) {
	            amountNeeded = shortage.amount;
	        }
	        if (amountNeeded > 0) {
	            // remove raw minerals from list, no need to make those
	            let reagents = _.filter(constants_1.REAGENT_LIST[shortage.mineralType], (mineralType) => !_.includes(constants_1.MINERALS_RAW, mineralType));
	            let shortageFound;
	            for (let reagent of reagents) {
	                shortageFound = this.recursiveShortageCheck({ mineralType: reagent, amount: amountNeeded });
	                if (shortageFound)
	                    break;
	            }
	            if (shortageFound) {
	                return shortageFound;
	            }
	            else {
	                return { mineralType: shortage.mineralType, amount: amountNeeded };
	            }
	        }
	    }
	    gatherInventory() {
	        let inventory = {};
	        for (let mineralType in this.terminal.store) {
	            if (!this.terminal.store.hasOwnProperty(mineralType))
	                continue;
	            if (inventory[mineralType] === undefined)
	                inventory[mineralType] = 0;
	            inventory[mineralType] += this.terminal.store[mineralType];
	        }
	        for (let lab of this.productLabs) {
	            if (lab.mineralAmount > 0) {
	                if (inventory[lab.mineralType] === undefined)
	                    inventory[lab.mineralType] = 0;
	                inventory[lab.mineralType] += lab.mineralAmount;
	            }
	        }
	        /* shouldn't need to check igors
	        for (let igor of this.igors) {
	            for (let resourceType in igor.carry) {
	                inventory[resourceType] += igor.carry[resourceType];
	            }
	        }
	        */
	        return inventory;
	    }
	    generateProcess(targetShortage) {
	        let currentShortage = this.recursiveShortageCheck(targetShortage, true);
	        if (currentShortage === undefined) {
	            console.log("IGOR: error finding current shortage in", this.opName);
	            return;
	        }
	        let reagentLoads = {};
	        for (let mineralType of constants_1.REAGENT_LIST[currentShortage.mineralType]) {
	            reagentLoads[mineralType] = currentShortage.amount;
	        }
	        let loadProgress = currentShortage.amount * 2;
	        return {
	            targetShortage: targetShortage,
	            currentShortage: currentShortage,
	            reagentLoads: reagentLoads,
	            loadProgress: loadProgress
	        };
	    }
	    checkBoostRequests() {
	        if (!this.room.memory.boostRequests)
	            this.room.memory.boostRequests = {};
	        let requests = this.room.memory.boostRequests;
	        for (let resourceType in requests) {
	            let request = requests[resourceType];
	            for (let id of request.requesterIds) {
	                let creep = Game.getObjectById(id);
	                if (!creep) {
	                    request.requesterIds = _.pull(request.requesterIds, id);
	                }
	            }
	            let flag = Game.flags[request.flagName];
	            if (request.requesterIds.length === 0 && flag) {
	                console.log("IGOR: removing boost flag:", flag.name);
	                flag.remove();
	                requests[resourceType] = undefined;
	            }
	            if (request.requesterIds.length > 0 && !flag) {
	                request.flagName = this.placePullFlag(resourceType);
	            }
	        }
	    }
	    placePullFlag(resourceType) {
	        let existingFlag = Game.flags[this.opName + "_" + resourceType];
	        if (existingFlag)
	            return existingFlag.name;
	        let labs = _.filter(this.productLabs, (l) => l.pos.lookFor(LOOK_FLAGS).length === 0);
	        if (labs.length === 0)
	            return;
	        let closestToSpawn = this.spawnGroup.spawns[0].pos.findClosestByRange(labs);
	        if (this.productLabs.length > 1) {
	            this.productLabs = _.pull(this.productLabs, closestToSpawn);
	        }
	        let outcome = closestToSpawn.pos.createFlag(this.opName + "_" + resourceType);
	        if (_.isString(outcome)) {
	            console.log("IGOR: placing boost flag:", outcome);
	            return outcome;
	        }
	    }
	    findIgorIdlePosition() {
	        if (!this.memory.idlePosition && Game.time % 1000 === 0) {
	            // start with the position that would be available following the default spec
	            let positions = [this.terminal.pos.getPositionAtDirection(this.terminal.pos.getDirectionTo(this.storage))];
	            for (let i = 1; i <= 8; i++) {
	                // add other positions around storage
	                positions.push(this.storage.pos.getPositionAtDirection(i));
	            }
	            for (let position of positions) {
	                // check each position for valid conditions
	                if (position.lookFor(LOOK_STRUCTURES).length === 0 && position.isPassible(true) && position.isNearTo(this.storage)) {
	                    console.log(`IGOR: found a good idle position in ${this.opName}: ${position}`);
	                    this.memory.idlePosition = position;
	                    break;
	                }
	            }
	            if (!this.memory.idlePosition) {
	                console.log(`IGOR: terminal placement is unoptimal at ${this.opName}, consider moving storage or terminal`);
	            }
	        }
	    }
	}
	exports.IgorMission = IgorMission;


/***/ },
/* 15 */
/*!**********************************************!*\
  !*** ./src/ai/missions/LinkMiningMission.ts ***!
  \**********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class LinkMiningMission extends Mission_1.Mission {
	    /**
	     * Sends a miner to a source with a link, energy transfer is managed by LinkNetworkMission
	     * @param operation
	     * @param name
	     * @param source
	     * @param link
	     */
	    constructor(operation, name, source, link) {
	        super(operation, name);
	        this.source = source;
	        this.link = link;
	    }
	    initMission() {
	    }
	    roleCall() {
	        this.linkMiners = this.headCount(this.name, () => this.workerBody(5, 4, 3), 1);
	    }
	    missionActions() {
	        for (let miner of this.linkMiners) {
	            this.minerActions(miner);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    minerActions(miner) {
	        if (!miner.memory.inPosition) {
	            this.moveToPosition(miner);
	            return; // early
	        }
	        miner.memory.donatesEnergy = true;
	        miner.memory.scavanger = RESOURCE_ENERGY;
	        miner.harvest(this.source);
	        if (miner.carry.energy === miner.carryCapacity) {
	            miner.transfer(this.link, RESOURCE_ENERGY);
	        }
	    }
	    /**
	     * Picks a position between the source and the link and moves there, robbing and killing any miner at that position
	     * @param miner
	     */
	    moveToPosition(miner) {
	        for (let i = 1; i <= 8; i++) {
	            let position = this.source.pos.getPositionAtDirection(i);
	            if (!position.isPassible(true))
	                continue;
	            if (!position.isNearTo(this.link))
	                continue;
	            if (position.lookForStructure(STRUCTURE_ROAD))
	                continue;
	            if (miner.pos.inRangeTo(position, 0)) {
	                miner.memory.inPosition = true;
	            }
	            else {
	                miner.moveItOrLoseIt(position, "miner");
	            }
	            return; // early
	        }
	        console.log("couldn't find valid position for", miner.name, "in ", miner.room.name);
	    }
	}
	exports.LinkMiningMission = LinkMiningMission;


/***/ },
/* 16 */
/*!******************************************!*\
  !*** ./src/ai/missions/MiningMission.ts ***!
  \******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class MiningMission extends Mission_1.Mission {
	    /**
	     * General-purpose energy mining, uses a nested TransportMission to transfer energy
	     * @param operation
	     * @param name
	     * @param source
	     */
	    constructor(operation, name, source) {
	        super(operation, name);
	        this.source = source;
	    }
	    // return-early
	    initMission() {
	        if (!this.hasVision)
	            return;
	        this.distanceToSpawn = this.findDistanceToSpawn(this.source.pos);
	        this.storage = this.findMinerStorage();
	        if (!this.memory.positionsAvailable) {
	            this.memory.positionsAvailable = this.source.pos.openAdjacentSpots(true).length;
	        }
	        this.positionsAvailable = this.memory.positionsAvailable;
	        this.container = this.source.findMemoStructure(STRUCTURE_CONTAINER, 1);
	        if (!this.container) {
	            this.placeContainer();
	        }
	        this.needsEnergyTransport = this.storage !== undefined;
	        if (this.needsEnergyTransport) {
	            this.runTransportAnalysis();
	        }
	        else {
	        }
	    }
	    roleCall() {
	        // below a certain amount of maxSpawnEnergy, BootstrapMission will harvest energy
	        if (!this.memory.potencyPerMiner)
	            this.memory.potencyPerMiner = 2;
	        let maxMiners = this.needsEnergyTransport ? 1 : Math.min(Math.ceil(5 / this.memory.potencyPerMiner), this.positionsAvailable);
	        if (maxMiners > 1 && this.spawnGroup.maxSpawnEnergy < 800) {
	            this.container = undefined;
	        }
	        let getMinerBody = () => {
	            return this.getMinerBody();
	        };
	        this.miners = this.headCount(this.name, getMinerBody, maxMiners, { prespawn: this.distanceToSpawn });
	        if (this.memory.roadRepairIds) {
	            this.paver = this.spawnPaver();
	        }
	        if (!this.needsEnergyTransport)
	            return;
	        let maxCarts = _.sum(this.storage.store) < 950000 ? this.analysis.cartsNeeded : 0;
	        let memory = { scavanger: RESOURCE_ENERGY };
	        this.minerCarts = this.headCount(this.name + "cart", () => this.analysis.body, maxCarts, { prespawn: this.analysis.distance, memory: memory });
	    }
	    missionActions() {
	        for (let miner of this.miners) {
	            this.minerActions(miner);
	        }
	        if (this.minerCarts) {
	            for (let cart of this.minerCarts) {
	                this.cartActions(cart);
	            }
	        }
	        if (this.paver) {
	            this.paverActions(this.paver);
	        }
	        if (this.container) {
	            let startingPosition = this.storage;
	            if (!startingPosition) {
	                startingPosition = this.room.find(FIND_MY_SPAWNS)[0];
	            }
	            if (startingPosition) {
	                let distance = this.pavePath(startingPosition, this.container, 2);
	                if (distance) {
	                    this.memory.distanceToStorage = distance;
	                }
	            }
	        }
	    }
	    minerActions(miner) {
	        let fleeing = miner.fleeHostiles();
	        if (fleeing) {
	            if (miner.carry.energy > 0) {
	                miner.drop(RESOURCE_ENERGY);
	            }
	            return;
	        }
	        if (!this.hasVision) {
	            miner.blindMoveTo(this.flag);
	            return; // early
	        }
	        if (this.container && !miner.pos.inRangeTo(this.container, 0)) {
	            miner.moveItOrLoseIt(this.container.pos, "miner");
	            return; // early
	        }
	        else if (!miner.pos.isNearTo(this.source)) {
	            miner.blindMoveTo(this.source);
	            return; // early
	        }
	        if (!this.container && miner.carry.energy >= miner.carryCapacity) {
	            let container = this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)[0];
	            if (container) {
	                miner.build(container);
	                return;
	            }
	        }
	        let myStore = this.container ? this.container : miner;
	        miner.memory.donatesEnergy = true;
	        miner.memory.scavanger = RESOURCE_ENERGY;
	        if (this.container && this.container.hits < this.container.hitsMax * .9 && miner.carry.energy > 0) {
	            // container maintainer
	            miner.repair(this.container);
	        }
	        else if (!this.needsEnergyTransport || myStore.store.energy < myStore.storeCapacity) {
	            // will stop mining if this is a full miner with full energy
	            miner.harvest(this.source);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        this.memory.transportAnalysis = undefined;
	    }
	    getMinerBody() {
	        let body;
	        if ((this.container || this.needsEnergyTransport) && this.spawnGroup.maxSpawnEnergy >= 800) {
	            let work = Math.ceil((Math.max(this.source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER);
	            if (this.opType === "keeper") {
	                work++;
	            }
	            if (this.container) {
	                work++;
	            }
	            let move = Math.ceil(work / 2);
	            if (this.waypoints) {
	                move = work;
	            } // waypoints often mean offroad travel
	            let carry;
	            if (this.container) {
	                carry = 1;
	            }
	            else {
	                let workCost = work * BODYPART_COST[WORK];
	                let moveCost = move * BODYPART_COST[MOVE];
	                let remainingSpawnEnergy = this.spawnGroup.maxSpawnEnergy - (workCost + moveCost);
	                carry = Math.min(this.analysis.carryCount, Math.floor(remainingSpawnEnergy / BODYPART_COST[CARRY]));
	            }
	            body = this.workerBody(work, carry, move);
	        }
	        else {
	            if (this.spawnGroup.maxSpawnEnergy < 400) {
	                body = this.workerBody(2, 1, 1);
	            }
	            else {
	                body = this.bodyRatio(1, 1, .5, 1, 5);
	            }
	            if (this.spawnGroup.maxSpawnEnergy >= 1300 && this.container) {
	                body = body.concat([WORK, MOVE]);
	            }
	        }
	        this.memory.potencyPerMiner = _.filter(body, (part) => part === WORK).length;
	        return body;
	    }
	    runTransportAnalysis() {
	        if (!this.memory.distanceToStorage) {
	            let path = PathFinder.search(this.storage.pos, { pos: this.source.pos, range: 1 }).path;
	            this.memory.distanceToStorage = path.length;
	        }
	        let distance = this.memory.distanceToStorage;
	        let load = Math.max(this.source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME;
	        this.analysis = this.analyzeTransport(distance, load);
	    }
	    cartActions(cart) {
	        let fleeing = cart.fleeHostiles();
	        if (fleeing)
	            return; // early
	        // emergency cpu savings
	        if (Game.cpu.bucket < 1000)
	            return;
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            let supply = this.container ? this.container : this.miners[0];
	            if (!supply) {
	                if (!cart.pos.isNearTo(this.flag)) {
	                    cart.idleOffRoad(this.flag);
	                }
	                return; // early
	            }
	            let rangeToSupply = cart.pos.getRangeTo(supply);
	            if (rangeToSupply > 3) {
	                cart.blindMoveTo(supply);
	                return;
	            }
	            if (supply.store.energy === 0) {
	                cart.idleOffRoad(this.flag);
	                return;
	            }
	            if (rangeToSupply > 1) {
	                cart.blindMoveTo(supply);
	                return;
	            }
	            let outcome = cart.withdrawIfFull(supply, RESOURCE_ENERGY);
	            if (outcome === OK && supply.store.energy >= cart.storeCapacity) {
	                cart.blindMoveTo(this.storage);
	            }
	            return; // early
	        }
	        if (!this.storage) {
	            if (!cart.pos.isNearTo(this.flag)) {
	                cart.blindMoveTo((this.flag));
	            }
	            return;
	        }
	        if (cart.pos.isNearTo(this.storage)) {
	            let outcome = cart.transfer(this.storage, RESOURCE_ENERGY);
	            if (outcome === OK && cart.ticksToLive < this.analysis.distance * 2) {
	                cart.suicide();
	            }
	            else if (outcome === OK) {
	                cart.blindMoveTo(this.miners[0]);
	            }
	        }
	        else {
	            cart.blindMoveTo(this.storage);
	        }
	    }
	    findMinerStorage() {
	        let destination = Game.flags[this.opName + "_sourceDestination"];
	        if (destination) {
	            let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0];
	            if (structure) {
	                return structure;
	            }
	        }
	        if (this.opType === "mining" || this.opType === "keeper") {
	            return this.getStorage(this.source.pos);
	        }
	        else {
	            if (this.room.storage && this.room.storage.my) {
	                return this.flag.room.storage;
	            }
	        }
	    }
	    placeContainer() {
	        if (this.room.controller && this.room.controller.my && this.room.controller.level === 1)
	            return;
	        let startingPosition = this.storage;
	        if (!startingPosition) {
	            startingPosition = this.room.find(FIND_MY_SPAWNS)[0];
	            if (!startingPosition)
	                return;
	        }
	        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0)
	            return;
	        let ret = PathFinder.search(this.source.pos, [{ pos: startingPosition.pos, range: 1 }], {
	            maxOps: 4000,
	            swampCost: 2,
	            plainCost: 2,
	            roomCallback: (roomName) => {
	                let room = Game.rooms[roomName];
	                if (!room)
	                    return;
	                let matrix = new PathFinder.CostMatrix();
	                helper_1.helper.addStructuresToMatrix(matrix, room);
	                return matrix;
	            }
	        });
	        if (ret.incomplete || ret.path.length === 0) {
	            console.log(`path used for container placement in ${this.opName} incomplete, please investigate`);
	        }
	        let position = ret.path[0];
	        console.log(`MINER: placed container in ${this.opName}`);
	        position.createConstructionSite(STRUCTURE_CONTAINER);
	    }
	}
	exports.MiningMission = MiningMission;


/***/ },
/* 17 */
/*!*****************************************!*\
  !*** ./src/ai/missions/BuildMission.ts ***!
  \*****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	class BuildMission extends Mission_1.Mission {
	    /**
	     * Spawns a creep to build construction and repair walls. Construction will take priority over walls
	     * @param operation
	     * @param name
	     * @param potency
	     * @param allowSpawn
	     */
	    constructor(operation) {
	        super(operation, "builder");
	    }
	    initMission() {
	        if (this.room !== this.spawnGroup.room) {
	            this.remoteSpawn = true;
	        }
	        this.sites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
	        this.prioritySites = _.filter(this.sites, s => constants_1.PRIORITY_BUILD.indexOf(s.structureType) > -1);
	        if (Game.time % 10 === 5) {
	            // this should be a little more cpu-friendly since it basically will only run in room that has construction
	            for (let site of this.sites) {
	                if (site.structureType === STRUCTURE_RAMPART || site.structureType === STRUCTURE_WALL) {
	                    this.memory.maxHitsToBuild = 2000;
	                    break;
	                }
	            }
	        }
	        if (!this.memory.maxHitsToBuild)
	            this.memory.maxHitsToBuild = 2000;
	    }
	    roleCall() {
	        let maxBuilders = 0;
	        let potency = 0;
	        if (this.sites.length > 0) {
	            maxBuilders = 1;
	            potency = this.findBuilderPotency();
	            if (this.room.storage && this.room.storage.store.energy < 50000) {
	                potency = 1;
	            }
	        }
	        let distance = 20;
	        if (this.room.storage) {
	            distance = 10;
	        }
	        let analysis = this.analyzeTransport(distance, potency * 5);
	        let builderBody = () => {
	            if (this.spawnGroup.maxSpawnEnergy < 550) {
	                return this.bodyRatio(1, 3, .5, 1, potency);
	            }
	            let potencyCost = potency * 100 + Math.ceil(potency / 2) * 50;
	            let energyForCarry = this.spawnGroup.maxSpawnEnergy - potencyCost;
	            let cartCarryCount = Math.floor((analysis.body.length * 2) / 3);
	            let carryCount = Math.min(Math.floor(energyForCarry / 50), cartCarryCount);
	            return this.workerBody(potency, carryCount, Math.ceil(potency / 2));
	        };
	        let builderMemory;
	        if (this.memory.activateBoost) {
	            builderMemory = {
	                scavanger: RESOURCE_ENERGY,
	                boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
	                allowUnboosted: true
	            };
	        }
	        else {
	            builderMemory = { scavanger: RESOURCE_ENERGY };
	        }
	        this.builders = this.headCount(this.name, builderBody, maxBuilders, { prespawn: 10, memory: builderMemory });
	        this.builders = _.sortBy(this.builders, (c) => c.carry.energy);
	        let cartMemory = {
	            scavanger: RESOURCE_ENERGY
	        };
	        this.supplyCarts = this.headCount(this.name + "Cart", () => analysis.body, analysis.cartsNeeded, { prespawn: analysis.distance, memory: cartMemory });
	    }
	    missionActions() {
	        for (let builder of this.builders) {
	            this.builderActions(builder);
	        }
	        for (let cart of this.supplyCarts) {
	            this.builderCartActions(cart);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        this.memory.transportAnalysis = undefined;
	        if (Math.random() < 0.01)
	            this.memory.maxHitsToBuild = undefined;
	    }
	    builderActions(builder) {
	        let hasLoad = _.filter(this.supplyCarts, (c) => !c.spawning).length > 0 || this.hasLoad(builder);
	        if (!hasLoad) {
	            this.procureEnergy(builder);
	            return;
	        }
	        // repair the rampart you just built
	        if (this.memory.rampartPos) {
	            let rampart = helper_1.helper.deserializeRoomPosition(this.memory.rampartPos).lookForStructure(STRUCTURE_RAMPART);
	            if (rampart && rampart.hits < 10000) {
	                if (rampart.pos.inRangeTo(builder, 3)) {
	                    builder.repair(rampart);
	                }
	                else {
	                    builder.blindMoveTo(rampart);
	                }
	                return;
	            }
	            else {
	                this.memory.rampartPos = undefined;
	            }
	        }
	        // has energy
	        let closest;
	        if (this.prioritySites.length > 0) {
	            closest = builder.pos.findClosestByRange(this.prioritySites);
	        }
	        else {
	            closest = builder.pos.findClosestByRange(this.sites);
	        }
	        if (!closest) {
	            this.buildWalls(builder);
	            return;
	        }
	        // has target
	        let range = builder.pos.getRangeTo(closest);
	        if (range <= 3) {
	            let outcome = builder.build(closest);
	            if (outcome === OK) {
	                builder.yieldRoad(closest);
	            }
	            if (outcome === OK && closest.structureType === STRUCTURE_RAMPART) {
	                this.memory.rampartPos = closest.pos;
	            }
	            if (range === 0) {
	                builder.blindMoveTo(this.flag);
	            }
	        }
	        else {
	            builder.blindMoveTo(closest, { maxRooms: 1 });
	        }
	    }
	    buildWalls(builder) {
	        let target = this.findMasonTarget(builder);
	        if (!target) {
	            if (builder.room.controller && builder.room.controller.level < 8) {
	                this.upgradeController(builder);
	            }
	            else {
	                builder.idleOffRoad(this.flag);
	            }
	            return;
	        }
	        if (builder.pos.inRangeTo(target, 3)) {
	            let outcome = builder.repair(target);
	            if (outcome === OK) {
	                builder.yieldRoad(target);
	            }
	        }
	        else {
	            builder.blindMoveTo(target);
	        }
	    }
	    findMasonTarget(builder) {
	        let manualTarget = this.findManualTarget();
	        if (manualTarget)
	            return manualTarget;
	        if (this.room.hostiles.length > 0 && this.room.hostiles[0].owner.username !== "Invader") {
	            if (!this.walls) {
	                this.walls = _(this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL)))
	                    .sortBy("hits")
	                    .value();
	            }
	            let lowest = this.walls[0];
	            _.pull(this.walls, lowest);
	            if (builder.memory.emergencyRepairId) {
	                let structure = Game.getObjectById(builder.memory.emergencyRepairId);
	                if (structure && !builder.pos.inRangeTo(lowest, 3)) {
	                    return structure;
	                }
	                else {
	                    builder.memory.emergencyRepairId = undefined;
	                }
	            }
	            return lowest;
	        }
	        if (builder.memory.wallId) {
	            let wall = Game.getObjectById(builder.memory.wallId);
	            if (wall && wall.hits < this.memory.maxHitsToBuild) {
	                return wall;
	            }
	            else {
	                builder.memory.wallId = undefined;
	                return this.findMasonTarget(builder);
	            }
	        }
	        else {
	            // look for ramparts under maxHitsToBuild
	            let structures = _.filter(this.room.findStructures(STRUCTURE_RAMPART), (s) => s.hits < this.memory.maxHitsToBuild * .9);
	            // look for walls under maxHitsToBuild
	            if (structures.length === 0) {
	                structures = _.filter(this.room.findStructures(STRUCTURE_WALL), (s) => s.hits < this.memory.maxHitsToBuild * .9);
	            }
	            if (structures.length === 0) {
	                // increase maxHitsToBuild if there are walls/ramparts in room and re-call function
	                if (this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL)).length > 0) {
	                    // TODO: seems to produce some pretty uneven walls, find out why
	                    this.memory.maxHitsToBuild += Math.pow(10, Math.floor(Math.log(this.memory.maxHitsToBuild) / Math.log(10)));
	                    return this.findMasonTarget(builder);
	                }
	            }
	            let closest = builder.pos.findClosestByRange(structures);
	            if (closest) {
	                builder.memory.wallId = closest.id;
	                return closest;
	            }
	        }
	    }
	    findManualTarget() {
	        if (this.memory.manualTargetId) {
	            let target = Game.getObjectById(this.memory.manualTargetId);
	            if (target && target.hits < this.memory.manualTargetHits) {
	                return target;
	            }
	            else {
	                this.memory.manualTargetId = undefined;
	                this.memory.manualTargetHits = undefined;
	            }
	        }
	    }
	    upgradeController(builder) {
	        if (builder.pos.inRangeTo(builder.room.controller, 3)) {
	            builder.upgradeController(builder.room.controller);
	            builder.yieldRoad(builder.room.controller);
	        }
	        else {
	            builder.blindMoveTo(builder.room.controller);
	        }
	    }
	    findBuilderPotency() {
	        let potency = 1;
	        if (this.room.storage) {
	            potency = Math.min(Math.floor(this.room.storage.store.energy / 7500), 10);
	        }
	        else {
	            potency = this.room.find(FIND_SOURCES).length * 2;
	        }
	        return potency;
	    }
	    builderCartActions(cart) {
	        let suppliedCreep = _.head(this.builders);
	        if (!suppliedCreep) {
	            cart.idleOffRoad(this.flag);
	            return;
	        }
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            this.procureEnergy(cart, suppliedCreep);
	            return;
	        }
	        let rangeToBuilder = cart.pos.getRangeTo(suppliedCreep);
	        if (rangeToBuilder > 3) {
	            cart.blindMoveTo(suppliedCreep);
	            return;
	        }
	        let overCapacity = cart.carry.energy > suppliedCreep.carryCapacity - suppliedCreep.carry.energy;
	        if (suppliedCreep.carry.energy > suppliedCreep.carryCapacity * .5 && overCapacity) {
	            cart.yieldRoad(suppliedCreep);
	            return;
	        }
	        if (rangeToBuilder > 1) {
	            cart.blindMoveTo(suppliedCreep);
	            return;
	        }
	        cart.transfer(suppliedCreep, RESOURCE_ENERGY);
	        if (!overCapacity && this.room.storage) {
	            cart.blindMoveTo(this.room.storage);
	        }
	    }
	}
	exports.BuildMission = BuildMission;


/***/ },
/* 18 */
/*!***********************************************!*\
  !*** ./src/ai/missions/LinkNetworkMission.ts ***!
  \***********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class LinkNetworkMission extends Mission_1.Mission {
	    /**
	     * Manages linknetwork in room to efficiently send energy between the storage, controller, and sources
	     * Assumptions: 1) all links within 1 linear distance of storage to be used as StorageLinks, 2) all links within
	     * linear distance of 2 of sources to be used as sourceLinks, 3) all links within linearDistance of 3 of controller
	     * to be used as controller links
	     * @param operation
	     */
	    constructor(operation) {
	        super(operation, "linkNetwork");
	        this.storageLinks = [];
	        this.sourceLinks = [];
	    }
	    initMission() {
	        if (this.room.storage) {
	            let controllerBattery = this.room.controller.getBattery();
	            if (controllerBattery instanceof StructureLink) {
	                this.controllerLink = controllerBattery;
	            }
	            this.findStorageLinks();
	            if (this.room.controller.level === 8) {
	                this.findSourceLinks();
	            }
	        }
	    }
	    roleCall() {
	        let conduitBody = () => {
	            return this.workerBody(0, 8, 4);
	        };
	        let max = 0;
	        if (this.storageLinks.length > 0 && this.controllerLink) {
	            max = 1;
	        }
	        let memory = { scavanger: RESOURCE_ENERGY };
	        this.conduits = this.headCount("conduit", conduitBody, max, { prespawn: 10, memory: memory });
	    }
	    missionActions() {
	        for (let conduit of this.conduits) {
	            this.conduitActions(conduit);
	        }
	        if (this.room.controller.level < 8) {
	            this.linkNetworkAlpha();
	        }
	        else {
	            this.linkNetworkBeta();
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    findStorageLinks() {
	        if (this.room.controller.level === 8) {
	            let storageLink = this.room.storage.findMemoStructure(STRUCTURE_LINK, 2);
	            if (storageLink) {
	                this.storageLinks.push(storageLink);
	            }
	        }
	        else {
	            if (!this.memory.storageLinkIds || Game.time % 100 === 7) {
	                // I had this as a lodash function but it looked ugly
	                let linkIds = [];
	                let links = this.room.findStructures(STRUCTURE_LINK);
	                for (let link of links) {
	                    if (link.pos.inRangeTo(this.room.storage, 2)) {
	                        this.storageLinks.push(link);
	                        linkIds.push(link.id);
	                    }
	                }
	                this.memory.storageLinkIds = linkIds;
	            }
	            else {
	                for (let id of this.memory.storageLinkIds) {
	                    let link = Game.getObjectById(id);
	                    if (link) {
	                        this.storageLinks.push(link);
	                    }
	                    else {
	                        this.memory.storageLinkIds = _.pull(this.memory.storageLinkIds, id);
	                    }
	                }
	            }
	            this.storageLinks = _.sortBy(this.storageLinks, "energy");
	        }
	    }
	    findSourceLinks() {
	        for (let source of this.sources) {
	            let link = source.findMemoStructure(STRUCTURE_LINK, 2);
	            if (link) {
	                this.sourceLinks.push(link);
	            }
	        }
	    }
	    conduitActions(conduit) {
	        if (!conduit.memory.inPosition) {
	            this.moveToPosition(conduit);
	            return;
	        }
	        // in position
	        if (this.room.controller.level < 8) {
	            this.conduitAlphaActions(conduit);
	        }
	        else {
	            this.conduitBetaActions(conduit);
	        }
	    }
	    moveToPosition(conduit) {
	        for (let i = 1; i <= 8; i++) {
	            let position = this.room.storage.pos.getPositionAtDirection(i);
	            let invalid = false;
	            for (let link of this.storageLinks) {
	                if (!link.pos.isNearTo(position)) {
	                    invalid = true;
	                    break;
	                }
	            }
	            if (invalid)
	                continue;
	            if (conduit.pos.inRangeTo(position, 0)) {
	                conduit.memory.inPosition = true;
	            }
	            else {
	                conduit.moveItOrLoseIt(position, "conduit");
	            }
	            return; // early
	        }
	        console.log("couldn't find valid position for", conduit.name);
	    }
	    conduitAlphaActions(conduit) {
	        if (conduit.carry.energy < conduit.carryCapacity) {
	            conduit.withdraw(this.room.storage, RESOURCE_ENERGY);
	        }
	        else {
	            for (let link of this.storageLinks) {
	                if (link.energy < link.energyCapacity) {
	                    conduit.transfer(link, RESOURCE_ENERGY);
	                    break;
	                }
	            }
	        }
	    }
	    conduitBetaActions(conduit) {
	        if (this.storageLinks.length === 0)
	            return;
	        let link = this.storageLinks[0];
	        if (conduit.carry.energy > 0) {
	            if (link.energy < 400) {
	                conduit.transfer(link, RESOURCE_ENERGY, Math.min(400 - link.energy, conduit.carry.energy));
	            }
	            else {
	                conduit.transfer(this.room.storage, RESOURCE_ENERGY);
	            }
	        }
	        if (link.energy > 400) {
	            conduit.withdraw(link, RESOURCE_ENERGY, link.energy - 400);
	        }
	        else if (link.energy < 400) {
	            conduit.withdraw(this.room.storage, RESOURCE_ENERGY, 400 - link.energy);
	        }
	    }
	    linkNetworkAlpha() {
	        if (!this.controllerLink)
	            return;
	        let longestDistance = this.findLongestDistance(this.controllerLink, this.storageLinks);
	        if (Game.time % (Math.ceil(longestDistance / this.storageLinks.length)) === 0) {
	            // figure out which one needs to fire
	            if (this.memory.linkFiringIndex === undefined) {
	                this.memory.linkFiringIndex = 0;
	            }
	            let linkToFire = this.storageLinks[this.memory.linkFiringIndex];
	            if (linkToFire) {
	                linkToFire.transferEnergy(this.controllerLink);
	            }
	            else {
	                console.log("should never see this message related to alternating link firing");
	            }
	            this.memory.linkFiringIndex++;
	            if (this.memory.linkFiringIndex >= this.storageLinks.length) {
	                this.memory.linkFiringIndex = 0;
	            }
	        }
	    }
	    linkNetworkBeta() {
	        let firstLink = this.sourceLinks[0];
	        let storageLink = this.storageLinks[0];
	        if (!storageLink || !this.controllerLink)
	            return; // early
	        if (!firstLink) {
	            if (storageLink && storageLink.cooldown === 0 && this.controllerLink) {
	                // maintain controller while sourceLinks are not yet built
	                storageLink.transferEnergy(this.controllerLink);
	            }
	            return;
	        }
	        if (Game.time % 40 === 0) {
	            if (this.controllerLink.energy < 400) {
	                firstLink.transferEnergy(this.controllerLink);
	            }
	            else {
	                firstLink.transferEnergy(storageLink);
	            }
	        }
	        if (Game.time % 40 === 20 && this.controllerLink.energy < 400) {
	            storageLink.transferEnergy(this.controllerLink, 400 - this.controllerLink.energy);
	        }
	        if (this.sources.length === 1)
	            return;
	        let secondLink = this.sourceLinks[1];
	        if (Game.time % 40 === 10 && secondLink && storageLink) {
	            secondLink.transferEnergy(storageLink);
	        }
	    }
	    findLongestDistance(origin, objects) {
	        let distance = 0;
	        for (let object of objects) {
	            let dist = origin.pos.getRangeTo(object);
	            if (dist > distance) {
	                distance = dist;
	            }
	        }
	        return distance;
	    }
	}
	exports.LinkNetworkMission = LinkNetworkMission;


/***/ },
/* 19 */
/*!*******************************************!*\
  !*** ./src/ai/missions/UpgradeMission.ts ***!
  \*******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class UpgradeMission extends Mission_1.Mission {
	    /**
	     * Controller upgrading. Will look for a suitable controller battery (StructureContainer, StructureStorage,
	     * StructureLink) and if one isn't found it will spawn SupplyMission to bring energy to upgraders
	     * @param operation
	     * @param boost
	     * @param allowSpawn
	     * @param allowUnboosted
	     */
	    constructor(operation, boost, allowSpawn = true, allowUnboosted = true) {
	        super(operation, "upgrade", allowSpawn);
	        this.boost = boost;
	        this.allowUnboosted = allowUnboosted;
	    }
	    initMission() {
	        if (!this.memory.cartCount) {
	            this.memory.cartCount = 0;
	        }
	        if (this.spawnGroup.room !== this.room) {
	            this.remoteSpawning = true;
	            this.distanceToSpawn = Game.map.getRoomLinearDistance(this.spawnGroup.room.name, this.room.name);
	        }
	        else {
	            this.distanceToSpawn = this.findDistanceToSpawn(this.room.controller.pos);
	        }
	        this.battery = this.findControllerBattery();
	    }
	    roleCall() {
	        // memory
	        let memory;
	        if (this.boost || this.empire.hasAbundance(RESOURCE_CATALYZED_GHODIUM_ACID, constants_1.RESERVE_AMOUNT * 2)) {
	            memory = { boosts: [RESOURCE_CATALYZED_GHODIUM_ACID], allowUnboosted: this.allowUnboosted };
	        }
	        let totalPotency = this.findUpgraderPotency();
	        let potencyPerCreep;
	        if (this.remoteSpawning) {
	            potencyPerCreep = Math.min(totalPotency, 23);
	        }
	        else {
	            let unitCost = 125;
	            potencyPerCreep = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / unitCost), 30, totalPotency);
	        }
	        let max = this.findMaxUpgraders(totalPotency, potencyPerCreep);
	        let linkUpgraderBody = () => {
	            if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
	                return this.workerBody(1, 1, 1);
	            }
	            if (this.remoteSpawning) {
	                return this.workerBody(potencyPerCreep, 4, potencyPerCreep);
	            }
	            if (this.spawnGroup.maxSpawnEnergy < 800) {
	                return this.bodyRatio(2, 1, 1, 1);
	            }
	            else {
	                return this.workerBody(potencyPerCreep, 4, Math.ceil(potencyPerCreep / 2));
	            }
	        };
	        this.linkUpgraders = this.headCount("upgrader", linkUpgraderBody, max, {
	            prespawn: this.distanceToSpawn,
	            memory: memory
	        });
	        if (this.battery instanceof StructureContainer) {
	            let analysis = this.analyzeTransport(25, totalPotency);
	            this.batterySupplyCarts = this.headCount("upgraderCart", () => analysis.body, analysis.cartsNeeded, {
	                prespawn: this.distanceToSpawn,
	            });
	        }
	        if (this.memory.roadRepairIds && !this.remoteSpawning) {
	            this.paver = this.spawnPaver();
	        }
	        let maxInfluxCarts = 0;
	        let influxMemory;
	        if (this.remoteSpawning) {
	            if (this.room.storage && this.room.storage.store.energy < constants_1.NEED_ENERGY_THRESHOLD
	                && this.spawnGroup.room.storage && this.spawnGroup.room.storage.store.energy > constants_1.SUPPLY_ENERGY_THRESHOLD) {
	                maxInfluxCarts = 10;
	                influxMemory = { originId: this.spawnGroup.room.storage.id };
	            }
	        }
	        let influxCartBody = () => this.workerBody(0, 25, 25);
	        this.influxCarts = this.headCount("influxCart", influxCartBody, maxInfluxCarts, { memory: influxMemory });
	    }
	    missionActions() {
	        let index = 0;
	        for (let upgrader of this.linkUpgraders) {
	            this.linkUpgraderActions(upgrader, index);
	            index++;
	        }
	        if (this.paver) {
	            this.paverActions(this.paver);
	        }
	        if (this.batterySupplyCarts) {
	            for (let cart of this.batterySupplyCarts) {
	                this.batterySupplyCartActions(cart);
	            }
	        }
	        for (let influxCart of this.influxCarts) {
	            this.influxCartActions(influxCart);
	        }
	        if (this.battery) {
	            let startingPosition = this.room.storage;
	            if (!startingPosition) {
	                startingPosition = this.room.find(FIND_MY_SPAWNS)[0];
	            }
	            if (startingPosition) {
	                this.pavePath(startingPosition, this.battery, 1, true);
	            }
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        if (Math.random() < .01)
	            this.memory.positionCount = undefined;
	        if (Math.random() < .1)
	            this.memory.transportAnalysis = undefined;
	    }
	    linkUpgraderActions(upgrader, index) {
	        let battery = this.room.controller.getBattery();
	        if (!battery) {
	            upgrader.idleOffRoad(this.flag);
	            return; // early
	        }
	        let outcome;
	        if (battery instanceof StructureContainer && battery.hits < battery.hitsMax * 0.8) {
	            outcome = upgrader.repair(battery);
	        }
	        else {
	            outcome = upgrader.upgradeController(this.room.controller);
	        }
	        let myPosition = this.room.controller.getUpgraderPositions()[index];
	        if (myPosition) {
	            let range = upgrader.pos.getRangeTo(myPosition);
	            if (range > 0) {
	                upgrader.blindMoveTo(myPosition);
	            }
	        }
	        else {
	            if (upgrader.pos.inRangeTo(battery, 3)) {
	                upgrader.yieldRoad(battery);
	            }
	            else {
	                upgrader.blindMoveTo(battery);
	            }
	        }
	        if (upgrader.carry[RESOURCE_ENERGY] < upgrader.carryCapacity / 4) {
	            upgrader.withdraw(battery, RESOURCE_ENERGY);
	        }
	    }
	    findControllerBattery() {
	        let battery = this.room.controller.getBattery();
	        if (battery instanceof StructureContainer && this.room.controller.level >= 5) {
	            battery.destroy();
	            return;
	        }
	        if (!battery) {
	            let spawn = this.room.find(FIND_MY_SPAWNS)[0];
	            if (!spawn)
	                return;
	            if (!this.memory.batteryPosition) {
	                this.memory.batteryPosition = this.findBatteryPosition(spawn);
	                if (!this.memory.batteryPosition)
	                    return;
	            }
	            let structureType = STRUCTURE_LINK;
	            if (this.room.controller.level < 5) {
	                structureType = STRUCTURE_CONTAINER;
	            }
	            let position = helper_1.helper.deserializeRoomPosition(this.memory.batteryPosition);
	            if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0)
	                return;
	            let outcome = position.createConstructionSite(structureType);
	            console.log(`UPGRADE: placing battery in ${this.opName}, outcome: ${outcome}, ${position}`);
	        }
	        return battery;
	    }
	    findBatteryPosition(spawn) {
	        let path = this.findPavedPath(spawn.pos, this.room.controller.pos, 1);
	        let positionsInRange = this.room.controller.pos.findInRange(path, 3);
	        positionsInRange = _.sortBy(positionsInRange, (pos) => pos.getRangeTo(spawn.pos));
	        let mostSpots = 0;
	        let bestPositionSoFar;
	        for (let position of positionsInRange) {
	            let openSpotCount = _.filter(position.openAdjacentSpots(true), (pos) => pos.getRangeTo(this.room.controller) <= 3).length;
	            if (openSpotCount >= 5)
	                return position;
	            else if (openSpotCount > mostSpots) {
	                mostSpots = openSpotCount;
	                bestPositionSoFar = position;
	            }
	        }
	        if (bestPositionSoFar) {
	            return bestPositionSoFar;
	        }
	        else {
	            console.log(`couldn't find controller battery position in ${this.opName}`);
	        }
	    }
	    findUpgraderPotency() {
	        if (!this.battery || this.room.hostiles.length > 0)
	            return 0;
	        if (!this.memory.potency || Game.time % 10 === 0) {
	            if (this.room.controller.level === 8) {
	                if (this.room.storage && this.room.storage.store.energy > constants_1.NEED_ENERGY_THRESHOLD) {
	                    return 15;
	                }
	                else {
	                    return 1;
	                }
	            }
	            let storageCapacity;
	            if (this.room.storage) {
	                storageCapacity = Math.floor(this.room.storage.store.energy / 1500);
	            }
	            if (this.battery instanceof StructureLink && this.room.storage) {
	                let cooldown = this.battery.pos.getRangeTo(this.room.storage) + 3;
	                let linkCount = this.room.storage.pos.findInRange(this.room.findStructures(STRUCTURE_LINK), 2).length;
	                return Math.min(Math.floor(((LINK_CAPACITY * .97) * linkCount) / cooldown), storageCapacity);
	            }
	            else if (this.battery instanceof StructureContainer) {
	                if (this.room.storage)
	                    return storageCapacity;
	                return this.room.find(FIND_SOURCES).length * 10;
	            }
	            else {
	                console.log(`unrecognized controller battery type in ${this.opName}, ${this.battery.structureType}`);
	                return 0;
	            }
	        }
	        return this.memory.potency;
	    }
	    batterySupplyCartActions(cart) {
	        let controllerBattery = this.battery;
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            this.procureEnergy(cart, controllerBattery);
	            return;
	        }
	        let rangeToBattery = cart.pos.getRangeTo(controllerBattery);
	        if (rangeToBattery > 3) {
	            cart.blindMoveTo(controllerBattery, { maxRooms: 1 });
	            return;
	        }
	        if (controllerBattery.store.energy === controllerBattery.storeCapacity) {
	            cart.yieldRoad(controllerBattery);
	            return;
	        }
	        if (rangeToBattery > 1) {
	            cart.blindMoveTo(controllerBattery, { maxRooms: 1 });
	            return;
	        }
	        cart.transfer(controllerBattery, RESOURCE_ENERGY);
	    }
	    influxCartActions(influxCart) {
	        let originStorage = Game.getObjectById(influxCart.memory.originId);
	        if (!originStorage) {
	            influxCart.idleOffRoad(this.flag);
	            return;
	        }
	        let hasLoad = this.hasLoad(influxCart);
	        if (!hasLoad) {
	            if (influxCart.pos.isNearTo(originStorage)) {
	                influxCart.withdraw(originStorage, RESOURCE_ENERGY);
	                influxCart.avoidSK(this.room.storage);
	            }
	            else {
	                influxCart.avoidSK(originStorage, { ignoreRoads: true });
	            }
	            return;
	        }
	        if (influxCart.pos.isNearTo(this.room.storage)) {
	            influxCart.transfer(this.room.storage, RESOURCE_ENERGY);
	            influxCart.avoidSK(originStorage);
	        }
	        else {
	            influxCart.avoidSK(this.room.storage);
	        }
	    }
	    findMaxUpgraders(totalPotency, potencyPerCreep) {
	        if (!this.battery)
	            return 0;
	        let max = Math.min(Math.floor(totalPotency / potencyPerCreep), 5);
	        if (this.room.controller.getUpgraderPositions()) {
	            max = Math.min(this.room.controller.getUpgraderPositions().length, max);
	        }
	        if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
	            max = 1;
	        }
	        return max;
	    }
	}
	exports.UpgradeMission = UpgradeMission;


/***/ },
/* 20 */
/*!*******************************************!*\
  !*** ./src/ai/missions/GeologyMission.ts ***!
  \*******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class GeologyMission extends Mission_1.Mission {
	    constructor(operation, storeStructure) {
	        super(operation, "geology");
	        this.storeStructure = storeStructure;
	    }
	    initMission() {
	        if (!this.hasVision)
	            return;
	        this.mineral = this.room.find(FIND_MINERALS)[0];
	        if (!Game.cache[this.mineral.mineralType])
	            Game.cache[this.mineral.mineralType] = 0;
	        Game.cache[this.mineral.mineralType]++;
	        if (!this.storeStructure)
	            this.storeStructure = this.getStorage(this.mineral.pos);
	        if (!this.storeStructure)
	            return;
	        if (!this.memory.distanceToStorage) {
	            this.memory.distanceToStorage = this.mineral.pos.walkablePath(this.storeStructure.pos).length;
	        }
	        if ((!this.room.controller || this.room.controller.level >= 7) && !this.memory.builtExtractor) {
	            let extractor = this.mineral.pos.lookForStructure(STRUCTURE_EXTRACTOR);
	            if (!extractor) {
	                this.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
	            }
	            this.memory.builtExtractor = true;
	        }
	        this.distanceToSpawn = this.findDistanceToSpawn(this.mineral.pos);
	        if (!this.memory.bestBody) {
	            this.memory.bestBody = this.calculateBestBody();
	        }
	        if (this.mineral.mineralAmount === 0 && this.mineral.ticksToRegeneration > 1000 &&
	            this.mineral.ticksToRegeneration < MINERAL_REGEN_TIME - 1000) {
	            return; // early
	        }
	        this.container = this.mineral.findMemoStructure(STRUCTURE_CONTAINER, 1);
	        if (!this.container && this.memory.builtExtractor &&
	            (this.mineral.ticksToRegeneration < 1000 || this.mineral.mineralAmount > 0)) {
	            this.buildContainer();
	        }
	        this.analysis = this.analyzeTransport(this.memory.distanceToStorage, constants_1.LOADAMOUNT_MINERAL);
	    }
	    roleCall() {
	        let maxGeologists = 0;
	        if (this.hasVision && this.container && this.mineral.mineralAmount > 0 && this.memory.builtExtractor) {
	            maxGeologists = 1;
	        }
	        let geoBody = () => {
	            if (this.room.controller && this.room.controller.my) {
	                return this.memory.bestBody;
	            }
	            else {
	                return this.workerBody(33, 0, 17);
	            }
	        };
	        this.geologists = this.headCount("geologist", geoBody, maxGeologists, this.distanceToSpawn);
	        let maxCarts = maxGeologists > 0 ? this.analysis.cartsNeeded : 0;
	        this.carts = this.headCount("geologyCart", () => this.analysis.body, maxCarts, { prespawn: this.distanceToSpawn });
	        let maxRepairers = this.mineral.mineralAmount > 5000 && this.container && this.container.hits < 50000 ? 1 : 0;
	        this.repairers = this.headCount("repairer", () => this.workerBody(5, 15, 10), maxRepairers);
	        if (this.memory.roadRepairIds) {
	            this.paver = this.spawnPaver();
	        }
	    }
	    missionActions() {
	        for (let geologist of this.geologists) {
	            this.geologistActions(geologist);
	        }
	        for (let cart of this.carts) {
	            if (this.mineral.mineralAmount > 0) {
	                this.cartActions(cart);
	            }
	            else {
	                this.cleanupCartActions(cart);
	            }
	        }
	        for (let repairer of this.repairers) {
	            this.repairActions(repairer);
	        }
	        if (this.paver) {
	            this.paverActions(this.paver);
	        }
	        if (this.mineral && this.room.storage) {
	            let distance = this.pavePath(this.room.storage, this.mineral, 2);
	            if (distance) {
	                this.memory.distanceToStorage = distance;
	            }
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        if (Math.random() < .01) {
	            this.memory.storageId = undefined;
	            this.memory.transportAnalysis = undefined;
	            this.memory.distanceToStorage = undefined;
	            this.memory.builtExtractor = undefined;
	        }
	    }
	    calculateBestBody() {
	        let bestMineAmount = 0;
	        let bestMovePartsCount = 0;
	        let bestWorkPartsCount = 0;
	        for (let i = 1; i < 50; i++) {
	            let movePartsCount = i;
	            let workPartsCount = MAX_CREEP_SIZE - movePartsCount;
	            let ticksPerMove = Math.ceil(1 / (movePartsCount * 2 / workPartsCount));
	            let minePerTick = workPartsCount;
	            let travelTime = ticksPerMove * this.distanceToSpawn;
	            let mineTime = CREEP_LIFE_TIME - travelTime;
	            let mineAmount = minePerTick * mineTime;
	            if (mineAmount > bestMineAmount) {
	                bestMineAmount = mineAmount;
	                bestMovePartsCount = movePartsCount;
	                bestWorkPartsCount = workPartsCount;
	            }
	        }
	        return this.workerBody(bestWorkPartsCount, 0, bestMovePartsCount);
	    }
	    geologistActions(geologist) {
	        let fleeing = geologist.fleeHostiles();
	        if (fleeing)
	            return; // early
	        if (!this.container) {
	            if (!geologist.pos.isNearTo(this.flag)) {
	                geologist.blindMoveTo(this.flag);
	            }
	            return; // early
	        }
	        if (!geologist.pos.inRangeTo(this.container, 0)) {
	            geologist.moveItOrLoseIt(this.container.pos, "geologist");
	            return; // early
	        }
	        if (this.mineral.mineralAmount === 0) {
	            if (this.container.store[this.mineral.mineralType] === 0) {
	                // break down container
	                geologist.dismantle(this.container);
	            }
	            return; // early
	        }
	        if (!this.container.store[this.mineral.mineralType] ||
	            this.container.store[this.mineral.mineralType] < this.container.storeCapacity - 33) {
	            if (Game.time % 6 === 0)
	                geologist.harvest(this.mineral);
	        }
	    }
	    cleanupCartActions(cart) {
	        let fleeing = cart.fleeHostiles();
	        if (fleeing)
	            return; // early
	        if (_.sum(cart.carry) === cart.carryCapacity) {
	            if (cart.pos.isNearTo(this.storeStructure)) {
	                cart.transferEverything(this.storeStructure);
	            }
	            else {
	                cart.blindMoveTo(this.storeStructure);
	            }
	            return; // early;
	        }
	        if (this.container && _.sum(this.container.store) > 0) {
	            if (cart.pos.isNearTo(this.container)) {
	                if (this.container.store.energy > 0) {
	                    cart.withdraw(this.container, RESOURCE_ENERGY);
	                }
	                else if (this.container.store[this.mineral.mineralType] > 0) {
	                    cart.withdraw(this.container, this.mineral.mineralType);
	                }
	            }
	            else {
	                cart.blindMoveTo(this.container);
	            }
	        }
	        else {
	            if (_.sum(cart.carry) > 0) {
	                if (cart.pos.isNearTo(this.storeStructure)) {
	                    cart.transferEverything(this.storeStructure);
	                }
	                else {
	                    cart.blindMoveTo(this.storeStructure);
	                }
	                return; // early;
	            }
	            let spawn = this.spawnGroup.spawns[0];
	            if (cart.pos.isNearTo(spawn)) {
	                spawn.recycleCreep(cart);
	                let witness = this.room.find(FIND_MY_CREEPS)[0];
	                if (witness) {
	                    witness.say("valhalla!");
	                }
	            }
	            else {
	                cart.blindMoveTo(spawn);
	            }
	            return; // early
	        }
	    }
	    buildContainer() {
	        if (!this.memory.containerPosition) {
	            this.memory.containerPosition = this.mineral.pos.walkablePath(this.storeStructure.pos)[0];
	        }
	        let position = helper_1.helper.deserializeRoomPosition(this.memory.containerPosition);
	        if (position.lookFor(LOOK_CONSTRUCTION_SITES).length === 0 && !position.lookForStructure(STRUCTURE_CONTAINER)) {
	            console.log("GEO: building container in", this.opName);
	            position.createConstructionSite(STRUCTURE_CONTAINER);
	        }
	    }
	    cartActions(cart) {
	        let fleeing = cart.fleeHostiles();
	        if (fleeing)
	            return; // early
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            if (!this.container) {
	                if (!cart.pos.isNearTo(this.flag)) {
	                    cart.blindMoveTo(this.flag);
	                }
	                return;
	            }
	            let waitPosition = this.container.pos;
	            if (this.memory.cartWaitPosition)
	                waitPosition = new RoomPosition(this.memory.cartWaitPosition.x, this.memory.cartWaitPosition.y, this.memory.cartWaitPosition.roomName);
	            if (cart.pos.isNearTo(this.container)) {
	                if (this.container.store.energy > 0) {
	                    cart.withdraw(this.container, RESOURCE_ENERGY);
	                }
	                else {
	                    let outcome = cart.withdrawIfFull(this.container, this.mineral.mineralType);
	                    if (outcome === OK && this.container.store[this.mineral.mineralType] >= cart.storeCapacity) {
	                        cart.blindMoveTo(this.storeStructure);
	                    }
	                }
	            }
	            else {
	                cart.blindMoveTo(waitPosition);
	            }
	            return; // early
	        }
	        if (cart.pos.isNearTo(this.storeStructure)) {
	            let outcome = cart.transferEverything(this.storeStructure);
	            if (outcome === OK && cart.ticksToLive < this.analysis.distance) {
	                cart.suicide();
	            }
	            else if (outcome === OK) {
	                cart.blindMoveTo(this.container);
	            }
	        }
	        else {
	            cart.blindMoveTo(this.storeStructure);
	        }
	    }
	    repairActions(repairer) {
	        let fleeing = repairer.fleeHostiles();
	        if (fleeing)
	            return;
	        if (repairer.room.name !== this.flag.pos.roomName) {
	            this.moveToFlag(repairer);
	            return;
	        }
	        let hasLoad = this.hasLoad(repairer);
	        if (!hasLoad) {
	            this.procureEnergy(repairer);
	            return;
	        }
	        if (!this.container || this.container.hits === this.container.hitsMax) {
	            repairer.idleOffRoad(this.flag);
	            return;
	        }
	        if (repairer.pos.inRangeTo(this.container, 3)) {
	            repairer.repair(this.container);
	            repairer.yieldRoad(this.container);
	        }
	        else {
	            repairer.blindMoveTo(this.container);
	        }
	    }
	}
	exports.GeologyMission = GeologyMission;


/***/ },
/* 21 */
/*!**********************************************!*\
  !*** ./src/ai/operations/MiningOperation.ts ***!
  \**********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const ScoutMission_1 = __webpack_require__(/*! ../missions/ScoutMission */ 22);
	const MiningMission_1 = __webpack_require__(/*! ../missions/MiningMission */ 16);
	const RemoteBuildMission_1 = __webpack_require__(/*! ../missions/RemoteBuildMission */ 23);
	const GeologyMission_1 = __webpack_require__(/*! ../missions/GeologyMission */ 20);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const ReserveMission_1 = __webpack_require__(/*! ../missions/ReserveMission */ 24);
	const BodyguardMission_1 = __webpack_require__(/*! ../missions/BodyguardMission */ 25);
	const SwapMission_1 = __webpack_require__(/*! ../missions/SwapMission */ 26);
	const ClaimMission_1 = __webpack_require__(/*! ../missions/ClaimMission */ 27);
	const UpgradeMission_1 = __webpack_require__(/*! ../missions/UpgradeMission */ 19);
	const EnhancedBodyguardMission_1 = __webpack_require__(/*! ../missions/EnhancedBodyguardMission */ 28);
	class MiningOperation extends Operation_1.Operation {
	    /**
	     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the room. Can also
	     * mine minerals from core rooms
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.Low;
	    }
	    initOperation() {
	        this.findOperationWaypoints();
	        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
	            console.log("SPAWN: waypoints detected, manually set spawn room, example:", this.name +
	                ".setSpawnRoom(otherOpName.flag.room.name)");
	            return;
	        }
	        this.spawnGroup = this.getRemoteSpawnGroup();
	        if (!this.spawnGroup) {
	            console.log("ATTN: no spawnGroup found for", this.name);
	            return; // early
	        }
	        this.addMission(new ScoutMission_1.ScoutMission(this));
	        // it is not ideal to return early if no vision, but i'm having a hard time figuring out how to do
	        // miningmission without vision
	        if (!this.flag.room)
	            return;
	        // defense
	        if (this.flag.room.roomType === constants_1.ROOMTYPE_CORE) {
	            this.addMission(new EnhancedBodyguardMission_1.EnhancedBodyguardMission(this));
	        }
	        else {
	            this.addMission(new BodyguardMission_1.BodyguardMission(this, !this.memory.swapMining || this.flag.room.controller.level < 3));
	        }
	        // swap mining
	        if (this.memory.swapMining) {
	            this.addMission(new SwapMission_1.SwapMission(this));
	        }
	        // claimers
	        if (this.flag.room.memory.swapActive) {
	            if (!this.flag.room.controller.my) {
	                this.addMission(new ClaimMission_1.ClaimMission(this));
	            }
	            // upgraders
	            let spawnUpgraders = this.flag.room.controller.level < 6 &&
	                this.spawnGroup.room.terminal.store[RESOURCE_CATALYZED_GHODIUM_ACID] >= constants_1.IGOR_CAPACITY;
	            this.addMission(new UpgradeMission_1.UpgradeMission(this, true, spawnUpgraders, false));
	        }
	        else {
	            this.addMission(new ReserveMission_1.ReserveMission(this));
	        }
	        for (let i = 0; i < this.sources.length; i++) {
	            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0)
	                continue;
	            this.addMission(new MiningMission_1.MiningMission(this, "miner" + i, this.sources[i]));
	        }
	        this.addMission(new RemoteBuildMission_1.RemoteBuildMission(this, true));
	        if (!this.flag.room.controller || this.memory.swapMining) {
	            let storeStructure = this.memory.swapMining ? this.flag.room.terminal : undefined;
	            this.addMission(new GeologyMission_1.GeologyMission(this, storeStructure));
	        }
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	}
	exports.MiningOperation = MiningOperation;


/***/ },
/* 22 */
/*!*****************************************!*\
  !*** ./src/ai/missions/ScoutMission.ts ***!
  \*****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class ScoutMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "scout");
	    }
	    initMission() {
	    }
	    roleCall() {
	        let maxScouts = 0;
	        if (!this.hasVision) {
	            maxScouts = 1;
	        }
	        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, { blindSpawn: true });
	    }
	    missionActions() {
	        for (let scout of this.scouts) {
	            if (!scout.pos.isNearTo(this.flag)) {
	                scout.avoidSK(this.flag);
	            }
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	}
	exports.ScoutMission = ScoutMission;


/***/ },
/* 23 */
/*!***********************************************!*\
  !*** ./src/ai/missions/RemoteBuildMission.ts ***!
  \***********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class RemoteBuildMission extends Mission_1.Mission {
	    /**
	     * Builds construction in remote locations, can recycle self when finished
	     * @param operation
	     * @param recycleWhenDone - recycles creep in spawnroom if there are no available construction sites
	     * @param boost
	     */
	    constructor(operation, recycleWhenDone) {
	        super(operation, "remoteBuild");
	        this.recycleWhenDone = recycleWhenDone;
	    }
	    initMission() {
	        if (!this.hasVision) {
	            return; // early
	        }
	        this.construction = this.room.find(FIND_MY_CONSTRUCTION_SITES);
	    }
	    roleCall() {
	        let maxBuilders = this.construction && this.construction.length > 0 ? 1 : 0;
	        let getBody = () => {
	            if (this.memory.activateBoost) {
	                return this.workerBody(16, 16, 16);
	            }
	            return this.bodyRatio(1, 1, 1, .8, 10);
	        };
	        let memory;
	        if (this.memory.activateBoost) {
	            memory = { boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID], allowUnboosted: true };
	        }
	        this.builders = this.headCount("remoteBuilder", getBody, maxBuilders, { memory: memory });
	    }
	    missionActions() {
	        for (let builder of this.builders) {
	            if (!this.waypoints && this.recycleWhenDone && this.construction.length === 0) {
	                this.recycleBuilder(builder);
	            }
	            else {
	                this.builderActions(builder);
	            }
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    builderActions(builder) {
	        let fleeing = builder.fleeHostiles();
	        if (fleeing)
	            return; // early
	        if (!this.hasVision) {
	            if (!builder.pos.isNearTo(this.flag)) {
	                builder.blindMoveTo(this.flag);
	            }
	            return; // early
	        }
	        if (builder.room !== this.room) {
	            builder.blindMoveTo(this.flag);
	            return; // early
	        }
	        let hasLoad = this.hasLoad(builder);
	        if (!hasLoad) {
	            this.procureEnergy(builder, undefined, true, true);
	            return; // early
	        }
	        let closest = builder.pos.findClosestByRange(this.construction);
	        if (!closest) {
	            if (!builder.pos.isNearTo(this.flag)) {
	                builder.blindMoveTo(this.flag);
	            }
	            return; // early
	        }
	        if (builder.pos.inRangeTo(closest, 3)) {
	            builder.build(closest);
	            builder.yieldRoad(closest);
	        }
	        else {
	            builder.blindMoveTo(closest, { maxRooms: 1 });
	        }
	    }
	    recycleBuilder(builder) {
	        let spawn = this.spawnGroup.spawns[0];
	        if (builder.carry.energy > 0 && spawn.room.storage) {
	            if (builder.pos.isNearTo(spawn.room.storage)) {
	                builder.transfer(spawn.room.storage, RESOURCE_ENERGY);
	            }
	            else {
	                builder.blindMoveTo(spawn.room.storage);
	            }
	        }
	        else {
	            let spawn = this.spawnGroup.spawns[0];
	            if (builder.pos.isNearTo(spawn)) {
	                spawn.recycleCreep(builder);
	            }
	            else {
	                builder.blindMoveTo(spawn);
	            }
	        }
	    }
	}
	exports.RemoteBuildMission = RemoteBuildMission;


/***/ },
/* 24 */
/*!*******************************************!*\
  !*** ./src/ai/missions/ReserveMission.ts ***!
  \*******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class ReserveMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "claimer");
	    }
	    initMission() {
	        if (!this.hasVision)
	            return; //
	        this.controller = this.room.controller;
	    }
	    roleCall() {
	        let needReserver = this.controller && !this.controller.my
	            && (!this.controller.reservation || this.controller.reservation.ticksToEnd < 3000);
	        let maxReservers = needReserver ? 1 : 0;
	        let potency = this.spawnGroup.room.controller.level === 8 ? 5 : 2;
	        let reserverBody = () => this.configBody({
	            claim: potency,
	            move: potency
	        });
	        this.reservers = this.headCount("claimer", reserverBody, maxReservers);
	    }
	    missionActions() {
	        for (let reserver of this.reservers) {
	            this.reserverActions(reserver);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    reserverActions(reserver) {
	        if (!this.controller) {
	            reserver.blindMoveTo(this.flag);
	            return; // early
	        }
	        if (reserver.pos.isNearTo(this.controller)) {
	            reserver.reserveController(this.controller);
	        }
	        else {
	            reserver.blindMoveTo(this.controller);
	        }
	    }
	}
	exports.ReserveMission = ReserveMission;


/***/ },
/* 25 */
/*!*********************************************!*\
  !*** ./src/ai/missions/BodyguardMission.ts ***!
  \*********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class BodyguardMission extends Mission_1.Mission {
	    /**
	     * Remote defense for non-owned rooms. If boosted invaders are likely, use EnhancedBodyguardMission
	     * @param operation
	     * @param allowSpawn
	     */
	    constructor(operation, allowSpawn = true) {
	        super(operation, "bodyguard", allowSpawn);
	    }
	    initMission() {
	        if (!this.hasVision)
	            return; // early
	        this.hostiles = this.room.hostiles;
	        if (this.opType === "mining") {
	            this.trackEnergyTillInvader();
	        }
	    }
	    roleCall() {
	        let maxDefenders = 0;
	        if (this.memory.invaderProbable) {
	            maxDefenders = 1;
	        }
	        if (this.hasVision) {
	            if (this.hostiles.length > 0) {
	                maxDefenders = Math.ceil(this.hostiles.length / 2);
	            }
	            if (this.opType !== "mining" && this.room.findStructures(STRUCTURE_TOWER).length === 0) {
	                maxDefenders = 1;
	            }
	        }
	        let defenderBody = () => {
	            let unit = this.configBody({
	                tough: 1,
	                move: 5,
	                attack: 3,
	                heal: 1
	            });
	            let potency = Math.min(this.spawnGroup.maxUnits(unit, 1), 3);
	            return this.configBody({
	                tough: potency,
	                move: potency * 5,
	                attack: potency * 3,
	                heal: potency
	            });
	        };
	        this.defenders = this.headCount("leeroy", defenderBody, maxDefenders, { prespawn: 50 });
	    }
	    missionActions() {
	        for (let defender of this.defenders) {
	            this.defenderActions(defender);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    defenderActions(defender) {
	        if (!this.hasVision || this.hostiles.length === 0) {
	            this.moveToFlag(defender);
	            if (defender.hits < defender.hitsMax) {
	                defender.heal(defender);
	            }
	            return; // early
	        }
	        let attacking = false;
	        let closest = defender.pos.findClosestByRange(this.hostiles);
	        if (closest) {
	            let range = defender.pos.getRangeTo(closest);
	            if (range > 1) {
	                defender.blindMoveTo(closest, { maxRooms: 1, ignoreRoads: true });
	            }
	            else {
	                attacking = defender.attack(closest) === OK;
	                defender.move(defender.pos.getDirectionTo(closest));
	            }
	        }
	        else {
	            defender.blindMoveTo(this.hostiles[0]);
	        }
	        if (!attacking && defender.hits < defender.hitsMax) {
	            defender.heal(defender);
	        }
	    }
	    /**
	     * Tracks energy harvested and pre-spawns a defender when an invader becomes likely
	     */
	    trackEnergyTillInvader() {
	        if (!this.memory.invaderTrack) {
	            this.memory.invaderTrack = {
	                energyHarvested: 0,
	                tickLastSeen: Game.time,
	                energyPossible: 0
	            };
	        }
	        let memory = this.memory.invaderTrack;
	        // filter source keepers
	        let hostiles = this.hostiles;
	        let harvested = 0;
	        let possible = 0;
	        let sources = this.room.find(FIND_SOURCES);
	        for (let source of sources) {
	            if (source.ticksToRegeneration === 1) {
	                harvested += source.energyCapacity - source.energy;
	                possible += source.energyCapacity;
	            }
	        }
	        memory.energyHarvested += harvested;
	        memory.energyPossible += possible;
	        if (sources.length === 3) {
	            this.memory.invaderProbable = memory.energyHarvested > 65000;
	        }
	        else if (sources.length === 2 && Game.time - memory.tickLastSeen < 20000) {
	            this.memory.invaderProbable = memory.energyHarvested > 75000;
	        }
	        else if (sources.length === 1 && Game.time - memory.tickLastSeen < 20000) {
	            this.memory.invaderProbable = memory.energyHarvested > 90000;
	        }
	        else {
	            this.memory.invaderProbable = false;
	        }
	        if (hostiles.length > 0 && Game.time - memory.tickLastSeen > CREEP_LIFE_TIME) {
	            // reset trackers
	            memory.energyPossible = 0;
	            memory.energyHarvested = 0;
	            memory.tickLastSeen = Game.time;
	        }
	    }
	}
	exports.BodyguardMission = BodyguardMission;


/***/ },
/* 26 */
/*!****************************************!*\
  !*** ./src/ai/missions/SwapMission.ts ***!
  \****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	class SwapMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "swap");
	    }
	    initMission() {
	        if (!this.hasVision)
	            return;
	        this.empire.registerSwap(this.room);
	        this.mineral = this.room.find(FIND_MINERALS)[0];
	        this.towers = this.room.findStructures(STRUCTURE_TOWER);
	        this.terminal = this.room.terminal;
	        this.storage = this.room.storage;
	        // turn off activate when controller gets claimed
	        if (this.memory.needMasons === undefined || Game.time % 10 === 0) {
	            let ramparts = this.room.findStructures(STRUCTURE_RAMPART);
	            this.memory.needMasons = false;
	            for (let rampart of ramparts) {
	                if (rampart.hits < 1000000) {
	                    this.memory.needMasons = true;
	                }
	                if (this.towers.length > 0 && rampart.hits < 1000) {
	                    this.towers[0].repair(rampart);
	                }
	            }
	        }
	        this.invader = this.room.hostiles[0];
	        this.isActive = this.room.controller.my;
	    }
	    roleCall() {
	        // postMasters
	        let maxPostMasters = this.isActive && this.room.controller.level >= 4 ? 1 : 0;
	        let postMasterBody = () => this.workerBody(0, 40, 1);
	        this.postMasters = this.headCount("postMaster", postMasterBody, maxPostMasters, { prespawn: 50 });
	        let maxMasons = this.memory.needMasons && this.room.controller.level >= 6 ? 1 : 0;
	        let masonBody = () => {
	            return this.workerBody(20, 4, 10);
	        };
	        this.masons = this.headCount("swapMason", masonBody, maxMasons);
	    }
	    missionActions() {
	        for (let postMaster of this.postMasters) {
	            this.postMasterActions(postMaster);
	        }
	        for (let mason of this.masons) {
	            this.swapMasonActions(mason);
	        }
	        if (this.invader) {
	            for (let tower of this.towers)
	                tower.attack(this.invader);
	        }
	        this.transferMinerals();
	        this.swapOut();
	        this.sellExcessMineral();
	    }
	    finalizeMission() {
	        if (!this.memory.fortRoomNames) {
	            let roomNames = _.map(this.empire.terminals, (t) => t.room.name).concat(this.empire.memory.allyForts);
	            this.memory.fortRoomNames = _.sortBy(roomNames, (s) => Game.map.getRoomLinearDistance(s, this.room.name, true));
	        }
	    }
	    invalidateMissionCache() {
	        this.memory.fortRoomNames = undefined;
	    }
	    postMasterActions(postMaster) {
	        if (!postMaster.memory.inPosition) {
	            let position = this.terminal.pos.getPositionAtDirection(this.terminal.pos.getDirectionTo(this.storage));
	            if (postMaster.pos.inRangeTo(position, 0)) {
	                postMaster.memory.inPosition = true;
	                postMaster.memory.scavanger = RESOURCE_ENERGY;
	            }
	            else {
	                postMaster.moveItOrLoseIt(position, "postMaster");
	                return; // early
	            }
	        }
	        if (!this.isActive)
	            return; // early
	        if (postMaster.carry.energy > 0) {
	            for (let tower of this.towers) {
	                if (tower.energy === tower.energyCapacity)
	                    continue;
	                postMaster.transfer(tower, RESOURCE_ENERGY);
	                return; // early
	            }
	            if (this.room.controller.level >= 6 && this.storage.store.energy < constants_1.SWAP_RESERVE) {
	                postMaster.transfer(this.storage, RESOURCE_ENERGY);
	            }
	            return; // early
	        }
	        if (this.terminal.store.energy >= 30000 && postMaster.carry.energy < postMaster.carryCapacity) {
	            postMaster.withdraw(this.terminal, RESOURCE_ENERGY);
	        }
	    }
	    transferMinerals() {
	        if (this.room.controller.level < 6)
	            return;
	        if (this.terminal.store.energy >= 20000 && this.terminal.store[this.mineral.mineralType] >= constants_1.RESERVE_AMOUNT) {
	            for (let roomName of this.memory.fortRoomNames) {
	                let room = Game.rooms[roomName];
	                if (!room || room.controller.level < 6)
	                    continue;
	                let terminal = room.terminal;
	                if (!terminal)
	                    continue;
	                let shortageFound = !terminal.store[this.mineral.mineralType]
	                    || terminal.store[this.mineral.mineralType] < constants_1.RESERVE_AMOUNT * 2;
	                if (shortageFound) {
	                    let outcome = this.terminal.send(this.mineral.mineralType, constants_1.RESERVE_AMOUNT, terminal.room.name);
	                    if (outcome === OK) {
	                        console.log("SWAP: sending", constants_1.RESERVE_AMOUNT, this.mineral.mineralType, "to", terminal.room.name);
	                    }
	                    break;
	                }
	            }
	        }
	    }
	    swapOut() {
	        // switch to other another satellite
	        if (Game.time % 100 === 0
	            && this.room.controller.level >= 6
	            && this.mineral.ticksToRegeneration > 10000
	            && this.storage.store.energy >= constants_1.SWAP_RESERVE
	            && this.terminal.store.energy >= 50000) {
	            console.log(this.name, "needs to swap out mining operations");
	            this.empire.engageSwap(this.room);
	        }
	    }
	    sellExcessMineral() {
	        if (this.room.controller.level < 6 || Game.time % 100 !== 1)
	            return; // early
	        let amount = this.room.terminal.store[this.mineral.mineralType];
	        let needtoSell = amount > 100000;
	        if (!needtoSell)
	            return; // early
	        console.log("TRADE: too much mineral in swap mission " + this.opName + ":", amount);
	        this.empire.sellExcess(this.room, this.mineral.mineralType, constants_1.RESERVE_AMOUNT);
	    }
	    swapMasonActions(mason) {
	        let ramparts = _.sortBy(this.room.findStructures(STRUCTURE_RAMPART), "hits");
	        if (ramparts.length === 0 || mason.pos.roomName !== this.flag.pos.roomName) {
	            this.moveToFlag(mason);
	            return;
	        }
	        let hasLoad = this.hasLoad(mason);
	        if (!hasLoad) {
	            this.procureEnergy(mason);
	            return;
	        }
	        let range = mason.pos.getRangeTo(ramparts[0]);
	        if (range > 3) {
	            mason.blindMoveTo(ramparts[0]);
	        }
	        else {
	            mason.repair(ramparts[0]);
	            mason.yieldRoad(ramparts[0]);
	        }
	    }
	}
	exports.SwapMission = SwapMission;


/***/ },
/* 27 */
/*!*****************************************!*\
  !*** ./src/ai/missions/ClaimMission.ts ***!
  \*****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class ClaimMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "claimer");
	    }
	    initMission() {
	        if (!this.hasVision)
	            return; // early
	        this.controller = this.room.controller;
	    }
	    roleCall() {
	        let needClaimer = this.controller && !this.controller.my;
	        let maxClaimers = needClaimer ? 1 : 0;
	        this.claimers = this.headCount("claimer", () => [CLAIM, MOVE], maxClaimers);
	    }
	    missionActions() {
	        for (let claimer of this.claimers) {
	            this.claimerActions(claimer);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    claimerActions(claimer) {
	        let destinationReached = claimer.travelByWaypoint(this.waypoints);
	        if (!destinationReached)
	            return; // early
	        if (!this.controller) {
	            this.moveToFlag(claimer);
	            return; // early
	        }
	        if (claimer.pos.isNearTo(this.controller)) {
	            claimer.claimController(this.controller);
	        }
	        else {
	            claimer.blindMoveTo(this.controller);
	        }
	    }
	}
	exports.ClaimMission = ClaimMission;


/***/ },
/* 28 */
/*!*****************************************************!*\
  !*** ./src/ai/missions/EnhancedBodyguardMission.ts ***!
  \*****************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ../missions/Mission */ 9);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class EnhancedBodyguardMission extends Mission_1.Mission {
	    constructor(operation, allowSpawn = true) {
	        super(operation, "defense", allowSpawn);
	    }
	    initMission() {
	        if (!this.hasVision)
	            return; // early
	        this.hostiles = _.filter(this.room.hostiles, (hostile) => hostile.owner.username !== "Source Keeper");
	        this.trackEnergyTillInvader();
	        if (!this.spawnGroup.room.terminal)
	            return;
	        if (this.memory.allowUnboosted === undefined) {
	            let store = this.spawnGroup.room.terminal.store;
	            this.memory.allowUnboosted = store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1000
	                && store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1000;
	        }
	        for (let id in this.memory.ticksToLive) {
	            let creep = Game.getObjectById(id);
	            if (creep)
	                continue;
	            let ticksToLive = this.memory.ticksToLive[id];
	            if (ticksToLive > 10 && this.memory.allowUnboosted) {
	                console.log("DEFENSE:", this.opName, "lost a leeroy, increasing potency");
	                this.memory.potencyUp = true;
	            }
	            else if (this.memory.potencyUp) {
	                console.log("DEFENSE:", this.opName, "leeroy died of old age, decreasing potency:");
	                this.memory.potencyUp = false;
	            }
	            delete this.memory.ticksToLive[id];
	        }
	    }
	    roleCall() {
	        let maxSquads = 0;
	        if (this.memory.invaderProbable) {
	            maxSquads = 1;
	        }
	        if (this.hasVision && this.hostiles.length > 0) {
	            maxSquads = 1;
	        }
	        let attackerMemory;
	        if (this.memory.potencyUp) {
	            attackerMemory = { boosts: [RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: true };
	        }
	        let healerMemory;
	        if (this.memory.potencyUp) {
	            healerMemory = { boosts: [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE], allowUnboosted: true };
	        }
	        let squadAttackerBody = () => {
	            if (this.memory.potencyUp) {
	                return this.configBody({
	                    [ATTACK]: 10,
	                    [RANGED_ATTACK]: 2,
	                    [MOVE]: 12
	                });
	            }
	            else {
	                return this.configBody({
	                    [ATTACK]: 20,
	                    [RANGED_ATTACK]: 5,
	                    [MOVE]: 25
	                });
	            }
	        };
	        let squadHealerBody = () => {
	            if (this.memory.potencyUp) {
	                return this.configBody({
	                    [TOUGH]: 8,
	                    [MOVE]: 12,
	                    [HEAL]: 4,
	                });
	            }
	            else {
	                return this.configBody({
	                    [TOUGH]: 4,
	                    [MOVE]: 16,
	                    [HEAL]: 12,
	                });
	            }
	        };
	        this.squadAttackers = this.headCount("lee", squadAttackerBody, maxSquads, { prespawn: 50, memory: attackerMemory });
	        this.squadHealers = this.headCount("roy", squadHealerBody, maxSquads, { prespawn: 50, memory: healerMemory });
	    }
	    missionActions() {
	        this.findPartnerships(this.squadAttackers, "attacker");
	        this.findPartnerships(this.squadHealers, "healer");
	        for (let attacker of this.squadAttackers) {
	            this.squadActions(attacker);
	        }
	        for (let healer of this.squadHealers) {
	            this.healerActions(healer);
	        }
	    }
	    finalizeMission() {
	        if (!this.memory.ticksToLive)
	            this.memory.ticksToLive = {};
	        for (let creep of this.squadAttackers) {
	            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
	        }
	        for (let creep of this.squadHealers) {
	            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
	        }
	        if (this.hostiles && this.hostiles.length > 0 && !this.memory.hostilesPresent) {
	            this.memory.hostilesPresent = Game.time;
	        }
	        if (this.hostiles && this.hostiles.length === 0 && this.memory.hostilesPresent) {
	            if (!Memory.temp.invaderDuration) {
	                Memory.temp.invaderDuration = [];
	            }
	            let duration = Game.time - this.memory.hostilesPresent;
	            Memory.temp.invaderDuration.push(duration);
	            if (duration > 100) {
	                console.log("ATTN: invader in", this.room.name, "duration:", duration, "time:", Game.time);
	            }
	            this.memory.hostilesPresent = undefined;
	        }
	    }
	    invalidateMissionCache() {
	        this.memory.allowUnboosted = undefined;
	    }
	    squadActions(attacker) {
	        // find healer, flee if there isn't one
	        let healer = Game.creeps[attacker.memory.partner];
	        if (!healer) {
	            attacker.memory.partner = undefined;
	            if (this.room && attacker.room.name === this.room.name) {
	                let fleeing = attacker.fleeHostiles();
	                if (fleeing)
	                    return;
	            }
	            this.moveToFlag(attacker);
	            return;
	        }
	        if (healer.spawning) {
	            if (attacker.room.name === healer.room.name) {
	                attacker.idleOffRoad(this.spawnGroup.spawns[0]);
	            }
	            else {
	                attacker.blindMoveTo(this.spawnGroup.spawns[0]);
	            }
	            return;
	        }
	        // room is safe
	        if (!this.hostiles || this.hostiles.length === 0) {
	            healer.memory.mindControl = false;
	            this.moveToFlag(attacker);
	            return;
	        }
	        let attacking = false;
	        let rangeAttacking = false;
	        healer.memory.mindControl = true;
	        let target = attacker.pos.findClosestByRange(_.filter(this.hostiles, (c) => c.partCount(HEAL) > 0));
	        if (!target) {
	            target = attacker.pos.findClosestByRange(this.hostiles);
	        }
	        if (!target && attacker.memory.targetId) {
	            target = Game.getObjectById(attacker.memory.targetId);
	            if (!target)
	                attacker.memory.targetId = undefined;
	        }
	        if (healer.hits < healer.hitsMax * .5 || attacker.hits < attacker.hitsMax * .5) {
	            this.memory.healUp = true;
	        }
	        if (this.memory.healUp === true) {
	            this.squadTravel(healer, attacker, this.spawnGroup.spawns[0]);
	            if (healer.hits > healer.hitsMax * .8 && attacker.hits > attacker.hitsMax * .8) {
	                this.memory.healUp = false;
	            }
	        }
	        else if (target) {
	            attacker.memory.targetId = target.id;
	            let range = attacker.pos.getRangeTo(target);
	            if (range === 1) {
	                attacker.rangedMassAttack();
	                attacking = attacker.attack(target) === OK;
	            }
	            else if (range <= 3) {
	                rangeAttacking = attacker.rangedAttack(target) === OK;
	            }
	            if (attacker.room.name !== target.room.name) {
	                this.squadTravel(attacker, healer, target);
	            }
	            else if (range > 3 || (range > 1 && !(Game.time - attacker.memory.fleeTick === 1))) {
	                this.squadTravel(attacker, healer, target, { maxRooms: 1 });
	            }
	            else if (range > 1) {
	                let fleePath = PathFinder.search(target.pos, { pos: attacker.pos, range: 5 }, { flee: true, maxRooms: 1 });
	                // will only flee-bust  on consecutive ticks
	                if (fleePath.incomplete || !fleePath.path[1] || !fleePath.path[1].isNearExit(0)) {
	                    this.squadTravel(attacker, healer, target, { maxRooms: 1, ignoreRoads: true });
	                }
	                else {
	                    attacker.memory.fleeTick = Game.time;
	                    this.squadTravel(attacker, healer, { pos: fleePath.path[1] }, { maxRooms: 1, ignoreRoads: true });
	                }
	            }
	            else {
	                if (!target.isNearExit(0)) {
	                    // directly adjacent, move on to same position
	                    this.squadTravel(attacker, healer, target);
	                }
	                else {
	                    let direction = attacker.pos.getDirectionTo(target);
	                    if (direction % 2 === 1)
	                        return; // not a diagonal position, already in best position;
	                    let clockwisePosition = attacker.pos.getPositionAtDirection(helper_1.helper.clampDirection(direction + 1));
	                    if (!clockwisePosition.isNearExit(0)) {
	                        this.squadTravel(attacker, healer, { pos: clockwisePosition });
	                    }
	                    else {
	                        let counterClockwisePosition = attacker.pos.getPositionAtDirection(helper_1.helper.clampDirection(direction - 1));
	                        this.squadTravel(attacker, healer, { pos: counterClockwisePosition });
	                    }
	                }
	            }
	        }
	        else {
	            this.squadTravel(attacker, healer, this.flag);
	        }
	        let closest = attacker.pos.findClosestByRange(this.hostiles);
	        if (closest) {
	            let range = attacker.pos.getRangeTo(closest);
	            if (!attacking && range === 1) {
	                attacker.attack(closest);
	                if (!rangeAttacking) {
	                    rangeAttacking = true;
	                    attacker.rangedMassAttack();
	                }
	            }
	            if (!rangeAttacking && range <= 3) {
	                attacker.rangedAttack(closest);
	            }
	        }
	    }
	    healerActions(healer) {
	        if (!this.hostiles || this.hostiles.length === 0) {
	            if (healer.hits < healer.hitsMax) {
	                healer.heal(healer);
	            }
	            else {
	                this.healHurtCreeps(healer);
	            }
	            return;
	        }
	        // hostiles in room
	        let attacker = Game.creeps[healer.memory.partner];
	        if (!attacker) {
	            healer.memory.partner = undefined;
	        }
	        if (!attacker || attacker.spawning) {
	            if (healer.hits < healer.hitsMax) {
	                healer.heal(healer);
	            }
	            if (attacker && attacker.room.name === healer.room.name) {
	                healer.idleOffRoad(this.spawnGroup.spawns[0]);
	            }
	            else {
	                healer.blindMoveTo(this.spawnGroup.spawns[0]);
	            }
	            return;
	        }
	        // attacker is partnered and spawned
	        let range = healer.pos.getRangeTo(attacker);
	        if (range <= 3) {
	            if (attacker.hitsMax - attacker.hits > healer.hitsMax - healer.hits) {
	                if (range > 1) {
	                    healer.rangedHeal(attacker);
	                }
	                else {
	                    healer.heal(attacker);
	                }
	            }
	            else {
	                healer.heal(healer);
	            }
	        }
	        else if (healer.hits < healer.hitsMax) {
	            healer.heal(healer);
	        }
	    }
	    findHurtCreep(defender) {
	        if (!this.room)
	            return;
	        if (defender.memory.healId) {
	            let creep = Game.getObjectById(defender.memory.healId);
	            if (creep && creep.room.name === defender.room.name && creep.hits < creep.hitsMax) {
	                return creep;
	            }
	            else {
	                defender.memory.healId = undefined;
	                return this.findHurtCreep(defender);
	            }
	        }
	        else if (!defender.memory.healCheck || Game.time - defender.memory.healCheck > 25) {
	            defender.memory.healCheck = Game.time;
	            if (!this.hurtCreeps || this.hurtCreeps.length === 0) {
	                this.hurtCreeps = this.room.find(FIND_MY_CREEPS, { filter: (c) => {
	                        return c.hits < c.hitsMax && c.ticksToLive > 100 && c.partCount(WORK) > 0;
	                    } });
	            }
	            if (this.hurtCreeps.length === 0) {
	                this.hurtCreeps = this.room.find(FIND_MY_CREEPS, { filter: (c) => {
	                        return c.hits < c.hitsMax && c.ticksToLive > 100 && c.partCount(CARRY) > 0 && c.carry.energy < c.carryCapacity;
	                    } });
	            }
	            if (this.hurtCreeps.length > 0) {
	                let closest = defender.pos.findClosestByRange(this.hurtCreeps);
	                if (closest) {
	                    this.hurtCreeps = _.pull(this.hurtCreeps, closest);
	                    defender.memory.healId = closest.id;
	                    return closest;
	                }
	            }
	        }
	    }
	    healHurtCreeps(defender) {
	        let hurtCreep = this.findHurtCreep(defender);
	        if (!hurtCreep) {
	            this.moveToFlag(defender);
	            return;
	        }
	        // move to creep
	        let range = defender.pos.getRangeTo(hurtCreep);
	        if (range > 1) {
	            defender.blindMoveTo(hurtCreep, { maxRooms: 1 });
	        }
	        else {
	            defender.yieldRoad(hurtCreep);
	        }
	        if (range === 1) {
	            defender.heal(hurtCreep);
	        }
	        else if (range <= 3) {
	            defender.rangedHeal(hurtCreep);
	        }
	    }
	    squadTravel(attacker, healer, target, ops) {
	        let healerOps = {};
	        if (attacker.room.name === healer.room.name) {
	            healerOps.maxRooms = 1;
	        }
	        let range = attacker.pos.getRangeTo(healer);
	        if (attacker.pos.isNearExit(1)) {
	            attacker.blindMoveTo(target, ops);
	            healer.blindMoveTo(attacker);
	        }
	        else if (attacker.room.name !== healer.room.name) {
	            if (healer.isNearExit(1)) {
	                attacker.blindMoveTo(target, ops);
	            }
	            healer.blindMoveTo(attacker);
	        }
	        else if (range > 2) {
	            attacker.blindMoveTo(healer, ops);
	            healer.blindMoveTo(attacker, ops, true);
	        }
	        else if (range === 2) {
	            healer.blindMoveTo(attacker, ops, true);
	        }
	        else if ((attacker.fatigue === 0 && healer.fatigue === 0)) {
	            if (attacker.pos.isNearTo(target)) {
	                attacker.move(attacker.pos.getDirectionTo(target));
	            }
	            else {
	                attacker.blindMoveTo(target);
	            }
	            healer.move(healer.pos.getDirectionTo(attacker));
	        }
	    }
	    trackEnergyTillInvader() {
	        if (!this.memory.invaderTrack) {
	            this.memory.invaderTrack = { energyHarvested: 0, tickLastSeen: Game.time, energyPossible: 0, log: [] };
	        }
	        let memory = this.memory.invaderTrack;
	        // filter source keepers
	        let hostiles = this.hostiles;
	        let harvested = 0;
	        let possible = 0;
	        let sources = this.room.find(FIND_SOURCES);
	        for (let source of sources) {
	            if (source.ticksToRegeneration === 1) {
	                harvested += source.energyCapacity - source.energy;
	                possible += source.energyCapacity;
	            }
	        }
	        memory.energyHarvested += harvested;
	        memory.energyPossible += possible;
	        if (sources.length === 3) {
	            this.memory.invaderProbable = memory.energyHarvested > 65000;
	        }
	        else if (sources.length === 2 && Game.time - memory.tickLastSeen < 20000) {
	            this.memory.invaderProbable = memory.energyHarvested > 75000;
	        }
	        else if (sources.length === 1 && Game.time - memory.tickLastSeen < 20000) {
	            this.memory.invaderProbable = memory.energyHarvested > 90000;
	        }
	        else {
	            this.memory.invaderProbable = false;
	        }
	        if (hostiles.length > 0 && Game.time - memory.tickLastSeen > 1500) {
	            // reset trackers
	            memory.energyPossible = 0;
	            memory.energyHarvested = 0;
	            memory.tickLastSeen = Game.time;
	        }
	    }
	}
	exports.EnhancedBodyguardMission = EnhancedBodyguardMission;


/***/ },
/* 29 */
/*!**********************************************!*\
  !*** ./src/ai/operations/KeeperOperation.ts ***!
  \**********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const ScoutMission_1 = __webpack_require__(/*! ../missions/ScoutMission */ 22);
	const MiningMission_1 = __webpack_require__(/*! ../missions/MiningMission */ 16);
	const RemoteBuildMission_1 = __webpack_require__(/*! ../missions/RemoteBuildMission */ 23);
	const GeologyMission_1 = __webpack_require__(/*! ../missions/GeologyMission */ 20);
	const LairMission_1 = __webpack_require__(/*! ../missions/LairMission */ 30);
	const EnhancedBodyguardMission_1 = __webpack_require__(/*! ../missions/EnhancedBodyguardMission */ 28);
	class KeeperOperation extends Operation_1.Operation {
	    /**
	     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the room. Can also
	     * mine minerals from core rooms
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	    }
	    initOperation() {
	        this.findOperationWaypoints();
	        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
	            console.log("SPAWN: waypoints detected, manually set spawn room, example:", this.name +
	                ".setSpawnRoom(otherOpName.flag.room.name)");
	            return;
	        }
	        this.spawnGroup = this.getRemoteSpawnGroup();
	        if (!this.spawnGroup) {
	            console.log("ATTN: no spawnGroup found for", this.name);
	            return; // early
	        }
	        this.addMission(new ScoutMission_1.ScoutMission(this));
	        this.addMission(new EnhancedBodyguardMission_1.EnhancedBodyguardMission(this));
	        this.addMission(new LairMission_1.LairMission(this));
	        if (!this.hasVision)
	            return; // early
	        for (let i = 0; i < this.sources.length; i++) {
	            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0)
	                continue;
	            this.addMission(new MiningMission_1.MiningMission(this, "miner" + i, this.sources[i]));
	        }
	        this.addMission(new RemoteBuildMission_1.RemoteBuildMission(this, true));
	        if (this.mineral.pos.lookFor(LOOK_FLAGS).length === 0) {
	            this.addMission(new GeologyMission_1.GeologyMission(this));
	        }
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	    buildKeeperRoads(operation, segments = [0, 1, 2, 3, 4]) {
	        let opFlag = Game.flags["keeper_" + operation];
	        _.forEach(segments, function (segment) {
	            let path = KeeperOperation.getKeeperPath(operation, segment);
	            _.forEach(path, function (p) {
	                opFlag.room.createConstructionSite(p.x, p.y, STRUCTURE_ROAD);
	            });
	        });
	    }
	    static getKeeperPath(operation, segment) {
	        let A;
	        if (segment === 0) {
	            A = Game.flags["keeper_" + operation];
	        }
	        else {
	            A = Game.flags[operation + "_lair:" + (segment - 1)];
	        }
	        let B;
	        B = Game.flags[operation + "_lair:" + segment];
	        if (!B) {
	            B = Game.flags[operation + "_lair:0"];
	        }
	        if (!A || !B) {
	            return;
	        }
	        let r = Game.rooms[A.pos.roomName];
	        if (!r) {
	            return;
	        }
	        if (!_.isEmpty(A.pos.findInRange(FIND_SOURCES, 6))) {
	            A = A.pos.findInRange(FIND_SOURCES, 6)[0];
	        }
	        if (!_.isEmpty(B.pos.findInRange(FIND_SOURCES, 6))) {
	            B = B.pos.findInRange(FIND_SOURCES, 6)[0];
	        }
	        if (!_.isEmpty(A.pos.findInRange(FIND_MINERALS, 6))) {
	            A = A.pos.findInRange(FIND_MINERALS, 6)[0];
	        }
	        if (!_.isEmpty(B.pos.findInRange(FIND_MINERALS, 6))) {
	            B = B.pos.findInRange(FIND_MINERALS, 6)[0];
	        }
	        return A.pos.findPathTo(B.pos, { ignoreCreeps: true });
	    }
	}
	exports.KeeperOperation = KeeperOperation;


/***/ },
/* 30 */
/*!****************************************!*\
  !*** ./src/ai/missions/LairMission.ts ***!
  \****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class LairMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "lair");
	    }
	    initMission() {
	        if (!this.hasVision)
	            return; // early
	        // should be ordered in a preferable travel order
	        this.lairs = this.flagLook(LOOK_STRUCTURES, "_lair:", 4);
	        if (this.lairs.length === 0) {
	            this.lairs = this.room.findStructures(STRUCTURE_KEEPER_LAIR);
	        }
	        this.distanceToSpawn = this.findDistanceToSpawn(this.flag.pos);
	        this.assignKeepers();
	        this.targetLair = this.findTargetLair();
	        if (this.waypoints) {
	            let destination = Game.flags[this.opName + "_sourceDestination"];
	            if (destination) {
	                let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0];
	                if (structure) {
	                    this.storeStructure = structure;
	                }
	            }
	        }
	        else {
	            this.storeStructure = this.spawnGroup.room.storage;
	        }
	    }
	    roleCall() {
	        let maxTrappers = this.lairs && this.lairs.length > 0 ? 1 : 0;
	        this.trappers = this.headCount("trapper", () => this.configBody({ move: 25, attack: 19, heal: 6 }), maxTrappers, {
	            prespawn: this.distanceToSpawn + 100
	        });
	        let maxScavengers = this.lairs && this.lairs.length >= 3 && this.storeStructure ? 1 : 0;
	        let body = () => this.workerBody(0, 33, 17);
	        this.scavengers = this.headCount("scavenger", body, maxScavengers, 50);
	    }
	    missionActions() {
	        for (let trapper of this.trappers) {
	            this.trapperActions(trapper);
	        }
	        for (let scavenger of this.scavengers) {
	            this.scavengersActions(scavenger);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    trapperActions(trapper) {
	        if (trapper.pos.roomName !== this.flag.pos.roomName || !this.targetLair) {
	            if (trapper.hits < trapper.hitsMax) {
	                trapper.heal(trapper);
	            }
	            trapper.blindMoveTo(this.flag);
	            return; // early
	        }
	        let isAttacking = false;
	        let nearestHostile = trapper.pos.findClosestByRange(this.room.hostiles);
	        if (nearestHostile && trapper.pos.isNearTo(nearestHostile)) {
	            isAttacking = trapper.attack(nearestHostile) === OK;
	            trapper.move(trapper.pos.getDirectionTo(nearestHostile));
	        }
	        let keeper = this.targetLair.keeper;
	        let range;
	        if (keeper) {
	            range = trapper.pos.getRangeTo(keeper);
	            if (range > 1) {
	                trapper.blindMoveTo(keeper, { maxRooms: 1 });
	            }
	        }
	        else {
	            trapper.blindMoveTo(this.targetLair, { maxRooms: 1 });
	        }
	        if (!isAttacking && (trapper.hits < trapper.hitsMax || range <= 3)) {
	            trapper.heal(trapper);
	        }
	    }
	    scavengersActions(scavenger) {
	        let fleeing = scavenger.fleeHostiles();
	        if (fleeing)
	            return; // early
	        let hasLoad = this.hasLoad(scavenger);
	        if (hasLoad) {
	            let storage = this.storeStructure;
	            if (scavenger.pos.isNearTo(storage)) {
	                scavenger.transfer(storage, RESOURCE_ENERGY);
	                scavenger.blindMoveTo(this.flag);
	            }
	            else {
	                scavenger.blindMoveTo(storage);
	            }
	            return;
	        }
	        if (scavenger.room.name !== this.flag.pos.roomName) {
	            this.moveToFlag(scavenger);
	            return; // early;
	        }
	        let closest = this.findDroppedEnergy(scavenger);
	        if (closest) {
	            if (scavenger.pos.isNearTo(closest)) {
	                scavenger.pickup(closest);
	                scavenger.say("yoink!", true);
	            }
	            else {
	                scavenger.blindMoveTo(closest, { maxRooms: 0 });
	            }
	        }
	        else {
	            if (!scavenger.pos.isNearTo(this.flag)) {
	                scavenger.blindMoveTo(this.flag);
	            }
	        }
	    }
	    assignKeepers() {
	        if (!this.lairs)
	            return;
	        if (!this.memory.allLairIds) {
	            this.memory.allLairIds = _.map(this.room.findStructures(STRUCTURE_KEEPER_LAIR), (s) => { return s.id; });
	        }
	        let allLairs = _.map(this.memory.allLairIds, (id) => { return Game.getObjectById(id); });
	        let hostiles = this.room.hostiles;
	        for (let hostile of hostiles) {
	            if (hostile.owner.username === "Source Keeper") {
	                let closestLair = hostile.pos.findClosestByRange(allLairs);
	                if (!_.includes(this.lairs, closestLair))
	                    continue;
	                closestLair.keeper = hostile;
	            }
	        }
	    }
	    findTargetLair() {
	        if (this.lairs.length > 0) {
	            let lowestTicks = Number.MAX_VALUE;
	            let lowestLair;
	            for (let lair of this.lairs) {
	                let lastTicks = 0;
	                if (lair.keeper) {
	                    return lair;
	                }
	                else {
	                    // if this lair is going to spawn sooner than the last one in the list, return it
	                    if (lair.ticksToSpawn < lastTicks) {
	                        return lair;
	                    }
	                    lastTicks = lair.ticksToSpawn;
	                    if (lair.ticksToSpawn < lowestTicks) {
	                        lowestLair = lair;
	                        lowestTicks = lair.ticksToSpawn;
	                    }
	                }
	            }
	            return lowestLair;
	        }
	    }
	    findDroppedEnergy(scavenger) {
	        if (scavenger.memory.resourceId) {
	            let resource = Game.getObjectById(scavenger.memory.resourceId);
	            if (resource) {
	                return resource;
	            }
	            else {
	                scavenger.memory.resourceId = undefined;
	                return this.findDroppedEnergy(scavenger);
	            }
	        }
	        else {
	            let resource = scavenger.pos.findClosestByRange(_.filter(this.room.find(FIND_DROPPED_RESOURCES), (r) => r.amount > 100 && r.resourceType === RESOURCE_ENERGY));
	            if (resource) {
	                scavenger.memory.resourceId = resource.id;
	                return resource;
	            }
	        }
	    }
	}
	exports.LairMission = LairMission;


/***/ },
/* 31 */
/*!************************************************!*\
  !*** ./src/ai/operations/ConquestOperation.ts ***!
  \************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const RefillMission_1 = __webpack_require__(/*! ../missions/RefillMission */ 10);
	const DefenseMission_1 = __webpack_require__(/*! ../missions/DefenseMission */ 11);
	const MiningMission_1 = __webpack_require__(/*! ../missions/MiningMission */ 16);
	const LinkNetworkMission_1 = __webpack_require__(/*! ../missions/LinkNetworkMission */ 18);
	const UpgradeMission_1 = __webpack_require__(/*! ../missions/UpgradeMission */ 19);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const ScoutMission_1 = __webpack_require__(/*! ../missions/ScoutMission */ 22);
	const BodyguardMission_1 = __webpack_require__(/*! ../missions/BodyguardMission */ 25);
	const TransportMission_1 = __webpack_require__(/*! ../missions/TransportMission */ 32);
	const ClaimMission_1 = __webpack_require__(/*! ../missions/ClaimMission */ 27);
	const RemoteBuildMission_1 = __webpack_require__(/*! ../missions/RemoteBuildMission */ 23);
	const CONQUEST_MASON_POTENCY = 4;
	const CONQUEST_LOCAL_MIN_SPAWN_ENERGY = 1300;
	class ConquestOperation extends Operation_1.Operation {
	    /**
	     * Facilitates the establishment of new owned-rooms by spawning necessary creeps from a nearby room. Will spawn a
	     * claimer as needed. Spawning responsibilities can be changed-over to the local room by simply removing this operation
	     * flag and replacing it with a FortOperation flag of the same name
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.Medium;
	    }
	    initOperation() {
	        this.findOperationWaypoints();
	        if (!this.memory.spawnRoom) {
	            if (Game.time % 3 === 0) {
	                console.log(this.name, "needs a spawn room, example:", this.name + ".setSpawnRoom(otherOpName.flag.room.name)");
	            }
	            return; // early
	        }
	        this.spawnGroup = this.empire.getSpawnGroup(this.memory.spawnRoom);
	        if (!this.spawnGroup) {
	            console.log("Invalid spawn room specified for", this.name);
	            return;
	        }
	        this.addMission(new ScoutMission_1.ScoutMission(this));
	        if (!this.hasVision)
	            return; // early
	        if (this.flag.room.findStructures(STRUCTURE_TOWER).length === 0) {
	            this.addMission(new BodyguardMission_1.BodyguardMission(this));
	        }
	        if (!this.flag.room.controller.my) {
	            this.addMission(new ClaimMission_1.ClaimMission(this));
	        }
	        // build construction
	        this.addMission(new RemoteBuildMission_1.RemoteBuildMission(this, false));
	        // upgrader controller
	        this.addMission(new UpgradeMission_1.UpgradeMission(this, true));
	        // bring in energy from spawnroom (requires a flag with name "opName_destination" be placed on controller battery)
	        let destinationFlag = Game.flags[`${this.name}_destination`];
	        if (destinationFlag && this.memory.maxTransportCarts) {
	            let storage = this.spawnGroup.room.storage;
	            let storeStructure = destinationFlag.pos.lookFor(LOOK_STRUCTURES)[0];
	            if (storage && storeStructure) {
	                let maxCarts = 5 * Game.map.getRoomLinearDistance(storage.pos.roomName, storeStructure.pos.roomName);
	                if (this.memory.maxTransportCarts) {
	                    maxCarts = this.memory.maxTransportCarts;
	                }
	                let offRoadTransport = false;
	                if (this.memory.offRoadTransport) {
	                    offRoadTransport = this.memory.offRoadTransport;
	                }
	                this.addMission(new TransportMission_1.TransportMission(this, maxCarts, storage, storeStructure, RESOURCE_ENERGY, offRoadTransport));
	            }
	        }
	        // the following can be spawned locally
	        let localSpawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
	        if (localSpawnGroup && localSpawnGroup.maxSpawnEnergy >= CONQUEST_LOCAL_MIN_SPAWN_ENERGY) {
	            this.waypoints = undefined;
	            this.spawnGroup = localSpawnGroup;
	            this.addMission(new RefillMission_1.RefillMission(this));
	        }
	        for (let i = 0; i < this.sources.length; i++) {
	            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0)
	                continue;
	            this.addMission(new MiningMission_1.MiningMission(this, "miner" + i, this.sources[i]));
	        }
	        // use link array near storage to fire energy at controller link (pre-rcl8)
	        this.addMission(new LinkNetworkMission_1.LinkNetworkMission(this));
	        // shoot towers and refill
	        this.addMission(new DefenseMission_1.DefenseMission(this));
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	}
	exports.ConquestOperation = ConquestOperation;


/***/ },
/* 32 */
/*!*********************************************!*\
  !*** ./src/ai/missions/TransportMission.ts ***!
  \*********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class TransportMission extends Mission_1.Mission {
	    constructor(operation, maxCarts, origin, destination, resourceType, offroad = false) {
	        super(operation, "transport");
	        this.maxCarts = maxCarts;
	        if (origin) {
	            this.origin = origin;
	            this.memory.originPos = origin.pos;
	        }
	        if (destination) {
	            this.destination = destination;
	            this.memory.destinationPos = destination.pos;
	        }
	        this.resourceType = resourceType;
	        this.offroad = offroad;
	    }
	    initMission() {
	        this.waypoints = [];
	        if (!this.origin) {
	            let originFlag = Game.flags[this.opName + "_origin"];
	            if (originFlag) {
	                this.memory.originPos = originFlag.pos;
	                if (originFlag.room) {
	                    this.origin = originFlag.pos.lookFor(LOOK_STRUCTURES)[0];
	                }
	            }
	        }
	        if (!this.destination) {
	            let destinationFlag = Game.flags[this.opName + "_destination"];
	            if (destinationFlag) {
	                this.memory.destinationPos = destinationFlag.pos;
	                if (destinationFlag.room) {
	                    this.destination = destinationFlag.pos.lookFor(LOOK_STRUCTURES)[0];
	                }
	            }
	        }
	        this.waypoints = this.getFlagSet("_waypoints_", 1);
	    }
	    roleCall() {
	        let body = () => {
	            if (this.offroad) {
	                return this.bodyRatio(0, 1, 1, 1);
	            }
	            else {
	                return this.bodyRatio(0, 2, 1, 1);
	            }
	        };
	        let memory = { scavanger: this.resourceType, prep: true };
	        this.carts = this.headCount("cart", body, this.maxCarts, { memory: memory });
	    }
	    missionActions() {
	        for (let cart of this.carts) {
	            if (!this.memory.originPos || !this.memory.destinationPos) {
	                this.moveToFlag(cart);
	            }
	            this.cartActions(cart);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    cartActions(cart) {
	        let hasLoad = this.hasLoad(cart);
	        if (!hasLoad) {
	            if (!this.origin) {
	                let originPos = helper_1.helper.deserializeRoomPosition(this.memory.originPos);
	                cart.blindMoveTo(originPos);
	            }
	            else if (!cart.pos.isNearTo(this.origin)) {
	                cart.blindMoveTo(this.origin);
	            }
	            else {
	                let outcome;
	                if (this.resourceType) {
	                    outcome = cart.withdraw(this.origin, this.resourceType);
	                }
	                else if (this.origin instanceof StructureLab) {
	                    outcome = cart.withdraw(this.origin, this.origin.mineralType);
	                }
	                else {
	                    outcome = cart.withdrawEverything(this.origin);
	                }
	                if (outcome === OK) {
	                    cart.blindMoveTo(this.destination);
	                }
	            }
	            return; // early
	        }
	        // hasLoad = true
	        if (!this.destination) {
	            let destinationPos = helper_1.helper.deserializeRoomPosition(this.memory.destinationPos);
	            cart.blindMoveTo(destinationPos);
	        }
	        else if (!cart.pos.isNearTo(this.destination)) {
	            cart.blindMoveTo(this.destination);
	        }
	        else {
	            let outcome;
	            if (this.resourceType) {
	                outcome = cart.transfer(this.destination, this.resourceType);
	            }
	            else {
	                outcome = cart.transferEverything(this.destination);
	            }
	            if (outcome === OK) {
	                cart.blindMoveTo(this.origin);
	            }
	        }
	    }
	}
	exports.TransportMission = TransportMission;


/***/ },
/* 33 */
/*!****************************************!*\
  !*** ./src/helpers/consoleCommands.ts ***!
  \****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	exports.consoleCommands = {
	    /**
	     * Remove construction sites from a room
	     * @param roomName
	     * @param leaveProgressStarted - leave sites already started
	     * @param structureType
	     */
	    removeConstructionSites(roomName, leaveProgressStarted = true, structureType) {
	        Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => {
	            if ((!structureType || site.structureType === structureType) && (!leaveProgressStarted || site.progress === 0)) {
	                site.remove();
	            }
	        });
	    },
	    // shorthand
	    rc(roomName, leaveProgressStarted, structureType) {
	        this.removeConstructionSites(roomName, leaveProgressStarted, structureType);
	    },
	    /**
	     * Remove all flags that contain a substring in the name, good for wiping out a previously used operation
	     * @param substr
	     */
	    removeFlags(substr) {
	        _.forEach(Game.flags, (flag) => {
	            if (_.includes(flag.name, substr)) {
	                console.log(`removing flag ${flag.name} in ${flag.pos.roomName}`);
	                flag.remove();
	            }
	        });
	    },
	    // shorthand
	    rf(substr) {
	        this.removeFlags(substr);
	    },
	    /**
	     * Displays all total raw minerals in every storage/terminal
	     */
	    minv() {
	        for (let mineralType of constants_1.MINERALS_RAW) {
	            console.log(mineralType + ":", emp.inventory[mineralType]);
	        }
	    },
	    /**
	     * Displays all final compounds in every storage/terminal
	     */
	    pinv() {
	        for (let mineralType of constants_1.PRODUCT_LIST) {
	            console.log(mineralType + ":", emp.inventory[mineralType]);
	        }
	    },
	    testCode() {
	        // test code
	    },
	    /**
	     * remove most memory while leaving more important stuff intact, strongly not recommended unless you know what you are
	     * doing
	     */
	    wipeMemory() {
	        for (let flagName in Memory.flags) {
	            let flag = Game.flags[flagName];
	            if (flag) {
	                for (let propertyName of Object.keys(flag.memory)) {
	                    if (propertyName === "swapMining")
	                        continue;
	                    if (propertyName === "powerMining")
	                        continue;
	                    if (propertyName === "power")
	                        continue;
	                    if (propertyName === "spawnRoom")
	                        continue;
	                    if (propertyName === "distance")
	                        continue;
	                    if (propertyName === "centerPosition")
	                        continue;
	                    if (propertyName === "rotation")
	                        continue;
	                    if (propertyName === "radius")
	                        continue;
	                    if (propertyName === "layoutMap")
	                        continue;
	                    delete flag.memory[propertyName];
	                }
	            }
	            else {
	                delete Memory.flags[flagName];
	            }
	        }
	        for (let creepName in Memory.creeps) {
	            let creep = Game.creeps[creepName];
	            if (!creep) {
	                delete Memory.creeps[creepName];
	            }
	        }
	    },
	    /**
	     * find which rooms contain a resource type in terminal
	     * @param resourceType
	     */
	    findResource(resourceType) {
	        for (let terminal of emp.terminals) {
	            if (terminal.store[resourceType]) {
	                console.log(terminal.room.name, terminal.store[resourceType]);
	            }
	        }
	    },
	    /**
	     * Empty resources from a terminal, will only try to send one resource each tick so this must be called repeatedly
	     * on multiple ticks with the same arguments to completely empty a terminal
	     * @param origin
	     * @param destination
	     * @returns {any}
	     */
	    emptyTerminal(origin, destination) {
	        let originTerminal = Game.rooms[origin].terminal;
	        let outcome;
	        for (let resourceType in originTerminal.store) {
	            if (!originTerminal.store.hasOwnProperty(resourceType))
	                continue;
	            let amount = originTerminal.store[resourceType];
	            if (amount >= 100) {
	                if (resourceType !== RESOURCE_ENERGY) {
	                    outcome = originTerminal.send(resourceType, amount, destination);
	                    break;
	                }
	                else if (Object.keys(originTerminal.store).length === 1) {
	                    let distance = Game.map.getRoomLinearDistance(origin, destination, true);
	                    let stored = originTerminal.store.energy;
	                    let amountSendable = Math.floor(stored / (1 + 0.1 * distance));
	                    console.log("sending", amountSendable, "out of", stored);
	                    outcome = originTerminal.send(RESOURCE_ENERGY, amountSendable, destination);
	                }
	            }
	        }
	        return outcome;
	    },
	    /**
	     * Changes the name of an operation, giving it a new flag. May result in some unintended consequences
	     * @param opName
	     * @param newOpName
	     * @returns {any}
	     */
	    changeOpName(opName, newOpName) {
	        let operation = global[opName];
	        if (!operation)
	            return "you don't have an operation by that name";
	        let newFlagName = operation.type + "_" + newOpName;
	        let outcome = operation.flag.pos.createFlag(newFlagName, operation.flag.color, operation.flag.secondaryColor);
	        if (_.isString(outcome)) {
	            Memory.flags[newFlagName] = operation.memory;
	            operation.flag.remove();
	            return "operation name change successfully, removing old flag";
	        }
	        else {
	            return "error changing name: " + outcome;
	        }
	    },
	    /**
	     * Place an order for a resource to be sent to any room. Good for making one-time deals.
	     * @param resourceType
	     * @param amount
	     * @param roomName
	     * @param efficiency - the number of terminals that should send the resource per tick, use a lower number to only send
	     * from the nearest terminals
	     * @returns {any}
	     */
	    order(resourceType, amount, roomName, efficiency = 10) {
	        if (!(amount > 0)) {
	            return "usage: order(resourceType, amount, roomName, efficiency?)";
	        }
	        if (Game.map.getRoomLinearDistance("E0S0", roomName) < 0) {
	            return "usage: order(resourceType, amount, roomName, efficiency?)";
	        }
	        if (efficiency <= 0) {
	            return "efficiency must be >= 1";
	        }
	        Memory.resourceOrder[Game.time] = { resourceType: resourceType, amount: amount, roomName: roomName,
	            efficiency: efficiency, amountSent: 0 };
	        return "TRADE: scheduling " + amount + " " + resourceType + " to be sent to " + roomName;
	    },
	    /**
	     * One-time send resource from all terminals to a specific room. For more control use cc.order()
	     * @param resourceType
	     * @param amount
	     * @param roomName
	     */
	    sendFromAll(resourceType, amount, roomName) {
	        _.forEach(Game.rooms, (room) => {
	            if (room.controller && room.controller.level > 6 && room.terminal && room.terminal.my) {
	                let outcome = room.terminal.send(resourceType, amount, roomName);
	                console.log(room.name, " sent ", amount, " to ", roomName);
	            }
	        });
	    },
	};


/***/ },
/* 34 */
/*!************************************************!*\
  !*** ./src/ai/operations/DemolishOperation.ts ***!
  \************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const DemolishMission_1 = __webpack_require__(/*! ../missions/DemolishMission */ 35);
	class DemolishOperation extends Operation_1.Operation {
	    /**
	     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove the
	     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful.
	     * To have it spawn a scavanger to harvest energy, place a flag with name "opName_store" over a container/storage/terminal
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	    }
	    initOperation() {
	        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
	        let storeStructure = this.checkStoreStructure();
	        this.addMission(new DemolishMission_1.DemolishMission(this, this.memory.potency, storeStructure, this.memory.enableDemo));
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	    checkStoreStructure() {
	        let flag = Game.flags[`${this.name}_store`];
	        if (flag && flag.room) {
	            let storeStructure = _(flag.pos.lookFor(LOOK_STRUCTURES))
	                .filter((s) => s.store !== undefined)
	                .head();
	            if (storeStructure)
	                return storeStructure;
	        }
	    }
	}
	exports.DemolishOperation = DemolishOperation;


/***/ },
/* 35 */
/*!********************************************!*\
  !*** ./src/ai/missions/DemolishMission.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	class DemolishMission extends Mission_1.Mission {
	    /**
	     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove the
	     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful
	     * @param operation
	     * @param potency
	     * @param storeStructure When a storeStructure is provided, it will spawn a scavanger to deliver energy
	     * @param allowSpawn
	     */
	    constructor(operation, potency = 25, storeStructure, allowSpawn = true) {
	        super(operation, "demolish", allowSpawn);
	        this.demoFlags = [];
	        this.demoStructures = [];
	        this.potency = potency;
	        this.storeStructure = storeStructure;
	    }
	    initMission() {
	        for (let i = 0; i <= 50; i++) {
	            let flag = Game.flags["Flag" + i];
	            if (!flag)
	                continue;
	            this.demoFlags.push(flag);
	            if (!flag.room)
	                continue;
	            let structure = flag.pos.lookFor(LOOK_STRUCTURES)[0];
	            if (structure) {
	                this.demoStructures.push(structure);
	            }
	            else {
	                flag.remove();
	            }
	        }
	    }
	    roleCall() {
	        let max = this.demoFlags.length > 0 ? 1 : 0;
	        let potency = Math.min(this.potency, 25);
	        this.demolishers = this.headCount("demolisher", () => this.workerBody(potency, 0, potency), max);
	        let maxScavangers = max > 0 && this.storeStructure ? 1 : 0;
	        this.scavangers = this.headCount("scavanger", () => this.workerBody(0, this.potency, this.potency), maxScavangers);
	    }
	    missionActions() {
	        for (let demolisher of this.demolishers) {
	            this.demolisherActions(demolisher);
	        }
	        for (let scavanger of this.scavangers) {
	            this.scavangerActions(scavanger, _.head(this.demolishers));
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	    }
	    demolisherActions(demolisher) {
	        let structure = _.head(this.demoStructures);
	        if (structure) {
	            if (demolisher.pos.isNearTo(structure)) {
	                demolisher.dismantle(structure);
	            }
	            else {
	                demolisher.blindMoveTo(structure);
	            }
	            return;
	        }
	        let flag = _.head(this.demoFlags);
	        if (flag) {
	            demolisher.blindMoveTo(flag);
	            return;
	        }
	        demolisher.idleOffRoad(this.flag);
	    }
	    scavangerActions(scavanger, demolisher) {
	        if (!demolisher) {
	            if (this.demoFlags.length > 0) {
	                scavanger.blindMoveTo(this.demoFlags[0]);
	            }
	            else {
	                this.moveToFlag(scavanger);
	            }
	            return;
	        }
	        let hasLoad = this.hasLoad(scavanger);
	        if (!hasLoad) {
	            if (scavanger.room !== demolisher.room) {
	                scavanger.blindMoveTo(demolisher);
	                return; // early
	            }
	            let resource = this.findScavangerResource(scavanger, demolisher);
	            if (resource) {
	                if (scavanger.pos.isNearTo(resource)) {
	                    scavanger.pickup(resource);
	                }
	                else {
	                    scavanger.blindMoveTo(resource);
	                }
	            }
	            else {
	                scavanger.blindMoveTo(demolisher);
	            }
	            return; // early
	        }
	        if (_.sum(this.storeStructure.store) === this.storeStructure.storeCapacity) {
	            scavanger.idleOffRoad(demolisher);
	            return; // early
	        }
	        if (scavanger.pos.isNearTo(this.storeStructure)) {
	            scavanger.transfer(this.storeStructure, RESOURCE_ENERGY);
	            scavanger.memory.resourceId = undefined;
	        }
	        else {
	            scavanger.blindMoveTo(this.storeStructure);
	        }
	    }
	    findScavangerResource(scavanger, demolisher) {
	        if (scavanger.memory.resourceId) {
	            let resource = Game.getObjectById(scavanger.memory.resourceId);
	            if (resource) {
	                return resource;
	            }
	            else {
	                scavanger.memory.resourceId = undefined;
	                return this.findScavangerResource(scavanger, demolisher);
	            }
	        }
	        else {
	            let resources = _.filter(demolisher.room.find(FIND_DROPPED_RESOURCES), (r) => r.resourceType === RESOURCE_ENERGY);
	            let closest = scavanger.pos.findClosestByRange(resources);
	            if (closest) {
	                scavanger.memory.resourceId = closest.id;
	                return closest;
	            }
	        }
	    }
	}
	exports.DemolishMission = DemolishMission;


/***/ },
/* 36 */
/*!*************************************************!*\
  !*** ./src/ai/operations/TransportOperation.ts ***!
  \*************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const TransportMission_1 = __webpack_require__(/*! ../missions/TransportMission */ 32);
	class TransportOperation extends Operation_1.Operation {
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	    }
	    initOperation() {
	        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
	        this.findOperationWaypoints();
	        let max = this.memory.max !== undefined ? this.memory.max : 1;
	        this.addMission(new TransportMission_1.TransportMission(this, max, undefined, undefined, this.memory.resourceType, this.memory.offRoad));
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	}
	exports.TransportOperation = TransportOperation;


/***/ },
/* 37 */
/*!********************************************!*\
  !*** ./src/ai/operations/RaidOperation.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	class RaidOperation extends Operation_1.Operation {
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.VeryHigh;
	    }
	    initOperation() {
	    }
	    invalidateOperationCache() {
	    }
	    finalizeOperation() {
	    }
	}
	exports.RaidOperation = RaidOperation;


/***/ },
/* 38 */
/*!********************************************!*\
  !*** ./src/ai/operations/QuadOperation.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const DefenseMission_1 = __webpack_require__(/*! ../missions/DefenseMission */ 11);
	const ControllerOperation_1 = __webpack_require__(/*! ./ControllerOperation */ 39);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	const QUAD_RADIUS = 6;
	class QuadOperation extends ControllerOperation_1.ControllerOperation {
	    constructor() {
	        /**
	         * Manages the activities of an owned room, assumes bonzaiferroni's build spec
	         * @param flag
	         * @param name
	         * @param type
	         * @param empire
	         */
	        super(...arguments);
	        this.staticStructures = {
	            [STRUCTURE_SPAWN]: [{ x: 2, y: 0 }, { x: 0, y: -2 }, { x: -2, y: 0 }],
	            [STRUCTURE_TOWER]: [
	                { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }
	            ],
	            [STRUCTURE_EXTENSION]: [
	                { x: 3, y: -1 }, { x: 2, y: -2 }, { x: 1, y: -3 }, { x: 3, y: -2 }, { x: 2, y: -3 },
	                { x: 0, y: -4 }, { x: -1, y: -3 }, { x: -2, y: -2 }, { x: -3, y: -1 }, { x: -3, y: -2 },
	                { x: -2, y: -3 }, { x: -2, y: -4 }, { x: 4, y: 0 }, { x: -4, y: 0 }, { x: -3, y: 1 },
	                { x: -1, y: 1 }, { x: 3, y: 1 }, { x: 4, y: -2 }, { x: 3, y: -3 }, { x: 2, y: -4 },
	                { x: -3, y: -3 }, { x: -4, y: -2 }, { x: 5, y: -3 }, { x: 4, y: -4 }, { x: 3, y: -5 },
	                { x: -3, y: -5 }, { x: -4, y: -4 }, { x: -5, y: -3 }, { x: 3, y: 2 }, { x: 3, y: 3 },
	                { x: 4, y: 2 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 1 },
	                { x: 5, y: 0 }, { x: 5, y: -1 }, { x: 5, y: -4 }, { x: 5, y: -5 }, { x: 4, y: -5 },
	                { x: 1, y: -5 }, { x: 0, y: -5 }, { x: -1, y: -5 }, { x: -4, y: -5 }, { x: -5, y: -5 },
	                { x: -5, y: -4 }, { x: -5, y: -1 }, { x: -5, y: 0 }, { x: -5, y: 1 }, { x: 4, y: 5 },
	                { x: 5, y: 4 }, { x: 5, y: 5 }, { x: -6, y: 2 }, { x: -6, y: -2 }, { x: -2, y: -6 },
	                { x: 2, y: 4 }, { x: 2, y: -6 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: 2, y: 3 },
	            ],
	            [STRUCTURE_STORAGE]: [{ x: 0, y: 4 }],
	            [STRUCTURE_TERMINAL]: [{ x: -2, y: 2 }],
	            [STRUCTURE_NUKER]: [{ x: 0, y: 6 }],
	            [STRUCTURE_POWER_SPAWN]: [{ x: 0, y: 2 }],
	            [STRUCTURE_OBSERVER]: [{ x: -5, y: 5 }],
	            [STRUCTURE_LAB]: [
	                { x: -2, y: 4 }, { x: -3, y: 3 }, { x: -4, y: 2 }, { x: -3, y: 5 }, { x: -4, y: 4 },
	                { x: -5, y: 3 }, { x: -2, y: 3 }, { x: -3, y: 2 }, { x: -4, y: 5 }, { x: -5, y: 4 }
	            ],
	            [STRUCTURE_ROAD]: [
	                // diamond (n = 12)
	                { x: 3, y: 0 }, { x: 2, y: -1 }, { x: 1, y: -2 }, { x: 0, y: -3 }, { x: -1, y: -2 },
	                { x: -2, y: -1 }, { x: -3, y: 0 }, { x: -2, y: 1 }, { x: -1, y: 2 }, { x: 0, y: 3 },
	                { x: 1, y: 2 }, { x: 2, y: 1 },
	                // x-pattern (n = 24)
	                { x: 4, y: -1 }, { x: 5, y: -2 }, { x: 4, y: -3 },
	                { x: 3, y: -4 }, { x: 2, y: -5 }, { x: 1, y: -4 }, { x: -1, y: -4 }, { x: -2, y: -5 },
	                { x: -3, y: -4 }, { x: -4, y: -3 }, { x: -5, y: -2 }, { x: -4, y: -1 }, { x: -4, y: 1 },
	                { x: -5, y: 2 }, { x: -4, y: 3 }, { x: -3, y: 4 }, { x: -2, y: 5 }, { x: -1, y: 4 },
	                { x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 4 }, { x: 4, y: 3 }, { x: 5, y: 2 },
	                { x: 4, y: 1 },
	                // outside (n = 33)
	                { x: 6, y: -3 }, { x: 6, y: -4 }, { x: 6, y: -5 }, { x: 5, y: -6 },
	                { x: 4, y: -6 }, { x: 3, y: -6 }, { x: 1, y: -6 }, { x: 0, y: -6 }, { x: -1, y: -6 },
	                { x: -3, y: -6 }, { x: -4, y: -6 }, { x: -5, y: -6 }, { x: -6, y: -5 }, { x: -6, y: -4 },
	                { x: -6, y: -3 }, { x: -6, y: -1 }, { x: -6, y: 0 }, { x: -6, y: 1 }, { x: -6, y: 3 },
	                { x: -6, y: 4 }, { x: -6, y: 5 }, { x: -5, y: 6 }, { x: -4, y: 6 }, { x: -3, y: 6 },
	                { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 4 },
	                { x: 6, y: 3 }, { x: 6, y: 1 }, { x: 6, y: 0 }, { x: 6, y: -1 },
	            ],
	            [STRUCTURE_RAMPART]: [
	                // top wall (n = 12)
	                { x: -5, y: -6 }, { x: -4, y: -6 }, { x: -3, y: -6 }, { x: -2, y: -6 }, { x: -1, y: -6 },
	                { x: 0, y: -6 }, { x: 1, y: -6 }, { x: 2, y: -6 }, { x: 3, y: -6 }, { x: 4, y: -6 },
	                { x: 5, y: -6 }, { x: 5, y: -5 },
	                // right wall (n = 12)
	                { x: 6, y: -5 }, { x: 6, y: -4 }, { x: 6, y: -3 }, { x: 6, y: -2 }, { x: 6, y: -1 },
	                { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 6, y: 3 }, { x: 6, y: 4 },
	                { x: 6, y: 5 }, { x: 5, y: 5 },
	                // bottom wall (n = 12)
	                { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 },
	                { x: 0, y: 6 }, { x: -1, y: 6 }, { x: -2, y: 6 }, { x: -3, y: 6 }, { x: -4, y: 6 },
	                { x: -5, y: 6 }, { x: -5, y: 5 },
	                // left wall (n = 12)
	                { x: -6, y: 5 }, { x: -6, y: 4 }, { x: -6, y: 3 }, { x: -6, y: 2 }, { x: -6, y: 1 },
	                { x: -6, y: 0 }, { x: -6, y: -1 }, { x: -6, y: -2 }, { x: -6, y: -3 }, { x: -6, y: -4 },
	                { x: -6, y: -5 }, { x: -5, y: -5 },
	                // storage (n = 1)
	                { x: 0, y: 4 }
	            ]
	        };
	    }
	    addDefense() {
	        this.addMission(new DefenseMission_1.DefenseMission(this));
	    }
	    initAutoLayout() {
	        if (!this.memory.layoutMap) {
	            this.memory.layoutMap = {};
	            this.memory.radius = QUAD_RADIUS;
	        }
	    }
	    temporaryPlacement(level) {
	        if (!this.memory.temporaryPlacement)
	            this.memory.temporaryPlacement = {};
	        if (!this.memory.temporaryPlacement[level]) {
	            let actions = [];
	            // links
	            if (level === 5) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 2, y: 2 } });
	            }
	            if (level === 6) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 2, y: 3 } });
	            }
	            if (level === 7) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 2, y: 4 } });
	            }
	            if (level === 8) {
	                actions.push({ actionType: "remove", structureType: STRUCTURE_LINK, coord: { x: 2, y: 3 } });
	                actions.push({ actionType: "remove", structureType: STRUCTURE_LINK, coord: { x: 2, y: 4 } });
	            }
	            for (let action of actions) {
	                let outcome;
	                let position = helper_1.helper.coordToPosition(action.coord, this.memory.centerPosition, this.memory.rotation);
	                if (action.actionType === "place") {
	                    outcome = position.createConstructionSite(action.structureType);
	                }
	                else {
	                    let structure = position.lookForStructure(action.structureType);
	                    if (structure) {
	                        outcome = structure.destroy();
	                    }
	                    else {
	                        outcome = "noStructure";
	                    }
	                }
	                if (outcome === OK) {
	                    console.log(`LAYOUT: ${action.actionType}d temporary ${action.structureType} (${this.name}, level: ${level})`);
	                }
	                else {
	                    console.log(`LAYOUT: problem with temp placement, please follow up in ${this.name}`);
	                    console.log(`tried to ${action.actionType} ${action.structureType} at level ${level}, outcome: ${outcome}`);
	                }
	            }
	            this.memory.temporaryPlacement[level] = true;
	        }
	    }
	}
	exports.QuadOperation = QuadOperation;


/***/ },
/* 39 */
/*!**************************************************!*\
  !*** ./src/ai/operations/ControllerOperation.ts ***!
  \**************************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const EmergencyMission_1 = __webpack_require__(/*! ../missions/EmergencyMission */ 8);
	const RefillMission_1 = __webpack_require__(/*! ../missions/RefillMission */ 10);
	const PowerMission_1 = __webpack_require__(/*! ../missions/PowerMission */ 12);
	const TerminalNetworkMission_1 = __webpack_require__(/*! ../missions/TerminalNetworkMission */ 13);
	const IgorMission_1 = __webpack_require__(/*! ../missions/IgorMission */ 14);
	const LinkMiningMission_1 = __webpack_require__(/*! ../missions/LinkMiningMission */ 15);
	const MiningMission_1 = __webpack_require__(/*! ../missions/MiningMission */ 16);
	const BuildMission_1 = __webpack_require__(/*! ../missions/BuildMission */ 17);
	const LinkNetworkMission_1 = __webpack_require__(/*! ../missions/LinkNetworkMission */ 18);
	const GeologyMission_1 = __webpack_require__(/*! ../missions/GeologyMission */ 20);
	const UpgradeMission_1 = __webpack_require__(/*! ../missions/UpgradeMission */ 19);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	const SeedAnalysis_1 = __webpack_require__(/*! ../SeedAnalysis */ 40);
	const MasonMission_1 = __webpack_require__(/*! ../missions/MasonMission */ 41);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const BodyguardMission_1 = __webpack_require__(/*! ../missions/BodyguardMission */ 25);
	const RemoteBuildMission_1 = __webpack_require__(/*! ../missions/RemoteBuildMission */ 23);
	const GEO_SPAWN_COST = 5000;
	class ControllerOperation extends Operation_1.Operation {
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.OwnedRoom;
	        if (this.flag.room && this.flag.room.controller.level < 6) {
	            this.priority = constants_1.OperationPriority.VeryHigh;
	        }
	    }
	    initOperation() {
	        this.autoLayout();
	        if (!this.flag.room)
	            return; // TODO: remote revival
	        // initOperation FortOperation variables
	        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
	        if (!this.spawnGroup) {
	            this.spawnGroup = this.findBackupSpawn();
	            if (!this.spawnGroup)
	                return;
	            this.addMission(new BodyguardMission_1.BodyguardMission(this));
	            this.addMission(new RemoteBuildMission_1.RemoteBuildMission(this, false));
	        }
	        this.empire.register(this.flag.room);
	        // spawn emergency miner if needed
	        this.addMission(new EmergencyMission_1.EmergencyMinerMission(this));
	        // refill spawning energy - will spawn small spawnCart if needed
	        this.addMission(new RefillMission_1.RefillMission(this));
	        this.addDefense();
	        if (this.memory.powerMining) {
	            this.addMission(new PowerMission_1.PowerMission(this));
	        }
	        // energy network
	        if (this.flag.room.terminal && this.flag.room.storage) {
	            this.addMission(new TerminalNetworkMission_1.TerminalNetworkMission(this));
	            this.addMission(new IgorMission_1.IgorMission(this));
	        }
	        // harvest energy
	        for (let i = 0; i < this.sources.length; i++) {
	            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0)
	                continue;
	            let source = this.sources[i];
	            if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
	                let link = source.findMemoStructure(STRUCTURE_LINK, 2);
	                if (link) {
	                    this.addMission(new LinkMiningMission_1.LinkMiningMission(this, "miner" + i, source, link));
	                    continue;
	                }
	            }
	            this.addMission(new MiningMission_1.MiningMission(this, "miner" + i, source));
	        }
	        // build construction
	        let buildMission = new BuildMission_1.BuildMission(this);
	        this.addMission(buildMission);
	        if (this.flag.room.storage) {
	            // use link array near storage to fire energy at controller link (pre-rcl8)
	            this.addMission(new LinkNetworkMission_1.LinkNetworkMission(this));
	            // mine minerals
	            this.addMission(new GeologyMission_1.GeologyMission(this));
	        }
	        // upgrader controller
	        let boostUpgraders = this.flag.room.controller.level < 8;
	        let upgradeMission = new UpgradeMission_1.UpgradeMission(this, boostUpgraders);
	        this.addMission(upgradeMission);
	        // repair walls
	        this.addMission(new MasonMission_1.MasonMission(this));
	        this.towerRepair();
	        if (this.flag.room.controller.level < 6) {
	            let boostSpawnGroup = this.findRemoteSpawn(4);
	            if (boostSpawnGroup) {
	                upgradeMission.setSpawnGroup(boostSpawnGroup);
	                buildMission.setSpawnGroup(boostSpawnGroup);
	            }
	        }
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	        this.memory.masonPotency = undefined;
	        this.memory.builderPotency = undefined;
	    }
	    nuke(x, y, roomName) {
	        let nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_NUKER } }));
	        let outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
	        if (outcome === OK) {
	            this.empire.addNuke({ tick: Game.time, roomName: roomName });
	            return "NUKER: Bombs away! \\o/";
	        }
	        else {
	            return `NUKER: error: ${outcome}`;
	        }
	    }
	    addAllyRoom(roomName) {
	        if (_.includes(this.memory.network.scanData.roomNames, roomName)) {
	            return "NETWORK: " + roomName + " is already being scanned by " + this.name;
	        }
	        this.memory.network.scanData.roomNames.push(roomName);
	        this.empire.addAllyForts([roomName]);
	        return "NETWORK: added " + roomName + " to rooms scanned by " + this.name;
	    }
	    autoLayout() {
	        this.initWithSpawn();
	        if (!this.memory.centerPosition || this.memory.rotation === undefined)
	            return;
	        this.initAutoLayout();
	        this.buildLayout();
	    }
	    buildLayout() {
	        let structureTypes = Object.keys(CONSTRUCTION_COST);
	        if (this.memory.checkLayoutIndex === undefined || this.memory.checkLayoutIndex >= structureTypes.length) {
	            this.memory.checkLayoutIndex = 0;
	        }
	        let structureType = structureTypes[this.memory.checkLayoutIndex++];
	        this.fixedPlacement(structureType);
	        this.temporaryPlacement(this.flag.room.controller.level);
	    }
	    fixedPlacement(structureType) {
	        let controllerLevel = this.flag.room.controller.level;
	        let constructionPriority = controllerLevel * 10;
	        if (Object.keys(Game.constructionSites).length > constructionPriority)
	            return;
	        if (structureType === STRUCTURE_RAMPART && controllerLevel < 5)
	            return;
	        if (!this.memory.lastChecked)
	            this.memory.lastChecked = {};
	        if (Game.time - this.memory.lastChecked[structureType] < 1000)
	            return;
	        let coords = this.layoutCoords(structureType);
	        let allowedCount = this.allowedCount(structureType, controllerLevel);
	        for (let i = 0; i < coords.length; i++) {
	            if (i >= allowedCount)
	                break;
	            let coord = coords[i];
	            let position = helper_1.helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
	            let hasStructure = position.lookForStructure(structureType);
	            if (hasStructure)
	                continue;
	            let hasConstruction = position.lookFor(LOOK_CONSTRUCTION_SITES)[0];
	            if (hasConstruction)
	                continue;
	            let outcome = position.createConstructionSite(structureType);
	            if (outcome === OK) {
	                console.log(`LAYOUT: placing ${structureType} at ${position} (${this.name})`);
	            }
	            else {
	            }
	            return;
	        }
	        this.memory.lastChecked[structureType] = Game.time;
	    }
	    recalculateLayout(layoutType) {
	        if (!this.memory.seedData) {
	            let sourceData = [];
	            for (let source of this.flag.room.find(FIND_SOURCES)) {
	                sourceData.push({ pos: source.pos, amount: 3000 });
	            }
	            this.memory.seedData = {
	                sourceData: sourceData,
	                seedScan: {},
	                seedSelectData: undefined
	            };
	        }
	        let analysis = new SeedAnalysis_1.SeedAnalysis(this.flag.room, this.memory.seedData);
	        let results = analysis.run(this.staticStructures, layoutType);
	        if (results) {
	            let centerPosition = new RoomPosition(results.origin.x, results.origin.y, this.flag.room.name);
	            if (results.seedType === this.type) {
	                console.log(`${this.name} found best seed of type ${results.seedType}, initiating auto-layout`);
	                this.memory.centerPosition = centerPosition;
	                this.memory.rotation = results.rotation;
	            }
	            else {
	                console.log(`${this.name} found best seed of another type, replacing operation`);
	                let flagName = `${results.seedType}_${this.name}`;
	                Memory.flags[flagName] = { centerPosition: centerPosition, rotation: results.rotation };
	                this.flag.pos.createFlag(flagName, COLOR_GREY);
	                this.flag.remove();
	            }
	            this.memory.seedData = undefined; // clean-up memory
	        }
	        else {
	            console.log(`${this.name} could not find a suitable auto-layout, consider using another spawn location or room`);
	        }
	    }
	    allowedCount(structureType, level) {
	        if (level < 5 && (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_WALL)) {
	            return 0;
	        }
	        return Math.min(CONTROLLER_STRUCTURES[structureType][level], this.layoutCoords(structureType).length);
	    }
	    layoutCoords(structureType) {
	        if (this.staticStructures[structureType]) {
	            return this.staticStructures[structureType];
	        }
	        else if (this.memory.layoutMap && this.memory.layoutMap[structureType]) {
	            return this.memory.layoutMap[structureType];
	        }
	        else {
	            return [];
	        }
	    }
	    initWithSpawn() {
	        if (!this.memory.centerPosition || this.memory.rotation === undefined) {
	            let structureCount = this.flag.room.find(FIND_STRUCTURES).length;
	            if (structureCount === 1) {
	                this.recalculateLayout();
	            }
	            else if (structureCount > 1) {
	                this.recalculateLayout(this.type);
	            }
	            return;
	        }
	    }
	    towerRepair() {
	        let towers = this.flag.room.findStructures(STRUCTURE_TOWER);
	        if (towers.length === 0)
	            return;
	        if (Game.time % 4 === 0) {
	            // repair ramparts
	            let ramparts = this.flag.room.findStructures(STRUCTURE_RAMPART);
	            if (towers.length === 0 || ramparts.length === 0)
	                return;
	            let rampart = _(ramparts).sortBy("hits").head();
	            rampart.pos.findClosestByRange(towers).repair(rampart);
	        }
	        else if (Game.time % 4 === 2) {
	            // repair roads
	            let centerPosition = helper_1.helper.deserializeRoomPosition(this.memory.centerPosition);
	            let roadsInRange = centerPosition.findInRange(this.flag.room.findStructures(STRUCTURE_ROAD), this.memory.radius);
	            if (this.memory.roadRepairIndex === undefined || this.memory.roadRepairIndex >= roadsInRange.length) {
	                this.memory.roadRepairIndex = 0;
	            }
	            let road = roadsInRange[this.memory.roadRepairIndex++];
	            let repairsNeeded = Math.floor((road.hitsMax - road.hits) / 800);
	            if (repairsNeeded === 1) {
	                let tower = road.pos.findClosestByRange(towers);
	                tower.repair(road);
	            }
	            else if (repairsNeeded > 1) {
	                console.log(`significant road repair needed in ${this.name}, damage to road: ${road.hitsMax - road.hits}`);
	                towers = _.sortBy(towers, (t) => road.pos.getRangeTo(t));
	                for (let tower of towers) {
	                    repairsNeeded--;
	                    tower.repair(road);
	                    if (repairsNeeded === 0)
	                        break;
	                }
	            }
	        }
	    }
	    findRemoteSpawn(distanceLimit, levelRequirement = 8) {
	        let remoteSpawn = _(this.empire.spawnGroups)
	            .filter((s) => {
	            return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name) <= distanceLimit
	                && s.room.controller.level >= levelRequirement
	                && s.averageAvailability() > .3
	                && s.isAvailable;
	        })
	            .sortBy((s) => {
	            return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name);
	        })
	            .head();
	        return remoteSpawn;
	    }
	    findBackupSpawn() {
	        if (this.memory.backupSpawnRoom) {
	            let spawnGroup = this.empire.getSpawnGroup(this.memory.backupSpawnRoom);
	            if (spawnGroup) {
	                return spawnGroup;
	            }
	            else {
	                this.memory.backupSpawnRoom = undefined;
	            }
	        }
	        else {
	            let remoteSpawnGroup = this.findRemoteSpawn(6, 4);
	            if (remoteSpawnGroup) {
	                this.memory.backupSpawnRoom = remoteSpawnGroup.room.name;
	                return this.findBackupSpawn();
	            }
	        }
	    }
	}
	exports.ControllerOperation = ControllerOperation;


/***/ },
/* 40 */
/*!********************************!*\
  !*** ./src/ai/SeedAnalysis.ts ***!
  \********************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	class SeedAnalysis {
	    constructor(room, seedData) {
	        this.data = seedData;
	        this.room = room;
	    }
	    run(staticStructures, layoutType) {
	        let layoutTypes;
	        if (layoutType) {
	            layoutTypes = [layoutType];
	        }
	        else {
	            layoutTypes = ["quad", "flex"];
	        }
	        for (let type of layoutTypes) {
	            if (!this.data.seedScan[type]) {
	                this.findSeeds(type);
	            }
	            if (this.data.seedScan[type].length > 0) {
	                if (staticStructures) {
	                    let result = this.findByStructures(type, staticStructures);
	                    if (result)
	                        return result;
	                }
	                else {
	                    return this.selectSeed(type, this.data.seedScan[type]);
	                }
	            }
	        }
	        console.log(`No viable seeds in ${this.room.name}`);
	    }
	    findSeeds(seedType) {
	        let radius;
	        let wallMargin;
	        let taper;
	        if (seedType === "quad") {
	            radius = 6;
	            wallMargin = 0;
	            taper = 1;
	        }
	        else if (seedType === "flex") {
	            radius = 4;
	            wallMargin = 1;
	            taper = 4;
	        }
	        let requiredWallOffset = 2;
	        let totalMargin = requiredWallOffset + radius + wallMargin;
	        if (!this.data.seedScan[seedType]) {
	            console.log(`AUTO: initiating seed scan: ${seedType}`);
	            this.data.seedScan[seedType] = [];
	        }
	        let indexX = totalMargin;
	        while (indexX <= 49 - totalMargin) {
	            let indexY = totalMargin;
	            while (indexY <= 49 - totalMargin) {
	                let area = this.room.lookForAtArea(LOOK_TERRAIN, indexY - radius, indexX - radius, indexY + radius, indexX + radius);
	                let foundSeed = this.checkArea(indexX, indexY, radius, taper, area);
	                if (foundSeed) {
	                    this.data.seedScan[seedType].push({ x: indexX, y: indexY });
	                }
	                indexY++;
	            }
	            indexX++;
	        }
	        console.log(`found ${this.data.seedScan[seedType].length} ${seedType} seeds`);
	        if (this.data.seedScan[seedType].length > 0) {
	            this.data.seedScan[seedType] = _.sortBy(this.data.seedScan[seedType], (c) => {
	                // sort by distance to controller
	                return this.room.controller.pos.getRangeTo(new RoomPosition(c.x, c.y, this.room.name));
	            });
	        }
	    }
	    checkArea(xOrigin, yOrigin, radius, taper, area) {
	        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
	            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
	                if (Math.abs(xDelta) + Math.abs(yDelta) > radius * 2 - taper)
	                    continue;
	                if (area[yOrigin + yDelta][xOrigin + xDelta][0] === "wall") {
	                    console.log(`x: ${xOrigin} y: ${yOrigin} disqualified due to wall at ${xOrigin + xDelta}, ${yOrigin + yDelta}`);
	                    return false;
	                }
	            }
	        }
	        // check source proximity
	        let originPosition = new RoomPosition(xOrigin, yOrigin, this.room.name);
	        for (let source of this.room.find(FIND_SOURCES)) {
	            if (originPosition.inRangeTo(source, radius + 2)) {
	                return false;
	            }
	        }
	        return true;
	    }
	    selectSeed(seedType, seeds) {
	        let storageDelta;
	        if (seedType === "quad") {
	            storageDelta = { x: 0, y: 4 };
	        }
	        else if (seedType === "flex") {
	            storageDelta = { x: 0, y: -3 };
	        }
	        else {
	            console.log("unrecognized seed type");
	            return;
	        }
	        if (!this.data.seedSelectData) {
	            this.data.seedSelectData = {
	                index: 0,
	                rotation: 0,
	                best: { seedType: seedType, origin: undefined, rotation: undefined, energyPerDistance: 0 }
	            };
	        }
	        let data = this.data.seedSelectData;
	        if (data.rotation > 3) {
	            data.index++;
	            data.rotation = 0;
	        }
	        if (data.index >= seeds.length) {
	            if (data.best.origin) {
	                console.log(`${this.room.name} determined best seed, ${data.best.seedType} at ${data.best.origin.x},${data.best.origin.y} with rotation ${data.rotation}`);
	                this.data.seedSelectData = undefined;
	                return data.best;
	            }
	            else {
	                console.log(`unable to find suitable seed selection in ${this.room.name}`);
	            }
	        }
	        let storagePosition = helper_1.helper.coordToPosition(storageDelta, new RoomPosition(seeds[data.index].x, seeds[data.index].y, this.room.name), data.rotation);
	        let energyPerDistance = 0;
	        for (let sourceDatum of this.data.sourceData) {
	            let sourcePosition = helper_1.helper.deserializeRoomPosition(sourceDatum.pos);
	            let ret = PathFinder.search(storagePosition, [{ pos: sourcePosition, range: 1 }], {
	                swampCost: 1,
	                maxOps: 4000,
	            });
	            let pathLength = 100;
	            if (!ret.incomplete) {
	                pathLength = Math.max(ret.path.length, 50);
	            }
	            energyPerDistance += sourceDatum.amount / pathLength;
	        }
	        if (energyPerDistance > data.best.energyPerDistance) {
	            console.log(`${this.room.name} found better seed, energyPerDistance: ${energyPerDistance}`);
	            data.best = { seedType: seedType, origin: seeds[data.index], rotation: data.rotation,
	                energyPerDistance: energyPerDistance };
	        }
	        // update rotation for next tick
	        data.rotation++;
	    }
	    findBySpawn(seedType, spawn) {
	        let spawnCoords;
	        if (seedType === "quad") {
	            spawnCoords = [{ x: 2, y: 0 }, { x: 0, y: -2 }, { x: -2, y: 0 }];
	        }
	        else {
	            spawnCoords = [{ x: -2, y: 1 }, { x: -1, y: 2 }, { x: 0, y: 3 }];
	        }
	        let seeds = this.data.seedScan[seedType];
	        for (let seed of seeds) {
	            let centerPosition = new RoomPosition(seed.x, seed.y, this.room.name);
	            for (let coord of spawnCoords) {
	                for (let rotation = 0; rotation <= 3; rotation++) {
	                    let testPosition = helper_1.helper.coordToPosition(coord, centerPosition, rotation);
	                    if (spawn.pos.inRangeTo(testPosition, 0)) {
	                        console.log(`seed: ${JSON.stringify(seed)}, centerPos: ${centerPosition}, rotation: ${rotation},` +
	                            `\ncoord: ${JSON.stringify(coord)} testPos: ${testPosition}, spawnPos: ${spawn.pos}`);
	                        return { seedType: seedType, origin: seed, rotation: rotation, energyPerDistance: undefined };
	                    }
	                }
	            }
	        }
	    }
	    findByStructures(seedType, staticStructures) {
	        let mostHits = 0;
	        let bestSeed;
	        let bestRotation;
	        let seeds = this.data.seedScan[seedType];
	        for (let seed of seeds) {
	            let centerPosition = new RoomPosition(seed.x, seed.y, this.room.name);
	            for (let rotation = 0; rotation <= 3; rotation++) {
	                let structureHits = 0;
	                for (let structureType of [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_LAB, STRUCTURE_TERMINAL]) {
	                    let coords = staticStructures[structureType];
	                    for (let coord of coords) {
	                        let testPosition = helper_1.helper.coordToPosition(coord, centerPosition, rotation);
	                        if (testPosition.lookForStructure(structureType)) {
	                            structureHits++;
	                        }
	                    }
	                }
	                if (structureHits > mostHits) {
	                    mostHits = structureHits;
	                    bestSeed = seed;
	                    bestRotation = rotation;
	                }
	            }
	        }
	        if (mostHits > 0) {
	            return { seedType: seedType, origin: bestSeed, rotation: bestRotation, energyPerDistance: undefined };
	        }
	    }
	}
	exports.SeedAnalysis = SeedAnalysis;


/***/ },
/* 41 */
/*!*****************************************!*\
  !*** ./src/ai/missions/MasonMission.ts ***!
  \*****************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Mission_1 = __webpack_require__(/*! ./Mission */ 9);
	const MIN_RAMPART_HITS = 5000000;
	class MasonMission extends Mission_1.Mission {
	    constructor(operation) {
	        super(operation, "mason");
	    }
	    initMission() {
	        if (!this.memory.needMason) {
	            if (this.room.controller.level < 8) {
	                this.memory.needMason = false;
	            }
	            else {
	                let lowestRampart = _(this.room.findStructures(STRUCTURE_RAMPART)).sortBy("hits").head();
	                this.memory.needMason = lowestRampart && lowestRampart.hits < MIN_RAMPART_HITS;
	            }
	        }
	    }
	    roleCall() {
	        let max = 0;
	        if (this.memory.needMason) {
	            max = 1;
	        }
	        this.masons = this.headCount("mason", () => this.workerBody(20, 8, 7), max);
	    }
	    missionActions() {
	        for (let mason of this.masons) {
	            this.masonActions(mason);
	        }
	    }
	    finalizeMission() {
	    }
	    invalidateMissionCache() {
	        this.memory.needMason = undefined;
	    }
	    masonActions(mason) {
	        let rampart = this.findMasonTarget(mason);
	        let range = mason.pos.getRangeTo(rampart);
	        if (rampart && range <= 3) {
	            mason.repair(rampart);
	        }
	        if (mason.carry.energy < mason.carryCapacity * .25) {
	            mason.memory.hasLoad = false;
	        }
	        let hasLoad = this.masonHasLoad(mason);
	        if (hasLoad) {
	            if (rampart) {
	                if (range > 3) {
	                    mason.blindMoveTo(rampart);
	                }
	                else {
	                    this.findMasonPosition(mason, rampart);
	                }
	            }
	        }
	        else {
	            let extension = this.findFullExtension(mason);
	            if (extension) {
	                if (mason.pos.isNearTo(extension)) {
	                    mason.withdraw(extension, RESOURCE_ENERGY);
	                }
	                else {
	                    mason.blindMoveTo(extension);
	                }
	            }
	            else {
	                mason.idleOffRoad(this.flag);
	            }
	        }
	    }
	    findMasonTarget(mason) {
	        let findRampart = () => {
	            let lowestHits = 100000;
	            let lowestRampart = _(this.room.findStructures(STRUCTURE_RAMPART)).sortBy("hits").head();
	            if (lowestRampart) {
	                lowestHits = lowestRampart.hits;
	            }
	            let myRampart = _(this.room.findStructures(STRUCTURE_RAMPART))
	                .filter((s) => s.hits < lowestHits + 100000)
	                .sortBy((s) => mason.pos.getRangeTo(s))
	                .head();
	            if (myRampart)
	                return myRampart;
	        };
	        let forgetRampart = (s) => mason.ticksToLive % 300 === 0;
	        return mason.rememberStructure(findRampart, forgetRampart, "rampartId");
	    }
	    findFullExtension(mason) {
	        let findExtension = () => {
	            let fullExtensions = _.filter(this.room.findStructures(STRUCTURE_EXTENSION), (e) => e.energy > 0);
	            return mason.pos.findClosestByRange(fullExtensions);
	        };
	        let forgetExtension = (extension) => extension.energy === 0;
	        return mason.rememberStructure(findExtension, forgetExtension, "extensionId");
	    }
	    findMasonPosition(mason, rampart) {
	        if (mason.pos.lookForStructure(STRUCTURE_ROAD)) {
	            let position = rampart.pos;
	            if (position.lookFor(LOOK_STRUCTURES).length > 1) {
	                for (let direction = 1; direction <= 8; direction++) {
	                    let testPosition = position.getPositionAtDirection(direction);
	                    if (testPosition.isPassible() && !testPosition.lookForStructure(STRUCTURE_ROAD)) {
	                        position = testPosition;
	                        break;
	                    }
	                }
	            }
	            if (!mason.pos.inRangeTo(position, 0)) {
	                mason.blindMoveTo(position);
	            }
	        }
	    }
	    masonHasLoad(mason) {
	        if (mason.memory.hasLoad && mason.carry.energy <= mason.carryCapacity * .25) {
	            mason.memory.hasLoad = false;
	        }
	        else if (!mason.memory.hasLoad && mason.carry.energy >= mason.carryCapacity * .9) {
	            mason.memory.hasLoad = true;
	        }
	        return mason.memory.hasLoad;
	    }
	}
	exports.MasonMission = MasonMission;


/***/ },
/* 42 */
/*!********************************************!*\
  !*** ./src/ai/operations/AutoOperation.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const Operation_1 = __webpack_require__(/*! ./Operation */ 7);
	const SeedAnalysis_1 = __webpack_require__(/*! ../SeedAnalysis */ 40);
	const constants_1 = __webpack_require__(/*! ../../config/constants */ 4);
	const ScoutMission_1 = __webpack_require__(/*! ../missions/ScoutMission */ 22);
	const MAX_SOURCE_DISTANCE = 100;
	const PATHFINDER_RANGE_ALLOWANCE = 20;
	class AutoOperation extends Operation_1.Operation {
	    /**
	     * Experimental operation for making decisions about room layout. Eventually this will be a process that happens
	     * automatically and the code will be part of a Mission rather than Operation.
	     * @param flag
	     * @param name
	     * @param type
	     * @param empire
	     */
	    constructor(flag, name, type, empire) {
	        super(flag, name, type, empire);
	        this.priority = constants_1.OperationPriority.OwnedRoom;
	    }
	    initOperation() {
	        this.spawnGroup = this.getRemoteSpawnGroup();
	        if (!this.spawnGroup)
	            return;
	        this.addMission(new ScoutMission_1.ScoutMission(this));
	        if (!this.flag.room)
	            return;
	        this.autoLayout();
	    }
	    finalizeOperation() {
	    }
	    invalidateOperationCache() {
	    }
	    autoLayout() {
	        if (this.memory.seedSelection)
	            return;
	        if (!this.memory.seedData)
	            this.memory.seedData = {
	                sourceData: undefined,
	                seedScan: {},
	                seedSelectData: undefined,
	            };
	        if (this.memory.seedData.sourceData) {
	            let analysis = new SeedAnalysis_1.SeedAnalysis(this.flag.room, this.memory.seedData);
	            this.memory.seedSelection = analysis.run();
	        }
	        else {
	            this.memory.didWalkabout = this.doWalkabout();
	        }
	    }
	    doWalkabout() {
	        if (!this.memory.walkaboutProgress) {
	            this.memory.walkaboutProgress = {
	                roomsInRange: undefined,
	                sourceData: [],
	            };
	        }
	        let progress = this.memory.walkaboutProgress;
	        if (!progress.roomsInRange) {
	            progress.roomsInRange = this.findRoomsToCheck(this.flag.room.name);
	        }
	        if (progress.roomsInRange.length > 0) {
	            let roomName = progress.roomsInRange[0];
	            if (Game.rooms[roomName]) {
	                let sources = Game.rooms[roomName].find(FIND_SOURCES);
	                let sourceData = [];
	                let allSourcesReasonable = true;
	                for (let source of sources) {
	                    let reasonablePathDistance = this.checkReasonablePathDistance(source);
	                    if (!reasonablePathDistance) {
	                        allSourcesReasonable = false;
	                        break;
	                    }
	                    sourceData.push({ pos: source.pos, amount: Math.min(SOURCE_ENERGY_CAPACITY, source.energyCapacity) });
	                }
	                if (allSourcesReasonable) {
	                    console.log(`found ${sourceData.length} reasonable sources in ${roomName}`);
	                    progress.sourceData = progress.sourceData.concat(sourceData);
	                }
	                _.pull(progress.roomsInRange, roomName);
	            }
	            else {
	                let walkaboutCreep = Game.creeps[this.name + "_walkabout"];
	                if (walkaboutCreep) {
	                    if (Game.time % 10 === 0) {
	                        console.log(`${this.name} walkabout creep is visiting ${roomName}`);
	                    }
	                    walkaboutCreep.avoidSK({ pos: new RoomPosition(25, 25, roomName) });
	                }
	                else {
	                    this.spawnGroup.spawn([MOVE], this.name + "_walkabout", undefined, undefined);
	                }
	            }
	            return false;
	        }
	        this.memory.seedData.sourceData = progress.sourceData;
	        this.memory.walkaboutProgress = undefined;
	        return true;
	    }
	    findRoomsToCheck(origin) {
	        let roomsToCheck = [origin];
	        let roomsAlreadyChecked = [origin];
	        let roomsInRange = [];
	        while (roomsToCheck.length > 0) {
	            let nextRoom = roomsToCheck.pop();
	            let inRange = Game.map.getRoomLinearDistance(origin, nextRoom) <= 1;
	            if (!inRange)
	                continue;
	            roomsInRange.push(nextRoom);
	            let exits = Game.map.describeExits(nextRoom);
	            for (let direction in exits) {
	                let roomName = exits[direction];
	                if (_.include(roomsAlreadyChecked, roomName))
	                    continue;
	                roomsAlreadyChecked.push(nextRoom);
	                if (_.include(roomsToCheck, roomName))
	                    continue;
	                roomsToCheck.push(roomName);
	            }
	        }
	        return roomsInRange;
	    }
	    checkReasonablePathDistance(source) {
	        let ret = PathFinder.search(source.pos, [{ pos: new RoomPosition(25, 25, this.flag.room.name), range: PATHFINDER_RANGE_ALLOWANCE }], {
	            maxOps: 10000,
	        });
	        if (ret.incomplete) {
	            console.log("checkReasonablePathDistance return value incomplete");
	            return false;
	        }
	        else {
	            return ret.path.length <= MAX_SOURCE_DISTANCE - PATHFINDER_RANGE_ALLOWANCE;
	        }
	    }
	    /**
	     * Place flags to show which positions (seeds) are being used for further analysis
	     * @param seedType
	     * @param show
	     * @returns {string}
	     */
	    debugSeeds(seedType, show) {
	        if (show) {
	            let flag = Game.flags[`${this.name}_${seedType}_0`];
	            if (flag)
	                return `first remove flags: ${this.name}.debugSeeds("${seedType}", false)`;
	            if (!this.memory.seedData.seedScan || !this.memory.seedData.seedScan[seedType]) {
	                return `there is no data for ${seedType}`;
	            }
	            for (let i = 0; i < this.memory.seedData.seedScan[seedType].length; i++) {
	                let coord = this.memory.seedData.seedScan[seedType][i];
	                new RoomPosition(coord.x, coord.y, this.flag.room.name).createFlag(`${this.name}_${seedType}_${i}`, COLOR_GREY);
	            }
	        }
	        else {
	            for (let i = 0; i < 2500; i++) {
	                let flag = Game.flags[`${this.name}_${seedType}_${i}`];
	                if (flag)
	                    flag.remove();
	                else
	                    break;
	            }
	        }
	    }
	}
	exports.AutoOperation = AutoOperation;


/***/ },
/* 43 */
/*!********************************************!*\
  !*** ./src/ai/operations/FlexOperation.ts ***!
  \********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const ControllerOperation_1 = __webpack_require__(/*! ./ControllerOperation */ 39);
	const FlexGenerator_1 = __webpack_require__(/*! ../FlexGenerator */ 44);
	const DefenseMission_1 = __webpack_require__(/*! ../missions/DefenseMission */ 11);
	const helper_1 = __webpack_require__(/*! ../../helpers/helper */ 5);
	class FlexOperation extends ControllerOperation_1.ControllerOperation {
	    constructor() {
	        super(...arguments);
	        this.staticStructures = {
	            [STRUCTURE_STORAGE]: [{ x: 0, y: -3 }],
	            [STRUCTURE_TERMINAL]: [{ x: -2, y: -1 }],
	            [STRUCTURE_SPAWN]: [{ x: -2, y: 1 }, { x: -1, y: 2 }, { x: 0, y: 3 }],
	            [STRUCTURE_NUKER]: [{ x: 3, y: 0 }],
	            [STRUCTURE_POWER_SPAWN]: [{ x: -3, y: 0 }],
	            [STRUCTURE_LAB]: [
	                { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 },
	                { x: 1, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 },
	                { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: -1 }, { x: -1, y: 1 },
	            ],
	        };
	    }
	    addDefense() {
	        this.addMission(new DefenseMission_1.DefenseMission(this));
	    }
	    temporaryPlacement(level) {
	        if (!this.memory.temporaryPlacement)
	            this.memory.temporaryPlacement = {};
	        if (!this.memory.temporaryPlacement[level]) {
	            let actions = [];
	            // links
	            if (level === 5) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 2, y: -1 } });
	            }
	            if (level === 6) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 1, y: -1 } });
	            }
	            if (level === 7) {
	                actions.push({ actionType: "place", structureType: STRUCTURE_LINK, coord: { x: 0, y: -1 } });
	            }
	            if (level === 8) {
	                actions.push({ actionType: "remove", structureType: STRUCTURE_LINK, coord: { x: 1, y: -1 } });
	                actions.push({ actionType: "remove", structureType: STRUCTURE_LINK, coord: { x: 0, y: -1 } });
	            }
	            for (let action of actions) {
	                let outcome;
	                let position = helper_1.helper.coordToPosition(action.coord, this.memory.centerPosition, this.memory.rotation);
	                if (action.actionType === "place") {
	                    outcome = position.createConstructionSite(action.structureType);
	                }
	                else {
	                    let structure = position.lookForStructure(action.structureType);
	                    if (structure) {
	                        outcome = structure.destroy();
	                    }
	                    else {
	                        outcome = "noStructure";
	                    }
	                }
	                if (outcome === OK) {
	                    console.log(`LAYOUT: ${action.actionType}d temporary ${action.structureType} (${this.name}, level: ${level})`);
	                }
	                else {
	                    console.log(`LAYOUT: problem with temp placement, please follow up in ${this.name}`);
	                    console.log(`tried to ${action.actionType} ${action.structureType} at level ${level}, outcome: ${outcome}`);
	                }
	            }
	            this.memory.temporaryPlacement[level] = true;
	        }
	    }
	    initAutoLayout() {
	        if (!this.memory.layoutMap) {
	            if (this.memory.flexLayoutMap) {
	                // temporary patch for variable identifier change
	                this.memory.layoutMap = this.memory.flexLayoutMap;
	                this.memory.radius = this.memory.flexRadius;
	            }
	            else {
	                let map = new FlexGenerator_1.FlexGenerator(this.memory.centerPosition, this.memory.rotation, this.staticStructures);
	                this.memory.layoutMap = map.generate(true);
	                this.memory.radius = map.radius + 1;
	            }
	        }
	    }
	}
	exports.FlexOperation = FlexOperation;


/***/ },
/* 44 */
/*!*********************************!*\
  !*** ./src/ai/FlexGenerator.ts ***!
  \*********************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	class FlexGenerator {
	    constructor(centerPosition, rotation, staticStructures) {
	        this.leftMost = 0;
	        this.rightMost = 0;
	        this.topMost = 0;
	        this.bottomMost = 0;
	        this.radius = 0;
	        this.remaining = {
	            [STRUCTURE_TOWER]: 6,
	            [STRUCTURE_EXTENSION]: 60,
	            [STRUCTURE_OBSERVER]: 1,
	        };
	        this.map = {};
	        this.roadPositions = [];
	        this.noRoadAccess = [];
	        this.recheckCount = 0;
	        if (!(centerPosition instanceof RoomPosition)) {
	            centerPosition = helper_1.helper.deserializeRoomPosition(centerPosition);
	        }
	        this.centerPosition = centerPosition;
	        this.roomName = centerPosition.roomName;
	        this.rotation = rotation;
	        this.leftMost = centerPosition.x;
	        this.rightMost = centerPosition.x;
	        this.topMost = centerPosition.y;
	        this.bottomMost = centerPosition.y;
	        this.coreStructureCoordinates = staticStructures;
	    }
	    generate(debug) {
	        let room = Game.rooms[this.roomName];
	        if (!room)
	            return;
	        this.addFixedStructuresToMap();
	        this.addUsingExpandingRadius();
	        this.addWalls();
	        if (debug)
	            this.debugMap();
	        return this.generateCoords();
	    }
	    addFixedStructuresToMap() {
	        this.coreStructureCoordinates[STRUCTURE_ROAD] = [
	            { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: -1, y: -1 }, { x: -2, y: -2 },
	            { x: -2, y: 0 }, { x: 0, y: -2 }, { x: 0, y: -4 }, { x: 1, y: -3 }, { x: 2, y: -2 },
	            { x: 3, y: -1 }, { x: 4, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 4 },
	            { x: -1, y: 3 }, { x: -3, y: 1 }, { x: -4, y: 0 }, { x: -3, y: -1 }, { x: -1, y: -3 },
	        ];
	        this.coreStructureCoordinates["empty"] = [
	            { x: -1, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -1 }
	        ];
	        for (let structureType in this.coreStructureCoordinates) {
	            let coords = this.coreStructureCoordinates[structureType];
	            for (let coord of coords) {
	                let position = helper_1.helper.coordToPosition(coord, this.centerPosition, this.rotation);
	                this.addStructurePosition(position, structureType);
	            }
	        }
	    }
	    addUsingExpandingRadius() {
	        let iterations = 0;
	        while (_.sum(this.remaining) > 0 && iterations < 100) {
	            iterations++;
	            for (let xDelta = -this.radius; xDelta <= this.radius; xDelta++) {
	                let x = this.centerPosition.x + xDelta;
	                if (x < 3 || x > 46) {
	                    continue;
	                }
	                for (let yDelta = -this.radius; yDelta <= this.radius; yDelta++) {
	                    // only consider points on perimeter of gradually expanding rectangle
	                    if (Math.abs(yDelta) !== this.radius && Math.abs(xDelta) !== this.radius)
	                        continue;
	                    let y = this.centerPosition.y + yDelta;
	                    if (y < 3 || y > 46) {
	                        continue;
	                    }
	                    let position = new RoomPosition(x, y, this.roomName);
	                    if (position.lookFor(LOOK_TERRAIN)[0] === "wall")
	                        continue;
	                    this.addRemaining(xDelta, yDelta);
	                }
	            }
	            this.radius++;
	        }
	        if (iterations === 100) {
	            console.log("WARNING: layout process entered endless loop, life is terrible, give up all hope");
	        }
	    }
	    addRemaining(xDelta, yDelta, save = true) {
	        let x = this.centerPosition.x + xDelta;
	        let y = this.centerPosition.y + yDelta;
	        let alreadyUsed = this.checkIfUsed(x, y);
	        if (alreadyUsed)
	            return;
	        let position = new RoomPosition(x, y, this.roomName);
	        if (position.inRangeTo(position.findClosestByRange(FIND_SOURCES), 2))
	            return;
	        if (position.inRangeTo(Game.rooms[this.roomName].controller, 2))
	            return;
	        if (position.isNearTo(position.findClosestByRange(this.roadPositions))) {
	            let structureType = this.findStructureType(xDelta, yDelta);
	            if (structureType) {
	                this.addStructurePosition(position, structureType);
	                this.remaining[structureType]--;
	            }
	        }
	        else if (save) {
	            this.noRoadAccess.push({ x: xDelta, y: yDelta });
	        }
	    }
	    recheckNonAccess() {
	        if (this.recheckCount > 100)
	            return;
	        this.recheckCount++;
	        console.log("rechecking" + this.recheckCount, this.noRoadAccess.length);
	        for (let coord of this.noRoadAccess) {
	            this.addRemaining(coord.x, coord.y, false);
	        }
	    }
	    checkIfUsed(x, y) {
	        return this.map[x] !== undefined && this.map[x][y] !== undefined;
	    }
	    addStructurePosition(pos, structureType, overwrite = false) {
	        if (!this.map[pos.x])
	            this.map[pos.x] = {};
	        let existingStructureType = this.map[pos.x][pos.y];
	        if (existingStructureType) {
	            if (overwrite) {
	                this.remaining[existingStructureType]++;
	            }
	            else {
	                return;
	            }
	        }
	        if (structureType === STRUCTURE_ROAD) {
	            this.roadPositions.push(pos);
	            this.recheckNonAccess();
	        }
	        else if (structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL) {
	            if (pos.x < this.leftMost) {
	                this.leftMost = pos.x;
	            }
	            if (pos.x > this.rightMost) {
	                this.rightMost = pos.x;
	            }
	            if (pos.y < this.topMost) {
	                this.topMost = pos.y;
	            }
	            if (pos.y > this.bottomMost) {
	                this.bottomMost = pos.y;
	            }
	        }
	        this.map[pos.x][pos.y] = structureType;
	    }
	    findStructureType(xDelta, yDelta) {
	        let isRoadCoord = this.checkValidRoadCoord(xDelta, yDelta);
	        if (isRoadCoord) {
	            return STRUCTURE_ROAD;
	        }
	        else {
	            for (let structureType in this.remaining) {
	                if (this.remaining[structureType]) {
	                    return structureType;
	                }
	            }
	        }
	    }
	    addWalls() {
	        // push edge by 1 to make room for walls
	        let leftWall = this.leftMost - 1;
	        let rightWall = this.rightMost + 1;
	        let topWall = this.topMost - 1;
	        let bottomWall = this.bottomMost + 1;
	        let allWallPositions = [];
	        let validWallPositions = [];
	        console.log(leftWall, rightWall, topWall, bottomWall);
	        // mark off matrix, natural walls are impassible, all other tiles get 1
	        let exitPositions = [];
	        let matrix = new PathFinder.CostMatrix();
	        let lastPositionWasExit = { left: false, right: false, top: false, bottom: false };
	        for (let x = 0; x < 50; x++) {
	            for (let y = 0; y < 50; y++) {
	                let currentBorder;
	                if (x === 0)
	                    currentBorder = "left";
	                else if (x === 49)
	                    currentBorder = "right";
	                else if (y === 0)
	                    currentBorder = "top";
	                else if (y === 49)
	                    currentBorder = "bottom";
	                let position = new RoomPosition(x, y, this.roomName);
	                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") {
	                    matrix.set(x, y, 0xff);
	                    if (currentBorder) {
	                        lastPositionWasExit[currentBorder] = false;
	                    }
	                }
	                else {
	                    matrix.set(x, y, 1);
	                    if (currentBorder) {
	                        if (!lastPositionWasExit[currentBorder]) {
	                            exitPositions.push(position);
	                        }
	                        lastPositionWasExit[currentBorder] = true;
	                    }
	                }
	            }
	        }
	        console.log(`LAYOUT: found ${exitPositions.length} exits to path from`);
	        // start with every wall position being valid around the border
	        for (let x = leftWall; x <= rightWall; x++) {
	            for (let y = topWall; y <= bottomWall; y++) {
	                if (x !== leftWall && x !== rightWall && y !== topWall && y !== bottomWall)
	                    continue;
	                let position = new RoomPosition(x, y, this.roomName);
	                if (position.lookFor(LOOK_TERRAIN)[0] === "wall")
	                    continue;
	                allWallPositions.push(position);
	                matrix.set(x, y, 0xff);
	            }
	        }
	        // send theoretical invaders at the center from each exit and remove the walls that don't make a
	        // difference on whether they reach the center
	        let centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
	        for (let wallPosition of allWallPositions) {
	            let breach = false;
	            matrix.set(wallPosition.x, wallPosition.y, 1);
	            for (let exitPosition of exitPositions) {
	                let ret = PathFinder.search(exitPosition, [{ pos: centerPosition, range: 0 }], {
	                    maxRooms: 1,
	                    roomCallback: (roomName) => {
	                        if (roomName === this.roomName) {
	                            return matrix;
	                        }
	                    }
	                });
	                if (!ret.incomplete && ret.path[ret.path.length - 1].inRangeTo(centerPosition, 0)) {
	                    breach = true;
	                    break;
	                }
	            }
	            if (breach) {
	                validWallPositions.push(wallPosition);
	                matrix.set(wallPosition.x, wallPosition.y, 0xff);
	            }
	            else {
	            }
	        }
	        for (let position of validWallPositions) {
	            this.addStructurePosition(position, STRUCTURE_RAMPART, true);
	        }
	        this.wallCount = validWallPositions.length;
	    }
	    generateCoords() {
	        let roomPositions = {};
	        for (let x in this.map) {
	            for (let y in this.map[x]) {
	                let structureType = this.map[x][y];
	                if (structureType !== STRUCTURE_ROAD && _.includes(Object.keys(this.coreStructureCoordinates), structureType))
	                    continue;
	                if (!roomPositions[structureType])
	                    roomPositions[structureType] = [];
	                roomPositions[structureType].push(new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.roomName));
	            }
	        }
	        let flexLayoutMap = {};
	        let centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
	        for (let structureType in roomPositions) {
	            let sortedByDistance = _.sortBy(roomPositions[structureType], (pos) => pos.getRangeTo(centerPosition));
	            flexLayoutMap[structureType] = [];
	            for (let position of sortedByDistance) {
	                let coord = helper_1.helper.positionToCoord(position, this.centerPosition, this.rotation);
	                flexLayoutMap[structureType].push(coord);
	            }
	        }
	        return flexLayoutMap;
	    }
	    checkValidRoadCoord(xDelta, yDelta) {
	        // creates the 5-cluster pattern for extensions/roads that you can see in my rooms
	        let combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
	        if (combinedDeviance % 2 !== 0) {
	            return false;
	        }
	        else if (xDelta % 2 === 0 && combinedDeviance % 4 !== 0) {
	            let pos = helper_1.helper.coordToPosition({ x: xDelta, y: yDelta }, this.centerPosition);
	            // check narrow passage due to natural walls
	            if (pos.getPositionAtDirection(2).lookFor(LOOK_TERRAIN)[0] === "wall"
	                && pos.getPositionAtDirection(6).lookFor(LOOK_TERRAIN)[0] === "wall") {
	                return true;
	            }
	            else if (pos.getPositionAtDirection(4).lookFor(LOOK_TERRAIN)[0] === "wall"
	                && pos.getPositionAtDirection(8).lookFor(LOOK_TERRAIN)[0] === "wall") {
	                return true;
	            }
	            return false;
	        }
	        else {
	            return true;
	        }
	    }
	    debugMap() {
	        for (let x in this.map) {
	            for (let y in this.map[x]) {
	                let structureType = this.map[x][y];
	                let position = new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.roomName);
	                let color = COLOR_WHITE;
	                if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN
	                    || structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_NUKER) {
	                    color = COLOR_YELLOW;
	                }
	                else if (structureType === STRUCTURE_TOWER) {
	                    color = COLOR_BLUE;
	                }
	                else if (structureType === STRUCTURE_LAB || structureType === STRUCTURE_TERMINAL) {
	                    color = COLOR_CYAN;
	                }
	                else if (structureType === STRUCTURE_POWER_SPAWN) {
	                    color = COLOR_RED;
	                }
	                else if (structureType === STRUCTURE_OBSERVER) {
	                    color = COLOR_BROWN;
	                }
	                else if (structureType === STRUCTURE_ROAD) {
	                    color = COLOR_GREY;
	                }
	                else if (structureType === STRUCTURE_RAMPART) {
	                    color = COLOR_GREEN;
	                }
	                position.createFlag("layout_" + x + y + structureType, color);
	            }
	        }
	    }
	}
	exports.FlexGenerator = FlexGenerator;


/***/ },
/* 45 */
/*!******************************************!*\
  !*** ./src/prototypes/initPrototypes.ts ***!
  \******************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	const initRoomPrototype_1 = __webpack_require__(/*! ./initRoomPrototype */ 46);
	const initRoomPositionPrototype_1 = __webpack_require__(/*! ./initRoomPositionPrototype */ 47);
	const initCreepPrototype_1 = __webpack_require__(/*! ./initCreepPrototype */ 48);
	function initPrototypes() {
	    initRoomPrototype_1.initRoomPrototype();
	    initRoomPositionPrototype_1.initRoomPositionPrototype();
	    initCreepPrototype_1.initCreepPrototype();
	    // misc prototype modifications
	    /**
	     * Will remember an instance of structureType that it finds within range, good for storing mining containers, etc.
	     * There should only be one instance of that structureType within range, per object
	     * @param structureType
	     * @param range
	     * @returns {T}
	     */
	    RoomObject.prototype.findMemoStructure = function (structureType, range) {
	        if (!this.room.memory[structureType])
	            this.room.memory[structureType] = {};
	        if (this.room.memory[structureType][this.id]) {
	            let structure = Game.getObjectById(this.room.memory[structureType][this.id]);
	            if (structure) {
	                return structure;
	            }
	            else {
	                this.room.memory[structureType][this.id] = undefined;
	            }
	        }
	        else if (Game.time % 10 === 7) {
	            let structures = _.filter(this.pos.findInRange(FIND_STRUCTURES, range), (s) => {
	                return s.structureType === structureType;
	            });
	            if (structures.length > 0) {
	                this.room.memory[structureType][this.id] = structures[0].id;
	            }
	        }
	    };
	    /**
	     * Looks for structure to be used as an energy holder for upgraders
	     * @returns { StructureLink | StructureStorage | StructureContainer }
	     */
	    StructureController.prototype.getBattery = function (structureType) {
	        if (this.room.memory.controllerBatteryId) {
	            let batt = Game.getObjectById(this.room.memory.controllerBatteryId);
	            if (batt) {
	                return batt;
	            }
	            else {
	                this.room.memory.controllerBatteryId = undefined;
	                this.room.memory.upgraderPositions = undefined;
	            }
	        }
	        else {
	            let battery = _(this.pos.findInRange(FIND_STRUCTURES, 4))
	                .filter((structure) => {
	                if (structureType) {
	                    return structure.structureType === structureType;
	                }
	                else {
	                    if (structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_LINK) {
	                        let sourceInRange = structure.pos.findInRange(FIND_SOURCES, 2)[0];
	                        if (sourceInRange)
	                            return false;
	                        else
	                            return true;
	                    }
	                }
	            })
	                .head();
	            if (battery) {
	                this.room.memory.controllerBatteryId = battery.id;
	                return battery;
	            }
	        }
	    };
	    /**
	     * Positions on which it is viable for an upgrader to stand relative to battery/controller
	     * @returns {Array}
	     */
	    StructureController.prototype.getUpgraderPositions = function () {
	        if (this.upgraderPositions) {
	            return this.upgraderPositions;
	        }
	        else {
	            if (this.room.memory.upgraderPositions) {
	                this.upgraderPositions = [];
	                for (let position of this.room.memory.upgraderPositions) {
	                    this.upgraderPositions.push(helper_1.helper.deserializeRoomPosition(position));
	                }
	                return this.upgraderPositions;
	            }
	            else {
	                let controller = this;
	                let battery = this.getBattery();
	                if (!battery) {
	                    return;
	                }
	                let positions = [];
	                for (let i = 1; i <= 8; i++) {
	                    let position = battery.pos.getPositionAtDirection(i);
	                    if (!position.isPassible(true) || !position.inRangeTo(controller, 3)
	                        || position.lookFor(LOOK_STRUCTURES).length > 0)
	                        continue;
	                    positions.push(position);
	                }
	                this.room.memory.upgraderPositions = positions;
	                return positions;
	            }
	        }
	    };
	    StructureObserver.prototype._observeRoom = StructureObserver.prototype.observeRoom;
	    StructureObserver.prototype.observeRoom = function (roomName, purpose = "unknown", override = false) {
	        if (this.currentPurpose && !override) {
	            return ERR_BUSY;
	        }
	        else {
	            this.room.memory.observation = { purpose: purpose, roomName: roomName };
	            this.currentPurpose = purpose;
	            return this._observeRoom(roomName);
	        }
	    };
	    Object.defineProperty(StructureObserver.prototype, "observation", {
	        get: function () {
	            if (this.room.memory.observation) {
	                let room = Game.rooms[this.room.memory.observation.roomName];
	                if (room) {
	                    return { purpose: this.room.memory.observation.purpose, room: room };
	                }
	                else {
	                    this.room.memory.observation = undefined;
	                }
	            }
	        }
	    });
	    StructureTerminal.prototype._send = StructureTerminal.prototype.send;
	    StructureTerminal.prototype.send = function (resourceType, amount, roomName, description) {
	        if (this.alreadySent) {
	            return ERR_BUSY;
	        }
	        else {
	            this.alreadySent = true;
	            return this._send(resourceType, amount, roomName, description);
	        }
	    };
	}
	exports.initPrototypes = initPrototypes;


/***/ },
/* 46 */
/*!*********************************************!*\
  !*** ./src/prototypes/initRoomPrototype.ts ***!
  \*********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	function initRoomPrototype() {
	    Object.defineProperty(Room.prototype, "hostiles", {
	        get: function myProperty() {
	            if (!Game.cache.hostiles[this.name]) {
	                let hostiles = this.find(FIND_HOSTILE_CREEPS);
	                let filteredHostiles = [];
	                for (let hostile of hostiles) {
	                    let username = hostile.owner.username;
	                    let isEnemy = helper_1.helper.checkEnemy(username, this.name);
	                    if (isEnemy) {
	                        filteredHostiles.push(hostile);
	                    }
	                }
	                Game.cache.hostiles[this.name] = filteredHostiles;
	            }
	            return Game.cache.hostiles[this.name];
	        }
	    });
	    Object.defineProperty(Room.prototype, "hostilesAndLairs", {
	        get: function myProperty() {
	            if (!Game.cache.hostilesAndLairs[this.name]) {
	                let lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair) => {
	                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
	                });
	                Game.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
	            }
	            return Game.cache.hostilesAndLairs[this.name];
	        }
	    });
	    Object.defineProperty(Room.prototype, "roomType", {
	        get: function myProperty() {
	            if (!this.memory.roomType) {
	                // source keeper
	                let lairs = this.findStructures(STRUCTURE_KEEPER_LAIR);
	                if (lairs.length > 0) {
	                    this.memory.roomType = constants_1.ROOMTYPE_SOURCEKEEPER;
	                }
	                // core
	                if (!this.memory.roomType) {
	                    let sources = this.find(FIND_SOURCES);
	                    if (sources.length === 3) {
	                        this.memory.roomType = constants_1.ROOMTYPE_CORE;
	                    }
	                }
	                // controller rooms
	                if (!this.memory.roomType) {
	                    if (this.controller) {
	                        this.memory.roomType = constants_1.ROOMTYPE_CONTROLLER;
	                    }
	                    else {
	                        this.memory.roomType = constants_1.ROOMTYPE_ALLEY;
	                    }
	                }
	            }
	            return this.memory.roomType;
	        }
	    });
	    /**
	     * Returns array of structures, caching results on a per-tick basis
	     * @param structureType
	     * @returns {Structure[]}
	     */
	    Room.prototype.findStructures = function (structureType) {
	        if (!Game.cache.structures[this.name]) {
	            Game.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s) => s.structureType);
	        }
	        return Game.cache.structures[this.name][structureType] || [];
	    };
	    /**
	     * Finds creeps and containers in room that will give up energy, primarily useful when a storage is not available
	     * Caches results on a per-tick basis. Useful before storage is available or in remote mining rooms.
	     * @param roomObject - When this optional argument is supplied, return closest source
	     * @returns {StructureContainer|Creep} - Returns source with highest amount of available energy, unless roomObject is
	     * supplied
	     */
	    Room.prototype.getAltBattery = function (roomObject) {
	        if (!this.altBatteries) {
	            let possibilities = [];
	            let containers = this.findStructures(STRUCTURE_CONTAINER);
	            if (this.controller && this.controller.getBattery() instanceof StructureContainer) {
	                _.pull(containers, this.controller.getBattery());
	            }
	            for (let container of containers) {
	                if (container.store.energy >= 50) {
	                    possibilities.push(container);
	                }
	            }
	            let creeps = this.find(FIND_MY_CREEPS, { filter: (c) => c.memory.donatesEnergy });
	            for (let creep of creeps) {
	                if (creep.carry.energy >= 50) {
	                    possibilities.push(creep);
	                }
	            }
	            if (this.terminal && this.terminal.store.energy >= 50) {
	                possibilities.push(this.terminal);
	            }
	            this.altBatteries = _.sortBy(possibilities, (p) => {
	                return p.store.energy;
	            });
	        }
	        if (roomObject) {
	            return roomObject.pos.findClosestByRange(this.altBatteries);
	        }
	        else {
	            return _.last(this.altBatteries);
	        }
	    };
	    /**
	     * Returns room coordinates for a given room
	     * @returns {*}
	     */
	    Object.defineProperty(Room.prototype, "coords", {
	        get: function myProperty() {
	            if (!this.memory.coordinates) {
	                this.memory.coordinates = helper_1.helper.getRoomCoordinates(this.name);
	            }
	            return this.memory.coordinates;
	        }
	    });
	}
	exports.initRoomPrototype = initRoomPrototype;


/***/ },
/* 47 */
/*!*****************************************************!*\
  !*** ./src/prototypes/initRoomPositionPrototype.ts ***!
  \*****************************************************/
/***/ function(module, exports) {

	"use strict";
	function initRoomPositionPrototype() {
	    RoomPosition.prototype.isNearExit = function (range) {
	        return this.x - range <= 0 || this.x + range >= 49 || this.y - range <= 0 || this.y + range >= 49;
	    };
	    RoomPosition.prototype.getFleeOptions = function (roomObject) {
	        let fleePositions = [];
	        let currentRange = this.getRangeTo(roomObject);
	        for (let i = 1; i <= 8; i++) {
	            let fleePosition = this.getPositionAtDirection(i);
	            if (fleePosition.x > 0 && fleePosition.x < 49 && fleePosition.y > 0 && fleePosition.y < 49) {
	                let rangeToHostile = fleePosition.getRangeTo(roomObject);
	                if (rangeToHostile > 0) {
	                    if (rangeToHostile < currentRange) {
	                        fleePosition["veryDangerous"] = true;
	                    }
	                    else if (rangeToHostile === currentRange) {
	                        fleePosition["dangerous"] = true;
	                    }
	                    fleePositions.push(fleePosition);
	                }
	            }
	        }
	        return fleePositions;
	    };
	    RoomPosition.prototype.bestFleePosition = function (hostile, ignoreRoads = false, swampRat = false) {
	        let options = [];
	        let fleeOptions = this.getFleeOptions(hostile);
	        for (let i = 0; i < fleeOptions.length; i++) {
	            let option = fleeOptions[i];
	            let terrain = option.lookFor(LOOK_TERRAIN)[0];
	            if (terrain !== "wall") {
	                let creepsInTheWay = option.lookFor(LOOK_CREEPS);
	                if (creepsInTheWay.length === 0) {
	                    let structures = option.lookFor(LOOK_STRUCTURES);
	                    let hasRoad = false;
	                    let impassible = false;
	                    for (let structure of structures) {
	                        if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
	                            // can't go through it
	                            impassible = true;
	                            break;
	                        }
	                        if (structure.structureType === STRUCTURE_ROAD) {
	                            hasRoad = true;
	                        }
	                    }
	                    if (!impassible) {
	                        let preference = 0;
	                        if (option.dangerous) {
	                            preference += 10;
	                        }
	                        else if (option.veryDangerous) {
	                            preference += 20;
	                        }
	                        if (hasRoad) {
	                            if (ignoreRoads) {
	                                preference += 2;
	                            }
	                            else {
	                                preference += 1;
	                            }
	                        }
	                        else if (terrain === "plain") {
	                            preference += 2;
	                        }
	                        else if (terrain === "swamp") {
	                            if (swampRat) {
	                                preference += 1;
	                            }
	                            else {
	                                preference += 5;
	                            }
	                        }
	                        options.push({ position: option, preference: preference });
	                    }
	                }
	            }
	        }
	        if (options.length > 0) {
	            options = _(options)
	                .shuffle()
	                .sortBy("preference")
	                .value();
	            return options[0].position;
	        }
	    };
	    /**
	     * Returns the nearest object to the current position based on the linear distance of rooms;
	     * @param roomObjects
	     * @returns {any}
	     */
	    RoomPosition.prototype.findClosestByRoomRange = function (roomObjects) {
	        if (roomObjects.length === 0)
	            return;
	        let sorted = _.sortBy(roomObjects, (s) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));
	        return _.head(sorted);
	    };
	    /**
	     * Returns the nearest object to the current position, works for objects that may not be in the same room;
	     * @param roomObjects
	     * @returns {any}
	     */
	    RoomPosition.prototype.findClosestByLongPath = function (roomObjects) {
	        if (roomObjects.length === 0)
	            return;
	        let sorted = _.sortBy(roomObjects, (s) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));
	        let closestLinearDistance = Game.map.getRoomLinearDistance(sorted[0].pos.roomName, this.roomName);
	        if (closestLinearDistance >= 5) {
	            return sorted[0];
	        }
	        let acceptableRange = closestLinearDistance + 1;
	        let filtered = _.filter(sorted, (s) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName) <= acceptableRange);
	        let bestPathLength = Number.MAX_VALUE;
	        let bestObject;
	        for (let roomObject of filtered) {
	            let results = PathFinder.search(this, { pos: roomObject.pos, range: 1 });
	            if (results.incomplete) {
	                console.log("findClosestByLongPath: object in", roomObject.pos.roomName, "was overlooked");
	                continue;
	            }
	            let pathLength = results.path.length;
	            if (pathLength < bestPathLength) {
	                bestObject = roomObject;
	                bestPathLength = pathLength;
	            }
	        }
	        return bestObject;
	    };
	    /**
	     * Returns all surrounding positions that are currently open
	     * @param ignoreCreeps - if true, will consider positions containing a creep to be open
	     * @returns {RoomPosition[]}
	     */
	    RoomPosition.prototype.openAdjacentSpots = function (ignoreCreeps) {
	        let positions = [];
	        for (let i = 1; i <= 8; i++) {
	            let testPosition = this.getPositionAtDirection(i);
	            if (testPosition.isPassible(ignoreCreeps)) {
	                // passed all tests
	                positions.push(testPosition);
	            }
	        }
	        return positions;
	    };
	    /**
	     * returns position at direction relative to this position
	     * @param direction
	     * @param range - optional, can return position with linear distance > 1
	     * @returns {RoomPosition}
	     */
	    RoomPosition.prototype.getPositionAtDirection = function (direction, range) {
	        if (!range) {
	            range = 1;
	        }
	        let x = this.x;
	        let y = this.y;
	        let room = this.roomName;
	        if (direction === 1) {
	            y -= range;
	        }
	        else if (direction === 2) {
	            y -= range;
	            x += range;
	        }
	        else if (direction === 3) {
	            x += range;
	        }
	        else if (direction === 4) {
	            x += range;
	            y += range;
	        }
	        else if (direction === 5) {
	            y += range;
	        }
	        else if (direction === 6) {
	            y += range;
	            x -= range;
	        }
	        else if (direction === 7) {
	            x -= range;
	        }
	        else if (direction === 8) {
	            x -= range;
	            y -= range;
	        }
	        return new RoomPosition(x, y, room);
	    };
	    /**
	     * Look if position is currently open/passible
	     * @param ignoreCreeps - if true, consider positions containing creeps to be open
	     * @returns {boolean}
	     */
	    RoomPosition.prototype.isPassible = function (ignoreCreeps) {
	        // look for walls
	        if (_.head(this.lookFor(LOOK_TERRAIN)) !== "wall") {
	            // look for creeps
	            if (ignoreCreeps || this.lookFor(LOOK_CREEPS).length === 0) {
	                // look for impassible structions
	                if (_.filter(this.lookFor(LOOK_STRUCTURES), (struct) => {
	                    return struct.structureType !== STRUCTURE_ROAD
	                        && struct.structureType !== STRUCTURE_CONTAINER
	                        && struct.structureType !== STRUCTURE_RAMPART;
	                }).length === 0) {
	                    // passed all tests
	                    return true;
	                }
	            }
	        }
	        return false;
	    };
	    /**
	     * @param structureType
	     * @returns {Structure} structure of type structureType that resides at position (null if no structure of that type is present)
	     */
	    RoomPosition.prototype.lookForStructure = function (structureType) {
	        let structures = this.lookFor(LOOK_STRUCTURES);
	        return _.find(structures, { structureType: structureType });
	    };
	    /**
	     *
	     */
	    RoomPosition.prototype.walkablePath = function (pos, ignoreRoads = false) {
	        let ret = PathFinder.search(this, { pos: pos, range: 1 }, {
	            maxOps: 3000,
	            plainCost: 2,
	            swampCost: 10,
	            roomCallback: (roomName) => {
	                let room = Game.rooms[roomName];
	                if (room) {
	                    if (!room.basicMatrix) {
	                        let costs = new PathFinder.CostMatrix();
	                        let structures = room.find(FIND_STRUCTURES);
	                        for (let structure of structures) {
	                            if (structure instanceof StructureRoad) {
	                                if (!ignoreRoads) {
	                                    costs.set(structure.pos.x, structure.pos.y, 1);
	                                }
	                            }
	                            else if (structure instanceof StructureRampart) {
	                                if (!structure.my) {
	                                    costs.set(structure.pos.x, structure.pos.y, 0xff);
	                                }
	                            }
	                            else if (structure.structureType !== STRUCTURE_CONTAINER) {
	                                costs.set(structure.pos.x, structure.pos.y, 0xff);
	                            }
	                        }
	                        room.basicMatrix = costs;
	                    }
	                    return room.basicMatrix;
	                }
	            }
	        });
	        if (ret.incomplete) {
	            console.log("ERROR: roomPosition.walkablePath(pos) PathFinding was incomplete, ops:", ret.ops);
	        }
	        else {
	            return ret.path;
	        }
	    };
	    RoomPosition.prototype.getPathDistanceTo = function (pos, ignoreRoads = false) {
	        let path = this.walkablePath(pos, ignoreRoads);
	        if (path) {
	            return path.length;
	        }
	        else {
	            return Game.map.getRoomLinearDistance(pos.roomName, this.roomName) * 50;
	        }
	    };
	}
	exports.initRoomPositionPrototype = initRoomPositionPrototype;


/***/ },
/* 48 */
/*!**********************************************!*\
  !*** ./src/prototypes/initCreepPrototype.ts ***!
  \**********************************************/
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	const constants_1 = __webpack_require__(/*! ../config/constants */ 4);
	const helper_1 = __webpack_require__(/*! ../helpers/helper */ 5);
	function initCreepPrototype() {
	    Creep.prototype.seekBoost = function (boosts, allowUnboosted) {
	        if (!boosts)
	            return true;
	        if (this.room.findStructures(STRUCTURE_LAB).length === 0)
	            return true;
	        let boosted = true;
	        for (let boost of boosts) {
	            if (this.memory[boost])
	                continue;
	            let requests = this.room.memory.boostRequests;
	            if (!requests) {
	                this.memory[boost] = true;
	                continue;
	            }
	            if (!requests[boost]) {
	                requests[boost] = { flagName: undefined, requesterIds: [] };
	            }
	            // check if already boosted
	            let boostedPart = _.find(this.body, { boost: boost });
	            if (boostedPart) {
	                this.memory[boost] = true;
	                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.id);
	                continue;
	            }
	            boosted = false;
	            if (!_.includes(requests[boost].requesterIds, this.id)) {
	                requests[boost].requesterIds.push(this.id);
	            }
	            if (this.spawning)
	                continue;
	            let flag = Game.flags[requests[boost].flagName];
	            if (!flag)
	                continue;
	            let lab = flag.pos.lookForStructure(STRUCTURE_LAB);
	            if (lab.mineralType === boost && lab.mineralAmount >= constants_1.IGOR_CAPACITY && lab.energy >= constants_1.IGOR_CAPACITY) {
	                if (this.pos.isNearTo(lab)) {
	                    lab.boostCreep(this);
	                }
	                else {
	                    this.blindMoveTo(lab);
	                    return false;
	                }
	            }
	            else if (allowUnboosted) {
	                console.log("BOOST: no boost for", this.name, " so moving on (allowUnboosted = true)");
	                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.id);
	                this.memory[boost] = true;
	            }
	            else {
	                if (Game.time % 10 === 0)
	                    console.log("BOOST: no boost for", this.name, " it will wait for some boost (allowUnboosted = false)");
	                this.idleOffRoad(this.room.storage);
	                return false;
	            }
	        }
	        return boosted;
	    };
	    Creep.prototype.fleeHostiles = function (pathFinding) {
	        if (!this.fleeObjects) {
	            let lairs = this.room.findStructures(STRUCTURE_KEEPER_LAIR);
	            let fleeObjects = lairs.length > 0 ? this.room.hostilesAndLairs : this.room.hostiles;
	            this.fleeObjects = _.filter(fleeObjects, (c) => {
	                if (c instanceof Creep) {
	                    return _.find(c.body, (part) => {
	                        return part.type === ATTACK || part.type === RANGED_ATTACK;
	                    }) !== null;
	                }
	                else {
	                    return true;
	                }
	            });
	        }
	        if (this.fleeObjects.length === 0)
	            return false;
	        let closest = this.pos.findClosestByRange(this.fleeObjects);
	        if (closest) {
	            let range = this.pos.getRangeTo(closest);
	            if (range < 3 && this.carry.energy > 0 && closest instanceof Creep) {
	                this.drop(RESOURCE_ENERGY);
	            }
	            let fleeRange = closest.owner.username === "Source Keeper" ? 5 : 8;
	            if (range < fleeRange) {
	                if (pathFinding) {
	                    this.fleeByPath(closest);
	                }
	                else {
	                    let fleePosition = this.pos.bestFleePosition(closest);
	                    if (fleePosition) {
	                        this.move(this.pos.getDirectionTo(fleePosition));
	                    }
	                }
	                return true;
	            }
	        }
	        return false;
	    };
	    Creep.prototype.fleeByPath = function (roomObject) {
	        let avoidPositions = _.map(this.pos.findInRange(this.room.hostiles, 5), (c) => { return { pos: c.pos, range: 10 }; });
	        let ret = PathFinder.search(this.pos, avoidPositions, {
	            flee: true,
	            maxRooms: 1,
	            roomCallback: (roomName) => {
	                if (roomName !== this.room.name)
	                    return;
	                if (!this.room.structureMatrix) {
	                    let matrix = new PathFinder.CostMatrix();
	                    helper_1.helper.addStructuresToMatrix(matrix, this.room);
	                    this.room.structureMatrix = matrix;
	                }
	                return this.room.structureMatrix;
	            }
	        });
	        return this.move(this.pos.getDirectionTo(ret.path[0]));
	    };
	    /**
	     * General-purpose cpu-efficient movement function that uses ignoreCreeps: true, a high reusePath value and stuck-detection
	     * @param destination
	     * @param ops - pathfinding ops, ignoreCreeps and reusePath will be overwritten
	     * @param dareDevil
	     * @returns {number} - Error code
	     */
	    Creep.prototype.blindMoveTo = function (destination, ops, dareDevil = false) {
	        if (this.spawning) {
	            return 0;
	        }
	        if (this.fatigue > 0) {
	            return ERR_TIRED;
	        }
	        if (!this.memory.position) {
	            this.memory.position = this.pos;
	        }
	        if (!ops) {
	            ops = {};
	        }
	        // check if trying to move last tick
	        let movingLastTick = true;
	        if (!this.memory.lastTickMoving)
	            this.memory.lastTickMoving = 0;
	        if (Game.time - this.memory.lastTickMoving > 1) {
	            movingLastTick = false;
	        }
	        this.memory.lastTickMoving = Game.time;
	        // check if stuck
	        let stuck = this.pos.inRangeTo(this.memory.position.x, this.memory.position.y, 0);
	        this.memory.position = this.pos;
	        if (stuck && movingLastTick) {
	            if (!this.memory.stuckCount)
	                this.memory.stuckCount = 0;
	            this.memory.stuckCount++;
	            if (dareDevil && this.memory.stuckCount > 0) {
	                this.memory.detourTicks = 5;
	            }
	            else if (this.memory.stuckCount >= 2) {
	                this.memory.detourTicks = 5;
	            }
	            if (this.memory.stuckCount > 500 && !this.memory.stuckNoted) {
	                console.log(this.name, "is stuck at", this.pos, "stuckCount:", this.memory.stuckCount);
	                this.memory.stuckNoted = true;
	            }
	        }
	        else {
	            this.memory.stuckCount = 0;
	        }
	        if (this.memory.detourTicks > 0) {
	            this.memory.detourTicks--;
	            if (dareDevil) {
	                ops.reusePath = 0;
	            }
	            else {
	                ops.reusePath = 5;
	            }
	            if (this.name === "swat1_gammaHealer") {
	                console.log(destination);
	            }
	            return this.moveTo(destination, ops);
	        }
	        else {
	            ops.reusePath = 50;
	            ops.ignoreCreeps = true;
	            return this.moveTo(destination, ops);
	        }
	    };
	    /**
	     * Moves a creep to a position using creep.blindMoveTo(position), when at range === 1 will remove any occuping creep
	     * @param position
	     * @param name - if given, will suicide the occupying creep if string occurs anywhere in name (allows easy role replacement)
	     * and will transfer any resources in creeps' carry
	     * @returns {number}
	     */
	    Creep.prototype.moveItOrLoseIt = function (position, name) {
	        if (this.fatigue > 0) {
	            return OK;
	        }
	        let range = this.pos.getRangeTo(position);
	        if (range === 0)
	            return OK;
	        if (range > 1) {
	            return this.blindMoveTo(position);
	        }
	        // take care of creep that might be in the way
	        let occupier = _.head(position.lookFor(LOOK_CREEPS));
	        if (occupier && occupier.name) {
	            if (name && occupier.name.indexOf(name) >= 0) {
	                for (let resourceType in occupier.carry) {
	                    let amount = occupier.carry[resourceType];
	                    if (amount > 0) {
	                        occupier.transfer(this, resourceType);
	                    }
	                }
	                this.say("my spot!", true);
	                occupier.suicide();
	            }
	            else {
	                let direction = occupier.pos.getDirectionTo(this);
	                occupier.move(direction);
	                this.say("move it", true);
	            }
	        }
	        // move
	        let direction = this.pos.getDirectionTo(position);
	        this.move(direction);
	    };
	    /**
	     * Can be used to keep idling creeps out of the way, like when a road repairer doesn't have any roads needing repair
	     * or a spawn refiller who currently has full extensions. Clear roads allow for better creep.BlindMoveTo() behavior
	     * @param defaultPoint
	     * @returns {any}
	     */
	    Creep.prototype.idleOffRoad = function (defaultPoint) {
	        if (this.memory.idlePosition) {
	            let pos = helper_1.helper.deserializeRoomPosition(this.memory.idlePosition);
	            if (!this.pos.inRangeTo(pos, 0)) {
	                return this.moveItOrLoseIt(pos);
	            }
	            return OK;
	        }
	        let offRoad = this.pos.lookFor(LOOK_STRUCTURES).length === 0;
	        if (offRoad)
	            return OK;
	        let positions = this.pos.openAdjacentSpots();
	        let swampPosition;
	        for (let position of positions) {
	            if (position.lookFor(LOOK_STRUCTURES).length === 0) {
	                let terrain = position.lookFor(LOOK_TERRAIN)[0];
	                if (terrain === "swamp") {
	                    swampPosition = position;
	                }
	                else {
	                    return this.move(this.pos.getDirectionTo(position));
	                }
	            }
	        }
	        if (swampPosition) {
	            return this.move(this.pos.getDirectionTo(swampPosition));
	        }
	        return this.blindMoveTo(defaultPoint);
	    };
	    /**
	     * another function for keeping roads clear, this one is more useful for builders and road repairers that are
	     * currently working, will move off road without going out of range of target
	     * @param target - target for which you do not want to move out of range
	     * @returns {number}
	     */
	    Creep.prototype.yieldRoad = function (target, allowSwamps = true) {
	        let isOnRoad = this.pos.lookFor(LOOK_STRUCTURES).length > 0;
	        if (isOnRoad) {
	            let swampPosition;
	            // find movement options
	            let direction = this.pos.getDirectionTo(target);
	            for (let i = -2; i <= 2; i++) {
	                let relDirection = direction + i;
	                relDirection = helper_1.helper.clampDirection(relDirection);
	                let position = this.pos.getPositionAtDirection(relDirection);
	                if (!position.inRangeTo(target, 3))
	                    continue;
	                if (position.lookFor(LOOK_STRUCTURES).length > 0)
	                    continue;
	                if (!position.isPassible())
	                    continue;
	                if (position.isNearExit(0))
	                    continue;
	                if (position.lookFor(LOOK_TERRAIN)[0] === "swamp") {
	                    swampPosition = position;
	                    continue;
	                }
	                return this.move(relDirection);
	            }
	            if (swampPosition && allowSwamps) {
	                return this.move(this.pos.getDirectionTo(swampPosition));
	            }
	            return this.blindMoveTo(target);
	        }
	    };
	    Creep.prototype._withdraw = Creep.prototype.withdraw;
	    /**
	     * Overrides the API's creep.withdraw() function to allow consistent transfer code whether the resource holder is
	     * a structure or a creep;
	     * @param target
	     * @param resourceType
	     * @param amount
	     * @returns {number}
	     */
	    Creep.prototype.withdraw = function (target, resourceType, amount) {
	        if (target instanceof Creep) {
	            return target.transfer(this, resourceType, amount);
	        }
	        else {
	            return this._withdraw(target, resourceType, amount);
	        }
	    };
	    Object.defineProperty(Creep.prototype, "store", {
	        get: function myProperty() {
	            return this.carry;
	        }
	    });
	    Object.defineProperty(Creep.prototype, "storeCapacity", {
	        get: function myProperty() {
	            return this.carryCapacity;
	        }
	    });
	    /**
	     * Only withdraw from a store-holder if there is enough resource to transfer (or if holder is full), cpu-efficiency effort
	     * @param target
	     * @param resourceType
	     * @returns {number}
	     */
	    Creep.prototype.withdrawIfFull = function (target, resourceType) {
	        if (!this.pos.isNearTo(target)) {
	            return ERR_NOT_IN_RANGE;
	        }
	        let storageAvailable = this.carryCapacity - _.sum(this.carry);
	        let targetStorageAvailable = target.storeCapacity - _.sum(target.store);
	        if (target.store[resourceType] >= storageAvailable || targetStorageAvailable === 0) {
	            return this.withdraw(target, resourceType);
	        }
	        else {
	            return ERR_NOT_ENOUGH_RESOURCES;
	        }
	    };
	    Creep.prototype.withdrawEverything = function (target) {
	        for (let resourceType in target.store) {
	            let amount = target.store[resourceType];
	            if (amount > 0) {
	                return this.withdraw(target, resourceType);
	            }
	        }
	        return ERR_NOT_ENOUGH_RESOURCES;
	    };
	    Creep.prototype.transferEverything = function (target) {
	        for (let resourceType in this.carry) {
	            let amount = this.carry[resourceType];
	            if (amount > 0) {
	                return this.transfer(target, resourceType);
	            }
	        }
	        return ERR_NOT_ENOUGH_RESOURCES;
	    };
	    /**
	     * Find a structure, cache, and invalidate cache based on the functions provided
	     * @param findStructure
	     * @param forget
	     * @param recursion
	     * @param prop
	     * @returns {Structure}
	     */
	    Creep.prototype.rememberStructure = function (findStructure, forget, prop = "remStructureId", recursion = false) {
	        if (this.memory[prop]) {
	            let structure = Game.getObjectById(this.memory[prop]);
	            if (structure && !forget(structure)) {
	                return structure;
	            }
	            else {
	                this.memory[prop] = undefined;
	                return this.rememberStructure(findStructure, forget, prop, true);
	            }
	        }
	        else if (Game.time % 10 === 0 || recursion) {
	            let object = findStructure();
	            if (object) {
	                this.memory[prop] = object.id;
	                return object;
	            }
	        }
	    };
	    /**
	     * Find a creep, cache, and invalidate cache based on the functions provided
	     * @param findCreep
	     * @param forget
	     * @returns {Structure}
	     */
	    Creep.prototype.rememberCreep = function (findCreep, forget) {
	        if (this.memory.remCreepId) {
	            let creep = Game.getObjectById(this.memory.remCreepId);
	            if (creep && !forget(creep)) {
	                return creep;
	            }
	            else {
	                this.memory.remCreepId = undefined;
	                return this.rememberCreep(findCreep, forget);
	            }
	        }
	        else {
	            let object = findCreep();
	            if (object) {
	                this.memory.remCreepId = object.id;
	                return object;
	            }
	        }
	    };
	    /**
	     * Find the nearest energy source with greater than 50 energy, cache with creep memory;
	     * @returns {Creep | StructureContainer}
	     */
	    Creep.prototype.rememberBattery = function () {
	        if (this.memory.batteryId) {
	            let battery = Game.getObjectById(this.memory.batteryId);
	            if (battery && battery.store.energy >= 50) {
	                return battery;
	            }
	            else {
	                this.memory.batteryId = undefined;
	                return this.rememberBattery();
	            }
	        }
	        else {
	            let battery = this.room.getAltBattery(this);
	            if (battery) {
	                this.memory.batteryId = battery.id;
	                return battery;
	            }
	        }
	    };
	    Creep.prototype.isNearExit = function (range) {
	        return this.pos.isNearExit(range);
	    };
	    Creep.prototype.travelByWaypoint = function (waypoints) {
	        if (!waypoints)
	            return constants_1.DESTINATION_REACHED;
	        if (this.memory.waypointIndex === undefined) {
	            this.memory.waypointIndex = 0;
	        }
	        if (this.memory.waypointIndex >= waypoints.length)
	            return constants_1.DESTINATION_REACHED;
	        if (this.fatigue > 0)
	            return ERR_BUSY;
	        let waypoint = waypoints[this.memory.waypointIndex];
	        if (waypoint.room && this.pos.inRangeTo(waypoint, 1)) {
	            this.memory.waypointIndex++;
	        }
	        let waypointPortalPresent = _.filter(this.pos.lookFor(LOOK_FLAGS), (f) => _.filter(f.pos.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_PORTAL).length > 0).length > 0;
	        if (!waypointPortalPresent) {
	            return this.avoidSK(waypoint);
	        }
	        else {
	            console.log("####### waypointPortalPresent!", this.name, this.pos, Game.time);
	        }
	    };
	    Creep.prototype.avoidSK = function (destination, opts) {
	        let costCall = (roomName, costs) => {
	            if (roomName === this.room.name) {
	                this.room.find(FIND_HOSTILE_CREEPS).forEach(function (keeper) {
	                    if (keeper.owner.username === "Source Keeper") {
	                        let range = 4;
	                        for (let xDelta = -range; xDelta <= range; xDelta++) {
	                            for (let yDelta = -range; yDelta <= range; yDelta++) {
	                                costs.set(keeper.pos.x + xDelta, keeper.pos.y + yDelta, 0xff);
	                            }
	                        }
	                    }
	                });
	            }
	            return costs;
	        };
	        let options = {};
	        if (this.room.roomType === constants_1.ROOMTYPE_SOURCEKEEPER) {
	            options.costCallback = costCall;
	        }
	        return this.blindMoveTo(destination, options);
	    };
	    Creep.prototype.partCount = function (partType) {
	        let count = 0;
	        for (let part of this.body) {
	            if (part.type === partType) {
	                count++;
	            }
	        }
	        return count;
	    };
	    /**
	     * Pass in position of recycle bin (aka container next to spawn) and will creep go recycle itself there
	     * @param container
	     */
	    Creep.prototype.recycleSelf = function (container) {
	        if (!container) {
	            console.log(this.name, " needs a container to recycle self");
	            return;
	        }
	        let binTooFull = (this.ticksToLive + _.sum(container.store)) > container.storeCapacity;
	        if (binTooFull) {
	            console.log(this.name, " is waiting for space in recycle bin in ", this.pos.roomName);
	            return;
	        }
	        if (!this.pos.isEqualTo(container.pos)) {
	            this.blindMoveTo(container, { range: 0 });
	            console.log(this.name, " is heading to recycle bin");
	            return;
	        }
	        let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
	        if (!spawn) {
	            console.log("recycleBin is missing spawn in", this.room.name);
	            return;
	        }
	        let recycleOutcome = spawn.recycleCreep(this);
	        if (recycleOutcome === OK) {
	            console.log(this.pos.roomName, " recycled creep ", this.name);
	        }
	        else if (recycleOutcome === -9) {
	            console.log(this.name, " is moving to recycle bin at ", container.pos);
	            this.blindMoveTo(container, { range: 0 });
	            return;
	        }
	        else {
	            console.log(this.room.name, " recycling error: ", recycleOutcome);
	        }
	        return;
	    };
	}
	exports.initCreepPrototype = initCreepPrototype;


/***/ },
/* 49 */
/*!************************!*\
  !*** ./src/sandbox.ts ***!
  \************************/
/***/ function(module, exports) {

	"use strict";
	exports.sandBox = {
	    run: function () {
	    }
	};


/***/ },
/* 50 */
/*!*************************!*\
  !*** ./src/profiler.ts ***!
  \*************************/
/***/ function(module, exports) {

	"use strict";
	exports.profiler = {
	    start(identifier) {
	        this.cpu = Game.cpu.getUsed();
	        if (!Memory.profiler[identifier])
	            Memory.profiler[identifier] = {
	                tickBegin: Game.time,
	                lastTickTracked: undefined,
	                total: 0,
	                count: 0,
	                costPerCall: undefined,
	                costPerTick: undefined,
	                callsPerTick: undefined,
	            };
	        Memory.profiler[identifier].lastTickTracked = Game.time;
	    },
	    end(identifier, period = 10) {
	        let profile = Memory.profiler[identifier];
	        profile.total += Game.cpu.getUsed() - this.cpu;
	        profile.count++;
	        if (Game.time - profile.tickBegin >= period - 1) {
	            profile.costPerCall = _.round(profile.total / profile.count, 2);
	            profile.costPerTick = _.round(profile.total / period, 2);
	            profile.callsPerTick = _.round(profile.count / period, 2);
	            // console.log("PROFILER:", identifier, "perTick:", profile.costPerTick, "perCall:",
	            //    profile.costPerCall, "calls per tick:", profile.callsPerTick);
	            profile.tickBegin = Game.time + 1;
	            profile.total = 0;
	            profile.count = 0;
	        }
	    }
	};


/***/ }
/******/ ]);