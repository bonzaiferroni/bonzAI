import {AbstractAgent} from "./AbstractAgent";
import {CreepHelper} from "../../helpers/CreepHelper";

export class HostileAgent extends AbstractAgent {

    constructor(creep: Creep) {
        super(creep);
        if (!Memory.hostileMemory[creep.id]) { Memory.hostileMemory[creep.id] = {} as any; }
        this.memory = Memory.hostileMemory[creep.id];
    }

    /**
     * Primary function for getting hostiles
     * @param roomName
     * @returns {Creep[]}
     */
    public static findInRoom(roomName: string): HostileAgent[] {
        if (this.census.hostile[roomName]) { return this.census.hostile[roomName]; }

        let room = Game.rooms[roomName];
        if (!room) { return; }

        let hostileAgents: HostileAgent[] = [];
        for (let hostile of room.hostiles) {
            if (CreepHelper.isCivilian(hostile)) { continue; }
            let hostileAgent = new HostileAgent(hostile);
            hostileAgents.push(hostileAgent);
        }

        this.census.hostile[roomName] = hostileAgents;
        return hostileAgents;
    }
}
