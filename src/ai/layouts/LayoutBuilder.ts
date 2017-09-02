import {Layout} from "./Layout";
import {NEED_ENERGY_THRESHOLD} from "../TradeNetwork";
export class LayoutBuilder {

    private layout: Layout;
    private roomName: string;
    private room: Room;
    private memory: {
        demolish: string,
        nextCheck: number,
    };

    private safeDemolishTypes = {
        [STRUCTURE_TERMINAL]: true,
        [STRUCTURE_STORAGE]: true,
        [STRUCTURE_POWER_SPAWN]: true,
    };

    private levelRestriction = {
        [STRUCTURE_ROAD]: 8,
        [STRUCTURE_RAMPART]: 6,
    };

    private safeTypes = {
        [STRUCTURE_ROAD]: true,
        [STRUCTURE_RAMPART]: true,
    };

    private buildPriority: string[];

    constructor(layout: Layout, roomName: string) {
        this.layout = layout;
        this.roomName = roomName;
    }

    public init() {
        if (!Memory.rooms[this.roomName].builder) { Memory.rooms[this.roomName].builder = {} as any; }
    }

    public update() {
        this.room = Game.rooms[this.roomName];
        if (!this.room || !this.layout.map) { return; }
        this.memory = this.room.memory.builder;
        if (Game.time < this.memory.nextCheck) { return; }

        if (this.checkDemolish()) { return; }
        if (this.checkHostiles()) { return; }
        if (this.checkMaxConstruction()) {
            this.memory.nextCheck = Game.time + 100 + Math.floor(Math.random() * 10);
            return;
        }

        this.buildPriority = this.findBuildPriority();

        let structureTypes = this.buildPriority;
        for (let buildType of structureTypes) {
            let positions = this.layout.map[buildType];
            let allowedCount = this.allowedCount(buildType, positions);
            if (buildType === "turtle") {
                buildType = STRUCTURE_RAMPART;
            }
            for (let i = 0; i < allowedCount; i++) {
                let position = positions[i];

                // check existing structure or site is consistent with layout
                let lookStructures = position.lookFor<Structure>(LOOK_STRUCTURES);
                if (_.find(lookStructures, x => x.structureType === buildType)) { continue; }
                let lookSites = position.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES);
                if (_.find(lookSites, x => x.structureType)) { continue; }

                // create a site
                let outcome = position.createConstructionSite(buildType);
                if (outcome === OK) {
                    console.log(`BUILDER: placed ${buildType} in ${this.room.name}`);
                    return;
                }

                if (outcome === ERR_RCL_NOT_ENOUGH && buildType !== STRUCTURE_LINK) {
                    let errantStructure = this.findErrantStructure(buildType, positions);
                    if (errantStructure) {
                        this.demolishStructure(errantStructure);
                        continue;
                    }

                    let errantSite = this.findErrantSite(buildType, positions);
                    if (errantSite) {
                        errantSite.remove();
                        return;
                    }
                }

                if (outcome === ERR_INVALID_TARGET) {
                    let errantStructure = _(lookStructures)
                        .filter(x => !this.safeTypes[x.structureType])
                        .head();
                    if (errantStructure) {
                        this.demolishStructure(errantStructure);
                        return;
                    }

                    let errantSite = lookSites[0];
                    if (errantSite && !this.safeTypes[errantSite.structureType]) {
                        console.log(`BUILDER: removed a ${errantSite.structureType} to place a ${buildType}, ${this.roomName}`);
                        errantSite.remove();
                        return;
                    }
                }

                // continue
            }
        }

        this.memory.nextCheck = Game.time + 100 + Math.floor(Math.random() * 10);
    }

    public recheck() {
        this.memory.nextCheck = Game.time;
    }

    private demolishStructure(structure: Structure) {
        if (DEMOLISH_SAFELY && this.safeDemolishTypes[structure.structureType]) {
            this.memory.demolish = structure.structureType;
            return;
        }

        if (structure.structureType === STRUCTURE_SPAWN) {
            let spawnCount = _(this.room.find<Structure>(FIND_STRUCTURES))
                .filter(x => x.structureType === STRUCTURE_SPAWN)
                .value().length;
            if (spawnCount === 1) {
                console.log(`BUILDER: one spawn remaining in ${this.room.name}, avoiding destruction`);
                this.memory.nextCheck = Game.time + 100;
                return;
            }
        }

        console.log(`BUILDER: demolished a ${structure.structureType} to place a structure in ${this.roomName}`);
        structure.destroy();
    }

    private checkDemolish(): boolean {
        if (!this.memory.demolish) { return false; }
        let structure = _(this.room.find<Structure>(FIND_STRUCTURES))
            .filter(x => x.structureType)
            .head();
        if (!structure) {
            delete this.memory.demolish;
            return false;
        }

        if (Game.time % 10 === 0) {
            console.log(`BUILDER: demolish the ${this.memory.demolish} in ${
                this.room.name} before I continue`);
        }

        return true;
    }

    private checkHostiles() {
        return this.room.hostiles.length > 0;
    }

    private checkMaxConstruction(): boolean {
        // avoid placing so many construction sites with builder that you cannot place them for other reasons
        if (Object.keys(Game.constructionSites).length > BUILDER_MAXCONSTRUCTION) {
            this.memory.nextCheck = Game.time + 100;
            return true;
        }

        let nonRoads = _.filter(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES),
            x => x.structureType !== STRUCTURE_ROAD && x.structureType !== STRUCTURE_CONTAINER);
        if (nonRoads.length > 5) {
            return true;
        }
        return;
    }

    protected allowedCount(structureType: string, positions: RoomPosition[]): number {
        let restriction = this.levelRestriction[structureType];
        if (restriction && this.room.controller.level < restriction) {
            return 0;
        }

        if (!CONTROLLER_STRUCTURES[structureType]) { return positions.length; }

        return Math.min(CONTROLLER_STRUCTURES[structureType][this.room.controller.level],
            positions.length);
    }

    private findErrantStructure(buildType: string, positions: RoomPosition[]): Structure {
        let currentStructures = _(this.room.find<Structure>(FIND_STRUCTURES))
            .filter(x => x.structureType === buildType)
            .value();

        for (let structure of currentStructures) {
            if (structure.pos.findInRange(positions, 0).length > 0) { continue; }
            return structure;
        }
    }

    private findErrantSite(buildType: string, positions: RoomPosition[]): ConstructionSite {
        if (this.safeTypes[buildType]) { return; }

        let currentSites = _(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES))
            .filter(x => x.structureType === buildType)
            .value();

        for (let structure of currentSites) {
            if (structure.pos.findInRange(positions, 0).length > 0) { continue; }
            return structure;
        }
    }

    private findBuildPriority(): string[] {
        let priorityMap = {
            ["high"]: [STRUCTURE_STORAGE, STRUCTURE_SPAWN, STRUCTURE_TERMINAL, STRUCTURE_LAB],
            ["medium"]: [STRUCTURE_TOWER, STRUCTURE_LINK, STRUCTURE_EXTENSION],
            ["low"]: [STRUCTURE_ROAD, STRUCTURE_OBSERVER, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN],
        };

        if (this.room.storage && this.room.storage.store[RESOURCE_ENERGY] > NEED_ENERGY_THRESHOLD) {
            priorityMap["medium"].unshift(STRUCTURE_RAMPART);
        }
        return _.flatten(_.toArray(priorityMap));
    }
}

export const BUILDER_MAXCONSTRUCTION = 80;
export const DEMOLISH_SAFELY = false;
