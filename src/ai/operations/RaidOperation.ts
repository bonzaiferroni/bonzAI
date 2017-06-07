import {Operation, OperationMemory} from "./Operation";
import {FireflyMission} from "../missions/FireflyMission";
import {WreckerMission} from "../missions/WreckerMission";
import {BrawlerMission} from "../missions/BrawlerMission";
import {LongbowMission} from "../missions/LongbowMission";
import {RaidMission} from "../missions/RaidMission";
import {RaidData, SquadConfig} from "../../interfaces";
import {OperationPriority, Direction, RAID_CREEP_MATRIX_COST} from "../../config/constants";
import {SpawnGroup} from "../SpawnGroup";
import {helper} from "../../helpers/helper";
import {WorldMap} from "../WorldMap";
import {empire} from "../Empire";
import {HostileAgent} from "../agents/HostileAgent";
import {Traveler} from "../Traveler";
import {Notifier} from "../../notifier";
import {Viz} from "../../helpers/Viz";

interface RaidMemory extends OperationMemory {
    squadsPresentLastTick: number;
    manual: boolean;
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
    fallbackRoomName: string;
    attackRoomIndex: number;
    pretending: boolean;
    waveDelay: number;
    nextWave: number;
    standGround: boolean;
    killCreeps: boolean;
    signText: string;
    serialMatrix: number[];
    nextMatrixRefresh: number;
    nextNuke: number;
    braveMode: boolean;
    cache: any;
    gather: number;
    freespawn: boolean;
}

/**
 * Primary tool for raiding. See wiki for details: https://github.com/bonzaiferroni/bonzAI/wiki/Using-RaidOperation
 */

export class RaidOperation extends Operation {

    private squadTypes = {
        firefly: FireflyMission,
        wreck: WreckerMission,
        brawler: BrawlerMission,
        longbow: LongbowMission,
    };

    private squadNames = ["alfa", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
    private raidData: RaidData;
    private attackRoomCount: number;
    // having static variables allows multiple raids to share this data
    private static structureMatrix: {[roomName: string]: CostMatrix} = {};
    private static structureMatrixTick: number;
    private static orderedObservation: boolean;
    private cache: any;

    public memory: RaidMemory;
    private raidMissions: { [missionName: string]: RaidMission };

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.VeryHigh;
    }

    public init() {
        if (!this.memory.cache) { this.memory.cache = {}; }
    }

    public update() {
        this.cache = {};
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);
        this.raidData = this.generateRaidData();
        if (!this.raidData) { return; }

        let spawnGroups = this.findSpawnGroups();

        let squadCount = this.memory.squadCount;
        if (!squadCount) { squadCount = 0; }

        let missions: {[missionName: string]: RaidMission} = {};

        for (let i = 0; i < squadCount; i++) {
            let name = this.squadNames[i];
            let config = this.memory.squadConfig[name] as SquadConfig;
            let spawnGroup = spawnGroups[i % spawnGroups.length];
            let allowSpawn = i < this.memory.maxSquads && this.memory.allowSpawn;

            let missionClass = this.squadTypes[config.type];
            let mission = new missionClass(this, name, this.raidData, spawnGroup, config.boostLevel,
                allowSpawn) as RaidMission;

            mission.baseInit();
            missions[name] = mission;
        }

