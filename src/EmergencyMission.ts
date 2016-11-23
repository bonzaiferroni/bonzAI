import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class EmergencyMinerMission extends Mission {

    emergencyMiners: Creep[];

    /**
     * Checks every 100 ticks if storage is full or a miner is present, if not spawns an emergency miner. Should come
     * first in FortOperation
     * @param operation
     * @param spawnRefillMission
     */
    constructor(operation: Operation) {
        super(operation, "emergencyMiner");
    }

    initMission() {
        if (this.memory.ticksWithoutBattery === undefined) this.memory.ticksWithoutBattery = 0;
    }

    roleCall() {
        if (Game.time % 100 === 1) {
            let energyAvailable = this.spawnGroup.currentSpawnEnergy >= 1300 ||
                (this.room.storage && this.room.storage.store.energy > 1300) || this.findMinersBySources();

            this.memory.emergencySituation = !energyAvailable;
        }
        if (Game.time % 10 === 0 && this.memory.emergencySituation) {
            console.log("ATTN: Emergency miner being spawned in", this.opName);
        }
        let body = () => this.workerBody(2, 1, 1);
        let maxEmergencyMiners = this.memory.emergencySituation ? 1 : 0;
        this.emergencyMiners = this.headCount("emergencyMiner", body, maxEmergencyMiners);
    }

    missionActions() {
        for (let miner of this.emergencyMiners) {
            this.minerActions(miner);
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }

    private minerActions(miner: Creep) {
        let closest = miner.pos.findClosestByRange(FIND_SOURCES) as Source;
        if (!miner.pos.isNearTo(closest)) {
            miner.blindMoveTo(closest);
            return;
        }

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        miner.harvest(closest);
    }

    private findMinersBySources() {
        for (let source of this.room.find<Source>(FIND_SOURCES)) {
            if (source.pos.findInRange(FIND_MY_CREEPS, 1).length > 0) {
                return true;
            }
        }
        return false;
    }
}