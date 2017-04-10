import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {OperationPriority} from "../../config/constants";
import {ZombieMission} from "../missions/ZombieMission";
import {RaidGuru} from "../missions/RaidGuru";
export class ZombieOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public initOperation() {
        this.initRemoteSpawn(4, 8);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        } else {
            return;
        }

        if (!this.spawnGroup) { return; }
        let raidGuru = new RaidGuru(this);
        raidGuru.init(this.flag.pos.roomName, true);
        this.addMission(new ZombieMission(this, raidGuru));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }

}
