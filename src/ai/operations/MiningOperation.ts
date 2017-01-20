import {Operation} from "./Operation";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {ReserveMission} from "../missions/ReserveMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {OperationPriority} from "../../config/constants";
import {ROOMTYPE_CORE} from "../WorldMap";
import {InvaderGuru} from "../missions/InvaderGuru";
export class MiningOperation extends Operation {

    /**
     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the missionRoom. Can also
     * mine minerals from core rooms
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    initOperation() {
        this.findOperationWaypoints();
        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
            console.log("SPAWN: waypoints detected, manually set spawn missionRoom, example:", this.name +
                ".setSpawnRoom(otherOpName.flag.missionRoom.name)");
            return;
        }
        this.spawnGroup = this.getRemoteSpawnGroup(2);

        if (!this.spawnGroup) {
            console.log("ATTN: no spawnGroup found for", this.name);
            return; // early
        }

        if (this.spawnGroup.room.controller.level < 4) { return; }

        this.addMission(new ScoutMission(this));

        // it is not ideal to return early if no vision, but i'm having a hard time figuring out how to do
        // miningmission without vision

        let invaderGuru = new InvaderGuru(this);
        invaderGuru.init();
        // defense
        if (this.flag.room && this.flag.room.roomType === ROOMTYPE_CORE) {
            this.addMission(new EnhancedBodyguardMission(this, invaderGuru));
        }
        else {
            this.addMission(new BodyguardMission(this, invaderGuru));
        }

        if (!this.flag.room) return;

        // claimers
        if (this.flag.room.controller) {
            this.addMission(new ReserveMission(this));
        }


        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            this.addMission(new MiningMission(this, "miner" + i, this.sources[i]));
        }

        this.addMission(new RemoteBuildMission(this, true));

        if (!this.flag.room.controller || this.memory.swapMining) {
            let storeStructure = this.memory.swapMining ? this.flag.room.terminal : undefined;
            this.addMission(new GeologyMission(this, storeStructure));
        }

    }

    finalizeOperation() {
    }
    invalidateOperationCache() {
        if (Math.random() < .01) {
            this.memory.spawnRooms = undefined;
        }
    }
}