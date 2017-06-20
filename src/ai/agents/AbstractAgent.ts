import {helper} from "../../helpers/helper";
import {CreepHelper} from "../../helpers/CreepHelper";
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
    public posLastTick: RoomPosition;
    public cache: any;
    private potentials: {[partType: string]: number};

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

    public getActiveBodyparts(type: string): number { return this.creep.getActiveBodyparts(type); }

    public getPotential(type: string) {
        if (!this.potentials) {
            this.potentials = this.findPotentials();
        }
        return this.potentials[type];
    }

    private findPotentials(): {[partType: string]: number} {
        let potentials = {
            [RANGED_ATTACK]: 0,
            [HEAL]: 0,
            [ATTACK]: 0,
            [WORK]: 0,
        };

        let unitPotential = {
            [RANGED_ATTACK]: RANGED_ATTACK_POWER,
            [ATTACK]: ATTACK_POWER,
            [HEAL]: HEAL_POWER,
            [WORK]: DISMANTLE_POWER,
        };

        for (let part of this.creep.body) {
            if (unitPotential[part.type]) {
                let potential = unitPotential[part.type];
                if (part.boost) { potential *= 4; }
                potentials[part.type] += potential;
            }
        }

        return potentials;
    }

    public trackMovement() {
        if (this.memory.posLastTick && this.memory.posTick === Game.time - 1) {
            this.posLastTick = helper.deserializeRoomPosition(this.memory.posLastTick);
        }

        this.memory.posLastTick = this.pos;
        this.memory.posTick = Game.time;
    }

    public isMoving() {
        if (!this.posLastTick) { return false; }
        return !this.pos.inRangeTo(this.posLastTick, 0);
    }

    public isApproaching(pos: {pos: RoomPosition} | RoomPosition): boolean {
        if (!(pos instanceof RoomPosition)) {
            pos = pos.pos;
        }

        if (!this.posLastTick) { return false; }
        let distanceLastTick = pos.getRangeTo(this.posLastTick);
        let distanceNow = pos.getRangeTo(this);
        return distanceNow < distanceLastTick;
    }

    public expectedDamage(place: {pos: RoomPosition}): number {
        let range = this.pos.getRangeTo(place);
        return this.expectedDamageAtRange(range);
    }

    public expectedDamageAtRange(range: number) {
        let damage = 0;
        if (range <= 3) {
            damage += this.getPotential(RANGED_ATTACK);
        }
        if (range <= 1) {
            damage += this.getPotential(ATTACK);
        }
        return damage;
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
