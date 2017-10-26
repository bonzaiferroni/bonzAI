import {Mission} from "../missions/Mission";
import {IGOR_CAPACITY} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {FleeData} from "../../interfaces";
import {Notifier} from "../../notifier";
import {empire} from "../Empire";
import {AbstractAgent} from "./AbstractAgent";
import {MemHelper} from "../../helpers/MemHelper";
import {Viz} from "../../helpers/Viz";
import {CreepHelper} from "../../helpers/CreepHelper";
import {ProcureEnergyOptions} from "./interfaces";
import {Tick} from "../../Tick";
import {Traveler} from "../../Traveler/Traveler";

export class Agent extends AbstractAgent {

    public memory: any;
    public mission: Mission;
    public missionRoom: Room;
    public outcome: number;
    public spawning: boolean;
    public name: string;
    public travData: TravelToReturnData;
    public isHealing: boolean;
    public isRangedHealing: boolean;
    public isAttacking: boolean;
    public isRangedAttacking: boolean;
    public isRangedMassAttacking: boolean;
    public isDismantling: boolean;

    constructor(creep: Creep, mission: Mission) {
        super(creep);
        this.mission = mission;
        this.missionRoom = mission.room;
        this.spawning = creep.spawning;
        this.name = creep.name;
    }

    public attackController(controller: StructureController): number { return this.creep.attackController(controller); }
    public build(target: ConstructionSite): number { return this.creep.build(target); }
    public claimController(controller: StructureController): number { return this.creep.claimController(controller); }
    public drop(resourceType: string, amount?: number): number { return this.creep.drop(resourceType, amount); }
    public getActiveBodyparts(type: string): number { return this.creep.getActiveBodyparts(type); }
    public harvest(source: Source|Mineral): number { return this.creep.harvest(source); }
    public move(direction: number): number { return this.creep.move(direction); }
    public pickup(resource: Resource): number { return this.creep.pickup(resource); }
    public repair(target: Structure): number { return this.creep.repair(target); }
    public reserveController(controller: StructureController): number {
        return this.creep.reserveController(controller); }
    public say(message: string, pub?: boolean): number { return this.creep.say(message, pub); }
    public suicide(): number { return this.creep.suicide(); }
    public upgradeController(controller: StructureController): number {
        return this.creep.upgradeController(controller); }
    public heal(target: Creep|Agent): number {
        let outcome;
        if (target instanceof Agent) {
            outcome = this.creep.heal(target.creep);
        } else {
            outcome = this.creep.heal(target);
        }
        this.isHealing = outcome === OK;
        return outcome;
    }
    public rangedHeal(target: Creep|Agent): number {
        let outcome;
        if (target instanceof Agent) {
            outcome = this.creep.rangedHeal(target.creep);
        } else {
            outcome = this.creep.rangedHeal(target);
        }
        this.isRangedHealing = outcome === OK;
        return outcome;
    }
    public attack(target: Creep|Structure): number {
        let outcome = this.creep.attack(target);
        this.isAttacking = outcome === OK;
        return outcome;
    }
    public dismantle(target: Structure): number {
        let outcome = this.creep.dismantle(target);
        this.isDismantling = outcome === OK;
        return outcome;
    }
    public rangedAttack(target: Creep|Structure): number {
        let outcome = this.creep.rangedAttack(target);
        this.isRangedAttacking = outcome === OK;
        return outcome;
    }
    public rangedMassAttack(): number {
        let outcome = this.creep.rangedMassAttack();
        this.isRangedMassAttacking = outcome === OK;
        return outcome;
    }
    public transfer(target: Creep|Structure, resourceType: string, amount?: number): number {
        return this.creep.transfer(target, resourceType, amount); }
    public withdraw(target: Creep|Structure, resourceType: string, amount?: number): number {
        if (target instanceof Creep) {
            return target.transfer(this.creep, resourceType, amount);
        } else {
            return this.creep.withdraw(target, resourceType, amount);
        }
    }
    public partCount(partType: string) { return CreepHelper.partCount(this.creep, partType); }

    public travelTo(destination: {pos: RoomPosition} | RoomPosition, options?: TravelToOptions): number {
        if (destination instanceof RoomPosition) { destination = {pos: destination}; }
        return Traveler.travelTo(this.creep, destination, options);
    }

    public isFull(margin = 0): boolean {
        return _.sum(this.carry) >= this.carryCapacity - margin;
    }

    public travelToAndBuild(site: ConstructionSite): number {
        this.idleNear(site);
        return this.build(site);
    }

