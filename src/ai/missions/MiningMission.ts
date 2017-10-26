import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {MemHelper} from "../../helpers/MemHelper";
import {Notifier} from "../../notifier";
import {Agent} from "../agents/Agent";
import {PaveData, PaverMission} from "./PaverMission";
import {Traveler} from "../../Traveler";

interface MiningMissionMemory extends MissionMemory {
    spawnDistance: number;
    storeDistance: number;
    containerIntPos: number;
    containerId: string;
}

export interface MiningMissionState extends MissionState {
    site: ConstructionSite;
    store: StoreStructure;
    source: Source;
    container: StructureContainer;
}

export class MiningMission extends Mission {

    public memory: MiningMissionMemory;
    public state: MiningMissionState;
    protected sourceId: string;
    protected analysis: TransportAnalysis;
    protected containerPos: RoomPosition;
    protected storeDistance: number;
    protected spawnDistance: number;
    protected miners: Agent[];
    protected carts: Agent[];
    protected localStorage: boolean;
    protected remoteSpawning: boolean;

    constructor(operation: Operation, index: number, sourceId: string, localStorage: boolean, name = "miner") {
        super(operation, name + index);
        this.sourceId = sourceId;
        this.localStorage = localStorage;
    }

    protected init() {
        if (!this.state.hasVision) {
            this.operation.sleepMission(this, 100);
            return;
        }

        this.state.source = this.findSource();
        this.state.store = this.findStore();
        let origin = this.findPathOrigin();
        if (!origin) {
            this.operation.removeMission(this);
            return;
        }

        this.storeDistance = this.findStoreDistance(origin);
        this.analysis = this.findTransportAnalysis();

        if (!this.memory.containerIntPos) {
            let position = this.findContainerPosition();
            if (!position) {
                this.operation.removeMission(this);
                return;
            }
            this.memory.containerIntPos = MemHelper.intPosition(position);
        }

        this.containerPos = MemHelper.deserializeIntPosition(this.memory.containerIntPos, this.roomName);
        this.spawnDistance = this.findSpawnDistance();
        this.remoteSpawning = Game.map.getRoomLinearDistance(this.spawnGroup.pos.roomName, this.roomName) > 2;
    }

    protected update() {
        if (!this.state.hasVision) { return; }

        this.state.container = this.findContainer();
        this.state.source = this.findSource();
        this.state.store = this.findStore();
        PaverMission.updatePath(this.memory, this.paverCallback);
    }

    protected paverCallback = (): PaveData => {
        return {
            id: this.operation.name + this.name,
            startPos: this.findPathOrigin(),
            endPos: this.containerPos,
            rangeToEnd: 1,
        };
    };

    protected minerBody = () => {
        let workCount = this.findWorkCount();
        if (this.spawnGroup.maxSpawnEnergy >= 4000 && this.spawnGroup.averageAvailability >= 1) {
            workCount *= 2;
        }
        let moveCount = this.findMoveCount(workCount);
        return this.workerBody(workCount, 1, moveCount);
    };

    protected maxMiners = (): number => {
        if (!this.room || this.room.hostiles.length > 0) {
            return 0;
        } else {
            return 1;
        }
    };