        this.missions = missions as any;
        this.raidMissions = missions;
    }

    public finalize() {

        if (!this.raidData) { return; }

        let spawnCount = 0;
        for (let missionName in this.missions) {
            let mission = this.raidMissions[missionName];
            if (mission.findSpawnedStatus()) {
                spawnCount++;
            } else {
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
        this.memory.squadsPresentLastTick = this.raidData.squadsPresent;

        this.updateWaveCompleteStatus(spawnCount);
        this.updateBugout();

        this.memory.allowSpawn = (!this.memory.spawnSync || !this.memory.waveComplete) && !this.memory.raidComplete;

        let attackRoom = this.raidData.attackRoom;
        if (attackRoom && attackRoom.controller && attackRoom.controller.safeMode) {
            this.memory.raidComplete = true;
            this.memory.fallback = true;
        }
    }

    public invalidateCache() {
    }

    public nextRoom() {
        this.memory.attackRoomIndex++;
    }

    /**
     * Look for flags that follow the pattern "opName_flagType_index"
     * examples: myRaid_attack_0, myRaid_attack_1 to bootstrap two attack rooms
     * @param flagType
     * @returns {Array}
     */
    private findRaidFlags(flagType: string): Flag[] {
        let flags = [];
        for (let i = 0; i < 20; i++) {
            let flag = Game.flags[`${this.name}_${flagType}_${i}`];
            if (flag) {
                flags.push(flag);
            }
        }
        return flags;
    }

    private generateRaidData(): RaidData {
        if (!this.memory.queue) { this.memory.queue = {}; }
        if (!this.memory.squadConfig) { this.memory.squadConfig = {}; }

        let attackFlags = this.findRaidFlags("attack");
        let fallbackFlags = this.findRaidFlags("fallback");

        if (attackFlags.length === 0) {
            if (this.memory.manual) {
                if (Game.time % 3 === 0) {
                    console.log(`RAID: please set attack flags (ex: ${this.name}_attack_0, etc.) and fallback (ex: ${
                        this.name}_fallback_0)`);
                }
                return;
            }

            console.log(`RAID: please set attack flags (ex: ${
                this.name}_attack_0, etc.) in the rooms you wish to attack`);
            return;
        }

        let globalConfigComplete = this.initGlobalConfig();
        if (!globalConfigComplete) { return; }

        // initState squadConfig
        for (let i = 0; i < this.memory.maxSquads; i++) {
            let name = this.squadNames[i];
            if (!this.memory.squadConfig[name]) { this.memory.squadConfig[name] = {
                type: this.memory.defaultSquad,
                boostLevel: this.memory.defaultBoostLevel,
            }; }
        }

        for (let index = 0; index < attackFlags.length; index++) {
            let flag = attackFlags[index];
            let completed = this.automateParams(flag.pos.roomName, index);
            if (!completed) {
                if (Game.time % 3 !== 0) { return; }
                console.log(`RAID: please wait while flags are being placed`);
                return;
            }
        }

        if (this.memory.attackRoomIndex === undefined || this.memory.attackRoomIndex >= attackFlags.length) {
            this.memory.attackRoomIndex = 0;
        }
        this.attackRoomCount = attackFlags.length;
        let attackFlag = attackFlags[this.memory.attackRoomIndex];
        let fallbackFlag = fallbackFlags[this.memory.attackRoomIndex];
        let targetFlags = this.findRaidFlags(`targets_${this.memory.attackRoomIndex}`);
        let targetStructures = this.findTargetStructures(attackFlag.room, targetFlags);
        let matrix = this.findRaidMatrix(attackFlag);
        if (matrix) {
            // helper.showMatrix(matrix, attackFlag.pos.roomName, 100);
        }

        let raidData: RaidData = {
            raidAgents: [],
            obstacles: [],
            injuredCreeps: undefined,
            attackFlag: attackFlag,
            attackRoom: attackFlag.room,
            fallbackFlag: fallbackFlag,
            targetFlags: targetFlags,
            targetStructures: targetStructures,
            fallback: this.memory.fallback,
            raidMatrix: matrix,
            nextNuke: this.findNextNuke(attackFlag.room),
            squadsPresent: 0,
        };

        return raidData;
    }

    private findSpawnGroups(): SpawnGroup[] {

        if (!this.memory.additionalRooms) { this.memory.additionalRooms = []; }
        let spawnGroups = [this.spawnGroup];
        for (let roomName of this.memory.additionalRooms) {
            let spawnGroup = empire.getSpawnGroup(roomName);
            if (!spawnGroup) { continue; }
            spawnGroups.push(spawnGroup);
        }
        return spawnGroups;
    }

    private resetRaid() {
        for (let property in this.memory) {
            if (!this.memory.hasOwnProperty(property)) { continue; }
            delete this.memory[property];
        }
    }

    private findAttackDirection(attackRoomCoords: RoomCoord, fallbackRoomCoords: RoomCoord): Direction {
        let directionLetter;
        if (attackRoomCoords.x < fallbackRoomCoords.x) {
            directionLetter = attackRoomCoords.xDir;
        } else if (attackRoomCoords.x > fallbackRoomCoords.x) {
            directionLetter = WorldMap.negaDirection(attackRoomCoords.xDir);
        } else if (attackRoomCoords.y < fallbackRoomCoords.y) {
            directionLetter = attackRoomCoords.yDir;
        } else if (attackRoomCoords.y > fallbackRoomCoords.y) {
            directionLetter = WorldMap.negaDirection(attackRoomCoords.yDir);
        }

        if (directionLetter === "N") {
            return Direction.North;
        } else if (directionLetter === "E") {
            return Direction.East;
        } else if (directionLetter === "S") {
            return Direction.South;
        } else {
            return Direction.West;
        }
    }

    private resetPositions(attackPos: RoomPosition, fallbackPos: RoomPosition) {
        let attackCoords = WorldMap.getRoomCoordinates(attackPos.roomName);
        let fallbackCoords = WorldMap.getRoomCoordinates(fallbackPos.roomName);

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
        } else {
            alfaAttackFlag.setPosition(alfaAttackPos);
        }

        let alfaHealFlag = Game.flags[this.name + "_alfaHeal"];
        if (!alfaHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_alfaHeal", COLOR_BLUE, COLOR_GREEN);
        } else {
            alfaHealFlag.setPosition(alfaHealPos);
        }

        // bravo flags
        let bravoAttackFlag = Game.flags[this.name + "_bravoAttack"];
        if (!bravoAttackFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_bravoAttack", COLOR_YELLOW, COLOR_RED);
        } else {
            bravoAttackFlag.setPosition(bravoAttackPos);
        }

        let bravoHealFlag = Game.flags[this.name + "_bravoHeal"];
        if (!bravoHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_bravoHeal", COLOR_YELLOW, COLOR_GREEN);
        } else {
            bravoHealFlag.setPosition(bravoHealPos);
        }

        // charlie flags
        let charlieAttackFlag = Game.flags[this.name + "_charlieAttack"];
        if (!charlieAttackFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_charlieAttack", COLOR_BROWN, COLOR_RED);
        } else {
            charlieAttackFlag.setPosition(charlieAttackPos);
        }

        let charlieHealFlag = Game.flags[this.name + "_charlieHeal"];
        if (!charlieHealFlag) {
            runNextTick = true;
            this.spawnGroup.pos.createFlag(this.name + "_charlieHeal", COLOR_BROWN, COLOR_GREEN);
        } else {
            charlieHealFlag.setPosition(charlieHealPos);
        }
    }

    public setMaxSquads(max: number) {
        let oldValue = this.memory.maxSquads;
        this.memory.maxSquads = max;
        return "RAID: changing number of active squads from " + oldValue + " to " + max;
    }

    public queueSquad(name: string, type: string, boostlLevel?: number) {
        if (name === "a") {
            name = "alfa";
        } else if (name === "b") {
            name = "bravo";
        } else if (name === "c") {
            name = "charlie";
        } else if (name === "d") {
            name = "delta";
        } else if (name === "c") {
            name = "echo";
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

    public setDefaultType(squadType: string) {
        if (!_.includes(Object.keys(this.squadTypes), squadType)) { return "RAID: ERROR, invalid squad type"; }
        let oldValue = this.memory.defaultSquad;
        this.memory.defaultSquad = squadType;
        return "RAID: changing default squad from " + oldValue + " to " + squadType;
    }

    public setDefaultBoostLevel(level: number) {
        if (level >= 0 && level <= 4) {
            let oldValue = this.memory.defaultBoostLevel;
            this.memory.defaultBoostLevel = level;
            return "RAID: changed from " + oldValue + " to " + level;
        } else {
            return "RAID: ERROR, " + level + " is invalid as a boostLevel";
        }
    }

    public resetFlags() {
        let breachFlag = Game.flags[this.name + "_breach_0"];
        let fallbackFlag = Game.flags[this.name + "_fallback"];
        if (breachFlag && fallbackFlag) {
            this.resetPositions(breachFlag.pos, fallbackFlag.pos);
        }
    }

    public addRoomName(roomName: string) {
        if (!this.memory.additionalRooms) { this.memory.additionalRooms = []; }
        if (_.includes(this.memory.additionalRooms, roomName)) {
            return "RAID: that missionRoom is already being used";
        } else {
            this.memory.additionalRooms.push(roomName);
            return "RAID: additional rooms being used for spawning: " + this.memory.additionalRooms;
        }
    }

    public removeRoomName(roomName: string) {
        if (_.includes(this.memory.additionalRooms, roomName)) {
            return "RAID: that missionRoom is already being used";
        } else {
            this.memory.additionalRooms = _.pull(this.memory.additionalRooms, roomName);
            return "RAID: removing " + roomName + ", current list: " + this.memory.additionalRooms;
        }
    }

    private findTargetStructures(attackRoom: Room, flags: Flag[]): Structure[] {
        if (!attackRoom) {
            return;
        }

        let manualTargets = [];
        for (let flag of flags) {
            if (!flag.room) { continue; }
            let structure = _.filter(flag.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType !== STRUCTURE_ROAD)[0] as Structure;
            if (!structure) {
                flag.remove();
                continue;
            }
            Viz.animatedPos(structure.pos, "Chartreuse ");
            manualTargets.push(structure);
        }

        if (manualTargets.length > 0) {
            return manualTargets;
        }

        if (this.memory.pretending) {
            this.memory.raidComplete = true;
            return;
        }

        let attackOrder = [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TERMINAL, STRUCTURE_STORAGE,
            STRUCTURE_NUKER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_OBSERVER];

        let ramparted: Structure[] = [];
        let nonRamparted: Structure[] = [];
        for (let type of attackOrder) {
            let structures = attackRoom.findStructures<Structure>(type);
            for (let structure of structures) {
                let flag = structure.pos.lookFor<Flag>(LOOK_FLAGS)[0];
                if (flag && flag.name.indexOf("exclude") >= 0) { continue; }
                if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) {
                    Viz.animatedPos(structure.pos, "Gold ");
                    ramparted.push(structure);
                } else {
                    Viz.animatedPos(structure.pos, "Aqua ");
                    nonRamparted.push(structure);
                }
            }
            if (nonRamparted.length > 0) {
                return nonRamparted;
            }
        }

        if (ramparted.length > 0) {
            return ramparted;
        }

        // if we made it this far, all structures have been eliminated
        if (this.memory.attackRoomIndex < this.attackRoomCount) {
            this.memory.attackRoomIndex++;
        } else {
            this.memory.raidComplete = true;
        }
    }

    public reportStatus() {
        console.log("__________RAID STATUS__________");
        console.log("active squads:");
        // let activeSquads: RaidSquad[] = this.memory.squads.active;
        // for (let squad of activeSquads) {
        //    console.log(squad.name.toUpperCase() + ":", squad.type + " (" + squad.boostLevel + ")",
        //        "spawnRoom:", squad.spawnRoomName, "spawned:", squad.spawned, "alive:", squad.alive);
        // }
    }

    public waypointProgress(index?: number) {
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

    public preset(presetName: string) {
        if (presetName === "danger") {
            console.log(this.queueSquad("bravo", "firefly", 2));
            console.log(this.setDefaultBoostLevel(2));
            console.log(this.setMaxSquads(3));
            console.log(this.setDefaultType("brawler"));
            return "spawning a raid that can deal with attacks from behind";
        } else if (presetName === "cosmo") {
            console.log(this.queueSquad("alfa", "brawler", 2));
            console.log(this.queueSquad("bravo", "firefly", 2));
            console.log(this.queueSquad("charlie", "wreck", 2));
            console.log(this.setDefaultBoostLevel(2));
            console.log(this.setMaxSquads(3));
            console.log(this.setDefaultType("brawler"));
            return "spawning a raid that is a good balance between damage rate and defense";
        }
    }

    public addRoom(roomName: string) {
        if (roomName === "clear") {
            this.memory.additionalRooms = undefined;
        } else {
            if (!this.memory.additionalRooms) { this.memory.additionalRooms = []; }
            let spawnGroup = empire.getSpawnGroup(roomName);
            if (spawnGroup) {
                return this.memory.additionalRooms.push(roomName);
            } else {
                return "not an owned missionRoom";
            }
        }
    }

    private automateParams(attackRoomName: string, index: number): boolean {
        // if fallback flag is present, process has been completed
        if (Game.flags[`${this.name}_fallback_${index}`]) { return true; }

        let observer = this.flag.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
        if (!observer) {
            console.log(`RAID: ${this.name} automation incomplete, no observer`);
            return false;
        }

        observer.observeRoom(attackRoomName, "raid", true);
        let attackRoom = Game.rooms[attackRoomName];
        if (!attackRoom) {
            console.log(`RAID: ${this.name} automation incomplete, observation not loaded`);
            return false;
        }

        this.placeFlags(attackRoom, index);
    }

    private placeFlags(attackRoom: Room, index: number) {

        let destination: Structure = attackRoom.storage;
        if (!destination) {
            destination = attackRoom.find<StructureSpawn>(FIND_HOSTILE_SPAWNS)[0];
        }
        if (!destination) {
            console.log(`RAID: ${this.name} automation incomplete, no suitable structure to attack`);
            return false;
        }

        let ret = Traveler.findTravelPath(this.spawnGroup.pos, destination.pos, {ignoreStructures: true});
        if (ret.incomplete) {
            console.log(`RAID: ${this.name} automation incomplete, incomplete path to attackRoom`);
            return false;
        }

        let stagingPosition;
        for (let i = 0; i < ret.path.length; i++) {
            let position = ret.path[i];
            if (position.isNearExit(0)) { continue; }
            if (position.roomName === attackRoom.name) {
                stagingPosition = position;
                for (let j = i; j >= 0; j--) {
                    position = ret.path[j];
                    if (position.isNearExit(1)) { continue; }
                    if (position.roomName !== attackRoom.name) {
                        let moving = this.placeRaidFlag(position, `${this.name}_fallback_${index}`, COLOR_GREY);
                        if (moving) {
                            return;
                        } else {
                            break;
                        }
                    }
                }
                break;
            }
        }

        if (!stagingPosition) {
            console.log(`RAID: unable to find a staging position to generate raid data`);
            return;
        }

        let complete = this.placeBreachFlags(stagingPosition, destination, attackRoom, index);
        if (!complete) { return; }

        this.setDefaultBoostLevel(0);
        this.setMaxSquads(1);
        this.setDefaultType("brawler");
    }

    private placeBreachFlags(stagingPosition: RoomPosition, destination: Structure, attackRoom: Room,
                             index: number): boolean {
        let callback = (roomName: string): CostMatrix => {
            if (roomName !== attackRoom.name) { return; }
            let matrix = new PathFinder.CostMatrix();
            let walls: Structure[] = [];
            walls.concat(attackRoom.findStructures<StructureWall>(STRUCTURE_WALL));
            walls.concat(attackRoom.findStructures<Structure>(STRUCTURE_RAMPART));
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
                this.placeRaidFlag(position, `${this.name}_targets_${index}_${count}`, COLOR_GREY);
                count++;
            }
        }

        if (count === 0) {
            console.log(`RAID: no walls found in ${attackRoom.name}, no target flags placed`);
        }

        return true;
    }

    public placeRaidFlag(pos: RoomPosition, name: string, color = COLOR_WHITE): boolean {
        let flag = Game.flags[name];
        if (flag) {
            if (flag.pos.inRangeTo(pos, 0)) {
                return false;
            }
            console.log(`RAID: moving flag to position: ${name}`);
            flag.setPosition(pos);
            return true;
        }
        let room = Game.rooms[pos.roomName];
        if (room) {
            pos.createFlag(name, color);
            return false;
        } else {
            this.flag.pos.createFlag(name, color);
            return true;
        }
    }

    private updateWaveCompleteStatus(spawnCount: number) {
        if (!this.memory.waveComplete && spawnCount >= this.memory.maxSquads) {
            this.memory.waveComplete = true;
        }
        if (this.memory.waveComplete && spawnCount === 0) {

            // handle wave delay
            if (this.memory.waveDelay) {
                if (!this.memory.nextWave) {
                    this.memory.nextWave = Game.time + this.memory.waveDelay;
                }
                if (Game.time < this.memory.nextWave) {
                    return;
                }
                delete this.memory.nextWave;
            }

            // reset wave
            this.memory.attackRoomIndex = 0;
            this.memory.waveComplete = false;
        }
    }

    private initGlobalConfig(): boolean {
        if (this.memory.defaultBoostLevel === undefined) {
            if (this.memory.manual) {
                if (Game.time % 3 === 0) {
                    console.log(`RAID: please set a default boostLevel, ex: ${this.name}.setDefaultBoostLevel(2)`);
                }
                return;
            }

            this.memory.defaultBoostLevel = 2;
        }

        if (this.memory.maxSquads === undefined) {
            if (this.memory.manual) {
                if (Game.time % 3 === 0) {
                    console.log(`RAID: please set a default number of squads, 0 to stop spawning, ex: ${
                        this.name}.setMaxSquads(1)`);
                }
                return;
            }

            this.memory.maxSquads = 1;
        }

        if (this.memory.defaultSquad === undefined) {
            if (this.memory.manual) {
                if (Game.time % 3 === 0) {
                    console.log(`RAID: please set a default squad type, ex: ${this.name}.setDefaultType("wreck")`);
                }
                return;
            }
            this.memory.defaultSquad = "brawler";
        }

        return true;
    }

    private updateBugout() {
        let buggingOut = this.detectBugoutConditions();
        if (buggingOut) {
            for (let agent of this.raidData.raidAgents) {
                if (agent.room !== this.raidData.attackRoom) { continue; }
                if (!agent.memory.waypointIndex) { continue; }
                console.log(`decrementing index`);
                agent.memory.waypointIndex--;
                agent.memory.waypointsCovered = false;
                agent.memory.action = undefined;
            }
        }
    }

    private detectBugoutConditions() {
        if (this.memory.standGround) { return; }
        if (!this.raidData.attackRoom) { return; }
        if (this.attackRoomCount < 2) { return; }
        let threats = _.filter(this.raidData.attackRoom.hostiles,
            c => (c.getActiveBodyparts(ATTACK) > 10 || c.getActiveBodyparts(RANGED_ATTACK) > 10)
            && _.find(c.body, p => p.boost));
        for (let threat of threats) {
            if (threat.pos.findInRange(this.raidData.raidAgents, 4).length > 0 ) {
                console.log(`bugging out!`);
                this.memory.attackRoomIndex++;
                return true;
            }
        }
    }

    private addCreepsToMatrix(matrix: CostMatrix, room: Room) {
        for (let creep of room.hostiles) {
            if (creep.getActiveBodyparts(RANGED_ATTACK) > 10) {
                helper.blockOffPosition(matrix, creep, 5, 5, true);
            }
            if (creep.getActiveBodyparts(ATTACK) > 10) {
                let rampart = creep.pos.lookForStructure(STRUCTURE_RAMPART);
                if (rampart) {
                    helper.blockOffPosition(matrix, creep, 2, 0xff);
                } else {
                    helper.blockOffPosition(matrix, creep, 4, 10, true);
                }
            }
        }

        // prefer not to path through creeps but don't set them to impassable
        for (let creep of room.find<Creep>(FIND_CREEPS)) {
            helper.blockOffPosition(matrix, creep, 0, RAID_CREEP_MATRIX_COST, true);
        }
    }

    private findRaidMatrix(attackFlag: Flag): CostMatrix {
        if (RaidOperation.structureMatrixTick === Game.time && RaidOperation.structureMatrix[attackFlag.pos.roomName]) {
            // allows multiple raidOps to use the same matrix;
            return RaidOperation.structureMatrix[attackFlag.pos.roomName];
        }

        if (attackFlag.room) {
            RaidOperation.structureMatrix[attackFlag.pos.roomName] = this.generateStructureMatrix(attackFlag.room);
            RaidOperation.structureMatrixTick = Game.time;
        } else if (RaidOperation.structureMatrix[attackFlag.pos.roomName]) {
            return RaidOperation.structureMatrix[attackFlag.pos.roomName];
        } else if (!RaidOperation.orderedObservation) {
            let observer = this.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (observer) {
                RaidOperation.orderedObservation = true;
                observer.observeRoom(attackFlag.pos.roomName);
            }
            return;
        } else {
            return;
        }

        this.addCreepsToMatrix(RaidOperation.structureMatrix[attackFlag.pos.roomName], attackFlag.room);
        return RaidOperation.structureMatrix[attackFlag.pos.roomName];
    }

    private generateStructureMatrix(attackRoom: Room): CostMatrix {
        let matrix = Traveler.getStructureMatrix(attackRoom, true).clone();

        // this is expensive but only needs to happen once per room per raid
        for (let tower of attackRoom.findStructures<StructureTower>(STRUCTURE_TOWER)) {
            helper.blockOffPosition(matrix, tower, 10, 1, true);
        }

        return matrix;
    }

    private findNextNuke(room: Room) {
        if (!room) {
            if (this.memory.nextNuke) {
                if (Game.time > this.memory.nextNuke) {
                    delete this.memory.nextNuke;
                } else {
                    return this.memory.nextNuke;
                }
            } else {
                return Number.MAX_VALUE;
            }
        }

        let nextNuke = Number.MAX_VALUE;
        if (room) {
            let next = _(room.find<Nuke>(FIND_NUKES)).sortBy(x => x.timeToLand).head();
            if (next) {
                nextNuke = next.timeToLand;
                this.memory.nextNuke = nextNuke;
            }
        }
        return nextNuke;
    }

    public resetTargets() {
        for (let missionName in this.raidMissions) {
            let memory = this.memory[missionName];
            delete memory.targetId;
        }
    }
}
