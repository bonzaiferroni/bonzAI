import {Operation} from "./Operation";
import {OperationPriority} from "../../config/constants";
import {empire} from "../Empire";
import {GuardMission} from "../missions/GuardMission";
export class GuardOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public init() {
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);
        this.addMission(new GuardMission(this));
    }

    public refresh() {
    }

    public finalize() {
    }

    public invalidateCache() {
    }

}
