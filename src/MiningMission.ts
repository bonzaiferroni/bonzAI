import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {TransportAnalysis} from "./interfaces";
import {TICK_TRANSPORT_ANALYSIS} from "./constants";
import {helper} from "./helper";
import {profiler} from "./profiler";

export class MiningMission extends Mission {

    miners: Creep[];
    minerCarts: Creep[];

    source: Source;
    container: StructureContainer;
    analysis: TransportAnalysis;
    needsEnergyTransport: boolean;
    positionsAvailable: number;
    storage: {
        pos: RoomPosition
        store: StoreDefinition
        room: Room;
    };

    memory: {
        potencyPerMiner: number;
        positionsAvailable: number;
        transportAnalysis: TransportAnalysis;
        distanceToStorage: number;
    };

    /**
     * General-purpose energy mining, uses a nested TransportMission to transfer energy
     * @param operation
     * @param name
     * @param source
     */

    constructor(operation: Operation, name: string, source: Source) {
        super(operation, name);
        this.source = source;
    }

    // return-early
    initMission() {
        if (!this.hasVision) return;

        this.distanceToSpawn = this.findDistanceToSpawn(this.source.pos);
        this.storage = this.findMinerStorage();

        if (!this.memory.positionsAvailable) { this.memory.positionsAvailable = this.source.pos.openAdjacentSpots(true).length; }
        this.positionsAvailable = this.memory.positionsAvailable;

        this.container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
        if (!this.container) {
            this.placeContainer()
        }

        this.needsEnergyTransport = this.storage !== undefined;
        if (this.needsEnergyTransport) {
            this.runTransportAnalysis();
        }
        else {

        }
    }

    roleCall() {
        // below a certain amount of maxSpawnEnergy, BootstrapMission will harvest energy
        if (!this.memory.potencyPerMiner) this.memory.potencyPerMiner = 2;
        let maxMiners = this.needsEnergyTransport ? 1 : Math.min(Math.ceil(5 / this.memory.potencyPerMiner), this.positionsAvailable);
        if (maxMiners > 1) {
            this.container = undefined;
        }

        let getMinerBody = () => {
            return this.getMinerBody();
        };

        this.miners = this.headCount(this.name, getMinerBody, maxMiners, {prespawn: this.distanceToSpawn});

        if (!this.needsEnergyTransport) return;

        let maxCarts = _.sum(this.storage.store) < 950000 ? this.analysis.cartsNeeded : 0;
        let memory = { scavanger: RESOURCE_ENERGY };
        this.minerCarts = this.headCount(this.name + "cart", () => this.analysis.body, maxCarts,
            {prespawn: this.analysis.distance, memory: memory});
    }

    missionActions() {

        for (let miner of this.miners) {
            this.minerActions(miner);
        }

        if (this.minerCarts) {
            for (let cart of this.minerCarts) {
                this.cartActions(cart);
            }
        }

        if (this.storage && this.container && this.storage.room.controller.level >= 4) {
            this.pavePath(this.storage, this.container, 2);
        }
    }

    private minerActions(miner: Creep) {

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

        if (this.container && !miner.pos.inRangeTo(this.container, 0)) {
            miner.moveItOrLoseIt(this.container.pos, "miner");
            return; // early
        }
        else if (!miner.pos.isNearTo(this.source)) {
            miner.blindMoveTo(this.source);
            return; // early
        }

        if (!this.container && miner.carry.energy >= miner.carryCapacity) {
            let container = this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)[0] as ConstructionSite;
            if (container) {
                miner.build(container);
                return;
            }
        }

        let myStore = this.container ? this.container : miner;

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        if (this.container && this.container.hits < this.container.hitsMax * .9 && miner.carry.energy > 0) {
            // container maintainer
            miner.repair(this.container);
        }
        else if (!this.needsEnergyTransport || myStore.store.energy < myStore.storeCapacity) {
            // will stop mining if this is a full miner with full energy
            miner.harvest(this.source);
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
        this.memory.transportAnalysis = undefined;
    }

    private getMinerBody(): string[] {
        let body;
        if (this.needsEnergyTransport && this.spawnGroup.maxSpawnEnergy >= 800) {

            let work = Math.ceil((Math.max(this.source.energyCapacity,
                    SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / HARVEST_POWER);
            if (this.opType === "keeper") { work++; }
            if (this.container) { work++; }

            let move = Math.ceil(work / 2);
            if (this.waypoints) { move = work; } // waypoints often mean offroad travel

            let carry;
            if (this.container) { carry = 1; }
            else {
                let workCost = work * BODYPART_COST[WORK];
                let moveCost = move * BODYPART_COST[MOVE];
                let remainingSpawnEnergy = this.spawnGroup.maxSpawnEnergy - (workCost + moveCost);
                carry = Math.min(this.analysis.carryCount, Math.floor(remainingSpawnEnergy / BODYPART_COST[CARRY]));
            }

            body = this.workerBody(work, carry, move);
        }

        // doesn't have a structure to delivery energy to
        else {
            if (this.spawnGroup.maxSpawnEnergy < 400) {
                body = this.workerBody(2, 1, 1);
            }
            else {
                body = this.bodyRatio(1, 1, .5, 1, 5);
            }
            if (this.spawnGroup.maxSpawnEnergy >= 1300 && this.container) {
                body = body.concat([WORK, MOVE]);
            }

        }
        this.memory.potencyPerMiner = _.filter(body, (part: string) => part === WORK).length;
        return body;
    }

    private runTransportAnalysis() {
        if (!this.memory.distanceToStorage || Game.time % 10000 === TICK_TRANSPORT_ANALYSIS) {
            let path = PathFinder.search(this.storage.pos, {pos: this.source.pos, range: 1}).path;
            this.memory.distanceToStorage = path.length;
        }
        let distance = this.memory.distanceToStorage;
        let load = Math.max(this.source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME;
        this.analysis = this.analyzeTransport(distance, load);
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
                    cart.blindMoveTo(this.flag);
                }
                return; // early
            }

            if (cart.pos.isNearTo(supply)) {
                let outcome = cart.withdrawIfFull(supply, RESOURCE_ENERGY);
                if (outcome === OK && supply.store.energy >= cart.storeCapacity) {
                    cart.blindMoveTo(this.storage);
                }
            }
            else {
                cart.blindMoveTo(supply);
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
        if (!this.storage) return;

        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0) return;

        let ret = PathFinder.search(this.source.pos, [{pos: this.storage.pos, range: 1}], {
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
            console.log(`path used for container placement in ${this.opName} incomplete, please investigate`);
            console.log(`${this.storage.pos}`)
        }

        let position = ret.path[0];
        console.log(`MINER: placed container in ${this.opName}`);
        position.createConstructionSite(STRUCTURE_CONTAINER);
    }
}