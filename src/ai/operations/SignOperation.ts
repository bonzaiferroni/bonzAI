import {Operation} from "./Operation";
import {core} from "../Empire";
import {OperationPriority, Direction} from "../../config/constants";
import {SignMission} from "../missions/SignMission";
export class SignerOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.VeryHigh;
    }

    protected init() {
        this.addMission(new SignMission(this));
    }

    protected update() {
        this.updateRemoteSpawn(1490, 300, 50);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        } else {
            console.log("ATTN: no spawnGroup found for", this.name);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }
}
