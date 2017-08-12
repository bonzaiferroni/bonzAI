import {Mission} from "../missions/Mission";
import {SpawnGroup} from "../SpawnGroup";
import {OperationPriority} from "../../config/constants";
import {RoomHelper} from "../../helpers/RoomHelper";
import {helper} from "../../helpers/helper";
import {TimeoutTracker} from "../../TimeoutTracker";
import {empire} from "../Empire";
import {Scheduler} from "../../Scheduler";
import {Profiler} from "../../Profiler";
import {Notifier} from "../../notifier";
import {Tick} from "../../Tick";
import {PowerMission} from "../missions/PowerMission";

export interface OperationState {
    hasVision?: boolean;
    sources?: Source[];
    mineral?: Mineral;
    waypoints?: Flag[];
}

export interface OperationMemory {
    spawnData?: {
        spawnRooms: { distance: number, roomName: string }[];
        nextSpawnCheck: number;
    };
    sleepUntil?: {[missionName: string]: number };
}

export abstract class Operation {

    public flagName: string;
    public roomName: string;
    public name: string;
    public type: string;
    public pos: RoomPosition;
    public priority: OperationPriority;
    public spawnGroup: SpawnGroup;
    public remoteSpawn: {distance: number, spawnGroup: SpawnGroup};
    public missions: {[missionName: string]: Mission} = {};
    public sleepingMissions: {[missionName: string]: Mission} = {};
    public memory: OperationMemory;
    public flag: Flag;
    public room: Room;
    private sourceIds: string[];
    private mineralId: string;

    public state: OperationState;
    private stateTick: number;
    private bypass: boolean;

    private static priorityOrder = [
        OperationPriority.Emergency,
        OperationPriority.OwnedRoom,
        OperationPriority.VeryHigh,
        OperationPriority.High,
        OperationPriority.Medium,
        OperationPriority.Low,
        OperationPriority.VeryLow,
        ];

    /**
     *
     * @param flag - missions will operate relative to this flag, use the following naming convention:
     * "operationType_operationName"
     * @param name - second part of flag.name, should be unique amont all other operation names (I use city names)
     * @param type - first part of flag.name, used to determine which operation class to instantiate
     */
    constructor(flag: Flag, name: string, type: string) {
        this.flagName = flag.name;
        this.roomName = flag.pos.roomName;
        this.name = name;
        this.type = type;
        this.pos = flag.pos;
    }

    protected initState() {
        if (this.stateTick === Game.time) { return; }
        this.stateTick = Game.time;

        this.flag = Game.flags[this.flagName];
        if (!this.flag) { return; } // flag must have been pulled
        this.room = Game.rooms[this.roomName];
        this.bypass = false;
        this.memory = this.flag.memory;
        if (!this.memory.spawnData) { this.memory.spawnData = {} as any; }
        if (!this.memory.sleepUntil) { this.memory.sleepUntil = {}; }

        // find state
        this.state = {} as OperationState;

        if (this.room) {
            this.state.hasVision = true;
            if (!this.sourceIds) {
                this.sourceIds = _(this.room.find<Source>(FIND_SOURCES))
                    .sortBy(x => x.id)
                    .map(x => x.id)
                    .value();
            }
            this.state.sources = _.map(this.sourceIds, x => Game.getObjectById<Source>(x));
            if (!this.mineralId) {
                this.mineralId = _(this.room.find<Mineral>(FIND_MINERALS))
                    .map(x => x.id)
                    .head();
            }
            this.state.mineral = Game.getObjectById<Mineral>(this.mineralId);
        } else {
            this.state.hasVision = false;
        }
    }

    /**
     * Global Phase - Runs on init initState ticks - initialize operation variables and instantiate missions
     */

