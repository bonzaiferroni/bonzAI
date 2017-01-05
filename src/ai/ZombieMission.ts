import {Mission} from "./missions/Mission";
import {Operation} from "./operations/Operation";
import {helper} from "../helpers/helper";
import {notifier} from "../notifier";
export class ZombieMission extends Mission {

    zombies: Creep[];

    memory: {
        matrix: number[];
        expectedDamage: number;
        prespawn: number;
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

        if (!zombie.memory.enteredRoom) {
            zombie.memory.enteredRoom = zombie.room.name === this.flag.pos.roomName
            this.memory.prespawn = 1500 - zombie.ticksToLive;
        }

        if (zombie.memory.enteredRoom && zombie.pos.isNearExit(0)) {
            if (zombie.hits > zombie.hitsMax - 500) {
                zombie.memory.safeCount++;
            }
            else {
                zombie.memory.safeCount = 0;
            }
            if (zombie.memory.safeCount < 10 || zombie.room.name === this.flag.pos.roomName) {
                return;
            }
        }

        let destination: {pos: RoomPosition} = this.flag;
        if (zombie.hits > zombie.hitsMax - Math.min(this.memory.expectedDamage, 500)) {
            if (zombie.pos.roomName === this.flag.pos.roomName) {
                let closestSpawn = zombie.pos.findClosestByRange<Structure>(
                    this.room.findStructures<Structure>(STRUCTURE_SPAWN));
                if (closestSpawn) {
                    destination = closestSpawn;
                }
            }
        }
        else {
            destination = this.spawnGroup;
        }
        this.moveZombie(zombie, destination)
    }

    private moveZombie(zombie: Creep, destination: {pos: RoomPosition}): number | RoomPosition {
        let roomCallback = (roomName: string) => {
            if (roomName === this.flag.pos.roomName) {
                let matrix = PathFinder.CostMatrix.deserialize(this.memory.matrix);
                return matrix;
            }
        };

        return this.empire.travelTo(zombie, destination, {
            ignoreStuck: true,
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
                if (Game.map.getTerrainAt(x, y, this.room.name) == "wall") { continue; }
                exitPositions.push(new RoomPosition(x, y, this.room.name));
                matrix.set(x, y, 250);
            }
        }
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y += 49) {
                if (Game.map.getTerrainAt(x, y, this.room.name) == "wall") { continue; }
                exitPositions.push(new RoomPosition(x, y, this.room.name));
                matrix.set(x, y, 250);
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
        notifier.add(`ZOMBIE: init zombie at ${this.room.name}, expectedDamage: ${this.memory.expectedDamage}, bestExit: ${bestExit}`);
        return matrix.serialize();
    }

    getBody = (): string[] => {

        if (this.memory.expectedDamage === 0) {
            return this.workerBody(10, 0, 10);
        }
        if (this.memory.expectedDamage <= 360) {
            let healCount = Math.ceil(this.memory.expectedDamage / 12);
            let dismantleCount = 37 - healCount;
            return this.configBody({[MOVE]: 13, [WORK]: dismantleCount, [HEAL]: healCount })
        }
        if (this.memory.expectedDamage <= 1000) {
            let healCount = Math.ceil((this.memory.expectedDamage * .3) / 12);
            let dismantleCount = 32 - healCount;
            return this.configBody({[TOUGH]: 5, [MOVE]: 13, [WORK]: dismantleCount, [HEAL]: healCount});
        }
        if (this.memory.expectedDamage <= 2000) {
            return this.configBody({[TOUGH]: 10, [MOVE]: 10, [WORK]: 15, [HEAL]: 15})
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