    protected cartBody = () => {
        return this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);
    };

    protected maxCarts = (): number => {
        if (!this.room || this.room.hostiles.length > 0) {
            return 0;
        } else {
            if (!this.state.container) { return 0; }
            if (this.state.store) {
                const FULL_STORAGE_THRESHOLD = STORAGE_CAPACITY - 50000;
                if (_.sum(this.state.store.store) > FULL_STORAGE_THRESHOLD) {
                    return 0;
                }
            } else if (this.localStorage) {
                return 0;
            }
            return this.analysis.cartsNeeded;
        }
    };

    protected roleCall() {
        this.miners = this.headCount(this.name, this.minerBody, this.maxMiners, {
            prespawn: this.spawnDistance,
        });

        this.carts = this.headCount(this.name + "cart", this.cartBody, this.maxCarts, {
            prespawn: this.analysis.distance,
        });
    }

    protected actions() {
        for (let miner of this.miners) {
            this.minerActions(miner);
        }

        for (let cart of this.carts) {
            this.cartActions(cart);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
        if (Math.random() < .01) {
            delete this.memory.storeDistance;
            delete this.memory.spawnDistance;
        }
    }

    protected findStore(): StoreStructure {
        if (this.localStorage) {
            return this.room.storage;
        } else {
            return this.getStorage(this.state.source.pos);
        }
    }

    protected findSource(): Source {
        return Game.getObjectById<Source>(this.sourceId);
    }

    protected findWorkCount() {
        return Math.ceil(this.findEnergyPerTick() / 2) + 1;
    }

    protected findEnergyPerTick() {
        return Math.ceil(Math.max(this.state.source.energyCapacity, SOURCE_ENERGY_CAPACITY) / 300);
    }

    protected findTransportAnalysis() {
        let energyPerTick = this.findEnergyPerTick();
        return Mission.analyzeTransport(this.storeDistance, energyPerTick, this.spawnGroup.maxSpawnEnergy);
    }

    private findMoveCount(workCount: number) {
        if (this.remoteSpawning) {
            return workCount;
        } else {
            return Math.ceil(workCount / 2);
        }
    }

    private findPathOrigin(): RoomPosition {
        if (this.state.store) {
            return this.state.store.pos;
        } else {
            if (this.localStorage) {
                let spawn = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
                if (spawn) {
                    return spawn.pos;
                } else {
                    let site = _.filter(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES),
                        x => x.structureType === STRUCTURE_SPAWN)[0];
                    if (site) {
                        return site.pos;
                    }
                }
            } else if (Game.map.getRoomLinearDistance(this.spawnGroup.pos.roomName, this.roomName) <= 2) {
                return this.spawnGroup.pos;
            }
        }
    }

    protected findStoreDistance(origin: RoomPosition) {
        if (!this.memory.storeDistance) {
            let distance = Traveler.findPathDistance(origin, this.state.source);
            if (distance < 0) {
                Notifier.log(`MINER: unable to find store distance in ${this.roomName}`);
                return;
            }
            this.memory.storeDistance = distance;
        }
        return this.memory.storeDistance;
    }

    protected findSpawnDistance() {
        if (!this.memory.spawnDistance) {
            let distance = Traveler.findPathDistance(this.spawnGroup, this.state.source);
            if (distance < 0) {
                Notifier.log(`MINER: unable to find spawn distance in ${this.roomName}`);
                return;
            }
            this.memory.spawnDistance = distance;
        }
        return this.memory.spawnDistance;
    }

    private findContainerPosition(): RoomPosition {
        let container = this.state.source.pos.findInRange(this.room.findStructures(STRUCTURE_CONTAINER), 1)[0];
        if (container) {
            return container.pos;
        }
        let site = this.state.source.pos.findInRange(_.filter(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES),
            x => x.structureType === STRUCTURE_CONTAINER), 1)[0];
        if (site) {
            return site.pos;
        }

        let awayFromController = (x: RoomPosition) => !this.room.controller || x.getRangeTo(this.room.controller) > 3;
        let nearOneSource = (x: RoomPosition) => x.findInRange(FIND_SOURCES, 1).length < 2;

        let validPositions = _.filter(this.state.source.pos.openAdjacentSpots(true), x => awayFromController(x) && nearOneSource(x));
        if (validPositions.length === 0) {
            validPositions = _.filter(this.state.source.pos.openAdjacentSpots(true), x => nearOneSource(x));
            if (validPositions.length === 0) {
                validPositions = this.state.source.pos.openAdjacentSpots(true);
            }
        }

        let origin = this.findPathOrigin();

        let ret = PathFinder.search(origin, validPositions);
        let lastPos = _.last(ret.path);
        if (lastPos && lastPos.isNearTo(this.state.source)) {
            return lastPos;
        } else {
            Notifier.log(`MINER: unable to find container position in ${this.roomName}`);
            return this.state.source.pos.openAdjacentSpots(true)[0];
        }
    }

    private findContainer() {
        if (this.memory.containerId) {
            let container = Game.getObjectById<StructureContainer>(this.memory.containerId);
            if (container) {
                return container;
            } else {
                delete this.memory.containerId;
                return this.findContainer();
            }
        } else {
            let container = this.containerPos.lookForStructure<StructureContainer>(STRUCTURE_CONTAINER);
            if (container) {
                this.memory.containerId = container.id;
                return container;
            } else {
                let site = this.containerPos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
                if (site) {
                    this.state.site = site;
                } else {
                    this.containerPos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        }
    }

    // Creep Behavior

    private dropEnergy(agent: Agent) {
        if (agent.creep.carry.energy > 0) {
            agent.drop(RESOURCE_ENERGY);
        }
    }
    protected minerActions(miner: Agent) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) {
            this.dropEnergy(miner);
            return;
        }

        if (!miner.pos.inRangeTo(this.containerPos, 0)) {
            miner.moveItOrLoseIt(this.containerPos, this.name);
            return;
        }

        let source = this.state.source;
        let container = this.state.container;
        if (container) {

            // repair
            if (container.hits < container.hitsMax * .9 && miner.carry.energy > 0) {
                miner.repair(container);
                return;
            }

            // harvest
            if (source.energy > 0 && container.store.energy < container.storeCapacity - 25) {
                miner.harvest(source);
                return;
            }

            // idle
            return;
        }

        let site = this.state.site;
        if (site) {

            // harvest
            if (miner.carry.energy < miner.carryCapacity) {
                miner.harvest(source);
                return;
            }

            // build
            miner.build(site);
            return;
        }
    }

    protected cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; }

        // emergency cpu savings
        if (Game.cpu.bucket < 1000) { return; }

        let container = this.state.container;
        if (!container) {
            cart.idleOffRoad();
            return;
        }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            if (_.sum(container.store) < cart.carryCapacity - cart.sumCarry()) {
                cart.idleNear(container, 3, false, true, { offRoad: true });
                return;
            }

            if (cart.isNearTo(container)) {
                cart.withdrawEverything(container);
            } else {
                cart.travelTo(container);
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

        // determine store
        let store: Structure|Creep = this.state.store;
        if (!store) {
            store = cart.findDeliveryTarget(this.spawnGroup.room.name);
            if (!store || Game.map.getRoomLinearDistance(store.pos.roomName, this.roomName) > 2) {
                cart.idleOffRoad();
                return;
            }
        }

        // deliver
        if (cart.isNearTo(store)) {
            if (store.hasOwnProperty("store")) {
                let outcome = cart.transferEverything(store as StoreStructure);
                if (outcome === OK) {
                    cart.travelTo(container, { offRoad: true });
                }
            } else {
                cart.transfer(store, RESOURCE_ENERGY);
            }
        } else {
            cart.travelTo(store);
        }
    }
}
