import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {OperationPriority} from "./constants";
import {Coord} from "./interfaces";
import {helper} from "./helper";
import {ScoutMission} from "./ScoutMission";

const FULL_BUCKET = 9500;
interface SeedSelection {seedType: string, origin: Coord, rotation: number, energyPerDistance: number}

export class ScoutOperation extends Operation {

    memory: {
        foundSeeds: boolean
        seedScan: {
            [seedType: string]: Coord[]
        }
        didWalkabout: boolean
        walkaboutProgress: {
            roomsInRange: string[]
            sourceData: {pos: RoomPosition, amount: number}[]
        }
        sourceData: {pos: RoomPosition, amount: number}[]
        seedSelectData: {
            index: number
            rotation: number
            best: SeedSelection
        }
        seedSelection: SeedSelection
    };

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    initOperation() {

        this.spawnGroup = this.getRemoteSpawnGroup();
        if (!this.spawnGroup) return;
        this.addMission(new ScoutMission(this));
        if (!this.flag.room) return;

        this.autoLayout();


    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }


    private autoLayout() {
        if (!this.memory.foundSeeds) {
            if (!this.memory.seedScan) this.memory.seedScan = {};
            if (!this.memory.seedScan["quad"]) {
                this.findSeeds("quad");
            }
            else if (!this.memory.seedScan["flex"]) {
                this.findSeeds("flex");
            }
        }

        if (!this.memory.didWalkabout) {
            this.memory.didWalkabout = this.doWalkabout();
        }

        let readyForSelection = this.memory.foundSeeds && this.memory.didWalkabout;
        if (readyForSelection && !this.memory.seedSelection) {
            if (this.memory.seedScan["quad"].length > 0) {
                this.memory.seedSelection = this.selectSeed("quad", this.memory.seedScan["quad"]);
            }
            else if (this.memory.seedScan["flex"].length > 0) {
                this.memory.seedSelection = this.selectSeed("flex", this.memory.seedScan["flex"]);
            }
        }
    }

    private findSeeds(seedType: string) {

        let radius;
        let wallMargin;
        let taper;
        if (seedType === "quad") {
            radius = 6;
            wallMargin = 0;
            taper = 1;
        }
        else if (seedType === "flex") {
            radius = 4;
            wallMargin = 1;
            taper = 4;
        }

        let requiredWallOffset = 2;
        let totalMargin = requiredWallOffset + radius + wallMargin;
        if (!this.memory.seedScan[seedType]) {
            console.log(`AUTO: initiating seed scan: ${seedType}`);
            this.memory.seedScan[seedType] = [];
        }

        let indexX = totalMargin;
        while (indexX <= 49 - totalMargin) {
            let indexY = totalMargin;
            while (indexY <= 49 - totalMargin) {
                let area = this.flag.room.lookForAtArea(LOOK_TERRAIN,
                    indexY - radius, indexX - radius, indexY + radius, indexX + radius) as LookAtResultMatrix;

                let foundSeed = this.checkArea(indexX, indexY, radius, taper, area);
                if (foundSeed) {
                    this.memory.seedScan[seedType].push({x: indexX, y: indexY});
                }
                indexY++;
            }
            indexX++;
        }

        console.log(`found ${this.memory.seedScan[seedType].length} ${seedType} seeds`);
        if (this.memory.seedScan[seedType].length > 0) {
            this.memory.seedScan[seedType] = _.sortBy(this.memory.seedScan[seedType], (c: Coord) => {
                // sort by distance to controller
                return this.flag.room.controller.pos.getRangeTo(new RoomPosition(c.x, c.y, this.flag.room.name));
            });
            this.memory.foundSeeds = true;
        }
    }

