import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {OperationPriority, ROOMTYPE_CORE, IGOR_CAPACITY} from "../../config/constants";
import {ReserveMission} from "../missions/ReserveMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {SwapMission} from "../missions/SwapMission";
import {ClaimMission} from "../missions/ClaimMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
export class MiningOperation extends Operation {

    /**
     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the room. Can also
     * mine minerals from core rooms
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.Low;
    }

    initOperation() {
        this.findOperationWaypoints();
        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
            console.log("SPAWN: waypoints detected, manually set spawn room, example:", this.name +
                ".setSpawnRoom(otherOpName.flag.room.name)");
            return;
        }
        this.spawnGroup = this.getRemoteSpawnGroup();
        if (!this.spawnGroup) {
            console.log("ATTN: no spawnGroup found for", this.name);
            return; // early
        }

        this.addMission(new ScoutMission(this));

        // it is not ideal to return early if no vision, but i'm having a hard time figuring out how to do
        // miningmission without vision
        if (!this.flag.room) return;

        // defense
        if (this.flag.room.roomType === ROOMTYPE_CORE) {
            this.addMission(new EnhancedBodyguardMission(this));
        }
        else {
            this.addMission(new BodyguardMission(this, !this.memory.swapMining || this.flag.room.controller.level < 3));
        }

        // swap mining
        if (this.memory.swapMining) {
            this.addMission(new SwapMission(this));
        }

        // claimers
        if (this.flag.room.memory.swapActive) {
            if (!this.flag.room.controller.my) {
                this.addMission(new ClaimMission(this));
            }
            // upgraders
            let spawnUpgraders = this.flag.room.controller.level < 6 &&
                this.spawnGroup.room.terminal.store[RESOURCE_CATALYZED_GHODIUM_ACID] >= IGOR_CAPACITY;
            this.addMission(new UpgradeMission(this, true, spawnUpgraders, false));
        }
        else {
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