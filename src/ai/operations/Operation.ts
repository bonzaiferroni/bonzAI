import {Empire} from "../Empire";
import {Mission} from "../missions/Mission";
import {SpawnGroup} from "../SpawnGroup";
import {OperationPriority} from "../../config/constants";
import {profiler} from "../../profiler";

export abstract class Operation {
    flag: Flag;
    name: string;
    type: string;
    empire: Empire;
    memory: any;
    priority: OperationPriority;
    hasVision: boolean;
    sources: Source[];
    mineral: Mineral;
    spawnGroup: SpawnGroup;
    missions: {[roleName: string]: Mission};
    waypoints: Flag[];

    /**
     *
     * @param flag - missions will operate relative to this flag, use the following naming convention: "operationType_operationName"
     * @param name - second part of flag.name, should be unique amont all other operation names (I use city names)
     * @param type - first part of flag.name, used to determine which operation class to instantiate
     * @param empire - object used for empire-scoped behavior (terminal transmission, etc.)
     */
    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        this.flag = flag;
        this.name = name;
        this.type = type;
        Object.defineProperty(this, "empire", { enumerable: false, value: empire });
        Object.defineProperty(this, "memory", { enumerable: false, value: flag.memory });
        if (!this.missions) { this.missions = {}; }
        // variables that require vision (null check where appropriate)
        if (this.flag.room) {
            this.hasVision = true;
            this.sources = _.sortBy(this.flag.room.find<Source>(FIND_SOURCES), (s: Source) => s.pos.getRangeTo(this.flag));
            this.mineral = _.head(this.flag.room.find<Mineral>(FIND_MINERALS));
        }
    }

    /**
     * Init Phase - initialize operation variables and instantiate missions
     */
    init() {
        try {
            this.initOperation();
        }
        catch (e) {
            console.log("error caught in initOperation phase, operation:", this.name);
            console.log(e.stack);
        }

        for (let missionName in this.missions) {
            try {
                this.missions[missionName].initMission();
            }
            catch (e) {
                console.log("error caught in initMission phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }
    }
    abstract initOperation();

    /**
     * RoleCall Phase - Iterate through missions and call mission.roleCall()
     */
    roleCall() {
        // mission roleCall
        for (let missionName in this.missions) {
            try {
                this.missions[missionName].roleCall();
            }
            catch (e) {
                console.log("error caught in roleCall phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }
    }

    /**
     * Action Phase - Iterate through missions and call mission.missionActions()
     */
    actions() {
        // mission actions
        for (let missionName in this.missions) {
            try {
                this.missions[missionName].missionActions();
            }
            catch (e) {
                console.log("error caught in missionActions phase, operation:", this.name, "mission:", missionName, "in room ", this.flag.pos.roomName);
                console.log(e.stack);
            }
        }
    }

    /**
     * Finalization Phase - Iterate through missions and call mission.finalizeMission(), also call operation.finalizeOperation()
     */
    finalize() {
        // mission actions
        for (let missionName in this.missions) {
            try {
                this.missions[missionName].finalizeMission();
            }
            catch (e) {
                console.log("error caught in finalizeMission phase, operation:", this.name, "mission:", missionName);
                console.log(e.stack);
            }
        }

        try {
            this.finalizeOperation();
        }
        catch (e) {
            console.log("error caught in finalizeOperation phase, operation:", this.name);
            console.log(e.stack);
        }
    }
    abstract finalizeOperation();

    /**
     * Invalidate Cache Phase - Occurs every-so-often (see constants.ts) to give you an efficient means of invalidating operation and
     * mission cache
     */
    invalidateCache() {
        // base rate of 1 proc out of 100 ticks
        if (Math.random() < .01) {
            for (let missionName in this.missions) {
                try {
                    this.missions[missionName].invalidateMissionCache();
                }
                catch (e) {
                    console.log("error caught in invalidateMissionCache phase, operation:", this.name, "mission:", missionName);
                    console.log(e.stack);
                }
            }

            try {
                this.invalidateOperationCache();
            }
            catch (e) {
                console.log("error caught in invalidateOperationCache phase, operation:", this.name);
                console.log(e.stack);
            }
        }
    }
    abstract invalidateOperationCache();

    /**
     * Add mission to operation.missions hash
     * @param mission
     */
    addMission(mission: Mission) {
        // it is important for every mission belonging to an operation to have
        // a unique name or they will be overwritten here
        this.missions[mission.getName()] = mission;
    }

    getRemoteSpawnGroup(distanceLimit = 4, levelRequirement = 1): SpawnGroup {
        // invalidated periodically
        if (!this.memory.spawnRooms) {
            let closestRoomRange = Number.MAX_VALUE;
            let roomNames = [];
            for (let roomName of Object.keys(this.empire.spawnGroups)) {
                let roomLinearDistance = Game.map.getRoomLinearDistance(this.flag.pos.roomName, roomName);
                if (roomLinearDistance === 0) continue;
                if (roomLinearDistance > distanceLimit || roomLinearDistance > closestRoomRange) continue;
                let spawnGroup = this.empire.spawnGroups[roomName];
                if (spawnGroup.room.controller.level < levelRequirement) continue;
                let distance = this.empire.roomTravelDistance(this.flag.pos.roomName, roomName);
                if (distance < closestRoomRange) {
                    closestRoomRange = distance;
                    roomNames = [roomName];
                }
                else if (distance === closestRoomRange) {
                    roomNames.push(roomName);
                }
            }
            console.log(`SPAWN: finding spawn rooms in ${this.name}, ${roomNames}`);
            this.memory.spawnRooms = roomNames;
        }

        let spawnRoom = _(this.memory.spawnRooms as string[]).sortBy((roomName: string) => {
            let spawnGroup = this.empire.getSpawnGroup(roomName);
            if (spawnGroup) {
                return spawnGroup.averageAvailability;
            }
            else {
                _.pull(this.memory.spawnRooms, roomName);
            }
        }).last();

        return this.empire.getSpawnGroup(spawnRoom);
    }

    manualControllerBattery(id: string) {
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
            }
            else {
                break;
            }
        }
    }

    setSpawnRoom(roomName: string | Operation, portalTravel = false) {

        if (roomName instanceof Operation) {
            roomName = roomName.flag.room.name;
        }

        if (!this.empire.getSpawnGroup(roomName)) {
            return "SPAWN: that room doesn't appear to host a valid spawnGroup";
        }

        if (!this.waypoints || !this.waypoints[0]) {
            if (portalTravel) {
                return "SPAWN: please set up waypoints before setting spawn room with portal travel";
            }
        }
        else {
            this.waypoints[0].memory.portalTravel = portalTravel;
        }

        this.memory.spawnRoom = roomName;
        _.each(this.missions, (mission) => mission.invalidateSpawnDistance());
        return "SPAWN: spawnRoom for " + this.name + " set to " + roomName + " (map range: " +
            Game.map.getRoomLinearDistance(this.flag.pos.roomName, roomName) + ")";
    }

    setMax(missionName: string, max: number) {
        if (!this.memory[missionName]) return "SPAWN: no " + missionName + " mission in " + this.name;
        let oldValue = this.memory[missionName].max;
        this.memory[missionName].max = max;
        return "SPAWN: " + missionName + " max spawn value changed from " + oldValue + " to " + max;
    }

    setBoost(missionName: string, activateBoost: boolean) {
        if (!this.memory[missionName]) return "SPAWN: no " + missionName + " mission in " + this.name;
        let oldValue = this.memory[missionName].activateBoost;
        this.memory[missionName].activateBoost = activateBoost;
        return "SPAWN: " + missionName + " boost value changed from " + oldValue + " to " + activateBoost;
    }

    repair(id: string, hits: number) {
        if (!id || !hits) return "usage: opName.repair(id, hits)";
        if (!this.memory.mason) return "no mason available for repair instructions";
        let object = Game.getObjectById(id);
        if (!object) return "that object doesn't seem to exist";
        if (!(object instanceof Structure)) return "that isn't a structure";
        if (hits > object.hitsMax) return object.structureType + " cannot have more than " + object.hitsMax + " hits";
        this.memory.mason.manualTargetId = id;
        this.memory.mason.manualTargetHits = hits;
        return "MASON: repairing " + object.structureType + " to " + hits + " hits";
    }
}