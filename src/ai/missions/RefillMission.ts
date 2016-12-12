import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";

interface EnergyStructure extends Structure {
    pos: RoomPosition
    energy: number
    energyCapacity: number
}

export class RefillMission extends Mission {

    carts: Creep[];
    emergencyCarts: Creep[];
    emergencyMode: boolean;
    empties: EnergyStructure[];

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
            emergencyMax = 1;
        }

        let emergencyBody = () => { return this.workerBody(0, 4, 2); };
        this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyMax);

        let cartBody = () => {
            return this.bodyRatio(0, 2, 1, 1, 10);
        };

        let memory = { scavanger: RESOURCE_ENERGY };
        this.carts = this.headCount("spawnCart", cartBody, max, {prespawn: 50, memory: memory});
        this.memory.cartsLastTick = this.carts.length;
    }

    missionActions() {

        for (let cart of this.emergencyCarts) {
            this.spawnCartActions(cart);
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
            if (cart.carry.energy === cart.carryCapacity) {
                if (cart.pos.inRangeTo(this.spawnGroup, 12)) {
                    cart.idleOffRoad(this.flag);
                }
                else {
                    cart.blindMoveTo(this.spawnGroup, {maxRooms: 1});
                }
            }
            else {
                cart.memory.hasLoad = false;
            }
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

    findNearestEmpty(cart: Creep, pullTarget?: EnergyStructure): EnergyStructure {
        if (!this.empties) {
            this.empties = _.filter(this.spawnGroup.extensions.concat(this.spawnGroup.spawns), (s: StructureSpawn) => {
                return s.energy < s.energyCapacity;
            }) as EnergyStructure[];
            this.empties = this.empties.concat(_.filter(this.room.findStructures(STRUCTURE_TOWER), (s: StructureTower) => {
                return s.energy < s.energyCapacity * .5;
            }) as EnergyStructure[]);
        }

        if (pullTarget) {
            _.pull(this.empties, pullTarget);
        }

        return cart.pos.findClosestByRange(this.empties);
    }
}