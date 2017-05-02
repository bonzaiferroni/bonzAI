export class HostileAgent {

    public creep: Creep;
    public room: Room;
    public hits: number;
    public hitsMax: number;
    public pos: RoomPosition;
    public ticksToLive: number;
    public name: string;
    public id: string;
    public fatigue: number;
    public memory: HostileMemory;

    public potentials: {[partType: string]: number};
    private cache: any;

    constructor(creep: Creep) {
        this.creep = creep;
        this.room = creep.room;
        this.pos = creep.pos;
        this.hits = creep.hits;
        this.hitsMax = creep.hitsMax;
        this.ticksToLive = creep.ticksToLive;
        this.name = creep.name;
        this.id = creep.id;
        this.fatigue = creep.fatigue;
        this.cache = {};

        if (!Memory.hostileMemory[creep.id]) { Memory.hostileMemory[creep.id] = {} as HostileMemory; }
        this.memory = Memory.hostileMemory[creep.id];

        this.potentials = this.findPotentials();
    }
    public getActiveBodyparts(type: string): number { return this.creep.getActiveBodyparts(type); }
    public expectedDamage(place: {pos: RoomPosition}): number {
        let range = this.pos.getRangeTo(place);
        return this.expectedDamageAtRange(range);
    }

    public expectedDamageAtRange(range: number) {
        let damage = 0;
        if (range <= 3) {
            damage += this.potentials[RANGED_ATTACK];
        }
        if (range <= 1) {
            damage += this.potentials[ATTACK];
        }
        return damage;
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
}
