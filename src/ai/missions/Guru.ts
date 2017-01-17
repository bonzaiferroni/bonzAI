import {Empire} from "../Empire";
import {Operation} from "../operations/Operation";
import {Mission} from "./Mission";
export abstract class Guru {

    protected flag: Flag;
    protected room: Room;
    protected memory: any;
    protected host: Mission | Operation;

    constructor(host: Mission | Operation, name = "guru") {
        this.flag = host.flag;
        this.room = this.flag.room;
        let hostMemory = host.memory;
        if (!hostMemory[name]) { hostMemory[name] = {}; }
        this.memory = hostMemory[name];
        this.host = host;
    }

    observeRoom(roomName: string): Room {
        let room = Game.rooms[roomName];
        if (room) return room;
        let observer = this.host.spawnGroup.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
        if (!observer) { return; }
        observer.observeRoom(this.flag.pos.roomName);
    }

    static deserializePositions(stringified: string, roomName: string): RoomPosition[] {
        let roomPositions = [];
        if (!roomName) return;
        for (let i = 0; i < stringified.length; i += 4) {
            let x = parseInt(stringified.substr(i, 2));
            let y = parseInt(stringified.substr(i + 2, 2));
            roomPositions.push(new RoomPosition(x, y, roomName));
        }
        return roomPositions;
    }

    static deserializePositionWithIndex(stringified: string, roomName: string, index: number): RoomPosition {
        let x = parseInt(stringified.substr(index, 2));
        let y = parseInt(stringified.substr(index + 2, 2));
        return new RoomPosition(x, y, roomName);
    }

    static serializePositions(positions: RoomPosition[]): string {
        let stringified = "";
        for (let position of positions) {
            let x = position.x > 9 ? position.x.toString() : "0" + position.x;
            let y = position.y > 9 ? position.y.toString() : "0" + position.y;
            stringified += x + y;
        }
        return stringified;
    }
}