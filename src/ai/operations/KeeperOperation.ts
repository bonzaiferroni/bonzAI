import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {LairMission} from "../missions/LairMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {InvaderGuru} from "../missions/InvaderGuru";
export class KeeperOperation extends Operation {

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
    }

    initOperation() {
        this.findOperationWaypoints();
        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
            console.log("SPAWN: waypoints detected, manually set spawn missionRoom, example:", this.name +
                ".setSpawnRoom(otherOpName.flag.missionRoom.name)");
            return;
        }
        this.spawnGroup = this.getRemoteSpawnGroup();
        if (!this.spawnGroup) {
            console.log("ATTN: no spawnGroup found for", this.name);
            return; // early
        }

        this.addMission(new ScoutMission(this));
        let invaderGuru = new InvaderGuru(this);
        this.addMission(new EnhancedBodyguardMission(this, invaderGuru));
        this.addMission(new LairMission(this, invaderGuru));

        if (!this.hasVision) return; // early

        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            this.addMission(new MiningMission(this, "miner" + i, this.sources[i]));
        }

        this.addMission(new RemoteBuildMission(this, true));

        if (this.mineral.pos.lookFor(LOOK_FLAGS).length === 0) {
            this.addMission(new GeologyMission(this));
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