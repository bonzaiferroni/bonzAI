import {Empire} from "./Empire";
import {NightsWatchMission} from "./NightsWatchMission";
import {OperationPriority} from "./constants";
import {Coord} from "./interfaces";
import {ControllerOperation} from "./ControllerOperation";
import {helper} from "./helper";

const QUAD_RADIUS = 6;
const REPAIR_INTERVAL = 4;

export class QuadOperation extends ControllerOperation {

    /**
     * Manages the activities of an owned room, assumes bonzaiferroni's build spec
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    protected addDefense() {
        this.addMission(new NightsWatchMission(this));
    }

    protected repairWalls() {
        if (Game.time % REPAIR_INTERVAL !== 0) return;

        let towers = this.flag.room.findStructures(STRUCTURE_TOWER) as StructureTower[];
        let ramparts = this.flag.room.findStructures(STRUCTURE_RAMPART) as StructureRampart[];
        if (towers.length === 0 || ramparts.length === 0) return;

        let rampart = _(ramparts).sortBy("hits").head();

        rampart.pos.findClosestByRange<StructureTower>(towers).repair(rampart);
    }

    protected allowedCount(structureType: string, level: number): number {
        let allowedCount = {
            [STRUCTURE_RAMPART]: {
                0: 0, 1: 0, 2: 0, 3: 0, 4: 49, 5: 49, 6: 49, 7: 49, 8: 49,
            },
            [STRUCTURE_ROAD]: {
                0: 0, 1: 12, 2: 12, 3: 12, 4: 36, 5: 36, 6: 36, 7: 69, 8: 69,
            }
        };

        if (allowedCount[structureType]) {
            // override amounts that aren't really limited
            return allowedCount[structureType][level]
        }
        else if (this.layoutMap[structureType]) {
            // build max structures for all others included in layout map
            return CONTROLLER_STRUCTURES[structureType][this.flag.room.controller.level];
        }
        else {
            // do not autobuild the rest (extractor, containers, links, etc.)
            return 0;
        }
    }

    protected temporaryPlacement(level: number) {
        if (!this.memory.temporaryPlacement) this.memory.temporaryPlacement = {};
        if (!this.memory.temporaryPlacement[level]) {

            let actions: {actionType: string, structureType: string, coord: Coord}[] = [];

            // containers
            if (level === 2) {
                actions.push({actionType: "place", structureType: STRUCTURE_CONTAINER, coord: {x: -1, y: 5}});
            }
            if (level === 5) {
                actions.push({actionType: "remove", structureType: STRUCTURE_CONTAINER, coord: {x: -1, y: 5}});
            }

            // links
            if (level === 5) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 2}});
            }
            if (level === 6) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 3}});
            }
            if (level === 7) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 4}});
            }
            if (level === 8) {
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 2, y: 3}});
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 2, y: 4}});
            }

            for (let action of actions) {
                let outcome;
                let position = helper.coordToPosition(action.coord, this.memory.centerPosition, this.memory.rotation);
                if (action.actionType === "place") {
                    outcome = position.createConstructionSite(action.structureType);
                }
                else {
                    let structure = position.lookForStructure(action.structureType);
                    if (structure) {
                        outcome = structure.destroy();
                    }
                    else {
                        outcome = "noStructure";
                    }
                }

                if (outcome === OK) {
                    console.log(`LAYOUT: ${action.actionType}d temporary ${action.structureType} (${this.name}, level: ${level})`)
                }
                else {
                    console.log(`LAYOUT: problem with temp placement, please follow up in ${this.name}`);
                    console.log(`tried to ${action.actionType} ${action.structureType} at level ${level}, outcome: ${outcome}`);
                }
            }

            this.memory.temporaryPlacement[level] = true;
        }
    }

    protected findStructureCount(structureType: string): number {
        let centerPosition = new RoomPosition(this.memory.centerPosition.x, this.memory.centerPosition.y, this.flag.room.name);

        let constructionCount = centerPosition.findInRange(FIND_MY_CONSTRUCTION_SITES, QUAD_RADIUS,
            {filter: (c: ConstructionSite) => c.structureType === structureType}).length;
        let count = _.filter(this.flag.room.findStructures(structureType),
                (s: Structure) => { return centerPosition.inRangeTo(s, QUAD_RADIUS)}).length + constructionCount;

        return count;
    }

    layoutMap = {
        [STRUCTURE_SPAWN]: [{x: 2, y: 0}, {x: 0, y: -2}, {x: -2, y: 0}],
        [STRUCTURE_TOWER]: [
            {x: 1, y: -1}, {x: -1, y: -1}, {x: 0, y: 1}, {x: 1, y: 0}, {x: 0, y: -1}, {x: -1, y: 0}],
        [STRUCTURE_EXTENSION]: [
            {x: 3, y: -1}, {x: 2, y: -2}, {x: 1, y: -3}, {x: 3, y: -2}, {x: 2, y: -3},
            {x: 0, y: -4}, {x: -1, y: -3}, {x: -2, y: -2}, {x: -3, y: -1}, {x: -3, y: -2},
            {x: -2, y: -3}, {x: -2, y: -4}, {x: 4, y: 0}, {x: -4, y: 0}, {x: -3, y: 1},
            {x: -1, y: 1}, {x: 3, y: 1}, {x: 4, y: -2}, {x: 3, y: -3}, {x: 2, y: -4},
            {x: -3, y: -3}, {x: -4, y: -2}, {x: 5, y: -3}, {x: 4, y: -4}, {x: 3, y: -5},
            {x: -3, y: -5}, {x: -4, y: -4}, {x: -5, y: -3}, {x: 3, y: 2}, {x: 3, y: 3},
            {x: 4, y: 2}, {x: 3, y: 5}, {x: 4, y: 4}, {x: 5, y: 3}, {x: 5, y: 1},
            {x: 5, y: 0}, {x: 5, y: -1}, {x: 5, y: -4}, {x: 5, y: -5}, {x: 4, y: -5},
            {x: 1, y: -5}, {x: 0, y: -5}, {x: -1, y: -5}, {x: -4, y: -5}, {x: -5, y: -5},
            {x: -5, y: -4}, {x: -5, y: -1}, {x: -5, y: 0}, {x: -5, y: 1}, {x: 4, y: 5},
            {x: 5, y: 4}, {x: 5, y: 5}, {x: -6, y: 2}, {x: -6, y: -2}, {x: -2, y: -6},
            {x: 2, y: 4}, {x: 2, y: -6}, {x: 6, y: -2}, {x: 6, y: 2}, {x: 2, y: 3}, ],
        [STRUCTURE_STORAGE]: [{x: 0, y: 4}],
        [STRUCTURE_TERMINAL]: [{x: 0, y: 2}],
        [STRUCTURE_NUKER]: [{x: 0, y: 6}],
        [STRUCTURE_POWER_SPAWN]: [{x: -2, y: 2}],
        [STRUCTURE_OBSERVER]: [{x: -5, y: 5}],
        [STRUCTURE_LAB]: [
            {x: -2, y: 4}, {x: -3, y: 3}, {x: -4, y: 2}, {x: -3, y: 5}, {x: -4, y: 4},
            {x: -5, y: 3}, {x: -2, y: 3}, {x: -3, y: 2}, {x: -4, y: 5}, {x: -5, y: 4}],
        [STRUCTURE_ROAD]: [

            // diamond (n = 12)
            {x: 3, y: 0}, {x: 2, y: -1}, {x: 1, y: -2}, {x: 0, y: -3}, {x: -1, y: -2},
            {x: -2, y: -1}, {x: -3, y: 0}, {x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: 3},
            {x: 1, y: 2}, {x: 2, y: 1},

            // x-pattern (n = 24)
            {x: 4, y: -1}, {x: 5, y: -2}, {x: 4, y: -3},
            {x: 3, y: -4}, {x: 2, y: -5}, {x: 1, y: -4}, {x: -1, y: -4}, {x: -2, y: -5},
            {x: -3, y: -4}, {x: -4, y: -3}, {x: -5, y: -2}, {x: -4, y: -1}, {x: -4, y: 1},
            {x: -5, y: 2}, {x: -4, y: 3}, {x: -3, y: 4}, {x: -2, y: 5}, {x: -1, y: 4},
            {x: 1, y: 4}, {x: 2, y: 5}, {x: 3, y: 4}, {x: 4, y: 3}, {x: 5, y: 2},
            {x: 4, y: 1},

            // outside (n = 33)
            {x: 6, y: -3}, {x: 6, y: -4}, {x: 6, y: -5}, {x: 5, y: -6},
            {x: 4, y: -6}, {x: 3, y: -6}, {x: 1, y: -6}, {x: 0, y: -6}, {x: -1, y: -6},
            {x: -3, y: -6}, {x: -4, y: -6}, {x: -5, y: -6}, {x: -6, y: -5}, {x: -6, y: -4},
            {x: -6, y: -3}, {x: -6, y: -1}, {x: -6, y: 0}, {x: -6, y: 1}, {x: -6, y: 3},
            {x: -6, y: 4}, {x: -6, y: 5}, {x: -5, y: 6}, {x: -4, y: 6}, {x: -3, y: 6},
            {x: 3, y: 6}, {x: 4, y: 6}, {x: 5, y: 6}, {x: 6, y: 5}, {x: 6, y: 4},
            {x: 6, y: 3}, {x: 6, y: 1}, {x: 6, y: 0}, {x: 6, y: -1},
        ],
        [STRUCTURE_RAMPART]: [
            // top wall (n = 12)
            {x: -5, y: -6}, {x: -4, y: -6}, {x: -3, y: -6}, {x: -2, y: -6}, {x: -1, y: -6},
            {x: 0, y: -6}, {x: 1, y: -6}, {x: 2, y: -6}, {x: 3, y: -6}, {x: 4, y: -6},
            {x: 5, y: -6}, {x: 5, y: -5},

            // right wall (n = 12)
            {x: 6, y: -5}, {x: 6, y: -4}, {x: 6, y: -3}, {x: 6, y: -2}, {x: 6, y: -1},
            {x: 6, y: 0}, {x: 6, y: 1}, {x: 6, y: 2}, {x: 6, y: 3}, {x: 6, y: 4},
            {x: 6, y: 5}, {x: 5, y: 5},

            // bottom wall (n = 12)
            {x: 5, y: 6}, {x: 4, y: 6}, {x: 3, y: 6}, {x: 2, y: 6}, {x: 1, y: 6},
            {x: 0, y: 6}, {x: -1, y: 6}, {x: -2, y: 6}, {x: -3, y: 6}, {x: -4, y: 6},
            {x: -5, y: 6}, {x: -5, y: 5},

            // left wall (n = 12)
            {x: -6, y: 5}, {x: -6, y: 4}, {x: -6, y: 3}, {x: -6, y: 2}, {x: -6, y: 1},
            {x: -6, y: 0}, {x: -6, y: -1}, {x: -6, y: -2}, {x: -6, y: -3}, {x: -6, y: -4},
            {x: -6, y: -5}, {x: -5, y: -5},

            // storage (n = 1)
            {x: 0, y: 4}
        ]

    };

    protected layoutCoords(structureType: string): Coord[] {

        if (this.layoutMap[structureType]) {
            return this.layoutMap[structureType];
        }
        else {
            return [];
        }
    }
}