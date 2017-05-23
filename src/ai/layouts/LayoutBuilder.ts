import {Layout} from "./Layout";
export class LayoutBuilder {

    private layout: Layout;
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
        [STRUCTURE_ROAD]: 4,
        [STRUCTURE_RAMPART]: 5,
    };

    private buildPriority = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_LINK,
        STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_RAMPART, STRUCTURE_OBSERVER, STRUCTURE_NUKER,
        STRUCTURE_POWER_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_ROAD];

    constructor(layout: Layout, room: Room) {
        this.layout = layout;
        this.room = room;
        if (!this.room.memory.builder) { this.room.memory.builder = {}; }
        this.memory = this.room.memory.builder;
    }

    public build() {
        if (!this.room || !this.layout) { return; }
        if (Game.time < this.memory.nextCheck) { return; }

        if (this.checkDemolish()) { return; }
        if (this.checkHostiles()) { return; }
        if (this.checkMaxConstruction()) { return; }

        let structureTypes = this.buildPriority;
        for (let buildType of structureTypes) {
            let positions = this.layout.map[buildType];
            let allowedCount = this.allowedCount(buildType, positions);

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

                let errantStructure = _(lookStructures)
                    .filter(x => x.structureType !== STRUCTURE_ROAD && x.structureType !== STRUCTURE_RAMPART)
                    .head();
                if (errantStructure) {
                    this.demolishStructure(errantStructure);
                    return;
                }

                let errantSite = lookSites[0];
                if (errantSite) {
                    errantSite.remove();
                    return;
                }

                errantStructure = this.findErrantStructure(buildType, positions);
                if (errantStructure) {
                    this.demolishStructure(errantStructure);
                    return;
                }

                errantSite = this.findErrantSite(buildType, positions);
                if (errantSite) {
                    errantSite.remove();
                    return;
                }

                console.log(`BUILDER: unhandled error: ${outcome}, position: ${position}, type: ${buildType}`);
                return;
            }
        }

        this.memory.nextCheck = Game.time + 100 + Math.floor(Math.random() * 10);
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

        console.log(`BUILDER: destroying errant ${structure.structureType} in ${
            this.room.name}`);
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
        return this.room.find(FIND_HOSTILE_CREEPS).length > 0;
    }

    private checkMaxConstruction(): boolean {
        // avoid placing so many construction sites with builder that you cannot place them for other reasons
        if (Object.keys(Game.constructionSites).length > BUILDER_MAXCONSTRUCTION) {
            this.memory.nextCheck = Game.time + 100;
            return true;
        }
        if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 2) {
            return true;
        }
        return ;
    }

    protected allowedCount(structureType: string, positions: RoomPosition[]): number {
        let restriction = this.levelRestriction[structureType];
        if (restriction && this.room.controller.level < restriction) {
            return 0;
        }

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
        let currentSites = _(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES))
            .filter(x => x.structureType === buildType)
            .value();

        for (let structure of currentSites) {
            if (structure.pos.findInRange(positions, 0).length > 0) { continue; }
            return structure;
        }
    }
}

export const BUILDER_MAXCONSTRUCTION = 60;
export const DEMOLISH_SAFELY = false;
