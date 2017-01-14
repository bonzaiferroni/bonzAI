import {DefenseMission} from "../missions/DefenseMission";
import {Coord} from "../../interfaces";
import {ControllerOperation} from "./ControllerOperation";
import {helper} from "../../helpers/helper";

const QUAD_RADIUS = 6;

export class QuadOperation extends ControllerOperation {

    /**
     * Manages the activities of an owned room, assumes bonzaiferroni's build spec
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    protected initAutoLayout() {
        if(!this.memory.layoutMap) {
            this.memory.layoutMap = {};
            this.memory.radius = QUAD_RADIUS;
        }
    }

    protected temporaryPlacement(level: number) {
        if (!this.memory.temporaryPlacement) this.memory.temporaryPlacement = {};
        if (!this.memory.temporaryPlacement[level]) {

            let actions: {actionType: string, structureType: string, coord: Coord}[] = [];

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

    staticStructures = {
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
        [STRUCTURE_TERMINAL]: [{x: -2, y: 2}],
        [STRUCTURE_NUKER]: [{x: 0, y: 6}],
        [STRUCTURE_POWER_SPAWN]: [{x: 0, y: 2}],
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
            {x: 0, y: 4},

            // labs (n = 8)
            {x: -4, y: 5}, {x: -5, y: 4}, {x: -5, y: 3}, {x: -4, y: 4}, {x: -3, y: 5},
            {x: -4, y: 2}, {x: -3, y: 3}, {x: -2, y: 4},
        ]

    };
}