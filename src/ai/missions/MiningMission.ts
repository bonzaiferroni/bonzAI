import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {SourceGuru} from "./MiningGuru";
import {MinerAgent} from "./MinerAgent";
import {Agent} from "./Agent";

export class MiningMission extends Mission {

    miners: MinerAgent[];
    minerCarts: Agent[];
    paver: Creep;
    guru: SourceGuru;

    source: Source;
    container: StructureContainer;
    storage: StructureStorage;
    remoteSpawning: boolean;

    memory: {
        potencyPerMiner: number;
        positionsAvailable: number;
        transportAnalysis: TransportAnalysis;
        distanceToStorage: number;
        roadRepairIds: string[];
        prespawn: number;
    };

    roles = {
        miner: MinerAgent,
        minerCart: Agent
    };

    /**
     * General-purpose energy mining, uses a nested TransportMission to transfer energy
     * @param operation
     * @param name
     * @param source
     * @param remoteSpawning
     */

    constructor(operation: Operation, name: string, source: Source, remoteSpawning = false) {
        super(operation, name);
        this.source = source;
        this.remoteSpawning = remoteSpawning;
    }

    // return-early
    initMission() {
        if (!this.hasVision) return;

        this.guru = new SourceGuru(this);
        this.guru.init();
        this.storage = this.guru.findMinerStorage();
        this.container = this.guru.findContainer();
    }

    getMaxMiners = () => this.guru.maxMiners;
    getMinerBody = () => {
        if (this.remoteSpawning) { return this.workerBody(6, 1, 6); }
        if (this.guru.maxMiners === 1) {
            let work = Math.ceil((Math.max(this.source.energyCapacity,
                        SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER) + 1;
            return this.workerBody(work, 1, Math.ceil(work / 2));
        }
        else if (this.guru.maxMiners === 2) { return this.workerBody(3, 1, 2); }
        else { return this.workerBody(2, 1, 1); }
    };
    getMaxCarts = () => {
        const FULL_STORAGE_THRESHOLD = STORAGE_CAPACITY - 50000;
        if (_.sum(this.storage.store) > FULL_STORAGE_THRESHOLD) { return 0; }
        if (!this.container) { return 0; }
        return this.guru.analysis.cartsNeeded;
    };
    getCartBody = () => { return this.workerBody(0, this.guru.analysis.carryCount, this.guru.analysis.moveCount) };

    roleCall() {
        this.miners = this.headCount2<MinerAgent>("miner", this.getMinerBody, this.getMaxMiners,
            {prespawn: this.memory.prespawn});

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }

        let memory = { scavanger: RESOURCE_ENERGY };
        this.minerCarts = this.headCount2<Agent>("minerCart", this.getCartBody, this.getMaxCarts,
            {prespawn: this.guru.analysis.distance, memory: memory});
    }

    missionActions() {

        let order = 0;
        for (let miner of this.miners) {
            this.minerActions(miner, order);
            order++;
        }

        for (let cart of this.minerCarts) {
            this.cartActions(cart);
        }

        if (this.paver) {
            this.paverActions(this.paver);
        }

        if (this.container) {
            let startingPosition: {pos: RoomPosition} = this.storage;
            if (!startingPosition) {
                startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            }
            if (!startingPosition) {
                startingPosition = this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES,
                    {filter: ( (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN)})[0];
            }
            if (startingPosition) {
                let distance = this.pavePath(startingPosition, this.container, 2);
                if (distance) {
                    this.memory.distanceToStorage = distance;
                }
            }
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
        this.memory.transportAnalysis = undefined;
    }

    private minerActions(miner: MinerAgent, order: number) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) {
            miner.dropEnergy();
            return;
        }

        if (!this.hasVision) {
            miner.travelTo(this.flag);
            return; // early
        }

        if (!this.container) {
            let reserveEnergy = order === 0 && this.guru.maxMiners > 1;
            miner.buildContainer(this.source, reserveEnergy);
            return;
        }

        if (order === 0) {
            miner.leadMinerActions(this.source, this.container);
            if (!miner.memory.registered && miner.pos.isNearTo(this.source)) {
                this.registerPrespawn(miner);
            }
        }
        else {
            if (this.guru.maxMiners === 1) {
                miner.replaceCurrentMiner(this.container)
            }
            else {
                miner.backupMinerActions(this.source, this.container);
            }
        }
    }

    private cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) return; // early

        // emergency cpu savings
        if (Game.cpu.bucket < 1000) return;

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            if (!this.container) {
                cart.idleOffRoad();
                return;
            }

            let range = cart.pos.getRangeTo(this.container);
            if (range > 3) {
                cart.travelTo(this.container);
                return;
            }

            if (this.container.store.energy < cart.creep.carryCapacity) {
                cart.idleOffRoad(this.flag, true);
                return;
            }

            let outcome = cart.pickup(this.container, RESOURCE_ENERGY);
            if (outcome === OK) {
                cart.travelTo(this.storage);
            }
            return;
        }

        let outcome = cart.deliver(this.storage, RESOURCE_ENERGY);
        if (outcome === OK) {
            if (cart.creep.ticksToLive < this.guru.distance * 2) {
                cart.creep.suicide();
            }
            else {
                cart.travelTo(this.container);
            }
        }
    }
}