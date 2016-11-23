import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class LinkMiningMission extends Mission {

    linkMiners: Creep[];
    source: Source;
    link: StructureLink;

    /**
     * Sends a miner to a source with a link, energy transfer is managed by LinkNetworkMission
     * @param operation
     * @param name
     * @param source
     * @param link
     */

    constructor(operation: Operation, name: string, source: Source, link: StructureLink) {
        super(operation, name);
        this.source = source;
        this.link = link;
    }

    initMission() {
    }

    roleCall() {
        this.linkMiners = this.headCount(this.name, () => this.workerBody(5, 4, 3), 1);
    }

    missionActions() {
        for (let miner of this.linkMiners) {
            this.minerActions(miner);
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
    }

    private minerActions(miner: Creep) {
        if (!miner.memory.inPosition) {
            this.moveToPosition(miner);
            return; // early
        }

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        miner.harvest(this.source);
        if (miner.carry.energy === miner.carryCapacity) {
            miner.transfer(this.link, RESOURCE_ENERGY);
        }
    }

    /**
     * Picks a position between the source and the link and moves there, robbing and killing any miner at that position
     * @param miner
     */
    private moveToPosition(miner: Creep) {
        for (let i = 1; i <= 8; i++) {
            let position = this.source.pos.getPositionAtDirection(i);
            if (!position.isPassible(true)) continue;
            if (!position.isNearTo(this.link)) continue;
            if (position.lookForStructure(STRUCTURE_ROAD)) continue;

            if (miner.pos.inRangeTo(position, 0)) {
                miner.memory.inPosition = true;
            }
            else {
                miner.moveItOrLoseIt(position, "miner");
            }
            return; // early
        }
        console.log("couldn't find valid position for", miner.name, "in ", miner.room.name);
    }
}