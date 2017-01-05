import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {TransportAnalysis} from "../../interfaces";
import {ROOMTYPE_SOURCEKEEPER} from "../../config/constants";
import {notifier} from "../../notifier";

export class MiningMission extends Mission {

    miners: Creep[];
    minerCarts: Creep[];
    paver: Creep;

    source: Source;
    container: StructureContainer;
    analysis: TransportAnalysis;
    positionsAvailable: number;
    storage: {
        pos: RoomPosition
        store: StoreDefinition
        room: Room;
    };
    minersNeeded: number;
    remoteSpawning: boolean;

    memory: {
        potencyPerMiner: number;
        positionsAvailable: number;
        transportAnalysis: TransportAnalysis;
        distanceToStorage: number;
        roadRepairIds: string[];
        prespawn: number;
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

        this.storage = this.findMinerStorage();

        if (!this.memory.positionsAvailable) { this.memory.positionsAvailable = this.source.pos.openAdjacentSpots(true).length; }
        this.positionsAvailable = this.memory.positionsAvailable;

        this.container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
        if (!this.container) {
            this.placeContainer();
        }

        this.minersNeeded = 1;
        if (this.spawnGroup.maxSpawnEnergy < 1050 && !this.remoteSpawning) {
            this.minersNeeded = 2;
            if (this.spawnGroup.maxSpawnEnergy < 450) {
                this.minersNeeded = 3;
            }
        }
    }

    roleCall() {
        // below a certain amount of maxSpawnEnergy, BootstrapMission will harvest energy
        let maxMiners = Math.min(this.minersNeeded, this.positionsAvailable);

        let getMinerBody = () => {
            return this.getMinerBody();
        };

        this.miners = this.headCount(this.name, getMinerBody, maxMiners, {prespawn: this.memory.prespawn});

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }

