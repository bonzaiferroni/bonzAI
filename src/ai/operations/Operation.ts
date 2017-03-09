import {Empire} from "../Empire";
import {Mission} from "../missions/Mission";
import {SpawnGroup} from "../SpawnGroup";
import {OperationPriority} from "../../config/constants";
import {Profiler} from "../../Profiler";
import {empire} from "../../helpers/loopHelper";
import {RoomHelper} from "../RoomHelper";
import {helper} from "../../helpers/helper";
import {TimeoutTracker} from "../../TimeoutTracker";

export abstract class Operation {

    public flag: Flag;
    public name: string;
    public type: string;
    public room: Room;
    public priority: OperationPriority;
    public hasVision: boolean;
    public sources: Source[];
    public mineral: Mineral;
    public spawnGroup: SpawnGroup;
    public remoteSpawn: {distance: number, spawnGroup: SpawnGroup};
    public missions: {[roleName: string]: Mission} = {};
    public waypoints: Flag[];
    public spawnData: {
        spawnRooms: { distance: number, roomName: string }[];
        nextSpawnCheck: number;
    };
    public memory: any;

    /**
     *
     * @param flag - missions will operate relative to this flag, use the following naming convention:
     * "operationType_operationName"
     * @param name - second part of flag.name, should be unique amont all other operation names (I use city names)
     * @param type - first part of flag.name, used to determine which operation class to instantiate
     */
    constructor(flag: Flag, name: string, type: string) {
        this.flag = flag;
        this.name = name;
        this.type = type;
        this.room = flag.room;
        this.memory = flag.memory;
        if (!this.memory.spawnData) { this.memory.spawnData = {}; }
        this.spawnData = this.memory.spawnData;
        // variables that require vision (null check where appropriate)
        if (this.flag.room) {
            this.hasVision = true;
            this.sources = _.sortBy(flag.room.find<Source>(FIND_SOURCES), (s: Source) => s.pos.getRangeTo(flag));
            this.mineral = _.head(flag.room.find<Mineral>(FIND_MINERALS));
        }
    }

