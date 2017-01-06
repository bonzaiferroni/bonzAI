import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {notifier} from "../../notifier";
export class ZombieMission extends Mission {

    zombies: Creep[];

    memory: {
        status: string;
        matrix: number[];
        expectedDamage: number;
        prespawn: number;
        bestExit: RoomPosition;
        fallback: RoomPosition;
    };

    constructor(operation: Operation) {
        super(operation, "zombie");
    }

    initMission() {
        if (!this.memory.matrix) {
            this.memory.matrix = this.findMatrix();
        }
    }

    roleCall() {
        let max = 0;
        if (this.memory.status === "attack") {
            max = 2;
        }

        this.zombies = this.headCount("zombie", this.getBody, max, {
                memory: {boosts: this.getBoosts(), safeCount: 0},
                prespawn: this.memory.prespawn,
                skipMoveToRoom: true,
                blindSpawn: true});

    }

    missionActions() {
        for (let zombie of this.zombies) {
            this.zombieActions(zombie);
        }
    }

    finalizeMission() {

        if (this.memory.status === "remove" || (this.room && this.room.controller.safeMode)) {
            notifier.add(`ZOMBIE: removing ${this.opName}. safemode: ${this.room && this.room.controller.safeMode}`);
            this.flag.remove();
        }
    }

    invalidateMissionCache() {
    }

