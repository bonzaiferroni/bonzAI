import {empire} from "../ai/Empire";
import {Operation} from "../ai/operations/Operation";
import {MINERALS_RAW, PRODUCT_LIST} from "../ai/TradeNetwork";
import {WorldMap} from "../ai/WorldMap";
import {BuildingPlannerData} from "../interfaces";
import {Viz} from "./Viz";
import {Tick} from "../Tick";
import {PaverMission} from "../ai/missions/PaverMission";

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
        for (let propertyName in Memory) {
            if (propertyName === "playerConfig") { continue; }
            delete Memory[propertyName];
        }
    },

    /**
     * remove old properties in memory that are no longer being used by the AI
     */

    gc() {
        let flagCount = 0;
        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (!flag) {
                console.log(flagName);
                flagCount++;
                delete Memory.flags[flagName];
            }
        }

        let creepCount = 0;
        for (let creepName in Memory.creeps) {
            let creep = Game.creeps[creepName];
            if (!creep) {
                console.log(creepName);
                creepCount++;
                delete Memory.creeps[creepName];
            }
        }

        return `gc Creeps: ${creepCount}, gc flags: ${flagCount}`;
    },

    gcTemp() {

        let before = JSON.stringify(Memory.rooms).length;

        let save = {
            layout: true,
            avoid: true,
            nextScan: true,
            level: true,
            owner: true,
            builder: true,
            spawnMemory: true,
            nextRadar: true,
        };

        let count = 0;
        for (let roomName in Memory.rooms) {
            let mem = Memory.rooms[roomName];
            for (let propertyName in mem) {
                if (save[propertyName]) { continue; }
                delete mem[propertyName];
                count++;
            }
        }

        let after = JSON.stringify(Memory.rooms).length;

        return `count: ${count}, before: ${before}, after: ${after}`;
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

    emptyTerminal(origin: string, destination: string, type?: string) {
        let originTerminal = Game.rooms[origin].terminal;

        if (type) {
            let amount = originTerminal.store[type];
            return originTerminal.send(type, amount, destination);
        }

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
        let position = Game.spawns["Spawn1"].pos;
        let dirs = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];
        let test1 = () => {
            for (let dir of dirs) {
                position.getPositionAtDirection(dir);
            }
        };

        let test2 = () => {
            for (let dir of dirs) {
            }
        };

        let tests = [test1, test2];
        if (Math.random() < .5) {
            tests = [test2, test1];
        }

        for (let test of tests) {
            let cpu = Game.cpu.getUsed();
            test();
            cpu = Game.cpu.getUsed() - cpu;
            console.log(`${test.name} ${_.round(cpu, 5)}`);
        }

        /* output
         [2:11:09 PM]TRAVELER: path failed without findroute, trying with options.useFindRoute = true
         [2:11:09 PM]from: [room E7S8 pos 27,14], destination: [room E5S6 pos 36,30]
         [2:11:09 PM]TRAVELER: second attempt was  successful
         [2:11:09 PM]test: new, cpu: 15.518756000000053, incomplete = false
         [2:11:09 PM]test: old, cpu: 9.348324999999988, incomplete = true
         */
    },

    roads(roomName: string) {
        let roadMap = PaverMission.getRoadPositions(roomName);
        for (let pos of roadMap) {
            Viz.colorPos(pos, "cyan");
        }
    },

    construction() {
        let roomCounts = {};
        for (let id in Game.constructionSites) {
            let site = Game.constructionSites[id];
            if (!roomCounts[site.pos.roomName]) {
                roomCounts[site.pos.roomName] = 0;
            }
            roomCounts[site.pos.roomName]++;
        }
        for (let roomName in roomCounts) {
            console.log(roomName, roomCounts[roomName]);
        }
    },

    nuke(xPos: number, yPos: number, roomName: string, sendNuke: boolean) {
        let room = Game.rooms[roomName];
        if (room && room.controller && room.controller.my) {
            return "that is your room silly";
        }
        let nuker = _(empire.network.terminals)
            .filter(x => Game.map.getRoomLinearDistance(x.room.name, roomName) <= 10)
            .filter(x => x.room.findStructures(STRUCTURE_NUKER)[0])
            .map(x => x.room.findStructures<StructureNuker>(STRUCTURE_NUKER)[0])
            .filter(x => !x.cooldown)
            .max(x => Game.map.getRoomLinearDistance(x.room.name, roomName));
        if (!_.isObject(nuker)) {
            return "no nuker in range";
        }
        let position = new RoomPosition(xPos, yPos, roomName);
        if (sendNuke) {
            let outcome = nuker.launchNuke(position);
            return outcome;
        } else {
            Viz.colorPos(position, "teal");
            return `highlighting position. would send from ${nuker.pos.roomName}`;
        }
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

    walls(roomName: string, maxHits?: number) {
        let room = Game.rooms[roomName];
        if (!room) { return "no vision"; }

        let structures = _(room.find<Structure>(FIND_STRUCTURES))
            .filter(x => x.structureType === STRUCTURE_RAMPART || x.structureType === STRUCTURE_WALL)
            .value();

        if (structures.length === 0) { return "no walls"; }

        if (!maxHits) {
            maxHits = _.max(structures, x => x.hits).hits;
        }

        for (let wall of structures) {
            if (wall.hits > maxHits) { continue; }
            let pos = wall.pos;
            let opacity = wall.hits / maxHits;
            new RoomVisual(pos.roomName).rect(pos.x - .5, pos.y - .5, 1, 1, {fill: "orange", opacity: opacity});
        }
    },

    removeWalls(roomName: string) {
        let room = Game.rooms[roomName];
        let walls = room.findStructures(STRUCTURE_WALL);
        for (let wall of walls) {
            wall.destroy();
        }
    },

    rangerVsRanger(rangedCount1: number, rangedCount2: number) {

        let ranger1: {type: string, hits: number}[] = [];
        for (let i = 0; i < rangedCount1 - 10; i++) { ranger1.push({type: "ranged", hits: 100}); }
        for (let i = 0; i < 5; i++) { ranger1.push({type: "move", hits: 100}); }
        for (let i = 0; i < 10; i++) { ranger1.push({type: "ranged", hits: 100}); }
        for (let i = 0; i < 20; i++) { ranger1.push({type: "move", hits: 100}); }
        for (let i = 0; i < 25 - rangedCount1; i++) { ranger1.push({type: "heal", hits: 100}); }

        let ranger2: {type: string, hits: number}[] = [];
        for (let i = 0; i < rangedCount2; i++) { ranger2.push({type: "ranged", hits: 100}); }
        for (let i = 0; i < 25; i++) { ranger2.push({type: "move", hits: 100}); }
        for (let i = 0; i < 25 - rangedCount2; i++) { ranger2.push({type: "heal", hits: 100}); }

        let tick = 0;
        while (_.sum(ranger1, x => x.hits) > 0 && _.sum(ranger2, x => x.hits) > 0 && tick < 100) {
            let ranger1Healing = _.filter(ranger1, x => x.hits > 0 && x.type === "heal").length * 12;
            let ranger1Damage = _.filter(ranger1, x => x.hits > 0 && x.type === "ranged").length * 10;
            let ranger2Healing = _.filter(ranger2, x => x.hits > 0 && x.type === "heal").length * 12;
            let ranger2Damage = _.filter(ranger2, x => x.hits > 0 && x.type === "ranged").length * 10;

            // apply healing
            for (let i = ranger1.length - 1; i >= 0; i--) {
                if (ranger1Healing <= 0) { break; }
                let part = ranger1[i];
                if (part.hits === 100) { continue; }
                let appliedHealing = Math.min(ranger1Healing, 100 - part.hits);
                part.hits += appliedHealing;
                ranger1Healing -= appliedHealing;
            }

            for (let i = ranger2.length - 1; i >= 0; i--) {
                if (ranger2Healing <= 0) { break; }
                let part = ranger2[i];
                if (part.hits === 100) { continue; }
                let appliedHealing = Math.min(ranger2Healing, 100 - part.hits);
                part.hits += appliedHealing;
                ranger2Healing -= appliedHealing;
            }

            // apply damage
            ranger2Damage -= ranger1Healing;
            for (let part of ranger1) {
                if (ranger2Damage <= 0) { break; }
                let appliedDamage = Math.min(ranger2Damage, part.hits);
                part.hits -= appliedDamage;
                ranger2Damage -= appliedDamage;
            }

            ranger1Damage -= ranger2Healing;
            for (let part of ranger2) {
                if (ranger1Damage <= 0) { break; }
                let appliedDamage = Math.min(ranger1Damage, part.hits);
                part.hits -= appliedDamage;
                ranger1Damage -= appliedDamage;
            }

            console.log(`${tick} RANGER1: ${_.sum(ranger1, x => x.hits)}, RANGER2: ${_.sum(ranger2, x => x.hits)}`);
            tick++;
        }
    },
};
