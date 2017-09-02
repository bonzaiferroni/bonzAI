import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {Observationer} from "../Observationer";

export abstract class Guru {

    protected flag: Flag;
    protected operation: Operation;
    protected memory: any;
    protected room: Room;
    protected spawnGroup: SpawnGroup;
    private name: string;

    constructor(operation: Operation, name: string) {
        this.operation = operation;
        this.name = name;
        this.spawnGroup = operation.spawnGroup;
    }

    public init() {
        if (!this.operation.memory[this.name]) { this.operation.memory[this.name] = {}; }
        this.memory = this.operation.memory[this.name];
    }

    public update() {
        this.flag = this.operation.flag;
        this.memory = this.operation.memory[this.name];
        this.room = Game.rooms[this.operation.roomName];
    }

    protected observeRoom(roomName: string): Room {
        let room = Game.rooms[roomName];
        if (room) { return room; }
        if (Game.map.getRoomLinearDistance(this.spawnGroup.room.name, roomName) > 10) { return; }
        let observer = this.spawnGroup.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
        if (!observer) { return; }
        Observationer.observeRoom(this.flag.pos.roomName, 5, true);
    }

    public static deserializePositions(stringified: string, roomName: string): RoomPosition[] {
        let roomPositions = [];
        if (!roomName) { return; }
        for (let i = 0; i < stringified.length; i += 4) {
            let x = parseInt(stringified.substr(i, 2), 10);
            let y = parseInt(stringified.substr(i + 2, 2), 10);
            roomPositions.push(new RoomPosition(x, y, roomName));
        }
        return roomPositions;
    }

    public static deserializePositionWithIndex(stringified: string, roomName: string, index: number): RoomPosition {
        let x = parseInt(stringified.substr(index, 2), 10);
        let y = parseInt(stringified.substr(index + 2, 2), 10);
        return new RoomPosition(x, y, roomName);
    }

    public static serializePositions(positions: RoomPosition[]): string {
        let stringified = "";
        for (let position of positions) {
            let x = position.x > 9 ? position.x.toString() : "0" + position.x;
            let y = position.y > 9 ? position.y.toString() : "0" + position.y;
            stringified += x + y;
        }
        return stringified;
    }
}
