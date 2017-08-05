import {Traveler} from "../ai/Traveler";
import {WorldMap} from "../ai/WorldMap";
import {HostileAgent} from "../ai/agents/HostileAgent";
import {CreepHelper} from "./CreepHelper";
export class PosHelper {
    public static findClosestByPath<T extends {pos: RoomPosition}>(origin: RoomPosition, destinations: T[],
                                                                   ignoreStructures = true, ignoreSwamps = true,
                                                                   range = 1): T {
        let goals = _.map(destinations, x => {
            return {pos: x.pos, range: range};
        });
        let ret = PathFinder.search(origin, goals, {
            swampCost: ignoreSwamps ? 1 : 5,
            roomCallback: (roomName: string) => {
                if (ignoreStructures) { return; }
                let room = Game.rooms[roomName];
                if (!room) { return; }
                return Traveler.getStructureMatrix(room);
            },
        });

        if (ret.incomplete) { return; }
        let lastPosition = origin;
        if (ret.path.length > 0) {
            lastPosition = _.last(ret.path);
        }
        let closest = _.min(destinations, x => x.pos.getRangeTo(lastPosition));
        if (_.isObject(closest)) { return closest; }
    }

    public static oppositeExit(pos: RoomPosition): RoomPosition {
        if (pos.x === 0) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 1, 0);
            return new RoomPosition(49 - pos.x, pos.y, roomName);
        }
        if (pos.x === 49) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, -1, 0);
            return new RoomPosition(pos.x - 49, pos.y, roomName);
        }
        if (pos.y === 0) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 0, 1);
            return new RoomPosition(pos.x, 49 - pos.y, roomName);
        }
        if (pos.y === 49) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 0, -1);
            return new RoomPosition(pos.x, pos.y - 49, roomName);
        }
    }

    public static creepDamageAtPosition(pos: RoomPosition, ticks = 1): number {
        let hostileAgents = HostileAgent.findInRoom(pos.roomName);
        if (!hostileAgents) {
            return 0;
        }

        let hostileDamage = 0;
        for (let hostileAgent of hostileAgents) {
            let range = pos.getRangeTo(hostileAgent) - ticks;
            if (range < 0) {
                range = 0;
            }
            hostileDamage += hostileAgent.expectedDamageAtRange(range);
        }
        return hostileDamage;
    }

    public static towerDamageAtRange(range: number): number {
        if (range <= TOWER_OPTIMAL_RANGE) { return TOWER_POWER_ATTACK; }
        if (range >= TOWER_FALLOFF_RANGE) { range = TOWER_FALLOFF_RANGE; }
        return TOWER_POWER_ATTACK - (TOWER_POWER_ATTACK * TOWER_FALLOFF *
            (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE));
    }

    public static towerDamageAtPosition(position: RoomPosition): number {
        let room = Game.rooms[position.roomName];
        if (!room) { return; }

        let towers = room.findStructures<StructureTower>(STRUCTURE_TOWER);
        let expectedDamage = 0;
        for (let tower of towers) {
            if (tower.my || tower.energy === 0) { continue; }
            let range = position.getRangeTo(tower);
            expectedDamage += this.towerDamageAtRange(range);
        }
        return expectedDamage;
    }

    public static totalDamageAtPosition(position: RoomPosition, ticks = 1) {
        let towerDamage = this.towerDamageAtPosition(position);
        let creepDamage = this.creepDamageAtPosition(position, ticks);
        return towerDamage + creepDamage;
    }

    public static creepHealingAtPosition(pos: RoomPosition, maxRange = 3, friendly = true): number {
        let totalPotential = 0;
        let room = Game.rooms[pos.roomName];
        if (!room) { return 0; }

        let searchType = FIND_MY_CREEPS;
        if (!friendly) {
            searchType = FIND_HOSTILE_CREEPS;
        }

        for (let creep of room.find<Creep>(searchType)) {
            let range = creep.pos.getRangeTo(pos);
            if (range > maxRange) { continue; }
            let healPotential = 0;
            for (let part of creep.body) {
                if (part.type !== HEAL) { continue; }
                let partPotential = HEAL_POWER;
                if (part.boost) {
                    partPotential *= BOOSTS[HEAL][part.boost][HEAL];
                }
                healPotential += partPotential;
            }
            if (range > 1) {
                healPotential *= RANGED_HEAL_POWER / HEAL_POWER;
            }
            totalPotential += healPotential;
        }

        return totalPotential;
    }

    public static findAreaInjury(pos: RoomPosition, injuryArea = 5, friendly = true): number {
        let totalInjury = 0;
        let room = Game.rooms[pos.roomName];
        if (!room) { return 0; }

        let searchType = FIND_MY_CREEPS;
        if (!friendly) {
            searchType = FIND_HOSTILE_CREEPS;
        }

        for (let creep of room.find<Creep>(searchType)) {
            let range = creep.pos.getRangeTo(pos);
            if (range > injuryArea) { continue; }
            totalInjury += creep.hitsMax - creep.hits;
        }

        return totalInjury;
    }

    public static hasImpassableStructure(pos: RoomPosition): boolean {
        let passableStructures = {
            [STRUCTURE_CONTAINER]: true,
            [STRUCTURE_ROAD]: true,
            [STRUCTURE_RAMPART]: true,
        };

        for (let structure of pos.lookFor<Structure>(LOOK_STRUCTURES)) {
            if (!passableStructures[structure.structureType]) {
                return true;
            }
        }

        return false;
    }

    public static rotateDir(direction: number, rotations: number): number {
        let newDirection = direction + rotations;
        if (newDirection > 8) {
            newDirection -= 8;
        }
        return newDirection;
    }

    public static relativePos(pos: RoomPosition, direction: number, range = 1): RoomPosition {
        let x = pos.x;
        let y = pos.y;
        let room = pos.roomName;

        if (direction === 1) {
            y -= range;
        } else if (direction === 2) {
            y -= range;
            x += range;
        } else if (direction === 3) {
            x += range;
        } else if (direction === 4) {
            x += range;
            y += range;
        } else if (direction === 5) {
            y += range;
        } else if (direction === 6) {
            y += range;
            x -= range;
        } else if (direction === 7) {
            x -= range;
        } else if (direction === 8) {
            x -= range;
            y -= range;
        }
        return new RoomPosition(x, y, room);
    }

    public static isDangerousPos(position: RoomPosition, attacker: Creep, ticks = 1, injuryArea = 5) {
        let healingAtPosition = PosHelper.creepHealingAtPosition(position) * 1.5;
        let areaInjury = PosHelper.findAreaInjury(position, injuryArea) * .5;
        let damageAtPosition = PosHelper.totalDamageAtPosition(position, ticks) * 1.5;
        let attackerShield = CreepHelper.calculateShield(attacker);
        let formationBonus = position.findInRange(FIND_MY_CREEPS, 1).length * 500;
        return damageAtPosition + (areaInjury * 4) > healingAtPosition + attackerShield + formationBonus;
    }
}
