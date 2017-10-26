import {Traveler} from "../Traveler/Traveler";
import {WorldMap} from "../ai/WorldMap";
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
                return Traveler.getStructureMatrix(roomName);
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
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, -1, 0);
            return new RoomPosition(49 - pos.x, pos.y, roomName);
        }
        if (pos.x === 49) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 1, 0);
            return new RoomPosition(pos.x - 49, pos.y, roomName);
        }
        if (pos.y === 0) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 0, -1);
            return new RoomPosition(pos.x, 49 - pos.y, roomName);
        }
        if (pos.y === 49) {
            let roomName = WorldMap.findRelativeRoomName(pos.roomName, 0, 1);
            return new RoomPosition(pos.x, pos.y - 49, roomName);
        }
    }

    public static creepDamageAtPosition(pos: RoomPosition, ticks = 1): number {
        let room = Game.rooms[pos.roomName];
        if (!room) {
            return 0;
        }

        let hostileDamage = 0;
        for (let hostile of room.hostiles) {
            let range = pos.getRangeTo(hostile) - ticks;
            if (range < 0) {
                range = 0;
            }
            hostileDamage += CreepHelper.expectedDamageAtRange(hostile, range);
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
            let healPotential = CreepHelper.getPotential(creep, HEAL);
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
        let attackerShield = CreepHelper.shield(attacker).hits;
        let formationBonus = position.findInRange(FIND_MY_CREEPS, 1).length * 500;
        return damageAtPosition + (areaInjury * 4) > healingAtPosition + attackerShield + formationBonus;
    }

    public static pathablePosition(roomName: string): RoomPosition {
        for (let radius = 0; radius < 20; radius++) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    if (Math.abs(yDelta) !== radius && Math.abs(xDelta) !== radius) {
                        continue;
                    }
                    let x = 25 + xDelta;
                    let y = 25 + yDelta;
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") {
                        return new RoomPosition(x, y, roomName);
                    }
                }
            }
        }
    }

    public static findTerrainInRange(position: RoomPosition, terrainType: string, range: number): RoomPosition[] {
        let positions = [];
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            let x = position.x + xDelta;
            if (x < 0 || x > 49) { continue; }
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                let y = position.y + yDelta;
                if (y < 0 || y > 49) { continue; }
                let lookPos = new RoomPosition(x, y, position.roomName);
                if (lookPos.lookFor(LOOK_TERRAIN)[0] !== terrainType) { continue; }

                positions.push(lookPos);
            }
        }
        return positions;
    }
}
