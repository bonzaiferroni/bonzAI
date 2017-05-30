import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
export class EmergencyMinerMission extends Mission {

    private emergencyMiners: Agent[];
    protected memory: EmergencyMinerMemory;

    /**
     * Checks every 100 ticks if storage is full or a miner is present, if not spawns an emergency miner. Should come
     * first in FortOperation
     * @param operation
     */

    constructor(operation: Operation) {
        super(operation, "emergencyMiner");
    }

    public init() {
    }

    public update() {
    }

    public roleCall() {
        let energyAvailable = this.spawnGroup.currentSpawnEnergy >= 1300 ||
            (this.room.storage && this.room.storage.store.energy > 1300) || this.findMinersBySources();
        if (energyAvailable) {
            this.memory.lastTick = Game.time;
        }

        let getMaxMiners = () => {
            if (!this.memory.lastTick || Game.time > this.memory.lastTick + 100) {
                if (Game.time % 10 === 0) {
                    console.log("ATTN: Backup miner being spawned in", this.operation.name);
                }
                return 2;
            }
        };

        this.emergencyMiners = this.headCount("emergencyMiner", () => this.workerBody(2, 1, 1), getMaxMiners);
    }

    public actions() {
        for (let miner of this.emergencyMiners) {
            this.minerActions(miner);
        }
    }

    public finalize() {
    }
    public invalidateCache() {
    }

    private minerActions(miner: Agent) {
        let closest = miner.pos.findClosestByRange(FIND_SOURCES) as Source;
        if (!miner.pos.isNearTo(closest)) {
            miner.travelTo(closest);
            return;
        }

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        if (miner.carry.energy < miner.carryCapacity) {
            miner.harvest(closest);
        } else {
            let site = miner.pos.findInRange<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES, 3)[0];
            if (site) {
                miner.build(site);
            } else {
                miner.harvest(closest);
            }
        }
    }

    private findMinersBySources() {
        for (let source of this.room.find<Source>(FIND_SOURCES)) {
            if (source.pos.findInRange(FIND_MY_CREEPS, 1, (c: Creep) => c.partCount(WORK) > 0).length > 0) {
                return true;
            }
        }
        return false;
    }
}

interface EmergencyMinerMemory extends MissionMemory {
    lastTick: number;
}