        if (!this.storage) return;
        this.analysis = this.miningTransportAnalysis();
        let maxCarts = _.sum(this.storage.store) < 950000 ? this.analysis.cartsNeeded : 0;
        if (!this.container) {
            maxCarts = 0;
        }
        let memory = { scavanger: RESOURCE_ENERGY };
        this.minerCarts = this.headCount(this.name + "cart",
            () => this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount),
            maxCarts, {prespawn: this.analysis.distance, memory: memory});
    }

    missionActions() {

        let order = 0;
        for (let miner of this.miners) {
            this.minerActions(miner, order);
            order++;
        }

        if (this.minerCarts) {
            for (let cart of this.minerCarts) {
                this.cartActions(cart);
            }
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

    private minerActions(miner: Creep, order: number) {

        let fleeing = miner.fleeHostiles();
        if (fleeing) {
            if (miner.carry.energy > 0) {
                miner.drop(RESOURCE_ENERGY);
            }
            return;
        }

        if (!this.hasVision) {
            miner.blindMoveTo(this.flag);
            return; // early
        }

        if (!this.container) {
            this.buildContainer(miner, order);
            return;
        }

        if (order === 0) {
            this.leadMinerActions(miner);
        }
        else {
            this.backupMinerActions(miner);
        }
    }

    private leadMinerActions(miner: Creep) {
        if (miner.pos.inRangeTo(this.container, 0)) {

            if (!miner.memory.setDistance) {
                miner.memory.setDistance = true;
                this.setPrespawn(miner)
            }

            if (this.container.hits < this.container.hitsMax * .90 && miner.carry.energy >= 20) {
                miner.repair(this.container);
            }
            else if (this.container.store.energy < this.container.storeCapacity) {
                miner.harvest(this.source);
            }
        }
        else {
            if (this.minersNeeded === 1) {
                miner.moveItOrLoseIt(this.container.pos);
            }
            else {
                miner.blindMoveTo(this.container);
            }
        }
    }

    private backupMinerActions(miner: Creep) {
        if (!miner.pos.isNearTo(this.source) || !miner.pos.isNearTo(this.container)) {
            let position = _.filter(this.container.pos.openAdjacentSpots(), (p: RoomPosition) => p.isNearTo(this.source))[0];
            if (position) {
                miner.blindMoveTo(position);
            }
            else {
                this.idleNear(miner, this.source, 3);
            }
            return;
        }

        if (this.container.hits < this.container.hitsMax * .90 && miner.carry.energy >= 20) {
            miner.repair(this.container);
        }
        else {
            miner.harvest(this.source);
        }

        if (miner.carry.energy >= 40) {
            miner.transfer(this.container, RESOURCE_ENERGY);
        }
    }

    private getMinerBody(): string[] {
        if (this.remoteSpawning) {
            return this.workerBody(6, 1, 6);
        }

        if (this.minersNeeded === 1) {
            let work = Math.ceil((Math.max(this.source.energyCapacity,
                    SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER) + 1
            return this.workerBody(work, 1, Math.ceil(work / 2));
        }
        else if (this.minersNeeded === 2) {
            return this.workerBody(3, 1, 2);
        }
        else {
            return this.workerBody(2, 1, 1);
        }
    }

    private miningTransportAnalysis(): TransportAnalysis {
        if (!this.memory.distanceToStorage) {
            let path = PathFinder.search(this.storage.pos, {pos: this.source.pos, range: 1}).path;
            this.memory.distanceToStorage = path.length;
        }
        let distance = this.memory.distanceToStorage;
        let load = Mission.loadFromSource(this.source);
        return this.cacheTransportAnalysis(distance, load);
    }

    private cartActions(cart: Creep) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) return; // early

        // emergency cpu savings
        if (Game.cpu.bucket < 1000) return;

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            let supply = this.container ? this.container : this.miners[0];

            if (!supply) {
                if (!cart.pos.isNearTo(this.flag)) {
                    cart.idleOffRoad(this.flag);
                }
                return; // early
            }

            let rangeToSupply = cart.pos.getRangeTo(supply);
            if (rangeToSupply > 3) {
                cart.blindMoveTo(supply);
                return;
            }

            if (supply.store.energy === 0) {
                cart.idleOffRoad(this.flag);
                return;
            }

            if (rangeToSupply > 1) {
                cart.blindMoveTo(supply);
                return;
            }

            let outcome = cart.withdrawIfFull(supply, RESOURCE_ENERGY);
            if (outcome === OK && supply.store.energy >= cart.storeCapacity) {
                cart.blindMoveTo(this.storage);
            }
            return; // early
        }

        if (!this.storage) {
            if (!cart.pos.isNearTo(this.flag)) {
                cart.blindMoveTo((this.flag));
            }
            return;
        }

        if (cart.pos.isNearTo(this.storage)) {
            let outcome = cart.transfer(this.storage, RESOURCE_ENERGY);
            if (outcome === OK && cart.ticksToLive < this.analysis.distance * 2) {
                cart.suicide();
            }
            else if (outcome === OK) {
                cart.blindMoveTo(this.miners[0]);
            }

        }
        else {
            cart.blindMoveTo(this.storage);
        }
    }

    private findMinerStorage(): {store: StoreDefinition, pos: RoomPosition, room: Room} {
        let destination = Game.flags[this.opName + "_sourceDestination"];
        if (destination) {
            let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0] as StructureStorage;
            if (structure) {
                return structure;
            }
        }

        if (this.opType === "mining" || this.opType === "keeper") {
            return this.getStorage(this.source.pos);
        }
        else {
            if (this.room.storage && this.room.storage.my) {
                return this.flag.room.storage;
            }
        }
    }

    private placeContainer() {

        let startingPosition: {pos: RoomPosition} = this.storage;
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

                let matrix = new PathFinder.CostMatrix();
                helper.addStructuresToMatrix(matrix, room);

                return matrix;
            }
        });
        if (ret.incomplete || ret.path.length === 0) {
            notifier.add(`path used for container placement in ${this.opName} incomplete, please investigate`);
        }

        let position = ret.path[0];
        let testPositions = _.sortBy(this.source.pos.openAdjacentSpots(true), (p: RoomPosition) => p.getRangeTo(position));
        for (let testPosition of testPositions) {
            let sourcesInRange = testPosition.findInRange(FIND_SOURCES, 1);
            if (sourcesInRange.length > 1) { continue; }
            console.log(`MINER: placed container in ${this.opName}`);
            testPosition.createConstructionSite(STRUCTURE_CONTAINER);
            return;
        }

        console.log(`MINER: Unable to place container in ${this.opName}`);
    }

    private buildContainer(miner: Creep, order: number) {
        if (miner.pos.isNearTo(this.source)) {
            if (miner.carry.energy < miner.carryCapacity || (this.minersNeeded > 1 && order === 1)) {
                miner.harvest(this.source);
            }
            else {
                let construction = this.source.pos.findInRange<ConstructionSite>(FIND_CONSTRUCTION_SITES, 1)[0];
                if (construction) {
                    miner.build(construction);
                }
            }
        }
        else {
            miner.blindMoveTo(this.source);
        }
    }
}