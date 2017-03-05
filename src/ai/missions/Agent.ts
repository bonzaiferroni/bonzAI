import {Mission} from "./Mission";
import {IGOR_CAPACITY} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {TravelToOptions, Traveler, TravelData} from "../Traveler";
import {empire} from "../../helpers/loopHelper";
import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {FleeData} from "../../interfaces";
import {notifier} from "../../notifier";

export class Agent {

    public creep: Creep;
    public mission: Mission;
    public room: Room;
    public missionRoom: Room;
    public outcome: number;
    public carry: StoreDefinition;
    public carryCapacity: number;
    public hits: number;
    public hitsMax: number;
    public pos: RoomPosition;
    public ticksToLive: number;
    public name: string;
    public id: string;
    public fatigue: number;
    public spawning: boolean;
    public memory: any;

    constructor(creep: Creep, mission: Mission) {
        this.creep = creep;
        this.mission = mission;
        this.room = creep.room;
        this.missionRoom = mission.room;
        this.memory = creep.memory;
        this.pos = creep.pos;
        this.carry = creep.carry;
        this.carryCapacity = creep.carryCapacity;
        this.hits = creep.hits;
        this.hitsMax = creep.hitsMax;
        this.ticksToLive = creep.ticksToLive;
        this.name = creep.name;
        this.id = creep.id;
        this.fatigue = creep.fatigue;
        this.spawning = creep.spawning;
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
    public reserveController(controller: StructureController): number { return this.creep.reserveController(controller); }
    public say(message: string, pub?: boolean): number { return this.creep.say(message, pub); }
    public suicide(): number { return this.creep.suicide(); }
    public upgradeController(controller: StructureController): number { return this.creep.upgradeController(controller); }
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
        if (target instanceof Creep) { return target.transfer(this.creep, resourceType, amount); }
        else { return this.creep.withdraw(target, resourceType, amount); }
    }
    public partCount(partType: string) { return this.partCount(partType);}

    public travelTo(destination: {pos: RoomPosition} | RoomPosition, options?: TravelToOptions): number {
        if (destination instanceof RoomPosition) { destination = {pos: destination}; }
        return empire.traveler.travelTo(this.creep, destination, options);
    }

    public isFull(margin = 0): boolean {
        return _.sum(this.carry) >= this.carryCapacity - margin;
    }

    travelToAndBuild(site: ConstructionSite): number {
        this.idleNear(site);
        return this.build(site);
    }

