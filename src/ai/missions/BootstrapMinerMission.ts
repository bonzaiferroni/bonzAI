import {Agent} from "../agents/Agent";
import {MiningMission, MiningMissionState} from "./MiningMission";
import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {PaveData} from "./PaverMission";
import {helper} from "../../helpers/helper";
import {TransportAnalysis} from "../../interfaces";
import {BootMiningGuru} from "./BootMiningGuru";
import {Tick} from "../../Tick";

interface BootstrapMiningMemory extends MissionMemory {
}

interface BootstrapMiningAnalysis {
    workCount: number;
    carryCount: number;
    moveCount: number;
    minerCount: number;
}

export interface BootstrapMiningData {
    sourceId: string;
    containerPos: RoomPosition;
    posCount: number;
    distance: number;
    spawnDelay: number;
}

export class BootstrapMiningMission extends Mission {

    public memory: BootstrapMiningMemory;
    private sourceId: string;
    private containerPos: RoomPosition;
    private posCount: number;
    private source: Source;
    private bootRoom: Room;
    private distance: number;
    private dibs: {[id: string]: boolean} = {};
    private smallCarts: boolean;
    private analysis: TransportAnalysis;
    private carts: Agent[];
    private miners: Agent[];
    private site: ConstructionSite;
    private container: StructureContainer;
    private guru: BootMiningGuru;

    constructor(operation: Operation, index: number, data: BootstrapMiningData, guru: BootMiningGuru) {
        super(operation, `${data.containerPos.roomName}_bootMiner${index}`);
        this.sourceId = data.sourceId;
        this.containerPos = helper.deserializeRoomPosition(data.containerPos);
        this.posCount = data.posCount;
        this.distance = data.distance;
        this.guru = guru;
    }

    protected init() {
    }

    protected update() {
        this.bootRoom = Game.rooms[this.containerPos.roomName];

        let addDistance = 10;
        if (this.room.storage) {
            addDistance = 0;
        }

        this.source = Game.getObjectById<Source>(this.sourceId);
        this.smallCarts = this.spawnGroup.maxSpawnEnergy === 300 && this.containerPos.roomName === this.roomName;
        this.analysis = Mission.analyzeTransport(this.distance + addDistance, this.findEnergyPerTick(),
            this.spawnGroup.maxSpawnEnergy, true);
        this.container = this.findContainer();
    }

    protected minerBody = () => {
        let analysis = this.BootstrapMiningAnalysis();
        return this.workerBody(analysis.workCount, analysis.carryCount, analysis.moveCount);
    };

    protected maxMiners = () => {
        let analysis = this.BootstrapMiningAnalysis();
        return analysis.minerCount;
    };

    protected maxCarts = () => {
        let maxCarts = this.analysis.cartsNeeded;
        if (this.smallCarts) {
            maxCarts = this.analysis.carryCount;
        }

        let minerCount = this.roleCount(this.name);
        if (minerCount === this.maxMiners()) {
            return maxCarts;
        } else {
            return minerCount;
        }
    };

