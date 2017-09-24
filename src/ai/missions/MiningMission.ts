import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {Agent} from "./Agent";
import {notifier} from "../../notifier";
import {empire} from "../../helpers/loopHelper";
import {Profiler} from "../../Profiler";

export class MiningMission extends Mission {

    public memory: {
        potencyPerMiner: number;
        positionsAvailable: number;
        transportAnalysis: TransportAnalysis;
        distanceToStorage: number;
        roadRepairIds: string[];
        prespawn: number;
        positionCount: number;
    };

    private miners: Agent[];
    private minerCarts: Agent[];
    private paver: Agent;
    private source: Source;
    private container: StructureContainer;
    private storage: StructureStorage;
    private remoteSpawning: boolean;
    private _minersNeeded: number;
    private _analysis: TransportAnalysis;

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
    public initMission() {
        if (!this.hasVision) { return; }
        this.container = this.findContainer();
        this.storage = this.findMinerStorage();
    }

    public getMaxMiners = () => this.minersNeeded;

    public getMinerBody = () => {
        if (this.remoteSpawning) { return this.workerBody(6, 1, 6); }
        let minersSupported = this.minersSupported();
        if (minersSupported === 1) {
            let work = Math.ceil((Math.max(this.source.energyCapacity,
                        SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER) + 1;
            return this.workerBody(work, 1, Math.ceil(work / 2));
        } else if (minersSupported === 2) {
            return this.workerBody(3, 1, 2);
        } else { return this.workerBody(2, 1, 1); }
    };

    public getMaxCarts = () => {
        if (!this.storage || this.storage.room.controller.level < 4) { return 0; }
        const FULL_STORAGE_THRESHOLD = STORAGE_CAPACITY - 50000;
        if (_.sum(this.storage.store) > FULL_STORAGE_THRESHOLD) { return 0; }
        if (!this.container) { return 0; }
        return this.analysis.cartsNeeded;
    };

    public getCartBody = () => {
        return this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);
    };

    public roleCall() {

        let prespawn = 0;
        if (this.storage) {
            prespawn = Game.map.getRoomLinearDistance(this.source.pos.roomName, this.storage.pos.roomName) * 50 + 50;
        }

        this.miners = this.headCount(this.name, this.getMinerBody, this.getMaxMiners,
            {prespawn: prespawn});

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }

        let memory = { scavanger: RESOURCE_ENERGY };
        this.minerCarts = this.headCount(this.name + "cart", this.getCartBody, this.getMaxCarts,
            {prespawn: this.analysis.distance, memory: memory});
    }

