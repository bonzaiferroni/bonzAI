import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {Profiler} from "../../Profiler";
import {PeaceAgent} from "../agents/PeaceAgent";
import {ProcureEnergyOptions} from "../agents/interfaces";

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

    private cartBody = () => {
        return this.workerUnitBody(0, 2, 1, 16);
    };

    private emergencyMax = () => { return this.roleCount("spawnCart") === 0 ? 1 : 0; };
    private emergencyBody = () => { return this.workerBody(0, 4, 2); };

    public roleCall() {
        this.emergencyCarts = this.headCount("emergency_" + this.name, this.emergencyBody, this.emergencyMax);
        this.carts = this.headCount("spawnCart", this.cartBody, this.maxCarts, {
            prespawn: 50,
            memory: { scavenger: RESOURCE_ENERGY },
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

    private findNext = (agent: Agent) => {
        return this.findNearestEmpty(agent);
    };

    private spawnCartActions(cart: Agent, order: number) {

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (order !== 0 && cart.ticksToLive < 50) {
                cart.suicide();
                return;
            }
            if (!this.room.storage) {
                cart.stealNearby("creep", "spawnCart");
            }
            cart.memory.emptyId = undefined;
            let options: ProcureEnergyOptions = {
                nextDestination: this.findNext,
                highPriority: true,
            };
            cart.procureEnergy(options);
            return;
        }

        let target = this.findNearestEmpty(cart);
        if (!target) {
            if (cart.carry.energy < cart.carryCapacity * .5) {
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
                        cart.travelTo(target, {maxRooms: 1, range: 1});
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
            if (cart.memory.nextCheck > Game.time) { return; }
            let closestEmpty = cart.pos.findClosestByRange<EnergyStructure>(this.getEmpties(pullTarget));
            if (closestEmpty) {
                delete cart.memory.nextCheck;
                cart.memory.emptyId = closestEmpty.id;
                return closestEmpty;
            } else {
                cart.memory.nextCheck = Game.time + 5 + Math.floor(Math.random() * 5);
            }
        }
    }

    private getEmpties(pullTarget?: EnergyStructure): EnergyStructure[] {
        if (!this.state.empties) {
            let empties = _.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_SPAWN)
                .concat(this.room.findStructures<EnergyStructure>(STRUCTURE_EXTENSION)), (s: StructureSpawn) => {
                return s.energy < s.energyCapacity;
            });
            if (empties.length === 0) {
                empties = _.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_TOWER),
                    (s: StructureTower) => { return s.energy < s.energyCapacity * .8; });
            }
            this.state.empties = empties;
        }

        if (pullTarget) {
            _.pull(this.state.empties, pullTarget);
        }

        return this.state.empties;
    }
}
