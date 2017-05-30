import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {OperationPriority} from "../../config/constants";
import {ZombieMission} from "../missions/ZombieMission";
import {RaidGuru} from "../missions/RaidGuru";
export class ZombieOperation extends Operation {
    private raidGuru: RaidGuru;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public init() {
        this.initRemoteSpawn(4, 8);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        } else {
            return;
        }

        if (!this.spawnGroup) { return; }
        this.raidGuru = new RaidGuru(this);
        this.addMission(new ZombieMission(this, this.raidGuru));
    }

    public update() {
        this.raidGuru.refreshGuru(this.roomName, true);
    }

    public finalize() {
    }

    public invalidateCache() {
    }

}
