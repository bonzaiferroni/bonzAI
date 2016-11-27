import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {OperationPriority} from "./constants";
import {helper} from "./helper";

const BUCKET_MAX = 10000;

export class ScoutOperation extends Operation {

    memory: {
        foundSeeds: boolean
        seedScan: {
            indexX: number
            indexY: number
            seedCount: number
        }
        didWalkabout: boolean
        walkaboutProgress: {
            roomsInRange: string[]
            sourceData: {pos: RoomPosition, amount: number}[]
        }
        sourceData: {pos: RoomPosition, amount: number}[]
    };

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    initOperation() {

        if (!this.flag.room) return;
        this.spawnGroup = this.getRemoteSpawnGroup();
        if (!this.spawnGroup) return;

        this.autoLayout();
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }


    private autoLayout() {
        if (!this.memory.foundSeeds) {
            this.memory.foundSeeds = this.findSeeds();
        }

        if (!this.memory.didWalkabout) {
            this.memory.didWalkabout = this.doWalkabout();
        }
    }

    private findSeeds() {
        if (!this.memory.seedScan) {
            this.memory.seedScan = {
                indexX: 7,
                indexY: 7,
                seedCount: 0,
            }
        }

        let seedScan = this.memory.seedScan;

        while (seedScan.indexX <= 42 && Game.cpu.bucket === BUCKET_MAX) {
            while (seedScan.indexY <= 42 && Game.cpu.bucket === BUCKET_MAX) {
                let area = this.flag.room.lookForAtArea(LOOK_TERRAIN,
                    seedScan.indexY - 4, seedScan.indexX - 4, seedScan.indexY + 4, seedScan.indexX + 4) as LookAtResultMatrix;

                let foundSeed = this.checkArea(seedScan.indexX, seedScan.indexY, area);
                if (foundSeed) {
                    let position = new RoomPosition(seedScan.indexX, seedScan.indexY, this.flag.room.name);
                    position.createFlag(`seed${seedScan.seedCount++}`, COLOR_GREY);
                }
                seedScan.indexY++;
            }
            seedScan.indexX++
        }

        if (seedScan.indexX > 42 && seedScan.indexY > 42) {
            console.log(`found ${seedScan.seedCount} seeds`);
            delete this.memory.seedScan;
            return true;
        }
        else {
            return false;
        }
    }

    private checkArea(xOrigin: number, yOrigin: number, area: LookAtResultMatrix) {
        for (let xDelta = -4; xDelta <= 4; xDelta++) {
            for (let yDelta = -4; yDelta <= 4; yDelta++) {
                if (Math.abs(xDelta) + Math.abs(yDelta) > 4) continue;
                if (area[yOrigin + yDelta][xOrigin + xDelta][0] === "wall") {
                    console.log(`x: ${xOrigin} y: ${yOrigin} disqualified due to wall at ${xOrigin + xDelta}, ${yOrigin + yDelta}`);
                    return false;
                }
            }
        }

        return true;
    }

    private doWalkabout(): boolean {
        if (!this.memory.walkaboutProgress) {
            this.memory.walkaboutProgress = {
                roomsInRange: undefined,
                sourceData: [],
            }
        }

        let progress = this.memory.walkaboutProgress;
        if (!progress.roomsInRange) {
            progress.roomsInRange = this.findRoomsToCheck(this.flag.room.name);
        }

        for (let roomName of progress.roomsInRange) {
            if (Game.rooms[roomName]) {
                let sources = Game.rooms[roomName].find<Source>(FIND_SOURCES);
                let sourceData = [];
                let allSourcesReasonable = true;
                for (let source of sources) {
                    let reasonablePathDistance = this.checkReasonablePathDistance(source);
                    if (!reasonablePathDistance) {
                        allSourcesReasonable = false;
                        break;
                    }
                    sourceData.push({pos: source.pos, amount: Math.min(SOURCE_ENERGY_CAPACITY, source.energyCapacity) })
                }
                if (allSourcesReasonable) {
                    progress.sourceData.concat(sourceData);
                }
                _.pull(progress.roomsInRange, roomName);
            }
            else {
                let walkaboutCreep = Game.creeps[this.name + "_walkabout"];
                if (walkaboutCreep) {
                    if (Game.time % 10 === 0) {
                        console.log(`${this.name} walkabout creep is visiting ${roomName}`);
                    }
                    walkaboutCreep.avoidSK({pos: new RoomPosition(25, 25, roomName)});
                }
                else {
                    this.spawnGroup.spawn([MOVE], this.name + "_walkabout", undefined, undefined);
                }
            }
            return false;
        }

        this.memory.walkaboutProgress = undefined;
        this.memory.sourceData = progress.sourceData;
        return true;
    }

    private findRoomsToCheck(origin: string): string[] {
        let roomsToCheck = [origin];
        let roomsAlreadyChecked = [origin];
        let roomsInRange = [];
        while (roomsToCheck.length > 0) {

            let nextRoom = roomsToCheck.pop();
            let inRange = Game.map.getRoomLinearDistance(origin, nextRoom) <= 1;

            if (!inRange) continue;
            roomsInRange.push(nextRoom);

            let exits = Game.map.describeExits(nextRoom);
            for (let direction in exits) {
                let roomName = exits[direction];
                if (_.include(roomsAlreadyChecked, roomName)) continue;
                roomsAlreadyChecked.push(nextRoom);
                if (_.include(roomsToCheck, roomName)) continue;
                roomsToCheck.push(roomName);
            }
        }

        return roomsInRange;
    }

    private checkReasonablePathDistance(source: Source) {
        let ret = PathFinder.search(source.pos, [{pos: new RoomPosition(25, 25, this.flag.room.name), range: 20 }], {
            maxOps: 10000,
        });
        if (ret.incomplete) {
            console.log("checkReasonablePathDistance return value incomplete");
            return false;
        }
        else {
            return ret.path.length <= 80;
        }
    }
}