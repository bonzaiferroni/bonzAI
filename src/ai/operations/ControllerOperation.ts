import {Operation} from "./Operation";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {RefillMission} from "../missions/RefillMission";
import {PowerMission} from "../missions/PowerMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {IgorMission} from "../missions/IgorMission";
import {LinkMiningMission} from "../missions/LinkMiningMission";
import {MiningMission} from "../missions/MiningMission";
import {BuildMission} from "../missions/BuildMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {GeologyMission} from "../missions/GeologyMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {Coord, SeedData} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {SeedAnalysis} from "../SeedAnalysis";
import {SpawnGroup} from "../SpawnGroup";
import {Empire} from "../Empire";
import {MasonMission} from "../missions/MasonMission";
import {OperationPriority} from "../../config/constants";
import {BodyguardMission} from "../missions/BodyguardMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {profiler} from "../../profiler";
import {ScoutMission} from "../missions/ScoutMission";
import {ClaimMission} from "../missions/ClaimMission";
import {RadarMission} from "../missions/RadarMission";

const GEO_SPAWN_COST = 5000;

export abstract class ControllerOperation extends Operation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
        if (this.flag.room && this.flag.room.controller.level < 6) {
            this.priority = OperationPriority.VeryHigh;
        }
    }

    memory: {
        powerMining: boolean
        noMason: boolean
        masonPotency: number
        builderPotency: number
        wallBoost: boolean
        mason: { activateBoost: boolean }
        network: { scanData: { roomNames: string[]} }
        centerPosition: RoomPosition;
        centerPoint: Coord;
        rotation: number
        repairIndices: {[structureType: string]: number}
        temporaryPlacement: {[level: number]: boolean}
        checkLayoutIndex: number
        layoutMap: {[structureType: string]: Coord[]}
        radius: number
        seedData: SeedData
        lastChecked: {[structureType: string]: number }
        spawnRooms: string[]

        // deprecated values
        flexLayoutMap: {[structureType: string]: Coord[]}
        flexRadius: number
    };

    staticStructures: {[structureType: string]: Coord[]};

    protected abstract addDefense();
    protected abstract initAutoLayout();
    protected abstract temporaryPlacement(controllerLevel: number);

    initOperation() {

        this.autoLayout();

        // scout room
        this.spawnGroup = this.empire.getSpawnGroup(this.flag.pos.roomName);
        if (!this.spawnGroup) {
            if (!this.memory.spawnRooms) { return; }
            this.spawnGroup = this.getRemoteSpawnGroup(8);
            this.addMission(new ScoutMission(this));
            this.addMission(new ClaimMission(this));
            this.addMission(new BodyguardMission(this));
            this.addMission(new RemoteBuildMission(this, false));
        }

        this.empire.register(this.flag.room);

        if (this.flag.room.findStructures(STRUCTURE_SPAWN).length > 0) {
            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));
            // refill spawning energy - will spawn small spawnCart if needed
            this.addMission(new RefillMission(this));
        }

        this.addDefense();

        if (this.memory.powerMining) {
            this.addMission(new PowerMission(this));
        }

        // energy network
        if (this.flag.room.terminal && this.flag.room.storage) {
            this.addMission(new TerminalNetworkMission(this));
            this.addMission(new IgorMission(this));
            this.addMission(new RadarMission(this));
        }

        // harvest energy
        let miningMissions: MiningMission[] = [];
        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            let source = this.sources[i];
            if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
                let link = source.findMemoStructure(STRUCTURE_LINK, 2) as StructureLink;
                if (link) {
                    this.addMission(new LinkMiningMission(this, "miner" + i, source, link));
                    continue;
                }
            }
            let miningMission = new MiningMission(this, "miner" + i, source);
            miningMissions.push(miningMission);
            this.addMission(miningMission);
        }

        // build construction
        let buildMission = new BuildMission(this);
        this.addMission(buildMission);

        if (this.flag.room.storage) {
            // use link array near storage to fire energy at controller link (pre-rcl8)
            this.addMission(new LinkNetworkMission(this));
            // mine minerals
            this.addMission(new GeologyMission(this));
        }

        // upgrader controller
        let boostUpgraders = this.flag.room.controller.level < 8;
        let upgradeMission = new UpgradeMission(this, boostUpgraders);
        this.addMission(upgradeMission);

        // repair walls
        this.addMission(new MasonMission(this));

        this.towerRepair();

        // reassign spawngroups for remote boosting
        if (this.flag.room.controller.level < 6) {
            if (!this.memory.spawnRooms) return;
            let boostSpawnGroup = this.getRemoteSpawnGroup(6);
            if (boostSpawnGroup) {

                if (this.flag.room.controller.level < 4) {
                    let bodyguard = new BodyguardMission(this);
                    this.addMission(bodyguard);
                    bodyguard.setSpawnGroup(boostSpawnGroup);
                    let remoteBuilder = new RemoteBuildMission(this, false);
                    this.addMission(remoteBuilder);
                    remoteBuilder.setSpawnGroup(boostSpawnGroup);
                }

                if (boostSpawnGroup.room.controller.level >= 8) {
                    upgradeMission.setSpawnGroup(boostSpawnGroup);
                    buildMission.setSpawnGroup(boostSpawnGroup);
                }

                // remote spawn miners
                if (this.spawnGroup.maxSpawnEnergy < 1300) {
                    for (let miningMission of miningMissions) {
                        miningMission.setSpawnGroup(boostSpawnGroup);
                    }
                }
            }
        }
    }

    finalizeOperation() {
        this.getRemoteSpawnGroup(8);
    }

    invalidateOperationCache() {
        if (Math.random() < .01) {
            this.memory.spawnRooms = undefined;
        }
    }

    public nuke(x: number, y: number, roomName: string): string {
        let nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_NUKER}})) as StructureNuker;
        let outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
        if (outcome === OK) {
            this.empire.addNuke({tick: Game.time, roomName: roomName});
            return "NUKER: Bombs away! \\o/";
        }
        else {
            return `NUKER: error: ${outcome}`;
        }
    }

    public addAllyRoom(roomName: string) {
        if (_.includes(this.empire.memory.allyRooms, roomName)) {
            return "NETWORK: " + roomName + " is already being scanned by " + this.name;
        }

        this.empire.addAllyRoom(roomName);
        return "NETWORK: added " + roomName + " to rooms scanned by " + this.name;
    }

    public moveLayout(x: number, y: number, rotation: number): string {
        this.memory.centerPosition = new RoomPosition(x, y, this.flag.pos.roomName);
        this.memory.rotation = rotation;
        this.memory.layoutMap = undefined;
        this.showLayout(false);

        return `moving layout, run command ${this.name}.showLayout(true) to display`
    }

    public showLayout(show: boolean): string {
        if (!this.memory.rotation === undefined || !this.memory.centerPosition) {
            return "No layout defined";
        }

        if (!show) {
            for (let flagName in Game.flags) {
                let flag = Game.flags[flagName];
                if (flag.name.indexOf(`${this.name}_layout`) >= 0) { flag.remove(); }}
            return "removing layout flags";
        }

        for (let structureType of Object.keys(CONSTRUCTION_COST)) {
            let coords = this.layoutCoords(structureType);
            let order = 0;
            for (let coord of coords) {
                let flagName = `${this.name}_layout_${structureType}_${order++}`;
                let flag = Game.flags[flagName];
                if (flag) {
                    flag.setPosition(coord.x, coord.y);
                    continue;
                }

                let position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
                let color = COLOR_WHITE;
                if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN
                    || structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_NUKER) {
                    color = COLOR_YELLOW;
                }
                else if (structureType === STRUCTURE_TOWER) {
                    color = COLOR_BLUE;
                }
                else if (structureType === STRUCTURE_LAB || structureType === STRUCTURE_TERMINAL) {
                    color = COLOR_CYAN;
                }
                else if (structureType === STRUCTURE_POWER_SPAWN) {
                    color = COLOR_RED;
                }
                else if (structureType === STRUCTURE_OBSERVER) {
                    color = COLOR_BROWN;
                }
                else if (structureType === STRUCTURE_ROAD) {
                    color = COLOR_GREY;
                }
                else if (structureType === STRUCTURE_RAMPART) {
                    color = COLOR_GREEN;
                }
                position.createFlag(flagName, color);
            }
        }

        return "showing layout flags"
    }

    private autoLayout() {

        this.initWithSpawn();
        if (!this.memory.centerPosition || this.memory.rotation === undefined ) return;
        this.initAutoLayout();
        this.buildLayout();
    }

    private buildLayout() {

        if (!this.flag.room) return;
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        if (this.memory.checkLayoutIndex === undefined || this.memory.checkLayoutIndex >= structureTypes.length) {
            this.memory.checkLayoutIndex = 0;
        }
        let structureType = structureTypes[this.memory.checkLayoutIndex++];

        this.fixedPlacement(structureType);
        this.temporaryPlacement(this.flag.room.controller.level);
    }

    private fixedPlacement(structureType: string) {
        let controllerLevel = this.flag.room.controller.level;
        let constructionPriority = Math.max(controllerLevel * 10, 40);
        if (controllerLevel === 1) {
            constructionPriority = 90;
        }
        if (Object.keys(Game.constructionSites).length > constructionPriority) return;
        if (structureType === STRUCTURE_RAMPART && controllerLevel < 5) return;
        if (!this.memory.lastChecked) this.memory.lastChecked = {};
        if (Game.time - this.memory.lastChecked[structureType] < 1000) return;

        let coords = this.layoutCoords(structureType);
        let allowedCount = this.allowedCount(structureType, controllerLevel);

        for (let i = 0; i < coords.length; i++) {
            if (i >= allowedCount) break;

            let coord = coords[i];
            let position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
            let structure = position.lookForStructure(structureType);
            if (structure) {
                this.repairLayout(structure);
                continue;
            }
            let hasConstruction = position.lookFor(LOOK_CONSTRUCTION_SITES)[0];
            if (hasConstruction) continue;

            let outcome = position.createConstructionSite(structureType);
            if (outcome === OK) {
                console.log(`LAYOUT: placing ${structureType} at ${position} (${this.name})`);
            }
            else {
                // console.log(`LAYOUT: bad construction placement: ${outcome}, ${structureType}, ${position} (${this.name})`);
            }

            return;
        }

        this.memory.lastChecked[structureType] = Game.time;
    }

    private recalculateLayout(layoutType?: string) {

        if (!this.memory.seedData) {
            let sourceData = [];
            for (let source of this.flag.room.find<Source>(FIND_SOURCES)) {
                sourceData.push({pos: source.pos, amount: 3000 })
            }
            this.memory.seedData = {
                sourceData: sourceData,
                seedScan: {},
                seedSelectData: undefined
            }
        }

        let analysis = new SeedAnalysis(this.flag.room, this.memory.seedData);
        let results = analysis.run(this.staticStructures, layoutType);
        if (results) {
            let centerPosition = new RoomPosition(results.origin.x, results.origin.y, this.flag.room.name);
            if (results.seedType === this.type) {
                console.log(`${this.name} found best seed of type ${results.seedType}, initiating auto-layout`);
                this.memory.centerPosition = centerPosition;
                this.memory.rotation = results.rotation;
            }
            else {
                console.log(`${this.name} found best seed of another type, replacing operation`);
                let flagName = `${results.seedType}_${this.name}`;
                Memory.flags[flagName] = { centerPosition: centerPosition, rotation: results.rotation };
                this.flag.pos.createFlag(flagName, COLOR_GREY);
                this.flag.remove();
            }
            this.memory.seedData = undefined; // clean-up memory
        }
        else {
            console.log(`${this.name} could not find a suitable auto-layout, consider using another spawn location or room`);
        }
    }

    protected allowedCount(structureType: string, level: number): number {
        if (level < 5 && (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_WALL
            || structureType === STRUCTURE_ROAD)) {
            return 0;
        }

        return Math.min(CONTROLLER_STRUCTURES[structureType][level], this.layoutCoords(structureType).length)
    }

    protected layoutCoords(structureType: string): Coord[] {
        if (this.staticStructures[structureType]) {
            return this.staticStructures[structureType]
        }
        else if (this.memory.layoutMap && this.memory.layoutMap[structureType]) {
            return this.memory.layoutMap[structureType];
        }
        else {
            return [];
        }
    }

    private initWithSpawn() {

        if (!this.flag.room) return;
        if (!this.memory.centerPosition || this.memory.rotation === undefined) {
            let structureCount = this.flag.room.find(FIND_STRUCTURES).length;
            if (structureCount === 1) {
                this.recalculateLayout();
            }
            else if (structureCount > 1) {
                this.recalculateLayout(this.type)
            }
            return;
        }
    }

    protected towerRepair() {

        let structureType = STRUCTURE_RAMPART;
        if (Game.time % 2 === 0) {
            structureType = STRUCTURE_ROAD;
        }

        let coords = this.layoutCoords(structureType);
        if (!this.memory.repairIndices) { this.memory.repairIndices = {} }
        if (this.memory.repairIndices[structureType] === undefined ||
            this.memory.repairIndices[structureType] >= coords.length) {
            this.memory.repairIndices[structureType] = 0;
        }

        let coord = coords[this.memory.repairIndices[structureType]++];
        let position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
        let structure = position.lookForStructure(structureType);
        if (structure) {
            this.repairLayout(structure);
        }
    }

    // deprecated
    private findRemoteSpawn(distanceLimit: number, levelRequirement = 8): SpawnGroup {
        let remoteSpawn = _(this.empire.spawnGroups)
            .filter((s: SpawnGroup) => {
                return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name) <= distanceLimit
                    && s.room.controller.level >= levelRequirement
                    && s.averageAvailability() > .3
                    && s.isAvailable
            })
            .sortBy((s: SpawnGroup) => {
                return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name)
            })
            .head();
        return remoteSpawn;
    }

    private repairLayout(structure: Structure) {

        let repairsNeeded = Math.floor((structure.hitsMax - structure.hits) / 800);
        if (structure.structureType === STRUCTURE_RAMPART) {
            if (structure.hits >= 100000) { return; }
        }
        else {
            if (repairsNeeded === 0) { return; }
        }

        let towers = this.flag.room.findStructures<StructureTower>(STRUCTURE_TOWER);

        for (let tower of towers) {
            if (repairsNeeded === 0) { return; }
            if (tower.alreadyFired) { continue; }
            if (!tower.pos.inRangeTo(structure, Math.max(5, this.memory.radius - 3))) { continue; }
            let outcome = tower.repair(structure);
            repairsNeeded--;
        }

        if (repairsNeeded > 0 && towers.length > 0) {
            structure.pos.findClosestByRange<StructureTower>(towers).repair(structure);
        }
    }
}