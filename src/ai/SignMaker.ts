import {helper} from "../helpers/helper";
import {PosHelper} from "../helpers/PosHelper";
import {CreepHelper} from "../helpers/CreepHelper";
import {empire} from "./Empire";
import {Notifier} from "../notifier";
import {MemHelper} from "../helpers/MemHelper";

export class SignMaker {

    private static memory: {
        nextSpawn: number;
    };

    public static init() {
        if (!Memory.signMaker) { Memory.signMaker = {}; }
        this.memory = Memory.signMaker;
    }

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
                    delete creep.memory.badPathCount;
                } else {
                    creep.memory.controlPos = MemHelper.intPosition(room.controller.pos);
                }
            }
            let ret = {} as TravelToReturnData;
            CreepHelper.avoidSK(creep, destination, {offRoad: true, ensurePath: true, returnData: ret});
            if (ret.pathfinderReturn && ret.pathfinderReturn.incomplete) {
                if (!creep.memory.badPathCount) {
                    creep.memory.badPathCount = 1;
                } else {
                    creep.memory.badPathCount++;
                }
            }

            if (creep.memory.badPathCount > 10) {
                Notifier.log(`no path to sign in ${roomName}, erasing sign`, 2);
                delete creep.memory.roomName;
                delete creep.memory.controlPos;
                delete Memory.signs[roomName];
                delete creep.memory.badPathCount;
            }

        } else {
            if (!Memory.creeps) { return; }
            Memory.creeps["signMaker"] = undefined;

            if (this.memory.nextSpawn > Game.time) { return; }
            if (empire.map.controlledRoomCount <= 3) { return; }
            Notifier.log("spawning signMaker for " + roomName, 1);
            let outcome = empire.spawnFromClosest(roomName, [MOVE], "signMaker");
            if (_.isString(outcome)) {
                this.memory.nextSpawn = Game.time + 1000;
            }
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
