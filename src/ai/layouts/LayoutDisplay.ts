import {Layout, PositionMap} from "./Layout";
export class LayoutDisplay {

    public static colors = {
        [STRUCTURE_EXTENSION]: "yellow",
        [STRUCTURE_SPAWN]: "yellow",
        [STRUCTURE_STORAGE]: "yellow",
        [STRUCTURE_NUKER]: "yellow",
        [STRUCTURE_TOWER]: "blue",
        [STRUCTURE_LAB]: "aqua",
        [STRUCTURE_POWER_SPAWN]: "red",
        [STRUCTURE_OBSERVER]: "green",
        [STRUCTURE_ROAD]: "grey",
        [STRUCTURE_RAMPART]: "green",
        [STRUCTURE_WALL]: "black",
    };

    public static opacity = {
        [STRUCTURE_STORAGE]: .5,
        [STRUCTURE_NUKER]: .5,
        [STRUCTURE_SPAWN]: .5,
        [STRUCTURE_OBSERVER]: .5,
    };

    public static showLayout(layout: Layout, type = "all") {
        for (let structureType of Object.keys(CONSTRUCTION_COST)) {
            if (type !== "all" && type !== structureType ) { continue; }

            let positions = layout.map[structureType];
            for (let pos of positions) {
                this.showStructure(pos, structureType);
            }
        }
    }

    public static showMap(map: PositionMap) {
        for (let structureType in map) {
            let positions = map[structureType];
            if (!positions) { continue; }
            for (let position of positions) {
                this.showStructure(position, structureType);
            }
        }
    }

    public static showStructure(pos: RoomPosition, structureType: string) {
        let color = LayoutDisplay.colors[structureType] || "white";
        let opacity = LayoutDisplay.opacity[structureType] || .25;
        new RoomVisual(pos.roomName).rect(pos.x - .5, pos.y - .5, 1, 1, {fill: color, opacity: opacity});
    }
}
