import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {Agent} from "../agents/Agent";
import {Notifier} from "../../notifier";
import {PathMission} from "./PathMission";
import {LinkMiningMission} from "./LinkMiningMission";
import {empire} from "../Empire";
import {Traveler} from "../Traveler";

interface MiningState extends MissionState {
    container: StructureContainer;
    source: Source;
    storage: StructureStorage;
}

interface MiningMemory extends MissionMemory {
    potencyPerMiner: number;
    positionsAvailable: number;
    transportAnalysis: TransportAnalysis;
    distanceToStorage: number;
    roadRepairIds: string[];
    prespawn: number;
    positionCount: number;
    spawnDistance: number;
}

export class MiningMission extends Mission {

    private miners: Agent[];
    private minerCarts: Agent[];
    private sourceId: string;
    private remoteSpawning: boolean;
    private _minersNeeded: number;
    private _analysis: TransportAnalysis;
    private pathMission: PathMission;
    private localStorage: boolean;
    private containerId: string;

    public state: MiningState;
    public memory: MiningMemory;

    /**
     * General-purpose energy mining, uses a nested TransportMission to transfer energy
     * @param operation
     * @param name
     * @param source
     * @param localStorage
     */

    constructor(operation: Operation, name: string, source: Source, localStorage = false) {
        super(operation, name);
        this.sourceId = source.id;
        this.localStorage = localStorage;
    }

    public static Add(operation: Operation, preferLinkMiner: boolean, localStorage = false) {
        if (!operation.state.hasVision) { return; }
        if (preferLinkMiner && operation.room.controller.level === 8 && operation.room.storage) {
            LinkMiningMission.Add(operation);
            return;
        }

        for (let i = 0; i < operation.state.sources.length; i++) {
            let source = operation.state.sources[i];
            operation.addMission(new MiningMission(operation, "miner" + i, source, localStorage));
        }
    }

    public init() {
        this.pathMission = new PathMission(this.operation, this.name + "Path");
        this.operation.addMissionLate(this.pathMission);

        if (this.operation.remoteSpawn) {
            let remoteGroup = this.operation.remoteSpawn.spawnGroup;
            if (this.spawnGroup.maxSpawnEnergy < 950 && remoteGroup && remoteGroup.maxSpawnEnergy >= 950) {
                this.remoteSpawning = true;
                this.spawnGroup = remoteGroup;
            }
        }

        if (!this.memory.spawnDistance || Math.random() < .1) {
            let source = Game.getObjectById<Source>(this.sourceId);
            if (source) {
                // TODO: make this work across a portal
                this.memory.spawnDistance = Traveler.findTravelPath(this.spawnGroup, source).path.length;
            }
        }
    }

    public update() {
        if (!this.state.hasVision) { return; }
        this.state.source = Game.getObjectById<Source>(this.sourceId);
        this.state.container = this.getContainer();
        this.state.storage = this.findMinerStorage();
        this.updatePathMission();
    }

    public getMaxMiners = () => this.minersNeeded;

    public getMinerBody = () => {
        if (this.remoteSpawning) { return this.workerBody(6, 1, 6); }
        let minersSupported = this.minersSupported();
        if (minersSupported === 1) {
            let work = Math.ceil((Math.max(this.state.source.energyCapacity,
                        SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER) + 1;
            let move = Math.ceil(work / 2);
            if (Game.map.getRoomLinearDistance(this.roomName, this.spawnGroup.room.name) > 2) {
                move = work;
            }
            return this.workerBody(work, 1, move);
        } else if (minersSupported === 2) {
            return this.workerBody(3, 1, 2);
        } else { return this.workerBody(2, 1, 1); }
    };

    public getMaxCarts = () => {
        if (!this.state.container) { return 0; }
        if (this.state.storage) {
            const FULL_STORAGE_THRESHOLD = STORAGE_CAPACITY - 50000;
            if (_.sum(this.state.storage.store) > FULL_STORAGE_THRESHOLD) {
                return 0;
            }
        } else if (this.localStorage) {
            return 0;
        }
        return this.analysis.cartsNeeded;
    };

    public getCartBody = () => {
        return this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);
    };

    public roleCall() {

        let prespawn = this.memory.spawnDistance;

        this.miners = this.headCount(this.name, this.getMinerBody, this.getMaxMiners,
            {prespawn: prespawn});

        let memory = { scavenger: RESOURCE_ENERGY };
        this.minerCarts = this.headCount(this.name + "cart", this.getCartBody, this.getMaxCarts,
            {prespawn: this.analysis.distance, memory: memory});
    }

    public actions() {

        let order = 0;
        for (let miner of this.miners) {
            this.minerActions(miner, order);
            order++;
        }

        for (let cart of this.minerCarts) {
            this.cartActions(cart);
        }
    }

    public finalize() { }
    public invalidateCache() {
        this.memory.transportAnalysis = undefined;
    }

    private minerActions(miner: Agent, order: number) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) {
            this.dropEnergy(miner);
            return;
        }

