import {Mission} from "./Mission";
import {RefillMission} from "./RefillMission";
import {Operation} from "./Operation";
export class BootstrapMission extends Mission {

    miners: Creep[] = [];

    source: Source;
    sourceIndex: number;

    /**
     * Deprecated - Was intended to cover harvesting roles for FortOperation before it could spawn a full
     * miner, now that is implemented in MiningMission using MiningMode.Scaled
     * @param operation
     * @param name
     * @param source
     * @param sourceIndex
     */
    constructor(operation: Operation, name: string, source: Source, sourceIndex: number) {
        super(operation, name);
        this.source = source;
        this.sourceIndex = sourceIndex;
    }

    initMission() {
    }

    roleCall() {
        // figure out how many miners to spawn, only spawn more if emergency mode (no energy carts found last tick)
        // or if spawnGroup.maxSpawnEnergy < 1300, above which MiningMission kicks in

        let bootMinerBody = () => {
            let body = this.bodyRatio(1, .5, .5, 1);
            if (!this.memory.minerCount && !this.spawnGroup.canCreateCreep(body)) {
                // if no other miners are active and there is no possibility to spawn best miner, spawn smallest possible miner
                return this.workerBody(1, 2, 1);
            }
            else {
                return body;
            }
        };

        let maxMiners = 0;
        let lowEnergy = this.room.storage && this.room.storage.store.energy === 0;
        if (lowEnergy || this.spawnGroup.maxSpawnEnergy < 1300) {
            maxMiners = this.source.pos.openAdjacentSpots(true).length;
        }

        this.miners = this.headCount(this.name, bootMinerBody, maxMiners);
        this.memory.minerCount = this.miners.length;
    }

    missionActions() {
        for (let miner of this.miners) {
            if (this.hasVision) {
                if (miner.pos.isNearTo(this.source)) {
                    miner.memory.donatesEnergy = true;
                    if (miner.carry.energy < miner.carryCapacity) {
                        miner.harvest(this.source);
                    }
                }
                else {
                    miner.memory.donatesEnergy = false;
                    miner.blindMoveTo(this.source);
                }
            }
            else {
                miner.blindMoveTo(this.flag);
            }
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }
}