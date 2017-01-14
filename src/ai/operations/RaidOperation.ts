import {Operation} from "./Operation";
import {FireflyMission} from "../missions/FireflyMission";
import {WreckerMission} from "../missions/WreckerMission";
import {BrawlerMission} from "../missions/BrawlerMission";
import {RaidMission} from "../missions/RaidMission";
import {RaidData, SquadConfig, Coord} from "../../interfaces";
import {EmpireClass} from "../Empire";
import {OperationPriority, Direction} from "../../config/constants";
import {SpawnGroup} from "../SpawnGroup";
import {helper} from "../../helpers/helper";
export class RaidOperation extends Operation {

    squadTypes = {
        firefly: FireflyMission,
        wreck: WreckerMission,
        brawler: BrawlerMission,
    };

    squadNames = ["alfa", "bravo", "charlie"];
    raidMissions: RaidMission[] = [];
    raidData: RaidData;

    memory: {
        auto: true;
        squadCount: number;
        squadConfig: {[squadName: string]: SquadConfig };
        queue: {[squadName: string]: SquadConfig };
        allowSpawn: boolean;
        maxSquads: number;
        waveComplete: boolean;
        spawnSync: boolean;
        raidComplete: boolean;
        fallback: boolean;
        defaultBoostLevel: number;
        defaultSquad: string;
        additionalRooms: string[];
        tickLastActive: number;
        saveValues: boolean;
        attackRoomName: string;
        fallbackRoomName: string;
        manualTargetIds: string[];
        placeFlags: {[flagName: string]: RoomPosition}
    };

