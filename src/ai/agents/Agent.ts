import {Mission} from "../missions/Mission";
import {IGOR_CAPACITY} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {TravelToOptions, Traveler, TravelData, TravelState, TravelToReturnData} from "../Traveler";
import {ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {FleeData} from "../../interfaces";
import {Notifier} from "../../notifier";
import {empire} from "../Empire";
import {AbstractAgent} from "./AbstractAgent";
import {RESERVE_AMOUNT} from "../TradeNetwork";
import {MemHelper} from "../../helpers/MemHelper";
import {Viz} from "../../helpers/Viz";

export class Agent extends AbstractAgent {

    public mission: Mission;
    public missionRoom: Room;
    public outcome: number;
    public spawning: boolean;
    public name: string;
    public travData: TravelToReturnData;
    /* public memory: {
        [propName: string]: any;
        hasLoad?: boolean;
        idlePosition?: RoomPosition;
        hostileCount?: number;
        _flee?: FleeData;
        _trav?: TravelData;
        prep?: boolean;
        remCreepId?: string;
        batteryId?: string;
        waypointsCovered?: boolean;
        waypointIndex?: number;
        portalCrossing?: boolean;
    };*/
    public memory: any;

    constructor(creep: Creep, mission: Mission) {
        super(creep);
        this.mission = mission;
        this.missionRoom = mission.room;
        this.spawning = creep.spawning;
        this.name = creep.name;
    }

    public attack(target: Creep|Structure): number { return this.creep.attack(target); }
    public attackController(controller: StructureController): number { return this.creep.attackController(controller); }
    public build(target: ConstructionSite): number { return this.creep.build(target); }
    public claimController(controller: StructureController): number { return this.creep.claimController(controller); }
    public dismantle(target: Structure): number { return this.creep.dismantle(target); }
    public drop(resourceType: string, amount?: number): number { return this.creep.drop(resourceType, amount); }
    public getActiveBodyparts(type: string): number { return this.creep.getActiveBodyparts(type); }
    public harvest(source: Source|Mineral): number { return this.creep.harvest(source); }
    public move(direction: number): number { return this.creep.move(direction); }
    public pickup(resource: Resource): number { return this.creep.pickup(resource); }
    public rangedAttack(target: Creep|Structure): number { return this.creep.rangedAttack(target); }
    public rangedMassAttack(): number { return this.creep.rangedMassAttack(); }
    public repair(target: Structure): number { return this.creep.repair(target); }
    public reserveController(controller: StructureController): number {
        return this.creep.reserveController(controller); }
    public say(message: string, pub?: boolean): number { return this.creep.say(message, pub); }
    public suicide(): number { return this.creep.suicide(); }
    public upgradeController(controller: StructureController): number {
        return this.creep.upgradeController(controller); }
    public heal(target: Creep|Agent): number {
        if (target instanceof Agent) {
            return this.creep.heal(target.creep);
        } else {
            return this.creep.heal(target);
        }
    }
    public rangedHeal(target: Creep|Agent): number {
        if (target instanceof Agent) {
            return this.creep.rangedHeal(target.creep);
        } else {
            return this.creep.rangedHeal(target);
        }
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
    public partCount(partType: string) { return this.creep.partCount(partType); }

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

    public retrieve(target: Creep|Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
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

    public hasLoad(): boolean {
        if (this.carryCapacity === 0) { return false; }

        if (this.memory.hasLoad && _.sum(this.carry) === 0) {
            this.memory.hasLoad = false;
        } else if (!this.memory.hasLoad && _.sum(this.carry) === this.carryCapacity) {
            this.memory.hasLoad = true;
        }
        return this.memory.hasLoad;
    }

    /**
     * Can be used to keep idling creeps out of the way, like when a road repairer doesn't have any roads needing repair
     * or a spawn refiller who currently has full extensions.
     * @param anchor
     * @param maintainDistance
     * @returns {any}
     */
    public idleOffRoad(anchor: {pos: RoomPosition} = this.mission.flag, maintainDistance = false): number {
        let offRoad = this.pos.lookForStructure(STRUCTURE_ROAD) === undefined;
        if (offRoad) { return OK; }

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

    public stealNearby(stealSource: string): number {
        if (this.carry.energy > this.carryCapacity * .8) { return OK; }
        if (stealSource === "creep") {
            let creep = _(this.pos.findInRange<Creep>(FIND_MY_CREEPS, 1))
                .filter((c: Creep) => c.getActiveBodyparts(WORK) === 0 && c.carry.energy > 0)
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

    public idleNear(place: {pos: RoomPosition}, acceptableRange = 1, cachePos = false, allowSwamp = true): number {
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
            return this.travelTo(this.cacheIdlePosition(place, acceptableRange)) as number;
        }

        if (range <= 1) {
            let position = this.findIdlePosition(place, acceptableRange);
            if (!position) { return; }
            return this.travelTo({pos: position}) as number;
        }

        return this.travelTo(place) as number;
    }

    private cacheIdlePosition(place: {pos: RoomPosition}, acceptableRange: number): RoomPosition {
        if (this.memory.idlePosition) {
            let position = helper.deserializeRoomPosition(this.memory.idlePosition);
            let range = position.getRangeTo(place);
            if (range === 0) {
                return position;
            }
            if (range <= acceptableRange && position.isPassible()) {
                return position;
            } else {
                this.memory.idlePosition = undefined;
                return this.cacheIdlePosition(place, acceptableRange);
            }
        } else {
            let position = this.findIdlePosition(place, acceptableRange);
            if (position) {
                this.memory.idlePosition = position;
                return position;
            } else {
                this.memory.idlePosition = place.pos;
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

    public avoidSK(destination: Flag): number {
        let costCall = (roomName: string, matrix: CostMatrix): CostMatrix | boolean => {
            if (roomName !== this.pos.roomName) { return; }
            let room = Game.rooms[this.pos.roomName];
            let sourceKeepers = _.filter(room.hostiles, (c: Creep) => c.owner.username === "Source Keeper");
            for (let sourceKeeper of sourceKeepers) {
                const SAFE_RANGE = 4;
                if (this.pos.getRangeTo(sourceKeeper) < SAFE_RANGE) { continue; }
                for (let xDelta = -SAFE_RANGE; xDelta <= SAFE_RANGE; xDelta++) {
                    for (let yDelta = -SAFE_RANGE; yDelta <= SAFE_RANGE; yDelta++) {
                        matrix.set(sourceKeeper.pos.x + xDelta, sourceKeeper.pos.y + yDelta, 0xff);
                    }
                }
            }
            return matrix;
        };

        let options: TravelToOptions = {};
        if (this.room.roomType === ROOMTYPE_SOURCEKEEPER) {
            options.roomCallback = costCall;
            let hostileCount = this.creep.room.hostiles.length;
            if (!this.memory.hostileCount) { this.memory.hostileCount = 0; }
            if (hostileCount > this.memory.hostileCount) {
                this.resetTravelPath();
            }
            this.memory.hostileCount = hostileCount;
        }

        return this.travelTo(destination, options) as number;
    }

    public resetTravelPath() {
        if (!this.memory._trav) { return; }
        delete this.memory._trav.path;
    }

    public resetPrep() {
        this.memory.prep = false;
    }

    public fleeHostiles(fleeRange = 6): boolean {
        let value = this.fleeByPath(this.room.fleeObjects, fleeRange, 2, false);
        return value;
    }

    public fleeByPath(fleeObjects: {pos: RoomPosition}[], fleeRange: number, fleeDelay: number,
                      confineToRoom = false): boolean {

        let closest = this.pos.findClosestByRange(fleeObjects);
        let rangeToClosest = 50;
        if (closest) { rangeToClosest = this.pos.getRangeTo(closest); }

        if (rangeToClosest > fleeRange) {
            if (!this.memory._flee) {
                return false; // where most creeps exit function
            }

            let fleeData = this.memory._flee;

            if (this.pos.isNearExit(0)) {
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
            if (closest instanceof Creep) {
                let moveCount = this.getActiveBodyparts(MOVE);
                let dropAmount = this.carry.energy - (moveCount * CARRY_CAPACITY);
                this.drop(RESOURCE_ENERGY, dropAmount);
            }
            return true;
        }

        if (!this.memory._flee) { this.memory._flee = {} as FleeData; }

        let fleeData = this.memory._flee as FleeData;
        fleeData.delay = fleeDelay;

        if (fleeData.nextPos) {
            let position = helper.deserializeRoomPosition(fleeData.nextPos);
            if (this.arrivedAtPosition(position)) {
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
            let avoidance = _.map(fleeObjects, obj => { return {pos: obj.pos, range: 10 }; });

            let ret = PathFinder.search(this.pos, avoidance, {
                flee: true,
                maxRooms: confineToRoom ? 1 : undefined,
                roomCallback: (roomName: string): CostMatrix|boolean => {
                    if (Traveler.checkAvoid(roomName)) { return false; }
                    if (roomName === this.room.name) { return Traveler.getCreepMatrix(this.room); }
                    if (Game.rooms[roomName]) { return Traveler.getStructureMatrix(Game.rooms[roomName]); }
                },
            });

            if (ret.path.length === 0) { return true; }

            fleeData.path = Traveler.serializePath(this.pos, ret.path);
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
                if (Game.rooms[roomName]) { return Traveler.getStructureMatrix(Game.rooms[roomName]); }
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
            if (name && occupier.name.indexOf(name) >= 0) {
                if (lethal) {
                    for (let resourceType in occupier.carry) {
                        let amount = occupier.carry[resourceType];
                        if (amount > 0) {
                            occupier.transfer(this.creep, resourceType);
                        }
                    }
                    this.creep.say("my spot!");
                    occupier.suicide();
                }
            } else {
                let direction = occupier.pos.getDirectionTo(this);
                occupier.move(direction);
                this.creep.say("move it");
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
     * @param creep
     * @param nextDestination
     * @param highPriority - allows you to withdraw energy before a battery reaches an optimal amount of energy, jumping
     * ahead of any other creeps trying to get energy
     * @param getFromSource
     */

    public procureEnergy(nextDestination?: {pos: RoomPosition}, highPriority = false, getFromSource = false) {
        let battery = this.getBattery();
        if (!battery) {
            if (getFromSource) {
                let closest = this.pos.findClosestByRange<Source>(this.mission.state.sources);
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
                if (this.travData && this.travData.state) {
                    // travel toward wherever you were going last tick
                    this.idleOffRoad({pos: this.travData.state.destination}, true);
                } else {
                    this.idleOffRoad();
                }
            }
            return;
        }

        if (!this.pos.isNearTo(battery)) {
            this.travelTo(battery);
            return;
        }

        let outcome;
        if (highPriority) {
            if (Agent.normalizeStore(battery).store.energy >= 50) {
                outcome = this.withdraw(battery, RESOURCE_ENERGY);
            }
        } else {
            outcome = this.withdrawIfFull(battery, RESOURCE_ENERGY);
        }
        if (outcome === OK) {
            this.memory.batteryId = undefined;
            if (nextDestination) {
                this.travelTo(nextDestination);
            }
            if (battery instanceof Creep) {
                battery.memory.donating = undefined;
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
     * @param creep - return a battery relative to the missionRoom that the creep is currently in
     * @returns {any}
     */

    public getBattery(): StoreStructure|Creep {
        let minEnergy = this.carryCapacity - this.carry.energy;
        if (this.room.storage && this.room.storage.store.energy > minEnergy) {
            return this.room.storage;
        }

        let find = () => {
            let battery: StoreStructure|Creep = _(this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER)
                .concat(this.room.findStructures<StructureTerminal>(STRUCTURE_TERMINAL)))
                .filter(x => x.store.energy >= minEnergy)
                .filter(x => !this.room.controller || !x.pos.inRangeTo(this.room.controller, 3))
                .min(x => x.pos.getRangeTo(this));
            if (!_.isObject(battery)) {
                battery = _(this.room.find<Creep>(FIND_MY_CREEPS))
                    .filter(x => x.memory.donatesEnergy && x.carry.energy >= 50)
                    .filter(x => x.memory.donating === undefined || Game.time > x.memory.donating)
                    .min(x => x.pos.getRangeTo(this));
                if (battery && battery instanceof Object) {
                    battery.memory.donating = Game.time + 20;
                }
            }
            if (battery instanceof Object) {
                return battery;
            }
        };

        let validate = (obj: StoreStructure|Creep) => {
            if (obj instanceof Structure) {
                return obj.store.energy >= minEnergy;
            } else {
                return obj.carry.energy > 0;
            }
        };

        return MemHelper.findObject<StoreStructure|Creep>(this, "battery", find, validate);
    }

    public static squadTravel(leader: Agent, follower: Agent, target: {pos: RoomPosition},
                              options?: TravelToOptions): number {

        let outcome;
        if (leader.room !== follower.room) {
            if (leader.pos.isNearExit(0)) {
                outcome = leader.travelTo(target, options);
            }
            follower.travelTo(leader);
            return outcome;
        }

        let range = leader.pos.getRangeTo(follower);
        if (range > 1) {
            if (follower.pos.isNearExit(0)) {
                follower.moveOffExitToward(leader);
            } else {
                follower.travelTo(leader);
            }
            // attacker stands still
        } else if (follower.fatigue === 0) {
            outcome = leader.travelTo(target, options);
            follower.move(follower.pos.getDirectionTo(leader));
        }
        return outcome;
    }

    public capacityAvailable(container: Creep|StructureContainer|StructureTerminal|StructureStorage) {
        let norm = Agent.normalizeStore(container);
        return _.sum(this.carry) <= norm.storeCapacity - _.sum(norm.store);
    }

    public standardHealing(agents: Agent[]): boolean {
        let hurtAgents = _(this.pos.findInRange(agents, 3))
            .filter(agent => agent.hits < agent.hitsMax)
            .sortBy(agent => agent.hits - agent.hitsMax)
            .value();
        if (hurtAgents.length > 0) {

            let healPotential = this.getActiveBodyparts(HEAL) * 12;
            if (_.find(this.creep.body, part => part.boost)) { healPotential *= 4; }

            let mostHurt = _.head(hurtAgents);
            if (mostHurt.pos.isNearTo(this)) {
                this.heal(mostHurt);
                return true;
            }

            let nearbyAndHurt = _.filter(this.pos.findInRange(hurtAgents, 1),
                agent => agent.hits < agent.hitsMax - healPotential);
            if (nearbyAndHurt.length > 0) {
                this.heal(_.head(nearbyAndHurt));
                return true;
            }

            this.rangedHeal(_.head(hurtAgents));
            return true;
        } else {
            return false;
        }
    }

    public standardRangedAttack(): Creep {
        let hostilesInRange = _(this.pos.findInRange<Creep>(FIND_HOSTILE_CREEPS, 3))
            .sortBy(creep => creep.hits - creep.hitsMax)
            .value();
        if (hostilesInRange.length > 0) {
            if (hostilesInRange.length > 2 || this.pos.findClosestByRange(hostilesInRange).pos.isNearTo(this)) {
                this.rangedMassAttack();
                return hostilesInRange[0];
            } else {
                this.rangedAttack(hostilesInRange[0]);
                return hostilesInRange[0];
            }
        }
    }

    public standardMelee(damageThreshold = 0): Creep {
        if (this.hits < damageThreshold) { return; }
        let hostilesInRange = _(this.pos.findInRange<Creep>(FIND_HOSTILE_CREEPS, 1))
            .sortBy(creep => creep.hits - creep.hitsMax)
            .value();
        if (hostilesInRange.length > 0) {
            this.attack(hostilesInRange[0]);
            return hostilesInRange[0];
        }
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

    public get shield(): number {
        if (this.cache.shield !== undefined) { return this.cache.shield; }

        let shield = 0;
        for (let part of this.creep.body) {
            if (part.type !== TOUGH) { continue; }
            if (part.boost) {
                shield += part.hits / BOOSTS[TOUGH][part.boost].damage;
            } else {
                shield += part.hits;
            }
        }

        this.cache.shield = shield;
        return shield;
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
                console.log(outcome);
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

    public moveOffExitToward(leader: Agent) {
        let positions = this.pos.openAdjacentSpots(true);
        if (positions.length === 0) {
            this.travelTo(leader);
        } else {
            this.travelTo(leader.pos.findClosestByRange(positions));
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

    public massAttackDamage(targets: {pos: RoomPosition}[]): number {
        let hostiles = this.pos.findInRange(targets, 3);
        let totalDamage = 0;
        let rangeMap = {
            [1]: 10,
            [2]: 4,
            [3]: 1,
        };

        for (let hostile of hostiles) {
            if (hostile.pos.lookForStructure(STRUCTURE_RAMPART)) { continue; }
            let range = this.pos.getRangeTo(hostile);
            let damage = rangeMap[range];
            if (!damage) { continue; }
            totalDamage += damage;
        }

        return totalDamage;
    }

    public travelWaypoints(waypoints: Flag[], options?: TravelToOptions): boolean {
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
        if (WorldMap.roomTypeFromName(waypoint.pos.roomName) === ROOMTYPE_CORE) {
            let portalCrossing = this.travelPortalWaypoint(waypoint);
            if (portalCrossing) { return false; }
        }

        if (waypoint.room && this.pos.inRangeTo(waypoint, 5) && !this.pos.isNearExit(0)) {
            console.log(`AGENT: waypoint ${this.memory.waypointIndex} reached (${this.name})`);
            this.memory.waypointIndex++;
        }

        this.travelTo(waypoint, options);
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

        console.log(`fleebust in ${this.room.name}`);
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
}

type StoreStructure = StructureContainer|StructureTerminal|StructureStorage;
