import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {LairMission} from "../missions/LairMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
export class KeeperOperation extends Operation {

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
    }

    initOperation() {
        this.findOperationWaypoints();
        if (this.waypoints.length > 0 && !this.memory.spawnRoom) {
            console.log("SPAWN: _waypoints detected, manually set spawn room, example:", this.name +
                ".setSpawnRoom(otherOpName.flag.room.name)");
            return;
        }
        this._spawnGroup = this.getRemoteSpawnGroup();
        if (!this.spawnGroup) {
            console.log("ATTN: no spawnGroup found for", this.name);
            return; // early
        }

        this.addMission(new ScoutMission(this));
        this.addMission(new EnhancedBodyguardMission(this));
        this.addMission(new LairMission(this));

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

    public buildKeeperRoads(operation: string, segments: number[] = [0, 1, 2, 3, 4]) {
        let opFlag = Game.flags["keeper_" + operation];

        _.forEach(segments, function(segment) {
            let path = KeeperOperation.getKeeperPath(operation, segment);
            _.forEach(path, function(p) {
                opFlag.room.createConstructionSite(p.x, p.y, STRUCTURE_ROAD);
            });
        });
    }

    private static getKeeperPath(operation: string, segment: number) {
        let A;
        if (segment === 0) {
            A = Game.flags["keeper_" + operation];
        }
        else {
            A = Game.flags[operation + "_lair:" + (segment - 1)];
        }

        let B;
        B = Game.flags[operation + "_lair:" + segment];
        if (!B) {
            B = Game.flags[operation + "_lair:0"];
        }
        if (!A || !B) {
            return;
        }

        let r = Game.rooms[A.pos.roomName];
        if (!r) {
            return;
        }

        if (!_.isEmpty(A.pos.findInRange(FIND_SOURCES, 6))) {
            A = A.pos.findInRange(FIND_SOURCES, 6)[0];
        }

        if (!_.isEmpty(B.pos.findInRange(FIND_SOURCES, 6))) {
            B = B.pos.findInRange(FIND_SOURCES, 6)[0];
        }

        if (!_.isEmpty(A.pos.findInRange(FIND_MINERALS, 6))) {
            A = A.pos.findInRange(FIND_MINERALS, 6)[0];
        }

        if (!_.isEmpty(B.pos.findInRange(FIND_MINERALS, 6))) {
            B = B.pos.findInRange(FIND_MINERALS, 6)[0];
        }

        return A.pos.findPathTo(B.pos, {ignoreCreeps: true});
    }
}