    retrieve(target: Creep|Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        if (this.pos.isNearTo(target)) {
            this.withdraw(target, resourceType, amount);
        }
        else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    deliver(target: Creep|Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        if (this.pos.isNearTo(target)) {
            return this.transfer(target, resourceType, amount);
        }
        else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    hasLoad(): boolean {
        if (this.carryCapacity === 0) return false;

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
        if (offRoad) return OK;

        let positions = _.sortBy(this.pos.openAdjacentSpots(), (p: RoomPosition) => p.getRangeTo(anchor));
        if (maintainDistance) {
            let currentRange = this.pos.getRangeTo(anchor);
            positions = _.filter(positions, (p: RoomPosition) => p.getRangeTo(anchor) <= currentRange);
        }

        let swampPosition;
        for (let position of positions) {
            if (position.lookForStructure(STRUCTURE_ROAD)) continue;
            let terrain = position.lookFor(LOOK_TERRAIN)[0] as string;
            if (terrain === "swamp") {
                swampPosition = position;
            }
            else {
                return this.move(this.pos.getDirectionTo(position));
            }
        }

        if (swampPosition) {
            return this.move(this.pos.getDirectionTo(swampPosition));
        }

        return this.travelTo(anchor) as number;
    }

    public stealNearby(stealSource: string): number {
        if (stealSource === "creep") {
            let creep = _(this.pos.findInRange<Creep>(FIND_MY_CREEPS, 1))
                .filter((c: Creep) => c.getActiveBodyparts(WORK) === 0 && c.carry.energy > 0)
                .head();
            if (!creep) { return ERR_NOT_IN_RANGE; }
            return creep.transfer(this.creep, RESOURCE_ENERGY);
        }
        else {
            let structure = _(this.pos.findInRange<Structure>(this.creep.room.findStructures<Structure>(stealSource), 1))
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
                if (!position.inRangeTo(place, acceptableRange)) continue;
                if (position.lookForStructure(STRUCTURE_ROAD)) continue;
                if (!position.isPassible()) continue;
                if (position.isNearExit(0)) continue;
                if (position.lookFor(LOOK_TERRAIN)[0] === "swamp") {
                    swampDirection = relDirection;
                    continue;
                }
                return this.creep.move(relDirection);
            }
            if (swampDirection && allowSwamp) {
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
            }
            else {
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

    isNearTo(place: {pos: RoomPosition} | RoomPosition) {
        return this.pos.isNearTo(place);
    }

    seekBoost(boosts: string[], allowUnboosted: boolean) {
        if (!boosts) return true;
        if (this.room.findStructures(STRUCTURE_LAB).length === 0) return true;
        if (this.room.controller.level < 6) return true;

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

            if (this.creep.spawning) continue;

            let flag = Game.flags[requests[boost].flagName];
            if (!flag) continue;

            let lab = flag.pos.lookForStructure(STRUCTURE_LAB) as StructureLab;

            if (lab.mineralType === boost && lab.mineralAmount >= IGOR_CAPACITY && lab.energy >= IGOR_CAPACITY) {
                if (this.pos.isNearTo(lab)) {
                    lab.boostCreep(this.creep);
                }
                else {
                    this.travelTo(lab);
                    return false;
                }
            }
            else if (allowUnboosted) {
                console.log("BOOST: no boost for", this.creep.name, " so moving on (allowUnboosted = true)");
                requests[boost].requesterIds = _.pull(requests[boost].requesterIds, this.creep.id);
                this.memory[boost] = true;
            }
            else {
                if (Game.time % 10 === 0) console.log("BOOST: no boost for", this.creep.name,
                    " it will wait for some boost (allowUnboosted = false)");
                this.idleOffRoad(this.missionRoom.storage);
                return false;
            }
        }

        return boosted;
    }

    avoidSK(destination: Flag): number {
        let costCall = (roomName: string, matrix: CostMatrix): CostMatrix | boolean => {
            if (roomName !== this.pos.roomName) return;
            let room = Game.rooms[this.pos.roomName];
            let sourceKeepers = _.filter(room.hostiles, (c: Creep) => c.owner.username === "Source Keeper");
            for (let sourceKeeper of sourceKeepers) {
                const SAFE_RANGE = 4;
                if (this.pos.getRangeTo(sourceKeeper) < SAFE_RANGE) continue;
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
            if (!this.memory.hostileCount) this.memory.hostileCount = 0;
            if (hostileCount > this.memory.hostileCount) {
                this.resetTravelPath();
            }
            this.memory.hostileCount = hostileCount;
        }

        return this.travelTo(destination, options) as number;
    }

    resetTravelPath() {
        if (!this.memory._travel) return;
        delete this.memory._travel.path;
    }

    resetPrep() {
        this.memory.prep = false;
    }

    fleeHostiles(): boolean {
        return this.fleeByPath(this.room.fleeObjects, 6, 2, false);
    }

    fleeByPath(fleeObjects: {pos: RoomPosition}[], fleeRange: number, fleeDelay: number, confineToRoom = false): boolean {

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
                    if (Traveler.checkOccupied(roomName)) { return false; }
                    if (roomName === this.room.name) { return empire.traveler.getCreepMatrix(this.room); }
                    if (Game.rooms[roomName]) { return empire.traveler.getStructureMatrix(Game.rooms[roomName]); }
                }
            });

            if (ret.path.length === 0) { return true; }

            fleeData.path = Traveler.serializePath(this.pos, ret.path);
        }

        let nextDirection = parseInt(fleeData.path[0], 10);
        fleeData.nextPos = this.pos.getPositionAtDirection(nextDirection);
        this.move(nextDirection);
        return true;
    }

