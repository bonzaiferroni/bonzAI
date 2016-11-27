import {helper} from "./helper";
import {
    IGOR_CAPACITY, DESTINATION_REACHED, ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CORE,
    ROOMTYPE_CONTROLLER, ROOMTYPE_ALLEY
} from "./constants";
export function initPrototypes() {

    /**
     * general-purpose hostile retrieval, will filter out allies and send alerts as needed
     */

    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Game.cache.hostiles[this.name]) {
                let hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                let filteredHostiles = [];
                for (let hostile of hostiles) {
                    let username = hostile.owner.username;
                    let isEnemy = helper.checkEnemy(username, this.name);
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
                let lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair: StructureKeeperLair) => {
                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
                });
                Game.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
            }
            return Game.cache.hostilesAndLairs[this.name];
        }
    });

    Object.defineProperty(Room.prototype, "roomType", {
        get: function myProperty(): number {
            if (!this.memory.roomType) {

                // source keeper
                let lairs = this.findStructures(STRUCTURE_KEEPER_LAIR);
                if (lairs.length > 0) {
                    this.memory.roomType = ROOMTYPE_SOURCEKEEPER;
                }

                // core
                if (!this.memory.roomType) {
                    let sources = this.find(FIND_SOURCES);
                    if (sources.length === 3) {
                        this.memory.roomType = ROOMTYPE_CORE;
                    }
                }

                // controller rooms
                if (!this.memory.roomType) {
                    if (this.controller) {
                        this.memory.roomType = ROOMTYPE_CONTROLLER;
                    }
                    else {
                        this.memory.roomType = ROOMTYPE_ALLEY;
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
    Room.prototype.findStructures = function(structureType: string): Structure[] {
        if (!Game.cache.structures[this.name]) Game.cache.structures[this.name] = {};
        if (!Game.cache.structures[this.name][structureType]) {
            Game.cache.structures[this.name][structureType] = this.find(FIND_STRUCTURES,
                {filter: {structureType: structureType}});
        }
        return Game.cache.structures[this.name][structureType];
    };

    /**
     * Finds creeps and containers in room that will give up energy, primarily useful when a storage is not available
     * Caches results on a per-tick basis. Useful before storage is available or in remote mining rooms.
     * @param roomObject - When this optional argument is supplied, return closest source
     * @returns {StructureContainer|Creep} - Returns source with highest amount of available energy, unless roomObject is
     * supplied
     */
    Room.prototype.getAltBattery = function(roomObject?: RoomObject): StructureContainer | Creep {
        if (!this.altBatteries) {
            let possibilities = [];
            let containers = this.findStructures(STRUCTURE_CONTAINER);
            for (let container of containers) {
                if (container.store.energy >= 50) {
                    possibilities.push(container);
                }
            }
            let creeps = this.find(FIND_MY_CREEPS, {filter: (c: Creep) => c.memory.donatesEnergy});
            for (let creep of creeps) {
                if (creep.carry.energy >= 50) {
                    possibilities.push(creep);
                }
            }
            if (this.terminal && this.terminal.store.energy >= 50) {
                possibilities.push(this.terminal);
            }
            this.altBatteries = _.sortBy(possibilities, (p: Creep | StructureContainer) => {
                return p.store.energy;
            });
        }
        if (roomObject) {
            return roomObject.pos.findClosestByRange(this.altBatteries) as StructureContainer | Creep;
        }
        else {
            return _.last(this.altBatteries) as StructureContainer | Creep;
        }
    };


    /**
     * Returns room coordinates for a given room
     * @returns {*}
     */

    Object.defineProperty(Room.prototype, "coords", {
        get: function myProperty() {
            if (!this.memory.coordinates) {
                this.memory.coordinates = helper.getRoomCoordinates(this.name);
            }
            return this.memory.coordinates;
        }
    });

    RoomPosition.prototype.isNearExit = function(range: number): boolean {
        return this.x - range <= 0 || this.x + range >= 49 || this.y - range <= 0 || this.y + range >= 49;
    };

    RoomPosition.prototype.getFleeOptions = function (roomObject: RoomObject): RoomPosition[] {
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

    RoomPosition.prototype.bestFleePosition = function (hostile: Creep, ignoreRoads = false, swampRat = false): RoomPosition {
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

                        options.push({position: option, preference: preference});
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
    RoomPosition.prototype.findClosestByRoomRange = function (roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition} {
        if (roomObjects.length === 0) return;
        let sorted = _.sortBy(roomObjects,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));
        return _.head(sorted);
    };

    /**
     * Returns the nearest object to the current position, works for objects that may not be in the same room;
     * @param roomObjects
     * @returns {any}
     */

    RoomPosition.prototype.findClosestByLongPath = function (roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition} {
        if (roomObjects.length === 0) return;

        let sorted = _.sortBy(roomObjects,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));

        let closestLinearDistance = Game.map.getRoomLinearDistance(sorted[0].pos.roomName, this.roomName);
        if (closestLinearDistance >= 5) {
            return sorted[0];
        }

        let acceptableRange = closestLinearDistance + 1;
        let filtered = _.filter(sorted,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName) <= acceptableRange);

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
    RoomPosition.prototype.openAdjacentSpots = function (ignoreCreeps?: boolean): RoomPosition[] {
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
    RoomPosition.prototype.getPositionAtDirection = function(direction: number, range?: number): RoomPosition {
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
    RoomPosition.prototype.isPassible = function(ignoreCreeps?: boolean): boolean {
        // look for walls
        if (_.head(this.lookFor(LOOK_TERRAIN)) !== "wall") {

            // look for creeps
            if (ignoreCreeps || this.lookFor(LOOK_CREEPS).length === 0) {

                // look for impassible structions
                if (_.filter(this.lookFor(LOOK_STRUCTURES), (struct: Structure) => {
                        return struct.structureType !== STRUCTURE_ROAD
                            && struct.structureType !== STRUCTURE_CONTAINER
                            && struct.structureType !== STRUCTURE_RAMPART;
                    }).length === 0 ) {

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
    RoomPosition.prototype.lookForStructure = function(structureType: string): Structure {
        let structures = this.lookFor(LOOK_STRUCTURES);
        return _.find(structures, {structureType: structureType}) as Structure;
    };

    /**
     *
     */
    RoomPosition.prototype.walkablePath = function (pos: RoomPosition): RoomPosition[] {
        let ret = PathFinder.search(this, { pos: pos, range: 1 }, {
            maxOps: 3000,
            plainCost: 2,
            swampCost: 10,
            roomCallback: (roomName: string) => {
                let room = Game.rooms[roomName];
                if (room) {

                    if (!room.basicMatrix) {
                        let costs = new PathFinder.CostMatrix();
                        let structures = room.find<Structure>(FIND_STRUCTURES);
                        for (let structure of structures) {
                            if (structure.structureType === STRUCTURE_ROAD) {
                                costs.set(structure.pos.x, structure.pos.y, 1);
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

    RoomPosition.prototype.getPathDistanceTo = function(pos: RoomPosition): number {
        let path = this.walkablePath(pos);
        if (path) {
            return path.length;
        }
        else {
            return Game.map.getRoomLinearDistance(pos.roomName, this.roomName) * 50;
        }
    };

    Creep.prototype.seekBoost = function(boosts: string[], allowUnboosted?: boolean): boolean {

        if (!boosts) return true;
        if (this.room.findStructures(STRUCTURE_LAB).length === 0) return true;

        let boosted = true;
        for (let boost of boosts) {
            if (this.memory[boost]) continue;

            let requests = this.room.memory.boostRequests;
            if (!requests) {
                this.memory[boost] = true;
                continue;
            }
            if (!requests[boost]) {
                requests[boost] = { flagName: undefined, requesterIds: [] };
            }

            // check if already boosted
            let boostedPart = _.find(this.body, {boost: boost});
            if (boostedPart) {
                this.memory[boost] = true;
                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.id);
                continue;
            }

            boosted = false;

            if (!_.includes(requests[boost].requesterIds, this.id)) {
                requests[boost].requesterIds.push(this.id);
            }

            if (this.spawning) continue;

            let flag = Game.flags[requests[boost].flagName];
            if (!flag) continue;

            let lab = flag.pos.lookForStructure(STRUCTURE_LAB) as StructureLab;

            if (lab.mineralType === boost && lab.mineralAmount >= IGOR_CAPACITY) {
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
                if (Game.time % 10 === 0) console.log("BOOST: no boost for", this.name,
                    " it will wait for some boost (allowUnboosted = false)");
                this.idleOffRoad(this.room.storage);
                return false;
            }
        }

        return boosted;
    };

            /* legacy boost code
            if (!this.memory[boost]) {
                let hasBoost = _.find(this.body, {boost: boost});
                if (hasBoost) {
                    this.memory[boost] = true;
                }

                else {
                    let labs = _.filter(this.room.findStructures(STRUCTURE_LAB), (lab: StructureLab) => {
                        return lab.resourceType === boost && lab.mineralAmount > 900;
                    }) as Lab[];
                    let notEnoughResources = false;
                    if (labs.length > 0) {
                        let boostLab = labs[0];
                        let outcome = boostLab.boostCreep(this);
                        if (outcome === ERR_NOT_IN_RANGE) {
                            this.blindMoveTo(boostLab);
                            return false;
                        }
                        else if (outcome === ERR_NOT_ENOUGH_RESOURCES) {
                            notEnoughResources = true;
                        }
                    }
                    else {
                        notEnoughResources = true;
                    }

                    if (notEnoughResources) {
                        if (allowUnboosted) {
                            // continue without boost
                            this.memory[boost] = true;
                        }
                        else {
                            let message = "ERROR, no " + boost + " was available for creep in " + this.room + " for " + this.name;
                            console.log(message);
                            Game.notify(message, 0);
                            return false;
                        }
                    }
                }
            }
            */

    Creep.prototype.fleeHostiles = function(pathFinding?: boolean): boolean {
        if (!this.fleeObjects) {
            let lairs = this.room.findStructures(STRUCTURE_KEEPER_LAIR);
            let fleeObjects = lairs.length > 0 ? this.room.hostilesAndLairs : this.room.hostiles;

            this.fleeObjects = _.filter(fleeObjects, (c: Creep): boolean => {
                if (c instanceof Creep) {
                    return _.find(c.body, (part: BodyPartDefinition) => {
                        return part.type === ATTACK || part.type === RANGED_ATTACK;
                    }) !== null;
                }
                else {
                    return true;
                }
            });
        }

        if (this.fleeObjects.length === 0) return false;
        let closest = this.pos.findClosestByRange(this.fleeObjects) as Creep;
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

    Creep.prototype.fleeByPath = function(roomObject: RoomObject): number {
        let avoidPositions = _.map(this.pos.findInRange(this.room.hostiles, 5),
            (c: Creep) => { return {pos: c.pos, range: 10 }; });

        let ret = PathFinder.search(this.pos, avoidPositions, {
            flee: true,
            maxRooms: 1,
            roomCallback: (roomName: string): CostMatrix => {
                if (roomName !== this.room.name) return;
                if (!this.room.structureMatrix) {
                    let matrix = new PathFinder.CostMatrix();
                    helper.addStructuresToMatrix(matrix, this.room);
                    if (this.controller && this.controller.my) {
                        for (let rampart of this.room.findStructures(STRUCTURE_RAMPART)) {
                            matrix.set(rampart.x, rampart.y, 1);
                        }
                    }
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
    Creep.prototype.blindMoveTo = function(destination: RoomPosition | {pos: RoomPosition}, ops?: any, dareDevil = false): number {

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
        if (!this.memory.lastTickMoving) this.memory.lastTickMoving = 0;
        if (Game.time - this.memory.lastTickMoving > 1) {
            movingLastTick = false;
        }
        this.memory.lastTickMoving = Game.time;

        // check if stuck
        let stuck = this.pos.inRangeTo(this.memory.position.x, this.memory.position.y, 0);
        this.memory.position = this.pos;
        if (stuck && movingLastTick) {
            if (!this.memory.stuckCount) this.memory.stuckCount = 0;
            this.memory.stuckCount++;
            if (dareDevil && this.memory.stuckCount > 0) {
                this.memory.detourTicks = 5;
            }
            else if (this.memory.stuckCount >= 2) {
                this.memory.detourTicks = 5;
                // this.say("excuse me", true);
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
    Creep.prototype.moveItOrLoseIt = function(position: RoomPosition, name?: string): number {
        if (this.fatigue > 0) { return OK; }
        let range = this.pos.getRangeTo(position);
        if (range === 0) return OK;
        if (range > 1) { return this.blindMoveTo(position); }

        // take care of creep that might be in the way
        let occupier = _.head(position.lookFor(LOOK_CREEPS)) as Creep;
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
    Creep.prototype.idleOffRoad = function(defaultPoint: RoomObject): number {
        if (this.memory.idlePosition) {
            let pos = helper.deserializeRoomPosition(this.memory.idlePosition);
            if (!this.pos.inRangeTo(pos, 0)) {
                return this.moveItOrLoseIt(pos);
            }
            return OK;
        }

        let offRoad = this.pos.lookFor(LOOK_STRUCTURES).length === 0;
        if (offRoad) return OK;

        let positions = this.pos.openAdjacentSpots();
        for (let position of positions) {
            if (position.lookFor(LOOK_STRUCTURES).length === 0 &&
                (!this.room.storage || !this.room.storage.pos.inRangeTo(position, 1))) {
                return this.move(this.pos.getDirectionTo(position));
            }
        }
        return this.blindMoveTo(defaultPoint);
    };

    /**
     * another function for keeping roads clear, this one is more useful for builders and road repairers that are
     * currently working, will move off road without going out of range of target
     * @param target - target for which you do not want to move out of range
     * @returns {number}
     */
    Creep.prototype.yieldRoad = function(target: RoomObject): number  {
        let isOnRoad = this.pos.lookFor(LOOK_STRUCTURES).length > 0;
        if (isOnRoad) {
            // find movement options
            let direction = this.pos.getDirectionTo(target);
            for (let i = -2; i <= 2; i++) {
                let relDirection = direction + i;
                relDirection = helper.clampDirection(relDirection);
                let position = this.pos.getPositionAtDirection(relDirection);
                if (!position.inRangeTo(target, 3)) continue;
                if (position.lookFor(LOOK_STRUCTURES).length > 0) continue;
                if (!position.isPassible()) continue;
                if (position.isNearExit(0)) continue;
                return this.move(relDirection);
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
    Creep.prototype.withdraw = function(target: Structure | Creep, resourceType: string, amount?: number): number {
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
    Creep.prototype.withdrawIfFull = function(target: Creep | StructureContainer | StructureStorage | StructureTerminal,
                                      resourceType: string): number {
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

    Creep.prototype.withdrawEverything = function (target: { store: StoreDefinition, pos: RoomPosition }): number {
        for (let resourceType in target.store) {
            let amount = target.store[resourceType];
            if (amount > 0) {
                return this.withdraw(target, resourceType);
            }
        }
        return ERR_NOT_ENOUGH_RESOURCES;
    };

    Creep.prototype.transferEverything = function (target: { store: StoreDefinition, pos: RoomPosition }): number {
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
     * @returns {Structure}
     */

    Creep.prototype.rememberStructure = function(findStructure: () => Structure, forget: (structure: Structure) => boolean, recursion = false): Structure {
        if (this.memory.remStructureId) {
            let structure = Game.getObjectById(this.memory.remStructureId) as Structure;
            if (structure && !forget(structure)) {
                return structure;
            }
            else {
                this.memory.remStructureId = undefined;
                return this.rememberStructure(findStructure, forget, true);
            }
        }
        else if (Game.time % 10 === 0 || recursion) {
            let object = findStructure();
            if (object) {
                this.memory.remStructureId = object.id;
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

    Creep.prototype.rememberCreep = function(findCreep: () => Creep, forget: (creep: Creep) => boolean): Creep {
        if (this.memory.remCreepId) {
            let creep = Game.getObjectById(this.memory.remCreepId) as Creep;
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
    Creep.prototype.rememberBattery = function (): Creep | StructureContainer {
        if (this.memory.batteryId) {
            let battery = Game.getObjectById(this.memory.batteryId) as Creep | StructureContainer;
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

    Creep.prototype.isNearExit = function(range: number): boolean {
        return this.pos.isNearExit(range);
    };

    Creep.prototype.travelByWaypoint = function(waypoints: Flag[]): number {
        if (!waypoints) return DESTINATION_REACHED;

        if (this.memory.waypointIndex === undefined) {
            this.memory.waypointIndex = 0;
        }

        if (this.memory.waypointIndex >= waypoints.length) return DESTINATION_REACHED;

        if (this.fatigue > 0) return ERR_BUSY;

        let waypoint = waypoints[this.memory.waypointIndex];
        if (waypoint.room && this.pos.inRangeTo(waypoint, 1)) {
            this.memory.waypointIndex++;
        }
        let waypointPortalPresent = _.filter(this.pos.lookFor(LOOK_FLAGS), (f: Flag) =>
            _.filter(f.pos.lookFor(LOOK_STRUCTURES), (s: Structure) => s.structureType === STRUCTURE_PORTAL).length > 0).length > 0;
        if (!waypointPortalPresent) {
            return this.avoidSK(waypoint);
        }
        else {
            console.log("####### waypointPortalPresent!", this.name, this.pos, Game.time);
        }
    };

    Creep.prototype.avoidSK = function(destination: {pos: RoomPosition}, opts?: any): number {
        let costCall = (roomName: string, costs: CostMatrix) => {
            if (roomName === this.room.name) {
                this.room.find(FIND_HOSTILE_CREEPS).forEach(function(keeper: Creep) {
                    if ( keeper.owner.username === "Source Keeper" ) {
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

        let options: FindPathOpts = {};
        if (this.room.roomType === ROOMTYPE_SOURCEKEEPER) {
            options.costCallback = costCall;
        }

        return this.blindMoveTo(destination, options);
    };

    Creep.prototype.partCount = function(partType: string): number {
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

    Creep.prototype.recycleSelf = function(container: StructureContainer) {

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

        let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS) as StructureSpawn;
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

    /**
     * Will remember an instance of structureType that it finds within range, good for storing mining containers, etc.
     * There should only be one instance of that structureType within range, per object
     * @param structureType
     * @param range
     * @returns {T}
     */
    RoomObject.prototype.findMemoStructure = function<T>(structureType: string, range: number): T {
        if (!this.room.memory[structureType]) this.room.memory[structureType] = {};
        if (this.room.memory[structureType][this.id]) {
            let structure = Game.getObjectById(this.room.memory[structureType][this.id]);
            if (structure) {
                return structure as T;
            }
            else {
                this.room.memory[structureType][this.id] = undefined;
            }
        }
        else if (Game.time % 10 === 7) {
            let structures = _.filter(this.pos.findInRange(FIND_STRUCTURES, range), (s: Structure) => {
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
    StructureController.prototype.getBattery = function (): StructureLink | StructureStorage | StructureContainer {
        if (this.room.memory.controllerBatteryId) {
            let batt = Game.getObjectById(this.room.memory.controllerBatteryId) as StructureLink | StructureStorage | StructureContainer;
            if (batt) {
                return batt;
            }
            else {
                this.room.memory.controllerBatteryId = undefined;
                this.room.memory.upgraderPositions = undefined;
            }
        }
        else if (Game.time % 10 === 7) {
            let battery = _(this.pos.findInRange(FIND_STRUCTURES, 4))
                .filter((structure: Structure) => { return (structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_STORAGE || structure.structureType === STRUCTURE_LINK);
                })
                .head() as Terminal | Link | Container;
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
    StructureController.prototype.getUpgraderPositions = function(): RoomPosition[] {
        if (this.upgraderPositions) {
            return this.upgraderPositions;
        }
        else {
            if (this.room.memory.upgraderPositions) {
                this.upgraderPositions = [];
                for (let position of this.room.memory.upgraderPositions) {
                    this.upgraderPositions.push(helper.deserializeRoomPosition(position));
                }
                return this.upgraderPositions;
            }
            else {
                let controller = this;
                let battery = this.getBattery();
                if (!battery) { return; }

                let positions = [];
                for (let i = 1; i <= 8; i++) {
                    let position = battery.pos.getPositionAtDirection(i);
                    if (!position.isPassible(true) || !position.inRangeTo(controller, 3)
                        || position.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    positions.push(position);
                }
                this.room.memory.upgraderPositions = positions;
                return positions;
            }
        }
    };

    StructureObserver.prototype._observeRoom = StructureObserver.prototype.observeRoom;

    StructureObserver.prototype.observeRoom = function(roomName: string, purpose = "unknown", override = false): number {
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
        get: function() {
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

    StructureTerminal.prototype.send = function(resourceType: string, amount: number, roomName: string, description?: string) {
        if (this.alreadySent) {
            return ERR_BUSY;
        }
        else {
            this.alreadySent = true;
            return this._send(resourceType, amount, roomName, description);
        }
    };
}