        if (!this.state.hasVision) {
            miner.travelTo(this.flag);
            return; // early
        }

        if (!this.state.container) {
            this.buildContainer(miner, this.state.source);
            miner.memory.donatesEnergy = true;
            return;
        }

        if (order === 0) {
            this.leadMinerActions(miner, this.state.source, this.state.container);
        } else {
            if (this.minersNeeded === 1) {
                this.replaceCurrentMiner(miner, this.state.container);
            } else {
                this.backupMinerActions(miner, this.state.source, this.state.container);
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
                    cart.travelTo(this.state.storage);
                    return;
                }
            }

            if (!this.state.container) {
                cart.idleOffRoad();
                return;
            }

            let range = cart.pos.getRangeTo(this.state.container);
            if (range > 3) {
                cart.travelTo(this.state.container, {offRoad: true});
                return;
            }

            if (this.state.container.store.energy < cart.creep.carryCapacity) {
                cart.idleNear(this.state.container, 3);
                return;
            }

            let outcome;
            if (cart.pos.isNearTo(this.state.container)) {
                for (let resourceType in this.state.container.store) {
                    let amount = this.state.container.store[resourceType];
                    if (amount === 0) { continue; }
                    outcome = cart.withdraw(this.state.container, resourceType);
                }
            } else {
                cart.travelTo(this.state.container);
            }

