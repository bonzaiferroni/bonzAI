import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {notifier} from "../../notifier";
export class ZombieMission extends Mission {

    zombies: Creep[];

    memory: {
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
        if (this.memory.expectedDamage < 2000) {
            max = 1;
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
    }

    invalidateMissionCache() {
    }

    private zombieActions(zombie: Creep) {

        if (zombie.hits < zombie.hitsMax) {
            zombie.heal(zombie);
        }

        if (this.memory.fallback && !zombie.memory.reachedFallback) {
            let fallback = helper.deserializeRoomPosition(this.memory.fallback);
            if (zombie.pos.isNearTo(fallback) || (zombie.room === this.room && zombie.hits === zombie.hitsMax)) {
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
            if (zombie.memory.safeCount < 10 || zombie.room.name !== this.flag.pos.roomName) {
                return;
            }
        }

        if (zombie.hits < zombie.hitsMax - 500) {
            zombie.memory.reachedFallback = false;
        }

        let destination: {pos: RoomPosition} = this.flag;
        if (!zombie.memory.retreat) {
            if (zombie.pos.roomName === this.flag.pos.roomName) {
                let closestSpawn = zombie.pos.findClosestByRange<Structure>(
                    this.room.findStructures<Structure>(STRUCTURE_SPAWN));
                if (closestSpawn) {
                    destination = closestSpawn;
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

        let matrix = new PathFinder.CostMatrix();
        let towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);
        if (towers.length === 0) {
            this.memory.expectedDamage = 0;
            notifier.add(`ZOMBIE: init zombie at ${this.room.name}, expectedDamage: 0`);
            return matrix.serialize();
        }

        let exitPositions: RoomPosition[] = [];
        for (let x = 0; x < 50; x += 49) {
            for (let y = 0; y < 50; y++) {
                if (Game.map.getTerrainAt(x, y, this.room.name) === "wall") { continue; }
                exitPositions.push(new RoomPosition(x, y, this.room.name));
                matrix.set(x, y, 0xff);
            }
        }
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y += 49) {
                if (Game.map.getTerrainAt(x, y, this.room.name) === "wall") { continue; }
                exitPositions.push(new RoomPosition(x, y, this.room.name));
                matrix.set(x, y, 0xff);
            }
        }

        let bestExit = _(exitPositions)
            .sortBy((p: RoomPosition) => -_.sum(towers, (t: Structure) => p.getRangeTo(t)))
            .head();
        matrix.set(bestExit.x, bestExit.y, 1);

        let expectedDamage = 0;
        for (let tower of towers) {
            let range = bestExit.getRangeTo(tower);
            expectedDamage += helper.towerDamageAtRange(range);
        }
        this.memory.expectedDamage = expectedDamage / 2;
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

        notifier.add(`ZOMBIE: init zombie at ${this.room.name}, expectedDamage: ${this.memory.expectedDamage}, bestExit: ${bestExit}`);
        return matrix.serialize();
    }

    getBody = (): string[] => {

        if (this.memory.expectedDamage === 0) {
            return this.workerBody(10, 0, 10);
        }
        if (this.memory.expectedDamage <= 360) {
            let healCount = Math.ceil(this.memory.expectedDamage / 12);
            let dismantleCount = 40 - healCount;
            return this.configBody({[WORK]: dismantleCount, [MOVE]: 10, [HEAL]: healCount })
        }
        if (this.memory.expectedDamage <= 1000) {
            let healCount = Math.ceil((this.memory.expectedDamage * .3) / 12);
            let dismantleCount = 35 - healCount;
            return this.configBody({[TOUGH]: 5, [WORK]: dismantleCount, [MOVE]: 10,  [HEAL]: healCount});
        }
        if (this.memory.expectedDamage <= 2000) {
            let healCount = Math.ceil((this.memory.expectedDamage * .3) / (12 * 4));
            let dismantleCount = 30 - healCount;
            return this.configBody({[TOUGH]: 10, [WORK]: dismantleCount, [MOVE]: 10, [HEAL]: healCount})
        }
    };

    getBoosts(): string[] {
        if (this.memory.expectedDamage <= 360) {
            return;
        }
        if (this.memory.expectedDamage <= 1000) {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
        }
        else {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID];
        }
    }
}