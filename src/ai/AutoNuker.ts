import {core} from "./Empire";
import {Notifier} from "../notifier";
import {MemHelper} from "../helpers/MemHelper";
import {Scheduler} from "../Scheduler";

export class AutoNuker {

    private static structureScores = {
        [STRUCTURE_SPAWN]: 10,
        [STRUCTURE_STORAGE]: 30,
        [STRUCTURE_LAB]: 10,
        [STRUCTURE_NUKER]: 20,
        [STRUCTURE_TERMINAL]: 30,
        [STRUCTURE_RAMPART]: 5,
        [STRUCTURE_WALL]: 5,
        [STRUCTURE_TOWER]: 5,
    };

    public static memory: any;

    public static init() {
        if (!Memory.autoNuker) { Memory.autoNuker = {}; }
        this.memory = Memory.autoNuker;
    }

    public static actions() {
        this.memory = Memory.autoNuker;
        if (Scheduler.delay(this.memory, "nextCheck", 1000)) {return; }
        for (let roomName in core.map.controlledRooms) {
            let room = core.map.controlledRooms[roomName];
            this.findNukingSolution(room);
        }
    }

    public static validNukeTarget(room: Room) {
        return room.controller && room.controller.level >= 8 && room.controller.owner
            && core.diplomat.foes[room.controller.owner.username];
    }

    public static evaluateRoom(room: Room) {
        if (!this.validNukeTarget(room)) {
            delete room.memory.nukeScore;
            delete room.memory.nukePos;
            return;
        }
        if (room.memory.nextNukeEval > Game.time) { return; }
        room.memory.nextNukeEval = Game.time + NUKER_COOLDOWN;

        let scanStructures: Structure[] = [];
        for (let structureType in this.structureScores) {
            for (let structure of room.findStructures<Structure>(structureType)) {
                scanStructures.push(structure);
            }
        }

        let bestScore = 0;
        let bestPos: RoomPosition;
        for (let structure of scanStructures) {
            let score = this.structureScores[structure.structureType];
            for (let hitStructure of structure.pos.findInRange<Structure>(scanStructures, 2)) {
                let addScore = this.structureScores[hitStructure.structureType];
                if (!addScore) { continue; }
                score += addScore;
            }
            if (score > bestScore) {
                bestPos = structure.pos;
                bestScore = score;
            }
        }

        if (!bestPos) { return; }
        Notifier.log(`AUTONUKER: found ${bestPos} to be best nuking position with score of ${bestScore}`, 2);
        room.memory.nukePos = MemHelper.intPosition(bestPos);
        room.memory.nukeScore = bestScore;
    }

    public static findNukingSolution(launchRoom: Room) {
        if (launchRoom.controller.level < 8) { return; }
        let nuker = launchRoom.findStructures<StructureNuker>(STRUCTURE_NUKER)[0];
        if (!nuker || nuker.cooldown > 0 || nuker.ghodium < nuker.ghodiumCapacity || nuker.energy < nuker.energyCapacity) {
            return;
        }

        let bestScore = 0;
        let bestPos: RoomPosition;
        for (let roomName in Memory.rooms) {
            let memory = Memory.rooms[roomName];
            if (!memory.nukeScore) { continue; }
            if (!core.map.foesMap[roomName]) { continue; }
            if (Game.map.getRoomLinearDistance(launchRoom.name, roomName) > 10) { continue; }
            if (memory.nukeScore > bestScore) {
                bestScore = memory.nukeScore;
                bestPos = MemHelper.deserializeIntPosition(memory.nukePos, roomName);
            }
        }

        if (bestPos) {
            Notifier.log(`AUTONUKER: bombsaway! bombing ${bestPos} with score of ${bestScore}`, 1);
            nuker.launchNuke(bestPos);
        }
    }
}