    public missionActions() {

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
                if (Game.map.getRoomLinearDistance(startingPosition.pos.roomName, this.container.pos.roomName) > 2) {
                    console.log(`path too long for miner in ${this.operation.name}`);
                    return;
                }
                let distance = this.pavePath(startingPosition, this.container, 2);
                if (distance) {
                    this.memory.distanceToStorage = distance;
                }
            }
        }
    }

    public finalizeMission() { }
    public invalidateMissionCache() {
        this.memory.transportAnalysis = undefined;
    }

    private minerActions(miner: Agent, order: number) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) {
            this.dropEnergy(miner);
            return;
        }

        if (!this.hasVision) {
            miner.travelTo(this.flag);
            return; // early
        }

        if (!this.container) {
            let reserveEnergy = order === 0 && this.minersNeeded > 1;
            this.buildContainer(miner, this.source, reserveEnergy);
            return;
        }

        if (order === 0) {
            this.leadMinerActions(miner, this.source, this.container);
            if (!miner.memory.registered && miner.pos.isNearTo(this.source)) {
                this.registerPrespawn(miner);
            }
        } else {
            if (this.minersNeeded === 1) {
                this.replaceCurrentMiner(miner, this.container)
            } else {
                this.backupMinerActions(miner, this.source, this.container);
            }
        }
    }

    private cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; } // early

        // emergency cpu savings
        if (Game.cpu.bucket < 1000) { return; }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            // heal chipped carts
            if (cart.hits < cart.hitsMax) {
                let healersInRoom = _.filter(cart.room.find<Creep>(FIND_MY_CREEPS), c => c.getActiveBodyparts(HEAL));
                if (healersInRoom.length > 0) {
                    cart.idleOffRoad();
                    return;
                }
                if (cart.room.hostiles.length === 0 && !cart.pos.isNearExit(0)) {
                    let tower = cart.pos.findClosestByRange(cart.room.findStructures<StructureTower>(STRUCTURE_TOWER));
                    if (tower) {
                        tower.heal(cart.creep);
                        return;
                    }
                }
                if (cart.carryCapacity === 0) {
                    cart.travelTo(this.storage);
                    return;
                }
            }

            if (!this.container) {
                cart.idleOffRoad();
                return;
            }

            let range = cart.pos.getRangeTo(this.container);
            if (range > 3) {
                cart.travelTo(this.container, {offRoad: true});
                return;
            }

            if (this.container.store.energy < cart.creep.carryCapacity) {
                cart.idleNear(this.container, 3);
                return;
            }

            let outcome = cart.retrieve(this.container, RESOURCE_ENERGY);
            if (outcome === OK && cart.carryCapacity > 0) {
                cart.travelTo(this.storage);
            }
            return;
        }

        let outcome = cart.deliver(this.storage, RESOURCE_ENERGY);
        if (outcome === OK) {
            if (cart.creep.ticksToLive < this.analysis.distance * 2) {
                cart.creep.suicide();
            } else if (cart.capacityAvailable(this.container)) {
                cart.travelTo(this.container, {offRoad: true});
            }
        }
    }

    dropEnergy(agent: Agent) {
        if (agent.creep.carry.energy > 0) {
            agent.drop(RESOURCE_ENERGY);
        }
    }

    buildContainer(miner: Agent, source: Source, reserveEnergy: boolean) {
        if (miner.pos.isNearTo(source)) {
            if (miner.carry.energy < miner.carryCapacity || reserveEnergy) {
                miner.harvest(source);
            }
            else {
                let construction = source.pos.findInRange<ConstructionSite>(FIND_CONSTRUCTION_SITES, 1)[0];
                if (construction) {
                    miner.build(construction);
                }
            }
        }
        else {
            miner.travelTo(source);
        }
    }

    leadMinerActions(miner: Agent, source: Source, container: StructureContainer) {
        if (miner.pos.inRangeTo(container, 0)) {
            if (container.hits < container.hitsMax * .90 && miner.carry.energy >= 20) {
                miner.repair(container);
            }
            else if (container.store.energy < container.storeCapacity) {
                miner.harvest(source);
            }
        }
        else {
            miner.travelTo(container, {range: 0});
        }
    }

    replaceCurrentMiner(miner: Agent, container: StructureContainer) {
        if (miner.pos.isNearTo(container)) {
            miner.moveItOrLoseIt(container.pos, "miner");
        }
        else {
            miner.travelTo(container);
        }
    }

    backupMinerActions(miner: Agent, source: Source, container: StructureContainer) {
        if (!miner.pos.isNearTo(source) || !miner.pos.isNearTo(container)) {
            let position = _.filter(container.pos.openAdjacentSpots(), (p: RoomPosition) => p.isNearTo(source))[0];
            if (position) {
                miner.travelTo(position);
            }
            else {
                miner.idleNear(container, 3);
            }
            return;
        }

        if (container.hits < container.hitsMax * .90 && miner.carry.energy >= 20) {
            miner.repair(container);
        }
        else {
            miner.harvest(source);
        }

        if (miner.carry.energy >= 40) {
            miner.transfer(container, RESOURCE_ENERGY);
        }
    }

    findMinerStorage(): StructureStorage {
        let destination = Game.flags[this.operation.name + "_sourceDestination"];
        if (destination) {
            let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0] as StructureStorage;
            if (structure) {
                return structure;
            }
        }

        if (this.operation.type === "mining" || this.operation.type === "keeper") {
            return this.getStorage(this.source.pos);
        }
        else {
            if (this.room.storage && this.room.storage.my) {
                return this.flag.room.storage;
            }
        }
    }

    findContainer(): StructureContainer {
        let container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
        if (!container) {
            this.placeContainer();
        }
        return container;
    }

    private placeContainer() {

        if (this.room.controller.reservation &&
            /* reserved and not mine */
            this.room.controller.reservation.username != Game.structures[_.first(Object.keys(Game.structures))].owner.username) {
            // console.log(`MINER: Unable to place container in ${this.operation.name}, hostile reserved room`);
            return;
        }

        let startingPosition: {pos: RoomPosition} = this.findMinerStorage();
        if (!startingPosition) {
            startingPosition = this.room.find(FIND_MY_SPAWNS)[0] as StructureSpawn;
        }
        if (!startingPosition) {
            startingPosition = this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES,
                {filter: ( (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN)})[0];
        }
        if (!startingPosition) return;

        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0) return;

        let ret = PathFinder.search(this.source.pos, [{pos: startingPosition.pos, range: 1}], {
            maxOps: 4000,
            swampCost: 2,
            plainCost: 2,
            roomCallback: (roomName: string): CostMatrix => {
                let room = Game.rooms[roomName];
                if (!room) return;

                let matrix = empire.traveler.getStructureMatrix(room);

                return matrix;
            }
        });
        if (ret.incomplete || ret.path.length === 0) {
            notifier.log(`path used for container placement in ${this.operation.name} incomplete, please investigate`);
        }

        let position = ret.path[0];
        let testPositions = _.sortBy(this.source.pos.openAdjacentSpots(true), (p: RoomPosition) => p.getRangeTo(position));
        for (let testPosition of testPositions) {
            let sourcesInRange = testPosition.findInRange(FIND_SOURCES, 1);
            if (sourcesInRange.length > 1) { continue; }
            console.log(`MINER: placed container in ${this.operation.name}`);
            testPosition.createConstructionSite(STRUCTURE_CONTAINER);
            return;
        }

        console.log(`MINER: Unable to place container in ${this.operation.name}`);
    }

    private findDistanceToStorage() {
        if (!this.memory.distanceToStorage) {
            let storage = this.findMinerStorage();
            if (!storage) return;
            let path = PathFinder.search(storage.pos, {pos: this.source.pos, range: 1}).path;
            this.memory.distanceToStorage = path.length;
        }
        return this.memory.distanceToStorage;
    }

    get minersNeeded() {
        if (!this._minersNeeded) {
            if (!this.memory.positionCount) { this.memory.positionCount = this.source.pos.openAdjacentSpots(true).length; }

            this._minersNeeded = Math.min(this.minersSupported(), this.memory.positionCount);
        }
        return this._minersNeeded;
    }

    get analysis(): TransportAnalysis {
        if (!this._analysis) {
            this._analysis = this.cacheTransportAnalysis(this.findDistanceToStorage(), Mission.loadFromSource(this.source));
        }
        return this._analysis;
    }

    private minersSupported(): number {
        if (this.spawnGroup.maxSpawnEnergy >= 1050 || this.remoteSpawning) {
            return 1;
        } else if (this.spawnGroup.maxSpawnEnergy >= 450) {
            return 2;
        } else {
            return 3;
        }
    }
}