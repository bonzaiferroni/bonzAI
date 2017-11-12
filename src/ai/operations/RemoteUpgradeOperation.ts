import {Operation, OperationMemory} from "./Operation";
import {VeryRemoteUpgradeMission} from "../missions/VeryRemoteUpgradeMission";
import {OperationPriority} from "../../config/constants";
import {core} from "../Empire";
import {RemoteUpgradeMission} from "../missions/RemoteUpgradeMission";

interface RemoteUpgradeOperationMemory extends OperationMemory {
    very: boolean;
}

export class RemoteUpgradeOperation extends Operation {

    public memory: RemoteUpgradeOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    protected init() {
        this.spawnGroup = core.getSpawnGroup(this.roomName);
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