    private checkArea(xOrigin: number, yOrigin: number, radius: number, taper: number, area: LookAtResultMatrix) {
        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                if (Math.abs(xDelta) + Math.abs(yDelta) > radius * 2 - taper) continue;
                if (area[yOrigin + yDelta][xOrigin + xDelta][0] === "wall") {
                    console.log(`x: ${xOrigin} y: ${yOrigin} disqualified due to wall at ${xOrigin + xDelta}, ${yOrigin + yDelta}`);
                    return false;
                }
            }
        }

        // check source proximity
        let originPosition = new RoomPosition(xOrigin, yOrigin, this.flag.room.name);
        for (let source of this.flag.room.find<Source>(FIND_SOURCES)) {
            if (originPosition.inRangeTo(source, radius + 2)) {
                return false;
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
                    console.log(`found ${sourceData.length} reasonable sources in ${roomName}`);
                    progress.sourceData = progress.sourceData.concat(sourceData);
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

        this.memory.sourceData = progress.sourceData;
        this.memory.walkaboutProgress = undefined;
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

    debugSeeds(seedType: string, show: boolean) {
        if (show) {
            let flag = Game.flags[`${this.name}_${seedType}_0`];
            if (flag) return `first remove flags: ${this.name}.debugSeeds("${seedType}", false)`;
            if (!this.memory.seedScan || !this.memory.seedScan[seedType]) {
                return `there is no data for ${seedType}`;
            }

            for (let i = 0; i < this.memory.seedScan[seedType].length; i++) {
                let coord = this.memory.seedScan[seedType][i];
                new RoomPosition(coord.x, coord.y, this.flag.room.name).createFlag(`${this.name}_${seedType}_${i}`, COLOR_GREY);
            }
        }
        else {
            for (let i = 0; i < 2500; i++) {
                let flag = Game.flags[`${this.name}_${seedType}_${i}`];
                if (flag) flag.remove();
                else break;
            }
        }
    }

    private selectSeed(seedType: string, seeds: Coord[]): SeedSelection {
        let storageDelta;
        if (seedType === "quad") {
            storageDelta = {x: 0, y: 4}
        }
        else if (seedType === "flex") {
            storageDelta = {x: 0, y: -3}
        }
        else {
            console.log("unrecognized seed type");
            return;
        }

        if (!this.memory.seedSelectData) {
            this.memory.seedSelectData = {
                index: 0,
                rotation: 0,
                best: { seedType: seedType, origin: undefined, rotation: undefined, energyPerDistance: 0 }
            }
        }

        let data = this.memory.seedSelectData;
        if (data.rotation > 3) {
            data.index++;
            data.rotation = 0;
        }

        if (data.index >= seeds.length) {
            if (data.best.origin) {
                console.log(`${this.name} determined best seed, ${data.best.seedType} at ${data.best.origin.x},${data.best.origin.y} with rotation ${data.rotation}`);
                this.memory.seedSelectData = undefined;
                return data.best;
            }
            else {
                console.log(`unable to find suitable seed selection in ${this.name}`);
            }
        }

        let storagePosition = this.coordToPosition(storageDelta, seeds[data.index], data.rotation);
        let energyPerDistance = 0;
        for (let sourceDatum of this.memory.sourceData) {
            let sourcePosition = helper.deserializeRoomPosition(sourceDatum.pos);
            let ret = PathFinder.search(storagePosition, [{pos: sourcePosition, range: 1}], {
                swampCost: 1,
                maxOps: 4000,
            });

            let pathLength = 100;
            if (!ret.incomplete) {
                pathLength = Math.max(ret.path.length, 50);
            }

            energyPerDistance += sourceDatum.amount / pathLength;
        }

        if (energyPerDistance > data.best.energyPerDistance) {
            console.log(`${this.name} found better seed, energyPerDistance: ${energyPerDistance}`);
            data.best = { seedType: seedType, origin: seeds[data.index], rotation: data.rotation,
                energyPerDistance: energyPerDistance}
        }

        // update rotation for next tick
        data.rotation++
    }

    private coordToPosition(coord: Coord, origin: Coord, rotation: number) {
        let xCoord = coord.x;
        let yCoord = coord.y;
        if (rotation === 1) {
            xCoord = -coord.y;
            yCoord = coord.x;
        }
        else if (rotation === 2) {
            xCoord = -coord.y;
            yCoord = -coord.x;
        }
        else if (rotation === 3) {
            xCoord = coord.y;
            yCoord = -coord.x;
        }
        return new RoomPosition(origin.x + xCoord, origin.y + yCoord, this.flag.room.name);
    }
}