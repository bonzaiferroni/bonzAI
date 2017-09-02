import {Agent} from "../agents/Agent";
import {MiningMission, MiningMissionState} from "./MiningMission";

interface EarlyMiningAnalysis {
    workCount: number;
    carryCount: number;
    moveCount: number;
    minerCount: number;
}

interface EarlyMiningMissionState extends MiningMissionState {
    primaryAction: boolean;
}

export class EarlyMiningMission extends MiningMission {

    public state: EarlyMiningMissionState;

    protected minerBody = () => {
        let analysis = this.earlyMiningAnalysis();
        return this.workerBody(analysis.workCount, analysis.carryCount, analysis.moveCount);
    };

    protected maxMiners = (): number => {
        if (!this.room || this.room.hostiles.length > 0) {
            return 0;
        } else {
            let analysis = this.earlyMiningAnalysis();
            return analysis.minerCount;
        }
    };

    private positionCount() {
        return this.state.source.pos.openAdjacentSpots(true).length;
    }

    protected findEnergyPerTick() {
        if (this.spawnGroup.maxSpawnEnergy < 550) {
            return Math.floor(SOURCE_ENERGY_NEUTRAL_CAPACITY / 300);
        } else {
            return super.findEnergyPerTick();
        }
    }

    private earlyMiningAnalysis(): EarlyMiningAnalysis {
        if (!this.cache.earlyMiningAnalysis) {
            let maxWorkCount = this.findWorkCount();
            let positionCount = this.positionCount();
            let availableEnergy = this.spawnGroup.maxSpawnEnergy - 100;
            let workCount = Math.min(Math.floor(availableEnergy / 100), maxWorkCount);
            availableEnergy -= workCount * 100;
            let additionalMove = Math.min(Math.floor(availableEnergy / 50), Math.ceil(workCount / 2) - 1);
            let minerCount = Math.min(Math.ceil(6 / workCount), positionCount);
            this.cache.earlyMiningAnalysis = {
                workCount: workCount,
                carryCount: 1,
                moveCount: additionalMove + 1,
                minerCount: minerCount,
            } as EarlyMiningAnalysis;
        }
        return this.cache.earlyMiningAnalysis;
    }

    // CREEP BEHAVIOR
    protected minerActions(miner: Agent) {
        if (!this.state.primaryAction) {
            this.state.primaryAction = true;
            super.minerActions(miner);
            return;
        }

        if (!this.state.hasVision) {
            miner.travelTo(this.containerPos);
            return;
        }

        let source = this.state.source;
        let container = this.state.container;

        if (!miner.isNearTo(this.state.source)) {
            let position: RoomPosition;
            if (container) {
                position = _.min(this.state.source.pos.openAdjacentSpots(), x => x.getRangeTo(container));
            }

            if (!_.isObject(position)) {
                position = this.state.source.pos;
            }

            miner.travelTo(position);
            return;
        }

        if (container) {

            if (miner.sumCarry() >= miner.carryCapacity - 25) {
                miner.transferEverything(container);
                if (!miner.isNearTo(container)) {
                    miner.travelTo(container);
                }
            }

            // harvest
            if (source.energy > 0 && container.store.energy < container.storeCapacity - 25) {
                miner.harvest(source);
                return;
            }

            // repair
            if (container.hits < container.hitsMax * .9) {
                miner.repair(container);
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
}
