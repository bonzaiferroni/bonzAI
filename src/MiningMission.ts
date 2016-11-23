import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {TransportAnalysis} from "./interfaces";
import {TICK_TRANSPORT_ANALYSIS} from "./constants";

export class MiningMission extends Mission {

    miners: Creep[];
    minerCarts: Creep[];

    source: Source;
    container: StructureContainer;
    analysis: TransportAnalysis;
    needsEnergyTransport: boolean;
    positionsAvailable: number;
    storage: StructureStorage;

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

        if (!this.memory.potencyPerMiner) this.memory.potencyPerMiner = 2;

        // figure out what storage to use
        let destination = Game.flags[this.opName + "_sourceDestination"];
        if (destination) {
            let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0] as StructureStorage;
            if (structure) {
                this.storage = structure;
            }
        }

        if (!this.storage) {
            if ((this.opType === "fort" || this.opType === "conquest")) {
                if (this.room.storage && this.room.storage.my) {
                    this.storage = this.flag.room.storage;
                }
            }
            else {
                this.storage = this.getStorage(this.source.pos);
            }
        }

        if (!this.memory.positionsAvailable) { this.memory.positionsAvailable = this.source.pos.openAdjacentSpots(true).length; }
        this.positionsAvailable = this.memory.positionsAvailable;

        this.container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);

        this.needsEnergyTransport = this.storage !== undefined;
        if (this.needsEnergyTransport) {
            this.runTransportAnalysis();
        }
        else {

        }
    }

    roleCall() {
        // below a certain amount of maxSpawnEnergy, BootstrapMission will harvest energy
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
        if (this.needsEnergyTransport) {
            let carry;
            let work = Math.ceil((Math.max(this.source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME) / 2);
            if (this.container) {
                // extra work part to repair container and not fall behind
                work++;
                // no need for a lot of carry, just one for container repair
                carry = 1;
            }
            else {
                // tries to have the same amount of storage as a cart will have, if there is not enough spawn energy
                // to support that, it will just make the carry as big as it can make it while staying under the limit
                carry = Math.min(this.analysis.carryCount,
                    Math.floor((this.spawnGroup.maxSpawnEnergy - (work * 100 + Math.ceil(work / 2) * 50)) / 50));
            }
            if (this.opType === "keeper") work++;
            let move = Math.ceil(work / 2);
            if (this.waypoints) {
                move = work;
            }
            return this.workerBody(work, carry, move);
        }
        else {
            let body;
            if (this.spawnGroup.maxSpawnEnergy < 400) {
                body = this.workerBody(2, 1, 1);
            }
            else {
                body = this.bodyRatio(1, 1, 1, 1, 5);
            }
            this.memory.potencyPerMiner = _.filter(body, (part: string) => part === WORK).length;
            if (this.spawnGroup.maxSpawnEnergy >= 1300 && this.container) {
                body = body.concat([WORK, MOVE]);
            }
            return body;
        }
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
}