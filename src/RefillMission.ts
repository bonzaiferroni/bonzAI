import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class RefillMission extends Mission {

    carts: Creep[];
    emergencyCarts: Creep[];
    limit: number;
    maxRefillers: number;
    emergencyMode: boolean;
    structures: Structure[];

    /**
     * General-purpose structure refilling. Can be used to refill spawning energy, towers, links, labs, etc.
     *  Will default to drawing energy from storage, and use altBattery if there is no storage with energy
     * @param operation
     * @param name
     * @param maxRefillers
     * @param structures
     * @param limit - the number of units each refill cart should be (1 unit = [CARRY, CARRY, MOVE])
     * @param emergencyMode
     */

    constructor(operation: Operation, name: string, maxRefillers: number, structures: Structure[], limit: number,
                emergencyMode?: boolean) {
        super(operation, name);
        this.limit = limit;
        this.structures = structures;
        this.maxRefillers = maxRefillers;
        this.emergencyMode = emergencyMode;
    }

    initMission() {
        this.structures = _.filter(this.structures, (s: StructureSpawn | StructureExtension) => s.energy < s.energyCapacity) as Structure[];
    }

    roleCall() {

        if (this.emergencyMode) {
            let emergencyBody = () => { return this.workerBody(0, 2, 1); };
            let needEmergencyCart = this.memory.cartCount === 0;
            if (needEmergencyCart && Game.time % 10 === 0) console.log(this.opName, "is spawning emergency spawnEnergy-refilling carts");
            let emergencyCartMax = needEmergencyCart ? 2 : 0;
            this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyCartMax);
        }

        let cartBody = () => {
            return this.bodyRatio(0, 2, 1, 1, this.limit);
        };

        let memory = { scavanger: RESOURCE_ENERGY };
        this.carts = this.headCount(this.name, cartBody, this.maxRefillers, {prespawn: 50, memory: memory});
        this.memory.cartCount = this.carts.length;
    }

    missionActions() {

        if (this.emergencyMode) {
            for (let cart of this.emergencyCarts) {
                this.refillCartActions(cart, this.structures);
            }
        }

        for (let cart of this.carts) {
            this.refillCartActions(cart, this.structures);
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }
}