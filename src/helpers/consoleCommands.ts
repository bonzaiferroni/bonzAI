import {Empire, empire} from "../ai/Empire";
import {Operation} from "../ai/operations/Operation";
import {helper} from "./helper";
import {MINERALS_RAW, PRODUCT_LIST, RESERVE_AMOUNT} from "../ai/TradeNetwork";
import {WorldMap} from "../ai/WorldMap";
import {BuildingPlannerData} from "../interfaces";
import {Viz} from "./Viz";
import {Tick} from "../Tick";
import {Traveler, TravelState, TravelToOptions} from "../ai/Traveler";

export var consoleCommands = {

    /**
     * Remove construction sites from a missionRoom
     * @param roomName
     * @param leaveProgressStarted - leave sites already started
     * @param structureType
     */

    removeConstructionSites(roomName: string, leaveProgressStarted = true, structureType?: string) {
        Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES).forEach( (site: ConstructionSite) => {
            if ((!structureType || site.structureType === structureType) && (!leaveProgressStarted ||
                site.progress === 0)) {
                site.remove();
            }
        });
    },
    // shorthand
    rc(roomName: string, leaveProgressStarted: boolean, structureType: string) {
        this.removeConstructionSites(roomName, leaveProgressStarted, structureType);
    },

    /**
     * Remove all flags that contain a substring in the name, good for wiping out a previously used operation
     * @param substr
     */

    removeFlags(substr: string) {
      _.forEach(Game.flags, (flag) => {
          if (_.includes(flag.name, substr) ) {
              console.log(`removing flag ${flag.name} in ${flag.pos.roomName}`);
              flag.remove();
          }
      });
    },
    // shorthand
    rf(substr: string) {
        this.removeFlags(substr);
    },

    /**
     * Displays all total raw minerals in every storage/terminal
     */

    minv() {
        for (let mineralType of MINERALS_RAW) {
            console.log(mineralType + ":", empire.network.inventory[mineralType]);
        }

    },

    /**
     * Displays all final compounds in every storage/terminal
     */

    pinv() {
        for (let mineralType of PRODUCT_LIST) {
            console.log(mineralType + ":", empire.network.inventory[mineralType]);
        }
    },

    boostReport(boostType: string) {
        for (let terminal of empire.network.terminals) {
            console.log(`${terminal.store[boostType]} in ${terminal.room.name}`);
        }

    },

    sendBoost(boostType: string, roomName: string) {
        empire.network.sendBoost(boostType, roomName);
    },

    /**
     * remove most memory while leaving more important stuff intact, strongly not recommended unless you know what you
     * are doing
     */

    wipeMemory() {
        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (flag) {
                for (let propertyName of Object.keys(flag.memory)) {
                    if (propertyName === "power") { continue; }
                    if (propertyName === "centerPosition") { continue; }
                    if (propertyName === "rotation") { continue; }
                    if (propertyName === "radius") { continue; }
                    if (propertyName === "layoutMap") { continue; }
                    delete flag.memory[propertyName];
                }
            } else {
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
     * remove old properties in memory that are no longer being used by the AI
     */

    removeUnusedProperties() {

        let hostiles = false;
        if (Memory.empire["hostileRooms"]) {
            hostiles = true;
            delete Memory.empire["hostileRooms"];
        }

        let radarCount = 0;
        let spawnCount = 0;
        let analCount = 0;
        let flagCount = 0;
        let pathGarbage = 0;
        let paveTick = 0;
        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (flag) {
                let flagMemory = Memory.flags[flagName];
                for (let missionName in flagMemory) {
                    if (!flagMemory.hasOwnProperty(missionName)) { continue; }
                    let missionMemory = flagMemory[missionName];
                    if (missionName === "radar") {
                        radarCount++;
                        delete flagMemory[missionName];
                    }
                    if (missionMemory["anal"]) { // :)
                        analCount++;
                        delete missionMemory["anal"];
                    }
                    if (missionName === "bodyguard" || missionName === "defense") {
                        delete missionMemory["invaderProbable"];
                        delete missionMemory["invaderTrack"];
                    }
                    if (missionMemory["roadRepairIds"]) {
                        delete missionMemory["roadRepairIds"];
                        pathGarbage++;
                    }
                    if (missionMemory["paveTick"]) {
                        delete missionMemory["paveTick"];
                        pathGarbage++;
                    }
                    if (missionMemory.hasOwnProperty("pathData") && missionMemory.pathData.paveTick) {
                        delete missionMemory.pathData.paveTick;
                        paveTick++;
                    }
                    if (missionName === "repair") {
                        delete flagMemory[missionName];
                    }
                }
            } else {
                flagCount++;
                delete Memory.flags[flagName];
            }
        }

        let creepCount = 0;
        for (let creepName in Memory.creeps) {
            let creep = Game.creeps[creepName];
            if (!creep) {
                creepCount++;
                delete Memory.creeps[creepName];
            }
        }

        return `gc Creeps: ${creepCount}, gc flags: ${flagCount}, spawn: ${spawnCount}, radar: ${radarCount}\n` +
                `analysis: ${analCount}, hostileRooms: ${hostiles}, pathGarbage: ${pathGarbage}\n` +
                `paveTick ${paveTick}`;
    },

    removeMissionData(missionName: string) {
        for (let flagName in Memory.flags) {
            delete Memory.flags[flagName][missionName];
        }
    },

    /**
     * find which rooms contain a resource type in terminal
     * @param resourceType
     */

    findResource(resourceType: string) {
        for (let terminal of empire.network.terminals) {
            let amount = 0;
            if (terminal.store[resourceType]) {
                amount += terminal.store[resourceType];
            }
            if (terminal.room.storage && terminal.room.storage.store[resourceType]) {
                amount += terminal.room.storage.store[resourceType];
            }
            console.log(terminal.room.name, amount);
        }
    },

    /**
     * Empty resources from a terminal, will only try to send one resource each tick so this must be called repeatedly
     * on multiple ticks with the same arguments to completely empty a terminal
     * @param origin
     * @param destination
     * @returns {any}
     */

    emptyTerminal(origin: string, destination: string) {
        let originTerminal = Game.rooms[origin].terminal;
        let outcome;
        for (let resourceType in originTerminal.store) {
            if (!originTerminal.store.hasOwnProperty(resourceType)) { continue; }
            let amount = originTerminal.store[resourceType];
            if (amount >= 100) {
                if (resourceType !== RESOURCE_ENERGY) {
                    outcome = originTerminal.send(resourceType, amount, destination);
                    return outcome;
                } else if (Object.keys(originTerminal.store).length === 1 ) {
                    let distance = Game.map.getRoomLinearDistance(origin, destination, true);
                    let stored = originTerminal.store.energy;
                    let amountSendable = Math.floor(stored / (1 + 0.1 * distance));
                    console.log("sending", amountSendable, "out of", stored);
                    outcome = originTerminal.send(RESOURCE_ENERGY, amountSendable, destination);
                    return outcome;
                }
            }
        }
    },

    /**
     * Changes the name of an operation, giving it a new flag. May result in some unintended consequences
     * @param opName
     * @param newOpName
     * @returns {any}
     */

    changeOpName(opName: string, newOpName: string) {
        let operation = Tick.operations[opName] as Operation;
        if (!operation) { return "you don't have an operation by that name"; }

        let newFlagName = operation.type + "_" + newOpName;
        let outcome = operation.flag.pos.createFlag(newFlagName, operation.flag.color, operation.flag.secondaryColor);
        if (_.isString(outcome)) {
            Memory.flags[newFlagName] = operation.memory;
            operation.flag.remove();
            return `success, changed ${opName} to ${newOpName} (removing old flag)`;
        } else {
            return "error changing name: " + outcome;
        }
    },

    /**
     * Place an order for a resource to be sent to any missionRoom. Good for making one-time deals.
     * @param resourceType
     * @param amount
     * @param roomName
     * @param efficiency - the number of terminals that should send the resource per tick, use a lower number to only
     * send from the nearest terminals
     * @returns {any}
     */

    order(resourceType: string, amount: number, roomName: string, efficiency = 10 ) {
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
            efficiency: efficiency, amountSent: 0};
        return "TRADE: scheduling " + amount + " " + resourceType + " to be sent to " + roomName;
    },

    patchTraderMemory() {
        for (let username in Memory.traders) {
            let data = Memory.traders[username] as any;
            if (data.recieved) {
                for (let resourceType in data.recieved) {
                    let amount = data.recieved[resourceType];
                    if (data[resourceType] === undefined) { data[resourceType] = 0; }
                    data[resourceType] += amount;
                }
            }
            if (data.sent) {
                for (let resourceType in data.sent) {
                    let amount = data.sent[resourceType];
                    if (data[resourceType] === undefined) { data[resourceType] = 0; }
                    data[resourceType] -= amount;
                }
            }
            delete data.recieved;
            delete data.sent;
        }
    },

    /**
     * If this looks silly it is because it is, I used to it go from one naming convention to another
     * @param opName
     * @returns {any}
     */

    roomConvention(opName: string, alternate?: string): string {
        let controllerOp = Tick.operations[opName + 0];
        if (!controllerOp) {
            return "owned missionRoom doesn't exist";
        }

        for (let direction = 1; direction <= 8; direction++) {
            let tempName = opName + "temp" + direction;
            if (!Tick.operations[tempName]) { continue; }
            console.log(`found temp ${tempName}`);
            let desiredName = opName + direction;
            let currentOp = Tick.operations[desiredName];
            if (currentOp) {
                console.log(`current op with that name, changing name to temp`);
                let tempDir = WorldMap.findRelativeRoomDir(controllerOp.flag.room.name, currentOp.flag.room.name);
                return this.changeOpName(desiredName, opName + "temp" + tempDir);
            }
            console.log(`no temp conflicts`);
            return this.changeOpName(tempName, desiredName);
        }

        for (let direction = 1; direction <= 9; direction++) {
            let testOpName = opName + direction;
            let testOp = Tick.operations[testOpName];
            if (!testOp && alternate) {
                testOp = Tick.operations[alternate + direction];
                if (testOp) {
                    testOpName = alternate + direction;
                }
            }
            if (!testOp) { continue; }
            let correctDir = WorldMap.findRelativeRoomDir(controllerOp.flag.room.name, testOp.flag.room.name);
            if (correctDir === direction) { continue; }
            let correctOpName = opName + correctDir;
            console.log(`inconsistent name (${testOpName} at dir ${correctDir} should be ${correctOpName})`);
            let currentOp = Tick.operations[correctOpName];
            if (currentOp) {
                console.log(`current op with that name, changing name to temp`);
                let tempDir = WorldMap.findRelativeRoomDir(controllerOp.flag.room.name, currentOp.flag.room.name);
                return this.changeOpName(correctOpName, opName + "temp" + tempDir);
            } else {
                console.log(`no current op with that name`);
                return this.changeOpName(testOpName, correctOpName);
            }
        }

        return `all flags consistent`;
    },

    testCPU() {
        let hardPath1 = Game.flags["hardPath1"];
        let hardPath2 = Game.flags["hardPath2"];
        if (hardPath1 && hardPath2) {
            // let oldTraveler = new OldTraveler();
            let roomDistance = Game.map.getRoomLinearDistance(hardPath1.pos.roomName, hardPath2.pos.roomName);
            console.log(`testing ${hardPath1.pos} to ${hardPath2.pos}, room distance: ${roomDistance}`);
            let cpu1 = Game.cpu.getUsed();
            let retN = Traveler.findTravelPath(hardPath1.pos, hardPath2.pos, {ensurePath: true});
            cpu1 = Game.cpu.getUsed() - cpu1;
            let cpu2 = Game.cpu.getUsed();
            // let retO = oldTraveler.findTravelPath(hardPath1, hardPath2);
            cpu2 = Game.cpu.getUsed() - cpu2;

            console.log(`test: new, cpu: ${cpu1}, incomplete: ${retN.incomplete}, path length: ${retN.path.length}`);
            // console.log(`test: old, cpu: ${cpu2}, incomplete: ${retO.incomplete}, path length: ${retO.path.length}`);
        }

        /* output
         [2:11:09 PM]TRAVELER: path failed without findroute, trying with options.useFindRoute = true
         [2:11:09 PM]from: [room E7S8 pos 27,14], destination: [room E5S6 pos 36,30]
         [2:11:09 PM]TRAVELER: second attempt was  successful
         [2:11:09 PM]test: new, cpu: 15.518756000000053, incomplete = false
         [2:11:09 PM]test: old, cpu: 9.348324999999988, incomplete = true
         */
    },

    test() {
        Traveler.patchMemory();
    },

    resetPathCPU() {
        let count = 0;
        for (let creepName in Game.creeps) {
            let creep = Game.creeps[creepName];
            if (creep.memory._travel) {
                count++;
                creep.memory._travel.cpu = 0;
            }
        }
        return `reset cpu for ${count} creeps`;
    },

    pp(roomNames: string, seperator = " ") {
        return this.portalPath(roomNames.split(seperator));
    },

    portalPath(roomNames: string[]) {
        let hits = [];

        for (let targetRoomName of roomNames) {
            for (let portalRoomName in empire.map.portals) {
                let farRoomName = empire.map.portals[portalRoomName];
                let farSideDistance = Game.map.getRoomLinearDistance(targetRoomName, farRoomName);
                if (farSideDistance > 20) { continue; }
                for (let ownedRoomName in empire.map.controlledRooms) {
                    let nearSideDistance = Game.map.getRoomLinearDistance(portalRoomName, ownedRoomName);
                    let totalDistance = nearSideDistance + farSideDistance;
                    if (totalDistance > 25) { continue; }
                    hits.push({
                        target: targetRoomName,
                        portal: portalRoomName,
                        owned: ownedRoomName,
                        distance: totalDistance,
                    });
                }
            }
        }

        if (hits.length === 0) {
            return "found no hits";
        }

        console.log(`possible hits:`);
        hits = _.sortBy(hits, "distance");
        for (let hit of hits) {
            console.log(JSON.stringify(hit));
        }

        let best = _(hits).sortBy("distance").head();
        return `best: ${JSON.stringify(best)}`;
    },

    pathingCost(substr: string) {

        let total = 0;
        let count = 0;
        for (let creepName in Game.creeps) {
            if (creepName.indexOf(substr) < 0) { continue; }
            let creep = Game.creeps[creepName];
            if (!creep.memory._travel) { continue; }
            let cpu = creep.memory._travel.cpu;
            cpu = cpu * 1500 / creep.ticksToLive;
            total += cpu;
            count++;
        }

        if (count === 0) { return `couldn't find any ${substr}`; }

        return `average pathing cost for ${substr}: ${_.round(total / count, 2)}`;
    },

    exportLayout(roomName: string, x: number, y: number, radius: number, taper: number, name = "MyLayout") {
        let room = Game.rooms[roomName];
        if (!room) { return "no vision in that room"; }

        let pivot = {x: x, y: y};
        let data: BuildingPlannerData = {
            name: name,
            pivot: pivot,
            radius: radius,
            taper: taper,
            buildings: {},
        };

        let pivotPos = new RoomPosition(pivot.x, pivot.y, roomName);
        let structures = room.find<Structure>(FIND_STRUCTURES);
        for (let structure of structures) {
            let range = structure.pos.getRangeTo(pivotPos);
            if (range > radius) { continue; }
            if (!data.buildings[structure.structureType]) { data.buildings[structure.structureType] = {pos: []}; }
            data.buildings[structure.structureType].pos.push({x: structure.pos.x, y: structure.pos.y });
        }

        return JSON.stringify(data);
    },

    visWalls(roomName: string) {
        let room = Game.rooms[roomName];
        if (!room) { return "no vision"; }

        let structures = _(room.find<Structure>(FIND_STRUCTURES))
            .filter(x => x.structureType === STRUCTURE_RAMPART || x.structureType === STRUCTURE_WALL)
            .value();

        if (structures.length === 0) { return "no walls"; }

        let maxHits = _.max(structures, x => x.hits).hits;

        for (let wall of structures) {
            let pos = wall.pos;
            let opacity = wall.hits / maxHits;
            new RoomVisual(pos.roomName).rect(pos.x - .5, pos.y - .5, 1, 1, {fill: "orange", opacity: opacity});
        }
    },

};
