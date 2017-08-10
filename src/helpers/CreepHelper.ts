import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../ai/WorldMap";
import {Traveler} from "../ai/Traveler";
export class CreepHelper {
    public static isBoosted(creep: Creep) {
        for (let part of creep.body) {
            if (part.boost) {
                return true;
            }
        }
        return false;
    }

    public static partCount(creep: Creep, partType: string, boostOnly = false): number {
        let count = 0;
        if (boostOnly) {
            for (let part of creep.body) {
                if (!part.boost) { continue; }
                if (part.type === partType) {
                    count++;
                }
            }
        } else {
            for (let part of creep.body) {
                if (part.type === partType) {
                    count++;
                }
            }
        }
        return count;
    };

    public static calculateShield(creep: Creep) {
        let shield = 0;
        for (let part of creep.body) {
            if (part.type !== TOUGH) { continue; }
            if (part.boost) {
                shield += part.hits / BOOSTS[TOUGH][part.boost]["damage"];
            } else {
                shield += part.hits;
            }
        }
        return shield;
    }

    public static avoidSK(creep: Creep, destination: {pos: RoomPosition}, options: TravelToOptions = {}): number {
        let costCall = (roomName: string, matrix: CostMatrix): CostMatrix | boolean => {
            if (roomName !== creep.pos.roomName) { return; }
            let room = Game.rooms[creep.pos.roomName];
            let sourceKeepers = _.filter(room.hostiles, (c: Creep) => c.owner.username === "Source Keeper");
            for (let sourceKeeper of sourceKeepers) {
                const SAFE_RANGE = 4;
                if (creep.pos.getRangeTo(sourceKeeper) < SAFE_RANGE) { continue; }
                for (let xDelta = -SAFE_RANGE; xDelta <= SAFE_RANGE; xDelta++) {
                    for (let yDelta = -SAFE_RANGE; yDelta <= SAFE_RANGE; yDelta++) {
                        matrix.set(sourceKeeper.pos.x + xDelta, sourceKeeper.pos.y + yDelta, 0xff);
                    }
                }
            }
            return matrix;
        };

        if (WorldMap.roomType(creep.room.name) === ROOMTYPE_SOURCEKEEPER) {
            options.roomCallback = costCall;
            let hostileCount = creep.room.hostiles.length;
            if (!creep.memory.hostileCount) { creep.memory.hostileCount = 0; }
            if (hostileCount > creep.memory.hostileCount) {
                this.resetTravelPath(creep);
            }
            creep.memory.hostileCount = hostileCount;
        }

        return Traveler.travelTo(creep, destination, options);
    }

    public static resetTravelPath(creep: Creep) {
        if (!creep.memory._trav) { return; }
        delete creep.memory._trav.path;
    }
}
