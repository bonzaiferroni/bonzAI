import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {Profiler} from "../../Profiler";
import {RaidAgent} from "../agents/RaidAgent";

interface EnergyStructure extends Structure {
    pos: RoomPosition;
    energy: number;
    energyCapacity: number;
}

interface RefillMemory extends MissionMemory {
    max: number;
}

interface RefillState extends MissionState {
    empties: EnergyStructure[];
}

export class RefillMission extends Mission {

    private carts: Agent[];
    private emergencyCarts: Agent[];

    public memory: RefillMemory;
    public state: RefillState;

    /**
     * General-purpose structure refilling. Can be used to refill spawning energy, towers, links, labs, etc.
     *  Will default to drawing energy from storage, and use altBattery if there is no storage with energy
     * @param operation
     */

    constructor(operation: Operation) {
        super(operation, "refill");
    }

    public init() {
    }

    public update() {
    }

    private maxCarts = () => {
        if (this.room.storage || this.room.controller.level < 3) { return 1; }
        return 2;
    };

    public roleCall() {
        let emergencyMax = () => this.roleCount("spawnCart") === 0 && this.room.controller.level > 1 ? 1 : 0;

        let emergencyBody = () => { return this.workerBody(0, 4, 2); };
        this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyMax);

        let cartBody = () => {
            return this.bodyRatio(0, 2, 1, 1, 16);
        };

        let memory = { scavenger: RESOURCE_ENERGY };
        this.carts = this.headCount("spawnCart", cartBody, this.maxCarts, {
            prespawn: 50,
            memory: memory,
            forceSpawn: this.room.controller.level >= 4,
        });
    }

    public actions() {

        Profiler.start("refill.actions");
        for (let cart of this.emergencyCarts) {
            this.spawnCartActions(cart, 0);
        }

        let order = 0;
        for (let cart of this.carts) {
            this.spawnCartActions(cart, order);
            order++;
        }
        Profiler.end("refill.actions");
    }

    private spawnCartActions(cart: Agent, order: number) {

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (order !== 0 && cart.ticksToLive < 50) {
                cart.suicide();
                return;
            }
            cart.memory.emptyId = undefined;
            let options: ProcureEnergyOptions = {
                nextDestination: this.findNearestEmpty(cart),
                highPriority: true,
            }
            cart.procureEnergy(options);
            return;
        }

        let target = this.findNearestEmpty(cart);
        if (!target) {
            if (cart.carry.energy < cart.carryCapacity * .8) {
                cart.memory.hasLoad = false;
            } else {
                cart.idleNear(this.room.storage || this.room.findStructures<StructureSpawn>(STRUCTURE_SPAWN)[0], 6, true);
            }
            return;
        }

        // has target
        if (cart.pos.isNearTo(target)) {
            let outcome = cart.transfer(target, RESOURCE_ENERGY);
            if (outcome === OK) {
                if (cart.carry.energy > target.energyCapacity - target.energy) {
                    cart.memory.emptyId = undefined;
                    target = this.findNearestEmpty(cart, target);
                    if (target && !cart.pos.isNearTo(target)) {
                        cart.travelTo(target, {maxRooms: 1});
                    }
                } else if (this.room.storage) {
                    cart.travelTo(this.room.storage, {maxRooms: 1});
                }
            }

        } else {
            cart.travelTo(target, {maxRooms: 1});
        }
    }

    public finalize() {
    }
    public invalidateCache() {
    }

    private findNearestEmpty(cart: Agent, pullTarget?: EnergyStructure): EnergyStructure {
        if (cart.memory.emptyId) {
            let empty = Game.getObjectById<EnergyStructure>(cart.memory.emptyId);
            if (empty && empty.energy < empty.energyCapacity - 50) {
                let rangeToEmpty = cart.pos.getRangeTo(empty);
                let closestEmpty = cart.pos.findClosestByRange(this.getEmpties());
                let rangeToClosest = cart.pos.getRangeTo(closestEmpty);
                if (rangeToEmpty > rangeToClosest) {
                    cart.memory.emptyId = closestEmpty.id;
                    return closestEmpty;
                } else {
                    return empty;
                }
            } else {
                delete cart.memory.emptyId;
                return this.findNearestEmpty(cart, pullTarget);
            }
        } else {
            let closestEmpty = cart.pos.findClosestByRange<EnergyStructure>(this.getEmpties(pullTarget));
            if (closestEmpty) {
                cart.memory.emptyId = closestEmpty.id;
                return closestEmpty;
            }
        }
    }

    private getEmpties(pullTarget?: EnergyStructure): EnergyStructure[] {
        if (!this.state.empties) {
            let empties = _.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_SPAWN)
                .concat(this.room.findStructures<EnergyStructure>(STRUCTURE_EXTENSION)), (s: StructureSpawn) => {
                return s.energy < s.energyCapacity;
            });
            empties = empties.concat(_.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_TOWER),
                (s: StructureTower) => { return s.energy < s.energyCapacity * .5; }));
            this.state.empties = empties;
        }

        if (pullTarget) {
            _.pull(this.state.empties, pullTarget);
        }

        return this.state.empties;
    }
}