    /**
     * Init Phase - initialize operation variables and instantiate missions
     */
    public init() {
        try {
            TimeoutTracker.log("initOperation", this.name);
            this.initOperation();
        } catch (e) {
            console.log("error caught in initOperation phase, operation:", this.name);
            console.log(e.stack);
        }

        for (let missionName in this.missions) {
            try {
                TimeoutTracker.log("initMission", this.name, missionName);
                Profiler.start("in_m." + missionName.substr(0, 3));
                this.missions[missionName].initMission();
                Profiler.end("in_m." + missionName.substr(0, 3));
            } catch (e) {
                console.log("error caught in initMission phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }
    }
    public abstract initOperation();

    /**
     * RoleCall Phase - Iterate through missions and call mission.roleCall()
     */
    public roleCall() {
        // mission roleCall
        for (let missionName in this.missions) {
            try {
                TimeoutTracker.log("roleCall", this.name, missionName);
                Profiler.start("rc_m." + missionName.substr(0, 3));
                this.missions[missionName].roleCall();
                Profiler.end("rc_m." + missionName.substr(0, 3));
            } catch (e) {
                console.log("error caught in roleCall phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }
    }

    /**
     * Action Phase - Iterate through missions and call mission.missionActions()
     */
    public actions() {
        // mission actions
        for (let missionName in this.missions) {
            try {
                TimeoutTracker.log("actions", this.name, missionName);
                Profiler.start("ac_m." + missionName.substr(0, 3));
                this.missions[missionName].missionActions();
                Profiler.end("ac_m." + missionName.substr(0, 3));
            } catch (e) {
                console.log("error caught in missionActions phase, operation:", this.name, "mission:", missionName,
                    "in missionRoom ", this.flag.pos.roomName);
                console.log(e.stack);
            }
        }
    }

    /**
     * Finalization Phase - Iterate through missions and call mission.finalizeMission(), also call
     * operation.finalizeOperation()
     */
    public finalize() {
        // mission actions
        for (let missionName in this.missions) {
            try {
                TimeoutTracker.log("finalize", this.name, missionName);
                Profiler.start("fi_m." + missionName.substr(0, 3));
                this.missions[missionName].finalizeMission();
                Profiler.end("fi_m." + missionName.substr(0, 3));
            } catch (e) {
                console.log("error caught in finalizeMission phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }

        try {
            TimeoutTracker.log("finalizeOperation", this.name);
            this.finalizeOperation();
            TimeoutTracker.log("post-operation");
        } catch (e) {
            console.log("error caught in finalizeOperation phase, operation:", this.name);
            console.log(e.stack);
        }
    }
    public abstract finalizeOperation();

    /**
     * Invalidate Cache Phase - Occurs every-so-often (see constants.ts) to give you an efficient means of invalidating
     * operation and mission cache
     */
    public invalidateCache() {
        // base rate of 1 proc out of 100 ticks
        if (Math.random() < .01) {
            for (let missionName in this.missions) {
                try {
                    this.missions[missionName].invalidateMissionCache();
                } catch (e) {
                    console.log("error caught in invalidateMissionCache phase, operation:", this.name, "mission:",
                        missionName);
                    console.log(e.stack);
                }
            }

            try {
                this.invalidateOperationCache();
            } catch (e) {
                console.log("error caught in invalidateOperationCache phase, operation:", this.name);
                console.log(e.stack);
            }
        }
    }
    public abstract invalidateOperationCache();

    /**
     * Add mission to operation.missions hash
     * @param mission
     */
    public addMission(mission: Mission) {
        // it is important for every mission belonging to an operation to have
        // a unique name or they will be overwritten here
        this.missions[mission.name] = mission;
    }

    public initRemoteSpawn(roomDistanceLimit: number, levelRequirement: number, margin = 0) {

        // invalidated periodically
        if (!this.spawnData.nextSpawnCheck || Game.time >= this.spawnData.nextSpawnCheck) {
            let spawnGroups = _.filter(_.toArray(empire.spawnGroups),
                spawnGroup => spawnGroup.room.controller.level >= levelRequirement
                && spawnGroup.room.name !== this.flag.pos.roomName);
            let bestGroups = RoomHelper.findClosest(this.flag, spawnGroups,
                {margin: margin, linearDistanceLimit: roomDistanceLimit});

            if (bestGroups.length > 0) {
                bestGroups = _.sortBy(bestGroups, value => value.distance);
                this.spawnData.spawnRooms = _.map(bestGroups, value => {
                    return {distance: value.distance, roomName: value.destination.room.name};
                });
                this.spawnData.nextSpawnCheck = Game.time + helper.randomInterval(10000); // Around 10 hours
            } else {
                this.spawnData.nextSpawnCheck = Game.time + 100; // Around 6 min
            }
            console.log(`SPAWN: finding spawn rooms in ${this.name}, result: ${bestGroups.length} found`);
        }

        if (this.spawnData.spawnRooms) {
            let bestAvailability = 0;
            let bestSpawn: {distance: number, roomName: string };
            for (let data of this.spawnData.spawnRooms) {
                let spawnGroup = empire.getSpawnGroup(data.roomName);
                if (!spawnGroup) { continue; }
                if (spawnGroup.averageAvailability >= 1) {
                    bestSpawn = data;
                    break;
                }
                if (spawnGroup.averageAvailability > bestAvailability) {
                    bestAvailability = spawnGroup.averageAvailability;
                    bestSpawn = data;
                }
            }
            if (bestSpawn) {
                this.remoteSpawn = {distance: bestSpawn.distance, spawnGroup: empire.getSpawnGroup(bestSpawn.roomName)};
            }
        }
    }

    public manualControllerBattery(id: string) {
        let object = Game.getObjectById(id);
        if (!object) { return "that is not a valid game object or not in vision"; }
        this.flag.room.memory.controllerBatteryId = id;
        this.flag.room.memory.upgraderPositions = undefined;
        return "controller battery assigned to" + object;
    }

    protected findOperationWaypoints() {
        this.waypoints = [];
        for (let i = 0; i < 100; i++) {
            let flag = Game.flags[this.name + "_waypoints_" + i];
            if (flag) {
                this.waypoints.push(flag);
            } else {
                break;
            }
        }
    }

    public setMax(missionName: string, max: number) {
        if (!this.memory[missionName]) { return "SPAWN: no " + missionName + " mission in " + this.name; }
        let oldValue = this.memory[missionName].max;
        this.memory[missionName].max = max;
        return "SPAWN: " + missionName + " max spawn value changed from " + oldValue + " to " + max;
    }

    public setBoost(missionName: string, activateBoost: boolean) {
        if (!this.memory[missionName]) { return "SPAWN: no " + missionName + " mission in " + this.name; }
        let oldValue = this.memory[missionName].activateBoost;
        this.memory[missionName].activateBoost = activateBoost;
        return "SPAWN: " + missionName + " boost value changed from " + oldValue + " to " + activateBoost;
    }
}
