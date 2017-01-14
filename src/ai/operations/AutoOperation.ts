
import {Operation} from "./Operation";
import {SeedSelection, SeedData} from "../../interfaces";
import {EmpireClass} from "../Empire";
import {SeedAnalysis} from "../SeedAnalysis";
import {OperationPriority} from "../../config/constants";
import {ScoutMission} from "../missions/ScoutMission";
const MAX_SOURCE_DISTANCE = 100;
const PATHFINDER_RANGE_ALLOWANCE = 20;

export class AutoOperation extends Operation {

    memory: {
        foundSeeds: boolean
        didWalkabout: boolean
        walkaboutProgress: {
            roomsInRange: string[]
            sourceData: {pos: RoomPosition, amount: number}[]
        }
        seedSelection: SeedSelection
        seedData: SeedData
    };

    /**
     * Experimental operation for making decisions about room layout. Eventually this will be a process that happens
     * automatically and the code will be part of a Mission rather than Operation.
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: EmpireClass) {
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
        if (this.memory.seedSelection) return;

        if (!this.memory.seedData) this.memory.seedData = {
            sourceData: undefined,
            seedScan: {},
            seedSelectData: undefined,
        };

        if (this.memory.seedData.sourceData) {
            let analysis = new SeedAnalysis(this.flag.room, this.memory.seedData);
            this.memory.seedSelection = analysis.run();
        }
        else {
            this.memory.didWalkabout = this.doWalkabout();
        }
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

        if (progress.roomsInRange.length > 0) {
            let roomName = progress.roomsInRange[0];
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

        this.memory.seedData.sourceData = progress.sourceData;
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
        let ret = PathFinder.search(source.pos, [{pos: new RoomPosition(25, 25, this.flag.room.name), range: PATHFINDER_RANGE_ALLOWANCE }], {
            maxOps: 10000,
        });
        if (ret.incomplete) {
            console.log("checkReasonablePathDistance return value incomplete");
            return false;
        }
        else {
            return ret.path.length <= MAX_SOURCE_DISTANCE - PATHFINDER_RANGE_ALLOWANCE;
        }
    }

    /**
     * Place flags to show which positions (seeds) are being used for further analysis
     * @param seedType
     * @param show
     * @returns {string}
     */

    debugSeeds(seedType: string, show: boolean) {
        if (show) {
            let flag = Game.flags[`${this.name}_${seedType}_0`];
            if (flag) return `first remove flags: ${this.name}.debugSeeds("${seedType}", false)`;
            if (!this.memory.seedData.seedScan || !this.memory.seedData.seedScan[seedType]) {
                return `there is no data for ${seedType}`;
            }

            for (let i = 0; i < this.memory.seedData.seedScan[seedType].length; i++) {
                let coord = this.memory.seedData.seedScan[seedType][i];
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
}