    public retrieve(target: Creep|Structure, resourceType?: string, options?: TravelToOptions, amount?: number): number {
        if (this.pos.isNearTo(target)) {
            this.withdraw(target, resourceType, amount);
        } else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    public deliver(target: Creep|Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        if (this.pos.isNearTo(target)) {
            return this.transfer(target, resourceType, amount);
        } else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    public sumCarry(): number {
        if (!this.cache.sumCarry) {
            this.cache.sumCarry = _.sum(this.carry);
        }
        return this.cache.sumCarry;
    }

    public hasLoad(): boolean {
        if (this.carryCapacity === 0) { return false; }

        if (this.memory.hasLoad && this.sumCarry() === 0) {
            this.memory.hasLoad = false;
        } else if (!this.memory.hasLoad && this.sumCarry() === this.carryCapacity) {
            this.memory.hasLoad = true;
        }
        return this.memory.hasLoad;
    }

    public travelToRoom(roomName: string, options: TravelToOptions = {}) {
        options.range = 23;
        let destination = new RoomPosition(25, 25, roomName);
        return this.travelTo(destination, options);
    }

    /**
     * Can be used to keep idling creeps out of the way, like when a road repairer doesn't have any roads needing repair
     * or a spawn refiller who currently has full extensions.
     * @param anchor
     * @param maintainDistance
     * @returns {any}
     */
    public idleOffRoad(anchor: {pos: RoomPosition} = this.mission.flag, maintainDistance = false): number {
        let road = this.pos.lookForStructure(STRUCTURE_ROAD);
        if (!road) { return OK; }

        let positions = _.sortBy(this.pos.openAdjacentSpots(), (p: RoomPosition) => p.getRangeTo(anchor));
        if (maintainDistance) {
            let currentRange = this.pos.getRangeTo(anchor);
            positions = _.filter(positions, (p: RoomPosition) => p.getRangeTo(anchor) <= currentRange);
        }

        let swampPosition;
        for (let position of positions) {
            if (position.lookForStructure(STRUCTURE_ROAD)) { continue; }
            let terrain = position.lookFor(LOOK_TERRAIN)[0] as string;
            if (terrain === "swamp") {
                swampPosition = position;
            } else {
                return this.move(this.pos.getDirectionTo(position));
            }
        }

        if (swampPosition) {
            return this.move(this.pos.getDirectionTo(swampPosition));
        }

        return this.travelTo(anchor) as number;
    }

    public stealNearby(stealSource: string, excludeRole?: string): number {
        if (this.carry.energy > this.carryCapacity * .8) { return OK; }
        if (stealSource === "creep") {
            let creep = _(this.pos.findInRange<Creep>(FIND_MY_CREEPS, 1))
                .filter((c: Creep) => (!excludeRole || c.name.indexOf(excludeRole) < 0)
                && c.getActiveBodyparts(WORK) === 0 && c.carry.energy > 0)
                .head();
            if (!creep) { return ERR_NOT_IN_RANGE; }
            return creep.transfer(this.creep, RESOURCE_ENERGY);
        } else {
            let structure = _(this.pos.findInRange<Structure>(
                this.creep.room.findStructures<Structure>(stealSource), 1))
                .filter((s: {energy: number}) => s.energy > 0)
                .head();
            if (!structure) { return ERR_NOT_IN_RANGE; }
            return this.withdraw(structure, RESOURCE_ENERGY);
        }
    }

    public idleNear(place: {pos: RoomPosition}, acceptableRange = 1, cachePos = false, allowSwamp = true,
                    options: TravelToOptions = {}): number {
        let range = this.pos.getRangeTo(place);

        if (range <= acceptableRange && !this.pos.lookForStructure(STRUCTURE_ROAD)) {
            return;
        }

        if (range <= acceptableRange + 1) {
            let swampDirection;
            // find movement options
            let direction = this.creep.pos.getDirectionTo(place);
            for (let i = -2; i <= 2; i++) {
                let relDirection = direction + i;
                relDirection = helper.clampDirection(relDirection);
                let position = this.creep.pos.getPositionAtDirection(relDirection);
                if (position.isNearExit(0)) { continue; }
                if (!position.inRangeTo(place, acceptableRange)) { continue; }
                if (position.lookForStructure(STRUCTURE_ROAD)) { continue; }
                if (!position.isPassible()) { continue; }
                if (position.lookFor(LOOK_TERRAIN)[0] === "swamp") {
                    swampDirection = relDirection;
                    continue;
                }
                delete this.memory._trav;
                return this.creep.move(relDirection);
            }
            if (swampDirection && allowSwamp) {
                delete this.memory._trav;
                return this.creep.move(swampDirection);
            }
        }

        if (cachePos) {
            return this.travelTo(this.cacheIdlePosition(place, acceptableRange), options);
        }

        if (range <= 1) {
            let position = this.findIdlePosition(place, acceptableRange);
            if (!position) { return; }
            return this.travelTo({pos: position});
        }

        return this.travelTo(place, options);
    }

    private cacheIdlePosition(place: {pos: RoomPosition}, acceptableRange: number): RoomPosition {
        if (this.memory.idlePos) {
            let position = MemHelper.deserializeIntPosition(this.memory.idlePos, this.room.name);
            let range = position.getRangeTo(place);
            if (range === 0) {
                return position;
            }
            if (range <= acceptableRange && position.isPassible()) {
                return position;
            } else {
                this.memory.idlePos = undefined;
                return this.cacheIdlePosition(place, acceptableRange);
            }
        } else {
            let position = this.findIdlePosition(place, acceptableRange);
            if (position) {
                this.memory.idlePos = MemHelper.intPosition(position);
                return position;
            } else {
                console.log(`AGENT: no idlepos within range ${acceptableRange} near ${place.pos}`);
                return place.pos;
            }
        }
    }

    private findIdlePosition(place: {pos: RoomPosition}, acceptableRange: number): RoomPosition {
        let radius = 0;
        let validPositions = [];
        while (radius <= acceptableRange) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    if (Math.abs(xDelta) < radius && Math.abs(yDelta) < radius) { continue; }
                    let x = place.pos.x + xDelta;
                    let y = place.pos.y + yDelta;
                    let position = new RoomPosition(x, y, place.pos.roomName);
                    if (!position.isPassible()) { continue; }
                    if (position.isNearExit(0)) { continue; }
                    if (position.lookForStructure(STRUCTURE_ROAD)) { continue; }
                    validPositions.push(position);
                }
            }
            radius++;
        }
        return this.pos.findClosestByRange(validPositions);
    }

    public isNearTo(place: {pos: RoomPosition} | RoomPosition) {
        return this.pos.isNearTo(place);
    }

    public seekBoost(boosts: string[], allowUnboosted: boolean) {
        if (!boosts) { return true; }
        if (this.room.findStructures(STRUCTURE_LAB).length === 0) { return true; }
        if (this.room.controller.level < 6) { return true; }

        let boosted = true;
        for (let boost of boosts) {
            if (this.memory[boost]) { continue; }

            let requests = this.room.memory.boostRequests;
            if (!requests) {
                this.memory[boost] = true;
                continue;
            }
            if (!requests[boost]) {
                requests[boost] = { flagName: undefined, requesterIds: [] };
            }

            // check if already boosted
            let boostedPart = _.find(this.creep.body, {boost: boost});
            if (boostedPart) {
                this.memory[boost] = true;
                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.creep.id);
                continue;
            }

            boosted = false;

            if (!_.includes(requests[boost].requesterIds, this.creep.id)) {
                requests[boost].requesterIds.push(this.creep.id);
            }

            if (this.creep.spawning) { continue; }

            let lab = _(this.room.findStructures<StructureLab>(STRUCTURE_LAB))
                .filter(x => x.mineralType === boost && x.mineralAmount >= IGOR_CAPACITY
                && x.energy >= IGOR_CAPACITY)
                .max(x => x.mineralAmount);

            if (_.isObject(lab)) {
                if (this.pos.isNearTo(lab)) {
                    let outcome = lab.boostCreep(this.creep);
                    if (outcome === ERR_RCL_NOT_ENOUGH) {
                        return true;
                    }
                } else {
                    this.travelTo(lab);
                    return false;
                }
            } else if (allowUnboosted) {
                console.log("BOOST: no boost for", this.creep.name, " so moving on (allowUnboosted = true)");
                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.creep.id);
                this.memory[boost] = true;
            } else {
                if (Game.time % 10 === 0) {
                    console.log(`BOOST: no ${boost} for ${this.creep.name}, it will wait (allowUnboosted = false)`);
                }
                if (!this.creep.room.terminal.store[boost] || this.creep.room.terminal.store[boost] < 1000) {
                    empire.network.sendBoost(boost, this.room.name);
                }
                this.idleOffRoad(this.missionRoom.storage);
                return false;
            }
        }

        return boosted;
    }

    public avoidSK(destination: {pos: RoomPosition}, options: TravelToOptions = {}): number {
        return CreepHelper.avoidSK(this.creep, destination, options);
    }

    public resetPrep() {
        this.memory.prep = false;
    }

    public fleeHostiles(fleeRange = 6, fleeDelay = 2, confineToRoom = false, peekaboo = false): boolean {
        if (this.room.controller && this.room.controller.my && this.room.controller.safeMode) { return false; }
        let value = this.fleeByPath(this.room.fleeObjects, fleeRange, fleeDelay, confineToRoom, peekaboo);
        return value;
    }

    public clearFleeData() {
        delete this.memory._flee;
    }

    public fleeByPath(fleeObjects: {pos: RoomPosition}[], fleeRange: number, fleeDelay: number,
                      confineToRoom = false, peekaboo = false): boolean {

        let closest = this.pos.findClosestByRange(fleeObjects);
        let rangeToClosest = 50;
        if (closest) { rangeToClosest = this.pos.getRangeTo(closest); }

        if (rangeToClosest > fleeRange) {
            if (!this.memory._flee) {
                return false; // where most creeps exit function
            }

            let fleeData = this.memory._flee;

            if (this.pos.isNearExit(0) && !peekaboo) {
                this.moveOffExit();
                return true;
            }

            if (fleeData.delay <= 0) {
                delete this.memory._flee;
                return false; // safe to resume
            }
            fleeData.delay--;

            return true;
        }

        if (this.fatigue > 0) {
            if (closest instanceof Creep && rangeToClosest < fleeRange - 1) {
                let moveCount = this.getActiveBodyparts(MOVE);
                let dropAmount = this.carry.energy - (moveCount * CARRY_CAPACITY);
                this.drop(RESOURCE_ENERGY, dropAmount);
            }
            return true;
        }

        if (!this.memory._flee) { this.memory._flee = {} as FleeData; }

        let fleeData = this.memory._flee as FleeData;
        fleeData.delay = fleeDelay;

        if (peekaboo && this.pos.isNearExit(0)) {
            return true;
        }

        if (fleeData.nextPos) {
            let position = helper.deserializeRoomPosition(fleeData.nextPos);
            if (this.arrivedAtPosition(position) && fleeData.path) {
                fleeData.path = fleeData.path.substr(1);
            } else {
                fleeData.path = undefined;
            }
        }

        if (fleeData.path) {
            if (fleeData.path.length > 0) {
                let nextDirection = parseInt(fleeData.path[0], 10);
                let position = this.pos.getPositionAtDirection(nextDirection);
                if (!position.isNearExit(0) &&
                    position.findClosestByRange(fleeObjects).pos.getRangeTo(position) < rangeToClosest) {
                    fleeData.path = undefined;
                } else {
                    this.move(nextDirection);
                    fleeData.nextPos = position;
                    return true;
                }
            } else {
                fleeData.path = undefined;
            }
        }

        if (!fleeData.path) {
            let avoidance = _.map(fleeObjects, obj => { return {pos: obj.pos, range: Math.max(fleeRange, 10) }; });

            let ret = PathFinder.search(this.pos, avoidance, {
                flee: true,
                maxRooms: confineToRoom ? 1 : undefined,
                roomCallback: (roomName: string): CostMatrix|boolean => {
                    if (Traveler.checkAvoid(roomName)) { return false; }
                    if (roomName === this.room.name) { return Traveler.getCreepMatrix(this.room); }
                    return Traveler.getStructureMatrix(roomName);
                },
            });

            if (ret.path.length === 0) { return true; }

            fleeData.path = Traveler.serializePath(this.pos, ret.path, "purple");
        }

        let nextDirection = parseInt(fleeData.path[0], 10);
        fleeData.nextPos = this.pos.getPositionAtDirection(nextDirection);
        this.move(nextDirection);
        return true;
    }

    public retreat(avoidObjects?: {pos: RoomPosition}[], fleeRange = 5): number {
        if (!avoidObjects) {
            avoidObjects = this.room.fleeObjects;
        }

        let avoidance = _.map(this.pos.findInRange(avoidObjects, fleeRange + 1),
            (c: Creep) => { return {pos: c.pos, range: 20 }; });

        let ret = PathFinder.search(this.pos, avoidance, {
            flee: true,
            roomCallback: (roomName: string): CostMatrix|boolean => {
                if (Traveler.checkAvoid(roomName)) { return false; }
                if (roomName === this.room.name) { return Traveler.getCreepMatrix(this.room); }
                return Traveler.getStructureMatrix(roomName);
            },
        });

        if (ret.path.length > 0) {
            return this.creep.move(this.pos.getDirectionTo(ret.path[0]));
        } else {
            return OK;
        }
    }

    /**
     * Moves a creep to a position using creep.blindMoveTo(position), when at range === 1 will remove any occuping creep
     * @param position
     * @param name - if given, will suicide the occupying creep if string occurs anywhere in name
     * and will transfer any resources in creeps' carry
     * @param lethal - will suicide the occupying creep
     * @param options
     * @returns {number}
     */
    public moveItOrLoseIt(position: RoomPosition, name?: string, lethal = true, options?: TravelToOptions): number {
        if (this.creep.fatigue > 0) { return OK; }
        let range = this.pos.getRangeTo(position);
        if (range === 0) { return OK; }
        if (range > 1) { return this.travelTo(position, options); }

        // take care of creep that might be in the way
        let occupier = _.head(position.lookFor<Creep>(LOOK_CREEPS));
        if (occupier && occupier.name) {
            if (name && occupier.name.indexOf(`_${name}_`) >= 0) {
                if (lethal) {
                    for (let resourceType in occupier.carry) {
                        let amount = occupier.carry[resourceType];
                        if (amount > 0) {
                            occupier.transfer(this.creep, resourceType);
                        }
                    }
                    this.creep.say("bonzaii!", true);
                    occupier.suicide();
                }
            } else {
                let direction = occupier.pos.getDirectionTo(this);
                occupier.move(direction);
                this.creep.say("move it", true);
            }
        }

        // move
        let direction = this.pos.getDirectionTo(position);
        this.creep.move(direction);
    }

    /**
     * another function for keeping roads clear, this one is more useful for builders and road repairers that are
     * currently working, will move off road without going out of range of target
     * @param target - target for which you do not want to move out of range
     * @param allowSwamps
     * @returns {number}
     */
    public yieldRoad(target: {pos: RoomPosition}, allowSwamps = true): number  {
        let isOffRoad = this.pos.lookForStructure(STRUCTURE_ROAD) === undefined;
        if (isOffRoad) { return OK; }

        let swampPosition;
        // find movement options
        let direction = this.pos.getDirectionTo(target);
        for (let i = -2; i <= 2; i++) {
            let relDirection = direction + i;
            relDirection = helper.clampDirection(relDirection);
            let position = this.pos.getPositionAtDirection(relDirection);
            if (!position.inRangeTo(target, 3)) { continue; }
            if (position.lookFor(LOOK_STRUCTURES).length > 0) { continue; }
            if (!position.isPassible()) { continue; }
            if (position.isNearExit(0)) { continue; }
            if (position.lookFor(LOOK_TERRAIN)[0] === "swamp") {
                swampPosition = position;
                continue;
            }
            return this.move(relDirection);
        }
        if (swampPosition && allowSwamps) {
            return this.move(this.pos.getDirectionTo(swampPosition));
        }
        return this.travelTo(target);
    };

    /**
     * Only withdraw from a store-holder if there is enough resource to transfer (or if holder is full)
     * @param target
     * @param resourceType
     * @returns {number}
     */
    public withdrawIfFull(target: Creep|StructureContainer|StructureStorage|StructureTerminal,
                          resourceType: string): number {
        if (!this.pos.isNearTo(target)) {
            return ERR_NOT_IN_RANGE;
        }

        let norm = Agent.normalizeStore(target);
        let storageAvailable = this.carryCapacity - _.sum(this.carry);
        let targetStorageAvailable = norm.storeCapacity - _.sum(norm.store);
        if (norm.store[resourceType] >= storageAvailable || targetStorageAvailable === 0) {
            return this.withdraw(target, resourceType);
        } else {
            return ERR_NOT_ENOUGH_RESOURCES;
        }
    };

    public static normalizeStore(target: Creep|StructureContainer|StructureStorage|StructureTerminal): {
        store: StoreDefinition,
        storeCapacity: number
    } {
        let store;
        let storeCapacity;
        if (target instanceof Creep) {
            store = target.carry;
            storeCapacity = target.carryCapacity;
        } else {
            store = target.store;
            storeCapacity = target.storeCapacity;
        }
        return {store: store, storeCapacity: storeCapacity };
    }

    public withdrawEverything(target: Creep|StructureContainer|StructureStorage|StructureTerminal): number {
        let norm = Agent.normalizeStore(target);
        for (let resourceType in norm.store) {
            let amount = norm.store[resourceType];
            if (amount > 0) {
                return this.withdraw(target, resourceType);
            }
        }
        return ERR_NOT_ENOUGH_RESOURCES;
    };

    public transferEverything(target: Creep|StructureContainer|StructureStorage|StructureTerminal): number {
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
     * @param immediate
     * @param prop
     * @returns {Structure}
     */

    public rememberStructure(findStructure: () => Structure, forget: (structure: Structure) => boolean,
                             prop = "remStructureId", immediate = false): Structure {
        if (this.memory[prop]) {
            let structure = Game.getObjectById(this.memory[prop]) as Structure;
            if (structure && !forget(structure)) {
                return structure;
            } else {
                this.memory[prop] = undefined;
                return this.rememberStructure(findStructure, forget, prop, true);
            }
        } else if (Game.time % 10 === 0 || immediate) {
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

    public rememberCreep(findCreep: () => Creep, forget: (creep: Creep) => boolean): Creep {
        if (this.memory.remCreepId) {
            let creep = Game.getObjectById(this.memory.remCreepId) as Creep;
            if (creep && !forget(creep)) {
                return creep;
            } else {
                this.memory.remCreepId = undefined;
                return this.rememberCreep(findCreep, forget);
            }
        } else {
            let object = findCreep();
            if (object) {
                this.memory.remCreepId = object.id;
                return object;
            }
        }
    };

    /**
     * Pass in position of recycle bin (aka container next to spawn) and will creep go recycle itself there
     * @param container
     */

    public recycleSelf(container: StructureContainer) {

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
            this.travelTo(container, { range: 0 });
            console.log(this.name, " is heading to recycle bin");
            return;
        }

        let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS) as StructureSpawn;
        if (!spawn) {
            console.log("recycleBin is missing spawn in", this.room.name);
            return;
        }

        let recycleOutcome = spawn.recycleCreep(this.creep);
        if (recycleOutcome === OK) {
            console.log(this.pos.roomName, " recycled creep ", this.name);
        } else if (recycleOutcome === -9) {
            console.log(this.name, " is moving to recycle bin at ", container.pos);
            this.travelTo(container, { range: 0 });
            return;
        } else {
            console.log(this.room.name, " recycling error: ", recycleOutcome);
        }
        return;
    };

    /**
     * General-purpose energy getting, will look for an energy source in the same missionRoom as the operation flag
     * ahead of any other creeps trying to get energy
     * @param options
     */

    public procureEnergy(options: ProcureEnergyOptions = {}) {
        let supply = this.getSupply(options);
        if (!supply) {
            let droppedEnergy = this.pos.findClosestByRange<Resource>(FIND_DROPPED_RESOURCES);
            if (droppedEnergy) {
                if (this.isNearTo(droppedEnergy)) {
                    this.pickup(droppedEnergy);
                } else {
                    this.travelTo(droppedEnergy);
                }
                return;
            }
        }

        if (!supply) {
            if (options.getFromSource) {
                let sources = _.filter(this.mission.state.sources,
                    x => x.energy > 0 && x.pos.openAdjacentSpots().length > 0);
                let closest = this.pos.findClosestByRange<Source>(sources);
                if (closest) {
                    if (this.pos.isNearTo(closest)) {
                        this.harvest(closest);
                    } else {
                        this.travelTo(closest);
                    }
                } else {
                    this.idleOffRoad();
                }
            } else {
                if (options.getFromSpawnRoom) {
                    this.travelTo(this.mission.spawnGroup.room.storage);
                } else {
                    if (this.travData && this.travData.state) {
                        // travel toward wherever you were going last tick
                        this.idleOffRoad({pos: this.travData.state.destination}, true);
                    } else {
                        this.idleOffRoad();
                    }
                }
            }
            return;
        }

        if (!this.pos.isNearTo(supply)) {
            if (this.room === supply.room) {
                this.travelTo(supply, {maxRooms: 1});
            } else {
                this.travelTo(supply);
            }
            return;
        }

        let outcome;
        if (options.highPriority) {
            if (Agent.normalizeStore(supply).store.energy >= 50) {
                outcome = this.withdraw(supply, RESOURCE_ENERGY);
            }
        } else {
            outcome = this.withdrawIfFull(supply, RESOURCE_ENERGY);
        }
        if (outcome === OK) {
            this.memory.supplyId = undefined;
            if (options.nextDestination) {
                let nextDestination = options.nextDestination(this);
                if (nextDestination) {
                    if (this.pos.roomName === nextDestination.pos.roomName) {
                        this.travelTo(nextDestination, {maxRooms: 1});
                    } else {
                        this.travelTo(nextDestination);
                    }
                }
            }
            if (supply instanceof Creep) {
                supply.memory.donating = undefined;
            }
        }
    }

    public nextPositionInPath(): RoomPosition {
        if (this.travData && this.travData.nextPos && !this.travData.nextPos.isNearExit(0)) {
            return this.travData.nextPos;
        }
    }

    /**
     * Will return storage if it is available, otherwise will look for an alternative battery and cache it
     * @returns {any}
     * @param options
     */

    private getSupply(options: ProcureEnergyOptions): StoreStructure|Creep {
        let minEnergy = this.carryCapacity - this.carry.energy;
        if (this.room.storage && this.room.storage.store.energy > minEnergy) {
            return this.room.storage;
        }

        if (this.memory.supplyId) {
            let supply = Game.getObjectById<StoreStructure|Creep>(this.memory.supplyId);
            let valid = false;
            if (supply) {
                if (supply instanceof Structure) {
                    valid = supply.store.energy >= minEnergy;
                } else {
                    valid = supply.carry.energy > 0;
                }
            }
            if (valid) {
                return supply;
            } else {
                this.memory.supplyId = undefined;
                return this.getSupply(options);
            }
        } else {

            if (this.memory.nextSupplyCheck > Game.time) {
                return;
            }

            let suppliers = this.findEnergySuppliers(minEnergy, options);
            let availableEnergy = (x: StoreStructure|Creep) => {
                if (x instanceof Creep) {
                    return x.carry.energy || 0;
                } else {
                    return x.store.energy || 0;
                }
            };

            let best = _.min(suppliers, x => x.pos.getRangeTo(this) * 100 - availableEnergy(x));

            if (_.isObject(best)) {
                this.memory.nextSupplyCheck = undefined;
                this.memory.supplyId = best;
                return best;
            } else {
                this.memory.nextSupplyCheck = Game.time + 5 + Math.floor(Math.random() * 5);
            }
        }
    }

    private findEnergySuppliers(minEnergy: number, options: ProcureEnergyOptions): (StoreStructure|Creep)[] {
        if (options.supply) {
            return options.supply;
        }

        let structures = _.filter(this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER),
            x => x.store.energy >= minEnergy &&
            (!x.room.controller || x.pos.getRangeTo(x.room.controller) > 3 || x.pos.findInRange(FIND_SOURCES, 1).length > 0));
        if (this.room.terminal && this.room.terminal.store.energy >= minEnergy) {
            structures.push(this.room.terminal);
        }
        if (structures.length > 0) {
            return structures;
        }

        return _.filter(this.room.find<Creep>(FIND_MY_CREEPS), x => x.memory.donatesEnergy && x.carry.energy >= minEnergy);
    }

    public findDeliveryTarget(roomName: string): Creep|Structure {
        let room = Game.rooms[roomName];
        if (!room) {
            this.travelToRoom(roomName);
            return;
        }

        if (this.room.storage && this.room.storage.my && this.room.controller.level >= 4) {
            return this.room.storage;
        }

        if (this.memory.deliverId) {
            let target = Game.getObjectById<Creep|StructureContainer|EnergyStructure>(this.memory.deliverId);
            let targetEmpty = true;
            let nonEssential = false;
            if (target) {
                if (target instanceof Creep) {
                    if (!target.memory.deliverTo) {
                        this.memory.deliverId = undefined;
                        return;
                    }
                    targetEmpty = target.carry[RESOURCE_ENERGY] <= target.carryCapacity - 25;
                    nonEssential = true;
                } else if (target instanceof StructureContainer) {
                    targetEmpty = target.store[RESOURCE_ENERGY] <= target.storeCapacity - 50;
                    nonEssential = true;
                } else {
                    targetEmpty = target.energy < target.energyCapacity;
                }
            } else {
                this.memory.deliverId = undefined;
                return this.findDeliveryTarget(roomName);
            }

            if (nonEssential) {
                let spawnGroup = empire.getSpawnGroup(roomName);
                if (empire && Math.random() > ((spawnGroup.currentSpawnEnergy / spawnGroup.maxSpawnEnergy) * .2) + .8) {
                    this.memory.deliverId = undefined;
                }
            }

            if (roomName !== this.pos.roomName || targetEmpty) {
                return target;
            } else if (Math.random() < .2) {
                this.memory.deliverId = undefined;
            }

        } else {
            let potentialTargets = this.findPotentialDeliveryTargets(room);
            let best = this.chooseDeliveryTarget(room, potentialTargets);
            if (best) {
                this.memory.deliverId = best.id;
                return best;
            }
        }
    }

    private findPotentialDeliveryTargets(room: Room): (Creep|Structure)[] {
        if (!Tick.temp.deliveryCache) { Tick.temp.deliveryCache = {}; }
        if (Tick.temp.deliveryCache[room.name]) { return Tick.temp.deliveryCache[room.name]; }

        let potentialTargets: (Creep|Structure)[] = [];
        potentialTargets = potentialTargets.concat(room.findStructures<StructureSpawn>(STRUCTURE_SPAWN));
        potentialTargets = potentialTargets.concat(room.controller.pos.findInRange(
            this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER), 3));
        potentialTargets = potentialTargets.concat(room.findStructures<StructureTower>(STRUCTURE_TOWER));
        potentialTargets = potentialTargets.concat(room.findStructures<StructureExtension>(STRUCTURE_EXTENSION));
        potentialTargets = potentialTargets.concat(_.filter(room.find<Creep>(FIND_MY_CREEPS),
            x => x.memory.deliverTo === true));

        Tick.temp.deliveryCache[room.name] = potentialTargets;
        return potentialTargets;
    }

    private chooseDeliveryTarget(room: Room, potentialTargets: (Creep|Structure)[]): Creep|Structure {
        let best = _.max(potentialTargets, x => {
            let capacity = 0;
            let capacityAvailable = 0;
            if (x instanceof Creep) {
                capacity = x.carryCapacity;
                if (x.carry[RESOURCE_ENERGY]) {
                    capacityAvailable = (x.carryCapacity * .9 - x.carry[RESOURCE_ENERGY]) * 2;
                } else {
                    capacityAvailable = x.carryCapacity;
                }
            } else if (x instanceof StructureSpawn || x instanceof StructureExtension) {
                capacity = x.energyCapacity;
                capacityAvailable = (x.energyCapacity - x.energy) * 10;
            } else if (x instanceof StructureTower) {
                capacityAvailable = x.energyCapacity - x.energy;
            } else if (x instanceof StructureContainer) {
                if (x.store[RESOURCE_ENERGY]) {
                    capacityAvailable = (x.storeCapacity - x.store[RESOURCE_ENERGY]) * .25;
                } else {
                    capacityAvailable = x.storeCapacity * .25;
                }
            }

            let score = (capacity * .1 * Math.random()) + capacityAvailable;

            if (this.room === room) {
                let range = this.pos.getRangeTo(x);
                if (range < 5 && capacityAvailable > 0) {
                    score += (5 - range) * capacityAvailable * 10;
                } else {
                    score -= range;
                }
            }
            return score;
        });

        if (_.isObject(best)) {
            return best;
        }
    }

    public static squadTravel(leader: Agent, follower: Agent, target: HasPos|RoomPosition,
                              options?: TravelToOptions, allowedRange = 1): number {

        let outcome;
        if (leader.room !== follower.room) {
            if (leader.pos.isNearExit(0)) {
                outcome = leader.travelTo(target, options);
            }
            follower.travelTo(leader);
            return outcome;
        }

        let range = leader.pos.getRangeTo(follower);
        if (range > allowedRange) {
            if (follower.pos.isNearExit(0) && follower.room === leader.room) {
                follower.moveOffExitToward(leader);
            } else {
                follower.travelTo(leader, {stuckValue: 1});
            }
            // attacker stands still
        } else if (follower.fatigue === 0) {
            outcome = leader.travelTo(target, options);
            if (range === 1) {
                follower.move(follower.pos.getDirectionTo(leader));
            } else {
                follower.travelTo(leader, {stuckValue: 1});
            }
        }
        return outcome;
    }

    public capacityAvailable(container: Creep|StructureContainer|StructureTerminal|StructureStorage) {
        let norm = Agent.normalizeStore(container);
        return _.sum(this.carry) <= norm.storeCapacity - _.sum(norm.store);
    }

    public standardAgentHealing(agents: Agent[]): number {
        return this.standardHealing(_.map(agents, x => x.creep));
    }

    public standardHealing(creeps?: Creep[], conserveRanged = false): number {
        if (!creeps) {
            creeps = this.room.find<Creep>(FIND_MY_CREEPS);
        }

        let bestHealScore = -Number.MAX_VALUE;
        let bestHealTarget: Creep;
        for (let creep of creeps) {
            if (!creep.hitsTemp) {
                creep.hitsTemp = creep.hits;
            }
            let range = this.pos.getRangeTo(creep);
            if (conserveRanged && range > 1 && creep.hitsTemp > creep.hitsMax * .8) { continue; }
            let healScore = creep.hitsMax - creep.hitsTemp;
            if (range > 1) {
                if (this.hits < this.hitsMax * .5) { continue; }
                healScore -= 1000;
            }
            if (healScore > bestHealScore) {
                bestHealScore = healScore;
                bestHealTarget = creep;
            }
        }

        let outcome;
        let range = this.pos.getRangeTo(bestHealTarget);
        if (range <= 1) {
            outcome = this.heal(bestHealTarget);
        } else {
            outcome = this.rangedHeal(bestHealTarget);
        }
        if (outcome === OK) {
            bestHealTarget.hitsTemp += this.expectedHealingAtRange(range);
        }
        return outcome;
    }

    public standardRangedAttack(hostiles?: Creep[]): number {
        if (!hostiles) {
            hostiles = this.room.hostiles;
        }
        let hostilesInRange = _(this.pos.findInRange<Creep>(hostiles, 3))
            .filter(x => !x.pos.lookForStructure(STRUCTURE_RAMPART))
            .sortBy(creep => {
                if (!creep.hitsTemp) { creep.hitsTemp = creep.hits; }
                return creep.hitsTemp - creep.hitsMax;
            })
            .value();
        if (hostilesInRange.length === 0) {
            if (this.pos.findInRange(hostiles, 3).length > 0) {
                console.log(`AGENT: error in standard ranged attack ${this.room.name}`);
            }
            return ERR_NOT_IN_RANGE;
        }

        let closest = this.pos.findClosestByRange(hostilesInRange);
        if (this.pos.isNearTo(closest) || this.massAttackDamage() >= 10) {
            let outcome = this.rangedMassAttack();
            this.say(`1 ${outcome} ${closest.hits}`);
            for (let hostile of hostilesInRange) {
                hostile.hitsTemp -= this.expectedMassDamage(hostile);
            }
        } else {
            let outcome = this.rangedAttack(hostilesInRange[0]);
            this.say(`2 ${outcome} ${closest.hits}`);
            hostilesInRange[0].hitsTemp -= this.getPotential(RANGED_ATTACK);
        }
    }

    public standardMelee(hostiles?: Creep[], damageThreshold = 0): number {
        if (!hostiles) {
            hostiles = this.room.hostiles;
        }

        if (this.hits < damageThreshold) {
            return ERR_BUSY;
        }

        let bestTarget = _(this.pos.findInRange<Creep>(hostiles, 1))
            .max(x => {
                if (!x.hitsTemp) {
                    x.hitsTemp = x.hits;
                }
                return x.hitsMax - x.hitsTemp + CreepHelper.partCount(x, HEAL) - CreepHelper.partCount(x, ATTACK);
            });
        if (!_.isObject(bestTarget)) {
            return ERR_NOT_IN_RANGE;
        }
        let outcome = this.attack(bestTarget);
        if (outcome === OK) {
            let potential = this.getPotential(ATTACK);
            bestTarget.hitsTemp -= potential;
        }
        return outcome;
    }

    private arrivedAtPosition(position: RoomPosition) {
        if (this.pos.getRangeTo(position) === 0) {
            return true;
        }

        if (this.pos.isNearExit(0) && position.isNearExit(0)) {
            return true;
        }

        return false;
    }

    public isStuck() {
        return this.travData && this.travData.state && this.travData.state.stuckCount >= 2;
    }

    public pushyTravelTo(destination: {pos: RoomPosition}, exclusion?: string, options: TravelToOptions = {}) {
        if (this.isStuck()) {
            options.returnData = {};
            this.travelTo(destination, options);
            if (options.returnData.nextPos) {
                let creep = options.returnData.nextPos.lookFor<Creep>(LOOK_CREEPS)[0];
                if (creep && creep.my && (!exclusion || creep.name.indexOf(exclusion) < 0)) {
                    Notifier.log(`pushed creep ${creep.pos}`);
                    this.say("excuse me", true);
                    creep.move(creep.pos.getDirectionTo(this));
                }
            }
        } else {
            this.travelTo(destination, options);
        }
    }

    public get shield(): {hits: number, hitsMax: number} {
        return CreepHelper.shield(this.creep);
    }

    public get rangeToEdge(): number {
        if (this.cache.rangeToEdge !== undefined) { return this.cache.rangeToEdge; }

        let range = Math.min(this.pos.x, this.pos.y, 49 - this.pos.x, 49 - this.pos.y);

        this.cache.rangeToEdge = range;
        return range;
    }

    /**
     * Assumes creep is near exit tile. Moves on to that tile, prefering a perpendicular direction
     */

    public moveOnExit() {
        if (this.rangeToEdge === 0) { return; }
        if (this.fatigue > 0) { return; }
        let directions = [1, 3, 5, 7, 2, 4, 6, 8];
        for (let direction of directions) {
            let position = this.pos.getPositionAtDirection(direction);
            let terrain = position.lookFor(LOOK_TERRAIN)[0];
            if (terrain === "wall") { continue; }
            if (position.isNearExit(0)) {
                let outcome = this.move(direction);
                // console.log("moveOnExit", outcome);
                return outcome;
            }
        }
        console.log(`AGENT: moveOnExit() assumes nearby exit tile, position: ${this.pos}`);
        return ERR_NO_PATH;
    }

    public moveOffExit(avoidSwamp = true): number {
        let swampDirection;

        let directions = [1, 3, 5, 7, 2, 4, 6, 8];
        for (let direction of directions) {
            let position = this.pos.getPositionAtDirection(direction);
            if (position.isNearExit(0)) { continue; }
            if (!position.isPassible()) { continue; }
            let terrain = position.lookFor(LOOK_TERRAIN)[0];
            if (avoidSwamp && terrain === "swamp") {
                swampDirection = direction;
                continue;
            }
            return this.move(direction);
        }

        if (swampDirection) {
            return this.move(swampDirection);
        }

        return ERR_NO_PATH;
    }

    public moveOffExitToward(leader: Agent, detour = true): number {
        for (let position of this.pos.openAdjacentSpots()) {
            let rangeToLeader = leader.pos.getRangeTo(position);
            if (rangeToLeader === 1) {
                return this.travelTo(position);
            }
        }
        if (detour) {
            this.travelTo(leader, {ignoreCreeps: false});
        }
    }

    /**
     * Determine if an agent has a path to the destination
     * @param destination
     * @param range
     * @param maxRooms
     * @param maxOps
     * @param maxRooms
     * @param maxOps
     */

    public hasPathTo(destination: {pos: RoomPosition}, range = 1, maxRooms = 1, maxOps = 1000): boolean {
        let ret = PathFinder.search(this.pos, {pos: destination.pos, range}, {
            maxRooms: maxRooms,
            maxOps: maxOps,
        });
        return !ret.incomplete;
    }

    public nearbyExit(avoiding?: {pos: RoomPosition}, exclude?: RoomPosition): RoomPosition {
        let directions = [1, 3, 5, 7, 2, 4, 6, 8];

        let bestPosition: RoomPosition;
        let bestRange = 0;
        for (let direction of directions) {
            let pos = this.pos.getPositionAtDirection(direction);
            if (pos.x !== 0 && pos.x !== 49 && pos.y !== 0 && pos.y !== 49) { continue; }
            if (pos.lookFor(LOOK_TERRAIN)[0] === "wall") { continue; }
            if (!avoiding) {
                return pos;
            }
            let range = pos.getRangeTo(avoiding);
            if (range <= bestRange) { continue; }
            if (exclude && exclude.inRangeTo(pos, 0)) { continue; }
            bestRange = range;
            bestPosition = pos;
        }

        return bestPosition;
    }

    public moveAwayFromAlongExit(avoiding: {pos: RoomPosition}, exitRange: number): number {
        let directions = [2, 4, 6, 8, 1, 3, 5, 7];

        let bestDirection: number;
        let bestRange = 0;
        for (let direction of directions) {
            let pos = this.pos.getPositionAtDirection(direction);
            if (pos.x !== 0 + exitRange && pos.x !== 49 - exitRange
                && pos.y !== 0 + exitRange && pos.y !== 49 - exitRange) { continue; }
            if (pos.lookFor(LOOK_TERRAIN)[0] === "wall") { continue; }
            let range = pos.getRangeTo(avoiding);
            if (range <= bestRange) { continue; }
            bestRange = range;
            bestDirection = direction;
        }

        if (bestDirection) {
            return this.creep.move(bestDirection);
        } else {
            return ERR_NO_PATH;
        }
    }

    public massAttackDamage(targets?: {pos: RoomPosition}[], ignoreRampart = false): number {

        if (!targets) {
            targets = this.room.hostiles;
        }

        let hostiles = this.pos.findInRange(targets, 3);
        let totalDamage = 0;
        let rangeMap = {
            [1]: 10,
            [2]: 4,
            [3]: 1,
        };

        for (let hostile of hostiles) {
            if (!ignoreRampart && hostile.pos.lookForStructure(STRUCTURE_RAMPART)) { continue; }
            let range = this.pos.getRangeTo(hostile);
            let damage = rangeMap[range];
            if (!damage) { continue; }
            totalDamage += damage;
        }

        return totalDamage;
    }

    public travelWaypoints(waypoints: Flag[], options?: TravelToOptions, avoidSK = false): boolean {
        if (this.memory.waypointsCovered) {
            return true;
        }

        if (this.memory.waypointIndex === undefined) {
            this.memory.waypointIndex = 0;
        }

        if (this.memory.waypointIndex >= waypoints.length) {
            this.memory.waypointsCovered = true;
            return true;
        }

        let waypoint = waypoints[this.memory.waypointIndex];
        if (WorldMap.roomType(waypoint.pos.roomName) === ROOMTYPE_CORE) {
            let portalCrossing = this.travelPortalWaypoint(waypoint);
            if (portalCrossing) { return false; }
        }

        if (waypoint.room && this.pos.inRangeTo(waypoint, 5) && !this.pos.isNearExit(0)) {
            console.log(`AGENT: waypoint ${this.memory.waypointIndex} reached (${this.name})`);
            this.memory.waypointIndex++;
        }

        if (avoidSK) {
            this.avoidSK(waypoint);
        } else {
            this.travelTo(waypoint, options);
        }
        return false;
    }

    private travelPortalWaypoint(waypoint: Flag) {
        if (!this.memory.portalCrossing && (!waypoint.room || !waypoint.pos.lookForStructure(STRUCTURE_PORTAL))) {
            return false;
        }
        this.memory.portalCrossing = true;
        let crossed = this.crossPortal(waypoint);
        if (crossed) {
            this.memory.portalCrossing = false;
            this.memory.waypointIndex++;
            return false;
        } else {
            return true;
        }
    }

    private crossPortal(waypoint: Flag): boolean {
        if (Game.map.getRoomLinearDistance(this.pos.roomName, waypoint.pos.roomName) > 5) {
            // other side
            if (this.pos.lookForStructure(STRUCTURE_PORTAL)) {
                let positions = this.pos.openAdjacentSpots();
                if (positions.length > 0) {
                    // console.log(this.name + " stepping off portal");
                    this.travelTo(positions[0]);
                    return;
                }
            }
            // console.log(agent.name + " waiting on other side");
            return true;
        } else {
            // console.log(agent.name + " traveling to waypoint");
            this.travelTo(waypoint);
        }
    }

    public fleeBuster(closest: Structure|Creep) {
        let currentRange = closest.pos.getRangeTo(this);
        let ret = PathFinder.search(closest.pos, {pos: this.pos, range: currentRange + 1}, {
            flee: true,
        });

        if (ret.path.length > 0) {
            let fleePos = ret.path[0];
            if (fleePos.getRangeTo(this) <= currentRange) {
                Viz.colorPos(fleePos, "red");
                return;
            }
            let direction = closest.pos.getDirectionTo(fleePos);
            let fleebusterPos = this.pos.getPositionAtDirection(direction);
            if (fleebusterPos.isNearExit(0) || Game.map.getTerrainAt(fleebusterPos) !== "plain" ||
                fleebusterPos.getRangeTo(closest) >= currentRange) {
                Viz.colorPos(fleebusterPos, "red");
                return;
            }
            Viz.colorPos(fleebusterPos, "yellow");
            return direction;
        }
    }

    public isAt(position: RoomPosition): boolean {
        return this.pos.x === position.x && this.pos.y === position.y && this.pos.roomName === position.roomName;
    }

    public moveToward(destination: RoomPosition|HasPos): number {
        let pos = Traveler.normalizePos(destination);
        let direction = this.pos.getDirectionTo(pos);
        return this.move(direction);
    }

    public findAnyEmpty(room: Room): Structure {
        if (this.room !== room) {
            this.memory.anyEmptyId = undefined;
            return room.findStructures<StructureSpawn>(STRUCTURE_SPAWN)[0];
        }

        if (this.memory.anyEmptyId) {
            let empty = Game.getObjectById<EnergyStructure|StructureContainer>(this.memory.anyEmptyId);
            if (empty) {
                if (empty instanceof StructureContainer) {
                    if (_.sum(empty.store) < empty.storeCapacity) {
                        return empty;
                    }
                } else {
                    if (empty.energy < empty.energyCapacity) {
                        return empty;
                    }
                }
            }
            delete this.memory.anyEmptyId;
            return this.findAnyEmpty(room);
        } else {
            if (Game.time > this.memory.nextEmptyCheck) { return; }

            let empties: Structure[] = _.filter(this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER), x =>
                _.sum(x.store) < x.storeCapacity);
            empties = empties.concat(_.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_SPAWN)
                    .concat(this.room.findStructures<EnergyStructure>(STRUCTURE_TOWER))
                    .concat(this.room.findStructures<EnergyStructure>(STRUCTURE_EXTENSION)),
                x => x.energy < x.energyCapacity));
            let nearestEmpty = this.pos.findClosestByRange(empties);
            if (nearestEmpty) {
                delete this.memory.nextEmptyCheck;
                this.memory.anyEmptyId = nearestEmpty.id;
                return nearestEmpty;
            } else {
                this.memory.nextEmptyCheck = Game.time + 5 + Math.ceil(Math.random() * 5);
            }
        }
    }

    public hostileEvac(roomName: string, destination: RoomPosition|HasPos): boolean {
        let room = Game.rooms[roomName];
        if (this.memory.evac) {
            if (room) {
                if (room.hostiles.length === 0) {
                    this.memory.evac = undefined;
                    return false;
                }
            } else {
                if (!this.pos.isNearExit(1)) {
                    this.memory.evac = undefined;
                    return false;
                }
            }
            console.log(`AGENT: evacuating from ${this.room.name}`);
            this.travelTo(destination);
            return true;
        } else {
            if (room && room.hostiles.length > 0) {
                this.memory.evac = true;
            }
        }
    }
}
