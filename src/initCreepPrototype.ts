import {IGOR_CAPACITY, DESTINATION_REACHED, ROOMTYPE_SOURCEKEEPER} from "./constants";
import {helper} from "./helper";
export function initCreepPrototype() {
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

            if (lab.mineralType === boost && lab.mineralAmount >= IGOR_CAPACITY && lab.energy >= IGOR_CAPACITY) {
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
        let swampPosition;
        for (let position of positions) {
            if (position.lookFor(LOOK_STRUCTURES).length === 0) {
                let terrain = position.lookFor(LOOK_TERRAIN)[0] as string;
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
    Creep.prototype.yieldRoad = function(target: RoomObject, allowSwamps = true): number  {
        let isOnRoad = this.pos.lookFor(LOOK_STRUCTURES).length > 0;
        if (isOnRoad) {
            let swampPosition;
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
     * @param prop
     * @returns {Structure}
     */

    Creep.prototype.rememberStructure = function(findStructure: () => Structure, forget: (structure: Structure) => boolean,
                                                 prop = "remStructureId", recursion = false): Structure {
        if (this.memory[prop]) {
            let structure = Game.getObjectById(this.memory[prop]) as Structure;
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
}