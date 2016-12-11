import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {DefenseMission} from "./DefenseMission";
import {FlexGenerator} from "./FlexGenerator";
import {helper} from "./helper";

export class FlexOperation extends ControllerOperation {

    protected addDefense() {
        this.addMission(new DefenseMission(this));
    }

    protected temporaryPlacement(level: number) {
        if (!this.memory.temporaryPlacement) this.memory.temporaryPlacement = {};
        if (!this.memory.temporaryPlacement[level]) {

            let actions: {actionType: string, structureType: string, coord: Coord}[] = [];

            // links
            if (level === 5) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: -1}});
            }
            if (level === 6) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 1, y: -1}});
            }
            if (level === 7) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 0, y: -1}});
            }
            if (level === 8) {
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 1, y: -1}});
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 0, y: -1}});
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

    protected initAutoLayout() {
        if(!this.memory.layoutMap) {

            if (this.memory.flexLayoutMap) {
                // temporary patch for variable identifier change
                this.memory.layoutMap = this.memory.flexLayoutMap;
                this.memory.radius = this.memory.flexRadius;
            }
            else {
                let map = new FlexGenerator(this.memory.centerPosition, this.memory.rotation, this.staticStructures);
                this.memory.layoutMap = map.generate(true);
                this.memory.radius = map.radius + 1;
            }
        }
    }

    staticStructures = {
        [STRUCTURE_STORAGE]: [{x: 0, y: -3}],
        [STRUCTURE_TERMINAL]: [{x: -2, y: -1}],
        [STRUCTURE_SPAWN]: [{x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: 3}],
        [STRUCTURE_NUKER]: [{x: 3, y: 0}],
        [STRUCTURE_POWER_SPAWN]: [{x: -3, y: 0}],
        [STRUCTURE_LAB]: [
            {x: 1, y: 0}, {x: 2, y: 1}, {x: 0, y: 1},
            {x: 1, y: 2}, {x: 2, y: 0}, {x: 0, y: 2},
            {x: 0, y: -1}, {x: -1, y: 0}, {x: 1, y: -1}, {x: -1, y: 1},],
    };
}