    constructor(flag: Flag, name: string, type: string, empire: EmpireClass) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.VeryHigh;
    }

    initOperation() {
        this.flagPlacement();
        this.checkNewPlacement();
        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
        this.raidData = this.generateRaidData();
        if (!this.raidData) return;

        let spawnGroups = this.findSpawnGroups();

        let squadCount = this.memory.squadCount;
        if (!squadCount) squadCount = 0;

        for (let i = 0; i < squadCount; i++) {
            let name = this.squadNames[i];
            let config = this.memory.squadConfig[name] as SquadConfig;
            let spawnGroup = spawnGroups[i % spawnGroups.length];
            let allowSpawn = i < this.memory.maxSquads && this.memory.allowSpawn;
            let missionClass = this.squadTypes[config.type];
            let mission = new missionClass(this, name, this.raidData, spawnGroup, config.boostLevel, allowSpawn);
            this.raidMissions.push(mission);
            this.addMission(mission);
        }
    }

    finalizeOperation() {

        if (!this.raidData) return;

        let spawnCount = 0;
        for (let mission of this.raidMissions) {
            if (mission.spawned) {
                spawnCount++;
            }
            else {
                if (this.memory.queue[mission.name]) {
                    this.memory.squadConfig[mission.name] = this.memory.queue[mission.name];
                    let config = this.memory.squadConfig[mission.name] as SquadConfig;
                    console.log("RAID: updating", mission.name, "to be of type", config.type,
                        "with boostLevel", config.boostLevel);
                    delete this.memory.queue[mission.name];
                }
            }
        }

        this.memory.squadCount = Math.max(this.memory.maxSquads, spawnCount);

        if (!this.memory.waveComplete && spawnCount >= this.memory.maxSquads) {
            this.memory.waveComplete = true;
        }
        if (this.memory.waveComplete && spawnCount === 0) {
            this.memory.waveComplete = false;
        }

        this.memory.allowSpawn = (!this.memory.spawnSync || !this.memory.waveComplete) && !this.memory.raidComplete;

        let attackRoom = this.raidData.breachFlags[0].room;
        if (attackRoom && attackRoom.controller && attackRoom.controller.safeMode) {
            this.memory.raidComplete = true;
            this.memory.fallback = true;
        }
    }

    invalidateOperationCache() {
    }

    private findBreachFlags(): Flag[] {
        if (this.raidData && this.raidData.breachFlags) {
            return this.raidData.breachFlags;
        }

        let breachFlags = [];
        for (let i = 0; i < 20; i++) {
            let flag = Game.flags[this.name + "_breach_" + i];
            if (flag) {
                breachFlags.push(flag);
            }
            else {
                break;
            }
        }
        return breachFlags;
    }

    private generateRaidData(): RaidData {
        if (!this.memory.queue) this.memory.queue = {};
        if (!this.memory.squadConfig) this.memory.squadConfig = {};

        let breachFlags = this.findBreachFlags();
        let fallback = Game.flags[this.name + "_fallback"];

        if (breachFlags.length === 0 || !fallback) {
            if (Game.time % 3 === 0) {
                console.log("RAID: please set breach flags (ex: " + this.name + "_breach_0, etc.) and fallback (ex: "
                    + this.name + "_fallback)");
            }
            if (this.memory.auto) {
                let completed = this.automateParams();
                if (!completed) return;
            }
            else {
                return;
            }
        }

        if (this.memory.defaultBoostLevel === undefined) {
            if (Game.time % 3 === 0) {
                console.log("RAID: please set a default boostLevel, ex: " + this.name + ".setDefaultBoostLevel(2)");
            }
            return;
        }

        if (this.memory.maxSquads === undefined) {
            if (Game.time % 3 === 0) {
                console.log("RAID: please set a default number of squads, 0 to stop spawning, ex: " + this.name + ".setMaxSquads(1)");
            }
            return;
        }

        if (this.memory.defaultSquad === undefined) {
            if (Game.time % 3 === 0) {
                console.log("RAID: please set a default squad type, ex: " + this.name + ".setDefaultType(\"wreck\")");
            }
            return;
        }

        // init squadConfig
        for (let i = 0; i < this.memory.maxSquads; i++) {
            let name = this.squadNames[i];
            if (!this.memory.squadConfig[name]) this.memory.squadConfig[name] = {
                type: this.memory.defaultSquad,
                boostLevel: this.memory.defaultBoostLevel
            };
        }

        return {
            raidCreeps: [],
            obstacles: [],
            injuredCreeps: undefined,
            breachFlags: breachFlags,
            attackRoom: breachFlags[0].room,
            breachStructures: this.findBreachStructure(breachFlags),
            targetStructures: this.findTargetStructures(breachFlags[0].room),
            fallback: this.memory.fallback,
            fallbackFlag: fallback,
        };
    }

    private findSpawnGroups(): SpawnGroup[] {

        if (!this.memory.additionalRooms) this.memory.additionalRooms = [];
        let spawnGroups = [this.spawnGroup];
        for (let roomName of this.memory.additionalRooms) {
            let spawnGroup = this.empire.getSpawnGroup(roomName);
            if (!spawnGroup) continue;
            spawnGroups.push(spawnGroup);
        }
        return spawnGroups;
    }

    private checkNewPlacement() {
        if (!this.memory.tickLastActive) this.memory.tickLastActive = Game.time;
        if (!this.memory.saveValues && Game.time - this.memory.tickLastActive > 100) {
            console.log("RAID: new flag placement detected, resetting raid values");
            this.resetRaid();
        }
        this.memory.tickLastActive = Game.time;
    }

    private resetRaid() {
        for (let property in this.memory) {
            if (!this.memory.hasOwnProperty(property)) continue;
            delete this.memory[property];
        }
    }

    private findAttackDirection(attackRoomCoords: RoomCoord, fallbackRoomCoords: RoomCoord): Direction {
        let directionLetter;
        if (attackRoomCoords.x < fallbackRoomCoords.x) directionLetter = attackRoomCoords.xDir;
        else if (attackRoomCoords.x > fallbackRoomCoords.x) directionLetter = helper.negaDirection(attackRoomCoords.xDir);
        else if (attackRoomCoords.y < fallbackRoomCoords.y) directionLetter = attackRoomCoords.yDir;
        else if (attackRoomCoords.y > fallbackRoomCoords.y) directionLetter = helper.negaDirection(attackRoomCoords.yDir);

        if (directionLetter === "N") return Direction.North;
        else if (directionLetter === "E") return Direction.East;
        else if (directionLetter === "S") return Direction.South;
        else return Direction.West;
    }

    resetPositions(attackPos: RoomPosition, fallbackPos: RoomPosition) {
        let attackCoords = helper.getRoomCoordinates(attackPos.roomName);
        let fallbackCoords = helper.getRoomCoordinates(fallbackPos.roomName);

        let attackDirection = this.findAttackDirection(attackCoords, fallbackCoords);

        let alfaAttackPos = attackPos.getPositionAtDirection(helper.clampDirection(attackDirection - 1));
        let alfaHealPos = alfaAttackPos.getPositionAtDirection(helper.clampDirection(attackDirection - 2));
        let bravoAttackPos = attackPos.getPositionAtDirection(helper.clampDirection(attackDirection + 1));
        let bravoHealPos = bravoAttackPos.getPositionAtDirection(helper.clampDirection(attackDirection + 2));
        let charlieAttackPos = attackPos.getPositionAtDirection(attackDirection);
        let charlieHealPos = charlieAttackPos.getPositionAtDirection(attackDirection);

        let runNextTick = false;
        // alfa flags
        let alfaAttackFlag = Game.flags[this.name + "_alfaAttack"];
        if (!alfaAttackFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_alfaAttack", COLOR_BLUE, COLOR_RED);
        }
        else {
            alfaAttackFlag.setPosition(alfaAttackPos);
        }

        let alfaHealFlag = Game.flags[this.name + "_alfaHeal"];
        if (!alfaHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_alfaHeal", COLOR_BLUE, COLOR_GREEN);
        }
        else {
            alfaHealFlag.setPosition(alfaHealPos);
        }

        // bravo flags
        let bravoAttackFlag = Game.flags[this.name + "_bravoAttack"];
        if (!bravoAttackFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_bravoAttack", COLOR_YELLOW, COLOR_RED);
        }
        else {
            bravoAttackFlag.setPosition(bravoAttackPos);
        }

        let bravoHealFlag = Game.flags[this.name + "_bravoHeal"];
        if (!bravoHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_bravoHeal", COLOR_YELLOW, COLOR_GREEN);
        }
        else {
            bravoHealFlag.setPosition(bravoHealPos);
        }

        // charlie flags
        let charlieAttackFlag = Game.flags[this.name + "_charlieAttack"];
        if (!charlieAttackFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_charlieAttack", COLOR_BROWN, COLOR_RED);
        }
        else {
            charlieAttackFlag.setPosition(charlieAttackPos);
        }

        let charlieHealFlag = Game.flags[this.name + "_charlieHeal"];
        if (!charlieHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_charlieHeal", COLOR_BROWN, COLOR_GREEN);
        }
        else {
            charlieHealFlag.setPosition(charlieHealPos);
        }

        if (runNextTick) {
            this.memory.attackRoomName = undefined;
        }
    }

    private findBreachStructure(breachFlags: Flag[]): Structure[] {
        let breachStructures: Structure[] = [];

        for (let flag of breachFlags) {
            if (!flag.room) continue;
            let structure = flag.pos.lookForStructure(STRUCTURE_ROAD);
            if (!structure) {
                structure = flag.pos.lookForStructure(STRUCTURE_RAMPART);
            }
            if (structure) {
                breachStructures.push(structure);
            }
        }

        return breachStructures;
    }

    setMaxSquads(max: number) {
        let oldValue = this.memory.maxSquads;
        this.memory.maxSquads = max;
        return "RAID: changing number of active squads from " + oldValue + " to " + max;
    }

    queueSquad(name: string, type: string, boostlLevel?: number) {
        if (name === "a") {
            name = "alpha";
        }
        else if (name === "b") {
            name = "bravo";
        }
        else if (name === "c") {
            name = "charlie";
        }

        if (!type || !_.includes(Object.keys(this.squadTypes), type)) {
            return "invalid squad type";
        }
        let config = { type: type, boostLevel: boostlLevel };
        if (boostlLevel === undefined) {
            if (this.memory.defaultBoostLevel === undefined) {
                return "no boostLevel given or defaultBoostLevel set";
            }
            config.boostLevel = this.memory.defaultBoostLevel;
        }
        this.memory.queue[name] = config;
        return "the next " + name + " squad will be a " + config.type + " with boostLevel " + config.boostLevel;
    }

    setDefaultType(squadType: string) {
        if (!_.includes(Object.keys(this.squadTypes), squadType)) return "RAID: ERROR, invalid squad type";
        let oldValue = this.memory.defaultSquad;
        this.memory.defaultSquad = squadType;
        return "RAID: changing default squad from " + oldValue + " to " + squadType;
    }

    setDefaultBoostLevel(level: number) {
        if (level >= 0 && level <= 4) {
            let oldValue = this.memory.defaultBoostLevel;
            this.memory.defaultBoostLevel = level;
            return "RAID: changed from " + oldValue + " to " + level;
        }
        else {
            return "RAID: ERROR, " + level + " is invalid as a boostLevel";
        }
    }

    resetFlags() {
        let breachFlag = Game.flags[this.name + "_breach_0"];
        let fallbackFlag = Game.flags[this.name + "_fallback"];
        if (breachFlag && fallbackFlag) {
            this.resetPositions(breachFlag.pos, fallbackFlag.pos);
        }
    }

    addRoomName(roomName: string) {
        if (!this.memory.additionalRooms) this.memory.additionalRooms = [];
        if (_.includes(this.memory.additionalRooms, roomName)) {
            return "RAID: that missionRoom is already being used";
        }
        else {
            this.memory.additionalRooms.push(roomName);
            return "RAID: additional rooms being used for spawning: " + this.memory.additionalRooms;
        }
    }

    removeRoomName(roomName: string) {
        if (_.includes(this.memory.additionalRooms, roomName)) {
            return "RAID: that missionRoom is already being used";
        }
        else {
            this.memory.additionalRooms = _.pull(this.memory.additionalRooms, roomName);
            return "RAID: removing " + roomName + ", current list: " + this.memory.additionalRooms;
        }
    }

    private findTargetStructures(attackRoom: Room): Structure[] {
        if (!attackRoom) {
            return;
        }

        if (!this.memory.manualTargetIds) this.memory.manualTargetIds = [];
        let manualTargets = [];
        for (let i = 0; i < 10; i++) {
            let flag = Game.flags[this.name + "_targets_" + i];
            if (!flag || !flag.room) continue;
            let structure = _.filter(flag.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType !== STRUCTURE_ROAD)[0] as Structure;
            if (!structure) flag.remove();
            manualTargets.push(structure);
        }
        if (manualTargets.length > 0) {
            return manualTargets;
        }

        let attackOrder = _.get(this, "memory.attackOrder",
            [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TERMINAL, STRUCTURE_STORAGE, STRUCTURE_NUKER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_OBSERVER]
        );

        let nonRamparted = [];
        for (let structureType of attackOrder) {
            nonRamparted = nonRamparted.concat(_.filter(attackRoom.findStructures(structureType), (s: Structure) => s.pos.lookForStructure(STRUCTURE_RAMPART) === undefined));
        }

        if (nonRamparted.length > 0) {
            return nonRamparted;
        }

        for (let structureType of attackOrder) {
            let structures = attackRoom.findStructures(structureType) as Structure[];
            if (structures.length > 0) {
                return structures;
            }
        }

        // if we made it this far, all structures have been eliminated
        this.memory.raidComplete = true;
    }

    reportStatus() {
        console.log("__________RAID STATUS__________");
        console.log("active squads:");
        // let activeSquads: RaidSquad[] = this.memory.squads.active;
        // for (let squad of activeSquads) {
        //    console.log(squad.name.toUpperCase() + ":", squad.type + " (" + squad.boostLevel + ")",
        //        "spawnRoom:", squad.spawnRoomName, "spawned:", squad.spawned, "alive:", squad.alive);
        // }
    }

    waypointProgress(index?: number) {
        for (let missionName in this.missions) {
            let mission = this.missions[missionName];
            if (mission["healer"]) {
                mission["healer"].memory.waypointsCovered = false;
                if (index !== undefined) {
                    mission["healer"].memory.waypointIndex = index;
                }
            }
        }
    }

    preset(presetName: string) {
        if (presetName === "danger") {
            console.log(this.queueSquad("bravo", "firefly", 2));
            console.log(this.setDefaultBoostLevel(2));
            console.log(this.setMaxSquads(3));
            console.log(this.setDefaultType("brawler"));
            return "spawning a raid that can deal with attacks from behind";
        }
        else if (presetName === "cosmo") {
            console.log(this.queueSquad("alfa", "brawler", 2));
            console.log(this.queueSquad("bravo", "firefly", 2));
            console.log(this.queueSquad("charlie", "wreck", 2));
            console.log(this.setDefaultBoostLevel(2));
            console.log(this.setMaxSquads(3));
            console.log(this.setDefaultType("brawler"));
            return "spawning a raid that is a good balance between damage rate and defense";
        }
    }

    copyWaypoints(from: string, to: string) {
        for (let i = 0; i < 100; i++) {
            let flag = Game.flags[`${from}_waypoints_${i}`];
            if (flag) {

            }
        }
    }

    addRoom(roomName: string) {
        if (roomName === "clear") {
            this.memory.additionalRooms = undefined;
        }
        else {
            if (!this.memory.additionalRooms) this.memory.additionalRooms = [];
            let spawnGroup = this.empire.getSpawnGroup(roomName);
            if (spawnGroup) {
                return this.memory.additionalRooms.push(roomName);
            }
            else {
                return "not an owned missionRoom";
            }
        }
    }

    private automateParams():boolean {
        if (!this.memory.attackRoomName) {
            console.log(`RAID: ${this.name} automation incomplete, no attackRoom specified`);
            return false;
        }

        let observer = this.flag.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
        if (!observer) {
            console.log(`RAID: ${this.name} automation incomplete, no observer`);
            return false;
        }

        observer.observeRoom(this.memory.attackRoomName, "raid", true);
        if (!observer.observation || observer.observation.room.name !== this.memory.attackRoomName) {
            console.log(`RAID: ${this.name} automation incomplete, observation not loaded`);
            return false;
        }

        let completed = this.placeFlags();
        if (!completed) return false;
    }

    private placeFlags(): boolean {
        let attackRoom = Game.rooms[this.memory.attackRoomName];
        let destination: Structure = attackRoom.storage;
        if (!destination) {
            destination = attackRoom.find<StructureSpawn>(FIND_HOSTILE_SPAWNS)[0];
        }
        if (!destination) {
            console.log(`RAID: ${this.name} automation incomplete, no suitable structure to attack`);
            return false;
        }

        let ret = this.empire.findTravelPath(this.spawnGroup, destination, {ignoreStructures: true});
        if (ret.incomplete) {
            console.log(`RAID: ${this.name} automation incomplete, incomplete path to attackRoom`);
            return false;
        }

        let stagingPosition;
        for (let i = 0; i < ret.path.length; i++) {
            let position = ret.path[i];
            if (position.isNearExit(0)) continue;
            if (position.roomName === this.memory.attackRoomName) {
                stagingPosition = position;
                for (let j = i; j >= 0; j--) {
                    position = ret.path[j];
                    if (position.isNearExit(1)) continue;
                    if (position.roomName !== this.memory.attackRoomName) {
                        this.placeRaidFlag(position, `${this.name}_fallback`, COLOR_GREY);
                        break;
                    }
                }
                break;
            }
        }

        let complete = this.placeBreachFlags(stagingPosition, destination, attackRoom);
        if (!complete) return;

        this.setDefaultBoostLevel(0);
        this.setMaxSquads(1);
        this.setDefaultType("brawler");
    }

    private placeBreachFlags(stagingPosition: RoomPosition, destination: Structure, attackRoom: Room): boolean {
        let callback = (roomName: string): CostMatrix => {
            if (roomName !== attackRoom.name) return;
            let matrix = new PathFinder.CostMatrix();
            let walls: Structure[] = [];
            walls.concat(attackRoom.findStructures<StructureWall>(STRUCTURE_WALL));
            walls.concat(attackRoom.findStructures<StructureRampart>(STRUCTURE_RAMPART));
            let maxHits = 0;
            for (let wall of walls) { if (wall.hits > maxHits) { maxHits = wall.hits; } }
            for (let wall of walls) {
                let cost = Math.ceil((wall.hits / wall.hitsMax) * 10);
                matrix.set(wall.pos.x, wall.pos.y, cost);
            }
            return matrix;
        };
        let ret = PathFinder.search(stagingPosition, {pos: destination.pos, range: 1}, {
            maxRooms: 1,
            roomCallback: callback,
        });

        if (ret.incomplete) {
            console.log(`RAID: ${this.name} automation incomplete, path incomplete for placing breach flags`);
            return false;
        }

        let count = 0;
        for (let position of ret.path) {
            if (position.lookForStructure(STRUCTURE_WALL) || position.lookForStructure(STRUCTURE_RAMPART)) {
                this.placeRaidFlag(position, `${this.name}_breach_${count}`, COLOR_GREY);
                count++;
            }
        }

        if (count === 0) {
            for (let position of ret.path) {
                if (position.isNearExit(1)) continue;
                console.log(`RAID: no walls found in ${this.name}, placing empty breach position`);
                position.createFlag(`${this.name}_breach_${count}`);
                break;
            }
        }

        return true;
    }

    placeRaidFlag(pos: RoomPosition, name: string, color = COLOR_WHITE) {
        let flag = Game.flags[name];
        if (flag) {
            console.log(`RAID: moving flag to position: ${name}`);
            flag.setPosition(pos);
            return;
        }
        let room = Game.rooms[pos.roomName];
        if (room) {
            pos.createFlag(name, color);
            return;
        }
        else {
            this.flag.pos.createFlag(name, color);
            this.memory.placeFlags[name] = pos;
        }
    }

    private flagPlacement() {
        if (!this.memory.placeFlags) {
            this.memory.placeFlags = {};
        }

        for (let flagName in this.memory.placeFlags) {
            let position = helper.deserializeRoomPosition(this.memory.placeFlags[flagName]);
            let flag = Game.flags[flagName];
            flag.setPosition(position);
            delete this.memory.placeFlags[flagName];
        }
    }
}