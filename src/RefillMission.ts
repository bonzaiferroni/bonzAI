import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class RefillMission extends Mission {

    carts: Creep[];
    emergencyCarts: Creep[];
    emergencyMode: boolean;
    empties: StructureSpawn[];

    memory: {
        cartsLastTick: number
    };

    /**
     * General-purpose structure refilling. Can be used to refill spawning energy, towers, links, labs, etc.
     *  Will default to drawing energy from storage, and use altBattery if there is no storage with energy
     * @param operation
     */

    constructor(operation: Operation) {
        super(operation, "refill");
    }

    initMission() {
        this.emergencyMode = this.memory.cartsLastTick === 0;
    }

    roleCall() {

        let max = 2;
        if (this.room.storage) {
            max = 1;
        }

        let emergencyMax = 0;
        if (this.emergencyMode) {
            emergencyMax = 3;
        }

        let emergencyBody = () => { return this.workerBody(0, 2, 1); };
        this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyMax);

        let cartBody = () => {
            return this.bodyRatio(0, 2, 1, 1, 10);
        };

        let memory = { scavanger: RESOURCE_ENERGY };
        this.carts = this.headCount("spawnCart", cartBody, max, {prespawn: 50, memory: memory});
        this.memory.cartsLastTick = this.carts.length;
    }

    missionActions() {

        if (this.emergencyMode) {
            for (let cart of this.emergencyCarts) {
                this.spawnCartActions(cart);
            }
        }

        for (let cart of this.carts) {
            this.spawnCartActions(cart);
        }
    }

    spawnCartActions(cart: Creep) {

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            this.procureEnergy(cart, this.findNearestEmpty(cart), true);
            return;
        }

        let target = this.findNearestEmpty(cart);
        if (!target) {
            cart.memory.hasLoad = cart.carry.energy === cart.carryCapacity;
            cart.yieldRoad(this.flag);
            return;
        }

        // has target
        if (!cart.pos.isNearTo(target)) {
            cart.blindMoveTo(target, {maxRooms: 1});
            return;
        }

        // is near to target
        let outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
            target = this.findNearestEmpty(cart, target);
            if (target && !cart.pos.isNearTo(target)) {
                cart.blindMoveTo(target, {maxRooms: 1});
            }
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }

    findNearestEmpty(cart: Creep, pullTarget?: StructureSpawn | StructureExtension): StructureSpawn | StructureExtension {
        if (!this.empties) {
            this.empties = _.filter(this.spawnGroup.extensions.concat(this.spawnGroup.spawns), (s: StructureSpawn) => {
                return s.energy < s.energyCapacity;
            }) as StructureSpawn[];
        }

        if (pullTarget) {
            _.pull(this.empties, pullTarget);
        }

        return cart.pos.findClosestByRange(this.empties);
    }
}