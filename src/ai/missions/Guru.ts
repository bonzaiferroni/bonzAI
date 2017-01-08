import {Empire} from "../Empire";
import {Operation} from "../operations/Operation";
import {Mission} from "./Mission";
export abstract class Guru {

    protected flag: Flag;
    protected room: Room;
    protected empire: Empire;
    protected memory: any;
    protected host: Mission | Operation;

    constructor(host: Mission | Operation, name = "guru") {
        this.flag = host.flag;
        this.room = this.flag.room;
        this.empire = host.empire;
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
}