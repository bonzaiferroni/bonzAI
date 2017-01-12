import {Mission} from "./Mission";
import {TravelToOptions} from "../../interfaces";
import {IGOR_CAPACITY, ROOMTYPE_SOURCEKEEPER} from "../../config/constants";
import {helper} from "../../helpers/helper";

export class Agent {

    creep: Creep;
    mission: Mission;
    missionRoom: Room;
    outcome: number;
    memory: any;
    pos: RoomPosition;

    constructor(creep: Creep, mission: Mission) {
        this.creep = creep;
        this.mission = mission;
        this.missionRoom = mission.room;
        this.memory = creep.memory;
        this.pos = creep.pos;
    }

    travelTo(destination: {pos: RoomPosition} | RoomPosition, options?: TravelToOptions): number | RoomPosition {
        if (destination instanceof RoomPosition) { destination = {pos: destination}; }
        return this.mission.empire.travelTo(this.creep, destination, options);
    }

    isFull(margin = 0): boolean {
        return _.sum(this.creep.carry) >= this.creep.carryCapacity - margin;
    }

    travelToAndBuild(site: ConstructionSite): number {
        this.idleNear(site);
        return this.creep.build(site);
    }

    pickup(target: Creep | Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        if (this.creep.pos.isNearTo(target)) {
            if (target instanceof Creep) {
                return target.transfer(this.creep, resourceType, amount);
            }
            else {
                return this.creep.withdraw(target, resourceType, amount);
            }
        }
        else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    deliver(target: Creep | Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        if (this.creep.pos.isNearTo(target)) {
            return this.creep.transfer(target, resourceType, amount);
        }
        else {
            this.travelTo(target, options);
            return ERR_NOT_IN_RANGE;
        }
    }

    hasLoad(): boolean {
        if (this.creep.memory._hasLoad && _.sum(this.creep.carry) === 0) {
            this.creep.memory._hasLoad = false;
        }
        else if (!this.creep.memory._hasLoad && _.sum(this.creep.carry) === this.creep.carryCapacity) {
            this.creep.memory._hasLoad = true;
        }
        return this.creep.memory._hasLoad;
    }

    /**
     * Can be used to keep idling creeps out of the way, like when a road repairer doesn't have any roads needing repair
     * or a spawn refiller who currently has full extensions.
     * @param anchor
     * @param maintainDistance
     * @returns {any}
     */
    idleOffRoad(anchor: {pos: RoomPosition} = this.mission.flag, maintainDistance = false): number {
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
                return this.creep.move(this.pos.getDirectionTo(position));
            }
        }

        if (swampPosition) {
            return this.creep.move(this.pos.getDirectionTo(swampPosition));
        }

        return this.travelTo(anchor) as number;
    }

    stealNearby(stealSource: string): number {
        if (stealSource === "creep") {
            let creep = _(this.creep.pos.findInRange<Creep>(FIND_MY_CREEPS, 1))
                .filter((c: Creep) => c.getActiveBodyparts(WORK) === 0 && c.carry.energy > 0)
                .head();
            if (!creep) { return ERR_NOT_IN_RANGE; }
            return creep.transfer(this.creep, RESOURCE_ENERGY);
        }
        else {
            let structure = _(this.creep.pos.findInRange<Structure>(this.creep.room.findStructures<Structure>(stealSource), 1))
                .filter((s: {energy: number}) => s.energy > 0)
                .head();
            if (!structure) { return ERR_NOT_IN_RANGE; }
            return this.creep.withdraw(structure, RESOURCE_ENERGY);
        }
    }

    idleNear(place: {pos: RoomPosition}, acceptableRange = 1, allowSwamp = true): number {
        let range = this.creep.pos.getRangeTo(place);
        if (range <= acceptableRange && !this.creep.pos.lookForStructure(STRUCTURE_ROAD)) {
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

        if (range <= 1) {
            let position = this.findIdlePosition(place, acceptableRange);
            if (!position) { return; }
            return this.travelTo({pos: position}) as number;
        }

        return this.travelTo(place) as number;
    }

    findIdlePosition(place: {pos: RoomPosition}, acceptableRange: number): RoomPosition {
        let radius = 0;
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
                    return position;
                }
            }
            radius++
        }
    }

    isNearTo(place: {pos: RoomPosition} | RoomPosition) {
        return this.creep.pos.isNearTo(place);
    }

    seekBoost(boosts: string[], allowUnboosted: boolean) {
        if (!boosts) return true;
        if (this.missionRoom.findStructures(STRUCTURE_LAB).length === 0) return true;

        let boosted = true;
        for (let boost of boosts) {
            if (this.memory[boost]) continue;

            let requests = this.missionRoom.memory.boostRequests;
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
        let costCall = (roomName: string, ignoreCreeps: boolean): CostMatrix | boolean => {
            if (roomName !== this.pos.roomName) return;
            let roomType = helper.roomTypeFromName(roomName);
            if (roomType !== ROOMTYPE_SOURCEKEEPER) return;
            let room = Game.rooms[this.pos.roomName];
            let matrix = new PathFinder.CostMatrix();
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
            if (!ignoreCreeps) {
                helper.addCreepsToMatrix(matrix, room);
            }
            return matrix;
        };

        let options: TravelToOptions = {};
        if (this.creep.room.roomType === ROOMTYPE_SOURCEKEEPER) {
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

    fleeHostiles(pathFinding?: boolean): boolean {

        let fleeObjects = this.creep.room.fleeObjects;
        if (fleeObjects.length === 0) return false;

        let closest = this.pos.findClosestByRange(fleeObjects) as Creep;
        if (closest) {
            let range = this.pos.getRangeTo(closest);
            let fleeRange = closest.owner.username === "Source Keeper" ? 5 : 8;

            if (range < fleeRange) {
                if (this.creep.fatigue > 0 && closest instanceof Creep) {
                    let moveCount = this.creep.getActiveBodyparts(MOVE);
                    let dropAmount = this.creep.carry.energy - (moveCount * CARRY_CAPACITY);
                    this.creep.drop(RESOURCE_ENERGY, dropAmount);
                }

                if (pathFinding) {
                    this.fleeByPath();
                }
                else {
                    let fleePosition = this.pos.bestFleePosition(closest);
                    if (fleePosition) {
                        this.creep.move(this.pos.getDirectionTo(fleePosition));
                    }
                }
                return true;
            }
        }
        return false;
    }

    fleeByPath(): number {
        let avoidPositions = _.map(this.pos.findInRange(this.creep.room.hostiles, 5),
            (c: Creep) => { return {pos: c.pos, range: 10 }; });

        let ret = PathFinder.search(this.pos, avoidPositions, {
            flee: true,
            maxRooms: 1,
            roomCallback: (roomName: string): CostMatrix => {
                if (roomName !== this.creep.room.name) return;
                return this.creep.room.defaultMatrix;
            }
        });

        return this.creep.move(this.pos.getDirectionTo(ret.path[0]));
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
}