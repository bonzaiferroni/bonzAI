import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {notifier} from "../../notifier";
import {empire} from "../Empire";
export class LinkMiningMission extends Mission {

    private linkMiners: Agent[];
    private source: Source;
    private link: StructureLink;

    /**
     * Sends a miner to a source with a link, energy transfer is managed by LinkNetworkMission
     * @param operation
     * @param name
     * @param source
     * @param link
     */

    constructor(operation: Operation, name: string, source: Source) {
        super(operation, name);
        this.source = source;
    }

    /**
     * Assumes room has vision, storage and is rcl8
     * @param operation
     * @constructor
     */
    public static Add(operation: Operation) {
        for (let i = 0; i < operation.sources.length; i++) {
            // disable harvesting sources manually by putting a flag over it
            if (operation.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) { continue; }
            let source = operation.sources[i];
            operation.addMission(new LinkMiningMission(operation, "miner" + i, source));
        }
    }

    public initMission() {
        this.link = this.findLink();
        if (!this.link) {
            this.placeLink();
        }
    }

    public roleCall() {
        this.linkMiners = this.headCount(this.name, () => this.workerBody(5, 4, 5), () => 1);
    }

    public missionActions() {
        for (let miner of this.linkMiners) {
            this.minerActions(miner);
        }
    }

    public finalizeMission() {
    }
    public invalidateMissionCache() {
    }

    private minerActions(miner: Agent) {
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
    private moveToPosition(miner: Agent) {
        let roadPos: RoomPosition;

        for (let i = 1; i <= 8; i++) {
            let position = this.source.pos.getPositionAtDirection(i);
            if (!position.isPassible(true)) { continue; }
            if (!position.isNearTo(this.link)) { continue; }
            if (position.lookForStructure(STRUCTURE_ROAD)) {
                roadPos = position;
            }

            if (miner.pos.inRangeTo(position, 0)) {
                miner.memory.inPosition = true;
            } else {
                miner.moveItOrLoseIt(position, "miner");
            }
            return; // early
        }
        if (!miner.memory.posNotify) {
            miner.memory.posNotify = true;
            console.log("couldn't find valid position for", miner.name, "in ", miner.room.name);
        }

        if (miner.pos.inRangeTo(roadPos, 0)) {
            miner.memory.inPosition = true;
        } else {
            miner.moveItOrLoseIt(roadPos, "miner");
        }
    }

    public placeLink() {
        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2).length > 0) { return; }
        if (this.source.pos.findInRange(this.source.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length > 0) { 
            return; 
        }

        let positions: RoomPosition[] = [];
        let ret = empire.traveler.findTravelPath(this.room.storage, this.source);
        if (ret.incomplete) { console.log(`LINKMINER: Path to source incomplete ${this.room.name}`); }
        let minerPos = _.last(ret.path);
        for (let position of minerPos.openAdjacentSpots(true)) {
            if (!position.isPassible(true)) { continue; }
            if (position.findInRange([this.room.controller], 3).length > 0) { continue; }
            if (position.findInRange(FIND_SOURCES, 2).length > 1) { continue; }
            if (position.findInRange(ret.path, 0).length > 0) {continue; }
            positions.push(position);
        }
        if (positions.length === 0) {
            console.log(`LINKMINER: no suitable position for link ${this.room.name}`);
        }

        positions = _.sortBy(positions, (p: RoomPosition) => p.getRangeTo(this.room.storage));
        positions[0].createConstructionSite(STRUCTURE_LINK);
        notifier.log(`placed link ${this.room.name}`);
    }

    private findLink() {
        return this.source.findMemoStructure(STRUCTURE_LINK, 2, true) as StructureLink;
    }
}
