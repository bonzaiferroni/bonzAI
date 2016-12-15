import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {RefillMission} from "../missions/RefillMission";
import {DefenseMission} from "../missions/DefenseMission";
import {MiningMission} from "../missions/MiningMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {OperationPriority} from "../../config/constants";
import {ScoutMission} from "../missions/ScoutMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {TransportMission} from "../missions/TransportMission";
import {ClaimMission} from "../missions/ClaimMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {RemoteLevelMission} from "../missions/RemoteLevelMission";


const CONQUEST_MASON_POTENCY = 4;
const CONQUEST_LOCAL_MIN_SPAWN_ENERGY = 1300;

export class BootstrapOperation extends Operation {

    /**
     * Facilitates the establishment of new owned-rooms by sending worker/miners who will mine, upgrade, build & fill.
     * Sends 6 workers (which is generally enough to empty all sources every time).
     * Also claims and sends a bodyguard if no towers (as per conquest)
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super (flag, name, type, empire);
        this.priority = OperationPriority.Medium;
    }

    initOperation() {
        this.findOperationWaypoints();
        if (!this.memory.spawnRoom) {
            if (Game.time % 3 === 0) {
                console.log(this.name, "needs a spawn room, example:", this.name + ".setSpawnRoom(otherOpName.flag.room.name)");
            }
            return; // early
        }

        this.spawnGroup = this.empire.getSpawnGroup(this.memory.spawnRoom);
        if (!this.spawnGroup) {
            console.log("Invalid spawn room specified for", this.name);
            return;
        }

        this.addMission(new ScoutMission(this));
        if (!this.hasVision || !this.flag.room.controller.my) {
            this.addMission(new ClaimMission(this));
        }

        if (!this.hasVision) return; // early

        if (this.flag.room.findStructures(STRUCTURE_TOWER).length === 0) {
            this.addMission(new BodyguardMission(this));
        }

        this.addMission(new RemoteLevelMission(this))

    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}