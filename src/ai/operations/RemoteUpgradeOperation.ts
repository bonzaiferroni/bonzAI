import {Operation} from "./Operation";
import {VeryRemoteUpgradeMission} from "../missions/VeryRemoteUpgradeMission";
import {OperationPriority} from "../../config/constants";
import {empire} from "../Empire";
import {RemoteUpgradeMission} from "../missions/RemoteUpgradeMission";

export class RemoteUpgradeOperation extends Operation {

    public memory: {
        very: boolean;
    };

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    protected init() {
        this.spawnGroup = empire.getSpawnGroup(this.roomName);
        if (this.memory.very) {
            this.addMission(new VeryRemoteUpgradeMission(this));
        } else {
            this.addMission(new RemoteUpgradeMission(this));
        }
    }

    protected update() {
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }
}