            if (outcome === OK) {
                cart.travelTo(this.state.storage);
            }
            return;
        }

        // drop off energy
        let destination: StoreStructure = this.state.storage;
        if (!destination) {
            destination = cart.findClosestContainer(this.spawnGroup.room, true);
            if (!destination) {
                cart.idleOffRoad();
                return;
            }
        }
        let outcome;
        if (cart.pos.isNearTo(destination)) {
            for (let resourceType in cart.carry) {
                let amount = cart.carry[resourceType];
                if (amount === 0) { continue; }
                outcome = cart.transfer(destination, resourceType);
            }
        } else {
            cart.travelTo(destination);
        }
        if (outcome === OK) {
            if (cart.creep.ticksToLive < this.analysis.distance * 2) {
                cart.creep.suicide();
            } else if (this.state.container && cart.capacityAvailable(this.state.container)) {
                cart.travelTo(this.state.container, {offRoad: true});
            }
        }
    }

    private dropEnergy(agent: Agent) {
        if (agent.creep.carry.energy > 0) {
            agent.drop(RESOURCE_ENERGY);
        }
    }

    private buildContainer(miner: Agent, source: Source) {
        if (miner.pos.isNearTo(source)) {
            if (miner.carry.energy < miner.carryCapacity) {
                miner.harvest(source);
            } else {
                let construction = source.pos.findInRange<ConstructionSite>(FIND_CONSTRUCTION_SITES, 1)[0];
                if (construction) {
                    miner.build(construction);
                }
            }
        } else {
            miner.travelTo(source);
        }
    }

    private leadMinerActions(miner: Agent, source: Source, container: StructureContainer) {
        if (miner.pos.inRangeTo(container, 0)) {
            if (container.hits < container.hitsMax * .90 && miner.carry.energy >= 20) {
                miner.repair(container);
            } else if (container.store.energy < container.storeCapacity) {
                miner.harvest(source);
            }
        } else {
            miner.travelTo(container, {range: 0});
        }
    }

    private replaceCurrentMiner(miner: Agent, container: StructureContainer) {
        if (miner.pos.isNearTo(container)) {
            miner.moveItOrLoseIt(container.pos, "miner");
        } else {
            miner.travelTo(container);
        }
    }

    private backupMinerActions(miner: Agent, source: Source, container: StructureContainer) {

        if (miner.carry.energy === miner.carryCapacity) {
            if (miner.pos.isNearTo(container)) {
                miner.transfer(container, RESOURCE_ENERGY);
            } else {
                miner.travelTo(container);
                return;
            }
        }

        if (!miner.pos.isNearTo(source)) {
            let position = _.filter(container.pos.openAdjacentSpots(), (p: RoomPosition) => p.isNearTo(source))[0];
            if (position) {
                miner.travelTo(position);
            } else {
                miner.travelTo(source);
            }
            return;
        }

        if (container.hits < container.hitsMax * .90 && miner.carry.energy >= 20) {
            miner.repair(container);
        } else {
            miner.harvest(source);
            let energy = _(miner.pos.lookFor<Resource>(LOOK_RESOURCES))
                .filter(x => x.resourceType === RESOURCE_ENERGY)
                .head();
            if (energy) {
                miner.pickup(energy);
            }
        }
    }

    private findMinerStorage(): StructureStorage {

        if (this.localStorage) {
            return this.room.storage;
        }

        if (this.room.storage && this.room.storage.my) {
            return this.flag.room.storage;
        } else {
            return this.getStorage(this.state.source.pos);
        }
    }

    private getContainer(): StructureContainer {
        if (!this.state.source) { return; }
        if (this.containerId) {
            let container = Game.getObjectById<StructureContainer>(this.containerId);
            if (container) {
                return container;
            } else {
                this.containerId = undefined;
                return this.getContainer();
            }
        } else {
            let containers = this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER);
            let container = this.state.source.pos.findInRange(containers, 1)[0];
            if (container) {
                this.containerId = container.id;
                return container;
            } else {
                this.placeContainer();
            }
        }
    }

    private placeContainer() {

        if (Object.keys(Game.constructionSites).length >= 90 ) { return; }

        let startingPosition: {pos: RoomPosition} = this.findMinerStorage();
        if (!startingPosition) {
            startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
        }
        if (!startingPosition) {
            startingPosition = this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES,
                {filter: ( (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN)})[0];
        }
        if (!startingPosition) {
            startingPosition = this.spawnGroup.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
        }

        if (!startingPosition) {
            console.log(`MINER: unable to place container in ${this.roomName}`);
            return;
        }

        if (this.state.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0) { return; }

        let ret = PathFinder.search(this.state.source.pos, [{pos: startingPosition.pos, range: 1}], {
            maxOps: 4000,
            swampCost: 2,
            plainCost: 2,
            roomCallback: (roomName: string): CostMatrix => {
                let room = Game.rooms[roomName];
                if (!room) { return; }

                let matrix = Traveler.getStructureMatrix(room);

                return matrix;
            },
        });
        if (ret.incomplete || ret.path.length === 0) {
            Notifier.log(`path used for container placement in ${this.operation.name} incomplete, please investigate`);
        }

        let position = ret.path[0];
        let testPositions = _.sortBy(this.state.source.pos.openAdjacentSpots(true),
            (p: RoomPosition) => p.getRangeTo(position));
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
            if (!storage) {
                return 50;
            }
            let path = PathFinder.search(storage.pos, {pos: this.state.source.pos, range: 1}).path;
            this.memory.distanceToStorage = path.length;
        }
        return this.memory.distanceToStorage;
    }

    get minersNeeded() {
        if (!this._minersNeeded) {
            if (!this.memory.positionCount) {
                this.memory.positionCount = this.state.source.pos.openAdjacentSpots(true).length;
            }

            this._minersNeeded = Math.min(this.minersSupported(), this.memory.positionCount);
        }
        return this._minersNeeded;
    }

    get analysis(): TransportAnalysis {
        if (!this._analysis) {
            this._analysis = this.cacheTransportAnalysis(this.findDistanceToStorage(),
                Mission.loadFromSource(this.state.source));
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

    private updatePathMission() {
        let container = this.state.container;
        if (!container) { return; }

        let startingPosition: {pos: RoomPosition} = this.state.storage;
        if (!startingPosition) {
            startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            if (!startingPosition) {
                startingPosition = this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES,
                    {filter: ( (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN)})[0];
                if (!startingPosition && Game.map.getRoomLinearDistance(this.roomName, this.spawnGroup.room.name) === 1) {
                    startingPosition = this.spawnGroup;
                }
            }
        }

        if (startingPosition) {
            if (Game.map.getRoomLinearDistance(startingPosition.pos.roomName, container.pos.roomName) > 2) {
                console.log(`path too long for miner in ${this.operation.name}`);
                return;
            }

            this.pathMission.updatePath(startingPosition.pos, container.pos, 0);
            let distance = this.pathMission.getdistance();
            if (distance) {
                this.memory.distanceToStorage = distance;
            }
        }
    }
}
