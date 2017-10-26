import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../ai/WorldMap";
import {Traveler, TravelToOptions} from "../Traveler";
import {PosHelper} from "./PosHelper";
export class CreepHelper {

    private static civilianParts = {
        [CARRY]: true,
        [MOVE]: true,
    };
    private static npcNames = {
        ["Invader"]: true,
        ["Source Keeper"]: true,
    };

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

    public static getPotential(creep: Creep, type: string) {
        let profile = this.getProfile(creep);
        return profile[type].potential;
    }

    public static getProfile(creep: Creep): CreepProfile {
        if (creep.profile) { return creep.profile; }

        let profile: CreepProfile = {};
        for (let partType of BODYPARTS_ALL) {
            profile[partType] = {
                isBoosted: false,
                potential: 0,
                count: 0,
            };
        }

        let unitPotential = {
            [RANGED_ATTACK]: RANGED_ATTACK_POWER,
            [ATTACK]: ATTACK_POWER,
            [HEAL]: HEAL_POWER,
            [WORK]: DISMANTLE_POWER,
            [CARRY]: CARRY_CAPACITY,
            [MOVE]: 1,
            [CLAIM]: CONTROLLER_CLAIM_DOWNGRADE,
            [TOUGH]: 10,
        };

        for (let part of creep.body) {
            let partProfile = profile[part.type];
            let potential = unitPotential[part.type] * (part.hits / 100);
            if (part.boost) {
                partProfile.isBoosted = true;
                potential *= 4;
            }
            partProfile.potential += potential;
            partProfile.count++;
        }

        creep.profile = profile;
        return profile;
    }

    public static isBoosted(creep: Creep, filter?: string) {
        let profile = this.getProfile(creep);
        if (filter) {
            return profile[filter].isBoosted;
        }

        for (let partType in profile) {
            if (profile[partType].isBoosted) { return true; }
        }

        return false;
    }

    public static rating(creep: Creep): number {
        if (creep.rating === undefined) {
            let profile = this.getProfile(creep);
            creep.rating = profile[RANGED_ATTACK].potential + profile[ATTACK].potential / 3;
            if (profile[TOUGH].count > 0 && profile[TOUGH].isBoosted) {
                creep.rating += profile[HEAL].potential * 3;
            } else {
                creep.rating += profile[HEAL].potential;
            }
        }
        return creep.rating;
    }

    public static partCount(creep: Creep, partType: string): number {
        let profile = this.getProfile(creep);
        return profile[partType].count;
    };

    public static expectedDamageAtRange(creep: Creep, range: number) {
        let damage = 0;
        if (range <= 3) {
            damage += this.getPotential(creep, RANGED_ATTACK);
        }
        if (range <= 1) {
            damage += this.getPotential(creep, ATTACK);
        }
        return damage;
    }

    public static expectedDamage(creep: Creep) {
        if (creep.expectedDamage === undefined) {
            creep.expectedDamage = PosHelper.totalDamageAtPosition(creep.pos, 0);
        }
        return creep.expectedDamage;
    }

    public static averageDamage(creep: Creep) {
        if (!creep.my) { return 0; }
        if (creep.averageDamage === undefined) {
            if (creep.memory.damageHistory === undefined) {
                creep.memory.damageHistory = [];
            }
            creep.memory.damageHistory.push(creep.hitsMax - creep.hits);
            while (creep.memory.damageHistory.length > 20) {
                creep.memory.damageHistory.shift();
            }
            creep.averageDamage = _.sum(creep.memory.damageHistory) / creep.memory.damageHistory.length;
        }
        return creep.averageDamage;
    }

    public static shield(creep: Creep): { hits: number, hitsMax: number } {
        if (creep.shield === undefined) {
            creep.shield = {
                hits: 0,
                hitsMax: 0,
            };
            for (let part of creep.body) {
                if (part.type !== TOUGH) { continue; }
                let boostFactor = 1;
                if (part.boost) {
                    boostFactor = BOOSTS[TOUGH][part.boost]["damage"];
                }
                creep.shield.hits += part.hits / boostFactor;
                creep.shield.hitsMax += 100 / boostFactor;
            }
        }
        return creep.shield;
    }

    public static isCivilian(creep: Creep): boolean {
        if (creep.isCivilian === undefined) {
            creep.isCivilian = true;
            for (let part of creep.body) {
                if (this.civilianParts[part.type]) { continue; }
                if (part.type === WORK) {
                    if (part.boost) {
                        creep.isCivilian = false;
                        return false;
                    }
                } else {
                    creep.isCivilian = false;
                    return false;
                }
            }
        }
        return creep.isCivilian;
    }

    public static isNpc(creep: Creep): boolean {
        return this.npcNames[creep.owner.username];
    }
}