    protected cartBody = () => {
        if (this.smallCarts) {
            return this.workerBody(0, 1, 1);
        } else {
            return this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);
        }
    };

    protected roleCall() {
        this.carts = this.headCount(this.name + "cart", this.cartBody, this.maxCarts, {
            prespawn: this.distance,
        });

        this.miners = this.headCount(this.name, this.minerBody, this.maxMiners, {
            prespawn: this.distance * 2,
        });
    }

    protected actions() {
        for (let cart of this.carts) {
            this.cartActions(cart);
        }

        for (let miner of this.miners) {
            this.minerActions(miner);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    public isSpawning() {
        return this.roleCount(this.name) > 0;
    }

    protected findEnergyPerTick() {
        let capacity = SOURCE_ENERGY_NEUTRAL_CAPACITY as number;
        if (this.bootRoom && (this.bootRoom.controller.my || this.bootRoom.controller.reservation)) {
            capacity = SOURCE_ENERGY_CAPACITY;
        }
        return Math.ceil(capacity / 300);
    }

    private findContainer(): StructureContainer {
        if (!this.bootRoom) { return; }
        let container = this.containerPos.lookForStructure<StructureContainer>(STRUCTURE_CONTAINER);
        if (container) {
            return container;
        } else {
            let site = this.containerPos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (site) {
                this.site = site;
            } else {
                this.containerPos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }

    private BootstrapMiningAnalysis(): BootstrapMiningAnalysis {
        if (!this.cache.BootstrapMiningAnalysis) {
            let carryPerUnit = 2;
            let additionalCost = 0;
            let additionalCarry = 0;
            let additionalWork = 0;
            if (this.distance < 12) {
                carryPerUnit = 1;
            }
            if (this.container) {
                additionalWork = 1;
                carryPerUnit = 0;
                additionalCost = 50;
                additionalCarry = 1;
            }
            let unitCost = 125 + carryPerUnit * 50;
            let maxWork = Math.ceil(this.findEnergyPerTick() / 2) + additionalWork;
            let workCount = this.spawnGroup.maxUnitsPerCost(unitCost, maxWork, additionalCost);

            let minerCount = Math.min(Math.ceil(maxWork / workCount), this.posCount);
            this.cache.BootstrapMiningAnalysis = {
                workCount: workCount,
                carryCount: carryPerUnit + additionalCarry,
                moveCount: Math.ceil(workCount / 2),
                minerCount: minerCount,
            } as BootstrapMiningAnalysis;
        }
        return this.cache.BootstrapMiningAnalysis;
    }

    // CREEP BEHAVIOR
    protected minerActions(miner: Agent) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) { return; }

        if (!this.state.hasVision) {
            miner.travelTo(this.containerPos);
            return;
        }

        if (!this.source || miner.pos.isNearExit(0)) {
            miner.travelTo(this.containerPos);
            return;
        }

        if (!miner.isNearTo(this.source)) {
            let position: RoomPosition;
            if (this.container) {
                position = _.min(this.source.pos.openAdjacentSpots(), x => x.getRangeTo(this.container));
            }

            if (!_.isObject(position)) {
                position = this.source.pos;
            }

            miner.travelTo(position);
            return;
        }

        let dropped = miner.pos.lookFor<Resource>(LOOK_RESOURCES)[0];
        if (dropped) {
            miner.pickup(dropped);
        }

        if (this.container) {

            if (miner.sumCarry() >= miner.carryCapacity - 25) {
                // repair
                if (this.container.hits < this.container.hitsMax * .9) {
                    miner.repair(this.container);
                    return;
                }

                if (miner.isNearTo(this.container)) {
                    miner.transferEverything(this.container);
                }
            }

            // harvest
            if (this.source.energy > 0 && this.container.store.energy < this.container.storeCapacity - 25) {
                miner.harvest(this.source);
                return;
            }

            // idle
            return;
        }

        if (this.site) {

            // harvest
            if (miner.carry.energy < miner.carryCapacity) {
                miner.harvest(this.source);
                return;
            }

            // build
            miner.build(this.site);
            return;
        }
    }

    protected cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; }

        // emergency cpu savings
        if (Game.cpu.bucket < 1000) { return; }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            let energySource = this.findCartSource(cart);
            if (!energySource) {
                cart.idleNear({pos: this.containerPos}, 3, false, true, {offRoad: true});
                return;
            }

            if (cart.isNearTo(energySource)) {
                cart.memory.sourceId = undefined;
                cart.withdrawEverything(energySource);
            } else {
                cart.travelTo(energySource);
            }
            return;
        }

        // heal
        if (cart.hits < cart.hitsMax && cart.room.hostiles.length === 0) {
            let tower = cart.room.findStructures<StructureTower>(STRUCTURE_TOWER)[0];
            if (tower) {
                tower.heal(cart.creep);
            }
        }

        // determine target
        let target: Structure|Creep = cart.findDeliveryTarget(this.roomName);
        if (!target) {
            this.guru.registerEnergyWaiting(cart.carry[RESOURCE_ENERGY]);
            cart.idleOffRoad();
            return;
        }

        // deliver
        if (cart.isNearTo(target)) {
            let outcome = cart.transfer(target, RESOURCE_ENERGY);
            if (outcome === OK) {
                cart.memory.deliverId = undefined;
                let canDeliver = this.canDeliver(cart, target);
                if (canDeliver) {
                    cart.travelTo(this.containerPos, {offRoad: true});
                }
            }
        } else {
            cart.travelTo(target, {ignoreRoads: true});
        }
    }

    private findCartSource(cart: Agent): StructureContainer|Creep {
        if (cart.memory.sourceId) {
            let energySource = Game.getObjectById<StructureContainer|Creep>(cart.memory.sourceId);
            if (energySource) {
                let normalizedStore = Agent.normalizeStore(energySource);
                if (normalizedStore.store[RESOURCE_ENERGY] > 25) {
                    this.dibs[cart.memory.sourceId] = true;
                    return energySource;
                }
            }
            delete cart.memory.sourceId;
            return this.findCartSource(cart);
        } else {
            if (!cart.pos.inRangeTo(this.containerPos, 3)) {
                return;
            }

            let energySource: StructureContainer|Creep;
            if (this.container && this.container.store[RESOURCE_ENERGY] > 25) {
                energySource = this.container;
            } else {
                energySource = _(this.miners)
                    .filter(x => x.carry[RESOURCE_ENERGY] > 25 && !this.dibs[x.id])
                    .map(x => x.creep)
                    .min(x => x.pos.getRangeTo(cart));
            }

            if (_.isObject(energySource)) {
                this.dibs[energySource.id] = true;
                cart.memory.sourceId = energySource.id;
                return energySource;
            }
        }
    }

    private canDeliver(cart: Agent, target: Structure|Creep) {
        let deliverAmount = cart[RESOURCE_ENERGY];
        let capacityAvailable = 0;
        if (target instanceof Creep) {
            if (target.carry[RESOURCE_ENERGY]) {
                capacityAvailable = target.carryCapacity - target.carry[RESOURCE_ENERGY];
            } else {
                capacityAvailable = target.carryCapacity;
            }
        } else if (target instanceof StructureSpawn || target instanceof StructureExtension) {
            capacityAvailable = target.energyCapacity - target.energy;
        }
        return capacityAvailable > deliverAmount;
    }
}
