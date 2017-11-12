import {Operation} from "./Operation";
import {OperationPriority} from "../../config/constants";
import {core} from "../Empire";
import {GuardMission} from "../missions/GuardMission";
export class GuardOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public init() {
        this.spawnGroup = core.getSpawnGroup(this.flag.room.name);
        this.addMission(new GuardMission(this));
    }

    public update() {
    }

    public finalize() {
    }

    public invalidateCache() {
    }

}
