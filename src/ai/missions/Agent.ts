import {Mission} from "./Mission";
import {TravelToOptions} from "../../interfaces";
import {DESTINATION_REACHED} from "../../config/constants";
import {helper} from "../../helpers/helper";

export class Agent {

    creep: Creep;
    mission: Mission;
    room: Room;
    outcome: number;
    memory: {
        idlePosition: RoomPosition;
    };

    constructor(creep: Creep, mission: Mission) {
        this.creep = creep;
        this.mission = mission;
        this.room = mission.room;
        this.memory = creep.memory;
    }

    travelTo(destination: {pos: RoomPosition}, options?: TravelToOptions): number | RoomPosition {
        return this.mission.empire.travelTo(this.creep, destination, options);
    }

    isFull(margin = 0): boolean {
        return _.sum(this.creep.carry) >= this.creep.carryCapacity - margin;
    }

    build(site: ConstructionSite): number {
        this.idleNear(site);
        return this.creep.build(site);
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

    pickup(target: Creep | Structure, resourceType: string, options?: TravelToOptions, amount?: number): number {
        let outcome;
        if (this.creep.pos.isNearTo(target)) {
            if (target instanceof Creep) {
                return target.transfer(this.creep, resourceType, amount);
            }
            else {
                return this.creep.withdraw(target, resourceType, amount);
            }
        }
        else {
            this.travelTo(target, options)
            return ERR_NOT_IN_RANGE;
        }
    }

    idleOffRoad(anchor: {pos: RoomPosition} = this.mission.flag) {
        this.creep.idleOffRoad(anchor);
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
}