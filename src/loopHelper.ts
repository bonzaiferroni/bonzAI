import {Empire} from "./Empire";
import {FortOperation} from "./FortOperation";
import {Operation} from "./Operation";
import {MiningOperation} from "./MiningOperation";
import {
    CACHE_INVALIDATION_FREQUENCY, CACHE_INVALIDATION_PERIOD, MINERALS_RAW, PRODUCT_LIST,
    USERNAME, RESERVE_AMOUNT
} from "./constants";
import {KeeperOperation} from "./KeeperOperation";
import {ConquestOperation} from "./ConquestOperation";
import {consoleCommands} from "./consoleCommands";
import {TrainingOperation} from "./TrainingOperation";
import {DemolishOperation} from "./DemolishOperation";
import {TransportOperation} from "./TransportOperation";
import {RaidOperation} from "./RaidOperation";
export var loopHelper = {
    initEmpire: function(): Empire {
        // gather flag data, instantiate operations
        let empire = new Empire();
        empire.init();
        global.emp = empire;
        return empire;
    },
    /// <summary>loop through flags and construct operation objects, return operation array sorted by priority</summary>
    getOperations: function(empire: Empire): Operation[] {
        let operationTypes: any = {
            conquest: ConquestOperation,
            fort: FortOperation,
            mining: MiningOperation,
            tran: TransportOperation,
            keeper: KeeperOperation,
            training: TrainingOperation,
            demolish: DemolishOperation,
            raid: RaidOperation,
        };

        // gather flag data, instantiate operations
        let operationList: {[operationName: string]: Operation} = {};
        for (let flagName in Game.flags) {
            for (let typeName in operationTypes) {
                if (!operationTypes.hasOwnProperty(typeName)) continue;
                if (flagName.substring(0, typeName.length) === typeName) {
                    let operationClass = operationTypes[typeName];
                    let flag = Game.flags[flagName];
                    let name = flagName.substring(flagName.indexOf("_") + 1);

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

        return _.sortBy(operationList, (operation: Operation) => operation.priority);
    },
    initMemory: function() {
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

        if (!Memory.stats) Memory.stats = {};
    },

    scavangeResources: function() {
        for (let v in Game.rooms) {
            let room = Game.rooms[v];
            let resources = room.find(FIND_DROPPED_ENERGY) as Resource[];
            for (let resource of resources) {
                if (resource.amount > 10) {
                    let creep = resource.pos.lookFor(LOOK_CREEPS)[0] as Creep;
                    if (creep && creep.my && creep.memory.scavanger === resource.resourceType
                        && (!creep.carry[resource.resourceType] || creep.carry[resource.resourceType] < creep.carryCapacity)) {
                        let outcome = creep.pickup(resource);
                    }
                }
            }
        }
    },

    invalidateCache: Game.time % CACHE_INVALIDATION_FREQUENCY < CACHE_INVALIDATION_PERIOD,

    grafanaStats: function(empire: Empire) {

        if (!Memory.playerConfig.enableStats) return;

        if (!Memory.stats) Memory.stats = {};

        // STATS START HERE
        _.forEach(Game.rooms, function (room) {
            if (room.controller && room.controller.my) {
                Memory.stats["rooms." + room.name + ".controller.level"] = room.controller.level;
                Memory.stats["rooms." + room.name + ".controller.progress"] = room.controller.progress;
                Memory.stats["rooms." + room.name + ".controller.progressTotal"] = room.controller.progressTotal;
                Memory.stats["rooms." + room.name + ".energyAvailable"] = room.energyAvailable;
            }
        });

        for (let resourceType of MINERALS_RAW) {
            Memory.stats["empire.rawMinerals." + resourceType] = empire.inventory[resourceType];
            Memory.stats["empire.mineralCount." + resourceType] = Game.cache[resourceType] || 0;
        }

        for (let resourceType of PRODUCT_LIST) {
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

    reportTransactions: function() {
        for (let item of Game.market.incomingTransactions) {
            if (item.time === Game.time - 1) {
                if (item.sender.username !== USERNAME) {
                    if (!Memory.traders) Memory.traders = {};
                    if (!Memory.traders[item.sender.username]) {
                        Memory.traders[item.sender.username] = { recieved: {}, sent: {} };
                    }
                    if (!Memory.traders[item.sender.username].recieved[item.resourceType]) {
                        Memory.traders[item.sender.username].recieved[item.resourceType] = 0;
                    }

                    Memory.traders[item.sender.username].recieved[item.resourceType] += item.amount;

                    console.log("MARKET: received", item.amount, "of", item.resourceType, "from", item.sender.username);
                }
                else if (item.recipient.username !== USERNAME) {
                    if (!Memory.traders) Memory.traders = {};
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

    sendResourceOrder: function(empire: Empire) {
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

            let sortedTerminals = _.sortBy(empire.terminals, (t: StructureTerminal) =>
                Game.map.getRoomLinearDistance(order.roomName, t.room.name)) as StructureTerminal[];

            let count = 0;
            for (let terminal of sortedTerminals) {
                if (terminal.room.name === order.roomName) continue;
                if (terminal.store[order.resourceType] >= RESERVE_AMOUNT) {
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
                    if (count === order.efficiency) break;
                }
            }

            if (order.amountSent === order.amount) {
                console.log("finished sending mineral order: " + order.resourceType);
                Memory.resourceOrder[timeStamp] = undefined;
            }
        }
    },

    initConsoleCommands: function() {
        // command functions found in consoleCommands.ts can be executed from the game console
        // example: cc.minv()
        global.cc = consoleCommands;
    },

    profilerCheck: function() {
        for (let identifier in Memory.profiler) {
            let profile = Memory.profiler[identifier];
            if (Game.time - profile.lastTickTracked > 1) {
                delete Memory.profiler[identifier];
            }
        }
    }
};