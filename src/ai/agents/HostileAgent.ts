import {helper} from "../../helpers/helper";
import {AbstractAgent} from "./AbstractAgent";
import {RaidAgent} from "./RaidAgent";
import {empire} from "../Empire";
export class HostileAgent extends AbstractAgent {

    constructor(creep: Creep) {
        super(creep);
        if (!Memory.hostileMemory[creep.id]) { Memory.hostileMemory[creep.id] = {} as any; }
        this.memory = Memory.hostileMemory[creep.id];
        this.trackMovement();
    }

    /**
     * Primary function for getting hostiles
     * @param roomName
     * @returns {Creep[]}
     */
    public static findInRoom(roomName: string): HostileAgent[] {

        let room = Game.rooms[roomName];
        if (!room) { return; }

        if (this.census.hostile[roomName]) { return this.census.hostile[roomName]; }

        let hostileAgents: HostileAgent[] = [];
        for (let hostile of room.hostiles) {
            if (hostile.owner.username === "Invader" || hostile.owner.username === "Source Keeper") { continue; }
            if (!_.find(hostile.body,
                    p => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL)) { continue; }
            let hostileAgent = new HostileAgent(hostile);
            hostileAgents.push(hostileAgent);
        }

        this.census.hostile[roomName] = hostileAgents;
        return hostileAgents;
    }
}
