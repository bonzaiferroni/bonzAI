import {Mission} from "../missions/Mission";
import {SpawnGroup} from "../SpawnGroup";
import {OperationPriority} from "../../config/constants";
import {RoomHelper} from "../RoomHelper";
import {helper} from "../../helpers/helper";
import {TimeoutTracker} from "../../TimeoutTracker";
import {empire} from "../Empire";
import {Scheduler} from "../../Scheduler";
import {Profiler} from "../../Profiler";
import {Notifier} from "../../notifier";
import {Tick} from "../../Tick";

export abstract class Operation {

    public flagName: string;
    public roomName: string;
    public name: string;
    public type: string;
    public pos: RoomPosition;
    public priority: OperationPriority;
    public spawnGroup: SpawnGroup;
    public remoteSpawn: {distance: number, spawnGroup: SpawnGroup};
    public missions: {[roleName: string]: Mission} = {};
    public spawnData: {
        spawnRooms: { distance: number, roomName: string }[];
        nextSpawnCheck: number;
    };
    public memory: any;
    public flag: Flag;
    public room: Room;
    public waypoints: Flag[];
    private sourceIds: string[];
    private mineralId: string;

    public state: OperationState;
    private stateUpdated: number;

    private static priorityOrder = [
        OperationPriority.Emergency,
        OperationPriority.OwnedRoom,
        OperationPriority.VeryHigh,
        OperationPriority.High,
        OperationPriority.Medium,
        OperationPriority.Low,
        OperationPriority.VeryLow,
        ];
    private bypass: boolean;

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

    protected updateState() {
        this.flag = Game.flags[this.flagName];
        if (!this.flag) { return; } // flag must have been pulled
        this.room = Game.rooms[this.roomName];
        this.stateUpdated = Game.time;
        this.bypass = false;

        this.memory = this.flag.memory;
        if (!this.memory.spawnData) { this.memory.spawnData = {}; }
        this.spawnData = this.memory.spawnData;

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
     * Global Phase - Runs on init updateState ticks - initialize operation variables and instantiate missions
     */

    public static init(priorityMap: OperationPriorityMap) {
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }
            for (let opName in operations) {
                let operation = operations[opName];
                try {
                    operation.updateState();
                    operation.init();
                    Mission.init(operation.missions);
                } catch (e) {
                    Notifier.reportException(e, "init", opName);
                    operation.bypass = true;
                }
            }
        }
    }

    protected abstract init();

    /**
     * Init Phase - Runs every tick - initialize operation variables and instantiate missions
     */

    public static refresh(priorityMap: OperationPriorityMap) {

        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                try {
                    if (operation.stateUpdated !== Game.time) {
                        operation.updateState();
                    }
                    if (!operation.flag) {
                        // flag must have been pulled
                        operation.bypass = true;
                        continue;
                    }
                    operation.refresh();
                    Mission.refresh(operation.missions);
                } catch (e) {
                    Notifier.reportException(e, "init", opName);
                    operation.bypass = true;
                }
            }
        }
    }

    protected abstract refresh();

    /**
     * RoleCall Phase - Iterate through missions and call mission.roleCall()
     */

    public static roleCall(priorityMap: OperationPriorityMap) {
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                if (operation.bypass) { continue; }
                Mission.roleCall(operation.missions);
            }
        }
    }

    /**
     * Action Phase - Iterate through missions and call mission.actions()
     */

    public static actions(priorityMap: OperationPriorityMap) {
        for (let priority of this.priorityOrder) {
            let operations = priorityMap[priority];
            if (!operations) { continue; }

            for (let opName in operations) {
                let operation = operations[opName];
                if (operation.bypass) { continue; }
                if (operation.priority > OperationPriority.High && Game.cpu.getUsed() > 320) {
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

    public abstract finalize();

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
    public abstract invalidateCache();

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
        Mission.init({
            [mission.name]: mission,
        });
        this.missions[mission.name] = mission;
    }

    public initRemoteSpawn(roomDistanceLimit: number, levelRequirement: number, margin = 0) {

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
        if (!Scheduler.delay(this.spawnData, "nextSpawnCheck", 10000)) {
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
            } else {
                this.spawnData.nextSpawnCheck = Game.time + 100; // Around 6 min
            }
            console.log(`SPAWN: finding spawn rooms in ${this.name}, result: ${bestGroups.length} found`);
        }

        if (this.spawnData.spawnRooms) {
            let bestAvailability = 0;
            let bestSpawn: {distance: number, roomName: string };
            for (let data of this.spawnData.spawnRooms) {
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

    public findOperationWaypoints() {
        this.waypoints = [];
        for (let i = 0; i < 100; i++) {
            let flag = Game.flags[this.name + "_waypoints_" + i];
            if (flag) {
                this.waypoints.push(flag);
            } else {
                break;
            }
        }
        return this.waypoints;
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

enum OperationPhase { InitGlobal, Init, RoleCall, Actions, Finalize }

export type OperationPriorityMap = {[priority: number]: { [opName: string]: Operation } }
export type OperationMap = {[opName: string]: Operation}
export interface OperationState {
    hasVision: boolean;
    sources: Source[];
    mineral: Mineral;
}
