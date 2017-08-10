import {helper} from "../helpers/helper";
import {PosHelper} from "../helpers/PosHelper";
import {CreepHelper} from "../helpers/CreepHelper";
import {empire} from "./Empire";
import {Notifier} from "../notifier";
import {MemHelper} from "../helpers/MemHelper";
export class SignMaker {

    public static actions() {
        if (!Memory.signs) { Memory.signs = {}; }
        if (Object.keys(Memory.signs).length === 0) { return; }
        let roomName = Object.keys(Memory.signs)[0];
        let creep = Game.creeps["signMaker"];
        if (creep) {
            roomName = this.findRoom(creep);
            if (Game.map.getRoomLinearDistance(roomName, creep.room.name) * 60 > creep.ticksToLive) {
                creep.suicide();
                return;
            }

            let destination: { pos: RoomPosition };
            if (creep.memory.controlPos) {
                destination = {pos: MemHelper.deserializeIntPosition(creep.memory.controlPos, roomName)};
            } else {
                destination = {pos: PosHelper.pathablePosition(roomName)};
            }

            let room = Game.rooms[roomName];
            if (room) {
                if (creep.pos.isNearTo(room.controller)) {
                    Notifier.log("new sign at " + roomName, 1);
                    creep.signController(room.controller, Memory.signs[roomName]);
                    delete creep.memory.roomName;
                    delete creep.memory.controlPos;
                    delete Memory.signs[roomName];
                } else {
                    creep.memory.controlPos = MemHelper.intPosition(room.controller.pos);
                }
            }
            CreepHelper.avoidSK(creep, destination, {offRoad: true, ensurePath: true});

        } else {
            Memory.creeps["signMaker"] = undefined;
            Notifier.log("spawning signMaker for " + roomName, 1);
            empire.spawnFromClosest(roomName, [MOVE], "signMaker");
        }
    }

    private static findRoom(creep: Creep): string {
        if (creep.memory.roomName) {
            if (Memory.signs[creep.memory.roomName]) {
                return creep.memory.roomName;
            } else {
                creep.memory.roomName = undefined;
                return this.findRoom(creep);
            }
        } else {
            let roomName = _.min(Object.keys(Memory.signs), x => Game.map.getRoomLinearDistance(x, creep.pos.roomName));
            if (_.isString(roomName)) {
                Notifier.log("signMaker headed towerd " + roomName, 1);
                creep.memory.roomName = roomName;
                return roomName;
            }
        }
    }
}
