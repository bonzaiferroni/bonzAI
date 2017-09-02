import {helper} from "../../helpers/helper";
import {CreepHelper} from "../../helpers/CreepHelper";
import {HostileAgent} from "./HostileAgent";
import {PeaceAgent} from "./PeaceAgent";

export class AbstractAgent {

    public creep: Creep;
    public room: Room;
    public hits: number;
    public hitsMax: number;
    public carry: StoreDefinition;
    public carryCapacity: number;
    public pos: RoomPosition;
    public ticksToLive: number;
    public id: string;
    public fatigue: number;
    public memory: any;
    private previousPos: RoomPosition;
    public cache: any;
    private potentials: {[partType: string]: number};

    public static census: {
        hostile: {[roomName: string]: HostileAgent[] }
        raid: {[roomName: string]: PeaceAgent[] }
    };

    constructor(creep: Creep) {
        this.creep = creep;
        this.memory = creep.memory;
        this.pos = creep.pos;
        this.carry = creep.carry;
        this.carryCapacity = creep.carryCapacity;
        this.hits = creep.hits;
        this.hitsMax = creep.hitsMax;
        this.ticksToLive = creep.ticksToLive;
        this.id = creep.id;
        this.fatigue = creep.fatigue;
        this.room = creep.room;
        this.cache = {};
    }

    public static update() {
        this.census = {
            hostile: {},
            raid: {},
        };
    }

    public getActiveBodyparts(type: string): number { return this.creep.getActiveBodyparts(type); }

    public getPotential(type: string) {
        return CreepHelper.getPotential(this.creep, type);
    }

    public previousPosition() {
        if (!this.previousPos) {
            if (this.memory.previousPos) {
                this.previousPos = helper.deserializeRoomPosition(this.memory.previousPos);
            } else {
                this.previousPos = this.pos;
            }
            this.memory.previousPos = this.pos;
        }
        return this.previousPos;
    }

    public isMoving() {
        return this.pos.getRangeTo(this.previousPos) > 0;
    }

    public distanceDelta(pos: {pos: RoomPosition} | RoomPosition): number {
        if (!(pos instanceof RoomPosition)) {
            pos = pos.pos;
        }

        let rangeLastTick = pos.getRangeTo(this.previousPosition());
        let rangeNow = pos.getRangeTo(this);
        return rangeNow - rangeLastTick;
    }

    public expectedDamage(place: {pos: RoomPosition}): number {
        let range = this.pos.getRangeTo(place);
        return this.expectedDamageAtRange(range);
    }

    public expectedDamageAtRange(range: number) {
        return CreepHelper.expectedDamageAtRange(this.creep, range);
    }

    public expectedHealing(place: {pos: RoomPosition}): number {
        let range = this.pos.getRangeTo(place);
        return this.expectedHealingAtRange(range);
    }

    public expectedHealingAtRange(range: number) {
        let potential = this.getPotential(HEAL);
        if (range <= 1) {
            return potential;
        } else {
            return potential / 3;
        }
    }

    public expectedMassDamage(place: {pos: RoomPosition}): number {
        let range = this.pos.getRangeTo(place);
        return this.expectedHealingAtRange(range);
    }

    public expectedMassDamageAtRange(range: number): number {
        let potential = this.getPotential(RANGED_ATTACK);
        if (range <= 1) {
            return potential;
        } else if (range === 2) {
            return Math.floor(potential * .4);
        } else if (range === 3) {
            return Math.floor(potential * .1);
        } else {
            return 0;
        }
    }

    public isBoosted() {
        if (this.cache.isBoosted === undefined) {
            this.cache.isBoosted = CreepHelper.isBoosted(this.creep);
        }
        return this.cache.isBoosted;
    }
}
