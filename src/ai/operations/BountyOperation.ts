import {Operation, OperationMemory} from "./Operation";
import {OperationPriority} from "../../config/constants";
import {BountyMission} from "../missions/BountyMission";
import {empire} from "../Empire";
import {Viz} from "../../helpers/Viz";

export interface BountyCommander {

}

interface BountyOperationMemory extends OperationMemory {
    commander: BountyCommander;
}

export class BountyOperation extends Operation {

    public memory: BountyOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.VeryLow;
    }

    protected init() {
        if (!this.memory.commander) { this.memory.commander = {}; }

        this.updateRemoteSpawn(8, 500);
        let foundSpawn = this.assignRemoteSpawn();
        if (!foundSpawn) { return; }

        this.addMission(new BountyMission(this, this.memory.commander));
    }

    protected update() {
    }

    protected finalize() {
        Viz.animatedPos(this.flag.pos);
        if (this.room) {
            let hasTower = this.room.findStructures(STRUCTURE_TOWER).length > 0;
            let isSafeModed = this.room.controller.safeMode !== undefined;
            if (hasTower || isSafeModed) {
                this.flag.remove();
            }
        }
    }

    protected invalidateCache() {
    }

}