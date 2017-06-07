import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {Notifier} from "../../notifier";
import {empire} from "../Empire";
import {Traveler} from "../Traveler";
export class LinkMiningMission extends Mission {

    private linkMiners: Agent[];
    private source: Source;
    private sourceId: string;
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
        this.sourceId = source.id;
    }

    /**
     * Assumes room has vision, storage and is rcl8
     * @param operation
     * @constructor
     */
    public static Add(operation: Operation) {
        for (let i = 0; i < operation.state.sources.length; i++) {
            // disable harvesting sources manually by putting a flag over it
            if (operation.state.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) { continue; }
            let source = operation.state.sources[i];
            operation.addMission(new LinkMiningMission(operation, "miner" + i, source));
        }
    }

    public init() {
    }

    public update() {
        this.source = Game.getObjectById<Source>(this.sourceId);
        this.link = this.findLink();
        if (!this.link) {
            this.placeLink();
        }
    }

    public getMaxMiners = () => {
        if (this.room.hostiles.length > 0) { return 0; }
        return this.link ? 1 : 0;
    };

    public roleCall() {
        this.linkMiners = this.headCount(this.name, () => this.workerBody(5, 4, 5), this.getMaxMiners );
    }

    public actions() {
        for (let miner of this.linkMiners) {
            this.minerActions(miner);
        }
    }

    public finalize() {
    }
    public invalidateCache() {
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

        if (!this.link) {
            miner.idleOffRoad(this.source);
            return;
        }

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

    /**
     * Will look for a suitable position for a link and place it
     */
    public placeLink() {
        if (this.room.hostiles.length > 0) { return; }
        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2).length > 0) { return; }
        if (this.source.pos.findInRange(this.source.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length > 0) {
            return;
        }
        let container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
        if (container) {
            container.destroy();
            return;
        }

        let ret = Traveler.findTravelPath(this.room.storage.pos, this.source.pos);
        if (ret.incomplete) { console.log(`LINKMINER: Path to source incomplete ${this.room.name}`); }
        let minerPos = _.last(ret.path);
        let position = this.findValidLinkPos(minerPos, ret.path);
        if (!position) {
            // sometimes the default position will be invalid, like in a case where two sources are adjacent
            // look through other positions
            for (let altPosition of this.source.pos.openAdjacentSpots(true)) {
                position = this.findValidLinkPos(altPosition, ret.path);
                if (position) { break; }
            }
        }

        if (!position) {
            console.log(`LINKMINER: no suitable position for link ${this.room.name}`);
            return;
        }

        position.createConstructionSite(STRUCTURE_LINK);
        console.log(`placed link ${this.room.name}`);
    }

    private findLink() {
        return this.source.findMemoStructure(STRUCTURE_LINK, 2, true) as StructureLink;
    }

    private findValidLinkPos(minerPos: RoomPosition, path: RoomPosition[]): RoomPosition {
        let validPositions = [];
        for (let position of minerPos.openAdjacentSpots(true)) {
            // not a wall/structure
            if (!position.isPassible(true)) { continue; }
            // not close to controller
            if (position.findInRange([this.room.controller], 3).length > 0) { continue; }
            // not close to any source
            if (position.findInRange(FIND_SOURCES, 2).length > 1) { continue; }
            // not along the path that the miner would take to get there
            if (position.findInRange(path, 0).length > 0) {continue; }
            validPositions.push(position);
        }
        if (validPositions.length === 0) {
            return;
        }
        validPositions = _.sortBy(validPositions, (p: RoomPosition) => p.getRangeTo(this.room.storage));
        return _.head(validPositions);
    }
}
