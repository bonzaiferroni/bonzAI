import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";

interface EnergyStructure extends Structure {
    pos: RoomPosition
    energy: number
    energyCapacity: number
}

export class RefillMission extends Mission {

    carts: Agent[];
    emergencyCarts: Agent[];
    emergencyMode: boolean;
    empties: EnergyStructure[];

    memory: {
        cartsLastTick: number,
        max: number
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

        let max = () => this.room.storage ? 1 : 2;
        let emergencyMax = () => this.emergencyMode ? 1 : 0;

        let emergencyBody = () => { return this.workerBody(0, 4, 2); };
        this.emergencyCarts = this.headCount2("emergency_" + this.name, emergencyBody, emergencyMax);

        let cartBody = () => {
            if (this.operation.type === "flex") {
                return this.bodyRatio(0, 2, 1, 1, 16);
            }
            else {
                return this.bodyRatio(0, 2, 1, 1, 10);
            }
        };

        let memory = { scavanger: RESOURCE_ENERGY };
        this.carts = this.headCount2("spawnCart", cartBody, max, {prespawn: 50, memory: memory});
        this.memory.cartsLastTick = this.carts.length;
    }

    missionActions() {

        for (let cart of this.emergencyCarts) {
            this.spawnCartActions(cart, 0);
        }

        let order = 0;
        for (let cart of this.carts) {
            this.spawnCartActions(cart, order);
            order++;
        }
    }

    spawnCartActions(cart: Agent, order: number) {

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (order !== 0 && cart.ticksToLive < 50) {
                cart.suicide();
                return;
            }
            cart.memory.emptyId = undefined;
            cart.procureEnergy(this.findNearestEmpty(cart), true);
            return;
        }

        let target = this.findNearestEmpty(cart);
        if (!target) {
            if (cart.carry.energy < cart.carryCapacity * .8) {
                cart.memory.hasLoad = false;
            }
            else {
                cart.idleNear(this.spawnGroup, 12);
            }
            return;
        }

        // has target
        if (!cart.pos.isNearTo(target)) {
            cart.travelTo(target);
            if (this.room.storage && cart.pos.isNearTo(this.room.storage) &&
                cart.carry.energy <= cart.carryCapacity - 50) {
                cart.withdraw(this.room.storage, RESOURCE_ENERGY);
            }
            return;
        }

        // is near to target
        let outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
            cart.memory.emptyId = undefined;
            target = this.findNearestEmpty(cart, target);
            if (target && !cart.pos.isNearTo(target)) {
                cart.travelTo(target);
            }
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }

    findNearestEmpty(cart: Agent, pullTarget?: EnergyStructure): EnergyStructure {
        let findEmpty = (): Structure => {
            if (!this.empties) {
                this.empties = _.filter(this.room.findStructures(STRUCTURE_SPAWN)
                    .concat(this.room.findStructures(STRUCTURE_EXTENSION)), (s: StructureSpawn) => {
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
        };

        let forgetEmpty = (s: EnergyStructure): boolean => s.energy === s.energyCapacity || Game.time % 5 === 0;

        return cart.rememberStructure(findEmpty, forgetEmpty, "emptyId", true) as EnergyStructure;
    }
}