    retreat(avoidObjects?: {pos: RoomPosition}[], fleeRange = 5): number {
        if (!avoidObjects) {
            avoidObjects = this.room.fleeObjects;
        }

        let avoidance = _.map(this.pos.findInRange(avoidObjects, fleeRange + 1),
            (c: Creep) => { return {pos: c.pos, range: 20 }; });


        let ret = PathFinder.search(this.pos, avoidance, {
            flee: true,
            roomCallback: (roomName: string): CostMatrix|boolean => {
                if (Traveler.checkOccupied(roomName)) { return false; }
                if (roomName === this.room.name) { return empire.traveler.getCreepMatrix(this.room); }
                if (Game.rooms[roomName]) { return empire.traveler.getStructureMatrix(Game.rooms[roomName]); }
            }
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
     * @param name - if given, will suicide the occupying creep if string occurs anywhere in name (allows easy role replacement)
     * and will transfer any resources in creeps' carry
     * @param lethal - will suicide the occupying creep
     * @returns {number}
     */
    moveItOrLoseIt(position: RoomPosition, name?: string, lethal = true): number {
        if (this.creep.fatigue > 0) { return OK; }
        let range = this.pos.getRangeTo(position);
        if (range === 0) return OK;
        if (range > 1) { return this.travelTo(position) as number; }

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
            }
            else {
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
        if (isOffRoad) return OK;

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
        return this.travelTo(target);
    };

    /**
     * Only withdraw from a store-holder if there is enough resource to transfer (or if holder is full), cpu-efficiency effort
     * @param target
     * @param resourceType
     * @returns {number}
     */
    withdrawIfFull(target: Creep|StructureContainer|StructureStorage|StructureTerminal, resourceType: string): number {
        if (!this.pos.isNearTo(target)) {
            return ERR_NOT_IN_RANGE;
        }

        let norm = Agent.normalizeStore(target);
        let storageAvailable = this.carryCapacity - _.sum(this.carry);
        let targetStorageAvailable = norm.storeCapacity - _.sum(norm.store);
        if (norm.store[resourceType] >= storageAvailable || targetStorageAvailable === 0) {
            return this.withdraw(target, resourceType);
        }
        else {
            return ERR_NOT_ENOUGH_RESOURCES;
        }
    };

    public static normalizeStore(target: Creep|StructureContainer|StructureStorage|StructureTerminal):
    { store: StoreDefinition, storeCapacity: number } {
        let store;
        let storeCapacity;
        if (target instanceof Creep) {
            store = target.carry;
            storeCapacity = target.carryCapacity;
        }
        else {
            store = target.store;
            storeCapacity = target.storeCapacity;
        }
        return {store: store, storeCapacity: storeCapacity };
    }

    withdrawEverything(target: Creep|StructureContainer|StructureStorage|StructureTerminal): number {
        let norm = Agent.normalizeStore(target);
        for (let resourceType in norm.store) {
            let amount = norm.store[resourceType];
            if (amount > 0) {
                return this.withdraw(target, resourceType);
            }
        }
        return ERR_NOT_ENOUGH_RESOURCES;
    };

    transferEverything(target: Creep|StructureContainer|StructureStorage|StructureTerminal): number {
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

    rememberStructure(findStructure: () => Structure, forget: (structure: Structure) => boolean,
                                 prop = "remStructureId", immediate = false): Structure {
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
        else if (Game.time % 10 === 0 || immediate) {
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

    rememberCreep(findCreep: () => Creep, forget: (creep: Creep) => boolean): Creep {
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
    rememberBattery(): Creep | StructureContainer {
        if (this.memory.batteryId) {
            let battery = Game.getObjectById(this.memory.batteryId) as Creep | StructureContainer;
            if (battery && Agent.normalizeStore(battery).store.energy >= 50) {
                return battery;
            }
            else {
                this.memory.batteryId = undefined;
                return this.rememberBattery();
            }
        }
        else {
            let battery = this.room.getAltBattery(this.creep);
            if (battery) {
                this.memory.batteryId = battery.id;
                return battery;
            }
        }
    };

    /**
     * Pass in position of recycle bin (aka container next to spawn) and will creep go recycle itself there
     * @param container
     */

    recycleSelf(container: StructureContainer) {

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
        }
        else if (recycleOutcome === -9) {
            console.log(this.name, " is moving to recycle bin at ", container.pos);
            this.travelTo(container, { range: 0 });
            return;
        }
        else {
            console.log(this.room.name, " recycling error: ", recycleOutcome);
        }
        return;
    };

    /**
     * General-purpose energy getting, will look for an energy source in the same missionRoom as the operation flag (not creep)
     * @param creep
     * @param nextDestination
     * @param highPriority - allows you to withdraw energy before a battery reaches an optimal amount of energy, jumping
     * ahead of any other creeps trying to get energy
     * @param getFromSource
     */

    public procureEnergy(nextDestination?: {pos: RoomPosition}, highPriority = false, getFromSource = false) {
        let battery = this.getBattery();

        if (battery) {
            if (this.pos.isNearTo(battery)) {
                let outcome;
                if (highPriority) {
                    if (Agent.normalizeStore(battery).store.energy >= 50) {
                        outcome = this.withdraw(battery, RESOURCE_ENERGY);
                    }
                }
                else {
                    outcome = this.withdrawIfFull(battery, RESOURCE_ENERGY);
                }
                if (outcome === OK) {
                    this.memory.batteryId = undefined;
                    if (nextDestination) {
                        this.travelTo(nextDestination);
                    }
                }
            }
            else {
                this.travelTo(battery);
            }
        }
        else {
            if (getFromSource) {
                let closest = this.pos.findClosestByRange<Source>(this.mission.sources);
                if (closest) {
                    if (this.pos.isNearTo(closest)) {
                        this.harvest(closest);
                    }
                    else {
                        this.travelTo(closest);
                    }
                }
                else {
                    this.idleOffRoad();
                }
            }
            else {
                if (this.memory._travel && this.memory._travel.dest) {
                    let destPos = this.memory._travel.dest;
                    let dest = new RoomPosition(destPos.x, destPos.y, destPos.roomName);
                    this.idleOffRoad({pos: dest}, true);
                }
                else {
                    this.idleOffRoad();
                }
            }
        }
    }

    public nextPositionInPath(): RoomPosition {
        if (this.memory._travel && this.memory._travel.path && this.memory._travel.path.length > 0) {
            let position = this.pos.getPositionAtDirection(parseInt(this.memory._travel.path[0], 10));
            if (!position.isNearExit(0)) {
                return position;
            }
        }
    }

    /**
     * Will return storage if it is available, otherwise will look for an alternative battery and cache it
     * @param creep - return a battery relative to the missionRoom that the creep is currently in
     * @returns {any}
     */

    public getBattery(): Creep|StructureContainer|StructureTerminal|StructureStorage {
        let minEnergy = this.carryCapacity - this.carry.energy;
        if (this.room.storage && this.room.storage.store.energy > minEnergy) {
            return this.room.storage;
        }

        return this.rememberBattery();
    }

    public static squadTravel(leader: Agent, follower: Agent, target: {pos: RoomPosition},
                              options?: TravelToOptions): number {

        if (leader.room !== follower.room) {
            if (leader.pos.isNearExit(0)) {
                leader.travelTo(target);
            }
            follower.travelTo(leader);
            return;
        }

        let range = leader.pos.getRangeTo(follower);
        if (range > 1) {
            follower.travelTo(leader);
            // attacker stands still
        } else if (follower.fatigue === 0) {
            leader.travelTo(target, options);
            follower.move(follower.pos.getDirectionTo(leader));
        }
    }

    capacityAvailable(container: Creep|StructureContainer|StructureTerminal|StructureStorage) {
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

    public moveOffExit(): number {
        let swampDirection;
        for (let direction = 1; direction < 8; direction++) {
            let position = this.pos.getPositionAtDirection(direction);
            if (position.isNearExit(0)) { continue; }
            if (!position.isPassible()) { continue; }
            let terrain = position.lookFor(LOOK_TERRAIN)[0];
            if (terrain === "swamp") {
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
        return this.memory._travel && this.memory._travel.stuck >= 2
    }

    public pushyTravelTo(destination: {pos: RoomPosition}, exclusion?: string, options: TravelToOptions = {}) {
        if (this.isStuck()) {
            options.returnData = {nextPos: undefined };
            this.travelTo(destination, options);
            if (options.returnData.nextPos) {
                let creep = options.returnData.nextPos.lookFor<Creep>(LOOK_CREEPS)[0];
                if (creep && creep.my && (!exclusion || creep.name.indexOf(exclusion) < 0)) {
                    notifier.log(`pushed creep ${creep.pos}`);
                    this.say("excuse me", true);
                    creep.move(creep.pos.getDirectionTo(this));
                }
            }
        } else {
            this.travelTo(destination, options);
        }
    }
}