    public static init(priorityMap: OperationPriorityMap) {

        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }
            for (let opName in operations) {

                // init operation
                let operation = operations[opName];
                operation.baseInit();
            }
        }
    }

    public baseInit() {
        try {
            this.initState();
            this.init();

            // init missions
            for (let missionName in this.missions) {
                let mission = this.missions[missionName];
                mission.baseInit();
            }
        } catch (e) {
            Notifier.reportException(e, "init", this.name);
        }
    }

    protected abstract init();

    /**
     * Init Phase - Runs every tick - initialize operation variables and instantiate missions
     */

    public static update(priorityMap: OperationPriorityMap) {

        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                try {
                    operation.initState();

                    if (!operation.flag) {
                        // flag was pulled
                        delete priorityMap[priority][opName];
                        continue;
                    }
                    // Profiler.start("upd.o." + operation.type.substr(0, 3));
                    operation.update();
                    operation.wakeMissions();

                    Mission.update(operation.missions);
                    // Profiler.end("upd.o." + operation.type.substr(0, 3));

                } catch (e) {
                    Notifier.reportException(e, "update", opName);
                    operation.bypass = true;
                }
            }
        }
    }

    protected abstract update();

    /**
     * RoleCall Phase - Iterate through missions and call mission.roleCall()
     */

    public static roleCall(priorityMap: OperationPriorityMap) {
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                Mission.roleCall(operation.missions);
            }
        }
    }

    /**
     * Action Phase - Iterate through missions and call mission.actions()
     */

    public static actions(priorityMap: OperationPriorityMap) {
        let cpuLimit = 450;
        if (Memory.playerConfig.cpuLimit) {
            cpuLimit = Memory.playerConfig.cpuLimit;
        }
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];

                // this avoids timeouts due to GC events and other spikes. Set this number lower to be more conservative
                if (operation.priority > OperationPriority.VeryHigh && Game.cpu.getUsed() > cpuLimit) {
                    operation.bypassActions();
                    operation.bypass = true;
                    Tick.cache.bypassCount++;
                    continue;
                }
                Mission.actions(operation.missions);
            }
        }
    }

    /**
     * Finalization Phase - Cleanup and run tasks that need to be executed after all other tasks
     */

    public static finalize(priorityMap: OperationPriorityMap) {
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                if (operation.bypass) { continue; }
                try {
                    operation.finalize();
                    Mission.finalize(operation.missions);
                } catch (e) {
                    Notifier.reportException(e, "finalize", opName);
                    operation.bypass = true;
                }
            }
        }
    }

    protected abstract finalize();

    /**
     * Invalidate Cache Phase - Occurs every-so-often (see constants.ts) to give you an efficient means of invalidating
     * operation and mission cache
     */

    public static invalidateCache(priorityMap: OperationPriorityMap) {
        if (Math.random() > .01) { return; }

        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                if (operation.bypass) { continue; }
                try {
                    operation.invalidateCache();
                    Mission.invalidateCache(operation.missions);
                } catch (e) {
                    Notifier.reportException(e, "invalidate", opName);
                }
            }
        }
    }
    protected abstract invalidateCache();

    /**
     * Add mission to operation.missions hash
     * @param mission
     */
    public addMission(mission: Mission) {
        // it is important for every mission belonging to an operation to have
        // a unique name or they will be overwritten here
        this.missions[mission.name] = mission;
    }

    /**
     * Used by other missions to add mission to the opreation - must still be called in init phase
     * @param mission
     */
    public addMissionLate(mission: Mission) {
        mission.baseInit();
        this.missions[mission.name] = mission;
    }

    public removeMission(mission: Mission) {
        delete this.missions[mission.name];
    }

    public sleepMission(mission: Mission, sleepForTicks: number, randomInterval = true) {
        delete this.missions[mission.name];
        this.sleepingMissions[mission.name] = mission;
        if (randomInterval) {
            this.memory.sleepUntil[mission.name] = Game.time + helper.randomInterval(sleepForTicks);
        } else {
            this.memory.sleepUntil[mission.name] = Game.time + sleepForTicks;
        }
    }

    private wakeMissions() {
        for (let missionName in this.sleepingMissions) {
            if (Game.time < this.memory.sleepUntil[missionName]) { continue; }
            let mission = this.sleepingMissions[missionName];
            delete this.sleepingMissions[missionName];
            delete this.memory.sleepUntil[missionName];
            if (!mission) { continue; }
            this.addMissionLate(mission);
        }
    }

    protected bypassActions() {
    }

    public updateRemoteSpawn(roomDistanceLimit: number, levelRequirement: number, margin = 0, ignoreAvailability = false) {

        let flag = Game.flags[`${this.name}_spawn`];
        if (flag) {
            let estimatedDistance = Game.map.getRoomLinearDistance(this.flag.pos.roomName, flag.pos.roomName) * 50;
            let spawnGroup = empire.spawnGroups[flag.pos.roomName];
            if (spawnGroup) {
                this.remoteSpawn = { distance: estimatedDistance, spawnGroup: spawnGroup};
                return;
            }
        }

        // invalidated periodically
        if (!Scheduler.delay(this.memory.spawnData, "nextSpawnCheck", 10000)) {
            let spawnGroups = _.filter(_.toArray(empire.spawnGroups),
                spawnGroup => spawnGroup.room.controller.level >= levelRequirement
                && spawnGroup.room.name !== this.flag.pos.roomName);
            let bestGroups = RoomHelper.findClosest(this.flag, spawnGroups,
                {margin: margin, linearDistanceLimit: roomDistanceLimit});

            if (bestGroups.length > 0) {
                bestGroups = _.sortBy(bestGroups, value => value.distance);
                this.memory.spawnData.spawnRooms = _.map(bestGroups, value => {
                    return {distance: value.distance, roomName: value.destination.room.name};
                });
            } else {
                this.memory.spawnData.nextSpawnCheck = Game.time + 100; // Around 6 min
            }
            console.log(`SPAWN: finding spawn rooms in ${this.name}, result: ${bestGroups.length} found`);
        }

        if (this.memory.spawnData.spawnRooms) {
            let bestAvailability = 0;
            let bestSpawn: {distance: number, roomName: string };
            for (let data of this.memory.spawnData.spawnRooms) {
                let spawnGroup = empire.spawnGroups[data.roomName];
                if (!spawnGroup) { continue; }
                if (spawnGroup.averageAvailability >= 1) {
                    bestSpawn = data;
                    break;
                }
                if (spawnGroup.averageAvailability >= bestAvailability) {
                    bestAvailability = spawnGroup.averageAvailability;
                    bestSpawn = data;
                }
            }
            if (bestSpawn) {
                this.remoteSpawn = {distance: bestSpawn.distance, spawnGroup: empire.spawnGroups[bestSpawn.roomName]};
            }
        }
    }

    protected assignRemoteSpawn(): boolean {
        if (this.remoteSpawn && this.remoteSpawn.spawnGroup) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
            return true;
        } else {
            console.log(`OPERATION: unable to find spawnGroup for ${this.type} in ${this.roomName}`);
            return false;
        }
    }

    public getRemoteSpawn() {
        if (this.remoteSpawn && this.remoteSpawn.spawnGroup) {
            return this.remoteSpawn.spawnGroup;
        }
    }

    public findOperationWaypoints() {
        if (this.state.waypoints) {
            return this.state.waypoints;
        }

        let waypoints = [];
        for (let i = 0; i < 100; i++) {
            let flag = Game.flags[this.name + "_waypoints_" + i];
            if (flag) {
                waypoints.push(flag);
            } else {
                break;
            }
        }

        this.state.waypoints = waypoints;
        return waypoints;
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

    public wipeMemory() {
        for (let propertyName in this.memory) {
            delete this.memory[propertyName];
        }
    }
}

enum OperationPhase { InitGlobal, Init, RoleCall, Actions, Finalize }

export type OperationPriorityMap = {[priority: number]: { [opName: string]: Operation } }
export type OperationMap = {[opName: string]: Operation}
