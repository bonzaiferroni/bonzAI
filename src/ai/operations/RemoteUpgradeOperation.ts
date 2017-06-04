import {Operation} from "./Operation";
import {RemoteUpgradeMission} from "../missions/RemoteUpgradeMission";
import {OperationPriority} from "../../config/constants";
import {empire} from "../Empire";
export class RemoteUpgradeOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    protected init() {
        this.spawnGroup = empire.getSpawnGroup(this.roomName);
        this.addMission(new RemoteUpgradeMission(this));
    }

    protected update() {
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }
}