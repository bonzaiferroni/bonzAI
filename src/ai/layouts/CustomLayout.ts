import {Layout, LAYOUT_SEGMENTID, PositionMap} from "./Layout";
import {BuildingPlannerData} from "../../interfaces";
import {empire} from "../Empire";
import {Archiver} from "../Archiver";

export class CustomLayout extends Layout {

    protected hasFlex: boolean = true;

    public upload(exclude: string[]) {
        if (!Memory.temp.customLayout) {
            return;
        }

        let data: BuildingPlannerData = JSON.parse(Memory.temp.customLayout);

        let count = 0;
        let flexMap: PositionMap = {};
        for (let structureType of this.findStructureTypes()) {
            if (_.includes(exclude, structureType)) { continue; }
            let structPositions = [];
            let map = data.buildings[structureType];
            if (!map) {
                continue;
            }

            for (let i = 0; i < map.pos.length; i ++) {
                let coord = map.pos[i];
                let position = new RoomPosition(coord.x, coord.y, this.roomName);
                structPositions.push(position);
                count++;
            }
            flexMap[structureType] = structPositions;
        }

        let serializedMap = Layout.serializePositionMap(flexMap);
        Archiver.setSegmentProperty(LAYOUT_SEGMENTID, this.roomName, serializedMap);
        Archiver.finalize();
        console.log(`LAYOUT: Saved ${count} structure positions in ${this.roomName}`);
    }

    public save(flagExclusion = true) {
        let room = Game.rooms[this.roomName];
        if (!room) { return; }

        let count = 0;
        let flagCount = 0;
        let flexMap: PositionMap = {};
        for (let structureType of this.findStructureTypes()) {
            let structures = room.findStructures<Structure>(structureType);
            let structPositions = [];
            for (let structure of structures) {
                let flag = structure.pos.lookFor(LOOK_FLAGS);
                if (flagExclusion && flag) {
                    flagCount++;
                    continue;
                }
                structPositions.push(structure.pos);
                count++;
            }
            flexMap[structureType] = structPositions;
        }

        let serializedMap = Layout.serializePositionMap(flexMap);
        Archiver.setSegmentProperty(LAYOUT_SEGMENTID, this.roomName, serializedMap);
        Archiver.finalize();
        console.log(`LAYOUT: Saved ${count} structure positions in ${this.roomName}, ${
            flagCount} were excluded due to a flag covering the position`);
    }
}