    private zombieActions(zombie: Creep) {

        if (zombie.hits < zombie.hitsMax) {
            zombie.heal(zombie);
        }

        if (this.memory.fallback && !zombie.memory.reachedFallback) {
            let fallback = helper.deserializeRoomPosition(this.memory.fallback);
            if (zombie.pos.isNearTo(fallback) && zombie.hits === zombie.hitsMax) {
                if (!zombie.memory.prespawn) {
                    zombie.memory.prespawn = true;
                    this.memory.prespawn = 1500 - zombie.ticksToLive;
                }
                zombie.memory.reachedFallback = true;
            }
            this.empire.travelTo(zombie, {pos: fallback});
            return;
        }

        if (zombie.pos.isNearExit(0)) {
            if (zombie.hits > zombie.hitsMax - 500) {zombie.memory.safeCount++; }
            else {zombie.memory.safeCount = 0;}
            if (zombie.memory.safeCount < 10) {
                return;
            }
        }
        else {
            zombie.memory.safeCount = 0;
        }

        let threshold = 500;
        if (this.memory.expectedDamage > 240) {
            threshold = 250;
        }
        if (zombie.hits < zombie.hitsMax - threshold) {
            zombie.memory.reachedFallback = false;
        }

        let destination: {pos: RoomPosition} = this.flag;
        if (!zombie.memory.retreat) {
            if (zombie.pos.roomName === this.flag.pos.roomName) {
                let closestSpawn = zombie.pos.findClosestByRange<Structure>(
                    this.room.findStructures<Structure>(STRUCTURE_SPAWN));
                if (closestSpawn) {
                    destination = closestSpawn;
                    if (zombie.hits === zombie.hitsMax && zombie.pos.isNearTo(closestSpawn)) {
                        // zombie.dismantle(closestSpawn);
                    }
                }
                else {
                    notifier.add(`ZOMBIE: mission complete in ${this.room.name}`);
                    this.memory.status = "remove";
                }
            }
        }

        let position = this.moveZombie(zombie, destination, zombie.memory.demolishing);
        zombie.memory.demolishing = false;
        if (zombie.hits === zombie.hitsMax && position instanceof RoomPosition &&
            zombie.room == this.room && !zombie.pos.isNearExit(0)) {
            let structure = position.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure && structure.structureType !== STRUCTURE_CONTAINER && structure.structureType !== STRUCTURE_ROAD) {
                zombie.memory.demolishing = true;
                zombie.dismantle(structure)
            }
        }
    }

    private moveZombie(zombie: Creep, destination: {pos: RoomPosition}, ignoreStuck): number | RoomPosition {
        let roomCallback = (roomName: string) => {
            if (roomName === this.flag.pos.roomName) {
                let matrix = PathFinder.CostMatrix.deserialize(this.memory.matrix);
                for (let zombie of this.zombies) {
                    if (zombie.room === this.room && !zombie.pos.isNearExit(0)) {
                        matrix.set(zombie.pos.x, zombie.pos.y, 0xff);
                    }
                }
                return matrix;
            }
        };

        return this.empire.travelTo(zombie, destination, {
            ignoreStuck: ignoreStuck,
            returnPosition: true,
            roomCallback: roomCallback,
        })
    }

    private findMatrix(): number[] {
        if (!this.hasVision) {
            let observer = this.spawnGroup.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (!observer) { return; }
            observer.observeRoom(this.flag.pos.roomName);
            return;
        }

        let spawns = this.room.findStructures<StructureSpawn>(STRUCTURE_SPAWN);
        if (spawns.length === 0) {
            this.memory.status = "remove";
            return;
        }

        let matrix = new PathFinder.CostMatrix();
        let towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);
        if (towers.length === 0) {
            this.memory.status = "attack";
            this.memory.expectedDamage = 0;
            this.memory.fallback = spawns[0].pos;
            notifier.add(`ZOMBIE: init zombie at ${this.room.name}, expectedDamage: 0`);
            return matrix.serialize();
        }

        let bestExit;
        let ret = PathFinder.search(this.spawnGroup.pos, {pos: spawns[0].pos, range: 1}, {
            roomCallback: (roomName: string): CostMatrix | boolean => {
                if (roomName !== this.room.name && this.empire.memory.hostileRooms[roomName]) { return false; }
                let room = Game.rooms[roomName];
                if (room) { return room.defaultMatrix; }
            }
        });
        if (!ret.incomplete) {
            console.log(`found path!`);
            bestExit = _.find(ret.path, (p: RoomPosition) => p.roomName === this.room.name);
        }

        let allowedExits = {};
        let exitData = Game.map.describeExits(this.room.name);
        for (let direction in exitData) {
            let roomName = exitData[direction];
            let allowedRooms = this.empire.findAllowedRooms(this.spawnGroup.pos.roomName, roomName);
            if (allowedRooms && Object.keys(allowedRooms).length <= 8) {
                allowedExits[direction] = true;
            }
        }

        if (Object.keys(allowedExits).length === 0) {
            this.memory.status = "remove";
            return;
        }

        let exitPositions: RoomPosition[] = [];
        for (let x = 0; x < 50; x ++) {
            for (let y = 0; y < 50; y++) {
                if (x !== 0 && y !== 0 && x !== 49 && y !== 49) { continue; }
                if (Game.map.getTerrainAt(x, y, this.room.name) === "wall") { continue; }
                matrix.set(x, y, 0xff);
                if (bestExit) { continue; }
                if (allowedExits["1"] && y === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["3"] && x === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["5"] && y === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["7"] && x === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
            }
        }

        if (!bestExit) {
            bestExit = _(exitPositions)
                .sortBy((p: RoomPosition) => -_.sum(towers, (t: Structure) => p.getRangeTo(t)))
                .head();
        }
        matrix.set(bestExit.x, bestExit.y, 1);

        let walls = this.room.findStructures<Structure>(STRUCTURE_WALL)
            .concat(this.room.findStructures<Structure>(STRUCTURE_RAMPART));
        if (walls.length > 0) {
            let highestHits = _(walls).sortBy("hits").last().hits;
            for (let wall of walls) {
                matrix.set(wall.pos.x, wall.pos.y, Math.ceil(wall.hits * 10 / highestHits) * 10)
            }
        }

        let expectedDamage = 0;
        for (let tower of towers) {
            let range = bestExit.getRangeTo(tower);
            expectedDamage += helper.towerDamageAtRange(range);
        }
        expectedDamage /= 2;

        if (expectedDamage > 1600) {
            this.memory.status = "upgrade";
            return;
        }

        this.memory.expectedDamage = expectedDamage;
        this.memory.bestExit = bestExit;

        if (this.room.storage) {
            matrix.set(this.room.storage.pos.x, this.room.storage.pos.y, 0xff);
        }

        if (this.room.terminal) {
            matrix.set(this.room.terminal.pos.x, this.room.terminal.pos.y, 0xff);
        }

        let fallback = _.clone(bestExit);
        if (fallback.x === 0) {
            fallback.x = 48;
            fallback.roomName = helper.findRelativeRoomName(fallback.roomName, -1, 0);
        }
        else if (fallback.x === 49) {
            fallback.x = 1;
            fallback.roomName = helper.findRelativeRoomName(fallback.roomName, 1, 0);
        }
        else if (fallback.y === 0) {
            fallback.y = 48;
            fallback.roomName = helper.findRelativeRoomName(fallback.roomName, 0, -1);
        }
        else {
            fallback.y = 1;
            fallback.roomName = helper.findRelativeRoomName(fallback.roomName, 0, 1);
        }
        this.memory.fallback = fallback;

        helper.showMatrix(matrix);
        this.memory.status = "attack";
        notifier.add(`ZOMBIE: init zombie at ${this.room.name}, expectedDamage: ${this.memory.expectedDamage}, bestExit: ${bestExit}`);
        return matrix.serialize();
    }

    getBody = (): string[] => {
        if (this.memory.expectedDamage === 0) {
            return this.workerBody(10, 0, 10);
        }
        if (this.memory.expectedDamage <= 240) {
            let healCount = Math.ceil(this.memory.expectedDamage / HEAL_POWER);
            let moveCount = 17; // move once every other tick
            let dismantleCount = MAX_CREEP_SIZE - healCount - moveCount;
            return this.configBody({[WORK]: dismantleCount, [MOVE]: 17, [HEAL]: healCount })
        }
        if (this.memory.expectedDamage <= 600) {
            let healCount = Math.ceil((this.memory.expectedDamage * .3) / HEAL_POWER); // boosting tough
            let dismantleCount = 28 - healCount;
            return this.configBody({[TOUGH]: 5, [WORK]: dismantleCount, [MOVE]: 17,  [HEAL]: healCount});
        }
        if (this.memory.expectedDamage <= 1600) {
            let healCount = Math.ceil((this.memory.expectedDamage * .3) / (HEAL_POWER * 4)); // boosting heal and tough
            let dismantleCount = 30 - healCount;
            return this.configBody({[TOUGH]: 10, [WORK]: dismantleCount, [MOVE]: 10, [HEAL]: healCount})
        }
    };

    getBoosts(): string[] {
        if (this.memory.expectedDamage <= 240) {
            return;
        }
        if (this.memory.expectedDamage <= 600) {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
        }
        else {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID];
        }
    }
}